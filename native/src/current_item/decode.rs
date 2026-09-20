//! Decode / Image semantics for the Current Item pipeline.
//!
//! Owns WIC decode, the decoded RGBA representation, dimensions,
//! allocation/dimension validation, source EXIF/orientation interpretation,
//! decode errors, and decode result types.
//!
//! Does NOT own Product publication policy or wgpu/PocketJS physical
//! residency. Ordinary decoded RGBA `Vec`s are moved into PocketJS owned
//! admission by `publication` / `CurrentItem::publish` — this module never
//! introduces an extra full-plane CPU copy on the ordinary path.

/// Decode allocation guard: a container may declare absurd frame dimensions
/// (up to 65535x65535 for JPEG) before any pixel is validated; allocating
/// w*h*4 for those would abort the process on OOM instead of failing bounded.
/// 80 megapixels comfortably covers real photographs and remains the bounded
/// CPU safety policy even when the GPU device can create larger textures.
/// Do not delete this merely because adapter/device dimensions rise.
pub(super) const MAX_DECODE_PIXELS: u64 = 80_000_000;
/// svc is a bounded-semantic channel; error strings are capped.
pub(super) const MAX_ERROR_CHARS: usize = 200;

/// Product admission policy: usable device image capability + bounded PicoView
/// safety. Built from PocketJS created-device truth
/// (`Ui::image_max_texture_dim` / `device.limits().max_texture_dimension_2d`),
/// never from adapter marketing limits and never from a second GPU query
/// inside Image/Product code.
///
/// Semantics:
/// - source axes ≤ `max_resource_dim` AND source pixels ≤ `max_resource_pixels`
///   → preserve source geometry exactly (full resolution);
/// - otherwise → bounded Proxy box-fit into `max_resource_dim`.
///
/// `fullResolution` remains derived: `resource == source`. Never a free
/// boolean that pretends full resolution.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImageAdmissionPolicy {
    /// Usable per-side resource dimension (created-device image capability
    /// after host export; portable default is PocketJS `NATIVE_TEX_MAX_DIM`).
    pub max_resource_dim: u32,
    /// Bounded product pixel safety budget for an admitted resource plane.
    pub max_resource_pixels: u64,
}

impl ImageAdmissionPolicy {
    /// Portable/default policy before any device capability is installed:
    /// PocketJS portable ceiling + existing CPU decode pixel guard.
    pub fn portable_default() -> Self {
        Self {
            max_resource_dim: pocketjs_core::NATIVE_TEX_MAX_DIM,
            max_resource_pixels: MAX_DECODE_PIXELS,
        }
    }

    /// Policy from usable created-device image capability. Keeps the existing
    /// product CPU pixel guard; only the dimension ceiling follows device truth.
    pub fn from_usable_image_capability(max_texture_dim: u32) -> Self {
        Self {
            max_resource_dim: max_texture_dim.max(1),
            max_resource_pixels: MAX_DECODE_PIXELS,
        }
    }

    /// True when the source can be admitted at exact source geometry.
    pub fn admits_exact(&self, width: u32, height: u32) -> bool {
        width >= 1
            && height >= 1
            && width <= self.max_resource_dim
            && height <= self.max_resource_dim
            && (width as u64 * height as u64) <= self.max_resource_pixels
    }
}

/// Integer proxy resource size under a policy. ALWAYS satisfies:
/// - `1 <= cw <= max_resource_dim`
/// - `1 <= ch <= max_resource_dim`
/// - `cw * ch <= max_resource_pixels`
///
/// Derivation is not independent-axis `round(scale)` without a post-check —
/// that can overshoot the pixel budget (counterexample 113×8858 @ 1,000,000
/// → 113×8854 = 1,000,502). Instead:
/// 1. ideal continuous scale = min(dim_ceiling, pixel_budget, never-upscale)
/// 2. integer target = round(source × scale), clamped to `max_resource_dim`
/// 3. hard shrink the longer axis until `cw*ch <= max_resource_pixels`
/// 4. optional growth back toward the **ideal integer target only** (never
///    free growth toward max_dim / remaining pixel budget)
pub(super) fn proxy_resource_size(
    src_w: u32,
    src_h: u32,
    max_resource_dim: u32,
    max_resource_pixels: u64,
) -> (u32, u32) {
    let max_dim = max_resource_dim.max(1) as u64;
    let max_pixels = max_resource_pixels.max(1);
    let sw = src_w.max(1) as u64;
    let sh = src_h.max(1) as u64;

    let dim_scale = {
        let by_w = max_dim as f64 / sw as f64;
        let by_h = max_dim as f64 / sh as f64;
        by_w.min(by_h).min(1.0)
    };
    let src_pixels = sw as f64 * sh as f64;
    let pixel_scale = if src_pixels <= 0.0 {
        1.0
    } else {
        ((max_pixels as f64) / src_pixels).sqrt().min(1.0)
    };
    let scale = dim_scale.min(pixel_scale);

    // Ideal integer target (old dimension-only box-fit uses round; keep that
    // when the combined policy still admits the rounded product).
    let target_cw = ((sw as f64 * scale).round() as u64).clamp(1, max_dim);
    let target_ch = ((sh as f64 * scale).round() as u64).clamp(1, max_dim);
    let mut cw = target_cw;
    let mut ch = target_ch;

    // Hard invariant: shrink longer axis until product fits the pixel budget.
    while cw * ch > max_pixels {
        if cw >= ch && cw > 1 {
            cw -= 1;
        } else if ch > 1 {
            ch -= 1;
        } else if cw > 1 {
            cw -= 1;
        } else {
            break;
        }
    }

    // Recover quality only up to the ideal integer target — never past it,
    // never past either ceiling.
    loop {
        if cw >= target_cw && ch >= target_ch {
            break;
        }
        if cw * ch >= max_pixels {
            break;
        }
        let grow_w = cw < target_cw && (cw + 1) * ch <= max_pixels && cw < max_dim;
        let grow_h = ch < target_ch && cw * (ch + 1) <= max_pixels && ch < max_dim;
        if grow_w && grow_h {
            // Prefer catching up the axis further below its target (aspect).
            let deficit_w = target_cw - cw;
            let deficit_h = target_ch - ch;
            if deficit_w >= deficit_h {
                cw += 1;
            } else {
                ch += 1;
            }
        } else if grow_w {
            cw += 1;
        } else if grow_h {
            ch += 1;
        } else {
            break;
        }
    }

    // Final clamps (defensive).
    cw = cw.clamp(1, max_dim).min(target_cw.max(1));
    ch = ch.clamp(1, max_dim).min(target_ch.max(1));
    while cw * ch > max_pixels {
        if cw >= ch && cw > 1 {
            cw -= 1;
        } else if ch > 1 {
            ch -= 1;
        } else if cw > 1 {
            cw -= 1;
        } else {
            break;
        }
    }
    if cw < 1 {
        cw = 1;
    }
    if ch < 1 {
        ch = 1;
    }
    (cw as u32, ch as u32)
}

/// Assert the policy output-size invariant (tests + debug oracle).
pub(super) fn proxy_size_holds_policy(
    cw: u32,
    ch: u32,
    max_resource_dim: u32,
    max_resource_pixels: u64,
) -> bool {
    cw >= 1
        && ch >= 1
        && cw <= max_resource_dim.max(1)
        && ch <= max_resource_dim.max(1)
        && (cw as u64 * ch as u64) <= max_resource_pixels.max(1)
}

/// Pure allocation guard for a decoded frame: the byte length a WIC RGBA
/// conversion needs, or a bounded decode error.
pub(super) fn decode_alloc_len(width: u32, height: u32) -> Result<usize, OpenError> {
    let pixels = width as u64 * height as u64;
    if pixels > MAX_DECODE_PIXELS {
        return Err(OpenError::Decode("image dimensions are too large".into()));
    }
    Ok(pixels as usize * 4)
}

/// Full-resolution WIC decode output, and the owned admission body: ordinary
/// decodes are published exactly as this struct — the `rgba` heap allocation
/// moves into PocketJS unchanged. Lifetime is fully native: it exists only
/// between decode and owned admission, inside `CurrentItem::open`.
pub struct DecodedImage {
    pub width: u32,
    pub height: u32,
    /// RGBA8888, row-major, `width * height * 4` bytes.
    pub rgba: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenError {
    MissingPath,
    NotAFile,
    Open(String),
    Decode(String),
    /// PocketJS resource admission rejected the decoded plane. Kept distinct
    /// from `Decode` so an admission failure is never reported to the user
    /// as a decode failure (ARCHITECTURE §16).
    Admission(String),
}

impl OpenError {
    /// Bounded, user-displayable message.
    pub fn message(&self) -> String {
        let raw = match self {
            OpenError::MissingPath => "image path does not exist".to_string(),
            OpenError::NotAFile => "image path is not a regular file".to_string(),
            OpenError::Open(m) => format!("could not read image: {m}"),
            OpenError::Decode(m) => format!("could not decode image: {m}"),
            OpenError::Admission(m) => format!("could not admit image resource: {m}"),
        };
        let mut out: String = raw.chars().take(MAX_ERROR_CHARS).collect();
        if raw.chars().count() > MAX_ERROR_CHARS {
            out.push('…');
        }
        out
    }
}

pub(super) fn open_decoded(path: &std::path::Path) -> Result<DecodedImage, OpenError> {
    let meta = std::fs::metadata(path).map_err(|_| OpenError::MissingPath)?;
    if !meta.is_file() {
        return Err(OpenError::NotAFile);
    }
    // The source file handle closes as soon as read() returns; decode runs on
    // our own in-memory copy so no exclusive handle is held afterwards.
    let bytes = std::fs::read(path).map_err(|e| OpenError::Open(e.to_string()))?;
    decode_wic(&bytes)
}

/// Prepare a decode for owned admission under an explicit policy. An image
/// that fits usable device capability + product safety returns unchanged —
/// the decoder's own RGBA plane is the admission body, verbatim at source
/// resolution, and no second plane is materialized (ADR-0002 §3 decision
/// order: directly consume the admitted representation). Otherwise the plane
/// is box-fitted into the policy ceiling (bounded Proxy degradation) and the
/// box-fit output stays in R,G,B,A byte order.
pub(super) fn prepare_for_admission(
    decoded: DecodedImage,
    policy: &ImageAdmissionPolicy,
) -> DecodedImage {
    if policy.admits_exact(decoded.width, decoded.height) {
        return decoded;
    }
    let max_dim = policy.max_resource_dim.max(1);
    let max_pixels = policy.max_resource_pixels.max(1);
    let (w, h) = (decoded.width.max(1), decoded.height.max(1));
    let src_bytes = w as usize * h as usize * 4;
    // Malformed/empty planes never index past the allocation. Production
    // WIC decodes always match this length; the guard keeps adversarial
    // inputs bounded instead of panicking.
    if decoded.rgba.len() < src_bytes {
        return DecodedImage {
            width: 0,
            height: 0,
            rgba: Vec::new(),
        };
    }
    let (cw, ch) = proxy_resource_size(w, h, max_dim, max_pixels);
    let mut pixels = vec![0u8; cw as usize * ch as usize * 4];
    let row = w as usize * 4;
    for cy in 0..ch {
        let sy0 = (cy as u64 * h as u64 / ch as u64) as usize;
        let sy1 = (((cy as u64 + 1) * h as u64 / ch as u64) as usize).clamp(sy0 + 1, h as usize);
        for cx in 0..cw {
            let sx0 = (cx as u64 * w as u64 / cw as u64) as usize;
            let sx1 =
                (((cx as u64 + 1) * w as u64 / cw as u64) as usize).clamp(sx0 + 1, w as usize);
            let (mut r, mut g, mut b, mut a) = (0u64, 0u64, 0u64, 0u64);
            let mut n = 0u64;
            for sy in sy0..sy1 {
                for sx in sx0..sx1 {
                    let at = sy * row + sx * 4;
                    r += decoded.rgba[at] as u64;
                    g += decoded.rgba[at + 1] as u64;
                    b += decoded.rgba[at + 2] as u64;
                    a += decoded.rgba[at + 3] as u64;
                    n += 1;
                }
            }
            let out = (cy * cw + cx) as usize * 4;
            pixels[out] = (r / n) as u8;
            pixels[out + 1] = (g / n) as u8;
            pixels[out + 2] = (b / n) as u8;
            pixels[out + 3] = (a / n) as u8;
        }
    }
    DecodedImage {
        width: cw,
        height: ch,
        rgba: pixels,
    }
}

pub(super) mod wic {
    use super::{DecodedImage, OpenError, bounded, decode_alloc_len};
    use windows::Win32::Graphics::Imaging::{
        CLSID_WICImagingFactory, GUID_WICPixelFormat32bppRGBA, IWICImagingFactory,
        WICBitmapDitherTypeNone, WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnDemand,
    };
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
    };

    /// Baseline image decode through Windows Imaging Component. The encoded
    /// bytes are already fully in memory; WIC never holds a source handle.
    /// Intrinsic EXIF orientation is materialized into the admitted plane so
    /// Product receives dimensions in oriented logical image space `O`.
    /// Named reason for the post-decode transform: WIC does not apply
    /// System.Photo.Orientation during a plain format conversion; without
    /// materializing O here, Product would conflate intrinsic orientation
    /// with user Rotate/Flip.
    pub fn decode_jpeg(bytes: &[u8]) -> Result<DecodedImage, OpenError> {
        unsafe {
            // OK / S_FALSE both mean a usable apartment on this thread.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED).ok();
            let factory: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)
                    .map_err(plain)?;
            let stream = factory.CreateStream().map_err(plain)?;
            stream.InitializeFromMemory(bytes).map_err(plain)?;
            let decoder = factory
                .CreateDecoderFromStream(&stream, std::ptr::null(), WICDecodeMetadataCacheOnDemand)
                .map_err(|_| {
                    OpenError::Decode("input is not a supported image container".into())
                })?;
            let frame = decoder.GetFrame(0).map_err(plain)?;
            let (mut width, mut height) = (0u32, 0u32);
            frame.GetSize(&mut width, &mut height).map_err(plain)?;
            if width == 0 || height == 0 {
                return Err(OpenError::Decode("image has an empty frame".into()));
            }
            let orientation = read_exif_orientation(bytes);
            let converter = factory.CreateFormatConverter().map_err(plain)?;
            converter
                .Initialize(
                    &frame,
                    &GUID_WICPixelFormat32bppRGBA,
                    WICBitmapDitherTypeNone,
                    None,
                    0.0,
                    WICBitmapPaletteTypeCustom,
                )
                .map_err(|_| {
                    OpenError::Decode("no 32-bit RGBA conversion for this image".into())
                })?;
            let mut rgba = vec![0u8; decode_alloc_len(width, height)?];
            let stride = width as usize * 4;
            converter
                .CopyPixels(std::ptr::null(), stride as u32, &mut rgba)
                .map_err(plain)?;
            if orientation <= 1 || orientation > 8 {
                return Ok(DecodedImage {
                    width,
                    height,
                    rgba,
                });
            }
            let (ow, oh, oriented) = apply_exif_orientation(width, height, &rgba, orientation);
            Ok(DecodedImage {
                width: ow,
                height: oh,
                rgba: oriented,
            })
        }
    }

    /// Read EXIF orientation (1..=8) from JPEG APP1 IFD tag 0x0112.
    /// Missing/unreadable metadata means 1 (normal).
    fn read_exif_orientation(bytes: &[u8]) -> u32 {
        // Minimal EXIF scanner: find APP1/Exif, parse IFD0 entry 0x0112.
        if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
            return 1;
        }
        let mut i = 2usize;
        while i + 4 <= bytes.len() {
            if bytes[i] != 0xFF {
                break;
            }
            let marker = bytes[i + 1];
            if marker == 0xD8 || marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
                i += 2;
                continue;
            }
            if marker == 0xDA || marker == 0xD9 {
                break;
            }
            if i + 4 > bytes.len() {
                break;
            }
            let seglen = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
            if seglen < 2 || i + 2 + seglen > bytes.len() {
                break;
            }
            let seg = &bytes[i + 4..i + 2 + seglen];
            if marker == 0xE1 && seg.len() > 6 && &seg[0..6] == b"Exif\0\0" {
                if let Some(o) = parse_exif_orientation(&seg[6..]) {
                    return o;
                }
            }
            i += 2 + seglen;
        }
        1
    }

    fn parse_exif_orientation(tiff: &[u8]) -> Option<u32> {
        if tiff.len() < 8 {
            return None;
        }
        let le = match &tiff[0..2] {
            b"II" => true,
            b"MM" => false,
            _ => return None,
        };
        let u16at = |off: usize| -> Option<u16> {
            if off + 2 > tiff.len() {
                return None;
            }
            let b = [tiff[off], tiff[off + 1]];
            Some(if le {
                u16::from_le_bytes(b)
            } else {
                u16::from_be_bytes(b)
            })
        };
        let u32at = |off: usize| -> Option<u32> {
            if off + 4 > tiff.len() {
                return None;
            }
            let b = [tiff[off], tiff[off + 1], tiff[off + 2], tiff[off + 3]];
            Some(if le {
                u32::from_le_bytes(b)
            } else {
                u32::from_be_bytes(b)
            })
        };
        let ifd0 = u32at(4)? as usize;
        let count = u16at(ifd0)? as usize;
        for e in 0..count {
            let base = ifd0 + 2 + e * 12;
            let tag = u16at(base)?;
            if tag == 0x0112 {
                let typ = u16at(base + 2)?;
                // SHORT or LONG
                let v = if typ == 3 {
                    u16at(base + 8)? as u32
                } else {
                    u32at(base + 8)?
                };
                if (1..=8).contains(&v) {
                    return Some(v);
                }
                return Some(1);
            }
        }
        None
    }

    /// Materialize EXIF orientation 2..=8 into an RGBA plane (O space).
    /// Image-layer semantic normalization — one transform at decode, never
    /// conflated with Product user Rotate/Flip.
    pub(crate) fn apply_exif_orientation(
        width: u32,
        height: u32,
        rgba: &[u8],
        orientation: u32,
    ) -> (u32, u32, Vec<u8>) {
        let (w, h) = (width as usize, height as usize);
        let mut out_w = width;
        let mut out_h = height;
        let swaps = matches!(orientation, 5..=8);
        if swaps {
            out_w = height;
            out_h = width;
        }
        let mut out = vec![0u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let si = (y * w + x) * 4;
                // Destination (dx, dy) per EXIF orientation (y-down).
                let (dx, dy) = match orientation {
                    2 => (w - 1 - x, y),         // mirror horizontal
                    3 => (w - 1 - x, h - 1 - y), // rotate 180
                    4 => (x, h - 1 - y),         // mirror vertical
                    5 => (y, x),                 // transpose
                    6 => (h - 1 - y, x),         // rotate 90 CW
                    7 => (h - 1 - y, w - 1 - x), // transverse
                    8 => (y, w - 1 - x),         // rotate 270 CW
                    _ => (x, y),
                };
                let di = (dy * out_w as usize + dx) * 4;
                out[di..di + 4].copy_from_slice(&rgba[si..si + 4]);
            }
        }
        (out_w, out_h, out)
    }

    fn plain(e: windows::core::Error) -> OpenError {
        OpenError::Decode(bounded(&e.to_string()))
    }
}

use wic::decode_jpeg as decode_wic;

/// Shared bounded-string helper used by decode error paths and publication
/// svc event constructors. Lives here because OpenError.message already owns
/// the same cap.
pub(super) fn bounded(s: &str) -> String {
    let mut out: String = s.chars().take(MAX_ERROR_CHARS).collect();
    if s.chars().count() > MAX_ERROR_CHARS {
        out.push('…');
    }
    out
}

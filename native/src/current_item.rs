//! Current Item authority (V1).
//!
//! Rust owns the truth: one explicit local path, decoded through Windows WIC,
//! published to the guest as a native texture handle plus bounded semantic
//! state over the svc channel. Image bytes never cross QuickJS — the only
//! guest-facing payloads here are small JSON objects of strings and integers.
//!
//! The full-resolution decode is published through the PocketJS native
//! large-image resource seam (`Ui::register_native_texture`), so ordinary
//! photographs keep their source resolution in the production resource: fit
//! to window is GPU minification of the real pixels, not a destructive
//! pre-shrink. The seam's admission rule (1..=NATIVE_TEX_MAX_DIM per axis)
//! is the only resize a normal image ever sees: none.

use pocketjs_core::spec::psm;
use anyhow::Result;
use pocket_ui_surface::UiSurface;
use serde_json::json;
use std::path::Path;

pub const SVC_TYPE: &str = "current-item";
/// Texture key the guest binds ready handles under (mirrored in
/// guest/app.octane.tsx; the handle travels via svc, the key stays literal).
#[allow(dead_code)]
const TEXTURE_KEY_HINT: &str = "picoview-current";
/// PocketJS native seam admission limit (spec::NATIVE_TEX_MAX_DIM). Images
/// above this on either axis are box-fitted down into it — a documented
/// bounded degradation for giant images only; normal photos pass through
/// byte-identical in geometry.
const MAX_RESOURCE_DIM: u32 = pocketjs_core::NATIVE_TEX_MAX_DIM;
/// svc is a bounded-semantic channel; error strings are capped.
const MAX_ERROR_CHARS: usize = 200;
/// Decode allocation guard: a container may declare absurd frame dimensions
/// (up to 65535x65535 for JPEG) before any pixel is validated; allocating
/// w*h*4 for those would abort the process on OOM instead of failing bounded.
/// 80 megapixels comfortably covers real photographs (the seam's 8192^2
/// admission ceiling is 67 MP, so this guard binds first).
const MAX_DECODE_PIXELS: u64 = 80_000_000;

/// Pure allocation guard for a decoded frame: the byte length a WIC RGBA
/// conversion needs, or a bounded decode error.
fn decode_alloc_len(width: u32, height: u32) -> Result<usize, OpenError> {
    let pixels = width as u64 * height as u64;
    if pixels > MAX_DECODE_PIXELS {
        return Err(OpenError::Decode("image dimensions are too large".into()));
    }
    Ok(pixels as usize * 4)
}

/// Full-resolution WIC decode output. Lifetime is fully native: it exists only
/// between decode and resource registration, inside `CurrentItem::open`.
pub struct DecodedImage {
    pub width: u32,
    pub height: u32,
    /// RGBA8888, row-major, `width * height * 4` bytes.
    pub rgba: Vec<u8>,
}

/// The native image resource body handed to `register_native_texture`.
/// For ordinary images (both axes <= MAX_RESOURCE_DIM) this is a pure
/// RGBA8888 → PSM_8888 word-order pass-through of the full decode: content
/// resolution is the source resolution, full stop. Only giant images above
/// the seam's admission ceiling are box-fitted down into it.
pub struct NativeResource {
    /// PSM_8888 (little-endian BGRA word order), `width * height * 4` bytes.
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenError {
    MissingPath,
    NotAFile,
    Open(String),
    Decode(String),
}

impl OpenError {
    /// Bounded, user-displayable message.
    pub fn message(&self) -> String {
        let raw = match self {
            OpenError::MissingPath => "image path does not exist".to_string(),
            OpenError::NotAFile => "image path is not a regular file".to_string(),
            OpenError::Open(m) => format!("could not read image: {m}"),
            OpenError::Decode(m) => format!("could not decode image: {m}"),
        };
        let mut out: String = raw.chars().take(MAX_ERROR_CHARS).collect();
        if raw.chars().count() > MAX_ERROR_CHARS {
            out.push('…');
        }
        out
    }
}

struct LiveResource {
    handle: i32,
    #[allow(dead_code)]
    width: u32,
    #[allow(dead_code)]
    height: u32,
}

/// Native-side Current Item truth. The guest observes it through svc events
/// only; it never owns decode, filesystem, or texture lifetime authority.
pub struct CurrentItem {
    next_generation: u64,
    live: Option<LiveResource>,
}

impl CurrentItem {
    pub fn new() -> Self {
        Self {
            next_generation: 1,
            live: None,
        }
    }

    pub fn generation(&self) -> u64 {
        self.next_generation.saturating_sub(1)
    }

    /// Texture handle of the live Current Item resource, if any.
    pub fn live_handle(&self) -> Option<i32> {
        self.live.as_ref().map(|l| l.handle)
    }

    /// Open an explicit local path: decode with WIC, retire any previous
    /// native resource, publish the new one, and push exactly one bounded
    /// terminal svc event (ready or error) for this generation.
    pub fn open(&mut self, surface: &UiSurface, path: &Path) {
        let generation = self.next_generation;
        self.next_generation += 1;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        self.push(surface, loading_event(generation, &name));
        match open_decoded(path).and_then(|decoded| native_resource(&decoded)) {
            Ok(resource) => self.publish(surface, generation, name, &resource),
            Err(error) => {
                self.retire(surface);
                self.push(surface, error_event(generation, &error));
            }
        }
    }

    /// Retire the previous resource, register the new one, and publish the
    /// ready event: handles are generation-tagged in the core, so a stale
    /// handle drawn by the guest in the interim renders nothing after free.
    fn publish(&mut self, surface: &UiSurface, generation: u64, name: String, res: &NativeResource) {
        self.retire(surface);
        // FLAG_LINEAR: bilinear sampling — the resource is frequently
        // displayed at non-integer scale (fit to window), and nearest
        // sampling turns that into visible blockiness.
        let handle = surface.with_ui(|ui| {
            ui.register_native_texture(&res.pixels, res.width, res.height, psm::PSM_8888, true)
        });
        if handle < 0 {
            self.push(
                surface,
                error_event(generation, &OpenError::Decode("resource registration rejected".into())),
            );
            return;
        }
        self.live = Some(LiveResource {
            handle,
            width: res.width,
            height: res.height,
        });
        self.push(
            surface,
            ready_event(generation, &name, handle, res.width, res.height),
        );
    }

    /// Free the live native resource. Never waits on QuickJS GC.
    pub fn retire(&mut self, surface: &UiSurface) {
        if let Some(live) = self.live.take() {
            surface.with_ui(|ui| ui.free_texture(live.handle));
        }
    }

    fn push(&self, surface: &UiSurface, event: serde_json::Value) {
        surface.svc_push(event.to_string());
    }
}

fn error_event(generation: u64, error: &OpenError) -> serde_json::Value {
    json!({"t": SVC_TYPE, "g": generation, "status": "error", "error": error.message()})
}

/// Pure svc event constructors. The guest-facing wire contract is exactly
/// these three shapes — bounded scalars only, never pixel bytes.
fn loading_event(generation: u64, name: &str) -> serde_json::Value {
    json!({"t": SVC_TYPE, "g": generation, "status": "loading", "name": name})
}

#[allow(clippy::too_many_arguments)]
fn ready_event(generation: u64, name: &str, handle: i32, width: u32, height: u32) -> serde_json::Value {
    json!({
        "t": SVC_TYPE,
        "g": generation,
        "status": "ready",
        "handle": handle,
        "width": width,
        "height": height,
        "name": name,
    })
}

fn open_decoded(path: &Path) -> Result<DecodedImage, OpenError> {
    let meta = std::fs::metadata(path).map_err(|_| OpenError::MissingPath)?;
    if !meta.is_file() {
        return Err(OpenError::NotAFile);
    }
    // The source file handle closes as soon as read() returns; decode runs on
    // our own in-memory copy so no exclusive handle is held afterwards.
    let bytes = std::fs::read(path).map_err(|e| OpenError::Open(e.to_string()))?;
    decode_wic(&bytes)
}

fn bounded(s: &str) -> String {
    let mut out: String = s.chars().take(MAX_ERROR_CHARS).collect();
    if s.chars().count() > MAX_ERROR_CHARS {
        out.push('…');
    }
    out
}

/// Convert the full decode into the native resource body: RGBA8888 →
/// PSM_8888 (little-endian BGRA words). Images at or below the seam's
/// admission ceiling pass through at full source resolution: the sample
/// window of every output pixel is exactly one input pixel, so pixel count
/// and every pixel value are preserved — a pure word-order conversion.
/// Only images above MAX_RESOURCE_DIM on either axis are box-fitted down
/// into the ceiling (documented bounded degradation for giant images;
/// viewport paging is a later-slice concern).
pub fn native_resource(src: &DecodedImage) -> Result<NativeResource, OpenError> {
    let (w, h) = (src.width.max(1), src.height.max(1));
    let scale = (MAX_RESOURCE_DIM as f64 / w as f64)
        .min(MAX_RESOURCE_DIM as f64 / h as f64)
        .min(1.0);
    let (cw, ch) = (
        ((w as f64 * scale).round() as u32).clamp(1, MAX_RESOURCE_DIM),
        ((h as f64 * scale).round() as u32).clamp(1, MAX_RESOURCE_DIM),
    );
    let mut pixels = vec![0u8; cw as usize * ch as usize * 4];
    let row = w as usize * 4;
    for cy in 0..ch {
        let sy0 = (cy as u64 * h as u64 / ch as u64) as usize;
        let sy1 = (((cy as u64 + 1) * h as u64 / ch as u64) as usize).clamp(sy0 + 1, h as usize);
        for cx in 0..cw {
            let sx0 = (cx as u64 * w as u64 / cw as u64) as usize;
            let sx1 = (((cx as u64 + 1) * w as u64 / cw as u64) as usize).clamp(sx0 + 1, w as usize);
            let (mut r, mut g, mut b, mut a) = (0u64, 0u64, 0u64, 0u64);
            let mut n = 0u64;
            for sy in sy0..sy1 {
                for sx in sx0..sx1 {
                    let at = sy * row + sx * 4;
                    r += src.rgba[at] as u64;
                    g += src.rgba[at + 1] as u64;
                    b += src.rgba[at + 2] as u64;
                    a += src.rgba[at + 3] as u64;
                    n += 1;
                }
            }
            let out = (cy * cw + cx) as usize * 4;
            pixels[out] = (b / n) as u8;
            pixels[out + 1] = (g / n) as u8;
            pixels[out + 2] = (r / n) as u8;
            pixels[out + 3] = (a / n) as u8;
        }
    }
    Ok(NativeResource {
        pixels,
        width: cw,
        height: ch,
    })
}

#[cfg(windows)]
mod wic {
    use super::{bounded, decode_alloc_len, DecodedImage, OpenError};
    use windows::Win32::Graphics::Imaging::{
        CLSID_WICImagingFactory, GUID_WICPixelFormat32bppRGBA, IWICImagingFactory,
        WICBitmapDitherTypeNone, WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnDemand,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };

    /// Baseline JPEG decode through Windows Imaging Component. The encoded
    /// bytes are already fully in memory; WIC never holds a source handle.
    pub fn decode_jpeg(bytes: &[u8]) -> Result<DecodedImage, OpenError> {
        unsafe {
            // OK / S_FALSE both mean a usable apartment on this thread.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED).ok();
            let factory: IWICImagingFactory = CoCreateInstance(
                &CLSID_WICImagingFactory,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(plain)?;
            let stream = factory.CreateStream().map_err(plain)?;
            stream.InitializeFromMemory(bytes).map_err(plain)?;
            let decoder = factory
                .CreateDecoderFromStream(&stream, std::ptr::null(), WICDecodeMetadataCacheOnDemand)
                .map_err(|_| OpenError::Decode("input is not a supported image container".into()))?;
            let frame = decoder.GetFrame(0).map_err(plain)?;
            let (mut width, mut height) = (0u32, 0u32);
            frame.GetSize(&mut width, &mut height).map_err(plain)?;
            if width == 0 || height == 0 {
                return Err(OpenError::Decode("image has an empty frame".into()));
            }
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
                .map_err(|_| OpenError::Decode("no 32-bit RGBA conversion for this image".into()))?;
            let mut rgba = vec![0u8; decode_alloc_len(width, height)?];
            let stride = width as usize * 4;
            converter
                .CopyPixels(std::ptr::null(), stride as u32, &mut rgba)
                .map_err(plain)?;
            Ok(DecodedImage {
                width,
                height,
                rgba,
            })
        }
    }

    fn plain(e: windows::core::Error) -> OpenError {
        OpenError::Decode(bounded(&e.to_string()))
    }
}

#[cfg(windows)]
use wic::decode_jpeg as decode_wic;

#[cfg(not(windows))]
fn decode_wic(_bytes: &[u8]) -> Result<DecodedImage, OpenError> {
    Err(OpenError::Decode(
        "WIC decode requires the Windows host".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn event_values(v: &Value) {
        // Bounded-semantic guard: svc events carry only small strings and
        // integers — never arrays, never bulk payloads.
        let text = v.to_string();
        assert!(text.len() <= 512, "svc event too large: {text}");
        let obj = v.as_object().unwrap();
        for (k, val) in obj {
            assert!(
                val.is_string() || val.is_i64() || val.is_u64(),
                "field {k} is not a bounded scalar"
            );
        }
    }

    #[test]
    fn svc_events_are_bounded_scalars() {
        event_values(&loading_event(1, "a.jpg"));
        event_values(&ready_event(2, "a.jpg", 3, 1920, 1080));
        event_values(&error_event(3, &OpenError::Decode("x".repeat(500).into())));
    }

    #[test]
    fn error_messages_are_capped() {
        let long = OpenError::Decode("x".repeat(500));
        let msg = long.message();
        assert!(msg.chars().count() <= MAX_ERROR_CHARS + 1);
    }

    #[test]
    fn native_resource_preserves_source_resolution_and_pixels() {
        // Resource dimension oracle: the exact image from the corrective
        // brief. The registered native resource must carry the FULL source
        // resolution — the old path box-shrank it into a 512x512 pow2
        // envelope (1153x1198 -> 493x512), destroying detail before display.
        let (w, h) = (1153u32, 1198u32);
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        for y in 0..h {
            for x in 0..w {
                let at = ((y * w + x) * 4) as usize;
                rgba[at] = (x % 256) as u8;
                rgba[at + 1] = (y % 256) as u8;
                rgba[at + 2] = ((x + y) % 256) as u8;
                rgba[at + 3] = 255;
            }
        }
        let res = native_resource(&DecodedImage {
            width: w,
            height: h,
            rgba: rgba.clone(),
        })
        .expect("ordinary image passes through");
        assert_eq!(res.width, w, "resource width must equal source width");
        assert_eq!(res.height, h, "resource height must equal source height");
        assert_eq!(res.pixels.len(), (w * h * 4) as usize);

        // Pixel oracle: RGBA8888 -> PSM_8888 is a pure word-order swap. Sample
        // corners and a striped interior where the pattern is exact.
        let sample = |x: u32, y: u32| {
            let src = ((y * w + x) * 4) as usize;
            let dst = ((y * w + x) * 4) as usize;
            (
                res.pixels[dst] == rgba[src + 2],
                res.pixels[dst + 1] == rgba[src + 1],
                res.pixels[dst + 2] == rgba[src],
                res.pixels[dst + 3] == rgba[src + 3],
            )
        };
        for (x, y) in [(0u32, 0u32), (w - 1, h - 1), (500, 501), (1152, 0)] {
            let (b, g, r, a) = sample(x, y);
            assert!(b && g && r && a, "pixel ({x},{y}) must survive word-order swap");
        }

        // High-frequency oracle: a 1px checkerboard at 1024x1024. The old
        // path averaged every 2x2 block into uniform mush on its way into the
        // 512 envelope; the new path must keep every alternating pixel exact.
        let (cw, chh) = (1024u32, 1024u32);
        let mut check = vec![0u8; (cw * chh * 4) as usize];
        for y in 0..chh {
            for x in 0..cw {
                let at = ((y * cw + x) * 4) as usize;
                let v = if (x + y) % 2 == 0 { 0u8 } else { 255u8 };
                check[at] = v;
                check[at + 1] = v;
                check[at + 2] = v;
                check[at + 3] = 255;
            }
        }
        let res2 = native_resource(&DecodedImage {
            width: cw,
            height: chh,
            rgba: check,
        })
        .expect("checkerboard passes through");
        assert_eq!(res2.width, cw);
        assert_eq!(res2.height, chh);
        for y in 0..chh {
            for x in 0..cw {
                let at = ((y * cw + x) * 4) as usize;
                let v = if (x + y) % 2 == 0 { 0u8 } else { 255u8 };
                assert_eq!(res2.pixels[at], v, "checkerboard must stay exact at ({x},{y})");
            }
        }
    }

    #[test]
    fn giant_images_are_admission_fitted_bounded() {
        // One axis above the seam's ceiling (8192): the resource is
        // box-fitted into the admission limit, bounded, never rejected, and
        // still large enough that fit-to-window display is GPU minification
        // of real pixels.
        let (w, h) = (20000u32, 100u32);
        let rgba = vec![90u8; (w * h * 4) as usize];
        let res = native_resource(&DecodedImage {
            width: w,
            height: h,
            rgba,
        })
        .expect("giant image is admission-fitted");
        assert_eq!(res.width, 8192);
        assert_eq!(res.height, (100 * 8192 + w / 2) / w);
        assert!(res.width <= pocketjs_core::NATIVE_TEX_MAX_DIM);
        assert_eq!(res.pixels.len(), (res.width * res.height * 4) as usize);
    }

    #[cfg(windows)]
    fn wic_encode_jpeg(width: u32, height: u32) -> Vec<u8> {
        use windows::Win32::Foundation::HGLOBAL;
        use windows::Win32::Graphics::Imaging::{
            CLSID_WICImagingFactory, GUID_ContainerFormatJpeg, GUID_WICPixelFormat32bppBGRA,
            IWICImagingFactory, WICBitmapEncoderNoCache,
        };
        use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
            STREAM_SEEK_SET,
        };

        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED).ok();
            let factory: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).unwrap();
            let stream = CreateStreamOnHGlobal(HGLOBAL::default(), true).unwrap();
            let encoder = factory
                .CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())
                .unwrap();
            encoder.Initialize(&stream, WICBitmapEncoderNoCache).unwrap();
            let mut frame_slot: Option<windows::Win32::Graphics::Imaging::IWICBitmapFrameEncode> =
                None;
            let mut props_slot: Option<windows::Win32::System::Com::StructuredStorage::IPropertyBag2> =
                None;
            encoder
                .CreateNewFrame(&mut frame_slot, &mut props_slot)
                .unwrap();
            let frame = frame_slot.unwrap();
            let props = props_slot.unwrap();
            frame.Initialize(&props).unwrap();
            frame.SetSize(width, height).unwrap();
            let mut format = GUID_WICPixelFormat32bppBGRA;
            frame.SetPixelFormat(&mut format).unwrap();
            let mut pixels = vec![0u8; width as usize * height as usize * 4];
            for y in 0..height {
                for x in 0..width {
                    let at = (y * width + x) as usize * 4;
                    pixels[at] = (x * 255 / width.max(1)) as u8;
                    pixels[at + 2] = (y * 255 / height.max(1)) as u8;
                    pixels[at + 3] = 255;
                }
            }
            frame
                .WritePixels(height, (width * 4) as u32, &pixels)
                .unwrap();
            frame.Commit().unwrap();
            encoder.Commit().unwrap();
            stream
                .Seek(0, STREAM_SEEK_SET, None)
                .ok()
                .expect("seek to start");
            let mut buf = vec![0u8; 1 << 20];
            let mut read = 0u32;
            stream
                .Read(buf.as_mut_ptr().cast(), buf.len() as u32, Some(&mut read))
                .ok()
                .expect("read encoded stream");
            buf.truncate(read as usize);
            buf
        }
    }

    #[cfg(windows)]
    #[test]
    fn wic_decodes_a_real_jpeg_roundtrip() {
        let bytes = wic_encode_jpeg(64, 48);
        let decoded = decode_wic(&bytes).expect("decode WIC-encoded JPEG");
        assert_eq!(decoded.width, 64);
        assert_eq!(decoded.height, 48);
        assert_eq!(decoded.rgba.len(), 64 * 48 * 4);
    }

    #[cfg(windows)]
    #[test]
    fn wic_rejects_garbage_and_missing_paths_stay_bounded() {
        let garbage = decode_wic(&[0x00, 0x01, 0x02, 0x03, 0xFF, 0xEE]);
        assert!(matches!(garbage, Err(OpenError::Decode(_))));
        let missing = open_decoded(Path::new("Z:/definitely/not/here.jpg"));
        assert!(matches!(missing, Err(OpenError::MissingPath)));
    }

    #[cfg(windows)]
    #[test]
    fn current_item_opens_replaces_and_retires_native_handles() {
        // Real PocketJS surface, CPU-side, driven through the real open path
        // (explicit file → WIC → native texture → svc events): proves the
        // ownership invariant without QuickJS GC or a GPU.
        let surface = UiSurface::new((96.0, 64.0));
        let jpg_a = std::env::temp_dir().join("picoview-current-item-a.jpg");
        let jpg_b = std::env::temp_dir().join("picoview-current-item-b.jpg");
        std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
        std::fs::write(&jpg_b, wic_encode_jpeg(64, 64)).unwrap();

        let mut item = CurrentItem::new();
        item.open(&surface, &jpg_a);
        let first = item.live_handle().expect("first open publishes a live texture");
        surface.with_ui(|ui| assert!(ui.texture(first).is_some()));

        item.open(&surface, &jpg_b);
        let second = item.live_handle().expect("second open publishes a live texture");
        assert_ne!(first, second);
        // The superseded resource retired without any GC involvement.
        surface.with_ui(|ui| assert!(ui.texture(first).is_none()));
        surface.with_ui(|ui| assert!(ui.texture(second).is_some()));

        // The event shapes are pure constructors carrying the generation
        // field; the actual svc_in queue is guest-drained only, so wire
        // behavior rests on the manual presentation evidence.
        for generation in [1u64, 2] {
            let ready = ready_event(generation, "x.jpg", 0, 1, 1);
            assert_eq!(ready["g"], generation);
        }

        // Error-after-success: the corrupt open must retire the previously
        // live texture itself, leaving no resource and nothing drawable.
        let jpg_bad = std::env::temp_dir().join("picoview-current-item-bad.jpg");
        std::fs::write(&jpg_bad, [0u8; 64]).unwrap();
        item.open(&surface, &jpg_bad);
        assert_eq!(item.live_handle(), None);
        surface.with_ui(|ui| assert!(ui.texture(second).is_none()));

        // A directory path fails as NotAFile, not MissingPath or a panic.
        let dir = std::env::temp_dir();
        item.open(&surface, &dir);
        assert_eq!(item.live_handle(), None);

        // Success after error, then the explicit retire path.
        item.open(&surface, &jpg_a);
        let third = item.live_handle().expect("open succeeds after a failed open");
        item.retire(&surface);
        assert_eq!(item.live_handle(), None);
        surface.with_ui(|ui| assert!(ui.texture(third).is_none()));

        let _ = std::fs::remove_file(&jpg_a);
        let _ = std::fs::remove_file(&jpg_b);
        let _ = std::fs::remove_file(&jpg_bad);
    }

    #[test]
    fn decode_dimensions_are_capped_before_allocation() {
        assert!(decode_alloc_len(65535, 65535).is_err());
        assert!(decode_alloc_len(1, 1).is_ok());
        // Just inside the cap is accepted (80 Mpx RGBA = 320 MB).
        assert_eq!(
            decode_alloc_len(10000, 8000).unwrap(),
            10000usize * 8000usize * 4
        );
    }

    #[test]
    fn guest_texture_key_matches_host_hint() {
        // The host hint and the guest's registerTexture key are one wire
        // contract kept as literals on both sides; this locks them together.
        let guest = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../guest/app.octane.tsx"
        ))
        .expect("guest source readable from the workspace");
        assert!(guest.contains(&format!("const TEXTURE_KEY = \"{TEXTURE_KEY_HINT}\";")));
    }
}

//! Current Item authority (V1).
//!
//! Rust owns the truth: one explicit local path, decoded through Windows WIC,
//! published to the guest as a native texture handle plus bounded semantic
//! state over the svc channel. Image bytes never cross QuickJS — the only
//! guest-facing payloads here are small JSON objects of strings and integers.
//!
//! Presentation textures honor the PocketJS core texture contract (pow2 dims
//! up to TEX_MAX_DIM), so the full decode is box-downsampled into a pow2
//! envelope. The texture's transparent padding is cropped guest-side by the
//! clip composition, keeping aspect ratio correct.

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
/// PocketJS core texture limit (spec::TEX_MAX_DIM).
const MAX_TEXTURE_DIM: u32 = pocketjs_core::spec::TEX_MAX_DIM;
/// svc is a bounded-semantic channel; error strings are capped.
const MAX_ERROR_CHARS: usize = 200;

/// Full-resolution WIC decode output. Lifetime is fully native: it exists only
/// between decode and texture upload, inside `CurrentItem::open`.
pub struct DecodedImage {
    pub width: u32,
    pub height: u32,
    /// RGBA8888, row-major, `width * height * 4` bytes.
    pub rgba: Vec<u8>,
}

pub struct PresentTexture {
    /// BGRA8888 (spec PSM_8888 little-endian word order), pow2 envelope.
    pub bgra: Vec<u8>,
    pub tex_width: u32,
    pub tex_height: u32,
    /// Content extent inside the envelope (top-left anchored).
    pub content_width: u32,
    pub content_height: u32,
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

struct LiveTexture {
    handle: i32,
    #[allow(dead_code)]
    tex_width: u32,
    #[allow(dead_code)]
    tex_height: u32,
}

/// Native-side Current Item truth. The guest observes it through svc events
/// only; it never owns decode, filesystem, or texture lifetime authority.
pub struct CurrentItem {
    next_generation: u64,
    live: Option<LiveTexture>,
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
    /// native texture, publish the new one, and push exactly one bounded
    /// terminal svc event (ready or error) for this generation.
    pub fn open(&mut self, surface: &UiSurface, path: &Path) {
        let generation = self.next_generation;
        self.next_generation += 1;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        self.push(surface, loading_event(generation, &name));
        match open_decoded(path) {
            Ok(decoded) => self.publish(
                surface,
                generation,
                name,
                &presentation_texture(&decoded),
            ),
            Err(error) => {
                self.retire(surface);
                self.push(surface, error_event(generation, &error));
            }
        }
    }
    /// Retire the previous resource, upload the new texture, and publish the
    /// ready event: handles are generation-tagged in the core, so a stale
    /// handle drawn by the guest in the interim renders nothing after free.
    fn publish(
        &mut self,
        surface: &UiSurface,
        generation: u64,
        name: String,
        tex: &PresentTexture,
    ) {
        self.retire(surface);
        // FLAG_LINEAR: bilinear sampling — the presentation envelope is
        // frequently displayed at non-integer scale, and nearest sampling
        // turns that into visible blockiness.
        let handle = surface.with_ui(|ui| {
            ui.upload_texture_flags(
                &tex.bgra,
                tex.tex_width,
                tex.tex_height,
                psm::PSM_8888,
                pocketjs_core::spec::img::FLAG_LINEAR,
            )
        });
        if handle < 0 {
            self.push(
                surface,
                error_event(generation, &OpenError::Decode("texture upload rejected".into())),
            );
            return;
        }
        self.live = Some(LiveTexture {
            handle,
            tex_width: tex.tex_width,
            tex_height: tex.tex_height,
        });
        self.push(
            surface,
            ready_event(generation, &name, handle, tex.content_width, tex.content_height, tex.tex_width, tex.tex_height),
        );
    }

    /// Free the live native texture. Never waits on QuickJS GC.
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
fn ready_event(
    generation: u64,
    name: &str,
    handle: i32,
    width: u32,
    height: u32,
    tex_width: u32,
    tex_height: u32,
) -> serde_json::Value {
    json!({
        "t": SVC_TYPE,
        "g": generation,
        "status": "ready",
        "handle": handle,
        "width": width,
        "height": height,
        "texWidth": tex_width,
        "texHeight": tex_height,
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

fn pow2_at_least(v: u32) -> u32 {
    debug_assert!(v >= 1 && v <= MAX_TEXTURE_DIM);
    let mut p = 1u32;
    while p < v {
        p <<= 1;
    }
    p.min(MAX_TEXTURE_DIM)
}

/// Box-downsample the full decode into a pow2 presentation envelope and
/// convert RGBA8888 → PSM_8888 (little-endian BGRA words). Content sits
/// top-left; the pow2 padding stays fully transparent (zeroed).
pub fn presentation_texture(src: &DecodedImage) -> PresentTexture {
    let (w, h) = (src.width.max(1), src.height.max(1));
    let scale = (MAX_TEXTURE_DIM as f64 / w as f64)
        .min(MAX_TEXTURE_DIM as f64 / h as f64)
        .min(1.0);
    let cw = ((w as f64 * scale).round() as u32).clamp(1, MAX_TEXTURE_DIM);
    let ch = ((h as f64 * scale).round() as u32).clamp(1, MAX_TEXTURE_DIM);
    let tw = pow2_at_least(cw);
    let th = pow2_at_least(ch);
    let mut out = vec![0u8; (tw as usize) * (th as usize) * 4];
    let row = src.width as usize * 4;
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
            let at = (cy * tw + cx) as usize * 4;
            out[at] = (b / n) as u8;
            out[at + 1] = (g / n) as u8;
            out[at + 2] = (r / n) as u8;
            out[at + 3] = (a / n) as u8;
        }
    }
    PresentTexture {
        bgra: out,
        tex_width: tw,
        tex_height: th,
        content_width: cw,
        content_height: ch,
    }
}

#[cfg(windows)]
mod wic {
    use super::{bounded, DecodedImage, OpenError};
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
            let mut rgba = vec![0u8; width as usize * height as usize * 4];
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
        event_values(&ready_event(2, "a.jpg", 3, 1920, 1080, 512, 512));
        event_values(&error_event(3, &OpenError::Decode("x".repeat(500).into())));
    }

    #[test]
    fn error_messages_are_capped() {
        let long = OpenError::Decode("x".repeat(500));
        let msg = long.message();
        assert!(msg.chars().count() <= MAX_ERROR_CHARS + 1);
    }

    #[test]
    fn presentation_texture_matches_core_contract() {
        // Realistic opaque JPEG decode: RGB gray, full alpha.
        let mut rgba = vec![128u8; 1920 * 1080 * 4];
        for at in (3..rgba.len()).step_by(4) {
            rgba[at] = 255;
        }
        let tex = presentation_texture(&DecodedImage {
            width: 1920,
            height: 1080,
            rgba,
        });
        // pow2 envelope within the core limit; 16:9 content keeps its aspect.
        assert_eq!(tex.tex_width, 512);
        assert_eq!(tex.tex_height, 512);
        assert_eq!(tex.content_width, 512);
        assert_eq!(tex.content_height, 288);
        assert_eq!(tex.bgra.len(), 512 * 512 * 4);
        // Uniform gray survives as BGRA gray inside the content area.
        let at = (10 * tex.tex_width + 10) as usize * 4;
        assert_eq!(tex.bgra[at], 128);
        assert_eq!(tex.bgra[at + 1], 128);
        assert_eq!(tex.bgra[at + 2], 128);
        assert_eq!(tex.bgra[at + 3], 255);
        // Padding outside the content extent is fully transparent.
        let pad = (500 * tex.tex_width + 500) as usize * 4;
        assert_eq!(tex.bgra[pad + 3], 0);
    }

    #[test]
    fn small_images_stay_untouched_envelope_only() {
        let mut rgba = vec![0u8; 8 * 2 * 4];
        for y in 0..2 {
            for x in 0..8 {
                let at = (y * 8 + x) * 4;
                rgba[at] = x as u8 * 30;
                rgba[at + 2] = 200;
                rgba[at + 3] = 255;
            }
        }
        let tex = presentation_texture(&DecodedImage {
            width: 8,
            height: 2,
            rgba,
        });
        assert_eq!(tex.content_width, 8);
        assert_eq!(tex.content_height, 2);
        assert_eq!(tex.tex_width, 8);
        assert_eq!(tex.tex_height, 2);
        // Pixel (7,0): RGBA red-dominant input arrives as BGRA.
        assert_eq!(tex.bgra[28], 200);
        assert_eq!(tex.bgra[30], 7 * 30);
        assert_eq!(tex.bgra[31], 255);
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

        // svc carried loading+ready per generation; events are pushed to the
        // guest queue (svc_in), never drained host-side.
        for generation in [1u64, 2] {
            let ready = ready_event(generation, "x.jpg", 0, 1, 1, 1, 1);
            assert_eq!(ready["g"], generation);
        }

        item.retire(&surface);
        assert_eq!(item.live_handle(), None);
        surface.with_ui(|ui| assert!(ui.texture(second).is_none()));

        // Error path: a corrupt file fails bounded, keeps the shell alive,
        // and leaves no live resource.
        let jpg_bad = std::env::temp_dir().join("picoview-current-item-bad.jpg");
        std::fs::write(&jpg_bad, [0u8; 64]).unwrap();
        item.open(&surface, &jpg_bad);
        assert_eq!(item.live_handle(), None);

        let _ = std::fs::remove_file(&jpg_a);
        let _ = std::fs::remove_file(&jpg_b);
        let _ = std::fs::remove_file(&jpg_bad);
    }
}

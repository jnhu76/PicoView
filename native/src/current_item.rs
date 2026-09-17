//! Current Item authority.
//!
//! Rust owns the truth: one explicit local path, decoded through Windows WIC,
//! published to the guest as a native texture handle plus bounded semantic
//! state over the svc channel. Image bytes never cross QuickJS — the only
//! guest-facing payloads here are small JSON objects of strings and integers.
//!
//! Publication is transactional per Product intent (PRD §2.10): a candidate
//! is admitted BEFORE the previous publication is released, and the
//! publication swap commits only on a successful admission. A Refresh
//! failure therefore leaves the last-good publication live and visible; a
//! NewItem failure deliberately replaces it with the error observation.
//!
//! Commit and release are separate transitions: a publication removal
//! (replacement commit or NewItem failure) only queues the superseded
//! handle. The physical release runs at the runtime's observation boundary —
//! after a guest frame has observed the replacing svc event and rebuilt the
//! draw list, before that tick's render. Every LEGAL Product transition
//! requires a `RequestPhase`, i.e. it commits before the tick's guest frame;
//! from there the superseded handle stays resolvable until the boundary of
//! the tick whose frame observed the replacing event. The guest holds the
//! other half of that contract: one guest turn renders only the FINAL
//! publication it observed, so the frame that presents the replacement
//! really has stopped resolving the superseded handle
//! (`guest/binding.ts`, `guest/turn.ts`).
//!
//! The full-resolution decode is published through PocketJS owned RGBA8
//! image admission (`Ui::upload_owned_rgba8`), so ordinary photographs keep
//! their source resolution in the production resource: fit to window is GPU
//! minification of the real pixels, not a destructive pre-shrink. The
//! decoder's own RGBA plane MOVES into the PocketJS logical texture record —
//! this side never materializes a second full plane, and admission costs no
//! CPU-to-CPU full-plane copy. The admission rule (1..=NATIVE_TEX_MAX_DIM
//! per axis) is the only resize a normal image ever sees: none.
//!
//! BrowseSession owns the directory listing and navigation state. Commands
//! from the guest (Previous/Next/Refresh) update the BrowseSession and
//! trigger item opens through the existing Publication path.

use anyhow::Result;
use pocket_ui_surface::UiSurface;
use serde_json::json;
use std::path::{Path, PathBuf};

pub use crate::browse_session::BrowseSession;

pub const SVC_TYPE: &str = "current-item";
/// Texture key prefix the guest binds ready handles under (mirrored in
/// guest/binding.ts; the handle travels via svc, the key stays literal).
#[allow(dead_code)]
const TEXTURE_KEY_HINT: &str = "picoview-current";
/// PocketJS owned-admission ceiling (`spec::NATIVE_TEX_MAX_DIM`, matched to
/// the wgpu default max texture dimension the Desktop backend requests).
/// Images above this on either axis are box-fitted down into it — a bounded
/// degradation for giant images only, compensating for the admission
/// dimension ceiling at the pinned PocketJS integration revision. It is not
/// product resize semantics, and it is not an image semantic limit; truthful
/// full-resolution capability is later product work (ARCHITECTURE §15).
/// Normal photos pass through with source geometry untouched.
const MAX_RESOURCE_DIM: u32 = pocketjs_core::NATIVE_TEX_MAX_DIM;
/// svc is a bounded-semantic channel; error strings are capped.
const MAX_ERROR_CHARS: usize = 200;
/// Decode allocation guard: a container may declare absurd frame dimensions
/// (up to 65535x65535 for JPEG) before any pixel is validated; allocating
/// w*h*4 for those would abort the process on OOM instead of failing bounded.
/// 80 megapixels comfortably covers real photographs (the seam's 8192^2
/// admission ceiling is 67 MP, so this guard binds first).
const MAX_DECODE_PIXELS: u64 = 80_000_000;

/// Product commands the guest can issue via svcSend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Previous,
    Next,
    Refresh,
    /// Open a specific path (for boot image or future direct-open).
    Open(PathBuf),
}

/// Pure allocation guard for a decoded frame: the byte length a WIC RGBA
/// conversion needs, or a bounded decode error.
fn decode_alloc_len(width: u32, height: u32) -> Result<usize, OpenError> {
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

/// Product intent of an open request (PRD §2.10). The two cases are
/// deliberately different Product operations:
///
/// - `Refresh` revalidates the currently published item; when the candidate
///   fails at decode or admission, the last-good publication stays published
///   and visible (SPEC §7).
/// - `NewItem` is the initial open or navigation to a different item; when
///   the candidate fails, the publication is deliberately replaced by the
///   error observation (a corrupt new item publishes an error item).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenIntent {
    NewItem,
    /// Constructed by the refresh/last-good tests and consumed by the guest
    /// wire contract; a product trigger arrives with the navigation slice.
    #[allow(dead_code)]
    Refresh,
}

impl OpenIntent {
    /// Bounded wire form carried by loading/error svc events; the guest
    /// observer needs it to choose preserve-vs-replace failure policy.
    pub fn as_str(self) -> &'static str {
        match self {
            OpenIntent::NewItem => "new-item",
            OpenIntent::Refresh => "refresh",
        }
    }
}

struct LiveResource {
    handle: i32,
    /// Source dimensions (before any resource-level downsampling).
    source_width: u32,
    source_height: u32,
}

/// Zero-sized proof token for the release boundary. It can only be
/// constructed at the one point PocketJS's own frame contract designates
/// ("after the guest turn, before rendering" — `UiSurface::tick` docs): the
/// guest has observed every svc event queued before the frame, the frame's
/// commits landed in that frame, and the draw list the renderer reads is
/// rebuilt. `release_superseded` refuses to run without one, so the safe
/// phase is part of the API, not a comment a future caller must remember.
///
/// The token witnesses the phase, not the handles: it says "a guest frame
/// has completed", and the deferred-release protocol (CORRECTIVE-1) plus the
/// guest's one-binding-per-turn commit (`guest/turn.ts`, CORRECTIVE-2) are
/// what make that frame the one that stopped resolving the superseded
/// publication.
pub struct ObservationBoundary(());

impl ObservationBoundary {
    /// Legal only after `Runtime::tick` has completed `guest.frame` and
    /// `surface.tick`, and strictly before that tick's render.
    pub(crate) fn after_guest_frame() -> Self {
        Self(())
    }
}

/// Zero-sized proof token for the request phase — the counterpart of
/// `ObservationBoundary`. Constructible only where Product open requests
/// are legal: process boot and the runtime input/request processing step,
/// both strictly before a tick's guest turn. Gating `open`/`retire` on it
/// turns the revoked hazard — a publication committing between
/// `guest.frame` and the same tick's release boundary, freed before any
/// frame observed its replacing event — into a deliberate, greppable
/// fabrication of a token whose name states the phase it grants, instead
/// of an invisible call-site convention. That fabrication is out of
/// contract: no comment, test, or claim in this crate treats an illegal
/// phase as supported.
pub struct RequestPhase(());

impl RequestPhase {
    /// Legal only at boot or in the input/request processing phase of the
    /// runtime loop (both BEFORE_GUEST_FRAME).
    pub(crate) fn before_guest_frame() -> Self {
        Self(())
    }
}

/// Native-side Current Item truth. The guest observes it through svc events
/// only; it never owns decode, filesystem, or texture lifetime authority.
///
/// Publication commit and superseded release are separate transitions
/// (PICOVIEW-LAST-GOOD-PUBLICATION-1-CORRECTIVE-1): `open`/`retire` commit
/// Product state and queue superseded handles, but NEVER free a texture.
/// Freeing lives solely in `release_superseded`, which requires an
/// `ObservationBoundary`. The safety statement is about LEGAL transitions:
/// every Product transition requires a `RequestPhase`, and every designed
/// call site constructs it before the tick's guest frame, so the replacing
/// event is always observed by a frame that completes before the boundary
/// that frees the superseded handle. `RequestPhase` is review friction —
/// a named, greppable phase witness — not a type-system proof of wall-clock
/// phase: a deliberately fabricated token inside the guest turn could still
/// commit after a frame, and neither this mechanism nor its tests claim
/// safety for such a call.
pub struct CurrentItem {
    next_generation: u64,
    live: Option<LiveResource>,
    /// Handles of superseded publications awaiting the next observation
    /// boundary. Bound: the number of publications committed between two
    /// boundaries. It cannot accumulate across ticks — the boundary drains
    /// it completely every runtime tick, and commits only happen on the
    /// runtime thread between boundaries (single-threaded). With the
    /// designed call sites (boot once; future input-phase triggers, at most
    /// one open per drained input) it is empty at rest and holds at most
    /// the opens coalesced into one input phase in the worst case.
    superseded: Vec<i32>,
    /// BrowseSession: directory enumeration and navigation. Present only
    /// when the viewer is in browse mode (an initial image was provided).
    browse: Option<BrowseSession>,
}

impl CurrentItem {
    pub fn new() -> Self {
        Self {
            next_generation: 1,
            live: None,
            superseded: Vec::new(),
            browse: None,
        }
    }

    /// Create a CurrentItem with a BrowseSession for the directory
    /// containing `path`. The initial item is `path`.
    pub fn with_browse(path: &Path) -> Self {
        let browse = BrowseSession::new(path);
        let mut item = Self {
            next_generation: 1,
            live: None,
            superseded: Vec::new(),
            browse: Some(browse),
        };
        // Emit the initial browse state.
        item
    }

    pub fn generation(&self) -> u64 {
        self.next_generation.saturating_sub(1)
    }

    /// Texture handle of the live Current Item resource, if any.
    pub fn live_handle(&self) -> Option<i32> {
        self.live.as_ref().map(|l| l.handle)
    }

    /// Source dimensions of the live resource, if any.
    pub fn live_source_dimensions(&self) -> Option<(u32, u32)> {
        self.live.as_ref().map(|l| (l.source_width, l.source_height))
    }

    /// Access the browse session.
    pub fn browse(&self) -> Option<&BrowseSession> {
        self.browse.as_ref()
    }

    /// Access the browse session mutably.
    pub fn browse_mut(&mut self) -> Option<&mut BrowseSession> {
        self.browse.as_mut()
    }

    /// Handle a product command from the guest. Must be called with a
    /// `RequestPhase` (before the tick's guest frame).
    ///
    /// Returns `true` if the command triggered a navigation/refresh.
    pub fn handle_command(
        &mut self,
        surface: &UiSurface,
        _phase: RequestPhase,
        command: Command,
    ) -> bool {
        match command {
            Command::Previous => {
                if let Some(browse) = &mut self.browse {
                    if browse.previous() {
                        if let Some(path) = browse.current_path().map(|p| p.to_path_buf()) {
                            self.open(surface, _phase, &path, OpenIntent::NewItem);
                            return true;
                        }
                    }
                }
                false
            }
            Command::Next => {
                if let Some(browse) = &mut self.browse {
                    if browse.next() {
                        if let Some(path) = browse.current_path().map(|p| p.to_path_buf()) {
                            self.open(surface, _phase, &path, OpenIntent::NewItem);
                            return true;
                        }
                    }
                }
                false
            }
            Command::Refresh => {
                if let Some(path) = self.current_path_for_refresh() {
                    self.open(surface, _phase, &path, OpenIntent::Refresh);
                    return true;
                }
                false
            }
            Command::Open(path) => {
                // If we have a browse session, try to locate the path within it.
                if let Some(browse) = &mut self.browse {
                    let path_clone = path.clone();
                    // Rebuild browse session from the parent directory.
                    *browse = BrowseSession::new(&path_clone);
                    self.open(surface, _phase, &path_clone, OpenIntent::NewItem);
                } else {
                    self.open(surface, _phase, &path, OpenIntent::NewItem);
                }
                true
            }
        }
    }

    fn current_path_for_refresh(&self) -> Option<PathBuf> {
        self.browse
            .as_ref()
            .and_then(|b| b.current_path().map(|p| p.to_path_buf()))
            .or_else(|| {
                self.live.as_ref().and_then(|_| None)
                // Without a browse session and without a stored path,
                // refresh is not possible. The initial open path is stored
                // only via the browse session.
            })
    }

    /// Open an explicit local path: decode with WIC, then publish per the
    /// Product intent, pushing exactly one bounded terminal svc event (ready
    /// or error) for this generation. A Refresh failure never touches the
    /// last-good publication; a NewItem failure deliberately replaces it.
    /// Gated on `RequestPhase`: a commit is legal only strictly before a
    /// tick's guest turn, so the replacing event is always observed by a
    /// frame that completes before the boundary that would free the
    /// superseded publication.
    pub fn open(
        &mut self,
        surface: &UiSurface,
        phase: RequestPhase,
        path: &Path,
        intent: OpenIntent,
    ) {
        let generation = self.next_generation;
        self.next_generation += 1;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let browse_snapshot = self.browse_snapshot();
        self.push(surface, loading_event(generation, intent, &name, &browse_snapshot));
        match open_decoded(path) {
            Ok(decoded) => {
                let source_w = decoded.width;
                let source_h = decoded.height;
                let image = prepare_for_admission(decoded);
                let resource_w = image.width;
                let resource_h = image.height;
                let full_resolution = source_w == resource_w && source_h == resource_h;
                self.publish(
                    surface,
                    phase,
                    generation,
                    intent,
                    name,
                    image,
                    source_w,
                    source_h,
                    full_resolution,
                    &browse_snapshot,
                );
            }
            Err(error) => {
                if intent == OpenIntent::NewItem {
                    self.retire(phase);
                }
                self.push(
                    surface,
                    error_event(generation, intent, &error, &browse_snapshot),
                );
            }
        }
    }

    /// Admit the candidate FIRST, commit the publication swap, notify the
    /// guest, and QUEUE the superseded resource for the next observation
    /// boundary (SPEC §7: never release last-good before replacement
    /// admission succeeds). The decoded plane MOVES into PocketJS at the
    /// admission call — this is the single ownership transfer on the
    /// ordinary path; a rejection (handle < 0) drops the plane, it never
    /// copies it.
    ///
    /// This function never frees a texture. The queued release runs only at
    /// the post-frame boundary: a guest frame that has not yet observed the
    /// ready event can still resolve the superseded handle, so freeing here
    /// would open a stale-handle hole whenever a publication commits after
    /// a guest frame but before that frame's render.
    #[allow(clippy::too_many_arguments)]
    fn publish(
        &mut self,
        surface: &UiSurface,
        phase: RequestPhase,
        generation: u64,
        intent: OpenIntent,
        name: String,
        image: DecodedImage,
        source_width: u32,
        source_height: u32,
        full_resolution: bool,
        browse_snapshot: &BrowseSnapshot,
    ) {
        let DecodedImage {
            width: resource_width,
            height: resource_height,
            rgba,
        } = image;
        // FLAG_LINEAR: bilinear sampling — the resource is frequently
        // displayed at non-integer scale (fit to window), and nearest
        // sampling turns that into visible blockiness.
        let handle = surface.with_ui(|ui| ui.upload_owned_rgba8(rgba, resource_width, resource_height, true));
        if handle < 0 {
            // The candidate was rejected; the API dropped its plane. A
            // Refresh keeps the last-good publication; a NewItem replaces it
            // with the error observation.
            if intent == OpenIntent::NewItem {
                self.retire(phase);
            }
            self.push(
                surface,
                error_event(
                    generation,
                    intent,
                    &OpenError::Admission("resource admission rejected".into()),
                    browse_snapshot,
                ),
            );
            return;
        }
        // Publication swap commit: the candidate is the Current Item from
        // here on; the old logical resource is superseded.
        let superseded = self.live.replace(LiveResource {
            handle,
            source_width,
            source_height,
        });
        self.push(
            surface,
            ready_event(
                generation,
                &name,
                handle,
                source_width,
                source_height,
                resource_width,
                resource_height,
                full_resolution,
                browse_snapshot,
            ),
        );
        if let Some(old) = superseded {
            self.superseded.push(old.handle);
        }
    }

    /// Remove the live publication (Product transition only — the NewItem
    /// failure paths). The physical release is deferred to the next
    /// observation boundary: the guest may still be rendering the removed
    /// publication until it observes the error event that replaces it.
    /// Gated on `RequestPhase` for the same reason as `open` — a removal is
    /// legal only strictly before a tick's guest turn. Never waits on
    /// QuickJS GC.
    pub fn retire(&mut self, RequestPhase(()) : RequestPhase) {
        if let Some(live) = self.live.take() {
            self.superseded.push(live.handle);
        }
    }

    /// Release every superseded publication. Callable only with an
    /// `ObservationBoundary`: at that point the guest turn is complete —
    /// svcPoll delivered every svc event queued before the frame
    /// (svcPoll drains the whole queue per call), the frame's commits
    /// landed in that frame (the octane sync boundary), and the draw list
    /// the renderer reads is rebuilt (`surface.tick`). Every queued handle
    /// was replaced by an event queued before that frame, so no renderable
    /// DrawList references it anymore; the render for this tick happens
    /// strictly after this call returns.
    pub fn release_superseded(&mut self, surface: &UiSurface, ObservationBoundary(()): ObservationBoundary) {
        for handle in self.superseded.drain(..) {
            surface.with_ui(|ui| ui.free_texture(handle));
        }
    }

    /// Superseded publications awaiting the observation boundary.
    #[cfg(test)]
    fn pending_releases(&self) -> usize {
        self.superseded.len()
    }

    /// Snapshot of browse state for svc events.
    fn browse_snapshot(&self) -> BrowseSnapshot {
        match &self.browse {
            Some(b) => BrowseSnapshot {
                index: b.current_index().map(|i| i as u32),
                count: b.count() as u32,
                can_previous: b.can_previous(),
                can_next: b.can_next(),
                current_name: b.current_name().map(|s| s.to_string()),
            },
            None => BrowseSnapshot::none(),
        }
    }

    fn push(&self, surface: &UiSurface, event: serde_json::Value) {
        surface.svc_push(event.to_string());
    }
}

/// Snapshot of browse state for svc events. Carries only bounded scalars.
#[derive(Debug, Clone)]
struct BrowseSnapshot {
    index: Option<u32>,
    count: u32,
    can_previous: bool,
    can_next: bool,
    current_name: Option<String>,
}

impl BrowseSnapshot {
    fn none() -> Self {
        Self {
            index: None,
            count: 0,
            can_previous: false,
            can_next: false,
            current_name: None,
        }
    }

    fn to_json(&self) -> serde_json::Value {
        json!({
            "browseIndex": self.index,
            "browseCount": self.count,
            "canPrevious": self.can_previous,
            "canNext": self.can_next,
        })
    }
}

fn error_event(generation: u64, intent: OpenIntent, error: &OpenError, browse: &BrowseSnapshot) -> serde_json::Value {
    let mut evt = json!({"t": SVC_TYPE, "g": generation, "status": "error", "intent": intent.as_str(), "error": error.message()});
    merge_browse(&mut evt, browse);
    evt
}

/// Pure svc event constructors. The guest-facing wire contract is exactly
/// these shapes — bounded scalars only, never pixel bytes — so the
/// constructors themselves enforce the channel's text cap. Loading and error
/// events carry the Product intent (the observer's preserve-vs-replace
/// policy input); a ready event needs no intent.
fn loading_event(generation: u64, intent: OpenIntent, name: &str, browse: &BrowseSnapshot) -> serde_json::Value {
    let mut evt = json!({"t": SVC_TYPE, "g": generation, "status": "loading", "intent": intent.as_str(), "name": bounded(name)});
    merge_browse(&mut evt, browse);
    evt
}

#[allow(clippy::too_many_arguments)]
fn ready_event(
    generation: u64,
    name: &str,
    handle: i32,
    source_width: u32,
    source_height: u32,
    resource_width: u32,
    resource_height: u32,
    full_resolution: bool,
    browse: &BrowseSnapshot,
) -> serde_json::Value {
    let mut evt = json!({
        "t": SVC_TYPE,
        "g": generation,
        "status": "ready",
        "handle": handle,
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "resourceWidth": resource_width,
        "resourceHeight": resource_height,
        "fullResolution": full_resolution,
        "name": bounded(name),
    });
    merge_browse(&mut evt, browse);
    evt
}

fn merge_browse(evt: &mut serde_json::Value, browse: &BrowseSnapshot) {
    if let (Some(obj), Some(browse_obj)) = (evt.as_object_mut(), browse.to_json().as_object()) {
        for (k, v) in browse_obj {
            obj.insert(k.clone(), v.clone());
        }
    }
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

/// Prepare a decode for owned admission. An ordinary image (both axes within
/// the admission ceiling) returns unchanged — the decoder's own RGBA plane is
/// the admission body, verbatim at source resolution, and no second plane is
/// materialized (ADR-0002 §3 decision order: directly consume the admitted
/// representation). Only a giant image above MAX_RESOURCE_DIM on either axis
/// is consumed and box-fitted down into the ceiling (bounded degradation for
/// giant images; viewport paging is a later-slice concern), and the box-fit
/// output stays in R,G,B,A byte order.
fn prepare_for_admission(decoded: DecodedImage) -> DecodedImage {
    if decoded.width <= MAX_RESOURCE_DIM && decoded.height <= MAX_RESOURCE_DIM {
        return decoded;
    }
    let (w, h) = (decoded.width.max(1), decoded.height.max(1));
    let scale = (MAX_RESOURCE_DIM as f64 / w as f64)
        .min(MAX_RESOURCE_DIM as f64 / h as f64);
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
        assert!(text.len() <= 1024, "svc event too large: {text}");
        let obj = v.as_object().unwrap();
        for (k, val) in obj {
            assert!(
                val.is_string() || val.is_i64() || val.is_u64() || val.is_boolean() || val.is_null(),
                "field {k} is not a bounded scalar"
            );
        }
    }

    #[test]
    fn svc_events_are_bounded_scalars() {
        let browse = BrowseSnapshot {
            index: Some(1),
            count: 5,
            can_previous: true,
            can_next: true,
            current_name: Some("test".into()),
        };
        event_values(&loading_event(1, OpenIntent::Refresh, "a.jpg", &browse));
        event_values(&ready_event(2, "a.jpg", 3, 1920, 1080, 1920, 1080, true, &browse));
        event_values(&error_event(3, OpenIntent::NewItem, &OpenError::Decode("x".repeat(500).into()), &browse));
        event_values(&error_event(4, OpenIntent::Refresh, &OpenError::Admission("y".repeat(500).into()), &browse));
        // File names cap on the same channel as error text.
        event_values(&loading_event(5, OpenIntent::NewItem, &"x".repeat(500), &browse));
        // The intent is the observer's preserve-vs-replace policy input and
        // must be on the wire exactly for the request-lifecycle events.
        assert_eq!(loading_event(6, OpenIntent::Refresh, "a", &browse)["intent"], "refresh");
        assert_eq!(
            error_event(7, OpenIntent::NewItem, &OpenError::MissingPath, &browse)["intent"],
            "new-item"
        );
        assert!(ready_event(8, "a", 1, 2, 3, 2, 3, true, &browse).get("intent").is_none());
    }

    #[test]
    fn error_messages_are_capped() {
        let long = OpenError::Decode("x".repeat(500));
        let msg = long.message();
        assert!(msg.chars().count() <= MAX_ERROR_CHARS + 1);
    }

    #[test]
    fn ordinary_decodes_prepare_as_the_decoder_plane_verbatim() {
        // The ordinary path must prepare the decoder's plane at full source
        // resolution — never a copy, never a resample, never a pow2 envelope
        // (the old path box-shrank 1153x1198 into a 512 envelope).
        for (w, h) in [(1153u32, 1198u32), (1024u32, 1024u32), (1u32, 1u32)] {
            let decode = DecodedImage {
                width: w,
                height: h,
                rgba: vec![17u8; (w * h * 4) as usize],
            };
            let source_ptr = decode.rgba.as_ptr();
            let prepared = prepare_for_admission(decode);
            assert_eq!(
                (prepared.width, prepared.height),
                (w, h),
                "{w}x{h} is ordinary and must keep source geometry"
            );
            // Preparation moves the decode; the heap plane publication will
            // move into PocketJS is still this one allocation.
            assert!(std::ptr::eq(prepared.rgba.as_ptr(), source_ptr));
        }
    }

    #[test]
    fn giant_decodes_prepare_as_fitted_planes() {
        // One axis above the admission ceiling (8192): the resource is
        // box-fitted into the admission limit, bounded, never rejected, and
        // still large enough that fit-to-window display is GPU minification
        // of real pixels. The fill is channel-asymmetric so the oracle also
        // pins the output byte order: every fitted pixel must come out
        // R,G,B,A — a B,G,R,A emission would read as swapped constants.
        let (w, h) = (20000u32, 100u32);
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        for px in rgba.chunks_exact_mut(4) {
            px.copy_from_slice(&[17, 34, 51, 255]);
        }
        let decode = DecodedImage {
            width: w,
            height: h,
            rgba,
        };
        let res = prepare_for_admission(decode);
        assert_eq!(res.width, 8192);
        assert_eq!(res.height, (100 * 8192 + w / 2) / w);
        assert!(res.width <= pocketjs_core::NATIVE_TEX_MAX_DIM);
        assert_eq!(res.rgba.len(), (res.width * res.height * 4) as usize);
        for px in res.rgba.chunks_exact(4) {
            assert_eq!(px, &[17, 34, 51, 255], "box-fit output must stay R,G,B,A");
        }
    }

    #[test]
    fn decoded_allocation_becomes_the_pocketjs_record_backing() {
        // Ownership oracle at the real publication seam: the Vec this side
        // holds before publish is the very allocation PocketJS stores after
        // it — upload_owned_rgba8 moves it, and the live record's pixels are
        // observable at the original pointer through Ui::texture. Equal
        // contents alone would not prove the move.
        let surface = UiSurface::new((96.0, 64.0));
        fn expected_byte(i: usize) -> u8 {
            (i % 251) as u8
        }
        let image = DecodedImage {
            width: 33,
            height: 17,
            rgba: (0..33 * 17 * 4).map(expected_byte).collect(),
        };
        let source_ptr = image.rgba.as_ptr();

        let mut item = CurrentItem::new();
        let browse = BrowseSnapshot::none();
        item.publish(&surface, request_phase(), 1, OpenIntent::NewItem, "oracle.png".to_string(), image, 33, 17, true, &browse);
        let handle = item
            .live_handle()
            .expect("admission accepts the moved plane");
        surface.with_ui(|ui| {
            let view = ui.texture(handle).expect("live PocketJS record");
            assert_eq!((view.w, view.h), (33, 17));
            assert!(view.linear, "publication admits bilinear sampling");
            // Allocation identity: the record's bytes ARE the decoded Vec's
            // heap allocation — moved, not copied.
            assert!(
                std::ptr::eq(view.pixels.as_ptr(), source_ptr),
                "PocketJS record must own the decoder's original allocation"
            );
            for (i, b) in view.pixels.iter().enumerate() {
                assert_eq!(*b, expected_byte(i), "byte {i} changed across the move");
            }
        });
        item.retire(request_phase());
        assert_eq!(item.live_handle(), None);
        // Removal is a Product transition only: the plane stays resolvable
        // until the observation boundary, then frees exactly there.
        assert_eq!(item.pending_releases(), 1);
        surface.with_ui(|ui| assert!(ui.texture(handle).is_some()));
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        assert_eq!(item.pending_releases(), 0);
        surface.with_ui(|ui| assert!(ui.texture(handle).is_none()));
    }

    fn plane(w: u32, h: u32) -> DecodedImage {
        DecodedImage {
            width: w,
            height: h,
            rgba: vec![7u8; (w * h * 4) as usize],
        }
    }

    /// Tests simulate the request phase (boot / input processing) — the
    /// only phase where `open`/`retire` are legal.
    fn request_phase() -> RequestPhase {
        RequestPhase::before_guest_frame()
    }

    #[test]
    fn superseded_publication_survives_until_the_observation_boundary() {
        // THE temporal contract (CORRECTIVE-1): after a successful refresh
        // commit the old publication must stay resolvable until a guest
        // observation boundary has installed the new binding. Committing
        // between guest.frame and render must never free a handle the
        // current DrawList can still resolve.
        let surface = UiSurface::new((96.0, 64.0));
        let mut item = CurrentItem::new();
        let browse = BrowseSnapshot::none();
        item.publish(&surface, request_phase(), 1, OpenIntent::NewItem, "a.png".into(), plane(4, 4), 4, 4, true, &browse);
        let a = item.live_handle().expect("first publication");
        item.publish(&surface, request_phase(), 2, OpenIntent::Refresh, "b.png".into(), plane(8, 8), 8, 8, true, &browse);
        let b = item.live_handle().expect("refresh commit");
        assert_ne!(a, b);
        // Before the boundary: the publication is already the candidate,
        // but the superseded handle is still resolvable in Core.
        assert_eq!(item.pending_releases(), 1);
        surface.with_ui(|ui| {
            assert!(
                ui.texture(a).is_some(),
                "old must stay resolvable before the observation boundary"
            );
            assert!(ui.texture(b).is_some());
        });
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        assert_eq!(item.pending_releases(), 0);
        surface.with_ui(|ui| {
            assert!(ui.texture(a).is_none(), "old freed exactly at the boundary");
            assert!(ui.texture(b).is_some(), "new publication stays live");
        });
    }

    #[test]
    fn new_item_failure_release_waits_for_the_observation_boundary() {
        // Real Product error path (missing file → NewItem failure → retire):
        // the replaced publication stays resolvable until the observation
        // boundary — the guest may still render it while the error event is
        // in flight, so the same deferred rule applies to error replacement,
        // not only to successful ready replacement.
        let surface = UiSurface::new((96.0, 64.0));
        let mut item = CurrentItem::new();
        let browse = BrowseSnapshot::none();
        item.publish(&surface, request_phase(), 1, OpenIntent::NewItem, "a.png".into(), plane(4, 4), 4, 4, true, &browse);
        let a = item.live_handle().expect("publication live");
        item.open(&surface, request_phase(), Path::new("Z:/definitely/not/here.jpg"), OpenIntent::NewItem);
        assert_eq!(item.live_handle(), None, "new-item failure replaces the publication");
        assert_eq!(item.pending_releases(), 1);
        surface.with_ui(|ui| {
            assert!(
                ui.texture(a).is_some(),
                "old stays resolvable until the guest observes the error"
            );
        });
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        assert_eq!(item.pending_releases(), 0);
        surface.with_ui(|ui| assert!(ui.texture(a).is_none()));
    }

    #[test]
    fn two_commits_before_one_boundary_release_every_superseded() {
        // Legal worst case: several publications commit inside one input
        // phase, before any guest frame observes any of them. Every
        // superseded handle must survive until the single next boundary and
        // release there — no leak, no slot growth across rounds.
        let surface = UiSurface::new((96.0, 64.0));
        let mut item = CurrentItem::new();
        let browse = BrowseSnapshot::none();
        item.publish(&surface, request_phase(), 1, OpenIntent::NewItem, "a.png".into(), plane(4, 4), 4, 4, true, &browse);
        let a = item.live_handle().expect("first publication");
        let mut steady_slots: Option<usize> = None;
        for round in 0..2u64 {
            item.publish(&surface, request_phase(), 10 + round, OpenIntent::Refresh, "b.png".into(), plane(8, 8), 8, 8, true, &browse);
            let b = item.live_handle().expect("round commit b");
            item.publish(&surface, request_phase(), 20 + round, OpenIntent::Refresh, "c.png".into(), plane(16, 16), 16, 16, true, &browse);
            let c = item.live_handle().expect("round commit c");
            assert_ne!(b, c, "round {round}");
            // a (from the warm-up) is superseded only in round 0; b and c
            // chain per round: two pending, all resolvable before the
            // boundary.
            assert_eq!(item.pending_releases(), 2, "round {round}");
            surface.with_ui(|ui| {
                if round == 0 {
                    assert!(ui.texture(a).is_some());
                }
                assert!(ui.texture(b).is_some());
                assert!(ui.texture(c).is_some());
            });
            item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
            assert_eq!(item.pending_releases(), 0, "round {round}");
            let slots = surface.with_ui(|ui| {
                assert!(ui.texture(b).is_none(), "round {round}: superseded freed");
                assert!(ui.texture(c).is_some(), "round {round}: publication live");
                ui.texture_slot_count()
            });
            // The native half of the guest binding oracle: after a coalesced
            // commit batch the LIVE handle is the batch's final candidate —
            // the publication a guest turn reconciles its binding to — and
            // every intermediate candidate is gone.
            assert_eq!(item.live_handle(), Some(c), "round {round}: final candidate is the publication");
            match steady_slots {
                Some(s) => assert_eq!(
                    s, slots,
                    "round {round}: slot count stable across commit/boundary rounds"
                ),
                None => steady_slots = Some(slots),
            }
        }
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
    fn initial_open_succeeds_and_publishes_at_source_resolution() {
        // Real PocketJS surface, CPU-side, driven through the real open path
        // (explicit file → WIC → native texture → svc events): proves the
        // ownership invariant without QuickJS GC or a GPU.
        let surface = UiSurface::new((96.0, 64.0));
        let jpg_a = std::env::temp_dir().join("picoview-lgp-initial.jpg");
        std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();

        let mut item = CurrentItem::new();
        item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
        let first = item.live_handle().expect("first open publishes a live texture");
        surface.with_ui(|ui| assert!(ui.texture(first).is_some()));

        // End-to-end oracle through the real open path: the core-stored
        // resource must equal the WIC decode byte for byte — full source
        // resolution, RGBA order intact, bilinear admission flag set. A
        // resample, envelope shrink, or channel swizzle anywhere on the
        // open path breaks this. (The internal representation tag behind
        // the record is PocketJS's own contract; PicoView asserts observable
        // behavior, not the tag.)
        let expected = open_decoded(&jpg_a).expect("oracle redecode");
        surface.with_ui(|ui| {
            let view = ui.texture(first).expect("live texture view");
            assert_eq!((view.w, view.h), (expected.width, expected.height));
            assert!(view.linear, "fit-to-window display needs bilinear admission");
            assert_eq!(&view.pixels[..expected.rgba.len()], &expected.rgba[..]);
        });

        // Source dimensions match resource for ordinary images.
        let (sw, sh) = item.live_source_dimensions().expect("source dims published");
        assert_eq!((sw, sh), (32, 16));

        // An initial failure leaves no publication: no live resource, and
        // the corrupt candidate's decode error is bounded.
        let bad = std::env::temp_dir().join("picoview-lgp-initial-bad.jpg");
        std::fs::write(&bad, [0u8; 64]).unwrap();
        let mut fresh = CurrentItem::new();
        fresh.open(&surface, request_phase(), &bad, OpenIntent::NewItem);
        assert_eq!(fresh.live_handle(), None);
        fresh.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
        assert!(fresh.live_handle().is_some(), "open succeeds after a failed open");

        let _ = std::fs::remove_file(&jpg_a);
        let _ = std::fs::remove_file(&bad);
    }

    #[cfg(windows)]
    #[test]
    fn replacement_success_admits_candidate_before_releasing_old() {
        let surface = UiSurface::new((96.0, 64.0));
        let jpg_a = std::env::temp_dir().join("picoview-lgp-repl-a.jpg");
        let jpg_b = std::env::temp_dir().join("picoview-lgp-repl-b.jpg");
        std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
        std::fs::write(&jpg_b, wic_encode_jpeg(64, 64)).unwrap();

        let mut item = CurrentItem::new();
        item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
        let first = item.live_handle().expect("first open publishes");
        item.open(&surface, request_phase(), &jpg_b, OpenIntent::NewItem);
        let second = item.live_handle().expect("second open publishes");
        assert_ne!(first, second);
        // The commit swapped the publication, but the superseded resource is
        // still resolvable: a guest frame that has not yet observed the new
        // ready event can still resolve the old handle.
        assert_eq!(item.pending_releases(), 1);
        surface.with_ui(|ui| {
            assert!(
                ui.texture(first).is_some(),
                "old stays resolvable until the observation boundary"
            );
            assert!(ui.texture(second).is_some(), "candidate is the publication");
        });
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        // Exactly one live publication after the boundary, no GC involvement.
        surface.with_ui(|ui| {
            assert!(ui.texture(first).is_none(), "old logical resource released");
            assert!(ui.texture(second).is_some(), "candidate is the publication");
        });

        let _ = std::fs::remove_file(&jpg_a);
        let _ = std::fs::remove_file(&jpg_b);
    }

    #[cfg(windows)]
    #[test]
    fn corrupt_new_item_failure_deliberately_replaces_the_publication() {
        // PRD §2.10: navigating to a corrupt NEW item may publish an error
        // item instead of preserving the previous image. This is the
        // deliberate counterpart of the refresh policy — not a regression.
        let surface = UiSurface::new((96.0, 64.0));
        let jpg = std::env::temp_dir().join("picoview-lgp-newitem.jpg");
        std::fs::write(&jpg, wic_encode_jpeg(32, 16)).unwrap();
        let bad = std::env::temp_dir().join("picoview-lgp-newitem-bad.jpg");
        std::fs::write(&bad, [0u8; 64]).unwrap();

        let mut item = CurrentItem::new();
        item.open(&surface, request_phase(), &jpg, OpenIntent::NewItem);
        let first = item.live_handle().expect("publication live");
        item.open(&surface, request_phase(), &bad, OpenIntent::NewItem);
        assert_eq!(item.live_handle(), None, "new-item failure replaces the publication");
        // The replaced publication stays resolvable until the observation
        // boundary — the guest may still render it while the error event is
        // in flight.
        assert_eq!(item.pending_releases(), 1);
        surface.with_ui(|ui| assert!(ui.texture(first).is_some()));
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        surface.with_ui(|ui| assert!(ui.texture(first).is_none()));

        // A directory path fails as NotAFile, not MissingPath or a panic.
        item.open(&surface, request_phase(), &jpg, OpenIntent::NewItem);
        assert!(item.live_handle().is_some());
        let dir = std::env::temp_dir();
        item.open(&surface, request_phase(), &dir, OpenIntent::NewItem);
        assert_eq!(item.live_handle(), None);
        assert_eq!(item.pending_releases(), 1);
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        assert_eq!(item.pending_releases(), 0);

        let _ = std::fs::remove_file(&jpg);
        let _ = std::fs::remove_file(&bad);
    }

    #[cfg(windows)]
    #[test]
    fn refresh_decode_failure_keeps_last_good_published() {
        // The core last-good property (PRD §2.10, SPEC §7): when the
        // refresh candidate fails to decode, the old publication stays
        // current and its logical resource stays live.
        let surface = UiSurface::new((96.0, 64.0));
        let jpg_a = std::env::temp_dir().join("picoview-lgp-refdec-a.jpg");
        let jpg_b = std::env::temp_dir().join("picoview-lgp-refdec-b.jpg");
        std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
        std::fs::write(&jpg_b, wic_encode_jpeg(48, 48)).unwrap();
        let bad = std::env::temp_dir().join("picoview-lgp-refdec-bad.jpg");
        std::fs::write(&bad, [0u8; 64]).unwrap();

        let mut item = CurrentItem::new();
        item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
        let first = item.live_handle().expect("publication live");

        item.open(&surface, request_phase(), &bad, OpenIntent::Refresh);
        assert_eq!(
            item.live_handle(),
            Some(first),
            "refresh decode failure must not touch the last-good resource"
        );
        assert_eq!(
            item.pending_releases(),
            0,
            "a refresh failure queues no pending retirement"
        );
        surface.with_ui(|ui| {
            let view = ui.texture(first).expect("last-good stays live");
            assert_eq!((view.w, view.h), (32, 16));
        });

        // A later successful refresh recovers normally: the candidate is the
        // publication, the old stays resolvable until the boundary.
        item.open(&surface, request_phase(), &jpg_b, OpenIntent::Refresh);
        let second = item.live_handle().expect("refresh success publishes");
        assert_ne!(first, second);
        assert_eq!(item.pending_releases(), 1);
        surface.with_ui(|ui| assert!(ui.texture(first).is_some()));
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        surface.with_ui(|ui| assert!(ui.texture(first).is_none()));

        let _ = std::fs::remove_file(&jpg_a);
        let _ = std::fs::remove_file(&jpg_b);
        let _ = std::fs::remove_file(&bad);
    }

    #[cfg(windows)]
    #[test]
    fn refresh_admission_failure_keeps_last_good_and_leaks_nothing() {
        // Smallest real mechanism, no dependency injection: publish a
        // crafted plane the real Core admission rejects (zero-width), once
        // as a Refresh and once as a NewItem. The refresh must preserve the
        // publication; the new-item failure deliberately replaces it.
        let surface = UiSurface::new((96.0, 64.0));
        let jpg = std::env::temp_dir().join("picoview-lgp-refadm.jpg");
        std::fs::write(&jpg, wic_encode_jpeg(32, 16)).unwrap();

        let mut item = CurrentItem::new();
        item.open(&surface, request_phase(), &jpg, OpenIntent::NewItem);
        let first = item.live_handle().expect("publication live");
        let slots_after_open = surface.with_ui(|ui| ui.texture_slot_count());

        let rejected = DecodedImage {
            width: 0,
            height: 0,
            rgba: Vec::new(),
        };
        let browse = BrowseSnapshot::none();
        item.publish(&surface, request_phase(), 99, OpenIntent::Refresh, "rejected.png".into(), rejected, 0, 0, false, &browse);
        assert_eq!(
            item.live_handle(),
            Some(first),
            "refresh admission failure must keep the last-good live"
        );
        assert_eq!(
            item.pending_releases(),
            0,
            "a refresh admission failure queues no pending retirement"
        );
        surface.with_ui(|ui| {
            assert!(ui.texture(first).is_some());
            assert_eq!(
                ui.texture_slot_count(),
                slots_after_open,
                "a rejected candidate allocates no resource"
            );
        });

        item.publish(
            &surface,
            request_phase(),
            100,
            OpenIntent::NewItem,
            "rejected.png".into(),
            DecodedImage {
                width: 0,
                height: 0,
                rgba: Vec::new(),
            },
            0,
            0,
            false,
            &browse,
        );
        assert_eq!(
            item.live_handle(),
            None,
            "new-item admission failure deliberately replaces the publication"
        );
        // Replacement removes the publication; the physical release waits
        // for the observation boundary.
        assert_eq!(item.pending_releases(), 1);
        surface.with_ui(|ui| assert!(ui.texture(first).is_some()));
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        surface.with_ui(|ui| assert!(ui.texture(first).is_none()));

        let _ = std::fs::remove_file(&jpg);
    }

    #[cfg(windows)]
    #[test]
    fn refresh_success_swaps_publication_and_releases_old() {
        let surface = UiSurface::new((96.0, 64.0));
        let jpg_a = std::env::temp_dir().join("picoview-lgp-refsuc-a.jpg");
        let jpg_b = std::env::temp_dir().join("picoview-lgp-refsuc-b.jpg");
        std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
        std::fs::write(&jpg_b, wic_encode_jpeg(64, 64)).unwrap();

        let mut item = CurrentItem::new();
        item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
        let first = item.live_handle().expect("publication live");

        // The candidate is admitted while the old resource is still live
        // (transient two-resource overlap), then the commit swaps and the
        // superseded old stays resolvable until the observation boundary.
        // Observable end state: exactly one publication, and it is the
        // candidate.
        item.open(&surface, request_phase(), &jpg_b, OpenIntent::Refresh);
        let second = item.live_handle().expect("refresh success publishes");
        assert_ne!(first, second);
        assert_eq!(item.pending_releases(), 1);
        surface.with_ui(|ui| {
            assert!(
                ui.texture(first).is_some(),
                "old resolvable until the boundary — no stale-handle hole window"
            );
            assert!(ui.texture(second).is_some(), "candidate is the publication");
            let view = ui.texture(second).unwrap();
            assert_eq!((view.w, view.h), (64, 64));
        });
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        surface.with_ui(|ui| {
            assert!(ui.texture(first).is_none(), "old released at the boundary");
            assert!(ui.texture(second).is_some());
        });

        let _ = std::fs::remove_file(&jpg_a);
        let _ = std::fs::remove_file(&jpg_b);
    }

    #[cfg(windows)]
    #[test]
    fn repeated_publication_cycles_stay_bounded() {
        // Mixed refresh/new-item success and failure cycles: every branch
        // must settle. The core slot count is the leak oracle — once warm,
        // free-list reuse keeps it flat; any abandoned handle would grow it.
        let surface = UiSurface::new((96.0, 64.0));
        let jpg_a = std::env::temp_dir().join("picoview-lgp-cyc-a.jpg");
        let jpg_b = std::env::temp_dir().join("picoview-lgp-cyc-b.jpg");
        std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
        std::fs::write(&jpg_b, wic_encode_jpeg(40, 40)).unwrap();
        let bad = std::env::temp_dir().join("picoview-lgp-cyc-bad.jpg");
        std::fs::write(&bad, [0u8; 64]).unwrap();

        let mut item = CurrentItem::new();
        item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
        // Warm the alloc/free cycle once (including one observation-boundary
        // release) so the slot count is at its steady value before the leak
        // oracle starts measuring.
        item.open(&surface, request_phase(), &jpg_b, OpenIntent::Refresh);
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        let steady_slots = surface.with_ui(|ui| ui.texture_slot_count());

        let rejected = || DecodedImage {
            width: 0,
            height: 0,
            rgba: Vec::new(),
        };
        let browse = BrowseSnapshot::none();
        for cycle in 0..6u64 {
            item.open(&surface, request_phase(), &jpg_b, OpenIntent::Refresh);
            let live = item.live_handle().expect("cycle leaves a publication");
            let pending_after_commit = item.pending_releases();
            item.open(&surface, request_phase(), &bad, OpenIntent::Refresh);
            assert_eq!(item.live_handle(), Some(live), "cycle {cycle}: refresh failure preserves");
            item.publish(&surface, request_phase(), 1000 + cycle, OpenIntent::Refresh, "r".into(), rejected(), 0, 0, false, &browse);
            assert_eq!(item.live_handle(), Some(live), "cycle {cycle}: admission failure preserves");
            assert_eq!(
                item.pending_releases(),
                pending_after_commit,
                "cycle {cycle}: refresh failures queue no pending retirement"
            );
            item.publish(&surface, request_phase(), 2000 + cycle, OpenIntent::NewItem, "r".into(), rejected(), 0, 0, false, &browse);
            assert_eq!(item.live_handle(), None, "cycle {cycle}: new-item failure replaces");
            // One guest observation boundary per commit batch (the runtime
            // runs it after every tick): the removed publication frees
            // exactly here, never earlier.
            item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
            assert_eq!(
                item.pending_releases(),
                0,
                "cycle {cycle}: the boundary drains the pending state fully"
            );
            item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
            let next = item.live_handle().expect("cycle {cycle}: recovery publishes");
            assert_ne!(next, live, "superseded handle must not be handed out again");
            item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
            surface.with_ui(|ui| {
                assert!(ui.texture(live).is_none());
                assert_eq!(ui.texture_slot_count(), steady_slots, "cycle {cycle}: no slot growth");
            });
        }

        let _ = std::fs::remove_file(&jpg_a);
        let _ = std::fs::remove_file(&jpg_b);
        let _ = std::fs::remove_file(&bad);
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
        // The guest OWNS the key derivation (guest/binding.ts) so exactly one
        // module can produce binding keys — app.octane.tsx must consume it
        // rather than hand-rolling a key string.
        let guest_binding = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../guest/binding.ts"
        ))
        .expect("guest binding module readable from the workspace");
        assert!(guest_binding.contains(&format!("const TEXTURE_KEY = \"{TEXTURE_KEY_HINT}\";")));
        let guest_app = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../guest/app.octane.tsx"
        ))
        .expect("guest source readable from the workspace");
        // The single Image render site must resolve the RECONCILED binding,
        // not a publication field or a hand-rolled key.
        assert!(guest_app.contains("src={textureKeyFor(bound.slot)}"));
    }
}

//! Current Item authority.
//!
//! Rust owns the truth: one explicit local path, decoded through Windows WIC,
//! published to the guest as a native texture handle plus bounded semantic
//! state over the svc channel. Image bytes never cross QuickJS — the only
//! guest-facing payloads here are small JSON objects of strings and integers.
//!
//! Module authority split:
//! - `mod.rs` — Product CurrentItem orchestration (what is the current image
//!   and what operation is being requested); BrowseSession relationship.
//! - `decode.rs` — decode/Image semantics (WIC, RGBA plane, EXIF O, errors).
//! - `publication.rs` — resource publication/lifetime protocol (tokens,
//!   OpenIntent, svc events, commit/release boundaries).
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

mod decode;
mod publication;
#[cfg(test)]
mod tests;

use pocket_ui_surface::UiSurface;
use std::path::{Path, PathBuf};

pub use crate::browse_session::BrowseSession;
pub use decode::{DecodedImage, ImageAdmissionPolicy, OpenError};
pub use publication::{ObservationBoundary, OpenIntent, RequestPhase};

use decode::{open_decoded, prepare_for_admission};
use publication::{BrowseSnapshot, LiveResource, error_event, loading_event, ready_event};

/// Build Product admission policy from created-device image capability.
/// Small host/runtime bridge: callers pass `device.limits().max_texture_dimension_2d`.
/// Image/Product code never queries wgpu.
pub fn decode_policy_for_device(device_max_texture_dim: u32) -> ImageAdmissionPolicy {
    ImageAdmissionPolicy::from_usable_image_capability(device_max_texture_dim)
}

pub const SVC_TYPE: &str = "current-item";
/// Texture key prefix the guest binds ready handles under (mirrored in
/// guest/binding.ts; the handle travels via svc, the key stays literal).
#[allow(dead_code)]
const TEXTURE_KEY_HINT: &str = "picoview-current";

/// Product commands the guest can issue via svcSend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Previous,
    Next,
    Refresh,
    /// Open a specific path (for boot image or future direct-open).
    Open(PathBuf),
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
    /// Product admission policy: usable device image capability + bounded
    /// CPU safety. Starts portable; the runtime installs created-device truth
    /// before the first Product open when a GPU path exists.
    admission: ImageAdmissionPolicy,
}

impl CurrentItem {
    pub fn new() -> Self {
        Self {
            next_generation: 1,
            live: None,
            superseded: Vec::new(),
            browse: None,
            admission: ImageAdmissionPolicy::portable_default(),
        }
    }

    /// Create a CurrentItem with a BrowseSession for the directory
    /// containing `path`. The initial item is `path`.
    pub fn with_browse(path: &Path) -> Self {
        let browse = BrowseSession::new(path);
        let item = Self {
            next_generation: 1,
            live: None,
            superseded: Vec::new(),
            browse: Some(browse),
            admission: ImageAdmissionPolicy::portable_default(),
        };
        // Emit the initial browse state.
        item
    }

    /// Install the usable image admission policy (device capability + product
    /// safety). Must be called before the first open when a created-device
    /// fact is known; does not re-prepare an already published resource.
    pub fn set_admission_policy(&mut self, policy: ImageAdmissionPolicy) {
        self.admission = policy;
    }

    /// Current admission policy (tests / diagnostics).
    pub fn admission_policy(&self) -> ImageAdmissionPolicy {
        self.admission
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
        self.live
            .as_ref()
            .map(|l| (l.source_width, l.source_height))
    }

    /// Access the browse session.
    pub fn browse(&self) -> Option<&BrowseSession> {
        self.browse.as_ref()
    }

    /// Access the browse session mutably.
    #[allow(dead_code)]
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
                // One Product open path for CLI, Open With, Open File…,
                // and navigation: always (re)anchor BrowseSession on the
                // opened file's directory so Previous/Next work even when
                // the process started with no image.
                self.browse = Some(BrowseSession::new(&path));
                self.open(surface, _phase, &path, OpenIntent::NewItem);
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
        self.push(
            surface,
            loading_event(generation, intent, &name, &browse_snapshot),
        );
        match open_decoded(path) {
            Ok(decoded) => {
                let source_w = decoded.width;
                let source_h = decoded.height;
                let image = prepare_for_admission(decoded, &self.admission);
                let resource_w = image.width;
                let resource_h = image.height;
                // fullResolution is derived from geometry truth, never a
                // capability pretence: resource must equal source exactly.
                let full_resolution = source_w == resource_w && source_h == resource_h;
                log::info!(
                    "current-item open: source={}x{} resource={}x{} fullResolution={} policy.max_dim={} policy.max_pixels={}",
                    source_w,
                    source_h,
                    resource_w,
                    resource_h,
                    full_resolution,
                    self.admission.max_resource_dim,
                    self.admission.max_resource_pixels
                );
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
        let handle = surface
            .with_ui(|ui| ui.upload_owned_rgba8(rgba, resource_width, resource_height, true));
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
    pub fn retire(&mut self, _phase: RequestPhase) {
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
    pub fn release_superseded(&mut self, surface: &UiSurface, _boundary: ObservationBoundary) {
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

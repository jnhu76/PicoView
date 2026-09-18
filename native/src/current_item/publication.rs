//! Resource publication / lifetime protocol for the Current Item pipeline.
//!
//! Owns admitted-handle state, request generation tokens (`RequestPhase`),
//! the observation/release boundary token (`ObservationBoundary`), superseded
//! resources, commit/release protocol tokens, and last-good replacement
//! Product intent (`OpenIntent`).
//!
//! Request generation, texture handle generation, PocketJS
//! `content_revision`, and device generation remain different identities.
//! Do not merge them.
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
//! draw list, before that tick's render.

use super::decode::{OpenError, bounded};
use serde_json::json;

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

/// Admitted live publication handle + source dimensions.
pub(super) struct LiveResource {
    pub handle: i32,
    /// Source dimensions (before any resource-level downsampling).
    pub source_width: u32,
    pub source_height: u32,
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

/// Snapshot of browse state for svc events. Carries only bounded scalars.
#[derive(Debug, Clone)]
pub(super) struct BrowseSnapshot {
    pub index: Option<u32>,
    pub count: u32,
    pub can_previous: bool,
    pub can_next: bool,
    pub current_name: Option<String>,
}

impl BrowseSnapshot {
    pub fn none() -> Self {
        Self {
            index: None,
            count: 0,
            can_previous: false,
            can_next: false,
            current_name: None,
        }
    }

    pub fn to_json(&self) -> serde_json::Value {
        json!({
            "browseIndex": self.index,
            "browseCount": self.count,
            "canPrevious": self.can_previous,
            "canNext": self.can_next,
        })
    }
}

/// Pure svc event constructors. The guest-facing wire contract is exactly
/// these shapes — bounded scalars only, never pixel bytes — so the
/// constructors themselves enforce the channel's text cap. Loading and error
/// events carry the Product intent (the observer's preserve-vs-replace
/// policy input); a ready event needs no intent.
pub(super) fn error_event(
    generation: u64,
    intent: OpenIntent,
    error: &OpenError,
    browse: &BrowseSnapshot,
) -> serde_json::Value {
    let mut evt = json!({"t": super::SVC_TYPE, "g": generation, "status": "error", "intent": intent.as_str(), "error": error.message()});
    merge_browse(&mut evt, browse);
    evt
}

pub(super) fn loading_event(
    generation: u64,
    intent: OpenIntent,
    name: &str,
    browse: &BrowseSnapshot,
) -> serde_json::Value {
    let mut evt = json!({"t": super::SVC_TYPE, "g": generation, "status": "loading", "intent": intent.as_str(), "name": bounded(name)});
    merge_browse(&mut evt, browse);
    evt
}

#[allow(clippy::too_many_arguments)]
pub(super) fn ready_event(
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
        "t": super::SVC_TYPE,
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

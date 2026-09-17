// View state management (PICOVIEW-REAL-VIEWER-TRAIN-1 closeout).
//
// ViewState is presentation state only. Changing it MUST NOT:
// - decode again
// - open the file again
// - admit a new logical image
// - upload the image again
// - change CurrentItem publication generation
// - change Core texture handle
//
// Fit/zoom/pan operate through the existing generic DrawList/render path —
// they change how the image is drawn, not what image is drawn.
//
// Coordinate spaces (ARCHITECTURE §5):
//   S → O (intrinsic) → U (user rotate/flip) → L (fit/zoom/pan) → P (DPI) → Display
// This module owns the U → L stage: user transform + fit/zoom/pan geometry.
//
// Capability truth on the CURRENT PocketJS pin (`24bab5e`):
//   - Fit / truthful 1:1 / deterministic Zoom +/- / Refresh / navigation are
//     shipped product operations.
//   - Rotate / Flip are PRECURSOR ONLY: PocketJS DrawList does not render
//     rotated Image quads (conservatively culled). Helpers remain as pure
//     ViewState math for a future framework integration; they are not wired
//     to product UI and must not emit CSS `transform: "rotate(...)"`.
//   - Pan helpers are presentation logic only:
//       PAN_STATE_READY
//       USER_GESTURE_PRECURSOR_REQUIRED
//     The current PocketJS input surface does not expose pointer-drag /
//     mouse-wheel paths to this viewer. No fake toolbar arrows.

/** View mode. */
export type ViewMode = "fit" | "manual";

/** Rotation in quarter-turns (0 = none, 1 = 90° CW, 2 = 180°, 3 = 270° CW).
 *  Precursor only — not a shipped product control on this PocketJS pin. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export interface ViewState {
  mode: ViewMode;
  /** Scale factor relative to the 100% definition.
   *  In "fit" mode this is a PLACEHOLDER (1.0); the displayed scale is
   *  `fitScale(...)`. Zoom materializes the effective fit scale first. */
  scale: number;
  /** Pan offset in logical units (centered = 0,0). */
  panX: number;
  panY: number;
  /** Quarter-turns applied by the user. Precursor only. */
  quarterTurns: QuarterTurns;
  /** Horizontal flip. Precursor only. */
  flipX: boolean;
  /** Vertical flip. Precursor only. */
  flipY: boolean;
}

/** Image + viewport geometry needed to materialize Fit. */
export interface ViewGeometry {
  imageW: number;
  imageH: number;
  viewportW: number;
  viewportH: number;
}

/** Publication identity used to decide whether navigation reset is needed. */
export interface PublicationViewKey {
  browseIndex: number | null;
  name: string | undefined;
  resourceWidth: number;
  resourceHeight: number;
  fullResolution: boolean;
}

/** Canonical zoom steps (common viewer progression). */
const ZOOM_STEPS: readonly number[] = [
  0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 0.75,
  1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 16.0,
];

const MIN_SCALE = 0.0625;
const MAX_SCALE = 16.0;

/** Create the initial view state (Fit, centered, no user transform). */
export function initialViewState(): ViewState {
  return {
    mode: "fit",
    scale: 1.0,
    panX: 0,
    panY: 0,
    quarterTurns: 0,
    flipX: false,
    flipY: false,
  };
}

/** Reset to Fit mode with centered pan. Preserves user rotate/flip so the
 *  Fit button on the same image does not discard a (precursor) transform. */
export function resetToFit(state: ViewState): ViewState {
  return {
    ...state,
    mode: "fit",
    scale: 1.0,
    panX: 0,
    panY: 0,
  };
}

/** Full reset used when the Product publication is a different item
 *  (Previous/Next / open). Starts in Fit with pan 0,0. */
export function resetForNewPublication(_state: ViewState): ViewState {
  return initialViewState();
}

/** Switch to 100% / Actual Size.
 *  Truthful 1:1 is: mode=manual, scale=1.0 exactly, pan=(0,0).
 *  Call sites must only enable this when `fullResolution === true`. */
export function set100Percent(state: ViewState): ViewState {
  return {
    ...state,
    mode: "manual",
    scale: 1.0,
    panX: 0,
    panY: 0,
  };
}

/** Compute the Fit scale factor for given image and viewport dimensions.
 *  Accounts for rotated orientation. Returns the scale that maps the
 *  post-rotation logical image to fit within the available viewport area,
 *  without upscaling (clamped to ≤ 1.0). */
export function fitScale(
  imageW: number,
  imageH: number,
  viewportW: number,
  viewportH: number,
  quarterTurns: QuarterTurns,
): number {
  // After rotation, logical dimensions may swap.
  const rotated = quarterTurns % 2 === 1;
  const iw = rotated ? imageH : imageW;
  const ih = rotated ? imageW : imageH;
  if (iw <= 0 || ih <= 0 || viewportW <= 0 || viewportH <= 0) return 1;
  // Leave small margin for toolbar/status.
  const availW = Math.max(32, viewportW - 16);
  const availH = Math.max(32, viewportH - 80);
  return Math.min(1.0, availW / iw, availH / ih);
}

/** The scale actually displayed for `state`.
 *  Fit materializes via `fitScale` when geometry is available; without
 *  geometry a Fit placeholder of 1.0 is reported (legacy). */
export function effectiveScale(state: ViewState, geo?: ViewGeometry): number {
  if (state.mode === "manual") return state.scale;
  if (!geo) return 1.0;
  return fitScale(
    geo.imageW,
    geo.imageH,
    geo.viewportW,
    geo.viewportH,
    state.quarterTurns,
  );
}

/** Materialize Fit into manual at the ACTUAL effective fit scale.
 *  Manual states pass through unchanged. */
export function materializeManual(
  state: ViewState,
  geo?: ViewGeometry,
): ViewState {
  if (state.mode === "manual") return state;
  return {
    ...state,
    mode: "manual",
    scale: effectiveScale(state, geo),
  };
}

/** Zoom in to the next deterministic step.
 *  From Fit, first materialize the effective fit scale, then step above it. */
export function zoomIn(state: ViewState, geo?: ViewGeometry): ViewState {
  const base = materializeManual(state, geo);
  const current = base.scale;
  for (const step of ZOOM_STEPS) {
    if (step > current + 0.001) {
      return { ...base, mode: "manual", scale: Math.min(MAX_SCALE, step) };
    }
  }
  return { ...base, mode: "manual", scale: MAX_SCALE };
}

/** Zoom out to the previous deterministic step.
 *  From Fit, first materialize the effective fit scale, then step below it. */
export function zoomOut(state: ViewState, geo?: ViewGeometry): ViewState {
  const base = materializeManual(state, geo);
  const current = base.scale;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current - 0.001) {
      return {
        ...base,
        mode: "manual",
        scale: Math.max(MIN_SCALE, ZOOM_STEPS[i]),
      };
    }
  }
  return { ...base, mode: "manual", scale: MIN_SCALE };
}

/** Zoom by a multiplicative factor anchored at a viewport point.
 *  `focusX`, `focusY` are viewport-local coordinates.
 *  Precursor for wheel/pinch — not wired (USER_GESTURE_PRECURSOR_REQUIRED). */
export function zoomAt(
  state: ViewState,
  factor: number,
  focusX: number,
  focusY: number,
  viewportW: number,
  viewportH: number,
  geo?: ViewGeometry,
): ViewState {
  const base = materializeManual(state, geo);
  const newScale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, base.scale * factor),
  );
  if (newScale === base.scale) return base;
  // Adjust pan so the focus point stays fixed.
  const ratio = newScale / base.scale;
  const newPanX = focusX - (focusX - base.panX) * ratio;
  const newPanY = focusY - (focusY - base.panY) * ratio;
  return {
    ...base,
    mode: "manual",
    scale: newScale,
    panX: newPanX,
    panY: newPanY,
  };
}

/** Apply a pan delta (from mouse drag).
 *  PAN_STATE_READY — pure presentation math only.
 *  USER_GESTURE_PRECURSOR_REQUIRED — no product wiring on this pin. */
export function panDelta(
  state: ViewState,
  dx: number,
  dy: number,
): ViewState {
  return {
    ...state,
    panX: state.panX + dx,
    panY: state.panY + dy,
  };
}

/** Clamp pan so the image cannot disappear permanently off-screen.
 *  Keeps at least a small visible margin.
 *  PAN_STATE_READY — pure presentation math only. */
export function clampPan(
  state: ViewState,
  imageW: number,
  imageH: number,
  viewportW: number,
  viewportH: number,
): ViewState {
  const rotated = state.quarterTurns % 2 === 1;
  const iw = (rotated ? imageH : imageW) * state.scale;
  const ih = (rotated ? imageW : imageH) * state.scale;
  // Max pan: image edge must stay at least 20px inside viewport.
  const margin = 20;
  const maxX = Math.max(0, iw / 2 - margin);
  const maxY = Math.max(0, ih / 2 - margin);
  // If image is smaller than viewport, center it.
  const panX = iw >= viewportW ? state.panX : 0;
  const panY = ih >= viewportH ? state.panY : 0;
  return {
    ...state,
    panX: Math.max(-maxX, Math.min(maxX, panX)),
    panY: Math.max(-maxY, Math.min(maxY, panY)),
  };
}

/** Rotate left (counter-clockwise 90°).
 *  PRECURSOR ONLY — not a shipped product control. */
export function rotateLeft(state: ViewState): ViewState {
  return {
    ...state,
    quarterTurns: ((state.quarterTurns + 3) % 4) as QuarterTurns,
    panX: 0,
    panY: 0,
  };
}

/** Rotate right (clockwise 90°).
 *  PRECURSOR ONLY — not a shipped product control. */
export function rotateRight(state: ViewState): ViewState {
  return {
    ...state,
    quarterTurns: ((state.quarterTurns + 1) % 4) as QuarterTurns,
    panX: 0,
    panY: 0,
  };
}

/** Flip horizontal. PRECURSOR ONLY — not a shipped product control. */
export function flipHorizontal(state: ViewState): ViewState {
  return { ...state, flipX: !state.flipX };
}

/** Flip vertical. PRECURSOR ONLY — not a shipped product control. */
export function flipVertical(state: ViewState): ViewState {
  return { ...state, flipY: !state.flipY };
}

/** Compute the display scale percentage string for the UI. */
export function displayScale(
  state: ViewState,
  geo?: ViewGeometry,
): string {
  if (state.mode === "fit") {
    // Avoid claiming a fit percentage when there is no usable image geometry.
    if (geo && geo.imageW > 0 && geo.imageH > 0) {
      const pct = Math.round(effectiveScale(state, geo) * 100);
      return `Fit (${pct}%)`;
    }
    return "Fit";
  }
  return `${Math.round(state.scale * 100)}%`;
}

/** Decide how view state reconciles when a Product publication is observed.
 *  Guest-side only; never touches PR #57 binding/lifetime. */
export type ViewReconcileAction = "reset" | "revalidate" | "preserve";

export function reconcileViewForPublication(
  prev: PublicationViewKey | null,
  next: PublicationViewKey | null,
): ViewReconcileAction {
  if (!next) return "preserve";
  if (!prev) return "reset";
  if (prev.browseIndex !== next.browseIndex) return "reset";
  if (prev.name !== next.name) return "reset";
  if (
    prev.resourceWidth !== next.resourceWidth ||
    prev.resourceHeight !== next.resourceHeight ||
    prev.fullResolution !== next.fullResolution
  ) {
    return "revalidate";
  }
  return "preserve";
}

export function publicationViewKeyFrom(input: {
  publication: {
    resourceWidth: number;
    resourceHeight: number;
    fullResolution: boolean;
    name?: string;
  } | null;
  browse: { index: number | null };
}): PublicationViewKey | null {
  const pub = input.publication;
  if (!pub) return null;
  return {
    browseIndex: input.browse.index,
    name: pub.name,
    resourceWidth: pub.resourceWidth,
    resourceHeight: pub.resourceHeight,
    fullResolution: pub.fullResolution,
  };
}

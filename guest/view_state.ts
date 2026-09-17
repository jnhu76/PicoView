// View state management (PICOVIEW-REAL-VIEWER-TRAIN-1).
//
// ViewState is presentation state only. Changing it MUST NOT:
// - decode again
// - open the file again
// - admit a new logical image
// - upload the image again
// - change CurrentItem publication generation
// - change Core texture handle
//
// Fit/zoom/pan/rotate/flip operate through the existing generic DrawList/
// render path — they change how the image is drawn, not what image is drawn.
//
// Coordinate spaces (ARCHITECTURE §5):
//   S → O (intrinsic) → U (user rotate/flip) → L (fit/zoom/pan) → P (DPI) → Display
// This module owns the U → L stage: user transform + fit/zoom/pan geometry.

/** View mode. */
export type ViewMode = "fit" | "manual";

/** Rotation in quarter-turns (0 = none, 1 = 90° CW, 2 = 180°, 3 = 270° CW). */
export type QuarterTurns = 0 | 1 | 2 | 3;

export interface ViewState {
  mode: ViewMode;
  /** Scale factor relative to the 100% definition. Only meaningful in "manual" mode. */
  scale: number;
  /** Pan offset in logical units (centered = 0,0). */
  panX: number;
  panY: number;
  /** Quarter-turns applied by the user. */
  quarterTurns: QuarterTurns;
  /** Horizontal flip. */
  flipX: boolean;
  /** Vertical flip. */
  flipY: boolean;
}

/** Canonical zoom steps (common viewer progression). */
const ZOOM_STEPS: readonly number[] = [
  0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 0.75,
  1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 16.0,
];

const MIN_SCALE = 0.0625;
const MAX_SCALE = 16.0;

/** Create the initial view state. */
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

/** Reset to Fit mode with centered pan. */
export function resetToFit(state: ViewState): ViewState {
  return {
    ...state,
    mode: "fit",
    scale: 1.0,
    panX: 0,
    panY: 0,
  };
}

/** Switch to 100% / Actual Size. */
export function set100Percent(state: ViewState): ViewState {
  return {
    ...state,
    mode: "manual",
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

/** Zoom in to the next deterministic step. */
export function zoomIn(state: ViewState): ViewState {
  const current = state.scale;
  for (const step of ZOOM_STEPS) {
    if (step > current + 0.001) {
      return { ...state, mode: "manual", scale: Math.min(MAX_SCALE, step) };
    }
  }
  return { ...state, mode: "manual", scale: MAX_SCALE };
}

/** Zoom out to the previous deterministic step. */
export function zoomOut(state: ViewState): ViewState {
  const current = state.scale;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current - 0.001) {
      return { ...state, mode: "manual", scale: Math.max(MIN_SCALE, ZOOM_STEPS[i]) };
    }
  }
  return { ...state, mode: "manual", scale: MIN_SCALE };
}

/** Zoom by a multiplicative factor anchored at a viewport point.
 *  `focusX`, `focusY` are viewport-local coordinates. */
export function zoomAt(
  state: ViewState,
  factor: number,
  focusX: number,
  focusY: number,
  viewportW: number,
  viewportH: number,
): ViewState {
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * factor));
  if (newScale === state.scale) return state;
  // Adjust pan so the focus point stays fixed.
  const ratio = newScale / state.scale;
  const newPanX = focusX - (focusX - state.panX) * ratio;
  const newPanY = focusY - (focusY - state.panY) * ratio;
  return {
    ...state,
    mode: "manual",
    scale: newScale,
    panX: newPanX,
    panY: newPanY,
  };
}

/** Apply a pan delta (from mouse drag). */
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
 *  Keeps at least a small visible margin. */
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
  const cx = viewportW / 2;
  const cy = viewportH / 2;
  // Max pan: image edge must stay at least 20px inside viewport.
  const margin = 20;
  const maxX = Math.max(0, (iw / 2) - margin);
  const maxY = Math.max(0, (ih / 2) - margin);
  // If image is smaller than viewport, center it.
  const panX = iw >= viewportW ? state.panX : 0;
  const panY = ih >= viewportH ? state.panY : 0;
  return {
    ...state,
    panX: Math.max(-maxX, Math.min(maxX, panX)),
    panY: Math.max(-maxY, Math.min(maxY, panY)),
  };
}

/** Rotate left (counter-clockwise 90°). */
export function rotateLeft(state: ViewState): ViewState {
  return {
    ...state,
    quarterTurns: ((state.quarterTurns + 3) % 4) as QuarterTurns,
    panX: 0,
    panY: 0,
  };
}

/** Rotate right (clockwise 90°). */
export function rotateRight(state: ViewState): ViewState {
  return {
    ...state,
    quarterTurns: ((state.quarterTurns + 1) % 4) as QuarterTurns,
    panX: 0,
    panY: 0,
  };
}

/** Flip horizontal. */
export function flipHorizontal(state: ViewState): ViewState {
  return { ...state, flipX: !state.flipX };
}

/** Flip vertical. */
export function flipVertical(state: ViewState): ViewState {
  return { ...state, flipY: !state.flipY };
}

/** Compute the display scale percentage string for the UI. */
export function displayScale(state: ViewState, imageW: number, imageH: number, viewportW: number, viewportH: number): string {
  if (state.mode === "fit") {
    return "Fit";
  }
  return `${Math.round(state.scale * 100)}%`;
}

/** Compute the CSS transform for the image element. */
export function imageTransform(state: ViewState): Record<string, number | string> {
  const parts: string[] = [];
  if (state.flipX) parts.push("scaleX(-1)");
  if (state.flipY) parts.push("scaleY(-1)");
  if (state.quarterTurns > 0) {
    parts.push(`rotate(${state.quarterTurns * 90}deg)`);
  }
  return { transform: parts.length > 0 ? parts.join(" ") : "none" };
}

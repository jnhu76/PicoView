// Canonical image-view transform (PICOVIEW-VIEW-GEOMETRY-CORRECTIVE-1).
//
// Pure module — no PocketJS imports. Testable in isolation.
//
// Coordinate spaces (ARCHITECTURE §5):
//   S --intrinsic--> O --user--> U --fit/zoom/pan--> L --dpi--> P
//
// This module owns U→L geometry and the Product zoom/DPI realization:
//
//   Product zoom `z` is a source-relative factor: 1.0 = Actual Size / 100%.
//   Realized logical sample scale = z / dpiScale
//     (logical UI units per oriented/user-transformed image sample).
//   At Actual Size (z=1): 1 image sample maps to 1 physical pixel, because
//   logical unit * dpiScale = physical pixel.
//
// panX/panY: offset of the image AABB center from the image-viewport center,
// in logical UI units. (0,0) = centered.
//
// User orientation is a discrete D4 element realized as PocketJS
// { rotate, scaleX, scaleY } about the node center (origin 0,0). Flip is
// defined in the CURRENT VISIBLE frame (viewer semantics), not raw source axes.
//
// Image node layout stays at O dimensions * realizedScale; the transform
// origin is the node center, so AABB center == node center for every D4
// element. Positioning therefore uses the node box, not a second AABB guess.

/** Canonical D4 user orientation as PocketJS paint facts.
 *
 *  PocketJS paints `translate(origin) * rotate * scale * translate(-origin)`
 *  (draw.rs), so the point map is Scale then Rot — matching the visible-frame
 *  flip composition below.
 *
 *  Representation note (Corrective-2 MAJOR-4): the raw triple has 16 field
 *  tuples but D4 has only 8 elements. The kernel is
 *  `Rot(θ)∘Scale(sx,sy) ≡ Rot(θ+180)∘Scale(-sx,-sy)` (because
 *  `Rot(180) ≡ Scale(-1,-1)`). `normalizeOrientation` maps every op result
 *  onto the 8 canonical tuples:
 *    rotations:  {0|90|180|270, 1, 1}
 *    reflections:{0|90|180|270, -1, 1}   // FH ∘ Rot(θ); FV is {180,-1,1}
 */
export interface UserOrientation {
  /** Degrees about the node center (0 | 90 | 180 | 270). */
  rotate: 0 | 90 | 180 | 270;
  /** Horizontal scale about the node center (±1). */
  scaleX: 1 | -1;
  /** Vertical scale about the node center (±1). */
  scaleY: 1 | -1;
}

export const IDENTITY_ORIENTATION: UserOrientation = {
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
};

/** Map onto the 8 canonical D4 field-tuples. */
export function normalizeOrientation(o: UserOrientation): UserOrientation {
  let rotate = o.rotate;
  let scaleX = o.scaleX;
  let scaleY = o.scaleY;
  // Fold Scale(-1,-1) into R180: never keep a double-negative scale.
  if (scaleX === -1 && scaleY === -1) {
    rotate = ((rotate + 180) % 360) as 0 | 90 | 180 | 270;
    scaleX = 1;
    scaleY = 1;
  }
  // Reflections are canonical as FH-flavored {θ, -1, 1}.
  // FV-flavored {θ, 1, -1} uses the same kernel as {θ+180, -1, 1}.
  if (scaleX === 1 && scaleY === -1) {
    rotate = ((rotate + 180) % 360) as 0 | 90 | 180 | 270;
    scaleX = -1;
    scaleY = 1;
  }
  return { rotate, scaleX, scaleY };
}

/** Authoritative image viewport in window-logical coordinates. */
export interface ImageViewport {
  /** Left edge of the canvas in window logical units. */
  x: number;
  /** Top edge of the canvas in window logical units. */
  y: number;
  width: number;
  height: number;
}

/** Product view state. Presentation only — never mutates image resources. */
export interface ViewTransform {
  orientation: UserOrientation;
  mode: "fit" | "manual";
  /** Source-relative product zoom. 1.0 = 100% / Actual Size. */
  productZoom: number;
  /** Image AABB center offset from viewport center (logical units). */
  panX: number;
  panY: number;
  /** Physical pixels per UI logical unit (output scale). */
  dpiScale: number;
}

/** Oriented (post-intrinsic) image sample dimensions. */
export interface OrientedImage {
  width: number;
  height: number;
}

export const MIN_PRODUCT_ZOOM = 0.0625;
export const MAX_PRODUCT_ZOOM = 16;

/** Canonical viewer zoom steps (product zoom factors). */
export const ZOOM_STEPS: readonly number[] = [
  0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 0.75, 1.0, 1.25,
  1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 16.0,
];

export function initialViewTransform(dpiScale = 1): ViewTransform {
  return {
    orientation: { ...IDENTITY_ORIENTATION },
    mode: "fit",
    productZoom: 1,
    panX: 0,
    panY: 0,
    dpiScale: dpiScale > 0 ? dpiScale : 1,
  };
}

export function setDpiScale(
  state: ViewTransform,
  dpiScale: number,
): ViewTransform {
  const d = dpiScale > 0 ? dpiScale : 1;
  if (d === state.dpiScale) return state;
  return { ...state, dpiScale: d };
}

/** Extent of O after the user D4 orientation (AABB in the visible frame). */
export function userExtent(
  img: OrientedImage,
  o: UserOrientation,
): { width: number; height: number } {
  const swapped = o.rotate === 90 || o.rotate === 270;
  return swapped
    ? { width: img.height, height: img.width }
    : { width: img.width, height: img.height };
}

/** Logical UI units per image sample at the current product zoom. */
export function realizedSampleScale(state: ViewTransform): number {
  const d = state.dpiScale > 0 ? state.dpiScale : 1;
  return state.productZoom / d;
}

/** Drawn AABB size in logical UI units of the user-transformed image. */
export function drawnExtent(
  img: OrientedImage,
  state: ViewTransform,
): { width: number; height: number } {
  const s = realizedSampleScale(state);
  const e = userExtent(img, state.orientation);
  return { width: e.width * s, height: e.height * s };
}

/** Fit product zoom: whole user-transformed image fits the viewport, no upscale. */
export function fitProductZoom(
  img: OrientedImage,
  viewport: ImageViewport,
  dpiScale: number,
  orientation: UserOrientation,
): number {
  const e = userExtent(img, orientation);
  if (e.width <= 0 || e.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return 1;
  }
  const d = dpiScale > 0 ? dpiScale : 1;
  // Fit in logical units, then convert to product zoom (z = realized * d).
  const realized = Math.min(
    viewport.width / e.width,
    viewport.height / e.height,
  );
  // No-upscale policy: Fit never exceeds Actual Size.
  const product = realized * d;
  return Math.min(1, Math.max(MIN_PRODUCT_ZOOM, product));
}

/** Materialize Fit: product zoom from Fit formula, pan centered. */
export function fitView(
  img: OrientedImage,
  viewport: ImageViewport,
  state: ViewTransform,
): ViewTransform {
  return {
    ...state,
    mode: "fit",
    productZoom: fitProductZoom(
      img,
      viewport,
      state.dpiScale,
      state.orientation,
    ),
    panX: 0,
    panY: 0,
  };
}

/** Actual Size / 100%: product zoom exactly 1.0, pan centered. */
export function actualSize(state: ViewTransform): ViewTransform {
  return {
    ...state,
    mode: "manual",
    productZoom: 1,
    panX: 0,
    panY: 0,
  };
}

export function zoomIn(
  img: OrientedImage,
  viewport: ImageViewport,
  state: ViewTransform,
): ViewTransform {
  const from = materializeZoom(img, viewport, state);
  const next = nextZoomStep(from.productZoom, +1);
  return { ...from, mode: "manual", productZoom: next };
}

export function zoomOut(
  img: OrientedImage,
  viewport: ImageViewport,
  state: ViewTransform,
): ViewTransform {
  const from = materializeZoom(img, viewport, state);
  const next = nextZoomStep(from.productZoom, -1);
  return { ...from, mode: "manual", productZoom: next };
}

/** From Fit, materialize the effective Fit product zoom into manual mode. */
export function materializeZoom(
  img: OrientedImage,
  viewport: ImageViewport,
  state: ViewTransform,
): ViewTransform {
  if (state.mode !== "fit") return state;
  return {
    ...state,
    mode: "manual",
    productZoom: fitProductZoom(
      img,
      viewport,
      state.dpiScale,
      state.orientation,
    ),
  };
}

function nextZoomStep(z: number, dir: 1 | -1): number {
  const eps = 1e-6;
  if (dir > 0) {
    for (const s of ZOOM_STEPS) {
      if (s > z + eps) return s;
    }
    return MAX_PRODUCT_ZOOM;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < z - eps) return ZOOM_STEPS[i];
  }
  return MIN_PRODUCT_ZOOM;
}

/**
 * Forward: oriented/user image sample (in O, unrotated layout space of the
 * node) → viewport logical point.
 *
 * For positioning we only need the AABB center; pixel mapping uses the same
 * center + drawn extent after D4 (AABB is axis-aligned).
 */
export function imageCenterToViewport(
  state: ViewTransform,
  viewport: ImageViewport,
): { x: number; y: number } {
  return {
    x: viewport.x + viewport.width / 2 + state.panX,
    y: viewport.y + viewport.height / 2 + state.panY,
  };
}

/**
 * Inverse of the axis-aligned drawn AABB mapping:
 * viewport point → user-frame image sample coordinates (origin at AABB
 * top-left of the user-transformed image).
 */
export function viewportToUserImage(
  state: ViewTransform,
  viewport: ImageViewport,
  img: OrientedImage,
  vx: number,
  vy: number,
): { x: number; y: number } {
  const draw = drawnExtent(img, state);
  const c = imageCenterToViewport(state, viewport);
  const left = c.x - draw.width / 2;
  const top = c.y - draw.height / 2;
  const s = realizedSampleScale(state);
  // User-frame sample coords (0..ew, 0..eh).
  return {
    x: (vx - left) / s,
    y: (vy - top) / s,
  };
}

/** Forward: user-frame image sample → viewport logical point. */
export function userImageToViewport(
  state: ViewTransform,
  viewport: ImageViewport,
  img: OrientedImage,
  ix: number,
  iy: number,
): { x: number; y: number } {
  const draw = drawnExtent(img, state);
  const c = imageCenterToViewport(state, viewport);
  const left = c.x - draw.width / 2;
  const top = c.y - draw.height / 2;
  const s = realizedSampleScale(state);
  return { x: left + ix * s, y: top + iy * s };
}

/**
 * Zoom so the user-frame image sample under `focus` stays under `focus`.
 * Invariant: userImageToViewport(new, inverse_point) == focus.
 */
export function zoomAt(
  img: OrientedImage,
  viewport: ImageViewport,
  state: ViewTransform,
  focusX: number,
  focusY: number,
  productZoom: number,
): ViewTransform {
  const z = Math.min(MAX_PRODUCT_ZOOM, Math.max(MIN_PRODUCT_ZOOM, productZoom));
  const anchor = viewportToUserImage(state, viewport, img, focusX, focusY);
  const next: ViewTransform = {
    ...state,
    mode: "manual",
    productZoom: z,
    // pan solved below
    panX: 0,
    panY: 0,
  };
  const draw = drawnExtent(img, next);
  // We want: left + anchor.x * s = focusX, same for y.
  // left = cx - draw.w/2, cx = vp.cx + panX
  // vp.cx + panX - draw.w/2 + anchor.x * s = focusX
  const s = realizedSampleScale(next);
  const vpcx = viewport.x + viewport.width / 2;
  const vpcy = viewport.y + viewport.height / 2;
  next.panX = focusX - vpcx + draw.width / 2 - anchor.x * s;
  next.panY = focusY - vpcy + draw.height / 2 - anchor.y * s;
  return clampPan(img, viewport, next);
}

/** Pan by a viewport-logical delta. */
export function panBy(
  img: OrientedImage,
  viewport: ImageViewport,
  state: ViewTransform,
  dx: number,
  dy: number,
): ViewTransform {
  const next = { ...state, panX: state.panX + dx, panY: state.panY + dy };
  // Dragging in manual mode should not silently re-Fit.
  return clampPan(img, viewport, { ...next, mode: state.mode === "fit" ? "manual" : state.mode });
}

/**
 * Pan clamp policy A: if the drawn image is smaller than the viewport on an
 * axis, center it (pan=0 on that axis). If larger, keep the image covering
 * the viewport — no blank canvas beyond either edge (edge of image can reach
 * edge of viewport, but not past).
 */
export function clampPan(
  img: OrientedImage,
  viewport: ImageViewport,
  state: ViewTransform,
): ViewTransform {
  const draw = drawnExtent(img, state);
  const maxX = Math.max(0, (draw.width - viewport.width) / 2);
  const maxY = Math.max(0, (draw.height - viewport.height) / 2);
  return {
    ...state,
    panX: maxX <= 0 ? 0 : Math.min(maxX, Math.max(-maxX, state.panX)),
    panY: maxY <= 0 ? 0 : Math.min(maxY, Math.max(-maxY, state.panY)),
  };
}

// --- D4 user orientation ops (visible-frame semantics) -----------------------

export function rotateRight(o: UserOrientation): UserOrientation {
  return normalizeOrientation({
    ...o,
    rotate: (((o.rotate + 90) % 360) as 0 | 90 | 180 | 270),
  });
}

export function rotateLeft(o: UserOrientation): UserOrientation {
  return normalizeOrientation({
    ...o,
    rotate: (((o.rotate + 270) % 360) as 0 | 90 | 180 | 270),
  });
}

/** Flip horizontal in the current visible frame. */
export function flipHorizontal(o: UserOrientation): UserOrientation {
  // FlipH_screen ∘ Rot(θ) ∘ Scale(sx,sy) = Rot(-θ) ∘ Scale(-sx, sy)
  const rotate = ((360 - o.rotate) % 360) as 0 | 90 | 180 | 270;
  return normalizeOrientation({
    rotate,
    scaleX: (o.scaleX * -1) as 1 | -1,
    scaleY: o.scaleY,
  });
}

/** Flip vertical in the current visible frame. */
export function flipVertical(o: UserOrientation): UserOrientation {
  const rotate = ((360 - o.rotate) % 360) as 0 | 90 | 180 | 270;
  return normalizeOrientation({
    rotate,
    scaleX: o.scaleX,
    scaleY: (o.scaleY * -1) as 1 | -1,
  });
}

export function orientationsEqual(
  a: UserOrientation,
  b: UserOrientation,
): boolean {
  return (
    a.rotate === b.rotate && a.scaleX === b.scaleX && a.scaleY === b.scaleY
  );
}

export function isIdentityOrientation(o: UserOrientation): boolean {
  return orientationsEqual(o, IDENTITY_ORIENTATION);
}

/** Full Reset View: user transform identity, Fit, pan 0, keep DPI. */
export function resetView(
  img: OrientedImage,
  viewport: ImageViewport,
  state: ViewTransform,
): ViewTransform {
  return fitView(img, viewport, {
    ...state,
    orientation: { ...IDENTITY_ORIENTATION },
    panX: 0,
    panY: 0,
  });
}

/** New publication: Fit, identity orientation, keep DPI. */
export function resetForNewPublication(
  img: OrientedImage,
  viewport: ImageViewport,
  dpiScale: number,
): ViewTransform {
  return fitView(img, viewport, initialViewTransform(dpiScale));
}

/** Display label. Proxy images never claim source-relative 100%. */
export function zoomLabel(
  state: ViewTransform,
  opts: { fullResolution: boolean; hasImage: boolean },
): string {
  if (!opts.hasImage) return "-";
  if (state.mode === "fit") return "Fit";
  if (!opts.fullResolution) {
    const z = state.productZoom;
    if (Math.abs(z - 1) < 1e-6) return "Proxy";
    return `Proxy ×${formatZoom(z)}`;
  }
  return formatZoom(state.productZoom);
}

function formatZoom(z: number): string {
  const pct = z * 100;
  if (Math.abs(pct - Math.round(pct)) < 0.05) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

/** PocketJS Image paint facts for the current user orientation. */
export function pocketImageStyle(
  img: OrientedImage,
  state: ViewTransform,
  viewport: ImageViewport,
): {
  insetL: number;
  insetT: number;
  width: number;
  height: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
} {
  const s = realizedSampleScale(state);
  const width = Math.max(1, img.width * s);
  const height = Math.max(1, img.height * s);
  const c = imageCenterToViewport(state, viewport);
  return {
    insetL: c.x - width / 2,
    insetT: c.y - height / 2,
    width,
    height,
    rotate: state.orientation.rotate,
    scaleX: state.orientation.scaleX,
    scaleY: state.orientation.scaleY,
    originX: 0,
    originY: 0,
  };
}

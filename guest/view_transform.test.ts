import { test, expect } from "bun:test";
import {
  IDENTITY_ORIENTATION,
  actualSize,
  clampPan,
  drawnExtent,
  fitProductZoom,
  fitView,
  flipHorizontal,
  flipVertical,
  initialViewTransform,
  isIdentityOrientation,
  orientationsEqual,
  panBy,
  pocketImageStyle,
  resetForNewPublication,
  resetView,
  rotateLeft,
  rotateRight,
  setDpiScale,
  userExtent,
  userImageToViewport,
  viewportToUserImage,
  zoomAt,
  zoomIn,
  zoomLabel,
  zoomOut,
  type OrientedImage,
  type ImageViewport,
  type UserOrientation,
  type ViewTransform,
} from "./view_transform.ts";

const vp: ImageViewport = { x: 0, y: 0, width: 960, height: 640 };
const landscape: OrientedImage = { width: 1920, height: 1080 };
const portrait: OrientedImage = { width: 1080, height: 1920 };

function almost(a: number, b: number, eps = 1e-4) {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
}

// --- Fit ---------------------------------------------------------------------

test("Fit landscape no-upscale at dpi 1", () => {
  const z = fitProductZoom(landscape, vp, 1, IDENTITY_ORIENTATION);
  // 960/1920 = 0.5; 640/1080 ≈ 0.592 → min 0.5
  almost(z, 0.5);
});

test("Fit R90 swaps bounds", () => {
  const o = rotateRight(IDENTITY_ORIENTATION);
  const z = fitProductZoom(landscape, vp, 1, o);
  // After R90: extent 1080x1920 → min(960/1080, 640/1920) ≈ 0.333
  almost(z, 640 / 1920);
});

test("Fit small image does not upscale", () => {
  const small = { width: 100, height: 80 };
  const z = fitProductZoom(small, vp, 1, IDENTITY_ORIENTATION);
  expect(z).toBe(1);
});

test("Fit flip H/V keeps same bounds", () => {
  const z0 = fitProductZoom(landscape, vp, 1, IDENTITY_ORIENTATION);
  const zh = fitProductZoom(landscape, vp, 1, flipHorizontal(IDENTITY_ORIENTATION));
  const zv = fitProductZoom(landscape, vp, 1, flipVertical(IDENTITY_ORIENTATION));
  almost(zh, z0);
  almost(zv, z0);
});

// --- DPI / 100% --------------------------------------------------------------

test("100% at dpi 1 realizes scale 1", () => {
  const s = actualSize(initialViewTransform(1));
  expect(s.productZoom).toBe(1);
  expect(s.productZoom / s.dpiScale).toBe(1);
});

test("100% at dpi 1.5 realizes scale 1/1.5", () => {
  const s = actualSize(initialViewTransform(1.5));
  almost(s.productZoom / s.dpiScale, 1 / 1.5);
  const d = drawnExtent({ width: 4000, height: 3000 }, s);
  almost(d.width, 4000 / 1.5);
});

test("100% at dpi 2 realizes scale 0.5", () => {
  const s = actualSize(initialViewTransform(2));
  almost(s.productZoom / s.dpiScale, 0.5);
});

test("100% at dpi 1.25", () => {
  const s = actualSize(initialViewTransform(1.25));
  almost(s.productZoom / s.dpiScale, 0.8);
});

test("setDpiScale preserves productZoom", () => {
  const s0 = actualSize(initialViewTransform(1));
  const s1 = setDpiScale(s0, 2);
  expect(s1.productZoom).toBe(1);
  expect(s1.dpiScale).toBe(2);
});

// --- zoomAt pointer anchor ---------------------------------------------------

function checkAnchor(
  img: OrientedImage,
  viewport: ImageViewport,
  before: ViewTransform,
  after: ViewTransform,
  fx: number,
  fy: number,
) {
  const a = viewportToUserImage(before, viewport, img, fx, fy);
  const b = viewportToUserImage(after, viewport, img, fx, fy);
  almost(a.x, b.x, 1e-3);
  almost(a.y, b.y, 1e-3);
  // And the point maps back to focus under the new transform.
  const p = userImageToViewport(after, viewport, img, a.x, a.y);
  almost(p.x, fx, 1e-3);
  almost(p.y, fy, 1e-3);
}

test("zoomAt center focus on centered image stays centered", () => {
  const s0 = actualSize(initialViewTransform(1));
  const s1 = zoomAt(landscape, vp, s0, 480, 320, 2);
  // Center anchor: pan should remain 0.
  almost(s1.panX, 0, 1e-3);
  almost(s1.panY, 0, 1e-3);
  checkAnchor(landscape, vp, s0, s1, 480, 320);
});

test("zoomAt off-center focus preserves anchor", () => {
  const s0 = actualSize(initialViewTransform(1));
  const s1 = zoomAt(landscape, vp, s0, 200, 150, 2);
  checkAnchor(landscape, vp, s0, s1, 200, 150);
});

test("zoomAt with existing pan", () => {
  let s = actualSize(initialViewTransform(1));
  s = { ...s, panX: -100, panY: 50 };
  const s1 = zoomAt(landscape, vp, s, 700, 400, 1.5);
  checkAnchor(landscape, vp, s, s1, 700, 400);
});

test("zoomAt after R90", () => {
  let s = actualSize(initialViewTransform(1));
  s = { ...s, orientation: rotateRight(IDENTITY_ORIENTATION) };
  const s1 = zoomAt(landscape, vp, s, 300, 200, 2);
  checkAnchor(landscape, vp, s, s1, 300, 200);
});

test("zoomAt after flipH", () => {
  let s = actualSize(initialViewTransform(1));
  s = { ...s, orientation: flipHorizontal(IDENTITY_ORIENTATION) };
  const s1 = zoomAt(landscape, vp, s, 800, 100, 1.25);
  checkAnchor(landscape, vp, s, s1, 800, 100);
});

test("zoomAt at dpi 1.5", () => {
  const s0 = actualSize(initialViewTransform(1.5));
  const s1 = zoomAt(landscape, vp, s0, 100, 500, 2);
  checkAnchor(landscape, vp, s0, s1, 100, 500);
});

test("zoomAt from Fit materializes then anchors", () => {
  const s0 = fitView(landscape, vp, initialViewTransform(1));
  const s1 = zoomAt(landscape, vp, s0, 480, 320, s0.productZoom * 2);
  checkAnchor(landscape, vp, s0, s1, 480, 320);
});

// --- D4 composition ----------------------------------------------------------

test("R90 × 4 = Identity", () => {
  let o = IDENTITY_ORIENTATION;
  for (let i = 0; i < 4; i++) o = rotateRight(o);
  expect(isIdentityOrientation(o)).toBe(true);
});

test("FlipH × 2 = Identity", () => {
  const o = flipHorizontal(flipHorizontal(IDENTITY_ORIENTATION));
  expect(isIdentityOrientation(o)).toBe(true);
});

test("FlipV × 2 = Identity", () => {
  const o = flipVertical(flipVertical(IDENTITY_ORIENTATION));
  expect(isIdentityOrientation(o)).toBe(true);
});

test("R90 + FlipH != FlipH + R90", () => {
  const a = flipHorizontal(rotateRight(IDENTITY_ORIENTATION));
  const b = rotateRight(flipHorizontal(IDENTITY_ORIENTATION));
  expect(orientationsEqual(a, b)).toBe(false);
});

test("userExtent swaps on R90/R270", () => {
  expect(userExtent(landscape, IDENTITY_ORIENTATION)).toEqual({
    width: 1920,
    height: 1080,
  });
  expect(userExtent(landscape, rotateRight(IDENTITY_ORIENTATION))).toEqual({
    width: 1080,
    height: 1920,
  });
  expect(userExtent(landscape, rotateLeft(IDENTITY_ORIENTATION))).toEqual({
    width: 1080,
    height: 1920,
  });
});

// --- Pan clamp ---------------------------------------------------------------

test("small image centers (pan forced 0)", () => {
  const small = { width: 100, height: 80 };
  const s = { ...actualSize(initialViewTransform(1)), panX: 50, panY: -20 };
  const c = clampPan(small, vp, s);
  expect(c.panX).toBe(0);
  expect(c.panY).toBe(0);
});

test("large image min/max clamp", () => {
  const s = actualSize(initialViewTransform(1));
  // draw 1920x1080 in 960x640 → maxX=(1920-960)/2=480, maxY=(1080-640)/2=220
  const hi = clampPan(landscape, vp, { ...s, panX: 9999, panY: 9999 });
  almost(hi.panX, 480);
  almost(hi.panY, 220);
  const lo = clampPan(landscape, vp, { ...s, panX: -9999, panY: -9999 });
  almost(lo.panX, -480);
  almost(lo.panY, -220);
});

test("clamp after R90 uses swapped bounds", () => {
  let s = actualSize(initialViewTransform(1));
  s = { ...s, orientation: rotateRight(IDENTITY_ORIENTATION) };
  // extent 1080x1920 → maxX=(1080-960)/2=60, maxY=(1920-640)/2=640
  const hi = clampPan(landscape, vp, { ...s, panX: 1e6, panY: 1e6 });
  almost(hi.panX, 60);
  almost(hi.panY, 640);
});

test("panBy leaves image covering viewport", () => {
  const s0 = actualSize(initialViewTransform(1));
  const s1 = panBy(landscape, vp, s0, -100, 0);
  almost(s1.panX, -100);
  const c = clampPan(landscape, vp, s1);
  expect(Math.abs(c.panX)).toBeLessThanOrEqual(480 + 1e-6);
});

// --- Reset / labels ----------------------------------------------------------

test("resetView clears orientation and fits", () => {
  let s = actualSize(initialViewTransform(1));
  s = {
    ...s,
    orientation: rotateRight(flipHorizontal(IDENTITY_ORIENTATION)),
    panX: 40,
    panY: 10,
  };
  const r = resetView(landscape, vp, s);
  expect(isIdentityOrientation(r.orientation)).toBe(true);
  almost(r.panX, 0);
  almost(r.panY, 0);
  expect(r.mode).toBe("fit");
});

test("resetForNewPublication keeps dpi", () => {
  const s = resetForNewPublication(landscape, vp, 1.5);
  expect(s.dpiScale).toBe(1.5);
  expect(isIdentityOrientation(s.orientation)).toBe(true);
});

test("proxy labels never claim 100%", () => {
  const s = actualSize(initialViewTransform(1));
  expect(zoomLabel(s, { fullResolution: false, hasImage: true })).toBe("Proxy");
  const z = { ...s, productZoom: 1.25 };
  expect(zoomLabel(z, { fullResolution: false, hasImage: true })).toBe(
    "Proxy ×125%",
  );
  expect(zoomLabel(s, { fullResolution: true, hasImage: true })).toBe("100%");
});

test("fit label", () => {
  const s = fitView(landscape, vp, initialViewTransform(1));
  expect(zoomLabel(s, { fullResolution: true, hasImage: true })).toBe("Fit");
});

// --- zoom steps --------------------------------------------------------------

test("zoomIn/out from Fit uses materialized fit zoom", () => {
  const fit = fitView(landscape, vp, initialViewTransform(1));
  const zin = zoomIn(landscape, vp, fit);
  expect(zin.mode).toBe("manual");
  expect(zin.productZoom).toBeGreaterThan(fit.productZoom);
});

// --- pocket style ------------------------------------------------------------

test("pocketImageStyle places node center at image center", () => {
  const s = actualSize(initialViewTransform(1));
  const st = pocketImageStyle(landscape, s, vp);
  almost(st.insetL + st.width / 2, 480);
  almost(st.insetT + st.height / 2, 320);
  expect(st.rotate).toBe(0);
  expect(st.scaleX).toBe(1);
  expect(st.originX).toBe(0);
  // R90 keeps node at O size; transform rotates about center.
  const r = { ...s, orientation: rotateRight(IDENTITY_ORIENTATION) };
  const st2 = pocketImageStyle(landscape, r, vp);
  almost(st2.width, 1920);
  almost(st2.height, 1080);
  expect(st2.rotate).toBe(90);
});

// --- user image mapping with orientation ------------------------------------

test("viewportToUserImage + userImageToViewport roundtrip", () => {
  const s = actualSize(initialViewTransform(1));
  const p = viewportToUserImage(s, vp, landscape, 100, 200);
  const q = userImageToViewport(s, vp, landscape, p.x, p.y);
  almost(q.x, 100);
  almost(q.y, 200);
});

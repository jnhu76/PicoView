import { test, expect } from "bun:test";
import { pointInImageViewport, wheelFocusPoint } from "./shell_layout.ts";
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
  normalizeOrientation,
  orientationsEqual,
  panBy,
  pocketImageStyle,
  reconcileViewEnvironment,
  resetForNewPublication,
  resetView,
  rotateLeft,
  rotateRight,
  setDpiScale,
  setUserOrientation,
  userExtent,
  userImageToViewport,
  viewEnvironmentsEqual,
  viewportToUserImage,
  zoomAt,
  zoomIn,
  zoomLabel,
  zoomOut,
  type OrientedImage,
  type ImageViewport,
  type UserOrientation,
  type ViewEnvironment,
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

test("fit label includes live product zoom percent", () => {
  const s = fitView(landscape, vp, initialViewTransform(1));
  const pct = Math.round(s.productZoom * 100);
  expect(zoomLabel(s, { fullResolution: true, hasImage: true })).toBe(
    `Fit · ${pct}%`,
  );
});

test("zoom in/out moves the status zoom number", () => {
  const fmt = (z: number) => {
    const pct = z * 100;
    return Math.abs(pct - Math.round(pct)) < 0.05
      ? `${Math.round(pct)}%`
      : `${pct.toFixed(1)}%`;
  };
  const fit = fitView(landscape, vp, initialViewTransform(1));
  const zin = zoomIn(landscape, vp, fit);
  const zout = zoomOut(landscape, vp, zin);
  const full = { fullResolution: true, hasImage: true };
  expect(zoomLabel(fit, full)).toBe(`Fit · ${fmt(fit.productZoom)}`);
  expect(zoomLabel(zin, full)).toBe(fmt(zin.productZoom));
  expect(zoomLabel(zout, full)).toBe(fmt(zout.productZoom));
  expect(zin.productZoom).not.toBe(fit.productZoom);
  // 1:1 command is Actual Size = productZoom 1.0 = 100% (not an aspect ratio).
  const a = actualSize(zin);
  expect(a.productZoom).toBe(1);
  expect(zoomLabel(a, full)).toBe("100%");
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

// --- D4 canonicality (Corrective-2 MAJOR-4) ----------------------------------

/** The 8 canonical D4 field-tuples (rotations +1/+1, reflections -1/+1). */
const CANONICAL_D4: UserOrientation[] = [
  { rotate: 0, scaleX: 1, scaleY: 1 },
  { rotate: 90, scaleX: 1, scaleY: 1 },
  { rotate: 180, scaleX: 1, scaleY: 1 },
  { rotate: 270, scaleX: 1, scaleY: 1 },
  { rotate: 0, scaleX: -1, scaleY: 1 },
  { rotate: 90, scaleX: -1, scaleY: 1 },
  { rotate: 180, scaleX: -1, scaleY: 1 },
  { rotate: 270, scaleX: -1, scaleY: 1 },
];

function keyOf(o: UserOrientation) {
  return `${o.rotate}/${o.scaleX}/${o.scaleY}`;
}

test("normalize folds scale(-1,-1) into R180 and FV into FH∘R180", () => {
  expect(normalizeOrientation({ rotate: 0, scaleX: -1, scaleY: -1 })).toEqual({
    rotate: 180,
    scaleX: 1,
    scaleY: 1,
  });
  expect(normalizeOrientation({ rotate: 90, scaleX: -1, scaleY: -1 })).toEqual({
    rotate: 270,
    scaleX: 1,
    scaleY: 1,
  });
  // FV is canonical as FH∘R180.
  expect(normalizeOrientation({ rotate: 0, scaleX: 1, scaleY: -1 })).toEqual({
    rotate: 180,
    scaleX: -1,
    scaleY: 1,
  });
  expect(normalizeOrientation(IDENTITY_ORIENTATION)).toEqual(
    IDENTITY_ORIENTATION,
  );
  // Idempotent.
  for (const o of CANONICAL_D4) {
    expect(normalizeOrientation(o)).toEqual(o);
  }
});

test("op closure stays in the 8 canonical D4 states", () => {
  const seen = new Set<string>([keyOf(IDENTITY_ORIENTATION)]);
  let frontier: UserOrientation[] = [IDENTITY_ORIENTATION];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next: UserOrientation[] = [];
    for (const o of frontier) {
      for (const step of [
        rotateRight(o),
        rotateLeft(o),
        flipHorizontal(o),
        flipVertical(o),
      ]) {
        const k = keyOf(step);
        if (!seen.has(k)) {
          seen.add(k);
          next.push(step);
        }
      }
    }
    frontier = next;
  }
  expect(seen.size).toBe(8);
  for (const o of CANONICAL_D4) {
    expect(seen.has(keyOf(o))).toBe(true);
  }
  // Canonical reflections are always FH-flavored; never both scales negative.
  for (const k of seen) {
    expect(k.endsWith("/-1/-1")).toBe(false);
    const [, sx, sy] = k.split("/");
    if (sx === "1" && sy === "-1") {
      throw new Error(`non-canonical FV-flavored tuple survived: ${k}`);
    }
  }
});

test("FH then FV is semantically R180, not a stuck double-flip", () => {
  const o = flipVertical(flipHorizontal(IDENTITY_ORIENTATION));
  // Double flip ≡ pure R180 (not a reflection).
  expect(o).toEqual({ rotate: 180, scaleX: 1, scaleY: 1 });
  expect(isIdentityOrientation(o)).toBe(false);
  // Four FH recover identity.
  const back = flipHorizontal(flipHorizontal(flipHorizontal(flipHorizontal(IDENTITY_ORIENTATION))));
  expect(isIdentityOrientation(back)).toBe(true);
  // FV alone is the canonical FH∘R180 reflection.
  expect(flipVertical(IDENTITY_ORIENTATION)).toEqual({
    rotate: 180,
    scaleX: -1,
    scaleY: 1,
  });
});

// --- PR61-CORRECTIVE-1 MAJOR-A: viewport / DPI reconcile ----------------------

const big: OrientedImage = { width: 4000, height: 3000 };
const vpA: ImageViewport = { x: 0, y: 0, width: 1000, height: 700 };
const vpB: ImageViewport = { x: 0, y: 0, width: 600, height: 400 };
const vpC: ImageViewport = { x: 0, y: 0, width: 2000, height: 1400 };

function env(v: ImageViewport, dpiScale: number): ViewEnvironment {
  return { viewport: v, dpiScale };
}

test("A1 Fit resize narrower recomputes productZoom and recenters", () => {
  const start = fitView(big, vpA, initialViewTransform(1));
  almost(start.productZoom, fitProductZoom(big, vpA, 1, IDENTITY_ORIENTATION));
  const next = reconcileViewEnvironment(
    big,
    env(vpA, 1),
    env(vpB, 1),
    start,
  );
  expect(next.mode).toBe("fit");
  almost(next.productZoom, fitProductZoom(big, vpB, 1, IDENTITY_ORIENTATION));
  almost(next.panX, 0);
  almost(next.panY, 0);
});

test("A2 Fit resize larger recomputes and respects no-upscale", () => {
  const start = fitView(big, vpB, initialViewTransform(1));
  const next = reconcileViewEnvironment(
    big,
    env(vpB, 1),
    env(vpC, 1),
    start,
  );
  expect(next.mode).toBe("fit");
  expect(next.productZoom).toBeGreaterThan(start.productZoom);
  expect(next.productZoom).toBeLessThanOrEqual(1);
  almost(next.productZoom, fitProductZoom(big, vpC, 1, IDENTITY_ORIENTATION));
});

test("A2b Fit small viewport→large still never upscales past 1", () => {
  const smallImg: OrientedImage = { width: 200, height: 150 };
  const start = fitView(smallImg, vpB, initialViewTransform(1));
  expect(start.productZoom).toBe(1);
  const next = reconcileViewEnvironment(
    smallImg,
    env(vpB, 1),
    env(vpC, 1),
    start,
  );
  expect(next.productZoom).toBe(1);
});

test("A3 Fit DPI transition recomputes productZoom with new dpi", () => {
  const start = fitView(big, vpA, initialViewTransform(1));
  const next = reconcileViewEnvironment(
    big,
    env(vpA, 1),
    env(vpA, 1.5),
    start,
  );
  expect(next.mode).toBe("fit");
  expect(next.dpiScale).toBe(1.5);
  almost(next.productZoom, fitProductZoom(big, vpA, 1.5, IDENTITY_ORIENTATION));
  // Fit physical result: realized = z/d still maps image into viewport.
  const realized = next.productZoom / next.dpiScale;
  const draw = drawnExtent(big, next);
  expect(draw.width).toBeLessThanOrEqual(vpA.width + 1e-6);
  expect(draw.height).toBeLessThanOrEqual(vpA.height + 1e-6);
  almost(realized, next.productZoom / 1.5);
});

test("A4 Manual resize preserves productZoom and clamps pan only if needed", () => {
  let start = actualSize(initialViewTransform(1));
  start = { ...start, productZoom: 2, panX: 800, panY: 500 };
  const next = reconcileViewEnvironment(
    big,
    env(vpA, 1),
    env(vpB, 1),
    start,
  );
  expect(next.mode).toBe("manual");
  expect(next.productZoom).toBe(2);
  // Pan must be clamped to the new viewport's allowed range.
  const maxX = Math.max(0, (drawnExtent(big, next).width - vpB.width) / 2);
  const maxY = Math.max(0, (drawnExtent(big, next).height - vpB.height) / 2);
  expect(Math.abs(next.panX)).toBeLessThanOrEqual(maxX + 1e-6);
  expect(Math.abs(next.panY)).toBeLessThanOrEqual(maxY + 1e-6);
});

test("A4b Manual resize does not silently return to Fit", () => {
  const start = zoomIn(big, vpA, fitView(big, vpA, initialViewTransform(1)));
  expect(start.mode).toBe("manual");
  const next = reconcileViewEnvironment(
    big,
    env(vpA, 1),
    env(vpB, 1),
    start,
  );
  expect(next.mode).toBe("manual");
  expect(next.productZoom).toBe(start.productZoom);
});

test("A5 Manual DPI transition keeps 100% product zoom and realizes 1/d", () => {
  const start = actualSize(initialViewTransform(1));
  const next = reconcileViewEnvironment(
    big,
    env(vpA, 1),
    env(vpA, 2),
    start,
  );
  expect(next.mode).toBe("manual");
  expect(next.productZoom).toBe(1);
  expect(next.dpiScale).toBe(2);
  almost(next.productZoom / next.dpiScale, 0.5);
});

test("A6 Fit after R90 resize uses swapped user extent", () => {
  let start = fitView(landscape, vp, initialViewTransform(1));
  start = { ...start, orientation: rotateRight(IDENTITY_ORIENTATION) };
  start = fitView(landscape, vp, start);
  const next = reconcileViewEnvironment(
    landscape,
    env(vp, 1),
    env(vpB, 1),
    start,
  );
  expect(next.mode).toBe("fit");
  expect(next.orientation.rotate).toBe(90);
  almost(
    next.productZoom,
    fitProductZoom(landscape, vpB, 1, next.orientation),
  );
});

test("A6b setUserOrientation while Fit recomputes productZoom (app path)", () => {
  // Landscape Fit: width-bound. After R90 the extent swaps and height binds.
  const fit0 = fitView(landscape, vp, initialViewTransform(1));
  almost(fit0.productZoom, fitProductZoom(landscape, vp, 1, IDENTITY_ORIENTATION));
  const r90 = setUserOrientation(
    landscape,
    vp,
    fit0,
    rotateRight(IDENTITY_ORIENTATION),
  );
  expect(r90.mode).toBe("fit");
  expect(r90.orientation.rotate).toBe(90);
  almost(
    r90.productZoom,
    fitProductZoom(landscape, vp, 1, r90.orientation),
  );
  // Drawn AABB after R90 must still fit the viewport.
  const draw = drawnExtent(landscape, r90);
  expect(draw.width).toBeLessThanOrEqual(vp.width + 1e-6);
  expect(draw.height).toBeLessThanOrEqual(vp.height + 1e-6);
  // Without the re-fit, stale pre-rotate zoom would overflow height.
  expect(r90.productZoom).not.toBe(fit0.productZoom);
});

test("A6c setUserOrientation in manual keeps productZoom and clamps pan", () => {
  let manual = actualSize(initialViewTransform(1));
  manual = { ...manual, productZoom: 2, panX: 400, panY: 100 };
  const r90 = setUserOrientation(
    landscape,
    vp,
    manual,
    rotateRight(IDENTITY_ORIENTATION),
  );
  expect(r90.mode).toBe("manual");
  expect(r90.productZoom).toBe(2);
  expect(r90.orientation.rotate).toBe(90);
  const maxX = Math.max(0, (drawnExtent(landscape, r90).width - vp.width) / 2);
  const maxY = Math.max(0, (drawnExtent(landscape, r90).height - vp.height) / 2);
  expect(Math.abs(r90.panX)).toBeLessThanOrEqual(maxX + 1e-6);
  expect(Math.abs(r90.panY)).toBeLessThanOrEqual(maxY + 1e-6);
});

test("reconcile idempotent for equivalent environment facts", () => {
  const start = fitView(big, vpA, initialViewTransform(1));
  const once = reconcileViewEnvironment(big, env(vpA, 1), env(vpA, 1), start);
  const twice = reconcileViewEnvironment(
    big,
    env(vpA, 1),
    env(vpA, 1),
    once,
  );
  almost(twice.productZoom, start.productZoom);
  almost(twice.panX, 0);
  expect(twice.mode).toBe("fit");
  // Same facts → no semantic change, same reference.
  expect(once).toBe(start);
  expect(twice).toBe(start);
});

test("reconcile from unknown previous still stabilizes Fit", () => {
  const start = fitView(big, vpA, initialViewTransform(1));
  const first = reconcileViewEnvironment(big, null, env(vpA, 1), start);
  almost(first.productZoom, start.productZoom);
  const second = reconcileViewEnvironment(big, env(vpA, 1), env(vpA, 1), first);
  expect(second).toBe(first);
});

test("viewEnvironmentsEqual", () => {
  expect(viewEnvironmentsEqual(null, env(vpA, 1))).toBe(false);
  expect(viewEnvironmentsEqual(env(vpA, 1), env(vpA, 1))).toBe(true);
  expect(viewEnvironmentsEqual(env(vpA, 1), env(vpB, 1))).toBe(false);
  expect(viewEnvironmentsEqual(env(vpA, 1), env(vpA, 1.5))).toBe(false);
});

// --- PR61-CORRECTIVE-1 MAJOR-B: cross-turn wheel pipeline --------------------

test("B1 CursorMoved turn N + wheel turn N+1 anchors at last pointer", () => {
  // Window image viewport: y starts at chrome 100.
  const windowVp: ImageViewport = { x: 0, y: 100, width: 960, height: 512 };
  const s0 = actualSize(initialViewTransform(1));
  // Turn N: pointer moved to window-logical (200, 280) → canvas-local (200, 180).
  const pointer = { x: 200, y: 280, known: true };
  expect(pointInImageViewport(windowVp, pointer.x, pointer.y)).toBe(true);
  // Turn N+1: only scroll — no mouse packet. Anchor must still be the pointer.
  const focus = wheelFocusPoint(windowVp, pointer);
  expect(focus).toEqual({ x: 200, y: 280 });
  const s1 = zoomAt(landscape, windowVp, s0, focus.x, focus.y, 2);
  checkAnchor(landscape, windowVp, s0, s1, 200, 280);
});

test("B2 three wheel turns without motion share one anchor", () => {
  const windowVp: ImageViewport = { x: 0, y: 100, width: 960, height: 512 };
  let s = actualSize(initialViewTransform(1));
  const pointer = { x: 700, y: 400, known: true };
  const focus0 = wheelFocusPoint(windowVp, pointer);
  for (let i = 0; i < 3; i++) {
    const stepped = zoomIn(landscape, windowVp, s);
    s = zoomAt(landscape, windowVp, s, focus0.x, focus0.y, stepped.productZoom);
    const focusAgain = wheelFocusPoint(windowVp, pointer);
    expect(focusAgain).toEqual(focus0);
  }
  // Final mapping still holds the original sample under the pointer.
  const before = viewportToUserImage(
    actualSize(initialViewTransform(1)),
    windowVp,
    landscape,
    focus0.x,
    focus0.y,
  );
  const after = viewportToUserImage(s, windowVp, landscape, focus0.x, focus0.y);
  almost(after.x, before.x, 1.0);
  almost(after.y, before.y, 1.0);
});

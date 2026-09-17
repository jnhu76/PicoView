// View state tests (PICOVIEW-REAL-VIEWER-TRAIN-1 closeout).
//
// These drive the pure view state machine without the framework.
// Run: `bun test guest/view_state.test.ts`.
import { expect, test } from "bun:test";
import {
  initialViewState,
  resetToFit,
  resetForNewPublication,
  set100Percent,
  fitScale,
  effectiveScale,
  materializeManual,
  zoomIn,
  zoomOut,
  zoomAt,
  panDelta,
  clampPan,
  rotateLeft,
  rotateRight,
  flipHorizontal,
  flipVertical,
  displayScale,
  reconcileViewForPublication,
  publicationViewKeyFrom,
  type ViewState,
  type ViewGeometry,
  type PublicationViewKey,
} from "./view_state.ts";

test("initial view state is fit mode", () => {
  const s = initialViewState();
  expect(s.mode).toBe("fit");
  expect(s.scale).toBe(1);
  expect(s.panX).toBe(0);
  expect(s.panY).toBe(0);
  expect(s.quarterTurns).toBe(0);
  expect(s.flipX).toBe(false);
  expect(s.flipY).toBe(false);
});

test("resetToFit returns to fit mode with zero pan", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 2, panX: 100, panY: 50 };
  const r = resetToFit(s);
  expect(r.mode).toBe("fit");
  expect(r.panX).toBe(0);
  expect(r.panY).toBe(0);
  expect(r.scale).toBe(1);
});

test("resetForNewPublication returns Fit pan 0,0", () => {
  const s = {
    ...initialViewState(),
    mode: "manual" as const,
    scale: 3,
    panX: 40,
    panY: -10,
    quarterTurns: 1 as const,
    flipX: true,
  };
  const r = resetForNewPublication(s);
  expect(r.mode).toBe("fit");
  expect(r.scale).toBe(1);
  expect(r.panX).toBe(0);
  expect(r.panY).toBe(0);
  expect(r.quarterTurns).toBe(0);
  expect(r.flipX).toBe(false);
  expect(r.flipY).toBe(false);
});

test("set100Percent forces scale exactly 1.0 from 200%", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 2.0, panX: 30, panY: 15 };
  const r = set100Percent(s);
  expect(r.mode).toBe("manual");
  expect(r.scale).toBe(1.0);
  expect(r.panX).toBe(0);
  expect(r.panY).toBe(0);
});

test("set100Percent forces scale exactly 1.0 from 50%", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 0.5 };
  const r = set100Percent(s);
  expect(r.mode).toBe("manual");
  expect(r.scale).toBe(1.0);
});

test("set100Percent forces scale exactly 1.0 from 400%", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 4.0 };
  const r = set100Percent(s);
  expect(r.mode).toBe("manual");
  expect(r.scale).toBe(1.0);
});

test("set100Percent from Fit forces scale exactly 1.0 (not fit placeholder)", () => {
  // Fit stores scale=1.0 as a placeholder; 1:1 must still be an exact 100%
  // manual state, not a Fit view.
  const s = initialViewState();
  const r = set100Percent(s);
  expect(r.mode).toBe("manual");
  expect(r.scale).toBe(1.0);
  expect(r.panX).toBe(0);
  expect(r.panY).toBe(0);
});

test("fitScale computes correct scale for landscape image", () => {
  // 1920x1080 image in 960x640 viewport: scale = min(1, (960-16)/1920, (640-80)/1080)
  // = min(1, 944/1920, 560/1080) = min(1, 0.4917, 0.5185) = 0.4917
  const s = fitScale(1920, 1080, 960, 640, 0);
  expect(s).toBeGreaterThan(0.48);
  expect(s).toBeLessThan(0.50);
  expect(s).toBeLessThanOrEqual(1.0);
});

test("fitScale accounts for rotation", () => {
  // After 90° rotation, 1920x1080 becomes 1080x1920 logical.
  const s0 = fitScale(1920, 1080, 960, 640, 0);
  const s1 = fitScale(1920, 1080, 960, 640, 1);
  // The rotated image is taller, so fit scale should be smaller.
  expect(s1).toBeLessThan(s0);
});

test("fitScale never upscales", () => {
  // Tiny image in large viewport: scale clamped to 1.0.
  const s = fitScale(100, 100, 960, 640, 0);
  expect(s).toBe(1.0);
});

test("zoomIn from Fit at effective ~49% goes to nearest step >49% (0.5), not 125%", () => {
  const geo: ViewGeometry = { imageW: 1920, imageH: 1080, viewportW: 960, viewportH: 640 };
  const fit = initialViewState();
  const effective = effectiveScale(fit, geo);
  expect(effective).toBeGreaterThan(0.48);
  expect(effective).toBeLessThan(0.50);
  const z = zoomIn(fit, geo);
  expect(z.mode).toBe("manual");
  expect(z.scale).toBe(0.5);
  expect(z.scale).toBeLessThan(1.0);
});

test("zoomOut from Fit at effective ~49% goes to nearest step <49% (0.3333)", () => {
  const geo: ViewGeometry = { imageW: 1920, imageH: 1080, viewportW: 960, viewportH: 640 };
  const fit = initialViewState();
  const z = zoomOut(fit, geo);
  expect(z.mode).toBe("manual");
  expect(z.scale).toBe(0.3333);
});

test("zoomIn from Fit at effective 100% goes to 125%", () => {
  const geo: ViewGeometry = { imageW: 400, imageH: 300, viewportW: 960, viewportH: 640 };
  const fit = initialViewState();
  expect(effectiveScale(fit, geo)).toBe(1.0);
  const z = zoomIn(fit, geo);
  expect(z.scale).toBe(1.25);
});

test("zoomOut from Fit at effective 100% goes to 75%", () => {
  const geo: ViewGeometry = { imageW: 400, imageH: 300, viewportW: 960, viewportH: 640 };
  const fit = initialViewState();
  expect(effectiveScale(fit, geo)).toBe(1.0);
  const z = zoomOut(fit, geo);
  expect(z.scale).toBe(0.75);
});

test("materializeManual converts Fit to manual at effective scale", () => {
  const geo: ViewGeometry = { imageW: 1920, imageH: 1080, viewportW: 960, viewportH: 640 };
  const m = materializeManual(initialViewState(), geo);
  expect(m.mode).toBe("manual");
  expect(m.scale).toBeCloseTo(fitScale(1920, 1080, 960, 640, 0), 5);
});

test("zoomIn increases scale to next step from manual", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 1.0 };
  const z = zoomIn(s);
  expect(z.mode).toBe("manual");
  expect(z.scale).toBe(1.25);
});

test("zoomOut decreases scale to previous step from manual", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 1.0 };
  const z = zoomOut(s);
  expect(z.scale).toBe(0.75);
});

test("zoomIn clamps at maximum", () => {
  const s: ViewState = { ...initialViewState(), mode: "manual" as const, scale: 16.0 };
  const z = zoomIn(s);
  expect(z.scale).toBe(16.0);
});

test("zoomOut clamps at minimum", () => {
  const s: ViewState = { ...initialViewState(), mode: "manual" as const, scale: 0.0625 };
  const z = zoomOut(s);
  expect(z.scale).toBe(0.0625);
});

test("zoomAt adjusts pan to keep focus point fixed", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 1.0 };
  // Zoom 2x at viewport center (480, 320): the focus point must stay fixed.
  // newPanX = focusX - (focusX - panX) * ratio = 480 - 480 * 2.0 = -480
  const z = zoomAt(s, 2.0, 480, 320, 960, 640);
  expect(z.scale).toBe(2.0);
  expect(z.panX).toBe(-480);
  expect(z.panY).toBe(-320);
});

test("panDelta adds to pan offset", () => {
  const s = initialViewState();
  const p = panDelta(s, 10, -20);
  expect(p.panX).toBe(10);
  expect(p.panY).toBe(-20);
  const p2 = panDelta(p, -5, 5);
  expect(p2.panX).toBe(5);
  expect(p2.panY).toBe(-15);
});

test("clampPan centers small images", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 0.5, panX: 100, panY: 100 };
  // Image is 200x200 at 0.5x = 100x100 display, viewport is 960x640.
  // Image is smaller than viewport, so pan should be centered (0,0).
  const c = clampPan(s, 200, 200, 960, 640);
  expect(c.panX).toBe(0);
  expect(c.panY).toBe(0);
});

test("clampPan constrains large image pan", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 2.0, panX: 5000, panY: 5000 };
  // Image is 400x300 at 2x = 800x600 display, viewport is 960x640.
  // Pan should be clamped.
  const c = clampPan(s, 400, 300, 960, 640);
  expect(Math.abs(c.panX)).toBeLessThan(5000);
  expect(Math.abs(c.panY)).toBeLessThan(5000);
});

test("rotateLeft decrements quarter turns", () => {
  const s = initialViewState();
  const r = rotateLeft(s);
  expect(r.quarterTurns).toBe(3); // -1 wraps to 3
  expect(r.panX).toBe(0);
  expect(r.panY).toBe(0);
});

test("rotateRight increments quarter turns", () => {
  const s = initialViewState();
  const r = rotateRight(s);
  expect(r.quarterTurns).toBe(1);
});

test("rotate wraps around", () => {
  let s = initialViewState();
  s = rotateRight(s); // 1
  s = rotateRight(s); // 2
  s = rotateRight(s); // 3
  s = rotateRight(s); // 0
  expect(s.quarterTurns).toBe(0);
});

test("flipHorizontal toggles", () => {
  const s = initialViewState();
  expect(flipHorizontal(s).flipX).toBe(true);
  expect(flipHorizontal(flipHorizontal(s)).flipX).toBe(false);
});

test("flipVertical toggles", () => {
  const s = initialViewState();
  expect(flipVertical(s).flipY).toBe(true);
  expect(flipVertical(flipVertical(s)).flipY).toBe(false);
});

test("displayScale shows Fit when in fit mode without geometry", () => {
  const s = initialViewState();
  expect(displayScale(s)).toBe("Fit");
});

test("displayScale shows Fit (pct%) when geometry is available", () => {
  const s = initialViewState();
  const geo: ViewGeometry = { imageW: 1920, imageH: 1080, viewportW: 960, viewportH: 640 };
  expect(displayScale(s, geo)).toBe("Fit (49%)");
});

test("displayScale shows percentage in manual mode", () => {
  const s = { ...initialViewState(), mode: "manual" as const, scale: 1.5 };
  expect(displayScale(s)).toBe("150%");
});

test("view state mutations are immutable", () => {
  const s = initialViewState();
  const z = zoomIn(s);
  expect(s.scale).toBe(1.0); // original unchanged
  expect(z.scale).toBeGreaterThan(1.0);
  const p = panDelta(s, 10, 10);
  expect(s.panX).toBe(0); // original unchanged
  expect(p.panX).toBe(10);
});

function key(over: Partial<PublicationViewKey> = {}): PublicationViewKey {
  return {
    browseIndex: 0,
    name: "a",
    resourceWidth: 100,
    resourceHeight: 80,
    fullResolution: true,
    ...over,
  };
}

test("reconcile: navigation (browse index change) resets view", () => {
  expect(reconcileViewForPublication(key({ browseIndex: 0 }), key({ browseIndex: 1 }))).toBe("reset");
  expect(reconcileViewForPublication(key({ name: "a" }), key({ name: "b" }))).toBe("reset");
});

test("reconcile: refresh same identity + geometry preserves view", () => {
  const a = key({ browseIndex: 1, name: "b" });
  expect(reconcileViewForPublication(a, { ...a })).toBe("preserve");
});

test("reconcile: refresh with changed geometry revalidates", () => {
  const a = key({ resourceWidth: 100, resourceHeight: 80 });
  const b = key({ resourceWidth: 200, resourceHeight: 160 });
  expect(reconcileViewForPublication(a, b)).toBe("revalidate");
  expect(reconcileViewForPublication(a, key({ fullResolution: false }))).toBe("revalidate");
});

test("reconcile: first publication resets; no next preserves", () => {
  expect(reconcileViewForPublication(null, key())).toBe("reset");
  expect(reconcileViewForPublication(key(), null)).toBe("preserve");
});

test("publicationViewKeyFrom maps observer facets", () => {
  const k = publicationViewKeyFrom({
    publication: {
      resourceWidth: 640,
      resourceHeight: 480,
      fullResolution: true,
      name: "photo",
    },
    browse: { index: 2 },
  });
  expect(k).toEqual({
    browseIndex: 2,
    name: "photo",
    resourceWidth: 640,
    resourceHeight: 480,
    fullResolution: true,
  });
  expect(
    publicationViewKeyFrom({ publication: null, browse: { index: 0 } }),
  ).toBeNull();
});

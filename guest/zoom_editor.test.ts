import { test, expect } from "bun:test";
import {
  applyZoomEditorKey,
  beginZoomEdit,
  ZOOM_EDITOR_IDLE,
  type ZoomEditorState,
} from "./zoom_editor.ts";
import { keyboardIntent, type KeyboardFlags } from "./keyboard.ts";
import {
  MIN_PRODUCT_ZOOM,
  MAX_PRODUCT_ZOOM,
  parseZoomPercent,
  setProductZoom,
  actualSize,
  fitView,
  flipHorizontal,
  IDENTITY_ORIENTATION,
  initialViewTransform,
  rotateRight,
  zoomEditBuffer,
  zoomIn,
  zoomOut,
  zoomLabel,
  viewportToUserImage,
  type ImageViewport,
  type OrientedImage,
  type ViewTransform,
} from "./view_transform.ts";

const vp: ImageViewport = { x: 0, y: 100, width: 960, height: 512 };
const landscape: OrientedImage = { width: 1920, height: 1080 };
const full = { fullResolution: true, hasImage: true };

const flagsWithImage: KeyboardFlags = {
  ctrl: false,
  canPrevious: true,
  canNext: true,
  canRefresh: true,
  canImage: true,
  can100: true,
};

function parseOk(raw: string) {
  const p = parseZoomPercent(raw);
  return p.ok ? { ok: true as const, productZoom: p.productZoom } : { ok: false as const };
}

function feed(state: ZoomEditorState, keys: string[]) {
  let s = state;
  let last: ReturnType<typeof applyZoomEditorKey> | null = null;
  for (const k of keys) {
    last = applyZoomEditorKey(s, k, parseOk);
    s = last.next;
  }
  return { state: s, last };
}

// --- ZOOM PARSING ------------------------------------------------------------

test("parseZoomPercent accepts exact product percents", () => {
  const cases: Array<[string, number]> = [
    ["6.25", 0.0625],
    ["8.33", 0.0833],
    ["33.3", 0.333],
    ["85", 0.85],
    ["100", 1],
    ["127.5", 1.275],
    ["200", 2],
    ["1600", 16],
  ];
  for (const [raw, z] of cases) {
    const r = parseZoomPercent(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.productZoom).toBeCloseTo(z, 10);
    }
  }
  // optional trailing %
  const withPct = parseZoomPercent("127.5%");
  expect(withPct.ok).toBe(true);
  if (withPct.ok) expect(withPct.productZoom).toBeCloseTo(1.275, 10);
});

test("parseZoomPercent rejects empty / invalid / out-of-range / NaN-like", () => {
  expect(parseZoomPercent("")).toEqual({ ok: false, reason: "empty" });
  expect(parseZoomPercent("   ")).toEqual({ ok: false, reason: "empty" });
  expect(parseZoomPercent("abc")).toEqual({ ok: false, reason: "invalid" });
  expect(parseZoomPercent("1e5")).toEqual({ ok: false, reason: "invalid" });
  expect(parseZoomPercent("Infinity")).toEqual({ ok: false, reason: "invalid" });
  expect(parseZoomPercent("NaN")).toEqual({ ok: false, reason: "invalid" });
  expect(parseZoomPercent("-85")).toEqual({ ok: false, reason: "invalid" });
  expect(parseZoomPercent("+85")).toEqual({ ok: false, reason: "invalid" });
  expect(parseZoomPercent("1.2.3")).toEqual({ ok: false, reason: "invalid" });
  expect(parseZoomPercent("6.24")).toEqual({
    ok: false,
    reason: "out-of-range",
  });
  expect(parseZoomPercent("1600.01")).toEqual({
    ok: false,
    reason: "out-of-range",
  });
  expect(parseZoomPercent("0")).toEqual({ ok: false, reason: "out-of-range" });
});

// --- ZOOM COMMIT -------------------------------------------------------------

test("setProductZoom commits exact productZoom in manual mode", () => {
  const fit = fitView(landscape, vp, initialViewTransform(1));
  const next = setProductZoom(landscape, vp, fit, 1.275);
  expect(next.mode).toBe("manual");
  expect(next.productZoom).toBeCloseTo(1.275, 12);
  expect(next.orientation).toEqual(fit.orientation);
});

test("setProductZoom does not snap to ZOOM_STEPS", () => {
  const s = actualSize(initialViewTransform(1));
  const next = setProductZoom(landscape, vp, s, 0.833);
  expect(next.productZoom).toBeCloseTo(0.833, 12);
  expect(next.productZoom).not.toBe(0.75);
  expect(next.productZoom).not.toBe(1.0);
});

test("setProductZoom preserves orientation under rotate/flip", () => {
  let s = initialViewTransform(1);
  s = { ...s, orientation: rotateRight(flipHorizontal(IDENTITY_ORIENTATION)) };
  const next = setProductZoom(landscape, vp, s, 2);
  expect(next.orientation).toEqual(s.orientation);
  expect(next.productZoom).toBe(2);
  expect(next.mode).toBe("manual");
});

test("setProductZoom clamps pan through existing geometry", () => {
  const s = setProductZoom(landscape, vp, initialViewTransform(1), 16);
  expect(s.productZoom).toBe(16);
  expect(Number.isFinite(s.panX)).toBe(true);
  expect(Number.isFinite(s.panY)).toBe(true);
  const outOfRange = setProductZoom(landscape, vp, initialViewTransform(1), 999);
  expect(outOfRange.productZoom).toBe(MAX_PRODUCT_ZOOM);
  const tooSmall = setProductZoom(landscape, vp, initialViewTransform(1), 0.001);
  expect(tooSmall.productZoom).toBe(MIN_PRODUCT_ZOOM);
});

test("center anchor: custom zoom keeps sample under viewport center", () => {
  const fit = fitView(landscape, vp, initialViewTransform(1));
  const panned = { ...fit, mode: "manual" as const, panX: 40, panY: -20 };
  const focusX = vp.x + vp.width / 2;
  const focusY = vp.y + vp.height / 2;
  const sampleBefore = viewportToUserImage(panned, vp, landscape, focusX, focusY);
  const next = setProductZoom(landscape, vp, panned, 1.5);
  expect(next.mode).toBe("manual");
  expect(next.productZoom).toBe(1.5);
  const sampleAfter = viewportToUserImage(next, vp, landscape, focusX, focusY);
  // Same image sample remains under viewport center (center-anchored exact zoom).
  expect(sampleAfter.x).toBeCloseTo(sampleBefore.x, 3);
  expect(sampleAfter.y).toBeCloseTo(sampleBefore.y, 3);
});

// --- DISPLAY FORMATTING ------------------------------------------------------

test("zoom labels preserve legitimate custom precision without float noise", () => {
  const mk = (z: number): ViewTransform => ({
    ...initialViewTransform(1),
    mode: "manual",
    productZoom: z,
  });
  expect(zoomLabel(mk(0.0625), full)).toBe("6.25%");
  expect(zoomLabel(mk(0.85), full)).toBe("85%");
  expect(zoomLabel(mk(1.275), full)).toBe("127.5%");
  expect(zoomLabel(mk(2), full)).toBe("200%");
  expect(zoomLabel(mk(16), full)).toBe("1600%");
  // noisy float must not surface
  expect(zoomLabel(mk(0.8499999997), full)).toBe("85%");
  expect(zoomEditBuffer(mk(0.0625))).toBe("6.25");
  expect(zoomEditBuffer(mk(1.275))).toBe("127.5");
});

test("proxy labels stay truthful after custom manual commit", () => {
  const s = setProductZoom(landscape, vp, initialViewTransform(1), 0.85);
  expect(zoomLabel(s, { fullResolution: false, hasImage: true })).toBe(
    "Proxy ×85%",
  );
  const at1 = setProductZoom(landscape, vp, initialViewTransform(1), 1);
  expect(zoomLabel(at1, { fullResolution: false, hasImage: true })).toBe(
    "Proxy",
  );
});

test("Fit label remains Fit · N%", () => {
  const fit = fitView(landscape, vp, initialViewTransform(1));
  const label = zoomLabel(fit, full);
  expect(label.startsWith("Fit · ")).toBe(true);
});

// --- KEYBOARD OWNERSHIP ------------------------------------------------------

test("edit-mode captures typing 100 / 125 / 1600 before keyboardIntent", () => {
  // Digits that WOULD map to product shortcuts if not captured:
  // "1"→1:1, "0"→Fit. Editor must consume them first regardless.
  for (const digits of ["100", "125", "1600"]) {
    let editor = beginZoomEdit("");
    for (const d of digits) {
      const r = applyZoomEditorKey(editor, d, parseOk);
      expect(r.action).toBe("consume");
      editor = r.next;
    }
    expect(editor.buffer).toBe(digits);
  }
  // Explicit ownership proof for the dangerous keys:
  let editor = beginZoomEdit("");
  for (const k of ["1", "0", "0"]) {
    expect(keyboardIntent(k, flagsWithImage)).not.toBeNull();
    const r = applyZoomEditorKey(editor, k, parseOk);
    expect(r.action).toBe("consume");
    expect(r.action).not.toBe("ignore");
    editor = r.next;
  }
  expect(editor.buffer).toBe("100");
});

test("edit-mode captures + / - without leaking zoom shortcuts", () => {
  let editor = beginZoomEdit("100");
  expect(keyboardIntent("+", flagsWithImage)).toBe("zoomIn");
  expect(keyboardIntent("-", flagsWithImage)).toBe("zoomOut");
  const plus = applyZoomEditorKey(editor, "+", parseOk);
  expect(plus.action).toBe("consume");
  const minus = applyZoomEditorKey(editor, "-", parseOk);
  expect(minus.action).toBe("consume");
  expect(plus.next.buffer).toBe("100");
});

test("Enter commits exact productZoom and leaves edit mode", () => {
  const { state, last } = feed(beginZoomEdit(""), [
    "1",
    "2",
    "7",
    ".",
    "5",
    "enter",
  ]);
  expect(last?.action).toBe("commit");
  expect(last?.productZoom).toBeCloseTo(1.275, 12);
  expect(state.active).toBe(false);
});

test("Escape cancels without mutating productZoom path", () => {
  const { state, last } = feed(beginZoomEdit("85"), ["escape"]);
  expect(last?.action).toBe("cancel");
  expect(state).toEqual(ZOOM_EDITOR_IDLE);
});

test("invalid / empty Enter remains in edit mode", () => {
  const empty = applyZoomEditorKey(beginZoomEdit(""), "enter", parseOk);
  expect(empty.action).toBe("invalid");
  expect(empty.next.active).toBe(true);
  const garbage = applyZoomEditorKey(beginZoomEdit("abc"), "enter", parseOk);
  // buffer starts as "abc" only if caller put it there; digits path never does
  expect(garbage.action).toBe("invalid");
  expect(garbage.next.active).toBe(true);
});

test("backspace edits the buffer; '%' is ignored", () => {
  const { state } = feed(beginZoomEdit("127.5"), ["backspace", "%", "0"]);
  expect(state.buffer).toBe("127.0");
});

test("not editing → applyZoomEditorKey is ignore (keyboardIntent resumes)", () => {
  const r = applyZoomEditorKey(ZOOM_EDITOR_IDLE, "1", parseOk);
  expect(r.action).toBe("ignore");
  expect(keyboardIntent("0", flagsWithImage)).toBe("fit");
  expect(keyboardIntent("1", flagsWithImage)).toBe("oneToOne");
});

// --- REGRESSION: discrete steps / labels -------------------------------------

test("discrete ZOOM_STEPS via +/- remain unchanged after custom zoom", () => {
  const fit = fitView(landscape, vp, initialViewTransform(1));
  const custom = setProductZoom(landscape, vp, fit, 1.275);
  const up = zoomIn(landscape, vp, custom);
  const down = zoomOut(landscape, vp, up);
  expect(up.mode).toBe("manual");
  expect(up.productZoom).toBeGreaterThan(1.275);
  expect(down.productZoom).toBeLessThan(up.productZoom);
  // 1:1 gate / actualSize still exact 1.0
  expect(actualSize(custom).productZoom).toBe(1);
});

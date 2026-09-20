import { test, expect } from "bun:test";
import {
  createPointerPress,
  IDLE_GESTURE,
  classifyGestureOwner,
  nextHeldGesture,
  pointerCoords,
  type HeldGesture,
} from "./pointer_press.ts";

function harness(hits: Record<string, object>) {
  const pressed: unknown[] = [];
  const active: unknown[] = [];
  const cleared: number[] = [];
  const pointer = createPointerPress({
    hit: (x, _y) => hits[String(x)] ?? null,
    active: (n) => active.push(n),
    press: (n) => pressed.push(n),
    clearActive: () => cleared.push(1),
  });
  return { pointer, pressed, active, cleared };
}

test("down+up on the same focusable fires onPress once", () => {
  const btn = { id: "btn" };
  const h = harness({ "10": btn });
  h.pointer.update({ x: 10, y: 5, down: true });
  h.pointer.update({ x: 10, y: 5, down: false });
  expect(h.pressed).toEqual([btn]);
});

test("drag off the control cancels the press", () => {
  const btn = { id: "btn" };
  const h = harness({ "10": btn });
  h.pointer.update({ x: 10, y: 5, down: true });
  h.pointer.update({ x: 99, y: 5, down: false });
  expect(h.pressed).toEqual([]);
});

test("host cancel packet must not fire onPress even if still over the control", () => {
  const btn = { id: "btn" };
  const h = harness({ "10": btn });
  h.pointer.update({ x: 10, y: 5, down: true });
  expect(h.pointer.owner()).toBe(btn);
  // Focused(false) style cancel at the same position — not a release.
  h.pointer.update({ x: 10, y: 5, down: false, cancel: true });
  expect(h.pressed).toEqual([]);
  expect(h.pointer.owner()).toBeNull();
});

test("release outside window after down-on-button still cancels via cancel()", () => {
  const btn = { id: "btn" };
  const h = harness({ "10": btn });
  h.pointer.update({ x: 10, y: 5, down: true });
  expect(h.pointer.owner()).toBe(btn);
  h.pointer.cancel();
  expect(h.pointer.owner()).toBeNull();
  // A late release must not press.
  h.pointer.update({ x: 10, y: 5, down: false });
  expect(h.pressed).toEqual([]);
});

test("down on empty canvas never claims a press owner", () => {
  const h = harness({});
  const claimed = h.pointer.update({ x: 50, y: 200, down: true });
  expect(claimed).toBe(false);
  h.pointer.update({ x: 50, y: 200, down: false });
  expect(h.pressed).toEqual([]);
});

test("host Focused(false) style cancel after down leaves no stuck owner", () => {
  const btn = { id: "btn" };
  const h = harness({ "10": btn });
  h.pointer.update({ x: 10, y: 5, down: true });
  h.pointer.cancel();
  // Next click is a fresh gesture.
  h.pointer.update({ x: 10, y: 5, down: true });
  h.pointer.update({ x: 10, y: 5, down: false });
  expect(h.pressed).toEqual([btn]);
});

// --- PR61-CORRECTIVE-1 MAJOR-C: frozen gesture ownership ---------------------

function runGesture(
  packets: Array<{
    down: boolean;
    cancel?: boolean;
    claimedFocusable: boolean;
    inImageViewport: boolean;
    canImage?: boolean;
  }>,
): { owners: string[]; final: HeldGesture } {
  let g = IDLE_GESTURE;
  const owners: string[] = [];
  for (const p of packets) {
    g = nextHeldGesture(g, { down: p.down, cancel: p.cancel }, () =>
      classifyGestureOwner({
        claimedFocusable: p.claimedFocusable,
        inImageViewport: p.inImageViewport,
        canImage: p.canImage !== false,
      }),
    );
    owners.push(g.owner);
  }
  return { owners, final: g };
}

test("classify: focusable wins over canvas", () => {
  expect(
    classifyGestureOwner({
      claimedFocusable: true,
      inImageViewport: true,
      canImage: true,
    }),
  ).toBe("toolbar");
});

test("classify: canvas only when no focusable and inside image viewport", () => {
  expect(
    classifyGestureOwner({
      claimedFocusable: false,
      inImageViewport: true,
      canImage: true,
    }),
  ).toBe("canvas");
  expect(
    classifyGestureOwner({
      claimedFocusable: false,
      inImageViewport: false,
      canImage: true,
    }),
  ).toBe("none");
  expect(
    classifyGestureOwner({
      claimedFocusable: false,
      inImageViewport: true,
      canImage: false,
    }),
  ).toBe("none");
});

test("C1 toolbar down → move into canvas while held never becomes canvas", () => {
  const { owners, final } = runGesture([
    { down: true, claimedFocusable: true, inImageViewport: false },
    { down: true, claimedFocusable: false, inImageViewport: true },
    { down: true, claimedFocusable: false, inImageViewport: true },
    { down: false, claimedFocusable: false, inImageViewport: true },
  ]);
  expect(owners).toEqual(["toolbar", "toolbar", "toolbar", "none"]);
  expect(final.owner).toBe("none");
});

test("C2 toolbar same-control click stays toolbar then clears", () => {
  const { owners } = runGesture([
    { down: true, claimedFocusable: true, inImageViewport: false },
    { down: false, claimedFocusable: true, inImageViewport: false },
  ]);
  expect(owners).toEqual(["toolbar", "none"]);
});

test("C3 toolbar move away/return keeps original owner", () => {
  const { owners } = runGesture([
    { down: true, claimedFocusable: true, inImageViewport: false },
    { down: true, claimedFocusable: false, inImageViewport: false },
    { down: true, claimedFocusable: true, inImageViewport: false },
    { down: false, claimedFocusable: true, inImageViewport: false },
  ]);
  expect(owners).toEqual(["toolbar", "toolbar", "toolbar", "none"]);
});

test("C4 canvas down → drag over toolbar does not become toolbar", () => {
  const { owners } = runGesture([
    { down: true, claimedFocusable: false, inImageViewport: true },
    { down: true, claimedFocusable: true, inImageViewport: false },
    { down: true, claimedFocusable: true, inImageViewport: false },
    { down: false, claimedFocusable: true, inImageViewport: false },
  ]);
  expect(owners).toEqual(["canvas", "canvas", "canvas", "none"]);
});

test("C5 none → move into canvas while held does not start canvas", () => {
  const { owners } = runGesture([
    { down: true, claimedFocusable: false, inImageViewport: false },
    { down: true, claimedFocusable: false, inImageViewport: true },
    { down: false, claimedFocusable: false, inImageViewport: true },
  ]);
  expect(owners).toEqual(["none", "none", "none"]);
});

test("C6 cancel clears toolbar owner without activation path", () => {
  const { owners, final } = runGesture([
    { down: true, claimedFocusable: true, inImageViewport: false },
    { down: false, cancel: true, claimedFocusable: true, inImageViewport: false },
    // Late physical release must not resurrect the owner.
    { down: false, claimedFocusable: true, inImageViewport: false },
  ]);
  expect(owners).toEqual(["toolbar", "none", "none"]);
  expect(final.owner).toBe("none");
});

test("C7 cancel clears canvas owner; no ghost pan after return", () => {
  const { owners, final } = runGesture([
    { down: true, claimedFocusable: false, inImageViewport: true },
    { down: true, claimedFocusable: false, inImageViewport: true },
    { down: false, cancel: true, claimedFocusable: false, inImageViewport: true },
    { down: true, claimedFocusable: false, inImageViewport: true },
  ]);
  // Cancel dropped the gesture; the later down is a FRESH edge (canvas again
  // is allowed — it is not a transfer of the cancelled owner).
  expect(owners).toEqual(["canvas", "canvas", "none", "canvas"]);
  expect(final.owner).toBe("canvas");
});

test("held packets never call classify again after down edge", () => {
  let classifyCalls = 0;
  let g: HeldGesture = IDLE_GESTURE;
  g = nextHeldGesture(g, { down: true }, () => {
    classifyCalls += 1;
    return "toolbar";
  });
  for (let i = 0; i < 5; i++) {
    g = nextHeldGesture(g, { down: true }, () => {
      classifyCalls += 1;
      return "canvas";
    });
  }
  expect(classifyCalls).toBe(1);
  expect(g.owner).toBe("toolbar");
});

// --- malformed pointer coordinates never fabricate truth (C4) ------------

test("pointerCoords: well-formed coordinates pass through", () => {
  expect(pointerCoords({ x: 12, y: 34 })).toEqual({ x: 12, y: 34 });
  expect(pointerCoords({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
});

test("pointerCoords: malformed packets yield null, never a (0,0) pointer", () => {
  expect(pointerCoords({})).toBeNull();
  expect(pointerCoords({ x: 5 })).toBeNull();
  expect(pointerCoords({ y: 5 })).toBeNull();
  expect(pointerCoords({ x: "5", y: 5 })).toBeNull();
  expect(pointerCoords({ x: NaN, y: 5 })).toBeNull();
  expect(pointerCoords({ x: Infinity, y: 5 })).toBeNull();
  expect(pointerCoords({ x: null, y: null })).toBeNull();
});

test("a real (0,0) pointer stays distinguishable from a malformed packet", () => {
  // The guard rejects MISSING/invalid data, not the origin: a host that
  // genuinely reports (0,0) is still a known pointer.
  const real = pointerCoords({ x: 0, y: 0 });
  const malformed = pointerCoords({ y: 0 });
  expect(real).not.toBeNull();
  expect(malformed).toBeNull();
});

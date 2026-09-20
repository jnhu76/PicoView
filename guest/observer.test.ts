// Observer reducer tests (PICOVIEW-LAST-GOOD-PUBLICATION-1 §19
// + PICOVIEW-REAL-VIEWER-TRAIN-1 capability truth).
//
// These drive the pure guest observation state machine through the same
// event sequences the native side emits. Run: `bun test guest/`.
// The native CurrentItem stays the publication authority; these tests pin
// the observer's preserve-vs-replace policy only.
import { expect, test } from "bun:test";
import {
  DEFAULT_WHEEL_NOTCH,
  displayVerdict,
  initialObserverState,
  reduceObserver,
  type ObserverState,
} from "./observer.ts";

function ready(g: number, handle: number, sw: number, sh: number, rw?: number, rh?: number, name = "a.jpg") {
  const resourceW = rw ?? sw;
  const resourceH = rh ?? sh;
  return {
    t: "current-item",
    status: "ready",
    g,
    handle,
    sourceWidth: sw,
    sourceHeight: sh,
    resourceWidth: resourceW,
    resourceHeight: resourceH,
    fullResolution: sw === resourceW && sh === resourceH,
    name,
  };
}
function loading(g: number, intent: "new-item" | "refresh", name = "b.jpg") {
  return { t: "current-item", status: "loading", g, intent, name };
}
function error(g: number, intent: "new-item" | "refresh", errorMsg = "could not decode image") {
  return { t: "current-item", status: "error", g, intent, error: errorMsg };
}

function fold(...events: ReturnType<typeof ready | typeof loading | typeof error>[]): ObserverState {
  let state = initialObserverState();
  for (const v of events) state = reduceObserver(state, v);
  return state;
}

test("initial open success publishes and clears the request", () => {
  const s = fold(loading(1, "new-item", "a.jpg"), ready(1, 11, 1920, 1080));
  expect(s.publication).toMatchObject({
    handle: 11,
    sourceWidth: 1920,
    sourceHeight: 1080,
    resourceWidth: 1920,
    resourceHeight: 1080,
    generation: 1,
    fullResolution: true,
  });
  expect(s.request).toBeNull();
  expect(displayVerdict(s)).toBe("image");
});

test("initial open failure leaves no publication", () => {
  const s = fold(loading(1, "new-item"), error(1, "new-item"));
  expect(s.publication).toBeNull();
  expect(s.request).toMatchObject({ status: "error", intent: "new-item" });
  expect(displayVerdict(s)).toBe("error");
});

test("refresh loading keeps the last-good publication visible", () => {
  // READY(A) + REFRESH_LOADING(B): A keeps rendering; the refresh surfaces
  // as an indicator, never as a displaced main content.
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "refresh"));
  expect(s.publication).toMatchObject({ handle: 11 });
  expect(s.request).toMatchObject({ status: "loading", intent: "refresh" });
  expect(displayVerdict(s)).toBe("image");
});

test("refresh error keeps the last-good publication and stays observable", () => {
  // READY(A) + REFRESH_LOADING(B) + REFRESH_ERROR(B): A still renders, the
  // failure remains observable.
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "refresh"), error(2, "refresh"));
  expect(s.publication).toMatchObject({ handle: 11, sourceWidth: 1920 });
  expect(s.request).toMatchObject({ status: "error", intent: "refresh", error: "could not decode image" });
  expect(displayVerdict(s)).toBe("image");
});

test("refresh success switches the publication to the candidate", () => {
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "refresh"), ready(2, 22, 640, 480, 640, 480, "b.jpg"));
  expect(s.publication).toMatchObject({
    handle: 22,
    sourceWidth: 640,
    sourceHeight: 480,
    resourceWidth: 640,
    resourceHeight: 480,
    generation: 2,
    fullResolution: true,
  });
  expect(s.request).toBeNull();
  expect(displayVerdict(s)).toBe("image");
});

test("new-item failure deliberately publishes the error item, not last-good", () => {
  // PRD §2.10: corrupt NEW item navigation is intentionally different from
  // refresh — the previous image is NOT preserved.
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "new-item"), error(2, "new-item"));
  expect(s.publication).toBeNull();
  expect(s.request).toMatchObject({ status: "error", intent: "new-item" });
  expect(displayVerdict(s)).toBe("error");
});

test("new-item loading displaces the previous image while opening", () => {
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "new-item"));
  expect(displayVerdict(s)).toBe("loading");
  // The native resource is still live at this point (retire happens at
  // publish); the observer keeps it but the view policy hides it.
  expect(s.publication).toMatchObject({ handle: 11 });
});

test("stale generations never win", () => {
  const s = fold(ready(5, 55, 100, 100), ready(4, 44, 200, 200), error(4, "refresh"), loading(5, "new-item"));
  expect(s.publication).toMatchObject({ handle: 55 });
  // g=5 loading is not stale (equal to seenGeneration is stale too — the
  // native side never repeats a generation, so only strictly newer g wins).
  expect(displayVerdict(s)).toBe("image");
  const newer = reduceObserver(s, ready(6, 66, 300, 300));
  expect(newer.publication).toMatchObject({ handle: 66 });
});

test("unknown intent narrows to new-item so preservation stays deliberate", () => {
  const s = fold(ready(1, 11, 100, 100), error(2, "corrupted-intent" as never));
  expect(s.publication).toBeNull();
  expect(displayVerdict(s)).toBe("error");
});

test("publication carries no view-binding mechanics", () => {
  // The Product observer state answers only "what is the final observed
  // publication" — how a mounted Image re-resolves that handle is
  // rendering realization (guest/binding.ts, CORRECTIVE-2).
  const s = fold(ready(1, 11, 100, 100));
  expect(s.publication).not.toHaveProperty("bindSlot");
  expect(s).not.toHaveProperty("nextBindSlot");
});

test("several ready events in one turn collapse to the final publication", () => {
  // The guest drains a whole svc batch per turn; only the LAST publication
  // the turn observed can become a rendered binding. The reducer must not
  // encode any per-event ordering machinery for that.
  const s = fold(ready(1, 11, 100, 100), ready(2, 22, 200, 200), ready(3, 33, 300, 300));
  expect(s.publication).toMatchObject({ generation: 3, handle: 33 });
  expect(s.request).toBeNull();
  expect(displayVerdict(s)).toBe("image");
});

test("viewport events update fit input without touching publication", () => {
  let s = reduceObserver(initialObserverState(), { t: "hello", w: 960, h: 640 });
  expect(s.viewport).toEqual({ w: 960, h: 640, dpi: 1, notch: DEFAULT_WHEEL_NOTCH });
  s = reduceObserver(s, ready(1, 11, 1920, 1080));
  expect(s.viewport).toEqual({ w: 960, h: 640, dpi: 1, notch: DEFAULT_WHEEL_NOTCH });
  s = reduceObserver(s, { t: "resize", w: 1280, h: 720, scale: 1.5 });
  expect(s.viewport).toEqual({ w: 1280, h: 720, dpi: 1.5, notch: DEFAULT_WHEEL_NOTCH });
  expect(s.publication).toMatchObject({ handle: 11 });
});

test("malformed and foreign lines are ignored", () => {
  const state = initialObserverState();
  expect(reduceObserver(state, { t: "something-else" })).toBe(state);
  expect(reduceObserver(state, { t: "current-item" })).toBe(state);
  expect(reduceObserver(state, { t: "current-item", g: "nope" })).toBe(state);
});

// --- Capability truth tests (REAL-VIEWER-TRAIN-1) ---

test("ordinary image reports fullResolution true when source == resource", () => {
  const s = fold(ready(1, 11, 1920, 1080));
  expect(s.publication).toMatchObject({
    sourceWidth: 1920,
    sourceHeight: 1080,
    resourceWidth: 1920,
    resourceHeight: 1080,
    fullResolution: true,
  });
});

test("giant proxy reports fullResolution false when source != resource", () => {
  const s = fold(ready(1, 11, 20000, 100, 8192, 41));
  expect(s.publication).toMatchObject({
    sourceWidth: 20000,
    sourceHeight: 100,
    resourceWidth: 8192,
    resourceHeight: 41,
    fullResolution: false,
  });
});

// --- Browse state tests (REAL-VIEWER-TRAIN-1) ---

test("browse state is updated from svc events", () => {
  let s = reduceObserver(initialObserverState(), {
    t: "current-item",
    status: "ready",
    g: 1,
    handle: 11,
    sourceWidth: 100,
    sourceHeight: 100,
    resourceWidth: 100,
    resourceHeight: 100,
    fullResolution: true,
    browseIndex: 2,
    browseCount: 17,
    canPrevious: true,
    canNext: true,
  });
  expect(s.browse).toMatchObject({
    index: 2,
    count: 17,
    canPrevious: true,
    canNext: true,
  });
});

test("browse state persists across events", () => {
  let s = reduceObserver(initialObserverState(), {
    t: "current-item",
    status: "loading",
    g: 1,
    intent: "new-item",
    browseIndex: 5,
    browseCount: 10,
    canPrevious: true,
    canNext: false,
  });
  expect(s.browse).toMatchObject({ index: 5, count: 10, canPrevious: true, canNext: false });
  // A ready event without browse fields should preserve previous browse state.
  s = reduceObserver(s, ready(1, 11, 100, 100));
  expect(s.browse).toMatchObject({ index: 5, count: 10, canPrevious: true, canNext: false });
});

test("browse state updates when navigation changes it", () => {
  let s = reduceObserver(initialObserverState(), {
    t: "current-item",
    status: "ready",
    g: 1,
    handle: 11,
    sourceWidth: 100,
    sourceHeight: 100,
    resourceWidth: 100,
    resourceHeight: 100,
    fullResolution: true,
    browseIndex: 0,
    browseCount: 5,
    canPrevious: false,
    canNext: true,
  });
  expect(s.browse.canPrevious).toBe(false);
  // Simulate Next navigation — new browse state with updated index.
  s = reduceObserver(s, {
    t: "current-item",
    status: "loading",
    g: 2,
    intent: "new-item",
    browseIndex: 1,
    browseCount: 5,
    canPrevious: true,
    canNext: true,
  });
  expect(s.browse).toMatchObject({ index: 1, count: 5, canPrevious: true, canNext: true });
});

// --- Refresh status facet (post-release normalization C1) -----------------
// PRD §2.10 keeps the last-good publication in the main content during a
// refresh, so the request state must surface in the status area instead.
// These tests pin the pure facet selector the status bar renders.

import { refreshStatus } from "./observer.ts";

test("refresh loading surfaces a visible status facet beside the publication", () => {
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "refresh"));
  expect(displayVerdict(s)).toBe("image"); // main content stays the image
  const facet = refreshStatus(s);
  expect(facet).not.toBeNull();
  expect(facet!.kind).toBe("loading");
  expect(facet!.text).toContain("Refreshing");
  expect(facet!.text.length).toBeLessThanOrEqual(64);
});

test("refresh error surfaces a visible, meaningful, bounded failure facet", () => {
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "refresh"), error(2, "refresh"));
  expect(displayVerdict(s)).toBe("image");
  const facet = refreshStatus(s);
  expect(facet).not.toBeNull();
  expect(facet!.kind).toBe("error");
  expect(facet!.text).toContain("Refresh failed");
  expect(facet!.text).toContain("could not decode image");
  expect(facet!.text.length).toBeLessThanOrEqual(64);
});

test("refresh facet is bounded even for an oversized multiline host error", () => {
  const long = "x".repeat(500) + "\nsecond line must not leak into the status row";
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "refresh"), error(2, "refresh", long));
  const facet = refreshStatus(s);
  expect(facet).not.toBeNull();
  expect(facet!.text.length).toBeLessThanOrEqual(64);
  expect(facet!.text).not.toContain("second line");
  expect(facet!.text.endsWith("…")).toBe(true);
});

test("last-good publication identity survives refresh loading and error", () => {
  // One reduction chain: the publication object must be the SAME reference
  // through refresh loading and refresh error (binding stays active).
  let s = initialObserverState();
  s = reduceObserver(s, ready(1, 11, 1920, 1080));
  const published = s.publication;
  expect(published).not.toBeNull();
  s = reduceObserver(s, loading(2, "refresh"));
  expect(s.publication).toBe(published);
  s = reduceObserver(s, error(2, "refresh"));
  expect(s.publication).toBe(published);
});

test("refresh facet clears when the refresh completes (ready)", () => {
  const s = fold(ready(1, 11, 1920, 1080), loading(2, "refresh"), ready(2, 22, 640, 480, 640, 480, "b.jpg"));
  expect(s.request).toBeNull();
  expect(refreshStatus(s)).toBeNull();
});

test("new-item requests never produce a refresh facet (behavior unchanged)", () => {
  const loadingState = fold(loading(2, "new-item", "c.jpg"));
  expect(displayVerdict(loadingState)).toBe("loading");
  expect(refreshStatus(loadingState)).toBeNull();
  const errorState = fold(ready(1, 11, 1920, 1080), loading(2, "new-item"), error(2, "new-item"));
  expect(displayVerdict(errorState)).toBe("error");
  expect(refreshStatus(errorState)).toBeNull();
});

test("no request at all produces no facet", () => {
  expect(refreshStatus(initialObserverState())).toBeNull();
  const settled = fold(ready(1, 11, 1920, 1080));
  expect(refreshStatus(settled)).toBeNull();
});

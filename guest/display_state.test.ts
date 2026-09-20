// Display derivation authority tests (post-release normalization C4).
//
// The composition root's frame logic and render tree must consume the SAME
// derived display facts — these tests pin the single expression for each
// fact, including the canImage semantics whose frame/render copies had
// drifted (width>0 && height>0 vs width>0).
//
// Run: `bun test guest/display_state.test.ts`.
import { expect, test } from "bun:test";
import { initialObserverState, reduceObserver, type SvcLine } from "./observer.ts";
import { initialViewTransform } from "./view_transform.ts";
import { deriveDisplayState } from "./display_state.ts";
import { svcReady as ready } from "./test_support.ts";

function reduce(state: ReturnType<typeof initialObserverState>, line: SvcLine) {
  return reduceObserver(state, line);
}

test("published image derives canImage/can100 and geometry facts", () => {
  let s = initialObserverState();
  s = reduce(s, ready(1, 11, 1920, 1080));
  const d = deriveDisplayState(s, initialViewTransform());
  expect(d.verdict).toBe("image");
  expect(d.hasImage).toBe(true);
  expect(d.canImage).toBe(true);
  expect(d.can100).toBe(true);
  expect(d.img).toEqual({ width: 1920, height: 1080 });
  expect(d.shownName).toBe("a.jpg");
  expect(d.canRefresh).toBe(true);
  expect(d.dimText).toBe("1920 × 1080");
  expect(d.zoomText.length).toBeGreaterThan(0);
  expect(d.refreshFacet).toBeNull();
});

test("one canImage semantic: zero-height geometry cannot present an image", () => {
  // The retired render-side rule (width>0 only) would have allowed this
  // state; the single authority requires BOTH dimensions > 0.
  let s = initialObserverState();
  s = reduce(s, ready(1, 11, 100, 0, 100, 0));
  const d = deriveDisplayState(s, initialViewTransform());
  expect(d.verdict).toBe("image");
  expect(d.hasImage).toBe(false);
  expect(d.canImage).toBe(false);
});

test("one canImage semantic: zero-width geometry cannot present an image", () => {
  let s = initialObserverState();
  s = reduce(s, ready(1, 11, 0, 100, 0, 100));
  const d = deriveDisplayState(s, initialViewTransform());
  expect(d.hasImage).toBe(false);
  expect(d.canImage).toBe(false);
});

test("proxy admission keeps can100 false and flags the proxy text path", () => {
  let s = initialObserverState();
  s = reduce(s, ready(1, 11, 8000, 6000, 4096, 3072));
  const d = deriveDisplayState(s, initialViewTransform());
  expect(d.canImage).toBe(true);
  expect(d.can100).toBe(false);
  expect(d.dimText).toBe("8000 × 6000");
});

test("new-item loading/error derives the request name and empty position", () => {
  let s = initialObserverState();
  s = reduce(s, { t: "current-item", status: "loading", g: 2, intent: "new-item", name: "b.jpg" });
  let d = deriveDisplayState(s, initialViewTransform());
  expect(d.shownName).toBe("b.jpg");
  expect(d.canRefresh).toBe(true);
  expect(d.posText).toBe("");
  s = reduce(s, { t: "current-item", status: "error", g: 2, intent: "new-item", error: "nope" });
  d = deriveDisplayState(s, initialViewTransform());
  // The observer's error request carries no name, so shownName is undefined
  // exactly as the pre-derivation render logic produced.
  expect(d.shownName).toBeUndefined();
});

test("browse position derives index/count text", () => {
  let s = initialObserverState();
  s = reduce(s, ready(1, 11, 100, 100, 100, 100, "a.jpg"));
  // Browse facts ride on a request event of a fresh generation, like the
  // native side emits them.
  s = reduce(s, {
    t: "current-item",
    status: "loading",
    g: 2,
    intent: "refresh",
    browseIndex: 2,
    browseCount: 5,
    canPrevious: true,
    canNext: true,
  });
  const d = deriveDisplayState(s, initialViewTransform());
  expect(d.posText).toBe("3 / 5");
});

test("refresh facet flows through the derivation", () => {
  let s = initialObserverState();
  s = reduce(s, ready(1, 11, 100, 100));
  s = reduce(s, { t: "current-item", status: "loading", g: 2, intent: "refresh" });
  const d = deriveDisplayState(s, initialViewTransform());
  expect(d.refreshFacet).not.toBeNull();
  expect(d.refreshFacet!.kind).toBe("loading");
});

test("empty state derives no refresh capability and no texts", () => {
  const d = deriveDisplayState(initialObserverState(), initialViewTransform());
  expect(d.verdict).toBe("empty");
  expect(d.canImage).toBe(false);
  expect(d.canRefresh).toBe(false);
  expect(d.shownName).toBeUndefined();
  expect(d.dimText).toBe("");
  expect(d.posText).toBe("");
});

// Publication view reconciliation tests (post-release normalization C3).
//
// These prove the still-live contract only: how view intent reconciles when
// a Product publication is observed. The retired legacy view-state geometry
// (Fit ladder, zoom steps, pan clamp, rotate/flip precursors) is deleted,
// not ported — canonical geometry authority is guest/view_transform.ts and
// its own suite.
//
// Run: `bun test guest/publication_view.test.ts`.
import { expect, test } from "bun:test";
import {
  publicationViewKeyFrom,
  reconcileViewForPublication,
  type PublicationViewKey,
} from "./publication_view.ts";

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

import { test, expect } from "bun:test";
import {
  PRODUCT_MIN_CLIENT,
  SHELL_CHROME,
  chromeHeight,
  imageViewport,
  pointInImageViewport,
  wheelFocusPoint,
} from "./shell_layout.ts";

test("chrome height is sum of frozen parts", () => {
  expect(chromeHeight()).toBe(
    SHELL_CHROME.titleH + SHELL_CHROME.toolbarH + SHELL_CHROME.statusH,
  );
  expect(chromeHeight()).toBe(68);
});

test("product min client closes the fixed toolbar width contract", () => {
  // 8×36 + 2 GroupGap×8 + 9 gap-1×4 + px-2×2 = 288+16+36+16 = 356.
  const toolbarMinW = 8 * 36 + 2 * 8 + 9 * 4 + 2 * 8;
  expect(toolbarMinW).toBe(356);
  expect(PRODUCT_MIN_CLIENT.width).toBeGreaterThanOrEqual(toolbarMinW);
  expect(PRODUCT_MIN_CLIENT.height).toBeGreaterThan(chromeHeight());
  // PocketJS windows-app capability floor is 240×180 — product may exceed it.
  expect(PRODUCT_MIN_CLIENT.width).toBeGreaterThan(240);
  expect(PRODUCT_MIN_CLIENT.height).toBeGreaterThan(180);
});

test("image viewport at product min still has non-negative height", () => {
  const v = imageViewport(PRODUCT_MIN_CLIENT.width, PRODUCT_MIN_CLIENT.height);
  expect(v.width).toBe(384);
  expect(v.height).toBe(PRODUCT_MIN_CLIENT.height - chromeHeight());
  expect(v.height).toBeGreaterThan(0);
});

test("image viewport consumes full window minus chrome", () => {
  const v = imageViewport(960, 640);
  expect(v.x).toBe(0);
  expect(v.y).toBe(SHELL_CHROME.titleH + SHELL_CHROME.toolbarH);
  expect(v.width).toBe(960);
  expect(v.height).toBe(640 - chromeHeight());
});

test("tiny window never produces negative viewport", () => {
  const v = imageViewport(200, 50);
  expect(v.height).toBe(0);
  expect(v.width).toBe(200);
});

test("pointInImageViewport", () => {
  const v = imageViewport(960, 640);
  expect(pointInImageViewport(v, 10, v.y + 1)).toBe(true);
  expect(pointInImageViewport(v, 10, 10)).toBe(false);
  expect(pointInImageViewport(v, 10, v.y + v.height)).toBe(false);
});

// --- PR61-CORRECTIVE-1 MAJOR-B: wheel focus ---------------------------------

test("B1 persistent pointer inside canvas is the wheel anchor", () => {
  const v = imageViewport(960, 640);
  const focus = wheelFocusPoint(v, { x: 200, y: 180 + v.y, known: true });
  expect(focus.x).toBe(200);
  expect(focus.y).toBe(180 + v.y);
});

test("B2 same pointer keeps the same anchor across turns", () => {
  const v = imageViewport(960, 640);
  const pointer = { x: 700, y: 400 + v.y, known: true };
  const a = wheelFocusPoint(v, pointer);
  const b = wheelFocusPoint(v, pointer);
  const c = wheelFocusPoint(v, pointer);
  expect(a).toEqual(b);
  expect(b).toEqual(c);
});

test("B3 pointer over toolbar falls back to image-viewport center", () => {
  const v = imageViewport(960, 640);
  // y=20 is in the title/toolbar chrome, not the image viewport.
  const focus = wheelFocusPoint(v, { x: 80, y: 20, known: true });
  expect(focus.x).toBe(v.x + v.width / 2);
  expect(focus.y).toBe(v.y + v.height / 2);
});

test("B3b unknown pointer uses viewport center", () => {
  const v = imageViewport(960, 640);
  const focus = wheelFocusPoint(v, { x: 0, y: 0, known: false });
  expect(focus.x).toBe(v.x + v.width / 2);
  expect(focus.y).toBe(v.y + v.height / 2);
});

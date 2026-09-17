import { test, expect } from "bun:test";
import {
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
  expect(chromeHeight()).toBe(128);
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

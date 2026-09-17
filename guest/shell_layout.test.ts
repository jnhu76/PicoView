import { test, expect } from "bun:test";
import {
  SHELL_CHROME,
  chromeHeight,
  imageViewport,
  pointInImageViewport,
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

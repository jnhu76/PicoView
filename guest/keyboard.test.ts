import { test, expect } from "bun:test";
import { keyboardIntent, type KeyboardFlags } from "./keyboard.ts";

const none: KeyboardFlags = {
  ctrl: false,
  canPrevious: false,
  canNext: false,
  canRefresh: false,
  canImage: false,
  can100: false,
};

test("zoom keys are no-ops without an image", () => {
  for (const k of ["0", "1", "+", "=", "-"]) {
    expect(keyboardIntent(k, none)).toBeNull();
  }
});

test("fit and zoom require canImage", () => {
  const withImage: KeyboardFlags = { ...none, canImage: true };
  expect(keyboardIntent("0", withImage)).toBe("fit");
  expect(keyboardIntent("+", withImage)).toBe("zoomIn");
  expect(keyboardIntent("=", withImage)).toBe("zoomIn");
  expect(keyboardIntent("-", withImage)).toBe("zoomOut");
});

test("1:1 requires canImage and fullResolution", () => {
  expect(keyboardIntent("1", { ...none, canImage: true })).toBeNull();
  expect(keyboardIntent("1", { ...none, canImage: true, can100: true })).toBe(
    "oneToOne",
  );
});

test("navigation and refresh stay gated independently of zoom", () => {
  expect(keyboardIntent("left", { ...none, canPrevious: true })).toBe("previous");
  expect(keyboardIntent("right", { ...none, canNext: true })).toBe("next");
  expect(keyboardIntent("f5", { ...none, canRefresh: true })).toBe("refresh");
  expect(keyboardIntent("r", { ...none, canRefresh: true })).toBe("refresh");
  expect(keyboardIntent("o", { ...none, ctrl: true })).toBe("open");
});

test("ctrl+r is not refresh", () => {
  expect(
    keyboardIntent("r", { ...none, canRefresh: true, ctrl: true }),
  ).toBeNull();
});

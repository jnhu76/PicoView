import { test, expect } from "bun:test";
import { createPointerPress } from "./pointer_press.ts";

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

// Desktop mouse → PocketJS onPress (Corrective-2 MAJOR-2).
//
// Stock desktop host (and PicoView's Windows host) forward CursorMoved /
// MouseInput as svc `mouse` lines. That is enough for the guest to drag-pan
// the canvas, but it is NOT the framework onPress authority: onPress fires
// from CIRCLE on the focused node, from touch activation, or from
// `pressNode()` after a pointer hit-test (framework/desktop-pointer.ts).
//
// This module is the thin guest-side wiring: feed each mouse packet through
// hitFocusable / pressNode so toolbar ToolButtons work with a real mouse.
// Pure state + injected authority — unit-testable without the framework.

export type PointerHit = {
  x: number;
  y: number;
  down: boolean;
};

export interface PointerPressAuthority {
  /** Nearest focusable at (x,y), or null. */
  hit(x: number, y: number): unknown;
  /** Focus + arm the node (pressed look). */
  active(node: unknown): void;
  /** Fire onPress of the node. */
  press(node: unknown): void;
  /** Clear active/focus-side press visual. */
  clearActive(): void;
}

export interface PointerPressController {
  /** One mouse packet. Returns true when this packet claimed a press owner. */
  update(e: PointerHit): boolean;
  /** Drop in-progress press (focus loss / host cancel). */
  cancel(): void;
  /** Current press owner (for tests). */
  owner(): unknown;
}

export function createPointerPress(
  authority: PointerPressAuthority,
): PointerPressController {
  let owner: unknown = null;
  let down = false;
  return {
    update(e: PointerHit): boolean {
      const hit = authority.hit(e.x, e.y);
      if (e.down) {
        if (down) return owner !== null;
        down = true;
        owner = hit;
        if (hit) authority.active(hit);
        return hit !== null;
      }
      const activate = down && owner !== null && owner === hit;
      const target = owner;
      down = false;
      owner = null;
      authority.clearActive();
      if (activate) authority.press(target);
      return activate;
    },
    cancel() {
      down = false;
      owner = null;
      authority.clearActive();
    },
    owner() {
      return owner;
    },
  };
}

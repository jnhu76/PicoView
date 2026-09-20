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
  /** Host gesture cancel (focus-loss). Must NOT fire onPress. */
  cancel?: boolean;
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

/**
 * PR61-CORRECTIVE-1 MAJOR-C: one gesture owner chosen on the UP→DOWN edge
 * only. Motion while held must never transfer ownership.
 */
export type GestureOwner = "none" | "toolbar" | "canvas";

export interface HeldGesture {
  owner: GestureOwner;
  wasDown: boolean;
}

export const IDLE_GESTURE: HeldGesture = { owner: "none", wasDown: false };

export function classifyGestureOwner(input: {
  claimedFocusable: boolean;
  inImageViewport: boolean;
  canImage: boolean;
}): GestureOwner {
  if (input.claimedFocusable) return "toolbar";
  if (input.inImageViewport && input.canImage) return "canvas";
  return "none";
}

/**
 * Pure held-gesture state machine. Down-edge chooses owner exactly once;
 * held packets keep the owner; release/cancel clear it.
 */
export function nextHeldGesture(
  prev: HeldGesture,
  packet: { down: boolean; cancel?: boolean },
  classify: () => GestureOwner,
): HeldGesture {
  if (packet.cancel) return IDLE_GESTURE;
  if (packet.down && !prev.wasDown) {
    return { owner: classify(), wasDown: true };
  }
  if (!packet.down) return IDLE_GESTURE;
  return prev;
}

/** Accept a mouse packet's coordinates only when BOTH are finite numbers.
 *  Malformed packets must never fabricate a known pointer at (0,0): the
 *  persistent wheel anchor and the press hit-test would otherwise trust a
 *  position the host never sent. Returns null for a malformed packet. */
export function pointerCoords(
  e: { x?: unknown; y?: unknown },
): { x: number; y: number } | null {
  if (typeof e.x !== "number" || !Number.isFinite(e.x)) return null;
  if (typeof e.y !== "number" || !Number.isFinite(e.y)) return null;
  return { x: e.x, y: e.y };
}

export function createPointerPress(
  authority: PointerPressAuthority,
): PointerPressController {
  let owner: unknown = null;
  let down = false;
  return {
    update(e: PointerHit): boolean {
      if (e.cancel) {
        this.cancel();
        return false;
      }
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

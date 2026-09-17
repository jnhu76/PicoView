// Keyboard intent gate (WINDOWS-SHELL-UI-POLISH-1 launch corrective).
//
// One shortcut policy: keyboard zoom/Fit/1:1 must match toolbar enablement.
// No image → no invalid view mutation. Proxy image → 1:1 stays a no-op.

export type KeyboardFlags = {
  ctrl: boolean;
  canPrevious: boolean;
  canNext: boolean;
  canRefresh: boolean;
  /** Publication shown (`displayVerdict === "image"`). */
  canImage: boolean;
  /** Full-resolution image (1:1 available). */
  can100: boolean;
};

export type KeyboardIntent =
  | "previous"
  | "next"
  | "refresh"
  | "open"
  | "fit"
  | "oneToOne"
  | "zoomIn"
  | "zoomOut"
  | null;

/** Map a host key name + enablement flags to a product keyboard intent. */
export function keyboardIntent(k: string, flags: KeyboardFlags): KeyboardIntent {
  const { ctrl, canPrevious, canNext, canRefresh, canImage, can100 } = flags;
  switch (k) {
    case "left":
      return canPrevious ? "previous" : null;
    case "right":
      return canNext ? "next" : null;
    case "r":
      return !ctrl && canRefresh ? "refresh" : null;
    case "f5":
      return canRefresh ? "refresh" : null;
    case "o":
      return ctrl ? "open" : null;
    case "0":
      return canImage ? "fit" : null;
    case "1":
      return canImage && can100 ? "oneToOne" : null;
    case "=":
    case "+":
      return canImage ? "zoomIn" : null;
    case "-":
      return canImage ? "zoomOut" : null;
    default:
      return null;
  }
}

// Status-bar Product Zoom % editor keyboard/ownership state machine.
//
// Pure module — no PocketJS imports. Edit-mode keyboard capture runs BEFORE
// keyboardIntent so typing "100" / "125" / "1600" never triggers Fit / 1:1 /
// Zoom In / Zoom Out / Previous / Next.

export interface ZoomEditorState {
  active: boolean;
  buffer: string;
}

export const ZOOM_EDITOR_IDLE: ZoomEditorState = { active: false, buffer: "" };

export type ZoomEditorKeyAction =
  /** Not editing — pass the key to keyboardIntent. */
  | "ignore"
  /** Editing — key consumed by the editor. */
  | "consume"
  /** Enter with valid percent — leave edit mode and apply exact productZoom. */
  | "commit"
  /** Escape — leave edit mode; ViewTransform unchanged. */
  | "cancel"
  /** Enter with invalid/empty buffer — stay in edit mode; no ViewTransform mutation. */
  | "invalid";

export interface ZoomEditorKeyResult {
  action: ZoomEditorKeyAction;
  next: ZoomEditorState;
  /** Present only when action === "commit". */
  productZoom?: number;
}

export function beginZoomEdit(effectivePercentText: string): ZoomEditorState {
  return { active: true, buffer: effectivePercentText };
}

/**
 * Apply one host key name (native lowercase names: "0".."9", ".", "enter",
 * "escape", "backspace", "%") to the zoom editor.
 *
 * While editing, +/-, arrow keys, and every non-editor key are CONSUMED so
 * they cannot leak into product keyboard shortcuts.
 */
export function applyZoomEditorKey(
  state: ZoomEditorState,
  key: string,
  parsePercent: (raw: string) =>
    | { ok: true; productZoom: number }
    | { ok: false },
): ZoomEditorKeyResult {
  if (!state.active) {
    return { action: "ignore", next: state };
  }
  const k = key.toLowerCase();
  if (k === "escape") {
    return { action: "cancel", next: ZOOM_EDITOR_IDLE };
  }
  if (k === "enter") {
    const parsed = parsePercent(state.buffer);
    if (!parsed.ok) {
      return { action: "invalid", next: state };
    }
    return {
      action: "commit",
      next: ZOOM_EDITOR_IDLE,
      productZoom: parsed.productZoom,
    };
  }
  if (k === "backspace") {
    return {
      action: "consume",
      next: { active: true, buffer: state.buffer.slice(0, -1) },
    };
  }
  // Optional '%' may be typed; ignore it.
  if (k === "%" || k === "percent") {
    return { action: "consume", next: state };
  }
  if (/^[0-9]$/.test(k)) {
    return {
      action: "consume",
      next: { active: true, buffer: state.buffer + k },
    };
  }
  if (k === "." || k === "decimal" || k === "period") {
    if (state.buffer.includes(".")) {
      return { action: "consume", next: state };
    }
    return {
      action: "consume",
      next: { active: true, buffer: state.buffer + "." },
    };
  }
  // Everything else (including "+", "-", arrows, letters) is captured while
  // editing so product shortcuts cannot fire.
  return { action: "consume", next: state };
}

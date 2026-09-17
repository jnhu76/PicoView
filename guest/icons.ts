// Icon assets + toolbar action semantics (PR #62).
// SVGs live next to the guest entry and are baked at compile time.
// PocketJS baker @ 24bab5e: filled circle/rect/path only — no stroke, no arcs A.
// Design grid and display size are both 16×16 logical px (`w-4 h-4`).

export const ICON_ASSETS = {
  open: "icon-open.svg",
  previous: "icon-prev.svg",
  next: "icon-next.svg",
  zoomOut: "icon-zoom-out.svg",
  zoomIn: "icon-zoom-in.svg",
  fit: "icon-fit.svg",
  rotateLeft: "icon-rotate-left.svg",
  rotateRight: "icon-rotate-right.svg",
  flipHorizontal: "icon-flip-h.svg",
  flipVertical: "icon-flip-v.svg",
  reset: "icon-reset.svg",
  refresh: "icon-refresh.svg",
  empty: "icon-empty.svg",
  warn: "icon-warn.svg",
} as const;

export type IconName = keyof typeof ICON_ASSETS;

/**
 * Product semantic names for toolbar/edge actions.
 * PocketJS has no tooltip primitive at 24bab5e — these names are the
 * accessibility/metadata + test authority, not painted chrome labels.
 */
export const TOOL_SEMANTIC = {
  open: "Open",
  zoomOut: "Zoom Out",
  zoomIn: "Zoom In",
  fit: "Fit",
  oneToOne: "1:1",
  rotateLeft: "Rotate Left",
  rotateRight: "Rotate Right",
  flipHorizontal: "Flip Horizontal",
  flipVertical: "Flip Vertical",
  reset: "Reset View",
  refresh: "Refresh",
  previous: "Previous",
  next: "Next",
} as const;

export type ToolSemanticName = keyof typeof TOOL_SEMANTIC;

export function toolSemantic(name: ToolSemanticName): string {
  return TOOL_SEMANTIC[name];
}

/** Legacy short labels kept only for tests that assert product strings. */
export function iconLabel(name: ToolSemanticName): string {
  return TOOL_SEMANTIC[name];
}

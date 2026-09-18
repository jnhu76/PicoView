// Icon assets + toolbar action semantics (PR #62 corrective-3).
// SVGs live next to the guest entry and are baked at compile time.
// PocketJS baker @ 24bab5e: filled circle/rect/path only — no stroke, no arcs A.
//
// Size policy: design grid is 20×20 logical units (viewBox 0 0 20 20);
// display is w-5 h-5 (20×20 logical). Texture roots stay pow2 (32/64) solely
// because the pak baker rejects non-pow2 textures — not as a display scale.
// Never bake one design size and display another.

export const ICON_ASSETS = {
  open: "icon-open.svg",
  previous: "icon-prev.svg",
  next: "icon-next.svg",
  zoomOut: "icon-zoom-out.svg",
  zoomIn: "icon-zoom-in.svg",
  fit: "icon-fit.svg",
  rotate: "icon-rotate.svg",
  flipH: "icon-flip-h.svg",
  flipV: "icon-flip-v.svg",
  empty: "icon-empty.svg",
  warn: "icon-warn.svg",
} as const;

export type IconName = keyof typeof ICON_ASSETS;

/**
 * Product semantic names for toolbar/edge actions.
 * PocketJS has no tooltip primitive at 24bab5e — these names are the
 * accessibility/metadata + test authority, not painted chrome labels.
 *
 * Toolbar command bar:
 *   Open · Zoom Out · Zoom In · Fit · 1:1 · Rotate · Flip Horizontal · Flip Vertical
 * Previous/Next stay viewport-edge + keyboard only.
 * Rotate = one CW 90° command; FlipH/FlipV are separate visible-frame
 * reflections (PR #61 geometry).
 */
export const TOOL_SEMANTIC = {
  open: "Open",
  zoomOut: "Zoom Out",
  zoomIn: "Zoom In",
  fit: "Fit",
  oneToOne: "1:1",
  rotate: "Rotate",
  flipH: "Flip Horizontal",
  flipV: "Flip Vertical",
  previous: "Previous",
  next: "Next",
} as const;

/** Exact toolbar command vocabulary — order is the visual toolbar order. */
export const TOOLBAR_COMMANDS = [
  "open",
  "zoomOut",
  "zoomIn",
  "fit",
  "oneToOne",
  "rotate",
  "flipH",
  "flipV",
] as const satisfies readonly (keyof typeof TOOL_SEMANTIC)[];

export type ToolSemanticName = keyof typeof TOOL_SEMANTIC;

export function toolSemantic(name: ToolSemanticName): string {
  return TOOL_SEMANTIC[name];
}

/** Alias of `toolSemantic` — full product semantic name (not a short label). */
export function iconLabel(name: ToolSemanticName): string {
  return TOOL_SEMANTIC[name];
}

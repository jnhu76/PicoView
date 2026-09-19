// Icon assets + toolbar action semantics (Remix Icon replacement).
// SVGs live next to the guest entry and are baked at compile time.
//
// Provenance: guest/remix-icons.json
//   Remix-Design/RemixIcon @ 9fb7967c0a4c09910161192bde99efd3df09f5eb
//   family "line", license Remix Icon License v1.0.
//
// Size policy: Remix design grid is 24×24 (viewBox 0 0 24 24). Texture roots
// stay pow2 (32×32) solely because the PocketJS pak baker rejects non-pow2
// textures — not as a display scale. Toolbar/edge glyphs display as w-6 h-6
// (24×24 logical) inside the existing 36×36 hit target. Never bake one design
// size and display another.

export const ICON_ASSETS = {
  open: "folder-open-line.svg",
  previous: "arrow-left-s-line.svg",
  next: "arrow-right-s-line.svg",
  zoomOut: "zoom-out-line.svg",
  zoomIn: "zoom-in-line.svg",
  fit: "aspect-ratio-line.svg",
  // Product Rotate CW. Visual glyph is Remix circular refresh-line (user
  // acceptance: "rotate as a circle"), not clockwise-line's square+arrow.
  // Command semantics remain one CW 90° — this is not a Refresh command.
  rotate: "refresh-line.svg",
  flipH: "flip-horizontal-line.svg",
  flipV: "flip-vertical-line.svg",
  empty: "image-line.svg",
  warn: "error-warning-line.svg",
} as const;

export type IconName = keyof typeof ICON_ASSETS;

/** Expected Remix semantic → vendored filename map (tests + provenance). */
export const REMIX_ICON_PROVENANCE = {
  repository: "Remix-Design/RemixIcon",
  revision: "9fb7967c0a4c09910161192bde99efd3df09f5eb",
  license: "Remix Icon License v1.0",
  family: "line",
  designViewBox: "0 0 24 24",
} as const;

/**
 * Product semantic names for toolbar/edge actions.
 * PocketJS has no tooltip primitive at 24bab5e. These strings are the
 * **semantic/test authority** — not painted chrome labels, and not live
 * accessibility metadata. ToolButton does not forward `semantic` to any
 * PocketJS node/native a11y API; PocketJS 24bab5e has no such capability.
 * Do not describe this map as accessibility metadata until that exists.
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

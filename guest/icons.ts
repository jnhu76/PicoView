// Icon asset names for the toolbar (UI/UX v1.0).
// SVGs live next to the guest entry and are baked at compile time.
// PocketJS baker: filled circle/rect/path only — no stroke, no arcs.

export const ICON_ASSETS = {
  open: "icon-open.svg",
  previous: "icon-prev.svg",
  next: "icon-next.svg",
  zoomOut: "icon-zoom-out.svg",
  zoomIn: "icon-zoom-in.svg",
  fit: "icon-fit.svg",
  refresh: "icon-refresh.svg",
  empty: "icon-empty.svg",
  warn: "icon-warn.svg",
} as const;

export type IconName = keyof typeof ICON_ASSETS;

/** Product label under the glyph (toolbar text).
 *  Keep labels short enough for ToolButton width — long names truncate. */
const ICON_LABEL: Record<"open" | "previous" | "next" | "zoomOut" | "zoomIn" | "fit" | "oneToOne" | "refresh", string> = {
  open: "Open",
  previous: "Prev",
  next: "Next",
  zoomOut: "Zoom-",
  zoomIn: "Zoom+",
  fit: "Fit",
  oneToOne: "1:1",
  refresh: "Refresh",
};

export function iconLabel(name: keyof typeof ICON_LABEL): string {
  return ICON_LABEL[name];
}

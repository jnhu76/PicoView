// Product shell geometry — one canonical image viewport.
//
// Fit, centering, pan clamp, pointer anchors, and image placement must all
// consume `imageViewport()`. Toolbar/status heights are frozen product
// constants so layout and Fit math cannot silently disagree.

import type { ImageViewport } from "./view_transform.ts";

/** Frozen chrome heights in UI logical units (match app.octane.tsx). */
export const SHELL_CHROME = {
  titleH: 36,
  toolbarH: 64,
  statusH: 28,
} as const;

export function chromeHeight(): number {
  return SHELL_CHROME.titleH + SHELL_CHROME.toolbarH + SHELL_CHROME.statusH;
}

/** Authoritative image viewport inside the window. */
export function imageViewport(
  windowW: number,
  windowH: number,
): ImageViewport {
  const h = Math.max(0, windowH - chromeHeight());
  return {
    x: 0,
    y: SHELL_CHROME.titleH + SHELL_CHROME.toolbarH,
    width: Math.max(0, windowW),
    height: h,
  };
}

/** True if a window-logical point is inside the image viewport. */
export function pointInImageViewport(
  viewport: ImageViewport,
  x: number,
  y: number,
): boolean {
  return (
    x >= viewport.x &&
    y >= viewport.y &&
    x < viewport.x + viewport.width &&
    y < viewport.y + viewport.height
  );
}

/**
 * PR61-CORRECTIVE-1 MAJOR-B: wheel zoom anchor.
 * Persist last logical pointer across guest turns. If that point is inside
 * the image viewport, zoom around it; never anchor to toolbar coordinates.
 * Otherwise fall back to the image-viewport center.
 */
export function wheelFocusPoint(
  viewport: ImageViewport,
  pointer: { x: number; y: number; known: boolean },
): { x: number; y: number } {
  if (
    pointer.known &&
    pointInImageViewport(viewport, pointer.x, pointer.y)
  ) {
    return { x: pointer.x, y: pointer.y };
  }
  return {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };
}

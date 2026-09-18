// Product shell geometry — one canonical image viewport.
//
// Fit, centering, pan clamp, pointer anchors, and image placement must all
// consume `imageViewport()`. Chrome heights are product constants so layout
// and Fit math cannot silently disagree. Compact values: title+toolbar must
// not eat the photograph (PR62 follow-up: 36/64 was too tall).
//
// Authority (PR62 desktop conformance):
//   PR #62 owns shell chrome allocation (SHELL_CHROME) and therefore the
//   image-viewport boundary that Fit/center/pan consume as *input geometry*.
//   PR #61 still owns ViewTransform equations, Fit algorithm, pan clamp
//   algorithm, and orientation math. Changing chrome heights is not a
//   ViewTransform formula change.

import type { ImageViewport } from "./view_transform.ts";

/** Chrome heights in UI logical units (must match app.octane.tsx via import).
 *  In-app title strip removed: native caption owns the window name. */
export const SHELL_CHROME = {
  titleH: 0,
  toolbarH: 44,
  statusH: 24,
} as const;

/**
 * PicoView product minimum logical client size (PR #62 conformance contract).
 *
 * PocketJS `windows-app` / `linux-app` capability floor is 240×180 logical.
 * That is a platform capability, not a PicoView usability promise. The
 * 8-command toolbar is fixed Flex: 8×36 buttons + 2 GroupGap×8 + 9×gap-1×4
 * + px-2 padding ≈ 356 logical width. Product closes the contract at 384
 * width; height keeps chrome (68) plus a non-zero image viewport.
 *
 * Keep `guest/pocket.json` `viewport.min` and native
 * `PRODUCT_MIN_CLIENT_*` in sync with this constant.
 */
export const PRODUCT_MIN_CLIENT = {
  width: 384,
  height: 240,
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
// One derivation authority for guest display state (post-release
// normalization C4, fixes MAJOR-4's duplicate-derivation drift).
//
// The composition root previously derived the same display facts twice —
// once inside the frame hook for input routing, once in the render body for
// the JSX tree — and the copies had drifted (frame: width>0 && height>0;
// render: width>0). Both sides now consume THIS pure function, so a display
// rule has exactly one semantic expression. Pure and framework-free:
// testable without the render tree (`bun test guest/display_state.test.ts`).
//
// Not authority: this module derives facts from the observer's publication
// mirror; it does not mutate observer, binding, or ViewTransform semantics.

import { imageViewport } from "./shell_layout.ts";
import { zoomLabel, type ImageViewport, type OrientedImage, type ViewTransform } from "./view_transform.ts";
import {
  displayVerdict,
  refreshStatus,
  type DisplayVerdict,
  type ObserverState,
  type RefreshStatusFacet,
} from "./observer.ts";

export interface DisplayState {
  /** Live UI scale: physical pixels per logical unit (OS authority). */
  dpi: number;
  /** Live logical window size (Dynamic policy, measured). */
  winW: number;
  winH: number;
  /** Authoritative image viewport inside the window. */
  vp: ImageViewport;
  /** Image geometry as the display tree consumes it (resource dims with
   *  source fallback). */
  img: OrientedImage;
  /** Image geometry is usable for view math (BOTH dimensions > 0). */
  hasImage: boolean;
  /** What facet wins the main content area. */
  verdict: DisplayVerdict;
  /** THE canImage: the main content may present an image. Frame input
   *  routing and the render tree consume this single expression. */
  canImage: boolean;
  /** Truthful 1:1 available (resource geometry == source geometry). */
  can100: boolean;
  /** File name surfaced for the winning facet (publication, or request for
   *  a displacing new-item loading/error). */
  shownName: string | undefined;
  /** Refresh command availability. */
  canRefresh: boolean;
  /** Status-row texts. */
  posText: string;
  dimText: string;
  zoomText: string;
  /** Refresh request facet (C1): null when nothing to surface. */
  refreshFacet: RefreshStatusFacet | null;
}

const DEFAULT_WINDOW: { w: number; h: number } = { w: 960, h: 640 };

/** Derive the whole display-state record from observer facts + the current
 *  ViewTransform. Frame logic and the render tree MUST both call this. */
export function deriveDisplayState(
  state: ObserverState,
  viewState: ViewTransform,
): DisplayState {
  const publication = state.publication;
  const request = state.request;
  const viewport = state.viewport;
  const dpi = viewport?.dpi && viewport.dpi > 0 ? viewport.dpi : 1;
  const winW = viewport?.w ?? DEFAULT_WINDOW.w;
  const winH = viewport?.h ?? DEFAULT_WINDOW.h;
  const vp = imageViewport(winW, winH);
  const img: OrientedImage = {
    width: publication ? publication.resourceWidth || publication.sourceWidth : 0,
    height: publication ? publication.resourceHeight || publication.sourceHeight : 0,
  };
  const hasImage = img.width > 0 && img.height > 0;
  const verdict = displayVerdict(state);
  const canImage = verdict === "image" && hasImage;
  const can100 = publication?.fullResolution === true;
  const shownName =
    verdict === "image"
      ? publication?.name
      : verdict === "loading" || verdict === "error"
        ? request?.name
        : undefined;
  const canRefresh = !!publication || (shownName != null && shownName !== "");
  const posText =
    state.browse.count > 0 && state.browse.index !== null
      ? `${state.browse.index + 1} / ${state.browse.count}`
      : "";
  const dimText = publication
    ? `${publication.sourceWidth} × ${publication.sourceHeight}`
    : "";
  const zoomText = zoomLabel(viewState, {
    fullResolution: can100,
    hasImage: canImage,
  });
  return {
    dpi,
    winW,
    winH,
    vp,
    img,
    hasImage,
    verdict,
    canImage,
    can100,
    shownName,
    canRefresh,
    posText,
    dimText,
    zoomText,
    refreshFacet: refreshStatus(state),
  };
}

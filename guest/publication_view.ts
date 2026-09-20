// Publication view reconciliation (post-release normalization C3).
//
// When a Product publication is observed, the guest decides whether the
// current view intent survives: navigation/name changes reset the view,
// geometry changes revalidate it, and an identical re-publication preserves
// it. This is the only contract that survives from the retired legacy
// view-state module — all Fit/zoom/pan/orientation geometry authority lives
// in guest/view_transform.ts.
//
// Guest-side only; never touches publication binding/lifetime.

/** Publication identity used to decide whether navigation reset is needed. */
export interface PublicationViewKey {
  browseIndex: number | null;
  name: string | undefined;
  resourceWidth: number;
  resourceHeight: number;
  fullResolution: boolean;
}

/** Decide how view state reconciles when a Product publication is observed. */
export type ViewReconcileAction = "reset" | "revalidate" | "preserve";

export function reconcileViewForPublication(
  prev: PublicationViewKey | null,
  next: PublicationViewKey | null,
): ViewReconcileAction {
  if (!next) return "preserve";
  if (!prev) return "reset";
  if (prev.browseIndex !== next.browseIndex) return "reset";
  if (prev.name !== next.name) return "reset";
  if (
    prev.resourceWidth !== next.resourceWidth ||
    prev.resourceHeight !== next.resourceHeight ||
    prev.fullResolution !== next.fullResolution
  ) {
    return "revalidate";
  }
  return "preserve";
}

export function publicationViewKeyFrom(input: {
  publication: {
    resourceWidth: number;
    resourceHeight: number;
    fullResolution: boolean;
    name?: string;
  } | null;
  browse: { index: number | null };
}): PublicationViewKey | null {
  const pub = input.publication;
  if (!pub) return null;
  return {
    browseIndex: input.browse.index,
    name: pub.name,
    resourceWidth: pub.resourceWidth,
    resourceHeight: pub.resourceHeight,
    fullResolution: pub.fullResolution,
  };
}

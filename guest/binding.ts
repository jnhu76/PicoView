// Guest view-binding reconciliation (PICOVIEW-LAST-GOOD-PUBLICATION-1
// CORRECTIVE-2). Zero imports: testable without the framework
// (`bun test guest/`).
//
// Why this exists at all: a mounted Image resolves its handle through the
// framework's key→handle map at render time (`setProp` skips an unchanged
// value, so an unchanged `src` string re-resolves nothing). A native
// Product publication commit therefore becomes a VIEW BINDING only when
// the frame that presents it renders under a different texture key than
// the frame before it.
//
// Native Product commits and guest rendered bindings are different commit
// domains: several publications can commit between two guest frames, and
// one guest turn reduces all of their events. The binding must therefore
// advance once per ACTUAL rendered publication change — never once per
// incoming `ready` event. Flipping per event lets an even number of
// collapsed commits land back on the mounted key, and the already-mounted
// Image node would keep resolving the superseded handle that the native
// observation boundary then legitimately frees.
//
// This module holds no Product authority: it only remembers which
// publication the mounted Image currently resolves to, and answers where
// that binding must move. Product semantics stay in observer.ts.

/** Texture key prefix the guest binds ready handles under (mirrored in
 *  native/src/current_item.rs as TEXTURE_KEY_HINT; the handle travels via
 *  svc, the key stays literal). */
export const TEXTURE_KEY = "picoview-current";

/** Alternating binding keys. Two slots are sufficient — and the framework
 *  key→handle map stays bounded at two entries — precisely because the
 *  slot flips per rendered publication transition rather than per native
 *  event. A generation-derived key would grow the map without bound. */
export function textureKeyFor(slot: 0 | 1): string {
  return `${TEXTURE_KEY}-${slot}`;
}

/** Publication identity the binding depends on: the native generation
 *  tags the resource, so a freed handle number reused by a later
 *  publication is still a different identity. */
export interface PublicationIdentity {
  generation: number;
  handle: number;
}

/** The publication the mounted Image currently resolves to, and the
 *  texture-key slot its `src` string names. */
export interface BoundPublication extends PublicationIdentity {
  slot: 0 | 1;
}

export interface BindingReconciliation {
  /** Binding after this turn; null when no Image is mounted. */
  binding: BoundPublication | null;
  /** Texture key to register before the render flush, when the binding
   *  moved. At most one registration per reconciled turn (bounded). */
  register: { key: string; handle: number } | null;
  /** True when the rendered binding must re-resolve: in that branch the
   *  key string is guaranteed to differ from the mounted one. */
  changed: boolean;
}

/** Reconcile the mounted binding against the FINAL publication observed
 *  in one guest turn. Call once per turn, after the whole svc batch has
 *  been reduced and before scheduling the render. */
export function reconcileBinding(
  bound: BoundPublication | null,
  publication: PublicationIdentity | null,
): BindingReconciliation {
  if (!publication) {
    // No publication: the Image unmounts. Nothing to register — the next
    // publication starts a fresh binding, whose mount applies its own src.
    return bound === null
      ? { binding: null, register: null, changed: false }
      : { binding: null, register: null, changed: true };
  }
  if (
    bound &&
    bound.generation === publication.generation &&
    bound.handle === publication.handle
  ) {
    // Same publication the mounted Image already resolves to: no flip.
    return { binding: bound, register: null, changed: false };
  }
  const slot: 0 | 1 = bound ? (bound.slot === 0 ? 1 : 0) : 0;
  return {
    binding: { generation: publication.generation, handle: publication.handle, slot },
    register: { key: textureKeyFor(slot), handle: publication.handle },
    changed: true,
  };
}

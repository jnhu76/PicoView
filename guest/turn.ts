// One guest observation turn (PICOVIEW-LAST-GOOD-PUBLICATION-1 CORRECTIVE-2).
// Zero imports beyond the pure observer/binding state: testable without the
// framework (`bun test guest/`).
//
// A turn is one guest frame's whole svc drain. The host pushes Product
// events from the runtime thread's request phase only, and `svcPoll` drains
// the entire queue per call, so a turn normally sees ONE batch — but the
// drain loops until empty, and the commit boundary is the TURN, not the
// batch:
//
//   1. reduce every event, in order (Product correctness — all events win
//      their own staleness races), then
//   2. commit exactly ONE view binding against the FINAL observed
//      publication.
//
// Committing per batch would reintroduce the CORRECTIVE-2 MAJOR one level
// up: an even number of batches in one frame would land back on the mounted
// texture key, `setProp` would skip the unchanged `src`, and the mounted
// Image would keep resolving a superseded handle the native observation
// boundary then frees. Product reduction and rendering realization are
// separate; this module keeps them that way.

import { reduceObserver, type ObserverState, type SvcLine } from "./observer.ts";
import { reconcileBinding, type BoundPublication } from "./binding.ts";

/** Guest view state carried across turns. `binding` is rendering state, not
 *  Product authority — see binding.ts. */
export interface GuestTurnState {
  observer: ObserverState;
  binding: BoundPublication | null;
}

/** What the framework glue must do after this turn. */
export interface GuestTurnOutcome {
  /** State after this turn, to store back. */
  state: GuestTurnState;
  /** Texture registration to perform BEFORE the re-render flush — the flush
   *  is where setSrc resolves the key. At most one per turn. */
  register: { key: string; handle: number } | null;
  /** True when the guest must re-render (Product state or binding moved). */
  render: boolean;
}

/** Run one guest turn: `nextBatch` returns the next svc batch (a string of
 *  newline-terminated JSON lines) or undefined when the queue is empty. */
export function runGuestTurn(
  state: GuestTurnState,
  nextBatch: () => string | undefined,
): GuestTurnOutcome {
  let observer = state.observer;
  let changed = false;
  for (;;) {
    const batch = nextBatch();
    if (batch === undefined) break;
    for (const line of batch.split("\n")) {
      if (!line) continue;
      let v: SvcLine;
      try {
        v = JSON.parse(line);
      } catch {
        continue;
      }
      if (!v || typeof v !== "object") continue;
      const next = reduceObserver(observer, v);
      if (next === observer) continue;
      observer = next;
      changed = true;
    }
  }
  const recon = reconcileBinding(state.binding, observer.publication);
  if (!changed && recon.binding === state.binding) {
    // Nothing to commit: no event moved the Product state and the binding
    // did not move. Hand the same state back — an idle turn is a no-op.
    return { state, register: null, render: false };
  }
  return {
    state: { observer, binding: recon.binding },
    register: recon.register,
    render: changed || recon.changed,
  };
}

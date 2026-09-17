// Guest turn-loop tests (PICOVIEW-LAST-GOOD-PUBLICATION-1 CORRECTIVE-2).
// Run: `bun test guest/`.
//
// `runGuestTurn` is the loop app.octane.tsx actually ships (the app only
// wires svcPoll, registerTexture, setRevision and JSX around it). These tests
// pin its COMMIT BOUNDARY: the turn, not the batch and not the event.
import { expect, test } from "bun:test";
import { initialObserverState } from "./observer.ts";
import { textureKeyFor } from "./binding.ts";
import { runGuestTurn, type GuestTurnState } from "./turn.ts";

function freshState(): GuestTurnState {
  return { observer: initialObserverState(), binding: null };
}

function readyLine(g: number, handle: number): string {
  return JSON.stringify({
    t: "current-item",
    status: "ready",
    g,
    handle,
    width: 100,
    height: 100,
    name: `img-${g}.jpg`,
  }) + "\n";
}

/** A turn over a fixed list of batches; records what was drained. */
function turn(state: GuestTurnState, ...batches: string[]) {
  let i = 0;
  let polls = 0;
  const outcome = runGuestTurn(state, () => {
    polls += 1;
    return batches[i++];
  });
  return { outcome, polls };
}

test("two svc batches in one frame commit exactly one binding", () => {
  // The host pushes Product events from the request phase only, so one batch
  // per frame is the norm — but the drain loops until empty, and the commit
  // boundary must be the TURN. Per-batch commits would flip the slot twice
  // here and land back on the mounted key (the CORRECTIVE-2 MAJOR, one level
  // up), leaving the mounted Image bound to the superseded handle.
  let state = freshState();
  state = turn(state, readyLine(1, 11)).outcome.state; // A rendered on slot 0
  expect(state.binding).toEqual({ generation: 1, handle: 11, slot: 0 });

  const { outcome, polls } = turn(state, readyLine(2, 22), readyLine(3, 33));
  expect(polls).toBe(3); // two batches, then the empty poll
  expect(outcome.register).toEqual({ key: textureKeyFor(1), handle: 33 });
  expect(outcome.state.binding).toEqual({ generation: 3, handle: 33, slot: 1 });
  expect(outcome.render).toBe(true);
  // Exactly one registration: the intermediate publication B never became a
  // rendered binding.
  expect(textureKeyFor(outcome.state.binding!.slot)).not.toBe(textureKeyFor(0));
});

test("three batches in one frame still commit exactly one binding", () => {
  let state = freshState();
  state = turn(state, readyLine(1, 11)).outcome.state;
  const { outcome } = turn(state, readyLine(2, 22), readyLine(3, 33), readyLine(4, 44));
  expect(outcome.state.binding).toEqual({ generation: 4, handle: 44, slot: 1 });
  expect(outcome.register).toEqual({ key: textureKeyFor(1), handle: 44 });
});

test("an empty drain changes nothing and schedules no render", () => {
  const state = freshState();
  const { outcome, polls } = turn(state);
  expect(polls).toBe(1);
  expect(outcome.register).toBeNull();
  expect(outcome.render).toBe(false);
  expect(outcome.state).toBe(state); // same object: nothing to store back
});

test("a turn with no Publication change schedules no render and no register", () => {
  // Refresh loading: the request facet changes (Product state moved) but the
  // publication does not — no texture key flip, no rebind.
  let state = freshState();
  state = turn(state, readyLine(1, 11)).outcome.state;
  const stale = JSON.stringify({ t: "current-item", status: "loading", g: 2, intent: "refresh", name: "b.jpg" }) + "\n";
  const { outcome } = turn(state, stale);
  expect(outcome.render).toBe(true); // the status area must show the refresh
  expect(outcome.register).toBeNull();
  expect(outcome.state.binding).toEqual({ generation: 1, handle: 11, slot: 0 });
});

test("malformed and foreign lines are skipped without disturbing the binding", () => {
  let state = freshState();
  state = turn(state, readyLine(1, 11)).outcome.state;
  const noise = "{not json\n" + JSON.stringify({ t: "something-else" }) + "\n\n";
  const { outcome } = turn(state, noise + readyLine(2, 22));
  expect(outcome.state.binding).toEqual({ generation: 2, handle: 22, slot: 1 });
});

test("the turn is the only place a binding moves (no double register)", () => {
  // Idempotence across turns: re-running a turn over the same final
  // publication must not register again or flip again.
  let state = freshState();
  state = turn(state, readyLine(1, 11)).outcome.state;
  state = turn(state, readyLine(2, 22), readyLine(3, 33)).outcome.state;
  const { outcome } = turn(state, "");
  expect(outcome.register).toBeNull();
  expect(outcome.state.binding).toEqual({ generation: 3, handle: 33, slot: 1 });
});

test("null and empty batches terminate the drain instead of throwing or spinning", () => {
  // The pinned host returns undefined for an empty queue; a future host
  // returning null must not throw inside the frame hook, and an empty
  // string must not loop the drain forever.
  let calls = 0;
  const withNull = runGuestTurn(freshState(), () => {
    calls += 1;
    return null as unknown as string | undefined;
  });
  expect(calls).toBe(1); // terminated on the null batch, no throw
  expect(withNull.render).toBe(false);
  expect(withNull.state.binding).toBeNull();

  let emptyCalls = 0;
  const withEmpty = runGuestTurn(freshState(), () => {
    emptyCalls += 1;
    return "";
  });
  expect(emptyCalls).toBe(1);
  expect(withEmpty.render).toBe(false);
});

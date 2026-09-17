// Guest view-binding reconciliation tests (PICOVIEW-LAST-GOOD-PUBLICATION-1
// CORRECTIVE-2). Run: `bun test guest/`.
//
// The MAJOR these tests pin: native Product commits and guest rendered
// bindings are different commit domains. A guest turn reduces the whole svc
// batch, so several `ready` publications can collapse into one turn; the
// binding must move once per RENDERED publication transition, not once per
// event. Flipping per event lets an even number of collapsed commits land
// back on the mounted texture key, the mounted Image keeps resolving the
// superseded handle, and the native observation boundary then frees it.
//
// `Model` below is the smallest faithful guest model: the real shipped turn
// loop (`runGuestTurn`), the framework's key→handle registry, and the two
// framework facts that make the hazard real — `setProp` skips an unchanged
// `src`, and a fresh mount always applies it (both proven against the pinned
// framework in framework-binding.test.ts).
import { expect, test } from "bun:test";
import { displayVerdict, initialObserverState, type SvcLine } from "./observer.ts";
import { textureKeyFor, reconcileBinding, type BoundPublication } from "./binding.ts";
import { runGuestTurn, type GuestTurnState } from "./turn.ts";

function ready(g: number, handle: number, w = 100, h = 100, name = "a.jpg"): SvcLine {
  return { t: "current-item", status: "ready", g, handle, width: w, height: h, name };
}
function loading(g: number, intent: "new-item" | "refresh", name = "b.jpg"): SvcLine {
  return { t: "current-item", status: "loading", g, intent, name };
}
function error(g: number, intent: "new-item" | "refresh", errorMsg = "could not decode image"): SvcLine {
  return { t: "current-item", status: "error", g, intent, error: errorMsg };
}

/** The guest's own view state across turns. `registry` / `renderedHandle`
 *  model the framework; `released` models the native side's post-boundary
 *  frees (proven natively by
 *  `two_commits_before_one_boundary_release_every_superseded`). */
class Model {
  state: GuestTurnState = { observer: initialObserverState(), binding: null };
  registry = new Map<string, number>();
  /** src string of the currently mounted Image node (null = unmounted). */
  mountedSrc: string | null = null;
  /** Handle the mounted node currently resolves (what the DrawList carries). */
  renderedHandle: number | null = null;
  /** Handles the native side has already freed. */
  released = new Set<number>();
  /** Every key ever registered (boundedness oracle). */
  keysEverUsed = new Set<string>();
  /** Bindings established per turn (flip-count oracle). */
  flips = 0;
  /** Turns that scheduled a render. */
  renders = 0;

  get observer() {
    return this.state.observer;
  }
  get binding(): BoundPublication | null {
    return this.state.binding;
  }

  /** One guest observation turn from one svc batch. */
  turn(...events: SvcLine[]): void {
    this.turnBatches(events.map((e) => JSON.stringify(e) + "\n").join(""));
  }

  /** One guest frame whose drain saw several svcPoll batches. */
  turnBatches(...batches: Array<string | undefined>): void {
    let i = 0;
    const outcome = runGuestTurn(this.state, () => batches[i++]);
    this.state = outcome.state;
    if (outcome.register) {
      this.registry.set(outcome.register.key, outcome.register.handle);
      this.keysEverUsed.add(outcome.register.key);
    }
    if (outcome.register && outcome.state.binding) this.flips += 1;
    if (outcome.render) this.renders += 1;
    this.render();
  }

  /** The framework's render path: a fresh Image applies its src, a mounted
   *  one only re-resolves when the src string changed (`setProp` skips an
   *  unchanged value). An unmounted verdict destroys the node. */
  private render(): void {
    const show = displayVerdict(this.observer) === "image" && this.observer.publication !== null;
    if (!show || !this.binding) {
      this.mountedSrc = null;
      this.renderedHandle = null;
      return;
    }
    const src = textureKeyFor(this.binding.slot);
    if (src === this.mountedSrc) return; // setProp skip: no re-resolution
    const handle = this.registry.get(src);
    expect(handle).toBeDefined(); // a rendered src must always be registered
    this.mountedSrc = src;
    this.renderedHandle = handle!;
  }

  /** What the renderer would draw for the mounted node right now. */
  drawn(): number | null {
    return this.renderedHandle;
  }
}

test("two commits in one turn flip the binding exactly once (A -> B -> C)", () => {
  // THE review scenario. Rendered A on slot 0; before the next frame the
  // native side commits B and then C, and the guest reduces both ready
  // events in one turn. Per-event flipping would land back on slot 0 — the
  // mounted key — leaving the node bound to A while the boundary frees A.
  const m = new Model();
  m.turn(ready(1, 11)); // A, slot 0
  expect(m.binding).toMatchObject({ generation: 1, handle: 11, slot: 0 });
  expect(m.renderedHandle).toBe(11);
  const srcBefore = m.mountedSrc;

  m.turn(ready(2, 22), ready(3, 33)); // B then C, one batch

  expect(m.observer.publication).toMatchObject({ generation: 3, handle: 33 });
  expect(m.binding).toMatchObject({ generation: 3, handle: 33, slot: 1 });
  expect(m.flips).toBe(2); // A established the first binding; the batch flipped once
  expect(m.mountedSrc).not.toBe(srcBefore); // the mounted src string changed
  expect(m.mountedSrc).toBe(textureKeyFor(1));
  expect(m.renderedHandle).toBe(33); // the mounted node re-resolved to C
  // The framework registry is consistent with the mounted node.
  expect(m.registry.get(textureKeyFor(1))).toBe(33);
});

test("any number of collapsed ready events flips the binding exactly once", () => {
  // 1..8 ready events in one turn: the transition A -> final is always one
  // flip, whatever the parity of the event count (the old per-event model
  // wrapped back onto the mounted key at every even count).
  for (let n = 1; n <= 8; n++) {
    const m = new Model();
    m.turn(ready(1, 11)); // A rendered on slot 0
    const srcBefore = m.mountedSrc;
    const flipsBefore = m.flips;
    const events: SvcLine[] = [];
    for (let i = 0; i < n; i++) events.push(ready(2 + i, 100 + i));
    m.turn(...events);
    const finalHandle = 100 + (n - 1);
    expect(m.binding).toMatchObject({ handle: finalHandle, slot: 1 });
    expect(m.flips).toBe(flipsBefore + 1);
    expect(m.mountedSrc).not.toBe(srcBefore);
    expect(m.renderedHandle).toBe(finalHandle);
  }
});

test("A -> B -> C -> D inside one batch still renders only A -> D", () => {
  const m = new Model();
  m.turn(ready(1, 11));
  const flipsBefore = m.flips;
  m.turn(ready(2, 22), ready(3, 33), ready(4, 44));
  expect(m.binding).toMatchObject({ generation: 4, handle: 44, slot: 1 });
  expect(m.flips).toBe(flipsBefore + 1);
  expect(m.renderedHandle).toBe(44);
  expect(m.registry.get(textureKeyFor(1))).toBe(44);
});

test("alternating turns keep flipping between exactly two keys", () => {
  // Boundedness: the namespace never grows beyond the two slots, and each
  // rendered transition re-resolves (src string always differs).
  const m = new Model();
  m.turn(ready(1, 11));
  let src = m.mountedSrc;
  for (let g = 2; g <= 12; g++) {
    m.turn(ready(g, 100 + g));
    expect(m.mountedSrc).not.toBe(src);
    expect(m.renderedHandle).toBe(100 + g);
    src = m.mountedSrc;
  }
  expect([...m.keysEverUsed].sort()).toEqual([textureKeyFor(0), textureKeyFor(1)]);
  expect(m.registry.size).toBe(2);
  expect(m.binding).toMatchObject({ slot: 1 }); // 11 transitions from slot 0: odd count
});

test("refresh error after an intermediate success binds the intermediate publication", () => {
  // A rendered; one turn: READY(B) then REFRESH error. The Product publication
  // is B (a refresh failure preserves last-good), so the binding moves
  // A -> B exactly once and the error is observable in the status area.
  const m = new Model();
  m.turn(ready(1, 11));
  const srcBefore = m.mountedSrc;
  m.turn(ready(2, 22), error(3, "refresh", "could not decode image"));
  expect(m.observer.publication).toMatchObject({ generation: 2, handle: 22 });
  expect(m.observer.request).toMatchObject({ status: "error", intent: "refresh" });
  expect(displayVerdict(m.observer)).toBe("image");
  expect(m.binding).toMatchObject({ generation: 2, handle: 22, slot: 1 });
  expect(m.mountedSrc).not.toBe(srcBefore);
  expect(m.renderedHandle).toBe(22);
});

test("new-item error after an intermediate success unmounts instead of binding", () => {
  // A rendered; one turn: READY(B) then NEW_ITEM error. The Product
  // publication is deliberately null (corrupt new item), so the Image
  // unmounts — there is no binding to move and no texture key to register
  // for B. The native side may free both A and B only after the boundary.
  const m = new Model();
  m.turn(ready(1, 11));
  const keysBefore = new Set(m.keysEverUsed);
  m.turn(ready(2, 22), error(3, "new-item", "could not decode image"));
  expect(m.observer.publication).toBeNull();
  expect(displayVerdict(m.observer)).toBe("error");
  expect(m.binding).toBeNull();
  expect(m.mountedSrc).toBeNull();
  expect(m.drawn()).toBeNull(); // the Image node is gone; nothing resolves A or B
  expect([...m.keysEverUsed]).toEqual([...keysBefore]); // no registration for B

  // A later publication starts a fresh binding whose mount applies its own
  // src — a fresh node is bound by its first src, not by a delta.
  m.turn(ready(4, 44));
  expect(m.binding).toMatchObject({ generation: 4, handle: 44, slot: 0 });
  expect(m.renderedHandle).toBe(44);
});

test("refresh loading alone never flips the binding", () => {
  const m = new Model();
  m.turn(ready(1, 11));
  const srcBefore = m.mountedSrc;
  const flipsBefore = m.flips;
  m.turn(loading(2, "refresh"));
  expect(m.observer.publication).toMatchObject({ handle: 11 });
  expect(m.binding).toMatchObject({ handle: 11, slot: 0 });
  expect(m.flips).toBe(flipsBefore);
  expect(m.mountedSrc).toBe(srcBefore);
  expect(m.renderedHandle).toBe(11);
});

test("reconciliation is idempotent for an unchanged publication", () => {
  const bound: BoundPublication = { generation: 7, handle: 70, slot: 1 };
  const same = reconcileBinding(bound, { generation: 7, handle: 70 });
  expect(same).toEqual({ binding: bound, register: null, changed: false });
  const empty = reconcileBinding(null, null);
  expect(empty).toEqual({ binding: null, register: null, changed: false });
});

test("a reused handle number from a newer generation is still a new binding", () => {
  // PocketJS recycles freed handle numbers; identity is generation+handle,
  // so a numeric collision must not be mistaken for the same publication.
  const bound: BoundPublication = { generation: 1, handle: 7, slot: 0 };
  const recon = reconcileBinding(bound, { generation: 2, handle: 7 });
  expect(recon.changed).toBe(true);
  expect(recon.binding).toEqual({ generation: 2, handle: 7, slot: 1 });
  expect(recon.register).toEqual({ key: textureKeyFor(1), handle: 7 });
});

test("two-commit batch oracle: the drawn handle survives the boundary free", () => {
  // Combined temporal oracle (the native half is proven natively):
  //   frame N:    Image resolves A
  //   before N+1: native commits B, then C (superseded = [A, B])
  //   frame N+1:  guest reduces READY(B), READY(C), flips once, renders C
  //   boundary:   native frees A and B after that frame's observation
  //   renderer:   the DrawList resolves C — never A, never B, never blank
  const m = new Model();
  m.turn(ready(1, 11)); // frame N: A

  m.turn(ready(2, 22), ready(3, 33)); // frame N+1
  const boundaryReleases = [11, 22]; // native superseded queue, drained at the boundary
  for (const handle of boundaryReleases) m.released.add(handle);

  const drawn = m.drawn();
  expect(drawn).toBe(33);
  expect(drawn).not.toBe(11);
  expect(drawn).not.toBe(22);
  expect(m.released.has(drawn!)).toBe(false);
  expect(m.registry.get(textureKeyFor(1))).toBe(33);
});

test("negative control: per-event key flipping would re-mount the stale handle", () => {
  // Demonstrates the test's power against the superseded implementation:
  // flipping the slot once per ready event ends an even-count batch on the
  // key the node is already mounted with, so the framework skips the src
  // and the node keeps resolving A — the exact blank-frame hazard.
  const registry = new Map<string, number>([
    [textureKeyFor(0), 11], // A mounted under key 0
  ]);
  let naiveSlot: 0 | 1 = 0;
  for (const handle of [22, 33]) {
    naiveSlot = naiveSlot === 0 ? 1 : 0;
    registry.set(textureKeyFor(naiveSlot), handle);
  }
  const mountedSrc = textureKeyFor(0);
  // The old model's final slot equals the mounted slot, so setProp skips.
  expect(textureKeyFor(naiveSlot)).toBe(mountedSrc);
  expect(registry.get(textureKeyFor(naiveSlot))).toBe(33); // map says C...
  expect(registry.get(mountedSrc)).toBe(33); // ...and the mounted key would resolve C
  // ...but the mounted NODE was never re-resolved, so it still draws A:
  const mountedNodeHandle = 11;
  expect(mountedNodeHandle).not.toBe(registry.get(mountedSrc));
});

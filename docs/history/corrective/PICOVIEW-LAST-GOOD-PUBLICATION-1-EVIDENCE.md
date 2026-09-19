# PICOVIEW-LAST-GOOD-PUBLICATION-1 — Evidence

Campaign: refresh/last-good publication ordering (R3). Product/Image
correction in PicoView only; PocketJS untouched.

## 0. Chain of custody

```text
BASE_SHA:            879f4c3 (PicoView main at campaign start)
BRANCH:              fix/last-good-publication-1
```
CORRECTIVE-1 BASE:   7436f89 (pre-corrective branch head; its PASS revoked)
CORRECTIVE-2 BASE:   476f0f7 (CORRECTIVE-1 head; its review PASS revoked —
                     one MAJOR remained in the guest publication binding;
                     see §Q mechanism, §R review)
POCKETJS_LOCK_SHA:   24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb (unchanged)
POCKETJS SOURCE:     integration/picoview-desktop (read-only inspection)
WORKTREE:            clean (untracked tooling files removed, see §A)
UPSTREAM WRITES:     none (no jnhu76/pocketjs, no pocket-stack/pocketjs writes)
```

## A. §0 prerequisite hygiene

- Cross-repo governance wording: `AGENTS.md` (Cross-repo rule) and
  `docs/ARCHITECTURE.md` §21 still said "review/merge it there" at campaign
  start. Corrected narrowly on this branch (commit `f702922`, 2 files / 2
  lines) to match the frozen `POCKETJS.lock` policy: implement + review
  upstream, freeze the exact reviewed commit on `integration/picoview-desktop`,
  advance the lock to that SHA; neither jnhu76/pocketjs main nor
  pocket-stack/pocketjs main is an integration target. Nothing else in either
  file was touched.
- Untracked root files `bun.lock`, `package.json`, `tsconfig.json` were still
  present at campaign start. Controlled experiment: the three files were moved
  out of the checkout and the guest bundle was recompiled with the standard
  command (`bun .../pocketjs/tools/pocket.ts compile --target windows-app
  --manifest guest/pocket.json --project-root . --outdir dist`) — it succeeded
  (exit 0), proving pocket.ts performs its own module resolution and the three
  files are not build inputs. They were then deleted locally (not restored),
  leaving `git status` clean.

## B. §4 audit — actual current state machine

Code traced at BASE (`native/src/current_item.rs`, `native/src/main.rs`,
`guest/app.octane.tsx`, framework + core at the locked revision
`24bab5e`).

### Current native sequences

`CurrentItem::open` (one function serves every intent; no Product intent
distinction exists):

```text
open(path):
  generation++
  svc_push(loading g)
  open_decoded:
    Ok  → publish: retire(old)  ← old logical resource freed FIRST
          upload_owned_rgba8(candidate)
          handle < 0 → svc_push(error)   [old already gone]
          handle ≥ 0 → live = candidate; svc_push(ready)
    Err → retire(old)  ← last-good destroyed on decode failure
          svc_push(error)
```

### Reachability

V1 opens at most once, at boot (`Runtime::boot`, `main.rs`); the `Input`
enum carries only `Quit`/`Resize`; the `current` field is
`#[allow(dead_code)]`. Replacement/refresh paths are exercised only by unit
tests today. Verified, not assumed.

### Current guest observation

`CurrentItemState` is one flat record conflating request progress and
publication existence. `loading` and `error` events REPLACE the whole record
(`handle/width/height` become undefined), and `fit()` renders the image only
when `status === "ready"` — so the old image leaves the DrawList on any
non-ready status even when the native texture is still alive and bound.

### Additional framework finding (rebind mechanics)

- `registerTexture(key, handle)` only updates a guest-side key→handle Map
  (`framework/src/native-tree.ts:326`).
- `setProp` skips unchanged values (`native-tree.ts:704`: `value === prev`
  early-return), and the PicoView Image's `src` is the constant
  `"picoview-current"` — so a **mounted** Image never re-resolves its binding.
  Rebinding works today only because `loading`/`error` unmount the Image and
  `ready` remounts it (mount re-runs `setSrc` → `ops.setImage`).
- A last-good guest that keeps the Image mounted across refresh
  loading/error MUST change the `src` string per publication to force
  `setSrc` re-resolution (see §D mechanism).
- Frame ordering (`framework/src/index-octane.ts`, frame handler):
  `flushUniversalSync(() => { runFrameHooks(...); ... })` drains microtask
  re-renders inside the same frame — "a frame's commits land in that frame".
  So the rebind triggered by observing `ready` lands before that frame's
  DrawList is submitted.

### §5 verdict

Both predicted layers CONFIRMED:

1. Native lifetime: decode failure retires the current resource
   (`open` error path); admission happens after `retire` in `publish`, so the
   old logical resource dies before the replacement is known valid.
2. Guest publication: `status === "ready"` gates rendering, so keeping the
   native texture alive alone would NOT implement last-good.

A third latent defect was found (would only bite once the Image stays
mounted): the constant-`src` rebind skip above.

## C. Publication commit point (§6/§7 answer)

```text
CURRENT REFRESH-LIKE SEQUENCE:  open() unconditionally: loading → decode →
  publish{retire → admit → ready|error}; decode failure: retire → error.
CURRENT NEW-ITEM SEQUENCE:      identical — one function, no intent.
PRODUCT CURRENT AUTHORITY:      native CurrentItem (live: Option<LiveResource>,
  request-generation counter).
CANDIDATE AUTHORITY:            DecodedImage → Ui::upload_owned_rgba8 handle.
LAST-GOOD AUTHORITY:            none today — `live` is destroyed on failure.

PUBLICATION COMMIT POINT: the native `self.live = Some(candidate)` swap after
  a successful `upload_owned_rgba8`. Before it, the old publication is still
  authoritative; after it, the candidate is. The guest-visible commit is the
  same-frame rebind under the texture key when the ready event is observed.

OLD HANDLE VALID UNTIL: the guest observation boundary — after a guest frame
  has observed the replacing svc event and rebuilt the draw list, before
  that tick's render. The release NEVER runs at the publication call site:
  `open()`/`retire()` only queue the superseded handle, and freeing lives
  solely in `release_superseded`, which requires an `ObservationBoundary`
  that can only be constructed after `guest.frame` + `surface.tick`
  (CORRECTIVE-1; see §O). No transient stale-handle hole is reachable in
  any call phase.

NEW HANDLE BECOMES VISIBLE WHEN: the frame that observes the replacing
  `ready` renders it — under a texture key that changed, so `setSrc`
  re-resolves. The guest commits exactly ONE binding per turn, against the
  FINAL publication that turn observed (CORRECTIVE-2, §Q); if several
  publications commit before one frame, only the last becomes a binding.
  The rebuild happens inside that same guest.frame() call.

FAILURE POLICY — REFRESH:  keep the old publication live and visible; emit a
  bounded, intent-tagged refresh error observation (PRD §2.10, SPEC §7).
FAILURE POLICY — NEW ITEM: current PRD-permitted policy preserved: retire the
  old publication and publish an error item.

EVENT CONTRACT CHANGE: `loading` and `error` events gain one bounded scalar
  field `intent: "new-item" | "refresh"`. `ready` is unchanged (the observer
  needs no intent to clear a request). No other shape change; no unbounded
  fields; no decoder/backend nouns.

RESOURCE LIFETIME CHANGE: retirement moves from pre-admission to post-commit
  QUEUE, with the physical release at the post-frame observation boundary.
  Refresh failures queue nothing; new-item failures queue the replaced
  publication for release after the guest observes the error item.

MINIMAL MECHANISM: `OpenIntent { NewItem, Refresh }` parameter on
  `CurrentItem::open`; publish reordered to admit → commit → notify → queue
  superseded (release deferred to the observation boundary, §O); guest
  observer split into Publication (last-good) + Request (progress/
  failure); a bounded alternating texture key whose flip is committed once
  per guest turn against the final observed publication (CORRECTIVE-2, §Q).
```

The commit point is unambiguous (a single native assignment), so
implementation proceeds.

## D. Native candidate/current state machine

`native/src/current_item.rs`:

```text
OpenIntent::NewItem | Refresh          (PRD §2.10 product intents)

open(path, intent):
  generation++
  svc_push(loading {g, intent, name})
  decode → prepare:
    Err → NewItem: retire(old) → queue; svc_push(error {g, intent:new-item})
          Refresh: old untouched; svc_push(error {g, intent:refresh})
    Ok  → publish(...)
        → box-fit (giant images only, unchanged)

publish(generation, intent, name, image):
  handle = upload_owned_rgba8(image.rgba MOVE, w, h, linear)
  handle < 0 (real Core rejection):
      NewItem: retire(old) → queue; svc_push(error admission)
      Refresh: old untouched; svc_push(error admission)
  handle ≥ 0:
      COMMIT   live.replace(candidate)         ← publication commit point
      NOTIFY   svc_push(ready {g, handle, w, h, name})
      QUEUE    superseded.push(old.handle)     ← release deferred, §O

OBSERVATION BOUNDARY (Runtime::tick, once per tick, never elsewhere):
  guest.frame(0)   → svcPoll delivers EVERY queued event; commits land in-frame
  surface.tick()   → draw list rebuilt from the guest's post-observation state
  release_superseded(boundary) → free_texture of every queued handle
  … then, outside tick(): hash + renderer.render consume that draw list
```

The moved plane is still the single ownership transfer; the zero-width
rejection path consumes the plane exactly as before. No `publish`/`open`
path ever calls `free_texture` directly — the boundary is the only release
site, enforced by the `ObservationBoundary` token in the API (§O).

## E. Guest observation state machine

`guest/observer.ts` (pure, zero imports; `bun test guest/observer.test.ts`):

```text
ObserverState {
  publication: last-good ready item | null   (generation, handle, w, h, name)
  request:     { generation, intent, status: loading|error } | null
  seenGeneration + seenClosed (stale-event guard)
}

loading(g, intent) → request set; publication untouched
ready(g)           → publication = candidate; request null
error(g, refresh)  → publication PRESERVED; request = error   (PRD §2.10)
error(g, new-item) → publication = null; request = error      (error item)
stale: g < seenGeneration, or g == seenGeneration after its terminal
```

The Product state carries NO view-binding mechanics (CORRECTIVE-2): how a
mounted Image re-resolves the publication handle is rendering realization,
owned by `guest/binding.ts`. `displayVerdict`: a refresh never displaces the
main content (its progress/failure surfaces in the status strip + a bounded
error line); a new-item loading/error does displace it.

Rebinding (`guest/binding.ts` + `guest/turn.ts` + `guest/app.octane.tsx`):
`registerTexture` only updates the framework key→handle map and `setProp`
skips an unchanged `src`, so a commit becomes a VIEW BINDING only when the
frame that presents it renders under a different key. Native Product
commits and guest rendered bindings are different commit domains, so the
binding is reconciled ONCE per guest turn against the FINAL observed
publication: if that publication's identity (generation + handle) differs
from the one the mounted Image resolves, the slot flips (0↔1), the new key
is registered, and the flip is the only thing that can change the rendered
`src` string. N collapsed commits flip the binding once; zero commits flip
it zero times; the framework key map stays bounded at
`picoview-current-0/1`.

## F. Successful refresh sequence (proven ordering)

```text
native tick:   admit(candidate) → COMMIT live=candidate → push ready →
               QUEUE superseded(old)
guest frame:   svcPoll delivers the ready batch → the turn reduces every
               event, commits ONE binding to the FINAL publication →
               register the key → in-frame re-render (framework
               flushUniversalSync drains microtask re-renders inside the
               frame handler) → setSrc → setImage(final handle)
boundary:      release_superseded — free(old) only after the frame that
               observed ready rebuilt the draw list; the old handle can no
               longer be resolved by anything the renderer consumes
draw:          submitted after the boundary; the renderer never sees a
               DrawList that references a freed handle
```

The decisive properties, each owned by one side:

- native: a superseded handle is NOT freed at the commit; it frees only at
  the boundary of the tick whose guest frame observed its replacing event
  (`RequestPhase` keeps every legal commit before that frame);
- guest: that frame renders only the FINAL publication it observed
  (CORRECTIVE-2, §Q), so the frame really has stopped resolving the
  superseded handle when the boundary frees it.

Neither half is sufficient alone: without the native deferral the commit
could free a handle the current draw list still resolves; without the guest
one-binding-per-turn commit the frame could still be bound to an earlier
handle of the same batch (the CORRECTIVE-2 MAJOR).

Tests: `superseded_publication_survives_until_the_observation_boundary`
(commit → old still resolvable → boundary → freed),
`refresh_success_swaps_publication_and_releases_old` (end state).

## G. Decode-failure refresh sequence

`open(corrupt, Refresh)`: no admission is attempted, no retirement happens;
`live_handle` and `Ui::texture(old)` are unchanged and the bounded refresh
error observation is emitted with `intent:"refresh"`.
Test: `refresh_decode_failure_keeps_last_good_published` (plus recovery by
a later successful refresh).

## H. Admission-failure refresh sequence

Smallest real mechanism, no dependency injection: `publish` called with a
crafted zero-width plane that the real Core admission rejects
(`upload_owned_rgba8` returns −1 on `w==0`). Refresh keeps the old resource
live and allocates nothing (slot count unchanged); NewItem deliberately
replaces the publication.
Test: `refresh_admission_failure_keeps_last_good_and_leaks_nothing`.

## I. New-item failure proof

`corrupt_new_item_failure_deliberately_replaces_the_publication`: a corrupt
NEW item retires the previous publication and publishes the error item —
PRD §2.10's deliberately different case, preserved so the refresh fix does
not accidentally become "always keep the old image". The retirement obeys
the same observation-safe rule as a successful replacement (§O): the
replaced publication stays resolvable until the guest has observed the
error event that unmounts it, then frees at the boundary.
Tests: `corrupt_new_item_failure_deliberately_replaces_the_publication`
(full real-decode path), `new_item_failure_release_waits_for_the_
observation_boundary` (cross-platform missing-file path; proves the
temporal contract for error replacement). Guest reducer tests pin the
same split (`new-item failure deliberately publishes the error item`;
`new-item loading displaces the previous image`).

## J. Resource lifetime/leak proof

`repeated_publication_cycles_stay_bounded`: 6 mixed cycles (refresh
success → refresh decode failure → refresh admission failure → new-item
admission failure → new-item success), one observation-boundary release
per commit batch (the runtime's per-tick cadence). After every cycle
exactly one publication is live, the pending-release state is drained to
zero, superseded handles never reappear, and the Core texture slot count
stays flat at its warmed value (free-list reuse; any abandoned handle
would grow it). `two_commits_before_one_boundary_release_every_superseded`
proves the legal worst case — two commits inside one input phase —
releases every superseded handle at the single next boundary with no slot
growth across rounds.

## K. Direct-admission regression proof

- `decoded_allocation_becomes_the_pocketjs_record_backing` re-run PASS:
  the `TexView::pixels` pointer still IS the decoder's original
  allocation (moved, not copied).
- `ordinary_decodes_prepare_as_the_decoder_plane_verbatim` re-run PASS.
- Source sweep at campaign HEAD: no `to_vec`, no `NativeResource`, no
  `AdmissionPlane`, no PSM vocabulary in `native/src/` or `guest/`; the
  remaining `.clone()` calls in `main.rs` are window/Arc plumbing,
  not image planes.
- Release smokes re-run at the corrective HEAD (corrective-1 re-verify,
  2026-09-17, POCKETJS `24bab5e`, AMD Radeon(TM) iGPU / Vulkan / driver
  25.8.1): good image (`smoke-lgp.jpg`, 1153×1198) boot →
  open(handle=Some(0)) → render submit tick 1 → present submitted true;
  corrupt image boot → open(handle=None) → error item render → present
  submitted true. The release boundary executed inside every tick with an
  empty pending state (boot-only open supersedes nothing) — no error, no
  stale-handle log, process exit 0.

## L. Tests

| Suite | Command | Result |
| --- | --- | --- |
| native state machine + oracles | `cd native && cargo test` | 19 passed, 0 failed (16 pre-corrective + 3 corrective-1; `two_commits_before_one_boundary_release_every_superseded` extended for CORRECTIVE-2 with the "final candidate is the publication" assertion) |
| guest observation + binding suites | `bun test guest/` | 34 passed, 0 failed (13 `observer.test.ts` + 11 `binding.test.ts` + 7 `turn.test.ts` + 3 `framework-binding.test.ts`) |
| clippy | `cargo clippy --all-targets` | pre-existing warnings only, byte-identical set before/after (6, all in test-only code; `Refresh` dead-code allowed with named reason) |
| guest bundle | `pocket.ts compile --target windows-app` | pass 2 ok, 345074 bytes |
| release smoke (good) | `picoview.exe … smoke-lgp.jpg` | open handle=Some(0), render tick 1, present ok |
| release smoke (corrupt) | `picoview.exe … corrupt.jpg` | open handle=None, error item, present ok |

CORRECTIVE-2 release smokes (2026-09-17, PicoView head with the
CORRECTIVE-2 guest sources; PocketJS `24bab5e`; Windows 11 10.0.26200;
AMD Radeon(TM) Graphics iGPU / Vulkan / driver 25.8.1; bundle 345074
bytes = the final reviewed bundle). Both smoke inputs were removed from the
tree for the owner's privacy, so the paths are elided in the log below:

```text
good:    [capture removed from current tree for owner privacy] → current item generation=1
         handle=Some(0) → render submit tick 1 → present submitted true;
         the window shows the image fitted to the window (1153 x 1198,
         "Ready") — the new binding path renders, never blank.
corrupt: [capture removed from current tree for owner privacy] → current item generation=1 handle=None →
         render submit tick 1 → present submitted true; the window shows
         the bounded error item ("could not decode image…", status
         "Error") — the NewItem-failure path unmounts the Image and binds
         nothing (publication null → binding null).
```

Both instances were terminated after the render/present sequence had been
observed and the window inspected (these are startup/present smokes, not
graceful-exit runs); no stale-handle, panic, or binding error was logged.
Both were re-run after the review NOTEs were actioned, so the inspected
binaries match the final guest sources. These smokes exercise the
single-commit boot path only (V1 has no runtime refresh trigger); the
multi-commit batch cases remain covered by §Q.4.

Native coverage map (§18): initial success / initial failure /
replacement success / refresh decode failure / refresh admission failure /
refresh success / repeated cycles — one test each; new-item failure is
pinned as deliberately different from refresh. Corrective coverage
(§O.6): superseded-survival-before-boundary, new-item-failure deferral
(real missing-file path, cross-platform), two-commits-before-one-boundary
bounded sequence, pending==0 on both refresh failure kinds, per-cycle
boundary drain inside the cycles test.

Guest coverage map (§19): READY(A); READY(A)+REFRESH_LOADING(B);
+REFRESH_ERROR(B); READY(A)+REFRESH_LOADING(B)+READY(B);
READY(A)+NEW_ITEM_LOADING(B)+NEW_ITEM_ERROR(B); stale generations;
unknown intent; multi-ready collapse to the final publication; no
view-binding mechanics in the Product state; viewport events; malformed
lines. Binding coverage (§Q.4): the two/three/N-commit batch oracles,
A→B→C→D in one batch, alternating-turn boundedness, refresh-error and
new-item-error interleavings, handle-number reuse, idempotence,
multi-batch-in-one-frame turns, and the framework-level
`setProp`/`registerTexture` mechanism tests.

E2E note (§20): V1 has no runtime refresh trigger (boot-open only), so no
test drives the compiled bundle through a live multi-commit batch. The
temporal oracle is therefore assembled from three real parts, none of them
a stub: (a) the native lifetime tests against the real PocketJS core
(`two_commits_before_one_boundary_release_every_superseded` and
friends), (b) the guest turn/binding oracles driving the exact shipped
loop (`guest/turn.ts`, `guest/binding.ts`), and (c) framework-level tests
that call the real pinned `setProp`/`setSrc`/`registerTexture` to prove an
unchanged `src` resolves nothing and a flipped key resolves the new
handle. An interactive refresh path arrives with the navigation slice and
will exercise this contract live.

## M. Adversarial review 1 (pre-corrective) — verdict REVOKED

Fresh-context reviewer, 17 attack vectors, all traced with file:line
evidence against this branch and the locked PocketJS revision; reviewer
independently re-ran both test suites (16 native + 12 reducer, all pass)
and re-verified the framework claims (surface svc queue lossless,
`free_texture` generation-bump, `set_image` stale-handle ignore,
`Map.set` overwrite semantics) at `24bab5e`.

Original verdict: PASS — 0 blocker, 0 MAJOR. **REVOKED by
PICOVIEW-LAST-GOOD-PUBLICATION-1-CORRECTIVE-1**: reviewer note 1 below
described a real MAJOR, not a non-blocking limitation — the post-commit
release was safe only for call sites that open before the guest frame,
and `OpenIntent::Refresh` is Product infrastructure whose lifetime
contract must not depend on an undocumented future call-site convention.
The temporal precondition is now eliminated structurally (§O).

1. (PROMOTED TO MAJOR → RESOLVED, §O) The post-commit release argument
   was call-site-dependent: it held for the boot call site (and the
   natural future input-processing placement), but `open()` invoked
   between `guest.frame` and render in one tick could raster one DrawList
   against a freed handle — bounded to a blank image by Core's
   stale-handle semantics (resolves to nothing), never garbage/crash.
   Corrected: the release no longer runs at the call site at all; it runs
   only at the post-frame observation boundary (§O).
2. `isGeneration` accepts non-integers (dead robustness headroom; the
   real emitter never produces them). Non-blocking.
3. Error requests carry no `name`, so the header hides the file name on
   an error verdict — byte-for-byte the pre-branch behavior.
   Non-blocking.
4. `bounded()` caps chars, not bytes (pre-existing trait; the added
   intent field costs ~25 bytes on loading/error lines). Non-blocking.

## N. Residuals

- No runtime refresh/new-item trigger exists in V1 (boot-open only); the
  refresh paths are exercised by the state-machine and reducer tests plus
  release smokes. The navigation slice that introduces a live trigger can
  construct `RequestPhase::before_guest_frame()` at its input-processing
  site and inherits the full ordering guarantee without preserving any
  undocumented convention (§O.4).
- The remaining R3 differentials (truthful full-resolution capability,
  generic color/alpha admission) are untouched, per campaign scope.
- `docs/ARCHITECTURE.md`/`AGENTS.md` cross-repo governance wording was
  aligned as the §0 prerequisite (commit `f702922`), exactly 2 lines.

## O. CORRECTIVE-1 — deferred superseded release at the observation boundary

Scope: PicoView Product/Image only (`native/src/current_item.rs`,
`native/src/main.rs`). PocketJS untouched (lock still `24bab5e`);
guest reducer untouched.

### O.1 Mechanism

PRODUCT PUBLICATION COMMIT and SUPERSEDED LOGICAL RESOURCE RELEASE are
separate transitions:

```text
CurrentItem {
    live:       Option<LiveResource>,   // the published candidate
    superseded: Vec<i32>,               // bounded pending-release state
}

publish success:  live.replace(candidate) → ready event → superseded.push(old)
retire (NewItem failure): live.take() → superseded.push(removed)
release_superseded(surface, ObservationBoundary): drain + free_texture each
```

Two zero-sized proof tokens encode the phases in the API:

- `RequestPhase` — parameter of `open` and `retire`. Constructible only at
  the sanctioned commit points (boot, runtime input processing), both
  strictly before a tick's guest turn.
- `ObservationBoundary` — parameter of `release_superseded`. Constructible
  only after `Runtime::tick` completes `guest.frame` + `surface.tick`.

A publication committing between `guest.frame` and the same tick's release
boundary — the revoked §M.1 hazard — therefore requires a deliberate,
greppable fabrication of a token whose name states the phase it grants;
it is no longer an invisible call-site convention. Both tokens are
`pub(crate)` zero-sized (the boundary token must be, since `tick`
legitimately constructs it), so the gate's strength is named-token
friction in review, the strongest in-crate gate without restructuring
constructor scope; no production code constructs `RequestPhase` anywhere
except boot.

### O.2 Why this boundary is the smallest safe one

Verified directly in the locked PocketJS source (`24bab5e`):

1. `svcPoll` drains the ENTIRE svc queue per call
   (`pocket-ui-surface/src/surface.rs:554`), and the octane frame handler
   polls until the queue is empty — so a guest frame observes every event
   queued before it, exactly once, in order.
2. The frame's commits land in that frame
   (`framework/src/index-octane.ts:225`: `flushUniversalSync` drains the
   microtask re-renders, `runSweep` commits).
3. `UiSurface::tick` is contractually "after the guest turn, before
   rendering" (`surface.rs:268`) and runs the relayout that finalizes the
   draw list (`engine/core/src/lib.rs:1329`).
4. The draw list is read only after `Runtime::tick` returns — by
   `Runtime::hash` (`main.rs`, `ui.draw().words` for change detection) and
   by `renderer.render` (`native/src/gpu.rs:105`, words cloned then
   rasterized). Both run strictly after the boundary in the same loop
   iteration.

Therefore: after `guest.frame` + `surface.tick`, the draw list reflects
every replacing event already queued, so every handle in `superseded` is
unreferenced by anything the renderer can consume. Freeing earlier (at the
commit) is the revoked behavior; freeing later would only grow the pending
state.

### O.3 Boundedness of the pending state

The pending Vec holds at most the publications committed between two
consecutive boundaries. It cannot accumulate across ticks: the boundary is
the tail of every `Runtime::tick` and drains fully, and commits happen
only on the runtime thread between boundaries (single-threaded). With the
designed call sites (boot: once, supersedes nothing; future input-phase
triggers: at most one open per drained input event) the state is empty at
rest and holds the opens coalesced into one input phase in the legal
worst case — proven by
`two_commits_before_one_boundary_release_every_superseded`. A hard cap
would force either an early free (re-opens the hole) or a leak; neither
is acceptable, so the bound is structural (per-window) rather than a
magic number, and no ack protocol is needed.

### O.4 Phase timeline — every CurrentItem transition call site

The precise safety invariant: a boundary drain is safe iff every queued
handle's replacing svc event was observed by a guest frame that completed
before that boundary. `RequestPhase` + `ObservationBoundary` make every
legal transition satisfy it structurally:

```text
runtime loop iteration (run_runtime, native/src/main.rs):

  BEFORE_GUEST_FRAME   input/request processing (Input drain) + boot open
                       → LEGAL open phase (designed). `RequestPhase` is
                       constructed exactly here and at boot. The replacing
                       event is observed by THIS tick's frame; the release
                       waits for this tick's boundary.
  DURING_GUEST_FRAME   guest.frame(0): no native open call site exists (the
                       guest emits no requests in V1), and an `open()` here
                       would require fabricating a `RequestPhase` — a
                       named, greppable misuse of a token whose
                       constructor name states the phase it grants.
  AFTER_GUEST_FRAME_
  BEFORE_RENDER        Runtime::tick tail: release_superseded(boundary) —
                       THE only free site. No open call site exists in the
                       tick→hash→render window, and an `open()` here would
                       equally require fabricating a `RequestPhase`. The
                       reviewer's hypothetical insert between
                       `guest.frame` and the boundary is exactly what the
                       token targets: its superseded handle could
                       otherwise have been drained by the same boundary
                       unobserved.
  AFTER_RENDER         window-thread present path: no CurrentItem call
                       site exists (textures live on the runtime thread);
                       the present path consumes a self-contained GPU
                       snapshot rasterized before the target was shipped,
                       and cannot resolve handles at all.
```

Enforcement is code order plus the API shape: every LEGAL Product
transition (`open`/`retire`) requires a `RequestPhase` — constructed at
boot and in the runtime's input/request step, i.e. before the tick's guest
frame — and `release_superseded` requires an `ObservationBoundary`
constructible only at the tick tail; the renderer's draw-list reads happen
only after `tick` returns. The tokens are review friction: they make the
phase explicit and greppable, so an illegal phase is a deliberate named
fabrication rather than an invisible call-site convention. They are NOT a
type-system proof of wall-clock phase, and no claim here — or test — covers
a deliberately fabricated illegal `RequestPhase`.

### O.5 The adversarial case, proven

```text
frame N guest state draws OLD; a publication removal commits before the
next tick's guest turn; OLD must stay resolvable until that frame has
observed the replacing event and rebuilt the draw list; the renderer must
never raster a DrawList referencing OLD after OLD is freed.
```

- Commit BEFORE frame N+1 (input phase or boot — every legal call site):
  frame N+1 observes the ready/error event, commits its binding to the
  replacing publication (§Q), and the boundary frees OLD before render
  N+1. DrawList at render N+1 references the replacement. ✓
- Commit AFTER frame N+1's guest turn (the illegal phase): this is NOT a
  legal Product transition — `RequestPhase` is only constructible before
  the guest turn, so such a call is a fabricated token and is explicitly
  out of contract. The mechanism does not claim, and its evidence does not
  assert, that a fabricated commit is deferred-then-safe; the token exists
  precisely so that this is a named misuse rather than an assumed-sound
  window.
- NewItem failure instead of ready: the error event unmounts the Image on
  observation (verdict error, reducer §E); the replaced publication frees
  at the same post-observation boundary
  (`new_item_failure_release_waits_for_the_observation_boundary`). ✓
- Two commits before any frame: both superseded handles survive to the
  next boundary and free there; the guest's single turn-level binding
  commit resolves to the batch's final publication, never to an
  intermediate or superseded one
  (`two_commits_before_one_boundary_release_every_superseded` natively,
  the batch oracles of §Q.4 on the guest side). ✓

### O.6 Corrective tests

| Test | Proves |
| --- | --- |
| `superseded_publication_survives_until_the_observation_boundary` | commit → old resolvable, pending 1 → boundary → freed, candidate live |
| `new_item_failure_release_waits_for_the_observation_boundary` | error replacement defers the release to the boundary (cross-platform real error path) |
| `two_commits_before_one_boundary_release_every_superseded` | worst-case coalesced commits drain fully at one boundary, no slot growth |
| `replacement_success_admits_candidate_before_releasing_old` (extended) | old stays resolvable between commit and boundary |
| `corrupt_new_item_failure_deliberately_replaces_the_publication` (extended) | temporal assertions on both failure paths |
| `refresh_decode_failure_keeps_last_good_published` (extended) | pending stays 0 on decode failure; recovery defers correctly |
| `refresh_admission_failure_keeps_last_good_and_leaks_nothing` (extended) | pending stays 0 on admission failure |
| `refresh_success_swaps_publication_and_releases_old` (extended) | old resolvable before boundary; freed exactly there |
| `repeated_publication_cycles_stay_bounded` (extended) | per-cycle boundary drain, pending==0, slot count flat |

Direct-admission oracles re-run unchanged:
`decoded_allocation_becomes_the_pocketjs_record_backing` (pointer
identity) and `ordinary_decodes_prepare_as_the_decoder_plane_verbatim`
both PASS at the corrective HEAD.

## P. Fresh adversarial review 2 (post-corrective-1) — verdict REVOKED

**Scope of this revocation:** the review below verified the NATIVE
deferred-release mechanism and the phase gating, and those findings still
stand. Its PASS is revoked as a whole-branch verdict because its attack
list did not include the guest binding commit domain: the then-current
guest flipped the texture-key slot once per `ready` EVENT, so an even
number of publications collapsed into one guest turn ended back on the
mounted key and the mounted Image kept resolving a superseded handle that
the (correct) native boundary then freed. A fresh review found that as a
MAJOR; `-CORRECTIVE-2` fixes it (§Q) and the re-review is §R.

Fresh-context reviewer against the corrective HEAD, locked PocketJS
`24bab5e` (checkout HEAD and all six git deps verified equal to the lock).
The reviewer independently re-ran both suites (19 native + 12 reducer,
pass) and re-verified the five load-bearing framework facts at source
level, including two beyond this document: the wgpu backend resolves
TEX_QUAD handles at encode time with exact generation-tagged matching
(stale draws nothing, `pocket-ui-wgpu/src/render.rs:429`), and the
framework never frees registered image textures — `release_superseded`
is the system-wide sole free path for Current Item handles.

Attack results (8 vectors): open-after-guest.frame, new-item error while
the old Image is mounted, two commits before one boundary, pending leak,
queue growth, free-before-rebind, stale DrawList/present path, and
direct-admission regression — all NOT exploitable, each traced to
file:line. The present path was specifically confirmed to consume a
self-contained GPU snapshot rasterized on the runtime thread before
shipment (`gpu.rs` rasterizes into the target's own wgpu texture and
submits before the target crosses the channel), so window-thread
presentation cannot resolve handles at all.

Findings: **0 BLOCKER, 0 MAJOR, 3 NOTE**:

1. [NOTE → actioned] The release-boundary drain-all meant an `open()`
   inserted inside `Runtime::tick` between `guest.frame` and the boundary
   would have freed at the same boundary unobserved (the revoked §M.1
   hazard, unreachable, benign failure mode). **Corrected in this
   corrective**: `RequestPhase` gating (§O.1, §O.4) turns that insert
   into a named, greppable token fabrication; §O.2.4 also now names
   `hash()` alongside render as a post-tick draw-list reader. The delta
   re-verify confirmed the gate closes the shipped code path and
   weakened nothing.
2. [NOTE] No automated test pins the run_runtime phase order
   (tick → boundary → hash → render); it is enforced by code structure,
   and the unit tests cover the queue/boundary mechanism with honest,
   falsifiable temporal assertions (real `Ui::texture` resolvability
   before the boundary, absence after). Acknowledged in §L E2E note.
3. [NOTE] Framework-inherent: 11-bit texture generation wraps per slot
   after 2048 cycles; traced end-to-end — no PicoView state holds a
   superseded handle past one boundary, so no stale-aliasing path exists.

A follow-up delta re-verification by the same reviewer (after the
`RequestPhase` hardening) confirmed: the gated window is closed in
shipped code, every call site is gated (tests exercise the real
production constructor), mechanism bodies are unchanged apart from phase
threading, 19 native tests pass, and the honest gate-strength caveat
(`pub(crate)` named-token friction, not type-system exclusion) recorded
above.

Verdict: **PASS — 0 unresolved BLOCKER, 0 unresolved MAJOR.**

## Q. CORRECTIVE-2 — guest binding commit boundary

Scope: PicoView guest only (`guest/observer.ts`, `guest/binding.ts`,
`guest/turn.ts`, `guest/app.octane.tsx`, tests). PocketJS untouched (lock
still `24bab5e`); the CORRECTIVE-1 native mechanism is preserved unchanged
(`superseded` Vec, `RequestPhase`, `ObservationBoundary`,
`release_superseded` at the `Runtime::tick` tail, NewItem deferred
retirement, refresh last-good).

### Q.1 The defect

`Publication.bindSlot` flipped on every observed `ready` event and
`app.octane.tsx` registered each ready publication immediately, deferring
the actual re-render until the svc batch was fully processed. Several
native publications can commit between two guest frames, and one guest
turn reduces all of their events — so this legal sequence was broken:

```text
rendered:   A under picoview-current-0
before the next guest frame:  native commits B, then C
one svc batch:  loading B, ready B, loading C, ready C
reduce ready B → bindSlot 1, register key1 → B
reduce ready C → bindSlot 0, register key0 → C   (map only; no render of B)
after the batch: setRevision → ONE render
final JSX src = picoview-current-0 = the src already mounted
→ setProp skips the unchanged value → setSrc never re-runs
→ the mounted native Image node still resolves handle A
→ the CORRECTIVE-1 boundary legitimately frees A and B
→ the DrawList can reference freed A (blank frame)
```

Root cause is an authority mismatch, not a nonce-width problem:
**native Product publication commits != guest rendered-binding commits.**
More slots only move the wrap interval; three or N keys fail at 3 or N
collapsed commits. The nonce was attached to the wrong commit domain.

### Q.2 Mechanism

PRODUCT observation and VIEW-BINDING realization are separate:

```text
ObserverState.publication = pure Product fact
    { generation, handle, width, height, name }      (no bindSlot)
GuestTurnState.binding = rendering fact only
    { generation, handle, slot: 0|1 } | null
```

One guest turn (`guest/turn.ts`, the loop `app.octane.tsx` actually ships):

```text
for each queued svcPoll batch:            reduce every event in order
                                          (Product correctness: every
                                           staleness race is decided
                                           per event)
THEN, once per turn:
    reconcileBinding(bound, final publication):
        identity equal            → no flip, no register
        identity differs          → slot = opposite(bound.slot)
                                    (or 0 when nothing is bound)
                                    register key(slot) → handle
                                    binding = {new identity, slot}
        publication null          → binding = null (Image unmounts)
```

Then — and only then — the turn schedules the render under the reconciled
slot. The rendered `src` string therefore ALWAYS differs from the mounted
one when a rebind is needed, and never differs when the publication did
not move:

```text
0 native commits in a turn   → src unchanged
1 native commit              → src flips once
2 native commits             → src flips once
N native commits             → src flips once
```

Bound-before-render ordering: `registerTexture` runs before the
`setRevision` flush, and the flush is where `setSrc` resolves the key
(framework contract, §B) — the registered handle is the one the frame
renders. Verified at the locked revision: the octane sync boundary runs
the frame hooks and then drains the render wave they scheduled in the same
pass, looping until no root remains scheduled
(`octane/dist/universal-core.js:6720` `runUniversalSyncBoundary`, called
from `framework/src/index-octane.ts:225`), so the render this turn
scheduled is committed inside the same `guest.frame()` — before
`surface.tick` rebuilds the draw list and before the native release
boundary runs.

### Q.3 Boundedness and the key namespace

Exactly two texture keys (`picoview-current-0/1`) remain sufficient,
because the slot flips per RENDERED publication transition rather than per
native event. A generation-derived key would grow the framework key→handle
map without an unregister mechanism, and is deliberately not used. The
registry holds at most two entries; the invariant "the rendered key always
resolves the current publication" holds because a reconciliation writes
only the previously-non-current slot (the write and the slot change are
the same event), so the current slot's entry cannot be overwritten while
it is current.

### Q.4 Corrective tests

| Test | Proves |
| --- | --- |
| `two commits in one turn flip the binding exactly once (A -> B -> C)` | the exact review scenario: final publication C, one flip, src string changes, mounted node resolves C |
| `any number of collapsed ready events flips the binding exactly once` | 1..8 ready events per turn: one flip, correct final handle, no even-count wrap |
| `A -> B -> C -> D inside one batch still renders only A -> D` | intermediate publications never become bindings |
| `two-commit batch oracle: the drawn handle survives the boundary free` | after the native boundary frees A and B, the drawn handle is C, not a superseded one |
| `refresh error after an intermediate success binds the intermediate publication` | A → READY(B) → REFRESH_ERROR(C): Product publication is B, binding moves A → B once |
| `new-item error after an intermediate success unmounts instead of binding` | A → READY(B) → NEW_ITEM_ERROR(C): publication null, Image unmounts, no registration for B |
| `refresh loading alone never flips the binding` | a view/request-only turn leaves the binding and src untouched |
| `reconciliation is idempotent for an unchanged publication` | re-running a turn over the same publication flips nothing |
| `a reused handle number from a newer generation is still a new binding` | identity is generation+handle; freed-handle reuse is a new binding |
| `alternating turns keep flipping between exactly two keys` | namespace stays bounded at two keys and two registry entries |
| `negative control: per-event key flipping would re-mount the stale handle` | the test would catch the superseded per-event model |
| `two svc batches in one frame commit exactly one binding` | the commit boundary is the TURN: per-batch commits would reintroduce the MAJOR one level up |
| `three batches in one frame still commit exactly one binding` | same, at the next parity |
| `an empty drain changes nothing and schedules no render` | idle turns are no-ops |
| `null and empty batches terminate the drain instead of throwing or spinning` | a future host's null/"" batch cannot throw inside the frame hook or hang the drain |
| `a turn with no Publication change schedules no render and no register` | refresh loading: status render, no rebind |
| `malformed and foreign lines are skipped without disturbing the binding` | robustness cannot move the binding |
| `the turn is the only place a binding moves (no double register)` | repeat turns do not re-register |
| `an unchanged src does not re-resolve the mounted handle` | FRAMEWORK-LEVEL: the real pinned `setProp`/`setSrc` skips on an unchanged key even when the registry moved |
| `a flipped slot re-resolves the node to the reconciled publication` | FRAMEWORK-LEVEL: the flipped key really calls `setImage(new handle)` on the real path |
| `a full image node unmount/remount cycle is always a fresh src` | a remount applies its src regardless of key repetition |
| `publication carries no view-binding mechanics` (`observer.test.ts`) | the semantic split is enforced in the Product state |
| `several ready events in one turn collapse to the final publication` | the reducer has no per-event binding machinery |
| `guest_texture_key_matches_host_hint` (native, tightened) | the host hint and the guest key owner (`guest/binding.ts`) stay one contract, and the single Image render site resolves the reconciled binding (`src={textureKeyFor(bound.slot)}`) rather than a publication field or a hand-rolled key |

### Q.5 Honest statement of the guarantee

For every turn, the guest commits at most one binding, for the final
publication that turn observed. Combined with the native rule (superseded
handles stay resolvable until the boundary of the tick whose frame
observed the replacing event), no legal Product transition can free a
publication while a renderable guest state still references it.

Not claimed: safety for a fabricated illegal `RequestPhase`; end-to-end
execution of the compiled bundle through a live multi-commit batch (V1 has
no runtime trigger — see §L E2E note).

## R. Fresh adversarial review 3 (post-CORRECTIVE-2)

Fresh-context reviewer against the CORRECTIVE-2 head, locked PocketJS
`24bab5e` (PicoView worktree and the PocketJS checkout both verified). The
reviewer re-ran every suite itself, re-verified the framework facts at
source level, and — beyond reading — built its own harnesses outside the
repository: a model fuzz (400 seeds x 60 ticks = 24 000 ticks, 16 486 of
them with a mounted image, generation-tagged handle model) and a real-bundle
driver that executed the compiled `dist/picoview.js` for ~4 500 frames with
a recording native-ops layer, checking after every frame that the mounted
Image node resolved the handle the native model considered live.

Verdict: **PASS — 0 BLOCKER, 0 MAJOR, 4 NOTE.**

Attack results (12 vectors, each traced to file:line): two `ready` in one
batch; three `ready` in one batch; even-number wrap (2/4/6/8 collapsed
commits); intermediate publication never rendered; `new-item` error after an
intermediate success; `refresh` error after an intermediate success; final
`src` string equal to the mounted one under a changed identity (searched
directly, including a power check showing the pre-corrective code fails the
same oracle); registry moved but node not rebound; A/B freed while the
DrawList still references A; key-namespace growth (max registry 2 over the
fuzz); native deferred-release regression (comment-stripped diff: no
mechanism change); plus extra surface (multi-batch turns, `changed`
semantics, mount ordering, resize-only turns, malformed lines, duplicate
generations, leftover `bindSlot` consumers). **All NOT EXPLOITABLE**, and
the reviewer additionally confirmed the pre-change code fails its own
oracle — i.e. the new oracles have power over the defect they target.

Dispositions of the four NOTEs:

1. [NOTE → documentation] The inactive slot's registry entry can still name
   a superseded (freed) handle; harmless because nothing renders an
   inactive slot (a freed handle resolves to nothing in Core, never wrong
   pixels). **Actioned**: the invariant is now named on `BoundPublication`
   in `guest/binding.ts`, with the rule that a future second consumer must
   reconcile through the module rather than resolve an inactive slot.
2. [NOTE → actioned] The drain terminator recognised only `undefined`; a
   future host returning `null` would throw inside the frame hook and `""`
   would spin. **Actioned**: `runGuestTurn` now terminates on
   `null`/`""` as well, with a test pinning it.
3. [NOTE → actioned] §Q.4's row for the native key-hint test overstated what
   a source-text assertion proves. **Actioned**: the test now pins the exact
   single render site (`src={textureKeyFor(bound.slot)}`) and the §Q.4 row
   states exactly that; the behavioural coverage lives in the guest suites.
4. [NOTE → resolved] The smoke block added after the docs commit made §0's
   `WORKTREE: clean` momentarily untrue. **Actioned**: committed with this
   section; the final head's tree is clean.

Residual uncertainty recorded by the reviewer, unchanged here: V1 has no
native multi-commit runtime trigger, so the multi-commit cases are proven by
the native unit oracles plus the real-guest-bundle harness, not by a live
native session; the corrupt-image smoke was not re-run by the reviewer (the
author ran both smokes against the final reviewed bundle after the NOTEs
above were actioned, §L); and the bundle the reviewer inspected predates the
docs commit, with byte-for-byte reproducibility from the reviewed sources
verified.

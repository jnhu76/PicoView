# PICOVIEW-LAST-GOOD-PUBLICATION-1 — Evidence

Campaign: refresh/last-good publication ordering (R3). Product/Image
correction in PicoView only; PocketJS untouched.

## 0. Chain of custody

```text
BASE_SHA:            879f4c3 (PicoView main at campaign start)
BRANCH:              fix/last-good-publication-1
CORRECTIVE-1 BASE:   7436f89 (pre-corrective branch head; its PASS revoked)
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

NEW HANDLE BECOMES VISIBLE WHEN: the frame that observes `ready` rebinds the
  texture key and rebuilds the DrawList — within one guest.frame() call.

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
  failure) with a per-publication ping-pong texture key for mounted-Image
  rebinding.
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
  publication: last-good ready item | null
  request:     { generation, intent, status: loading|error } | null
  seenGeneration + seenClosed (stale-event guard)
  nextBindSlot: 0|1 (publication bind nonce)
}

loading(g, intent) → request set; publication untouched
ready(g)           → publication = candidate (bindSlot flips); request null
error(g, refresh)  → publication PRESERVED; request = error   (PRD §2.10)
error(g, new-item) → publication = null; request = error      (error item)
stale: g < seenGeneration, or g == seenGeneration after its terminal
```

`displayVerdict`: a refresh never displaces the main content (its
progress/failure surfaces in the status strip + a bounded error line); a
new-item loading/error does displace it.

Rebinding (`guest/app.octane.tsx`): `registerTexture` only updates the
framework key→handle map and `setProp` skips an unchanged `src`, so the
guest binds each publication under `picoview-current-<bindSlot>` (two
alternating keys; the map stays bounded at two entries) and passes that key
as `src` — a commit changes the string, forcing `setSrc` → `setImage` with
the new handle before that frame's DrawList.

## F. Successful refresh sequence (proven ordering)

```text
native tick:   admit(candidate) → COMMIT live=candidate → push ready →
               QUEUE superseded(old)
guest frame:   svcPoll delivers ready → register new key → in-frame re-render
               (framework flushUniversalSync drains microtask re-renders
               inside the frame handler) → setSrc → setImage(new handle)
boundary:      release_superseded — free(old) only after the frame that
               observed ready rebuilt the draw list; the old handle can no
               longer be resolved by anything the renderer consumes
draw:          submitted after the boundary; the renderer never sees a
               DrawList that references a freed handle
```

The decisive property: even if the publication commit runs AFTER a guest
frame but before that frame's render (the adversarial phase), the old
handle is NOT freed at the commit — it frees only at the NEXT tick's
boundary, after a frame has observed the ready event. The DrawList that
rasterized in between resolved the still-live old handle (last-good
visibility), never a freed one.

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
| native state machine + oracles | `cd native && cargo test` | 19 passed, 0 failed (16 pre-corrective + 3 corrective) |
| guest observer reducer | `bun test ./guest/observer.test.ts` | 12 passed, 0 failed |
| clippy | `cargo clippy --all-targets` | pre-existing warnings only (Refresh dead-code allowed with named reason) |
| guest bundle | `pocket.ts compile --target windows-app` | pass 2 ok, 343912 bytes |
| release smoke (good) | `picoview.exe … smoke-lgp.jpg` | open handle=Some(0), render tick 1, present ok |
| release smoke (corrupt) | `picoview.exe … corrupt.jpg` | open handle=None, error item, present ok |

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
unknown intent; bind-slot alternation; viewport events; malformed lines.

E2E note (§20): V1 has no runtime refresh trigger (boot-open only), so the
frame-level oracle rests on (a) the framework flush ordering citation
(§B), (b) the native lifetime tests, (c) the reducer tests, and (d) the
release smokes above; an interactive refresh path arrives with the
navigation slice and will exercise this contract live.

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

Enforcement is code order plus the API shape: `open`/`retire` require a
`RequestPhase` constructible only BEFORE_GUEST_FRAME; `release_superseded`
requires an `ObservationBoundary` constructible only at the tick tail; the
renderer's draw-list reads happen only after `tick` returns. Safety does
not rest on any caller remembering a convention.

### O.5 The adversarial case, proven

`frame N guest state draws OLD; candidate NEW commits at the latest legal
point; OLD must stay resolvable until a guest observation boundary
installs NEW; the renderer must never raster a DrawList referencing OLD
after OLD is freed`:

- Commit BEFORE frame N (input phase or boot): frame N observes ready,
  rebinds, boundary frees OLD before render N. DrawList at render N
  references NEW. ✓
- Commit AFTER frame N, BEFORE render N (the revoked phase): render N
  still draws the DrawList referencing OLD — OLD is live (queued, not
  freed), so it resolves and renders last-good. Frame N+1 observes ready,
  rebinds to NEW; boundary N+1 frees OLD; render N+1 references NEW. No
  frame ever resolves a freed handle. ✓
- Commit AFTER render N: identical to the previous case shifted one
  boundary later. ✓
- NewItem failure instead of ready: the error event unmounts the Image on
  observation (verdict error, reducer §E); the replaced publication frees
  at the same post-observation boundary
  (`new_item_failure_release_waits_for_the_observation_boundary`). ✓
- Two commits before any frame: both superseded handles survive to the
  next boundary and free there
  (`two_commits_before_one_boundary_release_every_superseded`). ✓

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

## P. Fresh adversarial review 2 (post-corrective)

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

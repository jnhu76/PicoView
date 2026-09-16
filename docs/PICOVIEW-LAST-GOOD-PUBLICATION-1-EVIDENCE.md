# PICOVIEW-LAST-GOOD-PUBLICATION-1 — Evidence

Campaign: refresh/last-good publication ordering (R3). Product/Image
correction in PicoView only; PocketJS untouched.

## 0. Chain of custody

```text
BASE_SHA:            879f4c3 (PicoView main at campaign start)
BRANCH:              fix/last-good-publication-1
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

OLD HANDLE VALID UNTIL: post-commit release. Freeing happens on the runtime
  thread before the guest's next frame; the guest cannot draw in between
  (events are drained at frame start; re-renders flush in-frame before draw
  submission — see §B). No transient stale-handle hole is reachable.

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

RESOURCE LIFETIME CHANGE: retire moves from pre-admission to post-commit.
  Refresh failures retire nothing; new-item failures retire deliberately.

MINIMAL MECHANISM: `OpenIntent { NewItem, Refresh }` parameter on
  `CurrentItem::open`; publish reordered to admit → commit → notify → release;
  guest observer split into Publication (last-good) + Request (progress/
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
    Err → NewItem: retire(old); svc_push(error {g, intent:new-item})
          Refresh: old untouched; svc_push(error {g, intent:refresh})
    Ok  → publish(...)
        → box-fit (giant images only, unchanged)

publish(generation, intent, name, image):
  handle = upload_owned_rgba8(image.rgba MOVE, w, h, linear)
  handle < 0 (real Core rejection):
      NewItem: retire(old); svc_push(error admission)
      Refresh: old untouched; svc_push(error admission)
  handle ≥ 0:
      COMMIT   live.replace(candidate)         ← publication commit point
      NOTIFY   svc_push(ready {g, handle, w, h, name})
      RELEASE  free_texture(old.handle)        ← post-commit, same tick
```

The moved plane is still the single ownership transfer; the zero-width
rejection path consumes the plane exactly as before.

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
native tick:   admit(candidate) → COMMIT live=candidate → push ready → free(old)
guest frame:   svcPoll delivers ready → register new key → in-frame re-render
               (framework flushUniversalSync drains microtask re-renders
               inside the frame handler) → setSrc → setImage(new handle)
draw:          submitted after the rebind; the old handle is never resolved
               after its free because the guest cannot draw between the
               native release and the same-frame rebind
```

Test: `refresh_success_swaps_publication_and_releases_old` (old freed,
candidate live with candidate bytes).

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
not accidentally become "always keep the old image". Guest reducer tests
pin the same split (`new-item failure deliberately publishes the error
item`; `new-item loading displaces the previous image`).

## J. Resource lifetime/leak proof

`repeated_publication_cycles_stay_bounded`: 6 mixed cycles (refresh
success → refresh decode failure → refresh admission failure → new-item
admission failure → new-item success). After every cycle exactly one
publication is live, superseded handles never reappear, and the Core
texture slot count stays flat at its warmed value (free-list reuse; any
abandoned handle would grow it).

## K. Direct-admission regression proof

- `decoded_allocation_becomes_the_pocketjs_record_backing` re-run PASS:
  the `TexView::pixels` pointer still IS the decoder's original
  allocation (moved, not copied).
- `ordinary_decodes_prepare_as_the_decoder_plane_verbatim` re-run PASS.
- Source sweep at campaign HEAD: no `to_vec`, no `NativeResource`, no
  `AdmissionPlane`, no PSM vocabulary in `native/src/` or `guest/`; the
  remaining `.clone()` calls in `main.rs` are window/Arc plumbing,
  not image planes.
- Release smoke (`real-screenshot.jpg`): boot → open(handle=Some) →
  render → present, no error; visual capture
  `docs/last-good-publication-1/lgp-shot-good.png` shows the image at
  source resolution (1153×1198, "Ready").

## L. Tests

| Suite | Command | Result |
| --- | --- | --- |
| native state machine + oracles | `cd native && cargo test` | 16 passed, 0 failed |
| guest observer reducer | `bun test ./guest/observer.test.ts` | 12 passed, 0 failed |
| clippy | `cargo clippy --all-targets` | pre-existing warnings only (Refresh dead-code allowed with named reason) |
| guest bundle | `pocket.ts compile --target windows-app` | pass 2 ok, 343912 bytes |
| release smoke (good) | `picoview.exe … real-screenshot.jpg` | open handle=Some(0), present ok |
| release smoke (corrupt) | `picoview.exe … corrupt.jpg` | open handle=None, error item, present ok |

Native coverage map (§18): initial success / initial failure /
replacement success / refresh decode failure / refresh admission failure /
refresh success / repeated cycles — one test each; new-item failure is
pinned as deliberately different from refresh.

Guest coverage map (§19): READY(A); READY(A)+REFRESH_LOADING(B);
+REFRESH_ERROR(B); READY(A)+REFRESH_LOADING(B)+READY(B);
READY(A)+NEW_ITEM_LOADING(B)+NEW_ITEM_ERROR(B); stale generations;
unknown intent; bind-slot alternation; viewport events; malformed lines.

E2E note (§20): V1 has no runtime refresh trigger (boot-open only), so the
frame-level oracle rests on (a) the framework flush ordering citation
(§B), (b) the native lifetime tests, (c) the reducer tests, and (d) the
release smokes above; an interactive refresh path arrives with the
navigation slice and will exercise this contract live.

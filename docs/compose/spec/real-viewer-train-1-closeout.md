---
feature: real-viewer-train-1-closeout
status: delivered
updated: 2026-09-17
branch: feat/real-viewer-train-1
commits: 7a0a5e8..6531a95
---

# Real Viewer Train 1 — Current-Capability Closeout

## Report

**What was built** — PR #58 is closed to the strongest truthful viewer the
pinned PocketJS revision (`24bab5e8…`) supports. `set100Percent` now forces
manual scale exactly 1.0 with pan 0,0 (only claimed when
`fullResolution`). Zoom from Fit materializes the real `fitScale` before
stepping (Fit~49% → 0.5, not 125%). Previous/Next resets presentation to
Fit/pan0,0 via a guest-side publication-identity reconcile; refresh of the
same usable geometry preserves view. Rotate/Flip toolbar controls and CSS
transform emission were removed — pure helpers remain as PocketJS precursor
only. Pan helpers stay documented
`PAN_STATE_READY` / `USER_GESTURE_PRECURSOR_REQUIRED`. BrowseSession
ordering uses lowercased name → original name → path; `rebuild()` captures
the old current path before replacing the list. The Windows host now
forwards keyboard events as `{"t":"key",…}` svc lines so Left/Right/R/0/1/+/- are real product operations. Image layout uses PocketJS
`posType: 1` + `insetL`/`insetT` (not CSS `position`).

**Verification** — `bun test guest/` 76 pass; `cargo test` 29 pass;
`cargo build --release` OK; `pocket.ts compile` OK; Windows smoke
A/B/corrupt/D keyboard sequence process-alive with
`next×3 previous×2 refresh` logged, no panic
(`experiments/real-viewer-closeout-1/`). Adversarial review PASS with one
medium (absolute style API) actioned to `posType: 1`.

**Journey log**
- CSS-style `position/left/top` and `transform: rotate()` are not the
  PocketJS PROP contract; wrong style props throw at first Image frame.
- PicoView's own winit host must forward keys — guest shortcuts alone are
  dead code without a host→svc path.
- NTFS cannot host case-fold-colliding filenames; prove `compare_candidates`
  with constructed candidates instead.
- Fit must materialize effective scale before zoom steps, or 1:1/Fit
  placeholders lie about the next step.
- Reviewer medium on `class="absolute"` vs `posType: 1` — prefer the proven
  in-repo pattern.

## [S1] Problem

PR #58 ships a vertical viewer slice whose product claims outrun the pinned
PocketJS revision (`24bab5e`). Concrete defects:

1. `set100Percent()` switches to manual mode without forcing `scale = 1.0`,
   so a prior 200% / Fit placeholder can display as "100%".
2. Fit mode stores a placeholder `scale = 1.0` while the effective fit scale
   may be ~0.49; Zoom +/- therefore jumps to the step after 100% instead of
   the step nearest the effective fit scale.
3. Previous/Next carries the previous image's zoom/pan into the next image.
4. Toolbar ships Rotate / Flip controls that emit CSS transforms the pinned
   PocketJS DrawList does not render (rotated Image quads are culled).
5. Interactive pan is not implemented (no pointer/wheel path) but is not
   documented as a framework precursor gap.
6. `compare_candidates` tie-breaks on the already-lowercased name against its
   own bytes — it cannot distinguish names that collide under case folding.
7. `rebuild()` replaces `candidates` before capturing the old current path,
   then uses `index_path()` which now names the new occupant at that index.
8. The Windows host never forwarded keyboard events to the guest.

## [S2] Design

Scope: **do not modify PocketJS**. Ship the strongest truthful viewer the
current pin supports.

### View geometry

- `set100Percent`: `mode = manual`, `scale = 1.0`, `pan = (0, 0)`. Claimed
  only when `publication.fullResolution === true`.
- Fit remains display-only (`mode = fit`, placeholder `scale = 1.0`).
- Zoom +/- first **materialize** Fit via `fitScale(...)` into manual at the
  effective scale, then step with the existing deterministic `ZOOM_STEPS`.
- Call sites pass optional `ViewGeometry` so materialization is exact.

### Navigation vs refresh view reconciliation

Guest-side only, keyed by publication identity (browse index + name) and
usable geometry (resource size + `fullResolution`):

| Observation | View action |
| --- | --- |
| Different browse index or name | `initialViewState()` (Fit, pan 0,0) |
| Same identity, geometry changed | `resetToFit` (revalidate) |
| Same identity, same geometry | preserve (refresh) |
| No publication | preserve |

Does not touch PR #57 binding/lifetime semantics.

### Capability truth

Shipped toolbar: Previous, Next, Zoom -, Zoom %, Zoom +, Fit, 1:1 (enabled
only when full resolution), Refresh.

Deferred to PocketJS precursor backlog (pure ViewState helpers may remain,
but no product wiring, no CSS `transform: "rotate(...)"` emission):

```text
POCKETJS_GAP_INPUT_GESTURES
  - wheel zoom
  - drag pan
POCKETJS_GAP_TEXTURED_2D_TRANSFORM
  - image rotate
  - image flip
```

Pan helpers stay as prepared presentation logic:

```text
PAN_STATE_READY
USER_GESTURE_PRECURSOR_REQUIRED
```

### BrowseSession

- Order: case-insensitive filename, then original filename representation,
  then full path. Deterministic.
- `rebuild()` captures the old current path **before** replacing
  `candidates`, then re-locates that path; if absent, clamp the previous
  index. Refresh of the current image does not itself rebuild the directory
  listing unless Product asks.

### Host keyboard

PicoView `native/src/main.rs` maps pressed logical keys to guest names
(`left`/`right`/`r`/`0`/`1`/`+`/`-`/…) and pushes
`{"t":"key","k":…,"cmd":…,"ctl":…}` on the svc queue.

## [S3] Out of Scope

- Any PocketJS revision change (`POCKETJS.lock` stays `24bab5e8…`).
- Implementing wheel zoom, drag pan, rotate, or flip product features.
- PicoView-specific GPU/render workarounds or raw wgpu exposure.
- Merging PR #58.

## Tasks

- [x] T1: Fix `set100Percent` + Fit materialized zoom + regressions — acceptance: unit tests from 200%/50%/400%/Fit land exactly 100%; Fit 49% Zoom+ is nearest step >49% (covers: S2)
- [x] T2: Guest navigation view reset keyed by publication identity — acceptance: pure reconcile tests for A→B Fit, refresh preserve, geometry revalidate (covers: S2; depends: T1)
- [x] T3: Remove Rotate/Flip product wiring; document pan precursor — acceptance: toolbar has no rotate/flip; no CSS transform emission; pan labeled precursor (covers: S2)
- [x] T4: Fix BrowseSession compare + rebuild path capture — acceptance: case-fold tie test + rebuild preserves b.jpg after insert aa.jpg (covers: S2)
- [x] T5: Native + guest tests, release build, Windows smoke of A/B/corrupt/D flow — acceptance: smoke sequence no crash, 1:1 exact, navigation Fit (covers: S1; depends: T1, T2, T3, T4)
- [x] T6: PR #58 description truthfulness + closeout — acceptance: features list excludes rotate/flip/wheel/drag; residuals named as PocketJS gaps (covers: S2; depends: T5)

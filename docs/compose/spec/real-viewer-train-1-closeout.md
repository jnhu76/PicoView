---
feature: real-viewer-train-1-closeout
status: in-progress
updated: 2026-09-17
branch: feat/real-viewer-train-1
commits: 7a0a5e8..HEAD
---

# Real Viewer Train 1 — Current-Capability Closeout

## Report

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

## [S3] Out of Scope

- Any PocketJS revision change (`POCKETJS.lock` stays `24bab5e8…`).
- Implementing wheel zoom, drag pan, rotate, or flip product features.
- PicoView-specific GPU/render workarounds or raw wgpu exposure.
- Merging PR #58.

## Tasks

- [ ] T1: Fix `set100Percent` + Fit materialized zoom + regressions — acceptance: unit tests from 200%/50%/400%/Fit land exactly 100%; Fit 49% Zoom+ is nearest step >49% (covers: S2)
- [ ] T2: Guest navigation view reset keyed by publication identity — acceptance: pure reconcile tests for A→B Fit, refresh preserve, geometry revalidate (covers: S2; depends: T1)
- [ ] T3: Remove Rotate/Flip product wiring; document pan precursor — acceptance: toolbar has no rotate/flip; no CSS transform emission; pan labeled precursor (covers: S2)
- [ ] T4: Fix BrowseSession compare + rebuild path capture — acceptance: case-fold tie test + rebuild preserves b.jpg after insert aa.jpg (covers: S2)
- [ ] T5: Native + guest tests, release build, Windows smoke of A/B/corrupt/D flow — acceptance: smoke sequence no crash, 1:1 exact, navigation Fit (covers: S1; depends: T1, T2, T3, T4)
- [ ] T6: PR #58 description truthfulness + closeout — acceptance: features list excludes rotate/flip/wheel/drag; residuals named as PocketJS gaps (covers: S2; depends: T5)

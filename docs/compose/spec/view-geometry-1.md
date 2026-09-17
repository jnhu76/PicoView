---
feature: view-geometry-1
status: in-progress
updated: 2026-09-18
branch: corrective/view-geometry-1
commits: bbda8db50a99d8c35380e8831670219b75f5e962..HEAD
---

# View Geometry Corrective 1

## Report

(empty until delivery)

## [S1] Problem

PicoView view math was fragmented: magic viewport deductions
(`-16`/`-80`), Fit/100% ignored DPI, zoomAt used a wrong center-relative
formula, rotate/flip/wheel/drag were classified as PocketJS gaps, and EXIF
orientation was not materialized.

## [S2] Design

### Capability reality (pin `24bab5e`)

- `PROP.rotate/scaleX/scaleY/originX/originY` exist (`contracts/spec/spec.ts`).
- `emit_tex_quad` transforms image corners and emits `TEX_TRI` when not
  axis-aligned; `pocket-ui-wgpu` consumes `TEX_TRI`.
- Stock `hosts/desktop` forwards `CursorMoved`/`MouseInput`/`MouseWheel` as
  logical `{"t":"mouse"|"scroll"}` svc lines.
- `draw.rs` header still claims rotated IMAGE quads are culled — **stale
  comment**, not implementation. Required PocketJS docs-only patch recorded
  below; not applied on this PicoView branch.

### Coordinate model

```text
S --intrinsic EXIF--> O --user D4--> U --fit/zoom/pan--> L --dpi--> P
```

- Product zoom `z`: 1.0 = Actual Size / 100%.
- Realized logical sample scale = `z / dpiScale`.
- panX/panY: image AABB center offset from image-viewport center (logical).
- User orientation: discrete D4 as PocketJS `{rotate, scaleX, scaleY}` about
  node center (origin 0,0). Flip is defined in the **visible** frame.
- One image viewport: `shell_layout.imageViewport(w,h)` from frozen chrome
  heights. No scattered magic deductions.

### Modules

| Module | Role |
| --- | --- |
| `guest/view_transform.ts` | pure Fit/zoom/pan/D4/DPI geometry |
| `guest/shell_layout.ts` | frozen chrome + canonical image viewport |
| `guest/view_state.ts` | publication reconcile helpers (legacy types kept) |
| `native/src/main.rs` | host mouse/scroll/scale_factor forwarding |
| `native/src/current_item.rs` | EXIF 1–8 materialized into O at decode |

### Invariants preserved

Publication lifetime, last-good refresh, RequestPhase tokens, no image bytes
through QuickJS, no view-only resource mutation. PocketJS pin unchanged.

## [S3] Out of Scope

- PocketJS renderer rewrite / pin change.
- GIF animation, tiled giant-image, HDR.
- Full installer.
- Issue auto-close on GitHub (recorded here; human closes #59).

## PocketJS docs patch (follow-up, not this branch)

In `engine/core/src/draw.rs` header (and `emit_tex_quad` doc comment), replace
the claim that rotated IMAGE quads are conservatively culled with: rotated
textured images are corner-transformed, clipped, and emitted as `TEX_TRI`.

## Tasks

- [x] T0: Verify pin code reality — emit_tex_quad TEX_TRI + desktop mouse/scroll (covers: S2)
- [x] T1: Pure view_transform + D4 + zoomAt invariant + shell viewport (covers: S2)
- [x] T2: DPI view fact + truthful 100% + proxy labels (covers: S2)
- [x] T3: Host pointer/wheel/scale forwarding + guest drag/wheel (covers: S2)
- [x] T4: EXIF 1–8 materialization + Rotate/Flip/Reset UI (covers: S2)
- [ ] T5: Interactive Windows smoke + adversarial review + finalize report (covers: S2; depends: T1–T4)

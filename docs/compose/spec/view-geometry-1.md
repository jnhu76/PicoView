---
feature: view-geometry-1
status: in-progress
updated: 2026-09-18
branch: corrective/view-geometry-1
commits: bbda8db50a99d8c35380e8831670219b75f5e962..HEAD
---

# View Geometry Corrective 1

## Report

### Corrective-2 (pre-smoke adversarial pass)

A fresh-context review of Corrective-1's report raised five risks. Code audit
results on this branch:

| ID | Claim | Verdict | Fix |
| --- | --- | --- | --- |
| MAJOR-1 | `hello.scale` hardcoded 1.0 | **CONFIRMED** | Host measures `window.scale_factor()` after create; `RuntimeStartup.initial_scale` → hello + `Runtime.dpi_scale` |
| MAJOR-2 | svc mouse ≠ PocketJS `onPress` | **CONFIRMED** | `guest/pointer_press.ts` + `@pocketjs/framework/input` hit/press wiring; toolbar ToolButtons now mouse-clickable |
| MAJOR-3 | EXIF × fullResolution S/O mixup | **NOT A BUG** | `decode_jpeg` materializes O inside `DecodedImage`; `open()` compares O vs O. Locked by `exif_oriented_decode_keeps_full_resolution_in_o_space` |
| MAJOR-4 | D4 16 representational states | **CONFIRMED (latent)** | `normalizeOrientation` folds the `Rot(θ)∘Scale ≡ Rot(θ+180)∘Scale(-sx,-sy)` kernel onto 8 canonical tuples; ops call it |
| MAJOR-5 | release outside strands `down` | **MITIGATED + cancel** | winit/Win32 mouse capture + `Focused(false)` now sends `"cancel":true` (not a release that can fire onPress); guest `pointer_press.cancel()` drops the owner without activate; drag clears on cancel or `d:false` |

### PR60 integration collision (do not merge both branches as-is)

```text
main
 ├── feat/windows-shell-ui-polish-1   (PR #60: embed, GUI subsystem, associations, keyboard gate)
 └── corrective/view-geometry-1       (this branch: ViewState, DPI, EXIF, input, rotate/flip)
```

Real shared files (adversarial-2 correction — not observer/turn/view_state on
PR60): both rewrite `guest/app.octane.tsx`, `native/src/main.rs`, and
`native/src/current_item.rs`. Semantic conflicts that survive a clean git
merge:

- PR60 hello has **no `scale` field**; this branch requires real `scale`.
- PR60 guest still uses the **legacy `ViewState` API**; this branch owns
  `view_transform.ViewTransform` + pointer press.

Each can PASS alone and still regress the other after a naive merge.
Required integration order after human review:

1. Land view-geometry-1 (Product geometry authority).
2. Rebase PR60 launch corrective onto it; re-check embed/GUI/associations
   against the new mouse/DPI/cancel path.
3. Re-run the PR60 launch smoke + this branch's interactive smoke together.

This branch still needs explicit `--js`/`--pak` (no embed). That is intentional
until PR60 is rebased.

### Remaining before merge

- Interactive Windows smoke on a real 150% DPI machine (wheel anchor, drag,
  rotate visual, toolbar click, EXIF upright, pointer release outside).
- Independent fresh-context adversarial review of this Corrective-2 diff.
- Human merge decision. Do not auto-merge. PocketJS pin unchanged
  (`24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb`).

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
- Framework `onPress` is **not** implied by svc mouse: it fires from CIRCLE on
  the focused node, touch activation, or `pressNode` after a pointer hit-test
  (`framework/desktop-pointer.ts`). Corrective-2 wires that path in the guest.
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
  Canonical 8-tuple set (Corrective-2): rotations `{θ,1,1}`, reflections
  `{θ,-1,1}`. FV is `{180,-1,1}`. Kernel: `Rot(θ)∘Scale(sx,sy) ≡
  Rot(θ+180)∘Scale(-sx,-sy)`.
- `sourceWidth/Height` and `resourceWidth/Height` are both **O-space**
  (post-EXIF). `fullResolution` means no admission downscale in O — never
  S vs O equality.
- One image viewport: `shell_layout.imageViewport(w,h)` from frozen chrome
  heights. No scattered magic deductions.

### Modules

| Module | Role |
| --- | --- |
| `guest/view_transform.ts` | pure Fit/zoom/pan/D4/DPI geometry + normalize |
| `guest/pointer_press.ts` | desktop mouse → hitFocusable/pressNode (onPress) |
| `guest/shell_layout.ts` | frozen chrome + canonical image viewport |
| `guest/view_state.ts` | publication reconcile helpers (legacy types kept) |
| `native/src/main.rs` | host mouse/scroll/scale_factor + real hello DPI |
| `native/src/current_item.rs` | EXIF 1–8 materialized into O at decode |

### Invariants preserved

Publication lifetime, last-good refresh, RequestPhase tokens, no image bytes
through QuickJS, no view-only resource mutation. PocketJS pin unchanged.

## [S3] Out of Scope

- PocketJS renderer rewrite / pin change.
- GIF animation, tiled giant-image, HDR.
- Full installer.
- Issue auto-close on GitHub (recorded here; human closes #59).
- PR60 embed/GUI/associations (separate branch; integration audit above).

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
- [x] T4b: Corrective-2 — hello DPI, toolbar onPress, D4 normalize, EXIF fullRes lock, pointer-release (covers: S2)
- [ ] T5: Interactive Windows smoke + adversarial review + finalize report (covers: S2; depends: T1–T4b)

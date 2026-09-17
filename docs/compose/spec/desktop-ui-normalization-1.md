---
feature: desktop-ui-normalization-1
status: delivered
updated: 2026-09-18
branch: fix/ui-chrome-1
commits: 880d58a00d90087558292f80f4366b7f92a23298..1e74701
---

# Desktop UI Normalization 1 (PR #62)

## Report

**What was built** — PR #62 chrome is now icon-first desktop viewer UI.
Top toolbar is actions only: Open · Zoom−/Zoom+/Fit/1:1 · Rotate L/R ·
Flip H/V · Reset View · Refresh. Previous/Next and the Proxy/zoom badge
were removed from the toolbar; navigation stays on the image-edge
chevrons + keyboard/BrowseSession. Semantic full names live in
`TOOL_SEMANTIC` / tests (PocketJS has no tooltip primitive at `24bab5e`).
Icons bake and display at 16×16 (`w-4 h-4`). Edge chevrons are translucent
(`#00000033` rest / `#00000088` focus / `#000000aa` active), sides only,
unavailable direction has no control node. Title uses real Inter Bold;
status owns dimensions / Full|Proxy / zoom / dpi / index / name.
`SHELL_CHROME` and PR #61 ViewTransform/`imageViewport` are unchanged.

**Verification** — `bun test guest/` 162 pass / 0 fail; `pocket.ts compile
--target windows-app` pass (14 SVGs baked 32×32 @2x from 16×16 design);
`cargo build --release` OK (pre-existing dead_code/unused_mut warnings only).
Windows smoke screenshots:
`experiments/desktop-ui-normalization-1/screenshots/{A-image-ready,B-image-b,C-empty}.png`.
Adversarial review: **no MAJOR**; MINOR polish applied (SHELL_CHROME binding,
GroupGap ≈12px, iconLabel comment, SVG comment cleanup, reset glyph documented
as return-to-baseline). Issue #63 rendering work untouched.

**Journey log**
- PocketJS `24bab5e` has no tooltip; `hover:` is a compile error — use
  focus/active only; semantic names stay in constants/tests.
- SVG baker: filled circle/rect/path, no arcs `A`, no stroke; `rx` ignored.
- 16×16 design + `w-4 h-4` display is the anti-fuzz contract (not 16→20);
  @2x bake density is physical quality, not display scale.
- Edge rest must stay light enough that the photograph remains dominant;
  opaque dark circles were rejected in review.
- Reset must not look like refresh (circular) or fit (corners) — delivered
  as return-to-baseline arrow + bar.

## [S1] Problem

PR #62 chrome still looks like a developer/debug toolbar:

- Previous/Next appear both in the top toolbar and as edge chevrons.
- Toolbar carries passive state (`Proxy ×14.6%`) that belongs in the status bar.
- Rotate/Flip/Reset render as text (`RotL` / `RotR` / `FlipH` / `FlipV` / `Reset`).
- Icons bake at 16×16 then display at `w-5 h-5` (20×20), introducing avoidable fuzz.
- Edge chevrons are opaque dark circles that compete with the photograph.
- Toolbar uses uneven separators and label rows instead of icon-first action groups.

Product target for this pass: **lightweight, icon-first, clear desktop chrome**.
Structural reference: PocketJS native desktop app layout. Visual/product reference:
Windows 11 Photos. This is **not** a rendering-quality task (Issue #63).

User confirmation this pass: left/right navigation controls **only** show on the
two image-edge sides — never as top-toolbar Previous/Next.

## [S2] Design

### Authority / frozen geometry

Unchanged by this PR:

- `SHELL_CHROME.titleH / toolbarH / statusH` (36 / 64 / 28)
- `imageViewport()`, Fit/zoom/pan/ViewTransform (PR #61)
- BrowseSession, keyboard Previous/Next, publication/decode ownership
- `POCKETJS.lock` = `24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb`
- Issue #63 scope (sampling, DPI, resize, retained presentation)

PR #62 may only change presentation **inside** existing chrome regions.

### PocketJS capability facts (locked revision)

Verified against `24bab5e` `framework/compiler/*`:

| Capability | Reality |
| --- | --- |
| `font-bold` | supported — real Inter Bold slot |
| `font-medium` / 500 / 600 | **not** supported — do not invent |
| `text-xs` / `text-sm` | 12 / 14 logical px |
| `gap-N`, `px/mt/ml`, flex row/col | supported (spacing N = N×4) |
| `opacity-N` + `style.opacity` | supported |
| `bg-[#rrggbbaa]` | supported 8-digit hex alpha |
| `focus:` / `active:` | supported |
| `hover:` | **not** supported on this target — use focus/active |
| tooltip / hover-label | **no** primitive — follow-up only |
| SVG baker | filled `circle` / `rect` / `path`; path cmds `M/L/H/V/C/S/Q/T/Z`; **no** arcs `A`; `fill="hole"`; `opacity` / `fill-opacity` |
| native dark titlebar in PocketJS desktop host | not present — report, do not build custom-titlebar subsystem |

### Toolbar product model (actions, not strings)

Top toolbar is **commands only**. Status bar owns observations.

Visible grouping (Flex only — no absolute, no translate, no hand-tuned x):

```text
Open    Zoom- Zoom+ Fit 1:1    RotL RotR FlipH FlipV Reset    Refresh
```

Rules:

1. Remove Previous / Next from the toolbar (edge + keyboard only).
2. Remove Proxy/zoom badge from the toolbar (status bar keeps zoom / Full|Proxy).
3. Icon-first controls; do **not** paint `RotL` / `RotR` / `FlipH` / `FlipV`.
4. `1:1` may remain textual (compact visual symbol); real Bold allowed.
5. Semantic names stay in constants/tests:
   `Open`, `Zoom Out`, `Zoom In`, `Fit`, `1:1`,
   `Rotate Left`, `Rotate Right`, `Flip Horizontal`, `Flip Vertical`,
   `Reset View`, `Refresh`.
6. No tooltip invention; report tooltip as follow-up (PocketJS has none today).
7. One icon-button contract inside frozen `toolbarH=64`:
   hit target **36×36** (`w-9 h-9`), icon display **16×16** (`w-4 h-4`),
   vertically centered. Heights bind `SHELL_CHROME` literals. `1:1` may use
   a slightly wider content box.
8. In-group spacing small (`gap-1` / 4px); semantic group gaps larger
   (`GroupGap` `w-2` + surrounding `gap-1` ≈ 12px). Avoid ToolSep after
   every control; separators only if they mark a true group boundary.
9. Disabled: icon opacity 0.3, not focusable, no action wiring change.

### Icon system

- Design grid **16×16**; bake/display **16×16** (`w-4 h-4`). Never 16→20.
- Grid-conscious coordinates: integer or `.5` logical px preferred.
- Light Windows-11-like weight: consistent apparent thickness, generous
  negative space, no heavy blobs, no neighbor twice as heavy.
- Required semantics (filled PocketJS subset only):
  - `open` — folder/open affordance
  - `zoomOut` / `zoomIn` — magnifier ±
  - `fit` — fit-to-frame corners
  - `rotateLeft` / `rotateRight` — CCW / CW arrows
  - `flipHorizontal` / `flipVertical` — opposing shapes around vertical/horizontal axis
  - `reset` — recenter/default-view as return-to-baseline arrow + bar (not circular reload, not fit corners)
  - `refresh` — reload-current-item (open circular arrow)
- Reset vs refresh must be distinguishable.

### Edge navigation (left/right only)

Treat Previous/Next as **viewport navigation**, not toolbar commands.

Resting:

- translucent backdrop (not opaque black sticker)
- light glyph
- photograph remains dominant / visible through the affordance
- no thick opaque circle, heavy border, or large shadow

Focus / active (PocketJS has no hover):

- backdrop more opaque
- glyph remains light; clarity rises via contrast (no layout move)
- hit target geometry frozen — no position animation, no springs

Contract:

- hit target **40×40** (`w-10 h-10`)
- visible glyph **16×16** (`w-4 h-4`)
- edge inset **~8–16** logical px (`px-2` / `px-3`)
- left/right pair symmetrical
- unavailable direction: **no control node** (layout-only empty spacer is
  allowed so the remaining control stays on its side; spacer is not focusable
  and has no chrome)
- overlays existing `imageViewport()`; does **not** change `SHELL_CHROME`
- keyboard Previous/Next and BrowseSession semantics unchanged

Color encoding (documented values, 8-digit hex ABGR-style `#rrggbbaa`):

| State | Backdrop | Notes |
| --- | --- | --- |
| rest | `#00000033` | ~20% black |
| focus | `#00000088` | ~53% black |
| active | `#000000aa` | ~67% black |

Glyph fill baked `#f0f0f0` with Image `opacity` 0.72 at rest; focus/active
rely on backdrop contrast because PocketJS has no parent→child focus cascade.
True child-brighten-on-focus is a framework follow-up if required later.

### Typography

| Slot | Spec |
| --- | --- |
| App title `PicoView` | `text-sm font-bold`, primary `#f0f0f0` |
| Header center filename | `text-sm` Regular, secondary `#a0a0a0` |
| Status | `text-xs` Regular, secondary |
| `1:1` | `text-sm font-bold` (glyph-like) |

No synthetic Medium/Semibold. No toolbar-wide label row to “fix” with larger type.

### Anti-jaggedness (UI-local only)

PR #62 may: real Regular/Bold slots; baked sizes only; no scaled toolbar text;
16×16 icons at 16×16; grid-fit SVG; stable button geometry.

PR #62 may **not** claim DPI/sampling/mipmap/resize perfection (Issue #63).
Correct claim: removes UI-local causes of avoidable fuzz/jaggedness.

### Empty / loading / error

Preserve #62 fix: when a valid image publication is bound, do **not** stack
empty/loading/error overlays on top of it. State rendering stays explicit
(no z-index/opacity hide tricks).

### Native title bar

Do not fake Windows caption in TSX. PocketJS `hosts/desktop` at the locked
revision does not apply a dark native title-bar theme, and expanding Windows
host scope is out of this PR. **Report** as follow-up; keep internal product
header.

## [S3] Out of Scope

- Image sampling / mipmaps / DPI presentation / resize coalescing (Issue #63)
- ViewTransform, Fit, pan clamp, wheel anchor (PR #61)
- BrowseSession / keyboard navigation semantics
- WIC decode, publication, texture ownership
- `POCKETJS.lock` advance
- Custom title-bar subsystem / tooltip framework feature
- Claiming final raster perfection under every Windows DPI mode

## Tasks

- [x] T1: Spec locked on worktree `fix/ui-chrome-1` — acceptance: this doc exists under `docs/compose/spec/desktop-ui-normalization-1.md` at base `880d58a` (covers: S2)
- [x] T2: Icon assets + semantic action map — acceptance: rotate/flip/reset/refresh/open/zoom/fit SVGs bake; 16×16 grid; reset≠refresh; `icons.ts` holds full semantic names (covers: S2)
- [x] T3: Toolbar + title/status + edge-nav rewrite in `app.octane.tsx` — acceptance: no toolbar Prev/Next, no proxy badge, no RotL text; Flex groups; icon-first; translucent edge chevrons only on sides; SHELL_CHROME unchanged (covers: S1,S2)
- [x] T4: Tests + compile + native build — acceptance: `bun test guest/` pass; pocket compile bakes icons; `cargo build --release` succeeds; shell_layout tests still freeze 36/64/28 (covers: S2; depends: T2,T3)
- [x] T5: Adversarial review + delivery report — acceptance: MAJOR findings fixed; report lists BASE/OLD_HEAD/NEW_HEAD, tests, screenshots if available, Issue #63 untouched (covers: S2; depends: T4)

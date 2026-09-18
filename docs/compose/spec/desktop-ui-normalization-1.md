---
feature: desktop-ui-normalization-1
status: delivered
updated: 2026-09-18
branch: fix/ui-chrome-1
commits: 880d58a00d90087558292f80f4366b7f92a23298..bdbd413
corrective: PICOVIEW-PR62-DESKTOP-CONFORMANCE-1
---

# Desktop UI Normalization 1 (PR #62)

## Authority (normative for this PR)

PR #62 **is allowed to change shell chrome geometry**. It is **not**
presentation-only.

| Authority | Owns |
| --- | --- |
| PR #61 / Architecture | ViewTransform equations, Fit algorithm, pan clamp algorithm, orientation math |
| PR #62 / Product chrome | Shell chrome allocation (`SHELL_CHROME`), therefore the resulting **image viewport extent** |

```text
window
  ↓
chromeHeight (PR #62 Product chrome allocation)
  ↓
imageViewport
  ↓
Fit / center / pan clamp (PR #61 algorithms, #62-owned input boundary)
```

**Formulas did not change. Viewport boundary did change.** Both facts are
required; claiming “no geometry change” while shipping new `SHELL_CHROME`
values is authority drift.

Current product chrome heights (`guest/shell_layout.ts`):

```text
titleH:   0    (in-app title strip removed; native caption owns the name)
toolbarH: 44
statusH: 24
chrome:   68
```

Product minimum usable logical client: **`384×240`**
(`PRODUCT_MIN_CLIENT`). PocketJS `windows-app` capability floor `240×180`
is platform capability, not product usability. Native host enforces product
min via `with_min_inner_size` + resize clamp; `guest/pocket.json`
`viewport.min` stays `[384, 240]`.

Also recorded in Product authority (`docs/PRD/PicoView-PRD-v0.6.md` §2.11)
and Architecture (`docs/ARCHITECTURE.md` §3.1).

## Report

**What was built** — PR #62 chrome is icon-first desktop viewer UI after
corrective-3 + desktop-conformance-1. Top toolbar is **exactly** these
commands:

```text
Open    Zoom Out  Zoom In  Fit  1:1    Rotate  Flip Horizontal  Flip Vertical
```

Removed from the toolbar: Previous, Next, Reset, Refresh, Rotate Left,
Rotate Right, passive Proxy/zoom badge, single Reflect.
Previous/Next remain viewport-edge chevrons + keyboard/BrowseSession.
Keyboard Refresh (R / F5) remains a recovery path — not a toolbar command.

**Rotate** is one command: each press rotates **clockwise 90°**
(`0 → 90 → 180 → 270 → 0`), implemented via PR #61 `rotateRight`.
**FlipH / FlipV** are two separate toolbar commands (visible-frame):
`flipHorizontal` / `flipVertical` (PR #61). Icons: vertical axis + L/R
shapes vs horizontal axis + T/B shapes.

**Status-bar zoom %** tracks Fit / Zoom In / Zoom Out. Fit shows
`Fit · N%`; manual zoom shows `N%`; proxy never claims source 100%.
Toolbar `1:1` = Actual Size = productZoom 1.0 = `100%`. Zoom % is a
**readout in the status bar**, not a toolbar command badge.

**Icon size policy** — design grid **20×20** (`viewBox="0 0 20 20"`),
display **20×20** (`w-5 h-5`). Texture root stays **32/64 pow2** solely
because the pak baker rejects non-pow2 textures; that is **not** a display
scale. No 16→20 stretch. Command fill **#E6E6E6**; chevrons **#F0F0F0**;
flip axes **#F2F2F2**. `guest/images.json` sets `linear: true` for all
chrome SVGs → bilinear cook path. ToolButton hit target **36×36** (`w-9 h-9`).
`1:1` remains real Bold `text-sm` `#e6e6e6`.

**Icon family** — Open (folder), Zoom Out/In (magnifier ±), Fit (thick
corner brackets), Rotate (image plate + CW quarter-turn arm — not circular
refresh), FlipH (vertical axis + L/R mirrored shapes), FlipV (horizontal
axis + T/B mirrored shapes). Edge chevrons: translucent rest `#00000044`, focus
`#00000099`, active `#000000bb`, glyph opacity **0.92** (legible, not a
heavy black sticker).

**Desktop conformance corrective** — closed the two MAJORs from
`PICOVIEW-PR62-POCKETJS-DESKTOP-CONFORMANCE-REVIEW`:

1. **MAJOR-1 authority drift** — chrome geometry ownership written into
   PRD/ARCHITECTURE/CONTEXT/this spec; stale Reflect / “presentation only”
   / out-of-scope vertical-flip text removed.
2. **MAJOR-2 dynamic viewport closure** — product min logical client
   **384×240** established in guest + pocket.json + native winit min size
   and resize clamps. No responsive toolbar collapse; product min closes
   the fixed-command-bar contract.

**MINOR-2** — `TOOL_SEMANTIC` wording tightened: semantic/test authority,
**not** accessibility metadata (PocketJS `24bab5e` has no a11y/tooltip node
capability; `ToolButton` does not forward `semantic` to a host a11y API).

**MINOR-1** (known debt, not blocking) — PicoView still adapts the portable
desktop host rather than consuming PocketJS `hosts/desktop` as a reusable
shared crate. Behavioral desktop-family conformance holds; code-reuse
consolidation is upstream, not this UI PR.

**Verification** — see Delivery checklist after the conformance corrective
build. Live Windows smoke screenshots (PrintWindow 960×640):

- before (c0aa398): `…/screenshots/{A-image-ready,B-image-b,C-empty}-before.png`
- after: `…/screenshots/{A-image-ready,B-image-b,C-empty}.png`

Residual glyph-edge softness in 96 DPI PrintWindow capture remains Issue #63
presentation evidence. Issue #63 / PR #61 / `POCKETJS.lock=24bab5e` untouched
by this corrective.

**Journey log**
- PocketJS `24bab5e` has no tooltip; `hover:` is a compile error — semantic
  names stay in `TOOL_SEMANTIC` / tests as **test authority**, not a11y claims.
- SVG baker: filled circle/rect/path, no arcs `A`, no stroke; `rx` ignored.
- Pak image dims must be pow2 — 20×20 bake fails; 32/64 root + 20 viewBox
  keeps design/display at 20 without stretch.
- Command bar must feel like a photo viewer, not a debug strip — one Rotate,
  **separate FlipH and FlipV**, no Reset/Refresh/Reflect in chrome.
- Reset was redesigned earlier then **removed** from the toolbar; download-like
  glyph confusion is gone by deletion, not re-art.
- Edge rest must stay translucent; raise **glyph** opacity for legibility
  instead of making the pill opaque.
- PocketJS desktop capability min (240×180) ≠ product min (384×240).
  Closing the gap is product/host policy, not a responsive-toolbar rewrite.

## [S1] Problem

PR #62 chrome still looked like a developer/debug toolbar after the first
optical pass:

- Transform controls too many (RotL/RotR/FlipH/FlipV/Reset/Refresh).
- Icon vocabulary too heavy; “毛边 / 发虚 / 不够利落”.
- Toolbar not product-clean enough for a Windows photo viewer.

Later follow-ups: compress chrome so the image gets more space; split
single Reflect into FlipH + FlipV; keep zoom % visible in the status bar;
close desktop dynamic-window conformance (authority + product min width).

Product target: icon-first Windows photo-viewer command bar. Structural
reference: PocketJS native desktop app layout. Visual/product reference:
Windows 11 Photos-style command bar. This is **not** a rendering-quality
task (Issue #63).

## [S2] Design

### Authority / frozen geometry

Product chrome heights are one shared constant set (`SHELL_CHROME`).
Fit/zoom/pan still consume `imageViewport()`. PR #61 ViewTransform math is
unchanged (`rotateRight`, `flipHorizontal`, `flipVertical`, Fit, pan).

```text
titleH:   0
toolbarH: 44
statusH: 24
chrome:   68

PRODUCT_MIN_CLIENT: 384 × 240 logical
```

Toolbar fixed-layout width contract (why product min = 384):

```text
8 buttons × 36       = 288
2 group gaps × 8     = 16
9 normal gaps × 4    = 36
left/right padding   = 16
--------------------------------
required ≈ 356 logical px → product min width 384
```

### Toolbar product model (corrective-3 / authoritative)

```text
Open    Zoom- Zoom+ Fit 1:1    Rotate  FlipH  FlipV
```

Rules:

1. Toolbar = action commands only — no Previous/Next, no Reset/Refresh,
   no RotL/RotR, no passive badges, no single Reflect.
2. Rotate = single CW 90° command (uses PR #61 `rotateRight` each press).
3. FlipH / FlipV = two separate reflection commands (`Flip Horizontal` /
   `Flip Vertical`), PR #61 visible-frame math.
4. `1:1` remains textual Bold command-like glyph (Actual Size / 100%).
5. Semantic names in `TOOL_SEMANTIC` / `TOOLBAR_COMMANDS` / tests:
   `Open`, `Zoom Out`, `Zoom In`, `Fit`, `1:1`, `Rotate`,
   `Flip Horizontal`, `Flip Vertical`
   (+ edge-only `Previous` / `Next`).
6. No tooltip invention (PocketJS has none at `24bab5e`).
7. Icon-button contract: hit **36×36** (`w-9 h-9`), glyph **20×20** (`w-5 h-5`),
   vertically centered in `toolbarH=44`. Flex only; `GroupGap` for groups.
8. Disabled: icon opacity 0.38, not focusable.
9. Zoom % is status-bar only; never a passive toolbar badge.

### Icon system

- Design grid **20×20**; display **20×20**; texture **pow2 32/64 @2x** only
  for the baker — **source/display mapping is 20→20**, never 16↔20 stretch.
- Feature weight ≈ **1.8–2.5** logical px filled geometry; integer / .5 coords.
- Command fill **#E6E6E6**; edge chevrons **#F0F0F0**; flip axes **#F2F2F2**.
- Required semantics:
  - `open` — solid folder
  - `zoomOut` / `zoomIn` — magnifier ±
  - `fit` — thick fit-to-frame corner brackets
  - `rotate` — image plate + CW quarter-turn arm (not refresh loop)
  - `flipH` — mirrored triangles + strong vertical axis
  - `flipV` — mirrored triangles + strong horizontal axis
- `images.json` → bilinear for every chrome icon.
- Obsolete files deleted: `icon-rotate-left/right`, `icon-reflect`,
  `icon-reset`, `icon-refresh`.

### Edge navigation (left/right only)

- rest backdrop `#00000044`, focus `#00000099`, active `#000000bb`
- glyph `#F0F0F0`, Image opacity **0.92** (legible without heavy pills)
- hit target 40×40; glyph `w-5 h-5`; sides only; spacer when direction missing
- keyboard Previous/Next + BrowseSession unchanged

### Typography

| Slot | Spec |
| --- | --- |
| Native caption `PicoView` | OS-owned (in-app title strip removed); host requests `Theme::Dark` |
| Status filename / dims / dpi | `text-xs` Regular secondary `#a0a0a0` |
| Status zoom % | `text-xs font-bold text-[#e6e6e6]` |
| `1:1` | `text-sm font-bold text-[#e6e6e6]` |
| Error recovery Previous/Next | text buttons in overlay only (not toolbar) |

No synthetic Medium/Semibold.

### Anti-jaggedness (UI-local only)

PR #62 owns: command vocabulary, icon design, optical weight, source/display
normalization, bilinear cook flag, Flex geometry, contrast. It does **not**
own mipmaps, live DPI, resize coalescing, framebuffer scaling, decode, or
view-transform math (Issue #63 / PR #61).

Residual softness after this pass, if any, is recorded as Issue #63
evidence — not claimed as #62 raster perfection.

## [S3] Out of Scope

- Image sampling / mipmaps / DPI presentation / resize coalescing (Issue #63)
- ViewTransform, Fit, pan clamp, wheel anchor algorithms (PR #61)
- BrowseSession / keyboard navigation semantics
- WIC decode, publication, texture ownership
- `POCKETJS.lock` advance
- Custom title-bar subsystem / tooltip framework feature
- Responsive collapse of the toolbar below product min (product min closes
  the contract instead)
- Merging PicoView host into PocketJS `hosts/desktop` as a shared crate
  (upstream consolidation debt; not this PR)
- Live accessibility metadata wiring (PocketJS 24bab5e has no a11y node API)

## Tasks

- [x] T1: Spec locked on worktree `fix/ui-chrome-1`
- [x] T2: Icon assets + semantic action map (corrective-2/3 vocabulary)
- [x] T3: Toolbar rewrite — Open/Zoom/Fit/1:1/Rotate/FlipH/FlipV
- [x] T4: Tests + compile + native build
- [x] T5: Adversarial review + delivery report + live before/after screenshots
- [x] T6: Desktop conformance — authority correction + product min client
  384×240 + semantic wording (this corrective)

## Delivery checklist

Conformance corrective `bdbd413` on this branch:

- [x] `bun test guest/` — **172 pass / 0 fail**
- [x] `pocket.ts compile --target windows-app` pass (icons bake 64×64 @2x, `sampled linear`)
- [x] `cargo build --release` OK (pre-existing dead_code/unused_mut warnings only)
- [x] PR body no longer claims “presentation only / no geometry change”
- [x] PR body states chrome ownership + product min 384×240
- [x] Feature-doc Reflect/out-of-scope/task text matches FlipH/FlipV model

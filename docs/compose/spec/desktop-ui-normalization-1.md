---
feature: desktop-ui-normalization-1
status: delivered
updated: 2026-09-18
branch: fix/ui-chrome-1
commits: 880d58a00d90087558292f80f4366b7f92a23298..a882b89
corrective: PICOVIEW-PR62-UI-ICON-CORRECTIVE-2
---

# Desktop UI Normalization 1 (PR #62)

## Report

**What was built** — PR #62 chrome is icon-first desktop viewer UI after
corrective-2. Top toolbar is **exactly** seven commands:

```text
Open    Zoom Out  Zoom In  Fit  1:1    Rotate  Reflect
```

Removed from the toolbar: Previous, Next, Reset, Refresh, Rotate Left,
Rotate Right, Flip Horizontal, Flip Vertical, passive Proxy/zoom badge.
Previous/Next remain viewport-edge chevrons + keyboard/BrowseSession.
Keyboard Refresh (R / F5) remains a recovery path — not a toolbar command.

**Rotate** is one command: each press rotates **clockwise 90°**
(`0 → 90 → 180 → 270 → 0`), implemented via PR #61 `rotateRight`.
**Reflect** is one command: **horizontal reflection only**, product name
`Reflect` (not Mirror), via PR #61 `flipHorizontal`.

**Icon size policy** — design grid **20×20** (`viewBox="0 0 20 20"`),
display **20×20** (`w-5 h-5`). Texture root stays **32/64 pow2** solely
because the pak baker rejects non-pow2 textures; that is **not** a display
scale. No 16→20 stretch. Command fill **#E6E6E6**; chevrons **#F0F0F0**;
Reflect axis **#F2F2F2**. `guest/images.json` sets `linear: true` for all
chrome SVGs → bilinear cook path. ToolButton hit target **36×36** (`w-9 h-9`).
`1:1` remains real Bold `text-sm` `#e6e6e6`.

**Icon family** — Open (folder), Zoom Out/In (magnifier ±), Fit (thick
corner brackets), Rotate (image plate + CW quarter-turn arm — not circular
refresh), Reflect (mirrored triangles around a strong vertical axis — not
L/R swap arrows). Edge chevrons: translucent rest `#00000044`, focus
`#00000099`, active `#000000bb`, glyph opacity **0.92** (legible, not a
heavy black sticker).

**Verification** — `bun test guest/` **167 pass / 0 fail**; `pocket.ts
compile --target windows-app` pass (10 chrome SVGs baked **64×64 @2x**,
log `sampled linear (images.json)`); `cargo build --release` OK
(pre-existing dead_code/unused_mut warnings only). Live Windows smoke
screenshots (PrintWindow 960×640):

- before (c0aa398): `…/screenshots/{A-image-ready,B-image-b,C-empty}-before.png`
- after: `…/screenshots/{A-image-ready,B-image-b,C-empty}.png`

Adversarial review: **no MAJOR**. Residual glyph-edge softness in the
96 DPI PrintWindow capture is attributed to final presentation sampling
(Issue #63); PR #62 removed UI-local causes (vocabulary clutter, gray/thin
art, size mismatch, multi-transform toolbar). Issue #63 / PR #61 /
`POCKETJS.lock=24bab5e` untouched.

**Journey log**
- PocketJS `24bab5e` has no tooltip; `hover:` is a compile error — semantic
  names stay in `TOOL_SEMANTIC` / tests.
- SVG baker: filled circle/rect/path, no arcs `A`, no stroke; `rx` ignored.
- Pak image dims must be pow2 — 20×20 bake fails; 32/64 root + 20 viewBox
  keeps design/display at 20 without stretch.
- Command bar must feel like a photo viewer, not a debug strip — one Rotate,
  one Reflect, no Reset/Refresh in chrome.
- Reset was redesigned earlier then **removed** from the toolbar; download-like
  glyph confusion is gone by deletion, not re-art.
- Edge rest must stay translucent; raise **glyph** opacity for legibility
  instead of making the pill opaque.

## [S1] Problem

PR #62 chrome still looked like a developer/debug toolbar after the first
optical pass:

- Transform controls too many (RotL/RotR/FlipH/FlipV/Reset/Refresh).
- Icon vocabulary too heavy; “毛边 / 发虚 / 不够利落”.
- Toolbar not product-clean enough for a Windows photo viewer.

Product target for this corrective: **exactly** Open / Zoom Out / Zoom In /
Fit / 1:1 / Rotate / Reflect. Structural reference: PocketJS native desktop
app layout. Visual/product reference: Windows 11 Photos-style command bar.
This is **not** a rendering-quality task (Issue #63).

## [S2] Design

### Authority / frozen geometry

Product chrome heights remain one shared constant set (`SHELL_CHROME`).
Fit/zoom/pan still consume `imageViewport()`. PR #61 ViewTransform math is
unchanged (`rotateRight`, `flipHorizontal`, Fit, pan).

```text
titleH:   0    (in-app title strip removed; native caption owns the name)
toolbarH: 44
statusH: 24
chrome:   68
```

### Toolbar product model (corrective-2)

```text
Open    Zoom- Zoom+ Fit 1:1    Rotate  Reflect
```

Rules:

1. Toolbar = action commands only — no Previous/Next, no Reset/Refresh,
   no RotL/RotR/FlipH/FlipV, no passive badges.
2. Rotate = single CW 90° command (uses PR #61 `rotateRight` each press).
3. Reflect = single horizontal reflection command (`Reflect`, not Mirror).
4. `1:1` remains textual Bold command-like glyph.
5. Semantic names in `TOOL_SEMANTIC` / `TOOLBAR_COMMANDS` / tests:
   `Open`, `Zoom Out`, `Zoom In`, `Fit`, `1:1`, `Rotate`, `Reflect`
   (+ edge-only `Previous` / `Next`).
6. No tooltip invention (PocketJS has none at `24bab5e`).
7. Icon-button contract: hit **36×36** (`w-9 h-9`), glyph **20×20** (`w-5 h-5`),
   vertically centered in `toolbarH=44`. Flex only; `GroupGap` for groups.
8. Disabled: icon opacity 0.38, not focusable.

### Icon system (corrective-2)

- Design grid **20×20**; display **20×20**; texture **pow2 32/64 @2x** only
  for the baker — **source/display mapping is 20→20**, never 16↔20 stretch.
- Feature weight ≈ **1.8–2.5** logical px filled geometry; integer / .5 coords.
- Command fill **#E6E6E6**; edge chevrons **#F0F0F0**; Reflect axis **#F2F2F2**.
- Required semantics:
  - `open` — solid folder
  - `zoomOut` / `zoomIn` — magnifier ±
  - `fit` — thick fit-to-frame corner brackets
  - `rotate` — image plate + CW quarter-turn arm (not refresh loop)
  - `reflect` — mirrored triangles + strong vertical axis (not L/R arrows)
- `images.json` → bilinear for every chrome icon.
- Obsolete files deleted: `icon-rotate-left/right`, `icon-flip-h/v`,
  `icon-reset`, `icon-refresh`.

### Edge navigation (left/right only)

- rest backdrop `#00000044`, focus `#00000099`, active `#000000bb`
- glyph `#F0F0F0`, Image opacity **0.92** (legible without heavy pills)
- hit target 40×40; glyph `w-5 h-5`; sides only; spacer when direction missing
- keyboard Previous/Next + BrowseSession unchanged

### Typography

| Slot | Spec |
| --- | --- |
| Native caption `PicoView` | OS-owned (in-app title strip removed) |
| Status / filename | `text-xs` Regular secondary `#a0a0a0` |
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
- ViewTransform, Fit, pan clamp, wheel anchor (PR #61)
- BrowseSession / keyboard navigation semantics
- WIC decode, publication, texture ownership
- `POCKETJS.lock` advance
- Custom title-bar subsystem / tooltip framework feature
- Vertical reflection command in the toolbar (v1 Reflect is horizontal only)

## Tasks

- [x] T1: Spec locked on worktree `fix/ui-chrome-1`
- [x] T2: Icon assets + semantic action map (corrective-2 vocabulary)
- [x] T3: Toolbar rewrite — exact command bar Open/Zoom/Fit/1:1/Rotate/Reflect
- [x] T4: Tests + compile + native build (167 pass; icons bake linear @2x)
- [x] T5: Adversarial review + delivery report + live before/after screenshots

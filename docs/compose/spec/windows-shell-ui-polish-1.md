---
feature: windows-shell-ui-polish-1
status: ready-for-pr
updated: 2026-09-18
branch: feat/windows-shell-ui-polish-1
commits: bbda8db50a99d8c35380e8831670219b75f5e962..1f85e11
---

# Windows Shell + UI Polish 1

## Report

**What was built** — PicoView can now act like a real minimal Windows image
viewer. All open entry points (CLI/Explorer, Open With after
`--register-associations`, in-app Open File… / Ctrl+O, Previous/Next,
Refresh/F5/R) converge on one `CurrentItem` pipeline. Open File uses a
native `rfd` dialog on the UI thread; the chosen path returns as
`Input::OpenPath` → `Command::Open`, which always anchors a BrowseSession
(including empty-start). The guest chrome follows UI/UX Design v1.0: dark
palette, top toolbar with baked 16px SVG icons + labels, canvas side
chevrons, product-only empty/error states, and a quiet status bar
(dims | Full/Proxy | zoom | position | name). Conservative HKCU associations
cover only `.jpg .jpeg .png .bmp` (GIF/WebP excluded: first-frame ≠ product
GIF support; WebP not yet a proven baseline). PocketJS pin stays `24bab5e`.

**Verification** — `bun test guest/` 77 pass; `cargo test` 30 pass;
`cargo build --release` OK; `pocket.ts compile` bakes 9 SVG icons
(32×32 @2x); `--register-associations` / `--unregister-associations` exit 0;
quoted path-with-spaces opens with `handle=Some(9)`; Windows smoke boots
`A.jpg` and stays alive. Independent review: no critical product/code
findings; keyboard smoke was environment-flaky (`focused=False`) and is
covered by code + earlier session evidence.

**Journey log**
- PocketJS has no live SVG; icons must be compile-time baked assets with
  pow2 dimensions (16×16 → 32×32 @2x), filled circle/rect/path only.
- `absolute` / `inset-0` / `bg-[#hex]` are supported; CSS `position` /
  `transform` strings are not — side chevrons use a full-canvas flex overlay.
- `Command::Open` must always create BrowseSession or Open File from an
  empty start loses Previous/Next.
- PowerShell `Start-Process -ArgumentList` does not quote spaced paths for
  you — harness must pre-quote; the app itself is fine.
- Prefer bottom-bar or top-bar chrome only after matching the mockup
  hierarchy (toolbar on top, image dominant).

## [S1] Problem

After PR #58 closeout, PicoView can open, browse, zoom, and refresh, but it
still does not feel like a real Windows image viewer:

- No Open File… product action (guest `cmdOpen` exists, no UI/shortcut/file dialog).
- Toolbar is sparse ASCII glyphs with uneven grouping and weak disabled
  contrast — reads as a debug harness, not a product.
- Keyboard is incomplete: no F5 refresh, no Ctrl+O open.
- Status bar mixes readiness, dimensions, and zoom without a clear hierarchy.
- No Windows file-association / Open With registration path.
- Startup open, Open File, Previous/Next, and Refresh must stay one Product
  pipeline; UI polish must not invent a second open path.

## [S2] Design

Product-assembly slice on the frozen architecture. No PocketJS revision
change. No second renderer. No PSM detour. Ordinary image path remains
decode/source RGBA → PocketJS logical resource → pocket-ui-wgpu → wgpu.

### Open path unification

All of these converge on the existing `CurrentItem` open pipeline
(`Command::Open` / `handle_command` / `open`):

| Entry | Path |
| --- | --- |
| CLI `picoview.exe <path>` | boot `CurrentItem::with_browse` + `open(NewItem)` (existing) |
| Explorer / Open With | same as CLI (already) |
| Open File… / Ctrl+O | pick path → `Input::OpenPath` → `Command::Open` → same |
| Previous / Next | BrowseSession → open neighbor (existing) |
| Refresh / R / F5 | `Command::Refresh` (existing) |

Guest still may only send bounded JSON (`pick-file` is a request for a host
dialog; the chosen path is opened native-side and published through the same
svc observation events).

### Open File dialog (Windows)

- Guest toolbar **Open** and **Ctrl+O** send `{"t":"pv","cmd":"pick-file"}`.
- Runtime drain sees `pick-file` → `proxy.send_event(Wake::PickFile)`.
- Window thread opens a native file dialog (`rfd`) with the conservative
  product image filter. Modal dialog stays on the UI thread.
- On accept, window sends `Input::OpenPath(path)`; runtime maps it to
  `Command::Open(path)` before the guest frame (`RequestPhase::before_guest_frame`).
- Cancel is a no-op. Bad path after pick uses existing bounded product error.

Dependency: `rfd` on Windows only (target-gated). No second decode path.

### File association truth (conservative)

Product-claim association set (register/unregister only these):

```text
.jpg .jpeg .png .bmp
```

GIF is excluded: current WIC first-frame decode is not full GIF product
support (animation policy stays Issue #10). WebP is excluded until the
product baseline is proven on supported Windows systems, not merely the
local WIC install.

BrowseSession may still enumerate additional extensions that WIC can open
(`.tif` `.tiff` `.avif` `.gif` `.webp`) as directory candidates; those are
**not** claimed for file association in this PR. Association eligibility ≠
codec discovery ≠ BrowseSession filter.

Registration mechanism: application-side CLI, not a full installer.

```text
picoview.exe --register-associations
picoview.exe --unregister-associations
```

Writes HKCU `Software\Classes` ProgID + OpenWithProgids for the set above,
pointing at the running executable path. Idempotent. Failures return a
non-zero exit with a bounded message. Do not auto-register on every launch.

### UI shell

Visual target: PicoView UI/UX Design v1.0 mockup (dark Windows viewer).

```text
┌ title strip ───────────────────────────────────────┐
│ PicoView          filename  (N / total)            │
├ toolbar ───────────────────────────────────────────┤
│ [Open] | [Prev][Next] | [−] 67% [+] | [Fit][1:1] | [Refresh] │
│  icon + label stacked; groups separated            │
├ canvas #111111 ────────────────────────────────────┤
│              image centered                        │
│         ‹ side overlay ›  (absolute inset-0)       │
│         empty / error states centered              │
├ status ────────────────────────────────────────────┤
│ 4000 × 3000 | Full resolution | 67% | 3 / 17 | name │
└────────────────────────────────────────────────────┘
```

Palette: bg `#1e1e1e`, toolbar `#252526`, canvas `#111111`, text `#f0f0f0`,
dim `#a0a0a0`, accent blue for primary empty/error CTA.

Icons: **baked SVG assets** (16×16 filled circle/rect/path; no stroke, no
arcs — PocketJS `bakeSvg` subset). Files live next to the guest entry and
are referenced as `<Image src="icon-*.svg" />`. 1:1 uses a text glyph.

Layout classes that are supported: `absolute`, `inset-0`, `left/right/top/bottom-N`,
`flex-row/col`, arbitrary hex `bg-[#252526]`. No CSS `position`/`transform` strings.

Disabled states: icon opacity 0.3, dim label, not focusable, action not wired.

Empty: image placeholder + "Open an image to get started" + accent **Open File...**
Error: warning icon + "Could not open this image" + bounded error + Previous/Next when available.

Rotate Left/Right, Flip H/V, and Reset participate in the #61 ViewTransform
handlers (not deferred).

Disabled states:

| Control | Enabled when |
| --- | --- |
| Open | always |
| Previous | `browse.canPrevious` |
| Next | `browse.canNext` |
| Zoom −/+/Fit | publication shown (`verdict === "image"`) |
| 1:1 | image shown **and** `fullResolution` |
| Refresh | current source exists (image, loading, or error with name) |

### Keyboard

| Key | Action |
| --- | --- |
| Left | Previous |
| Right | Next |
| R / F5 | Refresh |
| 0 | Fit |
| 1 | 1:1 (when available) |
| + / = | Zoom in |
| − | Zoom out |
| Ctrl+O | Open File… |

Host maps F5 to guest name `f5`. Guest handles `f5` and `ctrl+o` / `o` with
modifier.

### Architecture invariants preserved

- Publication / last-good / RequestPhase tokens from PR #57 stay valid.
- No full-plane clone after decode on the normal path.
- No PicoView-private PSM path, no second renderer, no raw wgpu ownership.
- View geometry / DPI / wheel / drag / rotate / flip are PR #61 authority.

## [S3] Out of Scope

- PocketJS pin change (`24bab5e8…` stays).
- Reinterpreting PR #61 view geometry, DPI, pointer ownership, EXIF O.
- Thumbnail strip, slideshow, edit, delete/rename, animation.
- Full installer / MSI / Start-menu polish beyond CLI association hooks.
- Associating every WIC-readable extension.
- Upstream PocketJS PR prep.

## [S4] Launch Corrective (PR #60 product contract)

The first shell pass still required a developer-shaped launch (`--js` /
`--pak` / repo-relative `dist/`) and a console subsystem. This corrective
makes the release executable a self-contained Windows image viewer.

### Runtime assets

Production path embeds the compiled guest pair at compile time:

```text
native/build.rs  — fails if dist/picoview.{js,pak} missing; rerun-if-changed
native/src/assets.rs — include_str! / include_bytes! of those exact artifacts
```

Normal startup uses embedded bytes only. No CWD authority. No exe-walk
discovery. `--js` / `--pak` remain an explicit developer override and may be
used independently (each overrides one side; the other stays embedded).

Build order is deterministic:

```text
pocket.ts compile → dist/picoview.js + dist/picoview.pak
                 → cargo build --release embeds those exact bytes
```

### Windows executable

- Release (`not(debug_assertions)`): `windows_subsystem = "windows"` — no
  console on double-click / Open With / association launch.
- Debug: console kept for logging.
- Shell actions (`--register-associations` / `--unregister-associations`)
  still run headless and return status via process exit code.

### Initial window visibility

Create the winit window **hidden**. Show it only after the first successfully
presented frame. First visible state is the dark PicoView shell (empty /
loading / image), never an uninitialized white client. No sleep timers.

### Associations

Register Open With candidacy only:

```text
HKCU\Software\Classes\<ext>\OpenWithProgids\PicoView.Image = REG_NONE
```

Do **not** write `Software\Classes\<ext>\(Default) = PicoView.Image`.
That silently seizes per-user default ownership. Unregister still clears a
stolen default if it was ours (migration from the earlier over-claim).

RegisteredApplications is intentionally omitted: a bare name→ProgID entry
without Capabilities/FileAssociations is not a valid Default Programs
contract. Unregister clears any leftover entry from earlier over-claims.

### Keyboard residual

Keyboard Fit / 1:1 / zoom go through `guest/keyboard.ts` `keyboardIntent`
and are gated by the same enablement as the toolbar:

```text
no image:  0 / 1 / + / = / -  → no-op
proxy:     1                  → no-op
image:     normal
```

### Architecture invariants preserved

Still out of scope / untouched: PocketJS pin, CurrentItem publication
lifetime, direct image admission. View geometry (Fit/zoom/pan/rotate/flip/
DPI/gesture ownership) is PR #61 authority and is not redefined here.

## [S5] POST-#61 Integration

Campaign `PICOVIEW-PR60-POST-61-INTEGRATION-1` integrated this shell onto
post-#61 main (`161536f`). Shared files were reconstructed from main first,
then PR60 additive features were re-applied:

| Layer | Owner |
| --- | --- |
| ViewTransform / Fit / zoom / pan / D4 / EXIF O | PR #61 |
| hello.scale / Resize scale / wheel anchor / gesture ownership | PR #61 |
| Open File / Ctrl+O / icons / chevrons / empty-error status | PR #60 |
| Associations / embed / GUI subsystem / hidden-until-frame | PR #60 |

Toolbar must include the #61 Rotate/Flip/Reset actions; old PR60 “deferred
rotate/flip” claims are invalidated.

## Tasks

- [x] T1: Spec locked + worktree owns branch — acceptance: this doc on `feat/windows-shell-ui-polish-1` at base `bbda8db` (covers: S2)
- [x] T2: Guest UI shell polish + Open button + keyboard (F5, Ctrl+O) + icon helper — acceptance: toolbar groups Open/nav/zoom/view/refresh; disabled states correct; no dead chrome (covers: S2)
- [x] T3: Native pick-file + OpenPath unification — acceptance: Ctrl+O/Open uses rfd on UI thread; chosen path opens through existing CurrentItem pipeline (covers: S2; depends: T2)
- [x] T4: CLI association register/unregister for conservative formats — acceptance: `--register-associations` / `--unregister-associations` write/remove HKCU entries for jpg/jpeg/png/bmp only (covers: S2)
- [x] T5: Guest unit tests + native tests + release build — acceptance: `bun test guest/` and `cargo test` pass; `cargo build --release` succeeds (covers: S1,S2; depends: T2,T3,T4)
- [x] T6: Windows smoke A/B/corrupt/D + path-with-spaces + open/reopen — acceptance: no crash, last-good preserved on refresh fail, navigation continues past corrupt (covers: S1; depends: T5)
- [x] T7: Context/roadmap/spec report finalized — acceptance: delivered report with base/head/pin/verdict (covers: S2; depends: T5,T6)
- [x] T8: Embed guest pair + drop CWD/dist discovery — acceptance: no-arg launch uses embedded js/pak; `--js`/`--pak` are explicit overrides only; build.rs fails if dist missing (covers: S4)
- [x] T9: Release GUI subsystem + hidden-until-first-frame window — acceptance: release PE is Windows GUI; first visible state is dark PicoView shell after first present (covers: S4)
- [x] T10: Association OpenWith-only registration — acceptance: register writes OpenWithProgids REG_NONE only; no extension default overwrite; unregister cleans ProgID + OpenWith (+ any stolen default) (covers: S4)
- [x] T11: Keyboard canImage gate — acceptance: `keyboardIntent` blocks 0/1/+/- without image and 1 on proxy; guest tests cover the matrix (covers: S4)
- [x] T12: Hostile-CWD / path / console smoke + finalize — acceptance: launch from C:\ and %TEMP%, ASCII/spaces/CJK, no console, no white flash evidence recorded (covers: S4; depends: T8,T9,T10,T11)
- [x] T13: POST-#61 rebase/integration — acceptance: #61 ViewTransform/hello.scale/gesture/wheel/D4 preserved; PR60 shell re-applied; stale deferred claims removed (covers: S5)

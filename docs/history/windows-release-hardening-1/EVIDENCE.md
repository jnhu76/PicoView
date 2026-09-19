# PICOVIEW-WINDOWS-RELEASE-HARDENING-1 — Evidence

Status: **COMPLETE — artifacts produced, live acceptance PASS, one known
limitation recorded (CJK filename tofu, pre-existing PocketJS baked-glyph
scope).** Branch `release/windows-release-hardening-1` off BASE
`21cdaa1255a3266befd1b3ee53a48a256b52a9a3` (= `main` = `origin/main` at
campaign start).

## 1. Identity

| Field | Value |
| --- | --- |
| PicoView base | `21cdaa1` (verified `main == origin/main == BASE_SHA`) |
| Branch | `release/windows-release-hardening-1` |
| PocketJS | `POCKETJS.lock` revision `720e6ee3ed91d53038ae6c6330420bb46dabca30` — **unchanged** (no PocketJS code touched) |
| Toolchain | rustc/cargo 1.98.1 (msvc), bun 1.2.8, Python 3.12.10 + Pillow 12.2.0 (audit only, not a build dependency), Inno Setup 6.7.3 |
| Host | machine `HU`, Windows 11 专业版 10.0.26200, AMD Radeon(TM) Graphics, 2560×1440 |
| Version authority | `native/Cargo.toml` `version = "0.1.0"` (agrees with `guest/pocket.json` 0.1.0; single authority, no second manually maintained release version) |
| Windows-native | all installer/install/uninstall/shell evidence gathered on native Windows processes |

## 2. Icon authority (Phases 1–3)

Source pack audited: `C:\Users\fred1\source\icons` — 93 files, one design
exported per platform (android/ios/mac/phonegap/webapp/windowsphone). No
README/license/generator metadata found → recorded as **user-provided local
artwork** (`assets/branding/PROVENANCE.md`). No third-party icon library is
claimed.

Selection: owner instructed (2026-09-19) that a ready-made .ico exists and
should be used directly without conversion. Verified from the binary:

- `webapp/favicon.ico` is a genuine 4-entry ICO, all 32bpp:
  16×16 / 32×32 / 64×64 / 256×256 (256 entry is an uncompressed BMP,
  270 376 B — hence the 292 774 B file).
- Used verbatim → `assets/branding/picoview-app.ico`
  (sha256 `e686aaf5fcdbd355b74b6f9efa5f84dc88618717579c927ed12fb9f7ae1980b7`).
- Largest clean transparent export of the same artwork committed as
  re-derivation master → `assets/branding/picoview-app-master.png`
  (1024×1024 RGBA, from `mac/AppIcon.appiconset/icon-512@2x.png`).

Deviation note: the generic 9-size recommendation (16/20/24/32/40/48/64/128/256)
is not met by design — the owner-supplied file is used as-is, so 24/48/128
entries are absent and Windows scales 32→24 / 64→48 from the same artwork.
Small-size acceptance (16/32/64) verified visually
(`img/ico-entries-16-32-64-256.png`): recognizable silhouette, no clipping,
no halo, no excess margin.

## 3. EXE identity (Phases 3–4)

`native/build.rs` embeds, via `winresource` (new build-dependency):

- icon resource **1** = `assets/branding/picoview-app.ico`;
- VERSIONINFO: ProductName `PicoView`, FileDescription `PicoView Image
  Viewer`, InternalName `PicoView`, OriginalFilename `picoview.exe`,
  FileVersion/ProductVersion `0.1.0` (strings + numeric words both derived
  from the Cargo package version; winresource derives numeric words from
  `CARGO_PKG_VERSION_*` itself);
- CompanyName / LegalCopyright intentionally absent — the repository declares
  no publisher identity or copyright holder; none was invented.

Verified via `Get-Item().VersionInfo` on the built EXE (all fields correct)
and `Icon.ExtractAssociatedIcon` (`img/explorer-associated-icon.png`).

Window/taskbar integration (`native/src/app.rs`): the window is created with
`with_window_icon(Icon::from_resource(1, SM_CXSMICON))` and
`with_taskbar_icon(Icon::from_resource(1, None))` — both load the same
resource-1 icon once at window creation (winit `LoadImageW`); nothing is
loaded per frame. The small icon is sized to the system small-icon metric so
100/125/150% DPI get crisp native sizes.

Live acceptance: titlebar icon verified on the dev build and on the installed
Program Files build (`img/dev-titlebar-zoom.png`,
`img/installed-titlebar-zoom.png`); taskbar icon verified with the app in
foreground (`img/taskbar-full.png`, bottom-right running app). Alt-Tab and
Start Menu share the same resource-1 authority (Start Menu .lnk icon
location verified as `{app}\picoview.exe,0`).

## 4. Installer (Phases 5–8, 12)

Decision: **Inno Setup 6** (campaign default; installed 6.7.3 via winget —
per-user location `C:\Users\fred1\AppData\Local\Programs\Inno Setup 6`).
Script: `packaging/windows/picoview-setup.iss`.

| Fact | Value |
| --- | --- |
| Install path | `C:\Program Files\PicoView\` (admin; UAC prompt expected and observed) |
| Payload | `picoview.exe` only (guest JS/PAK embedded at compile time) — plus Inno's unins000.* |
| Start Menu | `{group}\PicoView` → verified `PicoView.lnk` target + icon |
| Desktop shortcut | optional task, **unchecked by default** (`img/installer-wizard-additional-tasks.png`) |
| Uninstall entry | `HKLM\...\Uninstall\{A7C3E0C1-...}_is1`: DisplayName `PicoView 0.1.0`, DisplayIcon → installed exe, UninstallString `unins000.exe` |
| Installer display | SetupIconFile = same `picoview-app.ico`; wizard caption verified |
| Version metadata | `AppVersion` passed by the release script from Cargo.toml; standalone ISCC falls back to reading the EXE's VERSIONINFO (same authority) |

Association handling stays product-owned: the installer runs
`picoview.exe --register-associations` (Run entry, logged exit 0) and
`--unregister-associations` on uninstall (`RunOnceId: UnregisterAssoc`). The
.iss itself writes no registry keys — the HKCU OpenWithProgids contract stays
in `native/src/associations.rs`.

## 5. Install / uninstall cycle (Phase 17)

Full cycle executed against the real artifacts:

1. Install (silent, UAC approved): dir + Start Menu + uninstall key +
   association registration all verified present.
2. Launch from install path with image: opens and presents; installed
   titlebar icon verified (above).
3. Shell-open with a path containing spaces **and CJK**
   (`.tmp-shelltest/测试 图片 with spaces.jpg`): exact path received, image
   decoded and shown at full resolution 8256×5504, 1/1 in browse context.
4. Uninstall (silent, UAC approved, exit 0): install dir removed, Start Menu
   link removed, uninstall registry entry removed, ProgID tree removed,
   `.jpg` OpenWithProgids membership cleared, extension defaults never
   touched (empty before and after).
5. Final install left in place at owner request (no further cycles).
   Verified consistent: uninstall entry, ProgID, OpenWithProgids, Start Menu
   all present.

## 6. File associations / shell open (Phases 9–10)

Registered set = product truth in `associations.rs`:
**`.jpg .jpeg .png .bmp`** (GIF/WebP deliberately excluded by product
authority). Registry shape after install (verified):

- `HKCU\Software\Classes\PicoView.Image` → `PicoView Image`, DefaultIcon
  `{exe},0`, `shell\open\command = "C:\Program Files\PicoView\picoview.exe" "%1"`
  (properly quoted);
- per-extension `OpenWithProgids` membership only;
- **no extension default written, no UserChoice written** — PicoView does not
  seize the user's default viewer;
- `RegisteredApplications` intentionally not written (invalid contract
  without Capabilities, per existing code comment).

"Open With" availability follows from the OpenWithProgids membership; the
resolved command was exercised directly with spaces/CJK paths (section 5).
The literal right-click menu appearance was not screenshot-verified (manual
interactive step).

## 7. Portable release (Phase 11)

`PicoView-0.1.0-windows-x64-portable.zip` — contents: `PicoView/picoview.exe`
only. Verified: extracts and launches from a neutral directory, opens an
image by argument, and **does not touch the registry** (ProgID absent before
and after launch). No association registration from the portable build.

## 8. Release entrypoint + reproducibility (Phases 13–15)

One authoritative script: `scripts/build-windows-release.ps1`
(guest compile → cargo release → tests → portable zip → installer → hashes).
Guest compile runs from the subtree root via the sanctioned gitignored
`third_party/pocketjs/guest` junction (created and removed per build —
matches the .gitignore entry and historical evidence); guest tests resolve
`@pocketjs/framework/*` through a gitignored `node_modules/@pocketjs/framework`
junction created and removed by the script for the same reason. Neither the
icon source directory `C:\Users\fred1\source\icons` nor any machine state
outside the repo is referenced: a clean clone with bun + Rust + Inno Setup
reproduces both artifacts. `dist-release/` is gitignored.

Guest bundle reproduced byte-identical to the committed live-DPI baseline
(391 267 B js + 673 184 B pak).

## 9. Tests (Phase 20)

| Suite | Result |
| --- | --- |
| `bun test guest/` | **194 passed, 0 failed** |
| `cargo test --release` (native) | **64 passed, 0 failed** |
| `cargo build --release` | clean |
| guest compile (`pocket.ts compile --target windows-app`) | pass 2 ok |
| installer compile (ISCC) | Successful compile |
| install/uninstall cycle | pass (section 5) |

POCKETJS.lock: unchanged (verified via git diff).

## 10. Artifacts + hashes (Phase 18)

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `PicoView-0.1.0-windows-x64-portable.zip` | 4 809 521 | `a1582aacfc067fa00dc70de57037dc321529fc19fe025fed83990d4e5510680c` |
| `PicoView-0.1.0-windows-x64-setup.exe` | 5 689 878 | `eadbcb942a7828d8c5d4633862b43d5beb952b9300f01a58848e770fb56e2cb2` |

Integrity hashes only — these are not signatures.

## 11. Code signing (Phase 19)

**CODE_SIGNING = NOT CONFIGURED.** No code-signing certificate exists in the
user or machine stores (audited); none was fabricated. Expected consequence:
SmartScreen may warn on first run of the unsigned installer/portable EXE.
Not a release blocker for this campaign.

## 12. Known limitation — CJK filename tofu in the status bar

Opening a file whose name contains CJK characters renders tofu (□□) in the
status bar filename slot
(`img/cjk-path-open-statusbar-tofu.png`). Root cause, traced:

- the status bar renders the runtime item name
  (`guest/app.octane.tsx` — "Filename / index stay in the status bar");
- PocketJS text is a **compile-time baked-glyph atlas**: pass 1 collects
  codepoints from source literals (`tools/build.ts` walk → `bakeAtlases`);
  characters that only ever occur in runtime strings (user filenames) were
  never baked and render as notdef/boxes.

Assessment: pre-existing generic PocketJS text-system scope, not a defect
introduced by this campaign (reproduces on `main` for any CJK-named file).
The product truth "a status readout" (PRD §2.11) does not mandate raw
filename display. A genuine fix (runtime glyph resolution / system-font
fallback for runtime text) is a generic PocketJS capability and belongs
upstream per the cross-repo rule — recorded for a future PocketJS campaign,
not patched locally. Per campaign scope rule: reported, not silently
expanded.

Minor pre-existing cosmetic note: CJK glyphs also do not render in the
window titlebar filename region for the same reason (native caption text is
OS-rendered correctly; the in-client tofu above is the only defect).

## 13. Adversarial review (Phase 21)

| Q | Verdict |
| --- | --- |
| A. Titlebar still old icon? | NO — verified dev + installed (`img/*-titlebar-zoom.png`) |
| B. Explorer icon ≠ runtime taskbar icon? | NO — one resource; ExtractAssociatedIcon == titlebar artwork |
| C. Entire icons dir committed? | NO — exactly 2 asset files + PROVENANCE.md |
| D. Tiny source upscaled? | NO — ICO verbatim (real 16–256), master 1024 |
| E. ICO multi-size? | YES — 16/32/64/256 @32bpp, verified from binary |
| F. 16×16 recognizable? | YES — `img/ico-entries-16-32-64-256.png` |
| G. Installer icon different/outdated? | NO — same .ico, wizard verified |
| H. Version duplicated manually? | NO — Cargo.toml only; iss reads it via script/EXE |
| I. Uninstall leaves stale registrations? | NO — full-cycle verified clean |
| J. Installer steals defaults? | NO — OpenWithProgids only; defaults empty |
| K. Unsupported extensions registered? | NO — jpg/jpeg/png/bmp = product baseline |
| L. Open With fails on spaces? | NO — quoted `%1`; spaces+CJK launch verified |
| M. Portable mutates registry? | NO — verified before/after |
| N. Build depends on C:\Users\fred1\source\icons? | NO — committed assets only |
| O. POCKETJS.lock changed without reason? | NO — untouched |
| P. Release work became refactor? | NO — +120 lines across 5 files, all release-identity scoped |

MAJOR: none open.
MINOR: (1) ICO 24/48/128 entries absent by owner decision — Windows scales;
(2) CJK filename tofu — pre-existing, upstream PocketJS scope (section 12);
(3) right-click Open With menu + Settings "Installed Apps" appearance not
screenshot-verified (interactive UX; registry + launch behavior verified).

## 14. Changed files

```
.gitignore                      (+3)  dist-release/
native/Cargo.lock               (+41) winresource build-dep graph
native/Cargo.toml               (+5)  winresource build-dep + Win32_UI_WindowsAndMessaging
native/build.rs                 (+31) icon + VERSIONINFO embedding
native/src/app.rs               (+40) window/taskbar icon from resource 1
assets/branding/                (new) picoview-app.ico, picoview-app-master.png, PROVENANCE.md
packaging/windows/              (new) picoview-setup.iss
scripts/                        (new) build-windows-release.ps1
docs/RELEASE-WINDOWS.md         (new) release authority doc
docs/history/windows-release-hardening-1/  (new) this evidence
```

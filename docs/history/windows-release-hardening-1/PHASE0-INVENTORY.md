# PICOVIEW-WINDOWS-RELEASE-HARDENING-1 — Phase 0 inventory

Campaign: Windows release hardening 1.
BASE_SHA verified: `main == origin/main == 21cdaa1255a3266befd1b3ee53a48a256b52a9a3`.
Branch: `release/windows-release-hardening-1` (isolated from that SHA).
Untracked `.tmp-remix/` (Remix toolbar SVG sources) left untouched, out of scope.

## Current Windows release state (audit, pre-change)

| Area | Current reality |
| --- | --- |
| Executable output | `native/target/release/picoview.exe` (~12.9 MB, single file). Guest artifacts are **embedded at compile time** (`native/src/assets.rs` `include_str!`/`include_bytes!` of `dist/picoview.js` + `dist/picoview.pak`). Runtime payload = the EXE alone. |
| Runtime payload | picoview.exe only; `--js`/`--pak` are developer overrides. No DLL-sidecars observed for the normal path (wgpu falls in-binary). |
| EXE icon | **None embedded.** No `.rc`, no winres/embed-resource in `native/build.rs` (guest-artifact gate only). Explorer shows the default placeholder icon. |
| Titlebar / window icon | winit 0.30.13 registers window class with `hIcon: 0, hIconSm: 0` and the app never calls `with_window_icon` → default/placeholder titlebar icon (the known ugly icon). |
| Taskbar / Alt-Tab icon | Same placeholder (no resource, no WM_SETICON). |
| Version metadata | **None.** No VERSIONINFO resource. Version authority: `native/Cargo.toml` `version = "0.1.0"` and `guest/pocket.json` `"version": "0.1.0"` — currently in agreement. ProductName would be absent entirely. |
| Installer story | **None.** No installer infra of any kind in the repo. |
| File association story | Exists product-side: `native/src/associations.rs` — HKCU-only registration via CLI `picoview.exe --register-associations` / `--unregister-associations`. ProgID `PicoView.Image`, DefaultIcon `{exe},0` (relies on EXE icon resource — currently placeholder), command `"{exe}" "%1"` (quoted). Extensions: `.jpg .jpeg .png .bmp` (deliberately narrow; GIF/WebP excluded). Writes only `OpenWithProgids` + ProgID tree; **does not steal defaults**, does not write `UserChoice` or extension default. Idempotent register/unregister. |
| Command-line file-open | `picoview.exe <path>` positional image argument (`runtime.rs parse_args`, `args.image`), plus dev flags `--js --pak --title --viewport --density`. |
| PocketJS provenance | `POCKETJS.lock` revision `720e6ee3ed91d53038ae6c6330420bb46dabca30` (`integration/picoview-desktop`, subtree at `third_party/pocketjs`). Unchanged this campaign unless a generic bug forces a stop-gate report. |
| Guest build recipe (history) | From PocketJS checkout root: `bun tools/pocket.ts compile --target windows-app --manifest guest/pocket.json --project-root . --outdir dist`, with `pocketjs/guest/` as a directory junction to `PicoView/guest/` (untracked scaffolding; standalone checkout absent on this machine — must recreate junction against in-tree subtree). `bun 1.2.8` present. |
| Tooling present | `cargo`/`rustc` (1.98.1 per last evidence), `bun 1.2.8`. **Inno Setup: not installed** (needed per Phase 5 decision). No code-signing certificate found yet (Phase 19 audit pending). |

## Toolchain gaps for this campaign

1. Inno Setup (ISCC) — must be installed to compile the installer.
2. ICO generation tooling — user states a ready-made .ico likely exists in `C:\Users\fred1\source\icons`; if it contains the required Windows sizes, use it directly (user instruction 2026-09-19); else generate reproducibly.
3. Guest compile junction scaffolding — recreate `third_party/pocketjs/guest` junction for the clean-build proof (untracked, never committed).

# Windows release authority

How PicoView Windows release artifacts are produced, what they contain, and
what they promise. Operational evidence for the current state:
`docs/history/windows-release-hardening-1/EVIDENCE.md`.

## Version authority

`native/Cargo.toml` `version`. The EXE VERSIONINFO (build.rs), the installer,
and the artifact names all derive from it. `guest/pocket.json` carries the
same value today; there is no second manually maintained release version.

## Build & release

One entrypoint:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows-release.ps1
```

Pipeline: guest compile (`bun tools/pocket.ts compile --target windows-app`,
run from the subtree root with the gitignored `third_party/pocketjs/guest`
junction created/removed per build) → `cargo build --release` → tests
(guest 194 / native 64 at time of writing) → portable zip → installer →
SHA-256 report. Requires: bun, Rust (msvc), Inno Setup 6 (`ISCC.exe`).

The guest JS/PAK are embedded into the EXE at compile time
(`native/src/assets.rs`); the runtime payload is the single EXE.

## App identity (one icon authority)

`assets/branding/picoview-app.ico` (user-provided artwork; provenance in
`assets/branding/PROVENANCE.md`) is embedded by `build.rs` as EXE icon
resource 1 and feeds: Explorer, titlebar, taskbar, Alt-Tab, Start Menu
shortcut, ProgID DefaultIcon, and the installer/uninstaller. Icon resource
embedding also writes VERSIONINFO (ProductName `PicoView`, FileDescription
`PicoView Image Viewer`, File/ProductVersion = package version; no
Company/copyright is invented).

Re-derivation master (future regeneration): `picoview-app-master.png`.
The committed ICO is used verbatim per owner instruction; it contains
16/32/64/256 @32bpp (24/48 come from Windows scaling).

## Installer

Inno Setup 6, script `packaging/windows/picoview-setup.iss`:

- machine install to `{autopf}\PicoView` → `C:\Program Files\PicoView\`;
  UAC prompt is expected and allowed;
- Start Menu shortcut always; desktop shortcut as an **unchecked option**;
- uninstall entry with correct version/icon; uninstall removes binaries,
  Start Menu link, uninstall registry key, and runs the product's
  `--unregister-associations`;
- artifact: `dist-release/PicoView-<version>-windows-x64-setup.exe`.

## File associations

Product-owned (`native/src/associations.rs`), invoked by the installer —
the .iss writes no association keys itself. Scope: `.jpg .jpeg .png .bmp`
(product baseline; GIF/WebP deliberately excluded). HKCU only,
`OpenWithProgids` membership + `PicoView.Image` ProgID. **PicoView never
seizes the default viewer** — no extension default, no UserChoice. Open
command is quoted: `"...picoview.exe" "%1"`.

Known limitation: filenames with CJK characters render tofu in the status
bar (PocketJS baked-glyph atlas covers compile-time literals only) —
pre-existing, upstream PocketJS scope. See evidence §12.

## Portable

`dist-release/PicoView-<version>-windows-x64-portable.zip` — the EXE only.
Launches standalone, accepts an image path argument, registers nothing.

## Code signing

**NOT CONFIGURED.** No certificate exists; none fabricated. SmartScreen may
warn on first run. Integrity hashes are recorded per release; they are not
signatures.

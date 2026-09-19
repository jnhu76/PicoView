# Windows release authority

How PicoView Windows release artifacts are produced, what they contain, and
what they promise. Operational evidence for the current state:
`docs/history/windows-release-build-corrective-1/EVIDENCE.md` (build topology)
and `docs/history/windows-release-hardening-1/EVIDENCE.md` (identity,
installer, install/uninstall, live acceptance).

## Version authority

`native/Cargo.toml` `version`. The EXE VERSIONINFO (build.rs), the installer,
and the artifact names all derive from it. `guest/pocket.json` carries the
same value today; there is no second manually maintained release version.

## Build & release

Three layers, each with one canonical command, all run from the repository root.
No step creates a junction, symlink or copy of the framework, mutates
`node_modules` to fake resolution, or writes to `third_party/pocketjs` sources.

| Layer | Produces | Canonical command |
| --- | --- | --- |
| Guest | `dist/picoview.js`, `dist/picoview.pak` | `pwsh -NoProfile -File scripts\build-guest.ps1` |
| Native | `native/target/release/picoview.exe` | `cargo build --release --manifest-path native/Cargo.toml` |
| Release | portable ZIP + installer | `pwsh -NoProfile -File scripts\build-windows-release.ps1` |

The guest build compiles PicoView as a PocketJS **external project** from the
repository root:

```powershell
bun third_party/pocketjs/tools/pocket.ts compile --target windows-app `
  --manifest guest/pocket.json --project-root . --outdir dist
```

`guest/pocket.json` is the manifest, `--project-root .` is the repository root,
and the project's committed module resolution is `tsconfig.json`: its `paths` map
the guest's `@pocketjs/framework/*` and `octane` imports onto the in-tree
framework files (the same targets the framework publishes in its `exports` map).
`bun test guest/` resolves through the same configuration. The compile must not
need `third_party/pocketjs/guest`, a `node_modules/@pocketjs/framework` entry, or
any other generated topology.

Before compiling, `scripts/build-guest.ps1` installs the vendored framework's own
runtime dependencies from its committed lockfile:

```powershell
bun install --frozen-lockfile --cwd third_party/pocketjs
```

(`octane`, `solid-js` and the rest of `third_party/pocketjs/package.json`.) They
install into the framework's own gitignored `node_modules`, so app and renderer
share exactly one copy of each — the install a PocketJS checkout requires anyway.

The native layer consumes `dist/picoview.{js,pak}` as generated inputs and never
invokes Bun; `native/build.rs` fails with the guest command to run when either
artifact is missing. The guest JS/PAK are embedded into the EXE at compile time
(`native/src/assets.rs`); the runtime payload is the single EXE.

One release entrypoint:

```powershell
pwsh -NoProfile -File scripts\build-windows-release.ps1
```

Pipeline: guest build → `cargo build --release` → tests (guest 194 / native 64 at
time of writing) → portable zip → installer → SHA-256 report. It is orchestration
only — no junction/symlink, no `node_modules` surgery, no `third_party` edits, and
no execution-policy bypass (`-SkipTests` skips the suites, `-Iscc <path>` points at
`ISCC.exe`).

Windows PowerShell 5.1 runs both scripts, spelled without `pwsh`:

```powershell
powershell -NoProfile -File scripts\build-windows-release.ps1
```

Requires: bun, Rust (msvc), Inno Setup 6 (`ISCC.exe`).

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

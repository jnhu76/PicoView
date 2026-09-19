# PICOVIEW-WINDOWS-RELEASE-BUILD-CORRECTIVE-1 — Evidence

Status: **COMPLETE — junction topology removed, clean-checkout oracle PASS, release
revalidated.** Branch `release/windows-release-hardening-1`. Prior head
`5193e20721ef42c44e39ef89ecf319f9cc55fccd`; corrective commit
`b4b9dd08ab66e294c0e6c7192f21ba18414d81b4` (this evidence document is a
docs-only follow-up on top of it).

## 1. Identity

| Field | Value |
| --- | --- |
| PicoView prior head | `5193e20` (release-hardening packaging commit) |
| PicoView corrective head | `b4b9dd0` |
| Branch | `release/windows-release-hardening-1` |
| PocketJS | `POCKETJS.lock` revision `720e6ee3ed91d53038ae6c6330420bb46dabca30` — **unchanged**; no PocketJS source touched, `third_party/pocketjs` clean after builds |
| Toolchain | bun 1.2.8, rustc/cargo 1.98.1 (msvc), Inno Setup 6 (ISCC), Windows PowerShell 5.1 |
| Host | machine `HU`, Windows 11 10.0.26200.9457, native Windows processes |
| Version authority | `native/Cargo.toml` `version = "0.1.0"` (unchanged) |

## 2. What was removed

Two junction mechanisms existed in the release path, both created by the build
script and removed again per build:

| Mechanism | Why it existed | Now |
| --- | --- | --- |
| `third_party/pocketjs/guest` → `guest/` | so `pocket.ts compile` could run from the framework root with the guest visible under it | **removed** — compile runs from the repository root as an external project |
| `node_modules/@pocketjs/framework` → `third_party/pocketjs` | so `bun test guest/` could resolve `@pocketjs/framework/*` | **removed** — resolution comes from committed `tsconfig.json` |

Nothing replaced them: no symlink, no copied framework tree, no generated
`node_modules` entry, no `PATH`/`NODE_PATH` manipulation. Junction count in the
release path: **2 mechanisms before, 0 after**. (`cmd dir /AL /S` over the
repository and over the clean oracle worktree reports no junction in either.)

## 3. Phase 1 — the intended invocation, recorded as it was

From the repository root, with `third_party/pocketjs/guest` absent:

```powershell
bun third_party/pocketjs/tools/pocket.ts compile --target windows-app `
  --manifest guest/pocket.json --project-root . --outdir dist
```

Result at `5193e20` (exit 1, before any bundling):

```
C:/Users/fred1/source/PicoView/guest/app.octane.tsx:1:34 TS2307:
  Cannot find module 'octane' or its corresponding type declarations.
```

The failure is in PocketJS's app type check, not in bundling: the guest's own
`import { useRef, useState } from "octane"` had no module resolution outside the
framework root.

## 4. Phase 2 — adjudication: case A, missing committed project configuration

Not B. PocketJS's external-project support is not the defect, on the evidence:

- The compiler resolves `@pocketjs/framework[/<subpath>]` from its **own** subpath
  registry (`framework/compiler/subpaths.ts` → `packagePath` in
  `framework/compiler/jsx-plugin.ts`), independently of `projectRoot`: pass 1
  (`tools/build.ts resolveImport`) and pass 2 (`jsxPlugin.onResolve`) both use it,
  so no `node_modules` was ever needed for framework subpaths.
- Bun's bundler and `bun test` both honour committed `tsconfig` `paths`
  (probed directly before the change: a scratch project importing `octane` and
  `@pocketjs/framework` bundled and tested successfully with `paths` as the only
  resolution).
- The failing specifier, bare `octane`, is the canonical way PocketJS octane apps
  import hooks — every framework app does it
  (`third_party/pocketjs/apps/cards/app.octane.tsx:1`).

What PicoView lacked was committed *project* module resolution at all: no
`tsconfig.json`, no `package.json`. That is case A, so the corrective is the
smallest normal committed project configuration, not a PocketJS change:
**`tsconfig.json`** at the repository root.

Its `paths` rows mirror the framework's **published `exports` map** for exactly
the specifiers `guest/` imports — verified row by row against
`third_party/pocketjs/package.json`:

| tsconfig `paths` key | target | framework `exports` row |
| --- | --- | --- |
| `@pocketjs/framework` | `framework/src/index.ts` | `"."` |
| `@pocketjs/framework/host` | `framework/src/host.ts` | `"./host"` |
| `@pocketjs/framework/input` | `framework/src/input-api.ts` | `"./input"` |
| `@pocketjs/framework/octane/components` | `framework/src/components-octane.tsx` | `"./octane/components"` |
| `@pocketjs/framework/octane/lifecycle` | `framework/src/lifecycle-octane.ts` | `"./octane/lifecycle"` |
| `@pocketjs/framework/octane/renderer` | `framework/src/renderer-octane.ts` | `"./octane/renderer"` |
| `octane` | `node_modules/octane` | framework dependency (`octane@0.1.26`) |

Rows not listed stay unresolved (fail loudly, TS2307) rather than resolving
somewhere unintended, and the rows never decide what gets *built*: the compiler
keeps resolving the bundle graph from its own registry.

Two environment facts the rows alone did not cover, both taken from what
PocketJS itself uses to typecheck apps rather than invented:

- `lib: ["ESNext"]` (no DOM) — required by the framework's own app typings
  (`framework/src/jsx.d.ts` supplies a type-only stand-in for solid-js's DOM
  `Node` precisely because `lib.dom` is absent).
- Ambient guest-host globals from the environment PocketJS typechecks its own
  apps in (`third_party/pocketjs/tsconfig.json`: `types: ["bun"]`), pinned to the
  vendored install via `typeRoots`. The framework polyfill references host
  globals (`queueMicrotask`/`setTimeout`/`console` —
  `framework/src/scheduler-polyfill.ts`) and the app check type-checks reachable
  framework sources.

The vendored framework's runtime packages remain where the framework expects
them (`third_party/pocketjs/node_modules`, gitignored): one copy shared by app
and renderer, never a PicoView-side duplicate.

## 5. Phase 3 — guest tests from a clean checkout

`bun test guest/` with no `node_modules` at the repository root and no junction:

```
194 pass, 0 fail, 1048 expect() calls across 12 files
```

(Same count as the release-hardening campaign — no test was skipped or changed.)

## 6. Phase 4 — build layer contract

| Layer | Input | Output | Command |
| --- | --- | --- | --- |
| Guest | `guest/*.ts(x)` | `dist/picoview.js`, `dist/picoview.pak` | `pwsh -NoProfile -File scripts/build-guest.ps1` |
| Native | those two generated artifacts | `native/target/release/picoview.exe` | `cargo build --release --manifest-path native/Cargo.toml` |
| Release | `picoview.exe` | portable ZIP, installer, hashes | `pwsh -NoProfile -File scripts/build-windows-release.ps1` |

- `native/build.rs` does **not** invoke Bun (grep over `native/build.rs` and
  `native/src/**`: the only occurrence of `bun` is inside the failure message).
  Its `git diff` against `5193e20` is message-only — icon and VERSIONINFO
  embedding code is byte-identical.
- The failure message now names the canonical guest build:
  `pwsh -NoProfile -File scripts/build-guest.ps1`, and the compile it runs.

## 7. Phase 5 — PowerShell is orchestration

`scripts/build-windows-release.ps1` responsibilities: resolve version (from
`native/Cargo.toml`), run the canonical guest build, `cargo build --release`, run
`bun test guest/` and `cargo test --release`, stage the portable payload, zip it,
invoke ISCC, report SHA-256. It contains no `mklink`, no junction, no
`node_modules` surgery and no `third_party` edit.

Documented invocation is `pwsh -NoProfile -File scripts\build-windows-release.ps1`;
the script contains no execution-policy bypass. Windows PowerShell 5.1 is the
same script spelled `powershell -NoProfile -File ...` (documented separately
because 5.1 is what this machine has; `pwsh` is not installed here).

The guest build's own dependency step is explicit and lockfile-pinned — the
vendored framework's install, the same one a PocketJS checkout needs
(`cd pocketjs && bun install`):

```powershell
bun install --frozen-lockfile --cwd third_party/pocketjs
```

## 8. Phase 6 — clean-checkout oracle (main gate)

Fresh `git worktree` at `b4b9dd0` (`../PicoView-oracle-1`), preconditions checked
explicitly:

| Precondition | State |
| --- | --- |
| `dist/` | absent |
| `dist-release/` | absent |
| `node_modules/` | absent |
| `third_party/pocketjs/node_modules/` | absent |
| `third_party/pocketjs/guest` | absent |
| generated junction/symlink | none (`dir /AL /S`: no reparse points) |
| `git status` | clean |

Documented build path run there (`powershell -NoProfile -File
scripts\build-windows-release.ps1`, exit 0):

| Stage | Result |
| --- | --- |
| framework dependency install | fresh install from the committed lockfile (`+ …` packages, `--frozen-lockfile`); `third_party/pocketjs/bun.lock` unchanged afterwards |
| guest build | `dist/picoview.js` 391,714 B `sha256=a3f007a7…`; `dist/picoview.pak` 673,184 B `sha256=32a23b25…` |
| `cargo build --release` | clean; `native/target/release/picoview.exe` 13,198,336 B |
| `bun test guest/` | 194 pass, 0 fail |
| `cargo test --release` | 64 passed, 0 failed |
| portable ZIP | `PicoView-0.1.0-windows-x64-portable.zip` produced |
| installer (ISCC) | Successful compile |

Post-build state of the oracle worktree: `git status` **clean** (no tracked file
changed anywhere, `third_party/pocketjs` included); no junction created; the only
new paths are gitignored build outputs (`dist/`, `dist-release/`, `node_modules/`,
`native/target/`).

Reproducibility: the guest artifacts from the clean worktree are **byte-identical**
to the ones the same commit produced in the primary worktree (same JS and PAK
hashes above) — the compile output does not depend on worktree state.

## 9. Phase 7 — release revalidation

| Suite | Result |
| --- | --- |
| `bun test guest/` | 194 passed, 0 failed |
| `cargo test --release` | 64 passed, 0 failed |
| full release command | pass (both artifacts produced) |
| `POCKETJS.lock` | unchanged (`git diff` empty) |

Semantics of the produced guest artifacts vs the previous (junction-built)
baseline, verified from binaries rather than asserted:

- The previously shipped `picoview.exe` embedded the pre-corrective bundle. That
  bundle (391,267 B) was extracted from it and compared with the new bundle
  (391,714 B): **byte-identical once Bun's module-path comment lines are
  removed**, and both carry 38 such comments (one per emitted module), so the
  module set is the same. Every differing byte lies in those comment lines — Bun
  writes module paths relative to the bundle root, and the root moved from the
  framework subtree to the repository root. The comparison is recorded from the
  run that made it (the baseline EXE was subsequently replaced by rebuilds, and
  re-deriving it would require the removed junction topology).
- `dist/picoview.pak` is **byte-identical** to the pre-corrective build
  (`sha256=32a23b25…`, unchanged).
- Both EXEs embed the same guest artifacts: embedded JS `sha256=a3f007a7…`,
  embedded PAK `sha256=32a23b25…`. The EXE files themselves differ only by
  embedded build-directory path strings (each contains its own worktree path),
  which is why the two worktrees' EXE/ZIP hashes differ.

Artifact hashes (this machine, this run):

| Artifact | Primary worktree | Clean oracle worktree |
| --- | --- | --- |
| portable ZIP | 4,809,821 B `sha256=34d9e68e77b40838085d365d2bbd15d94a947db715607c46c415175fe8547c4a` | 4,809,040 B `sha256=a3ada3b4fbdf3a0d0b2c5178f6c7cd5e322ddb66992eabfbb1b10efa8d388853` |
| installer | 5,688,747 B `sha256=18b4301b32920b6b7026c1bf6e46435bae8b55ca2143c812320d0a77a24f720b` | 5,688,914 B `sha256=bab54328089dfb26346155267ecd4bd30e9abe923ae099c1c33f991b3d5d7cdd` |

Smoke (both produced artifacts):

- Portable ZIP contains exactly `PicoView\picoview.exe` and launches standalone:
  started with an image argument, process alive after 6 s, main window title
  `PicoView`, terminated cleanly — for both the primary-worktree and the oracle
  artifact. Registration is flag-gated in the product (`--register-associations`
  / `--unregister-associations`, `native/src/main.rs`), so a plain launch cannot
  register; `HKCU\Software\Classes\PicoView.Image` was already populated on this
  machine from the earlier campaign, so this run does not re-prove
  "registers nothing" — the hardening campaign's dynamic evidence stands for it.
- Installer: ISCC compiles the unchanged script from the same version authority;
  the resulting `Setup.exe` reports ProductName `PicoView`, ProductVersion
  `0.1.0`. `packaging/` and `native/src/` are untouched by this corrective
  (`git diff 5193e20..b4b9dd0 -- packaging native/src guest assets` is empty), so
  no installer input changed and the campaign's human install/uninstall cycle was
  not repeated.

Unchanged release functionality (no file that defines it was modified): app icon
authority and EXE resource embedding, VERSIONINFO, titlebar/taskbar identity,
Inno Setup installer, Start Menu entry, uninstall, file associations, portable
artifact. The EXE still carries its icon resource (verified by extracting the
associated icon from the built binary).

## 10. Phase 8 — adversarial review

| # | Attack | Answer |
| --- | --- | --- |
| A | Does a clean build still need `mklink`? | No. No script contains `mklink`; the oracle built with no reparse point present and none created. |
| B | Does a clean test still need `node_modules` mutation? | No. `bun test guest/` passes with no `node_modules` at the root; resolution comes from committed `tsconfig.json`. |
| C | Does the build depend on a previously existing junction? | No. Both `third_party/pocketjs/guest` and `node_modules/@pocketjs/framework` were deleted before the corrective builds; the clean worktree never had them. |
| D | Does `third_party/pocketjs` become dirty after a build? | No. `git status` in both worktrees is clean after full builds; `bun.lock` unchanged. |
| E | Does `build.rs` secretly invoke Bun? | No. `build.rs` only checks for the artifacts and panics with the command to run; no `Command`/process spawn. |
| F | Is PocketJS generic external-project debt hidden in PicoView? | No. The external-project contract works (framework subpaths resolve in the compiler's own registry; committed `paths` cover the app-side specifiers). POCKETJS.lock and `third_party/pocketjs` are unchanged. Two upstream observations are recorded in §11 as non-blocking. |
| G | Can the guest compile run independently? | Yes — that exact command is what the passing builds ran, from the repository root. |
| H | Can the native build run independently after the guest build? | Yes. `cargo build --release --manifest-path native/Cargo.toml` succeeded on its own and produced the EXE. |
| I | Is PowerShell orchestration rather than dependency repair? | Yes. It runs the canonical guest build/test/cargo/ISCC commands; the only dependency step is the framework's own lockfile-pinned install, inside the guest build layer. |
| J | Did the corrective change product/release semantics? | No. `packaging/`, `native/src/`, `guest/`, `assets/` are unchanged; the PAK is byte-identical; the JS differs only in module path comments; version authority, icon and installer inputs unchanged. |

## 11. Upstream observations (non-blocking, not worked around silently)

1. **App check has no project-owned ambient declaration hook.** PocketJS's app
   check passes only its own declaration files
   (`framework/src/jsx.d.ts`, `vue-sfc.d.ts`) into the generated program, so an
   external project cannot contribute ambient declarations through
   configuration. PicoView's ambient needs were met from the environment
   PocketJS already uses for its own apps (`types: ["bun"]` via a pinned
   `typeRoots`) rather than by adding a declaration file that the check would not
   load.
2. **Octane entries have no in-repo exercised manifest.** No `pocket.json` in the
   framework sets `"framework": "octane"`; the octane demos are type-checked
   against the bare-root mapping in the framework's own `tsconfig.json`. PicoView
   mirrors that published mapping (`@pocketjs/framework` → the `"."` export,
   `framework/src/index.ts`), so its configuration agrees with what an installed
   `@pocketjs/framework` would resolve to. `POCKETJS.lock` is unchanged; nothing
   was patched into the subtree.

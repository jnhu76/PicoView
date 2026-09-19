# PICOVIEW-WINDOWS-RELEASE-FINAL-CORRECTIVE-1 — Evidence

Status: **COMPLETE — one installer correctness seam closed, two
evidence-truth seams closed.** No product code changed; no build topology
changed; no git history rewritten; nothing merged.

Branch `release/windows-release-hardening-1`. PR #73.

## 1. Identity

| Field | Value |
| --- | --- |
| Prior head | `8a92aa34573b7d6f71e9669ac8ea91f6ea7f5c3f` |
| Base of the campaign | same (no intermediate commits) |
| PocketJS | `POCKETJS.lock` revision `720e6ee3ed91d53038ae6c6330420bb46dabca30` — **unchanged** (verified: `git diff -- POCKETJS.lock` empty) |
| Toolchain | rustc/cargo 1.98.1 (msvc), bun 1.2.8, Inno Setup 6.7.3, Windows PowerShell 5.1 |
| Host | machine `HU`, Windows 11 10.0.26200, AMD Radeon(TM) Graphics |
| Release authority | [`docs/RELEASE-WINDOWS.md`](../../RELEASE-WINDOWS.md) |

## 2. Installer seam — association registration runs as the original user

### 2.1 The defect

The installer is elevated (`PrivilegesRequired=admin`, because it installs to
Program Files) while the registration it performs is a per-user `HKCU` write
(`picoview.exe --register-associations`, `OpenWithProgids` only). The `[Run]`
entry carried only `Flags: runhidden`, so the child process inherited Setup's
elevated token. Whenever the installing identity and the elevated identity
differ — over-the-shoulder elevation, where an administrator approves the UAC
prompt for a different user — the registration landed in the administrator's
hive instead of the user's.

### 2.2 The change

```diff
-Filename: "{app}\{#AppExe}"; Parameters: "--register-associations"; Flags: runhidden
+Filename: "{app}\{#AppExe}"; Parameters: "--register-associations"; Flags: runhidden runasoriginaluser
```

Product association implementation is untouched
(`native/src/associations.rs`): still `HKCU` only, still
`OpenWithProgids` membership + the `PicoView.Image` ProgID, still no extension
default and no `UserChoice`, so PicoView still never seizes the default viewer.
The .iss still writes no association keys of its own. Installer scope was not
redesigned.

### 2.3 Recorded limitation (documented, not worked around)

A launch from an already-elevated process, or the explicit **Run as
administrator** command, leaves Windows with no linked un-elevated token to
recover an "original user" from. Inno then falls back to Setup's own elevated
credentials and the keys land in that administrator's hive. No in-installer
workaround is attempted or invented; this is stated in the .iss comments, in
`docs/RELEASE-WINDOWS.md`, and here.

Uninstall keeps its existing behavior (`--unregister-associations`, elevated,
`RunOnceId: UnregisterAssoc`). The uninstaller clears the hive of the identity
running it, which is complete for the ordinary same-user case. After an
alternate-credential install, the cross-user `HKCU` cleanup is **incomplete** —
the per-user entries remain in the original user's hive and must be cleared from
that account with `picoview.exe --unregister-associations`. Documented in the
`[UninstallRun]` comment and in `docs/RELEASE-WINDOWS.md`; the behavior itself is
unchanged.

### 2.4 Validation of the flag (native Windows, ISCC 6.7.3)

The real script compiled successfully: ISCC reports
`Parsing [Run] section, line 85` (the association entry) and
`Successful compile (2.985 sec)`.

A successful compile alone would be weak evidence if ISCC ignored unknown flags,
so flag validation was proved separately with two throwaway scripts outside the
repository:

| Probe | Flags | Result |
| --- | --- | --- |
| Negative control | `runhidden runasoriginaluserX` | **`Error on line 13 …: Parameter "Flags" includes an unknown flag. Compile aborted.`** |
| Positive control | `runhidden runasoriginaluser` | `Successful compile (0.625 sec)` |

ISCC 6.7.3 therefore validates `[Run]` flag names, and the real script's compile
is meaningful: the flag exists in this version and is accepted in a script with
`PrivilegesRequired=admin` and `ArchitecturesInstallIn64BitMode=x64compatible`.

### 2.5 Install smoke — NOT RUN, and why

The install/uninstall smoke was **not** repeated. Setup requires elevation
(`PrivilegesRequired=admin`) and this session is not elevated
(`IsInRole(Administrator)` = `False`), so a silent install would raise a UAC
consent prompt that no one can answer unattended. Rather than background a
prompt that would hang, the smoke is recorded as **not covered by this
campaign**. The previously recorded install/uninstall cycle in
[`windows-release-hardening-1/EVIDENCE.md`](../windows-release-hardening-1/EVIDENCE.md)
§5 remains the last observed end-to-end install evidence; it predates this change
and does not cover the new flag's runtime effect. The first real install of this
installer build should re-verify: association keys under the launching user's
`HKCU`, and cross-user behavior after an alternate-credential install.

## 3. Evidence seam — the retired junction mechanism

`docs/history/windows-release-hardening-1/EVIDENCE.md` §8 still described the
junction-based guest compile as the release mechanism, contradicting
[`docs/history/windows-release-build-corrective-1/EVIDENCE.md`](../windows-release-build-corrective-1/EVIDENCE.md).

Changes (framing only — no historical claim was erased):

- a blockquote immediately under the Status line of that document supersedes §8
  up front, naming the corrective evidence file and stating the final release
  build: **no junction, no symlink, external project from the repository root**;
- §8 is retitled in place as **HISTORICAL MECHANISM AT ORIGINAL HARDENING
  COMMIT — RETIRED**, repeats the SUPERSEDED BY / FINAL RELEASE BUILD block, and
  records that both junctions (and the `.gitignore` entries that served them) are
  gone with nothing replacing them — the current command being the
  external-project compile from the repository root;
- the old byte-identity claim is kept but scoped to the retired topology, with
  the current topology's 391,714 B JS and byte-identical 673,184 B pak and a
  pointer to the corrective evidence §9 for the byte-level comparison;
- `docs/history/windows-release-hardening-1/PHASE0-INVENTORY.md` carries the same
  retirement on both of its junction entries, including the "recreate the
  junction" toolchain-gap item, which now says **RETIRED — do not follow**.

Adversarial-review rows: the §13 table of that document contains **no row that
presents a junction as current** (checked row by row and by `grep -i junction`
over the file — the only hits were inside §8, now superseded). No row needed
changing. The corrective document's own adversarial table already states the
current truth (no `mklink`, no reparse point, no junction dependency).

## 4. Evidence seam — dead references to removed media

All owner-machine screenshots and test media were removed from the tree in the
two preceding privacy commits (`2edafeb`, `8a92aa3`; 63 tracked media files).
Current markdown still referenced many of them.

| | Count |
| --- | --- |
| Reference sites to deleted files **before** | **54** across 7 markdown files (measured by basename match against the deletion set), plus 2 brace-group references in `docs/history/mvp-2026-09/compose/desktop-ui-normalization-1.md` that a basename scan cannot attribute — **56 sites**. |
| Reference sites to deleted files **after** | **0** |

Nine markdown files were edited:

- `docs/history/windows-release-hardening-1/EVIDENCE.md` (7 sites + a
  document-level captures note);
- `docs/history/live-dpi-acceptance-1/PICOVIEW-LIVE-DPI-ACCEPTANCE-1-EVIDENCE.md`
  (5 in-body sites, the whole §10 committed-screenshot index of 16 files, and a
  captures note);
- `docs/history/mvp-2026-09/PICOVIEW-V1-OPEN-ONE-IMAGE-1-EVIDENCE.md`
  (a reproduction-command argument, 5 in-body sites, 2 debug-capture sites, and a
  captures note);
- `docs/history/corrective/PICOVIEW-LAST-GOOD-PUBLICATION-1-EVIDENCE.md` (2 log
  lines);
- `docs/history/corrective/PICOVIEW-63-IMAGE-PRESENTATION-QUALITY-1-EVIDENCE.md`
  (the 12-file `cpu-compare-*` capture set);
- `docs/history/mvp-2026-09/compose/desktop-ui-normalization-1.md` (2 sites);
- `docs/history/mvp-2026-09/compose/windows-shell-ui-polish-1.md` (1 site);
- `experiments/real-viewer-closeout-1/README.md` (the 4-row media table and the
  boot-path line);
- `experiments/windows-shell-ui-polish-1/README.md` (the media-reuse line and the
  launch step).

Each removed path was replaced with the textual notation
`[capture removed from current tree for owner privacy]`, or with prose that names
the removed artifact and carries that notation. **No screenshot was restored and
no replacement was added.** `assets/branding/picoview-app.ico` and
`assets/branding/picoview-app-master.png` were left untouched — they are build
inputs, not captures.

One basename hit was deliberately **retained**: `… corrupt.jpg` in the §L
release-smoke table of
`docs/history/corrective/PICOVIEW-LAST-GOOD-PUBLICATION-1-EVIDENCE.md`. It is the
scratch counterpart of the equally scratch `smoke-lgp.jpg` in the row above and
names no tree path (the path is elided with `…`); it is not a reference to the
removed `test-media/corrupt.jpg`, which that document names explicitly elsewhere
and which was replaced.

Residual, out of scope, and **not** changed: several older evidence documents
still cite the owner's local corpus by the source filename
(`001R0E0aly1i50ph1thhjj66dc48w1l102.jpg`, `153fcfe9-…png`) and local paths such
as `C:\img\…` / `C:\Users\fred1\source\icons\…`. Those files were never in the
tree, so they are provenance/test-input records rather than references to deleted
tree files. Removing them is a separate decision (it would edit the historical
record), and it was not taken here.

## 5. Wording seam — what the build does with node_modules

The old wording ("does not mutate node_modules", "no `node_modules` surgery
anywhere in the build path") was true of PicoView's own tree but read as a claim
about all `node_modules` — while `build-guest.ps1` legitimately runs
`bun install --frozen-lockfile --cwd third_party/pocketjs`, which restores the
vendored framework's pinned dependencies into the framework's own gitignored
`node_modules`.

Corrected, without any logic change, in:

| File | Now says |
| --- | --- |
| `scripts/build-guest.ps1` | needs no junction/symlink/source edit and **neither creates nor mutates `node_modules` at the repository root or anywhere else on the PicoView side**; the one dependency tree it touches is the vendored framework's own gitignored one, restored from that framework's committed lockfile |
| `scripts/build-windows-release.ps1` | performs no `node_modules` surgery to fake module resolution; the single dependency install is delegated to `build-guest.ps1` — **no PicoView-side or repository-root `node_modules` is created or modified** |
| `docs/RELEASE-WINDOWS.md` | same qualification in the build-preamble and in the release-entrypoint paragraph (§2 and §3 already described the framework install correctly) |
| `CONTEXT.md` | the build-topology paragraph now names the one install and states it creates nothing on the PicoView side |
| `docs/history/windows-release-build-corrective-1/EVIDENCE.md` | "no `node_modules` surgery **to fake module resolution**", "no edit to `third_party/pocketjs` **sources**"; the post-oracle path list now reads `dist/`, `dist-release/`, `native/target/` and the framework's own `third_party/pocketjs/node_modules/` — **nothing was created at the repository root** |

Verified after a full release build on this machine: root `node_modules` **absent**;
`third_party/pocketjs/node_modules` present (untracked, gitignored — the framework's
own install).

## 6. Validation

Everything below ran on native Windows under the canonical Windows PowerShell 5.1
entrypoint, `powershell -NoProfile -File scripts\build-windows-release.ps1`
(exit 0), which is exactly the guest build → `cargo build --release` →
`bun test guest/` → `cargo test --release` → portable zip → ISCC → SHA-256
sequence.

| Stage | Result |
| --- | --- |
| framework dependency install | `bun install --frozen-lockfile` — `Checked 226 installs across 287 packages (no changes)` (pinned, already satisfied) |
| guest build | `dist/picoview.js` 391,714 B `sha256=a3f007a7…`; `dist/picoview.pak` 673,184 B `sha256=32a23b25…` — **byte-identical to the clean-oracle artifacts** |
| `cargo build --release` | clean (5 pre-existing dead-code warnings, unchanged set) |
| `bun test guest/` | **194 pass, 0 fail**, 1048 expect() calls, 12 files |
| `cargo test --release` | **64 passed, 0 failed** |
| installer (ISCC 6.7.3) | **Successful compile (2.985 sec)** with the new `[Run]` flag |
| `POCKETJS.lock` | unchanged |
| tracked `third_party` state | clean (`git status --short -- third_party` empty) |

### 6.1 Artifacts

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `native/target/release/picoview.exe` | 13,199,360 | `ee2c9cfd80f2955ccf9630386c09b35d7d36742ee958f2b830a9fcebcebf060e` |
| `dist-release/PicoView-0.1.0-windows-x64-portable.zip` | 4,809,821 | `1143249abff01eb076a14a08f198de2764b8f99a0c52a065a83945e2e4a7f786` |
| `dist-release/PicoView-0.1.0-windows-x64-setup.exe` | 5,689,683 | `dadbf02dabe298a964814f31d5493185bfe3cd7c0bb0a4011a996924c71a38dd` |

Both artifact hashes moved from the closeout values, and the reason is recorded
rather than explained away: the installer bytes differ because the compiled
script differs (a `[Run]` flag) **and** because the embedded EXE is not
bit-reproducible — MSVC writes a PDB signature (RSDS GUID + timestamp) into the
PE debug directory, so the EXE hash changes across builds of the same source at
the same size. The guest artifacts are unaffected and are byte-identical. These
are integrity hashes only, not signatures.

## 7. Invariants re-verified after the build

| Check | Result |
| --- | --- |
| `mklink` in any release script | none |
| junction/symlink creation primitives (`New-Item -ItemType Junction/SymbolicLink`, `CreateSymbolicLink`, `fsutil reparse`) in `scripts/` | none |
| reparse points anywhere under the repository (excluding `.git`) | **none** |
| `node_modules` at the repository root | absent |
| tracked `third_party` modifications | none |
| `POCKETJS.lock` | unchanged (`720e6ee3ed91d53038ae6c6330420bb46dabca30`) |
| deleted images restored | none — no tracked image outside `third_party/` except the two `assets/branding/` build inputs; no untracked image file anywhere |
| code signing | still **NOT CONFIGURED** (nothing fabricated) |

## 8. Explicitly out of scope (not done)

Merging PR #73; any git history rewrite (the removed media therefore still exists
in previously pushed history); CJK/font work; installer scope redesign; product
association implementation changes; restoring or replacing any capture; removing
the residual owner-corpus path names from older evidence documents.

No security claim is made: a full Mimosa audit is still pending.

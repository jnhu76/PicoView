# EVIDENCE INDEX — DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1

Provenance for every campaign behind
`docs/DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1.md`. All refs were
verified on 2026-09-14 against fetched remote refs and retained local
refs/worktrees; SHAs are the exact verified values
(`git rev-parse <ref>`). Full raw evidence is retained on the branches and
worktrees named here — the consolidated record deliberately does NOT copy
hundreds of raw files, it records where they live.

## 1. Campaign records

| # | Campaign | Report path | Branch / ref | Commit SHA | Raw evidence location | Archive / integrity | Review status | Supersession status |
|---|---|---|---|---|---|---|---|---|
| 1 | STARTUP-LAST-MILE-REALITY-AUDIT-1 | `docs/STARTUP-LAST-MILE-REALITY-AUDIT-1.md` | `main` | in `main` @ `ee04801` | host `evidence/tmp/logs/audit1-*` (worktree `C:\Users\fred1\source\PicoView`); raw CSVs referenced by the report (`c1-startup-official.csv`, `gate-startup-image.csv`, `audit1-*.csv`) | not archived; per-file hashes not recorded by the campaign | 2 adversarial reviews (STARTUP-MECHANISM-ADVERSARY REVISE — all MAJORs fixed; BENCHMARK-ORACLE-ADVERSARY CONFIRM) | **CURRENT** for ENVIRONMENT_BOUND variance finding; its §9 window-mode "STABLE_FAIL architecture-owned" reading superseded/weakened by #40 (§16 S-6 of the record) |
| 2 | LINUX-DESKTOP-STARTUP-CONTROL-1 | `docs/LINUX-DESKTOP-STARTUP-CONTROL-1.md` | `docs/linux-desktop-startup-control-1-closeout` (not merged; draft PR #42 open from the older remote tip `c7faed4`; local tip `c8dcc75` not yet pushed) | branch tip `c8dcc7559362091d9f841b80dae5f5d32f8dec4f`; remote `docs/linux-desktop-startup-control-1-closeout` = `c7faed4` (older tip) | full raw set: `archive/linux-desktop-startup-control-1-full` @ `982914b598171045ffa38eefa3ebbc6df6e981e2`, paths `docs/linux-startup-control-1-raw/` (per-sample CSVs + A7EVENT stderr for every batch, ambient snapshots, build logs, smoke logs, stats) | frozen full-evidence SHA `982914b…`; original full-evidence PR #41 (closed unmerged, retained as provenance); slim subset in the closeout branch: `stats-all-batches.csv`, `source-identity-manifest.md`, `pv-run-samples.sh`, `pv-stats.py` | 2 adversarial reviews inside the campaign (cross-platform-architecture REVISE, startup-measurement REVISE — all MAJORs fixed; no BLOCKER) | Linux numbers remain evidence; the cross-OS causality is **superseded as final claim** by the normalized experiment's INCONCLUSIVE verdict (§16 S-1) |
| 3 | CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 (#43) | `docs/CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1.md` | `main` (merged via PR #43 from `exp/cross-os-normalized-desktop-startup-1-slim` @ `a21898a`) | in `main` @ `ee04801` | full raw archive published in-repo: `docs/cross-os-normalized-desktop-startup-1/raw-evidence.tar.gz` (230 files) | sha256 `9d55742d1f6350226726dfa5f2347eebd03c4b3d7100395127df0ced3e540219`, 174,484 B; deterministic (two-build identical), roundtrip byte-verified against blobs; contents list `raw-evidence-contents.txt`; original archive branch `archive/cross-os-normalized-desktop-startup-1-full` @ `44319343fe956b1c371adab9149b3cffec77b7f5`; host replica `evidence/tmp/cross-os-norm-1/` | 3 reviewers (clock/measurement REVISE→fixed; cross-platform equivalence PASS; causality REVISE→fixed); review trail in the archive's RUNLOG.md | **CURRENT, FROZEN** — CLOSED_AS_INCONCLUSIVE; immutable except factual errata; no future finding may be folded into it |
| 4 | WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1 (#40) | `docs/WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1.md` | `main` | in `main` @ `ee04801` | host `evidence/tmp/logs/audit2-*` (worktree `C:\Users\fred1\source\PicoView`); instrumentation patch `evidence/tmp/audit2-markers-applied.diff`; join families `audit2-join3-*.csv` (persisted) | not archived; join2 family superseded/disclosed; diff archived locally | 2 adversarial reviews (STARTUP-MECHANISM-ADVERSARY REVISE 1 BLOCKER+6 MAJOR — all fixed; BENCHMARK-AND-CAUSALITY-ADVERSARY REVISE 1 BLOCKER+4 MAJOR — all fixed) | **CURRENT** — NO_BOUNDED_CORRECTIVE_EARNED; carries the T1-anchor + machine-state decisions to the owner |
| 5 | WINDOWS-STARTUP-CALLPATH-REALITY-AUDIT-1 | `docs/WINDOWS-STARTUP-CALLPATH-REALITY-AUDIT-1.md` | `audit/windows-startup-callpath-1` (**local-only**, never pushed; worktree `C:\Users\fred1\source\PicoView-win-startup`) | `e8dd43746e8804ae362dbce098c63ff97e555d6c` | worktree `evidence/tmp/windows-startup-callpath-1/` — headline logs `logs/A|B|C` (20/20/50 + summary.json/csv), instrumented batches `logs/wgpu-decomp` (n=8) + `logs/wgpu-decomp-named` (n=4), uProf sessions `uprof/{smoke-b,b-1ms,b-1ms-cg,b-cg-2,a-cg-1,c-cg-1}`, uProf reports `uprof-reports/*.csv`, runner scripts, `stages-summary.csv`, `reviews/` — ~170 files, ≈60 MiB (uProf databases dominate) | not compressed/merged; committed subset on the branch: report + `docs/windows-startup-callpath-1/{stages-summary.csv,source-identity.md}` + one compressed logs archive | 2 adversarial reviews, both **PASS** (measurement; causality), MINOR cleanups applied | **CURRENT.** Its uProf-based "predominantly off-CPU / blocked in driver" reading of the probes is **superseded** by the ETW elevated closeout (§16 S-2) |
| 6 | WINDOWS-STARTUP-ETW-REALITY-AUDIT-1 (non-elevated pass) | same file as #7 (sections ARM A / ARM B, retained with corrections) | `audit/windows-startup-etw-1` | `f75c283329c43b6af1be560d9cf852547c4cde6a` | worktree `C:\Users\fred1\source\PicoView-win-etw`, `evidence/tmp/windows-startup-etw-1/` | review step waived by owner after two cancelled reviewer dispatches (disclosed); its bridge placements **corrected** by the elevated closeout | **SUPERSEDED in part** — clock bridge + two event placements corrected (§16 S-4/S-5); content observations stand |
| 7 | WINDOWS-STARTUP-ETW-ELEVATED-CLOSEOUT-1 (same report, elevated sections) | `docs/WINDOWS-STARTUP-ETW-REALITY-AUDIT-1.md` (report tip includes the elevated closeout) | `audit/windows-startup-etw-1` | `f75c283329c43b6af1be560d9cf852547c4cde6a` | worktree `evidence/tmp/windows-startup-etw-1/`: `elevated/20260914-121456/` (10 kernel ETLs ~112–123 MiB each + canary; the non-elevated user-session ETLs are 12–23 MiB), `elevated/_probe/elevated-analysis.json` (12.8 MB) + `.log`, `recheck-preempt.json`, `elevated/ELEVATED-RUN-DONE.json` (status PASS, one UAC, `cleanup_ok: true`), `elevated/machine-state-readback-20260914.txt`, `tooling/` (capture rerun ps1, WPR profile, analyzers), `intervene/{pristine,patched}` (40 NORMTRACE logs) | not merged; committed subset: report + `docs/windows-startup-etw-1/{summary.csv,source-tool-identity.md}` | 2 fresh adversarial reviewers both **REVISE, no BLOCKER**, all findings fixed in the revision (§REVIEWS in the report) | **CURRENT** — PASS_WITH_OPEN_CAUSE; carries `SECOND_PROBE_CAUSAL_OVERHEAD_CONFIRMED` and `SAMPLED_PROFILE_UNAVAILABLE` |

## 2. Selected-evidence archive (this record)

- path: `docs/desktop-startup-performance-experimental-record-1/selected-evidence.tar.gz`
- size: 799,850 B (raw tar 14,407,680 B); 82 files
- sha256: `b92e2cfc87554757764d109f42804bb087341ad3d76afed76e3b4a97676d7366`
- deterministic: YES (two independent builds byte-identical; sorted paths,
  uid/gid 0, empty uname/gname, mtime 0, gzip mtime 0)
- members: byte-exact canonical git blobs (via `git cat-file blob`) or
  retained worktree evidence files; layout described in the archive's
  `README.md`.

### 2.1 Coverage and known gaps

The archive includes per-campaign: the cross-OS raw bundle (230 files,
nested archive); the Linux control's batch summary, identity manifest and
runner/stats scripts; #40's measurement scripts (`bench-startup.ps1`,
`audit2-join3.ps1`, `audit2-exp.ps1`, `audit2-machine-state.ps1`,
`audit1-load.ps1`) and the `audit2-markers-applied.diff` instrumentation;
the call-path audit's report, `stages-summary.csv`, identity, both reviewer
verdicts and ambient-gate records; the ETW campaign's report, `summary.csv`,
identity, elevated analysis JSON + log, strict-preempt variant, DONE marker,
machine-state readback, all five tooling scripts, and the 40 raw
intervention logs; and the PocketJS measurement-only patch series
(`pocketjs-audit-patch/`).

Known gaps (deliberate, size-bounded; recorded so they are not mistaken for
availability):

| Gap | Where it lives instead |
|---|---|
| Per-run instrumented n=8 logs behind the record's §10.3 decomposition (only the pooled n=12 CSV is in the archive; the per-run 88.5–89.0 % probe share is reproducible only from this source) | host worktree `C:\Users\fred1\source\PicoView-win-startup\evidence\tmp\windows-startup-callpath-1\logs\wgpu-decomp*` |
| Per-run ETL traces (10 elevated kernel ETLs ~112–123 MiB each + 10 non-elevated user-session ETLs 12–23 MiB each) and the canary | host worktree `C:\Users\fred1\source\PicoView-win-etw\evidence\tmp\windows-startup-etw-1\{elevated,etw}\` |
| uProf session databases and report CSVs | host worktree `C:\Users\fred1\source\PicoView-win-startup\evidence\tmp\windows-startup-callpath-1\{uprof,uprof-reports}\` |
| Per-sample CSVs and A7EVENT stderr of the Linux control | `archive/linux-desktop-startup-control-1-full` @ `982914b…`, `docs/linux-startup-control-1-raw/` |
| AUDIT-1 raw CSVs (`c1-startup-official.csv`, `gate-startup-image.csv`, `audit1-*.csv`) | host `C:\Users\fred1\source\PicoView\evidence\tmp\logs\` (never archived; per-file hashes not recorded by the campaign) |
| PocketJS audit branches themselves | local-only in the PocketJS clone; portable as the archived patch series + the commit table in `pocketjs-audit-patch/README.md` |

Erratum (2026-09-14 corrective pass): the archived `selected-evidence/README.md`
still states, in its "Explicitly NOT included" list, that the per-run ETL
traces are "12–23 MiB each, 10 elevated + 10 non-elevated". The elevated
kernel ETLs are ~112–123 MiB each; 12–23 MiB applies to the non-elevated
user-session ETLs only (see §1 row 7 and the gaps table above). The archive
is otherwise frozen; this erratum stands in place of a rebuild.

## 3. Machine / host identity (one line each; full records in the reports)

- **Windows measurement host (all Windows campaigns):** Windows 11 Pro
  build 26200 (26200.9445 in the ETW pass); AMD Ryzen 7 5800H 8C/16T;
  28.9 GiB RAM; AMD Radeon(TM) Graphics iGPU, driver 31.0.21923.11000
  (Adrenalin 25.8.1); 2560×1440@60; Balanced power plan; QQPCRTP resident,
  WinDefend service stopped; Hyper-V/VBS running (VBS status 2, HVCI off);
  56 resident ETW sessions at ETW capture time.
- **Linux reference host:** Fedora 44 KDE Plasma (Wayland/kwin, kernel
  7.1.9-200.fc44.x86_64); Intel Xeon E5-2666 v3; 62 GiB RAM; AMD Radeon
  RX 580 2048SP (RADV POLARIS10, Mesa 26.1.7); 2560×1440; AC desktop; no
  third-party AV.

## 4. Tool identity (cross-campaign)

- rustc 1.98.1 (48a229cea 2026-09-01) `stable-x86_64-pc-windows-msvc`;
  cargo 1.98.1; bun 1.2.8 (Windows campaign) / 1.4.2 (Linux bundle builds).
- AMD uProf CLI 5.3.521.0 (callpath audit).
- WPR/xperf/WPA 10.0.26100 (Windows Kits WPT); PerfView 3.2.6 (contributed
  nothing — no sampled-profile data); tracerpt (OS built-in);
  EventTracingManagement cmdlets (all captures).
- Symbols: PDB with `CARGO_PROFILE_RELEASE_DEBUG=2` resolved demangled Rust
  frames incl. source lines for winit/wgpu/wgpu-core/naga; system DLLs
  module+offset only.

## 5. Verification notes

- All remote refs re-fetched 2026-09-14 (`git fetch --all --prune`);
  local-only refs (the two Windows audit branches, the PocketJS audit
  series in its clone, the Linux closeout local tip — see §1 and §5) were
  verified in place at the recorded SHAs; main advanced
  from `491d0a5` to `ee04801` (PR #43 merge) during the session; the
  consolidated record's docs branch was created from `origin/main` @
  `ee04801631a3e083e7f8b7205666d5061303ec89`.
- `exp/cross-os-normalized-desktop-startup-1-slim` @ `a21898a` verified as
  an ancestor of `main` (merged); the remote ref was deleted after merge.
- Branch names listed in the tasking prompt differ from the actual refs in
  two places and the record uses the actual refs:
  - `audit/windows-startup-etw-1` is **local-only** (never pushed), as is
    `audit/windows-startup-callpath-1`;
  - the Linux closeout branch is `docs/linux-desktop-startup-control-1-closeout`
    (remote tip `c7faed4`, local tip `c8dcc75`).
- No historical report was modified. PR #43 was already merged into main
  (the frozen INCONCLUSIVE historical cross-OS record, in `main` @
  `ee04801`); this record does not rewrite it. #42 remains separate and is
  not modified.
- This record itself was adversarially reviewed before its final commit:
  two fresh-context reviewers (measurement/history; upstream/causality)
  with access to the source reports, raw evidence and this archive. Their
  findings and dispositions are recorded in
  `DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1.md` §21.1.

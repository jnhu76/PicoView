# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1

One normalized measurement protocol, Linux first (reference/control), then
Windows (primary investigation target), to locate which desktop-startup
stages are materially inflated on Windows. This is NOT an optimization
campaign. This document is the compact historical record of a CLOSED
experiment; the complete raw evidence is packaged as one deterministic
archive in `docs/cross-os-normalized-desktop-startup-1/raw-evidence.tar.gz`
(sha256 manifest alongside; see EVIDENCE RETENTION), with the original full
archive branch retained as Git provenance (RUNLOG.md is the authoritative
process log).

## FROZEN HISTORICAL VERDICT

**VERDICT: INCONCLUSIVE** (a fixed allowed verdict of the experiment
protocol).

- Linux normalized reference: COLLECTED / FROZEN / REVIEWED
- Windows normalized comparison arm: NOT COMPLETED
- Cross-OS differential: NOT EXECUTABLE
- Windows root cause: NOT DETERMINED BY THIS EXPERIMENT
- Production optimization: NOT AUTHORIZED
- Option 1: NOT AUTHORIZED FROM THIS EXPERIMENT

INCONCLUSIVE is not FAIL, and it is not evidence that Windows is slower.

## SOURCE IDENTITY

See `docs/cross-os-normalized-desktop-startup-1/source-identity.md`.

- PicoView 491d0a5 (main at freeze); PocketJS effective e15674db /
  tree f09cf9fa = campaign candidate a46eb7e0 + measurement-only series.
- tree-equivalent: **YES** (exact commit equivalence both hosts, git
  bundle, `rev-parse HEAD^{tree}` verified).
- Toolchain: rustc 1.98.1 (48a229cea) on both hosts; guest bundles built by
  one bun 1.4.2 toolchain state on Linux for BOTH targets.

## NORMALIZED CONFIG (frozen before Linux collection)

| field | value (identical both hosts) |
|---|---|
| backend | Vulkan (`POCKET_GPU_BACKEND=VULKAN`; per-OS unset defaults unchanged) |
| power preference | LowPower |
| memory hints | MemoryHints::MemoryUsage |
| present mode | Fifo |
| desired_maximum_frame_latency | 1 |
| surface format policy | Bgra8Unorm preferred, Rgba8Unorm fallback |
| alpha mode | Auto |
| device features / limits | empty / default; force_fallback_adapter false |
| logical viewport | 720x480 |
| raster density | 1 (`--density 1`; runtime density verified per-run) |
| scale pin | `POCKET_FORCE_SCALE=1.0` (physical raster 720x480 on both) |
| guest | picoview-a6-main, per-target official bundles (see source identity) |
| quit | arm C `--quit-after 30` both hosts |
| n | A=20, B=20, C=50 |

Every run prints one `BENCHMARK_CONFIG` line (stderr) carrying all fields
above + adapter/device/format identity + guest artifact hash + PocketJS
SHA/tree; the parser audits cross-run uniformity (`config_uniform`).

## CLOCK / MARKER AUTHORITY

- ONE clock: process-local `std::time::Instant`; origin E00_MAIN_ENTRY =
  first statement of main. All markers are microseconds from that origin
  (`NORMTRACE,run=,thread=,event=,us=`), once-per-process.
- Stage durations are BEGIN/END pairs of the experiment-local E-series
  (E00–E190); completion-from-E00 is reported separately. External
  spawn→exit wall time is descriptive only and never enters stage math.
- Percentiles: linear interpolation, on microseconds; min/max/IQR for the
  C headline.

## LINUX ENVIRONMENT (reference)

Fedora 44 KDE Plasma (Wayland, kwin), Xeon E5-2666 v3 (20 logical), 64 GiB
RAM, AMD Radeon RX 580 2048SP (RADV POLARIS10, Mesa 26.1.7), 2560x1440@60
(kscreen), AC desktop. Ambient 30 s before the batch: min 5.4% / max
13.7% / **P95(linear) 11.95%** → declared gate (P95<20%) PASS. Runner
gates skipped 4 sample attempts across B/C when build-like processes
appeared; no sample ran while the gate was tripped.

## WINDOWS ENVIRONMENT (target)

Windows 11 Pro build 26200, Ryzen 7 5800H (16 logical), 28.9 GiB RAM, AMD
Radeon(TM) Graphics iGPU driver 31.0.21923.11000, 2560x1440@60, AppliedDPI
96 = 1.00x. Resident AV: 腾讯电脑管家 (QQPCRTP running), WinDefend service
stopped (pre-existing). One quiet window passed (ambient P95 15%) and one
early observation failed (P95 53%) — the failed window is recorded as
INVALID_ENVIRONMENT.

**The Windows normalized arm was then BLOCKED by a system-wide Windows
Vulkan surface-path failure** — every Vulkan process on the machine,
including tooling unrelated to PicoView/PocketJS, failed at the same WSI
surface step (see WINDOWS A/B/C below). No Windows headline numbers exist.
The evidence proves the failure is not PicoView/PocketJS-specific; it does
NOT uniquely identify the failing component (AMD ICD, Vulkan loader,
implicit layer, WSI, driver userspace state, or another Windows Vulkan
surface-path component).

## LINUX A/B/C (n=20/20/50, all samples valid)

Endpoint semantics: A = first `RedrawRequested` handler completion
(bufferless Wayland — no present exists in this arm); B/C =
`E190_FIRST_USABLE_PRESENT_SUBMITTED` (present-SUBMITTED proxy, not
display photon latency).

| arm | P50 | P95 | min | max | IQR |
|---|---|---|---|---|---|
| A winit only | 9.968 ms | 11.412 ms | 9.210 | 11.740 | 1.236 |
| B winit + normalized wgpu | 69.764 ms | 72.203 ms | 62.494 | 80.723 | 3.415 |
| C full PocketJS E00→E190 | **75.678 ms** | **80.581 ms** | 68.105 | 87.842 | 3.200 |

## WINDOWS A/B/C

- **Arm A (winit-only; no Vulkan dependency): NOT COLLECTED.** The first
  attempt used a hidden-window harness and also hit a runner argument bug;
  after both were corrected, the collection orchestration gated the entire
  Windows run behind a Vulkan verification step, so A was never
  independently collected.
- **Arms B/C (normalized wgpu policy = Vulkan): NOT COLLECTED / BLOCKED BY
  THE WINDOWS VULKAN SURFACE-PATH FAILURE.** Evidence sequence (all
  retained in the raw-evidence bundle):

  1. First C batch attempt used hidden windows (`Start-Process -WindowStyle
     Hidden`): all 50 C samples failed GPU init. On this Windows host /
     winit / wgpu / Vulkan measurement path, the hidden-window harness
     failed to produce a valid benchmark surface and suppressed useful
     redraw behavior, so hidden launch was invalid for this benchmark.
     Archived as `logs/win/C-invalid-hidden/` (INVALID_ENVIRONMENT;
     methodology artifact).
  2. With visible windows, EVERY Vulkan process — including `vulkaninfo`
     itself — failed `vkGetPhysicalDeviceSurfaceCapabilitiesKHR` with
     ERROR_UNKNOWN (system-wide, tool-independent). The DX12 backend of
     the SAME binary works. Win+Ctrl+Shift+B driver reset: no effect.
     Windows Event Log: no display/TDR events (rules out a kernel
     TDR-class event but does not localize the failing component). AMD
     service restart requires admin (denied).
  3. 15 spaced recovery probes over 45 minutes: no recovery, re-verified
     ~1 h after onset (`logs/win/wedge-evidence/`). Machine reboot /
     driver reinstall is an operator action (the machine is actively
     used; other agent sessions were live).

## THREAD DAG (Linux representative sample)

Median C run (run-019, 75.8 ms); full lane dump in the archive
(`frozen/linux-C-dag-median.txt`). Serial critical-path decomposition:

| segment | µs |
|---|---|
| entry + event loop + window (E00→E21) | 11,992 |
| gpu-instance wait (E21→E40) | 31,756 |
| gpu setup on main (E40→E73) | 26,274 |
| first-output wait (E73→E122) | 3,240 |
| redraw + present (E122→E190) | 2,550 |
| serial sum | 75,812 = measured E190−E00 |

The RUNTIME/QUICKJS lane (boot 14.5→48.2 ms, incl. guest eval 31.2 ms) is
fully overlapped by the GPU path — not on the Linux critical path. The
GPU-INSTANCE side thread (9.5→43.6 ms) is on the critical path via the
E21→E40 wait.

## OWN-DURATION TABLE (Linux C, P50/P95, µs from E00 for completion)

| stage | own P50 | own P95 | completion P50 | overlapped | required before first present |
|---|---|---|---|---|---|
| gpu_instance | 34,930 | 38,044 | 43,174 | yes (side thread) | yes |
| runtime_boot | 34,068 | 35,338 | 47,857 | yes | yes |
| guest_eval | 31,236 | 31,970 | 47,780 | yes | yes |
| renderer_acquire | 23,876 | 27,387 | 71,432 | wait-dominated | yes |
| adapter | 18,954 | 19,653 | 62,322 | no (on critical path) | yes |
| device | 3,774 | 4,112 | 66,212 | no | yes |
| window_create | 2,454 | 2,712 | 10,455 | no | yes |
| surface_config | 2,144 | 2,250 | 70,027 | no | yes |
| surface_caps | 1,635 | 1,832 | 67,842 | no | yes |
| render | 1,466 | 1,848 | 73,198 | no | yes |
| asset_read | 1,273 | 1,770 | 15,020 | yes | yes |
| surface_create | 106 | 172 | 43,376 | no | yes |
| quickjs | 505 | 539 | 15,774 | yes | yes |
| blit_ensure | 482 | 554 | 73,890 | no | yes |
| first_tick | 164 | 203 | 71,710 | no | yes |
| present_encode | 890 | 1,039 | 75,048 | no | yes |
| surface_acquire | 42 | 51 | 73,368 | no | yes |
| ui_surface | 60 | 68 | 15,106 | yes | yes |
| request_to_present | 25 | 33 | 73,325 | no | yes |
| present_call | 60 | 70 | 75,654 | no | yes |
| redraw_delivery | n/a | n/a | — | — | once-semantics consumed by the frameless first callback (REVIEW-1; excluded, not a duration) |

## CROSS-OS DIFFERENTIAL TABLE / ANOMALY RANKING / WINDOWS FOLLOW-UP

**NOT EXECUTABLE** — the Windows normalized arm produced no data. No
differential table, no anomaly ranking, and no Windows-local follow-up
were performed, and none may be inferred from this experiment. Historical
Windows in-process figures exist in
`docs/WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1.md` but are NOT part of
this normalized evidence set (different protocol, different instrumentation
vocabulary).

## CAUSALITY STATUS

ANOMALY_LOCATED_ROOT_CAUSE_NOT_PROVEN is not reached either — with no
Windows arm there is no anomalous interval to investigate. The only causal
statements this experiment licenses are about its own tooling:

- on this Windows host / winit / wgpu / Vulkan measurement path, the
  hidden-window harness failed to produce a valid benchmark surface and
  suppressed useful redraw behavior (50/50 failures; the un-hide reversal
  could not be exercised because collection was then blocked by the
  unrelated Vulkan surface-path failure — intervention standard not met),
  so hidden launch was invalid for THIS benchmark; this does not
  generalize to all hidden-HWND Vulkan usage;
- the Windows Vulkan surface-path failure is machine/host state, not
  PicoView/PocketJS behavior (`vulkaninfo` fails identically; DX12 in the
  same binary works). Its exact cause is NOT DETERMINED BY THIS
  EXPERIMENT: the evidence does not distinguish AMD ICD, Vulkan loader,
  implicit layer, WSI, driver userspace state, or another Windows Vulkan
  surface-path component.

No production code was optimized anywhere in this campaign.

## LIMITATIONS

1. Windows arm missing: the cross-OS comparison is the point of the
   experiment and was never produced. The Vulkan surface-path failure was
   re-verified as still present ~1 h after onset
   (`logs/win/wedge-evidence/`). A recovery (operator reboot or AMD
   driver reinstall/re-roll) plus a rerun under THIS frozen protocol
   (scripts in the raw-evidence bundle; the whole pipeline is one command
   per arm) remains possible in principle, but it is NOT part of this
   closed experiment: future work lives in a separate issue/report and
   must not modify this document with future findings.
2. Different hardware across hosts (Xeon E5-2666 v3 + RX 580 dGPU RADV vs
   Ryzen 5800H iGPU): absolute ms differences would be DESCRIPTIVE even
   with data; only stage-shape comparison is meaningful.
3. Guest pak glyph-density asymmetry is per-target official artifact
   content: the Windows-target PAK contains target-specific @2x baked
   glyph content; the Linux PAK contains @1x content (+226 KB). Any
   future `asset_read` / `runtime_boot` comparison would therefore be
   target-artifact-confounded and must not credit the OS alone. This did
   not affect the verdict because no Windows headline data were collected.
4. Windows AV (QQPCRTP) is a standing environment factor on the target
   machine.
5. Reviewer-2 runner minors: Windows samples have no `timeout` wrapper
   (in-process safety exits cover this), and the Windows A arm follows a C
   verification sample in the collector design (warm-up asymmetry, ≤1
   sample at n=20) — moot, since arm A was never collected.
6. Ambient CPU gates use the declared derived threshold P95<20% (the
   suggested 5% is not naturally satisfiable on the Windows host); the
   same threshold was applied to Linux.

## EVIDENCE RETENTION (three layers)

1. MAIN / MERGEABLE RECORD (this branch):
   - this report;
   - `docs/cross-os-normalized-desktop-startup-1/source-identity.md`;
   - `docs/cross-os-normalized-desktop-startup-1/stages-summary.csv`;
   - `docs/cross-os-normalized-desktop-startup-1/raw-evidence.tar.gz` —
     the COMPLETE raw evidence, i.e. all 230 files of the
     experiment-evidence subtree (per-run NORMTRACE logs, frozen
     summaries, machine states, DAG dump, runner/parser/audit scripts,
     guest bundles, Windows wedge evidence, RUNLOG.md), packaged as ONE
     deterministic archive (sorted paths, uid/gid 0, empty uname/gname,
     mtime 0, gzip mtime 0); raw size 1,263,186 bytes, compressed
     175,428 bytes;
   - `docs/cross-os-normalized-desktop-startup-1/raw-evidence.sha256`
     (sha256 `d4268d27ddb205f6e57dfd7ab84ffcb02f85d0a4735e70093bcf2e712db303f2`);
   - `docs/cross-os-normalized-desktop-startup-1/raw-evidence-contents.txt`
     (sorted archive-relative path list, 230 entries).

   After this PR merges, the repository alone contains enough compressed
   evidence to reconstruct the historical record; host-side retention is
   not required for reproducibility.
2. ORIGINAL FULL ARCHIVE BRANCH (Git provenance):
   `archive/cross-os-normalized-desktop-startup-1-full` @
   `44319343fe956b1c371adab9149b3cffec77b7f5` — contains the identical
   230-file evidence subtree (verified byte-for-byte at packaging) and is
   retained untouched; it is never rewritten or force-pushed.
3. HOST-SIDE REPLICA (optional): `evidence/tmp/cross-os-norm-1/` on the
   measurement host — an additional replica only, not part of the record.

Verification recorded at packaging: DETERMINISTIC_ARCHIVE PASS (two
independent builds produced identical sha256); ROUNDTRIP_BYTE_VERIFICATION
PASS (230/230 files byte-equal against the archive branch @ the SHA above;
no path escapes; archive metadata normalized); SECRET AUDIT PASS (no
credentials, private keys, or token material in the packaged inputs).

## DISPOSITION

CROSS-OS CAMPAIGN STATUS: **CLOSED_AS_INCONCLUSIVE** (Windows normalized
arm incomplete). Linux is HISTORICAL REFERENCE ONLY: no further cross-OS
causal attribution is authorized from this experiment.

- Linux normalized reference: DELIVERED, frozen, and adversarially
  reviewed. Reviews: Reviewer-1 (clock/measurement) REVISE → fixed
  (stage-definition re-derivation, recorded); Reviewer-2 (cross-platform
  equivalence) PASS; Reviewer-3 (causality) REVISE → fixed (evidence
  captures completed; wording corrections; CSV concern was a stale read —
  verified current). Full review trail: RUNLOG.md in the raw-evidence
  bundle / archive branch.
- Windows normalized arm: NOT COLLECTED (arm A never independently
  collected; arms B/C blocked by the Windows Vulkan surface-path
  failure), with executable evidence and a documented recovery path.
- Cross-OS verdict: **INCONCLUSIVE** (one of the allowed verdicts; no
  stage anomaly can be located without the Windows arm).
- Not authorized from this experiment: any production optimization, any
  suspect-stage claim about Windows, any merge of PR #42 or of this
  report's PR.
- Future work: a separate Windows-only startup call-path audit (e.g.
  WINDOWS-STARTUP-CALLPATH-REALITY-AUDIT-1) in its own issue/report.
  THIS document is the historical record of the closed cross-OS campaign
  and is immutable after merge except for factual errata; future Windows
  findings must NOT be folded into it.

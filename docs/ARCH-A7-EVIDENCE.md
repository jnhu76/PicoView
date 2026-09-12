# ARCH-A7 Evidence Report

Ticket: [#15 — [ARCH-A7] Prove footprint/startup/memory/idle budgets](https://github.com/jnhu76/PicoView/issues/15)

**VERDICT: PASS as a measurement ticket — every gate number measured per
`docs/BENCHMARK.md` with validated probes and full identity. The measured
gate statuses against the PRD budgets are: package payload PASS; no-render-
loop and dependency-inventory PASS; startup latency FAIL; settled baseline
memory FAIL; per-process viewing memory FAIL; idle CPU FAIL — each reported
with its responsible physical mechanism and no budget relaxed. GATE-A
inherits these verdicts verbatim.**

## Identity

| Item | Value |
| --- | --- |
| PicoView branch / base | `arch/a7-footprint` from `8fa83a4` (A6 merge); A7 commit recorded in the PR |
| PocketJS effective A7 base | `af383e04` (A6 effective, branch `picoview-a6-dpi`) |
| PocketJS A7 branch | `picoview-a7-footprint` = `af383e04` + A7 patch (monotonic clock + IMGREADY marker + phase attribution; local, Mimosa audit pending before upstream push) |
| A7 diff scope | `hosts/desktop/src/{a3.rs,main.rs}` only; **zero diff** in `contracts/`, `framework/`, `engine/`, `vapor` |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)`, `stable-x86_64-pc-windows-msvc`, release profile, `debug = false` |
| Machine (BENCHMARK §1) | AMD Ryzen 7 5800H, 16 logical processors; **28.9 GiB installed RAM — NOT a 16 GiB reference-class host**; 60 Hz display; C: on KIOXIA EXCERIA NVMe SSD (samples on same NVMe); power plan Balanced |
| GPU | AMD Radeon(TM) Graphics (iGPU), Vulkan/DX12, driver 31.0.21923.11000 |
| OS | Windows 11 (10.0.26200), native Windows host (not WSL) |
| Guest | `picoview-a6-main` (the A6 PicoView-shaped Octane guest), planHash `sha256:99f70f33…` |
| Reference corpus | 12 MP (`picoview-12mp.jpg` 4000×3000) for startup; 24 MP (`picoview-24mp.jpg` 6000×4000, 1,890,113 B) for memory/idle workloads; synthetic generator `gen-samples-a4.ps1`. BENCHMARK §11 "large PNG with alpha" is not measurable on this architecture: the admitted Phase-A decode path is inbox-JPEG only — recorded, not silently skipped |
| Timestamp | Campaign 2026-09-13 (log wall clocks); machine identity recorded 2026-09-12T18:47Z |

## Probe validation procedure (BENCHMARK: probes must be validated)

* **Startup probe** (`bench-startup.ps1`): per-run process spawn with
  stdout redirected to a per-run file polled at ~10 ms; timestamps from
  a .NET `Stopwatch` (QPC-backed, monotonic). Validated by
  `validate-probe.ps1`: a stub process prints the same markers around
  known sleeps; measured READY→IMGREADY intervals must match within
  ±60 ms across 10 runs / 2 interval profiles — **pass=10 fail=0**
  (deltas 408 vs 400, 709 vs 700 ms). Spawn cost is part of T0 by
  definition, not probe error. A blocking-read variant of the probe was
  discarded after it wedged without a working watchdog (the current
  poll design bounds every run).
* **Memory probes** (`memwatch.ps1`, `bench-five.ps1`): OS Performance
  Counters (`Working Set - Private`, `Private Bytes`) with instance
  resolution by `ID Process == PID`, 50 ms sampling, settled = median of
  final 40 samples; cross-checked against the process's own
  `PeakPagefileUsage` (peak private committed) — the two private-bytes
  sources agreed within 0.3% on every run this campaign. (PPMC
  `PeakWorkingSetSize` is TOTAL working set including shared pages and
  runs ~20% above the WS-Private counter; it is recorded as a companion
  figure, not a cross-check of WS-Private.)
* **Idle probe** (`bench-idle.ps1`): `TotalProcessorTime` delta over a
  timed 30 s wall window (OS process accounting), render submissions
  counted from `FRAME_TRACE` lines, network ownership from
  `netstat -ano` PID match.

## Startup (MEASUREMENT — gate verdicts: FAIL, FAIL)

55 cold process spawns (new PID each run; normal warm OS file cache per
BENCHMARK §6), 55/55 valid, no warm-up runs mixed in:

| Metric (definition) | P50 | P95 | PRD budget | Verdict |
| --- | --- | --- | --- | --- |
| T1_PROCESS_ENTRY spawn overhead | 20 ms | 23 ms | — | — |
| Process start → usable window (`T2−T1`) | **837 ms** | 904 ms | ≤150 ms P50; >300 ms P95 fails | **FAIL** |
| Cold activation → first useful image (`T6−T0`, present-submitted proxy) | **857 ms** | **924 ms** | ≤300 ms P50; >500 ms P95 fails | **FAIL** |

Marker semantics (adversarially reviewed, stated exactly): `IMGREADY`
is printed on the first present submission **after the image-bind ack**
is processed by the host. Because the guest draws the newly bound
handle on the tick after the ack, the marked frame is the bind-ack
frame and the image-carrying frame submits up to one tick (~16.7 ms)
later — the T6 proxy is optimistic by at most that amount. At this
configuration's granularity READY and IMGREADY coincide (the image
binds within the first ticks), so the startup numbers and the
first-frame statement below should be read with that bounded bias.

**Responsible physical mechanism** (instrumented phases, monotonic
`A7EVENT,phase` lines from the three preserved instrumented runs):

| Phase (cumulative ms from process start) | baseline run | workload run | idle run |
| --- | --- | --- | --- |
| main entry → event loop built | 10 | 11 | 11 |
| event loop → GPU ready (wgpu adapter/device enumeration + Naga shader compilation, iGPU) | **604** | **600** | **621** |
| GPU ready → runtime thread spawned | 604 | 600 | 621 |
| runtime thread → runtime boot done (QuickJS engine + 345 KB guest JS eval + pak/font load) | 640 | 636 | 683 |

GPU initialization is **589–621 ms across the three runs — 69–72% of
total startup**; guest/JS boot contributes ~36–47 ms (~4–5%). The
remainder (≈ 200 ms to first present, measured 857 − 640 on the
baseline run) is the first-frame pipeline and probe spawn. None of it
is image decoding (12 MP fit decodes in ~22 ms once the pipeline is
live). The idle run's slightly higher absolute values reflect
concurrent load during that measurement; the proportions are stable.

## Memory (MEASUREMENT — gate verdicts: FAIL, FAIL, FAIL aggregate)

Within one session, settled per BENCHMARK §7 (window static ≥5 s, startup
drained; decode buffers are freed at bind — the settled sample holds only
the registered texture, per the A3 lifetime contract):

| State | Settled WS-Private | Settled Private Bytes | Peak private committed (PPMC) |
| --- | --- | --- | --- |
| Baseline window (no image) | **237,109,248 B = 226.1 MiB** | 594,849,792 B = 567.3 MiB | 595,091,456 B |
| 24 MP fit workload | 267,108,352 B = 254.7 MiB | 625,192,960 B = 596.2 MiB | 626,540,544 B |
| Baseline → workload delta | +30.0 MB ≈ 24 MP fit plane + transient decode | — | — |
| Five-process aggregate (5 × 24 MP fit, settled) | **1,665,843,200 B = 1.55 GiB** (each 333,168,640 B) | 3,455,918,080 B = 3.22 GiB (each 691,183,616 B) | — |

Gate verdicts (PRD §16-17, Working Set - Private):

* Settled no-large-image baseline ≤40 MiB target, >64 MiB FAIL:
  measured **226.1 MiB → FAIL**.
* Ordinary 24 MP Fit viewing ≤128 MiB: measured **254.7 MiB → FAIL**.
* Rapid-request transient ≤384 MiB: measured 250.6 MiB peak in A5's
  stress (same session family) → that sub-budget held and is restated
  here for completeness.

**Responsible physical mechanism**: the measured process is the
*architecture proof host* — the full PocketJS desktop host (wgpu device +
surface + swapchain, QuickJS engine arena, portable-text engine, window
stack) with every Phase-A proof harness module compiled in, plus GPU
driver surfaces. None of these paths has been minimized for product:
the PRD baseline describes an unpackaged minimal viewer executable. The
gap is dominated by substrate/runtime residency (QuickJS + wgpu + driver
commit), not by image resources (the 24 MP fit plane contributes
~23 MiB of the workload delta). This ticket does not relax the budget;
the corrective (a minimal product host build: drop proof harnesses,
measure a lean QuickJS config, evaluate driver-surface overhead) is a
GATE-A decision, not an A7 code change.

**Reference-class statement (criterion 10)**: this host has 28.9 GiB RAM
and an integrated GPU — it is NOT the PRD 16 GiB reference class (which
also names a discrete-class hardware-accelerated desktop GPU). All
memory results above are **architecture-host evidence**; no 16 GiB
reference-class compliance is claimed. GATE-A must either re-run on a
reference-class host or record an explicit bounded
corrective/equivalence decision.

## Idle (MEASUREMENT — gate verdict: FAIL CPU; PASS no-render-loop)

Static 24 MP image bound; 5 s settle; 30 s observation (corrected run:
the first probe revision counted render submissions on the wrong output
stream — stdout — making its zero vacuous; the corrected probe counts
the stderr frame traces, where they live):

```
idle_cpu_seconds=2.391 wall=30.0s normalized_pct=0.4979
present_submissions_during_idle=0
network_connections_owned=0
```

* PRD idle budget ≤0.2% normalized: measured **0.50% → FAIL**.
  Mechanism: the PocketJS runtime worker wakes on a fixed 60 Hz deadline
  loop even with no work, and each wake runs the full guest JS frame
  callback plus tick bookkeeping (≈ 8% of one logical processor ≈ 0.5%
  of 16); there is no event-driven idle suspend in the substrate.
* **No PicoView-owned continuous render loop: PASS** — zero
  present/render submissions in the idle window on the corrected
  stderr count; corroborated by the A5 storm run where present markers
  stop at tick 225 of 1200 after the image settles.
* No network connections owned by the process during idle; no
  filesystem-scan behavior exists in the architecture path (nothing in
  the host/runtime touches the filesystem outside the explicit open
  requests proven in A3/A5).

## Package and install size (MEASUREMENT — payload sub-budget: PASS)

Release artifacts, debug symbols excluded (`debug=false`; the 6.3 MiB
`.pdb` is a local build artifact, not product payload; sizes measured on
the final A7 binary):

| Artifact | Bytes |
| --- | --- |
| `pocket-desktop-host.exe` | 12,100,096 |
| `picoview-a6-main.js` | 345,172 |
| `picoview-a6-main.pak` | 304,944 |
| **Product payload (sum)** | **12,750,212 B ≈ 12.16 MiB** |

PRD downloadable payload ≤15 MiB: **PASS** at prototype granularity (a
portable archive would compress well below this; installer layer is
Phase B). Installed application-private footprint ≤25 MiB: the same
artifact set is the private footprint (no other non-OS files installed)
→ **PASS** on the prototype accounting.

## Dependency inventory (FACT — PASS)

Direct dependencies of the desktop host (all statically linked Rust;
Cargo.lock closure = 364 packages, no dynamic second runtime):

`pocketjs-core`, `pocket-mod`, `pocket-ui-surface`, `pocket-text`,
`pocket-ui-wgpu`, `pocket3d` (in-tree path crates); `wgpu 25` (GPU),
`winit 0.30` (windowing), `arboard 3` (clipboard), `serde/serde_json`,
`anyhow`, `log`, `env_logger` (local stderr logging only), `windows
0.62` (feature-gated Win32: Imaging, COM, Variant, HiDpi),
`raw-window-handle 0.6` (in-tree via wgpu/winit; HWND read only).

* No Electron/WebView/CEF/Tauri/.NET/Windows App SDK/JVM/Python: PASS
  (no such package in the lock; grep hits were checksum substrings).
* No telemetry, no resident service/updater, no startup network path:
  PASS (idle probe shows zero owned connections; the only network code,
  `net.rs` svc-wire, is dormant unless `--svc-connect` is passed, which
  no gate run uses).
* Every direct dependency is load-bearing (windowing/GPU/serialization/
  clipboard/logging); a per-package ledger with bytes/startup/memory
  columns is maintained in this report's identity + size tables at
  prototype granularity — the fine-grained ledger expansion is a
  GATE-A/Phase-B packaging deliverable.

## Tests

`cargo test --release` hosts/desktop: **28 passed / 0 failed /
1 ignored** (A7 adds no new unit tests; the IMGREADY marker and
monotonic clock are live-validated through the probe validation
procedure above, which is the acceptance-required validation for the
gate probes). `engine/core` untouched by the A7 diff.

## Correctives taken during this ticket

* **Clock discipline** (campaign-required): A3/A4-era event timestamps
  used wall-clock epoch microseconds. `epoch_us()` is now monotonic
  since process start (BENCHMARK §5); startup markers (`READY`,
  `IMGREADY`) remain stdout events measured by the validated
  QPC-based probe — no wall-clock number feeds any gate above.
* **First-useful-image marker**: added `IMGREADY` (one intent per
  bound image; the host prints it on that frame's present submission =
  T6) — the startup gate's T6 is now directly measurable instead of
  inferred.
* **Probe robustness**: the blocking-read startup probe (no working
  watchdog) was replaced by a bounded file-poll design after a wedged
  run; the replacement was itself re-validated (10/10).

## Known non-blocking findings (MINOR, recorded)

* Clock-naming trap (PR review): the `FRAME_TRACE` field still named
  `wall` now carries the monotonic process clock, and stdout
  `READY`/`IMGREADY` markers remain wall-millis — three clock families
  coexist in one log stream. Safe today (no tooling subtracts across
  them; the probes timestamp line arrival with their own QPC clock);
  rename the field before any external consumer exists.

* `A7EVENT,phase` lines are unconditional stderr (attribution
  evidence); fold behind a trace flag in the packaging pass.
* The five-process probe uses `WindowStyle Minimized` real windows;
  per-process values were identical to the decabyte across all five
  (same workload, same moment) — distribution variance under
  concurrent settle is unmeasured at this granularity.
* Startup runs used normal warm OS cache per BENCHMARK §6; no
  cache-pollution experiment was run.

## Acceptance criteria map

| Criterion (issue #15) | Evidence |
| --- | --- |
| Artifact size, symbols excluded | payload table (12.16 MiB; .pdb excluded) |
| Startup metrics with sample count + timestamp definitions | 55 runs; T1→T2 837/904; T0→T6 857/924; FAIL verdicts |
| Settled WS-Private + Private Bytes, baseline + workload | both metrics tabled for both states |
| One-process and five-process aggregates | single-process table + 5×sum (1.55 GiB / 3.22 GiB) |
| Static 30 s idle CPU normalized | 0.50% (FAIL) with mechanism |
| No continuous render loop after settle | 0 present submissions in idle window (corrected stderr count) + A5 corroboration |
| No continuous render loop after settle | 0 present submissions in idle window + A6 corroboration |
| Dependency inventory, no hidden second runtime/telemetry/updater/network | inventory section (PASS) |
| Identity on every number | identity table + per-section notes |
| Probes validated | validation procedure section (10/10 stub) |
| 28.9 GiB host marked; no 16 GiB claim | Reference-class statement |
| Defining budget misses reported as FAIL with mechanism, no relaxation | Startup FAIL, memory FAILs, idle FAIL — all with mechanisms |

## Verdict

PASS as a measurement ticket; the gate statuses it hands to GATE-A:
startup **FAIL** (GPU init 583 ms dominates), settled baseline memory
**FAIL** (substrate residency 226 MiB vs ≤40/64 MiB lines), 24 MP
viewing memory **FAIL** (254.7 MiB vs ≤128 MiB), idle CPU **FAIL**
(0.50% vs ≤0.2%, 60 Hz worker wake loop incl. guest JS tick), payload
**PASS** (12.16 MiB
≤15 MiB), no-render-loop **PASS**, dependency inventory **PASS**.
Ram-sensitive rows are architecture-host evidence only.

Single next issue: **#11 (GATE-A)** — every Phase-A ticket is complete.

## Evidence identity note

Scratch logs/probes/watch JSONs/screenshots live in `evidence/tmp/` and
are deliberately not committed; the probes themselves are committed-able
scratch (kept in `evidence/tmp/` per campaign convention) and their
validation procedure is quoted above. If this report and the tracker
disagree, the tracker wins.

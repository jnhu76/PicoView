# DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1

Consolidated experimental record of the PicoView / PocketJS desktop-startup
performance investigation (2026-09-13 → 2026-09-14), covering seven
experiments across Linux and Windows.

This is a **documentation / evidence-consolidation** artifact. It contains no
new experiment and no production optimization. It consolidates what was
actually learned, labels which earlier interpretations later evidence
superseded, and prepares a future evidence-based report to upstream
projects. Historical reports are immutable and are NOT rewritten here; where
this record disagrees with an earlier interpretation, it says so explicitly.

The record is evidence-bounded: every published number carries its
measurement class (headline-clean / instrumented / ETW-traced), its campaign
of origin, and a pointer to the report and raw evidence that produced it
(`evidence-index.md`). Numbers from different measurement classes are never
mixed in one arithmetic total; numbers from different experiments are never
averaged.

---

## 1. Executive Summary

The investigation set out to explain why PicoView's Windows startup missed
the PRD's ≤150 ms window-usable budget (quiet T1→T2 ≈ 247–261 ms in the
historical gate evidence). The path of evidence was:

1. **A cross-session variance audit** (STARTUP-LAST-MILE-REALITY-AUDIT-1)
   classified the cross-session variance as ENVIRONMENT_BOUND (background
   CPU load of the measurement host, intervention-proven) and earned no
   corrective. It left the window-mode plateau ~247–307 ms as a
   content-scoped STABLE_FAIL.
2. **A Linux control** (LINUX-DESKTOP-STARTUP-CONTROL-1) ran the same
   portable architecture on slower, older hardware and reached first usable
   window in T1→T2 P50 123–132 ms (P95 141) against Windows 247–261 ms on
   the candidate content. Its historical verdict: WINDOWS_SPECIFIC_TAX.
3. **A normalized cross-OS experiment**
   (CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1) rebuilt the comparison under a
   single frozen protocol. Linux completed (A 9.97 / B 69.76 / C 75.68 ms
   P50 from process entry). The Windows arm **never completed**: a
   system-wide Windows Vulkan surface-path failure blocked every Vulkan
   process on the machine. Verdict: **INCONCLUSIVE**.
4. **A Windows-only DX12 call-path audit**
   (WINDOWS-STARTUP-CALLPATH-REALITY-AUDIT-1) decomposed the startup path
   and located the dominant stage: `request_adapter` (P50 338.0 of 585.8 ms
   E00→E190, arm C). Nested instrumentation proved wgpu-hal's DX12 adapter
   enumeration calls `D3D12CreateDevice` for **every** enumerated adapter;
   on this host DXGI returns two same-name, same-VendorId/DeviceId AMD
   adapter entries with distinct LUIDs, so two expensive
   `D3D12CreateDevice` capability probes are paid serially.
5. **An elevated ETW scheduler analysis**
   (WINDOWS-STARTUP-ETW-REALITY-AUDIT-1) decomposed the two costly probe
   windows with CSwitch/ReadyThread records and wait stacks: the probes are
   ≈97–98 % RUNNING (on-CPU) in 9 of 10 windows, not blocked off-CPU. It
   also produced the campaign's strongest causal result: a measurement-only,
   env-gated, reversible intervention that skips **exactly the known
   non-selected LUID** moves `request_adapter` by **−152.0 ms** (358.0 →
   206.0 ms P50, n=20+20 interleaved) and the endpoint by −149.6 ms, with
   the selected adapter, backend, device type, formats and the full marker
   sequence unchanged in 40/40 runs.
6. **A T1-anchor audit** (WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1)
   showed the historical window-mode numbers were spawn-anchored, and that
   ~90–130 ms of the measured time is generic host pre-main process-creation
   cost (proven against warmed hello-world and `cmd` controls). In-process
   T1→T2 is 199 ms in a degraded session and bounded at ~125–153 ms in the
   quiet session — straddling the target by session state. Verdict:
   NO_BOUNDED_CORRECTIVE_EARNED.

**Current top-level conclusions.** On this one Windows host, the dominant,
reproducible, causally-proven startup cost is wgpu-hal's DX12
probe-every-adapter behavior paying two expensive `D3D12CreateDevice`
capability probes serially: the host inventory exposes one AMD display
device, while DXGI returns two same-name, same-VendorId/DeviceId AMD
adapter entries with distinct LUIDs (~150 ms of a ~570 ms process-entry →
first-present path). Whether the two DXGI entries are the same physical
adapter under Windows/DXGI identity semantics is NOT proven. The Linux control and the normalized Linux arm show the
same general startup DAG executes in far less time on much older hardware,
but the matched cross-OS comparison **does not exist** — the Windows
normalized arm was never collected — so no cross-OS causal verdict is
authorized. The Windows window-creation and pre-main process-creation costs
are real and load-sensitive but have no bounded product corrective. No
production fix is authorized by any campaign in this record.

---

## 2. Questions

The investigation, across its campaigns, asked:

| # | Question | Status after this record |
|---|---|---|
| Q1 | Why did the same binary measure P50 ≈ 293 ms in one session and ≈ 364 ms in another (and window mode 247 vs 307)? | **ANSWERED** — ENVIRONMENT_BOUND: measurement-host background CPU load, proven by intervention (AUDIT-1). No code corrective. |
| Q2 | Is the Windows startup cost a PocketJS portable-desktop tax, or Windows-execution-environment-specific? | **NOT DECIDED by matched data.** The Linux control suggests Windows-specific; the normalized cross-OS experiment that would decide this is INCONCLUSIVE (Windows arm blocked). |
| Q3 | Where does the Windows startup time actually go? | **ANSWERED (this host, DX12).** Dominant: `request_adapter` (338.0 P50 of 585.8 ms, arm C); within it, two serial `D3D12CreateDevice` capability probes (~163 + ~140 ms) over two same-name/same-VID/DID AMD entries with distinct LUIDs. |
| Q4 | Is the second (never-selected) adapter probe causal overhead? | **CAUSALLY PROVEN** — exact-LUID skip intervention: adapter −152.0 ms, endpoint −149.6 ms (n=20+20), selected adapter unchanged 40/40. |
| Q5 | Are the expensive probes off-CPU (blocked in the driver)? | **REFUTED in the off-CPU sense** — 97–98 % RUNNING (on-CPU) in 9/10 probe windows (B0 probe#0 95.6 % disclosed outlier). Kernel-vs-user split: NOT COLLECTED (SampledProfile unavailable on this host). |
| Q6 | What is the Windows window-creation cost, and is it one giant wait? | **MEASURED, NOT ONE WAIT** — clean 46.2 ms (arm A, n=10) / 51.6 ms (arm C, n=20) current-session P50; historically 68–74 ms; ≈2/3 RUNNING, ≈1/3 dense sub-ms waits whose dominant signature is the cross-process win32k user lock; no single main-thread wait > 0.79 ms. Load-sensitive. |
| Q7 | Do the historical window-mode numbers measure what the budget intends (T1 anchor)? | **OPEN AUTHORITY QUESTION** — ~90–130 ms of the historical spawn-anchored number is generic pre-main host process-creation cost; in-process T1→T2 is 199 ms (degraded session, n=24) to a ~125–153 ms quiet band. A T1-anchor ruling in BENCHMARK is a carried owner decision (#40). |
| Q8 | Is producing a production fix currently authorized? | **NO** — every campaign explicitly withholds authorization; a production dedup by VID/DID is NOT supported by this evidence. |

---

## 3. Experimental Timeline

Ordered by execution (host-local dates; the Windows audits ran on the
measurement host, the Linux control on a separate Fedora host, 2026-09-13
and 2026-09-14):

| Order | Experiment | Date | Host | Backend / anchor | Verdict (historical) |
|---|---|---|---|---|---|
| 1 | STARTUP-LAST-MILE-REALITY-AUDIT-1 | 2026-09-13 | Windows (Ryzen 7 5800H, iGPU) | Vulkan product default; spawn-anchored T0→T2/T6 | ENVIRONMENT_BOUND; no C7 |
| 2 | LINUX-DESKTOP-STARTUP-CONTROL-1 | 2026-09-13 | Linux (Xeon E5-2666 v3 + RX 580, RADV) | Vulkan; spawn-anchored T1→T2 | (historical full) WINDOWS_SPECIFIC_TAX |
| 3 | CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 (#43) | 2026-09-13 → 09-14 | Linux + Windows | Vulkan (normalized); process-entry E00 anchor | INCONCLUSIVE (Windows arm not collected) |
| 4 | WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1 (#40) | 2026-09-13 | Windows | Vulkan product default; T1-anchor analysis | NO_BOUNDED_CORRECTIVE_EARNED; no C7 |
| 5 | WINDOWS-STARTUP-CALLPATH-REALITY-AUDIT-1 | 2026-09-14 | Windows | **DX12** (measurement selector); E00→E190 | GPU_INIT_STAGE_DOMINANT; root cause not yet proven |
| 6 | WINDOWS-STARTUP-ETW-REALITY-AUDIT-1 (non-elevated pass) | 2026-09-14 | Windows | DX12; same E-series + ETW manifests | Q1/Q2 partially answered; elevated run blocked (admin) |
| 7 | WINDOWS-STARTUP-ETW-REALITY-AUDIT-1 — elevated closeout | 2026-09-14 | Windows | DX12; elevated kernel trace (WPR system logger) | PASS_WITH_OPEN_CAUSE; exact-LUID intervention performed → SECOND_PROBE_CAUSAL_OVERHEAD_CONFIRMED |

Experiments 1, 4 are on `main`; 3 is on `main` (`ee04801`, merged via PR
#43). Experiments 2, 5, 6/7 live on dedicated branches (2: a closeout
branch pending merge; 5: `audit/windows-startup-callpath-1`; 6/7:
`audit/windows-startup-etw-1`) — exact SHAs in §4 and in `evidence-index.md`.

---

## 4. Source and Measurement Authority

### 4.1 Source identity (shared across the Windows campaign)

| Item | Identity |
|---|---|
| PicoView campaign content | `491d0a5` (all Windows audits measured this content; the docs branch of record is `ee04801`) |
| PocketJS campaign base (frozen) | `a5a85356e172db8a32aefa983ee1259f60406f69` |
| PocketJS campaign candidate | `a46eb7e055ef443f5efecdac1cc447a3c1941805` (C4; tree `d12b28b7…`) |
| Cross-OS measurement-only series | `50e3ed8e` (E00–E190 instrumentation) + `e15674db` (BENCHMARK_CONFIG to stderr); tree `f09cf9fa…` |
| Call-path audit additions | `2ca5dc4c` (arm-B backend selector), `66df576f` (vendored wgpu-hal 25.0.2 + E50a–h2 nested markers; `[patch.crates-io]`), `4b2de0a4` (AUDIT_DXGI_ADAPTER LUID/name line) — measurement-only, never upstreamed |
| ETW audit addition | `be58f53c` (env-gated `ETW_AUDIT_SKIP_LUID` exact-LUID skip + selected-LUID carry) |
| Guest | frozen `picoview-a6-main` windows-app bundle: js 357,862 B (sha256 `cf73383f…`), pak 304,944 B (sha256 `3059416e…`) |
| Toolchain | rustc 1.98.1 (48a229cea 2026-09-01), `stable-x86_64-pc-windows-msvc`; cargo 1.98.1; Bun 1.2.8 / bun 1.4.2 (Linux bundle build) |
| Engine graph | wgpu 25.0.2 / winit 0.30.13 / naga 25.0.1 (engine Cargo.lock) |

### 4.2 Measurement authority and semantics (per campaign)

| Campaign | Clock / anchor | Endpoint semantics | n / percentile rule |
|---|---|---|---|
| AUDIT-1 | External QPC stopwatch, T0 = immediately before `Start-Process` (spawn-anchored) | T2 = `READY` (first present submitted, external poll detection) | image n=55; window n=55 / 20 (exploratory) |
| Linux control | External spawn→`READY` wall; batch `T0` epochs | T2 = host `READY` (first usable window) | gate batches n=55 (B) / n=50 (C); nearest-rank |
| Cross-OS normalized | ONE clock: process-local `std::time::Instant`, origin E00 = first statement of `main` | E190 = `FIRST_USABLE_PRESENT_SUBMITTED` — present-**submitted** proxy, explicitly not display photon latency | A n=20, B n=20, C n=50; linear interpolation on microseconds |
| #40 (T1-anchor) | External probe (spawn) joined against in-process `READY <unix_ms>` print | in-process segment = `main()` entry → present_done | q2 family n=24 (exploratory); gate probe n=55 |
| Callpath | E-series monotonic from process entry; no ETW in headline batches | A: E00→E199 (first redraw); B/C: E00→E190 | A 20, B 20, C 50; linear interpolation on microseconds |
| ETW baseline | Same E-series; headline runs **untraced** | same as callpath | A 10, B 10, C 20; linear interpolation on microseconds |
| ETW elevated (Q1/Q2) | Per-trace alignment to the harness's own write bursts (≤0.10 ms anchors) | window states RUNNING/READY/WAITING from CSwitch/ReadyThread | 5 arm-A + 5 arm-B traces; per-column medians |

Known structural limits of the plumbing (all campaigns): external poll
quantization ≤ ~10–15 ms/run (AUDIT-1); `Process.StartTime` rides the coarse
system-time update (up to ~15 ms) (#40); ETW-traced walls are inflated by
observer overhead and by the harness's stderr writes (~6 ms per marker line
in the runner's redirected environment; 5.0–6.1 ms/run inside arm-A
`E20→E21`); `SampledProfile` is unavailable on this host, so no kernel/user
CPU split exists anywhere in the Windows evidence.

### 4.3 Campaign reports and refs (full table in `evidence-index.md`)

| Campaign | Report path | Lives on | SHA |
|---|---|---|---|
| AUDIT-1 | `docs/STARTUP-LAST-MILE-REALITY-AUDIT-1.md` | `main` (`ee04801`) | — |
| Linux control (reconciled) | `docs/LINUX-DESKTOP-STARTUP-CONTROL-1.md` | `docs/linux-desktop-startup-control-1-closeout` | `c8dcc75` (branch tip); full evidence `982914b` on `archive/linux-desktop-startup-control-1-full` |
| Cross-OS normalized | `docs/CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1.md` | `main` (`ee04801`, PR #43) | archive tip `4431934` on `archive/cross-os-normalized-desktop-startup-1-full` |
| #40 T1-anchor | `docs/WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1.md` | `main` (`ee04801`) | — |
| Callpath | `docs/WINDOWS-STARTUP-CALLPATH-REALITY-AUDIT-1.md` | `audit/windows-startup-callpath-1` | `e8dd437` |
| ETW (incl. elevated closeout) | `docs/WINDOWS-STARTUP-ETW-REALITY-AUDIT-1.md` | `audit/windows-startup-etw-1` | `f75c283` |

---

## 5. Linux Reference Experiments

Two Linux experiments exist. They are **different protocols on the same
host** and their numbers must not be mixed (the earlier control is
spawn-anchored; the normalized experiment is process-entry-anchored).

### 5.1 Linux control (LINUX-DESKTOP-STARTUP-CONTROL-1)

Host: Fedora 44 KDE Plasma (Wayland/kwin), Intel Xeon E5-2666 v3 (2014; 20
logical), 62 GiB RAM, AMD RX 580 2048SP (RADV POLARIS10) — older and slower
than the Windows measurement host. Backend: Vulkan (RADV); guest resolved
for `linux-app` by the official CLI from the same guest source. Source:
exact tree transfer of `a46eb7e0` (git bundle; verified).

| Arm (spawn→READY wall, nearest-rank) | P50 | P95 | n |
|---|---:|---:|---:|
| A winit only (Wayland bufferless; "window created + loop alive") | 11 ms | 12 ms | 20 |
| B winit + wgpu (serial instance 69 + adapter/device 37 + surface/configure 4 + first clear/present ~1) | 107 ms | 112 ms | 20 |
| C full PocketJS — gate batches B (127) and C (123) | 123–127 ms | 141 ms | 55 / 50 |
| C exploratory arms (session A stock [contaminated tail], d2 arms ×2, X11) | 106–132 ms | 122–279 ms | 20–55 |

Supporting shape: the structural startup DAG is identical on both OSes
(same portable code, same markers, same overlap structure); the QuickJS
guest boot is the same magnitude class (~47 ms this host); thread DAG and
stage decomposition retain their full tables in the report. The in-process
oracle (env-gated injected sleeps) validated the DAG on the Linux side:
CRIT +100 ms → observed +51 ms (~47 % critical), GUEST +100 ms → +27 ms,
both matching the independently measured slack. **BENCHMARK_ORACLE_VALID.**

Historical full verdict: **WINDOWS_SPECIFIC_TAX** — the ≤150 ms budget is
met on Linux (P95 141) and missed on Windows; the deficit does not travel
with the portable architecture. See §16 for how later evidence constrains
this claim.

### 5.2 Linux normalized arm (CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1)

Protocol: one frozen config both hosts (Vulkan, LowPower, `MemoryHints::
MemoryUsage`, Fifo, `desired_maximum_frame_latency=1`, viewport 720×480,
density 1, `POCKET_FORCE_SCALE=1.0`, per-target official guest bundles);
one process-local clock; E00 anchor; per-run `BENCHMARK_CONFIG` audit
(`config_uniform`).

| Arm (µs-scale values, P50 / P95, n) | P50 | P95 | min | max | IQR |
|---|---:|---:|---:|---:|---:|
| A winit only (first `RedrawRequested`) | 9.968 ms | 11.412 ms | 9.210 | 11.740 | 1.236 |
| B winit + normalized wgpu | 69.764 ms | 72.203 ms | 62.494 | 80.723 | 3.415 |
| C full PocketJS E00→E190 | 75.678 ms | 80.581 ms | 68.105 | 87.842 | 3.200 |

Linux critical-path decomposition (median C run): entry+loop+window 11.99 →
gpu-instance wait 31.76 → gpu setup on main 26.27 → first-output wait 3.24 →
redraw+present 2.55 ms = 75.81 ms serial sum = measured E190−E00. The
runtime/QuickJS lane is fully overlapped on Linux.

**Reading the two Linux experiments together (allowed):** the spawn-anchored
control (123–127 ms) and the normalized experiment (75.68 ms, E00-anchored)
sit in the same range once the anchors differ; the residual ≈48 ms is a
**derived difference between the two anchors** (123–127 minus 75.68), not a
separately measured spawn→entry segment — the cross-OS protocol explicitly
does not use external spawn→READY walls in any stage math. The anchor
difference is a measurement-class fact, not a discrepancy; neither number is
a valid matched cross-OS comparison (different hardware, different
protocols, different anchors).

---

## 6. Normalized Cross-OS Attempt

The normalized experiment was built to produce the matched comparison the
earlier Linux control could not: identical protocol, config, clock
definition, marker semantics, viewport/density semantics, GPU policy, and
experiment structure on both hosts, with per-run config capture and ambient
gates. Linux completed successfully (§5.2) and was frozen.

**Windows: the normalized arm was never collected.**

1. The first C batch attempt used hidden-window launches (`Start-Process
   -WindowStyle Hidden`). All 50 samples failed GPU init; hidden launch was
   invalid for this benchmark on this host (INVALID_ENVIRONMENT, archived).
2. With visible windows, **every Vulkan process on the machine — including
   `vulkaninfo` itself, which is unrelated to PicoView/PocketJS — failed
   `vkGetPhysicalDeviceSurfaceCapabilitiesKHR` with ERROR_UNKNOWN**. The
   DX12 backend of the same binary worked. A driver reset hotkey and an
   Event Log check changed nothing (no TDR-class events). 15 spaced
   recovery probes over 45 minutes and a re-verification ~1 h after onset
   showed no recovery. Machine reboot / driver reinstall was an operator
   action and was not taken. Arm A (winit-only, no Vulkan dependency) was
   consequently never independently collected either.

So the Windows normalized numbers **do not exist**, and none may be inferred
from other experiments: the historical Windows in-process figures have a
different protocol, different instrumentation vocabulary and a different
backend (DX12) from the normalized protocol (Vulkan).

Evidence-bounded classification of the Windows failure:
**SYSTEM-WIDE WINDOWS VULKAN SURFACE-PATH FAILURE** — proven NOT to be
PicoView/PocketJS-specific (vulkaninfo fails identically; DX12 works in the
same binary). The exact failing component (AMD ICD / Vulkan loader /
implicit layer / WSI / driver userspace state / another component) is
**NOT PROVEN**.

---

## 7. Why the Cross-OS Verdict Is INCONCLUSIVE

The experiment's frozen verdict is **INCONCLUSIVE** — one of its allowed
fixed verdicts. Precisely:

- It is **not** "Windows is slower": no Windows normalized data exists.
- It is **not** "Linux proves a Windows tax": that inference comes from the
  *earlier, non-normalized* control on different hardware, and the whole
  point of the normalized experiment was to replace that weaker comparison.
- It is **not** "AMD Vulkan driver root cause proven": the failure is
  system-wide on this machine but its component is unidentified.
- The cross-OS differential table, the anomaly ranking and any Windows-local
  follow-up are **NOT EXECUTABLE** from this experiment.

Authority consequence (as frozen by the campaign and preserved here):

> Linux is HISTORICAL REFERENCE ONLY. No further cross-OS causal attribution
> is authorized from this experiment. Future Windows findings live in their
> own report and must not be folded back into the closed cross-OS record.

The same discipline applies in the other direction: the later Windows-only
DX12 findings (this record's center of mass) do **not** repair the
INCONCLUSIVE verdict and do not make a matched Linux-versus-Windows
statement. They are Windows-local.

---

## 8. Windows-Only DX12 Baseline

The Windows-only investigation deliberately left the cross-OS comparison
and switched to the native Windows backend:

- Backend: **DX12**, selected by the host's existing
  `POCKET_GPU_BACKEND=DX12` measurement knob; verified on every headline run
  via `BENCHMARK_CONFIG.gpu.adapter_backend = "Dx12"` (adapter "AMD
  Radeon(TM) Graphics", IntegratedGpu, Bgra8Unorm, Fifo). The product
  unset default (Vulkan) is unchanged.
- Machine (unchanged across the Windows campaigns): Windows 11 Pro build
  26200, Ryzen 7 5800H (8C/16T), 28.9 GiB RAM, AMD iGPU driver
  31.0.21923.11000 (Adrenalin 25.8.1), 2560×1440@60, scale 1.0. QQPCRTP
  resident (WinDefend service stopped — pre-existing). Hyper-V/VBS active.
- Ambient gates: each published batch passed a P95<20 % quiet gate
  (VERIFY 11.0, BATCH-A 9.55, BATCH-B 8.0, BATCH-C 14.65); a first
  collection attempt was discarded whole (gates failed) and contributes
  nothing.

**Headline batch (E00→endpoint, nearest-rank, P50/P95, visible windows):**

| Arm | Endpoint | P50 | P95 | min | max | n |
|---|---|---:|---:|---:|---:|---:|
| A winit only | E00→E199 | **132.1 ms** | 144.7 | 121.6 | 270.8 | 20 |
| B winit + wgpu DX12 | E00→E190 | **560.9 ms** | 598.3 | 545.9 | 615.4 | 20 |
| C full PocketJS | E00→E190 | **585.8 ms** | 600.6 | 573.7 | 604.3 | 50 |

Arm A's `RedrawRequested` completion of the first `AboutToWait`/redraw
cycle is the winit-only floor; B−A and C−B are **not additive** (the C DAG
overlaps guest boot with GPU init).

**Later clean baseline (ETW campaign's Phase-1 rebaseline, same binaries):**

| Arm | P50 | P95 | n | vs prior |
|---|---:|---:|---:|---|
| A winit only | **91.5 ms** | 129.6 | 10 | −40.6 ms vs prior A (load-sensitive stage) |
| B winit + wgpu DX12 | **554.2 ms** | 850.6 (one ~860 tail outlier) | 10 | −1.2 % |
| C full PocketJS | **580.0 ms** | 664.0 | 20 | −1.0 % |

B and C reproduce across sessions within ~1 %; **A/window_create is the
component whose sessions differ the most** (load-sensitive; the
*mechanism* is only "consistent with" the documented background-load
sensitivity — no quiet-desktop causal control was run; see §13). The two
sessions must not be averaged: `BASELINE_DRIFT: NOT DECLARED` (dominant
path reproduced within 1 %).

**Stage decomposition of the arm-C headline (own duration, P50/P95):**

| Stage | P50 | P95 | Lane / note |
|---|---:|---:|---|
| `adapter` E50→E51 (wgpu request_adapter) | **338.0** | 351.5 | main; strictly serial after window+surface; completion 481 ms |
| `window_create` E20→E21 | 73.8 | 78.8 | main; partially overlapped by the instance side thread |
| `device` E60→E61 (wgpu request_device) | 40.2 | 41.6 | main; naga validation + d3dcompiler |
| `runtime_boot` (worker, overlapped) | 52.5 | 55.5 | assets 7.2 / QuickJS 1.4 / guest eval 24.3 / glue; done at 176 ms, then waits ≈364 ms on the GPU lane |
| `gpu_instance` (side thread, overlapped) | 42.7 | 46.9 | done at 80 ms, needed at 143 ms |
| `present_call` (first Present) | 13.3 | 14.6 | main |
| `render` (first DrawList → submit) | 4.1 | 4.9 | worker |

Reading: within E00→E190 on this host, `adapter` alone is 58 % of the arm-C
endpoint and 63 % in the ETW rebaseline. Everything the Portable-desktop
architecture contributes beyond the GPU path (guest boot, first frame) is
either overlapped or single-digit-to-tens of ms.

---

## 9. Windows Startup Critical-Path Tree

One canonical tree, **arm-C/E00 semantics**, values are P50s from the
named batch. Instrumented values are marked; headline (untraced) endpoints
are marked; the tree is composed from the call-path audit's measured
completion times (instrumented build) and its headline endpoints, and the
ETW rebaseline values are given for the same stages in §13/§14 where they
apply. **Numbers from different measurement classes are not summed across
classes.** The serial sum is the audit's own arithmetic on its own
instrumented run set, reconciled to its own measured endpoint.

```
epoch: one Instant origin, E00 main entry                     0.0 ms   [headline E00→E190 = 585.8 P50]
│
├─ args/logger → E10                                        6.0 ms
├─ E10→E11  EventLoop::build                              ~32 ms    [main; win32k/msg-thread setup]
├─ E20→E21  create_window (winit → CreateWindowExW)        74 ms    [main; mostly kernel/DWM work]
│   ║  side thread E30→E31 wgpu Instance (dxgi/d3d12 load) 43 ms — done at 80 ms, NOT critical
├─ E40→E41  surface create                                5.6 ms    [main]
├─ E50→E51  request_adapter (wgpu request_adapter)       338 ms    [main; CRITICAL — DOMINANT]
│   ├─ EnumAdapters1                                      6 ms
│   ├─ probe AMD LUID 0-e1e6  (D3D12CreateDevice)       ~163 ms    [D3D12CreateDevice capability probe; CPU-heavy
│   │                                                                on calling thread; user/kernel mode unresolved]
│   ├─ probe AMD LUID 0-1a8f2 (D3D12CreateDevice)       ~140 ms    [D3D12CreateDevice capability probe; never
│   │                                                                selected in the measured runs]
│   └─ probe MBRD + queries                               ~8 ms
│   ║  worker thread E80→E89 runtime boot 52.5 ms — done at 176 ms, then blocked on GPU ≈364 ms
├─ E60→E61  request_device (chosen AMD adapter)            40 ms    [main]
├─ E70→E73  caps + surface config                         9.1 ms   [main]
├─ E91      renderer ready (worker wakes)                542.5 ms
├─ E100 first tick 543.9; E110→E113 render                 547→551 ms
├─ E122/E130 wake → redraw request                       553→555 ms
├─ E140→E162 acquire 1.0 / blit 6.6 / encode 1.3 / submit  569 ms
├─ E180→E181 Present()                                    13.3 ms
└─ E190     FIRST USABLE PRESENT SUBMITTED                585.8 ms  [present-submitted proxy; not photon-on-screen]
```

**Same lane, ETW rebaseline (untraced headline, current session):**
`adapter` E50→E51 364.6 ms; `window_create` 51.6 ms; `device` 42.7 ms;
endpoint 580.0 ms (arm C, n=20). Relative shape identical; absolute
window_create differs by session load (see §13).

**Pre-main segment (before E00).** On this host ~90–130 ms elapses between
kernel process creation and the first instruction of `main()` for ANY
process: warmed hello-world Rust binary 108–118 ms (earlier window),
hello-world P50 ≈ 122–124 ms (join3 persisted, n=8; median 122.5 linear /
122 nearest-rank; raw rows in the archive), `cmd /c echo`
spawn→output-visible P50 ≈ 151 ms (join3; 86–90 ms in a quieter window).
PicoView's 12 MB image adds only ≈5–15 ms over hello-world — a delta at the
edge of `Process.StartTime` granularity. The pre-main segment is **generic
host cost, not PicoView architecture**; §15 gives the elevated-trace view of
what sits inside it.

---

## 10. DXGI / wgpu-hal Adapter Enumeration

### 10.1 What wgpu-hal does (source + markers, proven)

`wgpu-hal` dx12 adapter enumeration runs `enumerate_adapters` → for each
enumerated adapter `Adapter::expose` → `D3D12Lib::create_device`
(`D3D12CreateDevice`) capability probing, before any final adapter
selection; the `should_keep_adapter` filter removes Intel Haswell device IDs
and the non-software-flagged integrated WARP ("Microsoft Basic Render
Driver", vendor 0x1414) — it applies no alias/duplicate-identity filtering.
The instrumentation (vendored wgpu-hal 25.0.2 with nested E50a–h markers)
shows this sequence in every instrumented run, and the marker chain
interleaves monotonically inside `E50→E51` and sums consistently into the
span.

### 10.2 What DXGI enumerates on this host (proven)

`AUDIT_DXGI_ADAPTER` lines, identical across the call-path audit's 4 named
runs, the ETW campaign's 5 captures, and 20 pristine intervention runs:

| Index | Name | VendorId:DeviceId | LUID |
|---|---|---|---|
| 0 | AMD Radeon(TM) Graphics | 0x1002:0x1638 | **0-e1e6** |
| 1 | AMD Radeon(TM) Graphics | 0x1002:0x1638 | **0-1a8f2** |
| 2 | Microsoft Basic Render Driver | 0x1414:0x8c | 0-f7f1 |

**The host inventory exposes one AMD display device, while DXGI returns two
same-name, same-VendorId/DeviceId AMD adapter entries with distinct LUIDs.**
The evidence does not establish that the two DXGI entries are the same
physical adapter under Windows/DXGI identity semantics, nor that the second
entry is invalid.
The selected adapter is LUID **0-e1e6**, proven per run via the
selected-LUID carry on the adapter driver string (40/40 intervention runs).
The second AMD entry (0-1a8f2) is probed with a full `D3D12CreateDevice`
and never selected.

### 10.3 Nested-marker decomposition (instrumented build; B arm)

`request_adapter` span decomposition (P50s from the n=8 batch; the n=4
named batch adds identity only; pooled n=12 reference values in the CSV):

| Segment | P50 (ms) | Evidence |
|---|---:|---|
| DXGI `EnumAdapters1` enumeration | 6.0 | E50a→E50b |
| probe #0 `D3D12CreateDevice` — AMD LUID 0-e1e6 | **162.9** | E50e0→E50f0 |
| probe #0 feature/description queries | 1.7 | E50g0→E50h0 |
| probe #1 `D3D12CreateDevice` — AMD LUID 0-1a8f2 | **140.2** | E50e1→E50f1 |
| probe #1 feature/description queries | 1.7 | E50g1→E50h1 |
| probe #2 `D3D12CreateDevice` — MBRD | 6.0 | E50e2→E50f2 |
| probe #2 queries | 1.2 | E50g2→E50h2 |

The two AMD probes alone are ~303 ms of the ~344 ms instrumented span
(**88 %**, per-run 88.5–89.0 % excluding a disclosed 857 ms outlier; 87.1 %
pooled n=12). Headline (uninstrumented) spans: 313.0 ms (arm B) / 338.0 ms
(arm C) — the instrumented build carries vendored-patch overhead and is
never quoted as a headline number.

**Interpretation boundary:** the same VID/DID/name under two LUIDs proves a
duplicate *enumeration*; it does not prove the two entries are the same
physical adapter in every sense (they may legitimately differ in LUID-scoped
state). The evidence proves *cost*: two full `D3D12CreateDevice` capability
probes are paid serially, and only one entry is ever selected.

---

## 11. Exact-LUID Causal Experiment

The campaign's strongest result. Design (all committed on the audit branch
only):

- **Intervention:** in the vendored wgpu-hal `enumerate_adapters`, an
  env-gated skip (`ETW_AUDIT_SKIP_LUID`) that omits **exactly one
  LUID-matching adapter** from enumeration → it is never exposed → never
  probed. It does **not** generically deduplicate by name, VendorId or
  DeviceId — identical physical GPUs may legitimately share those fields.
- **Measurement-only, reversible:** same binary for both arms; env unset =
  pristine; env set = skip. Randomized interleave, n=20 + n=20, marker-based
  timing (no ETW capture), instrumented build.
- **Known non-selected LUID:** 0-1a8f2 (selected 0-e1e6, proven per run).

**Result (P50, ms):**

| Metric | Pristine | Patched (skip 0-1a8f2) | Δ |
|---|---:|---:|---:|
| `E50→E51` (request_adapter) | 358.0 | **206.0** | **−152.0** |
| probe #0 (AMD LUID 0-e1e6, selected) | 168.9 | 170.8 | +1.9 (unchanged) |
| probe #1 slot (AMD 1a8f2 → MBRD) | 144.5 | 6.3 | −138.2 |
| `E00→E190` endpoint | 569.1 | **419.5** | **−149.6** |

The prediction from the nested-marker decomposition (~−140 ms) was met
(−152.0 ms adapter, endpoint moving by the same amount) and the selected
probe was unchanged, as the intervention requires.

**Invariants held in 40/40 runs:** selected adapter LUID unchanged
(0-e1e6); adapter name "AMD Radeon(TM) Graphics" unchanged; backend DX12
unchanged; device type IntegratedGpu unchanged; surface format Bgra8Unorm
unchanged; present mode Fifo unchanged; complete E00→E190 marker sequence
present in every run. One 747.4 ms endpoint outlier exists in the patched
arm (P50 unaffected, disclosed).

**Current causal verdict: `SECOND_PROBE_CAUSAL_OVERHEAD_CONFIRMED`.**

This establishes: the non-selected second AMD adapter probe costs
approximately **150 ms of startup on this host**; skipping exactly that LUID
recovers it.

This does **not** establish: a production dedup algorithm; that same
VID/DID implies a duplicate; that the second LUID is invalid; that all
Windows systems exhibit this; that wgpu is necessarily buggy. Production
fix: **NOT AUTHORIZED**.

---

## 12. Elevated ETW Scheduler Analysis

**Purpose.** The user-mode uProf pass showed whole-process on-CPU ≈50–90 ms
against 561–586 ms wall, which *suggested* the adapter stage might be
predominantly off-CPU (blocked in the driver). Wait-state attribution needed
scheduler-level verification; the elevated kernel trace supplied it and
**superseded that reading**.

**Validity (mechanical gates, all PASS).** One UAC approval; capture ran
unattended; cleanup verified (`cleanup_ok: true`; the 56 pre-existing
resident ETW sessions were untouched, before/after dumps byte-identical).
All 10 traces (5 arm A + 5 arm B) non-empty: CSwitch (per-run child
1,401–4,172), ReadyThread (0.7k–2.0k), stack walks, process/thread
lifetime and image loads all present. Clock alignment is per-trace and
derived from the harness's own write bursts: two anchors (E11, E21) within
≤0.10 ms in all 10 traces, a third (E131) within ≤0.10 ms in 4 runs; the
rest report availability rather than an alignment value.

**Not obtainable on this machine: `SampledProfile`.**
`SAMPLED_PROFILE_UNAVAILABLE` — zero sampled-profile events under two
independent profile definitions, and `xperf -a profile` over a canary
answers "There is no sampled profile data in the trace". Therefore RUNNING
is reported as a single scheduler state and **no kernel-vs-user CPU split
is claimed anywhere**.

**Q1 — window creation (`E20→E21`), arm A, elevated, main thread (ms):**

| run | wall | RUNNING | READY | WAITING | dominant waits |
|---|---:|---:|---:|---:|---|
| A0 | 64.2 | 41.1 | 1.9 | 21.2 | WrResource 13.5, Executive 5.5 (harness stderr write), WrLpcReply 1.2 |
| A1 | 59.1 | 40.3 | 2.5 | 16.3 | WrResource 9.0, Executive 5.0 |
| A2 | 49.4 | 36.0 | 1.6 | 11.9 | Executive 5.1, WrResource 4.6 |
| A3 | 96.8 | 56.3 | 7.3 | 33.2 | WrResource 25.2, Executive 5.0 |
| A4 | 53.8 | 39.4 | 1.6 | 12.7 | Executive 6.1, WrResource 4.5 |
| **P50** | **59.1** | **40.3** | **1.9** | **16.3** | (per-column medians; rows do not sum) |

- **Not one big wait**: no single main-thread wait exceeds **0.79 ms**.
  ≈2/3 RUNNING + a dense stream of sub-ms lock/message/I-O waits.
- Dominant wait signature: the **win32k user lock**
  (`KeWaitForSingleObject ← ExpWaitForFastResource ←
  ExAcquireFastResourceExclusive ← win32kbase!EnterCrit`); 1,991 such waits
  totalling 57.7 ms across the five arm-A runs (2,978 / 85.9 ms including
  the arm-B windows).
- **Wake sources** (arm A aggregate): msedge 579, explorer 486, dwm 237,
  esrv 180, QQPCTray 103, Weixin 69, Idle 122; only 21 wakes from the
  process's own threads of 2,176. The histogram is reason-unfiltered and the
  "waker of a lock wait" reading is aggregate — this is *consistent with*
  cross-process win32k contention, but **no quiet-desktop causal control was
  run**, so it is not proven as the mechanism.
- Second wait class: the **harness's own stderr write** (Executive reason,
  5.0–6.1 ms/run inside the window; non-cached NTFS write path with `$LogFile`
  flush) — measurement plumbing, present identically in the clean baselines.
- Sequence inside the window (A0): 11 Win32k user-handle creates (first at
  +7.09 ms), 1,065 of the trace's 1,815 `GdiHandleOperation` events, the
  DxgKrnl allocation/VAD/fence/`CddStandardAllocation` cluster at
  +27.0…+59.7 ms, `Win32k OldToNewRendering` at +59.65 ms (DWM
  redirection-surface establishment), and **zero** child events between
  `E21` and `E130`.

**Q2 — the two `D3D12CreateDevice` probes (arm B, elevated, main thread):**

| run | probe #0 wall / RUN / WAIT | probe #1 wall / RUN / WAIT |
|---|---|---:|
| B0 | 233.4 / 223.2 / 9.6 | 149.7 / 147.3 / 2.3 |
| B1 | 177.1 / 173.0 / 3.7 | 148.6 / 146.5 / 2.0 |
| B2 | 170.4 / 166.2 / 3.8 | 146.6 / 144.7 / 1.8 |
| B3 | 166.4 / 161.6 / 4.3 | 143.5 / 141.2 / 2.2 |
| B4 | 172.2 / 168.0 / 3.9 | 157.1 / 154.6 / 2.3 |
| **P50** | **172.2 / 168.0 / 3.9** | **148.6 / 146.5 / 2.2** |

READY ≤ 0.63 ms in every probe window. **RUNNING is 97–98 % of wall in 9 of
the 10 probe windows; B0 probe #0 is 95.6 % (223.2 of 233.4 ms), the
disclosed outlier.** Waits are individually ≤0.85 ms; their signatures are
(a) `WaitForSynchronizationObject ← DxgkWaitForSynchronization` (GPU/paging
sync), (b) the harness's stderr write, (c) ALPC, (d) residual `KeWait*`.
Wakes inside probe #0 are dominated by `Idle` (141) and the process's own
threads (125) of 345 — no desktop herd, unlike Q1.

**Current verdict for the probes: `CPU_HEAVY` — mode unresolved.**
Off-CPU blocking is **refuted** (1.8–9.6 ms off-CPU against 143–233 ms
wall; READY ≤0.63 ms; no single big wait). A kernel-mode locus — an on-CPU
spin/poll inside the driver — would also read RUNNING and is neither
confirmed nor excluded; user-vs-kernel mode is unmeasurable on this host.

**Corrections the elevated pass applied to the non-elevated pass** (kept
here because they are easy to misquote): (1) the non-elevated clock bridge
claim ("DxgKrnl Process/Start fires at E20 begin") is not supported — those
events fire ≈3.3–4.5 ms before E00 (pre-main loader/CRT activity), and the
retired bridge's per-run offsets are not independently re-verifiable;
(2) the probes' off-CPU reading is refuted as above; (3) the window-create
"≈52–57 ms today / 68–74 ms historically" statement stands, with 5.0–6.1 ms
of any arm-A window being harness stderr writes; (4) the CDD/redirection
cluster sits **inside** `E20→E21`, not after it.

---

## 13. First-Window Findings

**Measured state (best current evidence; measurement classes labelled):**

| Quantity | Value | Class | Source |
|---|---|---:|---|
| `E20→E21` clean, arm A | **46.2 ms** P50 (44.3–94.4, n=10) | headline | ETW rebaseline |
| `E20→E21` clean, arm C | **51.6 ms** P50 (n=20) | headline | ETW rebaseline |
| `E20→E21` traced, arm A | 59.1 ms P50 (49.4–96.8, n=5) | ETW-traced (in-trace) | elevated Q1 |
| Prior audit | `E20→E21` | 73.8 ms arm C P50 (arm A 68.6) | headline | callpath audit |
| Historical plateau (Vulkan-era sessions) | 247–261 ms quiet / 307 busy | headline, spawn-anchored | AUDIT-1 |
| Warm second window (same process, hidden) | 12.5–14.8 ms (median 13.2) | instrumented, n=6 | #40; raw rows in the archive |

**Decomposition reading (#40, instrumented q2 family):** ≈13 ms is
intrinsic winit/`CreateWindowExW` cost (measured on a warm second window)
and ≈54 ms is first-window-specific (the process's first HWND: GUI
substrate/CSRSS/DWM first-touch, user32 handle-table setup, possible AV
window hooks — not further separable without ETW/winit internals). Caveat:
the warm probe window is hidden while the first window is spawned minimized
(visibility confound in the conservative direction).

**ETW view of the same interval (elevated):** ≈2/3 RUNNING, ≈1/3 dense
sub-ms waits, dominant signature cross-process win32k user lock; the DWM
redirection-surface establishment cluster sits inside the interval
(+27.0…+59.7 ms, `OldToNewRendering` at +59.65 ms). No single multi-tens-of-ms
wait exists.

**Cross-session behavior:** this stage is the component with the largest
session-to-session movement (arm A clean 68.6 → 46.2 ms endpoint between
sessions; arm C 73.8 → 51.6 ms). The delta remains
*consistent with* the documented background-load sensitivity (in-window
lock wait 4.5–25.2 ms/run, n=5, desktop-process wakers) but **no
quiet-desktop causal control was run, so it is not proven as the
mechanism**. The historical "~70 ms" sessions are likewise *consistent
with* the same host-state variability rather than with any code change (the
binaries were identical); that attribution is inference, not a measurement.

---

## 14. D3D12CreateDevice Findings

**What is proven** (nested markers + scheduler records, both audited):

1. On this host, wgpu-hal's DX12 `enumerate_adapters → expose` runs a real
   `D3D12CreateDevice` for both AMD LUIDs and for MBRD, **before** adapter
   selection. The two AMD probes cost ~163 ms and ~140 ms (instrumented
   n=8 P50s 162.9 / 140.2; the intervention's pristine arm,
   `instrumented_no_etw`, measures 168.9 / 144.5 ms) — 88 % of the
   instrumented adapter span against headline spans of 313.0 / 338.0 ms.
2. The span is CPU-heavy **on the calling thread**: 97–98 % RUNNING in 9 of
   10 elevated probe windows; off-CPU waits 1.8–9.6 ms; READY ≤0.63 ms.
3. Skipping exactly the non-selected LUID removes ~150 ms of the span and
   the same from the endpoint, with all selected-configuration invariants
   held (40/40).

**What is explicitly NOT proven:**

- **User vs kernel CPU:** `SampledProfile` is unavailable on this host, so
  the RUNNING mass cannot be split; an on-CPU spin/poll inside the
  AMD kernel-mode driver remains possible. The correct statement is:
  *the expensive D3D12CreateDevice spans are CPU-heavy on the calling
  thread; kernel-vs-user CPU attribution remains unresolved on this host.*
- **Why the second DXGI entry exists.** The host inventory exposes one AMD
  display device while DXGI returns two same-name/same-VID/DID AMD adapter
  entries with distinct LUIDs; the origin of the second DXGI entry is
  **OPEN** (see §16, §18).
- **Generality.** Whether other Windows systems (other GPUs, other driver
  versions, other virtualization states) exhibit duplicate enumeration, and
  what it costs there, is unmeasured. Single-host evidence.

**Adjacent measured numbers (for completeness):** the real device create
`E60→E61` costs 40.2 ms (arm C, P50) with naga validation + `d3dcompiler_47`
present; the adapter span's `E50a→E50b` (DXGI enum) is the one sub-stage
that is *wait*-dominated — 4.1–4.6 ms of its ~6 ms is Executive-reason
waiting, i.e. the harness's own marker writes bracketing it.

---

## 15. Pre-Main Environmental Costs

The elevated kernel trace observed substantial **pre-main** activity before
E00 on this host (all three items below are generic host environment, not
PicoView architecture):

- A **QQ PC Manager minifilter path with a ~58 ms-class wait**:
  stack `FLTMGR ← QQSysMonX64_EV.sys` (third-party minifilter in the loader's
  I/O path); a second QQ minifilter (`QMUdisk64_ev.sys`, 1.8 ms) also
  appears.
- Another **~74 ms-class pre-main wait with no captured stack**, ended by
  `conhost` / `QQPCRTP` threads — console attach / AV real-time scanning by
  presence-level attribution only (stated at the level the evidence
  supports).
- The DxgKrnl process-attach (event id 471) and first Win32k user-handle
  create (id 452) fire **≈3.3–4.5 ms / ≈3.1–4.2 ms before E00** in all 10
  traces — pre-main loader/CRT-init events, in-process caller not identified
  (DLL-init routines are candidates only).

This connects to the benchmark-anchor lesson: **process creation ≠ program
main entry**. The T1 proxy choice (spawn vs entry-point) moves the measured
"startup" by ~90–130 ms of generic host cost (#40's hello/cmd controls:
hello-world P50 ≈ 122–124 ms (n=8 join3); `cmd /c echo` 86–90 / ~151 ms). The
owner-facing consequence, as carried by #40, is that BENCHMARK needs a
T1-anchor ruling plus a machine-state specification (ambient-load ceiling +
telemetry, AV posture, exe-age/warm-up rule, process-creation recording).
This record does not decide that ruling and does not rewrite #40's
historical verdict.

---

## 16. Hypotheses That Were Refuted or Superseded

This section is the heart of the consolidation: earlier interpretations
that later evidence weakened or replaced. Historical reports are not
edited; the supersession is recorded here.

### 16.1 Superseded interpretations

| # | Earlier statement (where) | Later evidence | Current status |
|---|---|---|---|
| S-1 | "The Windows T1→T2 excess is a Windows-specific tax" — historical final causal claim (Linux control §VERDICT) | The normalized cross-OS experiment was built precisely to replace this comparison and returned INCONCLUSIVE (no Windows arm); the Linux control itself is cross-machine and was never normalized | **SUPERSEDED AS FINAL CAUSAL CLAIM.** The classification remains valid *as a hypothesis / directional finding for the ≤150 budget*; it is not the project's cross-OS verdict, and no matched comparison exists. The Linux measurements themselves remain evidence. |
| S-2 | "The adapter stage is predominantly off-CPU — the probe is blocked in the AMD driver" (callpath report's uProf-based reading: ≈270–300 ms "blocked") | Elevated CSwitch/ReadyThread: probes are **97–98 % RUNNING** (on-CPU) in 9/10 windows | **REFUTED in the off-CPU sense** (`OFF-CPU BLOCKING REFUTED`). Superseded wording: *CPU_HEAVY — mode unresolved*. The kernel-vs-user split remains unmeasured. |
| S-3 | "A specific 50–70 ms Windows-side block exists in window creation" (implied by the historical "unexplained ~50–70 ms cost") | ETW: no single main-thread wait > 0.79 ms; the interval is ≈2/3 RUNNING + dense sub-ms waits; and the *dominant* term under DX12 is the adapter stage, not window creation | **SUPERSEDED.** The historical number is real as a *stage cost* (load-sensitive) but is not one wait and is not the dominant term. |
| S-4 | The non-elevated ETW pass's clock bridge ("`DxgKrnl Process/Start` fires at E20/E30 begin"; per-run offsets `o`) | Elevated traces: those events fire ≈3.3–4.5 ms **before E00**; the bridge's placements were semantically mis-anchored (its `o` values have no reproducible artifact) | **CORRECTED by the elevated closeout.** Content observations stand; the two placements do not. The exact-LUID −152.0 ms result is marker-only and unaffected. |
| S-5 | "The CDD/redirection cluster sits after `E21`, at the first-redraw region" (non-elevated wording) | Elevated placement: inside `E20→E21` at +27.0…+59.7 ms; zero child events between `E21` and `E130` | **CORRECTED.** |
| S-6 | Historical window-mode plateau "247–261 ms STABLE_FAIL, architecture-owned, environment-independent" (AUDIT-1 §9) | #40: ~90–130 ms of the spawn-anchored number is generic host pre-main cost; in-process T1→T2 is 199 ms (degraded session) to a ~125–153 ms quiet band | **WEAKENED.** The STABLE_FAIL reading was content-scoped to the spawn-anchored probe; under the in-process anchor the result straddles the target by session state. The budget itself was not changed; the T1 anchor is the open authority question. |
| S-7 | "PicoView-specific cold-start / shader-cache coldness drives the numbers" (C1-era n=1 187 ms `gpu_instance` reading) | AUDIT-1: emptying the 216 MiB AMD `VkCache` costs nothing measurable; per-path AV rescan null; content delta only 10–12 ms | **REFUTED for those mechanisms**; cross-session variance is background load (intervention-proven). |
| S-8 | "A backend change could fix the budget" (backend-as-mitigation hypothesis) | AUDIT-1 §8: DX12 (760/964 ms, n=8) is far worse than Vulkan (317–352 plateau) on this host under the product path; the later DX12 *audit* baseline is 560–586 ms (callpath/ETW campaigns), i.e. DX12 is also slower than Vulkan there | **REFUTED as mitigation.** DX12 was chosen for the call-path audit because it is the native Windows backend and makes the adapter path observable — not because it is fast. |

### 16.2 Claims that were never true and must not be created by paraphrase

- The cross-OS experiment does **not** license "Windows is slower" or
  "Linux proves a Windows tax" (§7).
- The Windows Vulkan failure is **not** an AMD-driver root cause (§6).
- The exact-LUID experiment does **not** license a VID/DID dedup (§11, §19).
- RUNNING is **not** user-mode CPU (§14).
- ETW-traced wall ≠ headline clean wall; the two are never summed (§4.2).
- Process creation ≠ E00/main entry (§15).
- Present submitted ≠ photon on screen (§9).

---

## 17. What Is Proven

Statements that meet the project's evidence standard (observation +
mechanism + intervention/semantics where applicable) at the stated scope:

1. **Cross-session startup variance on this host is environment-bound**
   (background CPU load), proven by intervention: 0/12/0 workers ⇒
   334 → 619 → 317 ms; 0/3/0 workers ⇒ 358 → 442 → 347 ms. No code
   corrective earned (AUDIT-1).
2. **The startup DAG** (mandatory stages, lanes, overlap, waits) for both
   OSes, with a validated oracle: injected delays move T2 by the amounts
   the DAG predicts (E2 +93.5 / +97 detected and stage-localized; E3a ≈ +94
   vs ≈ +90 predicted; E3b exactly 0; on Linux CRIT +51 ms for a **recorded
   109 ms** injection (≈ 47 % critical) and GUEST +27 ms for a recorded
   115 ms injection, both matching the measured slack).
3. **The Windows arm-C critical path decomposition** (§8/§9): adapter 338.0
   of 585.8 ms P50, with all other stages single-to-tens of ms and the
   guest boot fully overlapped.
4. **The host inventory exposes one AMD display device while DXGI returns
   two same-name, same-VendorId/DeviceId AMD adapter entries with distinct
   LUIDs** (0-e1e6 selected, 0-1a8f2 never selected) on this host;
   wgpu-hal probes every enumerated adapter with a real `D3D12CreateDevice`
   (nested markers + source).
5. **The second, never-selected probe costs ≈150 ms**, causally proven by
   the exact-LUID intervention (−152.0 ms adapter, −149.6 ms endpoint,
   invariants 40/40).
6. **The probe spans are CPU-heavy on the calling thread** (97–98 %
   RUNNING, 9/10 windows; off-CPU blocking refuted).
7. **Window creation is not one giant wait** and costs ~46–52 ms clean /
   ~59 ms traced (this session) with a load-sensitive history of 68–74 ms;
   ≈13 ms of it is intrinsic winit/`CreateWindowExW`, ≈54 ms is
   first-window-specific (#40, instrumented).
8. **Pre-main process-creation cost is ~90–130 ms and generic** to this
   host's binaries (hello/cmd natural controls).
9. **The Linux host runs the same portable architecture efficiently**
   (normalized E00→E190 75.68 ms; spawn-anchored full-host 123–127 ms) —
   as a *reference*, not a matched comparison.
10. **The two proven small overlap mechanisms on Windows**: E4 (surface-free
    adapter/device request overlapped with window creation) −12.1 ms paired
    mean (8/8 pairs), E5 (early device release) ≈ −5 ms — combined ≈ 17 ms,
    below the MATERIAL band, not gate-shaping (#40).

---

## 18. What Is Still Open

| # | Open item | Why it matters | What would close it |
|---|---|---|---|
| O-1 | **Origin of the second DXGI entry (duplicate enumeration)** | Determines whether the ~150 ms is fixable at the app layer or is environmental | Driver/hypervisor-level investigation; a second host observation; GPU-PV/indirect-display mechanism evidence (none found) |
| O-2 | **Kernel-vs-user CPU split of the probes** | Distinguishes "AMD user-mode CPU" from "driver kernel spin/poll" (different upstream fixes) | Re-run the validated capture (`tooling/win-etw-elevated-rerun.ps1`, unchanged) on a host where `SampledProfile` works, or clear the resident kernel-logger conflict (0xb7/0x3ec) on this one |
| O-3 | **Cross-OS matched comparison** | The only way to re-adjudicate the "tax" question | A Windows normalized run under the frozen protocol after the Vulkan surface-path failure is cleared (operator action) |
| O-4 | **T1-anchor ruling + machine-state spec** | Determines what the ≤150 ms window budget actually measures and which runs are admissible | Owner/authority decision (carried by #40; requested by AUDIT-1) |
| O-5 | **Transferability** | Every number in this record is from ONE Windows host + ONE Linux host, both with idiosyncratic AV/VBS/desktop states | Measurements on other hosts |
| O-6 | **winit vs Win32 attribution of first-window cost** | Bounds what a native-window host could recover (Option-1 question) | ETW at winit-internals depth or a native-window prototype (not authorized) |
| O-7 | **Windows Vulkan surface-path failure root cause** | Blocks the normalized comparison and any Vulkan-based Windows measurement | Operator reboot/driver re-roll + re-verification |
| O-8 | **`SampledProfile` availability** | Blocks kernel/user attribution for *all* Windows stages, not just the probes | Host-level tracing configuration change |
| O-9 | **Whether ≥2 CPU-heavy probe spans occur on other systems** | The upstream question's generality | Upstream reproduction reports |

---

## 19. Production Implications

**No production change is authorized, implemented, or proposed by any
campaign in this record.**

What the evidence supports for future decisions (in decreasing certainty):

1. **A native adapter-identity-aware skip is mechanically available** in
   principle — the exact-LUID experiment shows ~150 ms is recoverable on
   this host by not probing a specific known-non-selected LUID. But a
   *production* rule requires an identity semantics that is not established
   (what makes two DXGI entries the same physical adapter; whether the
   non-selected LUID is safe to skip on other systems). **Do not
   deduplicate by name/VendorId/DeviceId.**
2. **E4 (+E5)** are proven, semantics-checked, *small* Windows overlap
   mechanisms (−12.1 ms / ≈ −5 ms). They are recorded as available
   optimizations should margin ever be wanted; they earn no corrective
   today (#40).
3. **The ≤150 ms budget's verdict is anchor- and state-dependent**: no
   bounded PicoView-side mechanism closes the gap under the historical
   spawn anchor; under an entry-point anchor the quiet band straddles the
   target. The gate-shaping decision therefore belongs to the T1-anchor
   ruling + machine-state spec (O-4), not to a code change.
4. **The DX12 audit path** (`POCKET_GPU_BACKEND=DX12`) is a *measurement*
   selector and is slower than the product default; it must not leak into
   product configuration.
5. **Upstream feedback** (see §20) is justified for the adapter-probe
   behavior as a discussion, not as a bug report or a fix request.

---

## 20. Upstream Feedback Readiness

Full draft: `docs/desktop-startup-performance-experimental-record-1/upstream-notes.md`.

| Target | Readiness | Basis |
|---|---|---|
| **wgpu / wgpu-hal** — DX12 adapter enumeration / capability probing | **READY_FOR_UPSTREAM_DISCUSSION** | Full call-path proof + scheduler state + a causal intervention with invariants; host-specificity clearly bounded |
| **winit / Win32** — first-window creation | **NOT_YET_UPSTREAM_READY** | Host/load-specific measurements; no bounded product corrective; no upstream-actionable mechanism isolated |
| **AMD / Windows / DXGI** — origin of the second DXGI entry (duplicate enumeration) | **NOT_YET_UPSTREAM_READY_AS_ROOT_CAUSE** | Reproduction/origin still open; Hyper-V presence is correlation only (no mechanism evidence) |

Proposed upstream problem statement (facts only; no accusation):

> On one Windows 11 / AMD integrated-GPU host, DXGI enumerates two adapters
> with the same name/VendorId/DeviceId but different LUIDs. At the audited
> wgpu-hal version (25.0.2), DX12 adapter enumeration calls
> `D3D12CreateDevice` while exposing each entry before final adapter
> selection. Both probes are expensive (~170 ms and ~145 ms). A
> measurement-only experiment skipping only the known non-selected LUID
> reduces `request_adapter` by ~152 ms and end-to-end startup by ~150 ms
> while preserving the selected adapter and rendering configuration.

Open questions for upstream are listed in the draft (intentionality of
per-adapter probing, cheap pre-filtering, existing alias/duplicate
mechanisms, identity semantics, lazy capability discovery, prior art for
virtualization/display topologies). The draft explicitly does not propose
VID/DID dedup and does not claim a confirmed wgpu bug.

---

## 21. Evidence / Reproduction Index

Compact index: `docs/desktop-startup-performance-experimental-record-1/evidence-index.md`.

Selected evidence archive:
`docs/desktop-startup-performance-experimental-record-1/selected-evidence.tar.gz`
(82 files; 799,850 B; sha256
`b92e2cfc87554757764d109f42804bb087341ad3d76afed76e3b4a97676d7366`;
deterministic build verified by two identical runs).

Contents: the cross-OS campaign's complete 230-file raw-evidence bundle
(already published on `main`), the Linux control's batch summary + identity
manifest + runner/stats scripts, the #40 measurement scripts and the
markers instrumentation diff, the call-path audit's summary CSV +
identity + both reviewer verdicts + ambient-gate records, the ETW
campaign's `summary.csv`, identity, final elevated analysis JSON + log,
strict-preempt variant, capture DONE marker, machine-state readback,
analyzer/capture/intervention tools, and the 40 raw intervention logs, plus
the measurement-only PocketJS patch series (instrumentation + exact-LUID
skip).

The cross-OS raw-evidence archive's own sha256
(`9d55742d1f6350226726dfa5f2347eebd03c4b3d7100395127df0ced3e540219`,
174,484 B) is unchanged and independently verifiable via its published
manifest.

Complete raw evidence for the other campaigns is retained on its branches /
worktrees and is NOT duplicated here — the index records each location,
branch, SHA and hash so provenance survives without merging the archives.
Note the ref-availability caveat: the two Windows audit branches and the
PocketJS audit series are **local-only** (never pushed); their portable
provenance is the archive's copy of the reports, the tooling, and the
PocketJS measurement-only patch series.

### 21.1 Review trail for THIS record

Two fresh-context adversarial reviews ran against the draft of this record
with full read access to the source reports, the raw evidence and the
archive; both verdicts and all corrections are recorded here.

- **REVIEWER A (experimental history / measurement).** Re-verified every
  headline number against the source reports and the raw archives,
  including independent recomputation of the intervention table from the
  archived `pristine/`/`patched/` logs with the included comparator.
  Findings and dispositions are listed below; no correction changed a
  published measurement, verdict, or disposition.
- **REVIEWER B (upstream / causality).** Read the record as a wgpu
  maintainer. Independently reproduced the intervention table (−152.0 /
  −149.6 with invariants 40/40), the Q1/Q2 thread-state tables and wake
  sources, and source-verified the vendored wgpu-hal mechanism
  (`enumerate_adapters → Adapter::expose → create_device` per adapter;
  the skip matches exactly one LUID text). Verdict REVISE with 2 MAJOR + 7
  MINOR, all fixed or dispositioned below.

| # | Reviewer | Finding | Disposition |
|---|---|---|---|
| 1 | B | MAJOR: `upstream-notes.md` §4 and the archive README claimed `win-etw-elevated-rerun.ps1` was in the archive; it was not. | **FIXED** — the script was added to the archive, which was rebuilt and re-hashed; all three texts updated. |
| 2 | B | MAJOR: upstream reproduction pointers were not resolvable (local-only branches; PocketJS patch not included). | **FIXED** — the PocketJS measurement-only patch series was added to the archive (`pocketjs-audit-patch/`), and `upstream-notes.md` now states the ref-availability caveat explicitly. |
| 3 | B | MINOR: `should_keep_adapter` description incomplete (also filters non-software integrated WARP). | **FIXED** — §10.1 corrected. |
| 4 | B | MINOR: §5.1 exploratory-arm P95 range excluded the X11 arm's 122 ms. | **FIXED** — range corrected to 122–279 ms. |
| 5 | B | MINOR: window_create load-sensitivity stated as fact in §8/§13. | **FIXED** — softened to "consistent with", with the no-quiet-desktop-control qualifier carried. |
| 6 | B | MINOR: oracle wording "+51 of +100" ignored the recorded 109 ms injection. | **FIXED** — restated as +51 ms for a recorded 109 ms injection (≈47 %). |
| 7 | B | MINOR: upstream intervention table lacked its measurement class. | **FIXED** — labelled `instrumented_no_etw`. |
| 8 | B | MINOR: problem statement did not pin the wgpu-hal version. | **FIXED** — "at the audited wgpu-hal version (25.0.2)". |
| 9 | B | MINOR (sufficiency gap): per-run n=8 instrumented logs are not in the archive, so the 88.5–89.0 % per-run share is not third-party checkable from it. | **DISPOSITIONED** — recorded as a known gap in `evidence-index.md` §2.1 (host-worktree path given); the pooled aggregate is included. |
| 10 | A | MAJOR: §14 item 1 conflated measurement classes ("~163/~140 ms (headline build: 168.9/144.5…)" — the quoted values are instrumented and `instrumented_no_etw`). | **FIXED** — restated with each class named (instrumented n=8; intervention pristine arm `instrumented_no_etw`; headline spans 313.0/338.0). |
| 11 | A | MAJOR: `summary.csv` warm-second-window P50 = 13.7 ms matched no source statistic (raw median 13.17/13.16 ms). | **FIXED** — 13.2 ms, and the six raw values were added to the archive (`windows-t1-anchor/warm-window-second-create.txt`). |
| 12 | A | MAJOR: `summary.csv` placed P50 values (293, 364, 619) in the `delta_ms` column with n/p95 empty. | **FIXED** — moved to `p50_ms`, n/p95 filled; ABA sequence stays in notes. |
| 13 | A | MINOR: §4.2 said nearest-rank for the callpath/ETW-baseline rows; those campaigns used linear interpolation on microseconds. | **FIXED** — both rows corrected. |
| 14 | A | MINOR: §13 paired the prior arm-C window_create (73.8) with the new arm-A value. | **FIXED** — arm A 68.6 → 46.2; arm C 73.8 → 51.6. |
| 15 | A | MINOR: §16 S-8 attributed the 560–586 DX12 baseline to AUDIT-1 §8 (that section has 760/964 only). | **FIXED** — 760/964 cited to AUDIT-1 §8; 560–586 to the later callpath/ETW baseline. |
| 16 | A | MINOR: §5.2 presented the ≈48 ms spawn→entry figure as a measured segment. | **FIXED** — labelled a derived difference between the two anchors; the normalized protocol uses no external wall in stage math. |
| 17 | A | MINOR: "hello-world P50 ≈ 124 ms" did not reproduce (join3 median 122.5 linear / 122 nearest-rank). | **FIXED** — "≈ 122–124 ms" (median 122.5 linear / 122 nearest-rank; raw rows added to the archive as `join3-hello.csv`). |
| 18 | A | MINOR: `evidence-index.md` said the elevated kernel ETLs are 12–23 MiB; they are ~112–123 MiB (12–23 MiB are the non-elevated user-session ETLs). | **FIXED** — sizes corrected and split. |
| 19 | A | MINOR: §21.1 / evidence-index claimed a completed Reviewer A pass and a commit trail before either existed. | **FIXED** — this table is the actual trail; the record was committed after the fixes (see the branch's commit). |
| 20 | A | Note: the record changed under the reviewer mid-review (archive rebuild + edits). | Recorded — findings 10–19 are against the post-fix revision; no reviewer finding depended on the stale baseline. |

Reviewer A independently reproduced (not merely cross-read): the Linux
control numbers, the normalized Linux numbers, the full Windows DX12
headline and stage tables, the ETW rebaseline, the intervention table
(recomputed from the archived 40 logs with the included comparator), the
Q1/Q2 thread-state tables and wake aggregates, the AUDIT-1 raw
recomputations, the #40 E4/E5/join3/warm-window raw values, the PocketJS
identities and patch applicability, and the archive's own integrity
(sha256, member metadata, byte-equality to canonical blobs). Two deliberate
limits were noted: the ETW pre-main wait sizes, GdiHandleOperation
placements and the exact 1,991-wait aggregate are not independently
recomputable from the archive (the tool that produced the headline
aggregate, `verify_review_findings.py`, is host-retained) — they are
faithfully copied from the reviewed ETW report.

---

## 22. Final Disposition

- **Cross-OS normalized campaign:** CLOSED_AS_INCONCLUSIVE (Windows arm
  never collected). Linux is historical reference only; no further cross-OS
  causal attribution authorized from it.
- **Windows-only investigation:** the dominant startup cost on this host is
  found, causally bounded to wgpu-hal's DX12 per-adapter probing of two
  same-name/same-VID/DID AMD entries with distinct LUIDs, and quantified
  (`SECOND_PROBE_CAUSAL_OVERHEAD_CONFIRMED`, −152.0 ms /
  −149.6 ms). The probe-internal mechanism is CPU_HEAVY with
  kernel-vs-user unresolved.
- **Correctives:** none earned anywhere (#40: NO_BOUNDED_CORRECTIVE_EARNED;
  AUDIT-1: ENVIRONMENT_BOUND, no C7; every Windows audit: no production
  fix authorized). #29/#31 remain blocked and untouched.
- **Gates:** GATE-A2's FAIL verdict and all historical evidence stand
  unchanged. No new gate is opened. Product Phase B remains blocked.
- **This record:** documentation only. It adds no measured claim, rewrites
  no historical report, merges no audit branch, and submits nothing
  upstream.

### 22.1 Current project disposition (added 2026-09-14)

The startup-performance investigation is **closed for now**
(`MEASUREMENT_SUFFICIENT_FOR_CURRENT_PRODUCT_BUILD`). The campaign has
produced enough evidence to guide product development:

- Windows startup structure is understood to the stage/mechanism level
  needed for current engineering decisions;
- the non-selected DX12 adapter probe is causally confirmed as ~150 ms
  startup overhead on the measured host;
- its generality and the origin of the second DXGI entry remain open;
- no production workaround is authorized from the current single-host data.

No further PicoView performance experiments are scheduled. The project now
returns to product implementation using PocketJS as the Windows UI/view
foundation. Performance work should resume only after a meaningful viewer
exists and real user-visible paths can be measured — for example
open→first pixels, next-image latency, directory browse, zoom/pan frame
pacing, large-image handling, cold/warm open, memory behavior — as a NEW
campaign based on the real product path (e.g.
`PICOVIEW-REAL-WORKLOAD-PERFORMANCE-1`), not as an extension of this
historical startup campaign. This disposition does NOT claim that
performance is solved or that the current architecture is proven optimal.

A second-host (Intel) adapter-validation matrix (DX12 None / LowPower /
HighPerformance, Vulkan, current-wgpu min-repro) was considered during the
campaign and is recorded here only as a possible future validation idea;
it is NOT scheduled work and no issue tracks it.

STOP. Do not implement production optimizations. Do not submit upstream
issues. Do not modify historical reports.

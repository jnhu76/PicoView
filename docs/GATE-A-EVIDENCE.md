# GATE-A Evidence Report

Ticket: [#11 — Architecture admission gate](https://github.com/jnhu76/PicoView/issues/11)

Status: **normative evaluation** over Architecture A0–A7 evidence, per the
PRD (v0.5) and `docs/BENCHMARK.md` §12 (a gate report states exactly one:
PASS / FAIL / PASS-WITH-CORRECTIVE per defining metric; thresholds,
sample definitions, and hosts are never adjusted inside the report).

# Overall verdict

**GATE-A: FAIL — Product Phase B remains blocked.**

The architecture mechanisms are all proven (see Mechanism verdicts): the
Windows stock target, the native image-resource seam, the WIC first-image
path, generation cancellation, and Per-Monitor DPI V2 behavior work end to
end with bounded guest/host messages and no second runtime. However, the
**measured physical budgets for startup, settled baseline memory, 24 MP
viewing memory, idle CPU, and direct-manipulation P95 are not met** by the
only build admitted for measurement (the Phase-A architecture harness on
the 28.9 GiB iGPU architecture host). Per BENCHMARK §12 these are recorded
as FAIL with their physical mechanisms, the PRD numbers are unchanged, and
five bounded correctives are opened as the new frontier. Product Phase B
tickets (#5, #6, #8, #10, #16, #17, #18) stay `blocked`.

# Identity

| Item | Value |
| --- | --- |
| PicoView gate commit | `ee116a2` on main (A7 merge `8628d62`; gate branch `docs/gate-a-evidence`) |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| PocketJS effective patch chain (local branches, Mimosa audit pending before any upstream push) | A1 `62ee522f` → A2 `fe32ea82` → A3 `fa936129` → A4 `7979c1d8` → A5 `a832dc8e` → A6 `09842209`+`af383e04` (test label) → A7 `a4806320`+`6efb25b7` (clock join) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)`, `stable-x86_64-pc-windows-msvc`; release, `debug=false` |
| Host | Native Windows 11 (10.0.26200); AMD Ryzen 7 5800H, 16 LP; **28.9 GiB RAM (not 16 GiB reference class)**; iGPU AMD Radeon (driver 31.0.21923.11000); 60 Hz; KIOXIA EXCERIA NVMe; Balanced |
| Evidence set | `docs/ARCH-A1-EVIDENCE.md` … `docs/ARCH-A7-EVIDENCE.md` (committed); scratch runs under `evidence/tmp/` |

# Mechanism verdicts (architecture suitability)

| # | Gate question | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | `windows-app` is a real tested stock target through the existing desktop architecture | **PASS** | ARCH-A1: windows-app target proven; runtime-generic extension only |
| 2 | Large native-owned image composes without O(image-bytes) QuickJS transport | **PASS** | ARCH-A2: 4K native resource; largest svc line 7,373 B vs 48 MB plane; A5 storm: 30,650 B total vs 12.58 MB plane |
| 3 | First JPEG/WIC path end-to-end; source-handle lifetime bounded | **PASS** | ARCH-A3: file→WIC→seam→present; handle closed at read completion; retire-on-replace synchronous |
| 4 | 12/24/50 MP evidence: native scaling, latency, memory | **PASS** (characterization complete) | ARCH-A4: source-transform queried (2000×1500 / 3000×2000 / 2172×1448), fit total P50 25.1/45.1/43.4 ms, memory = kept plane |
| 5 | Rapid-request cancellation; no stale publication/retention | **PASS** | ARCH-A5: 120 requests → 24 decodes + 96 cancels, newest-only publish; work-in-flight = 1 structurally |
| 6 | Per-Monitor DPI V2 on the minimal viewer path | **PASS-WITH-CORRECTIVE** | ARCH-A6: PMv2 verified (awareness API), 100→200→100% logical-invariant transitions, anchor byte-identical; corrective: OS WM_DPICHANGED leg needs a two-monitor host (single display here) |
| 7 | No hidden second runtime/service/updater/telemetry/startup network | **PASS** | ARCH-A7 inventory: statically linked Rust only; net.rs dormant; 0 owned connections |

# Per-budget verdicts (defining PRD physical budgets)

| Budget (PRD) | Measured (ARCH-A7/A4) | Verdict | Mechanism / corrective |
| --- | --- | --- | --- |
| Process start → usable window ≤150 ms P50 (>300 P95 fails) | 837 / 904 ms | **FAIL** | wgpu adapter/device init + Naga shader compilation = 589–621 ms (69–72% of startup). Corrective C1 |
| Cold activation → first useful image ≤300 ms P50 (>500 P95 fails) | 857 / 924 ms | **FAIL** | same mechanism (T2≈T6; marker bias ≤1 tick disclosed in A7) |
| Warm request → first useful image ≤120 ms P50 (>250 P95 fails) | 25.1–45.1 ms fit total; request→present 66/77 ms (12 MP) | **PASS** | within budget once the pipeline is live |
| No-large-image settled baseline ≤40 MiB WS-Private (>64 FAIL) | 226.1 MiB | **FAIL** | full substrate residency (QuickJS arena, wgpu + driver surfaces, text engine, all proof harnesses) in the architecture host build. Corrective C2 |
| Ordinary 24 MP Fit viewing ≤128 MiB | 254.7 MiB settled | **FAIL** | baseline dominance (above) + 24 MP fit plane (~23 MiB); not image-resource pathology. Corrective C2 |
| Rapid-request transient ≤384 MiB | 250.6 MiB peak (A5 stress) | **PASS** | coalescing keeps work-in-flight = 1; cost ≈ one plane |
| Five-process aggregate | 1.55 GiB WS-Private / 3.22 GiB Private Bytes (5 × identical state) | **FAIL** (derivative of the baseline FAIL) | per-process dominance as above. Corrective C2 |
| Idle CPU ≤0.2% normalized | 0.50% | **FAIL** | fixed 60 Hz worker deadline wake incl. guest JS frame callback; no event-driven idle suspend. Corrective C3 |
| Static idle: no PicoView-owned continuous render loop | 0 present submissions in the 30 s window; presents cease after settle in A5/A6 runs | **PASS** | render only on draw-list hash change |
| Direct manipulation ≤20 ms P95 input→present (where measurable) | sparse-cadence P50 21.23 ms / P95 41.34 ms; floor 19.77 ms | **FAIL** | present cadence/quantization dominates (app work ≤0.31 ms/input); budget handed to GATE-A by A4 unbeaten. Corrective C4 |
| No repeated application-caused >33 ms stalls | 0 application-caused (5 pacing gaps in 47 inputs; no back-to-back) | **PASS** | work-trace attribution |
| Downloadable payload ≤15 MiB; installed private footprint ≤25 MiB | 12.16 MiB (exe+js+pak; .pdb excluded) | **PASS** (prototype accounting) | installer layer is Phase B |
| RAM reference class (16 GiB) | 28.9 GiB iGPU host | **FAIL (evidence scope)** | all RAM-sensitive rows are architecture-host evidence; reference-class rerun required. Corrective C5 |

# Correctives opened (bounded, tracked — the new frontier)

| # | Corrective | Physical mechanism | Budget it serves |
| --- | --- | --- | --- |
| C1 | Startup init reduction: shader cache / adapter probing trim / presentation path init | 589–621 ms wgpu init at every cold start | start→window ≤150; cold→image ≤300 |
| C2 | Minimal product host build & footprint audit: strip proof harnesses, lean QuickJS/runtime config, driver-surface accounting | 226 MiB substrate residency | baseline ≤40/64; 24 MP ≤128; five-process |
| C3 | Event-driven idle suspend for the runtime worker | 60 Hz deadline wake incl. guest JS tick | idle ≤0.2% |
| C4 | Present-scheduling measurement refinement & pacing fix for input→present | ~16.7 ms quantization; 2–3 frame backlog spikes | ≤20 ms P95 (metric unchanged) |
| C5 | 16 GiB reference-class rerun (or owner-approved equivalence) | host-class delta | all RAM-sensitive rows |

These issues are created from this gate and labeled `ready-for-agent`;
they are Phase-A/infrastructure correctives, not Product Phase B work.
Product Phase B tickets stay `blocked` until the gate passes on re-run.

# Acceptance criteria map (issue #11)

| Criterion | Status |
| --- | --- |
| Baseline/effective SHAs + PicoView SHA recorded | DONE (Identity) |
| windows-app real tested stock target | PASS (A1) |
| Large native image composes, no O(bytes) QuickJS transport | PASS (A2) |
| First JPEG/WIC end-to-end, bounded source lifetime | PASS (A3) |
| 12/24/50 MP scaling/latency/memory characterization | PASS (A4) |
| Rapid-request cancellation, no stale publication/retention | PASS (A5) |
| PMv2 proof on minimal viewer path | PASS-WITH-CORRECTIVE (A6) |
| Startup/payload/baseline memory/idle/five-process per benchmark contract | DONE — measured; budget verdicts above |
| No hidden second runtime/service/telemetry/startup network | PASS (A7 inventory) |
| Each defining budget PASS/FAIL/PASS-WITH-CORRECTIVE with evidence | DONE (table above) |
| FAIL keeps Phase B blocked + bounded corrective; PRD not weakened | DONE — this report + corrective issues |
| PASS authorizes Phase B | NOT GRANTED — overall verdict is FAIL |

# Gate decision

The gate is recorded as **FAIL**: the substrate is architecture-suitable,
but no evidence exists that the defining startup, memory, or idle budgets
are reachable on the admitted build, and the measurement host is not the
reference class. Product Phase B remains blocked. Re-admission requires
the five correctives above (or the owner's explicit equivalence decisions)
and a gate re-run — a subsequent GATE evaluation ticket, not an in-place
revision of this report.

Per the campaign's brake rule this is a truthful blocked result with
executable evidence: the architecture experiments succeeded; the physical
economics are not yet demonstrated.

## Evidence identity note

This report cites only committed evidence documents and the quoted raw log
lines preserved in them. Scratch runs live in `evidence/tmp/`. If this
report and the tracker disagree, the tracker wins.

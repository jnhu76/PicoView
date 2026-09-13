# Corrective C1 — Startup Initialization Overlap (Evidence)

Campaign: PICOVIEW-GATE-A-READMISSION-CORRECTIVE-CAMPAIGN-2
Ticket: PICOVIEW-ARCH-C1-STARTUP-INIT (#25)
Date: 2026-09-13
Verdict: **implemented (earned)** — startup FAIL gap reduced ~17 % P50 on the
decision-grade paired comparison; a quantified +9.6 MiB settled-residency
trade is accepted and referred to GATE-A2 together with the still-failing
startup budgets.

## 0. Identity

| Item | Value |
| --- | --- |
| PicoView base | `main` @ `b119da6` (C2 merge), branch `corrective/c1-startup-init` |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| PocketJS chain end before C1 | `8e9e09f9` (`picoview-c2-minimal-host`, merged) |
| PocketJS C1 commits | `23f634cd` (measured change) + `d1ae693e` (review fix: gates the one-shot `A6EVENT,dpi-awareness` line behind `--announce-ready`; one stderr line, no measured path touched) on `picoview-c1-startup-init` (local; upstream push pending fresh-context audit) |
| Toolchain | `rustc 1.98.1` `stable-x86_64-pc-windows-msvc` (unchanged through the campaign) |
| Host | AMD Ryzen 7 5800H (16 logical processors), 28.9 GiB RAM (NOT the 16 GiB reference class — C5 owns that rerun), AMD Radeon(TM) integrated GPU, driver 31.0.21923.11000, Windows 11 Pro build 26200, power plan Balanced |
| Samples | `picoview-12mp.jpg` (12,000,000 px, 1,231,842 B) for image-mode startup; 12/24/50 MP + `corrupt`/`fake`/`orient6` fixtures for behavior; local SATA/NVMe SSD (KIOXIA EXCERIA NVMe / QUANXING SATA SSD) |
| Classification | RUNTIME_GENERIC (PocketJS desktop-host startup order) + host measurement plumbing; no PicoView product policy change |

## 1. Root-cause freeze (why GATE-A startup failed, and what was fixable)

Provenance note: the finer GPU phase lines (`gpu_instance` /
`gpu_adapter_device` / `gpu_surface_configured`) were **added by C1**; no
C2-era serial run could print them. Serial-path GPU attribution therefore
rests on the C1 backend-A/B runs (n=1 per backend, attribution only — no
gate closes on them), and guest-boot attribution on the preserved C2-era
5-run phase set.

| Term | Value | Source |
| --- | ---: | --- |
| wgpu instance (Vulkan ICD load + enumeration), **serial**, cold-ish | 187 ms | `phases-VULKAN.log` (C1 A/B run, n=1); `runtime_thread_spawning` fires at 230 ms, after `gpu_ready` — serial order proven |
| DX12 adapter/device penalty vs Vulkan | +514 ms | `phases-DX12.log` vs `phases-VULKAN.log` (n=1 each) |
| `DEFAULT` backend-sweep penalty vs Vulkan | +577 ms | `phases-DEFAULT.log` (n=1) |
| wgpu instance, **warm driver cache** | ≈ 87–89 ms | C1 build `phases-final-*.err`: instance thread starts at process entry, main thread receives at `gpu_instance` 85–104 ms (5-run median 89) — an upper bound on warm instance init |
| guest boot (assets→surface→supervisor→QuickJS→eval), C2-era serial | ~33 ms | preserved C2-era `startup-v2-*.stderr.log` 5-run phase deltas |
| window creation (`event_loop_built` → `runtime_thread_spawning`) | ~62 ms | C1 build `phases-final-*.err` (63–77 ms, median 69) |

Shader/pipeline compilation measured ~5 ms — there is nothing to earn from an
app-owned pipeline cache; the only large cache term is the OS/driver ICD
cache, which BENCHMARK §6 counts as normal measurement conditions (no
PicoView-owned cache is introduced by this corrective).

**Mechanism conclusion:** the largest single startup term — ICD/instance
initialization — depends on nothing else during the startup window, yet the
C2-era host ran it serially before window creation and guest boot. That is a
scheduling defect, not a budget conflict: `STARTUP_ARCHITECTURE_CONFLICT` does
not apply.

## 2. Change (minimal, earned)

PocketJS `23f634cd` (`hosts/desktop` only; diff +102/−29 lines):

1. `pocket-gpu-instance` side thread creates the wgpu instance from process
   entry; `Presentation::new(window, instance)` consumes it. The main thread
   still builds surface/adapter/device itself.
2. `pocket-runtime` spawns **before** the GPU path completes: guest boot
   (QuickJS + bundle eval) overlaps GPU initialization; only the renderer
   build blocks on the finished device handle.
3. Failure determinism preserved: instance-thread spawn error aborts at
   `main`; a dropped `gpu_tx` releases the blocked runtime thread with a
   typed error.
4. Finer attribution (`gpu_adapter_device`, `gpu_surface_configured` phase
   lines) and the `gpu_policy()` factor-out.
5. `POCKET_GPU_BACKEND` env knob (C2 §6 directive: measure backend
   candidates on ONE binary). **Classification per review:** this is read on
   the product path unconditionally (not flag-gated plumbing). Default
   behavior is unchanged (VULKAN + `MemoryHints::MemoryUsage`); any
   GATE-A2/C5/C6 measurement run must assert the variable is unset.
6. Follow-up `d1ae693e` (review): the one-shot `A6EVENT,dpi-awareness`
   stderr line is now gated behind `--announce-ready` (C2's assigned
   follow-through; verified 0 lines flag-off / 1 line flag-on).

**Rejected experiment (documented, not merged):** letting guest ticks run
before the renderer existed ("tick-early") bought ~14 ms P50 (349/345 vs
363) for a destabilized P95 tail (695/2206 ms outliers — three-way startup
contention) and Option-wrapping of the renderer. Not earned; ticks stay
renderer-gated.

## 3. Normative measurement — startup

Probe: 55 cold process spawns per run (`bench-startup.ps1`, QPC Stopwatch,
≤ ~15 ms file-poll detection, inside the validated ±60 ms probe tolerance),
windows spawned via `Start-Process -WindowStyle Minimized` (not hidden; the
same window state on both sides of every pair — C2 withdrew minimized-window
data only for the five-process **memory** leg; window-state sensitivity is a
GATE-A2 protocol item), percentiles by nearest-rank (script convention,
consistent with BENCHMARK §4), 55 ≥ 50 required runs, 0 discarded.

**Marker semantics (read before using any number):** in image mode the host
prints READY and IMGREADY from the same first successful present, so
T0_READY == T0_IMGREADY by protocol (the 12 MP decode gates the first
present; the probe's previous matcher also matched READY as a substring of
IMGREADY — the scratch script has been corrected to test IMGREADY first, and
GATE-A2 must re-validate the probe before reuse). IMGREADY is the **T6
present-submitted first-useful-image proxy**, not display photon latency
(BENCHMARK §5). Image-mode T0_READY must not be read as a window-usable
time; the window-mode probe below provides the image-free path.

**Image mode (T0 → IMGREADY, ms; session labels = output-file times):**

| Binary | P50 | P95 | Max (outliers) | File |
| --- | ---: | ---: | ---: | --- |
| **C1 (`23f634cd`)** | **293** | **339** | 2067 (1 run; +476) | `c1-startup-official.csv` 11:21 |
| C2base (`8e9e09f9` build) | 354 | 496 | 587 | `c2base-startup-official.csv` 11:22 |
| C1, earlier probe | 363 | 440 | 592 | `c1-startup-v2.csv` 10:49 |
| C1, earlier probe | 331 | 544 | 993 (544/670/993 tail; P90 350) | `c1-startup-final.csv` 11:00 |
| C2base, earlier session | 456 | 548 | 653 | `c1-startup.csv` 10:42 |
| GATE-A recorded baseline | 857 | 924 | 956 | `a7-startup.csv` (A7 era) |

Decision-grade paired deltas (back-to-back in one session, C1 first):
**image mode P50 −61 ms (−17 %), P95 −157 ms;** window mode below. Every
final-config probe improved on its own session's baseline; no probe regressed.
The −27 % (−125 ms) mid-session figure is cross-session and **not
decision-grade** (§5). Absolute tails are session-jittery in both
directions: the official C1 session contains a 2067 ms outlier C2base did
not show — P95 (the BENCHMARK statistic) still improved 496 → 339, and the
gate reading below does not rest on the tail.

**Window mode (image-free init path; T0-anchored T0→READY including the
~16–17 ms spawn term — not the BENCHMARK T2−T1 formula; used only
directionally on the FAIL side), paired 55-run:**
C2base 323/363 → **C1 247/287 (P50 −76 ms, P95 −76 ms)**
(`c2base-window-official.csv` / `c1-window-official.csv`, 11:36/11:50).

Phase attribution on the final build (5-run medians): window created 69 ms,
guest boot done 96 ms, `gpu_instance` received 89 ms, `gpu_ready` 121 ms,
renderer ready 123 ms — guest boot (96 ms) completes **before** the GPU path
(121 ms) in all 5 runs, demonstrating the overlap.

**Gate reading (unchanged thresholds):** ≤150 ms interactive remains FAIL;
≤300 ms full-image: P50 293 is inside the budget in this session, but P95
339 and the ±70 ms cross-session spread exceed it — **startup remains FAIL
until GATE-A2 re-measures on the integrated architecture**. C1 reduces the
gap; it does not close the gate.

## 4. Memory trade (quantified, bounded)

Staged runs (`POCKET_MEM_STAGE=1`, `settled_quit` stage, same session,
identical argv `--app picoview-a6 --quit-after 40`, binaries
`pocketjs/hosts/desktop/target/release/` vs `pocketjs-c2base/.../release/`,
both plain `--release` builds of `23f634cd`-content and `8e9e09f9`
respectively; both resolve the same `POCKETJS_DIST` assets):

- **No-image pair — interleaved A/B/A/B/A/B** (`ab-{1,2,3}-{C2B,C1}.log`):

| Metric | C2base | C1 | Δ |
| --- | ---: | ---: | ---: |
| Settled WS-Private | 39.3 MiB (41.23–41.28 MB) | **48.9 MiB** (51.31–51.33 MB) | **+9.6 MiB** |
| Settled Private Bytes | 70.1 MiB | 79.8 MiB | +9.7 MiB |

- **12 MP-image pair — block-sequential same-session** (`stage-c2base-1..3`
  then `stage-final-rep1..3`; not interleaved — protocol noted):

| Metric | C2base | C1 | Δ |
| --- | ---: | ---: | ---: |
| Settled WS-Private | 73.5 MiB | 83.0 MiB (86,982,656 B) | +9.5 MiB |
| Settled Private Bytes | 116.6 MiB | 126.4 MiB | +9.8 MiB |

**Isolation control:** a throwaway build (uncommitted one-line reorder of
the `23f634cd` content — guest boot serialized after the GPU handoff,
instance side thread kept; binary overwritten by subsequent builds, logs
preserved as `serialboot-1..3.log`) measured 51.0–51.2 MB WS-Private —
identical to concurrent C1. This **excludes boot concurrency** as the
source. It does not separate "instance created on a side thread" from
"instance created before the window exists"; the driver-per-thread-state
explanation (Vulkan driver state for the instance-creating thread, which
persists after that thread exits) is the best available explanation, not a
proven isolation.

**Gate accounting:** the settled no-image axis stays inside the 40–64 MiB
band on today's basis (48.9 MiB); no budget line flips. On the C2-evidence
session basis the same pair would read 49.1 → 58.7 MiB — still under the 64
MiB FAIL line but with visibly less headroom. The accepted trade is:
−61 ms startup P50 (decision-grade) for +9.6 MiB settled residency.
GATE-A2 adjudicates both budgets on the integrated build.

## 5. Measurement-integrity finding (applies to GATE-A2)

The **same C2base binary content** measured **9.5–9.6 MB lower** at every
GPU stage today than in the C2 campaign session (`gpu_instance` 24.8 →
15.2 MB; `first_present` 50.4 → 40.9 MB; `stage-vkonly.log` vs
`stage-c2base-noimg*.log`). Driver/ICD cache-warmth and OS memory state move
absolute residency and startup numbers by ~±10 MiB / ±70 ms between
sessions. Consequently:

- only same-session interleaved pairs are decision-grade;
- C2-evidence absolute numbers and today's absolutes must not be mixed in
  one column (§4's dual-basis reading exists for exactly this reason);
- **GATE-A2 must measure all budgets in one tightly scheduled session,
  assert `POCKET_GPU_BACKEND` is unset, and record driver-cache/window
  state; cross-session comparisons are void.**

## 6. Behavior verification (C1 build, harness binary `--features bench-harness`)

| Check | Result |
| --- | --- |
| Manifest walk (12 MP, corrupt, 24 MP, fake, orient6) | exit 0; `A3BOUNDARY successes=3, failures=2, cancels=0, decodes=5` — 3 binds, bounded errors, unchanged semantics |
| A5 rapid-switch stress (12/24/50 MP, `--key s@200`, quit 1200) | exit 0; `successes=27, failures=96, cancels=96, decodes=27, txBytes=7864, rxBytes=22786` — identical to the **GATE-A-era** `a5-stress.log` record. C2's own rerun recorded 25 successes/25 decodes (`harness-stress.stderr.log`), so the counters are arrival-timing sensitive across sessions: this check verifies bounded, correct coalescing/cancellation behavior, **not** byte-level invariance |
| A6 scale smoke (`--scale-at 1.5@120 --scale-at 2.0@240`) | exit 0; PMv2 awareness true (line now flag-gated, `d1ae693e`); logical 720×480 invariant; physical 1080×720 at scale 1.5 |
| `cargo test --release` | 15 passed, 0 failed, 1 ignored |
| `cargo build --release` (product, no features) | clean |

## 7. Fresh-install vs warm-cache statement

C1 introduces **no** PicoView-owned or app-owned startup cache. The cold
serial `gpu_instance` figure (~187 ms, n=1) versus the warm ≈87–89 ms
receipt time is the AMD Vulkan driver's own ICD/shader cache under normal OS
conditions (BENCHMARK §6). First-run behavior after reboot/driver updates
will land near the cold end; the corrective's overlap hides the warm term
entirely and the cold term partially (it overlaps window creation + guest
boot in both states).

## 8. Next unblocked issue

The GATE-A re-admission frontier remains #25–#29/#31 (all open,
`ready-for-agent`); execution is serialized by the campaign mission order,
not by label transitions. With C1 done, **C3/#27 (event-driven idle
suspend)** is next in that order. Startup and memory readings above are
referred to GATE-A2; no budget was weakened to obtain any number in this
report.

## 9. Review trail

Two fresh-context adversarial reviews were run before the PR (architecture/
scope; benchmark/evidence). Corrections applied from their findings:
§1 provenance rewritten (C1-added phase lines no longer presented as C2-era
data; serial values sourced n=1 with explicit files); "byte-identical A5/C2"
replaced with the GATE-A-era/C2-discrepancy wording; §5 drift direction
fixed; headline reduced to the decision-grade −17 %; `POCKET_GPU_BACKEND`
reclassified as an unconditional product-path knob with an unset assertion
requirement; the C2-assigned A6EVENT flag-gating completed (`d1ae693e`);
image-pair protocol corrected to block-sequential; Private Bytes added to
the image row; rounding and session-label fixes; outlier and window-state
disclosure added; probe matcher defect fixed in the scratch script and
carried as a GATE-A2 protocol requirement; tracker-claim wording aligned
with the actual tracker.

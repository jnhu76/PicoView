# Corrective C1 — Startup Initialization Overlap (Evidence)

Campaign: PICOVIEW-GATE-A-READMISSION-CORRECTIVE-CAMPAIGN-2
Ticket: PICOVIEW-ARCH-C1-STARTUP-INIT (#25)
Date: 2026-09-13
Verdict: **implemented (earned)** — startup FAIL gap reduced ~17–27 % (P50); a
quantified +9.6 MiB settled-residency trade is accepted and referred to
GATE-A2 together with the still-failing startup budgets.

## 0. Identity

| Item | Value |
| --- | --- |
| PicoView base | `main` @ `b119da6` (C2 merge), branch `corrective/c1-startup-init` |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| PocketJS chain end before C1 | `8e9e09f9` (`picoview-c2-minimal-host`, merged) |
| PocketJS C1 commit | `23f634cd` on `picoview-c1-startup-init` (local; upstream push pending fresh-context audit) |
| Toolchain | `rustc 1.98.1` `stable-x86_64-pc-windows-msvc` (unchanged through the campaign) |
| Host | AMD Ryzen 7 5800H, 28.9 GiB RAM (NOT the 16 GiB reference class — C5 owns that rerun), AMD Radeon(TM) integrated GPU, driver 31.0.21923.11000, Windows 11 build 26200, power plan Balanced |
| Samples | `picoview-12mp.jpg` (12,000,000 px, 1,231,842 B) for image-mode startup; 12/24/50 MP + `corrupt`/`fake`/`orient6` fixtures for behavior |
| Classification | RUNTIME_GENERIC (PocketJS desktop-host startup order) + host measurement plumbing; no PicoView product policy change |

## 1. Root-cause freeze (why GATE-A startup failed, and what was fixable)

GATE-A recorded startup FAIL. The A7 phase decomposition on the C2-era build
(serial initialization; `A7EVENT,phase,*` lines, monotonic clock anchored at
process entry, 5-run medians) attributes the pre-present path:

| Phase (C2-era serial) | Median |
| --- | ---: |
| `event_loop_built` | 7 ms |
| `gpu_instance` (wgpu instance = Vulkan ICD load + adapter enumeration) | ~187 ms cold / ~87 ms warm driver cache |
| `gpu_adapter_device` | +19–27 ms |
| `gpu_surface_configured` + `gpu_ready` | +12–13 ms |
| guest boot (assets → UI surface → supervisor → QuickJS → eval) | ~27 ms |
| first present (T2 proxy) | after all of the above, serially |

Backend A/B on the same binary (`POCKET_GPU_BACKEND` knob, serial path):
Vulkan instance 187 ms; **DX12 adapter/device +614 ms** over Vulkan;
`DEFAULT` (Vulkan+DX12+GL enumeration sweep) +577 ms. Re-confirms C2's
explicit-backend decision; no backend change is earned.

Shader/pipeline compilation measured ~5 ms — there is nothing to earn from an
app-owned pipeline cache; the only large cache term is the OS/driver ICD cache,
which BENCHMARK §6 counts as normal measurement conditions (no PicoView-owned
cache is introduced by this corrective).

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
   lines) and the `gpu_policy()` factor-out with the `POCKET_GPU_BACKEND`
   measurement knob. All measurement plumbing stays behind
   `--announce-ready` / `POCKET_MEM_STAGE`.

**Rejected experiment (documented, not merged):** letting guest ticks run
before the renderer existed ("tick-early") bought ~14 ms P50 (349/345 vs
363) for a destabilized P95 tail (695/2206 ms outliers — three-way startup
contention) and Option-wrapping of the renderer. Not earned; ticks stay
renderer-gated.

## 3. Normative measurement — startup (same-session paired probes)

Probe: 55 cold spawns per run (`bench-startup.ps1`, QPC Stopwatch, ≤ ~15 ms
file-poll detection, inside the validated ±60 ms probe tolerance), visible
windows, back-to-back C2base/C1 executions in one session.

**Image mode (T0 → IMGREADY, ms):**

| Binary | P50 | P95 | Session |
| --- | ---: | ---: | --- |
| C2base (`8e9e09f9` build) | 354 | 496 | 13:5x (paired) |
| **C1 (`23f634cd` build)** | **293** | **339** | 13:5x (paired) |
| C2base, earlier session | 456 | 548 | 10:42 |
| C1, earlier probe | 363 | 440 | 10:49 |
| C1, earlier probe | 331 | 544 (3 outlier runs 544/670/993; P90 350) | 11:00 |
| GATE-A recorded baseline | 857 | 924 | A7 era |

Paired same-session deltas: **P50 −61 ms (−17 %), P95 −157 ms**. Across all
final-config probes C1 P50 spans 293–363 ms vs paired-baseline 354–456 ms;
the mid-session value (−125 ms, −27 %) is within the observed spread. No
final-config probe regressed against its session baseline.

**Window mode (no decode; isolates the init path), paired 55-run:**
C2base 323/363 → **C1 247/287 (P50 −76 ms, P95 −76 ms)**. (A7-era window
baseline was 770/… — the C2 memory fix, not C1, removed that bulk.)

Phase attribution on the final build (5-run medians): window created 69 ms,
guest boot done 96 ms, `gpu_instance` received 89 ms, `gpu_ready` 121 ms,
renderer ready 123 ms — guest boot (96 ms) completes **before** the GPU path
(121 ms), demonstrating the overlap; the critical path shortens by roughly
the window-creation + guest-boot terms.

**Gate reading (unchanged thresholds):** ≤150 ms interactive remains FAIL;
≤300 ms full-image: P50 293 is inside the budget in this session, but P95
339 and the ±70 ms cross-session spread exceed it — **startup remains FAIL
until GATE-A2 re-measures on the integrated architecture**. C1 reduces the
gap; it does not close the gate.

## 4. Memory trade (quantified, mechanism-isolated)

Paired interleaved staged runs (`POCKET_MEM_STAGE=1`, A/B/A/B/A/B,
`settled_quit` stage, same session, identical command lines):

| Workload | C2base | C1 | Δ |
| --- | ---: | ---: | ---: |
| Settled, no image (WS-Private) | 39.3 MiB (3×: 41.23–41.29 MB) | **48.9 MiB** (3×: 51.31–51.33 MB) | **+9.6 MiB** |
| Settled, no image (Private Bytes) | 70.1 MiB | 79.8 MiB | +9.7 MiB |
| Settled, 12 MP image (WS-Private) | 73.5 MiB | 83.0 MiB | +9.5 MiB |

**Isolation control:** a temporary build that kept the instance side thread
but serialized guest boot after the GPU path measured 51.0–51.2 MB
WS-Private — identical to concurrent C1. The +9.6 MiB therefore comes from
**Vulkan driver per-thread state allocated for the instance-creating thread**
(persists after that thread exits), not from boot concurrency, which is free.

**Gate accounting:** the settled no-image axis stays inside the 40–64 MiB
band on today's basis (48.9 MiB); no budget line flips. On the C2-evidence
session basis the same pair would read 49.1 → 58.7 MiB — still under the 64
MiB FAIL line but with visibly less headroom. The acceptance trade is:
−61…−125 ms startup P50 for +9.6 MiB settled residency. GATE-A2 adjudicates
both budgets on the integrated build.

## 5. Measurement-integrity finding (applies to GATE-A2)

The **same C2base binary** measured 9.5–9.6 MB higher at every GPU stage
when re-measured today versus the C2 campaign session (`gpu_instance`
24.8 → 15.2 MB; `first_present` 50.4 → 40.9 MB). Driver/ICD cache-warmth and
OS memory state move absolute residency and startup numbers by ~±10 MiB /
±70 ms between sessions. Consequently:

- only same-session interleaved pairs are decision-grade;
- C2-evidence absolute numbers and today's absolutes must not be mixed in
  one column;
- **GATE-A2 must measure all budgets in one tightly scheduled session and
  record driver-cache state; cross-session comparisons are void.**

## 6. Behavior verification (C1 build, harness binary `--features bench-harness`)

| Check | Result |
| --- | --- |
| Manifest walk (12 MP, corrupt, 24 MP, fake, orient6) | exit 0; `A3BOUNDARY successes=3, failures=2, cancels=0, decodes=5` — 3 binds, bounded errors, unchanged semantics |
| A5 rapid-switch stress (12/24/50 MP, `--key s@200`, quit 1200) | exit 0; `successes=27, failures=96, cancels=96, decodes=27, txBytes=7864, rxBytes=22786` — **byte-identical** to the A5/C2 record |
| A6 scale smoke (`--scale-at 1.5@120 --scale-at 2.0@240`) | exit 0; PMv2 awareness true; logical 720×480 invariant; physical 1080×720 at scale 1.5 |
| `cargo test --release` | 15 passed, 0 failed, 1 ignored |
| `cargo build --release` (product, no features) | clean |

## 7. Fresh-install vs warm-cache statement

C1 introduces **no** PicoView-owned or app-owned startup cache. The measured
cold-vs-warm spread of `gpu_instance` (~87–187 ms) is the AMD Vulkan driver's
own ICD/shader cache under normal OS conditions (BENCHMARK §6). First-run
behavior after reboot/driver updates will land near the cold end; the
corrective's overlap hides the warm term entirely and the cold term
partially (it overlaps window creation + guest boot in both states).

## 8. Next unblocked issue

None — C1 completion leaves the campaign frontier at C3/#27 (idle suspend),
which becomes the single `ready-for-agent` ticket per the campaign order.
Startup and memory readings above are referred to GATE-A2; no budget was
weakened to obtain any number in this report.

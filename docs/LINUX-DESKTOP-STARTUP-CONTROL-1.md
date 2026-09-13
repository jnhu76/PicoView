# LINUX-DESKTOP-STARTUP-CONTROL-1

Independent cross-platform control experiment. Evidence only — no production
code changes, no PocketJS redesign, no optimization, no #40 modification, no
changes to historical GATE-A / GATE-A2 evidence.

Question answered: **is PicoView's Windows startup cost fundamentally a
PocketJS portable-desktop startup tax, or is a large fraction specific to the
Windows / Windows-GPU-backend execution path?**

Adversarial review: two fresh-context reviewers (cross-platform-architecture
adversary, startup-measurement adversary) re-derived the structural claims from
the code and recomputed every published statistic from the raw CSVs. No
BLOCKER findings; all MAJOR findings (session timestamps, Session C binary
identity, density-arm validity, Option-1 wording, contamination attribution)
are fixed in this revision.

---

## VERDICT

**WINDOWS_SPECIFIC_TAX**

Linux runs the same portable desktop architecture (same tree, same DAG, same
markers) and reaches the first usable PocketJS window at **T1→T2 P50 123–132 ms
(P95 141 ms)** vs the Windows candidate's **247–261 ms quiet** — on hardware
that is older and slower (2014 Xeon E5-2666 v3 + RX 580 2048SP). The QuickJS /
guest stage is the same magnitude class on both hosts; the dominant Windows
excess sits in Windows-execution-environment stages: window bring-up, the
post-renderer first-frame/present block, and a heavier gpu-instance stage.

Quiet Linux P95 (141 ms) is under the 150 ms class budget; the ≤150 ms
STABLE_FAIL recorded on Windows does not reproduce on this Linux control.

---

## LINUX HOST

- hostname: E5
- distribution: Fedora Linux 44 (KDE Plasma Desktop Edition)
- kernel: Linux 7.1.9-200.fc44.x86_64
- CPU: Intel Xeon E5-2666 v3 @ 2.90 GHz (Haswell-EP, 10 cores / 20 threads)
- logical CPUs: 20
- RAM: 62 GiB
- GPU: AMD Radeon RX 580 2048SP (Polaris 10, PCI 1002:6fdf, rev ef) — discrete
- driver: Mesa 26.1.7 — RADV (Vulkan) / radeonsi (GL)
- wgpu backend: **Vulkan**, adapter `AMD Radeon RX 580 2048SP (RADV POLARIS10)`,
  `force_fallback_adapter = false`, hardware DiscreteGpu selected (llvmpipe
  present in enumeration but never selected; verified in every retained sample:
  55/55 gate-batch stderr lines carry the RADV adapter log)
- display server: Wayland (native); X11 via XWayland measured as a separate arm
- desktop/compositor: KDE Plasma, kwin_wayland (user session)
- display: 2560×1440 (card1-HDMI-A-2)
- power state: AC, governor `schedutil`, no mem pressure (PSI 0.00)
- AV/security posture: standard Fedora; no third-party AV
- session note: the machine was sitting at the Plasma Login greeter; a real
  user session (uid 1000) was established via the standard plasmalogin
  autologin mechanism (`/etc/plasmalogin.conf.d/zz-pv-control-autologin.conf`,
  recorded and reverted after the experiment). No virtual display, no Xvfb,
  no llvmpipe anywhere in the measured arms.

## SOURCE

- PocketJS campaign base: `a5a85356e172db8a32aefa983ee1259f60406f69`
- PocketJS effective: `a46eb7e055ef443f5efecdac1cc447a3c1941805`
  (Windows campaign HEAD; 16-commit patch range over the campaign base)
- tree equivalence: **exact** — transferred by git bundle (complete history),
  clone verified `git rev-parse HEAD == a46eb7e0…`; manifest:
  [source-identity-manifest.md](linux-desktop-startup-control-1/source-identity-manifest.md)
- PicoView guest: canonical `guest/` from PicoView (content unchanged since
  C3 2342ae5; identical between C4 merge ab86b4d and HEAD)
- guest equivalence: **equivalent, truthfully resolved** — same guest source
  resolved by the official CLI for `linux-app`:
  `pocket.ts check → "linux-app satisfies pocket.json capabilities"`,
  plan target.id=linux-app hostAbi=4 rasterDensity=1
  (sha256:41938adf…). Not GUEST_NOT_IDENTICAL. The guest-side difference vs
  the Windows campaign PAK is the target profile only (raster density 1 vs 2;
  different plan hashes recorded both sides).
  - **Density control arm caveat (review finding):** the `--density 2` launch
    flag does not survive plan load — `plan.rs` overwrites the CLI density
    from the app plan (`A6EVENT,raster,density=1` in **all** density-2-arm
    samples), so those arms are stock-equivalent replicates, not a raster-size
    control. The raster-size factor is **not quantified** by this experiment;
    no claim is made about it. (It is not plausibly load-bearing for the
    verdict: the divergent stages — window path and first-frame/present — are
    not raster-bound, and adapter/device matches across hosts.)

## PORTABLE DESKTOP STRUCTURE

Inspected at a46eb7e0 (same tree as Windows campaign). The desktop host is ONE
portable implementation; on the measured startup path the cfg gates are:

| Component | Windows | Linux | same implementation? |
| --- | --- | --- | --- |
| winit event loop 0.30 | yes | yes | **same code** (no cfg) |
| window host / create_window | + `#[cfg(windows)]` PMv2 DPI pin + post-create check | — | same handler; Windows adds the PMv2 pin |
| QuickJS runtime / `Runtime::boot` / `run_runtime` | yes | yes | **same code** |
| UiSurface / Guest | yes | yes | **same code** |
| text/offload worker | yes | yes | **same code** |
| AppSupervisor / DrawList / UiRenderer | yes | yes | **same code** |
| wgpu renderer (pocket-ui-wgpu / pocket3d) | yes | yes | **same code** |
| surface creation / adapter / device / configure | yes | yes | **same code** |
| GPU backend policy (`Presentation::gpu_policy`) | pinned `Backends::VULKAN` + `MemoryHints::MemoryUsage`, `POCKET_GPU_BACKEND` knob | `Backends::default()` + `MemoryHints::default()` (default = Vulkan+GL on Linux) | **differs by cfg** — the only semantic OS gate on the startup path |
| HOST_ID | `windows-app` | `linux-app` | string constant per cfg |
| startup markers | `A7EVENT,phase,<name>,<proc_ms>` + `READY <epoch>` | identical | **same markers, same origin** (proc-entry monotonic) |

Other `target_os`/`cfg(windows)` sites exist in the tree but are off the
window-mode startup path (e.g. `a3.rs` WIC JPEG decoder returns
`DecoderUnavailable` on non-Windows — nothing decodes in window mode; macOS
open-command; memprobe labels). This experiment measured window mode only.

## LINUX T1→T2 (process-cold launches, spawn→READY wall, nearest-rank)

Warm-up: every batch's first runs are included. The absolute first-ever
execution (bundle smoke run, cold JIT/font caches) landed in the ~290 ms class
(smoke1: adapter_device 160 ms, renderer_ready 289 ms); retained pilot batches
thereafter spanned 126–146 ms, and each gate batch's own first sample sits on
its median (B: 128 vs 127). Session times below are decoded from the retained
`T0` epochs (CST), not from wall-clock memory.

| Session (real start) | Arm | n | P50 | P95 | min | max | IQR | machine load |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A 20:03:56 | full host, Wayland stock — **exploratory: tail contaminated by self-inflicted background load** (ambient-A at 20:03:54: load 3.77, %us 95, idle 0; most plausibly the parallel scratch-controls cargo build issued seconds earlier, though no retained log proves the exact overlap) | 55 | 132 | 279 | 107 | 324 | 104 | contaminated→settling |
| A 20:05:29 | full host, Wayland `--density 2` flag — **ineffective** (flag clobbered; stock-equivalent replicates; no dedicated ambient snapshot) | 25 | 124 | 140 | 110 | 142 | 9 | not recorded |
| B 20:10:35 | full host, Wayland stock — **gate batch, verified quiescent** (ambient-B 2 s before first spawn: load 0.05, vmstat idle 100) | 55 | **127** | **141** | 112 | 144 | 13 | idle |
| B 20:12:49 | full host, X11/XWayland — exploratory | 20 | 106 | 122 | 102 | 124 | 5 | idle |
| oracle 20:16–17 | instrumented scratch build (see ORACLE) | 5/6/6 | 133/184/160 | — | — | — | — | idle |
| C 20:19:48 | full host, Wayland stock — **gate batch**, post-oracle clean rebuild (see binary identity below) | 50 | **123** | **141** | 114 | 156 | 12 | idle (ambient-C: load 0.22, idle 100) |
| C 20:21:34 | full host, Wayland `--density 2` flag — ineffective (stock-equivalent replicates) | 25 | 125 | 137 | 117 | 144 | 10 | idle |

Gate-quality sessions: B-stock (n=55) and C-stock (n=50), mutually consistent
(P50 127/123). The two d2 arms (124/125), being stock-equivalent, serve as
two additional independent stock replicates.

### Binary identity per batch (review finding, explicit)

- Session B + X11 arm: original clean release build from a46eb7e0
  (built 19:52, `cargo-build.log` retained). Its sha256 was not recorded
  before the oracle build overwrote the output path — residual gap, disclosed.
- Oracle arms: instrumented scratch build (`pv-oracle-scratch` branch, 3
  `pv_oracle_delay` sites; `cargo-oracle-build.log` retained). Env-unset base
  arm proves the instrumentation is a no-op when off (133 ≈ gate P50s; no
  `A7EVENT,oracle` lines in base stderr).
- Session C: post-revert rebuild (source verified 0 injection sites at
  a46eb7e0; incremental rebuild log not retained). sha256
  `dc7dd1d5f6d3880e` recorded after Session C and re-verified unchanged after
  the experiment — this covers C's binary exactly.

## STAGE DECOMPOSITION

`A7EVENT,phase` medians (P50/P95), process-entry origin, Session B n=55
(independently re-aggregated by the measurement reviewer):

| Stage | P50 | P95 | critical? | notes |
| --- | ---: | ---: | --- | --- |
| main_entry | 0 | 0 | — | proc-ms origin |
| event_loop_built | 7 | 9 | yes | process bootstrap + winit loop |
| runtime_thread_spawning (= window created) | 11 | 13 | partially (~47%) | **window path ≈ 11 ms** |
| runtime_boot_done (runtime lane) | 47 | 51 | shadowed | QuickJS + bundle eval; ~72 ms slack under GPU lane |
| gpu_instance (off-thread lane, completes) | 70 | 82 | yes | Vulkan ICD + instance; fully overlapped with window path |
| gpu_adapter_device | 115 | 126 | yes | RADV adapter + device request |
| gpu_surface_configured / gpu_ready | 119 | 131 | yes | Wayland surface + Fifo, latency 1 |
| runtime_renderer_ready | 121 | 133 | yes | guest renderer built after device handle |
| **READY (T2, external spawn→present)** | **127** | **141** | — | renderer_ready→READY ≈ **+6 ms** |

## THREAD DAG

```
 MAIN/EVENT-LOOP      entry → loop(7) → window(11) ────────────────┐ (recv blocks)
                      └──── ~47% critical pre-window (oracle) ─────┤
 GPU-INIT (off-thread)entry ── instance(70) ── adapter/dev(115) ── surface/gpu_ready(119)
                                                                   │
 RUNTIME/QUICKJS       spawn(11) ── boot(47, slack) ───────────────┤ renderer_ready(121)
                                                                   ▼
                                                        first DrawList + present → READY(127)
 TEXT/OFFLOAD          spawn ~11 ── (warm, not on critical chain)
```

Overlap: the GPU instance lane hides the window path and most of guest boot;
the guest lane's 47 ms has ~72 ms slack behind the GPU chain. No double
counting. Slack sizes are not assumptions — both were measured by the oracle
interventions below.

## LINUX CONTROL A — WINIT ONLY

P50 **11** / P95 **12** (n=20, Wayland; READY_KIND=about_to_wait). A bufferless
Wayland window never receives a compositor frame callback, so a winit-only
Wayland control cannot produce a real presented frame; the honest winit-only
floor is therefore "window created + event loop alive". On X11/XWayland the
same binary reaches a real RedrawRequested at ~10 ms. Either way the
OS/window floor on this host is ~10–12 ms.

## LINUX CONTROL B — WINIT + WGPU

P50 **107** / P95 **112** (n=20). Serial: instance 69, adapter+device 37,
surface+configure 4, first clear+present ~1. Adapter: RADV POLARIS10, exit 0.

## LINUX CONTROL C — FULL POCKETJS

P50 **123–127** / P95 **141** (gate batches B/C).

## ESTIMATED LAYER SHAPE (Linux)

- OS/window: **~11 ms** (control A) — nearly free on Wayland
- wgpu (instance+adapter+device+surface+first present): **~107 ms** (control B)
- PocketJS runtime/guest net add over control B: **~16–20 ms**
  (guest boot 47 ms mostly shadowed; renderer build ~2–6 ms)
- first-frame/presentation beyond control B: **~+6 ms**

## WINDOWS COMPARISON

Windows authority: `docs/STARTUP-LAST-MILE-REALITY-AUDIT-1.md` (quiet P50 247
n=55 / 261 n=20, busy ~307, ≤150 STABLE_FAIL content-scoped) and its §5 stage
table. Not rerun in this session.

| Stage (proc-relative medians, ms) | Windows quiet/warm | Linux (Sess B) | interpretation |
| --- | ---: | ---: | --- |
| entry → event_loop_built | ~16 | 7 | same class |
| → window created (runtime_thread_spawning) | ~81–96 (warm 69) | **11** | **Windows-side +58–85** |
| → gpu_instance (side thread) | ~92–106 (warm 89) | 70 | Windows +19–36 |
| → runtime_boot_done (overlaps GPU) | ~113–131 (warm 96) | 47 | same class (guest slower on Windows CPU) |
| → gpu_adapter_device | ~115–133 | 115 | **same** |
| → gpu_surface_configured / gpu_ready | ~131–156 | 119 | Windows +12–37 |
| → runtime_renderer_ready | ~139–169 (warm 123) | 121 | same class |
| renderer_ready → READY (first frame submit/present) | ~+108–124 (window plateau 247 vs warm 123) | **+6** | **Windows-side +~100** |
| total T1→T2 | 247–261 | 123–127 | ≈2× |

(Windows post-renderer block is inferred from the audit's same-era window-mode
plateau vs warm renderer_ready median; the audit does not publish a dedicated
phase marker for it. Treat its exact size as ±20 ms.)

- Windows T1→T2: 247–261 ms quiet, ~307 ms busy (committed evidence)
- Linux T1→T2: 123–132 ms quiet, P95 141 ms

## ORACLE

Instrumented scratch build, env-gated sleeps; nominal 100 ms requested, actual
recorded sleeps were 109 ms (CRIT) and 115 ms (GUEST). Base arm n=5 (first
sample 149 is a fresh-rebuild warm-up), arms n=6.

- CRIT (main thread, immediately before window creation; recorded 109 ms):
  observed delta **+51 ms** (base 133 → 184). The site is ~47% critical on
  Linux (51/109): while the main thread sleeps, ~58 ms of GPU-instance-lane
  work still progresses. Injection verified in-band: window creation shifted
  11→111–114 ms and gpu_instance completion 70→111–114 ms in all 6 samples —
  the GPU lane ran ~60 ms during the sleep, then the remainder serialized.
  On Windows the same nominal injection was ~90% critical (+90 of 100) because
  the window path there is 80–96 ms.
- GUEST (runtime thread, before guest boot; recorded 115 ms): observed delta
  **+27 ms** (133 → 160). The main/GPU chain was unshifted (window 10–14,
  instance 66–80); runtime_boot_done shifted 47→145–160 and READY tracked the
  ~27 ms by which the delayed boot pokes past the GPU chain — the DAG's
  predicted absorption (47+100=147 vs gpu chain 119 → ≈+28).
- oracle verdict: **VALID** — both interventions moved T1→T2 by the amounts
  the independently measured DAG predicts; the timing pipeline and the
  critical-path interpretation are confirmed. `BENCHMARK_ORACLE_INVALID` not
  triggered.

## FIRST REAL FRAME REQUIRES FULL GPU DEVICE

**YES** — in the current host, the first real interactive frame requires:
adapter + device request + surface configure (`Presentation::new`) completing
before the guest renderer can be built (renderer build waits on the device
handle via `gpu_tx`), then first DrawList → submit → present. Only the wgpu
*Instance* is overlapped off-thread; device readiness is on the critical chain
on both OSes. (This is current reality, not a redesign proposal.)

## COMMON COSTS

- The structural startup DAG is identical on both OSes (same mandatory stages,
  same markers, same overlap structure).
- QuickJS/guest boot is the same magnitude class (~35 ms class on Windows CPU,
  47 ms on this older Linux CPU).
- gpu_adapter_device is nearly identical (~115 ms both) — RADV POLARIS10 on
  Linux, AMD Windows Vulkan on Windows; adapter+device request is a real
  portable-desktop cost.
- Control B shows the portable wgpu serial floor on Linux is ~107 ms —
  mostly *instance* (69) + *adapter/device* (37). This is the common GPU-side
  floor any wgpu-based host pays on this hardware class. (The claim that the
  Windows gpu-instance stage is heavier — +19–36 ms — rests on cross-machine
  comparison and should be weighted accordingly.)

## LINUX-SPECIFIC COSTS

- `Backends::default()` initializes Vulkan **and** GLES/EGL instances; the
  startup cost of the extra GL instance is negligible on this host (pilot
  with/without `WGPU_BACKEND=vulkan`: 146/132/126 vs 145/141/128 — n=3+3,
  thin evidence, but the difference is within batch noise), yet it produces a
  teardown SIGSEGV (`wgpu-hal gles egl Drop → Mesa eglTerminate →
  dri2_teardown_wayland → wl_map_insert_at`) on the Wayland path, strictly
  post-READY. READY is present in 100% of retained `.out` files, so T1→T2 is
  unaffected; the CSV exit-code column cannot by itself distinguish "40-tick
  self-exit then teardown crash" from an in-window crash — the retained
  per-sample phase sets show the full marker sequence through READY in every
  case. Recorded, not fixed. The X11/XWayland arm exits 0.
- kwin/Wayland first-present is nearly free (~1–6 ms).

## WINDOWS-SPECIFIC EVIDENCE

- Window bring-up path: **~80–96 ms vs ~11 ms** (PMv2 pin + Win32/DWM window
  bring-up vs winit-Wayland map).
- Post-renderer first-frame/present block: **~+100–120 ms vs ~+6 ms**
  (first-tick scheduling + render submit + present through the Windows
  compositor path vs kwin direct).
- gpu_instance: ~89–116 ms vs ~70 ms (same Vulkan-family backend, heavier
  Windows driver/ICD bring-up; cross-machine caveat applies).
- The ≤150 ms quiet budget is met on Linux (P95 141) and missed on Windows by
  ~100 ms (content-scoped STABLE_FAIL) — the deficit does not travel with the
  portable architecture.

## GPU-BACKEND EVIDENCE

- Both hosts run the Vulkan backend family on AMD hardware, and the mid-chain
  adapter+device stage costs the same (~115 ms). The divergence lives in
  window bring-up and present/compositor stages, not in Vulkan enumeration
  alone. Caution (review finding): adapter+device is CPU/enumeration-bound, so
  its equality does not by itself characterize the present path — where an
  iGPU (Windows host) and a dGPU (Linux host) would differ most. The verdict
  does not rest on that mechanism split.

## HARDWARE-COMPARISON LIMITATIONS

Different machines (Phase 16): Linux = 2014 Xeon E5-2666 v3 + discrete RX 580;
Windows measurement host = newer desktop CPU + iGPU (shared memory). The
direction of the conclusion is robust **because** Linux wins despite older
slower CPU and while paying the same adapter/device cost — but absolute stage
magnitudes are not transferable, and no frequency normalization was attempted.
Guest equivalence: same source, truthfully resolved for linux-app (capability
closure verified by the official CLI); the raster-density difference was NOT
quantified (the density flag is clobbered by the plan loader) and is disclosed
above. Session-A stock tail was contaminated by self-inflicted background
load and is labeled exploratory; gate conclusions rest on B/C. X11-arm note:
the wgpu instance-init still touches the default Wayland socket (GLES init
line), but 0/20 X11 samples show the Wayland-window GL re-init line vs 55/55
in the Wayland arm — the measured window surface was genuinely X11.

Harness residuals (measurement reviewer): T1/T2 both derive from
CLOCK_REALTIME (non-monotonic; an NTP step would corrupt one sample — none
observed across ~230 samples); the watchdog leaks one orphaned `sleep 20` per
sample (no CPU impact); env-var arms pay one extra `env` exec (~1–2 ms) — not
used in gate arms, and oracle deltas are internally controlled against an
env-wrapped base.

## CLASSIFICATION REASONING

1. Same mandatory startup DAG on both OSes — the portable architecture is
   genuinely the same, so this is not an artifact of comparing different
   architectures.
2. Linux full-host T1→T2 is ~2× lower (123–132 vs 247–261) and under the
   150 ms budget — the startup problem is not intrinsic to the portable
   desktop architecture per se.
3. QuickJS/guest costs are the same class on both; the portable GPU mid-chain
   (adapter+device) is nearly identical. → not a guest or portable-runtime
   problem.
4. The Windows excess concentrates in Windows-execution-environment stages:
   window bring-up (+58–85), post-renderer first-frame/present (+~100),
   gpu_instance (+19–36). → **WINDOWS_SPECIFIC_TAX**. (MIXED was considered:
   the portable floor is real — wgpu ~107 ms serial on this hardware — but
   "the startup problem" under discussion is the ≤150 budget miss, and on
   Linux the same architecture does not miss it.)

## IMPLICATION FOR FUTURE OPTION 1

DO_NOT_TEST_YET

**OPTION_1_PLAUSIBLY_EARNED** — this control establishes that the Windows
T1→T2 excess is **Windows-execution-environment-specific rather than
portable-intrinsic**: the same architecture on Linux meets the ≤150 ms budget.
Whether a native/direct Windows host can actually shrink the excess depends on
an attribution this experiment did NOT test — how much of the Windows window
bring-up and first-frame/present cost belongs to winit (replaceable) vs
intrinsic Win32/DWM work (any Windows host pays it). The project's own
WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1 found a warm second window costs
~12.5–14.8 ms vs ~67 ms for the first, and that the remainder is not
decomposable without ETW/winit-internals work. It is therefore not
STRONGLY_EARNED: the portable wgpu floor (instance + adapter/device, ~107 ms
serial here) would still be paid by any wgpu-based host unless Option 1 also
changes the GPU path, and the winit-vs-Win32 split is open. This evidence may
be cited by #40; Option 1 itself remains unauthorized.

## FILES

- report: `docs/LINUX-DESKTOP-STARTUP-CONTROL-1.md` (this file)
- raw evidence (full set — per-sample CSVs + A7EVENT stderr for every batch,
  ambient snapshots, build logs, smoke logs, stats): retained on the archive
  branch under `docs/linux-startup-control-1-raw/` — see
  [Evidence retention](#evidence-retention)
- scripts (full set: `pv-run-samples.sh`, `pv-run-x11.sh`, `pv-run-control.sh`,
  `pv-stats.py`, `pv-ambient.sh`): retained on the archive branch; slim copies
  of `pv-run-samples.sh` and `pv-stats.py` live under
  `docs/linux-desktop-startup-control-1/`
- source identity:
  `docs/linux-desktop-startup-control-1/source-identity-manifest.md` (slim
  copy; frozen original on the archive branch)
- Linux-side retention (do not delete):
  `jnhu@192.168.31.75:~/pocketjs-linux-startup-control/` (same artifacts),
  tree at `~/Source/pocketjs-linux-startup-control/pocketjs-control`
  (detached a46eb7e0 + unpushed scratch branch `pv-oracle-scratch`),
  controls at `~/tmp/pocketjs-startup-controls/`.

## GITHUB

- original experiment branch: `audit/linux-desktop-startup-control-1`
- immutable archive branch: `archive/linux-desktop-startup-control-1-full`
- frozen evidence SHA: `982914b598171045ffa38eefa3ebbc6df6e981e2`
- historical full-evidence PR: #41 (closed unmerged — superseded as merge
  vehicle; retained as full evidence provenance)
- merge vehicle: a separate slim evidence PR against main (this report + the
  identity manifest + summary statistics + minimal reproducibility scripts),
  evidence only, no production changes.

## NEXT ACTION

Feed this classification into #40's mechanism discussion: the Windows T1→T2
excess is concentrated in the Windows window bring-up and first-frame/present
path (~160–200 ms class), which is Windows-execution-environment-specific
while the same architecture meets the ≤150 ms budget on Linux; the open
question any future Option must answer first is the winit-vs-Win32 attribution
of that excess, and the common portable wgpu instance/adapter/device floor
(~107 ms class) bounds any host that keeps wgpu.

---

## Evidence retention

Packaging note (EVIDENCE-PACKAGING-CORRECTIVE-1, mechanical only): this
document is copied verbatim from the frozen full-evidence snapshot
(`982914b598171045ffa38eefa3ebbc6df6e981e2` on
`archive/linux-desktop-startup-control-1-full`). Only path/provenance
references were adjusted for the slim layout and this retention section was
added; no scientific content, statistics, or verdict wording was changed.

The complete reviewed raw experiment snapshot is intentionally not merged into
`main`.

Full evidence is retained at:

* experiment branch: `audit/linux-desktop-startup-control-1`
* immutable archive branch: `archive/linux-desktop-startup-control-1-full`
* frozen SHA: `982914b598171045ffa38eefa3ebbc6df6e981e2`
* historical full-evidence PR: #41

The archived snapshot includes:

* all per-sample stdout/stderr;
* raw CSV batches;
* ambient-state captures;
* build logs;
* oracle traces;
* measurement scripts;
* source identity metadata.

This document and the small summary/reproducibility subset in `main` are the
curated knowledge artifact; the archive branch is the raw evidence artifact.
Paths referencing `docs/linux-startup-control-1-raw/` resolve on the archive
branch, not on `main`.

# WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1

Campaign: experiment-first critical-path audit of `T1_PROCESS_ENTRY →
T2_WINDOW_USABLE` for the current PicoView/PocketJS Windows candidate (owner
goal, 2026-09-13, tracker authority **Issue #40**). No production code was
modified. All experiments ran on a throwaway `git worktree` of PocketJS at the
campaign content with a measurement-only instrumentation patch (archived as a
diff; worktree removed after the audit), plus existing binaries and scripted
controls.

**VERDICT: NO_BOUNDED_CORRECTIVE_EARNED. CORRECTIVE EARNED: NO. No C7.**

The audit's central result is a decomposition, not an optimization:

1. The historic window-mode startup numbers (quiet T1→T2 ≈ 247–261 ms) were
   measured with **process spawn as the T1 proxy**. Wall-clock joining against
   the process's own `READY <epoch>` print shows the process's `main()` begins
   executing **~110–125 ms after kernel process creation**, and that this
   pre-main cost is **generic to this host, not PicoView architecture**: a
   warmed 200 KB hello-world Rust binary shows 108–118 ms and `cmd /c echo`
   shows 86–90 ms for the same segment.
2. The in-process segment (`main()` entry → first present submitted) measures
   **P50 199 ms** in the degraded evening session (n=24) and is arithmetically
   bounded at **~125–153 ms** in the quiet session — straddling the ≤150 ms
   target by session state, not stably failing by ~100 ms.
3. The proven controllable in-process mechanisms are SMALL: E4 (surface-free
   adapter/device request overlapped with window creation) recovers
   **≈ 12 ms** (paired mean Δ −12.1, 8/8 pairs positive) and E5 (early device
   release before surface configuration) ≈ **5 ms** (clean re-run) — combined
   ≈ 17 ms, below the MATERIAL band and not gate-shaping.
4. Under either reading of `T1` (spawn-anchored or entry-point-anchored), no
   bounded PicoView-side mechanism closes the gap to ≤150 ms robustly. What
   the gate actually lacks is a **T1-anchor ruling and a benchmark machine-
   state specification** — authority decisions, not code correctives.

Historical GATE-A/GATE-A2 verdicts are not rewritten; the audit records what
those numbers contained.

## IDENTITY (Phase 0, frozen before reasoning)

| Item | Value |
| --- | --- |
| PicoView remote / branch / HEAD | `git@github.com:jnhu76/PicoView.git` / `main` / `7ca2989a4bcd8eb0472ecd8a06c58b56a342f730` — clean worktree |
| PocketJS remote / branch / HEAD | `https://github.com/pocket-stack/pocketjs` / `picoview-c4-present-pacing` / `a46eb7e055ef443f5efecdac1cc447a3c1941805`; untracked `evidence/`, `guest/` (pre-existing harness artifacts, same as AUDIT-1) |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| Product binary (pristine) | `pocket-desktop-host.exe` 12,166,656 B, 2026-09-13 14:32 — the GATE-A2 build, content = `a46eb7e0` |
| Experiment binary | `pocketjs-audit2` worktree, detached at `a46eb7e0`, + measurement-only patch: 3 files, +193/−15 (markers, experiment env hooks, warm-window probe). Patch archived at `evidence/tmp/audit2-markers-applied.diff` (final superset). The worktree was rebuilt three times as hook families were added (~19:52 markers, ~20:07 warm-window, ~20:18 E5 hook); every rebuild contains only additions from the archived diff; reviewer-verified that the default (env-off) path is semantically identical to pristine. Worktree removed after the audit; campaign branch untouched. |
| Guest assets | `dist/picoview-a6-main.pak` 304,944 B + `.js` 345,215 B (C3-era declaration, unchanged; shared via `POCKETJS_DIST` for worktree runs) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)` `stable-x86_64-pc-windows-msvc`; cargo 1.98.1; Bun 1.2.8 |
| wgpu / winit / naga | 25.0.2 / 0.30.13 / 25.0.1 (engine Cargo.lock) |
| Host | Windows 11 Pro build 26200; AMD Ryzen 7 5800H (16 LP); 28.92 GiB RAM; AMD Radeon(TM) Graphics iGPU, driver 31.0.21923.11000; display 2560×1440 @ 60 Hz; power plan Balanced; uptime 10.7 → 11.6 h across the audit |
| AV posture | Tencent QQPCRTP realtime protection RUNNING; WinDefend STOPPED (same as all recorded campaign evidence) |
| Free RAM at start | 15.93 GiB |
| Ambient CPU load | 8–9 % at audit start; 6–16 % later; intermittent background bursts in the post-build session (see LIMITATIONS) |

## AUTHORITY

PRD §18 (startup budget table) → SPEC (measurement authority delegated) →
`docs/BENCHMARK.md` §5/§6 (T0/T1/T2 semantics, ≥50 iterations, nearest-rank) →
no accepted ADRs exist → CONTEXT.md → Issue #40. Historical evidence treated
as immutable: GATE-A2 FAIL, STARTUP-LAST-MILE-REALITY-AUDIT-1
(ENVIRONMENT_BOUND, no C7) stand unchanged.

## HISTORICAL CONTEXT (carried forward, verified)

From `docs/STARTUP-LAST-MILE-REALITY-AUDIT-1.md`: cross-session image-startup
variance (293 ↔ 384) is ENVIRONMENT_BOUND (background load, intervention-
proven); the benchmark oracle (T0/READY probes) was validated; window-mode
quiet plateau for the candidate content was 247/260/261 (T0-anchored,
spawn-proxy based), target ≤150 — classified STABLE_FAIL "host-architecture
shortfall". That classification is what this audit decomposes.

## MACHINE STATE (Phase 14)

Recorded per-section above. Session timeline during this audit (all
2026-09-13):

- **S-early (19:27–19:50)** — before any build work; load 8–9 % at 19:27, free
  RAM 15.9 GiB. The n=55 gate probe ran inside this window (19:37:03–19:50:33,
  per-run tmp mtimes); no load telemetry was sampled inside the probe window
  itself (LIMITATIONS). All GATE-QUALITY numbers below come from this window
  unless marked.
- **S-noisy (19:52 onward)** — after three release builds; ambient load 6–16 %
  average with intermittent bursts (consecutive-run spikes to 555–928 ms;
  one pristine recheck window with 4/20 runs never reaching READY — see
  LIMITATIONS). All stage-decomposition and intervention numbers come from
  here; absolute values are inflated relative to S-early (in-process P50 199
  vs est. band 125–153). Relative/intervention comparisons alternate arms
  within single sessions (A/B alternating per run) to cancel drift.

## METHODOLOGY

- **Probes (existing, unmodified):** `evidence/tmp/bench-startup.ps1` (QPC
  Stopwatch, `Start-Process -WindowStyle Minimized`, ~5–10 ms stdout poll,
  nearest-rank percentiles). Window mode = no image workload.
- **New measurement plumbing (untracked, evidence/tmp/):** `audit2-trace.ps1`
  (per-run stderr capture of A7EVENT/FRAME_TRACE lines),
  `audit2-join2.ps1` (wall-clock join: kernel `Process.StartTime`, the
  process-printed `READY <unix ms>` epoch, per-run present_done),
  `audit2-exp.ps1` (strict ABBA interleaving of two env conditions on one
  binary; per-run CSV), `audit2-machine-state.ps1`, hello-world control
  (`audit2-hello/`).
- **Instrumentation patch (worktree-only, measurement-only):** fine-grained
  `A7EVENT` phase markers on the same `proc_ms()` monotonic process-entry
  clock as the existing phases (resumed/DPI/window-create sub-stages, boot
  sub-stages, first-tick sub-stages, present sub-stages), `A7EVENT,dur`
  duration lines in pocket3d (instance/adapter/device), experiment env hooks
  (E2/E3a/E3b/E4/E5, all default-off), warm-window probe. All stderr output
  gated behind `--announce-ready` or `POCKET_MEASURE=1`. The patch adds no
  semantic behavior; diff archived; worktree deleted post-audit.
- **T2 probe validity:** external READY detection adds 0–7 ms after the
  process prints (wall-join, 6/6 runs). `READY` prints immediately after the
  first successful `surface.present()` returns — present-submission semantics
  per BENCHMARK §5, unchanged.

## T1/T2 ORACLE VALIDATION (Phase 15)

All interventions alternate arms on ONE binary (n per arm in the Result
column; n<50 → exploratory per BENCHMARK §4; conclusions rest on sign and
magnitude of paired deltas, not gate percentiles). Percentiles are
nearest-rank.

| Experiment | Prediction (from DAG) | Result |
| --- | --- | --- |
| **E2** +100 ms injected before surface/adapter/device (critical path), n=8/arm | T2 +100 | present_done P50 193.5 → 287.0 (**Δ +93.5 ms**); external Δ +97. Detected and stage-localized (`gpu_adapter_device` 154 → 250 in paired traces). **Critical-path oracle VALID.** |
| **E3a** +100 ms injected after guest eval (overlapped boot), n=8/arm | T2 shifts by delay **minus** the boot/GPU overlap slack (boot_done+100 vs gpu_ready): predicted ≈ +90 | Paired deltas: +107/+101/+90/+92/+94/+77/+89 (7 valid pairs; 1 pair discarded symmetrically — both arms hit a load burst, A 428 / B 465). **Median Δ ≈ +94**, matching the ≈ +90 prediction. Note: the 4 ms distinction from E2's +94 is inside pair noise — the strong validations are the magnitude match and E3b's zero, not the 94-vs-90 contrast. **DAG-interpretation VALID.** |
| **E3b** +100 ms injected into the text-offload engine (off-path), n=8/arm | T2 unchanged | **Δ 0 ms** (P50 196 vs 196, all 16 runs clean). **Noncritical control VALID.** |
| **E5** early device release before caps/configure (serialization candidate) | ≤ small | First run (label `e5`) **INVALID — harness env leak**: the arm-switch cleared four audit env vars but not `POCKET_AUDIT_EARLY_RELEASE`, and the flag is presence-based, so A-arms ran E5-on from pair 2 onward (`gpu_early_released` marker in 7/8 A-arms). Disclosed and re-run as **e5r** with fixed hygiene (A-arms verified 0/8, B-arms 8/8 marker presence): **median Δ ≈ −5 ms** (pairs −2 to −11; two spike-contaminated pairs disclosed: +27, −19). A small real overlap gain, TRIVIAL/SMALL boundary. |
| Combined **E4+E5** (label `e45`) | — | Ran with the same env leak — **INVALID, not used.** Disclosed for completeness. |

Combined with AUDIT-1's window-creation injection (+90 detected, stage-
localized), the T1/T2 measurement reliably detects controlled effects and the
DAG predicts intervention outcomes. **Not BENCHMARK_ORACLE_INVALID.**

## THREAD-LANE TIMELINE (S-noisy, marker build, P50 values, n=24; ms from main() entry)

```
MAIN/EVENT-LOOP THREAD
0    main_entry
8    pre_loop_done            (args + env_logger)
32   event_loop_built         (EventLoop::build ≈ 24)
40   host_construct_done      (channels + Host + clipboard ≈ 8)
43   resumed_begin
47   dpi_pin_done             (PMv2 pin ≈ 4)
50   window_create_begin
117  window_create_return     (create_window ≈ 67)  ← see WINDOW-CREATE
124  dpi_verify_done          (≈ 7)
133  runtime_thread_spawning (runtime_spawn_done 134)
135  gpu_instance             (instance wait after window ≈ 1–2)
137  surface_created          (≈ 2)
161  gpu_adapter_device       (adapter 7.6 + device 13.2)
178  gpu_ready                (caps + configure ≈ 17)
     … event loop idles (ControlFlow::Wait) …
191  present_texture_acquired (Wake → request_redraw → RedrawRequested → acquire ≈ 6)
193  present_blit_built       (Blit::new ≈ 2, first present only)
194  present_queue_submit
199  present_done → READY     ← T2
```

```
POCKET-GPU-INSTANCE THREAD (spawned from main() before run_app)
~47 → 135   wgpu::Instance::new (dur 88.1 ms mean) — overlaps loop build,
            host construct, window creation, DPI verify
```

```
POCKET-RUNTIME THREAD (spawned at 134)
138  boot_assets_read          (pak 305 KB + js 345 KB read)
140  boot_ui_surface           (UiSurface + feed_pak)
142  boot_supervisor
144  boot_quickjs              (Runtime + Context::full)
170  boot_guest_eval           (345 KB bundle eval ≈ 26)
171  runtime_boot_done         → blocks on gpu_rx.recv()
178  (released by gpu_tx.send at gpu_ready)
182  runtime_renderer_ready    (Renderer::new ≈ 4)
183–185  tick #1               (guest.frame ≈ 1, surface.tick < 1)
     render-submit ≈ 2.7       (first DrawList → target → queue.submit)
     → outputs.try_send → Wake::Output
```

```
POCKET-OFFLOAD THREAD: text engine init + pak load — OFF the T2 path
(E3b: +100 ms here moves T2 by 0).
```

## CRITICAL-PATH DAG (as implemented; waits/joins marked)

```
T1 (main entry)
 ├─ args/logger 8 ─ EventLoop::build 24 ─ host construct 8 ─ resumed 3 ─ dpi pin 4
 ├─[GPU-INSTANCE THREAD: instance_new 88 ───────────────────┐
 │        overlaps everything above]                        │ wait ≈ 2
 ├─[RUNTIME THREAD: guest boot 37 ── gpu_rx.recv (WAIT,     │
 │        released only at gpu_ready) ─ renderer 4 ─        │
 │        tick 2 ─ render 3 ─ submit ─ Wake]                │
 └─ window create 67 ─ verify 7 ─ surface 2 ─               │
        adapter 7.6 + device 13.2 ─ configure 17 ───────────┴─ join (gpu_tx.send)
        → Wake → RedrawRequested → acquire 6 → blit 2 → submit/present 5
        → first present submitted → T2
```

Wait/join inventory (every blocking point on the path):

| # | Waiter | Waited-on | Where | Required for T2? |
| --- | --- | --- | --- | --- |
| 1 | main thread | wgpu Instance via `instance_rx.recv()` (main.rs:887) | after window create | YES (surface needs instance); typically pre-completed (≈1–2 ms) |
| 2 | runtime thread | device/queue via `gpu_rx.recv()` (main.rs:522) | after guest boot | YES (renderer needs device) |
| 3 | main thread | surface caps + configure (gpu.rs:226–247) | after adapter/device | YES (present needs configured swapchain) |
| 4 | main thread | Wake→RedrawRequested event-loop round trip | after first render | YES (the present itself) |

No joins, Mutexes/Condvars, sleeps, or poll loops sit on the pre-T2 path
(code-verified: C3 park requires `hash == Some(next)` and is unreachable
before the first frame; the 60 Hz deadline sleep starts after tick #1;
`--quit-after` disables parking entirely in probe runs).

## WINDOW-CREATE DECOMPOSITION (Phase 5)

First window (`window_create_begin → return`): **P50 67 ms** (min 62, max 78,
n=24 q2 family; across all 178 archived traces the first-window spread is
57–111). A warm second hidden window created in the same process after
startup: **12.5–14.8 ms** (n=6). Therefore ≈ **13 ms is intrinsic
winit/CreateWindowEx cost** and ≈ **54 ms is first-window-specific**
(process's first HWND: GUI substrate/CSRSS/DWM first-touch, user32
handle-table setup, and any AV window-hooks; not further decomposable
without ETW and winit internals). Caveat: the warm probe window is created
hidden while the first window is spawned minimized — a visibility/state
confound that makes the 13/54 split directionally conservative (a visible
warm window would cost more, shrinking the first-window-specific share).

The marker interval hides nothing else: DPI pin (4 ms) and DPI verify (7 ms)
are separately marked; no GPU work, no guest work, no synchronous guest
callbacks run inside window creation (winit delivers Resized only after
`resumed` proceeds; that path's present no-ops on `frame == None` before any
GPU call, code-verified).

## GPU DECOMPOSITION (Phase 6)

| Step | P50 (ms) | Required before T2? |
| --- | ---: | --- |
| Instance creation (side thread, overlapped) | 88.1 (duration; arrives at 135) | YES — but NOT on the serial path (C1 overlap, verified live) |
| Surface create | 2 | YES |
| Adapter request | 7.6 | YES — but NOT required to be serial-after-window (E4: surface-free request selects the same adapter here) |
| Device request | 13.2 | YES — same as above |
| Caps + surface configure | 17 | YES (swapchain must exist to present) |
| UiRenderer pipeline (runtime thread) | ~4 | YES (first render) |
| Blit pipeline (first present, then cached) | ~2 | YES at first present (needs the target view) |
| First acquire + submit + present | ~13 | YES — this is T2 itself |

Total GPU serial-after-window ≈ 41 ms; of that, adapter+device ≈ 21 ms is
proven overlapable (E4, realized saving ≈ 12 ms paired mean — contention eats
the rest).

## RUNTIME/GUEST DECOMPOSITION (Phase 7)

Guest boot totals ≈ 37 ms on the runtime thread (assets 3, UiSurface+feed_pak
2, supervisor 2, QuickJS context 2, bundle eval 26) and **completes before
gpu_ready in every instrumented run** — overlapped, off the critical path
until its 7–10 ms tail crosses gpu_ready (E3a quantifies exactly this slack:
delay beyond it moves T2 1:1 minus slack). QuickJS/eval is required before T2
(the first frame is the real guest shell — T2 semantics forbid a native fake
frame). The text-offload engine is fully off-path (**E3b: Δ = 0**). No
startup-only service handshakes serialize the first frame (svc companions
absent in window mode; A3 harness absent).

## FIRST-FRAME DECOMPOSITION (Phase 8)

Renderer build 4 → tick #1: guest.frame ≈ 1, surface.tick < 1 → render-submit
2.7 (target acquire + words encode + submit) → Wake::Output → request_redraw
→ RedrawRequested → get_current_texture ≈ 6 → Blit::new 2 → encoder+submit ≈
1 → present ≈ 4 → present_done. **Total renderer-ready → T2 ≈ 17 ms.** The
audit's starting hypothesis of a "tens-of-ms first-present region" is
REFUTED for the current build: exactly one render and one present precede
READY (trace counts verified), no periodic-tick wait, no frame-pacing delay
(Fifo + `desired_maximum_frame_latency: 1` makes present submission
non-blocking on the first frame), no duplicate surface configuration, no
initial blank frame from the Resized path (no-op present before any GPU
work). Post-T2 note (no T2 effect): the shell ticks at 60 Hz until C3 park;
probe runs disable parking via `--quit-after` — the static-window tick/park
behavior belongs to the idle gate, not this one.

## THE PRE-MAIN SEGMENT (central finding)

Wall-clock join method: the process prints `READY <unix_ms>` at T2; the probe
records kernel `Process.StartTime`; `entry_wall_est = READY_epoch −
present_done_proc_ms`. Persisted, recomputable controls live in
`evidence/tmp/logs/audit2-join3-*.csv`; an earlier console-only join family
(join2) produced consistent values but its kernel-create timestamps were not
persisted (LIMITATIONS).

| Subject | kernel-create → main/print (ms) | n | Source |
| --- | ---: | --- | --- |
| **hello-world Rust exe (200 KB, warmed 15×)** | **114–130, P50 ≈ 124** (join3) | 8 | persisted |
| **`cmd /c echo`** (spawn → output visible = full lifecycle) | **138–167, P50 ≈ 151** (join3; 86–90 in the earlier quieter window) | 8 | persisted |
| pocket-desktop-host (marker build, join2) | ~121–128 (entry_est − spawn_wall) | 6 | console-only, corroborated by ABBA-derived pre-main 104–132 across 16 e4 runs |
| pocket-desktop-host (pristine, join3) | **289–300, P50 ≈ 299** create→READY **including** ~176–190 in-process | 6 | persisted |

MEASUREMENT: on this host, **~90–130 ms elapses between kernel process
creation and the first instruction of `main()` for ANY process** — loader,
user32/GDI init, and (present in every recorded session) the QQPCRTP
process-creation hook. PicoView's 12 MB image adds only ≈ 5–15 ms over
hello-world — a delta at the edge of `Process.StartTime` granularity
(kernel timestamps ride the coarse system-time update, up to ~15 ms); the
generic-cost conclusion itself is robust (every subject clusters far above
the ~16–22 ms spawn-return).

INFERENCE (flagged as inference): the historical window-mode numbers used the
spawn return as the T1 proxy (`T1_TO_T2 = readyMs − spawnMs`), folding this
segment into "architecture startup". S-early external P50 274 − spawn 17 −
pre-main ⇒ **in-process T1→T2 ≈ 125–153 ms in the quiet session** (band from
observed quiet external drift 247–274 minus spawn 17 minus the observed
pre-main range 104–132; the pre-main value was not measured inside the
S-early window itself — the band, not a point, is the honest bound).

DEFINITIONAL FORK (owner decision required, not made here):

- **Reading A — T1 = process creation/spawn** (the historical probe's
  implicit choice): quiet T1→T2 ≈ 257 ms; but ≈ 90–130 ms of it is generic
  host process-creation cost (hello/cmd proven), and the PicoView-attributable
  remainder ≈ 125–153 ms straddles the 150 ms target.
- **Reading B — T1 = process entry point begins executing** (literal
  BENCHMARK §5 wording; supported by the PRD using "process entry" for the
  window row and "process-cold activation" for the image row — two different
  anchors on purpose): T1→T2 = the in-process segment = ~125–153 (S-early
  estimate band) to 199 (S-noisy P50, direct) — straddling the target by
  session state. This audit cannot adjudicate a Reading-B pass/fail without a
  spec'd quiet-state re-measurement.

Under either reading the ≤150 ms gate is not demonstrably blocked by a
PicoView-side bounded mechanism: Reading A's overshoot is dominated by
environment; Reading B's quiet value straddles the target with a session
swing (±50 ms) that dwarfs every proven code mechanism — and if a spec'd
quiet re-measurement under Reading B ever lands robustly ABOVE 150, the
proven E4 mechanism (below) becomes the natural C7 candidate at that point.

## REQUIRED-BEFORE-T2 TABLE (Phase 11)

| Operation | Current (P50, S-noisy) | Required before T2? | Evidence |
| --- | ---: | --- | --- |
| args/env/logger init | 8 | YES (functional; trivial) | MEASUREMENT |
| EventLoop::build | 24 | YES (winit substrate) | MEASUREMENT |
| Host construct (clipboard, channels) | 8 | clipboard: NO (HYPOTHESIS, untested, few ms) | code + MEASUREMENT |
| DPI PMv2 pin | 4 | YES (PMv2 is a correctness rule) | PRD/CONTEXT |
| Window creation | 67 | YES (T2 requires the real interactive window) | semantics; 54 ms of it is first-window-specific, no bounded host-side mechanism identified |
| DPI verify + IME allow | 7 | NO for T2 semantics (A6 evidence discipline keeps it; deferral unproven, small) | HYPOTHESIS |
| wgpu Instance | 88 dur, overlapped | YES, off serial path | AUDIT-1 + this audit (wait ≈ 1–2 ms) |
| Adapter + device | 21 | YES, but NOT serial-after-window | E4 intervention (−12 paired mean) |
| Surface create + configure | 19 | YES | present requires swapchain |
| Guest QuickJS + bundle eval | 30 (spawn→boot_done tail) | YES (real guest frame defines T2) | semantics; E3a |
| Text offload engine | off-path | **NO** | E3b Δ = 0 |
| UiRenderer + Blit pipelines | ~6 | YES (first render/present; cached after) | MEASUREMENT |
| One render + submit + present | ~17 | YES — this IS T2 | MEASUREMENT |

## DUPLICATE-WORK AUDIT (Phase 9)

- Render submissions before READY: **exactly 1** (trace count). Presents
  before READY: **exactly 1**. Surface configurations: **1**. Pipeline
  builds: UiRenderer ×1, Blit ×1. No resize-triggered re-layout before the
  first frame (single `Input::Resize` consumed in tick #1). The initial
  Resized-triggered redraw no-ops on `frame == None` before any GPU call.
- ONE real duplication found: the pak buffer is parsed twice at boot —
  `surface.feed_pak(&pak)` (boot path, ≈2 ms) and
  `pocket_text::Engine::load_pak(&pak)` (offload thread, off-path). MINOR;
  the duplicate copy is not on the T2 path.

## ACCIDENTAL-SERIALIZATION AUDIT (Phase 10)

Remaining serial chain after window create: instance wait (1–2 ms) → surface
→ adapter+device (21) → configure (17) → renderer (4) → first frame (17).
Two overlap candidates were tested by intervention:

- **E4 — surface-free adapter/device overlapped with window creation: PROVEN,
  paired mean Δ −12.1 ms (nearest-rank arm P50 192 → 180; 8/8 pairs positive,
  range −3 to −22; AB-alternating n=8/arm)**. Adapter identity verified
  identical across arms (Vulkan / AMD Radeon(TM) Graphics / Bgra8Unorm).
  Convention note: arm percentiles are nearest-rank; the paired mean is the
  headline statistic.
- **E5 — early device release (gpu_tx.send before caps/configure): first run
  INVALID (env leak, see oracle table); clean re-run (e5r): median Δ ≈ −5 ms**
  (pairs −2 to −11). A small real gain — the Wake→RedrawRequested→present
  chain floor absorbs most of the theoretical overlap.

No other accidental serialization found (wait inventory above; C3 park and
60 Hz pacing structurally unreachable before the first frame).

## SAVINGS MAGNITUDE TABLE (Phase 13; against the ≤150 ms target)

| Mechanism | Status | Magnitude |
| --- | --- | --- |
| Pre-main host process-creation cost | MEASUREMENT + controls (environment, not PicoView code) | ~90–130 ms — outside code reach |
| First-window-specific creation cost | MEASUREMENT (no bounded host-side mechanism identified) | ~54 ms — outside code reach |
| E4 adapter/device overlap | **PROVEN** (intervention + semantics check) | **−12.1 ms paired mean (SMALL)** |
| E5 early device release | PROVEN SMALL (clean re-run) | −5 ms (TRIVIAL/SMALL boundary) |
| DPI-verify deferral | HYPOTHESIS (untested) | ~7 |
| Clipboard lazy init | HYPOTHESIS (untested) | few ms |
| Single pak parse | HYPOTHESIS (minor; duplicate copy off-path) | ~2 |

Proven controllable total ≈ 17 ms (E4+E5), below the MATERIAL band (25–50).
GATE-SHAPING requires enough to make ≤150 "realistically attainable": under
Reading A the overshoot is ~85 % environmental; under Reading B the quiet
band (125–153) straddles the target and no spec'd quiet re-measurement
exists. No bounded mechanism (alone or compounded) is demonstrably
gate-shaping on today's evidence.

## PROVEN MECHANISMS

1. **Host pre-main process-creation cost ~90–130 ms, generic across
   binaries** (hello, cmd, PicoView) — intervention-grade controls; explains
   the bulk of the historical "architecture" startup number. Not controllable
   by PicoView code; controllable only by benchmark-state definition (AV
   posture / reference host), an authority decision.
2. **E4 surface-free adapter/device overlap: paired mean −12.1 ms on T2**
   (8/8 pairs positive), semantics verified on this host (same adapter
   selected). SMALL; not gate-shaping.
3. **E5 early device release: ≈ −5 ms** (clean re-run). TRIVIAL/SMALL; not
   gate-shaping.

## UNPROVEN HYPOTHESES

DPI-verify deferral (~7 ms); clipboard lazy init (few ms); single pak parse
(~2 ms); session-sensitivity of pre-main itself (assumed constant across
sessions in the S-quiet estimate — not measured); AV-window-hook
contribution to the 54 ms first-window cost (not isolated).

## LIMITATIONS

- Single host, single AV posture (QQPCRTP live, Defender stopped) — every
  number ever recorded in the campaign includes its hooks; no transferability
  claim.
- The quiet-state in-process T1→T2 value is a BAND (125–153), not a point:
  the wall-join was not run inside the S-early window, so quiet pre-main is
  bounded by observations from other windows (104–132) rather than measured
  in place. Direct P50 199 comes from S-noisy (n=24; <50 → exploratory per
  BENCHMARK §4; the gate-quality n=55 exists only for the external probe).
- **S-noisy degradation events, disclosed and retained (not dropped):**
  consecutive-run spikes to 555–928 ms in the e5/e45 window; and in one
  pristine recheck probe, 4/20 consecutive runs (12–15) with normal spawn
  times (17–22 ms) never reached READY within the 15 s poll (exitOk=False) —
  a ~20 % no-READY degradation mode observed exactly once, in that window,
  unexplained (their stdout/stderr were per-run temp files already cleaned by
  the probe; no artifact survives to diagnose them). Marked
  INVALID_ENVIRONMENT; no conclusions rest on that window.
- No load telemetry was sampled INSIDE the S-early gate-probe window
  (19:37–19:50); the 8–9 % readings bracket it (19:27, post-probe).
- The earlier join2 family's kernel-create timestamps were printed to the
  console only and are not independently recomputable; the persisted join3
  family supersedes it (values consistent). The join3 `cmd` rows have no
  process-printed epoch (cmd prints no timestamp), so their quoted number is
  spawn→output-visible lifecycle, not create→main.
- `Process.StartTime` granularity is the coarse system-time update (up to
  ~15 ms); the "PicoView adds ~5–15 ms over hello" delta is at that edge,
  while the generic-cost conclusion (all subjects ≫ spawn-return) is robust.
  Wall-epoch joins (READY epoch) vs the process-monotonic proc_ms clock could
  in principle be perturbed by an NTP step; no outlier consistent with one
  appears in any run.
- T1-anchor semantics (Reading A vs B) is an authority question this audit
  measures but does not decide.
- The stage-decomposition numbers come from the patched worktree binary
  (three incremental builds, all within the archived diff); pristine-binary
  gate numbers come from the untouched GATE-A2 build. Reviewer-verified that
  the env-off default path is semantically identical to pristine.
- The warm-window probe creates a hidden second window vs the minimized
  first window (visibility/state confound; conservative direction — see
  Phase 5).

## CORRECTIVE-EARNED DECISION

**NO.** Root-cause standard applied to every candidate:

- Pre-main cost: observation ✓, mechanism (partially — loader/AV identified,
  not decomposed to syscall level) ✓, intervention (hello/cmd natural
  controls) ✓, semantics ✓ — but **controllability by PicoView code: NO**, and
  magnitude against the gate: it IS the dominant term, but it is not a
  PicoView mechanism.
- E4: full five-part standard MET — paired mean −12.1 ms (SMALL).
- E5: standard met on the clean re-run — ≈ −5 ms (TRIVIAL/SMALL).
- Neither, alone or compounded (≈ 17 ms), is demonstrated gate-shaping on
  today's evidence: under the operative Reading A the gap is environmental;
  under Reading B no spec'd quiet-state re-measurement exists, so a
  >150 FAIL is not established (the quiet band straddles the target).

**Conditional forward note:** if the owner adopts Reading B and the spec'd
quiet-state re-measurement lands robustly ABOVE 150 ms P50, then E4 (+ E5)
would satisfy the five-part standard against that measured deficit and would
earn a mechanism-specific C7 at that point. That decision is deliberately
deferred to the re-measurement; no C7 is created today on band estimates.

## VERDICT AND DISPOSITIONS

**OUTCOME: NO_BOUNDED_CORRECTIVE_EARNED.**

- The T1→T2 critical path is fully decomposed with a validated DAG; the
  quiet-state ~247–261 ms historical result is explained WITHOUT JPEG decode,
  term by term (S-noisy direct measurement, q2 P50, adds to the measured
  in-process total of 199 ms): pre-window main-thread init 50 (args/logger 8,
  EventLoop::build 24, host construct 8, resumed/dpi-pin 9*) + window create
  67 + DPI verify 7 + spawn bookkeeping/instance wait 11 + surface create 2 +
  adapter+device 24 + configure 17 + renderer 4 + tick 2 + render 3 +
  wake/acquire 6 + blit 2 + submit/present 5 ≈ **200 ms**, plus the
  fully-overlapped guest boot (~37, ends before gpu_ready) and the pre-main
  segment (~90–130, outside the process). *= residuals make the terms sum to
  the measured 199; no overlapped stage is summed into the total.
  Under S-early conditions the same path measures/bounds at ~125–153.
- The audit does NOT redefine T2, does NOT weaken the ≤150 ms target, does
  NOT rewrite GATE-A/GATE-A2 verdicts, does NOT close #29/#31, does NOT open
  a new gate, does NOT start Product Phase B.
- Supplementary classification: the residual session-sensitivity of every
  segment is ENVIRONMENT_BOUND in character (consistent with AUDIT-1); the
  operative verdict remains NO_BOUNDED_CORRECTIVE_EARNED because the audit's
  primary question (path decomposition + mechanism verdict) is answered and
  the dominant terms are outside PicoView code reach.
- What the project actually needs (owner/authority decisions, both carried):
  1. a **BENCHMARK T1-anchor ruling** — "process entry begins" = entry point
     (Reading B) or process creation (Reading A); and
  2. the **benchmark machine-state specification** already requested by
     STARTUP-LAST-MILE-REALITY-AUDIT-1 (ambient-load ceiling + telemetry, AV
     posture, exe-age/warm-up rule) — this audit adds "process-creation cost
     (pre-main) recording" to that request.
  Then re-adjudicate the ≤150 ms window gate under the ruling.

#29 STATUS: UNCHANGED (blocked — 16 GiB reference-class hardware).
#31 STATUS: UNCHANGED (blocked — single-display host).
GATE-A3: NOT AUTHORIZED.
PRODUCT PHASE B: BLOCKED.

**NEXT ACTION**: owner decision — rule on the T1 anchor semantics in
BENCHMARK (and adopt the machine-state specification), then re-adjudicate the
window-usable startup budget; E4 (−12.5 ms, proven, semantics-checked) is
recorded as an available SMALL optimization if margin is ever wanted, but
earns no C7 today.

## Review trail

Two fresh-context adversarial reviews ran against the draft (both had full
read access to the raw artifacts and recomputed percentiles/medians
independently; both verified code claims against the worktree and the
archived diff):

- **STARTUP-MECHANISM-ADVERSARY — REVISE**, 1 BLOCKER + 6 MAJOR + 8 MINOR.
  All BLOCKER/MAJOR fixed in this revision:
  1. (BLOCKER) The E5 experiment was invalid — the runner's arm-switch env
     clear list omitted `POCKET_AUDIT_EARLY_RELEASE` (presence-based), so
     A-arms ran E5-on after the first B-arm; raw `gpu_early_released` marker
     presence (7/8 A-arms) proves the leak. Fixed: E5 "PROVEN NULL" withdrawn;
     harness hygiene repaired (clear-all-audit-vars); clean re-run **e5r**
     (0/8 vs 8/8 marker verification) yields median Δ ≈ −5 ms; the invalid
     e5 and e45 runs are disclosed and unused.
  2. E4's quoted arm medians (195→182.5) were irreproducible — restated with
     convention: nearest-rank 192→180, paired mean Δ −12.1, 8/8 positive.
  3. Window-create extremes corrected (62–78 on the n=24 family; 57–111
     across all traces).
  4. The quiet Reading-B estimate replaced by the honest band 125–153; the
     "already attained in quiet states" phrasing removed; a conditional C7
     path (if a spec'd quiet re-measurement lands >150) documented.
  5. Recheck failures correctly described: 4/20 consecutive runs with normal
     spawn times never reached READY (a no-READY degradation mode), not
     "spawn stalls".
  6. The closing decomposition rebuilt term-by-term from the measured chain
     (sums to 199 ≈ present_done; overlapped boot excluded from the sum).
  7. The cmd/join evidence persisted via the join3 family; console-only
     join2 superseded and disclosed.
  MINOR dispositions: alternating-arms wording; E2 external Δ corrected to
  +97; E3a pair exclusions disclosed (pair 0 now included → median +94;
  symmetric stall-pair exclusion stated); per-arm n added to the oracle
  table; `early_adapter_device` marker was dead in exp runs (POCKET_MEASURE
  unset) — disclosed, E4 verified via phase shift + adapter identity instead;
  `Process.StartTime` granularity and NTP-step caveats added; warm-window
  visibility confound added; 60 Hz post-T2 cadence noted for the idle gate;
  worktree-removal timing corrected; per-family rebuild identity disclosed;
  INVALID_ENVIRONMENT labeling for the degraded windows.

- **BENCHMARK-AND-CAUSALITY-ADVERSARY — REVISE**, 1 BLOCKER + 4 MAJOR +
  8 MINOR (overlapping the above). Verified independently: T2 skip-path
  claim (no code path prints READY without a successful present submission),
  Reading-B fairness against the exact PRD/BENCHMARK wording (both readings
  presented; no weakening-to-win), gate-probe numbers (n=55, 257/315/238,
  zero exclusions), q2 stage table reproduction line-for-line, E3b exact
  reproduction, diff/worktree integrity (sha1 match). Its MAJORs (session
  labeling, join persistence, "already attained" overstatement, recheck
  mischaracterization) are the same items fixed above; its MINORs are
  covered by the same dispositions (plus: e45 and the 20:18 rebuild now
  disclosed in IDENTITY).

No MAJOR correction changed the mechanism verdict: the E5 fix moved its
magnitude from 0 to −5 ms (still TRIVIAL/SMALL, still non-gate-shaping —
both reviewers pre-argued this exact contingency against the verdict), so
per the review protocol no re-review round was required.

Final verdict under both reviews, unchanged: **NO_BOUNDED_CORRECTIVE_EARNED,
no C7.**

STOP. Do not begin Phase B. Do not run a new gate.

## Raw artifacts

`evidence/tmp/logs/audit2-*` (gate CSVs incl. per-run `.run*.tmp` survivors —
leftovers of the archived probe's final cleanup losing to process file locks
on late-exiting runs, not a script variant; join families join2 [console-only,
superseded] and join3 [persisted]; per-condition traces; A/B CSVs incl. the
INVALID e5/e45 runs retained for disclosure),
`evidence/tmp/audit2-*.ps1` (probe/join/exp scripts; the exp runner's env
hygiene was fixed after the e5 leak and the fixed version produced e5r),
`evidence/tmp/audit2-markers-applied.diff` (full instrumentation patch),
`evidence/tmp/audit2-hello/` (generic pre-main control project). The q1 trace
family is a discarded invalid run (missing `POCKETJS_DIST`; kept on disk).

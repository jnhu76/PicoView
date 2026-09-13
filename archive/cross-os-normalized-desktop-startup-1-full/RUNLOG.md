# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — RUNLOG

Living process/conclusion log. Raw per-sample evidence lives beside this file.
Final authority report: `docs/CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1.md` (slim PR).

---

## PHASE 0 — SOURCE IDENTITY FREEZE (recorded before any benchmark)

### PicoView (Windows, product repo)
- remote: git@github.com:jnhu76/PicoView.git (origin)
- branch: main
- HEAD: 491d0a5e277345b2b400e8b7f0647a0057ea59bb
- tree: 53ba7c2f83126a96ff7ac218894e41f615c89c61
- worktree: clean

### PocketJS (Windows working tree = campaign effective tree)
- remote: https://github.com/pocket-stack/pocketjs (origin)
- branch: picoview-c4-present-pacing (local, per C4 campaign)
- HEAD (base): a46eb7e055ef443f5efecdac1cc447a3c1941805  ← expected candidate, CONFIRMED
- tree (base): d12b28b7f0246c5ae1a032af55182113ec2ce86d
- worktree: only untracked `evidence/`, `guest/` (not part of tree identity)

### Experiment instrumentation commit
- Plan: single measurement commit N on top of a46eb7e0, identical on BOTH hosts
  (transferred by git bundle; tree identity verified by `git rev-parse HEAD^{tree}`).
- Scope (measurement plumbing only, no production behavior change):
  1. `hosts/desktop/src/norm.rs` — new: one monotonic origin (E00), experiment-local
     E-series vocabulary (E00–E190), once-per-process semantics, NORMTRACE=1 gated,
     BENCHMARK_CONFIG line, guest artifact identity.
  2. `hosts/desktop/src/main.rs` — marker call sites; force-scale affordance
     (POCKET_FORCE_SCALE, normalized density pin); guest identity capture.
  3. `hosts/desktop/src/gpu.rs` — gpu_policy(): add explicit `POCKET_GPU_BACKEND=VULKAN`
     → (Backends::VULKAN, MemoryHints::MemoryUsage) on ALL platforms; per-OS defaults
     UNCHANGED (stock semantics preserved). Markers E30/E31, E40/E41, E70/E71, E72/E73.
  4. `engine/pocket3d/crates/pocket3d/src/gpu.rs` — norm-mark hook (no-op by default),
     markers E50/E51 (adapter), E60/E61 (device).
  5. `hosts/desktop/build.rs` — embed POCKETJS_GIT_SHA / POCKETJS_GIT_TREE at build time.
  6. `hosts/desktop/examples/norm-a.rs`, `norm-b.rs` — winit-only / winit+normalized-wgpu
     controls (arms A/B), same trace vocabulary.
  7. `hosts/desktop/Cargo.toml` — build-dep none needed; add `pollster = "0.4"`
     (0.4.0 already locked transitively; the package SET is unchanged — the
     lockfile gains only the new dependency edge line).

### Guest identity (arm C)
- Guest source: PicoView `guest/main.octane.tsx` (entry), built artifacts in
  PocketJS `dist/picoview-a6-main.{js,pak}` (PicoView pocket.json output `picoview-a6-main`).
- dist/ is NOT git-tracked → artifacts cross the OS boundary by byte-copy +
  SHA256 equality (verified both hosts). Same artifact bytes = same guest semantics.

### NORMALIZED CONFIG (frozen before Linux runs — Phase 1/2)
- backend: Vulkan (explicit POCKET_GPU_BACKEND=VULKAN on BOTH hosts)
- power preference: LowPower (host default since C1/C2 — same on both)
- memory hints: MemoryHints::MemoryUsage (via VULKAN policy arm on both)
- present mode: Fifo (host default — same code both hosts)
- desired_maximum_frame_latency: 1 (host default — same code both hosts)
- surface format policy: prefer Bgra8Unorm, fallback Rgba8Unorm (same deterministic code)
- alpha mode: CompositeAlphaMode::Auto (same code)
- device features: empty; limits: default (same code)
- force_fallback_adapter: false (same code)
- logical viewport: 720x480 (explicit --viewport 720x480)
- raster density: 1 (explicit --density 1)
- force scale: POCKET_FORCE_SCALE=1.0 on BOTH hosts (pins winit scale override →
  raster 720x480 physical on high-DPI Windows; no-op at scale 1 on Linux)
- guest: picoview-a6-main (identical artifact bytes, SHA256-verified)
- quit: --quit-after 30 on arm C (both hosts) for deterministic self-exit
- n: A=20, B=20, C=50 (>=50 required)

### CLOCK AUTHORITY (Phase 3)
- ONE clock: std::time::Instant (process-local monotonic), origin set at the first
  statement of main() (E00_MAIN_ENTRY = 0 us).
- All NORMTRACE lines carry microseconds from that origin. No wall-clock mixing.
  External spawn→READY wall numbers are NOT used for any internal stage.
- All internal markers: once-per-process (first occurrence), BEGIN/END pairs give
  own durations; completion-from-E00 reported separately.

---

## PROCESS LOG

### [t0] Environment recon
- Linux host 192.168.31.75 (user jnhu): Fedora 44 KDE, kernel 7.1.9-200.fc44.x86_64,
  Xeon E5-2666 v3 (20 logical), 64 GiB RAM (54 GiB avail at recon),
  AMD Radeon RX 580 2048SP (RADV POLARIS10, Mesa 26.1.7; llvmpipe also present),
  KDE Plasma on Wayland (kwin_wayland running), rustc 1.98.1 (48a229cea) —
  EXACTLY the campaign toolchain. Existing checkout ~/Source/pocketjs @ cadffef (main)
  → NOT the campaign tree; will receive bundled instrumented tree in a new worktree.
- Windows host: campaign machine (details in windows-environment section below).
- SSH key auth already established (prior session); NO credentials handled this run.

### Experiment instrumentation commit (AMENDED pre-batch)
- Commit 1: 50e3ed8e8b0a196c0710d39f78458b02d978878a (tree 9e8701b1e9ec48a3317aede7592b34b35b68bf1e)
- Commit 2 (pre-headline correction, before ANY headline sample):
  e15674db1ca9179732c22e5a9a191ba21ebf3e70 (tree f09cf9fa116d3fa92d64f49fec7edf1d088d059e)
  — BENCHMARK_CONFIG moved stdout→stderr so one captured stream holds the
  whole per-run evidence. Applied to BOTH hosts before Linux runs began;
  no headline data existed yet.
- EFFECTIVE EXPERIMENT IDENTITY: PocketJS e15674db / tree f09cf9fa
  (= a46eb7e0 campaign candidate + measurement patch series above).
- Both hosts verified: `git rev-parse HEAD` = e15674db…, `git rev-parse HEAD^{tree}`
  = f09cf9fa… — SOURCE_EQUIVALENCE YES (exact commit equivalence via git bundle).

### Guest artifacts (arm C) — RESOLUTION OF THE TARGET-MISMATCH FINDING
- The dist bundle embeds its resolved target id; the host enforces
  bundle.target == host target (windows-app vs linux-app). Reusing the old
  Windows-built bundle on Linux is IMPOSSIBLE by authority check (and would
  be a protocol violation anyway).
- Official per-target path used on Linux (bun 1.4.2, bun.lock @ e15674db):
  `bun tools/pocket.ts compile --target <T> --manifest guest/pocket.json
  --project-root . --outdir <dir>` with `guest/` a symlink to the PicoView
  guest source (same content as the Windows directory junction).
- EQUIVALENCE PROOF: the windows-app target rebuilt on Linux has a
  BYTE-IDENTICAL pak to the Windows-built artifact
  (sha256 3059416e4ba97e9bab658ce1c72174fee970e87267677ae9465f8def11b10f42).
- STALE-ARTIFACT FINDING: the OLD Windows dist js (345,215 B) was built from
  an OLDER dependency state — it lacks modules present in the frozen tree's
  bun.lock resolution (e.g. the signals core). It is RETIRED. BOTH hosts now
  run bundles built by ONE toolchain state (bun 1.4.2 on Linux):
  * Windows C runs: linux-built windows-app bundle (js cf73383f… 357,862 B,
    pak 3059416e… 304,944 B) at evidence/tmp/cross-os-norm-1/dist-winref/
  * Linux C runs: linux-built linux-app bundle (js 1121043d… 357,860 B,
    pak fc5c957a… 78,576 B) at ~/Source/pocketjs-norm-dist-linux
- The 2-byte js delta = embedded target id string (windows-app vs linux-app).
  The pak delta = per-target official plan glyph density (windows-app plan
  resolves rasterDensity 2 → @2x baked glyphs; linux-app plan → @1x). The
  RUNTIME raster density is pinned to 1 on BOTH hosts by `--density 1` +
  POCKET_FORCE_SCALE=1.0 (verified in BENCHMARK_CONFIG raster_density=1).
- Guest source identity (PicoView @ 491d0a5, sha256):
  main.octane.tsx d36eb4ecd7e9d9e65f6c40d83a3372031d878a436858bdb2d4d5c35ed887e8b9
  app.octane.tsx  cd3f1d3e24bd836c2b098bcbdfdf54ce26b24f7d38c0dc4dd3a4413dd610eef3
  pocket.json     81e139b14f4703dde5c30304da127c20529a2c12bba91c8c0fbadeb59accdc70
  (verified identical bytes on both hosts)

### QUIET-STATE ADMISSIBILITY RULE (declared BEFORE headline collection)
- No cargo/rustc/dnf build processes during the batch (runner gates each run).
- No parallel benchmark/batch on the host.
- No OS update in progress.
- Available RAM > 4 GiB.
- Ambient CPU observed 30 s (1 s samples) before each headline batch.
  Suggested default (P95 < 5%) is NOT naturally satisfiable on the Windows
  host (resident AV QQPCRTP + system processes keep the baseline above it —
  declared BEFORE any measurement). DERIVED THRESHOLD for BOTH hosts,
  applied symmetrically: ambient CPU P95 < 20% over the 30 s window AND no
  5 s sustained window above 25%. Samples from a violating window would be
  labeled INVALID_ENVIRONMENT and excluded from headline percentiles.

### WINDOWS ENVIRONMENT (observed pre-batch)
- Windows 11 专业版 build 26200; Ryzen 7 5800H (16 logical); 28.9 GiB RAM
  (12.2 free at recon); AMD Radeon(TM) Graphics (iGPU) driver 31.0.21923.11000;
  2560x1440 @ 60 Hz; AppliedDPI 96 = 1.00x (force-scale is a no-op here);
  uptime 14.3 h; AV: 腾讯电脑管家系统防护 (QQPCRTP Running), WinDefend service
  stopped (pre-existing condition, recorded; part of Windows reality).

### LINUX ENVIRONMENT (observed pre-batch)
- Fedora 44 KDE Plasma (Wayland, kwin_wayland); kernel 7.1.9-200.fc44.x86_64;
  Xeon E5-2666 v3 (20 logical); 64 GiB RAM; AMD Radeon RX 580 2048SP
  (RADV POLARIS10, Mesa 26.1.7; llvmpipe also installed but Vulkan backend
  is pinned to the RADV device by the driver); rustc 1.98.1 (48a229cea) —
  same toolchain as the Windows campaign baseline.
- Runs are launched over SSH into the user's graphical Wayland session:
  WAYLAND_DISPLAY=wayland-0, XDG_RUNTIME_DIR=/run/user/1000,
  WINIT_UNIX_BACKEND=wayland (pinned).

(to be continued)

---

## PHASE 8 — LINUX COLLECTION (reference host, executed FIRST)

- Machine-state + 30 s ambient observed BEFORE the headline batch:
  ambient n=30 min=5.4% max=13.7% P95=12.4% → quiet gate PASS
  (declared derived threshold P95<20%; suggested 5% not satisfiable on
  Windows and the SAME threshold is applied to both hosts symmetrically).
- Batches: A n=20, B n=20, C n=50 — all samples valid, 0 invalid.
- Runner quiet-gate events (recorded verbatim from the batch transcript):
  B run-8 SKIPPED_BUSY_BUILD (retried clean); C run-12 SKIPPED_BUSY_BUILD
  (retried clean); C run-19 SKIPPED_BUSY_BUILD ×5 (~25 s of a passing
  cargo/rustc/dnf name match, then cleared; run-19 and successors ran after
  the gate cleared). Gate behavior documented; no sample ran while the gate
  was tripped.
- Wayland/kwin session; WINIT_UNIX_BACKEND=wayland pinned.

### LINUX RESULTS (normalized protocol, in-process E00→endpoint)
- A winit-only (n=20):      P50 10.0 ms   P95 11.4 ms   min  9.2  max 11.7  IQR 1.2
- B winit+normalized wgpu (n=20): P50 69.8 ms   P95 72.2 ms   min 62.5  max 80.7  IQR 3.4
- C full PocketJS E00→E190 (n=50): P50 75.7 ms   P95 80.6 ms   min 68.1  max 87.8  IQR 3.2
- Key C own-duration stages (P50): gpu_instance 34.9 ms (executes on the
  side thread OVERLAPPED with the main lane, and is simultaneously ON the
  critical path via the E21→E40 receive wait), runtime_boot 34.1 ms
  (guest_eval 31.2 inside), renderer_acquire 23.9 ms (dominated by waiting
  for the device handle), adapter 19.0, device 3.8, window_create 2.5,
  surface_config 2.1, render 1.5.

## PHASE 9 — LINUX FREEZE

- Frozen (content-hashed by git archive branch later):
  frozen/linux-normalized-summary.json  (A+B+C full summaries)
  frozen/linux-normalized-stages.csv    (C stage table)
  frozen/linux-normalized-environment.md (machine state + ambient record)
- No Linux number will be edited after Windows results except for a proven
  parser bug (would invalidate + rerun Linux, never silently recompute).

## PHASE 10 — WINDOWS COLLECTION (same protocol)

- Pre-batch ambient observation #1 FAILED the declared gate
  (n=30 min=2% max=58% P95=53%) — desktop background load (agent session,
  browser, resident AV QQPCRTP). Recorded as INVALID_ENVIRONMENT window;
  NOT used. Gate-gated collector re-observes in fresh windows and only
  starts batches in a PASS window (threshold unchanged: P95<20%).
- Collection launched with the gate-gated runner; see ATTEMPT lines in
  logs/win/machine-state-batch.txt for the accepted window.

### Pitfall found and corrected (evidence retained)
1. First batch attempt used `Start-Process -WindowStyle Hidden`.
   Result: EVERY C sample failed GPU init with
   `no compatible GPU adapter: ... vulkan not compatible with provided
   surface` — wgpu's Vulkan backend rejects the surface of a hidden HWND,
   and hidden windows also suppress redraw delivery (arm A would never see
   RedrawRequested). All 50 C samples were labeled
   INVALID_ENVIRONMENT and archived at `logs/win/C-invalid-hidden/`
   (arms A/B produced no samples in that attempt — see (2)).
   Correction: visible windows (identical to the Linux/KWin arm), plus a
   verification sample gate before headline batches.
2. Same attempt exposed a runner bug: empty `-ArgumentList` (arms A/B)
   fails PowerShell parameter binding. Fixed with `-join " "`.

### Valid collection
- Gate: VISIBLE-ATTEMPT lines in logs/win/machine-state-batch.txt record the
  accepted ambient window (threshold unchanged, P95 < 20%).
- Fresh per-batch ambient gates + linear-interpolation ambient P95 are now
  mechanized in win-collect-visible.ps1 (REVIEW-1 minors).

### WINDOWS VULKAN WEDGE — autonomous blocker (authoritative evidence)
Onset window: between 23:36 (last successful visible-window run) and
23:53 (first failure), 2026-09-13 local. The successful 23:2x run
(E190 = 166.2 ms) is a single n=1 ungated smoke sample — ONSET-DATING
EVIDENCE ONLY, not a measurement result and not quotable as one.
Symptom: EVERY Vulkan process fails at
`vkGetPhysicalDeviceSurfaceCapabilitiesKHR → ERROR_UNKNOWN` — including
`vulkaninfo` itself (system-wide, tool-independent). The DX12 backend of
the SAME binary works. Win+Ctrl+Shift+B driver reset did NOT clear it.
Display pipeline mode-cycle was not executed (marshaling failed; tool
abandoned). Windows Event Log shows NO display/TDR events in the window
(userspace driver-state wedge, no crash).
Evidence captures (logs/win/wedge-evidence/): vulkaninfo-summary-failing.txt
(captured again at 2026-09-13T16:55Z — wedge still persisting ~1 h after
onset), dx12-positive-control.txt (same binary, DX12, reaches E190),
eventlog-query-output.txt (no display/TDR events).
Autonomous remedies attempted: driver reset (no effect), 15 spaced probes
over 45 minutes (no recovery), gated collector with per-batch ambient
gates (reached verify; the verify sample failed on the wedge, so headline
batches were correctly refused). Machine reboot or AMD driver
reinstall is OUT OF SCOPE for an autonomous run (the operator actively
uses this machine; other agent sessions are live on it).

DISPOSITION: the Windows NORMALIZED arm (backend=Vulkan is mandatory for
the normalized comparison) is BLOCKED on this substrate state. The
honest campaign outcome is:
- Linux normalized reference: COLLECTED, FROZEN, REVIEWED (Rev-1 fixed,
  Rev-2 PASS).
- Windows normalized arm: NOT COLLECTED — BLOCKED_WINDOWS_VULKAN_SURFACE_WEDGE
  (executable evidence retained: vulkaninfo output, invalid-hidden C
  archive, probe log).
- Cross-OS comparison: NOT EXECUTABLE without the Windows arm. No numbers
  are fabricated, reused from historical reports, or substituted (DX12 is
  a different backend family — substituting it would violate the
  normalized-policy authority).

---

## REVIEWER 3 — CAUSALITY: REVISE → fixed

Audit confirmed: no cross-OS causal overclaim, serial-only DAG arithmetic
(re-verified exactly), zero suspect language, both instrumentation commits
measurement-only, no Windows numbers in any frozen artifact, blocked
disposition honest. Fixes applied to this record:
1. MAJOR-1 (stale CSVs): STALE READ by the reviewer — both
   `frozen/linux-normalized-stages.csv` and the slim-PR
   `docs/.../stages-summary.csv` were refreshed BEFORE the reviewer
   finished; verified current: `redraw_delivery,None,...,0` +
   `request_to_present,25,33,...,50`. No data defect shipped.
2. MAJOR-2 (blocker evidence retention overstated): FIXED — explicit
   captures now exist under `logs/win/wedge-evidence/`
   (vulkaninfo-summary-failing.txt re-captured at 16:55Z with the wedge
   still present; dx12-positive-control.txt reaching E190 on the same
   binary; eventlog-query-output.txt).
3. MINOR-1: explicit hardware-mismatch caveat added below.
4. MINOR-2: the 166.2 ms pre-wedge smoke annotated as n=1 onset-dating
   evidence only, not a result.
5. MINOR-3/4: "partial A/B" corrected (A/B produced no samples in the
   hidden attempt); "ready but never reached verify" corrected to
   "reached verify; verify failed".
6. NOTE-1: lockfile wording corrected (package set unchanged; one
   dependency-edge line). NOTE-2: gpu_instance overlap-vs-critical-path
   wording clarified. NOTE-4: carried into the slim report LIMITATIONS.

### HARDWARE-MISMATCH CAVEAT (binding for any future cross-OS delta)
The two hosts differ in CPU class AND GPU type: Linux = Xeon E5-2666 v3
(Haswell-EP class) + Radeon RX 580 2048SP DISCRETE (RADV/Mesa); Windows =
Ryzen 7 5800H (Zen3 APU) + integrated Radeon Graphics (AMD Windows
Vulkan driver). Absolute cross-OS millisecond deltas would be CONFOUNDED
by hardware even after the Windows arm is rerun; only stage-SHAPE
comparison is meaningful, per the experiment protocol.

---

## DELIVERY RECORD

- Archive branch: `archive/cross-os-normalized-desktop-startup-1-full`
  (b8e6f1d + sync 0c5feaa) — 239 files, full raw evidence.
- Slim report branch: `exp/cross-os-normalized-desktop-startup-1-slim` —
  `docs/CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1.md` +
  `docs/cross-os-normalized-desktop-startup-1/{stages-summary.csv,
  source-identity.md}`. DRAFT PR opened; NOT merged. PR #42 untouched
  (KEEP DRAFT).
- No production optimization authorized or performed (measurement series
  only on PocketJS picoview-c4-present-pacing: 50e3ed8e + e15674db).
- Windows-arm rerun procedure (owner, after reboot/driver fix):
  1) `vulkaninfo --summary` must succeed;
  2) rebuild host at e15674db (or descendant) on Windows;
  3) run `win-collect-visible.ps1` (gated, per-batch ambient);
  4) `parse_norm.py A|B|C` per dir;
  5) compare against frozen/linux-normalized-summary.json.

(to be continued)

---

## MID-FLIGHT ADVERSARIAL REVIEW (Reviewers 1+2, before Windows headline)

Launched while the Windows arm was blocked by the Vulkan driver wedge
(below), so fixes could land BEFORE Windows collection.

### REVIEWER 1 — CLOCK/MEASUREMENT: REVISE → fixed
Independent recomputation reproduced ALL frozen Linux numbers exactly
(A/B/C endpoints, all stage stats, DAG file). Findings and disposition:
1. MAJOR — `redraw_delivery` (E130→E131) inverted in arm C: the once-marked
   E131 is consumed by the compositor's initial FRAMELESS redraw callback
   (arrives after surface configure, BEFORE the runtime's first frame), so
   E131 < E130 in 50/50 C runs — the frozen CSV published a bogus −3.27 ms
   P50. FIX (derivation-level; instrumentation untouched): parser now
   excludes END<BEGIN pairs (counted in `excluded_end_before_begin`) and
   adds the meaningful cross-handler delivery stage `request_to_present`
   (E130→E140; C own P50 = 25 µs on Linux). Frozen Linux artifacts were
   RE-DERIVED from the same raw logs with the corrected parser — recorded
   here, not silent; endpoint headline unchanged (75.678/80.581 ms).
   Linux re-collection not required: raw traces are complete; the defect
   was in stage derivation, not data.
2. MINOR — ambient P95 was computed ad hoc (12.4% nearest-rank) vs the
   declared linear-interpolation convention (11.95%). Gate outcome
   unchanged. FIX: `frozen/linux-ambient-p95.txt` now records the
   mechanically computed value; Windows collectors compute it in code.
3. MINOR — one ambient window covered three Linux batches. FIX: Windows
   collector now takes a FRESH 30 s gate before EACH batch.
4. MINOR — no cross-run config-uniformity check. FIX: parser now audits
   every run's BENCHMARK_CONFIG for normalized-field drift
   (`config_uniform`); Linux A/B/C all uniform (0 drift, 1 gpu variant).
5. NOTE — DAG residual-0 is true by construction (contiguous segments);
   the substantive reconciliation is the lane-join evidence, which holds.

### REVIEWER 2 — CROSS-PLATFORM EQUIVALENCE: PASS
Verified live: tree identity e15674db/f09cf9fa (byte-checked embedded
literals in the built exe), normalized GPU policy identical on both OS,
viewport/density pins correct (plan rasterDensity=2 unreachable in C arm),
markers OS-independent (PMv2 blocks are outside all reported stages and
μs-scale), guest artifact decision code-verified (runtime density=1 both
hosts), runner parity (counts, quit-after, sleep, visible windows,
verification gate). Interpretation constraint recorded for the report:
the pak glyph-density delta (@2x vs @1x, +226 KB) is asymmetric guest
CONTENT — `asset_read` / `runtime_boot`-own Windows-vs-Linux deltas must
not be attributed purely to the OS. Runner-robustness minors (no Windows
timeout wrapper; Windows A follows a C verification sample = warm-up
asymmetry) are noted for the LIMITATIONS section.

(to be continued)

---

## PHASE 6 — THREAD-LANE DAG (Linux representative sample)

Median Linux C run (run-019, endpoint 75.8 ms), full lane dump saved at
`frozen/linux-C-dag-median.txt`. Critical-path reconciliation:

| serial segment                        | us      |
|---------------------------------------|---------|
| entry + event loop + window (E00→E21) | 11,992  |
| gpu-instance wait (E21→E40)           | 31,756  |
| gpu setup on main (E40→E73)           | 26,274  |
| first-output wait (E73→E122)          |  3,240  |
| redraw + present (E122→E190)          |  2,550  |
| **serial sum**                        | **75,812** |
| **measured E190 − E00**               | **75,812** |
| residual                              | **0**   |

Notes: the RUNTIME/QUICKJS lane (boot 14.5→48.2 ms, incl. guest eval
31.2 ms) is FULLY OVERLAPPED by the GPU path — it is not on the Linux
critical path. The GPU-INSTANCE side thread (9.5→43.6 ms) IS on the critical
path via the E21→E40 wait. The first compositor redraw (E131, 70.1 ms)
arrives before the runtime's first frame (frameless present early-return);
the real present follows the wake handoff.

(to be continued)

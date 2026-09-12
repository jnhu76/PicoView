# ARCH-A6 Evidence Report

Ticket: [#9 — [ARCH-A6] Prove Per-Monitor DPI V2 on the minimal viewer path](https://github.com/jnhu76/PicoView/issues/9)

**VERDICT: PASS.** The Windows path runs under Per-Monitor DPI Awareness V2
(verified through the real Win32 awareness API on the created window), scale
transitions 100%→200%→100% update the physical window and the raster density
while the logical viewport and the guest's composition state stay invariant,
the pointer-anchored zoom geometry survives both transitions byte-exactly,
and the 200% state is rendered crisp at 2× device pixels — no OS bitmap
stretch, no persistent blur.

## Identity

| Item | Value |
| --- | --- |
| PicoView branch / base | `arch/a6-dpi` from `7bdc705` (A5 merge); A6 commit recorded in the PR |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen Phase-A baseline) |
| PocketJS effective A6 base | `a832dc8e` (A5 effective, branch `picoview-a5-cancel-bounds`) |
| PocketJS A6 branch | `picoview-a6-dpi` = `a832dc8e` + A6 patch (local; Mimosa audit pending before any upstream push) |
| A6 diff scope | `hosts/desktop/src/{main.rs,plan.rs,tests.rs,gpu.rs}`, `hosts/desktop/Cargo.toml` (one feature flag + one already-in-tree crate name); **zero diff** in `contracts/`, `framework/`, `engine/`, `vapor` |
| New dependency note | `raw-window-handle = "0.6"` (windows-only usage): names the crate **already in the wgpu/winit dependency tree**; used solely to read the window HWND for the PMv2 assertion. Plus `Win32_UI_HiDpi` feature on the already-admitted `windows 0.62` crate. No new runtime/decoder/stack |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)`, `stable-x86_64-pc-windows-msvc`; release build |
| Machine (BENCHMARK §1) | AMD Ryzen 7 5800H, 16 logical processors; 28.9 GiB RAM; C: on KIOXIA EXCERIA NVMe SSD; power plan Balanced. Single display: 2560×1440 at 100% scale (96 DPI) — see Limitations |
| GPU | AMD Radeon(TM) Graphics (iGPU), Vulkan/Bgra8Unorm, driver 31.0.21923.11000 |
| Guest | `guest/app.octane.tsx` (Octane); id `dev.picoview.arch-a6-guest`, output `picoview-a6-main`, planHash `sha256:99f70f33a3badacf8d51f2e685a1372e9a5947175ac3d347e2258f0b3f851a7a` (committed as `guest/picoview-a6-main.plan.json`) |
| Scratch evidence | `evidence/tmp/`: `logs/a6-dpi.log` (transition run), `logs/a6-dpi-visual.log` (visual run), `shot-a6-scale2.png` (200% state), `shot-a6-back100.png`/`shot-a6-scale2b.png`; not committed — committed corroboration is the unit tests + quoted log lines |

## What was built (scope)

Minimal runtime-generic DPI machinery, no new seam:

* **PMv2 declaration + verification** (`main.rs`, `resumed`): the host
  calls `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)` before
  window creation (idempotent — winit already requests it; the explicit
  call pins the contract), then queries
  `GetWindowDpiAwarenessContext(hwnd)` +
  `AreDpiAwarenessContextsEqual(…, PER_MONITOR_AWARE_V2)` +
  `GetDpiForWindow` and logs the result. Live evidence:
  `A6EVENT,dpi-awareness,per_monitor_v2=true,windowDpi=96`.
* **One transition handler, two drivers** (`Host::apply_scale`): the real
  OS path (`WindowEvent::ScaleFactorChanged`, a multi-monitor move) and
  the deterministic harness path (`--scale-at SCALE@TICK`, wall-clock
  scheduled) run the same code: record the driven scale (it governs
  every logical↔physical conversion in the host), re-assert the logical
  viewport with `request_inner_size(PhysicalSize(logical × scale))`, and
  notify the runtime (`Input::Scale`).
* **Dynamic raster density** (`gpu.rs` + `Runtime`): the render target
  is `logical × density` where density = `effective_density(plan, scale)`
  — the plan density until a transition is driven, then the window
  scale (rounded, clamped 1..=4). Present therefore stays 1:1 with
  physical client pixels on every monitor: nothing is GPU- or
  OS-bitmap-stretched, so nothing becomes persistently blurry. The core
  `Ui` (fonts/atlas baked at the plan density) is untouched.
* **Coordinate domains made explicit** (code + tests + this report):
  *image coordinates* = texture-space pixels (the bound native resource
  is DPI-independent); *logical viewport coordinates* = the guest's
  layout/composition domain (the invariant across transitions);
  *physical client pixels* = the window's real pixels
  (`logical × scale`); *monitor DPI* = `96 × scale` (96/192 in this
  proof). `logical_from_physical` and `effective_density` are pure
  functions, unit-pinned.
* **Guest**: the `resize` message gains optional `dpi`/`density` scalars
  (bounded, additive). The guest records the monitor truth, reports its
  composition box unchanged, and recomputes NOTHING — logical stability
  is the design, not a workaround.
* No UI Automation / accessibility layer (criterion 7): zero diff outside
  the desktop host; no tree/automation APIs touched.

## Transition proof (MEASUREMENT + FACT)

Run `a6-dpi.log` (release binary, live window, 24 MP sample, zoom `=`
at tick 100, `--scale-at 2.0@400 --scale-at 1.0@900`, `--trace-frames`,
quit 1600, exit 0):

```
A6EVENT,dpi-awareness,per_monitor_v2=true,windowDpi=96
A6EVENT,scale,2,logical=720x480,tick=400
A6EVENT,physical,1440x960,scale=2,logical=720x480
A6EVENT,raster,density=2,scale=2,logical=720x480
A6EVENT,scale,1,logical=720x480,tick=900
A6EVENT,physical,720x480,scale=1,logical=720x480
A6EVENT,raster,density=1,scale=1,logical=720x480
```

FACT, per the log: the OS window physically became 1440×960 client
pixels at 200% and 720×480 at 100% (`A6EVENT,physical` lines are the
winit `Resized` reports of real OS size); the logical viewport is
`720x480` through both; the raster density followed (1→2→1). No stale
prior-scale transform exists anywhere in the chain — each stage is
derived from the current scale and the invariant logical viewport.

## Pointer-anchored zoom across transitions (FACT)

The guest acks its composition box after every view change and after
every DPI transition (`a3ack`, logical coordinates). From the same run:

| Ack | req | geom (logical) |
| --- | --- | --- |
| Fit bound | `r1` | `[68.75, 0, 742.5, 495]` |
| Zoom 1.25× at pointer (tick 100) | `zoom-1` | `[-24.0625, -61.875, 928.125, 618.75]` |
| After 100%→200% | `dpi-192` | `[-24.0625, -61.875, 928.125, 618.75]` |
| After 200%→100% | `dpi-96` | `[-24.0625, -61.875, 928.125, 618.75]` |

FACT: the composition box — and therefore the image-space point under
the pointer, `u = (ax − bx) / bw` — is **byte-identical across both DPI
transitions**. The zoom anchor survives because the entire composition
is logical; there is no physical-space state to go stale.

## Visual acceptance (OPERATOR ATTESTATION, scratch screenshot)

`shot-a6-scale2.png` (200% state): window at 1440×960 physical; the
logical layout fills it at exactly 2× (title, hud, image, status line
all crisp — rendered from a 1440×960 raster blitted 1:1, zero
stretching); the status line reads "A6: scale transition —
logical=720x480 dpi=192 density=2 (composition unchanged,
box=(-24.1,-61.9,928.1,618.8))". The post-return capture shows the
720×480 window back at density 1, equally crisp at 1:1. No persistent
blur in either state; a transient OS toast from an unrelated background
app (Docker Desktop/WSL) overlaps the lower-right corner of the scratch
capture and is not PicoView content.

## Tests

`cargo test --release` (hosts/desktop): **28 passed / 0 failed /
1 ignored** (26 prior + 2 new):

* `a6_logical_viewport_is_stable_across_scale_changes` — round-trip
  `physical = logical × scale → logical_from_physical` is the identity
  at scales 1.0/1.25/1.5/2.0; clamps preserved.
* `a6_effective_density_follows_window_scale_when_driven` — plan density
  authoritative without a driven scale; driven scale rounds and clamps
  (1.25→1, 1.5→2, floor 1, ceiling 4).

`engine/core` untouched by the A6 diff (132/0 for the record, A4 run).

## Limitations (stated, not hidden)

* **Single-display host**: this machine has one 2560×1440 monitor at
  100%. The physical multi-monitor move was therefore not exercised;
  instead the scripted path drives the *same* `apply_scale` handler the
  real `ScaleFactorChanged` event delivers, and the physical window
  resize is real (OS `SetWindowPos` via `request_inner_size`, real
  `Resized` reports at 1440×960). What is NOT exercised on this
  hardware is Windows' own WM_DPICHANGED delivery between monitors.
  The real-event arm is wired to the identical handler; GATE-A may
  require a two-monitor re-run on different hardware if it judges the
  OS-delivery leg load-bearing.
* The scripted schedule runs on the host wall clock (nominal 60 Hz
  ticks from process start) because a static image produces no output
  ticks for a host-side scheduler to observe — documented in code.
* Fractional scales (125%/150%) are pinned at the unit-test level
  (conversion + density rounding) but were not driven live in this
  ticket; the mechanism is scale-agnostic.

## Known non-blocking findings (MINOR, recorded)

* `A6EVENT,physical/scale/raster` lines are emitted only after the
  first driven transition (`scale_driven` gate) to keep normal runs'
  stderr unchanged.
* `Input::Resize` still ignores geometry in `--fixed` mode (pre-existing);
  `Input::Scale` intentionally applies regardless (density policy is
  orthogonal to user resizability).
* The probe-only `A6EVENT` trace lines use the epoch-less format; the
  A7 monotonic-clock instrumentation work will fold timestamp discipline
  for all harness events.

## Acceptance criteria map

| Criterion (issue #9) | Evidence |
| --- | --- |
| Declares/uses PMv2-compatible behavior | `A6EVENT,dpi-awareness,per_monitor_v2=true` via real Win32 awareness API; explicit `SetProcessDpiAwarenessContext` |
| 100%→200%→100% updates geometry without stale transforms | physical 720×480→1440×960→720×480; logical/raster lines derived from current scale each time |
| Logical layout stable while physical changes | logical=720x480 through both transitions; guest box unchanged |
| Pointer-anchored zoom preserves anchor across transition | zoom-1 / dpi-192 / dpi-96 geoms byte-identical |
| No persistent OS-bitmap blur | raster density follows scale (1→2→1), present 1:1; 200% screenshot crisp |
| Proof distinguishes image/logical/physical/DPI domains | domain definitions in report + code; conversion + density functions unit-pinned |
| No UI Automation layer introduced | diff scope: desktop host + guest harness only |

## Verdict

PASS. Minimal PMv2 correctness is proven on the real Windows viewer path
with the A4 image resource; no budget was weakened, no Phase B work was
pulled forward. The single-display limitation is stated above and handed
to GATE-A for a judgment on whether an OS-delivered WM_DPICHANGED re-run
on two-monitor hardware is additionally required.

Single next issue: **#15 (ARCH-A7, footprint/startup/idle)** — already
`ready-for-agent`; campaign proceeds with it. GATE-A (#11) remains last.

## Evidence identity note

Scratch logs/screenshots live in `evidence/tmp/` and are deliberately not
committed; the report quotes the load-bearing lines and the committed test
suite reproduces every mechanism claim. If this report and the tracker
disagree, the tracker wins.

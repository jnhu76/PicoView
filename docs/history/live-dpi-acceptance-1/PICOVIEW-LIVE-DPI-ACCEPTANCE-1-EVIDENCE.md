# PICOVIEW-LIVE-DPI-ACCEPTANCE-1 — Evidence

Status: **IN PROGRESS** — Phase 0/1 complete, Phase 2 (100% baseline) complete,
Phase 3 (125/150/200%) pending user-assisted display-scale changes.

Campaign: deferred live-DPI acceptance for PicoView on Windows 11. This is an
acceptance/evidence campaign; no code changes are expected. Authority chain:
PRD v0.6 (user-visible meaning), ARCHITECTURE.md §Dynamic viewport (line 886)
and §sampling (line 72), PocketJS shared R1 geometry/blit contract (in-tree
subtree), `docs/BENCHMARK.md` (evidence identity).

---

## 1. Evidence identity (BENCHMARK §1)

| Field | Value |
| --- | --- |
| PicoView commit | `21151a2b08ad92a4577cf9c9931d49db579cfbd7` (= `main` = `origin/main` at campaign start) |
| Branch | `verification/live-dpi-acceptance-1` |
| PocketJS provenance | `POCKETJS.lock` revision `720e6ee3ed91d53038ae6c6330420bb46dabca30` (`integration/picoview-desktop`, git-subtree-squash at `third_party/pocketjs`) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01) x86_64-pc-windows-msvc`, `cargo 1.98.1`, `bun 1.2.8` (guest compile), TypeScript 5.9.3 (subtree-pinned) |
| Build | `cargo build --release` from clean `native/target`, finished 2m08s; `cargo test --release`: **64 passed, 0 failed** |
| Guest bundle | `pocket.ts compile --target windows-app` → `dist/picoview.js` 391 267 B + `dist/picoview.pak` 673 184 B (17 entries, icons baked 64×64 @2x sampled linear) |
| Host | machine `HU`, Windows 11 专业版 10.0.26200 build 26200 |
| CPU / RAM | 16 logical processors, 28.9 GB |
| GPU | AMD Radeon(TM) Graphics, driver 31.0.21923.11000; PicoView capability line `adapter_max_tex2d=16384 device_max_tex2d=16384` |
| Display | single monitor 2560×1440 @ 60 Hz |
| Corpus | `C:\img\001R0E0aly1i50ph1thhjj66dc48w1l102.jpg` (JPEG 8256×5504, 5 247 191 B, full-resolution admitted, `fullResolution=true`); `C:\img\153fcfe9-…png` (PNG 1254×1254, full-resolution) |
| Native Windows | all measurements executed as native Windows processes (no WSL) |

## 2. Phase 0 — topology record (pre-flight, non-privileged)

`probe-topology.ps1` (read-only; `SetProcessDpiAwareness(2)` + `GetDpiForMonitor`
MDT_EFFECTIVE_DPI + `Screen.AllScreens`), output verbatim:

```text
machine=HU
os=Microsoft Windows 11 专业版 version=10.0.26200 build=26200
cpu_logical=16 ram_gb=28.9
gpu=AMD Radeon(TM) Graphics driver=31.0.21923.11000 refresh_hz=60 mode=2560x1440
monitor[0] device=\\.\DISPLAY1 primary=True bounds=0,0 2560x1440 work=0,0 2560x1392 bits=32 get_dpi_hr=0 effective_dpi=96 raw_dpi=108 raw_hr=0 scale=1
monitor_count=1
distinct_scales=1
timestamp=2026-09-19T15:28:40.0115534+08:00
```

Consequences for the campaign plan:

- The machine is a **single monitor at 100% scale**. Policy A (existing
  multi-monitor different-scale setup) is **unavailable**.
- All live scale changes therefore go through policy B (user-assisted
  Windows Settings → System → Display → Scale). No registry/programmatic DPI
  manipulation (policy C) is used.
- 100% baseline evidence class is **COLD_START_AT_SCALE** (the OS was already
  at 100% before every baseline launch); genuine live transitions are only
  reachable in Phase 3 when the user changes scale while PicoView is running.

## 3. Phase 1 — geometry oracle (frozen before runtime testing)

### 3.1 Contract sources (exact, current code)

- `third_party/pocketjs/hosts/desktop/src/geometry.rs:90,114-123` — Dynamic
  policy: `logical = round(measured_physical / live_scale)` per axis, clamped
  to the manifest viewport min/max.
- `guest/pocket.json` `viewport.dynamic`: `default [960,640]`, `min [384,240]`,
  `max [4096,4096]`; `ARCHITECTURE.md:887` — `Host.viewport` is only the
  initial/default requested logical size; Product window minimum 384×240.
- `third_party/pocketjs/hosts/desktop/src/geometry.rs:135-143` — retained child
  surface: `(logical × live_scale).round()` per axis (min 1). The live OS scale
  is used, never the package density.
- `third_party/pocketjs/engine/crates/pocket-ui-wgpu/src/blit.rs:37-62` —
  `BlitFilter::select`: retained == swapchain → **Exact → Nearest**; otherwise
  **Transient → Linear** (transient size bridge only while an exact frame is
  pending; R3 latest-wins producer semantics upstream in
  `native/src/runtime.rs` + `native/src/presentation.rs`).
- Package raster density is asset/cook authority only — physical truth is
  **never** derived as `logical × package_density`.

### 3.2 Expected matrix (requested logical client 960×640)

| Live OS scale | Expected measured physical client | Expected resolved logical | Expected settled retained/swapchain | Settled policy / filter |
| --- | --- | --- | --- | --- |
| 100% (1.00) | 960 × 640 | 960 × 640 | 960 × 640 | Exact / Nearest |
| 125% (1.25) | 1200 × 800 | 960 × 640 | 1200 × 800 | Exact / Nearest |
| 150% (1.50) | 1440 × 960 | 960 × 640 | 1440 × 960 | Exact / Nearest |
| 200% (2.00) | 1920 × 1280 | 960 × 640 | 1920 × 1280 | Exact / Nearest |

Invariants for every accepted state:

1. `resolved_logical == round(measured_physical / live_os_scale)` per axis
   (the existing integer/rounding contract; f64 round-half-away-from-zero).
2. `retained == round(resolved_logical × live_os_scale)` per axis at settle.
3. At settle: `retained == swapchain`, policy `Exact`, filter `Nearest`.
   During a live transition Transient/Linear is permitted and must not persist
   after the final geometry settles; the final live DPI event must not be lost
   under channel backpressure (R3 latest-wins holds).
4. Win32 may deliver the client area ±1 px against the ideal product; the
   oracle is evaluated against the **measured** physical client via
   invariant 1, never against the ideal column alone.

Every accepted state records: measured physical client, OS scale
(`GetDpiForMonitor` MDT_EFFECTIVE_DPI / 96), window DPI (`GetDpiForWindow`),
resolved logical (app log `R1 presentation update`), retained target +
swapchain size + policy + filter (app log `R1 present:`), zoom %, Full/Proxy,
and evidence class.

### 3.3 Harness

`evidence/live-dpi-acceptance-1/dpi_acceptance.py` (gitignored scratch):
launches `native/target/release/picoview.exe` with stderr→log
(`RUST_LOG=info`), records geometry via `GetClientRect`/`ClientToScreen`/
`GetDpiForMonitor`/`GetDpiForWindow` from a per-monitor-DPI-aware probe
process, drives keyboard intents via posted messages and pointer interaction
via **real** input (`SetCursorPos` + `mouse_event` — see §5.4), captures
`PrintWindow(PW_RENDERFULLCONTENT)` screenshots, and evaluates invariant 1–3
per step (`oracle_check`). `observe` mode samples geometry + app-log R1 lines
into JSONL for live-transition capture (Phase 3).

## 4. Phase 2 — 100% baseline (evidence class: COLD_START_AT_SCALE ×5 runs)

Command shape: `picoview.exe --title PicoView C:\img\001R0E0aly1i50ph1thhjj66dc48w1l102.jpg`
(default requested logical 960×640, Dynamic policy, package_density=2 — cook
authority only). Boot log line per run:

```text
R1 runtime booted: policy=Dynamic initial_requested=960x640 logical=960x640 physical=960x640 live_scale=1 package_density=2 usable_image_dim=16384
current-item open: source=8256x5504 resource=8256x5504 fullResolution=true
```

### 4.1 Geometry oracle results (all states, 5 runs)

| State | measured physical | scale | expected logical | log logical | inv 1 | retained / swapchain | settle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| boot | 960 × 640 | 1.00 | 960 × 640 | 960 × 640 | PASS | 960×640 / 960×640 | Exact / Nearest |
| Fit (`0`) | 960 × 640 | 1.00 | 960 × 640 | 960 × 640 | PASS | 960×640 / 960×640 | Exact / Nearest |
| 1:1 (`1`) | 960 × 640 | 1.00 | 960 × 640 | 960 × 640 | PASS | 960×640 / 960×640 | Exact / Nearest |
| pan drag | 960 × 640 | 1.00 | 960 × 640 | 960 × 640 | PASS | 960×640 / 960×640 | Exact / Nearest |
| resize → 1200×800 | 1200 × 800 | 1.00 | 1200 × 800 | 1200 × 800 | PASS | 1200×800 / 1200×800 | Exact / Nearest |
| resize → 760×520 | 760 × 520 | 1.00 | 760 × 520 | 760 × 520 | PASS | 760×520 / 760×520 | Exact / Nearest |
| next / prev | 760 × 520 | 1.00 | 760 × 520 | 760 × 520 | PASS | 760×520 / 760×520 | Exact / Nearest |
| zoom 85% | 960 × 640 | 1.00 | 960 × 640 | 960 × 640 | PASS | 960×640 / 960×640 | Exact / Nearest |
| zoom 127.5% | 960 × 640 | 1.00 | 960 × 640 | 960 × 640 | PASS | 960×640 / 960×640 | Exact / Nearest |

Resize policy stream (run A, 17 presents): `Exact×7, Transient, Exact, Exact,
Transient, Exact…` — Transient/Linear appears only as the size bridge between
a settled frame and a changed swapchain, and every observed settle returns to
Exact/Nearest. R3 latest-wins coalescing held: no lost final resize event, no
persistent mismatch.

### 4.2 Product/visual results at 100%

- **Toolbar / Remix icons** (shot-boot): Open, Zoom Out, Zoom In, Fit, `1:1`,
  Rotate, Flip Horizontal, Flip Vertical render crisp and centered at 24×24 in
  36×36 hit targets; no clipping, no fuzzy secondary scaling, no malformed SVG.
  Disabled-state recognition: at 1/2 the left (previous) edge chevron is
  hidden and at 2/2 the right chevron disappears (`canPrevious`/`canNext`).
  The `1:1` toolbar text is visually centered.
- **Typography** (12/14): status bar text renders sharp at 100%.
- **Fit / minification**: 8256×5504 source fit into 960×640 client →
  `Fit · 10.39%`, full-resolution GPU path (mip chain), no false-Proxy label.
- **Actual Size / 1:1**: `1` key → `100%`, image inspected at native image
  pixels 1:1 against physical client pixels (truthful at scale 1.00;
  `can100` gate = `fullResolution=true`).
- **Editable Zoom %**: click on the status-bar zoom label opens the exact
  edit; typing `85` → `85%`, typing `127.5` → `127.5%` (decimal accepted,
  0.01% quantization). Observation (not a defect, no redesign during
  acceptance): the editor opens prefilled with the current value; typed digits
  append unless cleared first.
- **Pan**: real-input drag at 1:1 pans the view; zoom label stays `100%`;
  each drag frame requested a render (21 render requests across run B) with
  Exact settle afterwards.
- **Previous / next**: `→` opens item 2/2 (PNG 1254×1254, `Fit · 36.04%`),
  `←` returns to 1/2; status bar updates `1 / 2` ↔ `2 / 2`.

Per-run raw artifacts (logs, summary.json, screenshots) live under
`evidence/live-dpi-acceptance-1/run-*` (gitignored scratch). Curated
screenshots referenced above are committed next to this file.

## 5. Findings & tooling notes (baseline)

1. **Geometry/presentation contract: PASS at 100%** for every recorded state.
2. **Posted mouse messages do not reach the pointer path** (no pointer
   events, no render requests); posted keyboard messages do. The harness uses
   real input for all pointer interaction. Recorded as a harness/tooling fact,
   not a product defect.
3. **Zoom editor prefill**: opens with the current value; digits append unless
   cleared. Recorded as a UX observation for the Product backlog, no redesign
   during acceptance.
4. No UAC prompt appeared at any point (Settings-level scale changes are
   per-user and do not elevate; no registry edits were made or needed).

## 6. Phase 3 runbook — 125% / 150% / 200% (pending; user-assisted)

Mission note: the campaign brief was truncated mid-§C in transmission; the
section list below reconstructs D–H from the mission's stated verification
targets (Remix icons, 12/14 typography, Fit/minification, resize smoothness,
editable Product Zoom %, truthful Actual Size / 1:1, pointer/pan). Sections:

- **A. Boot / geometry** — fresh launch at the stable scale; verify
  §3.2 matrix row + `R1 runtime booted` / `R1 presentation update` /
  `R1 present:` lines; no permanent retained/swapchain mismatch.
- **B. Live scale transition** — with PicoView running (`observe` mode
  attached), change Windows scale; verify the event flow
  `Windows scale event → measured physical → Input::Presentation → Dynamic
  resolve → guest logical resize → render → Exact settle`; Transient/Linear
  permitted mid-transition, Exact/Nearest required at settle; final live DPI
  event must not be lost; then a fresh cold start at the same scale.
- **C. Toolbar / Remix icons** — same checklist as §4.2 at the target scale:
  centered, unclipped, no asymmetric scaling, no fuzziness from accidental
  secondary scaling, hit targets product-consistent, disabled states
  recognizable, `1:1` text centered. No icon redesign during acceptance.
- **D. Typography** — 12/14 px status/toolbar text crisp and correctly
  positioned at fractional scales.
- **E. Image Fit / minification** — Fit of the 8256×5504 source at the target
  scale; minification quality via the R2 mip path; no false Proxy.
- **F. Resize smoothness** — resize across ≥2 sizes; Transient/Linear during
  the drag, Exact/Nearest at settle; no stuck Linear.
- **G. Editable Zoom % / truthful Actual Size** — zoom edits 85% and 127.5%
  apply exactly; 1:1 gate (`can100`) truthful; no false 100% / incorrect
  DPI-image scale (AGENTS hard stop).
- **H. Pointer / pan** — real-input drag pans correctly at the target scale;
  no coordinate drift between logical pointer space and image space.

Evidence classes recorded per scale: `LIVE_TRANSITION` (scale change while
PicoView is running) + `COLD_START_AT_SCALE` (fresh launch after the change).
Minimum acceptance per the brief: cold-start at all three scales + at least
one genuine live transition. No scale value is ever constructed in code.

UAC gate: if any step presents (or would present) a UAC prompt, the campaign
stops immediately and reports `UAC_REQUIRED` with the exact operation.

### USER_ACTION_REQUIRED (first gate)

```text
USER_ACTION_REQUIRED:
  Set Windows display scale to 125%
  (Settings → System → Display → Scale)
  Then tell me "125 ready"
```

After that, the remaining scales follow the same pattern (150%, then 200%).

## 7. Evidence index

- `probe-topology.ps1` — Phase 0 topology probe (this directory, scratch).
- `dpi_acceptance.py` — Phase 1–3 harness (scratch).
- `run-p2-zoom-edits/`, earlier `run-*` outputs — raw logs + JSON summaries +
  screenshots per step (scratch).
- Committed screenshots (this directory): baseline toolbar/status/Fit
  (`phase2-100-boot.png`), 1:1 (`phase2-100-one2one.png`), pan at 100%
  (`phase2-100-pan.png`), resize to 1200×800 logical
  (`phase2-100-resize-1200x800.png`), next-item (`phase2-100-next.png`),
  85% (`phase2-100-zoom-85.png`), 127.5% (`phase2-100-zoom-1275.png`).

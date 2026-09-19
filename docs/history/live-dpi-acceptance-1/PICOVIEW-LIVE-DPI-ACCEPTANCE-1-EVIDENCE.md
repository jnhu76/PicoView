# PICOVIEW-LIVE-DPI-ACCEPTANCE-1 — Evidence

Status: **COMPLETE — ACCEPTANCE PASS**. Cold-start acceptance at 100% /
125% / 150% / 200% all PASS; two genuine live transitions (200→150→100)
PASS with full event-flow verification. No code changes required or made.
Final summary in §9.

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

## 6. Phase 3 — 125% (evidence class: COLD_START_AT_SCALE; LIVE_TRANSITION deferred to next change)

OS state verified before testing (`probe-topology.ps1`):
`effective_dpi=120 scale=1.25 distinct_scales=1.25` (Windows Settings change
made by the user at 2026-09-19 ≈16:4x +08:00; no registry, no elevation).

### 6.1 Section A — boot / geometry (PASS)

Boot log (fresh launch, requested logical 960×640):

```text
R1 runtime booted: policy=Dynamic initial_requested=960x640 logical=960x640 physical=1200x800 live_scale=1.25 package_density=2 usable_image_dim=16384
```

This is exactly the §3.2 matrix row for 125%: measured physical 1200×800,
resolved logical 960×640 (`round(1200/1.25)`, `round(800/1.25)`), live OS
scale (not package density 2) driving the derivation. Status bar shows
`dpi 1.25`; guest `Fit · 12.99%` == baseline `10.39% × 1.25` (image Fit is
image-space; the logical viewport grew 1.25× in physical terms).

Oracle results (9 states, run `p3-125` + corrected runs `p3-125b/c`):
all `logical_invariant_ok=true`, all settled `settle_exact_ok=true`
(retained == swapchain, Exact / Nearest). Resize to physical 1440×900 →
logical 1152×720, settled retained/swapchain 1440×900 Exact/Nearest.
Resize policy stream (37 presents): `Exact` + `Transient` only as the
mid-resize bridge; no persistent mismatch; R3 latest-wins held.

### 6.2 Sections C–H — product behavior at 125% (PASS)

- **C. Toolbar / Remix icons** (`phase3-125-boot.png`): crisp and centered at
  1.25× (24 logical px → 30 physical px), no clipping, no asymmetric scaling,
  no fuzziness from secondary scaling, `1:1` text centered, edge chevrons
  appear only when navigation is available.
- **D. Typography**: 12/14 px status/toolbar text sharp at fractional scale.
- **E. Fit / minification**: 8256×5504 source fit into 1200×800 physical
  client at `Fit · 12.99%`, full-resolution path, no false Proxy.
- **F. Resize smoothness**: physical 1200×800 → 1440×900; Transient/Linear
  during the transition, Exact/Nearest at settle.
- **G. Editable Zoom % / truthful Actual Size**: `85%` and `127.5%` applied
  exactly (labels `85%`, `127.5%`; decimal accepted). 1:1 → `100%` with
  native image pixels (fullResolution, `can100` gate truthful). Product Zoom
  is image-space: at dpi 1.25 the image pixel scale is unchanged by the OS
  scale, presentation scales through the retained target.
- **H. Pointer / pan** (`phase3-125-pan-1to1.png`): real-input drag pans at
  1:1; no logical/physical pointer drift observed.

### 6.3 Harness notes at 125% (tooling, not product)

- The zoom-label click coordinate must be taken against the **current**
  physical client size, and the label must be in its wide `Fit · N%` state
  for a deterministic hit. One run with a stale coordinate missed the label;
  the typed `1` then legitimately fired the `1:1` keyboard intent (label
  `100%`) — retested with a Fit reset before each edit: `85%`/`127.5%`
  applied exactly. Recorded as harness coordinate fragility; the keyboard
  fallback it exposed is itself correct product behavior.

### 6.4 Evidence class accounting (final)

- 125% acceptance: **COLD_START_AT_SCALE** (the user changed scale and signed
  out; see §7.4 — the 125→150 "live transition" first attempted was actually
  a session logoff, which terminated the running instance).
- Genuine **LIVE_TRANSITION** evidence was captured later, per §7.3 and §8.3:
  200%→150% and 150%→100% with PicoView running and an observer attached
  (standard-preset scale changes apply immediately; only the Windows
  *custom-scaling* page requires a sign-out).

## 7. Phase 3 — 150% (evidence classes: COLD_START_AT_SCALE + LIVE_TRANSITION)

### 7.1 OS state

`probe-topology.ps1` after the user's change: `effective_dpi=144 scale=1.5`
(verified before testing; the change itself was user-assisted in Windows
Settings, no registry, no elevation).

### 7.2 Sections A/C–H — cold start at 150% (PASS)

Boot log (fresh launch, requested logical 960×640):

```text
R1 runtime booted: policy=Dynamic initial_requested=960x640 logical=960x640 physical=1440x960 live_scale=1.5 package_density=2 usable_image_dim=16384
```

Exactly the §3.2 matrix row for 150%. Oracle results (11 states):
`logical_invariant_ok=true` and settled `Exact/Nearest` on every state —
boot, Fit, 1:1, pan, resize to physical 1728×1080 (logical 1152×720),
next/prev, and zoom edits `85%` / `127.5%` applied exactly. Status bar
`Fit · 15.59%` == baseline `10.39% × 1.5` (image-space zoom, unchanged by OS
scale); `dpi 1.5` shown. Icons/typography crisp at 1.5×
(`phase3-150-boot.png`, `phase3-150-zoom-1275.png`).

### 7.3 LIVE_TRANSITION 200% → 150% (PASS)

With PicoView running (`observe` attached, JSONL
`transition-live-200to150to100.jsonl`, app log excerpts verbatim):

```text
[337479.2ms] ScaleFactorChanged 1.5
[337489.3ms] R1 presentation update: logical=1280x683 physical=1920x1025 os_scale=1.5   <- transient: new scale + old physical
[337514.0ms] R1 render request: logical=1280x683 physical=1920x1025 live_scale=1.5      <- superseded below (R3 latest-wins)
[337515.1ms] R1 presentation update: logical=960x513 physical=1440x769 os_scale=1.5     <- OS resized window, logical preserved
[337533.4ms] surface reconfigure 1920x1025 -> 1440x769
[337552.5ms] R1 present: retained=1920x1025 swapchain=1440x769 policy=Transient filter=Linear   <- size bridge
[337571.3ms] R1 render request: logical=960x513 physical=1440x769 live_scale=1.5
[337577.2ms] R1 present: retained=1440x769 swapchain=1440x769 policy=Exact filter=Nearest       <- settled
```

Verified: the event flow
`ScaleFactorChanged → measured physical → Input::Presentation → Dynamic
resolve → guest logical resize → render → Exact settle`; Transient/Linear
only as the size bridge; the final live DPI event was not lost; the render
requested at the transient geometry (1280×683) was superseded by the newer
presentation input without wasted submission (R3 latest-wins held); no
permanent retained/swapchain mismatch. The window's logical size (user had
resized to 960×513 logical at 200%) was preserved across the hop:
1920×1025 @2× → 1440×769 @1.5× → both = 960×513 logical.
Post-transition UI: `Fit · 12.13% | dpi 1.5`, crisp
(`phase3-live-150-after.png`).

### 7.4 Session-logoff incident (reclassified — NOT a DPI defect)

The first 125→150 attempt ended with the running PicoView disappearing with
no log output, no panic, and no WER crash record. The exit-code watcher
(launched for reproduction) recorded the ground truth when the user repeated
the flow for 200%:

```text
exit_code = 1073807364 (0x40010004)   <- Windows session-logoff process termination
```

`0x40010004` is the standard termination code for user-session logoff. The
user confirmed the workflow: their scale changes used the Windows
**custom-scaling** page, which applies only after sign-out — the sign-out
terminated PicoView. Reclassified: no DPI-transition defect; the 125→150 and
150→200 "transitions" were session ends, and the subsequent acceptances are
correctly classified COLD_START_AT_SCALE.

## 8. Phase 3 — 200% (evidence classes: COLD_START_AT_SCALE + LIVE_TRANSITION)

### 8.1 OS state

`probe-topology.ps1`: `effective_dpi=192 scale=2` before testing.

### 8.2 Sections A/C–H — cold start at 200% (PASS)

Boot log: `logical=960x640 physical=1920x1280 live_scale=2` — the §3.2
matrix row for 200%. Oracle results (11 states): all green; resize to
physical 1920×1200 (logical 960×600); zoom edits `85%` / `127.5%` applied
exactly; status bar `Fit · 20.78%` (== 10.39% × 2), `dpi 2`; icons and
12/14 typography crisp at 2×.

### 8.3 LIVE_TRANSITION 150% → 100% (PASS)

Same observer session, verbatim:

```text
[478735.6ms] ScaleFactorChanged 1
[478742.2ms] R1 presentation update: logical=1440x769 physical=1440x769 os_scale=1   <- transient: new scale + old physical
[478763.1ms] R1 render request: logical=1440x769 physical=1440x769 live_scale=1
[478765.5ms] R1 presentation update: logical=960x513 physical=960x513 os_scale=1     <- OS resized window, logical preserved
[478783.6ms] surface reconfigure 1440x769 -> 960x513
[478799.1ms] R1 present: retained=1440x769 swapchain=960x513 policy=Transient filter=Linear
[478807.6ms] R1 present: retained=960x513 swapchain=960x513 policy=Exact filter=Nearest      <- settled
```

Across the full sequence the retained logical client stayed 960×513:
1920×1025 @2× → 1440×769 @1.5× → 960×513 @1×. Post-transition UI:
`Fit · 8.09% | dpi 1`, crisp (`phase3-live-100-after.png`).

### 8.4 Press-path verification at 200% (manual; harness limitation recorded)

Synthetic harness clicks (SetCursorPos + mouse_event) did not trigger guest
presses at 200% in one session (toolbar `1:1` and status-bar zoom label),
while the same synthetic clicks worked at 100/125/150% and real drags (pan)
worked at 200%. Root cause was environmental, not product: after
repositioning the window fully on-screen, synthetic clicks opened the zoom
editor, and the user's manual clicks at 200% were verified working (toolbar
`1:1` applies, zoom label enters edit state). Recorded as a harness
positioning requirement: the harness now repositions the window fully
on-screen after launch. No product defect.

## 9. Final acceptance summary

| Scale | Cold start (A/C–H) | Live transition | Evidence class |
| --- | --- | --- | --- |
| 100% | PASS (baseline, §4) | target of 150→100 hop (§8.3) | COLD_START + LIVE_TRANSITION |
| 125% | PASS (§6) | n/a (not exercised live) | COLD_START_AT_SCALE |
| 150% | PASS (§7.2) | PASS as target of 200→150 (§7.3) | COLD_START + LIVE_TRANSITION |
| 200% | PASS (§8.2) | PASS as source of 200→150 | COLD_START + LIVE_TRANSITION |

Mission minimum (cold-start at 125/150/200 + ≥1 genuine live transition):
**exceeded** — cold-start PASS at all four scales plus two genuine live
transitions (200→150, 150→100) with full event-flow verification. All
geometry oracle invariants held at every recorded state across all scales;
every settle returned Exact/Nearest; no final live DPI event was lost; R3
latest-wins held. Product-behavior sections (Remix icons, 12/14 typography,
Fit/minification via R2 mips, resize smoothness, editable Product Zoom %,
truthful Actual Size, pointer/pan) verified at every scale; zoom editor
press verified manually at 200%. No code changes were made; no UAC prompt
appeared at any point; no registry or programmatic DPI manipulation was
used.

## 10. Evidence index

- `probe-topology.ps1`, `dpi_acceptance.py`, `watch-exit.py`,
  `read-crash-events.ps1` — harness (scratch; gitignored).
- `run-*` outputs, `transition-live-200to150to100.jsonl`, `exit-record.json`
  — raw logs/JSON/screenshots per step (scratch; gitignored).
- Committed screenshots (this directory):
  - 100% baseline: toolbar/status/Fit (`phase2-100-boot.png`), 1:1
    (`phase2-100-one2one.png`), pan at 100% (`phase2-100-pan.png`), resize to
    1200×800 logical (`phase2-100-resize-1200x800.png`), next-item
    (`phase2-100-next.png`), 85% (`phase2-100-zoom-85.png`), 127.5%
    (`phase2-100-zoom-1275.png`).
  - 125%: boot/icons/dpi 1.25 (`phase3-125-boot.png`), resize to physical
    1440×900 (`phase3-125-resize-1440x900.png`), pan at 1:1
    (`phase3-125-pan-1to1.png`), 85% (`phase3-125-zoom-85.png`), 127.5%
    (`phase3-125-zoom-1275.png`).
  - 150%: boot/icons/dpi 1.5 (`phase3-150-boot.png`), 127.5%
    (`phase3-150-zoom-1275.png`).
  - Live transitions: after 200→150 (`phase3-live-150-after.png`), after
    150→100 (`phase3-live-100-after.png`).

## 11. DISPLAY_RESTORE (closeout)

| Field | Value |
| --- | --- |
| baseline_scale | 100% (effective_dpi=96, scale=1) |
| final_scale | 100% (effective_dpi=96, scale=1) |
| restored | true |
| resolution_unchanged | true (2560×1440) |
| monitor_configuration_unchanged | true (`\\.\DISPLAY1`, primary, single monitor) |

Verified at closeout via `GetDpiForMonitor` MDT_EFFECTIVE_DPI query (native
Windows, per-monitor DPI aware): `device=\\.\DISPLAY1 resolution=2560x1440
dpi=96 scale=1 scale_pct=100`. The OS scale was restored to the original
baseline after the campaign completed. No UAC prompt was required for
restoration.

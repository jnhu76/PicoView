# Corrective C4 — Present-Pacing Measurement Refinement (Evidence)

Campaign: PICOVIEW-GATE-A-READMISSION-CORRECTIVE-CAMPAIGN-2
Ticket: PICOVIEW-ARCH-C4-PRESENT-MEASUREMENT-REFINEMENT (#28)
Date: 2026-09-13
Verdict: **measurement refined; the controllable mechanism was found — it is
C3's event-driven wake, already merged.** With the runtime parked between
events, input→present-**submission** measures **P50 8.14 ms / P95 12.00 ms**
(zero multi-frame gaps, n=60) on the decode-free interaction path — inside
the ≤ 20 ms P95 budget. The remaining > 20 ms cases are decode work
(measured, not pacing) and DWM/vsync consumption (outside app control).
Budget accounting is referred to GATE-A2 like every other row.

## 0. Identity

| Item | Value |
| --- | --- |
| PicoView base | `main` @ `b867e1e` (C3 merge), branch `corrective/c4-present-pacing` |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| PocketJS chain end before C4 | `2d35706f` (`picoview-c3-idle-suspend`) |
| PocketJS C4 commit | `a46eb7e0` on `picoview-c4-present-pacing` (INPUT_TRACE stamps + parked trace mode; local; upstream push pending fresh-context audit) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01) stable-x86_64-pc-windows-msvc` (unchanged) |
| Host | AMD Ryzen 7 5800H (16 logical processors), 28.9 GiB RAM (NOT reference class — C5), AMD Radeon(TM) iGPU driver 31.0.21923.11000, Windows 11 Pro build 26200, power plan Balanced; display 60 Hz; samples on local SATA/NVMe SSD |
| Samples | `picoview-12mp.jpg` bound texture for the decode-free zoom path; 12/24/50 MP + behavior fixtures |
| Binary profiles | pacing runs: plain `--release` product build (no `bench-harness`); behavior rows: `--features bench-harness` build (A3 line logging) |
| Classification | RUNTIME_GENERIC (host measurement plumbing + one never-park gate relaxation); no present semantics change |

## 1. What GATE-A measured, and what the refinement separates

GATE-A carried ARCH-A4's input→present numbers (24 MP switch, sparse
human-rate cadence, tick-scheduled key driver): P50 21.23 ms / P95 41.34 ms
against the ≤ 20 ms P95 "where measurable" budget, with the excess attributed
to present-cadence quantization (floor 19.77 ms at 60 Hz) and occasional
multi-frame gaps. That measurement could not separate:

- **T_wake** — input arrival → the runtime's next tick (0–16.6 ms deadline
  quantization in the 60 Hz loop; ~0 on the C3 parked path);
- **T_work** — tick work + render submission (decode-inclusive when the
  input switches images);
- **T_present** — render submit → present submission (Fifo with
  `desired_maximum_frame_latency: 1` — the surface's queue pacing);
- (outside app scope: DWM/vsync consumption after submission — the
  BENCHMARK's present-submission proxy deliberately excludes it).

C4 adds the missing timestamp: `INPUT_TRACE,key,<name>,<epochUs>` printed by
the winit event handler on key-down (trace-gated), joining the existing
`FRAME_TRACE` tick / render-submit / present-submit lines on the same
monotonic epoch clock. One input then decomposes exactly.

## 2. Measurement method (and its honest limits)

Stimulus: 60 posted keyboard presses alternating zoom-in `=` (VK 0xBB, scan
0x0D) / zoom-out `-` (VK 0xBD, scan 0x0C) at 600 ms sparse human-rate
cadence, over a bound 12 MP texture — the **decode-free** interaction path
(every press recomposes and re-presents without a decode). A second run
presses `f` (VK 0x46, scan 0x21) 20× to measure the **decode-inclusive**
re-fit path. Both arms of the pacing pair run the same binary; the C3
declaration ON/OFF paks (`evidence/tmp/c3/dist-60hz` control via explicit
`--pak`/`--js`) select parked vs 60 Hz loop as the only difference.

**Injection honesty:** hardware-level `SendInput` was attempted first (twice,
with `SwitchToThisWindow`/`SetForegroundWindow` and per-press
`GetForegroundWindow` verification reporting success) — the events never
surfaced as winit `KeyboardInput` on this unattended desktop, so no
hardware-injection number is claimed. The shipped driver posts scan-code-
correct `WM_KEYDOWN`/`WM_KEYUP` to the window: posted messages traverse the
real winit → runtime → guest → render → present pipeline (60/60 keys arrive;
winit resolves the logical key from the scan code — an earlier driver
revision with a wrong scan code resolved as `enter` (archived in
`c4-driver3-parked.err`), which is how the resolution path was confirmed).
The single non-hardware step is the OS input-queue delivery; a human-
verification pass remains a GATE-A2 item.

**Window condition (disclosed per review):** all pacing runs spawn the
window `Start-Process -WindowStyle Minimized` and never restore it — the
measured surface is minimized/occluded for the whole run. The wake
quantization comparison (this ticket's objective) is window-state-
independent — both arms share the condition and the input→render term does
not touch the present queue — but the absolute T_present and P95-vs-budget
figures are **occluded-window numbers**: Fifo present on a visible window
can additionally block on vsync. GATE-A2's integrated session must re-measure
with a visible window before claiming the budget on the final display.

Pairing method (spelled out per review): the i-th `INPUT_TRACE` stamp (keys
are strictly ordered, 600 ms apart) pairs with the first `render-submit`
stamp ≥ it and the first `present-submit` stamp ≥ that render. Validity:
renders == presses + 2 boot renders in both arms, and max latency
(25.7 ms) ≪ press spacing (600 ms), so order-pairing cannot shift.

Two instrumentation notes recorded with the change: `--trace-frames` no
longer forces the never-park gate (the parked path is semantics-safe by C3's
gates; the decomposition needs wake traces on the parked path; cadence
sensitive harness runs stay gated by `--quit-after` + script schedules), and
an earlier driver revision's `0xBB + lParam 0` press was verified to wake
the runtime but resolve no logical key — posted keyboard input requires a
scan code.

## 3. Results — decode-free path (n = 60 per arm, 60/60 matched)

| Arm | input→present submission | render→present submission | >33 ms gaps |
| --- | --- | --- | --- |
| **Parked (declaration on)** | **P50 8.14 / P90 11.46 / P95 12.00 / max 12.74 ms** | P50 1.49 / P95 1.85 ms | **0/60** |
| 60 Hz loop (declaration off) | P50 15.82 / P90 23.93 / P95 24.71 / max 25.72 ms | P50 2.16 / P95 2.49 ms | 0/60 |

Sub-decomposition (same runs):

| Term | Parked | 60 Hz loop |
| --- | ---: | ---: |
| input arrival → render submission (wake + tick + submit) | P50 6.60 / P95 10.51 ms | P50 13.56 / P95 22.59 ms |
| render submission → present submission (Fifo pacing) | P50 1.49 / P95 1.85 ms | P50 2.16 / P95 2.49 ms |

Reading: the dominant controllable term is **T_wake** — the deadline loop's
input-to-next-tick quantization (~8.3 ms mean, up to 16.6 ms). C3's parked
wake removes it (the worker wakes on the input and ticks immediately), which
is exactly the "controllable mechanism" this ticket looked for; it is already
merged, and the C4 numbers quantify its pacing value. `T_present` is small at
sparse cadence (Fifo latency-1 blocks only when frames queue up). Zero
multi-frame gaps on the decode-free path in both arms.

## 4. The decode term (why switches exceed 20 ms — measured, not pacing)

Re-fit presses (`f` → new WIC decode of the same 12 MP source, n = 20,
parked arm — **n < 50: exploratory per BENCHMARK, closes no gate**):
input→present submission **P50 37.4 / P95 40.8 ms** — dominated by the
synchronous in-tick decode (the trace's in-tick work for these presses is
~27.3 ms; the A3 records' 43–48 ms cold-open decode is the upper bound — a
warm re-fit of an already-open source plausibly decodes faster than a cold
open). This is consistent with GATE-A/A4's attribution of its multi-frame
gaps to decode work on 24 MP switches, not to present scheduling. Removing
decode from the interactive latency budget is A3/A5 territory (coalescing,
cancellation, prefetch is forbidden for Previous/Next speculation), not C4.

## 5. Present-mode statement

The surface presents `PresentMode::Fifo` with
`desired_maximum_frame_latency: 1` (C2 baseline; unchanged). At sparse
interaction cadence **under the disclosed minimized-window condition** the
render→present submission term measured 1.5–2.6 ms P95 — queue pacing is
not a controllable latency term for this workload **on an occluded surface;
a visible window can add vsync-blocking that this measurement does not
bound** (GATE-A2 re-measures visible). Submission-to-photon (DWM/vsync)
remains outside the app and outside the metric: input→present-
**submission** is the named proxy (BENCHMARK), never "display photon
latency".

### Disproved-assumption correction (C3 §5)

C3's evidence attributed the posted-key non-delivery to "winit focus
semantics". C4's runs disprove that: posted keys with a valid scan code
deliver 60/60 to a minimized window. The corrected explanation is the scan
code: winit resolves the logical key from the lParam scan code, and a zero
scan code produces a key the guest cannot use. C3's doc is corrected by
this ticket per the read-before-changing authority rule (authority docs are
updated when an assumption is disproved).

## 6. Budget accounting (definition unchanged)

| Row | Measurement | Budget | Status |
| --- | --- | --- | --- |
| input→present submission P95, decode-free interaction, parked runtime | **12.00 ms** (n=60) | ≤ 20 ms P95 "where measurable" | **PASS as architecture-host evidence** — referred to GATE-A2 |
| same, 60 Hz loop (bundles without the C3 declaration) | 24.71 ms | ≤ 20 ms P95 | FAIL — quantization inherent to the fixed-dt 60 Hz guest contract; any bundle may opt into the declaration (semantics-preserving) |
| decode-inclusive switch (12 MP re-fit) | 40.8 ms P95 | same | decode-work-bound (A3/A5 scope); not a pacing defect |

No budget definition was changed; no pacing code changed beyond the C3
mechanism this ticket identified as the fix.

## 7. Behavior verification (C4 build)

| Check | Result |
| --- | --- |
| Manifest walk / A5 stress / A6 scale smoke | exit 0; boundary counters identical to the C3 record (3/2/0/5 walk; 27/96/96/27 stress; A6 scale events 2) |
| `cargo test --release` (desktop host) | 15 passed, 0 failed, 1 ignored |
| Startup/idle/behavior regressions from the can_suspend relaxation | none: idle runs never set `--trace-frames`; probe runs gate on `--quit-after`; harness cadence runs gate on script/quit (C3's gates unchanged for all non-trace paths) |

## 8. Next unblocked issue

Per the campaign mission order: **C5/#29 (16 GiB reference-class rerun)** is
next, then C6/#31 and the NEW GATE-A2. No budget was weakened.

## 9. Review trail

Two fresh-context adversarial reviews (measurement methodology;
runtime-semantics/scope) ran before the PR — dispositions in §10 of the
evidence git history (raw driver transcripts under
`pocketjs/evidence/tmp/c4*`).

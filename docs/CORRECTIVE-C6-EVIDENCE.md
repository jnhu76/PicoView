# Corrective C6 — Physical WM_DPICHANGED Leg (Evidence: BLOCKED)

Campaign: PICOVIEW-GATE-A-READMISSION-CORRECTIVE-CAMPAIGN-2
Ticket: PICOVIEW-ARCH-C6-PHYSICAL-DPI-PROOF (#31)
Date: 2026-09-13
Verdict: **BLOCKED_PHYSICAL_DPI_ENVIRONMENT** — this environment exposes
exactly one display, so the OS-delivered `WM_DPICHANGED` leg (a real window
move between monitors at different scale factors) cannot be exercised. No
virtual-display substitute was used; the scripted `apply_scale` leg (the
same handler the OS event drives) remains covered by the ARCH-A6/C4
evidence. The physical leg is parked for a two-monitor host.

## 0. Environment verification (the blocker, formally recorded)

Measured this session (`System.Windows.Forms.Screen::AllScreens`,
`Win32_VideoController`):

| Item | C6 requirement | This host | Verdict |
| --- | --- | --- | --- |
| Displays | two monitors at different scale factors (e.g. 100 % + 200 %) | **1 display** (`\\.\DISPLAY1`, 2560×1440 @ 60 Hz, primary, single GPU output) | deviates |
| Real OS event | `WM_DPICHANGED` delivered by Windows on a physical monitor move | impossible with one monitor — no monitor transition exists | unavailable |

A virtual second monitor (indirect-display driver, IddSampleDriver-class
hooks) would manufacture the `WM_DPICHANGED` message but not the physical
contract the ticket defines — the proof's value is that Windows' own
topology/dpi-sensing stack (per-monitor-V2 awareness, DWM raster sizing,
anchor preservation on a real client-area rescale) delivers the event. A
synthetic message exercises our handler, which the scripted leg already
does (`apply_scale` is the same handler both paths drive).

## 1. What remains covered, and what does not

Covered (architecture-host evidence, unchanged):
- The PMv2 awareness contract on the created window (`per_monitor_v2=true`,
  `GetDpiForWindow` at boot) — ARCH-A6, re-verified in every campaign run.
- The scale-transition handler: logical viewport invariant, raster density
  tracking, physical = logical × scale — driven through the scripted
  `--scale-at` path on the same `apply_scale` code the real
  `ScaleFactorChanged` event delivers (A6 evidence; re-run green on every
  corrective build, latest in C4 §7).
- The C3-parked runtime wakes on the real `Input::Scale` the OS event
  sends (wake-path identity with input events, C3 §3).

NOT covered (this ticket's residual): Windows' own delivery of
`WM_DPICHANGED` between physical monitors — monitor-exact DPI sensing,
the OS's client-area rescale message ordering, and any DWM-side behavior
unique to a real topology change. GATE-A2 must carry this as an open
physical-leg item exactly like C5's reference-class rerun.

## 2. Unblocking path

A two-monitor Windows host with displays at different scale factors
(e.g. 100 % + 200 %): drag the PicoView window across the boundary, then
re-run the A6 verification (logical stability, anchor preservation, raster
density tracking, no bitmap stretch — the A6EVENT physical/logical lines
already instrument this). No code change is expected unless the
OS-delivered path diverges from the scripted one.

## 3. No code or measurement changes

This corrective introduces no code, no measurement, and no document beyond
this record. The campaign continues at the NEW GATE-A2 per the mission
order; GATE-A2 carries both C5 and C6 physical-environment blockers forward
in its verdict.

## 4. Review trail

One fresh-context adversarial review confirmed the blocker (single display
verified independently), that a virtual monitor would not satisfy the
ticket's "real OS event" contract, and that recording BLOCKED rather than
simulating the event is the only truth-preserving autonomous outcome.

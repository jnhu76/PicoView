# GATE-A2 — Architecture Re-Admission Gate (Evidence and Verdict)

Campaign: PICOVIEW-GATE-A-READMISSION-CORRECTIVE-CAMPAIGN-2
Ticket: PICOVIEW-GATE-A2 (#38)
Gate branch: `gate/architecture-a-readmission`
Date: 2026-09-13
Verdict: **GATE_A2_FAIL** — startup budgets are not met this session
(image-mode T0→IMGREADY P50 364 ms / P95 390 ms against ≤ 300 ms full;
window-mode READY P50 261 ms against ≤ 150 ms interactive); every other
measured hard line passes on the same session. Two physical-environment
blockers (C5 reference class, C6 physical DPI leg) remain open and are
carried forward. **STOP. Do not begin Product Phase B.**

## 0. Gate identity (final architecture under admission)

| Item | Value |
| --- | --- |
| PocketJS frozen base | `a5a85356e172db8a32aefa983ee1259f60406f69` |
| PocketJS corrective chain (local, upstream push pending fresh-context audit) | `6efb25b7` (A5-era) → `8e9e09f9` (C2) → `d1ae693e` (C1) → `23f634cd` (C1 feature) → `2d35706f` (C3) → `a46eb7e0` (C4) — **chain end `a46eb7e0` on `picoview-c4-present-pacing`** |
| PicoView | `main` @ `8c63345` (C6 merge) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01) stable-x86_64-pc-windows-msvc` |
| Host | AMD Ryzen 7 5800H (16 logical processors), 28.92 GiB RAM, AMD Radeon(TM) integrated GPU, driver 31.0.21923.11000, Windows 11 Pro build 26200, display 2560×1440 @ 60 Hz, power plan Balanced |
| Session discipline | ALL numbers below measured in one tightly scheduled session starting 14:32 (driver/ICD cache **warm** — heavy build+run activity all day); `POCKET_GPU_BACKEND` verified **unset** before the first run; startup spawns used minimized windows (disclosed; window-state recording is the C1 §5 protocol item); per CORRECTIVE-C1-EVIDENCE §5, cross-session comparisons are void and none are used for verdicts — **one carried exception, labeled in §2: the ≤384 MiB transient row cites C2's peak measurement** |
| Build identities | product `--release` build (startup/memory/idle/pacing/payload/inventory); `--features bench-harness` build (behavior suites only — A3 line logging) |
| Sample | `picoview-12mp.jpg` / 24 MP + fixture set, local SATA/NVMe SSD |

## 1. Startup (budgets: ≤150 ms interactive, ≤300 ms full-image)

55 cold spawns, image mode (T0→IMGREADY, present-submission proxy):
**P50 364 / P95 390 ms** (all 55 spawns completed and all 55 exceed the
300 ms budget; including the first-ever spawn at 1015 ms as a warm-up run —
excluding it gives 363/384, the FAIL is unchanged either way). Window mode,
**20 spawns — n < 50: exploratory per BENCHMARK, used only to close a FAIL**
(T0→READY, T0-anchored formula, minimized spawn windows): **P50 261 /
P95 281 ms**.

- ≤ 300 ms full-image: **FAIL** (P50 364 exceeds by 21 %; P95 390).
- ≤ 150 ms interactive: **FAIL** (window-mode P50 261).
- Session drift context (not decision-grade): the same final-architecture
  content measured IMGREADY P50 293 (C1 session, P95 339) and 331–363 in
  intermediate sessions. The drift band straddles the 300 ms line, which is
  itself disqualifying: admission requires a robust margin, not a
  session-dependent coin flip. The interactive budget is failed by a wide
  margin in every session.

## 2. Memory (budgets: ≤40 MiB target / >64 MiB FAIL settled no-image; ≤128 MiB 24 MP Fit; ≤384 MiB transient; five-process derivative)

Staged probe (`POCKET_MEM_STAGE=1`, `settled_quit`), 5 runs each, both
metrics per BENCHMARK (MiB = bytes ÷ 1,048,576, recomputed exactly):

| Workload | WS-Private | Private Bytes |
| --- | --- | --- |
| Settled, no image | 48.88–49.07 MiB | 79.80–80.04 MiB |
| Settled, 24 MP Fit open | 101.35–101.70 MiB | 156.64–157.21 MiB |
| 24 MP peak at first present | 92.80–95.02 MiB | 148.04–148.64 MiB |

- Settled no-image: inside the 64 MiB FAIL line, above the 40 MiB target —
  the 40–64 band C2 referred to this gate **is ruled**: the hard line holds
  (no FAIL), the target is missed. Recorded as a target miss, not a gate
  failure; product-facing work may still close it in Phase B.
- 24 MP Fit settled 101.35–101.70 MiB ≤ 128 MiB: **PASS** (architecture-
  host evidence).
- Five-process aggregate (same script as C2): **435.67 MiB** summed
  WS-Private (456,830,976 B) / **711.99 MiB** private bytes (746,573,824 B);
  per-process WS-Private distribution 76.3–102.2 MiB (from
  `five-c2-raw.json`) — consistent with C2's 415.8 MiB sum under session
  drift; **PASS as derivative** of the per-process rows.
- Transient (A5 rapid-switch): **carried/derivative evidence, not a
  this-session measurement** — the ≤ 384 MiB row's peak (149.4 MiB
  WS-Private / 185.1 MiB Private Bytes) was measured on the C2 build and
  session; this session re-verified the mechanism counters unchanged
  (27/96/96/27, byte-identical in the C3/C4 behavior rows). ~2.4× headroom
  dwarfs the ±10 MiB session-drift band and C1's +9.6 MiB trade: **PASS as
  carried derivative evidence** (explicitly not session-disciplined).

## 3. Static idle (budget ≤ 0.2 % normalized)

BENCHMARK protocol (5 s settle, 30 s window, /16 normalization), interleaved,
declaration ON/OFF as the only difference:

| Arm | Run A | Run B |
| --- | ---: | ---: |
| Parked (declaration on) | **0.0000 %** (0.0000 s) | **0.0000 %** (0.0000 s) |
| 60 Hz loop (declaration off) | 0.0976 % | 0.0228 % |

Parked static idle: **PASS** (≤ 0.2 %, architecture-host evidence; ~50×
headroom). Zero wakes inside both windows (`C3EVENT,wake` absent).

## 4. Input→present (budget ≤ 20 ms P95, "where measurable"; present-submission proxy)

60 posted scan-code keyboard presses (decode-free zoom alternation), parked
runtime, **visible (restored) window** — the C4 review's condition:

| Metric | Value |
| --- | --- |
| input→present submission | **P50 10.63 / P90 14.49 / P95 15.41 / max 16.17 ms** |
| Multi-frame gaps (> 33 ms) | 0/60 |

**PASS** on the decode-free interaction path with a visible window
(architecture-host evidence). Decode-inclusive switches remain decode-bound
(C4: 37.4/40.8 ms exploratory; A3/A5 scope). Hardware-injection
verification (real user hands) remains open alongside C5/C6.

## 5. Payload (budget ≤ 15 MiB downloadable)

`pocket-desktop-host.exe` 12,166,656 B (11.60 MiB) + `picoview-a6-main.pak`
304,944 B + `picoview-a6-main.js` 345,215 B = 12,816,815 B = **12.22 MiB**:
**PASS** (composition identical to A7's 12.16 MiB record; no new runtime files).

## 6. Hidden-runtime inventory

During a live product run: exactly **1 process** (`pocket-desktop-host`),
15 threads (main + winit + runtime worker + offload worker + GPU/driver
workers — all in-process, consistent with the C3/C4 thread inventory),
**0 TCP connections** (archived: `evidence/tmp/gate/inventory.log`). The
product is a portable exe + pak/js assets: no installer, no service, no
scheduled task, no updater, no telemetry channel exist to inventory.
**Clean.**

## 7. Blockers carried forward

- **C5 (PICOVIEW-ARCH-C5, blocked):** 16 GiB + discrete-class reference
  host unavailable; RAM-sensitive rows above are architecture-host
  evidence (28.92 GiB iGPU host); same-host paired deltas unaffected.
  Unblocking: physical reference-class host, or a written owner-approved
  bounded equivalence decision.
- **C6 (PICOVIEW-ARCH-C6, blocked):** single-display host; the
  OS-delivered `WM_DPICHANGED` leg between physical monitors of different
  scale factors is unexercised. The scripted `apply_scale` leg (same
  handler) is green on this build. Unblocking: two-monitor host.

## 8. Gate accounting (all rows, this session unless noted)

| Budget (PRD, unchanged) | GATE-A measured | Corrective-arc best (paired, session-bound) | GATE-A2 measured | Status |
| --- | ---: | ---: | ---: | --- |
| Startup full-image ≤ 300 ms | 857/924 (P50/P95) | 293/339 (C1 session) | **364/390** | **FAIL** |
| Startup interactive ≤ 150 ms (window READY) | 837/904 (P50/P95, A7) | 247 (C4 session) | **261 (n=20, exploratory)** | **FAIL** |
| Settled no-image ≤ 40 target / > 64 FAIL | 226.1 MiB | 48.9–49.1 MiB band | **48.88–49.07 MiB** | hard line holds; target miss ruled at this gate |
| 24 MP Fit ≤ 128 MiB | 254.7 MiB | 81.2 MiB (C2) | **101.35–101.70 MiB settled** | **PASS** (architecture-host) |
| Rapid-request transient ≤ 384 MiB | 250.6 MiB | 149.4 MiB (C2) | carried derivative — counters re-verified (C3/C4) | **PASS as carried derivative evidence** |
| Five-process aggregate | 1.55 GiB | 415.8 MiB (C2) | **435.67 MiB (per-process 76.3–102.2)** | **PASS as derivative** |
| Static idle ≤ 0.2 % | 0.50 % | 0.0000 % (C3) | **0.0000 %** (×2) | **PASS** (architecture-host) |
| Input→present P95 ≤ 20 ms (decode-free) | 41.34 ms (A4, decode-inclusive) | 12.00 ms occluded (C4) | **15.41 ms visible** | **PASS** (architecture-host) |
| Payload ≤ 15 MiB | 12.16 MiB | — | **12.22 MiB** | **PASS** |
| 16 GiB reference class | not measured | — | **BLOCKED (C5)** | open |
| Physical WM_DPICHANGED leg | not exercised | — | **BLOCKED (C6)** | open |

## 9. Review trail

Three independent fresh-context reviews of this document and the campaign
artifacts — architecture/scope (**CONFIRM**), benchmark/evidence integrity
(**CONFIRM**), red-team budget gaming (**CONFIRM**, zero material gaming
found; two SOFTENING completeness gaps) — with dispositions applied in
commit `<>` of this branch: all MiB conversions recomputed exactly from
raw bytes (§2 table; payload 12.22 MiB; five-process 711.99 MiB private);
transient row relabeled as carried/derivative evidence with the §0
session-discipline exception disclosed; window-mode row labeled exploratory
(n=20) with the T0-anchored formula named; "misses 0/55" reworded (55/55
spawns exceeded budget); warm-up spawn noted with the exclusion
recalculation (363/384, FAIL unchanged); per-process five-process
distribution added from `five-c2-raw.json`; inventory snapshot archived
(`inventory.log`); startup spawn window state recorded in §0; the §8
historical interactive citation corrected to A7's 837/904.

## 10. Verdict

**GATE_A2_FAIL.**

- Decisive: startup budgets (both interactive and full-image) fail in this
  session, and the session-drift band of the same build straddles the
  full-image line — the architecture does not yet deliver startup inside
  its budget robustly.
- All other hard lines measured this session pass (memory hard lines, idle,
  pacing, payload, inventory); two PRD-class physical-environment proofs
  remain blocked (C5, C6).
- What would flip the verdict: (a) startup P50 + P95 robustly inside
  300 ms across sessions with a margin (interactive ≤ 150 ms still open and
  likely requires decode-out-of-critical-path product design — Phase B
  scope, not more host pacing); (b) C5 unblocked (reference-class host or
  owner equivalence); (c) C6 unblocked (two-monitor host).

**STOP. Do not begin Product Phase B.**

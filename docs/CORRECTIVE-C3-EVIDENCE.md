# Corrective C3 — Event-Driven Idle Suspend (Evidence)

Campaign: PICOVIEW-GATE-A-READMISSION-CORRECTIVE-CAMPAIGN-2
Ticket: PICOVIEW-ARCH-C3-EVENT-DRIVEN-IDLE-SUSPEND (#27)
Date: 2026-09-13
Verdict: **implemented (earned)** — static idle measured **0.000 % normalized
CPU** (zero wakeups in the observation window) against the ≤ 0.2 % budget,
with semantics preserved for every existing bundle via an opt-in contract.

## 0. Identity

| Item | Value |
| --- | --- |
| PicoView base | `main` @ `f416381` (C1 merge), branch `corrective/c3-idle-suspend`; includes the product-guest declaration (`guest/app.octane.tsx`) |
| PocketJS chain end before C3 | `d1ae693e` (`picoview-c1-startup-init`) |
| PocketJS C3 commit | `d8ef6b66` on `picoview-c3-idle-suspend` (local; upstream push pending fresh-context audit) |
| Toolchain | `rustc 1.98.1` `stable-x86_64-pc-windows-msvc` (unchanged); guest rebuilt with `bun tools/pocket.ts compile --target windows-app` (pocketjs checkout root; `pocketjs/guest/` junction to `PicoView/guest/`) |
| Host | AMD Ryzen 7 5800H (16 logical processors), 28.9 GiB RAM (NOT reference class — C5), AMD Radeon(TM) iGPU driver 31.0.21923.11000, Windows 11 Pro build 26200, power plan Balanced |
| Samples | `picoview-12mp.jpg` (idle workload image); 12/24/50 MP + behavior fixtures for regression |
| Classification | RUNTIME_GENERIC (core query, surface declaration, offload counter, desktop-host pacing) + PICOVIEW_POLICY (the product guest's declaration) |

## 1. Root-cause freeze (why GATE-A idle failed)

The desktop runtime worker paces itself on a fixed 60 Hz deadline loop; every
wake runs the guest JS frame callback plus tick bookkeeping even when nothing
can change. GATE-A measured 0.50 % normalized idle CPU (budget ≤ 0.2 %) on
the pre-C2 build; no render loop runs while static (that criterion already
passed — 0 presents).

Today's same-session baseline (C3 binary, declaration off → loop unchanged)
measures the post-C2/C1 loop at **0.078 % / 0.007 %** normalized across two
runs (0.375 s / 0.031 s CPU over 30 s ≈ 0.21 ms per tick): C2's allocator and
backend work removed most of the per-tick cost, so the recorded GATE-A number
is cross-session context only (C1 evidence §5 drift finding). The remaining
mechanism — pointless wakes — is what C3 removes; the budget accounting is
referred to GATE-A2 on the integrated build either way.

`MemoryHints::MemoryUsage` frame-pacing note (C2 §6 follow-through): C3
changes no allocation behavior; the pacing-sensitive paths (A5 stress burst)
are byte-identical under the measurement gates (§6).

## 2. Design (additive, conservative, opt-in)

PocketJS `d8ef6b66` (+147/−4):

1. `Ui::animating()` (runtime-generic): true while any tween/spring track or
   baked-timeline instance is alive — an objective, native-side demand for
   continuous ticks.
2. `UiSurface` guest declaration `__pocketStaticFrames(active)` (mounted as
   an optional `HostOps` member, typed in `framework/src/host.ts`): the
   bundle asserts it produces NO guest-visible change without an input
   event, a service reply, or a native animation. **Default is absent** — a
   bundle that never calls it keeps the continuous loop, so existing
   content cannot change behavior; a JS-animated bundle must never set it.
   Retractable (`false`) at any time.
3. `OffloadWorker::outstanding()`: un-taken reply count; replies in flight
   forbid parking.
4. Desktop host pacing: when the declaration is set AND nothing is
   animating AND no offload replies are outstanding AND no wire /
   supervisor-child / harness-schedule / A3-queued work remains AND the
   measurement paths (`--quit-after`, `--trace-frames`) are off, the worker
   parks on the input channel — a blocking `recv`, the one wait that
   carries a wakeup — and on wake runs one tick immediately with the
   deadline reset (no catch-up burst). `C3EVENT,suspend` / `C3EVENT,wake`
   lines (announce-gated) evidence the transitions.

PicoView product guest (`guest/app.octane.tsx`): declares
`getOps().__pocketStaticFrames?.(true)` at setup with the contract in a
comment — every guest-visible change in the viewer is input- or
service-reply-driven (manifest walk, walk keys, clicks, stress bursts); a
future self-driven JS animation must retract the declaration first.

**Rejected alternative:** host-side heuristics ("N quiet ticks → park")
would freeze a guest whose JS animates from its own frame callback — a broad
runtime semantic break (the `RUNTIME_WAKE_SEMANTICS_DECISION_REQUIRED` class).
The opt-in declaration avoids it: no bundle changes behavior without
explicitly claiming staticness. Polling fallbacks during park were also
rejected: a 1 s poll spends up to 0.25× the entire idle budget on paranoia.

## 3. Lost-wakeup audit (what can change state while parked)

| Source | Handling |
| --- | --- |
| Host input events (keys, mouse, resize, close, OS scale) | delivered on the parked `inputs` channel — the recv wakeup |
| Native animations (tween/spring/timelines) | `animating()` gate; they can only start during a tick, so a parked worker has none and none can start |
| Guest JS self-driven change | excluded by the declaration contract (opt-in) |
| Text-offload replies | `outstanding() == 0` gate; replies exist only for submitted requests and submits happen only during ticks |
| svc network wire | `wire.is_none()` gate — a host with a network companion never parks |
| Supervisor child instances | `instances.is_empty()` gate |
| A3 queued decodes / A2 schedule / scripts / storm | harness gates (park only when fully quiescent) |
| Host-side scale schedule (`--scale-at`) | host-thread; fires `Input::Scale` onto the parked channel — wakes it |
| Measurement paths | `--quit-after` / `--trace-frames` never park (deterministic probes unchanged) |

## 4. Normative measurement — static idle (same binary, same session)

Protocol per BENCHMARK §7: 5 s settle, 30 s observation window,
`process_cpu_seconds / wall_seconds / 16 logical processors × 100`, visible
process (window spawned minimized, symmetric across the pair), product
configuration (`--app picoview-a6 --a3-harness --a3-file picoview-12mp.jpg
--announce-ready`), interleaved A/B order, declaration ON vs OFF as the only
difference (same binary; OFF pak built with the call flipped to `false` so
the binding itself executes in both runs).

| Run | Pak | CPU (30 s) | Normalized | Working set |
| --- | --- | ---: | ---: | ---: |
| A | declaration `false` (60 Hz loop) | 0.375 s | 0.078 % | 106.5 MB |
| B | declaration `true` (parked) | **0.000 s** | **0.000 %** | 108.4 MB |
| C | declaration `false` | 0.031 s | 0.007 % | 117.5 MB |
| D | declaration `true` | **0.000 s** | **0.000 %** | 108.6 MB |

Suspension engaged at `C3EVENT,suspend,211/219 ms,tick=1` (image bound and
presented first); **zero wakeups** occurred inside the 30 s windows (no
`C3EVENT,wake`, no A3 events after settle), so the window contained zero
ticks, zero renders, zero present submissions — the "static idle must not
require a continuous render loop" criterion is met by construction and
observed.

**Gate reading:** ≤ 0.2 % idle budget — parked runs measure **0.000 %**
(PASS as architecture-host evidence; GATE-A2 re-measures integrated). The
60 Hz loop measured 0.078 %/0.007 % — below budget on today's basis and
6–70× below the GATE-A-era 0.50 %, consistent with the C2/C1 per-tick cost
reductions and the cross-session drift finding.

## 5. Wake behavior

- Parked → `WM_CLOSE` (real OS event): `C3EVENT,wake,4139 ms` after a
  230 ms suspend, clean process exit **106 ms** after the post (exit path
  identical to the 60 Hz loop's).
- Wake→work latency: the parked branch consumes one input, then runs the
  normal loop-top drain + tick — the same code the 60 Hz loop executes, so
  the parked path's input-to-tick latency is bounded by event delivery, not
  by the 16.6 ms deadline (strictly better than the loop it replaces).
- Injected-keyboard limitation (reproducible in BOTH modes): PostMessage
  key-down to a minimized window wakes the loop but does not deliver a
  guest-visible key (winit focus semantics; the same limitation the A5
  campaign hit with SendKeys). Control run with the loop forced 60 Hz
  (`--trace-frames`) reproduced the non-delivery, exonerating the parked
  path. End-to-end real-input response belongs to C4's real-input driver.

## 6. Behavior verification (C3 build)

| Check | Result |
| --- | --- |
| Manifest walk (12 MP, corrupt, 24 MP, fake, orient6; `--quit-after 600`) | exit 0; `successes=3, failures=2, cancels=0, decodes=5, txBytes=812, rxBytes=891` — identical to the C1 record (these runs exercise the never-park path via the quit gate) |
| A5 rapid-switch stress (`--key s@200`, quit 1200) | exit 0; `successes=27, failures=96, cancels=96, decodes=27, txBytes=7864, rxBytes=22786` — identical to the C1/GATE-A-era record |
| A6 scale smoke (1.5@120, 2.0@240) | exit 0; 4 scale/physical events; logical-viewport invariant held |
| Startup sanity (20-run probe) | IMGREADY P50 359 ms — inside the C1 session-drift band (331–363); probe runs never park (`--quit-after` gate), so the startup path is structurally unchanged |
| `cargo test --release` (desktop host) | 15 passed, 0 failed, 1 ignored |
| `cargo test --release -p pocket-ui-surface` | 9 passed (incl. new static-frames default-off + binding round-trip test; offload credit counting asserted in the existing bounded-ops test) |
| `cargo test --release` (pocketjs-core) | 132 passed |

## 7. Memory note

The parked path adds no allocations (one `bool` field, two static atomics
for the announce-gated markers). Same-binary working-set readings during the
idle runs: parked 108.4/108.6 MB vs loop 106.5/117.5 MB — within that
pair's own variance band. Formal memory-gate accounting (both BENCHMARK
metrics, reference conditions) belongs to GATE-A2's integrated session.

## 8. Next unblocked issue

Per the campaign mission order: **C4/#28 (present pacing)** is next; the
real-input driver it requires must handle the focus/minimized limitation
documented in §5. No budget was weakened; the idle PASS above is
architecture-host evidence referred to GATE-A2 like every other row.

## 9. Review trail

Two fresh-context adversarial reviews (runtime semantics/lost-wakeup;
benchmark/evidence) run before the PR; corrections applied per §10 of each
review (see git history of this branch).

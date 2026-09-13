# Corrective C3 — Event-Driven Idle Suspend (Evidence)

Campaign: PICOVIEW-GATE-A-READMISSION-CORRECTIVE-CAMPAIGN-2
Ticket: PICOVIEW-ARCH-C3-EVENT-DRIVEN-IDLE-SUSPEND (#27)
Date: 2026-09-13 (rev 2 — adversarial-review corrections applied)
Verdict: **implemented (earned)** — static idle measured **0.0000 % normalized
CPU** (zero CPU seconds and zero wakeups in the observation window, both
runs) against the ≤ 0.2 % budget, with semantics preserved for every
existing bundle via an opt-in contract. One BLOCKER found by pre-PR
adversarial review (svc-reply stranding) is fixed and regression-tested.

## 0. Identity

| Item | Value |
| --- | --- |
| PicoView base | `main` @ `f416381` (C1 merge), branch `corrective/c3-idle-suspend`; includes the product-guest declaration (`guest/app.octane.tsx`) |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| PocketJS chain end before C3 | `d1ae693e` (`picoview-c1-startup-init`) |
| PocketJS C3 commits | `d8ef6b66` (feature) + `2d35706f` (review corrections: svc_in park gate, sprite demand, offload liveness) on `picoview-c3-idle-suspend` (local; upstream push pending fresh-context audit) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01) stable-x86_64-pc-windows-msvc` — re-recorded for this report, unchanged from C1/C2 |
| Guest build | `bun tools/pocket.ts compile --target windows-app --manifest guest/pocket.json --project-root . --outdir dist` from the PocketJS checkout root (`pocketjs/guest/` is a directory junction to `PicoView/guest/`); the control pak was built identically with the declaration call flipped to `false`, into `evidence/tmp/c3/dist-60hz/`, and is selected per run via the host's explicit `--pak` / `--js` arguments — the canonical `dist/` pak carries the `true` declaration and is used for the parked arm (arm membership is additionally evidenced by the `C3EVENT,suspend` marker present only in the parked arm) |
| Host | AMD Ryzen 7 5800H (16 logical processors), 28.9 GiB RAM (NOT reference class — C5), AMD Radeon(TM) iGPU driver 31.0.21923.11000, Windows 11 Pro build 26200, power plan Balanced; samples on local SATA/NVMe SSD |
| Samples | `picoview-12mp.jpg` (idle workload image); 12/24/50 MP + behavior fixtures for regression |
| Classification | RUNTIME_GENERIC (core query, surface declaration + queue accessor, offload counter, desktop-host pacing) + PICOVIEW_POLICY (the product guest's declaration) |
| Binary profiles | **Idle/wake/parked-walk measurements: plain `--release` product build** (the A3 harness's `A3EVENT`/`A3BOUNDARY` lines compile only under the `bench-harness` feature — `harness_log!` — so plain-build runs show no A3 lines; the walk-parked regression §5 instead uses the **`--features bench-harness` build** because its evidence IS the A3 lines). §6 behavior rows run on the bench-harness build; §4 rows on the plain build. Per BENCHMARK §3 both identities are this doc's recorded build identity. |

## 1. Root-cause freeze (why GATE-A idle failed)

The desktop runtime worker paces itself on a fixed 60 Hz deadline loop; every
wake runs the guest JS frame callback plus tick bookkeeping even when nothing
can change. GATE-A measured 0.50 % normalized idle CPU (budget ≤ 0.2 %) on
the pre-C2 build; no render loop runs while static (that criterion already
passed — 0 presents).

Today's same-session baseline (C3 binary, declaration off → loop unchanged)
measures the post-C2/C1 loop at **0.0098 % / 0.0195 %** normalized (0.047 s /
0.094 s CPU over 30 s). This is noise-dominated at the instrument's
granularity (see §4) and is 6–50× below the GATE-A-era number: C2's allocator
and backend work removed most of the per-tick cost, so the recorded GATE-A
0.50 % is cross-session context only (C1 evidence §5 drift finding) and is
NOT claimed to reproduce here. The remaining mechanism — pointless wakes —
is what C3 removes; budget accounting is referred to GATE-A2 on the
integrated build either way.

`MemoryHints::MemoryUsage` frame-pacing note (C2 §6 follow-through): C3
changes no allocation behavior; the pacing-sensitive paths (A5 stress burst)
are counter-identical under the measurement gates (§6).

## 2. Design (additive, conservative, opt-in)

PocketJS `d8ef6b66` + `2d35706f` (+213/−14 total):

1. `Ui::animating()` (runtime-generic): true while any tween/spring track or
   baked-timeline instance is alive, **or any live node carries an animated
   sprite** (`set_sprite` auto-plays from the frame counter — a review
   finding; a static declaration with a playing sprite would otherwise
   freeze it). Note `debug_pause` stops the advance but does not clear these
   states, so the predicate can be true while paused (conservative).
2. `UiSurface` guest declaration `__pocketStaticFrames(active)` (mounted as
   an optional `HostOps` member, typed in `framework/src/host.ts`): the
   bundle asserts it produces NO guest-visible change without an input
   event, a service reply, or a native animation. **Default is absent** — a
   bundle that never calls it keeps the continuous loop, so existing
   content cannot change behavior; a JS-animated bundle must never set it.
   Retractable (`false`) at any time.
3. `UiSurface::svc_guest_pending()`: whether any host-pushed service line
   awaits the guest's next frame poll. **The review BLOCKER gate** — native
   handlers push replies (e.g. A3 `a3img`) AFTER the guest's frame of the
   same tick, and the guest consumes `svc_in` only by polling in its next
   frame; parking with a non-empty inbound queue strands the reply.
4. `OffloadWorker::outstanding()`: un-taken reply count, reporting 0 once
   the worker thread has exited (a dead worker never replies, so leaked
   credit must not disable parking forever).
5. Desktop host pacing: when the declaration is set AND nothing is
   animating AND the inbound svc queue is empty AND no offload replies are
   outstanding AND no wire / supervisor-child / harness-schedule /
   A3-queued work remains AND the measurement paths (`--quit-after`,
   `--trace-frames`) are off, the worker parks on the input channel — a
   blocking `recv`, the one wait that carries a wakeup — and on wake runs
   one tick immediately with the deadline reset (no catch-up burst).
   `C3EVENT,suspend` / `C3EVENT,wake` lines (announce-gated) evidence the
   transitions; `suspend` prints once per process (first park), `wake`
   prints on every park-return including races where the recv never
   blocked.

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

**Review rebuttal on record:** one review MINOR claimed the non-parked
60 Hz loop's lag branch gained a `deadline = Instant::now()` reset in C3
("unadvertised pacing change"). The pre-C3 loop (`d1ae693e`,
`run_runtime` tail) contains the identical `else { deadline =
Instant::now(); }` reset — the diff only re-indented it into the new else
branch. The non-parked loop's pacing is unchanged.

## 3. Lost-wakeup audit (what can change state while parked)

| Source | Handling |
| --- | --- |
| Host input events (keys, mouse, resize, close, OS scale) | delivered on the parked `inputs` channel — the recv wakeup |
| **Host-pushed service replies (`svc_in`)** | **`svc_guest_pending()` gate (review BLOCKER fix)** — the guest polls the whole queue in its next frame; the gate holds parking until the queue is empty |
| Native animations: tween/spring tracks, baked timelines, animated sprites | `animating()` gate (sprites added by review); they can only start during a tick, so a parked worker has none and none can start |
| Guest JS self-driven change | excluded by the declaration contract (opt-in) |
| Text-offload replies | `outstanding() == 0` gate (dead-worker liveness fixed by review); replies exist only for submitted requests and submits happen only during ticks |
| svc network wire | `wire.is_none()` gate — a host with a network companion never parks |
| Supervisor child instances | `instances.is_empty()` gate |
| A3 queued decodes / A2 schedule / scripts / storm | harness gates (park only when fully quiescent) |
| Host-side scale schedule (`--scale-at`) | host-thread; fires `Input::Scale` onto the parked channel — wakes it |
| Measurement paths | `--quit-after` / `--trace-frames` never park (deterministic probes unchanged) |

## 4. Normative measurement — static idle (same binary, same session)

Protocol per BENCHMARK §8: 5 s settle (outside the window), then a 30 s
observation window; `process_cpu_seconds / wall_seconds / 16 logical
processors × 100`; windows spawned minimized, symmetric across the pair;
product configuration (`--app picoview-a6 --a3-harness --a3-file
picoview-12mp.jpg --announce-ready`); interleaved A/B/A/B order on one
plain `--release` binary with the declaration ON/OFF paks of §0 as the only
difference. Summaries are archived per run (`idle-*-*.summary`), with each
run's stderr (markers) alongside.

| Run | Pak | CPU (30 s) | Normalized | Full working set* |
| --- | --- | ---: | ---: | ---: |
| A | declaration `false` (60 Hz loop) | 0.0469 s | 0.0098 % | 106.6 MB |
| B | declaration `true` (parked) | **0.0000 s** | **0.0000 %** | 106.8 MB |
| C | declaration `false` | 0.0938 s | 0.0195 % | 106.6 MB |
| D | declaration `true` | **0.0000 s** | **0.0000 %** | 106.8 MB |

\* `Process.WorkingSet64` — the FULL working set, **not** a BENCHMARK memory
metric; recorded as supplementary evidence only. No memory claim is made;
formal memory accounting (both BENCHMARK metrics, reference conditions)
belongs to GATE-A2.

Instrument bound: `TotalProcessorTime` quantizes at the scheduler tick
(~15.6 ms), so a 30 s window can hide up to ~0.0033 % normalized — the
0.0000 % readings are therefore "≤ 0.0033 %", still 60× under the budget.
The zero-wake structure corroborates independently: all four runs are on
the FIXED build (`2d35706f`), and both parked runs' stderr shows
`C3EVENT,suspend,229/248 ms,tick=2` — the tick=2 hold is the svc gate
working (pre-fix archived runs parked at tick=1: 184/210/230 ms in
`suspend-verify2`/`wake-test`/`wmclose`) — followed by **no**
`C3EVENT,wake` and no A3 activity after settle, i.e. zero ticks, zero
renders, zero present submissions inside the window.

The 60 Hz control arm's spread (0.047 vs 0.094 s) is unexplained but
noise-dominated; the headline parked-vs-loop comparison is unaffected (both
parked runs read zero; the largest loop reading is still 10× under budget).

**Gate reading:** ≤ 0.2 % idle budget — parked runs measure **0.0000 %
(PASS as architecture-host evidence; GATE-A2 re-measures integrated)**.

## 5. Wake behavior + the review BLOCKER regression

- Parked → `WM_CLOSE` (real OS event): suspend at 256 ms (tick=2 — the svc
  gate holds parking until the inbound ack queue drains), `C3EVENT,wake,
  4151 ms`, clean process exit **109 ms** after the post (archived:
  `wmclose2.exit`, `wmclose2.err`; the wrapper did not capture the numeric
  exit code — `WaitForExit(5000)` success with no error output is the
  clean-exit evidence).
- Wake→work latency: the parked branch consumes one input, then runs the
  normal loop-top drain + tick — the same code the 60 Hz loop executes.
  No direct input→present measurement is claimed (see the injected-keyboard
  limitation below); C4's real-input driver owns that chain.
- **BLOCKER regression (end-to-end, harness build for A3 lines):** 3-file
  manifest walk with parking ENABLED (no `--quit-after`): r1 bound@tick 0 /
  acked@1, r2 bound@1 / acked@2, r3 bound@2 / acked@3, `C3EVENT,suspend`
  only at **tick=4** after the walk fully settles (`walk-parked.err`). The
  pre-fix code parked at tick=1 with r2's reply stranded in `svc_in` — the
  guest never composes it and the walk stalls. Surface-level regression
  test: `svc_guest_pending_tracks_the_inbound_queue` (round-trips a pushed
  line through the real `svcPoll` op).
- Injected-keyboard limitation (reproducible in BOTH modes): PostMessage
  key-down to a minimized window wakes the loop but, as measured by C3's
  build, did not deliver a guest-visible key. **Corrected by C4:** the root
  cause is the missing lParam scan code (winit resolves the logical key
  from the scan code — a zero scan produces an unusable key), not focus;
  posted keys with a valid scan code deliver 60/60 to a minimized window
  (CORRECTIVE-C4-EVIDENCE.md §2). The separate SendKeys/SendInput hardware
  injection failures on this unattended desktop remain unexplained; the
  control run with the loop forced 60 Hz (`--trace-frames`) reproduced the
  non-delivery either way, exonerating the parked path. End-to-end
  real-input response belongs to C4's driver.

## 6. Behavior verification

| Check | Build | Result |
| --- | --- | --- |
| Manifest walk (12 MP, corrupt, 24 MP, fake, orient6; `--quit-after 600`) | bench-harness | exit 0; `successes=3, failures=2, cancels=0, decodes=5, txBytes=812, rxBytes=891` — identical to the C1 record (these runs exercise the never-park path via the quit gate) |
| A5 rapid-switch stress (`--key s@200`, quit 1200) | bench-harness | exit 0; `successes=27, failures=96, cancels=96, decodes=27, txBytes=7864, rxBytes=22786` — identical to the C1/GATE-A-era records. Caveat carried from C1 §6: these counters are arrival-timing sensitive across sessions (C2's own rerun read 25/25), so this is a bounded-behavior check, not byte-level invariance |
| A6 scale smoke (1.5@120, 2.0@240) | bench-harness | exit 0; 4 scale/physical events; logical-viewport invariant held |
| Walk-parked (3 files, parking enabled) | bench-harness | §5 BLOCKER regression: 3 binds, 3 acks, park at tick 4 |
| Startup sanity (20-run probe, plain build) | plain | IMGREADY P50 359 ms; outliers 726/460 ms. Labeled sanity only (20 < the 50-run normative rule; no gate closes on it) — C1's numbers remain the startup evidence; probe runs never park (`--quit-after` gate), so the startup path is structurally unchanged |
| `cargo test --release` (desktop host) | — | 15 passed, 0 failed, 1 ignored |
| `cargo test --release -p pocket-ui-surface` | — | 10 passed (incl. static-frames default-off + binding round-trip, and the svc-pending BLOCKER regression; offload credit counting incl. the dead-worker rule asserted in the bounded-ops test) |
| `cargo test --release` (pocketjs-core) | — | 132 passed |

## 7. Next unblocked issue

Per the campaign mission order: **C4/#28 (present pacing)** is next; the
real-input driver it requires must handle the focus/minimized limitation
documented in §5. No budget was weakened; the idle PASS above is
architecture-host evidence referred to GATE-A2 like every other row.

## 8. Review trail

Two fresh-context adversarial reviews ran before the PR (runtime
semantics/lost-wakeup; benchmark/evidence). Review 1 verdict BLOCKED —
findings and dispositions:

- **BLOCKER (svc_in stranding): fixed** (`svc_guest_pending()` gate +
  regression tests; §5 end-to-end proof). The original evidence had
  corroborated the bug unknowingly (park at tick=1 precedes the ack drain).
- **MAJOR (animated sprites missed by `animating()`): fixed** (sprite scan).
- MINOR (offload credit leak disables parking forever on worker death):
  fixed (session-aware `outstanding()`).
- MINOR (false "never true while paused" doc): fixed.
- MINOR (non-parked loop pacing change claim): **rebutted on record** —
  the lag-branch reset exists verbatim in pre-C3 code; the diff only
  re-indented it (§2).
- MINOR (C3EVENT wake ambiguity / once-only suspend marker): documented
  in §2 item 5.

Review 2 verdict PASS — evidence-hygiene findings and dispositions: raw
idle summaries now archived per run (`idle-*-*.summary`); dual-binary
session and per-section build identities now recorded (§0, §4, §6); A/B
arm-selection mechanism documented (§0 guest-build row); WM_CLOSE exit
archived (`wmclose2.*`); 0.006-vs-0.007 rounding resolved by re-measuring
with 4 decimals (0.0098/0.0195); TotalProcessorTime quantization bound
stated (§4); BENCHMARK §8 (not §7) cited; control-arm spread noted (§4);
startup-sanity outliers disclosed (§6); "byte-identical" phrasing replaced
by the arrival-timing caveat (§6); campaign base SHA, sample medium, and
re-recorded toolchain identity added (§0). The BENCHMARK §8 "also record"
items (render-submission rate, fs/timer and network sources) are covered
by §4's zero-ticks evidence and §3's audit table.

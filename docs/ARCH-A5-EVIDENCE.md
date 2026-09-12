# ARCH-A5 Evidence Report

Ticket: [#7 — [ARCH-A5] Prove generation cancellation and hostile-resource bounds](https://github.com/jnhu76/PicoView/issues/7)

**VERDICT: PASS.** 120 rapid image requests driven through the real
guest→svc→decode→publish seam collapse to 24 decode cycles + 96 bounded
cancellations, the newest requested generation is the one and only final
published state, peak memory stays inside the PRD rapid-request hard budget
(≤384 MiB WS-Private) with wide margin, hostile inputs fail bounded without
crash, and static viewing returns to a silent idle (no present, no render
loop) after the storm drains.

## Identity

| Item | Value |
| --- | --- |
| PicoView branch / base | `arch/a5-cancel-bounds` from `af97fd2` (A4 merge); A5 commit recorded in the PR |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen Phase-A baseline) |
| PocketJS effective A5 base | `7979c1d8` (A4 effective, branch `picoview-a4-large-jpeg-fit`) |
| PocketJS A5 branch | `picoview-a5-cancel-bounds` = `7979c1d8` + A5 patch (local; Mimosa audit pending before any upstream push) |
| A5 diff scope | `hosts/desktop/src/{a3.rs,main.rs,tests.rs}` only; **zero diff** in `contracts/`, `framework/`, `engine/`, `vapor` |
| Lineage | `a5a85356` (A0 baseline) → `62ee522f` (A1) → `fe32ea82` (A2) → `fa936129` (A3) → `7979c1d8` (A4) → A5 patch |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)`, `stable-x86_64-pc-windows-msvc`; release build |
| Machine (BENCHMARK §1) | AMD Ryzen 7 5800H, 16 logical processors; 28.9 GiB RAM; 60 Hz display; C: on KIOXIA EXCERIA NVMe SSD; power plan Balanced. Machine identity recorded 2026-09-12T18:47Z; A5 runs 2026-09-13 (log wall clocks) |
| GPU | AMD Radeon(TM) Graphics — **integrated** (iGPU), Vulkan/Bgra8Unorm, driver 31.0.21923.11000; PRD reference-class deviation (iGPU vs "hardware-accelerated desktop GPU") stated for GATE-A, same as A4 |
| Guest | `guest/app.octane.tsx` (Octane) + A5 stress mode; id `dev.picoview.arch-a5-guest`, output `picoview-a5-main`, planHash `sha256:35dd559e9265b9b82a18b495d5a77d2103c098b98807031952ba8f967820b8c9` (committed as `guest/picoview-a5-main.plan.json`); compiled from the PocketJS checkout root (`guest/` is a junction to `PicoView/guest/`) |
| Scratch evidence | `evidence/tmp/` (not committed): `logs/a5-stress.log`, `logs/a5-hostile.log`, `mem-a5-stress.watch.json`; committed corroboration is the unit tests + quoted log lines |

## What was built (scope)

One mechanism, end to end, on the admitted A3/A4 seam:

* **Coalescing drain (PocketJS host, `a3.rs`/`main.rs`)**: guest open
  requests (`a3open`/`a4open`) no longer decode inline inside the svc
  drain. They are accepted into a pending queue whose per-entry state is
  bounded (path string + two integers; depth bounded by arrivals within
  one drain, freed wholesale by `mem::take`);
  once per tick, after the full drain, `process_pending` collapses the
  queue to its **newest** entry and answers every superseded request with
  a bounded `{t:"a3error",req,code:"cancelled"}` reply **before any
  decode/register/upload stage runs**. Only the newest request reaches
  `handle_open`. This enforces the PRD §17 invariant *current-image
  work-in-flight = 1* structurally: a stale generation cannot publish
  over a newer one because a newer queued request removes older ones
  before they start.
* **Request lifecycle logging**: `A3EVENT,open,…,state=queued` on
  arrival, `A3EVENT,cancel,req,arrivedTick,supersededBy` + `code=cancelled`
  for each superseded request, `A3EVENT,decode` when work actually starts;
  `A3BOUNDARY` gains cumulative `cancels=` / `decodes=` counters.
* **Guest stress mode (`key "s"`)**: fires 120 rapid Fit requests
  (5 per frame × 24 frames, cycling the manifest, unique `p<N>` req ids)
  with **no pending gate**, counts replies by kind (img / cancelled /
  other), and reports the guest-visible outcome ("A5 stress complete:
  sent=120 imgs=24 cancelled=96 …").
* No new opcode, ABI, dependency, surface, or pixel path (diff scope
  above); guest stays a proof harness.

## Stress — 120 rapid requests through the live seam (MEASUREMENT)

Run: release binary, live window, 3-sample manifest (12/24/50 MP, fit
1760×990), `--key s@200` starts the burst, `--trace-frames`, quit at tick
1200. Log: `a5-stress.log` (scratch).

```
arrivals=123 (3 walk + 120 stress)  cancels=96  decodes=27  imgs=27  errors=96
A3BOUNDARY,successes=27,failures=96,cancels=96,decodes=27,
           txLines=124,txBytes=7864,rxLines=242,rxBytes=22786,
           totalBytes=30650,currentPlane=12580224
```

FACT, per the log:

* 120 stress requests (`p0`–`p119`) arrived across 24 drain batches
  (ticks 200–223): one 6-request batch at tick 200 (5 cancels), twenty-two
  5-request batches (4 cancels each), one 4-request batch at tick 223
  (3 cancels). Each batch collapsed to exactly **1 decode + N−1
  cancels** (`code=cancelled`).
* The published sequence ends `… p110, p115, p119` — the **newest
  requested generation is the final published state**; no cancelled or
  superseded request ever produced an `a3img` (96 cancels, 0 stale imgs).
* Total svc traffic for the entire storm: **30,650 B** against a live
  12,580,224-B plane — the boundary stays a control plane (the plane is
  ≈ 410× the entire storm's boundary traffic).
* Final live resource: exactly **one** plane (`currentPlane=12580224`,
  the 50 MP fit), with a synchronous `retiredReq` chain on every img
  line — retirement never waited for GC (A2's GC-independence, now under
  storm conditions).

Supplementary session observation (context, not on-disk evidence — its
log and watch JSON were overwritten by the burst run): with arrivals
paced 1/frame the same 120 requests produced 122 decodes / 1 cancel and
peak WS-Private 299.5 MiB. The guest and host share one frame loop, so
1-per-frame arrivals never queue and coalescing has nothing to collapse;
this is why the committed stress mode fires bursts. Recorded here for
completeness; the burst run above is the evidence-bearing configuration.

## Memory during the stress (MEASUREMENT)

memwatch 50 ms sampling (`mem-a5-stress.watch.json`, scratch), burst run:

| Metric | Value | Budget/note |
| --- | --- | --- |
| **Peak WS-Private (sampled)** | **262,758,400 B = 250.6 MiB** | PRD hard budget ≤384 MiB → **PASS**, margin ≈ 133 MiB |
| Max Private Bytes (sampled) | 620,744,704 B = 592.0 MiB | companion metric (BENCHMARK dual-metric rule) |
| Settled WS-Private | 262,758,400 B | includes the bound 50 MP fit plane + session baseline |
| PPMC PeakWorkingSetSize | 387,903,488 B | total working set (non-normative), still < 384 MiB+4 |
| PPMC PeakPagefileUsage | 695,078,912 B | peak private committed (companion) |

Absolute levels drift between desktop sessions (the A4 report records a
~599 MiB Private-Bytes session baseline with *no image*); within-session
attribution remains the comparable quantity. The gate metric — sampled
WS-Private peak — stayed 250.6 MiB against the 384 MiB hard budget **in
the same session** where an idle control measured ≈ 241 MiB: the storm's
transient cost above baseline is on the order of one plane, not one
per request.

## Idle return (MEASUREMENT)

From the same `--trace-frames` run, after the drain:

* Last `a3img` tick **223**; last `present-submit` tick **225**; the run
  continued to tick 1200 with **zero** further present or render-submit
  markers — no PicoView-owned continuous render loop while static.
* Post-drain tick work: all but two ticks below 1 ms; the two exceptions
  are isolated 3.4 ms / 3.6 ms blips at ticks 630 and 876 (single-shot
  scheduler/GPU jitter, not recurring, no present attached). Static idle
  returned exactly as A3 defined it, now after a storm instead of a walk.

## Hostile inputs, extreme dimensions, overflow (FACT + MEASUREMENT)

Live hostile walk (`a5-hostile.log`, release binary, exit **0** observed
by the session runner — the log carries no panic/crash markers and clean
frame cadence through tick 400), fit-first walk over a hostile manifest:

| Request | Input | Outcome (log line) |
| --- | --- | --- |
| r1 | truncated JPEG (512 B) | `code=corrupt` — bounded, walk continues |
| r2 | PNG bytes as .jpg | `code=not_jpeg` (content sniff, pre-decoder) |
| r3 | 0-byte file | `code=not_jpeg` |
| r4 | valid stream, SOF patched to 9000×9000 | **fit path queried the DCT ladder first**: `GetClosestSize` returned the ¼ rung → decoded 2250×2250 (admissible), so the hostile declared dimensions never allocated — 20.25 MB plane, not 324 MB |
| r5 | 12 MP control | decoded and published normally after the hostile inputs |

The full-request (100%) path on the same 9000² class input is rejected
pre-allocation with `too_large` (live in A4's 50 MP degrade; unit-pinned
below). Overflow arithmetic (`u32::MAX`-sized planes) is rejected by the
same `checked_plane_bytes` admission before any `vec![]` (unit test
`a3_decode_plane_admission_is_checked_before_allocation`).

End-to-end hostile batch unit test (`a5_hostile_batch_fails_bounded_and_
recovers_without_crash`): missing / not_jpeg / corrupt / 9000² too_large /
65535² bounded (`too_large` or `corrupt`, whichever layer refuses first) —
each gets exactly one bounded reply, nothing hostile publishes, and a
valid request right after the batch decodes, publishes, and owns exactly
one plane.

## Cancellation semantics (FACT, unit-pinned)

All four A5 tests drive the real harness seam (`observe_rx` → queue →
`process_pending` → real `UiSurface` register/free), not internal flags:

* `a5_rapid_requests_coalesce_and_only_the_newest_publishes` — 120 queued
  requests, drain once: 119 cancels + 1 img for `s119`; no work starts
  inside the drain; live texture = exactly one plane; tx stays < 16 KiB.
* `a5_interleaved_generations_publish_strictly_in_request_order` — three
  waves of 10 generations; the publish sequence is exactly the newest of
  each wave, in wave order (stale can never replace newer).
* `a5_hostile_batch_fails_bounded_and_recovers_without_crash` — above.
* `a5_cancellations_never_disturb_the_live_resource_or_boundary_budget` —
  50-request cancellation burst over a settled image: live resource
  untouched, `cancels=49`, cancel replies bounded (< 512 B/request).

Test suite: `cargo test --release` hosts/desktop **26 passed / 0 failed /
1 ignored** (22 prior + 4 new). `engine/core` untouched by the A5 diff
(132/0 for the record, A4 run).

## Correctives taken during this ticket

* **Stress cadence redesigned from measurement**: the first live burst
  (1 request/frame) produced 122 decodes / 1 cancel — guest and host
  share one frame loop, so paced arrivals never queue. The stress mode
  was changed to 5-per-frame bursts so the drain actually faces queue
  depth (96 cancels / 24 decodes). The unit tests always exercised the
  deep-queue path; the live run now matches it.
* Guest stress requests use unique `p<N>` req ids (the A4 review's
  req-reuse MINOR, fixed for the storm path).

## Known non-blocking findings (MINOR, recorded)

* The `failures` counter includes cancellations (a cancel rides the same
  bounded reply path as a decode failure), so in the storm boundary line
  `failures=96` is entirely cancels; the separate `cancels=` counter is
  the precise field. GATE-A readers must not read `failures` as a
  hostile-failure count.
* The pending queue is per-entry-bounded but not capped; adversarial
  review confirms no amplification (each superseded request costs one
  bounded text reply) and the queue frees wholesale per drain. The
  pre-existing `sent` log mirror grows for process lifetime (predates
  A5; harness-only).
* `process_pending` is skipped for a tick if the drain loop's
  pre-existing `save`-intent error path returns early; queued entries
  simply persist and coalesce next tick (latency, not correctness;
  unreachable in PicoView runs — the guest never emits `save`).
* Guest quirk: a stress burst that cancels an in-flight *walk* request
  makes the walk silently advance past that file (harness-only state;
  the recorded storm starts after the walk settled — arrivals 123 = 3
  walk + 120 stress, zero walk requests cancelled).
* The "newest fails after its batch's cancels" composition (cancel batch
  issued, then the newest decode errors) is implied by the synchronous
  handle_open paths but not explicitly unit-pinned; a one-line test
  would harden it.
* Pre-existing dead-code warnings in the non-test binary build
  (`probe_source_transform` / `SourceTransformProbe` are test-and-probe
  surface since A4); cosmetic, fold into the next runtime patch.
* `liveBytes` in `A3EVENT,img` is sampled **before** the synchronous
  retire of the replaced texture, so it shows the transient
  new-plane+old-plane sum (e.g. 36,580,224 on the final stress img).
  Post-run `currentPlane` in `A3BOUNDARY` and the texture registry state
  are the settled truth. Documented so GATE-A reads the fields correctly.
* The two isolated sub-4 ms idle blips (ticks 630/876) are not
  attributable to PicoView work (no present, no svc, no decode attached);
  A7's idle budget will re-measure with the monotonic-clock
  instrumentation.

## Acceptance criteria map

| Criterion (issue #7) | Evidence |
| --- | --- |
| ≥100 rapid requests cannot let an older generation replace the newest | stress run: 120 requests, final img = `p119`, 0 stale imgs; unit `a5_interleaved_generations…` |
| Obsolete work cancelled/retired before later stages where possible | cancels issued before decode in `process_pending`; 96/120 cancelled live; no decode inside the drain (unit-asserted) |
| Native resources reclaimable promptly, no QuickJS GC | synchronous `retiredReq` chain per img; `currentPlane` = exactly one plane after the storm; A2 GC-independence carried over |
| Peak memory within PRD hard budget or stop-the-line FAIL | peak WS-Private 250.6 MiB ≤ 384 MiB (both burst and 1/frame variants within budget) |
| Extreme dimensions/overflow rejected before catastrophic allocation | 9000² live: DCT-rung degradation to 20 MB; full-path `too_large` pre-allocation (unit + A4 live); `u32::MAX` overflow unit-pinned |
| Corrupt JPEG + malformed/hostile fail without crash | live hostile walk exit 0 (corrupt / not_jpeg ×2); unit hostile batch test |
| Cancellation tests exercise the end-to-end seam | unit tests drive the full harness seam incl. real texture registry; live storm drives the real guest svc channel |
| Static viewing returns to expected idle state | presents stop at tick 225 of 1200; work < 1 ms except two isolated blips; no render loop |

## Verdict

PASS. No budget weakened, no gate redefined: the ≤384 MiB hard budget was
measured and met; the ≤20 ms interaction budget is not exercised by this
ticket's acceptance criteria and remains in GATE-A's hands with A4's
hand-off note.

Single next issues: **#9 (ARCH-A6, Per-Monitor DPI V2)** and **#15
(ARCH-A7, footprint/startup/idle)** are both `ready-for-agent`; campaign
order proceeds with #9.

## Evidence identity note

Scratch logs/watch JSONs live in `evidence/tmp/` and are deliberately not
committed; the report quotes the load-bearing lines and the committed test
suite reproduces every mechanism claim. If this report and the tracker
disagree, the tracker wins.

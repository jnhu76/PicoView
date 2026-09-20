# PICOVIEW-DECODE-PRESSURE-MECHANISM-GATE-1 (C8A) — evidence

Campaign: PICOVIEW-POST-RELEASE-NORMALIZATION-1, C8A (Refs #75, MAJOR-5).
Status: measurements complete; mechanism selected — see verdict at the end.
Probe tool: `native/src/current_item/pressure_probe.rs` (opt-in:
`PICOVIEW_PRESSURE_PROBE=1 cargo test --release -- pressure_probe -- --ignored --nocapture`).

## 1. Identity (docs/BENCHMARK.md §1)

| Fact | Value |
| --- | --- |
| PicoView SHA | `cf4ef2f69ed53f01b7a44a53425a0b46e87e4938` (normalization branch; contains C0 svc retention) |
| PocketJS SHA | see `POCKETJS.lock` (`720e6ee3…`) — untouched |
| Toolchain | rustc 1.98.1 (48a229cea), stable-x86_64-pc-windows-msvc, release profile |
| OS | Microsoft Windows NT 10.0.26200.0 |
| CPU / RAM | AMD Ryzen 7 5800H, 16 logical processors, 28.9 GB |
| GPU | AMD Radeon(TM) Graphics, driver 31.0.21923.11000 (probe creates NO GPU device — CPU/decode/admission/guest path only) |
| Media | generated in OS temp dir, deleted after run: 32bpp BMP, 1280×960 (1.2 MP) and 8064×6048 (48.7 MP). Decode cost is O(pixels); no personal images, nothing committed |
| Guest | real PocketJS guest: embedded pak + `dist/picoview.js`, mounted like `Runtime::boot` (windows-app identity), `guest.frame(0)` per tick |
| Command path | mirror of `Runtime::tick`: svc lines → C0 `SvcPending` refill → `take_batch(MAX_SVC_LINES_PER_TICK)` → `handle_command(before_guest_frame)` → `guest.frame` → `release_superseded(after_guest_frame)` |

## 2. Measured — current released+corrected mechanism (before C8B)

Raw probe output (`native/target/pressure-probe.json`, this run):

```json
{
  "scenarios": [
    {"scenario": "single_normal_open_us", "median_us": 3456},
    {"scenario": "single_large_open_us", "median_us": 116953},
    {"scenario": "burst64_mixed", "ticks": 1, "first_tick_cmds": 64,
     "first_tick_command_us": 1567958, "first_tick_frame_us": 16172,
     "peak_superseded": 39, "peak_residency_bytes": 2478637056,
     "wall_us": 1664392}
  ]
}
```

Findings:

1. **Single open latency** — normal image (1.2 MP): **3.5 ms** median.
   Large image (48.7 MP): **117 ms** median. The decode→admission→publish
   path itself is fast; the problem is burst multiplicity, not per-open cost.
2. **Frame starvation (MAJOR-5 mechanism, quantified)** — a burst of 64
   navigation commands delivered in one guest turn processes ALL of them in
   one tick: the command phase runs **1568 ms** before `guest.frame()` runs
   (frame itself 16 ms). One guest turn = **1.58 s** without a frame; a
   60 Hz-class cadence is blown ~100×.
3. **Transient stacked residency** — at the tick's observation boundary,
   **39 superseded logical handles** are queued at once and the logical
   texture bytes alive at that moment peak at **2.48 GB** (≈12 coexisting
   48.7 MP RGBA planes + smaller planes). All are freed at the boundary
   (correctly — no leak, working set 598→786 MB after the run), but the
   transient stack is exactly the "repeated synchronous decode accumulates
   superseded GPU handles until the next observation boundary" mechanism the
   audit flagged. On the real GPU path each admitted resource additionally
   uploads (one `write_texture` per admission), so a burst also stacks
   uploads for resources that are superseded microseconds later.
4. **Settle** — burst settles on the final requested item in one turn
   (wall 1.66 s), because the tick drains the whole retained batch through
   the expensive path unbounded.
5. **No command loss** — with the C0 queue every one of the 64 lines is
   processed (39 real opens; the rest are edge no-ops: Previous/Next stop at
   directory edges by contract), FIFO retained. C0's correctness holds under
   burst; what remains is scheduling, not retention.

## 3. Mechanism comparison

| Criterion | A. FIFO + ≤1 expensive open per guest frame | B. Intent coalescing | C. Generation cancel before decode | D. Async decode |
| --- | --- | --- | --- | --- |
| Correctness semantics | unchanged (each command still publishes in order) | intermediate opens never run (position jumps to final) | intermediate opens never run | unchanged |
| FIFO / user intent | preserved exactly | partially (latest-wins) | partially | preserved |
| Publication ordering | preserved | preserved (fewer publications) | preserved (fewer) | needs out-of-order guard |
| Frame delay under burst | ≤ one decode (~117 ms worst) per frame | ≤ one decode | ≤ one decode | near-zero frame cost, but residency budget still needed |
| Peak superseded residency | ≤1 per boundary (vs 39 measured) | ≤1 | ≤1 | needs explicit budget to bound |
| Implementation complexity | **trivial** (budget check in the tick loop; C0 queue already retains tails) | moderate (intent merge in queue) | moderate (generation tracking + skipped-publication semantics) | high (WIC apartment, ownership, stale completion, shutdown) |
| Cancellation state complexity | none | none | real (stale generation bookkeeping) | real |
| Shutdown/lifetime complexity | none | none | none | high |
| Reduces total CPU work | no (same opens, distributed) | yes (skips intermediates) | yes (skips intermediates) | no |

Analysis:

- The measured problem is **serialization inside one turn**, not decode
  cost: 64 opens is ~1.6 s of CPU regardless of mechanism. Only the
  distribution across frames changes.
- **D (async decode)** does not reduce the work, adds a second decode
  concurrency domain (WIC apartment + lifetime), and still needs an
  admission budget to bound residency. Not justified by the evidence; the
  campaign default bias explicitly disallows it without such evidence.
- **C (cancellation)** reduces work but needs generation bookkeeping and
  changes visible semantics (intermediate positions skipped). It buys
  nothing over A for frame pacing: A already caps frame delay at one decode.
- **B (coalescing)** has the same properties as C with less machinery, but
  still changes semantics and adds queue-merge logic.
- **A** is the smallest mechanism that removes the measured problem:
  the C0 queue already retains the tail (C7 oracle proves 0/1/64/65/129
  retention); the only change is to stop processing expensive commands after
  the first one each tick, retaining the rest for later ticks. Frame delay
  becomes bounded by one decode (≤ ~117 ms measured worst case, ~4 ms for
  normal images), superseded residency drops from a 39-handle/2.48 GB peak
  to ≤1 superseded handle per boundary, and no observable product semantics
  change (FIFO preserved; intermediate frames are exactly what released
  behavior renders for slower bursts).

## 4. Verdict

```text
C8B_REQUIRED:mechanism-A — persistent FIFO (C0) with at most one expensive
open/decode per guest frame
```

C8B implements exactly that budget in `Runtime::tick`, re-runs this probe
against the changed mechanism, and records the before/after delta here.

Adversarial review notes (fresh context, post-measurement):
- The probe mirrors `Runtime::tick` stage-by-stage; the mirror is kept in
  the same crate and reviewed against the production tick (drain → refill →
  budget → handle_command(before_guest_frame) → frame → boundary release).
- `superseded` counts are read from `CurrentItem` directly (test-only access
  in the same module tree), not inferred from events.
- Residency is logical bytes of live+superseded textures from PocketJS
  `ui.texture(handle)` — the honest CPU-side residency proxy without a GPU
  device; the GPU-path upload cost is argued one-to-one from admissions, not
  measured.
- BMP fixtures measure decode/admission at O(pixels); JPEG adds entropy
  decode per pixel but the burst behavior under study (queue pacing,
  residency stacking, frame delay) is multiplicity-driven, not codec-driven.
  The single-open latencies above are for BMP; real JPEG photos of the same
  size cost more CPU but the mechanism verdict does not depend on that
  constant.
- Navigation edge no-ops (Previous/Next stop at directory edges by released
  contract) were verified to be the reason a naive one-direction burst only
  produced 5 opens; the probe ping-pongs to keep every command live.

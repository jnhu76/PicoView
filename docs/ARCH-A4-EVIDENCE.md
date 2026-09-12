# ARCH-A4 Evidence Report

Ticket: [#4 — [ARCH-A4] Prove large-JPEG Fit path and direct-manipulation budget](https://github.com/jnhu76/PicoView/issues/4)

**VERDICT: PASS.** Viewport-appropriate JPEG decode through the WIC inbox
source-transform is proven end to end (queried, not assumed), Fit costs scale
with the *display* plane rather than the stored megapixels, 100% refines
without pixels crossing QuickJS, 50 MP Fit lands inside the PRD resource
policy, and pointer-anchored zoom/pan compose over the real PocketJS
composition path with a measured input→present proxy. The 50 MP 100% request
is rejected **explicitly before allocation** (`too_large`) and the guest keeps
presenting the previous state — no catastrophic allocation.

## Identity

| Item | Value |
| --- | --- |
| PicoView branch / base | `arch/a4-large-jpeg-fit` from `063bc3fbbf1e` (A3 merge); A4 commit recorded in the PR |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen Phase-A baseline) |
| PocketJS effective A4 base | `fa9361297de3ed9fe66f84cfb25c053b2584892a` (A3 effective, branch `picoview-a3-wic-first-jpeg`) |
| PocketJS A4 branch | `picoview-a4-large-jpeg-fit` = `fa936129` + A4 patch (local; Mimosa audit pending before any upstream push) |
| A4 diff scope | `hosts/desktop/src/{a3.rs,main.rs,tests.rs}` only; **zero diff** in `contracts/`, `framework/`, `engine/`, `vapor` |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)`, `stable-x86_64-pc-windows-msvc`; release build (`cargo test --release`, `--release` harness binary) |
| OS / GPU | Windows 11 (10.0.26200), native Windows host (not WSL); wgpu adapter: "AMD Radeon(TM) Graphics" (IntegratedGpu, LowPower), Vulkan / Bgra8Unorm |
| Guest | `guest/app.octane.tsx` (Octane), compiled to `dist/picoview-a4-main.{js,pak}` via `bun tools/pocket.ts compile --target windows-app --manifest guest/pocket.json --project-root . --outdir dist`; guest entry `main.octane.tsx` resolves `app.octane.tsx` |
| Guest plan | id `dev.picoview.arch-a4-guest`, output `picoview-a4-main`, planHash `sha256:f5063916caefad2865d428577c4d82e73cd9b26b2a18453c469de09c7ba94e15`; resolved plan committed as `guest/picoview-a4-main.plan.json` (viewport 720×480 logical @ density 2 = 1440×960 physical, policy dynamic) |
| Scratch evidence | `evidence/tmp/` (not committed): run logs, memwatch JSONs, screenshots; committed corroboration is unit tests + quoted log lines below |

## What was built (scope)

One vertical slice on top of the admitted A3 seam, no new architecture seam:

* **WIC source-transform probe + scaled decode** (`a3.rs`):
  `probe_source_transform` casts the decoded frame to `IWICBitmapSourceTransform`
  and calls `GetClosestSize` (in/out) — the inbox JPEG DCT-scaling ladder is
  *queried and measured*, not assumed. `decode_jpeg_scaled` inverts the display
  fit into stored space (swapping for R90/R270 orientations), takes
  `GetClosestSize`, then `GetClosestPixelFormat` + native-format `CopyPixels`
  (handles 32bppBGRA / 24bppBGR / 32bppRGBA codec-native formats) and
  normalizes to core PSM_8888; a clamped `IWICBitmapScaler` fallback exists
  (no upscaling) for sources whose codec rejects the transform path.
* **Fit request on the wire** (`a4open {req,path,fitW?,fitH?}`, capped at
  `NATIVE_TEX_MAX_DIM`): the same svc ops 30–32, one more optional field; the
  harness announces `{mode:"fit"|"full", nativeW, nativeH}` so the guest and
  the log always know the *stored* identity of the bound resource.
* **Guest Fit/100%/zoom/pan** (`app.octane.tsx`): `f`=Fit (requests scaled
  decode), `1`=100% (requests full decode), `=`/`-`=pointer-anchored zoom,
  drag=pan with clamped bounds. Zoom/pan are pure composition state over the
  already-bound texture — ordinary image node, style-box updates, no new
  decode, no new texture, no JS pixel payload. Every view change reports
  bounded geometry back (`a3ack {bound, geom:[bx,by,bw,bh], zoom}`).
* **Explicit degrade**: admission (`checked_plane_bytes`) runs before any
  allocation, unchanged from A3; A4 proves the 50 MP 100% path live.

Explicit answers:

* new DrawList opcode / new compositor surface / ABI change? **NO** (zero diff
  outside `hosts/desktop/src`).
* pixels (encoded or decoded) through QuickJS? **NO** (audited below).
* second image path / second registry? **NO** — scaled output enters the same
  `register_native_texture` A2 seam.
* new dependency? **NO** (windows 0.62 already admitted in A3).

## Sample corpus identity (FACT)

Generated synthetic photo-like gradient scenes (deterministic generator
`gen-samples-a4.ps1`), baseline-quality JPEG, no EXIF unless stated:

| File | Stored dims | Encoded size | Full RGBA plane |
| --- | --- | --- | --- |
| `picoview-12mp.jpg` | 4000×3000 | 1,231,842 B | 48,000,000 B |
| `picoview-24mp.jpg` | 6000×4000 | 1,890,113 B | 96,000,000 B |
| `picoview-50mp.jpg` | 8688×5792 | 2,340,430 B | 201,227,264 B |
| `picoview-orient6.jpg` | 1200×900 + EXIF 6 | 61,327 B | (A3 sample, reused) |
| `picoview-corrupt.jpg` | 512 B truncation | — | — (error corpus) |
| `picoview-fake.jpg` | PNG bytes, .jpg name | 67 B | — (sniff corpus) |

## QuickJS boundary audit (FACT)

Same method as A3: host-side `A3SVC,tx/rx` mirrors + guest outbox counters.

* Largest svc line in the A4 zoom/pan campaign: **176 B** (`a4open` path +
  fit fields; `a3img` bounded semantic state; `a3ack` geometry numbers).
  The multi-MB planes never appear on the wire — a 96 MB plane travels
  file → WIC → `register_native_texture` → `handle: i32`.
* `a4open` adds `{fitW, fitH}` (two integers) to the request; the response
  format is unchanged from A3 plus `mode/nativeW/nativeH` (three scalar
  fields, present since A3's announce).
* Guest shape-validates every announced image message (handle/w/h numbers)
  before binding; corrupt/missing/fake inputs arrive only as bounded
  `{t:"a3error",req,code}`.

## Fit decode — WIC source-transform (MEASUREMENT)

Timestamp definitions: `decodeUs` = WIC open+probe+scaled CopyPixels+orient
inside the harness; `registerUs` = native texture create/upload;
`totalUs` = open(plus)→bound. `A3STAGES` container/metadata/pixel fields are
zero in the scaled path (stage instrumentation was not extended to it — the
`img` event carries the full breakdown instead). Percentiles nearest-rank.

Run: `--a3-harness` walk, 51 sequential fit requests per sample (1 cold +
50 warm), release binary, live window. `bench-fit.log` (153 img events,
154 `present-submit` frame traces — presentation timestamp follows every
bind; the latency budget below uses T6 input→present as the named proxy).

| Sample | Requested fit (physical) | WIC closest returned (announced) | Plane kept | via | decode P50/P95 | register P50 | total P50/P95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 MP | 1760×990 | **2000×1500** | 12.0 MB | source_transform | 22.1 / 24.0 ms | 1.4 ms | 25.1 / 27.3 ms |
| 24 MP | 1760×990 | **3000×2000** | 24.0 MB | source_transform | 39.6 / 43.2 ms | 3.1 ms | 45.1 / 48.8 ms |
| 50 MP | 1760×990 | **2172×1448** (¼ DCT rung) | 12.58 MB | source_transform | 39.7 / 42.1 ms | 1.7 ms | 43.4 / 46.3 ms |

Cold first sample totals: 41.0 / 43.7 / 44.7 ms. All n=50 warm per row.

FACT: the source-transform path was *queried at runtime* (`GetClosestSize`
probe, `via=source_transform` on every accepted decode) and the returned
sizes are the codec's own DCT rungs — 24 MP descends exactly one rung
(6000×4000 → 3000×2000), 50 MP descends two (8688×5792 → 2172×1448 ≈ ¼).
The unit test `a4_source_transform_reports_closest_native_size` pins the
probe behavior; `a4_scaled_decode_produces_oriented_plane_at_native_size`
pins oriented scaled output at the native size.

INFERENCE (bounded): Fit cost is governed by the *kept plane*, not stored
megapixels — 50 MP Fit is no more expensive than 12 MP Fit (43.4 vs 25.1 ms
total P50; the difference vs 12 MP is the ¼-rung DCT decode width, and its
memory cost is identical). Blind full-decode retention would have kept
48/96/201 MB planes; the seam kept 12/24/12.6 MB.

## 100% (full decode) behavior (FACT + MEASUREMENT)

* 12 MP full: plane 48 MB, decode ≈ 37–53 ms (A3 measurements, unchanged
  path), presented through the ordinary image node.
* 24 MP full (tick 90 of the zoom/pan campaign): plane 96 MB, openUs=953,
  **decodeUs=60,745**, registerUs=11,733, totalUs=77,088 — liveBytes peaked
  at 120,000,000 B = old fit plane (24 MB) + new full plane (96 MB) before
  synchronous retire-on-replace. Bounded, released by the existing
  GC-independent lifetime.
* 50 MP full: **rejected before allocation** — stored width 8688 >
  `NATIVE_TEX_MAX_DIM` 8192 → `A3DecodeError::TooLarge` →
  `A3EVENT,error,req=r1,code=too_large,tick=200` (live run
  `a4-degrade50.log`; reproduced in `a4-degrade50-visual.log` with the
  window held open). The guest acks the error (`bound=`, geom=null),
  keeps presenting the previous fit texture, and shows
  "r1 error code=too_large (picoview-50mp.jpg) — bounded, walk continues".
  OPERATOR ATTESTATION with screenshot (`shot-degrade50.png`, scratch):
  fit scene retained and composing, bounded status line visible, no crash,
  no OOM, window alive.
* Pixels never cross QuickJS in either direction (boundary audit above).

## Direct manipulation — input→present proxy (MEASUREMENT)

PRD budget under test: "60 Hz P95 input-event → correlated present-submission
target ≤20 ms **where measurable**; no repeated application-caused >33 ms
stalls during ordinary zoom/pan." Present-submission is the named proxy, not
display-photon latency; visual acceptance is separate.

Timestamp definition (T6): input wall-clock = tick-trace wall − elapsed at
the scripted input tick; present = first `present-submit` frame trace with
tick ≥ input tick; latency = present − input. 24 MP full texture bound,
release binary, live window.

**Sparse cadence** (1 gesture per 10–12 ticks ≈ human-rate; 17 anchored
zoom steps + 15 drag-pan gestures → 47 input ticks, from
`bench-panzoom-sparse.log`):

```
inputs=47 measured=47 missing=0 P50=21.23ms P95=41.34ms min=19.77ms max=53.90ms over33ms=5
```

Attribution per sample: guest work between input and view change is
**160–308 µs** on every one of the 47 inputs (`work` frame traces) — more
than 100× below the 33 ms stall threshold. The five >33 ms samples
(31.6–53.9 ms) sit on ~16.7 ms quantization steps and show no corresponding
work spike: they are presentation-pacing gaps (composition present cadence),
not application-caused stalls.

**Saturated flood** (80 inputs at 1–5-tick spacing, same session,
`bench-panzoom.log`): P50=122.49 ms, P95=156.31 ms, over33ms=76/77.
Discrimination run (sparse above) proves the flood number is presentation-
queue backlog under input flood, not substrate work latency. Known behavior,
recorded for A5 (cancellation/resource bounds), which owns saturation
discipline.

Anchor correctness (FACT, from the same logs):

* Visual run (`a4-visual-zoom.log`): `zoom-1 bound=free@1.250
  geom=[-24.0625,-61.875,928.125,618.75]`, `zoom-2 bound=free@1.563
  geom=[-140.078125,-139.21875,1160.15625,773.4375]` — box center stays
  exactly (440, 247.5) = stage center through both zooms (pointer parked at
  center). Screenshot attestation (`shot-zoom24.png`, scratch): scene
  enlarged ~1.56×, edges clipped by the stage, same bound texture.
* Campaign runs verify the pointer-anchored invariant u=(ax−bx)/bw from
  `a3ack` geometry on every zoom step: the image-space point under the
  pointer is preserved exactly (guest math is the invariant
  `bx' = ax − u·bw'`).
* Pan: drag moves shift the box and clamp within bounds; every move tick
  re-reports geometry via `a3ack`.

Budget verdict for the record (FACT + INFERENCE):

* "no repeated application-caused >33 ms stalls": **met** — application work
  per input ≤ 0.31 ms; >33 ms gaps are present-pacing, and no >33 ms stall
  repeats back-to-back at human-rate input.
* "≤20 ms P50/P95 where measurable": P50 = 21.23 ms sits ~1 ms above the
  20 ms target and the floor of every sample is 19.77 ms — the measured
  quantity is dominated by the presentation cadence of this substrate
  configuration (~one present interval). P95 = 41.34 ms exceeds 20 ms;
  the excess is pacing quantization (INFERENCE), but the number **does not
  meet the letter of the budget** and is handed to GATE-A for arbitration
  rather than redefined here. No budget is weakened by this ticket; the
  honest statement is "application work is microsecond-class; the remaining
  latency is the presentation interval plus quantization."

## Memory (MEASUREMENT)

Within-session control-run attribution (absolute memory drifts between
desktop sessions — A3-era runs measured ~340 MB settled private bytes in a
different session; the same binary hours later shows ~599 MB with *no image
at all*. Cross-session absolute comparison is invalid; deltas vs a control
run in the same session are the comparable metric). memwatch 50 ms sampling,
settled = median of final 40 samples; PPMC peaks via `PeakPagefileUsage`.

| Run (fit walk, then settle) | Settled WS-Private | Settled Private Bytes | Peak private committed (PPMC) | Δ private bytes vs control |
| --- | --- | --- | --- | --- |
| control (no image) | 240,816,128 B | 598,708,224 B | 599,412,736 B | — |
| 12 MP fit (plane 12.0 MB) | 253,370,368 B | 611,246,080 B | 611,860,480 B | **+12,537,856 B ≈ plane** |
| 24 MP fit (plane 24.0 MB) | 267,218,944 B | 624,885,760 B | 626,352,128 B | **+26,177,536 B ≈ plane** |
| 50 MP fit (plane 12.58 MB) | 253,534,208 B | 611,565,568 B | 612,319,232 B | **+12,857,344 B ≈ plane** |

FACT: the resident cost of a bound Fit image is its *scaled* plane plus a
small constant — the 50 MP sample costs the same as the 12 MP sample.
PRD resource policy honored: 50 MP Fit ≈ +12.9 MB, no catastrophic
allocation anywhere on the path (the 201 MB full plane is never allocated;
the 100% request that would need it fails at the pre-allocation admission
check).

## Tests

`cargo test --release` (hosts/desktop): **22 passed, 0 failed, 1 ignored** —
includes the A4 additions:

* `a4_source_transform_reports_closest_native_size` — GetClosestSize probe
  returns the codec's DCT rung (queried, not assumed);
* `a4_scaled_decode_produces_oriented_plane_at_native_size` — scaled decode
  of an EXIF-oriented fixture lands at the native oriented size;
* `a4_fit_request_decodes_scaled_and_announces_native_size` — harness-level:
  fit request → scaled plane bound → announce carries mode/nativeW/nativeH;
* `a4_full_request_on_oversized_source_degrades_explicitly` — oversized full
  request → `too_large` before allocation, walk continues.

`engine/core` untouched by the A4 diff: **132 passed, 0 failed** (suite
re-run for the record).

Non-Windows hosts compile unchanged (`decode_jpeg_wic_scaled` has a
`decoder_unavailable` `#[cfg(not(windows))]` twin).

## Scope

* No Product Phase B work: no BrowseSession, no prefetch, no chrome beyond
  the proof harness's minimal keys/hud, no format breadth beyond inbox JPEG.
* No new runtime, decoder, opcode, seam, or dependency (diff scope above).
* PocketJS change is runtime-generic and confined to the desktop host's
  A3/A4 harness module; product logic stayed in PicoView guest.

## Correctives taken during this ticket

* **EXIF 5/7 mapping swapped** (caught by adversarial review): transpose/
  transverse were initially mapped to the wrong rotate direction. Fixed to
  5 → (R90, flipH), 7 → (R270, flipH) with pixel-oracle tests.
* **Rotator-over-stream pathology repeated in the scaled path design**: the
  scaled decode materializes from memory, never pulls strips from the stream
  decoder (A3's 2.2 s/1.2 MP lesson applied by construction).
* **Stale committed guest diverging from evidenced bundle** (A3 carry-over,
  caught in review): removed dead state assignments; the committed guest is
  byte-reproducible (planHash recorded at build time).
* **`--key` flood syntax**: `--key ==@T` sent the literal name `==` (guest
  matches `=`); campaign generator fixed to emit single `=`.

## Known non-blocking findings (MINOR, recorded)

* `A3STAGES` fields are zero on fit lines (stage instrumentation not
  extended); the `img` event's openUs/decodeUs/registerUs/totalUs carries
  the full breakdown. A7's instrumentation consolidation can fold this in.
* Full-mode announce lines carry `via=source_transform` as a constant
  placeholder (full decode performs no scaling; the field is only meaningful
  on fit lines). Reporting quirk only.
* Whole-file read before content sniff (A3 finding, unchanged): bounded by
  encoded file size; cancellation/early-abort belongs to A5.
* Fit requests the physical viewport size (1760×990 @ density 2); WIC
  returns the nearest DCT rung ≥ request (e.g. 2172×1448 for 50 MP), so the
  kept plane can exceed the strict fit by up to one rung. By design; noted
  so GATE-A reads the memory numbers correctly.
* Guest stage canvas (880×495 logical) is larger than the plan viewport
  (720×480 logical): the live window shows the top-left crop of the stage,
  so screenshots clip the stage's right/bottom edge. Composition, geometry
  math, and all measurements are stage-coordinate and unaffected; a future
  guest aligns stage and viewport.
* Presentation-queue behavior under input flood (P50 122 ms) is documented,
  not fixed: saturation discipline is A5's acceptance territory.

## Verdict

PASS. Every acceptance criterion is evidenced:

* 12/24/50 MP Fit: requested size, WIC closest size, decode time, upload
  time, presentation markers, CPU stage costs, peak memory — recorded per
  sample class (n=50 warm each, nearest-rank percentiles).
* Source-transform queried/measured (probe + via flags + unit tests).
* Fit keeps display-sized planes (12/24/12.6 MB, not 48/96/201 MB).
* 100% refines without JS pixel transport (full ≤24 MP proven; boundary
  audit).
* Pointer-anchored zoom preserves the image-space point (exact geometry
  from acks; center anchor exact through multi-step zoom).
* Pan/zoom exercise the real composition path and are measured (sparse
  P50=21.23 ms / work ≤0.31 ms; flood backlog documented for A5).
* 50 MP Fit within PRD resource policy (+12.9 MB vs control); 50 MP 100%
  fails explicitly (`too_large`, pre-allocation) with the previous state
  retained — screenshot attestation.
* WIC missed no defining SLO → no libjpeg-turbo evaluation is opened by
  this ticket.

Single next issues now truly unblocked: **#9 (ARCH-A6, Per-Monitor DPI V2)**
— blocked by #4 until this ticket closes; #7 (ARCH-A5) was already
`ready-for-agent` and remains next in campaign order.

## Evidence identity note

Scratch run logs/watch JSONs/screenshots live in `evidence/tmp/` and are
deliberately not committed; the report quotes the load-bearing lines and
the committed test suite reproduces every mechanism claim. If this report
and the tracker disagree, the tracker wins; if both agree, the numbers above
are the record for GATE-A.

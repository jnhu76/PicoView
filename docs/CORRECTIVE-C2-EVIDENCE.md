# Corrective C2 Evidence Report — Minimal Product Host Footprint

Ticket: [#26 — [CORRECTIVE-C2] Minimal product host footprint](https://github.com/jnhu76/PicoView/issues/26)

**VERDICT: DONE as a corrective — the minimal product host is built, the
226.1 MiB baseline is decomposed, and the mechanism claimed by GATE-A is
corrected by measurement: the Phase-A proof harnesses contributed ~nothing
to residency; the real mechanisms were (1) wgpu multi-backend instance
enumeration (~65.7 MiB), (2) the wgpu default allocator's block
pre-allocation (~+120 MiB at first pipeline creation, isolated by control
run), and (3) the D3D12/DXGI + GL module load inside the default backend
set. After the host-policy fix the settled no-image baseline is
49.1 MiB WS-Private — inside the >64 MiB architecture FAIL ceiling but
ABOVE the ≤40 MiB PRD target — and 24 MP Fit viewing is 81.2 MiB
(≤128 PASS). The baseline row's final 40-vs-64 reading is referred to the
gate (GATE-A2); this report redefines no threshold.**

All memory figures in this report are MiB (2^20) or exact bytes; raw
instrument output for every table is preserved under
`pocketjs/evidence/tmp/c2/`.

## Identity

| Item | Value |
| --- | --- |
| PicoView branch / head | `corrective/c2-minimal-product-host` from `480e623` (main) |
| PocketJS effective | `8e9e09f9` on `picoview-c2-minimal-host` (= frozen A7 chain end `6efb25b7` + C2 patch `34d371d1` + review corrections `8e9e09f9`; local, Mimosa audit pending before any upstream push) |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)`, `stable-x86_64-pc-windows-msvc`, release, `debug=false` |
| Machine | AMD Ryzen 7 5800H, 16 LP; **28.9 GiB RAM (31,057,453,056 B) — NOT 16 GiB reference class**; AMD Radeon(TM) Graphics iGPU, driver 31.0.21923.11000; Windows 11 Pro build 26200; native Windows host |
| Guest | `picoview-a6-main` (unchanged from GATE-A; planHash `sha256:99f70f33…`) |
| Samples | `picoview-24mp.jpg` 6000×4000 (1,890,113 B) on local NVMe; 12 MP + fixture set for behavior runs |
| Measurement date | 2026-09-13, power plan Balanced |

## 1. Residency decomposition of the GATE-A baseline (root-cause freeze)

Method: a flag-gated staged probe (`POCKET_MEM_STAGE=1`, `memprobe.rs`)
prints `GetProcessMemoryInfo` private-residency snapshots at startup
stages plus a `settled_quit` stage at the quit path. `wsPrivateBytes` =
`PROCESS_MEMORY_COUNTERS_EX2.PrivateWorkingSetSize` (the "Working Set -
Private" quantity), `privateBytes` = `PagefileUsage` (the "Private Bytes"
quantity). Stage deltas are attributable only because Phase-A startup is
sequential; the probe is measurement plumbing and is inactive (one
boolean read) when the env var is unset.

Provenance note (review finding): the pre-C2 decomposition below ran on
`6efb25b7` plus uncommitted probe-only scratch hooks (hook placement
identical to the committed probe commit — measurement plumbing only); the
post-C2 decomposition in §3 ran on the committed C2 head.

Pre-C2 decomposition (default wgpu backends, default allocator hints,
baseline run, no image; exact bytes from `stage-baseline.log` /
`stage-renderer.log`):

| Stage (cumulative) | WS-Private | Private Bytes | Attribution |
| --- | ---: | ---: | --- |
| process entry | 1.3 MiB (1,396,736 B) | 1.9 MiB | Rust runtime |
| window created | 2.4 MiB | 3.1 MiB | winit |
| `wgpu::Instance::new` (default = Vulkan+DX12+GL on Windows) | **68.1 MiB** | 83.4 MiB | **+65.7 MiB backend/ICD module load + enumeration** |
| + adapter/device | 73.7 MiB | 100.7 MiB | +5.6 MiB |
| + surface configured | 73.8 MiB | 101.6 MiB | +0.1 MiB |
| + `UiRenderer::new` (shader + ONE pipeline) | **202.2 MiB** | 229.2 MiB | **+128.4 MiB — dominated by wgpu default allocator block pre-allocation (isolated below), not driver PSO storage** |
| + QuickJS + guest eval + UI surface + text worker | 206.0 MiB | 231.3 MiB | +3.8 MiB |
| + first present | 211.9 MiB | 254.5 MiB | +5.9 MiB (retained targets + swapchain) |
| settled (A7 gate number, normative counters) | 226.1 MiB | 567.3 MiB | — |

Phase-A harness runtime state when its flags are off (A2/A3 harness
structs, counters): **kilobytes — not a visible resident term** (the §3
post-C2 table shows the same no-harness stages within ~1 MiB of the
harness build's). The GATE-A hypothesis "proof harness residency" is
refuted by measurement; harness stripping is still done (§2) because the
ticket forbids the product candidate from instantiating
TEST_ONLY/EVIDENCE_ONLY state.

Backend/allocator sensitivity — four committed-scratch runs, first-present
stage, exact bytes in `stage-{baseline,dx12,memhints,vkonly}.log`:

| wgpu configuration | WS-Private at first present | Private Bytes |
| --- | ---: | ---: |
| default backends, `MemoryHints::default()` (GATE-A config) | 211.9 MiB (222,248,960 B) | 254.5 MiB |
| default backends, `MemoryHints::MemoryUsage` (**isolating control: allocator only**) | 92.1 MiB (96,575,488 B) | 134.2 MiB |
| DX12-only, `MemoryHints::default()` | 229.4 MiB | 558.0 MiB (device creation alone +464 MiB committed) |
| Vulkan-only, `MemoryHints::MemoryUsage` (C2 config) | **48.1 MiB** | 77.4 MiB |

Attribution now rests on the control run, not a two-variable comparison:
at a FIXED backend set (enumeration term unchanged at 68.0 MiB), switching
only the allocator hint removes **~119.8 MiB** (211.9 → 92.1); switching
only the backend set (enumeration 68.0 → 21–24 MiB) removes ~44–47 MiB.
The "+128 MiB at pipeline creation" mechanism claim is therefore: wgpu
default allocator block pre-allocation, with driver PSO/compiler storage
a minor term — attribution carried by the control, not inferred.

Decision taken on this evidence (no reputation involved): the Windows
product host names the Vulkan backend explicitly and requests
`MemoryHints::MemoryUsage`. DX12 is measured WORSE on both memory axes on
this driver; GL was not measured (no supported in-box EGL path without a
new dependency — not admitted). This narrows the Windows product host to
the Vulkan backend family — on a host/session where Vulkan is unavailable
(RDP sessions, some VMs), adapter request now fails deterministically
where the default-backend host might have fallen back to DX12. The
capability narrowing is disclosed and referred to C1/GATE-A2 for explicit
adjudication; C1 owns the formal backend decision and must not silently
regress this memory accounting.

## 2. Product-host definition and harness stripping list

`bench-harness` cargo feature (default off) compiles the proof/bench
machinery only into evidence builds (`--features bench-harness`); audit
counters and pushed-line retention compile to a zero-sized stub.
Classification of every Phase-A mechanism:

| Mechanism | Class | Disposition in product host |
| --- | --- | --- |
| A3 WIC decode + EXIF + admission + seam register/retire + coalescing drain | **PRODUCT_REQUIRED** | unconditional (the image path) |
| `--a3-harness`/`--a3-file` runtime flag + manifest | PRODUCT_REQUIRED (open affordance) | unconditional |
| A2 4K pattern harness (`a2.rs`, schedule, boundary audit) | TEST_ONLY | feature-gated out |
| A4 source-transform probe | EVIDENCE_ONLY | feature-gated out |
| A3 audit counters + `sent` line retention + A3SVC/A3EVENT/A3BOUNDARY logging | EVIDENCE_ONLY | zero-sized stub / compiled out |
| Input scripting (`--type/--click/--mouse/--key/--press`), `--storm`, `--resize-at`, `--scale-at` drivers | TEST_ONLY | feature-gated out |
| A6EVENT/A2EVENT/A7EVENT stderr channels | EVIDENCE_ONLY | behind `--announce-ready` (measurement runs) |
| READY/IMGREADY markers, `--trace-frames`, `--quit-after`, `POCKET_MEM_STAGE` probe | measurement plumbing, no resident state | unconditional flags (off by default) |
| net.rs SVC-WIRE, supervisor/system mode, editor protocol | PRODUCT_REQUIRED (portable host architecture; dormant, no cost) | unconditional |
| QuickJS runtime config | PRODUCT_REQUIRED | unchanged; measured usage ~3.8 MiB at boot (boot_guest_eval delta) — no oversized arena/limit found to remove |
| Renderer `FRAME_TARGETS=3` / swapchain latency 1 | PRODUCT_REQUIRED (A5/A6-verified semantics) | unchanged; ~14 MiB GPU-side at 1440×960 |

The product build compiles with zero warnings. `cargo test` = 15 passed /
1 ignored; `cargo test --features bench-harness` = 28 passed / 1 ignored
(the A7 acceptance suite, unchanged). The 13 audit-dependent tests are
gated to the feature; the decode/EXIF/admission/host tests run in both
builds. The harness build carries three dead-code warnings on the A4
probe functions that pre-date this campaign (present at `6efb25b7`) and
were left untouched.

## 3. Post-C2 measurement (product build, `--app picoview-a6`)

Normative settled probes (PerformanceCounter, `memwatch.ps1`, 50 ms
sampling, settled = median of final 40 samples; `--quit-after` run,
window static ≥5 s). Instrument validation (review-corrected): the
staged probe now has a `settled_quit` stage, enabling a **same-state**
cross-check — probe `settled_quit` = 51,482,624 B WS-Private /
83,992,576 B Private Bytes; memwatch settled = 51,482,624 B /
83,992,576 B — **byte-identical on both metrics**. (The previously
reported "0.8%" first-present-vs-settled comparison mixed MB/MiB scales
across different states and is withdrawn.)

| State | Settled WS-Private | Settled Private Bytes | Peak private committed |
| --- | ---: | ---: | ---: |
| Baseline (no image) | **51,482,624 B = 49.1 MiB** (was 226.1) | 83,992,576 B = 80.1 MiB (was 567.3) | 83,992,576 B (peak = settled) |
| 24 MP Fit | **85,123,072 B = 81.2 MiB** (was 254.7) | 143,007,744 B = 136.4 MiB | 170,958,848 B = 163.0 MiB |
| Five-process (5 × 24 MP Fit, visible, settled) | **435,978,240 B = 415.8 MiB** (was 1.55 GiB) | 725,676,032 B = 692.1 MiB | — |

Per-process five-process distribution (visible windows, per-process
median over a 14 s sampled window, raw samples in
`pocketjs/evidence/tmp/c2/five-c2-raw.json`): 79.3 / 79.2 / 76.5 /
104.2 / 76.6 MiB WS-Private. One process settled ~25 MiB above its
siblings; the aggregate verdict has 6× margin either way. (The earlier
minimized-window single-snapshot run — 5 × byte-identical 76.7 MiB — is
withdrawn as a trim artifact, not the §7 representative state.)

Staged decomposition of the C2 baseline (same probe; exact bytes from
`prod-baseline-v2.stderr.log`):

| Stage | WS-Private | Private Bytes |
| --- | ---: | ---: |
| process entry | 1.3 MiB | 1.8 MiB |
| gpu instance (Vulkan-only) | 23.8 MiB | 26.6 MiB |
| + adapter/device | 26.0 MiB | 40.9 MiB |
| + surface configured | 28.0 MiB | 41.7 MiB |
| + first pipeline (UiRenderer) | 36.4 MiB | 50.0 MiB |
| + QuickJS/guest/UI/text | 40.6 MiB | 53.8 MiB |
| first present | 48.3 MiB | 77.6 MiB |
| settled (`settled_quit`) | 49.1 MiB | 80.1 MiB |

Minimum-substrate reading (MiB): Vulkan loader + AMD ICD enumeration
~21–22, adapter/device/configure ~4, one pipeline ~8, QuickJS + guest +
UI ~4, first-frame GPU targets + swapchain ~8, process baseline ~1.5.
The driver/wgpu substrate floor on this host+driver is therefore ≈ 40 MiB
of the 49.1 MiB; the application-controlled remainder is ~9 MiB.
**MINIMUM_SUBSTRATE note:** with the corrected allocator configuration
the substrate no longer exceeds the >64 MiB ceiling on this host — the
conflict GATE-A feared (226 MiB substrate) is disproven; what remains
above the ≤40 MiB target is mostly AMD ICD enumeration + wgpu pipeline
residency, which no wgpu-supported configuration measured here removes.

## 4. Earlier architecture behaviors on the C2 build

* Product build, real manifest walk: 12 MP → bind, `corrupt` → bounded
  error, 24 MP → bind + synchronous retire of predecessor, `not_jpeg` →
  bounded error, EXIF-orient6 fixture → bind (3 successful binds via
  `image_bound` stages; exit 0). Harness-build trace of the same walk
  (`harness-behavior.stderr.log`) shows the full A3EVENT semantics: fit
  via `source_transform` (2000×1500 / 3000×2000), `retiredReq=r1`,
  bounded codes `corrupt`/`not_jpeg`/`missing`.
* A5 rapid-switch stress (`harness-stress-mem.stderr.log` /
  `.memwatch.json`; harness build via the scripted `--key` driver — the
  drain/decode/retire code is unconditional and byte-identical in the
  product build): 120 requests → 25 decodes, 96 cancels, newest-only
  publishes; **peak WS-Private 156,708,864 B = 149.4 MiB, peak Private
  Bytes 194,129,920 B = 185.1 MiB** against the ≤384 MiB hard transient
  budget; post-stress settled 95.6 MiB / 138.9 MiB.
* A6 scale-handler smoke on the C2 source: scripted 1.0→2.0 transitions
  show logical 720×480 invariant, physical 1440×960, raster density
  follows (A6EVENT lines). Real OS `ScaleFactorChanged` leg remains C6.
* Startup cross-check (informal; C1 owns the normative 50-run
  measurement): same-origin `A7EVENT,phase` values across 5 cold product
  spawns (`startup-v2-*.stderr.log`): event_loop_built 8–9 ms, gpu_ready
  **165–184 ms** (pre-C2 same-origin: 600–621 ms), runtime_boot_done
  201–230 ms (pre-C2: 636–683 ms). The clock-origin defect an early
  draft of this section had (phase clock anchored after init, making the
  comparison different-origin) was found in adversarial review and fixed
  in the probe; the numbers above are the corrected-origin rerun. No
  budget trade: startup improved, memory improved, all behavior checks
  pass.

## 5. Gate accounting (numbers unchanged; reading referred to the gate)

| Budget (PRD, unchanged) | GATE-A measured | C2 measured | Status |
| --- | ---: | ---: | --- |
| Settled no-image baseline ≤40 MiB target; >64 MiB FAIL | 226.1 MiB FAIL | **49.1 MiB** | inside architecture ceiling, above target — **referred to GATE-A2**: the PRD defines 40 as target and 64 as the FAIL line; this report claims neither PASS nor FAIL for the 40–64 band |
| Ordinary 24 MP Fit ≤128 MiB | 254.7 MiB FAIL | **81.2 MiB** | **PASS** (architecture-host evidence) |
| Rapid-request transient ≤384 MiB | 250.6 MiB peak WS-Private PASS | **149.4 MiB peak WS-Private / 185.1 MiB peak Private Bytes** | **PASS** (same workload family as GATE-A's row: A5 stress rerun on the C2 build) |
| Five-process aggregate | 1.55 GiB FAIL (derivative) | **415.8 MiB** | PASS as derivative (same 40-vs-64 per-process caveat applies at the gate) |
| Downloadable payload ≤15 MiB | 12.16 MiB PASS | rechecked below | see §6 |

All RAM-sensitive rows above remain **architecture-host evidence**
(28.9 GiB iGPU host); the 16 GiB reference-class rerun is C5 and must
adjudicate them on the final architecture. For the 24 MP Fit row
(BENCHMARK §7 record): CPU decode buffers do NOT exist at the settled
sample — the WIC fit path drops the encoded bytes and decode plane at
bind (`drop(decoded); drop(bytes)` before publish), so the settled sample
holds only the registered GPU texture (fit plane ≈ 22.7 MiB inside the
81.2 MiB).

## 6. Cross-effects (required by the campaign contract)

* **C1 coupling**: the Vulkan-only decision and the startup observations
  in §4 are C1's direct input; C1 must measure D3D12 vs Vulkan for
  startup on this evidence (DX12 is already measured as memory-worse)
  and must not reintroduce default-backend enumeration. The loss of the
  DX12/GL fallback on Vulkan-less hosts/sessions (§1) must be explicitly
  accepted or rejected by C1/GATE-A2.
* **C3 coupling**: the effect of the allocator hint and backend choice
  on frame pacing and idle wake cost is **not yet re-measured** (more,
  smaller driver allocations could in principle shift per-frame
  allocation cost); C3 owns that verification and must not skip it. The
  static claim — C2 introduces no new timers, event sources, or render
  loop — is supported by the diff.
* **Harness builds remain available**: every A2–A6 proof facility still
  compiles via `--features bench-harness`; nothing was deleted, only
  excluded from the product candidate.
* Binary size: product host exe = 12,041,216 B (11.48 MiB); harness
  build = 12,102,144 B (11.54 MiB) — the excluded machinery costs ~60 KiB
  of binary; payload budget unaffected (formal re-measure at
  packaging/GATE-A2).

## 7. Adversarial review corrections applied

Two fresh-context adversarial reviews (mechanism + measurement) returned
MAJOR findings; all were fixed before merge:

1. **Startup phase clock origin** — `main_entry` could never print and
   the phase clock initialized after init work, silently making the
   §4 comparison different-origin. Fixed: clock anchored at true process
   entry, flag stored before the first phase line; §4 numbers are the
   corrected-origin rerun.
2. **Transient gate row** — the draft cited 163.0 MiB, which was the
   single-image 24 MP Fit peak (wrong workload) on the wrong metric axis.
   Fixed: real A5-stress rerun with both §7 metrics recorded.
3. **MB/MiB unit mixing** — staged tables divided by 10^6 under a MiB
   header and the instrument cross-check compared different states at
   different scales ("0.8%"). Fixed: all tables recomputed in MiB from
   exact bytes, a `settled_quit` probe stage added, and the cross-check
   redone same-state (byte-identical result).
4. **Five-process methodology** — minimized windows + single snapshot
   (trim-artifact signature: byte-identical ×5). Fixed: visible windows,
   per-process settled median over a sampled window, raw samples
   preserved, distribution reported.
5. **Isolating control** — the allocator-vs-driver attribution rested on
   a two-variable comparison; the default-backends+MemoryUsage control
   run is now in §1.
6. MINORs: decode-buffer-at-settle statement added (§5); allocator-hint
   frame-pacing risk reassigned to C3 explicitly (§6); Vulkan fallback
   narrowing stated and referred (§1, §6); binary-size claims measured
   exactly; warning claims scoped truthfully.

## 8. Verdict

#26 closes as **completed**: the minimal product host exists, the
decomposition is recorded with control-run attribution, harness/audit
state is compile-time excluded, and the measured 24 MP / transient /
five-process rows pass with large margins. The single open question —
whether 49.1 MiB settled baseline satisfies the PRD's ≤40 MiB target
given the explicit >64 MiB FAIL ceiling — is an authority reading, not a
measurement, and is explicitly left to the NEW gate (GATE-A2) together
with C5's reference-class rerun. No budget was weakened and no metric was
redefined.

## Evidence identity note

Scratch logs, probe outputs, and memwatch JSONs live in
`pocketjs/evidence/tmp/c2/` (and `PicoView/evidence/tmp/` for the
bench scripts) and are deliberately not committed; the probe source
(`memprobe.rs`) and the stage hooks are committed on
`picoview-c2-minimal-host`. If this report and the tracker disagree, the
tracker wins.

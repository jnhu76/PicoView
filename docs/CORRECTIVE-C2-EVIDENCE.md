# Corrective C2 Evidence Report — Minimal Product Host Footprint

Ticket: [#26 — [CORRECTIVE-C2] Minimal product host footprint](https://github.com/jnhu76/PicoView/issues/26)

**VERDICT: DONE as a corrective — the minimal product host is built, the
226.1 MiB baseline is decomposed, and the mechanism claimed by GATE-A is
corrected by measurement: the Phase-A proof harnesses contributed ~nothing
to residency; the real mechanisms were (1) wgpu multi-backend instance
enumeration (~47 MiB), (2) the wgpu default allocator's block
pre-allocation (~+125 MiB around first pipeline creation), and (3) the
D3D12/DXGI + GL module load inside the default backend set. After the
host-policy fix the settled no-image baseline is 49.0 MiB WS-Private —
inside the >64 MiB architecture FAIL ceiling but ABOVE the ≤40 MiB PRD
target — and 24 MP Fit viewing is 81.2 MiB (≤128 PASS). The baseline row's
final 40-vs-64 reading is referred to the gate (GATE-A2); this report does
not redefinition or weaken either number.**

## Identity

| Item | Value |
| --- | --- |
| PicoView branch / head | `corrective/c2-minimal-product-host` from `480e623` (main) |
| PocketJS effective | `34d371d1` on `picoview-c2-minimal-host` (= frozen A7 chain end `6efb25b7` + C2 patch; local, Mimosa audit pending before any upstream push) |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)`, `stable-x86_64-pc-windows-msvc`, release, `debug=false` |
| Machine | AMD Ryzen 7 5800H, 16 LP; **28.9 GiB RAM (31,057,453,056 B) — NOT 16 GiB reference class**; AMD Radeon(TM) Graphics iGPU, driver 31.0.21923.11000; Windows 11 Pro build 26200; native Windows host |
| Guest | `picoview-a6-main` (unchanged from GATE-A; planHash `sha256:99f70f33…`) |
| Samples | `picoview-24mp.jpg` 6000×4000 (1,890,113 B) on local NVMe; 12 MP + fixture set for behavior runs |
| Measurement date | 2026-09-13, power plan Balanced |

## 1. Residency decomposition of the GATE-A baseline (root-cause freeze)

Method: a flag-gated staged probe (`POCKET_MEM_STAGE=1`, `memprobe.rs`)
prints `GetProcessMemoryInfo` private-residency snapshots at startup
stages. `wsPrivateBytes` = `PROCESS_MEMORY_COUNTERS_EX2.PrivateWorkingSetSize`
(the "Working Set - Private" quantity), `privateBytes` = `PagefileUsage`
(the "Private Bytes" quantity). Validated in §3 against the normative
PerformanceCounter probes used since A7. Stage deltas are attributable
only because Phase-A startup is sequential; the probe is measurement
plumbing and is inactive (one boolean read) when the env var is unset.

Decomposition on the **pre-C2 build** (`6efb25b7` + probe only, default
wgpu backends, default allocator hints, baseline run, no image):

| Stage (cumulative MiB WS-Private / Private Bytes) | WS-Private | Private Bytes | Attribution |
| --- | ---: | ---: | --- |
| process entry | 1.4 | 1.9 | Rust runtime |
| window created | 2.5 | 3.2 | winit |
| `wgpu::Instance::new` (default = Vulkan+DX12+GL on Windows) | **71.4** | 87.4 | **+68.9 backend/ICD module load + enumeration** |
| + adapter/device | 77.3 | 105.6 | +5.9 |
| + surface configured | 77.4 | 106.5 | +0.1 |
| + `UiRenderer::new` (shader + ONE pipeline) | **212.1** | 240.3 | **+134.7 — dominated by wgpu default allocator block pre-allocation, not driver PSO storage** |
| + QuickJS + guest eval + UI surface + text worker | 216.1 | 242.6 | +4.0 |
| + first present | 222.2 | 267.2 | +6.1 (retained targets + swapchain) |
| settled (A7 gate number) | 226.1 | 567.3 | — |

Phase-A harness runtime state when its flags are off (A2/A3 harness
structs, counters): **~kilobytes — not a visible resident term.** The
GATE-A hypothesis "proof harness residency" is refuted by measurement;
harness stripping is still done (§2) because the ticket forbids the
product candidate from instantiating TEST_ONLY/EVIDENCE_ONLY state, and
because it removes ~580 lines of dead weight from the product binary.

Backend sensitivity (same probe, scratch runs, no image):

| wgpu configuration | WS-Private after first present | Private Bytes |
| --- | ---: | ---: |
| default backends (Vulkan+DX12+GL), `MemoryHints::default()` | 222.2 MiB | 267.2 MiB |
| DX12-only, `MemoryHints::default()` | 240.5 MiB | 585.2 MiB (device creation alone +464 MiB committed) |
| Vulkan-only, `MemoryHints::MemoryUsage` | **50.4 MiB** | 81.2 MiB |

Decision taken on this evidence (no reputation involved): the Windows
product host names the Vulkan backend explicitly and requests
`MemoryHints::MemoryUsage`. DX12 is measured WORSE on both memory axes on
this driver; GL was not measured (no supported in-box EGL path without a
new dependency — not admitted). The backend choice is C1's to re-examine
for startup; C1 must not silently regress this memory accounting.

## 2. Product-host definition and harness stripping list

`bench-harness` cargo feature (default off) now compiles the proof/bench
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
| QuickJS runtime config | PRODUCT_REQUIRED | unchanged; measured usage ~3.5 MiB at settle (boot_guest_eval delta) — no oversized arena/limit found to remove |
| Renderer `FRAME_TARGETS=3` / swapchain latency 1 | PRODUCT_REQUIRED (A5/A6-verified semantics) | unchanged; ~14 MiB GPU-side at 1440×960 |

The product build compiles with **zero warnings**; `cargo test` = 15
passed / 1 ignored; `cargo test --features bench-harness` = 28 passed /
1 ignored (the A7 acceptance suite, unchanged). The 13 audit-dependent
tests are gated to the feature; the decode/EXIF/admission/host tests run
in both builds.

## 3. Post-C2 measurement (product build, `--app picoview-a6`)

Normative settled probes (PerformanceCounter, `memwatch.ps1`, 50 ms
sampling, settled = median of final 40 samples; `--quit-after` run,
window static ≥5 s). Probe cross-validation: the staged probe's
`first_present` snapshot (48.6 MiB) agrees with the counter's settled
WS-Private (49.0 MiB) within 0.8% — different instruments, same quantity.

| State | Settled WS-Private | Settled Private Bytes | Peak private committed |
| --- | ---: | ---: | ---: |
| Baseline (no image) | **51,396,608 B = 49.0 MiB** (was 226.1) | 83,939,328 B = 80.0 MiB (was 567.3) | 83,951,616 B |
| 24 MP Fit | **85,123,072 B = 81.2 MiB** (was 254.7) | 143,007,744 B = 136.4 MiB | 170,958,848 B = 163.0 MiB |
| Five-process (5 × 24 MP Fit) | **402,022,400 B = 383.4 MiB** (was 1.55 GiB) | 692,039,680 B = 660.0 MiB | — |

Per-process five-process values were byte-identical (80,404,480 WS-Private
each) — same caveat as A7 about concurrent-settle variance.

Staged decomposition of the C2 baseline (same method as §1):

| Stage | WS-Private | Private Bytes |
| --- | ---: | ---: |
| process entry | 1.4 MiB | 1.9 MiB |
| gpu instance (Vulkan-only) | 24.9 MiB | 28.0 MiB |
| + adapter/device | 27.2 MiB | 43.0 MiB |
| + surface configured | 29.4 MiB | 43.9 MiB |
| + first pipeline (UiRenderer) | 38.2 MiB | 52.5 MiB |
| + QuickJS/guest/UI/text | 42.6 MiB | 56.5 MiB |
| first present | 48.6 MiB | 81.6 MiB |
| settled | 49.0 MiB | 80.0 MiB |

Minimum-substrate reading: instance (Vulkan loader + AMD ICD) 22–23 MiB,
adapter/device/configure ~4.5 MiB, one pipeline ~8.8 MiB, QuickJS + guest
~4 MiB, first-frame GPU targets + swapchain ~6–8 MiB, process baseline
~2.5 MiB. The driver/wgpu substrate floor on this host+driver is
therefore ≈ 40 MiB of the 49 MiB; the application-controlled remainder
is ~9 MiB. **MINIMUM_SUBSTRATE note:** with the corrected allocator
configuration the substrate no longer exceeds the >64 MiB ceiling on this
host — the conflict GATE-A feared (226 MiB substrate) is disproven; what
remains above the ≤40 MiB target is mostly AMD ICD enumeration + wgpu
pipeline residency, which no wgpu-supported configuration measured here
removes.

## 4. Earlier architecture behaviors on the C2 build

* Product build, real manifest walk: 12 MP → bind, `corrupt` → bounded
  error, 24 MP → bind + synchronous retire of predecessor, `not_jpeg` →
  bounded error, EXIF-orient6 fixture → bind (3 successful binds via
  `image_bound` stages; exit 0). Harness-build trace of the same walk
  shows the full A3EVENT semantics: fit via `source_transform`
  (2000×1500 / 3000×2000), `retiredReq=r1`, bounded codes
  `corrupt`/`not_jpeg`/`missing`.
* A5 rapid-switch stress (harness build `--key s@300`, identical
  drain/decode/retire code as product): 120 requests → 25 decodes, 96
  cancels, newest-only publishes, total boundary traffic 29,263 B vs
  12.0 MB plane.
* A6 scale-handler smoke on the C2 source: scripted 1.0→2.0 transitions
  show logical 720×480 invariant, physical 1440×960, raster density
  follows (A6EVENT lines). Real OS `ScaleFactorChanged` leg remains C6.
* Startup cross-check (informal; C1 owns the normative measurement):
  `A7EVENT,phase` on 5 cold spawns shows gpu_ready **127–142 ms** (was
  583–621 ms) and runtime_boot_done **153–170 ms** — the multi-backend
  enumeration removal that bought memory also bought back most of GATE-A's
  startup FAIL mechanism. No budget trade: startup improved, memory
  improved, all behavior checks pass.

## 5. Gate accounting (numbers unchanged; reading referred to the gate)

| Budget (PRD, unchanged) | GATE-A measured | C2 measured | Status |
| --- | ---: | ---: | --- |
| Settled no-image baseline ≤40 MiB target; >64 MiB FAIL | 226.1 MiB FAIL | **49.0 MiB** | inside architecture ceiling, above target — **referred to GATE-A2**: the PRD defines 40 as target and 64 as the FAIL line; this report claims neither PASS nor FAIL for the 40–64 band |
| Ordinary 24 MP Fit ≤128 MiB | 254.7 MiB FAIL | **81.2 MiB** | **PASS** (architecture-host evidence) |
| Rapid-request transient ≤384 MiB | 250.6 MiB PASS | 163.0 MiB peak private committed | PASS (improved) |
| Five-process aggregate | 1.55 GiB FAIL (derivative) | **383.4 MiB** | PASS as derivative (same 40-vs-64 caveat per process applies at the gate) |
| Downloadable payload ≤15 MiB | 12.16 MiB PASS | rechecked below | see §6 |

All RAM-sensitive rows above remain **architecture-host evidence**
(28.9 GiB iGPU host); the 16 GiB reference-class rerun is C5 and must
adjudicate them on the final architecture.

## 6. Cross-effects (required by the campaign contract)

* **C1 coupling**: the Vulkan-only decision and the startup observations
  in §4 are C1's direct input; C1 must measure D3D12 vs Vulkan for
  startup on this evidence (DX12 is already measured as memory-worse) and
  must not reintroduce default-backend enumeration.
* **C3 coupling**: allocator hints and backend choice do not touch the
  60 Hz worker deadline; idle behavior unchanged by C2.
* **Harness builds remain available**: every A2–A6 proof facility still
  compiles via `--features bench-harness`; nothing was deleted, only
  excluded from the product candidate.
* Binary size: product host exe = 12,041,216 B (11.48 MiB); harness build
  = 12,102,144 B (11.54 MiB) — the excluded machinery costs ~60 KiB of
  binary; payload budget unaffected (formal re-measure at packaging/GATE-A2).

## 7. Verdict

#26 closes as **completed**: the minimal product host exists, the
decomposition is recorded with honest attribution, harness/audit state is
compile-time excluded, and the measured 24 MP / transient / five-process
rows pass with large margins. The single open question — whether 49.0 MiB
settled baseline satisfies the PRD's ≤40 MiB target given the explicit
>64 MiB FAIL ceiling — is an authority reading, not a measurement, and is
explicitly left to the NEW gate (GATE-A2) together with C5's
reference-class rerun. No budget was weakened and no metric was
redefined.

## Evidence identity note

Scratch logs, probe outputs, and memwatch JSONs live in
`pocketjs/evidence/tmp/c2/` and are deliberately not committed; the probe
source (`memprobe.rs`) and the stage hooks are committed on
`picoview-c2-minimal-host`. If this report and the tracker disagree, the
tracker wins.

# ARCH-A3 Evidence Report

Status: **PASS**

Issue: #3 `[ARCH-A3]` — Present the first JPEG through the native image-resource seam.

## Identity

| Item | Value |
|------|-------|
| PicoView base SHA | `72c1dd3` (branch `arch/a3-wic-first-jpeg`) |
| PicoView evidence SHA | pinned exactly by the follow-up commit on this branch (guest A3 + this report; see the identity note at the end of this file) |
| PocketJS frozen base SHA | `a5a85356e172db8a32aefa983ee1259f60406f69` |
| PocketJS effective A2 SHA | `fe32ea825e05246d8a8dd7d28cb122cedd42ee92` (branch `picoview-a2-image-resource`) |
| PocketJS effective A3 SHA | `fa9361297de3ed9fe66f84cfb25c053b2584892a` (branch `picoview-a3-wic-first-jpeg`, created from the A2 commit) |
| A3 patch series | `fe32ea82..fa936129` — one commit, 6 files, +1085/−11 (hosts/desktop only: `a3.rs` new, `main.rs`, `plan.rs`, `tests.rs`, `Cargo.toml`, `Cargo.lock`) |
| Guest bundle | `picoview-a3-main` (Octane, target `windows-app` ABI 4), planHash `sha256:3fba5b233dc5e9a254fa7e0d24b291b13201bfae72433a1719e305f357885886`, 34 TS modules, js 339,418 B, pak 304,944 B |
| Native toolchain | `stable-x86_64-pc-windows-msvc`, `rustc 1.98.1 (48a229cea 2026-09-01)`, `cargo 1.98.1` |
| Windows | Windows 11 Pro build 26200, x64, native process (not WSL) |
| CPU / RAM | AMD Ryzen 7 5800H, 16 logical processors / 28.9 GiB installed |
| GPU / backend | AMD Radeon(TM) Graphics (integrated), driver 31.0.21923.11000 / Vulkan / Bgra8Unorm (host log: `Pocket UI GPU: Vulkan / AMD Radeon(TM) Graphics / Bgra8Unorm`) |
| Power mode | Balanced (`381b4222-f694-41f0-9685-ff5bb260df2e`) |
| Storage | samples on local SSD (NVMe-class laptop storage) |

PocketJS worktree after commit: clean (untracked scratch only: the build-time
`guest/` directory copy of `PicoView/guest` and `.pocket/` plan scratch — same
policy as A1/A2; neither is committed).

## What was built (scope)

One vertical slice, reusing the admitted A2 seam end to end:

```text
guest intent {t:"a3open",req,path}        [bounded svc line, QuickJS control plane]
  → host reads file (handle closed at read completion)
  → WIC decode: forced JPEG container → frame → metadata (EXIF 274)
      → FormatConverter to 32bppRGBA (native fast path)
      → [if oriented] materialize IWICBitmap → FlipRotator pull (memory-backed)
  → admission check BEFORE plane allocation (NATIVE_TEX_MAX_DIM + overflow)
  → Ui::register_native_texture            [the A2 seam — same registry, no new path]
  → synchronous free_texture(previous)     [retire-on-replace, GC-independent]
  → guest notification {t:"a3img",req,handle,w,h,orient} or {t:"a3error",req,code}
  → guest setImage(node, handle) → existing image node → TEX_QUAD → wgpu → present
```

Reused unchanged: texture registry + generation-tagged handles, `free_texture`,
image node / `TEX_QUAD` / DrawList, the svc channel (spec ops 30–32), the whole
A2 composition path, the JS `uploadTexture` contract (zero diff in
`contracts/`, `framework/`, and `engine/`).

Added (desktop-host test material, CLI-gated, off by default): `a3.rs`
harness + `--a3-harness` / `--a3-file <PATH>` flags + a `cfg(windows)`
`windows = "0.62"` dependency (features: `Win32_Graphics_Imaging`,
`Win32_System_Com`, `Win32_System_Com_StructuredStorage`, `Win32_System_Variant`).
Non-Windows hosts compile unchanged; the decode entry returns
`decoder_unavailable` there.

Explicit answers:

* second image path / second registry? **NO** — WIC output enters the same
  `register_native_texture` entry proven in A2
* new DrawList opcode / guest ABI change? **NO** (`contracts/`, `framework/`,
  `engine/` have zero diff against `fe32ea82`)
* pixels (encoded or decoded) through QuickJS? **NO** (audited below)
* orientation via guest pixel rewrite? **NO** — native decode/transform only
* third-party decoder? **NO** — WIC only; no libjpeg-turbo evaluation was
  earned (12 MP warm SLO met, see measurements)

## Sample corpus identity (FACT)

Generated fixtures under `evidence/tmp/samples/` (ignored scratch; generation
scripts kept beside them). WPF/WIC-encoded JPEGs of procedural photo-like
content (sky gradient, sun, mountains, fine tile detail), quality as listed.

| Sample | Dimensions | Encoded bytes | Role |
|--------|-----------|---------------|------|
| `picoview-12mp.jpg` | 4000×3000 (12.0 MP) | 1,231,842 (q85) | defining 12 MP workload |
| `picoview-24mp.jpg` | 6000×4000 (24.0 MP) | 1,890,113 (q85) | defining 24 MP workload |
| `picoview-orient-base.jpg` | 1200×900 | 61,273 (q90) | orientation base |
| `picoview-orient6.jpg` | 1200×900 stored | 61,327 (q90, EXIF `Orientation`=6 byte-spliced) | orientation proof |
| `picoview-corrupt.jpg` | — | first 512 B of `picoview-12mp.jpg` | corrupt-JPEG error path |
| `picoview-fake.jpg` | — | 67 B PNG bytes under a JPEG name | masquerading-content error path |
| (missing path) | — | — | missing-file error path |

CORRECTIVE (fixture tooling, recorded for reproducibility): EXIF metadata
written by WPF `BitmapMetadata.SetQuery` produced an APP1 segment that the
WIC JPEG decoder itself rejects (`0x88982F61` BADHEADER). The committed test
fixture and the live sample therefore inject a hand-assembled APP1 segment
(EXIF 2.32 layout) by byte-splicing after APP0 — an independent source of
truth from any encoder.

## QuickJS boundary audit (FACT)

1. `register_native_texture` has no JS binding (PocketJS `pocket-ui-surface`
   zero diff); the 48/96 MB decode plane lives in host Rust and dies there.
2. The only new host→guest lines are `a3manifest` (path strings, once per
   walk) and per-request `a3img`/`a3error` — measured largest host→guest line
   is the 102-entry latency-run manifest at **7,373 B**; one-entry manifests
   are 101 B and `a3img` announcements 66 B.
3. The guest's only framework calls on this path are `svcOpen/svcPoll/
   svcSend` and `setImage(nodeId, handle)`; the A3 guest constructs no
   `Uint8Array`/`ArrayBuffer`/base64; its largest state is the numeric
   handle, dimensions, and a status string (source: `PicoView/guest/app.octane.tsx`).
4. Encoded bytes move only inside host memory (file → `Vec<u8>` → WIC stream),
   dropped after registration; pixel bytes move decode → aligned core store →
   wgpu `write_texture` (cached by handle+revision), never through QuickJS.

Measured whole-walk boundary (visual walk: 1 success + 2 bounded errors + 1
oriented success; exact `A3BOUNDARY` line):

```text
A3BOUNDARY,successes=2,failures=2,txLines=5,txBytes=541,rxLines=7,rxBytes=559,totalBytes=1100,currentPlane=4320000
```

i.e. **1,100 bytes** of total guest-boundary traffic for the walk against a
48 MB native plane — bounded per resource/event and independent of image byte
size. (Correct wording per A2 closeout: traffic is bounded per resource/event;
it is not claimed to be O(1) in the number of resources.)

## First-image timestamps (MEASUREMENT)

Method per `docs/BENCHMARK.md`: warm file request → first useful image proxy
= `A3EVENT,open` epoch (T3_SOURCE_OPEN_BEGIN, host receipt of the guest
intent) → first `FRAME_TRACE,present-submit` wall-clock after the
`A3EVENT,img` announce (T6_PRESENT_SUBMITTED). Present submission is a named
proxy, not display-photon latency; visual acceptance is separate and was
performed (below). One settled process; manifest of 51× 12 MP then 51× 24 MP
sequential guest requests; the first sample of each group is reported as
warm-up and excluded (per BENCHMARK §4 warm-up rule).

CLOCK NOTE (recorded for A4/A7): the two latency endpoints share the same
wall-clock epoch-microsecond source (`SystemTime`), which BENCHMARK §5
prefers to be a monotonic clock; per-stage component durations use the
monotonic `Instant`. Both endpoints sharing one clock keeps the deltas
internally consistent, and the margins (~2×) make the conclusion safe, but
A4's measurement setup should switch the endpoint markers to the monotonic
source (adversarial-review MINOR, carried).

| Group | n | P50 | P95 | min | max |
|-------|---|-----|-----|-----|-----|
| 12 MP (4000×3000) warm | 50 | **66.13 ms** | **76.97 ms** | 59.48 ms | 84.72 ms |
| 24 MP (6000×4000) warm | 50 | **120.58 ms** | **144.25 ms** | 110.47 ms | 181.67 ms |

Run: release build, exit 0, 103 present markers, all requests correlated.

Against PRD §18 (ordinary 12 MP, reference class): warm request target ≤120 ms
P50 / fail >250 ms P95 → 12 MP warm **P50 66.13 ms / P95 76.97 ms meets the
SLO** on this machine. 24 MP has no separate PRD warm SLO; both numbers are
recorded as architecture characterization for A4. Per-component warm costs
(same run, `A3EVENT,img` internals): 12 MP decode ≈ 33–37 ms, register ≈ 6 ms;
24 MP decode ≈ 60 ms, register ≈ 13 ms; svc + guest bind ≈ sub-ms.

Process-cold activation → first image: NOT measured here with the normative
sample count; that campaign belongs to A7 (`--announce-ready` instrumentation
already exists). No cold number is claimed in this report.

## Memory (MEASUREMENT)

Watcher: `evidence/tmp/memwatch.ps1` — 50 ms sampling of the two normative
counters (`Working Set - Private`, `Private Bytes`) plus
`GetProcessMemoryInfo` peaks; settled value = median of the final 40 samples
(the last ~6 s static tail of these ≥10 s runs; single open, image displayed
and static throughout). Watcher JSON outputs are retained in
`evidence/tmp/mem-*.watch.json`; the host-side run logs are `evidence/tmp/logs/mem-*.log`.
Two independent 12 MP runs are shown for reproducibility.

| Run | Settled WS-Private | Settled Private Bytes | Peak WS-Private (sampled) | Peak private committed (PPMC `PeakPagefileUsage`) |
|-----|--------------------|-----------------------|---------------------------|---------------------------------------------------|
| 12 MP run 1 | 262,447,104 B (250.3 MiB) | 356,487,168 B (340.0 MiB) | 262,709,248 B | 387,735,552 B (369.8 MiB) |
| 12 MP run 2 | 262,410,240 B (250.2 MiB) | 356,507,648 B (340.0 MiB) | 262,672,384 B | 387,563,520 B (369.6 MiB) |
| 24 MP | 310,542,336 B (296.2 MiB) | 453,185,536 B (432.2 MiB) | 310,804,480 B | 532,520,960 B (507.9 MiB) |

Required observation (issue acceptance): 12 MP and 24 MP peak memory captured
with both required Windows metrics — done, reproducible (12 MP runs differ
<0.1 %).

INFERENCE (clearly labeled): settled footprint is dominated by the retained
full-resolution native plane (48 MB / 96 MB) plus the wgpu texture and
driver/runtime overhead of the integrated-GPU stack; allocator retention keeps
RSS at the decode high-water mark. The 24 MP full-resolution peak private
commitment (507.9 MiB) exceeds the PRD's 384 MiB rapid-request transient hard
budget. This is NOT a Fit result: PRD §6.2 prescribes WIC scaled decode for
Fit, and PRD §17's defining 24 MP budget (≤128 MiB WS-Private) is written for
the **Fit viewing** workload that A4 must prove. A3's own criterion — capture
the metrics — is satisfied; the measured fact above is the concrete evidence
that earns A4's scaled-decode mechanism rather than an assumed one. A5's
rapid-request stress will re-measure the hard budget directly.

## Orientation, composition, error paths, lifetime (FACT)

### First real image + correct orientation

* Live Windows run (release binary, exit 0): manifest walk
  `[12mp, corrupt, fake, orient6]`.
* 12 MP photo presented through the ordinary image node → `TEX_QUAD` → wgpu
  path (frame traces show `render-submit` + `present-submit` after each bind).
* `picoview-orient6.jpg` (stored 1200×900, EXIF orientation 6) decoded and
  announced as **w=900, h=1200, orient=6**; the window visually showed the
  scene rotated 90° CW (stored sky/right, grass/left, sun position
  consistent), main box and thumbnail from the same handle. OPERATOR
  ATTESTATION from the live window session (screenshots captured during the
  run; `evidence/` scratch is not committed) — the committed corroboration
  for orientation correctness is the WIC pixel-oracle unit tests
  (`a3_wic_applies_exif_orientation_natively`,
  `a3_wic_orients_exif_5_as_transpose`, `a3_wic_orients_exif_7_as_transverse`)
  and the `w=900,h=1200,orient=6` announce lines in the run logs.
* Unit-test oracle for the same path: a hand-assembled EXIF APP1 fixture
  decodes to 16×32 with red/blue halves in the orientation-6 positions
  (`a3_wic_applies_exif_orientation_natively`).

### Composition carry-over

The A2 composition proofs remain live in the A3 guest: main image box larger
than its `overflow-hidden` stage (clipping), same texture bound to a second
thumbnail scale, opaque badge painted above the image (z-order). No new
composition mechanism exists.

### Bounded error paths

| Input | Host behavior | Guest-visible state |
|-------|---------------|---------------------|
| missing file | `A3EVENT,error,code=missing` | `{t:"a3error",req,code:"missing"}` |
| corrupt JPEG (512 B truncation) | WIC init/frame fails → `code=corrupt` | bounded error line |
| PNG bytes named `.jpg` | SOI sniff → `code=not_jpeg`, no decoder run | bounded error line |
| oversized declared dims (9000², unit test) | admission before allocation → `TooLarge` | `too_large` |

Every error produced exactly one bounded reply; the harness continued
requesting (no wedge); no crash (exit 0 in every run). The walk interleaved
errors between successes and composition survived — status bar shows
`A3: walk complete — 2 presented, 2 bounded error(s)`.

LIMITATION (measured, honest): a *4 KB truncation* of the 12 MP sample still
decoded successfully — WIC's JPEG codec tolerates a truncated entropy scan and
synthesizes the missing rows. PicoView therefore cannot promise detection of
every truncation at the codec layer; the corrupt-fixture used for the proven
error path is a header-level truncation (512 B). Deeper corruption detection
would be new policy and is not claimed.

### Source-file lifetime

`std::fs::read` closes the source handle at read completion; decode runs from
the in-memory buffer; nothing re-opens the file while the image is displayed.
Physical probe during the live run, with the oriented image displayed:
external `rename` of the displayed source file **succeeded** and the image
kept presenting unchanged until the name was restored. OPERATOR ATTESTATION
(live session observation; not a committed artifact) — the code-level
corroboration is that `std::fs::read` is the only source access in
`handle_open` and nothing re-opens the path afterwards.

### Resource lifetime

Retire-on-replace is synchronous native `free_texture`: in the walk, each new
resource dropped `liveBytes` back to exactly one live plane (48 MB → 43.2 MB
plane transitions visible in `A3EVENT,img ... retiredReq=` fields); slot
reuse carried a new generation tag (handle `1048576` after slot 0 freed —
stale handles cannot alias). This is the A2-proven mechanism exercised on the
decode path; no GC participates.

## Tests

| Command (native Windows, release toolchain above) | Result |
|---------|--------|
| `cargo test` (hosts/desktop, PocketJS @ `fa936129`) | **18 passed; 0 failed; 1 ignored** (10 new A3 tests + 8 prior host tests; the ignored test is the pre-existing GPU-gated wgpu acceptance test) |
| `cargo test` (engine/core) | **132 passed; 0 failed** — zero core diff, unchanged from A2 |
| `bun tools/pocket.ts check --target windows-app --manifest guest/pocket.json --project-root .` (PocketJS worktree, A3 guest sources) | plan resolves; TypeScript 34 modules clean; `windows-app` satisfies capabilities; `ResolvedBuildPlan sha256:3fba5b233dc5e9a254fa7e0d24b291b13201bfae72433a1719e305f357885886` (matches the committed `guest/picoview-a3-main.plan.json`; rebuilt bundle bytes identical: js 339,418 / pak 304,944) |
| live runs (walk, orientation repeats, latency, memory ×3, post-review regression walk) | all exit 0 |

New A3 host tests (seams: svc boundary lines, decode entry, EXIF table):
manifest pushed once and bounded; missing-file bounded errors without
wedging; EXIF orientation table 1–8 + undefined fallback; admission check
before allocation (zero dim / >8192 per axis / u32 overflow); WIC RGBA decode
of an embedded 753 B JPEG fixture (pixel-position oracle); native EXIF
orientation for 5 (transpose), 6 (rotate 90), and 7 (transverse) via
hand-assembled APP1 fixtures with quadrant-position oracles; corrupt/
mislabeled/oversized rejections with bounded codes; end-to-end open → decode
→ register → announce → retire-previous (stale handle resolves to absence,
live bytes return to one plane, svc traffic bounded).

Legacy small-texture path untouched (`pocket-ui-surface` zero diff; core tests
unchanged).

## WIC decoder assessment (INFERENCE, bounded)

WIC met the defining 12 MP warm first-image SLO with margin (P50 66 ms vs
120 ms target) and decoded 24 MP at ~60 ms on this machine. No defining SLO
was materially missed → **no `LIBJPEG_TURBO_EVALUATION_REQUIRED`**; no decoder
comparison is opened. A4's Fit path must first measure WIC's native scaled
decode (`IWICBitmapSourceTransform` / `IWICBitmapScaler`) — this ticket adds
no scaler code.

## Scope

* no BrowseSession, no folder enumeration, no metadata system, no thumbnail
  cache, no Fit/100%/zoom/pan product behavior, no PNG/GIF/TIFF/WebP/HEIC/AVIF,
  no Handle operations, no product chrome beyond the harness's badge/status UI
* no new DrawList opcode, no second compositor, no new registry, no guest ABI
  change, no dependency beyond the cfg-gated `windows` crate on the desktop
  host (test material)
* PocketJS change stays in the campaign patch series; not pushed upstream
  (Mimosa full audit still pending before any upstream push — carried from A2)

## Correctives taken during this ticket

1. **WIC rotator pathology (measured, fixed)** — applying `IWICBitmapFlipRotator`
   directly over the JPEG decoder frame pulled column strips through the stream
   decoder and re-decoded the same MCU rows: measured 2.23–2.91 s per 1.2 MP
   oriented decode (vs 20 ms un-rotated 12 MP). Corrective: decode once to a
   memory plane on the codec's fast native path, materialize `IWICBitmap`, and
   apply the transform from memory → 4.5–29 ms. Stage timings are logged per
   request (`A3STAGES`). Cost of the corrective: one transient unrotated
   intermediate plane during oriented decodes (native-owned, dropped before
   publication).
2. **Fixture tooling** — WPF-written EXIF APP1 rejected by WIC itself
   (BADHEADER); replaced with a hand-assembled EXIF 2.32 APP1 in both the unit
   fixture and the live sample generator.
3. **Corrupt-fixture calibration** — 4 KB truncation decodes successfully
   (codec tolerance, recorded as a LIMITATION); 512 B header truncation used
   for the deterministic corrupt path.
4. **EXIF 5/7 transform arms swapped (found by adversarial review, fixed)** —
   the initial rotate-then-flip table implemented orientation 5 as R270+flipH
   and 7 as R90+flipH (transposed). Verified by matrix composition and a 2×1
   worked example, fixed to 5 = flipH∘R90 (transpose) and 7 = flipH∘R270
   (transverse), and covered by two new WIC pixel-oracle tests whose
   white-column side distinguishes the transpose family from the rotate-only
   values. Orientation 6 (the live-sampled value) was never affected.

## Known non-blocking findings (MINOR, recorded for A5)

From the three adversarial review passes; deliberately not fixed in this
ticket per campaign discipline:

* `PROPVARIANT` returned by `GetMetadataByName` is not `PropVariantClear`ed on
  the non-`VT_UI2` path — a bounded per-file leak when malformed EXIF
  resolves to a heap-backed variant type (natural fit for A5 hostile-input
  work).
* The whole source file is buffered before the 2-byte SOI sniff; paths are
  operator-supplied CLI test input today, but a size-capped read belongs in
  the A5 bounds story.
* The guest parses svc lines with a JSON-syntax guard only and does not
  correlate replies to the in-flight `req`; safe against the in-repo harness
  host, worth hardening when a second producer can exist.
* Latency endpoints use a shared wall clock rather than BENCHMARK's preferred
  monotonic source (see CLOCK NOTE); switch in A4's instrumentation.

## Verdict

**PASS**

All nine acceptance criteria are evidenced: correctly oriented visible JPEG
through the PocketJS Windows path; QuickJS carries bounded semantic state
only; WIC output enters the A2 native registration seam (no second path);
decode buffers and image/GPU resources have explicit native ownership and
synchronous retirement; source files are not locked after decode (rename
probe); first-image timestamps use BENCHMARK vocabulary with exact SHAs; 12 MP
and 24 MP peak memory captured with both required metrics; decode failures are
bounded observable error states without host crash; the end-to-end harness
exercises guest intent → request identity → WIC decode → native resource →
DrawList/presentation without bypassing the production seam.

Carried forward to A4: the 24 MP full-resolution peak (507.9 MiB) is the
measured justification for WIC scaled decode in Fit; the WIC truncation
tolerance is recorded as a detection limitation; the Mimosa full audit remains
required before the accumulated PocketJS runtime patch is pushed upstream.

## Evidence identity note

PicoView evidence-capture commit (guest A3 sources + the body of this
report): pinned exactly by the follow-up `docs:` commit on this branch —
see the Identity table's "PicoView evidence SHA" row. All measurements in
this report were captured before that commit on the identities listed above
(PocketJS `fa936129`, planHash `3fba5b23…`, toolchain and machine as
recorded); the follow-up commit only pins the document identity, per the A2
closeout corrective that evidence-capture and final-document SHAs be
distinguished.

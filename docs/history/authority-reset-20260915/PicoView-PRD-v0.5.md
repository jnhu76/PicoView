# PicoView PRD v0.5 — PocketJS Windows Architecture-Constrained

> **Product thesis**
>
> PicoView is a Windows 11 local image viewer whose responsibility is deliberately narrow:
>
> **Open → View → Inspect → Browse → Handle**
>
> It is not an editor, photo library, cloud product, file manager, media database, or general-purpose asset platform.

> **Engineering thesis**
>
> A viewer that is logically small but physically slow or heavy has failed.

> **Pocket rule**
>
> Do less work. Own less state. Load less code. Allocate fewer pixels. When work is unavoidable, make it bounded, cancellable, measurable, and subordinate to the current image.

## 0. Status

- Product: **PicoView**
- Version: **v0.5 / Corrective-1**
- Target: **Windows 11 desktop**
- Runtime/UI substrate: **PocketJS — frozen**
- Guest profile: **Octane-first**
- Current phase: **PRODUCT IMPLEMENTATION — VIEWER BASELINE**
- Product implementation: **authorized** — owner decision `POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT` (2026-09-14; see `CONTEXT.md` and `docs/history/README.md`)

v0.5 corrects five architecture-governance defects found in the v0.4 adversarial review:

1. Architecture admission now happens **before** broad product implementation.
2. PocketJS's current Windows reality is described accurately: the portable desktop architecture exists, but the frozen baseline explicitly compile-errors non-macOS/Linux targets.
3. The missing **native-owned large image resource → PocketJS composition** seam is a first-class proof obligation before WIC/JPEG integration.
4. PocketJS source identity and benchmark semantics are frozen and reproducible.
5. Browse natural ordering and eligibility now have a testable oracle rather than an informal “Windows-aware” phrase.

The architecture campaign behind this PRD has run and is closed as frozen history (see `docs/history/README.md`). The next goal is the first real viewer vertical slice:

> **V1 — Open One Image** (`docs/ROADMAP.md`), with performance work deferred until a real product workload exists.

---

# 1. User problem

The basic user request is simple:

> **show me this local image quickly, let me inspect nearby images, and let me perform a few obvious current-file actions.**

The three release-level pains PicoView must solve simultaneously are:

1. **Fast** — current image dominates the critical path.
2. **Light** — package, baseline memory, decoded memory, idle work, and dependencies remain bounded.
3. **Focused** — functionality does not expand beyond the viewing jobs that justify the product.

A focused app that is slow has failed. A fast app that imports a large runtime has failed. A fast/light app that grows into an editor/library/file manager has failed.

---

# 2. Product boundary

PicoView v1 supports five jobs:

- **Open** a local image.
- **View** it faithfully for ordinary Windows use.
- **Inspect** with Fit, 100%, zoom, pan, rotation-as-view-state, fullscreen, and basic information.
- **Browse** deterministic neighboring images in the source directory.
- **Handle** only the current file through a narrow set of local actions.

Explicit non-authorities:

- no destructive image editing;
- no media library/database;
- no cloud/account system;
- no batch file manager;
- no plugin system;
- no background indexer;
- no Filmstrip, Slideshow, Print, or Share in v1;
- no RAW development or true HDR pipeline in v1.

---

# 3. Hard invariants

## 3.1 Current Image First

Before first useful presentation PicoView MUST NOT require:

- directory-wide enumeration;
- BrowseSession completion;
- metadata/EXIF population beyond information required to orient/present the current image;
- thumbnail generation;
- neighbor decode/prefetch;
- update checks;
- telemetry;
- network access;
- database access.

Critical path:

```text
activation
  → source open
  → minimal validation/header
  → presentation-resolution decision
  → current-image decode/resource creation
  → composition/present
```

Everything else is lower-priority derived work.

## 3.2 PocketJS Is Frozen

PicoView v1 uses PocketJS. There is no UI-framework bake-off.

Forbidden as a second application platform:

- Electron/Chromium;
- WebView shell;
- .NET/Windows App SDK runtime;
- JVM;
- Python runtime;
- another general-purpose UI framework.

QuickJS is expected because it is part of PocketJS.

## 3.3 QuickJS Is a Control Plane

Normal image presentation MUST NOT transport O(image-bytes) payloads through JavaScript.

Guest/native traffic may carry bounded semantic state:

- path/request intent;
- request generation;
- image dimensions;
- viewport/transform;
- native resource handle/id;
- status/error;
- small metadata.

It MUST NOT normally carry:

- complete encoded image bytes;
- decoded multi-megapixel RGBA planes;
- giant base64/JSON/ArrayBuffer equivalents of image pixels.

Decode, large pixel storage, resource creation, GPU residency, cancellation, and large-resource reclamation remain native responsibilities.

## 3.4 No Hidden Continuous Work

For a settled static image there is no PicoView-owned continuous render loop, directory scan, cache-maintenance timer, telemetry heartbeat, update poll, or background indexer.

Every asynchronous activity has an owner, budget, cancellation condition, and completion condition.

## 3.5 No Speculative Browse Order

A partial directory enumeration cannot prove the exact natural-sort predecessor/successor.

Therefore exact Previous/Next is disabled until the current compact navigation generation is authoritative.

There is no temporary enumeration-order browsing mode in v1.

---

# 4. PocketJS baseline and Windows landing reality

Architecture Phase A uses the frozen source identity in `docs/POCKETJS-BASELINE.md`.

Initial campaign base:

`a5a85356e172db8a32aefa983ee1259f60406f69`

At this baseline:

- PocketJS has a portable desktop-host architecture around winit/wgpu, QuickJS/runtime-worker semantics, DrawList rendering, and retained presentation state;
- target profiles exist for macOS/Linux desktop applications;
- `hosts/desktop/src/plan.rs` explicitly supports macOS/Linux and compile-errors other host OS values;
- the public JS-facing `uploadTexture(Uint8Array, ...)` path is an ordinary small-texture upload contract and documents a ≤512 dimension constraint;
- existing image-node / texture-handle / `TEX_QUAD` semantics exist;
- PicoView has **not yet proved** that a large native-owned dynamic image resource can enter that composition path without JS pixel transport.

Therefore the first Windows task is:

> **extend the existing PocketJS desktop architecture to Windows, not invent an unrelated PicoView-only host and not pretend Windows already works.**

A real `windows-app` target requires observable, repeatable behavior:

- registered/explicit target identity;
- Windows build/run path;
- ordinary desktop window;
- pointer/keyboard input needed by PicoView;
- live viewport resize;
- correct DrawList presentation;
- clean shutdown;
- Windows modifier semantics;
- measured physical cost.

---

# 5. Missing native image-resource seam

This is a defining Architecture Phase A proof obligation.

The normal existing JS texture path is not accepted as PicoView's multi-megapixel image path because it requires JS byte payloads and is documented for small uploaded textures.

The desired semantic shape is:

```text
PocketJS guest
   │
   │ open(path, generation)
   ▼
native image capability
   │
   ├─ decode / native memory
   │
   └─ create/register native image resource
                 │
                 ▼
         PocketJS composition
         image node / handle
                 │
                 ▼
            DrawList/present
```

The guest sees an opaque bounded resource identity, not the pixel plane.

Architecture Phase A MUST first prove this seam using native-generated test pixels before WIC/JPEG complexity is added.

Prefer extending/reusing the existing resource-handle/image-node/`TEX_QUAD` contract if it can express the required size, lifetime, clipping, transform, and backend behavior.

A new DrawList opcode or separate surface mechanism is **not pre-approved**. It must be earned by evidence that the existing resource model cannot represent PicoView's need.

---

# 6. Decode strategy

## 6.1 WIC first

WIC is the v1 baseline decoder because it is present on Windows and adds no application-private codec runtime.

## 6.2 JPEG

For the Windows inbox JPEG path, Architecture Phase A measures source-transform/native down-scaling behavior rather than assuming all sizes/formats behave identically.

Large-JPEG Fit should attempt:

```text
header
 → requested viewport size
 → closest native decoder size
 → native scaled decode where available
 → small final scale if needed
 → native image resource
 → composition/present
```

Evidence records requested size, closest native size, decode time, resource creation/upload time, presentation timestamp, CPU cost, and peak memory.

## 6.3 PNG and non-native-scale formats

PicoView does not claim every format avoids full decode computation.

For PNG and similar formats the v1 requirement is honest bounded resource behavior:

- overflow-safe size math;
- no catastrophic allocation;
- no unnecessary long-lived giant intermediates;
- native ownership of large buffers;
- explicit degradation/error when a resource budget cannot be met.

## 6.4 Third-party decoder admission

`libjpeg-turbo` may be evaluated only after WIC JPEG materially misses a defining SLO.

Admission requires measured improvement and accounting for binary size, peak memory, color/orientation/metadata consequences, security/update burden, and license.

No FFmpeg-class broad multimedia stack is admitted for still-image completeness.

---

# 7. Native resource lifetime and cancellation

Every expensive image request belongs to a generation.

Conceptual states:

```text
requested
 → decoding
 → native-resource-ready
 → presented/current
 → retired
 → released
```

When request N+1 supersedes N:

- N may finish an unavoidable lower-level call;
- N MUST NOT publish as current afterward;
- avoidable later expensive stages are cancelled/skipped;
- CPU/GPU/native resources become reclaimable promptly;
- reclamation does not wait for QuickJS GC.

No global decoded-image LRU or persistent thumbnail cache in v1.

---

# 8. Source-file semantics

Source access must remain compatible with external edit/replace/delete/rename workflows where Windows APIs permit.

A source handle may remain open while the decoder genuinely needs it. It must not remain open merely because the decoded image stays visible.

Long-lived mapping of encoded source files is not the default.

External edit workflow:

```text
Open With
 → external edit/save/replace
 → PicoView revalidates
 → replacement decode succeeds
 → visible image atomically advances
```

Where possible, the last successfully presented image remains visible until replacement succeeds.

---

# 9. Open / View / Inspect

v1 Open entry points:

- Explorer association/double-click;
- command-line file path;
- Open File;
- drag/drop.

A valid supplied path is initial state. No home/gallery page intercepts it.

View/Inspect behavior:

- aspect ratio correctness;
- EXIF orientation where applicable;
- alpha transparency;
- Fit;
- Actual Size / 100%;
- Zoom/Pan;
- Fullscreen;
- non-destructive Rotate View;
- basic Info.

Pointer zoom preserves the image-space point under the pointer.

Viewport state distinguishes image coordinates, logical viewport coordinates, physical client pixels, and monitor DPI.

---

# 10. Per-Monitor DPI V2

Windows behavior must be Per-Monitor DPI Awareness V2 compatible.

Moving between different-DPI monitors must:

- update window/presentation geometry;
- preserve image-space zoom/pan semantics;
- avoid stale prior-monitor physical transforms;
- avoid persistent pointer-anchor jitter;
- avoid OS bitmap-scaled PocketJS chrome.

A **minimal real viewer-path DPI proof belongs before GATE-A**. Full UI Automation belongs to Product Phase B.

---

# 11. BrowseSession

BrowseSession is Product Phase B work; it is sequenced as roadmap slice V3 (`docs/ROADMAP.md`).

It builds a compact immutable navigation generation containing only filename/sort identity, path/compact identity, and minimal capability eligibility.

It does not decode every image, read every EXIF block, or generate thumbnails.

## 11.1 Readiness UX

Before authoritative order exists:

- current image remains usable;
- Previous/Next is disabled;
- no speculative navigation occurs;
- a quiet **Preparing folder…** state may appear when the delay is perceptible.

After readiness:

- exact Previous/Next activates;
- count/index may be shown;
- a corrupt candidate becomes a navigable error item when opened rather than destroying the session.

## 11.2 PicoView Natural Order v1

The ordering oracle is locale-stable and testable:

1. Compare filenames as UTF-16 text.
2. When both sides are in ASCII decimal runs `[0-9]+`, compare numeric magnitude without fixed-width integer parsing: trim leading zeroes, compare significant digit count, then significant digits lexicographically.
3. Equal numeric value sorts fewer leading zeroes first: `1 < 01 < 001`.
4. Non-digit spans compare using Windows ordinal case-insensitive semantics (`CompareStringOrdinal`-equivalent, ignore case).
5. If primary comparison is equal, tie-break with case-sensitive ordinal full filename; if still equal, use full-path ordinal identity.

No locale-sensitive Explorer order and no enumeration-order fallback is authoritative.

## 11.3 Eligibility

Index construction uses a cheap extension/capability filter.

It MUST NOT open/decode/sniff every file merely to establish directory membership.

Conditional-codec extensions are included only when the relevant decoder capability is known available for the session.

The explicitly opened current file remains the session anchor even if it arrived through a non-default association path.

Reference index targets on local NVMe:

- 1,000 mixed entries ≤100 ms P50;
- 10,000 mixed entries ≤500 ms P50;
- 10,000 mixed entries ≤1,000 ms P95.

The stronger invariant is that index work does not make the current image unresponsive.

---

# 12. External mutation

PicoView revalidates at:

1. foreground/activation;
2. F5;
3. source-dependent Handle action;
4. opening/navigating to a candidate;
5. optional coalesced filesystem dirty hint.

Watcher state is advisory, never the BrowseSession database.

F5 means: **revalidate current source and rebuild the current navigation generation.**

No infinite automatic retry loop exists.

---

# 13. Handle

Current-file authority only:

- Copy Image;
- Copy File;
- Copy Path;
- Delete → Recycle Bin;
- Rename;
- Reveal in Explorer;
- Open With.

No multi-select or batch operations.

After successful delete, prefer the former successor, else predecessor, else Empty Session, with revalidation before open.

---

# 14. Animation and format matrix

Only the current item may own animation playback.

- no animated thumbnails;
- navigation away releases animation work;
- non-meaningfully-visible windows pause/throttle;
- pathological near-zero timings are bounded/coalesced;
- static images inherit no permanent animation loop.

v1 format promise:

| Format | v1 | Notes |
|---|---|---|
| JPEG/JFIF | Yes | primary architecture path |
| PNG | Yes | bounded-resource path; no JPEG-style scaling assumption |
| BMP | Yes | static |
| GIF | Yes | current-item animation only |
| TIFF | Yes | first page/frame only |
| WebP | Conditional | installed Windows codec; animation not promised |
| HEIF/HEIC | Conditional | installed Windows codec; first image only |
| AVIF | Conditional | installed Windows codec; first image only |

Missing optional codec produces an explicit codec-unavailable state. PicoView does not silently download one.

---

# 15. Accessibility

Because PocketJS is custom-drawn, PicoView cannot assume native control accessibility.

Product Phase B must expose a bounded Windows UI Automation surface for the v1 controls/status only.

This is not authority to build a generalized PocketJS accessibility framework.

---

# 16. Deployment and dependency budgets

All application-private cost counts, including:

- PocketJS core;
- QuickJS;
- Octane guest/runtime bundle;
- host code;
- image capability;
- assets/fonts/icons;
- non-OS DLLs;
- installer payload.

Initial budgets:

- downloadable payload ≤15 MiB;
- installed application-private footprint ≤25 MiB;
- no-large-image settled baseline Working Set - Private target ≤40 MiB;
- architecture ceiling for that baseline >64 MiB is a FAIL.

Baseline distribution:

- unpackaged native executable + small installer/registration layer;
- optional portable ZIP;
- no .NET/Windows App SDK/WebView runtime requirement;
- no resident service/updater;
- no telemetry;
- no startup network path.

Every non-OS dependency requires a ledger entry for size, startup effect, baseline-memory effect, license, security/update burden, and exact user pain solved.

---

# 17. Runtime resource budgets

Reference system: Windows 11 x64, 16 GiB RAM, local NVMe, hardware-accelerated desktop GPU.

Working Set - Private targets:

- ordinary 24 MP Fit viewing ≤128 MiB;
- rapid-request transient hard budget ≤384 MiB;
- one request may not commit an allocation that alone makes the process exceed the hard budget;
- obsolete decode buffers/resources become reclaimable promptly.

Initial work-in-flight:

- current-image decode/resource work: 1;
- browse-index lane: 1 only in Product Phase B;
- speculative neighbor decode: 0 by default;
- thumbnail generation: 0.

---

# 18. Performance SLOs

Normative measurement semantics live in `docs/BENCHMARK.md`.

For an ordinary 12 MP JPEG on the reference class:

| Metric | Target | Architecture fail |
|---|---:|---:|
| process entry → usable window | ≤150 ms P50 | >300 ms P95 |
| process-cold activation → first useful image proxy | ≤300 ms P50 | >500 ms P95 |
| warm file request → first useful image proxy | ≤120 ms P50 | >250 ms P95 |

`first useful image proxy` means the benchmark contract's present-submission timestamp, plus separate visual correctness acceptance. It is not claimed to be display-photon latency.

After BrowseSession is authoritative:

- prefetched Next/Previous target ≤50 ms P50, fail >120 ms P95;
- non-prefetched ordinary Next/Previous target ≤150 ms P50, fail >300 ms P95.

Direct manipulation:

- 60 Hz P95 input-event → correlated present-submission target ≤20 ms where measurable;
- no repeated application-caused >33 ms stalls during ordinary zoom/pan.

Static idle:

- 30 s normalized process CPU target ≤0.2% under the benchmark contract;
- no recurring PicoView filesystem scan;
- no startup/background network activity;
- no custom continuous render loop.

---

# 19. Security

Images are untrusted input.

v1 requires:

- overflow-safe dimension/byte calculations;
- malformed-input graceful failure;
- hostile-dimension corpus;
- corrupt-file/frame corpus;
- no metadata-triggered network fetch;
- no embedded scripting;
- bounded animation scheduling.

Any third-party decoder requires an explicit security/update story.

---

# 20. Two-phase execution gate

## Phase A — Architecture proof

The authoritative execution sequence is conceptually:

```text
A0  freeze PocketJS baseline + benchmark contract
 ↓
A1  extend existing desktop architecture to windows-app
 ↓
A2  native-owned large image resource → PocketJS composition
 ↓
A3  first real JPEG / WIC end-to-end
 ├──────── A4  large JPEG / Fit / 100% / zoom / pan proof
 ├──────── A5  cancellation / hostile-resource proof
 └──────── A7  startup / package / idle / five-process proof
               │
               └── A6 DPI depends on A4

             ↓
          GATE-A
```

Architecture Phase A intentionally does **not** implement BrowseSession, Handle, broad format/animation behavior, final UIA, or final release packaging.

## GATE-A

GATE-A admits or rejects the PocketJS Windows architecture.

It requires evidence for:

- reproducible PocketJS source identity;
- real Windows stock-target behavior;
- native large-image composition without JS pixel transport;
- first JPEG/WIC path;
- large-JPEG/memory/direct-manipulation behavior;
- stale-publication/resource bounds;
- minimal Per-Monitor DPI V2 correctness;
- startup/package-prototype/baseline-memory/idle/five-process costs.

A FAIL blocks Product Phase B.

A PASS explicitly authorizes Product Phase B.

> **Resolution (2026-09-14).** The GATE-A campaign was executed as specified (`docs/GATE-A-EVIDENCE.md`, `docs/GATE-A2-EVIDENCE.md`; see also `docs/history/README.md`). Startup budgets did not meet the original lines while the other evidence lines passed. The follow-up startup investigation was closed as `CLOSED_FOR_NOW` / `MEASUREMENT_SUFFICIENT_FOR_CURRENT_PRODUCT_BUILD` (PR #44) — this is a documented closeout, **not** a retroactive PASS. Product implementation is authorized by the owner decision `POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT`; unresolved startup-performance questions are deferred until a real product workload exists (`docs/ROADMAP.md`).

## Phase B — Product implementation

Only after GATE-A passes:

- Windows Open/refresh/source lifetime;
- final viewer chrome/Inspect UX;
- BrowseSession;
- current-file Handle;
- format/animation matrix;
- bounded UI Automation;
- installer/association/release candidate work.

## GATE-B

Final release verification reruns physical budgets to prove Product Phase B did not regress the admitted architecture.

---

# 21. Benchmark and evidence authority

Measurement claims MUST follow `docs/BENCHMARK.md`.

Architecture evidence records at minimum:

- PicoView SHA;
- PocketJS base SHA;
- effective PocketJS SHA/patch series;
- release build identity;
- Windows build;
- CPU/RAM/GPU/driver;
- sample corpus identity;
- sample count and percentile rule;
- Working Set - Private and Private Bytes where memory is relevant.

A benchmark result that changes definitions to make itself pass is invalid.

---

# 22. Authority order

When sources disagree:

1. `docs/PRD/PicoView-PRD-v0.5.md` — product boundary, budgets, non-goals, gate policy;
2. `docs/SPEC/PicoView-v1.md` — cross-cutting system behavior/execution decisions;
3. accepted ADR — evidence-backed durable implementation choices;
4. `docs/ARCHITECTURE.md` — frozen PocketJS/PicoView ownership boundaries;
5. `CONTEXT.md` — current state and working facts;
6. `docs/ROADMAP.md` — slice sequencing;
7. current execution ticket — bounded slice only.

`POCKETJS.lock` is the dependency authority for the PocketJS source identity. `docs/BENCHMARK.md` is the measurement-semantics authority for any measurement claim; it is not a current execution gate. Historical evidence documents remain evidence authority for their historical claims only.

No lower authority silently weakens a higher one.

---

# 23. Feature admission rule

Every future feature must answer:

1. Which Open/View/Inspect/Browse/Handle pain does it solve?
2. Can the work be removed rather than optimized?
3. Can Windows/PocketJS already provide the mechanism?
4. Does it preserve startup/package/memory/idle/latency budgets?
5. Does it expand authority into editor/library/file-manager territory?

If it does not survive these questions: **DELETE.**

---

# 24. Freeze verdict

Frozen:

- PicoView name and Windows 11 target;
- Open → View → Inspect → Browse → Handle product boundary;
- fast/light/focused thesis;
- PocketJS runtime choice;
- Octane-first guest profile for the architecture campaign;
- frozen PocketJS campaign baseline policy;
- extend-existing-desktop-architecture-first Windows strategy;
- QuickJS control-plane rule;
- native image-resource seam as mandatory proof;
- WIC-first decode strategy;
- explicit generation/native-resource ownership;
- Current Image First;
- Per-Monitor DPI V2 requirement;
- exact Browse readiness semantics;
- PicoView Natural Order v1 oracle;
- cheap Browse eligibility rule;
- dependency/package/memory/performance budgets;
- benchmark contract authority;
- no telemetry/network/resident updater;
- v1 feature cuts;
- **architecture admission executed and closed before product implementation** (owner decision `POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT`, 2026-09-14; `docs/history/README.md`);
- final GATE-B release re-verification.

Not yet earned:

- a separate Windows presentation architecture replacing the existing desktop seam;
- new DrawList opcode/native surface mechanism if the existing resource model can be extended;
- libjpeg-turbo;
- activation broker;
- tiling/region-cache framework;
- true HDR;
- Filmstrip/Print/Share/Slideshow.

**PicoView v0.5 is READY FOR PRODUCT IMPLEMENTATION.**

The architecture campaign is closed frozen history (`docs/history/README.md`). Execution proceeds by roadmap slice; the next executable slice is V1 — Open One Image (`docs/ROADMAP.md`).

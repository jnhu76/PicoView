# PicoView PRD v0.4 — PocketJS / Windows Architecture-Constrained

> **Product thesis**
>
> PicoView is a Windows 11 local image viewer whose job is deliberately narrow:
>
> **Open → View → Inspect → Browse → Handle**
>
> It is not an editor, photo library, cloud product, file manager, media database, or general-purpose asset platform.
>
> **Engineering thesis**
>
> A viewer that is logically small but physically slow or heavy has failed.
>
> **Pocket rule:** Do less work. Own less state. Load less code. Allocate fewer pixels. When work is unavoidable, make it bounded, cancellable, measurable, and subordinate to the current image.

## 0. Status

- Product: **PicoView**
- Version: **v0.4**
- Target: **Windows 11 desktop**
- Runtime/UI substrate: **PocketJS — frozen**
- Guest profile: **Octane-first**
- Primary phase: **PocketJS Windows landing / architecture spike**
- Full implementation status: **not yet authorized**

The next gate is not “finish the viewer.” It is:

> **Prove that PocketJS on Windows plus a native image data plane can satisfy PicoView's fast/light/focused budgets.**

If a budget fails, first locate and remove cost from the PocketJS desktop host, guest profile, image capability, renderer, asset bundle, or scheduling model. Do not replace PocketJS with a heavier framework merely because it is easier to bring up.

---

# 1. Problem

Windows users already have software that can display images. The repeated pain is that a simple task — **“show me this image”** — pays for unrelated responsibilities: library state, editing, cloud, indexing, accounts, large runtimes, hidden background work, or heavyweight UI stacks.

PicoView exists to solve three things simultaneously:

1. **Fast** — opening and manipulating the current image should feel direct.
2. **Light** — package, baseline memory, decoded memory, idle work, and dependencies must stay bounded.
3. **Focused** — functionality must not expand beyond the viewing jobs that justify the product.

A focused app that is slow has failed. A fast app that drags in a large runtime has failed. A fast/light app that grows into a library/editor/file manager has failed.

---

# 2. Product boundary

PicoView supports five jobs:

- **Open** a local image.
- **View** it faithfully enough for normal Windows use.
- **Inspect** through zoom, pan, 100%, fit, and basic metadata.
- **Browse** deterministic neighboring images.
- **Handle** the current file through a small set of local actions.

Explicit non-authorities:

- no image editing;
- no media library/database;
- no cloud/account system;
- no batch file manager;
- no plugin system;
- no background indexer.

---

# 3. Hard invariants

## 3.1 Current Image First

The currently requested image has absolute priority.

Before first useful presentation PicoView must not require:

- complete directory enumeration;
- browse-index completion;
- metadata/EXIF population;
- thumbnail generation;
- neighbor decode or prefetch;
- update checks;
- telemetry;
- network access;
- database access.

Critical path:

```text
activation
  → open source
  → minimal validation/header
  → choose presentation resolution
  → decode current
  → upload/present
```

Everything else is subordinate derived work.

## 3.2 PocketJS Is Frozen

PicoView v1 uses PocketJS. There is no UI-framework bake-off.

Forbidden alongside PocketJS:

- Electron / embedded Chromium;
- WebView application shell;
- .NET/Windows App SDK runtime as a second application platform;
- JVM;
- Python runtime;
- a second general-purpose UI framework.

QuickJS is permitted because it is the PocketJS guest runtime.

## 3.3 QuickJS Is the Control Plane

Normal image presentation must not copy full encoded images or decoded pixel planes through JavaScript.

Guest/native traffic should contain only small semantic information:

- path/request intent;
- generation id;
- dimensions;
- viewport/transform;
- resource handles/ids;
- status/error;
- small metadata.

Decode, pixel storage, scaling, GPU upload, texture lifetime, and large-resource reclamation remain native.

## 3.4 Current Item Authority Only

v1 current-file actions:

- Copy Image;
- Copy File;
- Copy Path;
- Delete → Recycle Bin;
- Rename;
- Reveal in Explorer;
- Open With.

No multi-select, batch rename/delete/move/copy, folder organization, or album management.

## 3.5 No Speculative Browse Order

A partial directory enumeration cannot prove the true natural-sort predecessor/successor.

Therefore:

- first image may be ready before browse order;
- exact Previous/Next becomes available only when the compact navigation index for that generation is authoritative;
- no temporary enumeration-order browsing mode exists in v1;
- background discovery may not silently insert a newly discovered item into navigation history already presented to the user.

## 3.6 No Unbounded or Hidden Work

Every background activity has:

- owner;
- budget;
- cancellation condition;
- completion condition.

For a static untouched image there is no application-owned continuous frame loop, directory scan, cache timer, telemetry heartbeat, update poll, or background indexer.

---

# 4. PocketJS Windows landing

## 4.1 Current upstream reality

PocketJS already has a portable desktop host built around:

- winit window/input;
- wgpu DrawList presentation;
- a runtime worker for QuickJS/layout/GPU command recording;
- retained GPU targets and presentation handoff;
- desktop host tests and frame tracing.

Its stock desktop target registry currently names macOS and Linux application targets, but not a Windows application target.

Therefore PicoView starts by proving the **existing desktop seam** on Windows rather than inventing a parallel host from zero.

## 4.2 Windows stock target requirement

“Compiles on Windows” is insufficient. A real Windows PocketJS target must provide reproducible observable behavior:

- Windows build/run path;
- ordinary desktop window;
- pointer/keyboard/text input needed by PicoView;
- live viewport resize;
- correct presentation;
- Windows DPI behavior;
- deterministic capability registration;
- automated/repeatable acceptance evidence;
- measured startup/package/memory/idle cost.

Only measured failure may earn a Windows-specific presentation specialization beneath the existing PocketJS contract.

## 4.3 Image capability boundary

PicoView requires a narrow native image capability conceptually exposing operations such as:

```text
open(path, generation)
setViewport(...)
requestResolution(...)
refresh()
copyCurrent()
```

Native-to-guest events may expose:

```text
ready
dimensions
error
generationRetired
refreshStatus
```

These are semantic examples, not a frozen source-code API.

The contract never transports decoded pixel planes.

---

# 5. Decode strategy

## 5.1 WIC first

WIC is the baseline v1 decoder substrate because it is already present on Windows and adds no application-private runtime stack.

PicoView must treat formats according to actual decoder capability rather than pretending every format supports the same viewport-aware decode path.

## 5.2 JPEG

Windows inbox JPEG supports native down-scaling through the WIC source-transform path at power-of-two levels such as 1/2, 1/4, and 1/8.

Large JPEG Fit path should prefer:

```text
header
 → viewport size
 → closest native decode size
 → scaled JPEG decode
 → small final scale if needed
 → GPU texture
```

Spike evidence records requested size, closest native size, decode time, upload time, CPU cost, and peak memory.

## 5.3 PNG and other non-native-scale formats

PicoView must not claim that every format avoids full decode computation.

For PNG and similar paths, the requirement is honest bounded resource behavior:

- avoid retaining unnecessary giant intermediates;
- keep large buffers native;
- apply resource limits before catastrophic allocation;
- degrade or reject explicitly when the budget cannot be satisfied.

A large PNG may be slower than a JPEG and still be compliant if it remains bounded and predictable.

## 5.4 Specialized decoder admission

`libjpeg-turbo` may be evaluated only if the WIC JPEG path materially misses the release SLO.

Admission must account for:

- latency improvement;
- peak memory;
- binary/package size;
- code loaded before first image;
- metadata/orientation/color consequences;
- security/update burden;
- licensing.

If WIC passes, the additional JPEG decoder is deleted from the design.

FFmpeg-class stacks, broad multimedia runtimes, and bundled libheif-style stacks are not v1 defaults.

---

# 6. Memory and lifetime

Large image buffers must live outside the JavaScript heap.

Every expensive request belongs to a generation. At minimum, native image work has conceptual states:

```text
requested → decoding → pixels-ready → uploading → gpu-resident → retired → released
```

When a newer request supersedes an older one:

- old work should cancel before another expensive stage where possible;
- old results may never publish as current;
- large CPU/GPU resources must become reclaimable promptly;
- reclamation must not wait for JavaScript GC timing.

No global decoded-image LRU or persistent thumbnail cache in v1.

A tiny previous/current/next optimization may be earned later by measurement, but it is not assumed.

---

# 7. Source-file semantics

Normal local source access should be compatible with external read/write/delete/rename workflows where the chosen Windows APIs permit it.

A source handle may stay open while a decoder needs it; it must not stay open merely because the decoded image remains visible.

Long-lived memory-mapped source files are not the default. Mapping encoded input does not eliminate decoded-pixel memory and may complicate replacement/delete semantics.

External editor workflow must remain possible:

```text
Open With → edit/save/replace externally → PicoView revalidates → new decode succeeds → replace visible image
```

The last successfully decoded image remains visible until replacement succeeds where possible.

---

# 8. OPEN

v1 entry points:

- Explorer association/double click;
- command-line file path;
- Open File;
- drag and drop.

A supplied valid path is the initial state. No home/gallery/account/library page may intercept it.

Baseline process model is one window per process because it has the smallest authority model. However the architecture spike must measure one and five simultaneous processes. A minimal activation router is earned only if multi-process memory materially violates the “light” thesis.

A future router may forward only activation/path intent. It must not introduce shared BrowseSession state, shared decoded cache, a resident service, or a generalized IPC framework.

---

# 9. VIEW and INSPECT

Required v1 viewing behavior:

- aspect ratio correctness;
- EXIF orientation where applicable;
- alpha transparency;
- Fit;
- Actual Size / 100%;
- Fullscreen;
- non-destructive Rotate View;
- Zoom;
- Pan;
- basic information panel.

Pointer zoom preserves the image-space point under the pointer as scale changes.

Viewport state must distinguish:

- image coordinates;
- logical viewport coordinates;
- physical client pixels;
- monitor DPI.

---

# 10. Per-Monitor DPI V2

Windows behavior must be Per-Monitor DPI Awareness V2 compatible.

Moving a window between different-DPI displays must:

- update window/presentation geometry;
- preserve image-space zoom/pan semantics;
- avoid stale previous-monitor pixel transforms;
- avoid persistent anchor jitter;
- avoid blurry OS bitmap scaling of the PocketJS UI.

DPI correctness is part of the architecture spike, not late polish.

---

# 11. BROWSE

After current-image work is underway, PicoView builds one compact navigation generation containing only what navigation needs, such as filename/sort key, path/compact identity, and minimal eligibility.

It must not require decoding every image, reading every EXIF block, or generating thumbnails.

Before order readiness:

- current image remains fully usable;
- zoom/pan/current-file Handle remains usable;
- Previous/Next is disabled;
- a quiet **Preparing folder…** state may appear if preparation lasts long enough to be perceptible.

After readiness:

- Previous/Next uses deterministic Windows-aware natural filename order;
- total count/index may be displayed;
- corrupt items are navigable error items rather than session-destroying failures.

Reference index targets on NVMe:

- 1,000 entries: ≤100 ms P50;
- 10,000 entries: ≤500 ms P50;
- 10,000 entries: ≤1,000 ms P95.

The stronger requirement is that index work never makes the current image unresponsive.

---

# 12. External mutation

PicoView revalidates at explicit points:

1. window foreground/activation;
2. F5;
3. source-dependent Handle operation;
4. navigation/open of a candidate;
5. optional coalesced directory-change dirty hint.

A watcher is advisory, never the BrowseSession database.

F5 means: **revalidate current source and rebuild the current directory navigation generation.**

No automatic infinite retry exists for changing/partially written files.

---

# 13. HANDLE

Current item only:

- Copy Image copies oriented image content, not the viewport crop/zoom/pan.
- Copy File copies the file object where supported.
- Copy Path copies path text.
- Delete moves the current item to Recycle Bin.
- Rename keeps the same logical current item and invalidates/rebuilds browse ordering as needed.
- Reveal in Explorer delegates broader file management.
- Open With delegates editing/other workflows.

After successful deletion, prefer the former successor, else predecessor, else Empty Session; revalidate the candidate before opening.

---

# 14. Animation

Only the current item may own animation playback.

- no animated thumbnails;
- navigation away releases timers/resources;
- hidden/non-meaningfully-visible windows pause or throttle;
- pathological zero/near-zero frame timings are bounded/coalesced;
- static images inherit no permanent animation/update loop.

---

# 15. Format matrix

| Format | v1 | Notes |
|---|---|---|
| JPEG/JFIF | Yes | primary photo path; WIC native scaled decode measured |
| PNG | Yes | no assumption of native decode-time scaling |
| BMP | Yes | static |
| GIF | Yes | current-item animation only |
| TIFF | Yes | first page/frame only in v1 |
| WebP | Conditional | installed Windows codec path; animation not promised |
| HEIF/HEIC | Conditional | installed Windows codec path; first image only |
| AVIF | Conditional | installed Windows codec path; first image only |

Missing optional codec produces an explicit codec-unavailable state. PicoView does not silently download or bundle a heavyweight fallback.

Not v1: RAW development, PSD, specialist scientific/medical formats, multi-page TIFF navigation, true HDR, professional proofing.

---

# 16. Accessibility

PocketJS is custom-drawn, so PicoView cannot assume native controls automatically expose accessibility semantics.

The Windows path must expose a bounded UI Automation surface for the actual v1 controls, including Open, Previous/Next, Delete, More/menu actions, Open With, Info, Fit/100%, Zoom, Fullscreen, and meaningful loading/error/status text.

A generalized cross-platform PocketJS accessibility framework is out of scope.

---

# 17. Deployment and dependency budget

All PocketJS application-private cost counts:

- PocketJS core;
- QuickJS;
- guest runtime/bundle;
- host code;
- fonts/icons/assets;
- image capability;
- non-OS DLLs;
- installer payload.

Initial targets:

- downloadable payload: **≤15 MiB**;
- installed application-private footprint: **≤25 MiB**;
- no decoded large image baseline private working set: target **≤40 MiB**, hard architecture ceiling **≤64 MiB**.

Baseline distribution:

- unpackaged native executable plus small installer/registration layer;
- optional portable ZIP;
- no .NET/Windows App SDK/WebView runtime requirement;
- no background service;
- no resident updater;
- no telemetry;
- no startup network path.

Every non-OS dependency requires an admission record describing size, startup effect, baseline-memory effect, license, security/update burden, and the exact user pain solved.

---

# 18. Runtime resource budgets

On the reference 16 GiB system:

- ordinary 24 MP Fit viewing target: **≤128 MiB app private working set**;
- rapid-switch transient hard budget: **≤384 MiB app private working set**;
- one request may not commit an allocation that alone makes the process exceed the hard budget;
- obsolete decode buffers must become reclaimable promptly.

Initial work-in-flight:

- current decode: 1;
- browse-index lane: 1;
- speculative neighbor decode: 0 by default;
- thumbnail generation: 0 in v1.

---

# 19. Performance SLOs

Reference class: Windows 11, x64, 4+ performance-class cores, 16 GiB RAM, local NVMe, hardware accelerated desktop GPU.

For an ordinary 12 MP JPEG:

| Metric | Target | Architecture fail |
|---|---:|---:|
| process start → usable window | ≤150 ms P50 | >300 ms P95 |
| cold activation → first useful image | ≤300 ms P50 | >500 ms P95 |
| warm file request → first useful image | ≤120 ms P50 | >250 ms P95 |

After browse order is ready:

- prefetched Next/Previous target ≤50 ms P50, fail >120 ms P95;
- non-prefetched ordinary Next/Previous target ≤150 ms P50, fail >300 ms P95.

Direct manipulation:

- 60 Hz P95 input-to-present target ≤20 ms where practical;
- no repeated application-caused >33 ms stalls during ordinary zoom/pan.

Static idle over a 30 s observation window:

- target ≤0.2% process CPU average on reference hardware;
- no PicoView-initiated recurring filesystem scan after settling;
- no network activity;
- no custom continuous application render loop.

If the selected PocketJS Windows path cannot plausibly pass package, startup, baseline memory, idle, or first-image gates, the team corrects the runtime/host path before continuing feature implementation.

---

# 20. Security

Images are untrusted input.

v1 requires:

- overflow-safe dimension/byte calculations;
- malformed-input graceful failure;
- hostile dimensions test corpus;
- corrupt frame/file test corpus;
- no metadata-triggered network fetch;
- no embedded scripting;
- bounded animation behavior.

A third-party decoder requires an explicit security/update story.

---

# 21. v1 cuts

The following are removed from v1 rather than being “optional if time permits”:

- Filmstrip;
- Slideshow;
- Print;
- Share;
- crop/resize/permanent rotate/save;
- drawing/annotation/filters;
- OCR workflow;
- albums/favorites/tags/timeline;
- cloud/accounts/import/export;
- batch conversion/rename/file management;
- plugins;
- RAW development;
- true HDR;
- global persistent image cache.

Future capabilities must re-earn admission after the core viewer passes its budgets.

---

# 22. Architecture spike

## A — PocketJS Windows stock-target proof

Prove a real PocketJS guest through the existing portable desktop seam on Windows 11. Record build artifact size, startup-to-first-frame, baseline private memory, idle CPU/GPU, one-process and five-process aggregate memory, input, resize, and shutdown.

## B — Native first-image path

Prove:

```text
file request → PocketJS guest intent → native image capability → WIC → native/GPU image → visible PicoView image
```

No decoded pixel payload crosses QuickJS. Measure 12/24/50 MP JPEG, large PNG, corrupt input, and extreme dimensions. Evaluate libjpeg-turbo only if WIC JPEG materially misses the target.

## C — Browse generation

Test 1k/10k mixed directories, adversarial natural-sort names, concurrent rename/delete bursts, Preparing folder UX, memory per entry, rebuild/F5, and bounded missing-candidate handling.

## D — Per-Monitor DPI V2

Test 100%↔200% monitor movement, resize, logical layout, pointer-anchored image zoom, and presentation geometry.

## E — Cancellation/hostile/animation

Rapidly switch 100 images; force old completions after new requests; test malformed/huge images and pathological GIF timing. Prove no stale publication and prompt native resource release without waiting for JS GC.

## F — Packaging

Produce executable, portable ZIP, installer prototype, associations, and size/dependency report. Verify no hidden second runtime, service, telemetry, or startup network path.

## G — UI Automation

Expose the v1 control surface and verify names/roles/focus/keyboard reachability with a Windows accessibility inspection tool.

---

# 23. Spike exit criteria

The architecture phase passes only when all are evidenced:

- PocketJS desktop seam runs a real guest on Windows 11;
- a Windows stock target/capability is explicit and testable;
- QuickJS carries control/state, not decoded pixels;
- payload/install/baseline-memory/idle budgets pass;
- one- and five-process memory is measured;
- cold first-image latency is measured and passes or has an approved corrective;
- WIC JPEG scaling behavior is measured, not assumed;
- large PNG behavior is described honestly and remains resource-safe;
- source files are not unnecessarily held;
- exact browse order never speculates;
- 10k index remains bounded and non-blocking to current-image interaction;
- F5 and activation revalidation work;
- cancellation prevents stale publication;
- native buffers do not wait for JS GC;
- Per-Monitor DPI V2 tests pass;
- corrupt/huge inputs do not crash the app;
- pathological animation cannot create runaway work;
- release artifacts contain no hidden runtime/service;
- core controls expose bounded UI Automation semantics.

If a gate fails: identify the physical mechanism, delete/reduce/delay/cancel work, retest, and record the trade-off. Do not weaken the product thesis merely to make an implementation pass.

---

# 24. Feature admission rule

Every future feature must answer:

1. Which Open/View/Inspect/Browse/Handle pain does this solve?
2. Can the work be removed rather than optimized?
3. Can Windows/PocketJS already provide the mechanism?
4. Does it preserve startup/package/memory/idle/latency budgets?
5. Does it expand authority into editor/library/file-manager territory?

If it does not survive these questions: **DELETE.**

---

# 25. Freeze verdict

Frozen:

- PicoView product boundary;
- fast/light/focused thesis;
- PocketJS runtime choice;
- QuickJS control-plane rule;
- existing PocketJS desktop seam as first Windows landing path;
- native image data-plane boundary;
- WIC baseline;
- Current Image First;
- explicit native lifetime/generation cancellation;
- deterministic browse generation;
- Per-Monitor DPI V2 requirement;
- bounded UI Automation requirement;
- package/memory/performance budgets;
- no telemetry/network/resident updater;
- v1 feature cuts.

Not yet earned:

- specialized Windows presentation backend replacing the portable desktop seam;
- libjpeg-turbo;
- activation broker;
- tiling/region cache framework;
- true HDR;
- Filmstrip/Print/Share/Slideshow.

**PicoView v0.4 is READY FOR POCKETJS WINDOWS ARCHITECTURE SPIKE + INTERACTION DESIGN.**

It is not yet permission to implement the complete viewer.

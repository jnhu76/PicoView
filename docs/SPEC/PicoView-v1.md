# PicoView v1 Spec — PocketJS Windows Landing and Viewer Foundation

**Status:** ready for execution planning  
**Product:** PicoView  
**Primary authority:** PicoView PRD v0.4  
**Runtime choice:** PocketJS  
**Target:** Windows 11 desktop  
**Current phase:** PocketJS Windows landing / architecture spike before full viewer implementation

## Problem Statement

A local image viewer should feel like a direct operation: the user opens an image and the image appears. Existing viewers often make that simple job pay for unrelated product responsibilities, large runtime stacks, background work, indexing, editing systems, or heavy UI frameworks.

PicoView has already frozen the product boundary around **Open → View → Inspect → Browse → Handle** and has explicit performance, memory, package-size, and idle-work budgets. The unresolved risk is no longer product scope. It is whether PocketJS can land on modern Windows as a sufficiently small, fast, testable desktop substrate while keeping image pixels out of the JavaScript runtime.

PocketJS already has a portable desktop host built around winit, wgpu, a runtime worker, DrawList rendering, retained GPU targets, and QuickJS guest execution. Its production target registry currently exposes macOS and Linux desktop application targets but not a Windows application target. PicoView must first prove that the existing desktop seam can become a real Windows stock target, and then prove that a native image data plane can satisfy PicoView's first-image, memory, DPI, cancellation, and package budgets.

The failure mode to avoid is building the whole viewer on top of an unproven runtime path and discovering later that startup, baseline memory, binary size, DPI, or image upload costs violate the product thesis.

## Solution

Build PicoView as a PocketJS application with a deliberately split architecture:

- PocketJS / QuickJS owns application UI, input intent, product state, and small control messages.
- A native image capability owns source-file access, WIC decode, native pixel memory, GPU texture lifetime, resource budgets, cancellation generations, and refresh.
- The existing PocketJS portable desktop host is the first implementation seam for Windows. Add Windows-specific specialization only where the generic seam cannot satisfy observable Windows behavior or PicoView budgets.
- Image data never traverses QuickJS as full encoded-image or decoded-pixel payloads during normal viewing.
- The first useful image is the dominant priority. Browse index construction, metadata, and other derived work run after or below current-image work.
- Full viewer implementation is gated by executable architecture spikes and release-budget measurements.

The first engineering outcome is not “all viewer features exist.” It is a proved vertical path:

> **Windows shell/file request → PocketJS guest → native image capability → WIC/native decode → GPU presentation → visible image**

with measured startup, footprint, memory, idle behavior, cancellation, and DPI behavior.

## User Stories

1. As a Windows user, I want to double-click an ordinary JPEG and see it quickly, so that opening an image feels like a direct action rather than launching a platform.
2. As a Windows user, I want PicoView to remain small on disk, so that a simple viewer does not install a large runtime stack.
3. As a Windows user, I want PicoView to use little memory while idle, so that keeping a viewer open does not make the system feel heavier.
4. As a Windows user, I want a static image window to settle to near-zero application work, so that the viewer does not burn CPU or GPU without a reason.
5. As a Windows user, I want the current image to appear before folder browsing context is complete, so that large directories do not delay the image I explicitly opened.
6. As a Windows user, I want large JPEG photos to use an appropriate decode resolution for the viewport, so that fitting a large photo does not require retaining a needlessly huge pixel surface.
7. As a Windows user, I want large PNGs and other non-native-scale formats to fail or degrade safely rather than exhaust memory, so that unusual images cannot crash the viewer.
8. As a Windows user, I want zoom and pan to stay responsive, so that inspecting details feels directly coupled to input.
9. As a Windows user, I want pointer-anchored zoom to preserve the image point under my cursor, so that the image does not jump away while zooming.
10. As a multi-monitor user, I want the viewer to behave correctly when moved between displays with different DPI scales, so that controls and image geometry do not jitter or blur.
11. As a Windows user, I want Previous and Next to follow deterministic natural filename order, so that browsing a folder is predictable.
12. As a Windows user, I want PicoView to say when folder order is still being prepared instead of guessing, so that navigation never silently changes history underneath me.
13. As a Windows user, I want corrupt or unsupported images to show a bounded error state while keeping browsing alive, so that one bad file does not destroy the session.
14. As a Windows user, I want rapid Next/Previous input to cancel obsolete work, so that old decodes cannot appear after the image I most recently requested.
15. As a Windows user, I want the viewer to survive hostile dimensions and malformed image headers, so that untrusted image files cannot trigger catastrophic allocation.
16. As a Windows user, I want an already visible image to remain visible if the source is externally deleted, so that external file changes do not crash or blank the viewer.
17. As a Windows user, I want PicoView to notice a file changed after I return from an external editor, so that I can see the updated image without restarting the app.
18. As a Windows user, I want F5 to explicitly refresh the current source and folder generation, so that I have a predictable recovery action after external changes.
19. As a Windows user, I want to delete the current image to the Recycle Bin, so that ordinary cleanup is available without turning PicoView into a file manager.
20. As a Windows user, I want to rename the current file without unexpectedly jumping to another image, so that simple file handling remains predictable.
21. As a Windows user, I want Copy Image, Copy File, and Copy Path to have distinct behavior, so that I can move either pixels, the file object, or its location.
22. As a Windows user, I want Open With and Reveal in Explorer, so that editing and broader file management remain delegated to the correct external tools.
23. As a Windows user, I want GIF animation to stop when I navigate away or the window is not meaningfully visible, so that animations do not create hidden continuous work.
24. As a Windows user, I want pathological animation timings to be bounded, so that a malformed GIF cannot monopolize the render loop.
25. As a Windows user, I want HEIC/AVIF/WebP codec absence to be explained clearly, so that optional system-codec formats fail understandably without hidden downloads.
26. As a keyboard user, I want the core viewing and navigation actions to be keyboard reachable, so that the viewer is not pointer-only.
27. As a screen-reader user, I want core PicoView controls exposed through Windows UI Automation, so that custom PocketJS drawing does not make the application opaque.
28. As a user who opens several images in separate windows, I want aggregate memory to remain reasonable, so that the one-process-per-window baseline does not undermine the light goal.
29. As a privacy-conscious user, I want viewing to require no telemetry or startup network activity, so that a local viewer stays local.
30. As a user, I want no resident updater or background service after I close PicoView, so that the application has no hidden lifetime.
31. As a PicoView developer, I want a real Windows PocketJS target rather than application-specific host hacks, so that the runtime boundary remains reusable and explicit.
32. As a PicoView developer, I want Windows host behavior proved through the existing PocketJS desktop seam first, so that we do not prematurely fork the runtime architecture.
33. As a PicoView developer, I want image pixels to stay in native memory/GPU resources, so that QuickJS remains a control plane rather than a large-data transport.
34. As a PicoView developer, I want every expensive native operation to belong to a request generation, so that cancellation and stale-publication rules are testable.
35. As a PicoView developer, I want package size, startup, baseline memory, idle work, and first-image latency measured through repeatable harnesses, so that architecture regressions are visible.
36. As a PicoView developer, I want third-party codecs to require evidence, so that dependency growth happens only when the Windows substrate cannot meet a concrete SLO.
37. As a PicoView developer, I want the image capability to expose small semantic operations rather than implementation objects, so that the guest/native contract remains stable.
38. As a PicoView developer, I want deterministic folder-order tests to use adversarial filenames, so that natural-sort correctness is proved rather than assumed.
39. As a PicoView developer, I want five-process memory measured before adding an activation broker, so that IPC complexity is earned by an observed problem.
40. As a PicoView developer, I want the full implementation held behind the architecture-spike gate, so that the project cannot normalize a substrate that already violates PicoView's defining budgets.

## Implementation Decisions

- **PocketJS is frozen as the application runtime.** PicoView will not run a UI-framework bake-off between PocketJS, WinUI, Electron, .NET, or another application shell.
- **Reuse the existing portable desktop host seam first.** PocketJS already has a desktop host using winit/wgpu and a runtime worker. The Windows effort begins by proving and admitting a Windows stock application target rather than assuming a separate host architecture is needed.
- **A Windows target is an observable PocketJS capability, not merely “it compiles on Windows.”** It must have a registered target profile, reproducible build/run path, input, live viewport behavior, frame presentation, tests, and measured runtime characteristics.
- **QuickJS is a control plane.** Guest/native traffic is restricted to small commands, status, dimensions, transforms, handles/ids, and small metadata.
- **Decoded pixels remain native.** WIC decode output, intermediate pixel storage, upload resources, and GPU textures are owned outside the JavaScript heap with explicit lifetime.
- **Use a dedicated native image capability.** The guest asks for open, viewport/resolution, refresh, copy, and similar semantic operations; the native side emits ready/error/status events without exposing large pixel planes.
- **WIC is the first decoder substrate.** Windows inbox JPEG native down-scaling is measured and used where available. PNG and other formats that do not provide equivalent native scaling are treated honestly as different workloads.
- **libjpeg-turbo is benchmark-gated, not default.** It may be evaluated only if the measured WIC JPEG path materially misses release SLOs; if WIC passes, the extra decoder is excluded.
- **Current Image First is an execution rule.** Folder discovery, metadata, optional prefetch, and other derived work cannot gate first useful presentation.
- **Browse ordering is generation-based.** A compact filename/navigation index becomes authoritative only when complete for the generation. No speculative enumeration-order navigation is allowed.
- **External filesystem observation is advisory.** Activation, F5, navigation/open, and source-dependent actions revalidate. Directory notifications may mark a generation dirty but do not become the source of truth.
- **Large native resources use explicit ownership and request generations.** Obsolete generations may finish lower-level calls but cannot publish into current state and must release large resources promptly.
- **Per-Monitor DPI Awareness V2 is a Windows contract.** Image-space, logical viewport, physical client pixels, and monitor DPI remain distinct coordinate domains.
- **One process per window remains the baseline until measured otherwise.** A minimal activation router is allowed only if five-process measurements materially violate the light-footprint goal.
- **Packaging is native and local.** Baseline distribution is an unpackaged executable plus a small installer, with an optional portable ZIP. No resident updater, telemetry agent, or startup network dependency is part of v1.
- **The product boundary remains narrow.** Filmstrip, slideshow, print, share, editing, library/database behavior, cloud, plugins, batch operations, RAW development, and true HDR are not v1 responsibilities.
- **Architecture budgets are stop-the-line gates.** A runtime path that cannot meet startup, payload, baseline-memory, idle, or first-image budgets must be corrected before full feature implementation.

## Testing Decisions

The preferred highest test seam is the **end-to-end Windows runtime path**:

> shell/file request → PocketJS guest intent → native image capability → decode/resource decision → GPU presentation → observable PicoView state.

Tests should assert externally visible behavior and resource contracts rather than internal class structure.

Good tests:

- prove a real PocketJS guest presents through the Windows desktop host;
- prove a file request produces a correctly oriented visible image;
- prove stale generations cannot replace newer requested content;
- prove deterministic browse order from adversarial filenames;
- prove large/corrupt inputs remain bounded and navigable;
- prove moving between different-DPI monitors preserves zoom-anchor behavior;
- prove current-file operations cause the expected filesystem result;
- prove static idle behavior has no PicoView-owned continuous render loop;
- prove package size, baseline memory, and benchmark thresholds from repeatable harness output.

The primary modules/capabilities under test are:

- PocketJS Windows target and desktop host behavior;
- guest/native image capability contract;
- decode/resource lifecycle;
- viewport interaction;
- BrowseSession generation/index behavior;
- file actions and refresh;
- Windows DPI / UI Automation integration;
- packaging and architecture-budget harness.

Prior art should be taken from PocketJS's existing desktop host tests, DrawList/backend verification, frame tracing, deterministic simulator/golden testing, and target capability registry rather than creating a second testing philosophy inside PicoView.

Hardware acceptance and software/golden tests are complementary. GPU pixels need not be byte-identical across platforms, but product-state transitions, ordering, lifetime, and budget observations must be reproducible.

## Out of Scope

- Replacing PocketJS with another UI/runtime framework.
- Building a second complete Windows UI framework inside PicoView.
- Filmstrip.
- Slideshow.
- Print.
- Share.
- Image editing or destructive save operations.
- Photo library, albums, favorites, tags, timeline, search index, or media database.
- Cloud sync or account system.
- Plugin runtime.
- Batch file management or conversion.
- RAW development.
- Professional proofing or true HDR pipeline.
- Multi-page TIFF navigation in v1.
- Guaranteed animated WebP/AVIF support in v1.
- Bundling FFmpeg-class, libheif-class, or broad multimedia stacks solely for format-count completeness.
- Resident updater, background service, telemetry, or startup network access.
- A shared cross-process decoded-image cache.
- A generalized filesystem identity/database layer for external renames.
- A generalized PocketJS cross-platform accessibility framework; PicoView needs only the bounded Windows UI Automation surface required by its v1 controls.

## Further Notes

### Current PocketJS reality

PocketJS already contains a portable desktop host that uses winit for window/input, a wgpu DrawList backend, a runtime worker for guest/layout/GPU command recording, retained GPU targets, and explicit presentation handoff. Its stock native desktop target registry currently describes macOS and Linux application targets, not a Windows application target.

This means PicoView's first problem is not “invent a desktop runtime.” It is:

1. prove the existing desktop seam on Windows;
2. add/admit the Windows target and required observable Windows behavior;
3. measure whether its winit/wgpu/QuickJS/core footprint satisfies PicoView;
4. specialize the Windows presentation path only if those measurements prove a concrete deficit.

### Architecture-spike gate

Full PicoView implementation must not outrun these proofs:

- Windows stock target is real and testable;
- guest → host → present path runs on Windows 11;
- native image data plane presents a JPEG without pixel transport through QuickJS;
- payload, baseline memory, idle CPU, first-image, and rapid-switch measurements are captured;
- browse generation/index semantics are executable;
- Per-Monitor DPI V2 path is verified;
- hostile/corrupt inputs are bounded;
- packaging has no hidden second runtime.

### Source authority

When implementation details conflict, use this order:

1. PicoView PRD — product boundaries, budgets, and non-goals.
2. This spec — system behavior and implementation/test decisions.
3. PocketJS public contracts and target/backend documentation — runtime semantics.
4. Individual tickets — bounded execution slices.

A ticket must not silently expand the authority granted by the PRD or spec.

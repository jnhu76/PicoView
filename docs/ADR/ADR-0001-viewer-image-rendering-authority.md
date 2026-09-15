# ADR-0001 — Viewer / Image / Rendering Authority

Status: **ACCEPTED**  
Date: **2026-09-15**  
Scope: PicoView product semantics, image semantics, PocketJS graphics contract, image-resource lifetime and presentation

## Context

PicoView has already proved a real Windows path from local file to WIC decode to a native image resource and PocketJS composition. That proof also exposed an architectural ambiguity: product semantics, image semantics, PocketJS resource representation, renderer behavior, presentation policy, and physical pixel ownership were not separated strongly enough.

The project must support a simple viewer without turning QuickJS into a pixel transport, without forcing native desktop images through an unrelated legacy texture representation, without silently destroying source fidelity, and without allowing every module boundary to become a full-image memcpy boundary.

This ADR freezes the durable decisions. Detailed program semantics and implementation invariants live in `docs/ARCHITECTURE.md`.

Higher authority remains:

1. `docs/PRD/PicoView-PRD-v0.5.md`
2. `docs/SPEC/PicoView-v1.md`
3. this ADR
4. `docs/ARCHITECTURE.md`
5. `CONTEXT.md`
6. `docs/ROADMAP.md`
7. current execution issue

If this ADR conflicts with PRD/SPEC, PRD/SPEC win and this ADR must be corrected explicitly.

## Decision

### 1. Three semantic authorities

PicoView is divided into three semantic authorities.

**Product semantics — PicoView**

PicoView decides what the user means and what the current product state is: Open, CurrentItem, BrowseSession, Previous/Next, Fit, Actual Size / 100%, Zoom, Pan, Rotate View, Flip View, Reset View, Fullscreen, Refresh, last-good publication, product-visible capability and product-visible errors.

**Image semantics — PicoView native**

PicoView decides what an encoded source means as an image: format policy, decoder orchestration, dimensions, frame/page structure, orientation metadata, alpha semantics, bit depth/precision, color description/ICC, HDR/source characteristics, animation timing/composition semantics, and source-fidelity requirements.

**Rendering semantics — PocketJS graphics/runtime**

PocketJS owns generic image-resource identity/lifetime, DrawList composition, backend selection, backend-native graphics resources, sampling, transforms, clipping, blending, UI + image composition, display adaptation, surface management and presentation.

No fact may have two simultaneous authorities.

### 2. Two execution planes

The CPU is the control and image-preparation plane. It owns product state, image decode/interpretation, UI state/layout/input, and DrawList generation.

The GPU is the primary graphics plane. It owns image residency, sampling, view transforms, composition and presentation when an eligible GPU backend exists.

UI policy is decided on CPU; UI and image pixels may both be rasterized/composited by the GPU. “UI on CPU” does not mean CPU bitmap rendering.

### 3. GPU-first, not GPU-required

For native Windows presentation the graphics backend chooses an adapter using this order:

1. compatible with the target presentation surface;
2. satisfies required graphics capabilities;
3. among valid choices, prefer low-power operation (normally the iGPU on hybrid systems);
4. otherwise use a compatible discrete GPU;
5. if no usable GPU path exists, a software/CPU renderer is the final fallback where product correctness can still be provided.

PicoView product/image code does not choose Intel/AMD/NVIDIA adapters and must not force an iGPU when that would create an invalid or cross-adapter presentation path.

### 4. Backend owns representation and storage

PocketJS core owns image identity, lifetime, revision semantics and rendering contracts.

The selected graphics backend owns the physical representation and storage of an admitted image resource. A native desktop image must not be forced through an unrelated canonical CPU texture representation merely because another backend historically uses that representation.

Backend examples may include wgpu-native resources, WebGPU resources, software bitmaps, or platform-specific texture storage. The upper DrawList/resource contract remains opaque and generic.

This ADR does **not** require a new `NativeImageHandle` or a parallel compositor. Prefer a unified opaque image/texture resource identity that existing composition can consume.

### 5. QuickJS is bounded control state only

`O(image-bytes)` never crosses QuickJS in the normal viewer path.

TSX/QuickJS may observe bounded semantics such as resource identity, display dimensions, status, generation, view capability, small metadata and bounded errors. It must not receive encoded files, decoded pixel planes, codec objects, ICC blobs, GPU resources, backend texture formats or decoder-specific state.

### 6. Source truth is distinct from presentation adaptation

PicoView preserves source information until a transformation is required to interpret the image or adapt it to the target display.

Fit, Zoom, Pan, Rotate View and Flip View are presentation operations by default; they do not modify the source file and do not require rewriting the source pixel plane merely to change the view.

The renderer must not silently reduce resolution, bit depth, gamut or HDR semantics only to simplify its implementation. When the current display cannot reproduce the source directly, adaptation such as tone mapping is a presentation operation, not a mutation of source truth.

The PRD explicitly does not promise a true HDR product pipeline in v1. This ADR therefore freezes HDR-capable semantics and boundaries without changing the v1 product promise.

### 7. Format support is a product capability matrix, not decoder discovery

`decoder can decode X` does not imply `PicoView supports X`.

Official support is defined by the product’s promised behavior across the relevant dimensions: decode, orientation, alpha, color/ICC, precision, HDR where applicable, animation, multi-page/frame semantics, corruption behavior and resource bounds.

Decoder implementations are replaceable behind the image-semantics boundary.

### 8. Semantic boundaries are not memcpy boundaries

A module boundary does not justify copying an entire image.

For every `O(image-pixels)` handoff, ownership transfer or borrowing is the default. A full pixel-plane copy requires an explicit semantic or physical reason, such as unavoidable conversion, orientation materialization, frame composition, color transform, backend row/layout requirements, or device transfer.

For the canonical static-image fast path, after a decoder has produced the final CPU representation required for admission, avoidable post-decode CPU full-plane copies are zero and GPU upload is not repeated merely because the user zooms, pans, resizes, switches Fit state, or causes UI rerendering.

This does not mean a source file can only ever be uploaded once. A fit-sized proxy, later full-resolution admission, content revision, device recreation or different resource identity may legitimately require a new upload.

### 9. Resource identity and generations are distinct

At minimum the architecture distinguishes:

- `request_generation`: latest-wins product publication ordering;
- `handle_generation`: stale resource-handle protection;
- `content_revision`: new content under a stable resource identity;
- `device_generation`: graphics-device/resource domain recreation when needed.

These must not be collapsed into one generic `generation` field.

### 10. Large-image admission must remain truthful

A backend/device limit must not silently redefine the image.

When the source cannot be represented as one full-resolution backend resource, the product/runtime must expose truthful capability such as full-resolution available, fit/proxy-only, tiled/virtual path, or unsupported. Silent destructive downsampling followed by claiming Actual Size is forbidden.

### 11. Current implementation is allowed to differ during migration

This ADR is target authority, not a claim that current code already conforms.

Known implementation differentials are migrated explicitly through PocketJS/PicoView issues and PRs. Generic runtime/graphics capability is implemented in PocketJS first, then PicoView advances `POCKETJS.lock`. PicoView-specific product/image policy remains in PicoView.

## Consequences

- PocketJS may need a generic backend-native image-resource admission seam while preserving one composition/resource identity model.
- Existing PSM- or CPU-backed texture paths may remain valid for backends/workloads that need them; they are not automatically the canonical native-desktop image path.
- View-state changes normally alter DrawList parameters, not image storage.
- Image decode and display are testable independently through stable contracts.
- CPU software rendering remains a correctness fallback, not the primary performance path.
- New image formats cannot leak codec nouns into TSX, DrawList or generic renderer APIs.
- New full-image copies require review as architectural events, not incidental implementation details.

## Non-decisions

This ADR does not freeze:

- a specific decoder library beyond the PRD/SPEC WIC baseline;
- the exact Rust type names for decoded assets or image handles;
- a single universal working pixel format;
- a mandatory true-HDR v1 implementation;
- a tiled-image implementation;
- texture/buffer pools, prefetch/cache strategy, mip generation, or hardware decode;
- a guarantee that every backend exposes identical acceleration.

Those are earned by product requirements, correctness evidence and measured workloads while respecting this ADR.
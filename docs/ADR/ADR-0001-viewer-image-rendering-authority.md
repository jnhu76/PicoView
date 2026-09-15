# ADR-0001 — Viewer / Image / Rendering Authority

Status: **ACCEPTED**  
Date: **2026-09-15**  
Scope: PicoView product/image/rendering boundary, resource ownership, graphics backend and presentation semantics

## Context

PicoView has proved that a real local file can be decoded and presented through PocketJS on Windows. That proof also exposed a deeper problem: product semantics, image semantics, resource representation, renderer behavior, presentation policy and physical pixel ownership were not separated strongly enough.

The result was a path where one logical image could be repeatedly materialized across module boundaries, where product code could see PocketJS representation details, and where “can display an image” risked being confused with “faithfully represents the source on the current display.”

This ADR resets the durable architecture around the design settled in the #50 architecture discussion. Earlier PRD/SPEC architecture assumptions are historical inputs only and do not override this decision.

Detailed program semantics live in `docs/ARCHITECTURE.md`.

## Authority model

PicoView no longer uses one total ordering where unrelated documents override each other across domains.

Authority is split by domain:

- **Product authority** — current PRD: user-visible scope, jobs, commands, product promises and non-goals.
- **Architecture authority** — accepted ADRs plus `docs/ARCHITECTURE.md`: ownership, semantic boundaries, resource lifetime, rendering contracts and invariants.
- **Execution authority** — current SPEC: executable behavior that must satisfy both Product and Architecture authority.
- **Operational authority** — `AGENTS.md`, `CONTEXT.md`, `docs/ROADMAP.md`, and GitHub issues: workflow, current phase and task sequencing. These cannot redefine product or architecture semantics.

If Product and Architecture authorities genuinely conflict, implementation stops. The conflict must be resolved by an explicit update to the relevant authorities; lower documents must not pick a winner implicitly.

## Decision

### 1. Three semantic authorities

#### Product semantics — PicoView

PicoView decides what the user means and what logical product state is current:

- Open / CurrentItem / BrowseSession;
- Previous / Next;
- Fit / Actual Size / 100%;
- Zoom / Pan;
- Rotate View / Flip View / Reset View;
- Fullscreen and view-mode policy;
- Refresh / revalidation;
- last-good publication policy;
- product-visible capability and errors.

#### Image semantics — PicoView native

PicoView native decides what an encoded source means as an image:

- product format policy;
- decoder orchestration;
- source dimensions;
- frame/page structure;
- orientation metadata;
- alpha semantics;
- bit depth / precision;
- color description / ICC;
- HDR/source characteristics;
- animation timing/composition semantics;
- source-fidelity requirements.

#### Rendering semantics — PocketJS graphics/runtime

PocketJS owns generic rendering mechanics:

- opaque image-resource identity and lifetime;
- DrawList composition;
- graphics-backend selection;
- backend-native graphics resources;
- sampling / transforms / clipping / blending;
- UI + image composition;
- display adaptation;
- surface lifecycle and presentation;
- software-renderer fallback where required.

**One fact has one authority.** A consumer may use a fact; it must not redefine it.

### 2. Two execution planes

The **CPU control/preparation plane** owns product state, source I/O, decode/image interpretation, UI state/layout/input and DrawList generation.

The **GPU graphics plane** is the primary path for image residency, sampling, view transforms, UI/image composition and presentation.

“UI on CPU” means UI policy/state/layout are CPU-side; it does not require CPU bitmap rasterization. UI and image pixels may both be rasterized/composited by the GPU.

### 3. GPU-first, not GPU-required

On native Windows, graphics-backend selection follows:

1. adapter must be compatible with the target presentation surface;
2. adapter must satisfy required capabilities;
3. among valid choices, prefer low-power operation — normally the iGPU on hybrid systems;
4. otherwise use a compatible discrete GPU;
5. if no usable GPU path exists, software/CPU rendering is the final correctness fallback where the product can still function.

PicoView product/image code must not hard-code Intel/AMD/NVIDIA selection and must not force an iGPU when that would create an invalid or cross-adapter presentation path.

### 4. Backend owns representation and storage

PocketJS core owns **identity, lifetime, revision semantics and draw contracts**.

The selected graphics backend owns the **physical representation and storage** of an admitted image resource.

A native desktop image must not be forced through an unrelated canonical CPU texture representation only because another backend historically uses that representation.

Possible physical representations include wgpu-native textures, WebGPU resources, software bitmaps or platform-specific texture storage. Upper layers see a generic opaque resource identity.

This ADR does **not** require a second `NativeImageHandle`, a parallel compositor or a PicoView-specific DrawList path. Prefer one generic image-resource identity that existing composition can consume.

### 5. QuickJS is bounded control state only

`O(image-bytes)` never crosses QuickJS in the normal viewer path.

TSX/QuickJS may observe bounded semantics such as:

- opaque resource identity;
- display dimensions;
- request/status state;
- view capabilities;
- small metadata;
- bounded product errors.

It must not receive:

- complete encoded files;
- decoded multi-megapixel pixel planes;
- decoder objects;
- raw ICC blobs;
- backend texture objects/formats;
- adapter/device internals.

### 6. Source truth and presentation adaptation are separate

PicoView preserves source information until a transformation is required to interpret the source or adapt it to the target display.

Fit, Zoom, Pan, Rotate View and Flip View are presentation operations by default. They do not mutate the source file and do not require rewriting the entire source pixel plane merely to change the view.

The renderer must not silently reduce resolution, precision, gamut or HDR semantics only to simplify implementation.

When the current display cannot reproduce the source directly, adaptation such as tone mapping is a **presentation operation**, not mutation of source truth.

Whether a release officially promises HDR is a Product-authority decision. The architecture must nevertheless preserve enough semantic information that HDR support does not require violating boundaries later.

### 7. Format support is product policy, not decoder discovery

`decoder can decode X` does not imply `PicoView supports X`.

Official support is defined by the product’s promised behavior across relevant dimensions, including:

- decode;
- orientation;
- alpha;
- color/ICC;
- precision;
- HDR when promised;
- animation;
- multi-page/frame semantics;
- corruption/error behavior;
- resource bounds.

Decoder implementations are replaceable behind the image-semantics boundary.

### 8. Semantic boundaries are not memcpy boundaries

A module boundary is not a reason to duplicate an entire image.

For every `O(image-pixels)` handoff, **ownership transfer or borrowing is the default**. A full pixel-plane copy requires an explicit semantic or physical reason, such as unavoidable conversion, frame composition, color transform, backend layout/alignment requirements or device transfer.

For a canonical static-image fast path, after the decoder has produced the final CPU representation required for resource admission:

- avoidable post-decode CPU full-plane copies = **0**;
- view-state changes do not cause full image re-upload;
- GPU readback does not occur unless a feature explicitly requires it.

This is an architecture invariant, not a deferred micro-optimization.

It does **not** mean one source file can only ever be uploaded once. A deliberately different resource identity — for example a fit proxy versus later full-resolution/tiled admission — may legitimately require another upload.

### 9. Resource identity and generations are distinct

The architecture distinguishes at least:

- `request_generation` — latest-wins product publication ordering;
- `handle_generation` — stale resource-handle protection;
- `content_revision` — changed content under a stable resource identity;
- `device_generation` — graphics-device/resource-domain recreation when applicable.

These must not be collapsed into one generic `generation` field.

For animation, a stable logical resource may advance `content_revision` without inventing a new product request generation or handle generation for every frame.

### 10. Large-image admission remains truthful

A backend/device limit must not silently redefine the image.

If the source cannot be represented as one full-resolution resource, the product/runtime must expose truthful capability, for example:

- full-resolution available;
- fit/proxy-only;
- tiled/virtualized path;
- unsupported on the current backend.

Silent destructive downsampling followed by claiming Actual Size / 100% is forbidden.

### 11. Current code may differ during migration

This ADR is target authority, not a statement that the present implementation already conforms.

Generic runtime/graphics capability is implemented in `jnhu76/pocketjs` first, reviewed there, then PicoView advances `POCKETJS.lock`. PicoView-specific product/image policy remains in PicoView.

Known differentials are tracked explicitly rather than normalized into the architecture document as if they were desired behavior.

## Consequences

- PocketJS may need a generic backend-native image-resource admission seam while preserving one composition/resource identity model.
- Existing PSM/CPU-backed texture paths may remain valid where required; they are not automatically the canonical native-desktop image path.
- View-state changes normally alter draw parameters, not image storage.
- Image decode and rendering can be tested independently through stable contracts.
- CPU rendering is a correctness fallback, not the preferred graphics path.
- New image formats cannot leak codec nouns into TSX, DrawList or generic renderer APIs.
- New full-image copies are architectural events requiring explicit justification.

## Non-decisions

This ADR does not freeze:

- a permanent decoder library;
- exact Rust type names;
- one universal working pixel format;
- which releases advertise HDR;
- the concrete tiled-image algorithm;
- texture/buffer pools;
- prefetch/cache strategy;
- mip generation;
- hardware image decode;
- identical acceleration across all backends.

Those decisions are earned later while preserving this ADR.
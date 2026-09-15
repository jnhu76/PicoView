# ADR-0001 — Viewer / Image / Rendering Authority

Status: **ACCEPTED**  
Date: **2026-09-16**  
Scope: PicoView product/image/rendering boundary, resource ownership, execution placement, graphics backend, presentation, and fallback semantics

## Context

PicoView has proved a real Windows path from local image decode to PocketJS presentation. That proof exposed architectural ambiguity: product semantics, image interpretation, logical resource lifetime, physical graphics residency, renderer behavior, presentation policy, and pixel ownership were not separated strongly enough.

This ADR freezes the durable authority model. Detailed coordinate math, resource lifecycle, render-image admission, and executable invariants live in `docs/ARCHITECTURE.md` and the current SPEC.

## Authority model

PicoView uses domain authority rather than one total document ranking:

- **Product authority** — current PRD: user-visible scope, jobs, commands, promises, and non-goals.
- **Architecture authority** — accepted ADRs plus `docs/ARCHITECTURE.md`: semantic boundaries, ownership, lifetime, rendering contracts, and physical invariants.
- **Execution authority** — current SPEC: executable behavior satisfying both Product and Architecture authority.
- **Operational authority** — `AGENTS.md`, `CONTEXT.md`, `docs/ROADMAP.md`, and GitHub issues: workflow, current state, and sequencing only.

If Product and Architecture authority genuinely conflict, implementation stops until authority is repaired explicitly.

## Decision

### 1. Three semantic authorities

#### Product semantics — PicoView

PicoView owns what the user means and what logical product/view state is current: Open, CurrentItem, BrowseSession, Previous/Next, Fit, Actual Size/100%, Zoom, Pan, Rotate View, Flip View, Reset View, Fullscreen, Refresh/revalidation, last-good policy, product-visible capability, and product-visible errors.

Product owns **view intent**. It decides the requested Fit/Zoom/Pan/Rotate/Flip state; it does not own shader, sampler, matrix, texture, or backend realization.

#### Image semantics — PicoView native

PicoView native owns what an encoded source means as an image: format policy, decoder orchestration, source dimensions, frame/page structure, intrinsic orientation, alpha semantics, bit depth/precision, color description/ICC, HDR/source characteristics, animation timing/composition semantics, and source-fidelity requirements.

Image authority owns **decode meaning and orchestration, not decode execution placement**. A decoder may execute on CPU, GPU, a platform codec, or dedicated hardware as long as the same image-semantic contract is preserved.

When a hardware/GPU decode path can produce a representation directly consumable by the selected graphics backend, preserve fidelity, and avoid unnecessary CPU full-plane materialization or CPU→GPU upload, the architecture permits and prefers that path. Hardware decode is an optimization/capability choice, not a new semantic authority.

#### Rendering semantics — PocketJS

Rendering authority has two sub-roles that must not be conflated:

**PocketJS Core render/resource contract** owns:

- opaque logical image-resource identity;
- logical resource lifetime and stale-handle protection;
- `content_revision` generation and update semantics;
- generic DrawList/image draw contract;
- backend-independent representation/capability contract;
- backend selection policy.

**Graphics Backend realization** owns:

- physical texture/bitmap/resource representation;
- physical residency, cache/eviction, and in-flight leases;
- realization of generic sampling/transforms/clipping/blending;
- display/color adaptation implementation;
- surface lifecycle and final presentation;
- software rendering when that backend is selected.

**One fact has one authority.** A consumer may use a fact; it must not redefine it.

### 2. CPU/GPU are execution placement, not semantic authorities

Do not derive architectural ownership from where instructions happen to execute.

Current control work is normally CPU-side: product state, UI/component state, layout, input, view-state calculation, decoder orchestration, resource requests, and DrawList generation.

The architecture does **not** require:

- image decode to execute on CPU;
- UI pixels to be rasterized on CPU;
- UI pixels to be rasterized on GPU.

Execution may be placed where the selected implementation is most appropriate while preserving authority boundaries and avoiding unnecessary large-data movement.

With the current wgpu backend, UI primitives and image content may be rasterized/composited together on GPU. With a software backend, UI and image content may be rasterized on CPU. A hardware/GPU decoder may feed a GPU-native resource without first materializing a full CPU pixel plane.

### 3. View intent is separate from transform realization

The transform chain has separate owners:

- intrinsic source orientation — **PicoView Image**;
- user Fit/100%/Zoom/Pan/Rotate/Flip intent — **PicoView Product**;
- generic draw parameters / coordinate contract — **PocketJS Core**;
- physical matrix/sampler/shader/raster realization — **Graphics Backend**.

PocketJS must not invent PicoView's Fit/100% policy. PicoView must not own backend transform implementation.

### 4. Image/display rendering is GPU-first, not GPU-required

For native Windows, a GPU graphics backend is the primary rendering path.

GPU adapter selection follows Architecture policy:

1. compatible with the target presentation surface;
2. satisfies required graphics capabilities;
3. among valid choices, prefer low-power operation — normally the iGPU on hybrid systems;
4. otherwise use a compatible discrete GPU;
5. if no viable GPU path exists, a software renderer is the final fallback once that capability is implemented and verified.

PicoView Product/Image code must not hard-code Intel/AMD/NVIDIA selection and must not force an iGPU when that would create an invalid or harmful cross-adapter path.

The target architecture is GPU-first/not-GPU-required. The current implementation may remain operationally GPU-required until software presentation exists; documentation must not claim otherwise.

### 5. Backend owns physical representation; Core owns logical resource truth

PocketJS Core owns logical identity/lifetime/revision/draw contracts. The active backend owns physical representation, residency, storage, and in-flight use.

A native desktop image must not be forced through an unrelated canonical CPU texture representation only because another backend historically uses that representation.

Possible physical representations include wgpu-native textures, WebGPU resources, software bitmaps, platform video/image surfaces, or other backend-native storage. Upper layers see one generic opaque logical resource identity.

This ADR does **not** require a second `NativeImageHandle`, parallel compositor, or PicoView-specific DrawList path.

### 6. The image-to-rendering boundary is representation-aware, codec-transparent

PocketJS is **codec-transparent, not pixel-representation-blind**.

The Image→PocketJS admission boundary must carry enough generic semantic description for correct rendering — representation/precision, alpha semantics, color semantics, extent/layout, and any intrinsic transform not materialized into storage — without carrying JPEG/PNG/WIC/GIF-specific nouns.

`content_revision` is **not supplied as image truth by PicoView**. PocketJS Core owns it: initial admission assigns the logical resource's revision state, and a committed content update advances it. PicoView may have codec/frame sequence numbers internally, but they are not PocketJS `content_revision`.

### 7. Publication, logical lifetime, and physical residency are different authorities

Do not use one state machine as if Product, PocketJS Core, and the backend owned the same lifetime fact.

- **Product** owns publication state and release intent: candidate/current/last-good/replacement semantics.
- **PocketJS Core** owns admitted logical-resource lifetime, opaque handles, stale-handle safety, revision state, and when a logically released resource may cease to exist.
- **Graphics Backend** owns physical residency, eviction/recreation, in-flight rendering leases, and final physical destruction.

Product may request release; it does not directly destroy a backend texture. Final physical destruction waits until backend/in-flight use is safe.

A replacement must not destroy last-good publication before replacement policy says the candidate is ready to publish.

### 8. QuickJS is bounded control state only

`O(image-bytes)` never crosses QuickJS in the normal viewer path.

TSX/QuickJS may observe bounded semantics such as opaque resource identity, logical/display dimensions, request/status state, view capability, small metadata, and bounded product errors.

It must not receive complete encoded files, decoded multi-megapixel pixel planes, decoder objects, raw GPU resources, backend texture formats, or adapter/device internals.

### 9. Source truth and presentation adaptation are separate

PicoView preserves source information until a transformation is required to interpret the source or adapt it to the target display.

Intrinsic source orientation is Image truth. Fit/100%/Zoom/Pan/user Rotate/Flip are Product view intent. Display/color conversion is rendering adaptation.

The renderer must not silently reduce resolution, precision, gamut, or HDR semantics solely to simplify implementation. When the current output cannot reproduce the source directly, adaptation such as tone mapping is presentation behavior, not mutation of source truth.

Color/HDR authority is split explicitly:

- Image provides source color/HDR truth;
- PocketJS Core carries a generic representation/adaptation contract;
- Graphics Backend reports output capability and physically realizes the required conversion/presentation.

### 10. Coordinate semantics are explicit

The architecture distinguishes source sample space, intrinsically oriented logical-image space, user view transform, UI logical/DIP space, and physical presentation pixels.

The transform order is normative:

```text
source sample grid
→ intrinsic source orientation          (Image)
→ logical image space
→ user rotate/flip + Fit/Zoom/Pan      (Product intent)
→ generic draw geometry                 (PocketJS Core contract)
→ UI logical-to-physical output transform
→ backend realization/presentation      (Graphics Backend)
```

Reset View clears user-controlled transforms; it never clears intrinsic source orientation.

Actual Size / 100% is defined by the detailed Architecture contract, not by raw UI DIP dimensions.

### 11. Semantic boundaries are not memcpy boundaries

A module boundary is not a reason to duplicate an entire image.

For every `O(image-pixels)` handoff, ownership transfer or borrowing is the default. A full pixel-plane copy requires an explicit semantic or physical reason.

For a CPU-decoded static fast path whose output is already accepted by resource admission:

- avoidable post-decode CPU full-plane copies are zero;
- view-state changes do not cause redundant full-image upload;
- GPU readback does not occur unless an explicit feature requires it.

A more direct accelerator path may have **no full CPU pixel plane at all**:

```text
encoded source
→ hardware/GPU decode
→ backend-consumable/native resource
→ logical PocketJS resource
→ render
```

The goal is not "always decode on GPU"; it is to preserve semantics while minimizing unnecessary O(N pixels) materialization and transfer.

The same principle applies more weakly to large encoded payloads: avoid unnecessary whole-file duplication when streaming, move, or borrow is sufficient.

### 12. Upload invariants are residency-aware

The architecture does **not** require “one upload forever,” and does not require an upload when a decode/import path already produces suitable backend-native residency.

For the same logical resource identity, PocketJS-owned `content_revision`, and device generation, an existing valid backend residency must be reused. A redundant re-upload while that residency is still valid is forbidden.

A new upload/import is legitimate after an explicit event such as first residency creation, committed content update, backend eviction/residency loss, device recreation, a deliberately distinct proxy/full-resolution resource, or another named correctness requirement.

Backend residency/eviction is not product generation.

### 13. Resource identity and generations are distinct

The architecture distinguishes at least:

- `request_generation` — Product latest-wins publication ordering;
- `handle_generation` — PocketJS stale resource-handle protection;
- `content_revision` — PocketJS-owned changed-content revision under a stable logical resource identity;
- `device_generation` — backend/device recreation domain when applicable.

These concepts must not be collapsed into one generic generation counter.

### 14. Format support is product policy, not decoder discovery

`decoder can decode X` does not imply `PicoView supports X`.

Official support is defined by the product promise across relevant dimensions such as decode, orientation, alpha, color/ICC, precision, HDR, animation, multi-frame/page semantics, corruption behavior, and resource/full-resolution behavior.

Decoder implementations and execution locations are replaceable behind Image authority.

### 15. Large-image admission remains truthful

A backend/device limit must not silently redefine the image.

If the source cannot be represented as one full-resolution resource, the product/runtime exposes truthful capability such as full-resolution available, fit/proxy-only, tiled/virtualized, or unsupported on the current path.

Silent destructive downsampling followed by claiming Actual Size / 100% is forbidden.

### 16. Current code may differ during migration

This ADR is target authority, not a statement that current code already conforms.

Generic runtime/graphics capability is implemented in `jnhu76/pocketjs` first, reviewed there, then PicoView advances `POCKETJS.lock`. PicoView-specific Product/Image policy remains in PicoView.

Known differentials are tracked explicitly rather than normalized into the target architecture.

## Consequences

- PocketJS may need generic backend-native image admission/import while preserving one logical resource/composition identity model.
- Existing PSM/CPU-backed texture paths may remain valid for workloads/backends that need them; they are not automatically the canonical native-desktop image path.
- Hardware/GPU decode is permitted when it reduces unnecessary CPU materialization/transfer without leaking backend semantics into Product/Image contracts.
- UI state/layout remain CPU-side even when the active graphics backend rasterizes UI on GPU.
- Product view changes normally alter generic draw intent, not image storage.
- CPU software rendering is a target correctness fallback, not the preferred graphics path and not a current capability claim until implemented.
- New formats cannot leak codec nouns into TSX, DrawList, or generic renderer APIs.
- New full-image copies/uploads are architectural events requiring explicit justification.

## Non-decisions

This ADR does not freeze a permanent decoder library, decoder execution unit, exact Rust type names, one universal working pixel format, a specific HDR product promise, a tiled-image algorithm, texture/buffer pools, prefetch/cache strategy, mip generation, a specific hardware-decode API, or identical acceleration across all backends.

Those decisions are earned later while preserving this ADR.
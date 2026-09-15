# ADR-0001 — Viewer / Image / Rendering Authority

Status: **ACCEPTED**  
Date: **2026-09-16**  
Scope: PicoView product/image/rendering boundary, resource ownership, graphics backend, presentation, and fallback semantics

## Context

PicoView has proved a real Windows path from local image decode to PocketJS presentation. That proof also exposed architectural ambiguity: product semantics, image semantics, resource representation, renderer behavior, presentation policy, and physical pixel ownership were not separated strongly enough.

The result was a path where one logical image could be repeatedly materialized across module boundaries, where PicoView could see PocketJS representation details, and where “can display an image” risked being confused with “faithfully represents the source on the current display.”

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

PicoView owns what the user means and what logical product state is current: Open, CurrentItem, BrowseSession, Previous/Next, Fit, Actual Size/100%, Zoom, Pan, Rotate View, Flip View, Reset View, Fullscreen, Refresh/revalidation, last-good policy, product-visible capability, and product-visible errors.

#### Image semantics — PicoView native

PicoView native owns what an encoded source means as an image: format policy, decoder orchestration, source dimensions, frame/page structure, intrinsic orientation, alpha semantics, bit depth/precision, color description/ICC, HDR/source characteristics, animation timing/composition semantics, and source-fidelity requirements.

#### Rendering semantics — PocketJS graphics/runtime

PocketJS owns generic rendering mechanics: opaque image-resource identity/lifetime, DrawList/image draw contract, backend selection, backend-native physical resources, sampling, transforms, clipping, blending, display adaptation, surface lifecycle, presentation, and software fallback where provided.

**One fact has one authority.** A consumer may use a fact; it must not redefine it.

### 2. CPU control is mandatory; UI raster location is not a semantic rule

The CPU control/preparation plane owns product state, source I/O, decode/image interpretation, UI state/layout/input, view-state calculation, and DrawList generation.

The architecture does **not** require UI pixels to be rasterized on the CPU, and it does **not** require UI pixels to be rasterized on the GPU.

UI rasterization/composition is a graphics-backend implementation choice:

- with the current wgpu backend, UI primitives and image content may be rasterized/composited together on the GPU;
- with a software backend, UI and image content may be rasterized/composited on the CPU.

The important boundary is semantic: **UI policy/layout live in CPU-side control state; final pixel production belongs to the selected graphics backend.**

PicoView must not create a separate CPU UI bitmap pipeline merely because UI semantics are CPU-side.

### 3. Image/display rendering is GPU-first, not GPU-required

For native Windows, a GPU backend is the primary rendering path for image residency, sampling, transforms, display adaptation, and presentation.

GPU adapter selection follows architecture policy:

1. compatible with the target presentation surface;
2. satisfies required graphics capabilities;
3. among valid choices, prefer low-power operation — normally the iGPU on hybrid systems;
4. otherwise use a compatible discrete GPU;
5. if no viable GPU path exists, a software renderer is the final fallback once that capability is implemented and verified.

PicoView product/image code must not hard-code Intel/AMD/NVIDIA selection and must not force an iGPU when that would create an invalid or harmful cross-adapter path.

The target architecture is GPU-first/not-GPU-required. The current implementation may still be operationally GPU-required until software presentation exists; documentation must not claim otherwise.

### 4. Backend owns representation and storage

PocketJS core owns **identity, lifetime, stale-handle protection, content revision, and draw contracts**.

The selected graphics backend owns the **physical representation, residency, and storage** of an admitted image resource.

A native desktop image must not be forced through an unrelated canonical CPU texture representation only because another backend historically uses that representation.

Possible physical representations include wgpu-native textures, WebGPU resources, software bitmaps, or platform-specific storage. Upper layers see one generic opaque resource identity.

This ADR does **not** require a second `NativeImageHandle`, parallel compositor, or PicoView-specific DrawList path.

### 5. The image-to-rendering boundary is representation-aware, codec-transparent

PocketJS is **codec-transparent, not pixel-representation-blind**.

The image/rendering boundary must carry enough generic semantic description for correct rendering — including representation/precision, alpha semantics, color semantics, extent/layout, and any intrinsic transform not materialized into storage — without carrying JPEG/PNG/WIC/GIF-specific nouns.

The exact Rust type is not frozen by this ADR; the detailed contract is defined in `docs/ARCHITECTURE.md`.

### 6. QuickJS is bounded control state only

`O(image-bytes)` never crosses QuickJS in the normal viewer path.

TSX/QuickJS may observe bounded semantics such as opaque resource identity, logical/display dimensions, request/status state, view capability, small metadata, and bounded product errors.

It must not receive complete encoded files, decoded multi-megapixel pixel planes, decoder objects, raw GPU resources, backend texture formats, or adapter/device internals.

### 7. Source truth and presentation adaptation are separate

PicoView preserves source information until a transformation is required to interpret the source or adapt it to the target display.

Intrinsic source orientation is part of image interpretation. Fit, Zoom, Pan, user Rotate View, and user Flip View are presentation operations by default.

The renderer must not silently reduce resolution, precision, gamut, or HDR semantics solely to simplify implementation. When the current output cannot reproduce the source directly, adaptation such as tone mapping is presentation behavior, not mutation of source truth.

### 8. Coordinate semantics are explicit

The architecture must distinguish source sample space, intrinsically oriented logical-image space, user view transform, UI logical/DIP space, and physical presentation pixels.

The transform order is normative:

```text
source sample grid
→ intrinsic source orientation
→ logical image space
→ user rotate/flip
→ Fit / Zoom / Pan
→ UI logical-to-physical output transform
→ presentation
```

Reset View clears user-controlled transforms; it never clears intrinsic source orientation.

Actual Size / 100% is defined by the detailed Architecture contract, not by raw UI DIP dimensions.

### 9. Semantic boundaries are not memcpy boundaries

A module boundary is not a reason to duplicate an entire image.

For every `O(image-pixels)` handoff, ownership transfer or borrowing is the default. A full pixel-plane copy requires an explicit semantic or physical reason.

For a canonical static-image fast path, after decode has produced a representation accepted by resource admission:

- avoidable post-decode CPU full-plane copies are zero;
- view-state changes do not cause redundant full-image upload;
- GPU readback does not occur unless an explicit feature requires it.

The same principle applies more weakly to large encoded payloads: avoid unnecessary whole-file duplication when streaming, move, or borrow is sufficient.

### 10. Upload invariants are residency-aware

The architecture does **not** require “one upload forever.”

For the same logical resource identity, content revision, and device generation, an existing valid backend residency must be reused. A redundant re-upload while that residency is still valid is forbidden.

A new upload is legitimate after an explicit event such as first admission, content revision, backend eviction/residency loss, device recreation, a deliberately distinct proxy/full-resolution resource, or another named correctness requirement.

Backend residency/eviction is not product generation.

### 11. Resource identity, publication, and lifetime are distinct

The architecture distinguishes at least:

- `request_generation` — latest-wins product publication ordering;
- `handle_generation` — stale resource-handle protection;
- `content_revision` — changed content under a stable logical resource identity;
- `device_generation` — graphics device/resource-domain recreation when applicable.

A generic resource lifecycle also separates candidate creation, admission, publication, retirement, and final release. TSX holds only a non-owning opaque identity.

A replacement resource must not destroy a last-good published resource before replacement policy says the candidate is ready to publish.

### 12. Format support is product policy, not decoder discovery

`decoder can decode X` does not imply `PicoView supports X`.

Official support is defined by the product promise across relevant dimensions such as decode, orientation, alpha, color/ICC, precision, HDR, animation, multi-frame/page semantics, corruption behavior, and resource/full-resolution behavior.

Decoder implementations are replaceable behind the image-semantics boundary.

### 13. Large-image admission remains truthful

A backend/device limit must not silently redefine the image.

If the source cannot be represented as one full-resolution resource, the product/runtime exposes truthful capability such as full-resolution available, fit/proxy-only, tiled/virtualized, or unsupported on the current path.

Silent destructive downsampling followed by claiming Actual Size / 100% is forbidden.

### 14. Current code may differ during migration

This ADR is target authority, not a statement that current code already conforms.

Generic runtime/graphics capability is implemented in `jnhu76/pocketjs` first, reviewed there, then PicoView advances `POCKETJS.lock`. PicoView-specific product/image policy remains in PicoView.

Known differentials are tracked explicitly rather than normalized into the target architecture.

## Consequences

- PocketJS may need generic backend-native image admission while preserving one composition/resource identity model.
- Existing PSM/CPU-backed texture paths may remain valid for workloads/backends that need them; they are not automatically the canonical native-desktop image path.
- UI state/layout remain CPU-side even when the active graphics backend rasterizes UI on GPU.
- View-state changes normally alter draw parameters, not image storage.
- CPU software rendering is a target correctness fallback, not the preferred graphics path and not a current capability claim until implemented.
- New formats cannot leak codec nouns into TSX, DrawList, or generic renderer APIs.
- New full-image copies/uploads are architectural events requiring explicit justification.

## Non-decisions

This ADR does not freeze a permanent decoder library, exact Rust type names, one universal working pixel format, a specific HDR product promise, a tiled-image algorithm, texture/buffer pools, prefetch/cache strategy, mip generation, hardware decode, or identical acceleration across all backends.

Those decisions are earned later while preserving this ADR.
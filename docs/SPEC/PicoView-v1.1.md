# PicoView v1.1 Spec — Product / Image / Rendering Contract

Status: **CURRENT EXECUTION SPEC**  
Date: **2026-09-16**

This SPEC must satisfy both:

- Product authority: `docs/PRD/PicoView-PRD-v0.6.md`;
- Architecture authority: accepted ADRs and `docs/ARCHITECTURE.md`.

It may narrow an implementation slice but may not redefine either domain.

Superseded PRD/SPEC are archived under `docs/history/authority-reset-20260915/`.

---

## 1. Required boundary split

Implementation must preserve these authorities:

### Product / PicoView

Owns Open, CurrentItem, BrowseSession, Previous/Next, Fit, 100%, Zoom, Pan, user Rotate/Flip, Refresh, capability, and Product errors.

Product owns **view intent**, not physical transform implementation.

### Image / PicoView native

Owns format policy, decoder orchestration, intrinsic orientation, source dimensions, alpha, precision, color/ICC, HDR/source characteristics, animation/frame/page semantics, and source-fidelity requirements.

Image owns **decode semantics and orchestration**, not a requirement that decode executes on CPU.

### PocketJS Core

Owns opaque logical resource identity/lifetime, stale-handle protection, `content_revision`, generic render-image admission/update contract, DrawList/image draw contract, and backend-independent capabilities.

### Graphics Backend

Owns physical image representation/residency, upload/import/eviction, in-flight rendering leases, physical sampler/matrix/shader realization, display adaptation, surface lifecycle, and final presentation.

No ticket may be closed by leaking one authority into another.

---

## 2. CPU/GPU execution placement contract

CPU and GPU are execution locations, not semantic authorities.

Normally CPU-side control includes Product state, UI/component state, layout/input, view-state calculation, decoder orchestration, resource requests, and DrawList generation.

The spec does **not** require:

- image decode to execute on CPU;
- UI pixels to be CPU-rasterized;
- UI pixels to be GPU-rasterized.

A GPU backend may rasterize UI + image together. A software backend may rasterize both on CPU.

A hardware/GPU/platform decoder may execute image decode if it preserves the same Image semantic contract.

When a decoder can produce backend-native/importable image storage and thereby avoid unnecessary full CPU pixel-plane materialization or CPU→GPU transfer, that path is allowed and preferred **only when the physical path is actually better**, including interop and cross-adapter cost.

Do not call an accelerator path “zero-copy” without accounting for hidden staging, format conversion, interop, and cross-adapter copies.

---

## 3. Coordinate and transform authority contract

Implementation must preserve these spaces:

- source sample space `S`;
- intrinsically oriented logical image space `O`;
- user-transformed image space `U`;
- UI logical/DIP viewport space `L`;
- physical presentation pixel space `P`.

Order:

```text
S --intrinsic orientation--> O          [Image]
O --user rotate/flip-------> U          [Product intent]
U --Fit/Zoom/Pan-----------> L          [Product intent / generic draw geometry]
L --DPI/output scale-------> P          [runtime/output fact]
P --raster/present---------> Display    [Backend]
```

PocketJS must not invent PicoView Fit/100% policy. PicoView must not own backend sampler/matrix/shader realization.

Reset View clears user-controlled view state but does not clear intrinsic source orientation.

### 100% / Actual Size

At 100%:

```text
1 logical image sample = 1 physical presentation pixel in scale
```

If `d = physical_pixels_per_UI_logical_unit`:

```text
UI_logical_units_per_image_sample = 1 / d
```

Do not draw `image_width DIP` and then allow DPI scaling to redefine 100%.

A reduced proxy must never be reported as true 100%.

### Fit

Fit uses the complete post-intrinsic/post-user-transform logical image bounds and available physical viewport while preserving aspect ratio.

### Zoom / Pan / Rotate / Flip

These are bounded Product view intent by default. They must not cause decode restart, full-image CPU resample, resource recreation, or full upload merely because the view changed.

---

## 4. QuickJS contract

QuickJS carries bounded semantic/control state only.

Allowed examples include opaque logical resource identity, oriented/logical dimensions, loading/status, request generation, view capability, Zoom/Pan state, bounded metadata, and bounded Product errors.

Forbidden normal-path payloads include full encoded files, decoded multi-megapixel pixel planes, giant ArrayBuffer/base64 equivalents, decoder-specific objects, and backend texture/device/import handles.

`O(image-bytes)` crossing QuickJS is a stop-the-line failure.

---

## 5. Image decode and semantic contract

Decoder provider and execution location may vary, but Image authority must preserve every fact still required for correct interpretation/presentation.

Do not flatten every format into an unconditional universal `RGBA8 sRGB` Product contract.

The Image side must be able to provide, when relevant:

- source/storage extent;
- intrinsic orientation;
- pixel representation and precision;
- owned/borrowed CPU storage **or** a generic importable/native decode result behind the admission contract;
- alpha semantics;
- color/profile semantics;
- HDR/source characteristics;
- frame/page structure;
- animation timing/composition facts.

Decoder-specific nouns stop at Image authority.

Replacement test:

```text
WIC CPU decode → another CPU decoder / hardware decode / accelerator provider
```

must not require rewriting Product view semantics or generic DrawList semantics.

---

## 6. Generic render-image admission/update contract

PocketJS must expose one generic logical image-resource model consumable by existing composition.

The generic semantic description must be able to represent at least:

```text
storage_extent
logical_extent
row_stride / plane layout as required
pixel_encoding + precision
alpha_representation
color_encoding / profile semantics
intrinsic_transform if not materialized
```

Exact Rust type names are not frozen.

### Revision ownership

`content_revision` is **not** supplied by PicoView/Image as source truth.

- initial admission establishes PocketJS Core revision state;
- Product/Image requests a content update;
- PocketJS Core advances `content_revision` when the update commits;
- codec/frame sequence numbers may exist internally but are not PocketJS `content_revision`.

### CPU-storage ingress

```text
owned/borrowed CPU storage + generic description
→ PocketJS admission
→ opaque logical resource
```

### Native/importable ingress

```text
accelerator/platform decode result + generic image semantics
→ generic import/admission
→ the same opaque logical resource model
```

Do not add a second public `NativeImageHandle`/compositor solely for accelerator decode.

Backend/platform physical handles remain below the generic boundary.

### Alpha

Admitted alpha representation and backend blend realization must agree. A renderer must not apply a fixed blend interpretation to unknown alpha semantics.

### Color/HDR

Image provides source color/HDR truth. Core carries generic representation/adaptation requirements. Backend reports output capability and physically performs required conversion/presentation.

### Intrinsic orientation

If source orientation is not materialized into storage, its generic logical mapping must survive admission/draw.

---

## 7. Product publication vs Core lifetime vs Backend residency

Do not collapse these into one state machine.

### Product publication

Product decides candidate/current/last-good/replacement state and emits create/update/release intent.

### PocketJS Core logical resource

Core owns admitted logical-resource lifetime, opaque handles, stale-handle protection, logical release, and `content_revision`.

QuickJS/TSX holds only a non-owning opaque identity.

### Backend physical residency

Backend owns physical texture/bitmap residency, eviction/recreation, in-flight rendering leases, and final physical destruction.

A Product release request does not directly destroy a backend texture.

Final physical destruction waits until no in-flight work can dereference the storage.

### Refresh / last-good

For refresh of an already published item:

```text
old Product publication remains current
→ candidate decode/import/admission succeeds
→ Product publication swap commits
→ Product releases old logical resource
→ Core retires when safe
→ Backend destroys when safe
```

If candidate decode/admission fails, last-good remains published when Product policy requires it.

Do not release/destroy last-good before replacement admission succeeds.

Navigation to a new bad item may deliberately use different Product policy.

---

## 8. Full-image copy and encoded-source movement contract

For every `O(image-pixels)` handoff, move/borrow/transfer/import is the default.

A full-plane copy requires a named reason such as unavoidable pixel-format conversion, color transform, alpha conversion, frame composition, orientation materialization, backend row/layout conversion, device transfer, or explicit readback/export.

### CPU-decoded fast path

For a static image whose CPU decode output is already accepted:

- avoidable post-decode CPU full-plane copies = **0**;
- GPU→CPU readback = **0** unless an explicit feature requires it;
- view/UI changes do not themselves create new image content/admission.

### Accelerator-direct path

Where supported and beneficial:

```text
encoded source
→ accelerator decode
→ backend-native/importable image
→ PocketJS logical admission
→ render
```

may legitimately have no full CPU pixel plane and no CPU→GPU image upload.

Large encoded payloads should also avoid unnecessary whole-file duplication where streaming, move, mapped access, or bounded buffering is sufficient. Streaming is not mandatory; unexplained repeated whole-file copies are not acceptable.

---

## 9. Residency-aware upload/import contract

Do not encode “one upload forever.”

For the same:

```text
logical resource identity
+ PocketJS content_revision
+ device_generation
```

an existing valid backend residency must be reused.

A new full upload/import is legitimate after a named event such as first residency creation/import, committed content update, explicit eviction/residency loss, device recreation, deliberately different proxy/full-resolution/tiled admission, or required representation conversion.

While valid residency exists, these events alone must **not** cause redundant full upload/import:

- Zoom;
- Pan;
- Fit;
- Actual Size toggle;
- window resize;
- DPI move;
- UI rerender;
- presentation-only user Rotate/Flip.

Backend eviction/residency state is not Product generation.

---

## 10. Generation and revision ownership

Keep distinct:

- `request_generation` — **Product**, latest-wins publication ordering;
- `handle_generation` — **PocketJS Core**, stale-handle protection;
- `content_revision` — **PocketJS Core**, committed content change under stable logical identity;
- `device_generation` — **graphics runtime/backend**, device/resource-domain recreation.

A stale request generation must never publish over a newer request.

PicoView Product/Image code must not assign or increment PocketJS `content_revision` directly.

Animation should normally preserve Product request generation and logical handle while committed generic content updates advance PocketJS `content_revision`.

Backend-private residency epochs may exist but must not leak as another Product/Core generation.

---

## 11. Resource facts vs draw facts

Resource facts include logical identity, storage/logical extent, representation/precision, alpha/color semantics, intrinsic mapping, and Core-owned revision state.

Draw facts include source rect/UV, destination geometry, Product view transform, sampling intent, opacity, and clip.

PocketJS Core carries generic draw facts. Backend creates physical sampler/matrix/shader state.

The same resource may be drawn with different sampling/view policy without resource recreation.

---

## 12. Backend and fallback contract

### GPU selection

On native Windows, GPU selection follows:

1. target-surface compatibility;
2. required capabilities;
3. low-power preference among valid adapters;
4. compatible discrete GPU fallback.

Avoid harmful cross-adapter movement merely to force a nominal iGPU preference.

The same rule applies to accelerator decode: do not choose a nominal hardware path if interop/cross-adapter transfer makes it worse than an alternative.

PicoView Product/Image code must not select a vendor adapter directly.

### Software fallback

Before PicoView may claim **GPU not required**, a verified software path must provide at least:

- usable Product UI;
- ordinary SDR image display;
- Fit / 100% / Zoom / Pan;
- supported intrinsic orientation and alpha semantics;
- truthful errors/capabilities.

Advanced color/HDR/performance may be unavailable.

Until that path exists, the current implementation is operationally GPU-required even though the target architecture is GPU-first/not-GPU-required.

Startup fallback and seamless mid-session GPU-device-loss migration are separate features.

---

## 13. Rendering fidelity

Rendering must preserve source meaning as far as the active backend/output capability allows.

Forbidden silent behavior:

- destructive downsample then claim Actual Size;
- unnecessary precision/gamut loss solely for API convenience;
- implicit HDR→SDR redefinition of source truth;
- wrong alpha interpretation/blend state;
- source mutation for view commands.

Display adaptation is allowed when the target output cannot reproduce source characteristics directly.

---

## 14. Format-support contract

A format is not Product-supported solely because an active decoder opens it.

The format matrix must assess relevant dimensions: decode, intrinsic orientation, alpha, color/ICC, precision, HDR, animation, frame/page behavior, corrupt-input behavior, and large-image/full-resolution behavior.

Adding a codec must not require TSX image primitives or generic renderer codec branches unless the existing generic contract is proven insufficient.

---

## 15. Error domains

Internal errors preserve origin at least across:

- Source;
- Decode provider/execution;
- Image semantic/interpretation;
- Resource admission/import/update;
- Rendering;
- Presentation.

They map at the Product boundary into bounded user-visible states.

A resource/import failure must not be mislabeled as a decoder failure, and an accelerator-import failure must not redefine source-format truth.

---

## 16. CurrentItem contract

CurrentItem may coordinate Product publication and reference an opaque logical resource.

It may own/reference source identity, `request_generation`, status, logical display geometry, published resource identity, Product capability, last-good publication, and bounded error.

It must not own decoder implementation, color-management implementation, PocketJS `content_revision`, GPU adapter/device, backend texture/import representation, surface/presentation, DrawList rendering, directory enumeration, or TSX layout/input machinery.

---

## 17. Acceptance replacements

Architecture boundaries are healthy when:

- CPU WIC decode → another CPU decoder / hardware decoder / accelerator provider does not rewrite Product/DrawList semantics;
- JPEG → AVIF/another admitted format does not add codec branches to generic rendering;
- Fit/100%/Zoom/Rotate changes Product view intent, not image content/resource identity by default;
- wgpu backend → another GPU/backend implementation does not rewrite Product/Image semantics;
- compatible iGPU → compatible dGPU does not change Product semantics;
- GPU startup unavailable → verified software backend preserves basic truthful viewing;
- static → animated resource keeps codec-specific disposal in Image and advances Core-owned `content_revision` only on committed generic content updates.

---

## 18. Stop-the-line conditions

Stop implementation if any of these appear:

- image bytes cross QuickJS;
- one logical image is copied wholesale at a semantic boundary without a named reason;
- PicoView Product/Image code imports backend texture/device/import semantics;
- generic renderer branches on JPEG/PNG/GIF/PicoView nouns;
- CPU/GPU execution placement is used to redefine semantic authority;
- PocketJS invents PicoView Fit/100% policy;
- Product/Image code sets PocketJS `content_revision` directly;
- Product publication state is conflated with Core logical lifetime or Backend residency;
- Product directly destroys backend physical storage;
- 100% is claimed from a reduced proxy or DPI-scaled incorrectly;
- user Reset View removes intrinsic orientation;
- alpha/color representation is undefined at resource admission;
- last-good Product publication is destroyed before candidate admission succeeds;
- view/UI state causes redundant full upload/import while valid residency exists;
- stale request generation can publish;
- request/handle/content/device generation concepts are conflated;
- Product and Architecture authority contradict each other.

Resolve authority/design first; do not hide the conflict in implementation.

---

## 19. Historical authority

Superseded current-authority snapshots live under:

`docs/history/authority-reset-20260915/`

They are history/evidence only and do not govern current implementation.
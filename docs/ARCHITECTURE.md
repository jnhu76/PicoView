# PicoView Architecture — Viewer / Image / Rendering Semantics

Status: **CURRENT ARCHITECTURE AUTHORITY**  
Date: **2026-09-15**  
Decision: `docs/ADR/ADR-0001-viewer-image-rendering-authority.md`

This document defines PicoView's target architecture and program semantics. It is not a description of every current implementation detail.

The previous `ARCHITECTURE.md` and the architecture assumptions embedded in older PRD/SPEC revisions are superseded where they conflict with ADR-0001 and this document.

---

## 0. Authority model

PicoView uses **domain authority**, not one total document ranking.

### Product authority

`docs/PRD/PicoView-PRD-v0.6.md`

Owns user-visible jobs, commands, promises and non-goals.

### Architecture authority

1. accepted ADRs in `docs/ADR/`;
2. this document.

Owns module boundaries, program semantics, ownership, lifetime, rendering contracts and hard invariants.

### Execution authority

`docs/SPEC/PicoView-v1.1.md`

Turns Product + Architecture authority into executable contracts. It may narrow a slice; it may not redefine either authority.

### Operational authority

`AGENTS.md`, `CONTEXT.md`, `docs/ROADMAP.md`, GitHub issues.

Own workflow/current state/sequencing only.

If Product and Architecture authorities genuinely conflict, **stop implementation and repair authority**. Lower documents must not silently choose a winner.

`POCKETJS.lock` remains the source-identity authority for the PocketJS revision actually consumed.

---

# 1. Core model: three semantic authorities

PicoView is easiest to reason about by asking three different questions.

## 1.1 Product semantics — PicoView

> **What did the user ask for, and what logical image/view state is current?**

PicoView owns:

- Open;
- CurrentItem;
- BrowseSession;
- Previous / Next;
- Fit;
- Actual Size / 100%;
- Zoom / Pan;
- Rotate View / Flip View / Reset View;
- Fullscreen;
- Refresh / revalidation;
- last-good publication policy;
- product-visible capabilities;
- product-visible errors.

These are product facts. PocketJS may carry/render them but must not redefine them.

## 1.2 Image semantics — PicoView native

> **What does this encoded source actually mean as an image?**

PicoView native owns:

- product format policy;
- source I/O and decoder orchestration;
- source dimensions;
- frame/page structure;
- orientation metadata;
- alpha semantics;
- bit depth / precision;
- color description / ICC;
- HDR/source characteristics;
- animation timing/composition semantics;
- source-fidelity requirements;
- decoder-specific errors before product mapping.

Decoder implementation is replaceable behind this authority.

## 1.3 Rendering semantics — PocketJS graphics/runtime

> **Given a logical image resource and view intent, how is it rendered and presented on the current backend/display?**

PocketJS owns:

- generic image-resource identity/lifetime;
- resource revision semantics;
- DrawList/image draw contract;
- graphics-backend selection;
- backend-native resource storage;
- GPU upload/residency;
- sampling;
- transforms;
- clipping;
- blending;
- UI + image composition;
- display adaptation;
- surface lifecycle;
- presentation;
- software-renderer fallback when needed.

### Fundamental rule

> **One fact has one authority.**

A downstream layer may consume a fact. It may not create a competing meaning for that fact.

---

# 2. Physical model: two execution planes

The semantic model executes over two major physical planes.

## 2.1 CPU control / image-preparation plane

CPU-side work includes:

- PicoView product state;
- source access;
- decode and image interpretation;
- metadata interpretation required for correct presentation;
- PocketJS component tree;
- layout;
- input/focus/gesture handling;
- zoom/pan/view-state calculation;
- DrawList generation.

## 2.2 GPU graphics plane

When an eligible GPU backend is available, GPU-side work includes:

- backend-native image residency;
- sampling/scaling;
- zoom/pan transforms;
- rotate/flip presentation transforms;
- clipping/blending;
- UI raster/composition;
- image composition;
- display adaptation / tone mapping where required;
- final presentation.

“UI runs on CPU” means **UI state/policy/layout** are CPU-side. It does not mean PicoView must rasterize UI to a CPU bitmap.

PicoView is **GPU-first, not GPU-required**.

---

# 3. Canonical end-to-end data flow

```text
Local Encoded Source
        │
        ▼
PicoView Source / Decode
        │
        ▼
PicoView Image Semantics
        │
        │ owned pixels/resource + semantic description
        │ move/borrow by default
        ▼
PocketJS Generic Image Admission
        │
        ▼
Opaque Image Resource Identity
        │
        ├──────────────► TSX sees bounded semantic state only
        │
        ▼
PocketJS DrawList
        │
        ▼
Selected Graphics Backend
        │
        ├─ wgpu-native GPU resource
        ├─ WebGPU resource where applicable
        └─ software bitmap fallback
        │
        ▼
UI + Image Composition
        │
        ▼
Presentation Surface
        │
        ▼
Display
```

**Semantic boundary != allocation boundary != memcpy boundary.**

A clean module split does not imply each module receives its own copy of a 100 MiB image.

---

# 4. Product-view program semantics

## 4.1 Fit

Fit:

- preserves logical image aspect ratio;
- maps the complete logical image inside the image viewport;
- is a presentation transform;
- does not mutate source pixels merely to satisfy the view.

A decoder-scaled Fit proxy may exist as an explicitly different admitted resource when useful, but it must remain distinguishable from true full-resolution capability.

## 4.2 Actual Size / 100%

100% means truthful native logical-image-pixel inspection.

The system must distinguish:

- image coordinates;
- UI logical/DIP coordinates;
- physical client/display pixels;
- monitor DPI / output scale.

A reduced proxy cannot be called 100%.

If the current backend/resource cannot provide true full-resolution viewing, the product exposes a capability such as `actualSizeAvailable = false` instead of lying.

## 4.3 Zoom

Zoom is a view transform.

Ordinary zoom must not itself cause:

- decoder restart;
- full-image CPU resample;
- full-resource GPU re-upload;
- source mutation.

## 4.4 Pan

Pan changes the mapping between image space and viewport space.

It normally changes only bounded view state / draw parameters.

## 4.5 Rotate View / Flip View

Rotate View and Flip View are non-destructive presentation transforms by default.

Prefer GPU transform/UV realization when semantically correct.

Materializing a rotated/flipped full pixel plane is only justified by a named reason such as:

- backend limitation;
- animation/frame-composition requirement;
- explicit export/save operation;
- another correctness requirement that cannot be expressed as a presentation transform.

## 4.6 Reset View

Reset View resets presentation state. It does not reload/redecode the source solely because transient view state changed.

## 4.7 Fullscreen / window resize / DPI transition

These change presentation geometry and UI state.

They do not by themselves redefine the logical image or require full-resource image upload.

## 4.8 Refresh / revalidation

Refresh means:

1. revalidate current source;
2. build a candidate replacement;
3. publish atomically if successful;
4. otherwise retain last-good publication when product policy permits and surface a bounded refresh error.

Navigate-to-bad-file and refresh-current-bad-file are intentionally distinct product cases.

---

# 5. Decode and image-semantics boundary

A decoder answers:

> **What information is present in this encoded source?**

It does not decide how PocketJS stores textures or which GPU renders them.

## 5.1 Decoder replaceability

Changing:

```text
WIC → libjpeg-turbo / another decoder
```

must not require changing:

- TSX image primitive;
- DrawList opcode semantics;
- generic renderer branches;
- product view semantics.

## 5.2 Required semantic preservation

The image boundary must preserve every fact still needed for correct interpretation/presentation, including as applicable:

- source extent;
- pixel representation and precision;
- owned pixel/resource storage;
- orientation;
- alpha semantics;
- color description / profile identity needed for conversion;
- HDR/source characteristics;
- frames/pages;
- animation timing and composition facts.

Do **not** define all images at the product boundary as unconditional `RGBA8 + sRGB` simply because the first renderer path can consume it.

## 5.3 Normalize only when semantics require it

“Normalize” is not authority to rewrite everything eagerly.

A transformation may be justified by:

- decoder output representation not accepted by the selected resource path;
- required color conversion;
- required alpha representation conversion;
- frame composition;
- orientation materialization when presentation transform is insufficient;
- another explicit semantic requirement.

If the decoded representation is already acceptable, ownership should move forward without a full-plane copy.

---

# 6. Format support

## 6.1 Decoder capability != product support

A system codec becoming available must not silently expand PicoView's advertised support semantics.

Official format support is product policy.

## 6.2 Capability matrix

For every advertised format, evaluate the relevant dimensions:

- still decode;
- orientation;
- alpha;
- color/ICC;
- bit depth/precision;
- HDR;
- animation;
- multi-frame/page behavior;
- corruption/truncation behavior;
- large-image/full-resolution behavior.

“File opens” is not enough to claim full support.

## 6.3 Codec nouns stop at image semantics

JPEG / PNG / GIF / AVIF / HEIF / decoder-specific frame disposal / WIC objects must not leak into generic PocketJS renderer APIs or TSX.

---

# 7. Source truth vs presentation adaptation

PicoView separates:

```text
Source Truth
    from
Presentation Adaptation
```

## 7.1 Source truth

Source truth includes the meaning necessary to describe the image faithfully:

- dimensions;
- precision;
- color characteristics;
- alpha;
- orientation;
- HDR characteristics;
- temporal/frame semantics where applicable.

## 7.2 Presentation adaptation

Presentation adapts source truth to current output capability.

Examples:

- Fit scaling;
- monitor/output color transform;
- HDR presentation on an HDR path;
- HDR→SDR tone mapping when the output is SDR;
- sampling choice for pixel inspection versus fit display.

Presentation adaptation does not redefine the source.

## 7.3 Fidelity rule

The renderer must not silently:

- reduce resolution and call it full resolution;
- lower precision/gamut only for implementation convenience;
- reinterpret HDR source as SDR source;
- rewrite source pixels for ordinary view commands.

---

# 8. QuickJS / TSX boundary

QuickJS is a **control plane**, not an image-data plane.

## 8.1 Allowed across the boundary

Bounded semantics such as:

- opaque image resource id/handle;
- logical/display dimensions;
- loading/ready/error status;
- request generation;
- view capabilities;
- zoom/pan state;
- bounded metadata;
- bounded product errors.

## 8.2 Forbidden normal-path payloads

- encoded image file bytes;
- decoded multi-megapixel pixel planes;
- giant base64/JSON/ArrayBuffer pixel payloads;
- raw ICC blobs when only bounded interpreted state is needed;
- `wgpu::Texture` / GPU resource objects;
- adapter/device internals;
- codec-specific decode objects.

**Hard invariant: `O(image-bytes)` never crosses QuickJS in the ordinary viewer path.**

## 8.3 TSX authority

TSX is not “codec logic.”

TSX may own product view policy and interaction binding such as:

- Fit / 100% selection;
- zoom/pan interaction state;
- toolbar/chrome;
- disabled/enabled capability presentation;
- bounded product status/error presentation.

TSX does not know why a backend capability is unavailable in terms of GPU limits or codec internals.

---

# 9. PocketJS image-resource contract

## 9.1 Core owns identity, not every physical pixel representation

PocketJS core owns:

- opaque resource identity;
- resource lifetime;
- handle stale-protection;
- content revision;
- draw contract;
- backend-independent capability surface.

The selected backend owns:

- physical image representation;
- texture/bitmap storage;
- backend-specific upload details;
- backend-specific caches/views/samplers.

## 9.2 Backend-native storage

Examples:

```text
wgpu backend       → wgpu-native texture/resource
WebGPU backend     → WebGPU resource
software backend   → CPU bitmap
PSP/special backend→ representation required by that backend
```

Do not force a native desktop image through a PSP/legacy/portable CPU texture representation merely to satisfy historical implementation shape.

## 9.3 Unified composition identity

Avoid parallel public rendering models such as:

```text
TextureHandle
NativeImageHandle
PicoViewSurfaceHandle
```

unless evidence proves one generic image-resource identity cannot represent the required lifecycle/draw semantics.

Different ingress/backing paths should converge on one opaque image resource consumable by the same composition model.

## 9.4 Resource description vs draw description

Resource facts answer **what the resource is**.

Draw facts answer **how to draw it now**.

Resource-side examples:

- identity;
- extent;
- representation/capability;
- content revision.

Draw-side examples:

- source rect / UV;
- destination rect;
- transform;
- sampling;
- opacity;
- clip.

Sampling therefore normally belongs to drawing/view policy, not immutable image identity.

---

# 10. Pixel ownership and memory-movement contract

This is a hard architectural rule, not a postponed optimization exercise.

## 10.1 Default transfer rule

For every `O(image-pixels)` boundary crossing:

> **Move ownership or borrow storage by default.**

A full-plane copy requires a named semantic or physical reason.

## 10.2 Canonical static fast path

When the decoder output is already accepted by the selected resource path:

```text
Decode creates final CPU pixel plane
        │
        │ ownership move / borrow
        ▼
Resource admission
        │
        │ one required CPU→GPU transfer
        ▼
GPU resource
        │
        ▼
CPU pixel storage may retire when no longer needed
```

Target invariants:

- avoidable post-decode CPU full-plane copies = **0**;
- ordinary full-resource upload = **1 per resource identity + content revision + device generation**;
- GPU→CPU image readback = **0** unless an explicit feature requires it.

## 10.3 View changes are not data changes

These alone must not trigger full-resource re-upload:

- Zoom;
- Pan;
- Fit;
- Actual Size toggle;
- window resize;
- DPI move;
- toolbar/UI rerender;
- presentation-only rotate/flip.

## 10.4 Legitimate additional full-image work

Examples of named reasons:

- pixel-format conversion;
- color transform;
- alpha conversion;
- frame composition;
- required orientation materialization;
- backend row/alignment/layout conversion;
- distinct fit proxy vs full-resolution resource;
- device/resource recreation;
- explicit export/readback feature.

These are reviewable events, not incidental copies hidden behind module boundaries.

---

# 11. Resource identity, revision and generations

Do not use one ambiguous `generation` for unrelated lifetimes.

## 11.1 `request_generation`

Owned by product publication semantics.

A newer navigation/open request makes older publication stale.

A stale request may finish an unavoidable lower-level operation but may not publish over the newest request.

## 11.2 `handle_generation`

Owned by resource-handle stale protection.

Free/reuse of a slot must not let an old opaque handle alias a new resource.

## 11.3 `content_revision`

Owned by stable resource identity whose content changes.

Animation is the canonical example:

```text
request_generation   stable
resource handle      stable
content_revision     advances per committed frame/update
```

Do not manufacture a new product request generation or handle generation for every animation frame.

## 11.4 `device_generation`

Used when backend/device recreation makes previous physical resources invalid.

It is not the same fact as product navigation or image content revision.

---

# 12. Large images and truthful admission

Backend limits are runtime capabilities, not image semantics.

A constant such as `8192` must not become “the maximum semantic image size” merely because one backend/default device limit once used that number.

Possible truthful states include:

- `FullResolutionAvailable`;
- `FitProxyOnly`;
- `TiledOrVirtualized`;
- `UnsupportedOnCurrentBackend`.

The UI sees bounded capability such as `actualSizeAvailable`, not raw backend limit details.

Silent destructive downsampling followed by pretending the proxy is full resolution is forbidden.

---

# 13. Graphics backend selection and fallback

## 13.1 Native Windows priority

The backend must prioritize:

1. presentation-surface compatibility;
2. required graphics capabilities;
3. low-power preference among compatible adapters;
4. compatible discrete GPU fallback;
5. software CPU fallback if no usable GPU path exists.

In many hybrid systems the low-power choice will be the iGPU. This is a preference, not a hard-coded vendor/device rule.

## 13.2 Avoid cross-adapter movement

Do not force image resources onto an iGPU if the resulting presentation path requires harmful cross-adapter movement while a compatible single-adapter path exists.

Surface compatibility and coherent resource/presentation locality outrank nominal “must use iGPU.”

## 13.3 Software fallback

Software rendering is the final correctness fallback.

It may have reduced performance or advanced-display capability, but product state must remain truthful.

---

# 14. Rendering and display fidelity

## 14.1 Renderer purpose

The renderer is not merely responsible for “making a bitmap visible.”

Its job is:

> **Present the logical image as faithfully as current backend and display capability allow.**

## 14.2 Common SDR path

A typical path may be:

```text
encoded source
    ↓ decode
source/displayable pixels
    ↓ resource admission
GPU resource
    ↓ sampling / composition
output transform
    ↓
presentation
```

Fit normally uses GPU sampling rather than CPU-resizing the image into a new Fit bitmap.

## 14.3 HDR / wide gamut / advanced color

Architecture must preserve the facts required for advanced color even when a particular release has not yet enabled every capability.

If an HDR-capable output path is active and product support exists:

```text
HDR source truth
   ↓ preserve sufficient precision
HDR-capable rendering path
   ↓
HDR-capable presentation
```

If output is SDR:

```text
HDR source truth
   ↓
display-target adaptation / tone mapping
   ↓
SDR presentation
```

The source remains HDR in both cases.

## 14.4 Alpha/blending

PocketJS is **codec-transparent, not pixel-representation-blind**.

A renderer may need to know the normalized render representation required for correct sampling/blending. It must not know JPEG/PNG/WIC/GIF product semantics.

---

# 15. Error domains

Internal errors preserve where failure happened.

At minimum distinguish:

- `SourceError`;
- `DecodeError`;
- `ImageSemanticError` / normalization/interpretation failure;
- `ResourceError` / admission failure;
- `RenderingError`;
- `PresentationError`.

These map at the product boundary to bounded user-facing states.

A GPU/resource admission rejection must not be relabeled as “decode failed.”

---

# 16. CurrentItem boundary

CurrentItem answers:

> **Which logical image does the product currently consider published?**

It may own/reference:

- source identity;
- `request_generation`;
- loading/ready/error status;
- logical display geometry;
- published opaque image-resource identity;
- view capability;
- last-good publication;
- bounded product error.

It must not become owner of:

- decoder implementation;
- color-management implementation;
- GIF/animation renderer internals;
- backend texture representation;
- GPU adapter/device;
- surface/swapchain;
- DrawList renderer;
- directory enumeration;
- TSX layout/input machinery.

---

# 17. BrowseSession boundary

BrowseSession owns authoritative neighbor order and compact candidate eligibility.

It does not:

- decode every candidate to build the index;
- become a media database;
- own CurrentItem decode resources;
- own GPU resources;
- redefine format/image semantics.

Current image work outranks BrowseSession background work.

---

# 18. Replacement tests

The following are architecture tests, not merely refactoring preferences.

### Decoder replacement

```text
WIC → another decoder
```

Expected blast radius: PicoView image/decode layer only.

No TSX/DrawList/generic renderer rewrite.

### New format

```text
JPEG → AVIF / other admitted format
```

Expected: product format policy + decoder/image semantics.

No generic renderer codec branch.

### Graphics API/backend change

```text
wgpu internals / backend implementation change
```

Expected: PocketJS graphics/backend.

No PicoView product/decode rewrite.

### Adapter change

```text
compatible iGPU → compatible dGPU
```

No product-semantic change.

### GPU unavailable

```text
GPU backend → software fallback
```

Performance/capability may degrade; product truth remains coherent.

### Static → animated image

Animation/frame composition may update content revision, but codec-specific disposal semantics do not leak into TSX.

---

# 19. Current known implementation differentials

The target architecture intentionally does not normalize current implementation debt into the design.

Known areas requiring explicit audit/migration include:

- current native image registration representation may expose legacy PocketJS texture/PSM details to PicoView;
- current PocketJS core texture storage may materialize CPU-owned texture data before the wgpu backend;
- the wgpu upload path may perform avoidable full-plane copies even for an already suitable RGBA representation;
- current renderer/presentation ownership may still live partly in PicoView host code instead of generic PocketJS graphics authority;
- current image-size admission may reflect backend/default limits too directly;
- error mapping may conflate decode and resource-admission failures;
- ambiguous uses of “generation” must be split by authority.

These are **differentials**, not architecture requirements.

---

# 20. Cross-repo rule

If PicoView needs a capability that is generic to the runtime/graphics system, implement it in `jnhu76/pocketjs` first, review/merge it there, then advance `POCKETJS.lock`.

Examples likely belonging to PocketJS:

- backend-native generic image admission;
- generic image resource lifetime/revision;
- renderer backend selection/fallback;
- surface/presentation mechanics;
- generic DrawList image sampling behavior.

Examples belonging to PicoView:

- format support policy;
- decoder orchestration;
- CurrentItem publication;
- Fit/100% product semantics;
- navigation/browse semantics;
- source-fidelity policy;
- product-visible errors/capabilities.

Do not patch a hidden local PocketJS fork inside PicoView.

---

# 21. Deferred optimization vs non-deferred correctness

The following may remain workload/measurement-driven:

- decoder choice tuning;
- buffer/texture pools;
- preload/cache strategy;
- tiling algorithm;
- mip generation;
- hardware decode;
- upload staging optimization;
- UMA-specific optimization.

But these are **not** deferred:

- no image bytes through QuickJS;
- no accidental full-plane copy merely because a module boundary exists;
- no redundant upload caused only by view/UI state change;
- no stale request publication;
- no silent destructive downsample presented as 100%;
- no codec semantics in generic renderer;
- no backend/device semantics in PicoView product/image policy;
- no conflation of source truth and display adaptation.

---

# 22. Stop-the-line invariants

Stop implementation and repair authority/design if any of the following becomes necessary:

1. `O(image-bytes)` crosses QuickJS;
2. a full image is copied at a boundary without a named reason;
3. PicoView imports backend texture/device nouns as product/image semantics;
4. generic renderer branches on JPEG/PNG/GIF/PicoView nouns;
5. a reduced resource is advertised as true 100%;
6. zoom/pan/Fit/resize/UI rerender causes redundant full-resource upload;
7. stale `request_generation` can publish;
8. `request_generation`, `handle_generation`, `content_revision` are treated as interchangeable;
9. adapter choice is hard-coded by GPU vendor in PicoView product code;
10. source fidelity is silently discarded to simplify an intermediate API;
11. Product and Architecture authorities conflict.

A truthful blocker is preferable to an implementation workaround that damages the architecture.

---

# 23. Design rule in one sentence

> **PicoView decides which image, what the image means, and how the user wants to view it; PocketJS decides how an opaque image resource is rendered on the current graphics backend; large pixel data has one owner at a time, and every O(N pixels) movement must have a physical or semantic reason.**

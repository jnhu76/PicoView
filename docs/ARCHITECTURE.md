# PicoView Architecture — Viewer / Image / Rendering Semantics

Status: **CURRENT ARCHITECTURE AUTHORITY**  
Date: **2026-09-16**  
Decision: `docs/ADR/ADR-0001-viewer-image-rendering-authority.md`

This document defines PicoView's target architecture and program semantics. It is not a claim that current code already conforms.

Superseded authority is archived under `docs/history/authority-reset-20260915/`.

---

## 0. Authority model

PicoView uses **domain authority**, not one total document ranking.

### Product authority

`docs/PRD/PicoView-PRD-v0.6.md`

Owns user-visible jobs, commands, promises, and non-goals.

### Architecture authority

1. accepted ADRs in `docs/ADR/`;
2. this document.

Owns semantic boundaries, coordinate semantics, ownership, lifetime, rendering contracts, and physical invariants.

### Execution authority

`docs/SPEC/PicoView-v1.1.md`

Turns Product + Architecture authority into executable contracts. It may narrow a slice; it may not redefine either authority.

### Operational authority

`AGENTS.md`, `CONTEXT.md`, `docs/ROADMAP.md`, and GitHub issues own workflow/current state/sequencing only.

If Product and Architecture authority genuinely conflict, implementation stops until authority is repaired explicitly.

`POCKETJS.lock` is the source-identity authority for the PocketJS revision actually consumed.

---

# 1. Three semantic authorities

## 1.1 Product semantics — PicoView

> **What did the user ask for, and what logical item/view state is current?**

PicoView owns Open, CurrentItem, BrowseSession, Previous/Next, Fit, Actual Size/100%, Zoom, Pan, Rotate View, Flip View, Reset View, Fullscreen, Refresh/revalidation, last-good policy, product-visible capability, and product-visible error.

These are product facts. PocketJS may carry/render them but must not redefine them.

## 1.2 Image semantics — PicoView native

> **What does this encoded source mean as an image?**

PicoView native owns product format policy, source I/O and decoder orchestration, source dimensions, frame/page structure, intrinsic orientation, alpha semantics, bit depth/precision, color description/ICC, HDR/source characteristics, animation timing/composition semantics, source-fidelity requirements, and decoder/image-semantic error origin.

Decoder implementation is replaceable behind this authority.

## 1.3 Rendering semantics — PocketJS graphics/runtime

> **Given a generic image resource and view intent, how is it physically rendered and presented on the active backend/output?**

PocketJS owns generic resource identity/lifetime, resource revision, DrawList/image draw contract, backend selection, backend-native physical storage/residency, sampling, transforms, clipping, blending, display adaptation, surface lifecycle, presentation, and software rendering where provided.

### Fundamental rule

> **One fact has one authority.**

A downstream layer may consume a fact. It may not create a competing meaning for that fact.

---

# 2. Execution model: CPU control + selected graphics backend

Do not confuse **where semantics are decided** with **where pixels are rasterized**.

## 2.1 CPU control / image-preparation plane

CPU-side control work includes:

- PicoView product state;
- source access;
- decode and image interpretation;
- metadata interpretation required for correct presentation;
- PocketJS component tree;
- layout;
- input/focus/gesture handling;
- user view-state calculation;
- DrawList generation.

UI state/layout/input are therefore CPU-side facts.

## 2.2 Graphics realization plane

Final pixels are produced by the **selected graphics backend**.

### GPU backend

When an eligible GPU backend is active, it is the primary path for:

- backend-native image residency;
- sampling/scaling;
- image transforms;
- clipping/blending;
- display/color adaptation;
- final presentation.

The same backend **may** rasterize/composite UI primitives as well. The current PocketJS wgpu renderer does this naturally because the DrawList already contains UI and image primitives.

### Software backend

A software backend may rasterize both UI and image content on the CPU and present the resulting frame through an appropriate software-capable presentation path.

### What is not frozen

The architecture does **not** say:

```text
UI pixels MUST be produced on CPU
```

and does **not** say:

```text
UI pixels MUST be produced on GPU
```

It says:

> **UI policy/state/layout are CPU-side; final rasterization/composition belongs to the active graphics backend. Image display is GPU-first, with software rendering as the final fallback target.**

Do not create a separate CPU UI bitmap pipeline merely because UI semantics are CPU-side; that would risk an unnecessary per-frame CPU-bitmap→GPU transfer when a GPU backend is already active.

---

# 3. Canonical end-to-end flow

```text
Local Encoded Source
        │
        ▼
PicoView Source / Decode
        │
        ▼
Image Semantic Interpretation
        │
        ├─ source extent
        ├─ intrinsic orientation
        ├─ representation / precision
        ├─ alpha semantics
        ├─ color / HDR semantics
        └─ frame/page semantics
        │
        ▼
Render-image admission description + owned/borrowed storage
        │
        ▼
PocketJS Generic Image Admission
        │
        ▼
Opaque Image Resource Identity
        │
        ├────► QuickJS/TSX sees bounded semantic state only
        │
        ▼
PocketJS DrawList
        │
        ▼
Selected Graphics Backend
        │
        ├─ wgpu/native GPU residency
        ├─ WebGPU residency where applicable
        └─ software bitmap/raster path
        │
        ▼
Presentation
        │
        ▼
Display
```

**Semantic boundary != allocation boundary != memcpy boundary.**

A clean module split does not imply each module receives a private copy of a multi-megapixel image.

---

# 4. Coordinate spaces and transform order

This section is normative. The viewer must not let every layer invent its own definition of “image coordinates” or “100%.”

## 4.1 Coordinate spaces

### Source Sample Space `S`

The decoded source sample grid before intrinsic orientation is applied.

For a source of `W × H`, sample coordinates are based on that source extent.

### Oriented Logical Image Space `O`

Source Sample Space after applying intrinsic image interpretation such as EXIF orientation.

A 90°/270° intrinsic rotation swaps logical width and height.

The dimensions normally exposed to product view logic are **oriented logical dimensions**, not raw decoder storage dimensions.

### User-Transformed Image Space `U`

Oriented Logical Image Space after user-controlled Rotate View / Flip View.

These transforms are presentation state and do not alter intrinsic source orientation.

### Viewport Logical Space `L`

PocketJS/UI logical coordinates, normally DIP-like units.

### Physical Presentation Space `P`

Physical client/output pixels after applying the monitor/output scale.

## 4.2 Transform order

The order is fixed:

```text
S --intrinsic orientation--> O
O --user rotate/flip-------> U
U --Fit/Zoom/Pan-----------> L
L --DPI/output scale-------> P
```

Equivalently:

```text
P = D ∘ V ∘ Ux ∘ Oi (S)
```

where:

- `Oi` = intrinsic source-orientation transform;
- `Ux` = user Rotate/Flip transform;
- `V` = Fit/Zoom/Pan view transform;
- `D` = logical-to-physical output transform.

Color/output transfer is a separate pixel-value transform and does not redefine geometry.

## 4.3 Reset View

Reset View clears user-controlled view state (`Ux`, zoom/pan/Fit selection according to product policy).

It **never clears `Oi`**, because intrinsic orientation is part of image meaning, not transient view state.

## 4.4 Fit

Fit computes a zoom factor from the complete post-intrinsic/post-user-transform logical image extent and the available **physical image viewport**.

Conceptually:

```text
fit_scale = min(viewport_physical_width / image_logical_width,
                viewport_physical_height / image_logical_height)
```

The corresponding UI-logical draw extent is derived through the current DPI/output scale.

Fit is a presentation transform; it does not require CPU-resizing the source into a new bitmap unless a deliberately distinct proxy resource is admitted for another named reason.

## 4.5 Actual Size / 100%

At 100%, the geometric scale is defined in physical-pixel terms:

> **1 oriented/user-transformed logical image sample maps to 1 physical presentation pixel in scale.**

Let `d = physical_pixels_per_UI_logical_unit` for the current monitor/output. Then at 100%:

```text
UI_logical_units_per_image_sample = 1 / d
```

Therefore a `4000 px` image on a `1.5×` DPI output occupies approximately `2666.67` UI logical units at 100%; it is **not** drawn as `4000 DIP` and then multiplied by DPI.

A reduced proxy can never satisfy true 100%.

Pixel-perfect inspection may additionally require pixel-aligned translation/sampling policy; that is draw policy and does not change the 1:1 physical scale definition.

## 4.6 Zoom

User zoom is a multiplier of the 100%-defined physical image scale.

```text
physical_pixels_per_image_sample = zoom_factor
```

where `zoom_factor = 1.0` at Actual Size.

Ordinary zoom changes bounded view/draw state only. It must not itself trigger decode restart, CPU full-image resample, or resource re-admission.

## 4.7 Pan

Pan changes translation between image space and viewport space. It normally changes only bounded view/draw state.

## 4.8 DPI/output transition

Moving the window to a different-DPI output changes `D` and the logical draw geometry needed to preserve image-space semantics.

It does not redefine source dimensions, intrinsic orientation, or 100% physical scale.

---

# 5. Image → rendering semantic contract

The rendering boundary must be **codec-transparent but representation-aware**.

Do not pass JPEG/WIC/GIF-specific objects to PocketJS. Do pass the generic facts required to render pixels correctly.

## 5.1 Conceptual `RenderImageDesc`

The exact Rust name/type is intentionally not frozen, but the admission contract must be able to express at least:

```text
storage_extent
logical_extent
row_stride / plane layout as required
pixel_encoding + precision
alpha_representation
color_encoding / profile semantics
intrinsic_transform if not materialized
content_revision
```

### Pixel encoding / precision

The contract describes what the admitted samples physically mean. It must distinguish representations when the renderer needs different interpretation.

Do not flatten every image into an unconditional `RGBA8 sRGB` semantic contract.

### Alpha representation

The boundary must distinguish at least the meaningful cases required by supported rendering paths, such as opaque, straight/unassociated alpha, and premultiplied alpha.

The renderer's blend state must agree with the admitted alpha representation; fixed alpha blending is not allowed to silently reinterpret pixels.

### Color semantics

The boundary must preserve enough information for correct display adaptation. This may be a normalized working color encoding or a generic color-description/profile reference resolved before/at rendering, but codec-specific metadata must not leak into generic renderer APIs.

### Intrinsic transform

If EXIF/source orientation is not materialized into a new pixel plane, the generic admission/draw path must preserve an intrinsic transform or equivalent logical-image mapping.

## 5.2 Normalize only when semantics require it

A transformation may be justified by:

- decoder output representation not accepted by the selected resource path;
- required color transform;
- required alpha conversion;
- frame composition;
- orientation materialization where transform-only presentation cannot satisfy semantics;
- another explicit correctness requirement.

If the decoded representation is already acceptable, ownership should move forward without a full-plane copy.

---

# 6. Product view semantics

## 6.1 Rotate View / Flip View

User Rotate/Flip are applied **after intrinsic source orientation**.

They are non-destructive presentation transforms by default.

Materializing a new full pixel plane requires a named reason such as backend limitation, frame-composition requirement, explicit export/save, or another correctness constraint.

## 6.2 Fullscreen / resize

These change viewport/presentation geometry. They do not by themselves redefine the logical image or require full-resource image upload.

## 6.3 Refresh / revalidation

Refresh uses candidate-then-publish semantics:

1. revalidate current source;
2. build/decode an independent candidate;
3. admit candidate resource successfully;
4. atomically publish the candidate according to product policy;
5. retire previous publication only after replacement publication is committed;
6. if candidate construction/admission fails, retain last-good publication when product policy requires it and surface a bounded refresh error.

Navigate-to-bad-file and refresh-current-bad-file are intentionally distinct product cases.

---

# 7. Resource lifecycle and ownership state machine

“Core owns lifetime” is not sufficient without a state model.

## 7.1 Logical resource states

A normal candidate follows:

```text
DecodedCandidate
      │ owns CPU storage / semantic description
      ▼
AdmissionPending
      │ move/borrow into generic admission
      ▼
Admitted
      │ opaque logical resource exists
      ▼
Published
      │ product may reference it through non-owning handle/id
      ▼
Retired
      │ no new product publication should target it
      ▼
Released
```

Backend physical residency may be created, evicted, recreated, or destroyed underneath an admitted logical resource according to backend policy.

## 7.2 Ownership rules

- `DecodedCandidate` owns or explicitly borrows its CPU storage.
- Generic admission must make ownership transfer/borrow semantics explicit.
- QuickJS/TSX receives only a **non-owning opaque identity**.
- PocketJS owns logical resource lifetime and stale-handle protection.
- The backend owns physical storage/residency and in-flight GPU/software leases.
- Final release must wait until no backend/in-flight frame can still dereference the physical resource.

## 7.3 Publish/replace ordering

For a refresh/replacement with last-good semantics:

```text
old Published resource remains valid
        │
        ├── candidate decode/admission succeeds
        │       ▼
        │   atomic publication swap
        │       ▼
        └── old resource retires/releases
```

Never retire last-good first and then discover that replacement admission failed.

For navigation to a new corrupt/unsupported item, product policy may instead publish an error item and retire the previous item; that is a Product decision, not an accidental side effect of admission order.

## 7.4 Device loss / backend switch

Physical residency loss does not automatically mean logical product identity changed.

A backend may recreate residency for the same logical resource if recoverable storage/source exists. Otherwise it may require re-decode/re-admission under the same product item, with truthful loading/capability state.

Switching from GPU to software after startup/device failure is a recovery feature distinct from selecting software fallback at startup. Do not claim seamless runtime failover until implemented and tested.

---

# 8. Memory movement and residency contract

This is architecture correctness, not deferred performance tuning.

## 8.1 Pixel-plane handoff

For every `O(image-pixels)` boundary crossing:

> **Move ownership or borrow storage by default.**

A full-plane copy requires a named semantic or physical reason.

## 8.2 Canonical static fast path

When decoder output is already accepted by admission:

```text
Decode creates final CPU pixel plane
        │
        │ ownership move / borrow
        ▼
Generic resource admission
        │
        │ required device/backend transfer
        ▼
Backend residency
        │
        ▼
CPU storage may retire when recovery/lifetime policy permits
```

Target invariants:

- avoidable post-decode CPU full-plane copies = **0**;
- GPU→CPU image readback = **0** unless an explicit feature requires it;
- view/UI changes do not create new image content and therefore do not themselves trigger full-resource upload.

## 8.3 Residency-aware upload rule

Do **not** encode “one upload forever.”

For the same:

```text
logical resource identity
+ content_revision
+ device_generation
```

an existing valid residency must be reused.

A new full upload is legitimate only after a named event such as:

- first residency creation;
- content revision;
- explicit backend eviction/residency loss;
- device recreation;
- deliberately distinct proxy/full-resolution/tiled resource;
- backend representation conversion requiring a new physical resource.

While valid residency exists, zoom, pan, Fit, Actual Size toggle, window resize, DPI move, UI rerender, and presentation-only rotate/flip must not cause redundant full-resource upload.

Backend residency/eviction is backend state, not product generation.

## 8.4 Encoded-source movement

Encoded source bytes have a weaker but similar rule: avoid unnecessary whole-file duplication when streaming, move, mapped access, or bounded buffering is sufficient.

This does not require every decoder to stream; it requires whole-file materialization/copies to have a reason rather than arise accidentally at every layer.

---

# 9. Identity, generations, and revisions

Do not use one ambiguous `generation` for unrelated lifetimes.

## 9.1 `request_generation`

Product publication ordering. A newer open/navigation request makes older publication stale.

A stale request may finish unavoidable work but may not publish over the newest request.

## 9.2 `handle_generation`

Resource stale-handle protection. Free/reuse of a slot must not let an old handle alias a new logical resource.

## 9.3 `content_revision`

Changed content under a stable logical resource identity.

Animation is the canonical example:

```text
request_generation   stable
resource handle      stable
content_revision     advances
```

## 9.4 `device_generation`

Backend/device recreation domain. It is not product navigation and not image-content revision.

## 9.5 Backend residency identity

A backend may additionally track private residency/cache epochs. These are not exposed as another product generation.

---

# 10. QuickJS / TSX boundary

QuickJS is a **control plane**, not an image-data plane.

## 10.1 Allowed

Bounded semantics such as opaque resource identity, oriented/logical display dimensions, loading/ready/error status, request generation, view capability, zoom/pan state, bounded metadata, and bounded product errors.

## 10.2 Forbidden normal-path payloads

- encoded image file bytes;
- decoded multi-megapixel pixel planes;
- giant base64/JSON/ArrayBuffer payloads;
- decoder-specific objects;
- backend texture/device objects;
- adapter/device internals.

**Hard invariant: `O(image-bytes)` never crosses QuickJS in the ordinary viewer path.**

## 10.3 TSX authority

TSX may own product view policy and interaction binding. It may know `actualSizeAvailable`; it must not know that the reason is a raw GPU dimension limit, PSM representation, decoder object, or adapter detail.

---

# 11. Resource description vs draw description

Resource facts answer **what the image resource is**:

- identity;
- storage/logical extent;
- representation/precision;
- alpha/color semantics;
- content revision;
- intrinsic mapping where needed.

Draw facts answer **how to draw it now**:

- source rect / UV;
- destination geometry;
- user/view transform;
- sampling;
- opacity;
- clip.

Sampling therefore normally belongs to draw/view policy, not immutable resource identity.

The same resource may be drawn with different sampling policy for Fit versus pixel inspection without resource recreation.

---

# 12. Format support

## 12.1 Decoder capability != product support

A system codec becoming available does not silently expand PicoView's advertised support.

Official format support is Product authority.

## 12.2 Capability matrix

For every advertised format, evaluate as relevant:

- still decode;
- intrinsic orientation;
- alpha;
- color/ICC;
- bit depth/precision;
- HDR;
- animation;
- multi-frame/page behavior;
- corruption/truncation behavior;
- large-image/full-resolution behavior.

“File opens” is not enough to claim full support.

## 12.3 Codec nouns stop at image semantics

JPEG / PNG / GIF / AVIF / HEIF / WIC objects / codec-specific disposal semantics must not leak into generic PocketJS rendering APIs or TSX.

---

# 13. Source truth, color, alpha, and presentation adaptation

## 13.1 Source truth

Source truth includes the image meaning required for faithful viewing: dimensions, intrinsic orientation, precision, color characteristics, alpha semantics, HDR characteristics, and temporal/frame semantics where applicable.

## 13.2 Presentation adaptation

Presentation adapts source truth to the current output capability. Examples include Fit scaling, monitor/output color transform, HDR presentation, HDR→SDR tone mapping, and draw sampling policy.

Presentation adaptation does not redefine the source.

## 13.3 Alpha/blending

The renderer must know the admitted alpha representation required for correct blending.

A generic renderer may branch on generic alpha/pixel representations. It must not branch on JPEG/PNG/GIF/PicoView product nouns.

## 13.4 Advanced color

The architecture preserves enough semantics for wide-gamut/HDR paths even when a release does not advertise them.

If the active backend/output cannot faithfully provide an advanced path, product capability must remain truthful and adaptation must not pretend the source itself changed meaning.

---

# 14. Graphics backend selection and fallback

## 14.1 GPU path

On native Windows, GPU selection prioritizes:

1. target-surface compatibility;
2. required graphics capabilities;
3. low-power preference among valid adapters;
4. compatible discrete GPU fallback.

In many hybrid systems the low-power choice will be the iGPU. This is a preference, not a vendor/device rule.

Do not force resources onto an iGPU if a coherent compatible dGPU path avoids harmful cross-adapter movement.

## 14.2 Software fallback target

If no viable GPU path exists, the target architecture provides a software backend capable of basic correct viewing.

Minimum fallback semantics before claiming “GPU not required” are:

- product UI is usable;
- ordinary SDR image is visible;
- Fit / Actual Size / Zoom / Pan work truthfully;
- source orientation and alpha are handled correctly for supported formats;
- errors/capabilities remain truthful.

Advanced HDR/wide-gamut/performance capability may be unavailable.

**Current implementation note:** the locked PocketJS/PicoView Windows path currently depends on wgpu for presentation. Software fallback is therefore a migration target, not an already-proved capability.

## 14.3 Runtime recovery is separate

Startup selection of software fallback and mid-session recovery from GPU device loss are different features. Seamless runtime backend migration is not implied unless separately implemented and tested.

---

# 15. Large images and truthful admission

Backend limits are runtime capabilities, not image semantic limits.

A constant such as `8192` must not become “the maximum semantic image size” because one backend/default limit once used that number.

Possible truthful states include:

- `FullResolutionAvailable`;
- `FitProxyOnly`;
- `TiledOrVirtualized`;
- `UnsupportedOnCurrentBackend`.

The UI sees bounded capability such as `actualSizeAvailable`, not raw backend limits.

Silent destructive downsampling followed by pretending a proxy is full resolution is forbidden.

---

# 16. Error domains

Internal errors preserve where failure happened.

At minimum distinguish:

- Source error;
- Decode error;
- Image-semantic/interpretation error;
- Resource-admission error;
- Rendering error;
- Presentation error.

These map at the product boundary to bounded user-facing states.

A GPU/resource admission rejection must not be relabeled as “decode failed.”

---

# 17. CurrentItem boundary

CurrentItem answers:

> **Which logical item does the product currently consider published?**

It may own/reference source identity, `request_generation`, loading/ready/error status, logical display geometry, published opaque resource identity, view capability, last-good publication, and bounded product error.

It must not become owner of decoder implementation, color-management implementation, animation-renderer internals, backend texture representation, GPU adapter/device, surface/swapchain, DrawList renderer, directory enumeration, or TSX layout/input machinery.

---

# 18. BrowseSession boundary

BrowseSession owns authoritative neighbor order and compact candidate eligibility.

It does not decode every candidate to build the index, become a media database, own CurrentItem decode resources, own graphics resources, or redefine format/image semantics.

Current-image work outranks BrowseSession background work.

---

# 19. Replacement tests

Architecture boundaries are healthy when these substitutions remain local:

```text
WIC → another decoder
```

changes PicoView image/decode code, not TSX/DrawList/generic renderer semantics.

```text
JPEG → AVIF / another admitted format
```

does not add codec branches to the generic renderer.

```text
wgpu GPU backend → another graphics implementation
```

does not rewrite PicoView product/image semantics.

```text
compatible iGPU → compatible dGPU
```

does not change product semantics.

```text
GPU startup unavailable → software backend
```

may reduce performance/advanced capability but keeps basic product truth coherent once fallback is implemented.

```text
static → animated resource
```

may advance `content_revision`; codec-specific disposal semantics do not leak into TSX.

---

# 20. Current known implementation differentials

These are migration targets, not accepted target design:

- PicoView currently imports PocketJS PSM representation for native image registration;
- ordinary decoded images are cloned into `NativeResource` instead of ownership-moving;
- PocketJS core currently materializes CPU-owned aligned texture storage before wgpu;
- the wgpu path currently materializes another RGBA vector even for `PSM_8888`;
- current sampling preference is stored partly as texture identity/state rather than purely draw policy;
- current `NATIVE_TEX_MAX_DIM` embeds a wgpu-default-class limit in core and PicoView uses it as an admission/downsample trigger;
- current giant-image path silently creates a reduced resource, so full-resolution capability needs truthful separation;
- current resource-admission failure can be mapped as decode failure;
- current refresh/publication ordering may retire the previous resource before replacement admission succeeds;
- renderer/presentation authority is still partly implemented in PicoView host code;
- current Windows presentation path has no proved software renderer fallback;
- current color/alpha boundary is effectively RGBA8/PSM-oriented and is not yet the generic `RenderImageDesc` contract;
- existing `generation` terminology must be split by authority.

---

# 21. Cross-repo rule

If PicoView needs a capability generic to runtime/graphics, implement it in `jnhu76/pocketjs` first, review/merge it there, then advance `POCKETJS.lock`.

Likely PocketJS work includes backend-native generic image admission, resource lifetime/revision, representation-aware render contract, renderer backend selection/fallback, surface/presentation mechanics, sampling state, and runtime capability reporting.

PicoView owns format policy/decoder orchestration, CurrentItem publication, Fit/100% product semantics, navigation/browse semantics, source-fidelity policy, and product-visible errors/capabilities.

Do not patch a hidden local PocketJS fork inside PicoView.

---

# 22. Deferred optimization vs non-deferred correctness

Workload-driven optimization may remain deferred: decoder tuning, texture/buffer pools, preload/cache, tiling algorithm, mip generation, hardware decode, upload staging optimization, and UMA-specific optimization.

These correctness properties are **not** deferred:

- no image bytes through QuickJS;
- no accidental full-plane copy merely because a module boundary exists;
- no redundant upload while valid residency exists merely because view/UI state changed;
- no stale request publication;
- no false 100% from a reduced proxy;
- no codec semantics in generic renderer;
- no backend/device semantics in PicoView Product/Image policy;
- no conflation of intrinsic orientation and user transform;
- no undefined alpha/color representation at resource admission;
- no conflation of source truth and display adaptation.

---

# 23. Stop-the-line invariants

Stop implementation and repair authority/design if continuing requires:

1. `O(image-bytes)` through QuickJS;
2. an unexplained full-image copy at a semantic boundary;
3. backend texture/device nouns as PicoView Product/Image semantics;
4. codec-specific branches in generic rendering;
5. a reduced proxy advertised as true 100%;
6. a view/UI state change causing redundant upload while valid residency exists;
7. stale `request_generation` publication;
8. request/handle/content/device generations treated as interchangeable;
9. user Reset View discarding intrinsic source orientation;
10. fixed blending/color behavior silently reinterpreting an admitted representation;
11. last-good refresh state destroyed before replacement admission succeeds;
12. Product and Architecture authority conflict.

A truthful blocker is preferable to a workaround that damages the architecture.

---

# 24. Design rule in one sentence

> **PicoView decides which image, what the image means, and how the user wants to view it; PocketJS owns the generic resource/rendering contract and the active graphics backend produces final pixels; large image data has explicit ownership, and every O(N pixels) copy/upload must have a physical or semantic reason.**
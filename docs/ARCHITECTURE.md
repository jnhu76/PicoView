# PicoView Architecture — Viewer / Image / Rendering Semantics

Status: **CURRENT ARCHITECTURE AUTHORITY**  
Date: **2026-09-16**  
Decision: `docs/ADR/ADR-0001-viewer-image-rendering-authority.md`

This document defines PicoView's target architecture and program semantics. It is not a claim that current code already conforms.

Superseded authority is archived under `docs/history/authority-reset-20260915/`.

---

## 0. Authority model

PicoView uses **domain authority**, not one total document ranking.

- **Product authority** — `docs/PRD/PicoView-PRD-v0.6.md`: user-visible jobs, commands, promises, and non-goals.
- **Architecture authority** — accepted ADRs + this document: semantic boundaries, coordinate semantics, ownership, lifetime, rendering contracts, and physical invariants.
- **Execution authority** — `docs/SPEC/PicoView-v1.1.md`: executable contracts satisfying Product + Architecture authority.
- **Operational authority** — `AGENTS.md`, `CONTEXT.md`, `docs/ROADMAP.md`, GitHub issues: workflow/current state/sequencing only.

If Product and Architecture authority genuinely conflict, implementation stops until authority is repaired explicitly.

`POCKETJS.lock` is the source-identity authority for the PocketJS revision actually consumed.

---

# 1. Boundary map

The architecture has three semantic domains, with Rendering split into a logical contract and a physical backend realization.

| Layer | Owns | Does not own |
|---|---|---|
| **PicoView Product** | current item, navigation, Fit/100%, Zoom/Pan, user Rotate/Flip, fullscreen, refresh/last-good, product capability/errors | codec mechanics, resource lifetime, shaders, texture storage, GPU selection |
| **PicoView Image** | format policy, decode orchestration, intrinsic orientation, source dimensions, alpha/precision/color/HDR/frame meaning | view policy, PocketJS revision counters, backend texture/device representation |
| **PocketJS Core** | opaque logical resource identity/lifetime, stale-handle protection, `content_revision`, DrawList/generic draw contract, backend-independent capabilities | JPEG/PNG/WIC semantics, PicoView Fit policy, physical GPU residency |
| **Graphics Backend** | physical texture/bitmap/storage, residency/eviction, in-flight leases, sampler/matrix/shader realization, output adaptation, presentation | product meaning, source-format meaning, publication policy |

> **One fact has one authority.**

A downstream layer may consume a fact. It may not create a competing meaning for it.

---

# 2. CPU/GPU are execution locations, not authority layers

Do not infer semantic ownership from where instructions execute.

## 2.1 Normally CPU-side control

Current control work is normally CPU-side:

- Product state and publication decisions;
- component/UI state;
- layout;
- input/focus/gesture processing;
- view-state calculation;
- decode orchestration;
- resource create/update/release requests;
- DrawList generation.

This does **not** mean all image processing or all UI pixels must be computed on CPU.

## 2.2 Decode execution is not frozen to CPU

PicoView Image owns **what decode means and which semantic result is required**. It does not own a rule saying the decoder must execute on CPU.

A decode implementation may use:

- CPU software decode;
- Windows/platform codecs;
- dedicated media/image hardware;
- GPU/accelerator decode;
- another implementation hidden behind the same image-semantic contract.

If an accelerator path can preserve the required source semantics and produce storage directly consumable/importable by the active graphics path, it may avoid:

```text
full CPU pixel plane
→ CPU-side normalization copy
→ CPU→GPU full upload
```

and instead use a path conceptually like:

```text
encoded source
→ accelerator decode
→ backend-consumable/native image storage
→ PocketJS logical resource
→ rendering
```

This is preferred **when evidence shows it actually reduces O(N pixels) materialization/transfer without introducing a worse interop or cross-adapter copy**.

Hardware/GPU decode is therefore permitted and desirable where suitable, but is not mandatory and must not leak backend-specific objects or codec nouns into Product/TSX contracts.

## 2.3 UI rasterization is backend realization

UI state/policy/layout remain CPU-side control facts.

Final UI pixels are **not semantically assigned to CPU or GPU**:

- current wgpu backend may rasterize/composite UI and image primitives together on GPU;
- software backend may rasterize UI and image primitives on CPU.

Do not create a separate CPU UI bitmap pipeline merely because UI semantics are CPU-side; on a GPU backend that can introduce needless per-frame bitmap upload.

---

# 3. Three semantic authorities

## 3.1 Product semantics — PicoView

> **What did the user ask for, and what logical item/view state is current?**

Product owns:

- Open / CurrentItem / BrowseSession;
- Previous / Next;
- Fit;
- Actual Size / 100%;
- Zoom / Pan;
- user Rotate View / Flip View / Reset View;
- Fullscreen;
- Refresh / revalidation;
- last-good publication policy;
- product-visible capability and errors.

Product owns **view intent**: it decides the requested view state and derived product geometry. It does not own physical sampler/shader/matrix implementation.

## 3.2 Image semantics — PicoView native

> **What does this encoded source mean as an image?**

Image owns:

- product format policy;
- source access and decoder orchestration;
- source dimensions / frame/page structure;
- intrinsic orientation;
- alpha semantics;
- bit depth / precision;
- color description / ICC;
- HDR/source characteristics;
- animation timing/composition semantics;
- source-fidelity requirements;
- decoder/image-semantic error origin.

Decoder implementation and execution location are replaceable behind this boundary.

## 3.3 Rendering semantics — PocketJS

> **Given generic image facts and Product view intent, how is a logical resource represented by generic draw commands and physically realized on the active backend/output?**

Rendering authority is deliberately split:

### PocketJS Core contract

Core owns:

- opaque logical resource identity;
- logical lifetime / stale-handle protection;
- `content_revision` generation and update semantics;
- generic render-image admission/update contract;
- DrawList/image draw contract;
- backend-independent rendering capabilities;
- graphics backend selection policy.

### Graphics Backend realization

Backend owns:

- physical texture/bitmap/surface representation;
- residency / eviction / recreation;
- in-flight GPU/software leases;
- sampler/matrix/shader realization of generic draw parameters;
- clipping/blending implementation;
- output color/HDR adaptation implementation;
- surface lifecycle;
- final presentation.

---

# 4. View intent vs transform realization

The word “transform” must not hide multiple authorities.

The fixed ownership chain is:

```text
intrinsic source orientation          → PicoView Image
user Fit/100%/Zoom/Pan/Rotate/Flip   → PicoView Product
bounded generic draw parameters       → PocketJS Core contract
physical sampler/matrix/shader work   → Graphics Backend
```

PocketJS must not invent PicoView's Fit or 100% policy. PicoView must not directly select shader matrices, texture samplers, or backend resource representation.

Sampling intent can be selected as part of Product/view policy or derived generic draw policy; its **physical sampler object** belongs to the backend.

---

# 5. Coordinate spaces and transform order

The viewer must not let every layer invent its own meaning for “image coordinates” or “100%.”

## 5.1 Spaces

### Source Sample Space `S`

The decoded/source sample grid before intrinsic orientation.

### Oriented Logical Image Space `O`

`S` after Image-owned intrinsic orientation such as EXIF orientation. A 90°/270° intrinsic rotation swaps logical width and height.

The dimensions normally exposed to Product view logic are oriented logical dimensions, not raw storage dimensions.

### User-Transformed Image Space `U`

`O` after Product-owned user Rotate/Flip state.

### Viewport Logical Space `L`

PocketJS/UI logical coordinates, normally DIP-like units.

### Physical Presentation Space `P`

Physical client/output pixels after current output scaling.

## 5.2 Fixed order

```text
S --intrinsic orientation--> O          [Image]
O --user rotate/flip-------> U          [Product intent]
U --Fit/Zoom/Pan-----------> L          [Product intent / generic draw geometry]
L --DPI/output scale-------> P          [runtime/output fact]
P --raster/present---------> Display    [Backend realization]
```

Conceptually:

```text
P = D ∘ V ∘ Ux ∘ Oi (S)
```

Color/output transfer is a separate pixel-value transform; it does not redefine geometry.

## 5.3 Reset View

Reset View clears user-controlled view state. It never clears intrinsic source orientation.

## 5.4 Fit

Fit uses the complete post-intrinsic/post-user-transform logical image bounds and available physical image viewport while preserving aspect ratio.

Conceptually:

```text
fit_scale = min(viewport_physical_width / image_logical_width,
                viewport_physical_height / image_logical_height)
```

The corresponding UI-logical geometry is derived through current output scaling.

Fit is presentation state. It does not require CPU-resizing the source merely to change the view.

## 5.5 Actual Size / 100%

At 100%:

> **1 oriented/user-transformed logical image sample maps to 1 physical presentation pixel in scale.**

If `d = physical_pixels_per_UI_logical_unit`:

```text
UI_logical_units_per_image_sample = 1 / d
```

A `4000 px` image on a `1.5×` output therefore occupies about `2666.67` UI logical units at 100%, not `4000 DIP` subsequently magnified to `6000` physical pixels.

A reduced proxy can never satisfy true 100%.

Pixel-perfect inspection may additionally require pixel-aligned translation/sampling policy; that does not change the 1:1 physical-scale definition.

## 5.6 Zoom / Pan / DPI transition

Zoom is a multiplier over the 100%-defined physical image scale. Pan changes translation. Neither normally changes image content or resource identity.

Moving to a different-DPI output changes `D` and the UI-logical geometry needed to preserve semantics. It does not redefine image dimensions, intrinsic orientation, or 100%.

---

# 6. Image → PocketJS admission contract

The boundary is **codec-transparent but representation-aware**.

Do not pass JPEG/WIC/GIF-specific objects into PocketJS. Do pass generic facts required for correct rendering.

## 6.1 Conceptual `RenderImageDesc`

Exact Rust type names are intentionally not frozen. The admission description must be able to express, when applicable:

```text
storage_extent
logical_extent
row_stride / plane layout
pixel_encoding + precision
alpha_representation
color_encoding / profile semantics
intrinsic_transform if not materialized
```

**`content_revision` is not an Image-supplied field.** PocketJS Core owns revision state.

On initial resource creation, Core establishes the initial revision. On a committed content update, Core advances it. Image-side codec/frame sequence values may exist but must not become a second PocketJS revision truth.

## 6.2 CPU storage ingress

A common ingress is:

```text
owned/borrowed CPU storage + RenderImageDesc
→ PocketJS generic admission
→ logical resource identity
```

If the representation is already accepted, ownership moves/borrows forward without an avoidable full-plane copy.

## 6.3 Backend-native/importable ingress

The generic contract must also leave room for accelerator/platform decode paths that produce backend-native or backend-importable storage:

```text
accelerator/platform decode result + generic image semantics
→ generic import/admission
→ same logical resource model
```

This is **not** a second public image type or compositor. Different physical ingress paths converge on one logical resource/draw contract.

Backend/platform handles remain below the generic boundary; Product/TSX do not see them.

## 6.4 Alpha

The contract distinguishes the alpha representations required by supported paths, such as opaque, straight/unassociated alpha, and premultiplied alpha.

Backend blend realization must agree with admitted alpha semantics.

## 6.5 Color/HDR

Image owns source color/HDR truth. PocketJS Core carries generic representation/adaptation requirements. Backend provides output capability and performs physical conversion/presentation.

A codec-specific profile object must not leak into generic DrawList/TSX contracts merely because a decoder produced it.

## 6.6 Intrinsic orientation

If intrinsic orientation is not materialized into storage, its generic logical mapping must survive admission/draw.

---

# 7. Publication, logical resource lifetime, and physical residency

These are three different authorities.

## 7.1 Product publication state

Product owns questions such as:

```text
Which item is the candidate?
Which item is current/published?
Should last-good remain visible?
Has replacement committed?
When is the old logical resource no longer needed by Product?
```

Product emits resource create/update/release intent. It does not directly destroy physical backend storage.

## 7.2 PocketJS logical resource state

PocketJS Core owns states conceptually like:

```text
AdmissionPending
→ Admitted/Live
→ ReleaseRequested
→ LogicallyDead
```

Core owns opaque handles, stale-handle safety, logical lifetime, and `content_revision`.

QuickJS/TSX receives only a **non-owning opaque identity**.

## 7.3 Backend physical residency

Backend owns physical states/events such as:

```text
nonresident
↔ resident
resident + in-flight leases
→ evicted/recreated as policy requires
→ physically destroyed when safe
```

Residency may disappear and later be recreated without changing Product item identity or logical handle identity if the Core/backend contract permits recovery.

Final physical destruction waits until no in-flight frame/work can dereference the storage.

## 7.4 Refresh / last-good ordering

For refresh of an already-visible item:

```text
old Product publication remains current
        │
        ├─ candidate decode/import/admission succeeds
        │        ▼
        │   Product publication swap commits
        │        ▼
        └─ Product releases old logical resource
                 ▼
             Core retires when safe
                 ▼
             Backend destroys when safe
```

Do not release/destroy last-good first and then discover that candidate decode or admission failed.

Navigation to a new corrupt/unsupported item may follow different Product publication policy; that must be deliberate, not an accident of resource APIs.

## 7.5 Device loss / backend switch

Physical residency loss does not automatically mean Product identity changed.

A backend may recreate residency from retained/recoverable storage, or the system may re-decode/re-admit under the same Product item with truthful loading/capability state.

Startup software fallback and seamless mid-session migration after device loss are separate features.

---

# 8. Memory movement and decode/import paths

This is architecture correctness, not deferred micro-optimization.

## 8.1 General rule

For every `O(image-pixels)` handoff:

> **Move ownership, borrow storage, or transfer/import once for a named physical reason.**

A module boundary is not a reason to materialize another full image.

## 8.2 CPU-decoded static fast path

When CPU decode output is already accepted:

```text
CPU decoder produces final required pixel plane
        │
        │ ownership move / borrow
        ▼
PocketJS admission
        │
        │ one required backend/device transfer if needed
        ▼
Backend residency
```

Targets:

- avoidable post-decode CPU full-plane copies = **0**;
- GPU→CPU image readback = **0** unless an explicit feature requires it;
- view/UI state changes do not trigger new image content admission.

## 8.3 Accelerator-direct path

Where supported and actually beneficial:

```text
encoded source
→ hardware/GPU/platform decode
→ backend-native/importable image
→ PocketJS logical admission
→ render
```

This path may avoid a full CPU pixel plane and CPU→GPU upload entirely.

Do not call a path “zero-copy” merely because the API surface looks direct. Count hidden interop, cross-adapter, format-conversion, staging, and import copies when evaluating the physical path.

## 8.4 Residency-aware upload/import rule

Do **not** encode “one upload forever.”

For the same:

```text
logical resource identity
+ PocketJS content_revision
+ device_generation
```

valid existing residency must be reused.

A new upload/import is legitimate after a named event such as:

- first residency creation/import;
- committed content update;
- explicit backend eviction/residency loss;
- device recreation;
- deliberately distinct proxy/full-resolution/tiled resource;
- required representation conversion.

While valid residency exists, Zoom, Pan, Fit, Actual Size toggle, window resize, DPI move, UI rerender, and presentation-only Rotate/Flip do not justify redundant full-resource upload.

## 8.5 Encoded-source movement

Avoid unnecessary whole-file duplication when streaming, move, mapped access, or bounded buffering is sufficient. Streaming is not mandatory; accidental repeated whole-file copies are not acceptable.

---

# 9. Identity, generations, and revisions

Keep these distinct:

## 9.1 `request_generation` — Product

Latest-wins Product publication ordering. A stale request may finish unavoidable work but may not publish over a newer request.

## 9.2 `handle_generation` — PocketJS Core

Stale logical-resource handle protection. Free/reuse must not let an old handle alias a new resource.

## 9.3 `content_revision` — PocketJS Core

Changed content committed under a stable logical resource identity.

Image/Product code requests a content update; **PocketJS assigns/advances the revision** when the update commits.

Animation is the canonical case:

```text
request_generation   stable
resource handle      stable
content_revision     advances in PocketJS
```

## 9.4 `device_generation` — Graphics runtime/backend

Graphics device/resource-domain recreation. It is not Product navigation and not image-content revision.

## 9.5 Backend-private residency epochs

Backend may track private cache/residency epochs. They do not leak as another Product/Core generation.

---

# 10. QuickJS / TSX boundary

QuickJS is a **control plane**, not an image-data plane.

Allowed bounded state includes opaque resource identity, oriented/logical display dimensions, loading/ready/error status, request generation, view capability, Zoom/Pan state, bounded metadata, and bounded Product errors.

Forbidden normal-path payloads include:

- encoded image file bytes;
- decoded multi-megapixel pixel planes;
- giant base64/JSON/ArrayBuffer payloads;
- decoder-specific objects;
- backend texture/device/import handles;
- adapter/device internals.

**Hard invariant: `O(image-bytes)` never crosses QuickJS in the ordinary viewer path.**

TSX may own Product view interaction/policy. It may know `actualSizeAvailable`; it must not know the raw GPU dimension limit, PSM representation, decoder object, or adapter detail causing a capability result.

---

# 11. Resource facts vs draw facts

Resource facts answer **what the logical image resource is**:

- opaque identity;
- storage/logical extent;
- representation/precision;
- alpha/color semantics;
- intrinsic mapping where needed;
- PocketJS-managed revision state.

Draw facts answer **how Product currently wants it shown**:

- source rect / UV;
- destination geometry;
- user/view transform;
- sampling intent;
- opacity;
- clip.

The backend realizes these draw facts using physical sampler/matrix/shader objects.

The same resource may be drawn with different sampling/view policy without resource recreation.

---

# 12. Format support

Decoder capability does not automatically become Product support.

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

JPEG / PNG / GIF / AVIF / HEIF / WIC objects / codec-specific disposal semantics stop at Image authority. Generic PocketJS rendering must not branch on them.

---

# 13. Color, alpha, and presentation adaptation

## 13.1 Source truth — Image

Image owns source precision, color characteristics/profile meaning, alpha semantics, HDR characteristics, and temporal/frame meaning.

## 13.2 Generic render contract — PocketJS Core

Core carries the representation and generic adaptation requirements needed to render correctly without codec-specific nouns.

## 13.3 Output capability and physical adaptation — Backend

Backend knows the active output/surface capability and physically performs the required conversion, blending, tone mapping, and presentation.

A user-visible future color/HDR mode would itself be Product policy; absent such a mode, Product does not choose shaders or working spaces.

Presentation adaptation never redefines source truth.

---

# 14. Graphics backend selection and fallback

## 14.1 GPU path

On native Windows, GPU selection prioritizes:

1. target-surface compatibility;
2. required graphics capabilities;
3. low-power preference among valid adapters;
4. compatible discrete GPU fallback.

In many hybrid systems the low-power choice is the iGPU. This is a preference, not a vendor/device rule.

Do not force an iGPU if a coherent compatible dGPU path avoids harmful cross-adapter movement.

The same locality rule applies to accelerator decode: a nominal hardware-decode path is not preferred if interop/cross-adapter transfers make it physically worse.

## 14.2 Software fallback target

If no viable GPU path exists, the target architecture provides a software backend capable of basic correct viewing.

Before claiming “GPU not required,” verify at least:

- usable Product UI;
- ordinary SDR image display;
- Fit / Actual Size / Zoom / Pan;
- supported intrinsic orientation and alpha semantics;
- truthful errors/capabilities.

Advanced HDR/wide-gamut/performance capability may be unavailable.

**Current implementation note:** the locked PocketJS/PicoView Windows path currently depends on wgpu for presentation. Software fallback is a migration target, not an already-proved capability.

## 14.3 Runtime recovery is separate

Startup software fallback and seamless mid-session recovery from GPU device loss are separate features. Do not claim runtime backend migration unless implemented and tested.

---

# 15. Large images and truthful admission

Backend limits are runtime capabilities, not Image semantic limits.

A constant such as `8192` must not become “the maximum semantic image size” because one backend/default limit once used that value.

Possible truthful Product capability states include:

- `FullResolutionAvailable`;
- `FitProxyOnly`;
- `TiledOrVirtualized`;
- `UnsupportedOnCurrentBackend`.

The UI sees bounded capability such as `actualSizeAvailable`, not raw backend limits.

Silent destructive downsampling followed by pretending a proxy is full resolution is forbidden.

---

# 16. Error domains

Internal errors preserve origin at least across:

- Source;
- Decode provider/execution;
- Image semantic/interpretation;
- Resource admission/import/update;
- Rendering;
- Presentation.

They map at the Product boundary into bounded user-visible states.

A GPU/resource admission failure must not be relabeled as “decode failed,” and an accelerator-import failure must not redefine source-format truth.

---

# 17. CurrentItem boundary

CurrentItem answers:

> **Which logical item does Product currently consider published?**

It may own/reference source identity, `request_generation`, loading/ready/error status, logical display geometry, published opaque logical resource identity, view capability, last-good publication, and bounded Product error.

It must not own decoder implementation, color-management implementation, `content_revision`, backend texture/import representation, GPU adapter/device, surface/swapchain, DrawList renderer, directory enumeration, or TSX layout/input machinery.

---

# 18. BrowseSession boundary

BrowseSession owns authoritative neighbor order and compact candidate eligibility.

It does not decode every candidate to build the index, become a media database, own CurrentItem decode resources, own graphics resources, or redefine format/image semantics.

Current-image work outranks BrowseSession background work.

---

# 19. Replacement tests

Architecture boundaries are healthy when these substitutions remain local:

### Decoder provider change

```text
WIC CPU decode → another CPU decoder / hardware decoder / accelerator provider
```

Changes Image/provider integration, not Product view semantics or generic DrawList semantics.

### New format

```text
JPEG → AVIF / another admitted format
```

Does not add codec branches to generic PocketJS rendering.

### View change

```text
Fit → 100% → Zoom → Rotate
```

Changes Product view intent and generic draw parameters, not image resource content by default.

### Graphics backend change

```text
wgpu GPU backend → another GPU backend / verified software backend
```

Does not rewrite Product/Image semantics.

### Adapter change

```text
compatible iGPU → compatible dGPU
```

Does not change Product semantics.

### Static → animated content

Codec-specific frame/disposal semantics remain in Image; committed generic resource content updates advance PocketJS `content_revision` without inventing new Product request generations.

---

# 20. Current known implementation differentials

These are migration targets, not accepted design. Resolved 2026-09-16
(`PICOVIEW-DIRECT-IMAGE-ADMISSION-MIGRATION-1`, PocketJS integration revision
`24bab5e`): ordinary decodes now MOVE the decoder's own RGBA plane into
`Ui::upload_owned_rgba8` — no PSM-tagged seam on the PicoView path, no
aligned CPU texture storage for image admission (`TexBacking::Owned`), and
`pocket-ui-wgpu` borrows the Owned plane directly into `Queue::write_texture`
(no second RGBA vector). The ordinary Desktop image path satisfies ADR-0002.

Still open:

- current sampling preference is partly stored as texture state rather than purely generic draw policy;
- current `NATIVE_TEX_MAX_DIM` embeds a wgpu-default-class limit in core and PicoView uses it as an admission/downsample trigger;
- current giant-image path silently creates a reduced resource, so full-resolution capability needs truthful separation;
- current refresh/publication ordering may retire the previous resource before replacement admission succeeds;
- renderer/presentation authority is still partly implemented in PicoView host code (window/swapchain plumbing adapted from the portable desktop host; rendering itself is `pocket-ui-wgpu`);
- current Windows presentation path has no proved software renderer fallback;
- current color/alpha boundary is effectively RGBA8/PSM-oriented rather than the generic admission contract;
- current decode path always materializes CPU RGBA even though future accelerator-direct/import paths are allowed;
- existing generation/revision terminology must be split by authority.

---

# 21. Cross-repo rule

If PicoView needs a capability generic to runtime/graphics, implement it in `jnhu76/pocketjs` first, review/merge it there, then advance `POCKETJS.lock`.

Likely PocketJS work includes:

- backend-native/importable generic image admission;
- logical resource lifetime / `content_revision` ownership;
- representation-aware render contract;
- graphics backend selection/fallback;
- surface/presentation mechanics;
- generic sampling/draw realization;
- runtime/output capability reporting.

PicoView owns:

- format policy and decode orchestration;
- source/image semantics;
- CurrentItem publication;
- Fit/100%/Zoom/Pan/Rotate/Flip Product intent;
- navigation/browse semantics;
- source-fidelity policy;
- Product-visible errors/capabilities.

A hardware decoder/provider may require cross-repo/platform integration, but it must still obey these authorities. Do not patch a hidden local PocketJS fork inside PicoView.

---

# 22. Deferred optimization vs non-deferred correctness

Workload-driven choices may remain deferred: decoder provider tuning, texture/buffer pools, preload/cache, tiling algorithm, mip generation, specific hardware-decode APIs, upload staging, and UMA-specific tuning.

These properties are **not** deferred:

- no image bytes through QuickJS;
- no accidental full-plane copy merely because a semantic boundary exists;
- no redundant upload/import while valid residency exists merely because view/UI state changed;
- no stale Product request publication;
- no false 100% from a reduced proxy;
- no codec semantics in generic renderer;
- no backend/device semantics in PicoView Product/Image policy;
- no conflation of intrinsic orientation and user transform;
- no undefined alpha/color representation at resource admission;
- no Product ownership of PocketJS `content_revision`;
- no conflation of publication, logical lifetime, and physical residency;
- no conflation of semantic authority with CPU/GPU execution placement.

---

# 23. Stop-the-line invariants

Stop implementation and repair authority/design if continuing requires:

1. `O(image-bytes)` through QuickJS;
2. an unexplained full-image copy at a semantic boundary;
3. backend texture/device/import nouns as PicoView Product/Image semantics;
4. codec-specific branches in generic rendering;
5. a reduced proxy advertised as true 100%;
6. a view/UI state change causing redundant upload/import while valid residency exists;
7. stale `request_generation` publication;
8. Product/Image code setting PocketJS `content_revision` directly;
9. request/handle/content/device generations treated as interchangeable;
10. user Reset View discarding intrinsic source orientation;
11. fixed blending/color behavior silently reinterpreting an admitted representation;
12. last-good Product publication destroyed before replacement admission succeeds;
13. Product directly destroying backend physical storage;
14. PocketJS inventing Product Fit/100% policy;
15. CPU/GPU execution placement being used to redefine semantic authority;
16. Product and Architecture authority conflict.

A truthful blocker is preferable to a workaround that damages the architecture.

---

# 24. Design rule in one sentence

> **PicoView Product decides what the user wants; PicoView Image decides what the source means and orchestrates decoding; PocketJS Core owns the generic logical resource/draw contract; the selected backend physically realizes it on GPU or CPU. Execution placement may change, but semantic authority does not, and every O(N pixels) materialization/transfer needs a reason.**
# PicoView v1.1 Spec — Product / Image / Rendering Contract

Status: **CURRENT EXECUTION SPEC**  
Date: **2026-09-16**

This SPEC must satisfy both:

- Product authority: `docs/PRD/PicoView-PRD-v0.6.md`;
- Architecture authority: accepted ADRs and `docs/ARCHITECTURE.md`.

It may narrow an implementation slice but may not redefine either domain.

Superseded PRD/SPEC are archived under `docs/history/authority-reset-20260915/`.

---

## 1. Required semantic split

Implementation must preserve three authorities:

1. **Product / PicoView** — Open, CurrentItem, BrowseSession, Previous/Next, Fit, 100%, Zoom, Pan, Rotate/Flip, Refresh, capability, product errors.
2. **Image / PicoView native** — format policy, decoding, intrinsic orientation, alpha, precision, color/ICC, HDR/source characteristics, animation/frame/page semantics.
3. **Rendering / PocketJS** — generic resource identity/lifetime, DrawList, backend selection, backend-native storage/residency, sampling, transforms, composition, display adaptation, presentation, fallback.

No ticket may be closed by leaking one authority into another.

---

## 2. CPU control vs graphics realization

### CPU control/preparation

CPU-side authority includes source access, decode/image interpretation, product state/navigation, component state/layout/input, view-state calculation, and DrawList generation.

### Graphics realization

Final pixels are produced by the active graphics backend.

A GPU backend is the primary image/display path. It may also rasterize UI primitives from the same DrawList.

A software backend may rasterize both UI and image content on CPU.

**The spec does not require UI pixels to be CPU-rasterized or GPU-rasterized.** It requires UI semantics/layout to remain CPU-side and final rasterization to remain a backend concern.

Do not build a separate CPU UI bitmap→GPU upload path solely because UI semantics are CPU-side.

---

## 3. Coordinate and transform contract

Implementation must expose or internally preserve these distinct spaces:

- source sample space `S`;
- intrinsically oriented logical image space `O`;
- user-transformed image space `U`;
- UI logical/DIP viewport space `L`;
- physical presentation pixel space `P`.

The transform order is:

```text
S --intrinsic orientation--> O
O --user rotate/flip-------> U
U --Fit/Zoom/Pan-----------> L
L --DPI/output scale-------> P
```

Reset View clears user-controlled view state but does not clear intrinsic source orientation.

### 100% / Actual Size

At 100%:

```text
1 logical image sample = 1 physical presentation pixel in scale
```

If `d = physical_pixels_per_UI_logical_unit`, then:

```text
UI_logical_units_per_image_sample = 1 / d
```

Therefore implementation must not draw an image as `image_width DIP` and then allow DPI scaling to turn one image sample into multiple physical pixels while still calling that state 100%.

A reduced proxy must never be reported as true 100%.

### Fit

Fit uses the complete post-intrinsic/post-user-transform logical image bounds and available physical viewport to determine scale while preserving aspect ratio.

### Zoom / Pan

Zoom and Pan modify bounded draw/view state only. They must not cause decode restart, full-image CPU resample, or resource re-admission by themselves.

---

## 4. QuickJS contract

QuickJS carries bounded semantic state only.

Allowed examples include opaque resource identity, oriented/logical dimensions, loading/status, request generation, view capability, zoom/pan state, bounded metadata, and bounded product errors.

Forbidden normal-path payloads include full encoded files, decoded multi-megapixel pixel planes, giant ArrayBuffer/base64 equivalents, decoder-specific objects, and backend texture/device objects.

`O(image-bytes)` crossing QuickJS is a stop-the-line failure.

---

## 5. Image decode and semantic contract

A decoder implementation may vary, but the image boundary must preserve every fact still required for correct interpretation or presentation.

Do not flatten every format into an unconditional universal `RGBA8 sRGB` product contract.

The image side must be able to provide, when relevant:

- source/storage extent;
- intrinsic orientation;
- pixel representation and precision;
- owned/borrowed pixel or resource storage;
- alpha semantics;
- color description/profile semantics;
- HDR/source characteristics;
- frame/page structure;
- animation timing/composition facts.

Decoder-specific nouns stop at the image-semantic boundary.

---

## 6. Generic render-image admission contract

PocketJS must expose a generic image-resource admission mechanism whose result is an opaque logical resource identity consumable by existing composition.

The generic semantic description must be able to represent at least:

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

Exact Rust type names are not frozen.

### Alpha

The renderer must not apply a fixed blend interpretation to unknown alpha semantics. Admitted alpha representation and renderer blend behavior must agree.

### Color

The boundary must preserve enough generic information for correct display adaptation without leaking codec-specific metadata into generic rendering.

### Intrinsic orientation

If source orientation is not materialized into pixel storage, its generic logical transform must survive admission/draw.

---

## 7. Resource lifecycle contract

A normal replacement resource follows:

```text
DecodedCandidate
→ AdmissionPending
→ Admitted
→ Published
→ Retired
→ Released
```

Rules:

- candidate CPU storage has one explicit owner or borrow contract;
- QuickJS/TSX holds only a non-owning opaque resource identity;
- PocketJS owns logical resource lifetime/stale-handle protection;
- the backend owns physical residency and in-flight rendering leases;
- final release waits until no in-flight backend work can dereference physical storage.

### Refresh / last-good

For refresh of an already published item:

```text
old Published remains valid
→ candidate decode/admission succeeds
→ atomic publication swap
→ old resource retires
```

If candidate decode/admission fails, last-good remains published when Product policy requires it.

Do not retire last-good before replacement admission succeeds.

### Navigation-to-error

Navigation to a new bad item may publish an error item and retire the old item according to Product policy. That is distinct from refresh semantics.

---

## 8. Full-image copy and encoded-source movement contract

For every `O(image-pixels)` handoff, move/borrow is the default.

A full-plane copy requires a named reason such as unavoidable pixel-format conversion, color transform, alpha conversion, frame composition, orientation materialization, backend row/layout conversion, device transfer, or explicit readback/export.

For a canonical static image whose decoded CPU representation is already accepted by the selected resource path:

- avoidable post-decode CPU full-plane copies = **0**;
- GPU→CPU readback = **0** unless an explicit feature requires it;
- view/UI changes do not themselves create new image content or resource admission.

Large encoded payloads should also avoid unnecessary whole-file duplication where streaming, move, mapped access, or bounded buffering is sufficient. Streaming is not mandatory; unexplained repeated whole-file copies are not acceptable.

---

## 9. Residency-aware upload contract

Do not encode “one upload forever.”

For the same:

```text
logical resource identity
+ content_revision
+ device_generation
```

an existing valid backend residency must be reused.

A new full upload is legitimate after a named event such as first residency creation, content revision, explicit eviction/residency loss, device recreation, deliberately different proxy/full-resolution/tiled admission, or required representation conversion.

While valid residency exists, these events alone must **not** cause redundant full upload:

- Zoom;
- Pan;
- Fit;
- Actual Size toggle;
- window resize;
- DPI move;
- UI rerender;
- presentation-only Rotate/Flip.

Backend eviction/residency state is not product generation.

---

## 10. Generations and revisions

Keep distinct:

- `request_generation` — product latest-wins publication ordering;
- `handle_generation` — stale resource-handle protection;
- `content_revision` — changed content under stable resource identity;
- `device_generation` — backend/device recreation domain.

A stale request generation must never publish over a newer request.

Animation should normally preserve logical resource identity and advance `content_revision` instead of manufacturing new request/handle generations for every frame.

Backend-private residency epochs may exist but must not leak as another product generation.

---

## 11. View semantics

### Fit

- preserve aspect ratio;
- use the complete logical image bounds after intrinsic orientation and user rotate/flip;
- remain presentation state rather than source mutation.

### Actual Size / 100%

- use the physical-pixel definition from §3;
- require truthful full-resolution capability;
- never report a reduced proxy as true 100%.

### Zoom / Pan

- represented as bounded view/draw state;
- no decode/resource rewrite solely because scale/position changed.

### Rotate / Flip

- user transform occurs after intrinsic source orientation;
- presentation transform by default;
- full-plane materialization only for a named correctness reason or explicit export/save feature.

### Reset View

- clear user transform/view state;
- preserve intrinsic source orientation.

---

## 12. Backend and fallback contract

### GPU selection

On native Windows, GPU selection follows:

1. target-surface compatibility;
2. required capabilities;
3. low-power preference among valid adapters;
4. compatible discrete GPU fallback.

Avoid harmful cross-adapter movement merely to force a nominal iGPU preference.

PicoView Product/Image code must not select a vendor adapter directly.

### Software fallback

Before PicoView may claim **GPU not required**, a verified software path must provide at least:

- usable product UI;
- ordinary SDR image display;
- Fit / 100% / Zoom / Pan;
- supported source orientation and alpha semantics;
- truthful errors/capabilities.

Advanced color/HDR/performance may be unavailable.

Until that path exists, the current implementation is operationally GPU-required even though the target architecture is GPU-first/not-GPU-required.

Startup fallback and seamless mid-session GPU-device-loss migration are separate features. Do not claim the latter without explicit implementation/tests.

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

A format is not product-supported solely because the active decoder opens it.

The format matrix must assess relevant dimensions: decode, intrinsic orientation, alpha, color/ICC, precision, HDR, animation, frame/page behavior, corrupt-input behavior, and large-image/full-resolution behavior.

Adding a codec must not require TSX image primitives or generic renderer codec branches unless the existing generic contract is proven insufficient.

---

## 15. Error domains

Internal errors preserve origin at least across:

- Source;
- Decode;
- Image semantic/interpretation;
- Resource admission;
- Rendering;
- Presentation.

They map at the Product boundary into bounded user-visible states.

A resource-admission failure must not be mislabeled as a decoder failure.

---

## 16. CurrentItem contract

CurrentItem may coordinate product publication and reference an opaque image resource.

It may own/reference source identity, request generation, status, logical display geometry, published resource identity, product capability, last-good publication, and bounded error.

It must not own decoder implementation, color-management implementation, GPU adapter/device, backend texture representation, surface/presentation, DrawList rendering, directory enumeration, or TSX layout/input machinery.

---

## 17. Acceptance replacements

Architecture boundaries are healthy when:

- WIC → another decoder does not rewrite TSX/DrawList/rendering semantics;
- JPEG → AVIF/another admitted format does not add codec branches to generic rendering;
- wgpu backend → another graphics implementation does not rewrite PicoView product/image semantics;
- compatible iGPU → compatible dGPU does not change product semantics;
- GPU startup unavailable → verified software backend preserves basic truthful viewing;
- static → animated resource keeps codec-specific disposal out of TSX and uses content revision appropriately.

---

## 18. Stop-the-line conditions

Stop implementation if any of these appear:

- image bytes cross QuickJS;
- one logical image is copied wholesale at a layer boundary without a named reason;
- PicoView Product/Image code imports backend texture/device semantics;
- generic renderer branches on JPEG/PNG/GIF/PicoView nouns;
- 100% is claimed from a reduced proxy or DPI-scaled incorrectly;
- user Reset View removes intrinsic orientation;
- alpha/color representation is undefined at resource admission;
- last-good refresh resource is destroyed before candidate admission succeeds;
- view/UI state causes redundant full upload while valid residency exists;
- stale request generation can publish;
- request/handle/content/device generation concepts are conflated;
- Product and Architecture authority contradict each other.

Resolve authority/design first; do not hide the conflict in implementation.

---

## 19. Historical authority

Superseded current-authority snapshots live under:

`docs/history/authority-reset-20260915/`

They are history/evidence only and do not govern current implementation.
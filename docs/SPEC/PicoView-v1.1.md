# PicoView v1.1 Spec — Product / Image / Rendering Contract

Status: **CURRENT EXECUTION SPEC**  
Date: **2026-09-15**

This document supersedes `docs/SPEC/PicoView-v1.md` as current execution authority. The older spec remains historical context.

This SPEC must satisfy both:

- current Product authority: `docs/PRD/PicoView-PRD-v0.6.md`;
- current Architecture authority: accepted ADRs and `docs/ARCHITECTURE.md`.

It may narrow an implementation slice but may not redefine either domain.

---

## 1. Required semantic split

PicoView implementation must preserve three authorities:

1. **Product semantics / PicoView** — Open, CurrentItem, BrowseSession, Previous/Next, Fit, 100%, Zoom, Pan, Rotate/Flip, Refresh, capability and product errors.
2. **Image semantics / PicoView native** — format policy, decoding, orientation, alpha, precision, color/ICC, HDR/source characteristics, animation/frame/page semantics.
3. **Rendering semantics / PocketJS** — generic resource identity/lifetime, DrawList, backend selection, backend-native storage, transforms, sampling, composition and presentation.

No implementation may satisfy a ticket by leaking one authority into another.

---

## 2. Required runtime split

### CPU control/preparation

- file/source access;
- decode and image interpretation;
- product state and navigation;
- TSX/component state, layout, input and gestures;
- view transform calculation;
- DrawList generation.

### Graphics backend

- image resource residency;
- upload/admission;
- sampling and scaling;
- zoom/pan/rotate/flip rendering;
- UI and image composition;
- display adaptation;
- surface/presentation.

GPU is the normal graphics path. Software rendering is the final fallback where correct product behavior remains possible.

---

## 3. QuickJS contract

QuickJS carries bounded semantic state only.

Allowed examples:

- opaque image handle/id;
- dimensions;
- loading/status state;
- view capability;
- zoom/pan/view state;
- small metadata;
- bounded product errors.

Forbidden normal-path payloads:

- full encoded image files;
- decoded multi-megapixel pixel planes;
- giant ArrayBuffer/base64 equivalents;
- decoder-specific objects;
- backend texture/device objects.

`O(image-bytes)` crossing QuickJS is a stop-the-line failure.

---

## 4. Image decode contract

A decoder implementation may vary, but its product/image-semantic output must preserve every fact still required for correct interpretation or presentation.

Do not flatten every format into an unconditional universal `RGBA8 sRGB` product contract.

The image boundary must be able to represent, when relevant:

- extent;
- pixel representation/precision;
- owned pixel/resource data;
- orientation;
- alpha semantics;
- color description / profile identity needed for transformation;
- HDR/source characteristics;
- frame/page structure;
- animation timing/composition facts.

Exact Rust types are intentionally not frozen here.

---

## 5. Resource-admission contract

PicoView does not pass codec nouns or PocketJS legacy texture representation details as product semantics.

PocketJS must expose a generic image-resource admission mechanism whose output is an opaque resource identity consumable by existing composition.

The architecture prefers:

```text
PicoView image facts / owned pixels
        ↓ move or borrow
PocketJS generic admission
        ↓
backend-native physical resource
        ↓
opaque image resource identity
        ↓
DrawList
```

Do not add a second compositor or PicoView-only DrawList path unless evidence proves the generic resource model cannot express the requirement.

---

## 6. Full-image copy contract

For every `O(image-pixels)` handoff, move/borrow is the default.

A full-plane copy requires a named reason.

Named legitimate reasons may include:

- unavoidable pixel-format conversion;
- color transform;
- frame composition;
- orientation materialization when transform-only presentation cannot satisfy semantics;
- backend row/alignment/layout requirement;
- CPU→GPU/device transfer;
- explicit feature requiring readback/export.

For a canonical static image whose decoded CPU representation is already acceptable to the selected backend:

- avoidable post-decode CPU full-plane copies: **0**;
- ordinary full-resource GPU admission/upload: **1 per resource identity/content/device generation**;
- zoom/pan/Fit/100%/resize/UI rerender must not cause re-upload by themselves;
- GPU→CPU readback: **0** unless an explicit feature requires it.

A fit proxy and a later full-resolution/tiled resource are different resource admissions and therefore not a violation.

---

## 7. View semantics

### Fit

- preserve aspect ratio;
- fit the complete logical image inside the image viewport;
- perform as presentation transform, not source mutation.

### 100% / Actual Size

- represents truthful source/logical-image pixel inspection;
- may be unavailable when the current admitted resource cannot provide it;
- a proxy image must never be reported as true 100%.

### Zoom / Pan

- represented as view state / DrawList parameters;
- no decode or full-plane mutation solely because view scale/position changes.

### Rotate / Flip

- presentation transform by default;
- non-destructive;
- resource rewrite only when required by a named correctness constraint or explicit save/export feature.

---

## 8. Generations and publication

Keep these concepts distinct:

- `request_generation` — product latest-wins publication ordering;
- `handle_generation` — stale handle protection;
- `content_revision` — changed content under stable resource identity;
- `device_generation` — backend/device recreation when relevant.

A stale request generation must never publish over a newer request.

Animation should normally preserve logical resource identity and advance content revision instead of manufacturing a new product request/handle generation for each frame.

---

## 9. Adapter/backend selection

On native Windows, renderer backend selection must prefer:

1. target-surface compatibility;
2. required capabilities;
3. low-power adapter among valid choices;
4. compatible discrete GPU when low-power path is unavailable/inadequate;
5. software CPU fallback if no usable GPU path exists and correct product behavior can still be delivered.

Avoid cross-adapter movement merely to force a nominal iGPU preference.

PicoView image/product code must not select a vendor adapter directly.

---

## 10. Rendering fidelity

Rendering must preserve source meaning as far as current backend/display capability allows.

Forbidden silent behavior:

- destructive downsample then claim Actual Size;
- unnecessary precision/gamut loss solely for API convenience;
- implicit HDR→SDR redefinition of source truth;
- source mutation for view commands.

Display adaptation is allowed and expected when the target display cannot reproduce source characteristics directly.

HDR/wide-gamut product promises are controlled by the current PRD/format matrix; the architecture must preserve the semantics necessary to add them without violating boundaries.

---

## 11. Format-support contract

A format is not considered product-supported solely because the active decoder opens it.

The format matrix must assess relevant dimensions:

- decode;
- orientation;
- alpha;
- color/ICC;
- precision;
- HDR;
- animation;
- frame/page behavior;
- corrupt-input behavior;
- large-image/full-resolution behavior.

Adding a new codec must not require changes to TSX image primitives or generic DrawList semantics unless the existing generic contract is proven insufficient.

---

## 12. Error domains

Internal errors must preserve origin at least across:

- Source;
- Decode;
- Image semantic/normalization;
- Resource admission;
- Rendering;
- Presentation.

They are mapped at the product boundary into bounded user-visible states.

A resource-admission failure must not be mislabeled as a decoder failure.

---

## 13. CurrentItem contract

CurrentItem may coordinate publication but must not become a God Object.

It may own/reference:

- source identity;
- request generation;
- status;
- logical display geometry;
- published opaque image resource identity;
- product capability;
- last-good publication;
- bounded error.

It must not own the implementation of:

- WIC or another decoder;
- ICC/color engine;
- GPU device/adapter;
- backend texture representation;
- surface/presentation;
- DrawList renderer;
- directory enumeration;
- TSX layout/input machinery.

---

## 14. Acceptance replacements

Architecture boundaries are considered healthy when these substitutions remain local:

- WIC → another decoder: no TSX/DrawList/rendering-semantic rewrite;
- JPEG → AVIF/other supported format: no codec branches in generic renderer;
- wgpu backend implementation change: no PicoView decoder/product rewrite;
- compatible iGPU → compatible dGPU: no product-semantic change;
- GPU backend unavailable → software renderer: degraded performance/capability may occur, but product state remains truthful;
- static → animated resource: animation mechanics do not leak codec-specific disposal semantics into TSX.

---

## 15. Stop-the-line conditions

Stop implementation when any of these appear:

- image bytes cross QuickJS;
- one logical image is copied wholesale at a layer boundary without a named reason;
- PicoView product code imports backend texture/device nouns;
- generic renderer branches on JPEG/PNG/GIF/PicoView nouns;
- 100% is claimed from a reduced proxy;
- zoom/pan/resize causes redundant full-resource upload;
- stale request generation can publish;
- adapter choice is hard-coded by vendor from PicoView product code;
- Product and Architecture authorities contradict each other.

Resolve authority first; do not hide the conflict in implementation.

---

## 16. Historical documents

The following remain evidence/history but are not current execution authority:

- `docs/PRD/PicoView-PRD-v0.5.md`;
- `docs/SPEC/PicoView-v1.md`;
- prior architecture campaign evidence and old gate plans.

Current work starts from v0.6 PRD + ADR-0001 + current ARCHITECTURE + this SPEC.
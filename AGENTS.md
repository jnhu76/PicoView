# AGENTS.md

## Mission

Build **PicoView**, a fast, small, focused Windows 11 local image viewer on PocketJS.

The current architecture is defined by:

- Product authority: `docs/PRD/PicoView-PRD-v0.6.md`
- Architecture decisions: `docs/ADR/`
- Detailed architecture/program semantics: `docs/ARCHITECTURE.md`
- Execution contract: `docs/SPEC/PicoView-v1.1.md`
- Current operational state: `CONTEXT.md`

Older PRD/SPEC/architecture-campaign documents are history/evidence unless explicitly reactivated. Do not let an older architecture assumption override current authority.

---

## Read before changing code

Read, in this order:

1. `docs/PRD/PicoView-PRD-v0.6.md` for product meaning;
2. relevant accepted ADRs in `docs/ADR/`;
3. `docs/ARCHITECTURE.md` for ownership/program semantics;
4. `docs/SPEC/PicoView-v1.1.md` for executable contracts;
5. `CONTEXT.md` for current phase/state;
6. `docs/ROADMAP.md` and the assigned GitHub issue for sequencing;
7. `POCKETJS.lock` when runtime/graphics behavior is involved;
8. relevant PocketJS code/contracts at that exact locked revision;
9. `docs/BENCHMARK.md` when making a physical performance/memory claim.

There is **no single total authority ranking across unrelated domains**.

- PRD owns product promises.
- ADR/ARCHITECTURE own architecture.
- SPEC must satisfy both.
- operational docs/issues cannot redefine either.

If Product and Architecture authorities genuinely conflict, stop and repair authority. Do not choose a convenient winner in code.

---

## Core architecture model

### Three semantic authorities

**PicoView Product** owns what the user means:

- Open / CurrentItem / BrowseSession;
- Previous / Next;
- Fit / Actual Size / 100%;
- Zoom / Pan;
- Rotate View / Flip View / Reset View;
- Fullscreen / Refresh;
- product capability and product errors.

**PicoView Image** owns what the source means:

- format policy;
- source I/O / decoder orchestration;
- dimensions;
- frame/page structure;
- orientation;
- alpha;
- precision / bit depth;
- color / ICC semantics;
- HDR/source characteristics;
- animation semantics.

**PocketJS Graphics/Runtime** owns generic presentation mechanics:

- opaque image-resource identity/lifetime;
- DrawList;
- backend selection;
- backend-native storage;
- upload/residency;
- sampling/transforms/clipping/blending;
- UI + image composition;
- display adaptation;
- surface/presentation;
- software fallback.

One fact has one authority.

---

## Two execution planes

### CPU control/preparation plane

- product state;
- source access/decode;
- image interpretation;
- UI state/layout/input;
- view-state calculation;
- DrawList generation.

### GPU graphics plane

Normal path:

- image residency;
- sampling/scaling;
- zoom/pan/rotate/flip presentation transforms;
- UI + image composition;
- display adaptation;
- presentation.

PicoView is **GPU-first, not GPU-required**. Software rendering is the final fallback where correct product behavior can still be provided.

Do not interpret “UI is CPU-side” as authority to build a CPU bitmap compositor. UI policy/state is CPU-side; final UI/image raster/composition may be GPU-side.

---

## Non-negotiable hard boundaries

### QuickJS

`O(image-bytes)` never crosses QuickJS in the normal viewer path.

Allowed: opaque handle/id, dimensions, state, view capability, bounded metadata/errors.

Forbidden: encoded files, decoded multi-megapixel pixel planes, giant ArrayBuffers/base64, decoder objects, GPU resources, backend texture/device internals.

### Large-object ownership

A semantic boundary is not a memcpy boundary.

For every `O(image-pixels)` handoff:

- move ownership or borrow by default;
- a full-plane copy requires a named semantic/physical reason.

For an already backend-acceptable static decoded representation:

- avoidable post-decode CPU full-plane copy = 0;
- full-resource upload = once per resource identity/content/device generation;
- zoom/pan/Fit/100%/resize/UI rerender does not itself re-upload the image;
- GPU readback = 0 unless an explicit feature requires it.

### Source truth

Fit/Zoom/Pan/Rotate View/Flip View are presentation operations by default.

Do not silently:

- downsample and call it 100%;
- drop precision/gamut/HDR semantics for API convenience;
- mutate the source file for view commands.

### Backend isolation

PicoView product/image code must not depend on backend texture/device nouns such as `wgpu::Texture`, vendor adapter IDs, legacy PSM representation, swapchain details, etc.

PocketJS generic renderer must not branch on JPEG/PNG/GIF/PicoView nouns.

---

## Resource identity and generation discipline

Keep these concepts distinct:

- `request_generation` — latest-wins product publication;
- `handle_generation` — stale resource-handle protection;
- `content_revision` — changed content under stable resource identity;
- `device_generation` — backend/device resource-domain recreation.

Do not use a generic `generation` variable when the authority is ambiguous.

A stale request may finish unavoidable work but may never publish over a newer request.

Animation normally advances content revision under stable product/resource identity rather than creating a new request generation for every frame.

---

## Graphics backend / adapter rule

Native Windows priority:

1. compatible with the target presentation surface;
2. required capabilities satisfied;
3. prefer low-power adapter among valid choices (normally iGPU on hybrid systems);
4. otherwise compatible discrete GPU;
5. software CPU renderer as final fallback.

Do not hard-code Intel/AMD/NVIDIA selection in PicoView.

Do not force iGPU if doing so creates a worse cross-adapter presentation/resource path than a coherent compatible dGPU path.

---

## Format support discipline

`decoder can open X != PicoView supports X`.

For an advertised format, account for relevant dimensions:

- decode;
- orientation;
- alpha;
- color/ICC;
- precision;
- HDR;
- animation;
- multi-frame/page behavior;
- corrupt input;
- large-image/full-resolution behavior.

Adding/replacing a decoder must not require TSX or generic renderer codec branches.

---

## CurrentItem boundary

CurrentItem may coordinate current product publication and reference an opaque image resource.

It must not become the implementation owner of:

- decoder internals;
- ICC/color engine;
- animation renderer internals;
- GPU adapter/device;
- backend texture representation;
- surface/presentation;
- DrawList rendering;
- directory enumeration;
- TSX layout/input.

---

## Cross-repo rule

PicoView consumes `jnhu76/pocketjs` at the exact revision pinned in `POCKETJS.lock`.

If PicoView needs a **generic runtime/graphics capability**, implement it in PocketJS first, review/merge there, then advance `POCKETJS.lock`.

Likely PocketJS work:

- generic backend-native image admission;
- image resource lifetime/revision;
- graphics backend selection/fallback;
- surface/presentation mechanics;
- generic image DrawList/sampling behavior.

Likely PicoView work:

- format policy and decoder orchestration;
- CurrentItem publication;
- Fit/100% product semantics;
- navigation/browse semantics;
- product capability/errors;
- source-fidelity policy.

No vendored/hidden PocketJS copy in PicoView.

---

## Windows evidence environment

PicoView is a Windows product.

Windows host/WIC/DPI/wgpu/presentation/process-memory/package evidence must come from **native Windows**.

WSL is acceptable for reading, repository inspection and non-Windows helper work, but it cannot close Windows runtime behavior.

Physical evidence records exact PicoView SHA, PocketJS SHA, build/toolchain and machine/GPU identity according to `docs/BENCHMARK.md`.

---

## Ticket discipline

Before coding:

- confirm the issue is executable, not blocked/spec-only;
- read current Product + Architecture + SPEC authority;
- identify which semantic authority owns every changed fact;
- state the exact PocketJS locked revision for runtime work;
- identify every potential `O(image-pixels)` allocation/copy/upload introduced by the change;
- identify whether a generic capability belongs upstream in PocketJS.

During coding:

- keep large ownership explicit;
- keep stale work cancellable;
- keep guest/native messages bounded;
- keep codec semantics out of generic graphics;
- keep backend nouns out of PicoView product/image policy;
- prefer deletion/move/borrow over another storage layer;
- do not broaden the issue silently.

Before completion:

- run the issue acceptance checks;
- verify replacement boundaries still hold;
- verify no new unexplained full-plane copies/uploads exist;
- verify no stale publication path exists;
- update authority docs if a frozen assumption is disproved;
- leave the worktree clean.

---

## Stop-the-line rules

Stop and report a concrete blocker if continuing requires any of the following:

- image bytes through QuickJS;
- an unexplained full-plane copy at a layer boundary;
- backend texture/device semantics in PicoView product/image authority;
- codec-specific branches in generic PocketJS rendering;
- pretending a reduced proxy is 100%;
- redundant full upload caused only by view/UI state;
- conflating request generation / handle generation / content revision;
- stale request publication;
- hard-coding a GPU vendor from PicoView;
- violating source fidelity to simplify an API;
- Product/Architecture authority conflict;
- a hidden local PocketJS fork/workaround.

A truthful blocked result is preferable to an architecture violation.

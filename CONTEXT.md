# PicoView Context

## Current phase

PicoView is in **CODE-REALITY CONFORMANCE**.

The viewer authority reset closed (PR #51, `528d3d8`). Campaign
`PICOVIEW-DESKTOP-WGPU-CONFORMANCE-CLEANUP-1` (2026-09-16) then executed the
R1 Desktop image-path audit and the owner-authorized subtractive subset of
R3: the PicoView-side full-plane clone before PocketJS admission was removed
(ordinary decodes admit the decoder's own RGBA plane by borrow), and
resource-admission failures are no longer reported as decode failures.

The next work is the generic PocketJS seam: direct desktop/wgpu image
admission (R2-A / `POCKETJS-DESKTOP-DIRECT-IMAGE-ADMISSION-1`), implemented
and reviewed in `jnhu76/pocketjs` first, then `POCKETJS.lock` advances
deliberately, then the remaining PicoView-side corrections apply (R3).

---

## Current authority

- Product: `docs/PRD/PicoView-PRD-v0.6.md`
- Architecture: `docs/ADR/` + `docs/ARCHITECTURE.md`
- Execution: `docs/SPEC/PicoView-v1.1.md`
- Agent policy: `AGENTS.md`
- Sequencing: `docs/ROADMAP.md`
- PocketJS source identity: `POCKETJS.lock`

Operational documents do not redefine Product or Architecture semantics.

Superseded authority is archived under `docs/history/authority-reset-20260915/`.

---

## Accepted architecture decisions

### ADR-0001 — Viewer / Image / Rendering Authority

The frozen authority model is:

- PicoView Product owns user/current-item/view intent;
- PicoView Image owns source/image meaning and decode orchestration;
- PocketJS Core owns logical resource identity/lifetime/revision and generic draw contract;
- Graphics Backend owns physical storage/residency and final rendering/presentation;
- CPU/GPU/hardware accelerators are execution locations, not semantic authorities.

Publication, logical lifetime, and physical residency are separate facts. `content_revision` has one owner: PocketJS Core.

### ADR-0002 — Desktop/wgpu Direct Image Admission

For the normal Windows/Desktop path, PicoView follows PocketJS's established Desktop→`pocket-ui-wgpu` backend choice.

When CPU decode already produces RGBA8 directly consumable by the wgpu path, the target physical path is:

```text
decoder-owned RGBA8
→ PocketJS generic logical admission
→ direct wgpu upload/admission
→ wgpu::Texture residency
```

The following legacy-shaped path is **not** target design:

```text
decoded RGBA8
→ full PSM_8888/portable Core copy
→ another full RGBA8 copy
→ wgpu upload
```

`PSM_8888` may remain valid for PocketJS backends/workloads that need it. It is not the canonical native Desktop image representation.

Desktop backend rule:

> **Direct if already admissible; fuse required conversion into final backing where practical; materialize a full intermediate only for a named physical/correctness reason.**

This does not bypass PocketJS Core authority and does not create a second image handle/compositor.

---

## Architecture review status

The architecture reset passed successive adversarial reviews after correcting:

- Product/backend policy leakage;
- UI semantic state vs UI rasterization placement;
- coordinate spaces / 100% DPI semantics;
- intrinsic orientation vs user Rotate/Flip;
- generic color/alpha/precision admission semantics;
- last-good replacement ordering;
- residency-aware upload rules;
- target-vs-current software fallback claims;
- decode semantics/orchestration vs execution placement;
- Product view intent vs backend transform realization;
- Product publication vs PocketJS logical lifetime vs Backend residency;
- single ownership of `content_revision`.

The remaining work is implementation conformance, not another architecture reset unless evidence disproves an accepted assumption.

---

## Current known implementation differentials

Remaining differentials after `PICOVIEW-DESKTOP-WGPU-CONFORMANCE-CLEANUP-1` (2026-09-16) — audit-confirmed, migration targets only:

- PicoView admits decoded images through the locked-revision PSM-tagged core seam (`register_native_texture`); the PicoView-side pre-registration full-plane clone is gone;
- PocketJS Core materializes aligned CPU texture storage before wgpu;
- wgpu materializes another RGBA buffer even for an already-RGBA8/`PSM_8888` path;
- the current normal Desktop path therefore does not yet satisfy ADR-0002 direct admission (requires the upstream generic seam);
- sampling is partly stored with texture state rather than generic draw state;
- `NATIVE_TEX_MAX_DIM`/8192 leaks backend/default assumptions into image admission;
- giant images are reduced before publication without a fully separated full-resolution capability;
- refresh/publication ordering currently risks retiring old state before replacement admission succeeds;
- renderer/presentation authority is still partly in PicoView host code (window/swapchain plumbing adapted from the portable desktop host; rendering itself is `pocket-ui-wgpu`);
- current Windows path has no proved software fallback;
- current color/alpha admission is effectively PSM/RGBA8-oriented rather than the generic architecture contract;
- current decode path always materializes CPU RGBA and has no accelerator-direct/import path;
- generation/revision terminology/authority remains mixed in code.

These are differentials, not target design.

---

## Near-term sequence

1. ~~audit current PicoView + exact locked PocketJS code against ADR-0001/ADR-0002/Architecture/SPEC~~ (done — conformance-cleanup-1, 2026-09-16);
2. ~~trace every image-sized allocation/copy/upload/import/lifetime~~ (done — evidence doc, P0–P5 chain);
3. prove the current Desktop RGBA8→PSM_8888→RGBA8→wgpu chain and identify the smallest generic PocketJS seam that removes it (done at audit level — seam identified below);
4. split findings into PocketJS-generic corrections vs PicoView-specific corrections (done — see evidence doc findings table);
5. implement/review generic PocketJS corrections first: `POCKETJS-DESKTOP-DIRECT-IMAGE-ADMISSION-1` — extend the native image seam so an admissible RGBA8 plane becomes wgpu residency without the portable core-copy detour and without a second handle namespace;
6. advance `POCKETJS.lock` deliberately;
7. then apply remaining PicoView-specific Product/Image corrections (truthful full-resolution capability, refresh/last-good ordering, generic color/alpha admission).

Do not preserve `PSM_8888` in the native Desktop path merely because the current API already exposes it.

---

## Evidence environment

Windows runtime evidence remains native-Windows authority.

WSL may be used for reading/repository work, but it cannot close WIC, Windows DPI, wgpu presentation, adapter, process-memory, or packaging claims.

Physical performance claims follow `docs/BENCHMARK.md` and record exact PicoView/PocketJS SHAs, toolchain, OS, and machine/GPU identity.
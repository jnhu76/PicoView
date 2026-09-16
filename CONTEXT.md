# PicoView Context

## Current phase

PicoView is in **POST-ARCHITECTURE-RESET / CODE-REALITY PREPARATION**.

The viewer authority reset has completed. PR #51 was squash-merged on 2026-09-16 as commit `528d3d849e823f3d5c017906584fc97dd57c8303`; control issue #50 is closed.

The next work is to audit current PicoView + exact locked PocketJS code against the accepted architecture, then implement proven generic graphics corrections in PocketJS before advancing `POCKETJS.lock`.

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

Current code predates the frozen architecture. Known R1 audit targets include:

- PicoView imports PocketJS PSM representation for native image registration;
- ordinary decoded images are cloned before resource registration;
- PocketJS Core materializes aligned CPU texture storage before wgpu;
- wgpu materializes another RGBA buffer even for an already-RGBA8/`PSM_8888` path;
- the current normal Desktop path therefore does not yet satisfy ADR-0002 direct admission;
- sampling is partly stored with texture state rather than generic draw state;
- `NATIVE_TEX_MAX_DIM`/8192 leaks backend/default assumptions into image admission;
- giant images are reduced before publication without a fully separated full-resolution capability;
- resource-admission failure can be mislabeled as decode failure;
- refresh/publication ordering currently risks retiring old state before replacement admission succeeds;
- renderer/presentation authority is still partly in PicoView host code;
- current Windows path has no proved software fallback;
- current color/alpha admission is effectively PSM/RGBA8-oriented rather than the generic architecture contract;
- current decode path always materializes CPU RGBA and has no accelerator-direct/import path;
- generation/revision terminology/authority remains mixed in code.

These are differentials, not target design.

---

## Near-term sequence

1. audit current PicoView + exact locked PocketJS code against ADR-0001/ADR-0002/Architecture/SPEC;
2. trace every image-sized allocation/copy/upload/import/lifetime;
3. specifically prove the current Desktop RGBA8→PSM_8888→RGBA8→wgpu chain and identify the smallest generic PocketJS seam that removes it;
4. split findings into PocketJS-generic corrections vs PicoView-specific corrections;
5. implement/review generic PocketJS corrections first;
6. advance `POCKETJS.lock` deliberately;
7. then apply PicoView-specific Product/Image corrections.

Do not preserve `PSM_8888` in the native Desktop path merely because the current API already exposes it.

---

## Evidence environment

Windows runtime evidence remains native-Windows authority.

WSL may be used for reading/repository work, but it cannot close WIC, Windows DPI, wgpu presentation, adapter, process-memory, or packaging claims.

Physical performance claims follow `docs/BENCHMARK.md` and record exact PicoView/PocketJS SHAs, toolchain, OS, and machine/GPU identity.
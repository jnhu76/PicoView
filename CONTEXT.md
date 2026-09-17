# PicoView Context

## Current phase

PicoView is in **CODE-REALITY CONFORMANCE**.

The viewer authority reset closed (PR #51, `528d3d8`). Campaign
`PICOVIEW-DESKTOP-WGPU-CONFORMANCE-CLEANUP-1` (2026-09-16) then executed the
R1 Desktop image-path audit and the owner-authorized subtractive subset of
R3: the PicoView-side full-plane clone before PocketJS admission was removed
(then still by borrow into the legacy seam), and resource-admission failures
are no longer reported as decode failures.

Campaign `PICOVIEW-DIRECT-IMAGE-ADMISSION-MIGRATION-1` (2026-09-16) closed
the R2 loop: PocketJS direct image admission
(`POCKETJS-DESKTOP-DIRECT-IMAGE-ADMISSION-1`, jnhu76/pocketjs PR #2) is the
reviewed HEAD of `jnhu76/pocketjs:integration/picoview-desktop`
(`24bab5e`), `POCKETJS.lock` advanced to exactly that revision, and PicoView
now publishes ordinary decodes by MOVING the WIC RGBA plane into
`Ui::upload_owned_rgba8` — no PSM tag, no borrow seam, no second CPU plane.

Campaign `PICOVIEW-LAST-GOOD-PUBLICATION-1` (2026-09-17) fixed the
publication ordering: candidates are admitted before the previous
publication is released, refresh failures preserve the last-good
publication, new-item failures deliberately publish the error item
(PRD §2.10), and the guest observer splits request state from publication
state. Its corrective (`-CORRECTIVE-1`, same day) separates the
publication COMMIT from the superseded RESOURCE RELEASE: removals only
queue the superseded handle, and the physical release runs once per tick
at the post-guest-frame observation boundary (`ObservationBoundary` /
`RequestPhase` tokens in `native/src/current_item.rs`), so no renderable
guest state can reference a freed handle in any call phase.

The next work is the remaining PicoView-side corrections (R3): truthful
full-resolution capability, generic color/alpha admission.

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

Remaining differentials after `PICOVIEW-DIRECT-IMAGE-ADMISSION-MIGRATION-1`
(2026-09-16) — audit-confirmed, migration targets only:

- ~~PicoView admits decoded images through the locked-revision PSM-tagged core seam (`register_native_texture`)~~ — resolved: ordinary decodes move the decoder's own RGBA plane into `Ui::upload_owned_rgba8`; no PSM vocabulary remains on the PicoView image path;
- ~~PocketJS Core materializes aligned CPU texture storage before wgpu~~ — resolved for the ordinary image path (`TexBacking::Owned` keeps the moved plane tight; pak/PSM_T8 textures keep the aligned store by PSP design);
- ~~wgpu materializes another RGBA buffer even for an already-RGBA8/`PSM_8888` path~~ — resolved at the integration revision (`pocket-ui-wgpu` borrows `PSM_8888`/Owned planes straight into `Queue::write_texture`; `to_rgba8` remains only for 5650/4444/T8 device textures);
- ~~the current normal Desktop path therefore does not yet satisfy ADR-0002 direct admission~~ — satisfied on the ordinary image path at the pinned integration revision;
- sampling is partly stored with texture state rather than generic draw state;
- `NATIVE_TEX_MAX_DIM`/8192 leaks backend/default assumptions into image admission;
- giant images are reduced before publication without a fully separated full-resolution capability;
- ~~refresh/publication ordering currently risks retiring old state before replacement admission succeeds~~ — resolved 2026-09-17 (`PICOVIEW-LAST-GOOD-PUBLICATION-1`): admit-then-commit ordering, intent-split failure policy (refresh preserves last-good, new-item publishes the error item), guest publication/request state split;
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
5. ~~implement/review generic PocketJS corrections first: `POCKETJS-DESKTOP-DIRECT-IMAGE-ADMISSION-1`~~ (done — jnhu76/pocketjs PR #2, reviewed HEAD `24bab5e`, now the `integration/picoview-desktop` consumer branch);
6. ~~advance `POCKETJS.lock` deliberately~~ (done — `PICOVIEW-DIRECT-IMAGE-ADMISSION-MIGRATION-1`, 2026-09-16: pin + all Cargo revs to `24bab5e`, PicoView moved to owned admission);
7. then apply remaining PicoView-specific Product/Image corrections (truthful full-resolution capability, refresh/last-good ordering, generic color/alpha admission).

Do not preserve `PSM_8888` in the native Desktop path merely because the current API already exposes it.

---

## Evidence environment

Windows runtime evidence remains native-Windows authority.

WSL may be used for reading/repository work, but it cannot close WIC, Windows DPI, wgpu presentation, adapter, process-memory, or packaging claims.

Physical performance claims follow `docs/BENCHMARK.md` and record exact PicoView/PocketJS SHAs, toolchain, OS, and machine/GPU identity.
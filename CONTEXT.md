# PicoView Context

## Current phase

PicoView is in **VIEWER ARCHITECTURE RESET / CORRECTIVE REVIEW**.

The product already has a proved Windows path from local image decode to PocketJS presentation. The current work is to finish the authority reset before architecture-sensitive implementation continues.

Current reset work:

- control issue: **#50**;
- architecture-reset PR: **#51**;
- branch: `architecture/viewer-semantics-reset-1`.

PR #51 remains Draft and must not be auto-merged.

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

## Adversarial review status

### First fresh review

Initial verdict: **REVISE_BEFORE_MERGE**.

The first corrective closed:

- Product/backend policy leakage;
- UI semantic state vs UI rasterization placement;
- coordinate spaces / 100% DPI semantics;
- intrinsic orientation vs user Rotate/Flip;
- generic color/alpha/precision admission semantics;
- last-good replacement ordering;
- residency-aware upload rules;
- target-vs-current software fallback claims.

### Second boundary-only review

A second review focused only on inter-layer authority found four remaining boundary ambiguities; all four have now been corrected in the branch:

1. **decode semantics/orchestration != decode execution placement** — Image owns meaning/orchestration; CPU/GPU/platform hardware are replaceable execution choices;
2. **Product view intent != backend transform realization** — Product owns Fit/100%/Zoom/Pan/Rotate/Flip state; PocketJS Core carries generic draw parameters; Backend physically realizes them;
3. **Product publication != PocketJS logical lifetime != Backend residency** — each now has separate authority;
4. **`content_revision` has one owner** — PocketJS Core assigns/advances it; PicoView Product/Image do not supply a competing revision truth.

Hardware/GPU decode is explicitly permitted when it preserves Image semantics and demonstrably reduces full-plane CPU materialization/transfer without introducing worse interop/cross-adapter movement.

A final fresh consistency review is still required before merge.

---

## Current known implementation differentials

Current code predates the frozen architecture. Known R1 audit targets include:

- PicoView imports PocketJS PSM representation for native image registration;
- ordinary decoded images are cloned before resource registration;
- PocketJS Core materializes aligned CPU texture storage before wgpu;
- wgpu materializes another RGBA buffer even for an already-RGBA8 path;
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

After PR #51 passes final fresh review:

1. audit current PicoView + exact locked PocketJS code against the frozen Architecture/SPEC;
2. trace every image-sized allocation/copy/upload/import/lifetime;
3. split findings into PocketJS-generic corrections vs PicoView-specific corrections;
4. recalibrate pre-reset GitHub issues before reusing them;
5. only then continue implementation.

---

## Evidence environment

Windows runtime evidence remains native-Windows authority.

WSL may be used for reading/repository work, but it cannot close WIC, Windows DPI, wgpu presentation, adapter, process-memory, or packaging claims.

Physical performance claims follow `docs/BENCHMARK.md` and record exact PicoView/PocketJS SHAs, toolchain, OS, and machine/GPU identity.
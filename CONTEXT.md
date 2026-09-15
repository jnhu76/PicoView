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

The first fresh adversarial review of PR #51 returned **REVISE_BEFORE_MERGE**.

Correctives now applied in the branch include:

- Product authority no longer owns adapter/backend implementation policy;
- UI CPU semantics are separated from UI rasterization location;
- source/oriented/user/DIP/physical coordinate spaces and 100% math are explicit;
- intrinsic source orientation is ordered before user Rotate/Flip and survives Reset View;
- generic image→renderer representation semantics are explicit, including alpha/color/precision;
- resource admission/publication/retirement/release state is explicit;
- refresh keeps last-good until replacement admission succeeds;
- upload invariants are residency-aware rather than “one upload forever”;
- software fallback is a target capability, not an already-proved current capability claim;
- AGENTS/CONTEXT have been reduced to operational guidance rather than duplicate architecture text.

A second fresh review is still required before merge.

---

## Current known implementation differentials

Current code predates the frozen architecture. Known audit targets include:

- PicoView imports PocketJS PSM representation for native image registration;
- ordinary decoded images are cloned before resource registration;
- PocketJS core materializes aligned CPU texture storage before wgpu;
- wgpu materializes another RGBA buffer even for an already-RGBA8 path;
- sampling is partly stored with texture state rather than purely draw state;
- `NATIVE_TEX_MAX_DIM`/8192 leaks backend/default assumptions into image admission;
- giant images are reduced before publication without a fully separated full-resolution capability;
- resource-admission failure can be mislabeled as decode failure;
- refresh/publication ordering currently risks retiring old state before replacement admission succeeds;
- renderer/presentation authority is still partly in PicoView host code;
- current Windows path has no proved software fallback;
- current color/alpha admission is effectively PSM/RGBA8-oriented rather than the generic architecture contract;
- generation terminology/authority remains mixed.

These are differentials, not target design.

---

## Near-term sequence

After PR #51 passes second fresh review:

1. audit current PicoView + exact locked PocketJS code against the frozen Architecture/SPEC;
2. produce a differential table tracing every image-sized allocation/copy/upload/lifetime;
3. split findings into PocketJS-generic corrections vs PicoView-specific corrections;
4. recalibrate pre-reset GitHub issues before reusing them;
5. only then continue implementation.

---

## Evidence environment

Windows runtime evidence remains native-Windows authority.

WSL may be used for reading/repository work, but it cannot close WIC, Windows DPI, wgpu presentation, adapter, process-memory, or packaging claims.

Physical performance claims follow `docs/BENCHMARK.md` and record exact PicoView/PocketJS SHAs, toolchain, OS, and machine/GPU identity.
# PicoView Context

## Current phase

PicoView is in **VIEWER ARCHITECTURE RESET / AUTHORITY REALIGNMENT**.

The product already has a proved Windows path from local image decode to PocketJS presentation. The current task is not to add another feature on top of that provisional path. It is to freeze the authority model that future PicoView and PocketJS work must follow.

Current reset work:

- architecture discussion/control issue: **#50**;
- architecture-reset PR: **#51**;
- branch: `architecture/viewer-semantics-reset-1`.

Downstream implementation that depends on image/resource/rendering boundaries should not outrun this reset.

---

## Current authorities

### Product authority

`docs/PRD/PicoView-PRD-v0.6.md`

Owns user-visible jobs, commands, promises and non-goals.

### Architecture authority

- `docs/ADR/ADR-0001-viewer-image-rendering-authority.md`
- `docs/ARCHITECTURE.md`

Owns semantic boundaries, ownership, resource lifetime, graphics backend and rendering/presentation invariants.

### Execution authority

`docs/SPEC/PicoView-v1.1.md`

Must satisfy both Product and Architecture authority.

### Operational authority

`AGENTS.md`, this file, `docs/ROADMAP.md`, GitHub issues.

Operational documents cannot redefine Product or Architecture semantics.

Older `PicoView-PRD-v0.5.md`, `SPEC/PicoView-v1.md`, Phase-A/GATE evidence and startup campaign records remain historical evidence only.

---

## Frozen architecture thesis

PicoView is organized around **three semantic authorities** and **two execution planes**.

### Three semantic authorities

1. **PicoView Product** — what the user asked for and what logical item/view state is current.
2. **PicoView Image** — what the encoded source means: decode, orientation, alpha, precision, color/HDR/frame semantics.
3. **PocketJS Graphics/Runtime** — how an opaque image resource is stored/rendered/presented on the active backend.

### Two execution planes

- **CPU control/preparation** — product state, decode/image interpretation, UI state/layout/input, DrawList generation.
- **GPU graphics** — primary image residency, sampling, view transforms, UI/image composition and presentation.

GPU is primary. Compatible low-power/iGPU is preferred, compatible discrete GPU is fallback, software CPU rendering is the final fallback where correct viewing is still possible.

---

## Hard invariants

- `O(image-bytes)` never crosses QuickJS in the normal viewer path.
- Semantic boundaries are not memcpy boundaries.
- `O(image-pixels)` handoffs move ownership or borrow by default.
- An already backend-acceptable static decoded plane should incur zero avoidable post-decode full-plane CPU copies.
- View/UI state changes alone do not cause image re-upload.
- Source truth is distinct from presentation adaptation.
- Fit/Zoom/Pan/Rotate View/Flip View are non-destructive presentation semantics by default.
- A reduced proxy may not masquerade as true 100%.
- Decoder capability does not automatically become product format support.
- PicoView product/image code does not own backend texture/device representation.
- Generic PocketJS renderer does not own JPEG/PNG/GIF/PicoView semantics.
- `request_generation`, `handle_generation`, `content_revision`, and `device_generation` are distinct concepts.
- A stale request may never publish over a newer request.

---

## Current known implementation differentials

The present code was built before this architecture was frozen. The following are known migration/audit targets rather than accepted design:

- PicoView image registration may still expose PocketJS legacy PSM/texture representation details.
- PocketJS core may still materialize a CPU-owned texture representation before the wgpu backend.
- The wgpu path may still perform avoidable full-plane copies before upload.
- renderer/presentation authority may still be partly implemented in the PicoView host instead of generic PocketJS graphics capability.
- backend/default texture limits may still leak too directly into image admission semantics.
- resource-admission errors may still be conflated with decode errors.
- existing code may still use ambiguous `generation` terminology.

These differentials must be audited against current authority; they must not be copied into new design merely because they exist.

---

## PocketJS dependency rule

PicoView consumes the exact PocketJS revision in `POCKETJS.lock`.

Generic runtime/graphics capability is fixed upstream in `jnhu76/pocketjs`, reviewed/merged there, then PicoView advances the lock.

PicoView-specific product/image policy remains in PicoView.

No hidden local fork, vendored copy, or PicoView-only substitute for a generic PocketJS capability.

---

## Near-term work after architecture acceptance

After #50 / #51 are accepted, implementation planning should be derived from the new architecture rather than resumed from old issue text automatically.

The immediate design/audit sequence should be:

1. audit current PicoView + locked PocketJS code against `docs/ARCHITECTURE.md`;
2. identify generic PocketJS capability gaps, especially backend-native image admission and copy/upload behavior;
3. split those gaps into upstream PocketJS work and PicoView product/image work;
4. recalibrate existing roadmap/issues to the new authority;
5. only then continue product implementation.

No old blocked/ready label should be assumed correct solely because it predates this reset.

---

## Evidence environment

Windows runtime evidence remains native-Windows authority.

WSL may be used for reading/repository work, but it cannot close WIC, Windows DPI, wgpu presentation, adapter, process-memory or packaging claims.

Physical performance claims follow `docs/BENCHMARK.md` and record exact PicoView/PocketJS SHAs, toolchain, OS and machine/GPU identity.

---

## Current architectural design rule

> **PicoView decides which image, what the image means, and how the user wants to view it; PocketJS decides how an opaque image resource is rendered on the current graphics backend; large pixel data has one owner at a time, and every O(N pixels) movement must have a physical or semantic reason.**

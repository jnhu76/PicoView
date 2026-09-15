# PicoView Product Roadmap

Status: **CURRENT OPERATIONAL SEQUENCING**  
Date: **2026-09-15**

This roadmap does not define Product or Architecture semantics. It sequences work under:

- Product: `docs/PRD/PicoView-PRD-v0.6.md`
- Architecture: `docs/ADR/` + `docs/ARCHITECTURE.md`
- Execution contract: `docs/SPEC/PicoView-v1.1.md`

Older V0→V5 issue wording may contain provisional architecture assumptions. Do not execute those assumptions automatically after the architecture reset.

---

## R0 — Viewer Architecture Reset

Control issue: **#50**  
Implementation docs PR: **#51**

Goal:

- freeze Product / Image / Rendering authority;
- freeze CPU-control / GPU-graphics split;
- freeze QuickJS boundary;
- freeze source-truth vs presentation-adaptation semantics;
- freeze pixel ownership/copy/upload invariants;
- freeze graphics adapter/fallback policy;
- freeze resource generation/revision vocabulary.

Exit:

- fresh adversarial architecture review has no unresolved MAJOR;
- authority docs are mutually consistent;
- current implementation differentials are explicit.

No downstream architecture-sensitive implementation should outrun R0.

---

## R1 — Code-Reality Conformance Audit

Audit **current PicoView + exact `POCKETJS.lock` revision** against the frozen architecture.

Trace at minimum:

```text
source
→ decoder allocation
→ PicoView ownership
→ PocketJS admission
→ PocketJS core resource
→ graphics backend
→ GPU/software resource
→ DrawList
→ presentation
→ retirement
```

For every image-sized allocation/copy/upload/drop record:

- owner;
- representation;
- lifetime;
- reason;
- whether the work is required or differential.

Audit separately:

- PSM/legacy representation leakage;
- full-plane CPU copies;
- resource upload count;
- renderer/presentation ownership;
- 8192/device-limit authority;
- error-domain mapping;
- request/handle/content/device generations.

Output: a differential table, not code changes.

---

## R2 — PocketJS Generic Graphics Corrections

Only generic runtime/graphics gaps discovered by R1 belong here.

Likely candidates, subject to audit evidence:

- backend-native generic image-resource admission;
- ownership-taking / borrow-capable admission path;
- removal of unnecessary native-desktop canonical CPU texture materialization;
- no-copy fast path for already accepted pixel representation;
- resource identity / content revision contract;
- sampling as draw state rather than immutable resource identity where appropriate;
- runtime resource limits/capabilities instead of image-semantic constants;
- renderer/presentation authority cleanup;
- low-power compatible-GPU preference + dGPU/software fallback.

Each generic capability is implemented/reviewed in `jnhu76/pocketjs`, then PicoView advances `POCKETJS.lock`.

Do not create a PicoView-only parallel renderer to bypass missing PocketJS capability.

---

## R3 — PicoView Image/Product Corrections

Apply the new PocketJS contract to PicoView-specific authority:

- decoder/image-semantic boundary;
- format capability policy;
- CurrentItem publication;
- view capability (`actualSizeAvailable`, etc.);
- source truth / presentation adaptation;
- bounded error mapping;
- Fit / 100% / Zoom / Pan / Rotate / Flip product semantics;
- refresh / last-good;
- BrowseSession integration.

No codec noun crosses into generic rendering.

---

## R4 — Format Capability Matrix

Define official format support by capability, not by decoder discovery.

For each admitted format record relevant dimensions:

- decode;
- orientation;
- alpha;
- color/ICC;
- precision;
- HDR;
- animation;
- page/frame behavior;
- corrupt input;
- large-image/full-resolution behavior.

This matrix determines product support truth.

---

## R5 — Rendering Fidelity / Advanced Display

After the base resource/rendering contract is correct, validate display fidelity paths:

- ordinary SDR;
- transparency/blending;
- color-managed/wide-gamut inputs;
- HDR semantics and HDR-capable output where product support is admitted;
- HDR→SDR display adaptation;
- monitor/DPI/display transition.

Do not force all advanced inputs through a universal RGBA8-sRGB semantic contract.

---

## R6 — Real Viewer Baseline

Only after R0–R5 have produced a coherent path, assemble the minimal real viewer baseline:

```text
launch
→ open
→ faithful present
→ Fit / 100% / zoom / pan / rotate / flip
→ Previous / Next
→ refresh
→ bounded lifecycle
→ close / reopen
```

Product feature order may be split into smaller execution issues, but every issue is derived from current authority rather than copied from old ticket prose.

---

## Performance work

Architecture correctness is not deferred.

These must be enforced immediately:

- no image bytes through QuickJS;
- no unexplained full-plane copy at module boundaries;
- no redundant full-resource upload caused solely by view/UI state;
- no stale request publication;
- no false 100% from a proxy;
- no backend noun leakage into PicoView product/image semantics.

Workload-dependent optimization remains evidence-driven, including:

- decoder tuning;
- texture/buffer pools;
- prefetch/cache;
- tiled-image strategy;
- mip generation;
- hardware decode;
- UMA/staging/upload micro-optimization.

Physical claims follow `docs/BENCHMARK.md`.

---

## Rule for existing GitHub issues

An issue created before R0 is not automatically executable merely because it was previously labeled ready.

Before reuse it must be checked for:

1. current Product authority;
2. current Architecture authority;
3. current SPEC;
4. whether it belongs in PicoView or PocketJS;
5. whether it assumes a representation/copy/generation rule now superseded.

If drift is material, rewrite or close/recreate the issue rather than preserving obsolete wording for continuity.

# PicoView Product Roadmap

Status: **CURRENT OPERATIONAL SEQUENCING**  
Date: **2026-09-16**

This roadmap sequences work under current Product, Architecture, and SPEC authority. It does not define those semantics itself.

Older issue wording may contain provisional architecture assumptions and is not automatically executable after the reset.

---

## R0 — Viewer Architecture Reset

Control issue: **#50**  
Docs PR: **#51**

Goal: freeze Product / Image / Rendering authority, coordinate/view semantics, QuickJS boundary, source-truth/presentation separation, resource ownership/lifetime, representation/color/alpha contract, residency-aware copy/upload rules, backend/fallback policy, and generation vocabulary.

Exit:

- second fresh adversarial review has no unresolved MAJOR;
- Product / Architecture / SPEC authority are mutually consistent;
- current implementation differentials are explicit;
- archive/current-authority references are unambiguous.

No downstream architecture-sensitive implementation may outrun R0.

---

## R1 — Code-Reality Conformance Audit

Audit current PicoView + exact `POCKETJS.lock` revision against the frozen Architecture/SPEC.

Trace at minimum:

```text
encoded source
→ decoder/source buffering
→ decoded candidate
→ intrinsic orientation / image semantics
→ generic resource admission
→ logical resource publication
→ backend residency
→ DrawList/view transform
→ presentation
→ retirement / release
```

For every image-sized allocation/copy/upload/drop, record owner, representation, lifetime, reason, and whether it is required or differential.

Audit explicitly:

- encoded whole-file buffering/copies;
- PSM/legacy representation leakage;
- decoded-plane clone/copy chain;
- generic representation/color/alpha gap;
- intrinsic orientation vs user-transform ordering;
- 100% / DPI physical-pixel math;
- resource state machine and last-good replacement ordering;
- residency/re-upload behavior;
- sampling ownership;
- backend/device-limit leakage;
- renderer/presentation ownership;
- current lack of software fallback;
- error-domain mapping;
- request/handle/content/device generations.

Output: evidence-backed differential table only; no corrective coding in R1.

---

## R2 — PocketJS Generic Graphics Corrections

Only generic runtime/graphics gaps proven by R1 belong here.

Likely candidates, subject to evidence:

- backend-native generic image admission;
- ownership-taking / borrow-capable admission;
- generic render-image representation contract including alpha/color/precision;
- removal of unnecessary native-desktop canonical CPU texture materialization;
- no-copy path for already accepted representations;
- resource lifecycle / handle generation / content revision;
- residency-aware cache/re-upload semantics;
- sampling as draw state where appropriate;
- runtime resource capability reporting instead of image-semantic constants;
- renderer/presentation authority cleanup;
- compatible low-power GPU preference and dGPU fallback;
- software backend sufficient for the Architecture/SPEC minimum fallback contract.

Each generic capability is implemented/reviewed in `jnhu76/pocketjs`, then PicoView deliberately advances `POCKETJS.lock`.

Do not create a PicoView-only parallel renderer to bypass a missing generic PocketJS capability.

---

## R3 — PicoView Image/Product Corrections

Apply the new PocketJS contract to PicoView-specific authority:

- decoder/image-semantic boundary;
- intrinsic orientation;
- format capability policy;
- CurrentItem candidate/admission/publication ordering;
- truthful full-resolution capability;
- 100% / Fit / Zoom / Pan / Rotate / Flip product semantics;
- refresh / last-good;
- bounded error mapping;
- BrowseSession integration.

No codec noun crosses into generic rendering.

---

## R4 — Format Capability Matrix

Define official format support by capability rather than decoder discovery.

For each admitted format record relevant dimensions: decode, orientation, alpha, color/ICC, precision, HDR, animation, page/frame behavior, corrupt input, and large-image/full-resolution behavior.

This matrix determines product support truth.

---

## R5 — Rendering Fidelity / Advanced Display

After the base resource/rendering contract is correct, validate ordinary SDR, transparency/blending, color-managed/wide-gamut inputs, HDR semantics/output where admitted, HDR→SDR adaptation, and monitor/DPI/output transitions.

Do not force all advanced inputs through a universal `RGBA8 sRGB` semantic contract.

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

Product feature work may be split further, but every issue is derived from current authority rather than copied from old ticket prose.

---

## Performance rule

Architecture correctness is not deferred. Workload-dependent optimization remains evidence-driven.

Physical claims follow `docs/BENCHMARK.md`.

---

## Rule for existing GitHub issues

An issue created before R0 is not automatically executable merely because it was previously labeled ready.

Before reuse, check it against current Product authority, Architecture authority, SPEC, cross-repo ownership, and current representation/copy/generation/lifetime semantics.

If drift is material, rewrite or close/recreate the issue rather than preserving obsolete wording for continuity.
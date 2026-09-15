# AGENTS.md

## Mission

Build **PicoView**, a fast, small, focused Windows 11 local image viewer on PocketJS.

Current authority:

- Product: `docs/PRD/PicoView-PRD-v0.6.md`
- Architecture decisions: `docs/ADR/`
- Detailed program semantics: `docs/ARCHITECTURE.md`
- Execution contract: `docs/SPEC/PicoView-v1.1.md`
- Current state: `CONTEXT.md`
- Sequencing: `docs/ROADMAP.md`

Superseded authority under `docs/history/` is history/evidence only.

---

## Read before changing code

1. Read the current Product authority for user-visible meaning.
2. Read relevant ADRs and `docs/ARCHITECTURE.md` for boundaries/invariants.
3. Read the current SPEC for executable contracts.
4. Read `CONTEXT.md`, `docs/ROADMAP.md`, and the assigned issue for current sequencing.
5. Read `POCKETJS.lock` and the exact locked PocketJS code when runtime/graphics behavior is involved.
6. Read `docs/BENCHMARK.md` before making physical performance/memory claims.

There is no single total authority order across unrelated domains. Product owns product meaning; Architecture owns architecture; SPEC must satisfy both; operational documents cannot redefine either.

If Product and Architecture genuinely conflict, stop and repair authority rather than choosing a convenient winner in code.

---

## Required design questions

Before coding, answer:

- Which authority owns each fact this change touches: Product, Image, or Rendering?
- Does the change introduce or move any `O(image-pixels)` storage/copy/upload?
- Does a generic capability belong upstream in PocketJS rather than PicoView?
- Does the change alter coordinate semantics, intrinsic orientation, resource lifetime, content revision, or backend residency?
- Is the exact `POCKETJS.lock` revision being used?

Do not start architecture-sensitive implementation from old issue prose without checking it against current authority.

---

## Hard stop summary

The normative wording lives in ADR/ARCHITECTURE/SPEC. Stop and report a blocker if continuing would require any of these classes of violation:

- image bytes through QuickJS;
- unexplained full-image copy at a semantic boundary;
- backend texture/device semantics in PicoView Product/Image authority;
- codec-specific semantics in generic PocketJS rendering;
- false 100% / incorrect DPI-image scale;
- conflating intrinsic source orientation with user Rotate/Flip;
- undefined color/alpha representation at image-resource admission;
- destroying last-good refresh state before replacement admission succeeds;
- redundant full-resource upload while valid residency exists merely because view/UI state changed;
- conflating request generation, handle generation, content revision, and device generation;
- hidden local PocketJS fork/workaround;
- Product/Architecture authority conflict.

Use the exact current Architecture/SPEC text when adjudicating a case; this summary is not a second architecture source.

---

## Cross-repo rule

PicoView consumes `jnhu76/pocketjs` at the exact revision pinned in `POCKETJS.lock`.

If PicoView needs a **generic runtime/graphics capability**, implement it in PocketJS first, review/merge it there, then deliberately advance `POCKETJS.lock`.

PicoView-specific product/image policy stays in PicoView.

No submodule, vendored copy, or hidden local PocketJS patch may substitute for the upstream process.

---

## Current graphics note

The target architecture is GPU-first with software fallback, but current capability claims must match code reality.

Do not claim “GPU not required” until the software fallback contract in the current Architecture/SPEC has been implemented and verified.

Do not infer that UI semantics being CPU-side requires CPU bitmap rasterization; final UI/image rasterization is an active-graphics-backend concern.

---

## Windows evidence environment

PicoView is a Windows product.

Windows host/WIC/DPI/wgpu/presentation/process-memory/package evidence must come from **native Windows**.

WSL is acceptable for reading, repository inspection, and non-Windows helper work, but it cannot close Windows runtime behavior.

Physical evidence records exact PicoView SHA, PocketJS SHA, build/toolchain, OS, and machine/GPU identity according to `docs/BENCHMARK.md`.

---

## Ticket discipline

Before coding:

- confirm the issue is executable, not blocked/spec-only;
- identify every changed authority and boundary;
- identify large-object ownership and potential copies/uploads;
- state the exact locked PocketJS revision for runtime work.

During coding:

- keep ownership explicit;
- keep stale work cancellable;
- keep guest/native messages bounded;
- keep codec semantics out of generic graphics;
- keep backend nouns out of PicoView Product/Image policy;
- prefer move/borrow/deletion over another storage layer;
- do not broaden the issue silently.

Before completion:

- run acceptance checks from the current SPEC/issue;
- verify replacement boundaries still hold;
- verify no unexplained full-plane copy/upload exists;
- verify publication/lifetime ordering;
- update authority if a frozen assumption is disproved;
- leave the worktree clean.

A truthful blocked result is preferable to an architecture violation.
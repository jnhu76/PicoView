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
6. For Windows/Desktop graphics work, inspect the existing PocketJS **macOS/Linux `hosts/desktop` + `pocket-ui-wgpu` implementation first**. Windows joins that native-desktop family; PSP/Vita/3DS/ESP32 physical rules are comparative evidence, not Desktop requirements.
7. Read `docs/BENCHMARK.md` before making physical performance/memory claims.

There is no single total authority order across unrelated domains. Product owns Product meaning; Architecture owns architecture; SPEC must satisfy both; operational documents cannot redefine either.

If Product and Architecture genuinely conflict, stop and repair authority rather than choosing a convenient winner in code.

---

## Boundary checklist

Before coding, identify all four roles touched by the change:

- **PicoView Product** — user/current-item/view intent;
- **PicoView Image** — source meaning and decoder orchestration;
- **PocketJS Core** — logical resource/lifetime/revision and generic draw contract;
- **Graphics Backend** — physical storage/residency and final rendering/presentation.

CPU/GPU are execution locations, **not authority domains**.

Keep these distinctions explicit:

- decode semantics/orchestration != decode execution placement;
- Product view intent != backend transform realization;
- Product publication != PocketJS logical lifetime != backend physical residency;
- `content_revision` belongs to PocketJS Core, not PicoView Product/Image.

A hardware/GPU decode path is allowed when it preserves Image semantics and actually reduces large-data movement. Count hidden staging/interop/cross-adapter copies before calling it better or zero-copy.

---

## Desktop/wgpu direct image rule

`docs/ADR/ADR-0002-desktop-wgpu-direct-image-admission.md` freezes the normal PicoView Windows/Desktop path.

The reference family is PocketJS's existing native Desktop implementation:

```text
macos-app ─┐
linux-app ─┼─→ shared hosts/desktop → pocket-ui-wgpu
windows-app┘
```

Windows/Desktop work must extend this shared family before considering a Windows-specific graphics mechanism. A Windows-only branch requires a named platform/API constraint that the shared host/backend cannot express.

When PicoView has already decoded an image to RGBA8 that the shared wgpu path can directly consume, the intended physical path is:

```text
decoder-owned RGBA8
→ PocketJS generic logical admission
→ direct wgpu upload/admission
→ wgpu::Texture residency
```

The logical PocketJS resource boundary remains; an additional canonical CPU texture allocation does not.

Do **not** introduce this normal path:

```text
decoded RGBA8
→ full PSM_8888/portable Core copy
→ second full RGBA8 copy
→ wgpu upload
```

`PSM_8888` may remain valid for PocketJS backends/workloads that need that representation. It is not the mandatory canonical Desktop image representation.

For Desktop/wgpu work use this decision order:

1. directly consume/upload the admitted representation when possible;
2. if representation conversion is required, fuse it into the final backend backing where practical;
3. allocate a complete intermediate plane only for a named correctness/physical reason.

A module/API boundary, legacy PocketJS uniformity, or another device backend's native representation is not such a reason.

Do not bypass PocketJS Core by giving PicoView ownership of `wgpu::Texture`, and do not create a parallel PicoView-native compositor/handle namespace.

---

## Required design questions

Before coding, answer:

- Which authority owns each fact this change touches?
- Does the change introduce or move any `O(image-pixels)` storage/copy/upload/import?
- For Windows/Desktop, what do the current macOS/Linux `hosts/desktop` + `pocket-ui-wgpu` paths already do for the same responsibility?
- If a Windows-only mechanism is proposed, what concrete Windows/wgpu constraint prevents reuse of the shared desktop path?
- Can the selected wgpu path consume the decoded representation directly instead of materializing a PSM/portable intermediate?
- Does a generic capability belong upstream in PocketJS rather than PicoView?
- Does the change alter coordinate semantics, intrinsic orientation, Product view intent, logical resource lifetime, PocketJS revision, or backend residency?
- Does a decoder execution choice leak physical backend details into Product/Image semantics?
- Is the exact `POCKETJS.lock` revision being used?

Do not start architecture-sensitive implementation from old issue prose without checking it against current authority.

---

## Hard stop summary

The normative wording lives in ADR/ARCHITECTURE/SPEC. Stop and report a blocker if continuing would require any of these classes of violation:

- image bytes through QuickJS;
- unexplained full-image copy at a semantic boundary;
- a Windows-only renderer/resource path added without first checking the shared macOS/Linux native-desktop path;
- PSP/Vita/3DS/other-device texture/storage constraints treated as Windows/Desktop requirements without an independent wgpu/Desktop reason;
- on the normal Windows/Desktop wgpu path, decoded RGBA8 copied into full `PSM_8888`/portable Core backing merely for uniformity;
- on the normal Windows/Desktop wgpu path, already-RGBA8 content copied into another full RGBA8 plane solely before wgpu upload;
- backend texture/device/import semantics in PicoView Product/Image authority;
- codec-specific semantics in generic PocketJS rendering;
- CPU/GPU execution placement redefining semantic authority;
- PocketJS inventing PicoView Fit/100% policy;
- PicoView Product/Image assigning PocketJS `content_revision`;
- conflating Product publication, Core logical lifetime, and Backend residency;
- Product directly destroying backend physical storage;
- false 100% / incorrect DPI-image scale;
- conflating intrinsic source orientation with user Rotate/Flip;
- undefined color/alpha representation at image-resource admission;
- destroying last-good Product publication before replacement admission succeeds;
- redundant full-resource upload/import while valid residency exists merely because view/UI state changed;
- conflating request generation, handle generation, content revision, and device generation;
- hidden local PocketJS fork/workaround;
- Product/Architecture authority conflict.

Use the exact current Architecture/SPEC/accepted ADR text when adjudicating a case; this summary is not a second architecture source.

---

## Cross-repo rule

PicoView consumes `jnhu76/pocketjs` at the exact revision pinned in `POCKETJS.lock`.

If PicoView needs a **generic runtime/graphics capability**, implement it in PocketJS first, review/merge it there, then deliberately advance `POCKETJS.lock`.

The direct Desktop/wgpu image-admission capability required by ADR-0002 is a PocketJS-generic graphics correction to the shared native-desktop backend family. Do not implement a PicoView-only `PSM_8888` detour or a Windows-only renderer to avoid changing PocketJS.

PicoView-specific Product/Image policy stays in PicoView.

No submodule, vendored copy, or hidden local PocketJS patch may substitute for the upstream process.

---

## Current graphics note

The target architecture is GPU-first with software fallback, but current capability claims must match code reality.

Do not claim “GPU not required” until the software fallback contract in the current Architecture/SPEC has been implemented and verified.

Do not infer that UI semantics being CPU-side requires CPU bitmap rasterization; final UI/image rasterization is an active-backend concern.

Do not infer that Image semantics being PicoView-owned requires CPU decode; decoder execution may use CPU, platform hardware, or GPU behind the same Image contract.

For the normal Windows/Desktop GPU path, follow PocketJS's existing native Desktop→`pocket-ui-wgpu` backend family. Do not add another GPU backend merely to avoid fixing resource admission.

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
- identify large-object ownership and potential copies/uploads/imports;
- state the exact locked PocketJS revision for runtime work.

During coding:

- keep ownership explicit;
- keep stale work cancellable;
- keep guest/native messages bounded;
- keep codec semantics out of generic graphics;
- keep backend nouns out of PicoView Product/Image policy;
- keep PocketJS revision ownership inside PocketJS;
- on Desktop/wgpu, prefer direct admitted-representation → backend residency over PSM/canonical CPU detours;
- preserve the shared macOS/Linux/Windows desktop host/backend family unless a platform-specific constraint is proved;
- prefer move/borrow/import/deletion over another storage layer;
- do not broaden the issue silently.

Before completion:

- run acceptance checks from the current SPEC/issue;
- verify replacement boundaries still hold;
- verify no unexplained full-plane copy/upload/import exists;
- for Desktop/wgpu, verify an already-RGBA8 decode does not materialize a full `PSM_8888` intermediate or second RGBA8 plane without a named reason;
- verify any Windows-only divergence from macOS/Linux has an explicit platform/API reason;
- verify publication/logical-lifetime/residency ordering;
- update authority if a frozen assumption is disproved;
- leave the worktree clean.

A truthful blocked result is preferable to an architecture violation.
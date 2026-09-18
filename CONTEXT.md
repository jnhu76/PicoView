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

Campaign `PICOVIEW-POCKETJS-SUBTREE-INTEGRATION-1` (2026-09-18) closed the
MVP dependency-layout gap: PicoView PR #62 merged onto main, PocketJS
`integration/picoview-desktop` fast-forwarded to reviewed R1 tip `3a10550`,
and that exact upstream tree was imported as a git subtree under
`third_party/pocketjs` (`--squash`). `POCKETJS.lock` is now the subtree
provenance authority; Cargo PocketJS crates are path dependencies into
`third_party/pocketjs` (no PocketJS git rev, no submodule). PicoView still
owns its desktop-host adapter; R1 presentation-geometry consumption remains a
separate PicoView PR (worktree `picoview-63-render-pipeline-gate-1`).

Campaign `PICOVIEW-LAST-GOOD-PUBLICATION-1` (2026-09-17) fixed the
publication ordering: candidates are admitted before the previous
publication is released, refresh failures preserve the last-good
publication, new-item failures deliberately publish the error item
(PRD §2.10), and the guest observer splits request state from publication
state. Its correctives separate the three commit domains:
`-CORRECTIVE-1` split the publication COMMIT from the superseded RESOURCE
RELEASE — removals only queue the superseded handle and the physical
release runs once per tick at the post-guest-frame observation boundary
(`ObservationBoundary` / `RequestPhase` tokens in
`native/src/current_item.rs`) — and `-CORRECTIVE-2` split the native Product
commit from the guest RENDERED binding: one guest turn reduces all events
and commits at most one binding for the FINAL observed publication
(`guest/binding.ts`, `guest/turn.ts`), so an arbitrary number of collapsed
Product commits cannot leave the mounted Image on a freed handle. Every
LEGAL Product transition constructs `RequestPhase` before the tick's guest
frame; the tokens are review friction, not a claim about fabricated illegal
use.

Campaign `PICOVIEW-VIEW-GEOMETRY-CORRECTIVE-1` (2026-09-18, branch
`corrective/view-geometry-1`) re-verified PocketJS pin `24bab5e` code reality
(rotated Image → TEX_TRI already implemented; desktop host already forwards
mouse/scroll) and replaced ad-hoc view math with one pure transform model:
DPI-explicit Actual Size (`productZoom / dpiScale`), frozen image viewport
(`shell_layout.ts`), correct pointer-anchored `zoomAt`, EXIF orientation
materialized into O at decode, host mouse/wheel parity, and Rotate/Flip UI
via PocketJS `rotate`/`scaleX`/`scaleY` props. Stale gap claims
`POCKETJS_GAP_TEXTURED_2D_TRANSFORM` / `POCKETJS_GAP_INPUT_GESTURES` are
invalidated as capability gaps; remaining work is product host/guest parity
and interaction polish. Corrective-2 (same branch) then closed the fresh-review
MAJORs: real `hello.scale` from `window.scale_factor()`, guest pointer→press
wiring so toolbar `onPress` works with a mouse, D4 `normalizeOrientation` onto
8 canonical tuples, EXIF fullResolution O-space lock, and pointer-release
strand mitigations. PR61-CORRECTIVE-1 closed Fit-after-resize/DPI, persistent
wheel anchor, and gesture ownership. Merged as PR #61
(`161536f`). Evidence: `docs/compose/spec/view-geometry-1.md`.

Campaign `PICOVIEW-PR60-POST-61-INTEGRATION-1` (2026-09-18, branch
`feat/windows-shell-ui-polish-1`) rebased/integrated PR #60 onto post-#61
main. PR #60 is now a pure additive Windows product-shell layer: Open File /
Ctrl+O, icon chrome, side chevrons, empty/error/status UX, conservative
HKCU OpenWith associations, embedded guest assets, GUI subsystem, and
hidden-until-first-frame presentation. View geometry, DPI, pointer ownership,
EXIF O, and view transforms remain PR #61 authority and are not reinterpreted
here. Evidence: `docs/compose/spec/windows-shell-ui-polish-1.md`.

Campaign `PICOVIEW-DESKTOP-UI-NORMALIZATION-1` (PR #62, branch
`fix/ui-chrome-1`) normalizes desktop viewer chrome to an icon-first
photo-viewer command bar:
`Open · Zoom Out · Zoom In · Fit · 1:1 · Rotate · FlipH · FlipV`.
Previous/Next stay viewport-edge + keyboard. Shell chrome is compact
(`SHELL_CHROME` titleH=0 / toolbarH=44 / statusH=24; chromeHeight=68).
Zoom % is a status-bar readout that tracks Fit/Zoom; `1:1` = Actual Size 100%.

**Authority note (desktop conformance corrective):** PR #62 is **not**
presentation-only. It owns Product shell chrome allocation and therefore the
image-viewport boundary that Fit/center/pan consume as input geometry.
PR #61 still owns ViewTransform equations, Fit algorithm, pan clamp, and
orientation math — formulas unchanged, viewport boundary changed. Product
minimum usable logical client is **384×240** (`PRODUCT_MIN_CLIENT`); PocketJS
windows-app 240×180 is platform capability, not product usability. Host enforces
the product min via winit `with_min_inner_size` + resize clamp.
`TOOL_SEMANTIC` is semantic/test authority, not accessibility metadata.
Evidence: `docs/compose/spec/desktop-ui-normalization-1.md`.

The next work is the remaining PicoView-side corrections (R3): truthful
full-resolution capability, generic color/alpha admission.

---

## Current authority

- Product: `docs/PRD/PicoView-PRD-v0.6.md`
- Architecture: `docs/ADR/` + `docs/ARCHITECTURE.md`
- Execution: `docs/SPEC/PicoView-v1.1.md`
- Agent policy: `AGENTS.md`
- Sequencing: `docs/ROADMAP.md`
- PocketJS source identity / subtree provenance: `POCKETJS.lock` (in-tree snapshot at `third_party/pocketjs`)

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
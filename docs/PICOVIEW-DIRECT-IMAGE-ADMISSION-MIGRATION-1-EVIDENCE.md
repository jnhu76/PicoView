# PICOVIEW-DIRECT-IMAGE-ADMISSION-MIGRATION-1 — Evidence

Date: 2026-09-16
PicoView branch: `feat/direct-image-admission-migration-1` (from `main` @ `221044e26a07c0b445c40f6f424f8efcfc13d9c1`, the PR #55 merge)
PocketJS integration authority: `jnhu76/pocketjs:integration/picoview-desktop` @ `24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb`
Campaign: resolve the `PICOVIEW-DESKTOP-WGPU-CONFORMANCE-CLEANUP-1` (#55) residual differential by consuming the reviewed PocketJS direct-admission revision.

## 0. Chain of custody

```text
#55 residual differential
    ordinary decodes borrowed into the museum seam
    (Ui::register_native_texture + PSM_8888 tag),
    full Core copy + wgpu-side RGBA re-expansion still inside the locked revision
        ↓ resolved by PocketJS integration revision 24bab5e
    (POCKETJS-DESKTOP-DIRECT-IMAGE-ADMISSION-1, jnhu76/pocketjs PR #2 reviewed HEAD:
     Ui::upload_owned_rgba8 + TexBacking::Owned + pocket-ui-wgpu direct borrow upload)
        ↓ consumed in this migration
    POCKETJS.lock + all Cargo git revs advanced to 24bab5e;
    PicoView publishes ordinary decodes by MOVING the WIC RGBA plane into
    Ui::upload_owned_rgba8
```

## A. PocketJS topology

```text
pocket-stack/pocketjs                    READ ONLY (no upstream remote configured; zero writes)
jnhu76/pocketjs main (9123a1d)           UNTOUCHED
jnhu76/pocketjs
  integration/picoview-desktop
    = 24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb
                                         PicoView integration authority (append-only;
                                         created at the reviewed PR #2 HEAD, no new bytes)
jnhu76/pocketjs PR #2                    evidence for POCKETJS-DESKTOP-DIRECT-IMAGE-ADMISSION-1;
                                         HEAD 24bab5e; left open/unmerged by design
```

Topology note (actual state vs campaign prompt): the old PicoView pin
`df869a5` (jnhu76/pocketjs#1, museum seam) is **not** an ancestor of
`24bab5e`. The fork's active line was reset after the A1–C4 archive campaign;
the direct-admission branch grows from the reset line via
`feat/windows-desktop-parity` (`fd24006`), which IS an ancestor of `24bab5e`
(proved with `git merge-base --is-ancestor`). Identity facts otherwise match
the frozen starting facts exactly.

## B. Exact dependency proof

All four agree on `24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb`:

```text
git ls-remote jnhu76/pocketjs refs/heads/integration/picoview-desktop
    → 24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb
POCKETJS.lock: revision = 24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb
               branch_hint = integration/picoview-desktop (informational only)
native/Cargo.toml: 6/6 PocketJS git deps at rev = 24bab5e…
native/Cargo.lock: single unique rev=24bab5e… across all PocketJS packages
```

Cargo.lock diff audit: 18 changed lines = 9 insertions + 9 deletions, every
line a PocketJS git `source` swap (`df869a5…` → `24bab5e…`) for the 9
reachable PocketJS workspace packages (pocketjs-core, pocket-mod,
pocket-text, pocket-ui-surface, pocket-ui-wgpu, pocket3d, pocket3d-anim,
pocket3d-bsp, pocket3d-mesh). Zero crates.io churn, zero version bumps.

## C. Old PicoView path (removed)

After #55, before this migration:

```text
WIC decode
→ DecodedImage { width, height, rgba: Vec<u8> }
→ AdmissionPlane::Source(&DecodedImage)        [borrow]
   | AdmissionPlane::Fitted { Vec<u8>, … }     [giant only]
→ Ui::register_native_texture(pixels, w, h, ADMISSION_FORMAT=psm::PSM_8888, linear)
→ PocketJS core: copy into 16-byte-aligned PSM store
→ pocket-ui-wgpu: PSM_8888 → temporary full RGBA8 vector → Queue::write_texture
→ wgpu::Texture
```

## D. New PicoView path

```text
WIC decode
→ DecodedImage { width, height, rgba: Vec<u8> }
→ prepare_for_admission(decoded) -> DecodedImage
     ordinary: returned unchanged (move)
     giant:    consumed, box-fitted reduction returned
→ publish(...) destructures; rgba MOVES into
     Ui::upload_owned_rgba8(rgba, width, height, linear=true)
→ PocketJS logical texture record (TexBacking::Owned — the moved Vec itself)
→ pocket-ui-wgpu: PSM_8888/Owned → borrow view.pixels → Queue::write_texture
→ wgpu::Texture
```

## E. Deleted migration debris

| Item | State |
|---|---|
| `register_native_texture` call/import | GONE from PicoView (also absent from PocketJS integration revision) |
| `ADMISSION_FORMAT` const | DELETED |
| `use pocketjs_core::spec::psm;` | DELETED |
| `AdmissionPlane` enum + accessors | DELETED (was borrow-API debris; replaced by owned `prepare_for_admission`) |
| `NativeResource` | never existed on this line; not recreated |
| `view.psm` test assertion | DELETED (PocketJS owns its internal representation contract) |

## F. Ordinary-image plane ledger

```text
complete CPU image planes:            1  (the WIC decode allocation)
repository CPU-to-CPU full-plane copies after decode: 0
  - prepare_for_admission returns the decode unchanged (move)
  - publish moves rgba into upload_owned_rgba8 (TexBacking::Owned, no aligned store)
  - pocket-ui-wgpu borrows the Owned plane straight into Queue::write_texture
peak extra pixel bytes:               0
GPU transfer (Queue::write_texture) is the required device upload, not a CPU copy.
```

## G. Giant-image plane ledger (separate truth)

Images above `NATIVE_TEX_MAX_DIM` (8192) on either axis are box-fitted
before admission — unchanged #55 behavior, same named justification
(admission-ceiling workaround, not product resize semantics). Transient
cost: original decoded plane + fitted plane coexist during the fit; the
original drops when `prepare_for_admission` returns. Do not claim
all-sizes-one-plane.

## H. Ownership proof

`current_item::tests::decoded_allocation_becomes_the_pocketjs_record_backing`
(LOCAL PASS): a `DecodedImage` is published through the real `publish` seam;
after `upload_owned_rgba8`, `Ui::texture(handle)` returns a `TexView` whose
`pixels.as_ptr()` equals the pre-move `rgba.as_ptr()` — allocation identity,
not merely equal contents. Dimensions, byte contents, and the `linear` flag
verified on the same view; retire drops the record.

PocketJS-side basis (verified at `24bab5e`): `upload_owned_rgba8` stores the
Vec as `TexBacking::Owned { data }` inside the existing slot record;
`Texture::pixels()` returns that Vec's buffer unchanged.

## I. Logical resource proof

`current_item_opens_replaces_and_retires_native_handles` (LOCAL PASS,
unchanged semantics): open first → handle live; open second → first stale
(`texture(first).is_none()`), second live; corrupt open after success
retires the prior resource (documented #55 behavior); directory path fails
bounded as `NotAFile`; explicit retire removes the resource. One handle
namespace (PocketJS generation-tagged), no PicoView registry, no raw GPU
identity. Content-revision and free semantics are core-owned (unchanged at
the integration revision).

## J. PSM audit (post-migration)

Production (`native/src/**`): ZERO matches for `PSM_8888`, `psm::`,
`register_native_texture`, `ADMISSION_FORMAT`, `NativeResource`,
`AdmissionPlane`. Remaining repo-wide matches: `CONTEXT.md` (strikethrough
resolved-differential lines, explicitly historical), and historical evidence
documents (`docs/ARCH-A2/A3/A4-EVIDENCE.md`,
`docs/PICOVIEW-V1-OPEN-ONE-IMAGE-1-EVIDENCE.md`,
`docs/PICOVIEW-DESKTOP-WGPU-CONFORMANCE-CLEANUP-1-EVIDENCE.md`) — history,
left untouched by design.

The ordinary image path has no PSM dependency. `pocketjs_core::NATIVE_TEX_MAX_DIM`
remains as `MAX_RESOURCE_DIM` — a dimension constant of the (retained)
giant-fit workaround, not a representation tag.

## K. Verification

LOCAL (Windows 11, native):

```text
pocketjs @ 24bab5e:  cargo test (engine/core)  → 133 passed, 0 failed
                     cargo test (pocket-ui-wgpu) → 4 passed, 0 failed
                     (integration branch = reviewed PR #2 HEAD, zero byte delta)
PicoView:            cargo test          → 10 passed, 0 failed
                       (incl. WIC JPEG roundtrip, real open path, pointer
                        identity oracle, giant fit, handle lifecycle)
                     cargo build --release → OK
                     cargo clippy --all-targets → 5 pre-existing pedantic
                       warnings (byte-identical code on main) + 1 introduced
                       by this branch (fixed; re-run clean of new warnings)
Real smoke:          release binary + real JPEG fixture, full runtime boot:
                     "current item: generation=1 handle=Some(0)" — owned
                     admission live in the running product
CI:                  NOT RUN (no CI run requested/performed)
```

## L. Adversarial review

Fresh-context reviewer dispatched against the committed branch with the
campaign's attack checklist. Result: recorded in the PR description and the
final campaign report; unresolved MAJOR count at close: 0 (see report section L
for findings and dispositions).

## M. Residual differentials (explicit, out of scope)

Unchanged from `CONTEXT.md` §"Current known implementation differentials"
after the four resolved lines:

- retire-previous-before-admit ordering can drop the last-good image on
  admission failure (pre-existing; explicitly excluded by campaign §21);
- giant-image reduction remains a capability workaround, not full-resolution
  support;
- sampling stored with texture state; NATIVE_TEX_MAX_DIM admission coupling;
  renderer plumbing split; no proved Windows software fallback; RGBA8/PSM-
  oriented color/alpha boundary; CPU-RGBA-only decode; generation/revision
  terminology split — all tracked in CONTEXT.md/ARCHITECTURE.md §20.

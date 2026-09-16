# PICOVIEW-DESKTOP-WGPU-CONFORMANCE-CLEANUP-1 — Evidence

Status: **CAMPAIGN RECORD**  
Date: 2026-09-16  
Base: `origin/main` = `ef5ced2` (merge PR #53)  
Branch: `arch/desktop-wgpu-conformance-cleanup-1`  
PocketJS source identity: `df869a51225df5e310b84612c9195030c058b6d9` (`POCKETJS.lock`; verified against the sibling checkout `HEAD` and every `rev =` pin in `native/Cargo.toml`)  
Authority: `docs/ADR/ADR-0001`, `docs/ADR/ADR-0002`, `docs/ARCHITECTURE.md` (2026-09-16 reset), campaign brief supplied by the owner

---

## A. Frozen Desktop architecture (verified)

```text
PicoView product semantics (guest TSX + native CurrentItem)
  -> PocketJS logical resource / DrawList (pocketjs-core + UiSurface)
  -> hosts/desktop family (PicoView host = single-app adaptation)
  -> pocket-ui-wgpu (UiRenderer / Blit — all rendering)
  -> wgpu (device/queue/textures/surface)
  -> Windows graphics / presentation
```

Ownership at each boundary, as observed in code:

| Boundary | Owner of record | Code evidence |
|---|---|---|
| Product view intent (fit geometry, current-item observation) | PicoView guest TSX | `guest/app.octane.tsx` — bounded svc observer, `registerTexture` bind, pure-dimension fit math |
| Image semantics (decode, admission plane choice, giant bounding) | PicoView native `current_item.rs` | WIC decode → `AdmissionPlane` → seam registration |
| Logical identity / lifetime / revision / draw contract | pocketjs-core (`register_native_texture`, generation-tagged handles, `free_texture`, DrawList) | `engine/core/src/lib.rs` at df869a5 |
| Physical rendering + presentation | `pocket-ui-wgpu` (`UiRenderer`, `to_rgba8`, `write_texture`) + PicoView host window/swapchain plumbing (`native/src/gpu.rs`, adapted from `hosts/desktop/src/gpu.rs`) | rendering itself has no PicoView-side renderer |

## B. Documentation corrections

Adversarial pass over live authority (`README.md`, `AGENTS.md`, `CONTEXT.md`, `docs/PRD/PicoView-PRD-v0.6.md`, `docs/SPEC/PicoView-v1.1.md`, `docs/ADR/*`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`). The 2026-09-16 reset documents already tell one coherent story (no document says Windows owns a renderer, PSM_8888 is canonical, or `hosts/desktop`/`pocket-ui-wgpu` can be bypassed). Corrections made by this campaign keep records truthful after the code change:

| Doc | Change | Reason |
|---|---|---|
| `docs/ARCHITECTURE.md` §20 | Differential list: PicoView-side pre-registration clone removed; admission-failure-as-decode-failure removed; host-plumbing bullet annotated (plumbing only, rendering is `pocket-ui-wgpu`) | reflect post-cleanup reality, keep remaining differentials |
| `docs/ADR/ADR-0002` "Current implementation differential" | PicoView-side copy recorded as removed 2026-09-16; remaining copies attributed to the locked PocketJS revision | ADR stays truthful about which copies remain |
| `CONTEXT.md` | Phase → CODE-REALITY CONFORMANCE; differential list updated; near-term sequence steps 1–4 struck, upstream seam named as next | operational state record |
| `docs/ROADMAP.md` R1 | Execution note: this campaign = R1 audit + owner-authorized subtractive R3 subset; upstream findings under R2-A | prevent "no corrective coding in R1" reading as a contradiction |
| `README.md` | Phase section updated | was stale ("Viewer Architecture Reset") |

Historical evidence documents (`docs/ARCH-A*-EVIDENCE.md`, `docs/PICOVIEW-V1-OPEN-ONE-IMAGE-1-EVIDENCE.md`) are frozen history and were not edited.

## C. Code findings

| # | Finding | Old mechanism | Classification | Resolution |
|---|---|---|---|---|
| 1 | PicoView-side full-plane clone before admission | `NativeResource { pixels: src.rgba.clone() }` → `register_native_texture(&res.pixels, …)` — an ordinary image paid one extra full RGBA copy between decode and core admission, for no semantic role | CODE-DRIFT → DELETE | `NativeResource` deleted; `AdmissionPlane` borrows the decoder's plane (`Source` arm); giant images still produce an owned fitted plane (`Fitted` arm) with a named reason |
| 2 | Admission failure labeled as decode failure | registration rejection → `OpenError::Decode("resource registration rejected")` | CODE-DRIFT → DELETE | new `OpenError::Admission` variant; message "could not admit image resource: …" (ARCHITECTURE §16) |
| 3 | PSM_8888 presented as canonical in code comments | "Canonical PSM_8888 bytes", "PSM_8888 memory bytes ARE R,G,B,A order … full stop" framing | DOC-DRIFT (in code) → DELETE/MIGRATE | `ADMISSION_FORMAT` const documents the tag as a locked-revision seam constraint, not a Desktop representation decision; migration target named (ADR-0002 §3) |
| 4 | Core portable detour (RGBA8 → aligned PSM core store) | `register_native_texture` → `copy_aligned` full copy in pocketjs-core | UPSTREAM-POCKETJS | `POCKETJS-DESKTOP-DIRECT-IMAGE-ADMISSION-1` (R2-A); no local workaround |
| 5 | wgpu re-expansion copy | `pocket-ui-wgpu` `to_rgba8` PSM_8888 arm → `pixels[..bytes].to_vec()` before `write_texture` | UPSTREAM-POCKETJS | same upstream campaign; disappears with direct admission |
| 6 | Giant-image CPU box-fit into `NATIVE_TEX_MAX_DIM` (8192) | PicoView-side box-average downscale when an axis > 8192 | KEEP (documented) | compensates for the seam's dimension ceiling at the locked revision — a backend-limit class, not product resize semantics; deleting it without the upstream capability would turn giant images into hard errors. Migrates with truthful full-resolution capability (R3, ARCHITECTURE §15) |
| 7 | Host window/swapchain plumbing in PicoView (`gpu.rs`, `main.rs`) | adaptation of `hosts/desktop/src/{gpu,main}.rs` without the AppSupervisor multi-app machinery; plus AMD 25.8.1 one-shot first-present reconfigure (V1-corrective-1, evidence-linked) | KEEP (documented differential) | rendering itself is `pocket-ui-wgpu` (`UiRenderer`/`Blit`); the adaptation exists because `hosts/desktop` at df869a5 is a binary crate. Consolidation onto a reusable shared desktop host belongs upstream |
| 8 | Guest fit math in TSX | `fit()` computes viewport-fit box from bounded scalars | KEEP (conformant) | Product view intent per ADR-0001 §3; no re-admission, no CPU resample on view change (A6 satisfied) |
| 9 | Encoded whole-file read (`std::fs::read`) before WIC | P0 allocation | KEEP | ARCHITECTURE §8.5: streaming not mandatory; one whole-file copy, no repeated duplication |
| 10 | `ui.draw().words.clone()` per render | DrawList words clone per changed frame | KEEP | bounded UI command list, not an image plane; identical to the shared desktop host at the locked revision |

## D. PSM audit (every remaining occurrence)

| Location | Role | Desktop authority depends on it? | Reason it remains |
|---|---|---|---|
| `native/src/current_item.rs` `ADMISSION_FORMAT = psm::PSM_8888` | format tag for the locked seam API | no — it is an API parameter, not a representation decision | `register_native_texture` at df869a5 accepts only PSM_5650/4444/8888; 8888 is the 32-bit photo tag whose memory bytes are R,G,B,A, so WIC RGBA admits verbatim. Migrates with the upstream direct-admission API |
| `native/src/current_item.rs` `use pocketjs_core::spec::psm` | import for the tag + test assertion | no | same as above |
| `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/ADR/ADR-0002` | naming the differential / the forbidden chain | no — they forbid PSM as canonical Desktop representation | architecture authority language |
| `docs/ARCH-A2/A3/A4-EVIDENCE.md`, `docs/PICOVIEW-V1-OPEN-ONE-IMAGE-1-EVIDENCE.md` | frozen history | no | history/evidence only, not edited |
| pocketjs `engine/core` / `pocket-ui-wgpu` (upstream repo) | portable core storage + expansion | no — backend-side portable path | valid for backends/workloads that need it (ADR-0002 §3); not PicoView's to change |

No PSM noun remains in PicoView guest/TSX or product-visible contracts.

## E. Image-plane audit (ordinary still-image path)

Before cleanup (5 full-plane allocations, 3 avoidable copies):

```text
P0 encoded bytes            fs::read → Vec<u8>                    mandatory input (WIC memory stream)
P1 decoder RGBA             WIC → DecodedImage.rgba               mandatory decode output
P2 NativeResource.pixels    src.rgba.clone()                      AVOIDABLE — deleted
P3 core aligned store       register_native_texture → copy_aligned Vec<u128>   UPSTREAM (PSM portable detour)
P4 wgpu temp RGBA           pocket-ui-wgpu to_rgba8 → to_vec()    UPSTREAM (re-expansion)
P5 wgpu::Texture            write_texture                          mandatory CPU→GPU transfer
```

After cleanup (4 full-plane allocations, 2 copies remain, both upstream):

```text
P0 encoded bytes            fs::read → Vec<u8>                    mandatory
P1 decoder RGBA             WIC → DecodedImage.rgba               mandatory; lived only inside CurrentItem::open
P2 core aligned store       register_native_texture (borrowed &[u8] in, full copy)   UPSTREAM — migrates with direct admission
P3 wgpu temp RGBA           to_rgba8().to_vec()                   UPSTREAM — disappears with direct admission
P4 wgpu::Texture            write_texture                          mandatory transfer
```

Zero-copy proof on the PicoView side: `AdmissionPlane::Source` borrows the decode (`std::ptr::eq` oracle in `ordinary_decodes_admit_as_borrowed_source_planes`); the core-stored bytes equal the WIC decode byte-for-byte through the real seam (`current_item_opens_replaces_and_retires_native_handles`).

## F. PocketJS upstream requirement (not worked around locally)

`POCKETJS-DESKTOP-DIRECT-IMAGE-ADMISSION-1` (R2-A), minimal generic capability:

- a PocketJS-core/desktop admission entry that accepts an already-admissible RGBA8 plane (borrow or ownership move) and produces wgpu residency through `pocket-ui-wgpu` without the portable `copy_aligned` core store and without the `to_rgba8` re-expansion;
- preserves the existing logical identity model: one handle namespace, generation-tagged handles, `content_revision` owned by Core, existing DrawList contract unchanged;
- representation-aware admission descriptors and truthful resource-capability reporting are follow-on generic work; the 8192 admission ceiling then becomes a reported backend limit rather than a PicoView-side silent downscale trigger.

## G. Test evidence

Native Windows host (the authoritative environment). Commands run from `native/`:

```text
cargo test                → 9 passed; 0 failed   (svc bounds, error caps, borrow-arm ptr oracle,
                                                    giant fitted byte order, WIC roundtrip/garbage,
                                                    open/replace/retire + end-to-end seam byte oracle,
                                                    decode alloc cap, guest texture-key contract)
cargo build --release     → Finished `release` [optimized]
cargo clippy --all-targets→ 5 pre-existing pedantic warnings (const-size chunks_exact in the
                             fixed 4-byte pixel loops, test-only ok().expect, same-type .into());
                             none introduced by this campaign; left to match existing style
```

Rust identity: `rustc 1.98.1 (48a229cea 2026-09-01)`; host `x86_64-pc-windows-msvc` (default target). No physical performance claim is made by this campaign (no benchmark budgets touched), so no BENCHMARK.md report is required.

## H. Fresh adversarial review

Pending — filled below after the fresh-context review pass.

## I. Residual differentials (intentional, migration-pending)

1. Normal Desktop admission still transits the locked seam's PSM-tagged portable core store (P2/P3 above) — **UPSTREAM-POCKETJS**, not conformant with ADR-0002 direct admission until the upstream campaign lands and `POCKETJS.lock` advances.
2. Giant images are silently box-fitted to 8192 without truthful full-resolution capability — migration target R3 (ARCHITECTURE §15).
3. Refresh/replacement still retires the previous resource before replacement admission is known-good — migration target R3 (last-good ordering, ARCHITECTURE §7.4).
4. Host window/swapchain plumbing is adapted (not shared-library) — consolidation upstream; rendering itself already is the shared `pocket-ui-wgpu`.
5. No proved software fallback; color/alpha admission effectively RGBA8-oriented; sampling partly texture-state; `content_revision` not yet surfaced as a Core-owned concept on this path; decode always materializes CPU RGBA.

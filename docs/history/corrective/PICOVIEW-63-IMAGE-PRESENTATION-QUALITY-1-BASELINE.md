# PICOVIEW-63-IMAGE-PRESENTATION-QUALITY-1 — Baseline Evidence

Status: **CAMPAIGN BASELINE (pre-fix)**  
PicoView BASE: `52c4d4f6a7cf2983ad26fdc832c95212d53087d5` (`main`)  
PocketJS lock revision: `24638737473cc7cd85202ba15adba511b79d9980`  
Branch: `fix/63-image-presentation-quality-1`  
Campaign: R2 minification quality + R3 resize scheduling / presentation quality

---

## Phase 0 — C:\img corpus inventory

Primary local smoke corpus (not committed to git):

| File | Size | Dimensions | Format | Content class | Downscale / stress value |
| --- | --- | --- | --- | --- | --- |
| `001R0E0aly1i50ph1thhjj66dc48w1l102.jpg` | 5,243,177 B | **8256×5504** | JPEG RGB | large photograph; high-frequency fine detail (gx≈4.35, gy≈4.94, lap≈13.19, edge≈0.146) | **primary R2 stress**: Fit/zoom-out minification ~10–20×; moire/aliasing-prone |
| `153fcfe9-d06a-411e-98b5-3fb62a77afc3.png` | 1,318,472 B | **1254×1254** | PNG RGB | medium square illustration/graphic; moderate frequency (gx≈2.70, gy≈2.90, lap≈7.14, edge≈0.061) | secondary: moderate minification + edge quality |

Corpus notes:
- No pure screenshot/text-heavy image is present in `C:\img` at baseline. Campaign will treat the large photo as the high-frequency minification stress case and the PNG as a moderate graphic case.
- Supplemental synthetic evidence may be generated later only if needed; runtime evidence remains `C:\img`.
- User images are **not** copied into git.

---

## Phase 1 — Pipeline facts (code baseline)

### Admission / image resource

- Decode: WIC → EXIF orientation materialized → owned RGBA8 (`native/src/current_item/decode.rs`).
- Admission: `Ui::upload_owned_rgba8(rgba, w, h, true)` — **FLAG_LINEAR = true** (`native/src/current_item/mod.rs` ~302).
- Ordinary path admits full source resolution (within `NATIVE_TEX_MAX_DIM` 8192). No destructive pre-shrink for the 8256×5504 photo.
- Fit / zoom-out is **presentation geometry**, not a required CPU pyramid.

### PocketJS image texture upload (R2 hot path)

File: `third_party/pocketjs/engine/crates/pocket-ui-wgpu/src/render.rs` `upload_image`

| Fact | Baseline value |
| --- | --- |
| Texture create | `mip_level_count: 1` |
| Usage | `TEXTURE_BINDING \| COPY_DST` only (no `RENDER_ATTACHMENT`) |
| Level-0 upload | `Queue::write_texture` of full RGBA plane once per `(handle, revision)` |
| Linear sampler | `mag=Linear, min=Linear`, **no mipmap filter** (default; irrelevant at 1 mip) |
| Nearest sampler | `mag=Nearest, min=Nearest` |
| Cache | `ImageVersion { handle, revision }` — resize/Fit/zoom do **not** re-upload |
| Intermediate CPU pyramid | **none** |
| Long-lived CPU duplicate chain | **none** |

### Present path (R1 consumed)

- Retained shell target: physical = measured client (`mip_level_count: 1` render target; correct for a full UI composite, not the R2 image issue).
- Present policy: `BlitFilter::Exact` → Nearest when retained == swapchain; `BlitFilter::Transient` → Linear size bridge.
- Dynamic geometry: logical = measured physical ÷ live OS scale (`resolve_geometry`).
- Swapchain: Fifo, desired frame latency 1.

### Resize / scheduling (R3 hot path)

| Fact | Baseline value |
| --- | --- |
| Window `Resized` | every event → `Input::Presentation { measured_physical, os_scale }` + `request_redraw` |
| `ScaleFactorChanged` | same Presentation push |
| Input channel | `sync_channel(256)` — no coalescing at Host |
| Runtime drain | `try_iter().take(256)` then **each** `Input::Presentation` applied (guest `resize` eval + svc_push + geometry overwrite) |
| Tick | one guest frame after drain; signature from draw hash + raster revision + live geometry |
| Render demand | re-render when `RenderSignature` changes (geometry bits included) |
| Output channel | capacity 1; Host keeps latest `self.frame` |
| Frame pool | `FRAME_TARGETS = 3`; **pool cleared when size changes** |
| Present on Resized | presents last available retained target (often previous size) as Transient/Linear |

### Expected baseline symptoms (product)

R2 — settled minification quality:
- Large photo Fit / strong zoom-out / small window: single-level bilinear from 8256×5504 → viewport produces aliasing, moire, noisy/shimmering reduction, uneven high-frequency texture.
- Screenshot/text-like downscale would show soft/blocky text if present in corpus.

R3 — transient resize presentation:
- Continuous drag: many intermediate `Presentation` applications (each guest resize + possibly signature-driven re-render).
- Size change thrashes retained-target pool (clear-on-size-change).
- User may observe: stale old-size frame bridged too long while worker catches up; lag behind cursor; jumpiness after intermediate renders.
- Settled exact frame policy exists (Exact/Nearest) — correctness path is present; scheduling quality is the debt.

---

## Phase 2 — Root-cause split

### R2 — image minification quality (PocketJS generic)

**Root cause:** `pocket-ui-wgpu::UiRenderer::upload_image` always creates image textures with `mip_level_count: 1`. Linear images (`TexView::linear`, PicoView production) therefore minify with a single-level bilinear tap from level 0. For ~10–20× Fit reduction on 8256×5504 high-frequency content this is physically insufficient.

**Belongs to:** PocketJS generic desktop/wgpu backend (`pocket-ui-wgpu`), not PicoView Product/Image policy.

**Not R2:** retained-target blit Exact/Transient policy (already R1 present identity); Fit math in guest (Product view intent).

### R3 — resize scheduling / presentation quality (PicoView native)

**Root cause candidates (confirmed in code):**
1. Every `Resized` / DPI event enqueues a full `Input::Presentation`; runtime applies **every** event (geometry latest-wins only after intermediate guest eval/svc work).
2. Continuous drag produces many distinct physical sizes → retained frame pool cleared repeatedly → GPU target recreation churn.
3. Signature includes physical size → intermediate geometries are valid re-render demands; worker may produce obsolete-size frames that still consume the single-slot output pipeline until coalesced.

**Not R3:** missing mip chain (that is R2); fake animation/easing (out of scope).

**Boundary rule:** do not “fix” minification with scheduling changes; do not hide stale frames without reducing obsolete work.

---

## Implementation placement decision

| Layer | Placement | Provenance |
| --- | --- | --- |
| R2 GPU mip chain for linear image textures | **PocketJS** `pocket-ui-wgpu` (generic desktop backend) | upstream `jnhu76/pocketjs` → `integration/picoview-desktop` → subtree pull + `POCKETJS.lock` |
| R3 latest-wins coalescing of Presentation inputs | **PicoView** `native/src/runtime.rs` (host scheduling) | PicoView PR only |

No hand-edit of `third_party/pocketjs` without subtree provenance.

---

## Adversarial pre-check (baseline)

- Extra full-plane CPU copies: **not introduced by baseline facts** (owned RGBA8 moves; wgpu uploads level 0 only). R2 must preserve this.
- Redundant re-upload on resize: **not present** (image cache on handle+revision). R3 must not introduce re-upload.
- PocketJS lock: exact revision listed above is the only legal pre-change snapshot.

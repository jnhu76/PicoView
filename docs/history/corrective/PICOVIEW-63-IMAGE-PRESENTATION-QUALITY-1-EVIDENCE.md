# PICOVIEW-63-IMAGE-PRESENTATION-QUALITY-1 — Campaign Evidence

Status: **COMPLETE — READY FOR REVIEW**  
Campaign: R2 image minification quality + R3 resize scheduling / presentation quality  
PicoView BASE_SHA: `52c4d4f6a7cf2983ad26fdc832c95212d53087d5`  
Branch: `fix/63-image-presentation-quality-1`

---

## PocketJS provenance

| Fact | Value |
| --- | --- |
| Previous lock | `24638737473cc7cd85202ba15adba511b79d9980` |
| Upstream change | `jnhu76/pocketjs` `integration/picoview-desktop` |
| New lock revision | `4cf84b8d0124ae2e67681f279e6f5427917b4aff` |
| Message | `feat(ui-wgpu): GPU mip chain for linear image minification` |
| Integration | `git subtree pull --prefix=third_party/pocketjs … --squash` |
| Hand-edit of subtree | **No** |

R2 belongs to generic PocketJS `pocket-ui-wgpu` (shared macOS/Linux/Windows desktop backend family). R3 stays in PicoView native host scheduling.

---

## C:\img corpus (runtime primary)

| File | Dimensions | Type | Class | Role |
| --- | --- | --- | --- | --- |
| `001R0E0aly1i50ph1thhjj66dc48w1l102.jpg` | 8256×5504 | JPEG RGB | high-frequency photo | R2 stress (Fit ~10–20× minification) |
| `153fcfe9-d06a-411e-98b5-3fb62a77afc3.png` | 1254×1254 | PNG RGB | moderate graphic | secondary minification |

User images are **not** committed. Browse session smoke: `dir=C:\img count=2`.

---

## Baseline findings (code + smoke)

### R2 root cause
`third_party/pocketjs/engine/crates/pocket-ui-wgpu/src/render.rs` `upload_image` used `mip_level_count: 1` for all image textures. PicoView admits owned RGBA8 with `FLAG_LINEAR=true`. Fit / zoom-out therefore minified large photos with single-level bilinear taps — aliasing / moire / noisy reduction on high-frequency content.

### R3 root cause
Every `Resized` / `ScaleFactorChanged` enqueued `Input::Presentation`. The runtime worker applied **each** event (guest resize eval + svc_push + geometry overwrite) even when newer sizes followed in the same batch. Continuous drag produced obsolete intermediate work; retained-target pool cleared on every size change.

### Runtime smoke (AFTER build, Windows, AMD Radeon iGPU, Vulkan)
- Default open 960×640 Dynamic @ OS scale 1.0
- Admission full-resolution (`handle=Some(11)`) — no pre-shrink
- Settled present: `retained=960x640 swapchain=960x640 policy=Exact filter=Nearest`
- No crash; browse previous/next path live (`count=2`)

Logs: `smoke-photo.log`, `smoke-png.log` in this directory.

---

## R2 implementation summary

**PocketJS** `pocket-ui-wgpu`:

- `image_mip_level_count(w,h) = floor(log2(max(w,h)))+1`
- Linear images (`TexView::linear`): create texture with full mip chain + `RENDER_ATTACHMENT`
- Upload **level 0 once** via `Queue::write_texture` (borrowed RGBA8; no conversion plane)
- Generate levels 1..N **on GPU** with a 4-tap linear downsample pass
- Linear sampler: `mag=Linear, min=Linear, mipmap_filter=Linear`
- Nearest images keep `mip_level_count: 1`
- **No** CPU pyramid, **no** long-lived CPU duplicate chain
- Image cache still keyed by `(handle, revision)` — resize/Fit do **not** re-upload

Acceptance proxy (CPU stand-in for GPU mips, high-frequency Laplacian energy; lower = less aliasing):

| Image | Target | bilinear-only | mip-like | Δ |
| --- | --- | --- | --- | --- |
| large photo | 960×640 | 9.231 | 8.707 | −0.524 |
| large photo | 480×320 | 9.768 | 8.953 | −0.815 |
| large photo | 240×160 | 10.782 | 9.814 | −0.968 |
| PNG graphic | 320×320 | 18.321 | 17.962 | −0.359 |
| PNG graphic | 160×160 | 34.385 | 33.280 | −1.105 |

Comparing images: the bilinear and mip-like capture sets that accompanied this
table — twelve `cpu-compare-*.png` files — were removed from the tree for the
owner's privacy [capture removed from current tree for owner privacy]. The
numeric comparison above is unaffected.

---

## R3 implementation summary

**PicoView** `native/src/runtime.rs`:

- `coalesce_presentation_batch`: consecutive `Input::Presentation` collapse to the **latest** measured physical + OS scale
- Service / command / open / quit remain **barriers** (flush pending presentation first)
- One guest tick + one signature/render demand per coalesced batch
- R1 semantics preserved: Dynamic logical from measured physical + live OS scale; Exact/Nearest vs Transient/Linear present policy untouched
- **No** easing / spring / fake interpolation

Unit tests: consecutive coalesce; service barrier; open command order; empty/trailing presentation.

---

## Tests

| Suite | Result |
| --- | --- |
| `bun test guest/` | **172 pass / 0 fail** |
| `cargo test --manifest-path native/Cargo.toml` | **44 pass / 0 fail** (includes R3 coalescing + R1 geometry) |
| `cargo test -p pocket-ui-wgpu` (subtree) | **7 pass / 0 fail** (mip count + GPU owned-RGBA admission) |
| `cargo build --release --manifest-path native/Cargo.toml` | **OK** |

---

## Changed files (PicoView)

- `native/src/runtime.rs` — R3 latest-wins coalescing + unit tests
- `POCKETJS.lock` — provenance → `4cf84b8…`
- `CONTEXT.md` — provenance table
- `third_party/pocketjs/**` — subtree squash of R2 (`pocket-ui-wgpu` render/blit/lib)
- `docs/history/corrective/PICOVIEW-63-IMAGE-PRESENTATION-QUALITY-1-BASELINE.md`
- `docs/history/corrective/PICOVIEW-63-IMAGE-PRESENTATION-QUALITY-1-EVIDENCE.md` (this file)
- smoke logs + CPU compare images (campaign-local evidence)

---

## Adversarial review

| # | Question | Verdict |
| --- | --- | --- |
| A | Improve only one image type / regress others? | **MINOR risk closed by design**: both PicoView admissions are linear; nearest path unchanged. No corpus screenshot for text-specific A/B. |
| B | Settled quality up but resize latency worse? | **No**: R3 removes intermediate applications; mips are admission-time only, not per-resize. |
| C | Latest-wins drops needed non-resize work? | **No**: barrier tests cover service/open/quit ordering. |
| D | Break R1 exact/transient? | **No**: presentation geometry/filter tests pass; smoke still Exact on settle. |
| E | Extra full-plane CPU copies? | **No**: GPU mip gen; owned RGBA8 still moves once; GPU admission test passes. |
| F | Hand-edit subtree without provenance? | **No**: upstream `4cf84b8` + subtree pull + lock. |
| G | Hide stale frames instead of fixing scheduling? | **No**: coalescing reduces obsolete work; Transient bridge policy unchanged. |
| H | Regress screenshots/text while helping photos? | **Unproven positively**: no text-heavy image in `C:\img`. Physics of mips favor text downscale; residual manual check recommended. |
| I | Large-image memory regression? | **MINOR**: GPU residency for linear images grows by ~1/3 (mip chain). Named cost of quality; no extra CPU plane. |
| J | Alter viewer semantics outside presentation quality? | **No**: Fit/CurrentItem/publication/command vocabulary untouched. |

### MAJOR
None.

### MINOR
1. `C:\img` has no pure screenshot/text-heavy sample — text downscale quality not runtime-eyeballed this campaign.
2. Large linear images pay ~33% extra GPU VRAM for mips (expected; no CPU pyramid).
3. Local build scaffolding: `third_party/pocketjs/guest` junction + root `node_modules/@pocketjs/framework` junction used for guest compile/tests — **not committed**.
4. Human visual A/B on the live window still recommended for shimmer subjective judgment; automated evidence is logs + Laplacian proxy + unit/GPU tests.

---

## Known remaining limitations

- Live DPI 125/150/200% acceptance **not** in this campaign (explicit non-goal).
- Toolbar/font visual corrective **not** in this campaign.
- Software renderer fallback still unproved (pre-existing CONTEXT debt).
- Continuous-resize frame-time profiling on high-DPI multi-monitor not run here.

---

## Final verdict

**IMAGE_PRESENTATION_QUALITY_READY_FOR_REVIEW**

# PICOVIEW-ACTUAL-SIZE-CAPABILITY-1 — Evidence

Campaign: PICOVIEW-ACTUAL-SIZE-CAPABILITY-1
Branch: `fix/actual-size-capability-1`
BASE_SHA: `b3c80af04071c0312bc0d3da63fc235752adc8a1`
POCKETJS.lock before: `4cf84b8d0124ae2e67681f279e6f5427917b4aff`
POCKETJS.lock after: `3f31a20f3a0c82d74dc4e640fb55b889b6486a9f`
PocketJS changed: **YES**
- upstream feature: `jnhu76/pocketjs` `feat/desktop-image-device-capability-1` @ `3f31a20`
- integration freeze: `jnhu76/pocketjs` `integration/picoview-desktop` @ `3f31a20`
- import: `git subtree pull --prefix=third_party/pocketjs pocketjs integration/picoview-desktop --squash`
- lock advanced to `3f31a20`

## Limits

| Layer | Before (BASE) | After |
| --- | --- | --- |
| adapter.max_texture_dimension_2d | 16384 | 16384 |
| requested device limits | `wgpu::Limits::default()` → 8192 | `desktop_image_required_limits`: only `max_texture_dimension_2d` raised to adapter (16384); other defaults unchanged |
| actual device.max_texture_dimension_2d | **8192** | **16384** |
| PocketJS Core admission ceiling | fixed `NATIVE_TEX_MAX_DIM` 8192 | `Ui::image_max_texture_dim` default 8192; hosts set from **created device** |
| PicoView admission trigger | `MAX_RESOURCE_DIM = NATIVE_TEX_MAX_DIM` | `ImageAdmissionPolicy` from `device.limits().max_texture_dimension_2d` + `MAX_DECODE_PIXELS` |
| PicoView CPU decode guard | `MAX_DECODE_PIXELS = 80_000_000` | **kept** |

## Memory facts — 8256×5504

| Quantity | Value |
| --- | --- |
| source pixels | 45,441,024 |
| RGBA8 level-0 | 181,764,096 B = 173.34 MiB |
| R2 mip levels | 14 |
| full mip-chain bytes | 242,351,876 B = 231.12 MiB |
| mip extras | 57.78 MiB |
| decode guard | 45.4M ≤ 80M → allowed |
| product policy after change | `max_resource_dim=device_dim`, `max_resource_pixels=80M` |

## C:\img before/after (100% DPI, native Windows)

| Image | Before | After |
| --- | --- | --- |
| `001R0E0aly1i50ph1thhjj66dc48w1l102.jpg` 8256×5504 | source 8256×5504 → proxy resource (~8192 fit) → `fullResolution=false` → status Proxy → 1:1 disabled | source 8256×5504 → **resource 8256×5504** → `fullResolution=true` → status Full resolution → 1:1 enabled by existing gate |
| `153fcfe9-…png` 1254×1254 control | source=resource 1254×1254 → full → 1:1 enabled | **unchanged** full resolution → 1:1 enabled |

Live release log (after):

```text
device limits: max_texture_dimension_2d=16384 (adapter 16384)
PicoView image capability: adapter_max_tex2d=16384 device_max_tex2d=16384
current-item open: source=8256x5504 resource=8256x5504 fullResolution=true policy.max_dim=16384 policy.max_pixels=80000000
window shown after first presented frame
present end (frame tick 1, submitted true)
```

Control:

```text
current-item open: source=1254x1254 resource=1254x1254 fullResolution=true policy.max_dim=16384 policy.max_pixels=80000000
```

Device safety: no wgpu validation error, no device lost, process stayed alive (~449 MiB WS on giant; ~274 MiB on control), first present submitted.

## fullResolution derivation proof

```rust
// current_item/mod.rs
let full_resolution = source_w == resource_w && source_h == resource_h;
```

Guest observer fallback: `fullResolution = sourceWidth === resourceWidth && sourceHeight === resourceHeight`.

No separate “pretend full resolution” boolean exists.

## 1:1 gate proof

Unchanged guest authority (`guest/app.octane.tsx`):

```ts
const can100 = pub?.fullResolution === true;
```

Keyboard: `canImage && can100` → `oneToOne`.
Toolbar 1:1: `disabled={!canImage || !can100}`.
Zoom label: proxy → `"Proxy"`; full at 1.0 → `"100%"`.

Therefore full-res publication naturally enables 1:1; proxy remains disabled.

## Old vs new admission policy

**Old**

```text
source → if axis > NATIVE_TEX_MAX_DIM(8192) → box-fit proxy → fullResolution=false
```

**New**

```text
PocketJS Desktop request_device(desktop_image_required_limits(adapter))
  → device.limits().max_texture_dimension_2d   // execution authority
  → Ui::set_image_max_texture_dim(device_dim)
  → CurrentItem ImageAdmissionPolicy { max_resource_dim: device_dim, max_resource_pixels: 80M }
  → prepare_for_admission(decoded, policy)
       exact if axes ≤ dim AND pixels ≤ budget
       else bounded proxy
  → fullResolution = (resource == source)
  → can100 = fullResolution
```

## Tests (LOCAL — not a claim of GitHub CI)

| Suite | Result |
| --- | --- |
| `cargo test --manifest-path native/Cargo.toml` | **59 pass / 0 fail** |
| `bun test guest/` (toolbar baseline worktree, guest unchanged) | **194 pass / 0 fail** |
| PocketJS core `upload_owned*` (subtree) | **4 pass / 0 fail** |
| PocketJS pocket3d `desktop_image*` | **3 pass / 0 fail** |
| `cargo build --release --manifest-path native/Cargo.toml` | **OK** |
| Live probe `gpu_cap_probe` after change | device dim 16384; create_texture(8256×5504)=OK |
| Live `admission_live_accept` | Core upload 8256×5504 handle≥0; resource exact; policy admits |
| Live release open 8256 JPEG | fullResolution=true; present submitted |
| Live release open 1254 PNG | fullResolution=true; no regression |

Admission pure cases A–F live in `native/src/current_item/tests.rs`.
Live corpus case: `live_c_img_corpus_follows_installed_device_capability`.

## Adversarial review

| ID | Attack | Verdict |
| --- | --- | --- |
| A | Just rename 8192→16384? | **NO** — device request uses adapter fact; Core uses installed device ceiling; PicoView uses policy object; portable default 8192 remains when no device fact exists |
| B | Trust adapter without device? | **NO** — admission uses `device.limits()` after `request_device`; unit test locks “only raise max_texture_dimension_2d” |
| C | Raise unrelated WGPU limits? | **NO** — `desktop_image_required_limits` raises only `max_texture_dimension_2d`; buffer/bind-group/array limits stay default (tested) |
| D | Product textures device cannot create? | **NO** — Core ceiling is set from created device; Product policy uses the same dim |
| E | Delete CPU memory guards? | **NO** — `MAX_DECODE_PIXELS=80M` kept in every device-derived policy |
| F | 1:1 enabled for proxy? | **NO** — gate remains `fullResolution===true`; proxy dimensions ≠ source ⇒ false |
| G | fullResolution without exact resource dims? | **NO** — derived equality only |
| H | Second GPU-capability authority in PicoView? | **NO** — decode/Product never query wgpu; runtime passes one device fact |
| I | Hand-edit PocketJS subtree? | **NO** — upstream commit `3f31a20` → integration branch → subtree pull + lock |
| J | R2 mip memory unsafe for new full-res path? | **MINOR residual** — 231 MiB GPU for this image on iGPU; process stayed alive; no tiling/streaming in scope |
| K | Additional full-plane CPU copies? | **NO** for capable path (move, ptr-eq test); proxy path still materializes one fitted plane (pre-existing) |
| L | 1254×1254 regression? | **NO** — live + unit CASE E |
| M | Custom zoom #69 regression? | **NO guest semantic change**; zoom_editor/view_transform guest tests pass |
| N | Accidental DPI/release work? | **NO** — 100% only; no toolbar/R2/R3 redesign |

## MINOR residual (PR #70 review) — closed by CORRECTIVE-1

| MINOR | Closure |
| --- | --- |
| 1. Desktop child surfaces did not inherit device image capability | PocketJS `720e6ee`: AppSupervisor stores created-device `image_max_texture_dim` and installs it on root + every AppInstance child UiSurface. Test `child_surfaces_inherit_created_device_image_capability`. |
| 2. `max_resource_pixels` not a strict invariant after proxy rounding | `proxy_resource_size`: ideal scale → integer target → hard shrink → grow only toward ideal target. Counterexample 113×8858 @ 1e6: old round path 113×8854=1,000,502; corrected holds `cw*ch<=1e6`. |
| 3. Evidence tools stale / Product policy mirror | `gpu_cap_probe` reports current `desktop_image_required_limits`; `admission_live_accept` no longer mirrors `ImageAdmissionPolicy` constants. |

CORRECTIVE-1 PocketJS lock: `720e6ee3ed91d53038ae6c6330420bb46dabca30`


## Non-goals honored

- `can100 = publication.fullResolution === true` unchanged
- no forced 1:1
- no Proxy relabel
- no new global magic number as the *solution* (device fact + product budget)
- no tiled/streaming decode
- no CurrentItem redesign
- no R2/R3/toolbar/#69 zoom/DPI/release campaigns

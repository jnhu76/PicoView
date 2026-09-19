# PICOVIEW-ACTUAL-SIZE-CAPABILITY-1 — Phase 0/1/2 evidence

Campaign: PICOVIEW-ACTUAL-SIZE-CAPABILITY-1
BASE_SHA: b3c80af04071c0312bc0d3da63fc235752adc8a1
Branch: fix/actual-size-capability-1
Worktree: C:\Users\fred1\source\PicoView-wt-actual-size-capability-1
POCKETJS.lock revision: 4cf84b8d0124ae2e67681f279e6f5427917b4aff
Probe: native/examples/gpu_cap_probe.rs (release, same Gpu bootstrap as hosts/desktop)
DPI: 100% Windows scale (this campaign)

## Machine / adapter

| Fact | Value |
| --- | --- |
| adapter.name | AMD Radeon(TM) Graphics |
| adapter.backend | Vulkan |
| adapter.device_type | IntegratedGpu |
| adapter.vendor / device | 0x1002 / 0x1638 |
| OS evidence class | native Windows |

## Limits (execution authority = created device)

| Limit | wgpu::Limits::default() (requested) | adapter.limits() | device.limits() (actual) |
| --- | --- | --- | --- |
| max_texture_dimension_2d | 8192 | **16384** | **8192** |
| max_texture_dimension_1d | 8192 | 16384 | 8192 |
| max_texture_array_layers | 256 | 2048 | 256 |
| max_buffer_size | 268435456 | u64::MAX | 268435456 |

Device creation site: `third_party/pocketjs/engine/pocket3d/crates/pocket3d/src/gpu.rs`
`required_limits: wgpu::Limits::default()`.

## Texture creation on ACTUAL device (dim=8192)

| Size | Result |
| --- | --- |
| 8192×8192 | OK |
| 8256×5504 | FAILED — Dimension X value 8256 exceeds the limit of 8192 |
| 8256×1 | FAILED — same |
| 16384×16384 | FAILED |

## PocketJS Core admission gate (CPU)

| Fact | Value |
| --- | --- |
| NATIVE_TEX_MAX_DIM | 8192 |
| upload_owned_rgba8(8256, …) | rejected (`w > NATIVE_TEX_MAX_DIM`) |
| PicoView MAX_RESOURCE_DIM | aliases NATIVE_TEX_MAX_DIM |
| PicoView MAX_DECODE_PIXELS | 80_000_000 |

## C:\img corpus

| File | Size | Pixels |
| --- | --- | --- |
| 001R0E0aly1i50ph1thhjj66dc48w1l102.jpg | 8256×5504 RGB JPEG | 45,441,024 |
| 153fcfe9-d06a-411e-98b5-3fb62a77afc3.png | 1254×1254 RGB PNG (control) | 1,572,516 |

Do NOT commit C:\img.

## Current main admission outcome (code + probe)

### 8256×5504 JPEG

| Fact | Current value |
| --- | --- |
| decoded dimensions (post-EXIF O) | 8256×5504 (unless EXIF swaps; still crosses 8192) |
| MAX_DECODE_PIXELS | PASS (45,441,024 ≤ 80,000,000) |
| prepare_for_admission | box-fit because 8256 > MAX_RESOURCE_DIM 8192 |
| admitted resource | proxy within 8192×8192 (≈8192×5461) |
| fullResolution | **false** |
| visible status | **Proxy** |
| 1:1 gate `can100 = publication.fullResolution === true` | **disabled** |

### 1254×1254 PNG control

| Fact | Current value |
| --- | --- |
| decoded | 1254×1254 |
| prepare_for_admission | pass-through (both axes ≤ 8192) |
| resource | 1254×1254 |
| fullResolution | **true** |
| status | Full resolution |
| 1:1 | **enabled** |

## Memory facts — 8256×5504 (computed from current code constants)

| Quantity | Value |
| --- | --- |
| source pixels | 8256 × 5504 = **45,441,024** |
| RGBA8 level-0 bytes | 181,764,096 = **173.34 MiB** |
| image_mip_level_count (R2) | **14** (`pocket_ui_wgpu::image_mip_level_count`) |
| full GPU mip-chain bytes (exact walk) | 242,351,876 = **231.12 MiB** |
| mip extras beyond L0 | **57.78 MiB** (~1/3 of L0) |
| MAX_DECODE_PIXELS | 80,000,000 → decode allowed |
| transient CPU if proxy path | full decode + fitted plane coexist inside `prepare_for_admission` until return; then decode drops |

Default device `max_buffer_size` remains 256 MiB after any future `max_texture_dimension_2d` raise unless we also raise it; 8256×5504 L0 is 173 MiB and should fit texture upload staging, but full-res admission must stay bounded by product safety, not only dimension.

## Phase 3 root-cause table (baseline)

| LIMIT / AUTHORITY | CURRENT VALUE | OWNER | BLOCKS 8256×5504? | SHOULD IT CHANGE? |
| --- | --- | --- | --- | --- |
| adapter-supported dimension | 16384 | GPU/wgpu adapter | NO (supports) | NO — evidence only |
| requested device dimension | 8192 (`Limits::default`) | PocketJS pocket3d Gpu::request_device | **YES** | **YES** — raise only image dim, adapter-bounded |
| actual device dimension | 8192 | created wgpu Device | **YES** (renderer cannot create 8256) | follows request |
| PocketJS generic admission dimension | NATIVE_TEX_MAX_DIM=8192 | pocketjs-core `upload_owned_rgba8` | **YES** | **YES** — must follow usable device capability, not fixed 8192 |
| PicoView decode pixel guard | MAX_DECODE_PIXELS=80M | PicoView decode.rs | NO (45.4M passes) | KEEP as bounded CPU safety |
| PicoView MAX_RESOURCE_DIM | aliases NATIVE_TEX_MAX_DIM | PicoView decode.rs | **YES** (product admission trigger) | **YES** — replace with capability+policy input |
| resource/upload byte or row limit | default max_buffer_size 256MiB | wgpu device | not the primary blocker for 8256 | do not blindly raise; re-test after dim raise |

**Actual blockers (two layers):**
1. Created device exposes only 8192 → even if PicoView skipped the proxy, `create_texture` fails.
2. PocketJS Core logical admission still hard-rejects w/h > 8192.

Adapter limits alone are NOT sufficient. Correct solution must raise PocketJS device request + Core admission ceiling to the usable device capability, then PicoView admission policy consumes that fact.

## Ownership decision (Phase 4)

| Concern | Owner |
| --- | --- |
| WGPU device-limit selection / capability exposure | PocketJS upstream (`jnhu76/pocketjs` → `integration/picoview-desktop`) |
| Whether to admit a source at full resolution | PicoView CurrentItem admission policy |
| 1:1 enablement | existing guest gate `can100 = fullResolution === true` (unchanged) |
| CPU decode memory guard | PicoView `MAX_DECODE_PIXELS` (keep) |

Preferred flow:
PocketJS Desktop creates device → immutable usable image capability fact → PicoView host/runtime receives fact → CurrentItem admission policy → decode/resource preparation → publication truth.

`decode.rs` must NOT query wgpu adapter/device directly. Do not pass raw `wgpu::Device` into Product code.

## Status

Phase 0 inventory + Phase 1 live limits + Phase 2 memory facts recorded.
Root cause: **not** a mere 8192→16384 rename in PicoView; both PocketJS device request and Core admission ceiling, plus PicoView policy consumption, must become capability-truthful.

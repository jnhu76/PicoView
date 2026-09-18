# PICOVIEW-63-R1-CONSUME-SUBTREE-1 evidence

Campaign: `PICOVIEW-63-R1-CONSUME-SUBTREE-1`  
Corrective: `PICOVIEW-63-R1-CONSUME-SUBTREE-CORRECTIVE-1`  
Train: `PICOVIEW-MVP-POST-CLOSEOUT-TRAIN-1` Stage A  
Branch: `fix/63-r1-consume-subtree-1`

## Identities

| Field | Value |
|---|---|
| PicoView base (post-#64 main) | `c3aed3d4e0329325cf145389b0ff5cc5097ba93d` |
| Stage A original head (pre-corrective) | `e967d707cd2127264f220e3110ff64579a690b5c` |
| PocketJS upstream consumerization | `24638737473cc7cd85202ba15adba511b79d9980` |
| PocketJS PR #3 | CLOSED without merge — integrated-by-FF onto `integration/picoview-desktop@2463873` |
| PocketJS PR #2 | CLOSED without merge — superseded by integration line (`24bab5e` is ancestor of `2463873`) |
| integration/picoview-desktop | `24638737473cc7cd85202ba15adba511b79d9980` (FF from `3a10550`) |
| POCKETJS.lock revision | `24638737473cc7cd85202ba15adba511b79d9980` |
| Guest compile plan | `sha256:c8dec55b0d183728a338bb582c48cd80bd606bf93d34e26111757e81853aadf1` |
| PicoView PR | https://github.com/jnhu76/PicoView/pull/65 **OPEN — do not auto-merge** |

## Root cause (corrective)

PicoView is a **Dynamic** viewport product.

`guest/pocket.json`:

```json
"viewport": { "dynamic": { "default": [960, 640], "min": [384, 240], "max": [4096, 4096] } }
```

Stage A originally consumed `ViewportPolicy::Fixed`, which froze logical
layout at the initial `Host.viewport` while physical presentation continued
changing. That violated product geometry and broke resize/Fit/layout.

Corrective: all normal PicoView paths use `ViewportPolicy::Dynamic`.
`Host.viewport` / CLI `--viewport` is **initial/default requested logical
size only**, not frozen Product logical authority.

## A1 shared-code gate

`hosts/desktop` was binary-only at `3a10550`. R1 types were private.
Upstream consumerization **YES** (not a local copy):

- `hosts/desktop/src/lib.rs` exports geometry + `PresentationGeometry` / `ViewportPolicy` / `RenderSignature` / `resolve_geometry`
- Stock desktop binary consumes the same implementation
- `BlitFilter` / `BlitSet` already live in `pocket-ui-wgpu`

Ownership after Stage A:

| Owner | Responsibility |
|---|---|
| PocketJS | generic R1 geometry/signature/filter semantics (incl. Dynamic resolver + platform floor 240×180) |
| PicoView Product | Dynamic presentation policy for this product, host window/swapchain wiring, CurrentItem, dialogs, associations, embedded guest, product min client 384×240 logical, AMD first-present workaround |

## A2–A7 consumption contract (corrective)

- Viewport policy: **Dynamic**. Logical = `round(measured_physical / live_os_scale)`, clamped to PocketJS `DESKTOP_DYNAMIC_MIN/MAX` (platform floor/ceiling).
- Product minimum remains PRODUCT policy: native window min 384×240 logical, `guest/pocket.json` min 384×240, `shell_layout` `PRODUCT_MIN_CLIENT` 384×240. Do **not** replace with PocketJS 240×180.
- Boot captures measured `Window::inner_size()` + `scale_factor()` and resolves Dynamic. `initial_requested` is logged for evidence only.
- Resized / ScaleFactorChanged: send measured physical + live OS scale; runtime re-resolves Dynamic; `geometry.logical()` → UiSurface viewport → `__pocketResizeViewport` → svc resize.
- Runtime `Input::Presentation { measured_physical, os_scale }` (no product_logical authority field).
- Retained target size = `PresentationGeometry::physical()` (measured), never `logical × package_density`.
- Render scale = `geometry.effective_render_scale()` (live OS scale f32 bits), not package density.
- Package density remains UiSurface cook authority only.
- Demand identity = shared `RenderSignature` (draw hash + raster + physical + effective scale).
- Signature committed only after a target is produced and accepted by the output channel; pool miss / render None / backpressure do **not** suppress retry.
- Present policy: `BlitFilter::select(retained, swapchain)` → Exact/Nearest or Transient/Linear; return to Exact on fresh exact frame. No easing.
- AMD Vulkan first-present reconfigure **preserved** (product/platform workaround).
- Already-passing R1 work preserved: measured physical authority, live render scale, RenderSignature, signature commit point, BlitSet, Exact/Nearest, Transient/Linear.

## Tests (corrective)

| Command | Result |
|---|---|
| `bun test guest` | 172 pass / 0 fail |
| `cargo test --manifest-path native/Cargo.toml` | 40 pass |
| `cargo build --release --manifest-path native/Cargo.toml` | OK |

Dynamic regressions in native (CORRECTIVE-1):

| ID | Test | Coverage |
|---|---|---|
| A | `dynamic_resize_at_100_follows_measured_physical` | 960×640@1.0 → 1200×800@1.0; logical follows; RenderSignature changes |
| B | `dynamic_shrink_at_100_follows_measured_physical` | 600×400@1.0 → logical 600×400 |
| C | `dynamic_dpi_geometry_derives_logical_from_measured_scale` | 1200×800@1.25 / 1440×960@1.5 / 1920×1280@2.0 → logical 960×640 |
| D | `product_minimum_remains_384x240_through_product_contract` | product min stays 384×240; shared floor stays 240×180 |
| E | `exact_present_when_retained_matches_swapchain` | retained==swapchain → Exact/Nearest; mismatch → Transient/Linear |

Also: `dynamic_ignores_initial_requested_for_live_logical`,
`shared_dynamic_floor_stays_pocketjs_platform_min`,
`signature_includes_physical_and_effective_scale`.

## Windows R1 live evidence (this machine, 100%)

Host: AMD Radeon Graphics, Vulkan driver 25.8.1, LOGPIXELSX=96 (**scale=1.0**).

Smoke script: `experiments/63-r1-consume-subtree-1/live_resize_smoke.py`  
Log: `experiments/63-r1-consume-subtree-1/r1-dynamic-resize-live-100pct.log`

Mandatory live resize (catches Fixed-policy bug):

```text
R1 boot geometry: policy=Dynamic initial_requested=960x640 measured_physical=960x640 os_scale=1 package_density=2 logical=960x640 render_scale=1
R1 runtime booted: policy=Dynamic initial_requested=960x640 logical=960x640 physical=960x640 live_scale=1 package_density=2
R1 present: retained=960x640 swapchain=960x640 policy=Exact filter=Nearest
first-present recovery: reconfigure swapchain

Resized 1200x800
R1 presentation update: logical=1200x800 physical=1200x800 os_scale=1
R1 render request: logical=1200x800 physical=1200x800 live_scale=1
R1 present: retained=1200x800 swapchain=1200x800 policy=Exact filter=Nearest

Resized 600x400
R1 presentation update: logical=600x400 physical=600x400 os_scale=1
R1 render request: logical=600x400 physical=600x400 live_scale=1
R1 present: retained=600x400 swapchain=600x400 policy=Exact filter=Nearest
```

Settled states @100%:

| Window client | logical | measured physical | OS scale | retained | swapchain | policy/filter |
|---|---|---|---|---|---|---|
| 960×640 (boot) | 960×640 | 960×640 | 1 | 960×640 | 960×640 | Exact/Nearest |
| 1200×800 | **1200×800** | 1200×800 | 1 | 1200×800 | 1200×800 | Exact/Nearest |
| 600×400 | **600×400** | 600×400 | 1 | 600×400 | 600×400 | Exact/Nearest |

Transient/Linear observed mid-resize (retained lagged swapchain), then returned to Exact on settled frames — expected R1 behavior, not permanent resampling.

| Scale | Live evidence this campaign | Shared unit coverage |
|---|---|---|
| 100% | full boot + 1200×800 + 600×400 resize matrix above | Dynamic A/B/E @1.0 |
| 125% | not captured on this 100% host | Dynamic C @1.25 → logical 960×640 |
| 150% | not captured on this 100% host | Dynamic C @1.50 → logical 960×640 |
| 200% | not captured on this 100% host | Dynamic C @2.00 → logical 960×640 |

**MINOR-1:** Full live 125/150/200 matrix requires changing Windows display scale (or a non-100% machine). Unit coverage proves the Dynamic DPI derivation; do not claim a complete live DPI matrix.

## PocketJS PR dispositions (corrective authorized)

| PR | Head | Disposition |
|---|---|---|
| jnhu76/pocketjs#3 | `2463873` | **Closed without merge.** Consumerization commit reviewed and integrated by FF into `integration/picoview-desktop@2463873`. PR targeted main; GitHub diff was the larger desktop-parity lineage. Integration branch not reverted. |
| jnhu76/pocketjs#2 | `24bab5e` | **Closed without merge.** Head already an ancestor of `integration/picoview-desktop@2463873`; superseded by current integration line. |

## Invariants held

- no permanent retained-target resampling policy
- no package-density presentation authority
- no half-local duplicate R1 geometry in PicoView
- no R2 mipmaps / R3 resize coalescing / UI visual work
- CurrentItem publication semantics unchanged
- product min client remains 384×240 logical
- PocketJS Dynamic floor constants unchanged (240×180 / 4096×4096)
- AMD first-present workaround preserved
- signature commit point preserved
- PR #65 left unmerged

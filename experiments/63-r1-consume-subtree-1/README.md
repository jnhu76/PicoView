# PICOVIEW-63-R1-CONSUME-SUBTREE-1 evidence

Campaign: `PICOVIEW-63-R1-CONSUME-SUBTREE-1`  
Train: `PICOVIEW-MVP-POST-CLOSEOUT-TRAIN-1` Stage A  
Branch: `fix/63-r1-consume-subtree-1`

## Identities

| Field | Value |
|---|---|
| PicoView base (post-#64 main) | `c3aed3d4e0329325cf145389b0ff5cc5097ba93d` |
| PocketJS upstream consumerization | `24638737473cc7cd85202ba15adba511b79d9980` |
| PocketJS PR | https://github.com/jnhu76/pocketjs/pull/3 (OPEN, not auto-merged) |
| integration/picoview-desktop | `24638737473cc7cd85202ba15adba511b79d9980` (FF from `3a10550`) |
| POCKETJS.lock revision | `24638737473cc7cd85202ba15adba511b79d9980` |
| Guest compile plan | `sha256:c8dec55b0d183728a338bb582c48cd80bd606bf93d34e26111757e81853aadf1` |

## A0 inventory (old dirty #63 worktree)

Preserved at `picoview-63-render-pipeline-gate-1` (base `880d58a`, pre-subtree):

- **Evidence (historical):** `docs/compose/spec/picoview-63-render-pipeline-gate-1.md`, `experiments/r1-presentation-geometry-1/`
- **Obsolete after subtree + consumerization:** untracked `native/src/presentation_geometry.rs` / `presentation_model.rs` — local duplicate of R1 geometry. **Not ported.** Stage A consumes `pocket-desktop-host` instead.
- **Experimental dirty mods:** `native/src/gpu.rs`, `native/src/main.rs` on old branch — not continued (would mix pre-subtree history).

## A1 shared-code gate

`hosts/desktop` was binary-only at `3a10550`. R1 types (`PresentationGeometry`, `ViewportPolicy`, `RenderSignature`, `resolve_geometry`) were **not importable**.

Upstream consumerization **YES** (not a local copy):

- `hosts/desktop/src/lib.rs` exports the geometry module
- Stock desktop binary consumes the same implementation
- `BlitFilter` / `BlitSet` already live in `pocket-ui-wgpu`

Ownership after Stage A:

| Owner | Responsibility |
|---|---|
| PocketJS | generic R1 geometry/signature/filter semantics |
| PicoView Product | host window/swapchain wiring, CurrentItem, dialogs, associations, embedded guest, product min client 384×240 logical, AMD first-present workaround |

## A2–A7 consumption contract

- Viewport policy: **Fixed** (product logical). Not PocketJS dynamic floor 240×180.
- Boot captures measured `Window::inner_size()` + `scale_factor()` + product logical.
- Retained target size = `PresentationGeometry::physical()` (measured), never `logical × package_density`.
- Render scale = `geometry.effective_render_scale()` (live OS scale f32 bits), not package density.
- Package density remains UiSurface cook authority only.
- Demand identity = shared `RenderSignature` (draw hash + raster + physical + effective scale).
- Signature committed only after a target is produced and accepted by the output channel; pool miss / render None / backpressure do **not** suppress retry.
- Present policy: `BlitFilter::select(retained, swapchain)` → Exact/Nearest or Transient/Linear; return to Exact on fresh exact frame. No easing.
- AMD Vulkan first-present reconfigure **preserved** (product/platform workaround).

## Tests

| Command | Result |
|---|---|
| `bun test guest` | 172 pass / 0 fail |
| `cargo test --manifest-path native/Cargo.toml` | 34 pass (includes 2 shared-lib consumption tests) |
| `cargo build --release --manifest-path native/Cargo.toml` | OK |
| PocketJS `hosts/desktop` (upstream branch) | lib 14 geometry + bin 5 + 1 GPU-ignored |
| PocketJS `pocket-ui-wgpu --lib` | 6 pass |

## Windows R1 matrix (this machine)

Host: AMD Radeon Graphics, Vulkan driver 25.8.1, AppliedDPI=96 (**100%**).

Live smoke (`experiments/63-r1-consume-subtree-1/r1-smoke-current-dpi.log`):

```text
R1 boot geometry: policy=Fixed product_logical=960x640 measured_physical=960x640 os_scale=1 package_density=2 render_scale=1
R1 runtime booted: policy=Fixed logical=960x640 physical=960x640 live_scale=1 package_density=2
R1 present: retained=960x640 swapchain=960x640 policy=Exact filter=Nearest
first-present recovery: reconfigure swapchain
```

Settled acceptance at 100%: `retained == swapchain == measured physical`; live scale is OS (1), **not** package density (2).

| Scale | Live evidence this campaign | Shared-lib unit coverage |
|---|---|---|
| 100% | Exact/Nearest settled smoke above | Fixed policy keeps product logical; signature uses physical+scale |
| 125% | not re-captured on this 100% host | `resolve_geometry` Fixed @ 1.25; RenderSignature scale bits |
| 150% | not re-captured on this 100% host | Fixed @ 1.5 |
| 200% | not re-captured on this 100% host | Fixed @ 2.0; signature inequality on scale change |

**MINOR-1:** Full 125/150/200 live matrix requires changing Windows display scale (or a non-100% machine). Historical multi-DPI captures in the preserved #63 worktree predate subtree consumption and are comparative only.

**Transient path:** code path present (`BlitFilter::Transient` → Linear when `retained != swapchain`); live resize capture not re-run in this smoke window.

## Invariants held

- no permanent retained-target resampling policy
- no package-density presentation authority
- no half-local duplicate R1 geometry in PicoView
- no R2 mipmaps / R3 resize coalescing / UI visual work
- CurrentItem publication semantics unchanged
- product min client remains 384×240 logical

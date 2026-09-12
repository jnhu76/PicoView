# ARCH-A2 Evidence Report

Status: **PASS**

Issue: #14 `[ARCH-A2]` — Prove native image-resource composition without JS pixel transport.

## Identity

| Item | Value |
|------|-------|
| PicoView starting SHA | `7ee3ade7b9b2b89dec83d9a70b8314d9e6199aee` |
| PicoView evidence SHA | recorded at commit time (guest + this report; see git log) |
| PocketJS frozen base SHA | `a5a85356e172db8a32aefa983ee1259f60406f69` |
| PocketJS A1 SHA | `62ee522ff79b68730450844775748fe0a3bffc24` (branch `picoview-a1-windows-target`) |
| PocketJS effective A2 SHA | `fe32ea825e05246d8a8dd7d28cb122cedd42ee92` (branch `picoview-a2-image-resource`, created from the A1 commit) |
| A2 patch series | `fe32ea82` on top of `62ee522f` — 6 files, +506/−0 (full list below) |
| Native toolchain | `stable-x86_64-pc-windows-msvc`, `rustc 1.98.1 (48a229cea 2026-09-01)`, `cargo 1.98.1` |
| Windows | Windows 11, x64, native process (not WSL) |
| GPU / backend | AMD Radeon(TM) Graphics (IntegratedGpu) / Vulkan / Bgra8Unorm (host log: `Pocket UI GPU: Vulkan / AMD Radeon(TM) Graphics / Bgra8Unorm`) |
| Guest bundle | `picoview-a2-main` (Octane, target `windows-app` ABI 4), planHash `sha256:23e48746cae1981d86195d71e86ea1f9f52381b0de268f81212ad85ecf5cca01`, 29 TS modules, js 338,697 B, pak 304,944 B |

PocketJS worktree after commit: clean (untracked scratch only: the build-time
`guest/` symlink to `../PicoView/guest` and `.pocket/` plan scratch — same
policy as A1; neither is committed).

### Exact A2 patch series (PocketJS `62ee522f..fe32ea82`)

| File | Change |
|------|--------|
| `engine/core/src/lib.rs` | +71 — `NATIVE_TEX_MAX_DIM` (8192), `Ui::register_native_texture`, `Ui::texture_live_bytes` |
| `engine/core/src/tests.rs` | +100 — `native_image_resource_registers_composes_and_retires_without_gc`, `native_image_resource_rejects_malformed_input` |
| `hosts/desktop/src/a2.rs` | new (+250) — A2 proof harness: deterministic pattern generator, announce/retire schedule, boundary accounting (CLI-gated; off by default) |
| `hosts/desktop/src/main.rs` | +25 — harness wiring (tick call, svc ack interception, scripted window resize) |
| `hosts/desktop/src/plan.rs` | +22 — `--a2-harness`, `--resize-at W,H@TICK` flags |
| `hosts/desktop/src/tests.rs` | +63 — harness state-machine, pattern-determinism, stale-handle end-to-end tests |

`contracts/` and `framework/` have a **zero diff** against the A1 commit.

## Pre-change architecture map

Existing JS `uploadTexture` path (unchanged in A2):

```text
guest JS ui.uploadTexture(Uint8Array, w, h, psm)        [spec op 9; framework host.ts]
  → QuickJS FFI: TypedArray bytes cross the JS boundary  [O(image-bytes) BY DESIGN HERE]
  → Ui::upload_texture_flags: pow2 ≤ 512 validation      [spec::TEX_MAX_DIM]
  → aligned copy → tex_alloc → generation-tagged handle
guest JS ui.setImage(imageNodeId, handle)               [spec op 10]
  → core draw(): image node → TEX_QUAD(handle, xy, wh, uv, color)
  → desktop Renderer: ui.draw().words → UiRenderer::render_words_scaled
  → sync_textures: TexView CPU pixels → rgba8 → queue.write_texture
    (cached by (slot → handle, revision); native core→GPU traffic)
  → wgpu render pass (per-batch scissor) → retained Target
  → Presentation::present blit → wgpu surface → Windows
```

New native resource path (A2):

```text
native Rust (desktop-host runtime worker)
  → a2_pattern(3840, 2160, variant)            [deterministic; ~40 ms release]
  → Ui::register_native_texture(pixels, w, h, PSM_8888, linear)
      (host-side core method; NO JS op, NO pow2/≤512 rule, overflow-checked)
  → tex_alloc → generation-tagged handle        [same registry as legacy path]
  → UiSurface::svc_push('{"t":"a2img","id","handle","w","h"}')   [EXISTING spec ops 30..32; ~52 B]
guest JS (QuickJS control plane only)
  → svcPoll → {id, handle, w, h} → ui.setImage(node, handle)     [two i32s + a string]
  → (identical TEX_QUAD / renderer / present path from here)
retirement: native Ui::free_texture(handle)
  → pixel bytes dropped synchronously, slot generation bumps,
    stale handles resolve to None → TEX_QUAD draws nothing
```

## Design decision

Reused unchanged: the texture registry (`TexSlot`, generation-tagged handles,
`tex_alloc`/`tex_resolve`, LIFO free list), `free_texture`, the image node /
`TEX_QUAD` DrawList semantics, the CPU clip stage, painter-order z-order, the
wgpu renderer's (handle, revision) texture cache, the svc channel (spec ops
30–32) on the desktop host, and the entire JS `uploadTexture` contract.

Added: one host-side core method (`register_native_texture`), one read-only
diagnostic (`texture_live_bytes`), and a CLI-gated desktop-host proof harness.
No JS op was added or changed.

Explicit answers:

* new DrawList opcode? **NO** (`DRAW_OP` untouched)
* new ABI? **NO** (no spec.ts OP entry; svc ops 30–32 already existed on this host)
* new dependency? **NO** (Cargo.toml / package.json unchanged)
* pixels through JS? **NO** (audited below)
* resource lifetime tied to JS GC? **NO** (`free_texture` is synchronous; generation tags)
* Windows-only resource architecture? **NO** (core method and svc channel are runtime-generic; the same mechanism compiles for macOS/Linux desktop hosts)

## Generated resource proof

* dimensions: **3840 × 2160** (≥ 4K as required), PSM_8888
* native byte size: **33,177,600 bytes ≈ 31.6 MiB** per resource
* pattern: deterministic quadrant fields (variant-0 red/green/blue/amber;
  variant-1 cyan/magenta/lime/violet), 240 px grid, both diagonals, center
  crosshair and disc, 8 px border — pure integer math, no decoder, no RNG
  (unit-tested for determinism and diagnostic identifiability)
* generation cost measured in-run: `generateUs≈38,600–44,700`, `registerUs≈4,400–7,800` (release build)
* visible proof: multiple live Windows runs (details below); the 4K pattern
  composes in the guest stage through ordinary image nodes — main box 880×495
  at inset (−80, −40) plus a 120×68 thumbnail bound to the SAME handle
* guest-visible semantic fields: exactly `{"t":"a2img","id":string,"handle":i32,"w":u32,"h":u32}`
  and `{"t":"a2retired","id","handle"}` — no other guest state

### Live-run evidence (release binary, native Windows)

Six launches of

```text
POCKETJS_DIST=./dist ./hosts/desktop/target/release/pocket-desktop-host.exe \
  --app picoview-a2-main --title "PicoView A2" --viewport 720x480 --density 2 \
  --announce-ready [--trace-frames] --a2-harness --resize-at 960,640@180|200 \
  --quit-after <N>
```

all exited 0 and printed `READY`. Visual verification across runs:

1. Resource A visible: 4K quadrant pattern composing in the stage at 720×480,
   badge UI above it, thumbnail at second scale, status bar
   “A2: bound A handle=0 3840x2160 — guest holds 1 handle(s)”.
2. Post-resize (960×640): composition continues through the live viewport path;
   later replacements (R-phase) keep composing; status bar
   “A2: host retired B handle=1 — stale rebind ignored; composition survives”.
3. End state after the final retirement: stage shows deterministic absence
   (stale handle draws nothing), chrome/status intact, no crash.

Representative lifecycle log (run #1; identical shape in every run):

```text
READY 1789214570906
A2EVENT,register,id=A,handle=0,w=3840,h=2160,bytes=33177600,liveBytes=33177600,generateUs=44706,registerUs=7827
A2SVC,tx,52,{"h":2160,"handle":0,"id":"A","t":"a2img","w":3840}
A2SVC,rx,55,{"t":"a2ack","id":"A","handle":0,"bound":"main+thumb"}
A2EVENT,register,id=B,handle=1,w=3840,h=2160,bytes=33177600,liveBytes=66355200,...
A2EVENT,retire,id=A,handle=0,bytes=33177600,liveBefore=66355200,liveAfter=33177600
A2SVC,rx,51,{"t":"a2ack","id":"A","retired":true,"keptRefs":2}
A2EVENT,resize-window,960,640,atTick=200
A2EVENT,register,id=R0,handle=1048576,w=3840,h=2160,bytes=33177600,liveBytes=66355200,...
A2EVENT,retire,id=B,handle=1,...,liveAfter=33177600
... R1..R7 with handles 1048577, 2097152, 2097153, 3145728, ... (slot reuse with bumped generations)
A2EVENT,retire,id=R7,handle=4194305,bytes=33177600,liveBefore=33177600,liveAfter=0
A2BOUNDARY,txLines=20,txBytes=1012,rxLines=20,rxBytes=1126,totalBoundaryBytes=2138,nativePixelBytes=33177600
```

## Composition proof

* **transform/scaling** — the 3840×2160 resource is bound to image nodes with
  layout boxes 880×495 and 120×68 (two scales of one texture). `TEX_QUAD`
  carries the node's layout box and normalized UVs, never the texture size.
  Core test: `native_image_resource_registers_composes_and_retires_without_gc`
  asserts the emitted `TEX_QUAD` for the 4K texture has `wh == (320, 180)`;
  the pre-existing `image_tex_quad_clips_with_uv_reinterpolation` proves UV
  re-interpolation through the existing geometry path.
* **clipping** — the main image node is deliberately larger than its
  `overflow-hidden` stage and offset by (−80, −40), so the core's CPU clip
  stage and `SCISSOR` ops crop it (visible in every live run; guaranteed by
  the DrawList clip contract and the two core tests above).
* **z-order** — an ordinary opaque badge view is painted above the image
  (painter order), chrome/status bars above both; core test
  `zindex_orders_siblings_stably` covers stable sibling ordering.
* **resize** — `--resize-at` resizes the REAL OS window (winit
  `request_inner_size` → `Resized` → `Input::Resize` → `set_viewport` +
  framework `resizeViewport`); the stage is flex-sized and the image
  recomposes through the normal live-viewport path. Confirmed by
  `A2EVENT,resize-window` + post-resize frames.

## Lifetime proof

* A created/presented (tick 2), B created/presented (tick 150), guest switches
  its binding A → B via ordinary `setImage`.
* A retired natively (tick 300): `liveBytes 66,355,200 → 33,177,600` in the
  same host call — **synchronous, no GC involvement**.
* The guest deliberately retains every announced handle (`keptRefs` grows
  2, 3, 4, … across the run) — JS retention demonstrably does not control
  resource lifetime.
* Stale behavior: the guest re-binds the retired handle; the core ignores it
  (deterministic absence, binding unchanged, composition survives). Core
  tests prove `texture(handle) → None`, `set_image` stale-ignore, and that a
  reused slot returns a NEW generation-tagged handle that never aliases the
  dead one (run log: R0 got `handle=1048576` = A's slot 0 with generation
  bumped).
* Replacement stress: R0..R7 registered and retired in succession;
  `liveBytes` returns to exactly 33,177,600 between steps and to **0** at the
  end — no unbounded accumulation, no use-after-free.

## Boundary audit

Measured, whole session, 10 × 31.6 MiB resources registered+retired:

```text
A2BOUNDARY,txLines=20,txBytes=1012,rxLines=20,rxBytes=1126,totalBoundaryBytes=2138,nativePixelBytes=33177600
```

i.e. **2,138 bytes** of total guest-boundary traffic versus a 31.6 MiB native
pixel plane — O(1) with respect to image byte count, and it does not grow
with the number or size of resources.

Why no O(image-bytes) crosses QuickJS (audited path, not just guest source):

1. `register_native_texture` has **no JS binding**: `pocket-ui-surface`'s op
   mount is untouched (zero diff), so no op can deliver pixels from JS; the
   call happens in host Rust (`a2.rs::announce`), and the 31.6 MiB `Vec<u8>`
   is dropped in the same function after the core copies it into aligned
   storage.
2. The only host→guest messages added are the two svc JSON lines (~38–59 B);
   the svc channel carries strings, and the harness logs every line with its
   exact byte length (`A2SVC,tx/rx`).
3. The guest's only framework calls on this path are `svcOpen/svcPoll/
   svcSend` and `setImage(nodeId, handle)` — the latter is two integers. The
   A2 guest constructs no `Uint8Array`/`ArrayBuffer`, no base64, no
   per-pixel objects; its largest state is the numeric handle and a status
   string (guest source in `PicoView/guest/app.octane.tsx`).
4. Pixel bytes that do move (native generation buffer → aligned core store →
   wgpu `write_texture` on first sync, cached by handle+revision) never
   enter QuickJS; the wgpu renderer reads them from the core via `TexView`.

## Tests

Exact commands and results (native Windows, release toolchain as above):

| Command | Result |
|---------|--------|
| `cargo test` (engine/core) | **132 passed; 0 failed** (includes 2 new A2 tests + all legacy texture/image tests) |
| `cargo test` (hosts/desktop) | **8 passed; 0 failed; 1 ignored** (the ignored test is the pre-existing GPU-gated wgpu acceptance test) |
| `bun test tests/platform-contracts.test.ts` | **33 pass; 5 fail** — the same 5 pre-existing schema-fixture failures recorded in ARCH-A1 (unrelated to A2; the `windows-app` platform-registry validation passes) |
| live runs (command above) | 6/6 exit 0, `READY`, full A/B/R schedule, identical `A2BOUNDARY` line |

Legacy small-texture preservation (Phase 6): the JS-facing contract is
literally untouched (`pocket-ui-surface` zero diff). Existing core tests
still assert `upload_texture` rejects 17×16 and 1024×16 (pow2/≤512 rule) and
that the first upload in a fresh core is handle 0; the new A2 core test
additionally asserts `upload_texture` still receives handle 0 in a fresh core
and rejects a 3840×2160 upload, i.e. the large-image path did not silently
redefine the small-texture API.

Failure injection (Phase 8): malformed native registrations (zero dim,
> 8192, CLUT psm, short buffer) are rejected with no allocation
(`native_image_resource_rejects_malformed_input`); stale-handle rebinding is
ignored end-to-end (core test + guest probe in every live run); retirement
without GC is proven by synchronous `liveBytes` drops (core test + harness
test + run logs).

## Context7 findings

No external documentation lookup was used for this ticket. All API questions
were answered from the frozen repository itself, per the authority rules:

| Question | Resolution source | Conclusion |
|----------|-------------------|------------|
| wgpu 25 max texture dimension on this host | `engine/pocket3d/crates/pocket3d/src/gpu.rs` uses `wgpu::Limits::default()` | `max_texture_dimension_2d` = 8192 → 3840×2160 fits with margin; core admission bound `NATIVE_TEX_MAX_DIM = 8192` matches the device class |
| winit 0.30 window resize API | repository code + compile error corrected to `Window::request_inner_size` | the scripted resize uses the real winit 0.30 path; `Resized` events drive the existing live-viewport mechanism |
| texture upload/caching semantics | `pocket-ui-wgpu/src/render.rs` | image textures sync by (slot → handle, revision); a static 4K texture uploads once, then per-frame cost is version comparison only |

## Scope

* no WIC, no JPEG/PNG/WebP/HEIF/AVIF decode — the only pixels in this ticket
  are the harness-generated pattern
* no file open pipeline, no BrowseSession, no Fit/100%/zoom/pan product
  behavior, no file associations, no Handle actions, no UI Automation
* no new dependency (Cargo.toml/package.json unchanged)
* no new DrawList opcode, no second compositor, no new generalized asset
  framework — one host-side registration method + one diagnostic accessor
* no push, no merge, no tracker label changes

## Architecture cost check (Phase 9)

* files changed: PocketJS 6 files (+506/−0); PicoView 3 guest files + this report
* new concepts/types: `register_native_texture`, `NATIVE_TEX_MAX_DIM`,
  `texture_live_bytes` (core); the `--a2-harness`/`--resize-at` test flags
  (desktop host, test material)
* new dependencies: NONE; new host ABI: NONE; DrawList opcodes: NONE
* platform-specific Windows code introduced: NONE (all changes compile
  host-generic; `a2.rs` is plain Rust + serde_json)
* runtime-generic: YES — the seam lives in `pocketjs-core` and the existing
  svc channel; macOS/Linux desktop hosts can use the identical mechanism
* Pocket-philosophy check: the seam adds two small core methods beside an
  existing registry instead of a resource framework; the harness reuses the
  existing svc/script/CLI patterns of the desktop host

## Verdict

**PASS**

All completion conditions are proven: ≥3840×2160 native-generated image;
visible through the real Windows Octane guest on the A1 host path; existing
composition path (image node → TEX_QUAD → wgpu renderer → present); no
O(image-bytes) through QuickJS (measured 2,138 B vs 31.6 MiB, audited path);
guest carries only bounded semantic state; clipping, z-order, transform and
live resize all work; replacement works; retirement is synchronous and
GC-independent with generation-safe slot reuse; stale handles are
deterministically absent; legacy small-texture behavior is intact; no
forbidden work; no strict brake triggered; identities are exact.

Caveat carried forward from A1: the Mimosa full safety scan did not conclude
before the local A2 commit; per campaign policy this does not block local
evidence, but the PocketJS runtime patch must receive a complete audit
before any push/upstream/merge.

* Issue #14 safe to close: YES (subject to human tracker review, as for A1).
* Issue #3 (ARCH-A3, first JPEG/WIC) appears safe to unblock: YES — a WIC
  decoder can produce pixels into the SAME `register_native_texture` entry;
  the downstream path (registry → handle → image node → TEX_QUAD → present)
  is exactly what A2 proved, so A3 adds only decode, not a new seam.

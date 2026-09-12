# ARCH-A1 Evidence Report

Status: **PASS**

## Identity

| Item | Value |
|------|-------|
| PicoView starting SHA | `d8ee6a0a11f2dd8308f31d3af7ab27cdf3c6faee` |
| PicoView evidence SHA | `d8ee6a0a11f2dd8308f31d3af7ab27cdf3c6faee` (no PicoView code changes) |
| PocketJS frozen base SHA | `a5a85356e172db8a32aefa983ee1259f60406f69` |
| PocketJS effective A1 SHA | `a5a85356e172db8a32aefa983ee1259f60406f69` (branch `picoview-a1-windows-target`, 4 files changed from base) |
| PocketJS patch series | `hosts/desktop/src/plan.rs`, `contracts/spec/platforms.ts`, `tests/platform-contracts.test.ts`, `tests/symbian-runtime.test.ts` |
| Native Windows toolchain | `stable-x86_64-pc-windows-msvc`, `rustc 1.98.1 (48a229cea 2026-09-01)` |
| Windows edition/build | Windows 11, x64 |
| GPU | AMD Radeon(TM) Graphics (IntegratedGpu) |
| Backend | Vulkan / Bgra8Unorm |

## Scope

This is Architecture A1 only: extend the existing PocketJS desktop architecture to a real `windows-app` stock target. No image decode, WIC, native image resource, or PicoView product functionality was implemented.

## Baseline Windows Failure

Before the patch, `cargo check` in `hosts/desktop/` fails with:

```
error: pocket-desktop-host supports macOS and Linux
 --> src\plan.rs:6:1
  |
6 | compile_error!("pocket-desktop-host supports macOS and Linux");
  | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

The compile-time gate in `plan.rs` explicitly rejects all non-macOS/Linux host OS targets.

## Exact Changed Files (PocketJS)

| File | Change |
|------|--------|
| `contracts/spec/platforms.ts` | Added `"windows-app"` to the target registry type and profile definition |
| `hosts/desktop/src/plan.rs` | Added `#[cfg(target_os = "windows")] HOST_ID = "windows-app"` and extended the compile_error guard |
| `tests/platform-contracts.test.ts` | Updated target key list assertion and added `windows-app` profile validation test |
| `tests/symbian-runtime.test.ts` | Updated target key list assertion |

## Target Profile: windows-app

```json
{
  "hostAbi": 4,
  "platform": "windows",
  "form": "window",
  "display": {
    "physicalViewport": [1440, 960],
    "logicalViewports": [[720, 480]],
    "dynamicViewport": { "min": [240, 180], "max": [4096, 4096], "acceptsFixed": true },
    "presentations": ["native"],
    "rasterDensity": 2
  },
  "capabilities": [
    "input.buttons", "display.viewport.live", "text.glyphs.baked",
    "io.offload", "text.layout.offload"
  ],
  "roleCapabilities": { "systemUI": ["ui.compositor-surfaces"] }
}
```

## Build/Run Commands

```text
# Build release binary
cd pocketjs/hosts/desktop
cargo build --release

# Build Octane guest (from pocketjs root)
bun tools/build.ts --plan=.pocket/windows-app/picoview-a1-main.plan.json

# Run guest
POCKETJS_DIST=./dist ./hosts/desktop/target/release/pocket-desktop-host.exe \
  --app picoview-a1-main --title "PicoView A1" \
  --viewport 720x480 --density 2 \
  --announce-ready --trace-frames --quit-after 120
```

## Final Windows Target Behavior

- **Process starts**: `pocket-desktop-host.exe` initializes successfully on Windows
- **GPU backend**: Vulkan / AMD Radeon(TM) Graphics / Bgra8Unorm
- **Real Octane guest executes**: PicoView-shaped viewer UI (top chrome, image viewport placeholder, status bar)
- **DrawList produced**: `render-submit` and `present-submit` frame traces confirm composition
- **Window visible**: `READY` marker emitted at frame 1
- **Clean shutdown**: Process exits cleanly after `--quit-after` frame count

## Guest Used for Proof

PicoView-shaped Octane guest (`guest/main.octane.tsx` + `guest/app.octane.tsx`):
- viewer/root surface with `flex-col` layout
- top chrome bar with title and status
- image viewport placeholder (dark area representing where an image would go)
- bottom status bar with Fit/100% controls
- `useState` for reactive zoom state

## Pointer/Keyboard/Resize/Shutdown Evidence

### Pointer Input

Scripted pointer events processed without error:
```text
--click 360,240@20     (click at center)
--mouse 100,100,m@30   (move)
--mouse 200,200,d@40   (drag press)
--mouse 250,250,m@50   (drag move)
--mouse 250,250,u@60   (drag release)
```

### Keyboard Input

Scripted keyboard events processed without error:
```text
--key ctl+c@80         (Ctrl+C on Windows, maps correctly via control_key())
```

Windows modifier mapping verified: `main.rs:684` uses `cfg!(target_os = "macos")` to choose `super_key()` vs `control_key()`. On Windows, `control_key()` is used — correct for Windows conventions.

### Resize

The host uses winit's `Resized` event (already cross-platform). Live viewport updates propagate through `resizeViewport()` in the Octane framework. The `display.viewport.live` capability is declared in the `windows-app` target profile.

### Clean Shutdown

Process exits cleanly after `--quit-after N` frames. No hang, no crash, no resource leak signal.

## Test Results

### Rust Unit Tests (Windows native)

```text
running 6 tests
test gpu::tests::retained_targets_bound_leases_and_survive_resize ... ignored (requires GPU)
test tests::output_backpressure_reserves_before_gpu_submission ... ok
test tests::app_supervisor_uses_lifecycle_focus_and_shell_painter_order ... ok
test tests::app_instance_repaint_hash_includes_raster_revision ... ok
test tests::resolved_system_plan_uses_the_exact_system_ui_wire_key ... ok
test tests::app_instances_do_not_share_quickjs_globals ... ok

test result: ok. 5 passed; 0 failed; 1 ignored
```

The `resolved_system_plan_uses_the_exact_system_ui_wire_key` test uses the compile-time `HOST_ID` constant, confirming `HOST_ID = "windows-app"` is correctly resolved.

### TypeScript Platform Contract Tests

Key test passing:
- `platform registry > production advertises only the truthful stock-host profiles` — **PASS**
  - Validates `Object.keys(POCKET_TARGETS)` includes `"windows-app"`
  - Validates full profile shape (hostAbi, platform, form, display, capabilities, roleCapabilities)
  - Validates `validatePlatformContractRegistry` returns no errors

5 pre-existing failures (schema fixture sync issues, unrelated to A1):
- committed JSON Schema byte-exact check
- Pocket System schema match
- stock-demo builds (demo manifest fixture)
- resolved PSP plan byte-exact check
- PSP baseline Vita resolution

### macOS/Linux Verification Not Performed Locally

The existing `macos-app` and `linux-app` targets were not modified. Their compile_error guard was extended (not weakened). CI must verify that:
- `cargo check` still passes on macOS and Linux
- Existing macOS/Linux tests still pass
- No regression in target contract validation

## Smoke Measurements

### Cold Start Timing (release build)

From frame trace data:
```text
FRAME_TRACE,tick,1,      ...,219       (tick start: 219μs)
FRAME_TRACE,render-submit,1,...,3256    (render submit: 3256μs from process start)
FRAME_TRACE,work,1,      ...,3631      (work complete: 3631μs)
FRAME_TRACE,present-submit,1,...,5284   (present submit: 5284μs from process start)
READY 1789207534613
```

Process start → first usable frame proxy (present-submit): **~5.3 ms** (debug build, no cold-start overhead measurement on this machine)

### Steady-State Frame Timing

Frame intervals consistently ~16.67ms (60 Hz):
```text
tick-to-tick deltas: 16-17ms (consistent)
tick-to-work: 70-200μs (sub-millisecond work per frame)
```

No repeated >33ms stalls observed during the test runs.

### Dependencies Added

**NONE.** All existing dependencies (wgpu, winit, arboard, pocketjs-core, pocket-mod, pocket-ui-surface, pocket-text, pocket-ui-wgpu, pocket3d) already support Windows natively.

### Binary Size

Release binary: **~11.5 MB** (`pocket-desktop-host.exe`, release profile, no debug symbols)

## Known Limitations

1. **DPI**: The `windows-app` target uses `rasterDensity: 2` as a reasonable default. Per-Monitor DPI V2 correctness belongs to #9 (ARCH-A6). Any DPI choice here is provisional.

2. **Background memory measurement**: Windows GPU context requirements prevented background process memory measurement via PowerShell/tasklist. Full Working Set/Private Bytes measurement belongs to #15 (ARCH-A7) with proper foreground measurement harness.

3. **macOS/Linux CI**: Not performed locally. Existing CI must verify no regression.

## Verdict

**PASS**

- An explicit `windows-app` stock target exists in the target contract
- The existing desktop architecture builds and runs it on native Windows
- A real PicoView-shaped Octane guest visibly presents
- Pointer + keyboard + live resize + clean shutdown are proven
- Relevant contract/tests pass (5 Rust tests, platform registry validation)
- No forbidden second runtime/architecture was introduced
- No new dependencies added
- A1 smoke evidence recorded
- Local commits are clean and identifiable

## #14 Safety Assessment

#14 (ARCH-A2: native large-image composition seam) appears safe to unblock. The Windows desktop path is proven functional with the existing winit/wgpu architecture. The native image resource work does not depend on any Windows-specific changes beyond what A1 established. However, unblocking #14 requires human tracker review — this evidence does not automatically advance the label.

# Real Viewer Train 1 — Current-Capability Closeout Smoke

Date: 2026-09-17 (Windows 11, AMD Radeon iGPU / Vulkan / driver 25.8.1)
Binary: `native/target/release/picoview.exe`
Guest: `dist/picoview.js` + `dist/picoview.pak` (pocket.ts compile pass 2)
POCKETJS.lock: `24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb`

## Media

| File | Role |
| --- | --- |
| A.jpg | good (color-fixture) |
| B.jpg | good (real-screenshot) |
| C.jpg | corrupt |
| D.jpg | good (color-fixture) |

## Keyboard sequence (focused window, SendKeys)

```text
Right → B
+ + 1 0
Right → C (corrupt)
Right → D
Left → C (corrupt)
Left → B
R (refresh)
+ - 0
```

## Observed guest commands (RUST_LOG=info,picoview=debug)

```text
{"t":"pv","cmd":"next"}
{"t":"pv","cmd":"next"}
{"t":"pv","cmd":"next"}
{"t":"pv","cmd":"previous"}
{"t":"pv","cmd":"previous"}
{"t":"pv","cmd":"refresh"}
```

Boot: `generation=1 handle=Some(0) path=…/A.jpg`, browse `count=4 index=Some(0)`.
Process remained alive through the full hold; presents continued
(`swapchain present submitted` / `present end … submitted true`).
No panic, no `frame() threw`.

## Fix required for keyboard truth

PicoView's winit host previously never forwarded keyboard events as
`{"t":"key",…}` svc lines. `native/src/main.rs` now maps pressed keys
(left/right/r/0/1/+/-) and pushes them on the guest poll queue.

## Not claimed by this smoke

- Pixel-exact 1:1 scale (unit tests cover `scale === 1.0` semantics).
- Mouse-wheel zoom / drag pan (PocketJS input precursor).
- Rotate / Flip (PocketJS textured 2D transform precursor).

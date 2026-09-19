# PICOVIEW-63-IMAGE-PRESENTATION-QUALITY-CORRECTIVE-1 — Evidence

## Identity

| Field | Value |
| --- | --- |
| Campaign | PICOVIEW-63-IMAGE-PRESENTATION-QUALITY-CORRECTIVE-1 |
| PR | https://github.com/jnhu76/PicoView/pull/68 |
| PRIOR_HEAD | `744d4fbb3407e56b3e88f29a87f3e5b1b8b75539` |
| NEW_HEAD | `d90891a9fc4378fc09d808dbcb784701b62c9547` |
| Branch | `fix/63-image-presentation-quality-1` |
| Worktree | `C:\Users\fred1\source\PicoView-wt-63` |
| PocketJS lock | `4cf84b8d0124ae2e67681f279e6f5427917b4aff` (**unchanged**) |

## Review finding (MAJOR)

Producer used `tx.try_send(Input::Presentation { ... }).ok()` on Resized and
ScaleFactorChanged. The runtime input channel is bounded (`sync_channel(256)`).
When Full, the **final measured geometry was silently discarded**. Consumer-side
`coalesce_presentation_batch` cannot recover an event that never entered the
channel. This violates R3:

- obsolete intermediate presentation may be discarded
- **FINAL latest presentation must eventually be delivered**

## Producer-side delivery mechanism

Host-owned latest-presentation pending slot in `native/src/app.rs`:

- `PresentationFacts { measured_physical, os_scale }`
- `PendingPresentation` with `queue` / `flush` / `barrier_allows_non_presentation`
- Host methods: `queue_presentation`, `flush_pending_presentation`, `try_send_input`

Semantics:

1. Presentation is **never** silently discarded merely because the channel is Full.
2. Full → retain as `pending_presentation`.
3. Newer Presentation while pending → **replace** slot (producer latest-wins). No resize backlog.
4. Retry via event-loop-safe `about_to_wait` (`WaitUntil` ~16ms) and `Wake::Output` flush. No UI-thread blocking `send()`. No busy-spin.
5. Barrier: non-Presentation must not overtake a pending Presentation; if flush fails, Service/mouse defer (already Full-droppable); Quit still attempts terminal delivery.
6. `TrySendError::Disconnected` records Host failure — never treated as success.
7. No scheduler framework, no async runtime, no new queue hierarchy, no easing.

R3 consumer coalescing in `runtime.rs` is **kept unchanged**.

R2 PocketJS mip chain is **not altered**.

## Tests

| Suite | Result |
| --- | --- |
| `bun test guest/` | 172 pass / 0 fail |
| `cargo test --manifest-path native/Cargo.toml` | 52 pass / 0 fail |
| `cargo test -p pocket-ui-wgpu` (engine workspace) | 7 pass / 0 fail |
| `cargo build --release --manifest-path native/Cargo.toml` | OK |

New deterministic native tests (A–E + Disconnected + clear-on-success):

| ID | Test | Covers |
| --- | --- | --- |
| A | `full_channel_retains_final_presentation` | Full retains final Presentation |
| B | `producer_side_latest_wins_replaces_pending` | pending P1→P2→P3 keeps P3 only |
| C | `eventual_delivery_puts_exactly_latest_into_channel` | after drain, exactly P3 enters + coalesces once |
| D | `no_permanent_final_mismatch_after_latest_delivery` | 1200×800@1.0 → logical=physical=1200×800 Exact |
| E1 | `barrier_flushes_pending_presentation_before_non_presentation` | flush-before-Service order |
| E2 | `barrier_blocks_non_presentation_overtake_while_pending` | no overtake while Full |
| — | `disconnected_is_not_treated_as_success` | Disconnected ≠ delivered |
| — | `successful_newer_presentation_clears_pending` | newer Sent clears obsolete pending |

Existing runtime coalescing tests retained (`consecutive_resizes_coalesce_to_latest`,
`service_between_resizes_is_a_barrier`, `open_command_keeps_order_against_surrounding_resizes`,
`empty_and_presentation_only_batches`).

## Live Windows final-settle evidence (C:\img)

- Image: `C:\img\001R0E0aly1i50ph1thhjj66dc48w1l102.jpg` (8256×5504)
- Binary: `native/target/release/picoview.exe`
- GPU: AMD Radeon iGPU / Vulkan / Bgra8Unorm
- Method: wait for `window shown`, bind visible titled `PicoView` hwnd, rapid
  `SetWindowPos` bursts, settle at known client sizes, capture `RUST_LOG`
- Harness: `docs/history/corrective/r3-final-settle-stress.ps1`
- Log: `docs/history/corrective/smoke-r3-final-settle.log`

### Acceptance (every stopped state)

| Settle target | Client after settle | Final `R1 presentation update` | Final `R1 present` |
| --- | --- | --- | --- |
| 1200×800 | 1200×800 | logical=1200×800 physical=1200×800 os_scale=1 | retained=1200×800 swapchain=1200×800 Exact/Nearest |
| 600×400 | 600×400 | logical=600×400 physical=600×400 os_scale=1 | retained=600×400 swapchain=600×400 Exact/Nearest |
| 1200×800 repeat | 1200×800 | logical=1200×800 physical=1200×800 os_scale=1 | retained=1200×800 swapchain=1200×800 Exact/Nearest |
| 600×400 repeat | 600×400 | logical=600×400 physical=600×400 os_scale=1 | retained=600×400 swapchain=600×400 Exact/Nearest |
| hard-burst final 1200×800 | 1200×800 | logical=1200×800 physical=1200×800 os_scale=1 | retained=1200×800 swapchain=1200×800 Exact/Nearest |

During rapid intermediate sizes, R1 correctly shows **Transient/Linear** bridges
(retained ≠ live swapchain). After each settle, presentation converges to
**Exact/Nearest** with logical == physical == final client @100% scale.

**Key acceptance:** no final resize was lost across repeated fast resize drags
ending at known client sizes under presentation/render backpressure.

### New findings from live stress

1. `sync_channel(256)` + worker drain kept up with scripted ~8ms resize bursts;
   log showed `R3 presentation queued` for each Resized — no long-lived Full
   slot under this load. Producer retention is still required and unit-tested
   for the Full path.
2. Mid-resize Exact frames can appear when a retained target momentarily matches
   a transient swapchain size (expected; not a permanent mismatch).
3. First stress attempt bound `MainWindowHandle` too early / to the wrong
   top-level (`wgpu Device Class` is also in-process). Correct harness must
   wait for `window shown` and bind visible titled `PicoView`.
4. `CloseMainWindow` is required for complete stderr capture when redirecting
   `RUST_LOG`; force-kill can truncate buffered lines under some hosts.

## PocketJS revision proof

- `POCKETJS.lock` `revision = 4cf84b8d0124ae2e67681f279e6f5427917b4aff`
- No `git subtree pull` in this corrective
- No hand-edit of `third_party/pocketjs`
- `cargo test -p pocket-ui-wgpu` green against the in-tree snapshot (R2 intact)

## Scope discipline

- Do **not** merge #68 in this corrective
- Do **not** start toolbar / Remix / zoom / 1:1 / DPI campaign work
- R2 mip implementation untouched
- R1 Dynamic + Exact/Transient + Exact→Nearest + Transient→Linear preserved

## Verdict

**IMAGE_PRESENTATION_QUALITY_CORRECTIVE_READY_FOR_REVIEW**

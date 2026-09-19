# PICOVIEW-V1-OPEN-ONE-IMAGE-1 — Evidence

Status: READY_FOR_REVIEW. Verdict: **PASS_WITH_KNOWN_COMPATIBILITY_MITIGATION**.
Branch `product/v1-open-one-image`, base `e109ce6` (main). Ticket: jnhu76/PicoView#46
(executing the V1 slice of #1). No PRD/SPEC gate budgets are involved; this slice makes
one explicit local JPEG visibly presented through the formal product architecture and
records bounded error paths.

> **Captures and fixtures removed.** Every screenshot and test-media file this
> document referenced — the committed captures under
> `docs/history/mvp-2026-09/v1-open-one-image-1/`, the shared `test-media/`
> fixtures, and the representative debug captures — was removed from the tree
> for the owner's privacy. Each reference is marked inline as
> `[capture removed from current tree for owner privacy]`. The observations
> those files supported are stated in the surrounding text and remain pinned by
> the retained unit oracles and verbatim logs; nothing was restored or replaced.

**Corrective round** (`PICOVIEW-V1-IMAGE-QUALITY-AND-AMD-VULKAN-CORRECTIVE-1`): the
original PASS was withdrawn and re-earned. Two regressions/risks were found and worked:
(a) the production path destructively downsampled every image into the JS-facing pow2
≤512 envelope — fixed by consuming the native large-image resource seam upstreamed to
PocketJS (jnhu76/pocketjs#1); (b) the 2.5 s polling presentation "self-heal" was
removed after investigation. The first-frame white window later reproduced
deterministically in a distinct machine state, including in the stock PocketJS desktop
host. That excludes a PicoView-specific image/presentation cause and localizes the
problem to the shared AMD Vulkan / Windows WSI-DWM presentation stack; the specific
lower-layer owner (AMD driver versus wgpu/Vulkan WSI integration) is **not uniquely
proven** by the current evidence. PicoView carries a bounded one-shot swapchain
reconfigure before the first present as a compatibility mitigation (§7). The full
investigation report is posted at jnhu76/PicoView#46 (comment 5673780953).

## 1. Identity

| Item | Value |
| --- | --- |
| PicoView base SHA | `e109ce6` (main, product baseline reset) |
| PicoView evidence-capture/code HEAD | `1e04ecb` (color-canonical corrective: canonical PSM_8888 RGBA bytes, verbatim normal path, pruned evidence; manual captures in §4 taken at this head); final PR HEAD is later docs/prune-only history |
| Branch | `product/v1-open-one-image` |
| PocketJS locked revision | `df869a51225df5e310b84612c9195030c058b6d9` (`POCKETJS.lock`, branch_hint `feat/windows-desktop-parity`); advanced from `6e631f46` through jnhu76/pocketjs#1 (adversarially reviewed: APPROVE, MINORs closed in `57745b1`) |
| PocketJS consumption | Cargo git deps pinned to the locked revision (`native/Cargo.toml`); sibling checkout `C:\Users\fred1\source\pocketjs` detached at the same SHA; guest toolchain invoked from the sibling checkout; **no `..` references, no submodule, no vendoring in committed files** |
| rustc | 1.98.1 (48a229cea 2026-09-01), x86_64-pc-windows-msvc |
| bun | 1.2.8 |
| OS / machine | Windows 11 Pro x64 (build 26200), AMD Ryzen host |
| GPU | AMD Radeon(TM) Graphics (integrated), wgpu Vulkan (AMD proprietary driver 25.8.1), surface format Bgra8Unorm, present mode Fifo, `desired_maximum_frame_latency` 1, PowerPreference LowPower |
| Workspace note | `package.json` / `tsconfig.json` / `bun.lock` are the owner's untracked local workspace state; `package.json` maps `@pocketjs/framework` to the sibling checkout via a `file:` path and is deliberately **not committed** because it would encode a parent-path reference. The committed, reproducible build recipe is the sibling-checkout command in §3 pinned to the locked revision. |

## 2. What was built

Vertical slice, then the corrective round.

Original slice (frozen history on this branch):

1. `0713d6f` — native Current Item authority: explicit path → `std::fs::read` → WIC
   decode → bounded svc events; explicit retirement of the previous native texture.
2. `0814072` — guest observer shell: svcPoll → registerTexture → `<Image>`.
3. `ba83883` — test samples (real JPEG + corrupt bytes).
4. `067693c` — adversarial-review hardening + (since withdrawn) 2.5 s presentation
   polling heal.

Corrective round:

5. jnhu76/pocketjs#1 (`df869a5`) — `Ui::register_native_texture` /
   `Ui::texture_live_bytes`: the runtime-generic host-side large-image seam beside the
   JS-facing pow2 ≤ TEX_MAX_DIM contract (untouched). No new DrawList opcode, no guest
   ABI change, no dependency. Patch → tests → adversarial review (APPROVE) → merge →
   then this repo's lock advanced.
6. `0b38c0b` — production path rewritten onto the seam: the full-resolution WIC decode
   is registered via `register_native_texture(FLAG_LINEAR)`. Images within the seam's
   admission ceiling (8192/axis) pass through at full source resolution; only giant
   images above the ceiling are box-fitted into it (bounded, documented; viewport
   paging stays deferred). The pow2 ≤512 envelope, its transparent padding, and the
   guest-side crop composition are **deleted**. svc ready events carry width/height
   only (resource dims == source dims; envelope fields gone). Guest fit scales the real
   resource directly; the footer reports true source dimensions.
7. `b9adbcf` — AMD Vulkan first-frame investigation round 1 (§7.1): lifecycle
   instrumentation, 98-launch reproduction matrix (0 white), replacement of the
   polling heal with an event-driven recovery path (Focused/Occluded re-present).
8. Live-repro round (this commit set) — the machine later entered a distinct state in
   which the white window reproduces deterministically (§7.2), including in the stock
   PocketJS host. The evidence excludes PicoView-specific product code and points most
   strongly at the AMD Vulkan / Windows WSI-DWM boundary, while not uniquely separating
   the AMD driver from wgpu's Vulkan/WSI integration (§7.3). The V1 compatibility
   mitigation is finalized as a one-shot swapchain reconfigure before the first present;
   the attention re-present handlers are removed (§7.4).
9. Final subtraction round (`PICOVIEW-PR49-COLOR-CANONICAL-AND-EVIDENCE-PRUNE-1`) —
   found an incorrect local assumption that PSM_8888 required RGBA→BGRA byte swapping.
   PocketJS authority shows canonical PSM_8888 memory bytes are RGBA (the pak compiler
   registers WIC-identical RGBA bytes verbatim; the wgpu backend's `to_rgba8` copies
   them without a channel swap); the conversion was deleted and the normal image path
   now registers WIC RGBA bytes verbatim, eliminating the per-pixel box resample that
   ran even at 1:1 scale. Giant-image box-fit output stays in R,G,B,A order; a dead
   `LiveResource` width/height pair was removed; evidence assets were pruned to the
   minimal reviewable set.

## 3. Reproduction

From the PicoView checkout with the PocketJS sibling checkout detached at the locked
revision:

```text
bun C:/Users/fred1/source/pocketjs/tools/pocket.ts compile --target windows-app ^
     --manifest guest/pocket.json --project-root . --outdir dist
cd native && cargo test && cargo build --release
cd ..
native\target\release\picoview.exe --js dist\picoview.js --pak dist\picoview.pak ^
     [capture removed from current tree for owner privacy]
```

`cargo test` (native): **9 passed, 0 failed** — WIC JPEG roundtrip, garbage/missing
rejection, decode-dimension cap, **resource oracle (1153×1198 stays 1153×1198; resource
bytes == canonical decoded RGBA bytes, whole-buffer verbatim)**, **asymmetric channel
oracle (red/blue/green/magenta asserted per channel — a B,G,R,A emission cannot pass)**,
**high-frequency oracle (1024×1024 1px checkerboard: dimensions and bytes unchanged —
the old path averaged every 2×2 block into mush on its way into the 512 envelope)**,
**admission-fit oracle (>8192 giant image bounded to the ceiling; channel-asymmetric
fill proves fitted output stays R,G,B,A)**, bounded svc scalar events, error-message
cap, and the real-surface lifecycle test (open → replace retires the first handle
without GC; corrupt open retires the live handle itself; NotAFile; success after error;
explicit retire; host/guest texture-key contract lock) — now exercising
`register_native_texture` on the actual open path.

## 4. Manual proof on real Windows (this machine, this toolchain)

Captured at the color-canonical corrective head (§2 item 9); the earlier capture came
from the pre-fix binary and is superseded.

- Presented real JPEG — [capture removed from current tree for owner privacy]
  (`picoview.exe` opened the 1153×1198 Windows-screenshot fixture re-encoded as JPEG
  q90, 190,268 bytes). Window shows the presented page image, header filename, footer
  `Ready 1153 x 1198` — the **true source dimensions**, which equal the native resource
  dimensions. The displayed image is fit-to-window GPU minification of the
  full-resolution resource: page text is sharp, with no envelope resample. Capture
  method: Win32 `PrintWindow` (PW_RENDERFULLCONTENT) on the live window, cold launch,
  no interaction. This screenshot proves the image was visibly presented; it does not
  by itself prove channel order — color correctness is pinned by the asymmetric unit
  oracle (§3) and the color fixture below.
- Presented color fixture — [capture removed from current tree for owner privacy]
  (the deterministic asymmetric color fixture, 256×128, generated by
  `experiments/v1-corrective-1/color_fixture.ps1`: RED|BLUE / GREEN|MAGENTA /
  YELLOW|CYAN). Under the deleted B,G,R,A emission red rendered blue and blue rendered
  red; the capture shows red as red, blue as blue, green/magenta/yellow/cyan correct,
  footer `Ready 256 x 128`. Purpose is exactly R/B-swap detection — this is not a
  color-management claim.
- Error state, missing file — [capture removed from current tree for owner privacy]:
  same binary launched with a
  nonexistent path: bounded red message `image path does not exist`, footer `Error`,
  shell fully rendered and usable, no crash, no retry loop, no live resource
  (`handle=None` in the runtime log).
- Error state, corrupt JPEG — [capture removed from current tree for owner privacy]
  (the 75-garbage-byte fixture → bounded `could not decode image: …`), same bounded
  behavior.
- `O(image-bytes) never crosses QuickJS` is enforced structurally and verified by
  review: the only guest-facing payloads are the scalar svc event shapes
  (test-locked ≤512 bytes); decode/resource planes are function-local native buffers;
  pixels enter the core only through `register_native_texture` (host-side; there is no
  JS op for it).

## 5. Adversarial review

Two fresh-context reviewers; both verdicts **PASS, no MAJOR findings**. All MINOR
findings were addressed in `067693c` or recorded here:

- Fixed: WIC decode allocation cap for absurd declared dimensions (80 Mpx → bounded
  `OpenError::Decode` instead of a potential OOM abort); guest JSON-null line guard;
  guest stale-generation skip; single-generation ready-registration slot (was an
  unbounded set); error-after-success retirement asserted against the real surface;
  NotAFile test; host/guest texture-key drift lock test; tautological svc assertion
  comment rewritten to state what is actually proven.
- Recorded: `CurrentItem` has no `Drop` (shutdown retirement rides the shared
  `UiSurface` teardown — acceptable for V1's single boot-time open); upload-rejection
  branch (`handle < 0`) has no dedicated test (cannot be forced through the public
  seam without mocking the core); the svc_in queue has no host-side reader, so wire
  behavior rests on the manual captures; a transient blank frame between retire and
  the next ready event is accepted design (core renders freed handles as nothing).

Corrective-round review (two fresh-context reviewers):

- Reviewer A (architecture / cross-repo): **APPROVE**. MINOR (stray `__pycache__`
  bytecode committed) fixed by removing the files and ignoring the directory.
- Reviewer B (graphics / presentation lifecycle): **REVISE**, all findings
  evidentiary-honesty items, all addressed in this round: [MAJOR] launch-count claims
  exceeded the committed record → §7.2 now cites only committed per-launch JSONLs with
  exact counts (superseded round-1 table kept with an explicit probe-binary-delta
  footnote); [MINOR] the Focused-re-present justification was wrong (the event fires
  pre-frame, a no-op) → the Focused/Occluded handlers are removed entirely and §7
  rewritten around the one-shot reconfigure; [MINOR] the `Occluded` arm is dead on
  Windows (winit 0.30.13 never delivers it) → removed with the same handlers; [NIT]
  duplicate §7 heading → scope section renumbered §8; [NIT] residual-mode phrasing →
  stated explicitly in §7.4.
- Post-corrective review found two documentation truthfulness issues, both fixed in this
  edit: the PR/evidence language over-attributed the lower-layer fault uniquely to the
  AMD driver, and the PR body still described the superseded ≤512 / 6e631f46 / 2.5 s
  heal design. §7 now limits attribution to what the evidence proves; the PR body is
  rewritten to match the current full-resolution seam and compatibility mitigation.
- Final subtraction review found the incorrect local PSM_8888 byte-order assumption and
  its pointlessly resampled normal path (§2 item 9); all fixes and re-validations are in
  that round.

## 6. Known limitations (recorded, not gates)

- **Images above 8192 px per axis are admission-fitted** into the PocketJS native-seam
  ceiling (`NATIVE_TEX_MAX_DIM`, wgpu-default class). Bounded, documented degradation
  for giant images only; ordinary photos pass through untouched. Viewport paging /
  tiled rendering stays deferred (`docs/ARCHITECTURE.md`, DEFERRED).
- **EXIF orientation** is not applied (PRD §9 lists it; it is not in #46's acceptance).
- **JPEG only** in V1; format breadth is #10.
- **Presentation compatibility mitigation is a one-shot swapchain reconfigure before
  the first present** (see §7): targeted at the recorded AMD Vulkan / Windows WSI-DWM
  failure mode, event-shaped, no timers. The current evidence does not uniquely separate
  an AMD driver defect from the wgpu Vulkan/WSI layer. Its sufficiency inside the bad
  machine state is supported by the captured G matrices
  but the interleaved same-window A/B against a no-recovery binary has not yet been
  captured (the state fled mid-investigation); the committed canary
  (`experiments/v1-corrective-1/matrix/canary/`) closes that gap automatically on the
  next recurrence.
- **No performance claims.** No startup, latency, memory, or idle numbers are asserted
  by this ticket; any such claim requires `docs/BENCHMARK.md` rigor in its own ticket.

## 7. AMD Vulkan first-frame investigation (corrective round)

Symptom: on cold launch the window's client area stays white while every present
reports `submitted true` — no `Outdated`, no `Suboptimal`, no error, no TDR event.
Measured via `PrintWindow`(PW_RENDERFULLCONTENT) capture + 64×64 thumbnail statistics
(WHITE: mean_rgb ≈ 248, unique colors 45–65; CONTENT: mean_rgb ≈ 140, unique ≥ 600).
The harness (`experiments/v1-corrective-1/launch_capture.py`, ctypes-only,
ShellExecuteW launch, WM_CLOSE teardown) and every per-launch JSON record referenced
below are committed.

### 7.1 Round 1 (`b9adbcf`): 0/98 repro → heal deleted, attention recovery added

The PR-era 2.5 s @ 200 ms re-present heal had no reproducible target: 98 instrumented
cold launches (heal on/off, first-present-sync, idle-cold, 4-instance burst, PR-era
binary, stock host) produced 0 white windows. The heal failed the no-magic-timer bar
and was deleted in favor of a Focused/Occluded re-present. Footnote (probe delta):
the "warm rapid, shipped heal" row ran the PR-era binary whose heal was env-gated
(`PICOVIEW_HEAL`); that env knob does not exist in HEAD. Round 1's "does not
reproduce" conclusion is **superseded by round 2**.

### 7.2 Round 2 (this round): the bad state exists and is deterministic

The same machine later entered a distinct state in which the white-window symptom
reproduces at 100%. All records committed under `experiments/v1-corrective-1/matrix/`:

| matrix (committed JSONL) | binary | launches | result |
| --- | --- | --- | --- |
| `final-warm.jsonl` | PicoView, no recovery path | 12 | **12 WHITE** |
| `final-idle.jsonl` | PicoView, no recovery path | 6 | **6 WHITE** |
| `final-stock.jsonl` | **stock PocketJS host** `pocket-desktop-host` @ `df869a5` | 10 | **10 WHITE** |
| `final-old.jsonl` | PR-era binary with the 2.5 s heal | 12 | 12 CONTENT (heal masks it) |
| `exp-g.jsonl` | final binary (one-shot first-present reconfigure) | 12 | 12 CONTENT |
| `stock-now.jsonl` | stock host, ~40 min later | 4 | 4 CONTENT (state had fled) |
| `exp-g2.jsonl` / `exp-nog.jsonl` | interleaved G/no-G A/B | 8 + 8 | all CONTENT (good-state window) |

Representative committed captures (one per semantic; the repetitive per-launch PNGs
were pruned — the JSONLs carry every launch's classification): WHITE, CONTENT, broken
composite and capture control — one each, all four
[capture removed from current tree for owner privacy].

Mechanism findings:

1. **Presentation calls succeed, but the submitted frame is not observed in the window.**
   Timelines (committed representative `sync-1.log`; the repeated runs agree): window
   created ~52 ms → surface created+configured ~657 ms
   → first present ~758 ms `submitted true` → screen stays white; a second natural
   WM_PAINT present ~+45 ms also submits while the window stays white. The available
   evidence therefore rules out a simple "first image was never submitted" explanation,
   but does not by itself identify which WSI/DWM layer failed to make it visible.
2. **A resize does not recover.** `dbg2.log` plus its capture
   [capture removed from current tree for owner privacy]: after presents and a
   `SetWindowPos` resize, the capture shows a broken composite (black clear-color band
   + white region), consistent with a lower-layer presentation/composition failure.
3. **The capture channel is healthy.** A notepad probe captures real content
   [capture removed from current tree for owner privacy]; no TDR events in the
   system log.
4. **Machine-state dependence.** The same binaries flip good⇄bad with zero code
   change (98-launch good campaign; 100% white bad matrices; good again ~1 h later).

### 7.3 Attribution verdict: PicoView-specific cause excluded; lower-layer owner unresolved

1. The stock PocketJS host — a separate presentation implementation with zero PicoView
   product code — reproduces 10/10 WHITE in the same bad machine state. This strongly
   excludes PicoView's JPEG path, Current Item logic, guest binding, and PicoView-only
   presentation policy as the cause.
2. The same binaries flip good⇄bad with zero code change. This proves the symptom is
   machine/graphics-state dependent rather than a source-code revision regression; it
   does **not** by itself exclude a state-dependent race or WSI lifecycle defect in a
   shared lower layer.
3. All presents return success within the Vulkan/wgpu contract (wgpu 25.0.2,
   winit 0.30.13); create surface → configure → present is standard legal usage, and
   the application receives no OUT_OF_DATE/SUBOPTIMAL/error signal. This establishes
   that PicoView has no direct failure callback to react to, but it does not uniquely
   identify which lower layer failed to make the frame visible.
4. The strongest current locus is the **AMD Vulkan / Windows WSI-DWM presentation
   boundary** on AMD proprietary driver 25.8.1. Recreating the swapchain is the only
   observed effective recovery. The present evidence does **not uniquely distinguish**
   an AMD driver defect from wgpu's Vulkan/WSI integration or another shared WSI/DWM
   interaction; a lower-level minimal reproduction, upstream confirmation, or driver
   A/B would be required for that stronger attribution.

Cross-repo consequence: PicoView's product presentation path is PicoView-owned
(`native/src/gpu.rs` `Presentation`); the stock host is a reproduction vehicle only
and is not consumed by PicoView product. The evidence therefore justifies no PocketJS
presentation change in this round. Upstream references (wgpu/winit/AMD) remain a
follow-up; none are fabricated here. Full report: jnhu76/PicoView#46 (comment
5673780953).

### 7.4 Compatibility mitigation (final V1 design)

`Presentation` reconfigures the surface once immediately before its first present
(`reconfigure_before_first_present`, `native/src/gpu.rs`) — recreating the swapchain,
which is the observed effective recovery. This is a bounded **compatibility mitigation**,
not a claim that the exact lower-layer defect owner has been proven. Event-shaped: no
timers, no polling, no magic durations; static idle keeps the window
presentation/event loop idle (`ControlFlow::Wait`) while the runtime worker still
follows the existing 60 Hz PocketJS tick model — recalibrating that model is not this
ticket's scope. Removed in this round: the (already deleted) heal's
replacement Focused/Occluded re-present handlers — recorded runs show they contributed
no protection (Focused fires pre-frame; re-presents alone did not recover `dbg2`), so
the final design carries exactly one recovery mechanism. Residual mode without the
recovery: the window stays white until the process is restarted or an external
presentation event happens to land (observed: the heal-era binary recovered via its
polling loop; the un-recovered binary stayed white across ≥ 2 presents and a resize).

Honest status: the G matrices above ran inside captured bad-state windows adjacent in
time to the 12/12-WHITE no-recovery matrices, but the strictly interleaved same-window
A/B against the no-recovery binary fell in a good-state window and is by itself
inconclusive. A bounded stock-host canary
(`experiments/v1-corrective-1/matrix/canary/`) polls every ~90 s and auto-runs six
interleaved G/no-G cold-launch pairs the moment the bad state returns; until it
fires, the mitigation is justified by mechanism + adjacent-window matrices, not by a
same-window A/B. First canary window (committed `canary/canary.jsonl`): 7 probes over
~10 minutes, all good state, no trigger — the A/B stays pending the next bad-state
occurrence.

### 7.5 Delete conditions

Remove the one-shot reconfigure when a driver update (> 25.8.1) — or an upstream fix
— verifies 0 white across N ≥ 50 cold launches in a previously-bad machine state
(detection via the committed canary, since the state is machine-dependent, not
build-dependent).

## 8. Scope discipline

Not implemented (explicitly out of scope): zoom/pan/Fit/100% semantics (V2), rotation,
BrowseSession/folder enumeration/next-prev ordering (V3), Open dialog and drag-drop (#5),
file operations (#8), format breadth beyond baseline JPEG (#10), decoder bake-offs,
zero-copy, GPU decode, tile/texture pools, preload/cache policy, telemetry. The guest
emits no intent in V1 (`svcSend` unused by the shell).

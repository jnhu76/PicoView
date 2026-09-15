# PICOVIEW-V1-OPEN-ONE-IMAGE-1 — Evidence

Status: READY_FOR_REVIEW. Branch `product/v1-open-one-image`, base `e109ce6` (main).
Ticket: jnhu76/PicoView#46 (executing the V1 slice of #1). No PRD/SPEC gate budgets are
involved; this slice makes one explicit local JPEG visibly presented through the formal
product architecture and records bounded error paths.

**Corrective round** (`PICOVIEW-V1-IMAGE-QUALITY-AND-AMD-VULKAN-CORRECTIVE-1`): the
original PASS was withdrawn and re-earned. Two regressions/risks were found and worked:
(a) the production path destructively downsampled every image into the JS-facing pow2
≤512 envelope — fixed by consuming the native large-image resource seam upstreamed to
PocketJS (jnhu76/pocketjs#1); (b) the 2.5 s polling presentation "self-heal" was
investigated to root cause and replaced by an event-driven recovery path.

## 1. Identity

| Item | Value |
| --- | --- |
| PicoView base SHA | `e109ce6` (main, product baseline reset) |
| PicoView head SHA | `9308a2a` + corrective commits `0b38c0b` (image seam), `b9adbcf` (Vulkan investigation) |
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
   is word-order converted (RGBA8888 → PSM_8888) and registered via
   `register_native_texture(FLAG_LINEAR)`. Images within the seam's admission ceiling
   (8192/axis) pass through **pixel-exact at full source resolution**; only giant
   images above the ceiling are box-fitted into it (bounded, documented; viewport
   paging stays deferred). The pow2 ≤512 envelope, its transparent padding, and the
   guest-side crop composition are **deleted**. svc ready events carry width/height
   only (resource dims == source dims; envelope fields gone). Guest fit scales the real
   resource directly; the footer reports true source dimensions.
7. `b9adbcf` — AMD Vulkan first-frame investigation (§7): lifecycle instrumentation,
   98-launch reproduction matrix, and replacement of the polling heal with an
   event-driven recovery path (Focused/Occluded re-present).

## 3. Reproduction

From the PicoView checkout with the PocketJS sibling checkout detached at the locked
revision:

```text
bun C:/Users/fred1/source/pocketjs/tools/pocket.ts compile --target windows-app ^
     --manifest guest/pocket.json --project-root . --outdir dist
cd native && cargo test && cargo build --release
cd ..
native\target\release\picoview.exe --js dist\picoview.js --pak dist\picoview.pak ^
     C:\Users\fred1\source\PicoView\test-media\real-screenshot.jpg
```

`cargo test` (native): **9 passed, 0 failed** — WIC JPEG roundtrip, garbage/missing
rejection, decode-dimension cap, **resource-dimension oracle (1153×1198 stays
1153×1198; pixels word-order-exact)**, **high-frequency oracle (1024×1024 1px
checkerboard survives per-pixel exact — the old path averaged every 2×2 block into
mush on its way into the 512 envelope)**, **admission-fit oracle (>8192 giant image
bounded to the ceiling)**, bounded svc scalar events, error-message cap, and the
real-surface lifecycle test (open → replace retires the first handle without GC;
corrupt open retires the live handle itself; NotAFile; success after error; explicit
retire; host/guest texture-key contract lock) — now exercising `register_native_texture`
on the actual open path.

## 4. Manual proof on real Windows (this machine, this toolchain)

- `docs/v1-open-one-image-1/present-real-jpeg.png` — `picoview.exe` opened
  `test-media\real-screenshot.jpg` (1153×1198 Windows screenshot re-encoded as JPEG q90,
  190,268 bytes; runtime log: `generation=1 handle=Some(0)`). Window shows the presented
  page image, header filename, footer `Ready 1153 x 1198` — the **true source
  dimensions**, which now equal the native resource dimensions. The displayed image is
  fit-to-window GPU minification of the full-resolution resource: page text is sharp,
  with no envelope resample. Capture method: Win32 `PrintWindow`
  (PW_RENDERFULLCONTENT) on the live window, first cold launch, no interaction.
- `docs/v1-open-one-image-1/error-missing-file.png` — same binary launched with a
  nonexistent path: bounded red message `image path does not exist`, footer `Error`,
  shell fully rendered and usable, no crash, no retry loop, no live resource
  (`handle=None` in the runtime log).
- `docs/v1-open-one-image-1/error-corrupt-jpeg.png` — `test-media\corrupt.jpg`
  (75 garbage bytes → bounded `could not decode image: …`), same bounded behavior.
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

## 6. Known limitations (recorded, not gates)

- **Images above 8192 px per axis are admission-fitted** into the PocketJS native-seam
  ceiling (`NATIVE_TEX_MAX_DIM`, wgpu-default class). Bounded, documented degradation
  for giant images only; ordinary photos pass through untouched. Viewport paging /
  tiled rendering stays deferred (`docs/ARCHITECTURE.md`, DEFERRED).
- **EXIF orientation** is not applied (PRD §9 lists it; it is not in #46's acceptance).
- **JPEG only** in V1; format breadth is #10.
- **Presentation recovery is event-driven** (see §7): focus / un-occlusion / resize
  re-present the retained frame. There is no polling and no timer; whether this class
  of recovery covers every driver-level first-present loss is unprovable on a machine
  where the loss no longer reproduces (§7) — the detection harness
  (`experiments/v1-corrective-1/`) is committed so a recurrence is measurable.
- **No performance claims.** No startup, latency, memory, or idle numbers are asserted
  by this ticket; any such claim requires `docs/BENCHMARK.md` rigor in its own ticket.

## 7. AMD Vulkan first-frame investigation (corrective round)

Symptom (PR-era, machine-observed, intermittent): the first present could lose a race
against the swapchain/DWM handoff; the static hash gate then never re-presents, so the
window stayed blank until an external resize. `067693c` papered over it with a 2.5 s @
200 ms retained-target re-present loop.

Instrumentation: process-start monotonic base; both threads log window created, surface
configured, runtime booted, render submit, frame ready, present begin/end (with submit
result), resize and attention events. Raw timelines: `experiments/v1-corrective-1/matrix/`.

Reproduction matrix (98 cold launches, all classified by pixel statistics of
`PrintWindow` captures; harness committed):

| Protocol | Builds | Launches | White |
| --- | --- | --- | --- |
| warm rapid, heal on | new binary | 12 | 0 |
| warm rapid, heal off | new binary | 12 | 0 |
| first-present-sync (capture ≤120 ms after `present end`) | new binary, heal off | 12 | 0 |
| idle-cold (45 s GPU silence before launch) | new binary, heal off | 6 | 0 |
| 4-instance burst × 3 rounds | new binary, heal off | 12 | 0 |
| warm rapid (shipped 2.5 s heal) | PR-era binary `9308a2a`, old 512-path | 12 | 0 |
| stock `pocket-desktop-host` @ `df869a5`, same bundle | PocketJS host | 10 | 0 |
| warm rapid, final event-driven build | new binary | 10 | 0 |

Mechanism findings:

1. **Timeline** (typical): window created ~55 ms; surface configured ~600–700 ms (GPU
   adapter init dominates); runtime boot + WIC decode + registration +first render
   ~750 ms; first present ~750–810 ms. The first present lands long after the window is
   compositor-visible, which structurally avoids the classic "present before exposure"
   race on this machine today.
2. **The window-show sequence fires `Focused(true)` and three `Resized` events** before
   the first frame exists (their redraws are no-ops then, but the events exist).
3. **The OS delivers a second `WM_PAINT` ~45 ms after the first present** (no
   application `request_redraw` involved); the retained-frame host answers it with a
   free re-present. Two presents therefore occur inside the risky window by default.
4. Recovery class of the historically observed fix: any event that re-presents the
   retained target (the PR-era evidence says manual resize recovered it).

Verdict on the 2.5 s heal: with 0 reproductions across 98 instrumented launches
(including the PR-era binary and the stock PocketJS host), the polling loop protects
against nothing measurable on this machine and fails the no-magic-timer quality bar.
It is replaced by an **event-driven recovery**: `Focused(true)` and `Occluded(false)`
re-present the retained GPU frame (one blit; no re-record, no UI tick, hash gate
untouched), plus the resize path that was always there. `Focused(true)` fires inside
the startup race window (finding 2), so the risky window gains an extra semantically
justified present without any timer. Verified: quiet-3s log growth 0 bytes after
settle (static idle is truly idle), minimize/restore correct, 0×0 resize no-op guard
intact.

Honest limits: the original race's driver-level trigger was never re-established, so
event-driven recovery cannot be proven sufficient against it — only that it is the
same recovery class that empirically fixed it, costs ~nothing, and stays fully quiet.
If the white window recurs, the committed harness measures it (§6).

Cross-repo ownership verdict: the recorded symptom is a generic desktop presentation
lifecycle issue (the stock host shares the design), but it does not reproduce on the
stock host either; no PocketJS change is currently justifiable, and none was made for
presentation in this round. If it recurs on the stock host, raise it upstream through
the cross-repo process with the committed harness.

## 7. Scope discipline

Not implemented (explicitly out of scope): zoom/pan/Fit/100% semantics (V2), rotation,
BrowseSession/folder enumeration/next-prev ordering (V3), Open dialog and drag-drop (#5),
file operations (#8), format breadth beyond baseline JPEG (#10), decoder bake-offs,
zero-copy, GPU decode, tile/texture pools, preload/cache policy, telemetry. The guest
emits no intent in V1 (`svcSend` unused by the shell).

# PICOVIEW-V1-OPEN-ONE-IMAGE-1 — Evidence

Status: READY_FOR_REVIEW. Branch `product/v1-open-one-image`, base `e109ce6` (main), head `067693c`.
Ticket: jnhu76/PicoView#46 (executing the V1 slice of #1). No PRD/SPEC gate budgets are
involved; this slice makes one explicit local JPEG visibly presented through the formal
product architecture and records bounded error paths.

## 1. Identity

| Item | Value |
| --- | --- |
| PicoView base SHA | `e109ce6` (main, product baseline reset) |
| PicoView head SHA | `067693c` |
| Branch | `product/v1-open-one-image` |
| PocketJS locked revision | `6e631f463016a258e63fc9a5f922117b94d4f89f` (`POCKETJS.lock`, branch_hint `feat/windows-desktop-parity`) |
| PocketJS consumption | Cargo git deps pinned to the locked revision (`native/Cargo.toml`); sibling checkout `C:\Users\fred1\source\pocketjs` detached at the same SHA; guest toolchain invoked from the sibling checkout; **no `..` references, no submodule, no vendoring in committed files** |
| rustc | 1.98.1 (48a229cea 2026-09-01), x86_64-pc-windows-msvc |
| bun | 1.2.8 |
| OS / machine | Windows 11 Pro x64 (build 26200), AMD Ryzen host |
| GPU | AMD Radeon(TM) Graphics (integrated), wgpu Vulkan, surface format Bgra8Unorm, PowerPreference LowPower |
| Workspace note | `package.json` / `tsconfig.json` / `bun.lock` are the owner's untracked local workspace state; `package.json` maps `@pocketjs/framework` to the sibling checkout via a `file:` path and is deliberately **not committed** because it would encode a parent-path reference. The committed, reproducible build recipe is the sibling-checkout command in §3 pinned to the locked revision. |

## 2. What was built

Vertical slice, four commits:

1. `0713d6f` — native Current Item authority: explicit path → `std::fs::read` (source
   handle released at return) → WIC decode (IWICImagingFactory → CreateDecoderFromStream →
   FormatConverter → 32bppRGBA) → box-downsample into a pow2 texture envelope honoring the
   PocketJS core contract (`spec::TEX_MAX_DIM`, pow2-only) → upload via
   `UiSurface::with_ui(ui.upload_texture_flags(..., FLAG_LINEAR))` → bounded scalar svc
   events (`loading` / `ready` / `error`, strings ≤200 chars, JSON ≤512 bytes).
   Each open retires the previous native texture explicitly (`free_texture` via `with_ui`);
   a failed open leaves no live resource. No image bytes cross QuickJS at any point.
2. `0814072` — guest observer shell: `svcPoll` batch → per-line JSON → ready handle bound
   under key `picoview-current` via `registerTexture` → `<Image>` node presents the pow2
   envelope cropped to the content extent. Fit-to-window **minification only** (1:1 cap);
   zoom/100%/Fit semantics are V2. Loading/error/idle branches keep the shell usable.
3. `ba83883` — test samples (real JPEG + corrupt bytes).
4. `067693c` — adversarial-review hardening (§5) + presentation bootstrap self-heal (§6).

Zero changes to the PocketJS repository are required or included: every API used
(`upload_texture_flags`, `free_texture`, `UiSurface::with_ui`, `svc_push`/`svcPoll`,
`registerTexture`, `<Image>`, `OffloadWorker`, retained-target `render_words_scaled` +
blit presentation) pre-exists at the locked revision. No new DrawList opcode, no second
compositor, no decoder dependency beyond WIC.

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
rejection, decode-dimension cap, presentation-contract (1920×1080 → 512×512 envelope /
512×288 content, transparent padding), untouched small images, bounded svc scalar events,
error-message cap, and the real-surface lifecycle test (open → replace retires the first
handle without GC; corrupt open retires the live handle itself; NotAFile; success after
error; explicit retire; host/guest texture-key contract lock).

## 4. Manual proof on real Windows (this machine, this toolchain)

- `docs/v1-open-one-image-1/present-real-jpeg.png` — `picoview.exe` opened
  `test-media\real-screenshot.jpg` (1153×1198 Windows screenshot re-encoded as JPEG q90,
  190,268 bytes; runtime log: `generation=1 handle=Some(0)`). Window shows the presented
  page image, header filename, footer `Ready 493 x 512` (content extent; the pow2
  envelope is 512×512). Presented at the envelope's native resolution with bilinear
  sampling — smooth, no blockiness. Capture method: Win32 `PrintWindow`
  (PW_RENDERFULLCONTENT) on the live window.
- `docs/v1-open-one-image-1/error-missing-file.png` — same binary launched with a
  nonexistent path: bounded red message `image path does not exist`, footer `Error`,
  shell fully rendered and usable, no crash, no retry loop, no live resource
  (`handle=None` in the runtime log). The corrupt-file path (`test-media\corrupt.jpg`,
  75 garbage bytes → bounded `could not decode image: …`) is locked by tests and was
  manually observed in an earlier run of the same build chain.
- `O(image-bytes) never crosses QuickJS` is enforced structurally and verified by
  review: the only guest-facing payloads are the three scalar svc event shapes
  (test-locked ≤512 bytes); decode/texture planes are function-local native buffers;
  pixels enter the core only through `upload_texture_flags`.

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

- **Presentation envelope is pow2 ≤ 512** (PocketJS core texture contract). A 1153×1198
  decode presents as 493×512 content in a 512×512 envelope — a deliberate smallest-use
  of the existing resource model. Full-resolution or tiled presentation belongs to the
  deferred real-workload performance ticket (`docs/ARCHITECTURE.md`, DEFERRED) and would
  need explicit evidence that the existing resource model cannot satisfy it.
- **EXIF orientation** is not applied (PRD §9 lists it; it is not in #46's acceptance).
- **JPEG only** in V1; format breadth is #10.
- **Presentation bootstrap race** (machine-observed): the very first present can lose a
  race against the swapchain/DWM handoff on this AMD Vulkan driver; because static
  frames are hash-gated and never re-render, the window stayed blank until an external
  resize. `067693c` adds a bounded bootstrap self-heal: for 2.5 s after startup the host
  re-presents the existing retained target every 200 ms (blits only — no re-record, no
  UI tick), then the window goes fully quiet (`ControlFlow::Wait`). Verified across
  repeated launches: the image now presents without user interaction. Static idle still
  owns no continuous loop. The upstream desktop host exhibits the same race; if it
  recurs elsewhere this should be raised as a PocketJS generic-capability discussion
  through the cross-repo process, not patched locally.
- **No performance claims.** No startup, latency, memory, or idle numbers are asserted
  by this ticket; any such claim requires `docs/BENCHMARK.md` rigor in its own ticket.

## 7. Scope discipline

Not implemented (explicitly out of scope): zoom/pan/Fit/100% semantics (V2), rotation,
BrowseSession/folder enumeration/next-prev ordering (V3), Open dialog and drag-drop (#5),
file operations (#8), format breadth beyond baseline JPEG (#10), decoder bake-offs,
zero-copy, GPU decode, tile/texture pools, preload/cache policy, telemetry. The guest
emits no intent in V1 (`svcSend` unused by the shell).

# AGENTS.md

## Mission

Build **PicoView**, a fast, small, focused Windows 11 local image viewer on PocketJS.

The project is currently in **Architecture Phase A**. Product Phase B is blocked until **GATE-A** explicitly passes.

Do not equate “a window renders” or “a JPEG appears” with architecture admission.

## Read before changing code

Read, in order:

1. `docs/PRD/PicoView-PRD-v0.5.md`
2. `docs/SPEC/PicoView-v1.md`
3. `docs/BENCHMARK.md` when the ticket measures a physical property
4. relevant accepted ADRs
5. `CONTEXT.md`
6. `docs/POCKETJS-BASELINE.md` when the ticket touches PocketJS
7. the assigned GitHub issue
8. relevant PocketJS upstream contracts/docs/code

If sources disagree, higher authority wins. Do not “fix” a higher authority implicitly in code.

## Execution-state labels are authoritative

GitHub issue labels are execution state:

- `ready-for-agent` — the issue is on the current executable frontier;
- `blocked` — **do not start implementation**;
- `spec` — parent/spec authority, not an implementation ticket.

Before coding, verify the assigned issue is open and labeled `ready-for-agent`.

If it is `blocked`, stop. Do not work around the blocker just because the body looks implementable.

When a blocker closes, the tracker must explicitly move the newly unblocked issue from `blocked` to `ready-for-agent`; agents must not infer the transition silently.

## Current architecture campaign baseline

Architecture Phase A begins from the PocketJS baseline in `docs/POCKETJS-BASELINE.md`:

`a5a85356e172db8a32aefa983ee1259f60406f69`

Do not silently build against moving PocketJS `main`.

Every architecture result that depends on PocketJS records:

- PicoView SHA;
- PocketJS campaign base SHA;
- effective PocketJS SHA/patch series.

The default workspace topology is a PicoView checkout plus a sibling PocketJS checkout/worktree pinned to the exact source identity. Do not copy PocketJS source into PicoView to make a ticket easier.

## Non-negotiable architecture rules

- PocketJS is the runtime choice.
- Octane-first is the Architecture Phase A guest profile.
- QuickJS is control/state only; ordinary image presentation must not shuttle full encoded files or decoded multi-megapixel pixel planes through JS.
- Decode buffers, native image resources, and GPU resources have explicit lifetime independent of QuickJS GC.
- Current-image work outranks folder discovery, metadata, prefetch, and every derived task.
- A stale request generation may never publish over a newer generation.
- Static idle must not require a PicoView-owned continuous render loop.
- Exact Previous/Next may not speculate on partial directory enumeration.
- Per-Monitor DPI V2 is correctness, not polish.
- Do not add Electron, WebView, .NET/Windows App SDK as a second app runtime, JVM, Python runtime, FFmpeg-class stacks, databases, plugin runtimes, telemetry, background services, or resident updaters.
- Third-party image decoders require benchmark evidence and an explicit admission decision.

## PocketJS Windows boundary

PocketJS's existing desktop architecture is the starting seam, but the frozen baseline does **not** already support Windows: its desktop plan explicitly accepts macOS/Linux and compile-errors other host OS targets.

Therefore:

- extend the existing desktop architecture to Windows;
- do not invent a PicoView-only parallel host unless evidence proves the existing contract cannot express a required Windows behavior;
- keep runtime-generic changes in PocketJS when practical;
- keep PicoView-specific product logic in PicoView.

If a PicoView ticket requires PocketJS work:

- isolate the runtime-generic change;
- record the PocketJS commit/patch/PR;
- link it from the PicoView ticket/report;
- keep PicoView's product requirement and acceptance evidence in PicoView.

## Native image-resource rule

The existing JS-facing `uploadTexture(Uint8Array, ...)` small-texture path is **not** PicoView's multi-megapixel image data plane.

Architecture Phase A must prove a native-owned large image resource can participate in PocketJS composition while the guest receives only bounded semantic state such as an opaque resource handle/id.

Prefer the smallest extension of existing image-node / resource-handle / DrawList texture semantics.

Do not introduce a new DrawList opcode or independent compositor-surface architecture unless the ticket produces evidence that the existing resource model cannot satisfy the required size/lifetime/composition semantics.

## Architecture gate discipline

Architecture Phase A contains only the minimum work required to admit/reject the substrate:

- source/benchmark freeze;
- Windows stock-target extension;
- native image-resource composition seam;
- first JPEG/WIC path;
- large-JPEG/direct-manipulation proof;
- cancellation/resource-bounds proof;
- minimal Per-Monitor DPI proof;
- startup/package-prototype/memory/idle/five-process proof;
- GATE-A.

Do **not** implement Product Phase B work before GATE-A passes merely because a later issue already exists.

Product Phase B includes BrowseSession, final Open/refresh UX, Handle, broad format/animation, full viewer chrome, UI Automation, and release packaging.

## Ticket discipline

Tickets are vertical tracer bullets. Work only the assigned ticket and its acceptance criteria.

Before coding:

- confirm the ticket is `ready-for-agent`;
- confirm all declared blockers are complete;
- identify the highest practical end-to-end seam;
- record any new dependency or architecture decision the ticket would introduce;
- confirm the exact PocketJS source identity if runtime behavior is involved.

During coding:

- keep obsolete work cancellable;
- keep native resource ownership explicit;
- keep guest/native messages bounded;
- prefer deletion/reduction/delay/cancellation before optimization;
- do not broaden the ticket into adjacent product work.

Before marking complete:

- run the ticket's acceptance checks;
- capture required evidence/benchmarks;
- use `docs/BENCHMARK.md` definitions rather than ad hoc metrics;
- update authority docs if an assumption is disproved;
- leave the worktree clean;
- do not weaken a PRD budget to obtain PASS;
- identify which single next issue(s), if any, are now truly unblocked so tracker labels can be advanced explicitly.

## Benchmark discipline

A performance/memory/package claim cannot close a gate unless the report follows `docs/BENCHMARK.md`.

At minimum record:

- exact PicoView and PocketJS SHAs;
- optimized release build identity;
- Windows build and machine/GPU identity;
- sample identity;
- required sample count/percentile rule;
- timestamp definitions used;
- both Working Set - Private and Private Bytes for memory claims.

Do not call present submission “display photon latency.” The architecture benchmark uses present submission as a named proxy and keeps visual acceptance separate.

## Testing style

Prefer external behavior and measurable contracts over implementation-detail mocks.

High-value Architecture Phase A tests include:

- a real Octane guest on the Windows stock-target path;
- native-generated ≥4K image → PocketJS composition without JS pixel transport;
- file → WIC decode → native image resource → visible presentation;
- generation cancellation/no stale publication;
- resource release independent of QuickJS GC;
- cross-DPI anchor correctness;
- package/startup/memory/idle/five-process gates.

After GATE-A, Product Phase B adds:

- deterministic BrowseSession ordering fixtures;
- current-file filesystem effects;
- format/animation behavior;
- Windows UI Automation inspection;
- final GATE-B regression measurements.

Use existing PocketJS desktop/backend/simulator/frame-trace patterns where they fit rather than inventing a second verification philosophy.

## Scope guard

v1 excludes:

- destructive image editing;
- library/database behavior;
- cloud/account behavior;
- Filmstrip;
- Slideshow;
- Print;
- Share;
- batch operations;
- plugins;
- RAW development;
- true HDR;
- generalized updater/telemetry/network subsystems.

If a task seems to require one of these, surface the authority conflict rather than implementing it.

## Documentation authority

- PRD owns product boundary, budgets, feature cuts, and gate policy.
- SPEC owns cross-cutting system/execution/test decisions.
- BENCHMARK owns measurement semantics.
- accepted ADRs own evidence-backed durable technical choices.
- CONTEXT owns current state and working facts; it does not override accepted ADRs.
- POCKETJS-BASELINE owns the external source identity for the current architecture campaign.
- issues own bounded execution slices.

Do not create a second competing architecture document.

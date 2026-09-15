# PicoView Architecture — Frozen Ownership Boundaries

Status: **active product authority** (rank 4 in the authority order).

PocketJS has been accepted as PicoView's Windows UI/runtime/view foundation
(owner decision `POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT`, 2026-09-14; the
admission/startup campaign behind that decision is frozen history — see
`docs/history/README.md`). This document freezes the ownership boundaries
product implementation must respect. It deliberately does **not** freeze
decoder implementations beyond the WIC baseline or any advanced memory
architecture.

The PocketJS dependency is pinned in `../POCKETJS.lock` (exact revision is
authority; branch name is informational).

## A. PocketJS owns (runtime/platform)

- window and event loop;
- Windows desktop integration;
- input plumbing;
- DPI / window state;
- QuickJS/Octane runtime;
- UI layout/composition;
- text;
- wgpu renderer;
- surface/presentation;
- generic native-resource/service seams.

## B. PicoView guest / TSX owns (product UI)

- product UI: toolbar/chrome, view composition;
- Fit, 100%, zoom, pan;
- transient UI state;
- user intents (what the user asked for), expressed as bounded messages.

## C. PicoView native Rust owns (product state/data)

- Current Item authority;
- BrowseSession;
- filesystem;
- decoder orchestration;
- native image ownership;
- generation/cancellation;
- metadata;
- file operations;
- future preload policy.

## D. Hard boundary

**O(image-bytes) must never cross QuickJS.** JS receives bounded semantic
data only: handle, dimensions, status, metadata, events. Decoded pixel
planes, encoded files, and GPU resources stay native, with explicit lifetime
independent of QuickJS GC.

## Standing constraints (today)

1. no image bytes through QuickJS;
2. avoid obviously unnecessary ownership/copy layers;
3. resource lifetime must be bounded;
4. a stale generation must never publish over a newer generation.

## Cross-repo rule

If PicoView needs a generic runtime/platform capability, it is implemented in
`jnhu76/pocketjs` first, reviewed/merged there, and then `POCKETJS.lock` is
advanced. Never patch a vendored/local hidden copy. PicoView-specific product
policy stays in PicoView.

## DEFERRED — REAL WORKLOAD REQUIRED

The following are **explicitly deferred** until a real viewer workload exists
(after the `docs/ROADMAP.md` V5 baseline, via
`PICOVIEW-REAL-WORKLOAD-PERFORMANCE-1`). **No microbenchmark is authorized
yet.**

- WIC vs libpng/image-png/zune-png;
- WIC vs libjpeg-turbo/Rust JPEG decoders;
- UMA vs discrete GPU behavior;
- zero-copy/shared-resource strategies;
- buffer pools;
- texture pools;
- full-resolution vs viewport-sized decode optimization;
- preload/cache optimization;
- CPU→GPU transfer optimization.

Until then, only the standing constraints above apply.

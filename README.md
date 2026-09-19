# PicoView

PicoView is a fast, small, focused Windows 11 local image viewer built on PocketJS.

Responsibility chain: **Open → View → Inspect → Browse → Handle**. It is not an editor, photo library, cloud product, file manager, media database, or general-purpose asset platform.

## Current phase

**PicoView v0.1.0 is released** (tag `v0.1.0`).

Current work is post-release correctness and architecture normalization: closing the audited findings in [Issue #75](https://github.com/jnhu76/PicoView/issues/75) (refresh status visibility, svc command retention, legacy view-state retirement, guest derivation normalization, constant contracts, Windows-only containment, fatal-error observability, test architecture, decode-pressure evidence). See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## What the MVP does today

- Open a local image (native Open dialog, CLI path, or Windows file association)
- Browse previous/next in the containing folder
- Fit / 1:1 (Actual Size) / zoom / pan
- Rotate / flip view transforms
- File associations via conservative HKCU OpenWith
- Local-only product use — no network dependency for viewing

Platforms currently targeted: **Windows 11** (native host). PocketJS itself retains the shared macOS/Linux/Windows desktop host family.

## PocketJS

PicoView builds against an in-tree PocketJS snapshot:

- Source path: `third_party/pocketjs` (git subtree, not a submodule)
- Upstream: `jnhu76/pocketjs`
- Integration branch: `integration/picoview-desktop`
- Provenance authority: [`POCKETJS.lock`](POCKETJS.lock)

Cargo resolves PocketJS crates as path dependencies into that snapshot. See [`docs/integration/POCKETJS.md`](docs/integration/POCKETJS.md) for ownership and update rules.

## Where to read next

| Document | Role |
| --- | --- |
| [`CONTEXT.md`](CONTEXT.md) | Current product/source state |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Boundaries and program semantics |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What is done and what remains |
| [`docs/PRD/PicoView-PRD-v0.6.md`](docs/PRD/PicoView-PRD-v0.6.md) | Product authority |
| [`docs/SPEC/PicoView-v1.1.md`](docs/SPEC/PicoView-v1.1.md) | Execution contracts |
| [`docs/ADR/`](docs/ADR/) | Accepted architecture decisions |
| [`docs/integration/POCKETJS.md`](docs/integration/POCKETJS.md) | PocketJS subtree integration contract |
| [`POCKETJS.lock`](POCKETJS.lock) | Exact imported PocketJS revision |
| [`AGENTS.md`](AGENTS.md) | Agent engineering rules |
| [`docs/history/`](docs/history/) | Non-normative campaign evidence |

## Architecture in one sentence

> **PicoView decides which image, what the image means, and how the user wants to view it; PocketJS decides how an opaque image resource is rendered on the current graphics backend; large pixel data has one owner at a time, and every O(N pixels) movement must have a physical or semantic reason.**

The graphics path is GPU-first. A proved software fallback is not yet claimed; do not treat “GPU not required” as current capability until Architecture/SPEC fallback contracts are implemented and verified.

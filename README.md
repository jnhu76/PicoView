# PicoView

PicoView is a fast, small, focused Windows 11 local image viewer built on PocketJS.

Responsibility chain: **Open → View → Inspect → Browse → Handle**. It is not an editor, photo library, cloud product, file manager, media database, or general-purpose asset platform.

## Current phase: Viewer Architecture Reset

PicoView has already proved a real Windows path from local image decode to PocketJS presentation. The current work freezes the architecture that future product work must follow before additional architecture-sensitive implementation proceeds.

Current reset:

- control issue: **#50**;
- documentation/authority PR: **#51**;
- branch: `architecture/viewer-semantics-reset-1`.

## Current authority

- Product: [`docs/PRD/PicoView-PRD-v0.6.md`](docs/PRD/PicoView-PRD-v0.6.md)
- Architecture decision: [`docs/ADR/ADR-0001-viewer-image-rendering-authority.md`](docs/ADR/ADR-0001-viewer-image-rendering-authority.md)
- Detailed architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Execution contract: [`docs/SPEC/PicoView-v1.1.md`](docs/SPEC/PicoView-v1.1.md)
- Current state: [`CONTEXT.md`](CONTEXT.md)
- Operational sequencing: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Agent rules: [`AGENTS.md`](AGENTS.md)
- PocketJS source identity: [`POCKETJS.lock`](POCKETJS.lock)

Older authority documents and architecture/startup campaigns are frozen under [`docs/history/`](docs/history/) and are evidence/history only.

## Architecture in one sentence

> **PicoView decides which image, what the image means, and how the user wants to view it; PocketJS decides how an opaque image resource is rendered on the current graphics backend; large pixel data has one owner at a time, and every O(N pixels) movement must have a physical or semantic reason.**

The graphics path is GPU-first but not GPU-required: prefer a compatible low-power GPU where appropriate, fall back to a compatible discrete GPU, then to software rendering when necessary for correctness.

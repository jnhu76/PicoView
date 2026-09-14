# PicoView

PicoView is a fast, small, focused Windows 11 local image viewer built on PocketJS.

Responsibility chain: **Open → View → Inspect → Browse → Handle**. It is not an editor, photo library, cloud product, file manager, media database, or general-purpose asset platform.

## Current phase: PRODUCT IMPLEMENTATION

PocketJS has been accepted as PicoView's Windows UI/runtime/composition
foundation (owner decision `POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT`,
2026-09-14). Product implementation is authorized and underway.

- PocketJS dependency: pinned in [`POCKETJS.lock`](POCKETJS.lock) — the exact
  revision is the authority; branch names are informational.
- Architecture boundaries: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Execution plan: [`docs/ROADMAP.md`](docs/ROADMAP.md) — next slice
  **V1 — Open One Image** (V0 product shell skeleton is in place under
  [`guest/`](guest/)).
- History: the Architecture Phase A admission campaign and the
  startup-performance investigations are **frozen history**; their verdicts
  are immutable and indexed in
  [`docs/history/README.md`](docs/history/README.md). The startup campaign
  closed as `CLOSED_FOR_NOW` /
  `MEASUREMENT_SUFFICIENT_FOR_CURRENT_PRODUCT_BUILD` (PR #44) — performance
  work resumes only after a real viewer workload exists
  (`PICOVIEW-REAL-WORKLOAD-PERFORMANCE-1`, after ROADMAP V5).

Not claimed: performance solved, architecture optimal, or a final decoder
choice. WIC is the baseline decoder; all decoder/memory/GPU optimization is
deferred until real workload evidence exists.

Project authority lives in `docs/PRD/`, `docs/SPEC/`, accepted ADRs,
`docs/ARCHITECTURE.md`, `CONTEXT.md`, `docs/ROADMAP.md`, and `AGENTS.md`.

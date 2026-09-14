# PicoView History — Architecture Phase A & Startup-Performance Evidence

This file is an **index and boundary document**. It separates:

- **HISTORICAL EVIDENCE** — the frozen record of the PocketJS Windows
  architecture campaign and the startup-performance investigations. Their
  verdicts, numbers, and wording are **immutable**; they are never edited to
  match later events.
- **ACTIVE PRODUCT AUTHORITY** — `docs/PRD/`, `docs/SPEC/`, accepted ADRs,
  `docs/ARCHITECTURE.md`, `CONTEXT.md`, `docs/ROADMAP.md`, `POCKETJS.lock`,
  and the current execution issue. Only these govern current work.

## What is historical

- **Architecture Phase A (ARCH-A0 … ARCH-A7)** — the PocketJS Windows
  admission campaign: Windows stock target, native image-resource seam,
  JPEG/WIC path, zoom/pan proof, cancellation/resource bounds, Per-Monitor
  DPI V2, startup/package/memory/idle footprint. Complete.
- **GATE-A / GATE-A2** — the architecture admission gates. Their recorded
  verdicts (startup budgets not met; other lines passing) stand as written.
  This is **not** retroactively rewritten into a PASS.
- **Startup-performance campaigns and audits (C1 … C6, startup audits,
  cross-OS control, ETW/callpath work)** — the investigation that followed
  the GATE-A startup FAIL.
- **PR #44 / `docs/DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1.md`**
  — the **consolidated startup umbrella record**. Its final disposition is
  the historical closeout: `CLOSED_FOR_NOW` /
  `MEASUREMENT_SUFFICIENT_FOR_CURRENT_PRODUCT_BUILD`; no further PicoView
  startup experiments were scheduled.

## Owner decision recorded here for context

`POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT` (2026-09-14): the historical
admission/startup campaign is **closed with sufficient evidence to proceed
with product implementation**. PocketJS remains PicoView's Windows
UI/runtime/view foundation. Unresolved startup-performance questions are
**deferred until a real product workload exists**; they do not block product
implementation, and no historical GATE-A budget is retroactively claimed as
PASS.

## Evidence index (all paths under `docs/` unless noted)

| Artifact | What it is |
| --- | --- |
| `ARCH-A0-EVIDENCE.md` … `ARCH-A7-EVIDENCE.md` | Per-ticket Architecture Phase A evidence |
| `GATE-A-EVIDENCE.md` | First GATE-A execution record |
| `GATE-A2-EVIDENCE.md` | GATE-A re-execution record |
| `CORRECTIVE-C1-EVIDENCE.md` … `CORRECTIVE-C6-EVIDENCE.md` | Post-GATE-A corrective/performance campaign evidence |
| `DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1.md` | Consolidated startup umbrella record (PR #44) |
| `CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1.md` | Cross-OS startup control experiment |
| `STARTUP-LAST-MILE-REALITY-AUDIT-1.md` | Windows startup last-mile audit |
| `WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1.md` | Windows startup critical-path audit |
| `POCKETJS-BASELINE.md` | Frozen PocketJS **campaign** baseline (`pocket-stack/pocketjs` `a5a8535…`) — historical source identity |
| `BENCHMARK.md` | Measurement-semantics contract — retained as the authority for **any future measurement claim** (e.g. `PICOVIEW-REAL-WORKLOAD-PERFORMANCE-1`, GATE-B); not a current execution gate |
| `a2/`, `cross-os-normalized-desktop-startup-1/`, `desktop-startup-performance-experimental-record-1/`, `linux-startup-control-1-raw/` | Raw/bundled evidence attached to the reports above |
| `../experiments/phase-a-guest/` | Retired Phase-A experiment guest source (moved mechanically from `guest/`) |
| `../evidence/` | Historical benchmark working material |

## PocketJS source history

`jnhu76/pocketjs` carries `archive/picoview-20260914/*` refs preserving the
historical campaign patch series. These are **museum/history only** — never
an active dependency. The active dependency is pinned in `../POCKETJS.lock`.

## Rules

1. Historical evidence files are evidence, **not** current implementation
   authority. Do not consult them for "what should we build now" — use
   `docs/ROADMAP.md`.
2. Do not rewrite, re-derive, or "improve" historical verdicts, including
   the GATE-A startup FAIL and the `CLOSED_FOR_NOW` startup disposition.
3. New evidence documents are created only when a ticket's contract requires
   measurement, and then they follow `docs/BENCHMARK.md`.

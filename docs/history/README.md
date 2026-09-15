# PicoView History — Frozen Evidence and Superseded Authority

This directory contains **historical evidence and superseded authority**. Nothing here governs current implementation unless a current authority document explicitly re-adopts a fact.

Current authority lives outside `docs/history/`:

- Product: `docs/PRD/PicoView-PRD-v0.6.md`
- Architecture: `docs/ADR/` + `docs/ARCHITECTURE.md`
- Execution: `docs/SPEC/PicoView-v1.1.md`
- Operational state: `AGENTS.md`, `CONTEXT.md`, `docs/ROADMAP.md`
- PocketJS source identity: `POCKETJS.lock`

## Authority reset archive — 2026-09-15

`authority-reset-20260915/` freezes the documents that were active immediately before the Viewer / Image / Rendering architecture reset in #50 / PR #51:

- previous PRD v0.5;
- previous SPEC v1;
- previous `ARCHITECTURE.md`;
- previous `AGENTS.md`;
- previous `CONTEXT.md`;
- previous V0–V5 `ROADMAP.md`.

They are retained for provenance and comparison only. Do not use them to decide current boundaries merely because current code still resembles them.

## Architecture Phase A and startup-performance evidence

The following remain frozen historical evidence:

- **ARCH-A0 … ARCH-A7** — PocketJS Windows admission campaign;
- **GATE-A / GATE-A2** — historical architecture gate records;
- **CORRECTIVE-C1 … C6** and startup audits — post-gate investigation;
- **PR #44 / `DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1.md`** — historical startup closeout;
- associated raw evidence directories and experiment guests.

Historical verdicts are not rewritten to fit later architecture decisions.

## Evidence index

| Artifact | Historical role |
| --- | --- |
| `authority-reset-20260915/` | Superseded authority immediately before #50/#51 reset |
| `ARCH-A0-EVIDENCE.md` … `ARCH-A7-EVIDENCE.md` | Architecture Phase A evidence |
| `GATE-A-EVIDENCE.md` | First GATE-A record |
| `GATE-A2-EVIDENCE.md` | GATE-A re-execution |
| `CORRECTIVE-C1-EVIDENCE.md` … `CORRECTIVE-C6-EVIDENCE.md` | Corrective/performance campaign evidence |
| `DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1.md` | Consolidated startup record |
| `CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1.md` | Cross-OS control experiment |
| `STARTUP-LAST-MILE-REALITY-AUDIT-1.md` | Windows startup last-mile audit |
| `WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1.md` | Windows startup critical-path audit |
| `POCKETJS-BASELINE.md` | Historical campaign PocketJS source identity |
| `../BENCHMARK.md` | Current measurement-semantics authority; not historical architecture authority |
| `../experiments/phase-a-guest/` | Retired Phase-A experiment guest |
| `../evidence/` | Historical benchmark working material |

## Rules

1. `docs/history/` is not current Product, Architecture, Execution or Operational authority.
2. Do not silently revive superseded assumptions from archived PRD/SPEC/architecture documents.
3. Historical evidence may support factual claims about what happened, but not automatically prescribe what should be built now.
4. Current architecture differentials are adjudicated against current ADR/ARCHITECTURE, not against archived implementation assumptions.
5. Historical verdicts remain immutable as historical records.

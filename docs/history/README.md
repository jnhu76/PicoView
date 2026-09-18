# PicoView History Archive

**Everything under `docs/history/` is historical / non-normative evidence.**

These files may correctly describe:

- old SHAs
- old branch layouts
- superseded architecture
- temporary campaign rules
- removed module paths (for example `gpu.rs`, monolithic `current_item.rs`)
- obsolete dependency models (remote Cargo git revs, “no vendoring” eras)

Do **not** rewrite historical evidence into fake present-day history. Do **not** replace old SHAs with current SHAs inside archived documents.

---

## Current authority (not in this directory)

A new engineer should treat **only** these as current:

| Document | Role |
| --- | --- |
| `README.md` | Product entry point |
| `CONTEXT.md` | Current operational state |
| `AGENTS.md` | Agent engineering rules |
| `docs/ARCHITECTURE.md` | Program semantics / boundaries |
| `docs/ROADMAP.md` | Future sequencing |
| `docs/PRD/PicoView-PRD-v0.6.md` | Product authority |
| `docs/SPEC/PicoView-v1.1.md` | Execution contracts |
| `docs/ADR/` | Accepted architecture decisions |
| `docs/integration/POCKETJS.md` | PocketJS integration contract |
| `POCKETJS.lock` | Exact imported PocketJS revision |
| `docs/BENCHMARK.md` | Measurement semantics (still active) |

If answering a current-behavior question requires searching archived campaign evidence, check current authority/code first. Historical documents do not infer current behavior.

---

## Archive layout

| Path | Contents |
| --- | --- |
| `authority-reset-20260915/` | Superseded PRD/SPEC/ARCHITECTURE/AGENTS/CONTEXT/ROADMAP immediately before the viewer architecture reset (#50 / PR #51) |
| `architecture/` | ARCH-A0…A7 and GATE-A / GATE-A2 architecture campaign evidence |
| `corrective/` | CORRECTIVE-C1…C6, desktop/wgpu conformance cleanup, direct image admission migration, last-good publication evidence |
| `startup/` | Startup audits, cross-OS control experiment, desktop startup experimental record + raw-evidence directories |
| `mvp-2026-09/` | MVP-era product campaign evidence: V1 open-one-image, compose closeout specs, publication screenshots, historical PocketJS baseline |

Associated raw experiment material may also live under repository `experiments/` and `evidence/` paths; those are likewise non-normative.

---

## Rules

1. `docs/history/` is not current Product, Architecture, Execution, or Operational authority.
2. Do not silently revive superseded assumptions from archived documents.
3. Historical evidence may support factual claims about what happened; it does not prescribe what should be built now.
4. Current differentials are adjudicated against current ADR/ARCHITECTURE/SPEC and code, not archived campaign wording.
5. Historical verdicts remain immutable as historical records.
6. Active documents must not deep-link a moved historical path as if it were live authority.

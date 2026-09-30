---
stage: dedup-judge
total_findings_in: 13
working_set_size: 13
unparseable_locations: 0
multi_locations: 0
tier1_merges: 0
tier2_merges: 0
tier3_merges: 0
primaries_after_dedup: 13
related_groups: 3
---

# Dedup Summary

Threat model: REMOTE (per context.md). All 13 findings carried parseable `path:line`
locations and real (or explicitly file-level) function labels; no prior-pass
`merged_into`/`also_known_as` state existed, so this is a fresh pass.

## Location parse health
| Class | Count | Example IDs |
|-------|-------|-------------|
| parseable (`path:line`) | 13 | CARGOLINT-001, MSRV-001, RAWFD-001, SAFETYDOC-001..010 |
| markdown-link (recovered) | 0 | — |
| multi-location (skipped Tier 1) | 0 | — |
| unparseable (skipped Tier 1) | 0 | — |

## Tier 1 — exact-location same-class merges (deterministic)
| Primary | Merged IDs | Location |
|---------|------------|----------|
| — | — | No bucket held two findings of the same class at the same `(path, line)`. Note: CARGOLINT-001 and MSRV-001 both fall back to `Cargo.toml:1`, but the class-scoped key (`cargo-lint-config` vs `msrv-mismatch`) correctly kept them separate — a missing `[lints]` table is not a missing `rust-version`. |

## Tier 2 — same construct in same function (snippet-confirmed)
| Primary | Merged IDs | Function | Rationale |
|---------|------------|----------|-----------|
| — | — | — | Every `(path, function, bug_class)` bucket was a singleton; no candidate buckets existed. |

## Tier 3 — cross-class same-bug merges (LLM-confirmed)
| Primary | Merged IDs | Function | Merged classes | Rationale |
|---------|------------|----------|----------------|-----------|
| — | — | — | — | Only potential cross-class co-location was `register_associations` in `associations.rs` (RAWFD-001 `raw-fd-lifecycle` vs SAFETYDOC-004 `safety-doc`), but the two findings carry different normalized paths (`src/associations.rs` vs `native/src/associations.rs` — never merge across files) and, substantively, name two distinct invariants of the same block (handle leak on `?` early-return vs. missing SAFETY comment), not one defect labeled differently. Default: keep separate. |

## Tier 4 — Related (NOT merged — cross-reference only)
| Pattern | Finding IDs | Shared fix location |
|---------|-------------|---------------------|
| Undocumented unsafe boundary (missing `# Safety` doc / `// SAFETY:` comment) across the crate | SAFETYDOC-001, SAFETYDOC-002, SAFETYDOC-003, SAFETYDOC-004, SAFETYDOC-005, SAFETYDOC-006, SAFETYDOC-007, SAFETYDOC-008, SAFETYDOC-009, SAFETYDOC-010 | `native/src/associations.rs`, `native/src/app.rs`, `native/src/current_item/decode.rs`, `native/src/current_item/pressure_probe.rs` |
| Systemic gate gap: no `[lints]` escalation of `undocumented_unsafe_blocks`/`missing_safety_doc` would have enforced the SAFETYDOC family's discipline | CARGOLINT-001 (↔ all SAFETYDOC-*) | `native/Cargo.toml` |
| `register_associations` unsafe block: handle-leak defect and missing-safety-doc at the same block (leak also noted inside SAFETYDOC-004's analysis) | RAWFD-001 (↔ SAFETYDOC-004) | `native/src/associations.rs:148-168` |

## Bug-class counts (primaries only, after dedup)
| Bug class | Count |
|-----------|-------|
| safety-doc | 10 |
| cargo-lint-config | 1 |
| msrv-mismatch | 1 |
| raw-fd-lifecycle | 1 |

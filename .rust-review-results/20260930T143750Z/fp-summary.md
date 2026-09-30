---
stage: fp-judge
threat_model: REMOTE
primaries_evaluated: 13
true_positives: 12
likely_tp: 0
likely_fp: 0
false_positives: 0
out_of_scope: 1
---

# FP-Judge Summary

## Verdict counts (primaries)
| Verdict | Count |
|---------|-------|
| TRUE_POSITIVE | 12 |
| LIKELY_TP | 0 |
| LIKELY_FP | 0 |
| FALSE_POSITIVE | 0 |
| OUT_OF_SCOPE | 1 |

## Per-primary verdicts
| ID | Bug class | Verdict | Severity | Rationale |
|----|-----------|---------|----------|-----------|
| CARGOLINT-001 | cargo-lint-config | TRUE_POSITIVE | LOW | Verified: no `[lints]`, no deny/warn attrs, no clippy.toml, no workspace manifest despite 12+ unsafe sites; hardening gap |
| MSRV-001 | msrv-mismatch | TRUE_POSITIVE | LOW | Verified: no `rust-version` anywhere; edition 2024 + let-chains (app.rs:355, pressure_probe.rs:210) pin a >=1.88 floor; hardening gap |
| RAWFD-001 | raw-fd-lifecycle | OUT_OF_SCOPE | — | HKEY leak on `?` paths verified in code, but trigger is local `--register-associations` CLI + registry error — unreachable by the REMOTE attacker; one-shot exit reclaims handles |
| SAFETYDOC-001 | safety-doc | TRUE_POSITIVE | LOW | `set_sz` (associations.rs:99) lacks `# Safety`/SAFETY comment; HSTRING len+1 byte view verified sound; hardening gap |
| SAFETYDOC-002 | safety-doc | TRUE_POSITIVE | LOW | `set_none` (associations.rs:114) has purpose doc only, no safety contract; fixed inputs; hardening gap |
| SAFETYDOC-003 | safety-doc | TRUE_POSITIVE | LOW | `open_key` (associations.rs:126) undocumented; callers pass constant HKCU paths; hardening gap |
| SAFETYDOC-004 | safety-doc | TRUE_POSITIVE | LOW | register_associations unsafe block (associations.rs:148) has no adjacent SAFETY comment; sound today; hardening gap |
| SAFETYDOC-005 | safety-doc | TRUE_POSITIVE | LOW | unregister_associations unsafe block (associations.rs:183) carries policy prose only; hardening gap |
| SAFETYDOC-006 | safety-doc | TRUE_POSITIVE | LOW | `delete_value` (associations.rs:200) undocumented; fixed product paths; hardening gap |
| SAFETYDOC-007 | safety-doc | TRUE_POSITIVE | LOW | `delete_value_if_ours` (associations.rs:225) byte-view (`*mut u16 as *mut u8`) undocumented; len<=128/units<=64 arithmetic verified in-bounds; hardening gap |
| SAFETYDOC-008 | safety-doc | TRUE_POSITIVE | LOW | `GetSystemMetrics` block (app.rs:44) lacks SAFETY note; pointer-free query clamped by `.max(16)`; hardening gap |
| SAFETYDOC-009 | safety-doc | TRUE_POSITIVE | LOW | decode_wic (decode.rs:433) whole-body unsafe over attacker bytes with no SAFETY contract; sizing/lifetime invariants (decode_alloc_len 80M cap, stride u32 fit, stream body-lifetime) verified sound; hardening gap at the REMOTE-facing boundary |
| SAFETYDOC-010 | safety-doc | TRUE_POSITIVE | LOW | process_memory (pressure_probe.rs:58) EX→base struct pointer cast undocumented; repr(C) superset-prefix idiom verified sound; hardening gap |

## Common FP patterns observed
- No misreads found — every worker claim matched the code on inspection (all 13 premises verified against `native/`).
- Dominant pattern: the crate is hygiene-rich but gate-poor — sound, fixed-input unsafe blocks with zero `// SAFETY:`/`# Safety` documentation anywhere in `native/src` (rg-verified), and no `[lints]`/MSRV declaration to enforce it. All 10 SAFETYDOC findings + CARGOLINT-001 + MSRV-001 are latent hardening gaps, uniformly TRUE_POSITIVE + LOW per the hardening-gap rule.
- RAWFD-001 is the only substantive runtime defect (verified non-RAII HKEY ownership; `RegCloseKey(...).ok()?` strands earlier handles on error), but its only trigger is the local `--register-associations` CLI action plus a registry write error — outside the REMOTE threat model, so OUT_OF_SCOPE. Worth fixing for robustness (RAII HKEY guard) if the registration path is ever called in a loop.

## Areas that need deeper analysis
- None blocking. Optional human follow-up: adopt the CARGOLINT-001 `[lints]` escalation first — it mechanizes the entire SAFETYDOC family's discipline (deny `undocumented_unsafe_blocks`/`missing_safety_doc`), and an RAII HKEY guard resolves RAWFD-001 structurally if registration ever becomes loop-callable.

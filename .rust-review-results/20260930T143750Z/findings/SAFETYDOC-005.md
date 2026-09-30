---
id: SAFETYDOC-005
bug_class: safety-doc
title: unsafe block in unregister_associations lacks an adjacent SAFETY comment
location: native/src/associations.rs:183
function: unregister_associations
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: the unsafe block at associations.rs:183 has only product-policy comments, no SAFETY reasoning, and calls undocumented unsafe fns; constant paths keep it sound today, so a valid hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing SAFETY documentation at a constant-input registry block; no runtime defect at this revision - hardening-gap rule places it at LOW."
---

## Description
`unregister_associations` is a safe `pub fn` whose entire body is an `unsafe { ... }` block (lines 183-197) calling `RegDeleteTreeW` with a raw `HSTRING` pointer and two undocumented `unsafe fn`s (`delete_value`, `delete_value_if_ours`). There is no adjacent `// SAFETY:` comment. The ownership-guard reasoning (only clear extension defaults that currently name our ProgID) exists only in comments describing *product policy*, not the *memory/FFI safety* of the operations.

## Code
```rust
    unsafe {
        for ext in ASSOCIATED_EXTENSIONS {
            // Ownership guard: only clear the extension default when it is
            // ours (may_clear_extension_default); a foreign program's
            // default is never touched.
            delete_value_if_ours(&extension_default_path(ext));
            delete_value(&open_with_progids_path(ext), PROG_ID);
        }
        let prog = HSTRING::from(prog_id_path());
        let _ = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(prog.as_ptr()));
        ...
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary). All inputs are fixed product constants.

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). Reached from `main.rs:100` via `--unregister-associations`.

## Impact
No direct unsoundness (verified: constant paths, HSTRING live across each call, callee obligations currently upheld). Missing documentation means the safety obligations of the two callee `unsafe fn`s and the `RegDeleteTreeW` call are nowhere stated.

## Mitigations checked
- No `// SAFETY:` comment adjacent to the block; existing comments are product-policy prose, not safety reasoning.
- Callees lack `# Safety` sections (SAFETYDOC-006/007).
- No crate lint gate on undocumented unsafe.

## Recommendation
Add an inline `// SAFETY:` comment covering HSTRING liveness and callee-contract compliance, and document the callees' contracts (SAFETYDOC-006/007).

---
id: SAFETYDOC-002
bug_class: safety-doc
title: unsafe fn set_none lacks a # Safety contract
location: native/src/associations.rs:114
function: set_none
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: set_none at associations.rs:114 carries only a purpose doc comment, no # Safety section and no inline SAFETY comment; call sites pass fixed constants, so a valid hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing safety contract at a fixed-input FFI site; no runtime defect at this revision - hardening-gap rule places it at LOW."
---

## Description
`set_none` is an `unsafe fn` with no `/// # Safety` rustdoc section and no inline `// SAFETY:` comment on its `unsafe` block. The block calls `RegSetValueExW` with a raw `PCWSTR` derived from an `HSTRING`. The obligations the caller must uphold (valid open HKEY opened with KEY_WRITE; `name` a valid value-name string; HSTRING pointer valid for the call) are entirely undocumented. This is part of a crate-wide pattern: none of the five `unsafe fn`s in `associations.rs` carry the `# Safety` contract this pass requires.

## Code
```rust
/// OpenWithProgids membership: value name = ProgID, REG_NONE empty data.
unsafe fn set_none(key: HKEY, name: &str) -> anyhow::Result<()> {
    unsafe {
        use windows::Win32::System::Registry::REG_NONE;
        let hname = HSTRING::from(name);
        let status = RegSetValueExW(key, PCWSTR(hname.as_ptr()), Some(0), REG_NONE, Some(&[]));
        ...
```
Note the doc comment present (`/// OpenWithProgids membership...`) documents *purpose*, not *safety obligations* — it is not a `# Safety` section.

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary).

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). Reached only from `register_associations` with the fixed `PROG_ID` constant.

## Impact
No direct unsoundness: the site passes a fixed constant and an empty slice, verified sound. The hazard is the undocumented caller contract, which lets future call sites pass unvalidated key handles or names without a documented rule to check against.

## Mitigations checked
- No `# Safety` rustdoc, no inline `// SAFETY:` comment.
- No crate lints (`missing_docs`/`clippy::undocumented_unsafe_blocks`) configured; `Cargo.toml` has no `[lints]` table.

## Recommendation
Add a `/// # Safety` section listing the HKEY/KEY_WRITE and string-lifetime obligations, and an inline `// SAFETY:` comment explaining why this call site upholds them.

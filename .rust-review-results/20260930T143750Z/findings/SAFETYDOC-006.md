---
id: SAFETYDOC-006
bug_class: safety-doc
title: unsafe fn delete_value lacks a # Safety contract
location: native/src/associations.rs:200
function: delete_value
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: delete_value at associations.rs:200 is an unsafe fn with no # Safety doc and no inline SAFETY comment; called only with fixed product paths from unregister_associations, so a valid hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing safety contract at a fixed-input registry FFI site; no runtime defect at this revision - hardening-gap rule places it at LOW."
---

## Description
`delete_value` is a module-level `unsafe fn` with no `/// # Safety` rustdoc section and no inline `// SAFETY:` comment on its `unsafe` block. It opens a registry key via `RegOpenKeyExW` with raw `HSTRING`-derived `PCWSTR`s and deletes a value via `RegDeleteValueW`. The caller obligations (path/value-name are valid UTF-16-representable strings; the out key handle pointer is valid) are undocumented. Part of the crate-wide pattern: none of the five `unsafe fn`s in this module carries the contract this pass requires.

## Code
```rust
unsafe fn delete_value(path: &str, name: &str) {
    unsafe {
        ...
        let hpath = HSTRING::from(path);
        let hname = HSTRING::from(name);
        let mut key = HKEY::default();
        let status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(hpath.as_ptr()),
            Some(0),
            KEY_WRITE,
            &mut key,
        );
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary).

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). Called only from `unregister_associations` with fixed product paths and the `PROG_ID` constant.

## Impact
No direct unsoundness at current call sites (verified). The undocumented contract allows future misuse (e.g. deleting values under attacker-chosen key paths) without any documented rule.

## Mitigations checked
- No `# Safety` rustdoc, no inline `// SAFETY:` comment.
- No crate lint gate on undocumented unsafe.

## Recommendation
Add the `/// # Safety` section (valid HKCU-relative path, openable with KEY_WRITE; `name` a valid value name) and an inline `// SAFETY:` comment at the call block.

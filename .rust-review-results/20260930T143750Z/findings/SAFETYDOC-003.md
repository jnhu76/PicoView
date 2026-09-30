---
id: SAFETYDOC-003
bug_class: safety-doc
title: unsafe fn open_key lacks a # Safety contract
location: native/src/associations.rs:126
function: open_key
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: open_key at associations.rs:126 is an unsafe fn with no # Safety doc and no inline SAFETY comment; all callers pass constant HKCU product paths, so a valid hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing safety contract at a constant-input FFI site; no runtime defect at this revision - hardening-gap rule places it at LOW."
---

## Description
`open_key` is an `unsafe fn` with no `/// # Safety` rustdoc section and no inline `// SAFETY:` comment. Its `unsafe` block calls `RegCreateKeyExW` with a raw wide-string pointer built from `HSTRING::from(path)` and writes the resulting handle through `&mut key`. The caller obligations (path names a key under HKCU the user permits creating; the out-parameter pointer is valid for the duration) are undocumented. Same crate-wide pattern as SAFETYDOC-001/002: no `unsafe fn` in this module carries the required contract.

## Code
```rust
unsafe fn open_key(path: &str) -> anyhow::Result<HKEY> {
    unsafe {
        let hpath = HSTRING::from(path);
        let mut key = HKEY::default();
        let status = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(hpath.as_ptr()),
            ...
            &mut key,
            None,
        );
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary).

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). All call sites pass fixed `Software\Classes\...` paths built from product constants.

## Impact
No direct unsoundness at current call sites (verified: all callers pass constant product paths). Risk is the undocumented contract: a future caller could pass an arbitrary path and silently create registry keys anywhere under HKCU without any documented rule flagging it.

## Mitigations checked
- No `# Safety` rustdoc, no inline `// SAFETY:` comment.
- No crate lint gate on undocumented unsafe (`Cargo.toml` lacks a `[lints]` table).

## Recommendation
Add the `/// # Safety` contract (path must be an HKCU-relative key path; out-pointer valid) and an inline `// SAFETY:` comment; alternatively confine the function to `&'static str` paths to make the contract structural.

---
id: SAFETYDOC-001
bug_class: safety-doc
title: unsafe fn set_sz lacks a # Safety contract for its from_raw_parts byte view
location: native/src/associations.rs:99
function: set_sz
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: set_sz at associations.rs:99 is an unsafe fn with no # Safety doc and no inline SAFETY comment; the HSTRING len+1 byte-view invariant is currently sound, so this is a valid doc/hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing safety contract at a trusted-input FFI site; no runtime defect at this revision - hardening-gap rule places it at LOW."
---

## Description
`set_sz` is a `pub`(fn-private)-scoped `unsafe fn` with no `/// # Safety` rustdoc section. Its body performs the only raw-memory construction in the crate: `std::slice::from_raw_parts(hval.as_ptr() as *const u8, (hval.len() + 1) * 2)` over an `HSTRING` buffer. The soundness of that operation depends on a non-obvious external invariant — `HSTRING::len()` excludes the terminating NUL and the buffer always holds `len + 1` UTF-16 units, so `(len + 1) * 2` bytes exactly covers the initialized allocation — and none of that reasoning is written down. A future refactor (e.g. swapping `HSTRING` for a `Vec<u16>` built without a terminator, or changing the multiplier) would silently invalidate the slice contract with no documentation marking the hazard. The audit verified the invariant currently holds; the finding is the missing contract, which is the documentation rule this pass enforces.

## Code
```rust
unsafe fn set_sz(key: HKEY, name: &str, value: &str) -> anyhow::Result<()> {
    unsafe {
        let hname = HSTRING::from(name);
        let hval = HSTRING::from(value);
        let bytes =
            std::slice::from_raw_parts(hval.as_ptr() as *const u8, (hval.len() + 1) * 2);
        let status = RegSetValueExW(key, PCWSTR(hname.as_ptr()), Some(0), REG_SZ, Some(bytes));
        ...
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary).

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). The function is reached from `register_associations` (main.rs:95 `--register-associations` CLI action) with trusted inputs (`current_exe()`, fixed registry value names).

## Impact
No direct memory-unsafety today: the HSTRING buffer invariant was verified to hold (len excludes NUL; buffer = len+1 units; byte length exact). The missing `# Safety` contract removes the documentation that pins that invariant, so a maintenance change can silently produce an out-of-bounds `from_raw_parts` slice feeding `RegSetValueExW`.

## Mitigations checked
- No `/// # Safety` section exists on `set_sz` (verified by reading native/src/associations.rs:99-111).
- No `#![deny(missing_unsafe_docs)]` or `clippy::undocumented_unsafe_blocks` lint configuration in the crate (`Cargo.toml` has no `[lints]` table; no clippy.toml in repo).
- The unsafe block inside the fn also carries no inline `// SAFETY:` comment.
- `debug_assertions`: not relevant (documentation finding).

## Recommendation
Add a `/// # Safety` section to `set_sz` naming the caller obligations (key must be a valid open HKEY with KEY_WRITE; `value` length must stay within REG_SZ limits) plus an inline `// SAFETY:` comment documenting the HSTRING `len + 1` unit buffer layout that justifies the exact byte length passed to `from_raw_parts`. Prefer replacing the raw slice with a checked construction (e.g. build the UTF-16 bytes via `value.encode_utf16()` into a `Vec<u8>` with `u16::to_ne_bytes`) so the unsafe block disappears.

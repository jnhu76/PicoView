---
id: SAFETYDOC-007
bug_class: safety-doc
title: unsafe fn delete_value_if_ours lacks a # Safety contract for its byte-view buffer logic
location: native/src/associations.rs:225
function: delete_value_if_ours
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: delete_value_if_ours at associations.rs:225 does the *mut u16 as *mut u8 byte view with no # Safety doc and no inline SAFETY comment; the len<=128/units<=64 arithmetic is sound at this revision (RegQueryValueExW caps len at the supplied 128 bytes), so a valid hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Undocumented byte-view over same-user registry data; buffer arithmetic verified in-bounds today, so only the missing contract remains - hardening-gap rule places it at LOW."
---

## Description
`delete_value_if_ours` is an `unsafe fn` — and the one unsafe boundary in the crate that reads *externally stored data* (an HKCU registry value written by any same-user process) back into memory — with no `/// # Safety` rustdoc section and no inline `// SAFETY:` comment. Its `unsafe` block passes `buf.as_mut_ptr() as *mut u8` (a `*mut u16` buffer reinterpreted as bytes) to `RegQueryValueExW`, then interprets the returned byte count as UTF-16 units. The invariants that make this sound — `len` is bounded by the API at the initially supplied 128 bytes, `buf` holds 128 initialized bytes, `units = len/2` floors to at most 64, the `saturating_sub(1)` removes the NUL — are exactly the kind of reasoning a `# Safety` contract must record, and none of it is written down. The audit verified the arithmetic is currently sound; the finding is the missing contract.

## Code
```rust
        let mut buf = [0u16; 64];
        let mut len = (buf.len() * 2) as u32;
        let mut ty = REG_SZ;
        let q = RegQueryValueExW(
            key,
            PCWSTR::null(),
            None,
            Some(&mut ty),
            Some(buf.as_mut_ptr() as *mut u8),
            Some(&mut len),
        );
        if q == ERROR_SUCCESS && ty == REG_SZ {
            let units = (len as usize / 2).saturating_sub(1);
            let value = String::from_utf16_lossy(&buf[..units]);
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary). (The registry value read here is same-user-writable — attacker influence is LOCAL-model territory — but the buffer arithmetic was verified in-bounds for any value the API can return.)

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). Called from `unregister_associations` for the four `ASSOCIATED_EXTENSIONS` default values.

## Impact
No direct unsoundness: verified `len ≤ 128` (API contract), `units ≤ 64 ≤ buf.len()`, odd byte counts floor via integer division, and `from_utf16_lossy` cannot fail. The hazard is that this externally-fed byte-level reinterpretation carries zero documentation, so a buffer-size change or unit arithmetic edit can silently produce an out-of-bounds slice of registry-controlled data.

## Mitigations checked
- No `# Safety` rustdoc, no inline `// SAFETY:` comment.
- No crate lint gate on undocumented unsafe (`Cargo.toml` has no `[lints]` table; no clippy.toml).
- Bounds arithmetic verified sound at this revision (buf 128 bytes; API caps `len` at the supplied size).

## Recommendation
Add the `/// # Safety` contract and an inline `// SAFETY:` comment documenting the `*mut u16 as *mut u8` byte view and the `len ≤ buf byte-size` invariant. Better: keep the buffer as `&mut [u8]` via `bytemuck`-free construction (e.g. `unsafe`-free two-phase query: query size, then read into a `Vec<u8>`, then interpret UTF-16 with `u16::from_le_bytes` pairs), eliminating the pointer cast.

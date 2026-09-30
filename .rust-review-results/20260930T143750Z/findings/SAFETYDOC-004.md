---
id: SAFETYDOC-004
bug_class: safety-doc
title: unsafe block in register_associations lacks an adjacent SAFETY comment
location: native/src/associations.rs:148
function: register_associations
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: the unsafe block at associations.rs:148 has no adjacent SAFETY comment and defers to undocumented callee contracts; no unsoundness at this revision (note the separate handle-leak defect is RAWFD-001, judged OUT_OF_SCOPE under REMOTE), so a valid hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing SAFETY documentation at a trusted-input registry block; no runtime defect at this revision - hardening-gap rule places it at LOW."
---

## Description
`register_associations` is a safe `pub fn` containing a large `unsafe { ... }` block (lines 148-173) that opens four-plus registry keys, writes REG_SZ/REG_NONE values, and closes handles — with no adjacent `// SAFETY:` comment explaining why the block is sound. Soundness here depends on: every called `unsafe fn` (`open_key`, `set_sz`, `set_none`) upholding its (undocumented — see SAFETYDOC-001/002/003) contract; every successfully opened key being closed exactly once on both the success and early-return (`?`) paths; and HSTRING pointers living across each call. None of this is documented. Note the error paths leak HKEYs (early `?` return after `open_key` succeeds skips the `RegCloseKey` calls) — a leak, not unsoundness, but exactly the kind of invariant a SAFETY comment would force the author to reason about.

## Code
```rust
    unsafe {
        let prog = open_key(&prog_id_path())?;
        set_sz(prog, "", PROG_ID_DESC)?;
        let icon_key = open_key(&default_icon_path())?;
        set_sz(icon_key, "", &icon_value_for(&exe_str))?;
        RegCloseKey(icon_key).ok()?;
        let cmd_key = open_key(&shell_command_path())?;
        set_sz(cmd_key, "", &shell_command_for(&exe_str))?;
        RegCloseKey(cmd_key).ok()?;
        RegCloseKey(prog).ok()?;
        ...
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary). Inputs are `current_exe()` and fixed product constants.

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). Reached from `main.rs:95` via the `--register-associations` shell action.

## Impact
No direct memory-unsafety (verified: fixed registry paths, exact-length HSTRING byte views, each key closed once on the success path). The missing documentation leaves the key-lifetime and unsafe-fn-contract obligations implicit, where a refactor can break them silently.

## Mitigations checked
- No `// SAFETY:` comment adjacent to the block.
- The nested `unsafe fn`s themselves lack `# Safety` sections, so the block cannot defer to any documented contract.
- No crate lint (`clippy::undocumented_unsafe_blocks`) configured.

## Recommendation
Add an inline `// SAFETY:` comment stating that all operations use constants/`current_exe`-derived strings with valid HSTRING backing and that each opened key is closed exactly once; ideally wrap HKEYs in a drop-guard RAII type so early `?` returns cannot leak handles, which also shrinks the unsafe surface.

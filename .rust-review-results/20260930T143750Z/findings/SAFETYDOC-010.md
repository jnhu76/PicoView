---
id: SAFETYDOC-010
bug_class: safety-doc
title: unsafe block in process_memory lacks SAFETY comment for the PROCESS_MEMORY_COUNTERS_EX pointer cast
location: native/src/current_item/pressure_probe.rs:58
function: process_memory
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: pressure_probe.rs:58 casts *mut PROCESS_MEMORY_COUNTERS_EX to *mut PROCESS_MEMORY_COUNTERS with cb set to the full EX size, no SAFETY comment; the repr(C) superset-prefix idiom is sound at this revision, so a valid hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing SAFETY note on a self-process probe with no attacker data flow; layout idiom verified sound - hardening-gap rule places it at LOW."
---

## Description
`process_memory` is a safe `fn` whose `unsafe` block performs the crate's only pointer-type reinterpretation of a struct: `&mut counters as *mut PROCESS_MEMORY_COUNTERS_EX as *mut PROCESS_MEMORY_COUNTERS` passed to `GetProcessMemoryInfo` with `cb = size_of::<PROCESS_MEMORY_COUNTERS_EX>()`. There is no `// SAFETY:` comment. Soundness depends on the Windows contract that `PROCESS_MEMORY_COUNTERS_EX` is a field-superset of `PROCESS_MEMORY_COUNTERS` (adds trailing `PrivateUsage`), both `#[repr(C)]` in the `windows` crate, so reading through the base-struct pointer into the larger buffer is a valid prefix view — non-obvious reasoning that belongs in the mandated documentation.

## Code
```rust
    let mut counters = PROCESS_MEMORY_COUNTERS_EX::default();
    counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
    let ok = unsafe {
        GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters as *mut PROCESS_MEMORY_COUNTERS_EX as *mut PROCESS_MEMORY_COUNTERS,
            counters.cb,
        )
    };
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary). The probe is opt-in evidence tooling behind an env gate and `#[ignore]` test attribute, but it is production-reachable code in the crate.

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). Reached from the opt-in `decode_pressure_gate` test.

## Impact
No unsoundness: verified the cast is the documented Win32 idiom (EX struct is a repr(C) superset; `cb` announces the full EX size which is ≥ sizeof(PROCESS_MEMORY_COUNTERS), the API's minimum). The missing documentation leaves the prefix-layout assumption unstated — e.g. if `cb` were set to the smaller struct's size while reading EX fields afterwards, `PrivateUsage` would be stale/uninitialized with no comment flagging the coupling.

## Mitigations checked
- No `// SAFETY:` comment adjacent to the block.
- Both struct types come from the `windows` crate (upstream `#[repr(C)]`; outside finding scope) — the local code supplies no layout documentation of its own.
- No crate lint gate on undocumented unsafe.

## Recommendation
Add an inline `// SAFETY:` comment stating that `PROCESS_MEMORY_COUNTERS_EX` is a `#[repr(C)]` superset of `PROCESS_MEMORY_COUNTERS`, `cb` is set to the full EX size (≥ the API's minimum), so the base-struct pointer view is a valid prefix read.

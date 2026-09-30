---
id: SAFETYDOC-008
bug_class: safety-doc
title: unsafe block in app_window_icon lacks an adjacent SAFETY comment
location: native/src/app.rs:44
function: app_window_icon
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: app.rs:44 unsafe { GetSystemMetrics(SM_CXSMICON) } has no adjacent SAFETY comment; the call is a pointer-free metric query with the 0-result clamped by .max(16), so a valid hardening gap."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing one-line SAFETY note on a pointer-free metric query; no runtime defect - hardening-gap rule places it at LOW."
---

## Description
`app_window_icon` is a safe `fn` whose `unsafe { GetSystemMetrics(SM_CXSMICON) }` block carries no adjacent `// SAFETY:` comment. The Win32 requirement (the call is thread-safe and needs no special apartment, result may be 0 on failure — handled by `.max(16)`) is trivial but unstated, and this is one of only three `unsafe` blocks in safe (non-`unsafe fn`) production code in the crate, all of which lack the comment this pass requires.

## Code
```rust
    let size = unsafe { GetSystemMetrics(SM_CXSMICON) }.max(16) as u32;
    winit::window::Icon::from_resource(1, Some(PhysicalSize::new(size, size))).ok()
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow; documentation contract missing at an unsafe boundary).

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). Window-thread startup path.

## Impact
No unsoundness: `GetSystemMetrics` is a pure metric query with no pointer arguments; the 0-on-failure result is defensively clamped to 16. The finding is purely the missing documentation, which this pass mandates for every unsafe block in safe code.

## Mitigations checked
- No `// SAFETY:` comment adjacent to the block.
- No crate lint (`clippy::undocumented_unsafe_blocks`) configured.

## Recommendation
Add a one-line `// SAFETY: GetSystemMetrics is a thread-safe metric query with no pointer arguments` comment.

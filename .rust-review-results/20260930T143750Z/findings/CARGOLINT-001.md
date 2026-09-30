---
id: CARGOLINT-001
bug_class: cargo-lint-config
title: No [lints] escalation of clippy::undocumented_unsafe_blocks despite 13 unsafe FFI sites
location: Cargo.toml:1
function: (file-level)
confidence: High
worker: worker-11
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: native/Cargo.toml has no [lints] table, no #![deny/warn] attrs in src, no clippy.toml, no workspace manifest, and 12+ unsafe sites exist; valid hardening gap, not a misread."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing lint escalation is a latent hygiene gap with zero runtime effect at this revision; hardening-gap rule places it at LOW."
---

## Description
The crate contains 13 `unsafe` sites spanning three Win32 FFI surfaces — the Windows registry
(`native/src/associations.rs`, 12 `unsafe fn`/`unsafe` blocks), WIC/COM image decoding
(`native/src/current_item/decode.rs:433`), process-status probes (`native/src/current_item/pressure_probe.rs:58`),
and a `GetSystemMetrics` call (`native/src/app.rs:44`) — yet the manifest declares no `[lints]`
section, no workspace `Cargo.toml` exists (checked; `/Cargo.toml` is absent), there is no
`clippy.toml`, and no `#![deny(...)]`/`#![warn(...)]` crate attribute appears anywhere under
`native/src`. As a result `clippy::undocumented_unsafe_blocks` (allow-by-default) never fires, so
`unsafe` blocks may be added without a `// SAFETY:` justification and no build or CI gate will
object. `clippy::missing_safety_doc` is warn-by-default but is likewise not escalated to `deny`,
so its warnings can be ignored without failing a build.

Per the finder's gates: `deny(unsafe_code)` is NOT recommended — this crate legitimately uses
`unsafe`, and denying it would break the build. The relevant, code-conditioned gap is the
non-escalation of `clippy::undocumented_unsafe_blocks` (and `missing_safety_doc`) for a crate that
contains `unsafe`.

## Code
```toml
# native/Cargo.toml — complete manifest; no [lints] table anywhere in it
[package]
name = "picoview"
version = "0.1.0"
edition = "2024"
license = "MIT"
description = "PicoView native host: Current Item authority, WIC baseline decode, PocketJS presentation"

[[bin]]
name = "picoview"
path = "src/main.rs"
# ... dependencies follow; no [lints] section exists
```

```rust
// One of the 13 unaudited-by-lint unsafe sites (native/src/associations.rs:99)
unsafe fn set_sz(key: HKEY, name: &str, value: &str) -> anyhow::Result<()> {
    unsafe {
        let hval = HSTRING::from(value);
        let bytes =
            std::slice::from_raw_parts(hval.as_ptr() as *const u8, (hval.len() + 1) * 2);
        // ...
    }
    Ok(())
}
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow).

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). The hygiene gap applies to every
future or existing `unsafe` block in the crate; with the lint unset, a block added without a
`// SAFETY:` comment compiles cleanly in normal development and CI.

## Impact
Security-review and regression hygiene only: nothing at runtime changes. The practical effect is
that the invariant documentation discipline the codebase otherwise follows (most existing blocks do
carry justification comments) is unenforced — a future `unsafe` block without a `// SAFETY:`
rationale passes the build silently, which is where FFI soundness bugs (wrong buffer lengths,
handle misuse) historically enter Win32-heavy crates.

## Mitigations checked
- `rg 'unsafe_code|missing_docs|warnings'` over the crate and manifest: zero matches — no lint config exists.
- No workspace manifest at the repository root (`/Cargo.toml` absent), so no `[workspace.lints]` can inherit.
- No `clippy.toml`, no `rust-toolchain.toml`, no `#![deny]`/`#![warn]` attributes in any `native/src/**/*.rs`.
- `deny(unsafe_code)` correctly absent — crate contains `unsafe` (finder FP rule honored).

## Recommendation
Add to `native/Cargo.toml`:

```toml
[lints.clippy]
undocumented_unsafe_blocks = "deny"
missing_safety_doc = "deny"
```

Do not add `unsafe_code = "deny"` (the crate legitimately contains `unsafe` and would stop
compiling). Optionally add `#[deny(unsafe_op_in_unsafe_fn)]` via `[lints.rust]` since
`associations.rs` defines nested `unsafe fn` items that re-`unsafe {}` internally today.

---
id: MSRV-001
bug_class: msrv-mismatch
title: No rust-version (MSRV) declared while edition 2024 and let-chains pin the real toolchain floor
location: Cargo.toml:1
function: (file-level)
confidence: High
worker: worker-11
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: no rust-version anywhere in the repo; edition 2024 plus let-chains confirmed at app.rs:355 and pressure_probe.rs:210 pin a >=1.88 floor; valid hardening gap, not a misread."
severity: LOW
attack_vector: Local
exploitability: Theoretical
severity_rationale: "Missing MSRV declaration is a build/reproducibility hygiene gap with no runtime or attacker-reachable effect; hardening-gap rule places it at LOW."
---

## Description
`native/Cargo.toml` declares no `rust-version` field (finder gate 1). The crate is not
MSRV-neutral: it sets `edition = "2024"` (floor: Rust 1.85) and its code uses let-chains — e.g.
`native/src/app.rs:355` `if self.failure.is_some() && let Some(event_loop) = event_loop` and
`native/src/current_item/pressure_probe.rs:210`
`if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) && value.get("t")...` —
which stabilized with the 2024 edition (Rust 1.88). The effective toolchain floor is therefore
>= 1.88, but nothing in the manifest records it.

Because `rust-version` is absent, Cargo's resolver cannot honor an MSRV when selecting dependency
versions (`wgpu = "25"`, `winit = "0.30"`, `windows = "0.62"`, `rfd = "0.15"`), so a contributor on
an older-but-plausible toolchain gets opaque dependency-resolution or language-feature errors
instead of a clear "requires Rust >= X" message, and no `cargo +<msrv> check` pin is possible
because no MSRV is declared. For a released product (v0.1.0) the undeclared floor also risks a
reproducible-release gap: the toolchain that built the shipped binary is not recorded in the
manifest.

## Code
```toml
# native/Cargo.toml — [package] section; note the absence of `rust-version`
[package]
name = "picoview"
version = "0.1.0"
edition = "2024"
license = "MIT"
description = "PicoView native host: Current Item authority, WIC baseline decode, PocketJS presentation"
```

```rust
// native/src/app.rs:355 — let-chain syntax (stable only since the 2024 edition / Rust 1.88)
if self.failure.is_some()
    && let Some(event_loop) = event_loop
{
    event_loop.exit();
}
```

## Data flow
N/A — file-level finding (no attacker-controlled data flow).

## Reachability trace
N/A — file-level finding (no attacker-controlled data flow). Verified conditions: `rg 'rust-version'`
over `native/Cargo.toml` returns nothing; no `rust-toolchain.toml` exists in `native/` or at the
repository root; the let-chain constructs cited above are in non-test production code
(`app.rs` `Host::try_send_input`, `pressure_probe.rs` `drive_tick`).

## Impact
Build/reproducibility robustness, not runtime security. A toolchain below the effective floor
fails with confusing errors (or, worse, resolves older dependency versions before hitting the
edition/let-chain error), and CI cannot enforce the real floor because no floor is declared.
No memory-safety or remote-attack consequence.

## Mitigations checked
- `rust-version` absent from the manifest (the finder's gate 1 hit directly).
- No `rust-toolchain.toml` / `rust-toolchain` file anywhere in the repo (checked both `native/` and root).
- No CI-level MSRV pin was found inside `native/` (the repo has no `.cargo/config.toml` under `native/`).
- Edition 2024 + let-chains observed in production source, so this is not a hypothetical floor.

## Recommendation
Declare the floor explicitly: `rust-version = "1.88"` (or the lowest release actually verified)
in `[package]`, and pin CI with `cargo +1.88 check`. Keep the value in sync with any future
language-feature adoption.

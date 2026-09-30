---
stage: final-report
threat_model: REMOTE
severity_filter: medium
total_primaries: 13
gate_findings_medium_or_above: 0
true_detections_below_gate: 12
out_of_scope_true_detections: 1
audited_sha: 9f506c4b1ebd50643d10a203e07882415c1ab5d8
corrective_pass: 2026-10-01
---

# Rust Security Review — Final Report (corrective pass applied 2026-10-01)

## 1. Audit identity (pinned)

| Field | Value |
|---|---|
| Repository | `github.com/jnhu76/PicoView` (local tree at `native/`) |
| AUDIT_SHA (tree the review ran against) | `9f506c4b1ebd50643d10a203e07882415c1ab5d8` (`main`) |
| Audit run timestamp | `2026-09-30T14:37:50Z` (artifacts directory name) |
| Toolchain at audit | rustc/cargo 1.97.1 (2026-07-14), edition 2024, no `rust-version` declared at audit time |
| Scope | PicoView-owned Rust only: the single crate `picoview` under `native/` (18 `.rs` files, `build.rs`, two examples). `third_party/pocketjs` and `guest/` were read-only context, never finding targets. |
| Threat model | REMOTE — the attacker controls malicious/untrusted image bytes and directory contents |
| Reporting threshold | Medium+ (findings below Medium are recorded here but are not release-gating) |

**Provenance correction (defect AUDIT-SHA, fixed by this pass):** the original
artifacts did not pin the audited commit. `9f506c4b…` is reconstructed from
evidence: the last commit before the run was `9f506c4b` (2026-09-20), the run
directory was created 2026-09-30, the working tree contained no modifications
besides the artifacts themselves, and every finding's cited line numbers match
this tree exactly. The original audit was NOT performed on the post-correction
code; §6 distinguishes the corrective SHAs.

## 2. Exact top-level claim

Under the frozen REMOTE threat model and the Medium+ reporting threshold, this
audit found **no surviving Medium+ finding in PicoView-owned Rust code**
(`native/`).

That statement is strictly narrower than "PicoView is secure / clean / memory
safe", and this audit does NOT claim that no defects exist:

- 12 true LOW hardening detections were made (§4.1, §4.2);
- 1 true handle-lifetime defect was found, classified outside the REMOTE
  threat model, and subsequently fixed (RAWFD-001, §4.3);
- PicoView's inherited attack surface is not proved safe by this audit (§3);
- the findings below threshold are real; they were filtered from the release
  gate by the declared threshold, not dismissed.

## 3. Inherited / external trust boundaries (not covered by this audit)

This audit reviewed PicoView-owned Rust only. The following boundaries were
consumed as trusted; **no claim in this report extends to them**, and this
source audit did not prove any of them safe:

- **Windows Imaging Component (WIC) and installed codecs.** Hostile encoded
  images are parsed by Windows codec implementations outside PicoView's code.
  The review covered `decode_wic`'s PicoView-owned glue — buffer sizing,
  pointer/COM lifetimes, bounds — and verified it at AUDIT_SHA. WIC and codec
  internals were not audited; a hostile image could still trigger defects in
  system codecs. Process-isolation/sandboxing of decode was not evaluated.
- **windows-rs bindings and Win32/COM APIs.** Bindings were treated as
  correct wrappers; the underlying API contracts were checked only at the
  call sites reviewed.
- **wgpu / winit / rfd.** Graphics, windowing, and file-dialog dependencies
  are consumed at their Cargo.lock versions; their internals were not
  reviewed.
- **PocketJS** (`third_party/pocketjs` subtree at `POCKETJS.lock`).
  Upstream-reviewed snapshot treated as a trusted peer component; guest/native
  message bounds were assumed per architecture, not fuzz-verified.

## 4. Findings — all 13 primaries, none release-gating

### 4.1 HARDENING-UNSAFE-PROOF-OBLIGATION — one systemic finding

**Supersedes SAFETYDOC-001..010 and CARGOLINT-001** (traceability: original
per-site files remain under `findings/`, unchanged; this representation
replaces them in the gate narrative without rewriting history).

Classification: one systemic gap, not multiple independent security defects.
At AUDIT_SHA every unsafe site was individually verified sound; the defect was
that **no site carried a local SAFETY contract and no gate enforced one**, so
the soundness had no durable proof obligation attached.

Site inventory at AUDIT_SHA (all sound, none documented):

| Site | Kind | Original finding |
|---|---|---|
| `src/associations.rs:99` `set_sz` | `unsafe fn` | SAFETYDOC-001 |
| `src/associations.rs:114` `set_none` | `unsafe fn` | SAFETYDOC-002 |
| `src/associations.rs:126` `open_key` | `unsafe fn` | SAFETYDOC-003 |
| `src/associations.rs:148` register body | `unsafe {}` | SAFETYDOC-004 |
| `src/associations.rs:183` unregister body | `unsafe {}` | SAFETYDOC-005 |
| `src/associations.rs:200` `delete_value` | `unsafe fn` | SAFETYDOC-006 |
| `src/associations.rs:225` `delete_value_if_ours` | `unsafe fn` | SAFETYDOC-007 |
| `src/app.rs:44` `GetSystemMetrics` | `unsafe {}` | SAFETYDOC-008 |
| `src/current_item/decode.rs:433` `decode_wic` body | `unsafe {}` (attacker bytes) | SAFETYDOC-009 |
| `src/current_item/pressure_probe.rs:58` memory counters | `unsafe {}` | SAFETYDOC-010 |
| `Cargo.toml` — no `[lints]` enforcement | manifest | CARGOLINT-001 |

Two factual corrections to the original findings, made by the independent
corrective review: `pressure_probe` is `#[cfg(test)]`-gated (the original
findings called it production code), and the "13 unsafe sites" count is
methodology-dependent (10 fn/block declarations in scope at AUDIT_SHA, of
which 9 are non-test production code; the count including inner blocks
differs). Neither changes the systemic conclusion.

Resolution (corrective pass): every site now documents its concrete invariant
(pointer validity/lifetime, buffer byte lengths, UTF-16 termination, COM/WIC
contracts, repr(C) layout prefixing, handle ownership); the broad `unsafe fn`
helpers in `associations.rs` became safe functions over an RAII guard with
minimum-sized `unsafe {}` blocks; and the obligation is mechanized by
`[lints.rust] unsafe_op_in_unsafe_fn = "deny"` +
`[lints.clippy] undocumented_unsafe_blocks = "deny"`.
`missing_safety_doc` was deliberately **not** adopted: it covers public
`unsafe fn` only and this crate has none, so it would be a gate that fires
nowhere.

### 4.2 MSRV-001 — no `rust-version` declared (LOW; build-contract defect, not a security vulnerability)

Confirmed: at AUDIT_SHA the manifest declared no `rust-version` while the
crate was not MSRV-neutral. One factual correction to the original finding:
its second production-code citation, `pressure_probe.rs:210`, is
`#[cfg(test)]`-only; the production let-chain at `app.rs` (try_send_input)
pins the language floor alone. Resolution: `rust-version = "1.89"` — the
empirically verified build floor. The language floor is 1.88 (edition 2024 +
let-chains), but the locked dependency graph dominates it: `cargo +1.88.0
check` fails resolution (`cosmic-text 0.19.0`, `smol_str 0.3.6` require
rustc 1.89), and `cargo +1.89.0 check` succeeds. Declaring 1.88 would have
reproduced exactly the confusing-failure experience the finding warns about.

### 4.3 RAWFD-001 — HKEY lifetime (true engineering defect; out of the REMOTE threat model; fixed)

Confirmed in code at AUDIT_SHA (`src/associations.rs:148-173`):
`register_associations` closed its four `RegCreateKeyExW` handles only via
`RegCloseKey(...).ok()?` on the success path, so every `?` early-return
stranded all previously opened handles, and a failed close aborted remaining
cleanup. Classified on two independent dimensions:

- **A. Engineering correctness (resource lifetime): real defect.** Manual,
  non-RAII handle ownership leaked up to three keys plus one loop iteration
  key per failed registration run.
- **B. Exploitability under the frozen REMOTE model: none.** The only trigger
  is the local `--register-associations` CLI action plus a registry write
  failure; no attacker capability reaches it, and the one-shot process exit
  lets the OS reclaim all handles. Under a LOCAL_UNPRIVILEGED model this
  would rate no higher than LOW.

"OUT_OF_SCOPE for REMOTE" does not erase dimension A; the corrective pass
fixed it. The unregister helpers (`delete_value`, `delete_value_if_ours`)
were verified leak-free at AUDIT_SHA and were not structurally changed.

Resolution: an `OwnedKey` RAII guard now owns every acquired `HKEY` from the
moment of acquisition; `Drop` is the single close on success and on every
failure path; close failures are deliberately not error-propagated (the old
`.ok()?` abort-remaining-cleanup behavior was itself the leak contributor).
A real-hive smoke test covers create → drop → recreate → cleanup.

## 5. Severity distribution (detected)

| Verdict | Count | Gate-relevant (Medium+ under REMOTE) |
|---|---|---|
| TRUE_POSITIVE, LOW hardening | 12 | no |
| OUT_OF_SCOPE (true local defect, REMOTE-unreachable) — fixed by corrective pass | 1 | no |
| **Medium+ surviving** | **0** | — |

## 6. Corrective pass (2026-10-01) — scope, commits, validation

Corrective commits on top of AUDIT_SHA (all applied to `native/`, no
`third_party/pocketjs` changes, no unrelated refactoring):

- `a2d43e8` — fix(associations): RAII HKEY guard (RAWFD-001)
- `9782006` — fix(native): SAFETY proof obligations + `[lints]` gate
- `a855a8b` — build(native): `rust-version = "1.89"` (MSRV-001)
- `(this commit)` — docs(audit): this report + corrected `REPORT.sarif`

Validation (native Windows, x86_64-pc-windows-msvc; the crate is
Windows-only by declaration, so Linux validation would prove nothing about
the Windows FFI surface):

```text
toolchain: rustc 1.98.1 (48a229cea 2026-09-01) / cargo 1.98.1,
x86_64-pc-windows-msvc, native Windows (the crate is Windows-only by
declaration, so Linux validation would prove nothing about the Windows
FFI surface). Guest artifacts built via scripts/build-guest.ps1 first.

cargo fmt --check
    fails on PRE-EXISTING baseline findings only (build.rs, examples/,
    pre-existing import order, ...). Verified identical findings exist
    on the untouched baseline; every region changed by this pass is
    rustfmt-clean.
cargo check
    PASS (exit 0)
cargo test
    PASS - 108 tests run: 107 passed, 0 failed, 1 ignored (the opt-in
    PICOVIEW_PRESSURE_PROBE evidence tool, ignored by design). The new
    OwnedKey lifetime smoke test runs in the 107.
cargo clippy --all-targets --all-features   (the new [lints] gate)
    PASS - 0 findings for undocumented_unsafe_blocks and
    unsafe_op_in_unsafe_fn across all targets.
cargo clippy --all-targets --all-features -- -D warnings
    fails with 15 (bin) / 27 (test profile) PRE-EXISTING baseline
    findings (collapsible_if, redundant_closure, doc-list indentation,
    field_reassign_with_default, ...), each verified by location to sit
    outside this pass's files/regions; the baseline was never
    -D-warnings-clean. Not fixed here: unrelated normalization.
cargo +1.88.0 check
    FAILS at dependency resolution: cosmic-text 0.19.0 and smol_str
    0.3.6 require rustc 1.89 (proves the 1.88 language floor is
    dominated by the lock).
cargo +1.89.0 check
    PASS (exit 0) - proves rust-version = "1.89" is buildable.
```

Pre-existing, out-of-scope debt found during validation (NOT introduced and
NOT silently ignored): `cargo fmt --check` and `cargo clippy … -- -D
warnings` fail on the **baseline tree** as well (rustfmt-style and
warning-level clippy findings across files this pass never touches, e.g.
`build.rs`, `examples/`, `browse_session.rs`, `runtime.rs`). All of this
pass's own files and regions are clean under both, and the new unsafe
proof-obligation gate passes with zero findings. Fixing the baseline is
repository normalization, outside this corrective pass's confirmed scope.

## 7. Audit method, provenance, and limitations

- **Mechanism.** The rust-review plugin's worker subagent types were
  unavailable in the run environment, so the plan's per-worker prompts were
  executed by generic subagents with the protocol injected inline
  (byte-identical prompt text; 14 logical workers grouped into 4 subagents
  under a user constraint).
- **What that establishes:** protocol emulation was performed. It does NOT
  establish implementation or behavioral equivalence with the plugin's own
  workers; no such equivalence was independently demonstrated, and this
  report claims none.
- **Limitations.** Single-pass manual/static review; no fuzzing, no MIRI, no
  sanitizer runs; Windows runtime behavior was not executed as part of the
  original audit itself (the corrective pass subsequently validated on
  native Windows, §6); the inherited boundaries of §3 were not covered.

## 8. Machine-readable evidence contract

`REPORT.sarif` (SARIF 2.1.0) contains **all 13 detected findings as
results** — never an empty `results` array while true detections exist.
Each result carries `level: "note"` (none is release-gating), its
verdict/severity in `properties`, and the audited line at AUDIT_SHA. The
release-gate verdict — `gate_results_medium_or_above: 0` under
`threat_model: REMOTE`, `severity_filter: medium` — is carried in
`runs[0].invocations[0].properties`. The previous contract (`results: []`
alongside 13 true detections in this report) misleadingly communicated
"zero findings of any kind" and was corrected by this pass. The generator
lives at `scripts/gen-audit-sarif.py`.

## Artifacts

- `findings/*.md` — original per-finding files (historical evidence,
  unchanged; SAFETYDOC-001..010 + CARGOLINT-001 are superseded by §4.1,
  preserved here for traceability)
- `fp-summary.md`, `dedup-summary.md` — judge summaries (original run)
- `REPORT.sarif` — regenerated under the §8 contract
- `run-summary.md`, `run-ledger.md`, `plan.json` — run bookkeeping
  (original run; §7 of this report carries the binding provenance wording)

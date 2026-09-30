#!/usr/bin/env python3
"""Regenerate .rust-review-results REPORT.sarif for the PicoView Rust audit.

Contract (corrected 2026-10-01): the SARIF contains ALL detected findings as
results — never a misleading empty results array — with verdict/severity
metadata per result and the release-gate verdict (Medium+ under the frozen
REMOTE threat model) in runs[0].invocations[0].properties. URIs are relative
to %SRCROOT% = native/ (the audited crate root). Line numbers are the lines
at AUDIT_SHA (9f506c4b1ebd50643d10a203e07882415c1ab5d8), the tree the review
ran against.
"""
import json
import pathlib

AUDIT_SHA = "9f506c4b1ebd50643d10a203e07882415c1ab5d8"

# (id, rule name, level, uri, line, bug_class, verdict, severity, corrective_status)
FINDINGS = [
    ("SAFETYDOC-001", "safety-doc-associations-set-sz", "note",
     "src/associations.rs", 99, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: helper became a safe fn over OwnedKey with an explicit SAFETY contract"),
    ("SAFETYDOC-002", "safety-doc-associations-set-none", "note",
     "src/associations.rs", 114, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: helper became a safe fn over OwnedKey with an explicit SAFETY contract"),
    ("SAFETYDOC-003", "safety-doc-associations-open-key", "note",
     "src/associations.rs", 126, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: replaced by OwnedKey::create_or_open with an explicit SAFETY contract"),
    ("SAFETYDOC-004", "safety-doc-associations-register-body", "note",
     "src/associations.rs", 148, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: body restructured onto RAII OwnedKey; per-call SAFETY contracts"),
    ("SAFETYDOC-005", "safety-doc-associations-unregister-body", "note",
     "src/associations.rs", 183, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: unsafe scope reduced to the single RegDeleteTreeW call with a SAFETY contract"),
    ("SAFETYDOC-006", "safety-doc-associations-delete-value", "note",
     "src/associations.rs", 200, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: became a safe fn over OwnedKey with an explicit SAFETY contract"),
    ("SAFETYDOC-007", "safety-doc-associations-delete-value-if-ours", "note",
     "src/associations.rs", 225, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: became a safe fn over OwnedKey; byte-view and len bounds documented"),
    ("SAFETYDOC-008", "safety-doc-app-get-system-metrics", "note",
     "src/app.rs", 44, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: SAFETY contract added (pointer-free query, clamped result)"),
    ("SAFETYDOC-009", "safety-doc-decode-wic-body", "note",
     "src/current_item/decode.rs", 433, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: whole-body SAFETY contract added (COM init, stream lifetime vs bytes, buffer/stride bounds)"),
    ("SAFETYDOC-010", "safety-doc-pressure-probe-memory-counters", "note",
     "src/current_item/pressure_probe.rs", 58, "safety-doc", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: SAFETY contract added (pseudo-handle, repr(C) prefix layout, cb sizing); site is #[cfg(test)]-gated"),
    ("CARGOLINT-001", "cargo-lint-config-unsafe-gates", "note",
     "Cargo.toml", 1, "cargo-lint-config", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: [lints.rust] unsafe_op_in_unsafe_fn=deny and [lints.clippy] undocumented_unsafe_blocks=deny adopted; missing_safety_doc deliberately omitted (no public unsafe fn exists)"),
    ("MSRV-001", "msrv-rust-version-missing", "note",
     "Cargo.toml", 1, "msrv-mismatch", "TRUE_POSITIVE", "LOW",
     "resolved_corrective_pass: rust-version = \"1.89\" declared (language floor 1.88 = edition 2024 + production let-chains, dominated by locked cosmic-text 0.19.0 / smol_str 0.3.6 requiring 1.89; verified cargo +1.88 fails resolution, +1.89 resolves); original finding corrected: pressure_probe.rs:210 is #[cfg(test)]-only, the production let-chain at app.rs pins the language floor alone"),
    ("RAWFD-001", "hkey-lifetime-register-associations", "note",
     "src/associations.rs", 150, "raw-fd-lifecycle", "OUT_OF_SCOPE", None,
     "resolved_corrective_pass: RAII OwnedKey releases every acquired HKEY exactly once on success and all failure paths; true engineering defect, unreachable under the frozen REMOTE threat model (local --register-associations CLI + registry error; one-shot process exit)"),
]

rules = [
    {
        "id": fid,
        "name": name,
        "shortDescription": {"text": name},
        "properties": {"bug_class": bug_class},
    }
    for (fid, name, _lvl, _uri, _line, bug_class, _v, _s, _st) in FINDINGS
]

results = []
for (fid, name, level, uri, line, bug_class, verdict, severity, status) in FINDINGS:
    props = {
        "bug_class": bug_class,
        "verdict": verdict,
        "gate_relevant": False,
        "corrective_status": status,
        "line_at_audit_sha": line,
    }
    if severity is not None:
        props["severity"] = severity
    results.append({
        "ruleId": fid,
        "level": level,
        "message": {"text": f"{fid}: {name} (see findings/{fid}.md for the original audit detail)"},
        "locations": [{
            "physicalLocation": {
                "artifactLocation": {"uri": uri, "uriBaseId": "%SRCROOT%"},
                "region": {"startLine": line},
            }
        }],
        "properties": props,
    })

sarif = {
    "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    "version": "2.1.0",
    "runs": [{
        "tool": {
            "driver": {
                "name": "rust-review",
                "informationUri": "https://github.com/trailofbits/skills/tree/main/plugins/rust-review",
                "rules": rules,
            }
        },
        "originalUriBaseIds": {
            "%SRCROOT%": {
                "description": {
                    "text": "Root of the audited Rust crate (native/); finding URIs are relative to this."
                }
            }
        },
        "invocations": [{
            "executionSuccessful": True,
            "properties": {
                "threat_model": "REMOTE",
                "severity_filter": "medium",
                "audited_sha": AUDIT_SHA,
                "sarif_contract": "all-findings — every detected finding is a result; the release gate verdict is here",
                "detected_findings": len(results),
                "gate_results_medium_or_above": 0,
            },
        }],
        "results": results,
    }],
}

out = pathlib.Path(__file__).resolve().parent.parent / ".rust-review-results" / "20260930T143750Z" / "REPORT.sarif"
out.write_text(json.dumps(sarif, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {out} with {len(results)} results, {len(rules)} rules")

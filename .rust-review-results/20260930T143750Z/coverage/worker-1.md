# Coverage gate — worker-1 (cluster unsafe-boundary)

| Pass prefix | Bug class            | Outcome                                                                                                                                  |
|-------------|----------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| URAPI       | unsafe-reaching-api  | cleared (pub unsafe-reaching fns take only trusted inputs — `current_exe()` + fixed registry paths; `decode_wic` validates allocation bounds before the only buffer-writing unsafe op) |
| TRANS       | transmute-misuse     | cleared (no `transmute`/`transmute_copy` anywhere in `native/` — seed returned empty)                                                     |
| RAWPTR      | raw-pointer-arith    | cleared (no `.add/.sub/.offset/ptr::read/ptr::write/copy_*` sites; only `from_raw_parts` at associations.rs:104 with exact HSTRING buffer length `len+1` units incl. NUL) |
| PTRCAST     | pointer-cast         | cleared (3 sites verified sound: u16→u8 byte views with exact byte lengths at associations.rs:104/:254; repr(C) `PMC_EX`→`PMC` prefix idiom with cb=full size at pressure_probe.rs:61; no provenance strip, no fat→thin truncation, no layout-incompatible reinterpret) |
| REPRC       | repr-c-layout        | cleared (no local structs cross an unsafe boundary; FFI structs are `windows`-crate repr(C) upstream; no `#[repr]` in tree — seed empty)   |
| ENUMUB      | enum-discriminant    | cleared (no enum transmutes/raw reads; all enums internal with fallback arms; EXIF orientation validated to 1..=8 before use)              |
| SAFETYDOC   | safety-doc           | filed: SAFETYDOC-001, SAFETYDOC-002, SAFETYDOC-003, SAFETYDOC-004, SAFETYDOC-005, SAFETYDOC-006, SAFETYDOC-007, SAFETYDOC-008, SAFETYDOC-009, SAFETYDOC-010 |
| DEBUGSAFETY | debug-assert-safety  | cleared (only 3 `debug_assert_eq!` sites, presentation.rs:370/380/385 — pure `acquire_recovery` classification asserts, no unsafe precondition; no adjacent unsafe block) |

Note: the `unsafe` block at native/src/current_item/tests.rs:687 is `#[cfg(windows)]`-gated test-only helper code, unreachable from the production binary under the REMOTE threat model; not filed. The cfg(test) `pressure_probe` unsafe block (production module, opt-in entry) is filed as SAFETYDOC-010.

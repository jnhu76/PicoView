---
id: RAWFD-001
bug_class: raw-fd-lifecycle
title: Registry key handles leak on every `?` early-return in register_associations
location: src/associations.rs:150
function: register_associations
confidence: High
worker: worker-12
fp_verdict: OUT_OF_SCOPE
fp_rationale: "Leak verified in code (non-RAII HKEY, closes only on the success path, .ok()? strands earlier handles), but the trigger is the local --register-associations CLI action (main.rs:78/95) plus a registry write error - no REMOTE-attacker capability reaches it, and the one-shot process exit lets the OS reclaim all handles."
---

## Description
`register_associations` opens four Win32 registry key handles (`HKEY` — kernel-managed OS handles,
the Windows analog of the raw-fd/raw-handle resource class this pass covers) via `RegCreateKeyExW`
and closes them with manual, non-RAII `RegCloseKey` calls placed only on the success path. Every
`?` operator between an `open_key(...)` and its matching `RegCloseKey(...)` early-returns from the
function and strands every handle opened so far:

- `prog` (opened line 149) leaks if `set_sz(prog, ...)` at line 150, `open_key(&default_icon_path())`
  at line 151, `set_sz(icon_key, ...)` at line 152, `RegCloseKey(icon_key).ok()?` at line 153,
  `open_key(&shell_command_path())` at 154, `set_sz(cmd_key, ...)` at 155, or
  `RegCloseKey(cmd_key).ok()?` at line 156 fails.
- `icon_key` leaks if anything between its creation (151) and its close (153) fails.
- `cmd_key` leaks if `set_sz(cmd_key, ...)` (155) or its close-conversion `.ok()?` (156) fails.
- Inside the extension loop, `open_with` leaks if `set_none(open_with, ...)` fails.

`RegCloseKey(...).ok()?` is itself a leak contributor: converting the close result to `?` means a
close failure aborts the function before the remaining handles are closed. There is no
`mem::forget`/`into_raw` handoff and no scopeguard — the handles are simply dropped as plain
integer-backed values, which is the leak gate ("dropped ... with no matching close on every path,
including `?`").

## Code
```rust
// native/src/associations.rs:148-168 (abridged)
unsafe {
    let prog = open_key(&prog_id_path())?;          // HKEY #1 owned here
    set_sz(prog, "", PROG_ID_DESC)?;                // <-- line 150: on Err, `prog` leaks
    let icon_key = open_key(&default_icon_path())?; // HKEY #2
    set_sz(icon_key, "", &icon_value_for(&exe_str))?;
    RegCloseKey(icon_key).ok()?;                    // close-as-`?`: Err strands `prog`
    let cmd_key = open_key(&shell_command_path())?; // HKEY #3
    set_sz(cmd_key, "", &shell_command_for(&exe_str))?;
    RegCloseKey(cmd_key).ok()?;
    RegCloseKey(prog).ok()?;                        // only reached on the fully-successful path

    for ext in ASSOCIATED_EXTENSIONS {
        let open_with = open_key(&open_with_progids_path(ext))?;
        set_none(open_with, PROG_ID)?;              // <-- on Err, `open_with` leaks
        RegCloseKey(open_with).ok()?;
    }
}
```

## Data flow
- **Source:** registry operation failures (`RegCreateKeyExW` / `RegSetValueExW` / `RegCloseKey`
  status != ERROR_SUCCESS) raised through `?` inside `register_associations`
  (`native/src/associations.rs:148-168`). Triggered by running `picoview --register-associations`;
  failure requires a registry error (access denied, hive issues) — not attacker-controlled under
  the REMOTE threat model.
- **Sink:** function early-return past the matching `RegCloseKey` calls; first reachable leak point
  is the `?` at `native/src/associations.rs:150`.
- **Validation:** none — there is no RAII wrapper for `HKEY` anywhere in the crate and no
  cleanup-on-error path; `unregister_associations`' helpers (`delete_value`,
  `delete_value_if_ours`) do close their single handle correctly, but the register path has no
  equivalent discipline.

## Reachability trace
`main` → `parse_shell_action` → `ShellAction::RegisterAssociations` → `associations::register_associations`
→ `unsafe { open_key(...) → set_sz(...)? }` → early return with `prog`/`icon_key`/`cmd_key` unclosed.

## Impact
Bounded OS-handle leak: at most three registry key handles per failed registration run, in a
one-shot CLI mode that terminates the process immediately afterward (the OS reclaims all handles
at exit). Not reachable from image data or any remote input under the REMOTE threat model, so the
practical severity is low; the finding is the structural bug — handle ownership is manual and
leaks on every error path, which becomes a real resource-exhaustion defect the moment this code is
called in a loop (e.g., a future repair/re-register loop or installer integration).

## Mitigations checked
- No `// SAFETY:` or ownership-transfer documentation accompanies the manual `RegCloseKey` calls.
- `debug_assert!`/lint coverage: none (`clippy::undocumented_unsafe_blocks` is not enabled — see CARGOLINT-001).
- No MIRI/sanitizer coverage applies (Win32 FFI).
- The pattern is confined to `--register-associations`; the normal viewer path never opens registry keys.

## Recommendation
Wrap `HKEY` in a small RAII guard (or use the `windows-registry` crate's `Key`) whose `Drop` calls
`RegCloseKey`, so all `?` paths close exactly once; drop the `.ok()?` on the close calls (a failed
close should be logged, not abort remaining cleanup). Alternatively restructure with a single
exit-cleanup block that closes every successfully opened handle.

//! Conservative Windows file-association registration.
//!
//! Product truth (WINDOWS-SHELL-UI-POLISH-1):
//!   system codec availability != product promise != association eligibility.
//!
//! Only the baseline static formats PicoView claims for Open With / double-
//! click launch are registered. BrowseSession may still enumerate additional
//! WIC-decodable extensions as directory candidates; those are not claimed
//! here. Application-side HKCU registration only — no installer, no HKLM.
//!
//! Windows-only product code by the crate-level platform declaration
//! (native/src/main.rs); no per-module portability gate.

use std::path::Path;

use windows::Win32::System::Registry::{
    HKEY, KEY_READ, KEY_WRITE, REG_SAM_FLAGS, RegCloseKey, RegDeleteTreeW,
};

/// Product-claimed association extensions (lowercase, with leading dot).
/// Deliberately narrower than BrowseSession's candidate filter.
///
/// GIF is excluded: current WIC first-frame decode is not full GIF product
/// support (animation policy stays Issue #10). WebP is excluded until the
/// product baseline is proven on supported Windows systems, not merely the
/// local WIC install.
pub const ASSOCIATED_EXTENSIONS: &[&str] = &[".jpg", ".jpeg", ".png", ".bmp"];

const PROG_ID: &str = "PicoView.Image";
const PROG_ID_DESC: &str = "PicoView Image";

/// RAII owner of one Win32 registry key handle.
///
/// A raw `HKEY` exists only inside the two constructors below; every
/// successfully acquired key is owned by a guard and released exactly once
/// by [`Drop`] — on success and on every `?` early-return alike. This
/// replaces the former manual `RegCloseKey(...).ok()?` chain, whose first
/// failure aborted the function past the handles opened before it (the
/// RAWFD-001 leak). Close failures are deliberately not error-propagated:
/// they are not actionable here, and aborting remaining cleanup is exactly
/// the leak pattern the guard removes. `--register-associations` is a
/// one-shot CLI action, so the OS also reclaims any handle at process exit
/// regardless.
struct OwnedKey(HKEY);

impl OwnedKey {
    /// Create (or open) `path` under HKCU with `access`. On success the
    /// returned guard owns the handle; on failure no guard is constructed,
    /// so nothing is ever closed twice.
    fn create_or_open(path: &str, access: REG_SAM_FLAGS) -> anyhow::Result<Self> {
        use windows::Win32::Foundation::ERROR_SUCCESS;
        use windows::Win32::System::Registry::{
            HKEY_CURRENT_USER, REG_OPEN_CREATE_OPTIONS, RegCreateKeyExW,
        };
        use windows::core::{HSTRING, PCWSTR};

        let hpath = HSTRING::from(path);
        let mut key = HKEY::default();
        // SAFETY: `hpath` is a live NUL-terminated UTF-16 buffer for the
        // call; `key` is a valid out-pointer. On ERROR_SUCCESS the API
        // transfers one open HKEY to `key`, which the returned guard owns
        // until Drop; on failure no guard wraps `key`.
        let status = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(hpath.as_ptr()),
                Some(0),
                None,
                REG_OPEN_CREATE_OPTIONS(0),
                access,
                None,
                &mut key,
                None,
            )
        };
        if status != ERROR_SUCCESS {
            anyhow::bail!("RegCreateKeyExW({path}) failed: {status:?}");
        }
        Ok(Self(key))
    }

    /// Open an existing key with `access`; `Err` when absent or inaccessible.
    fn open(path: &str, access: REG_SAM_FLAGS) -> anyhow::Result<Self> {
        use windows::Win32::Foundation::ERROR_SUCCESS;
        use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RegOpenKeyExW};
        use windows::core::{HSTRING, PCWSTR};

        let hpath = HSTRING::from(path);
        let mut key = HKEY::default();
        // SAFETY: same contract as `create_or_open` — live NUL-terminated
        // path, valid out-pointer, guard owns the handle on success only.
        let status = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(hpath.as_ptr()),
                Some(0),
                access,
                &mut key,
            )
        };
        if status != ERROR_SUCCESS {
            anyhow::bail!("RegOpenKeyExW({path}) failed: {status:?}");
        }
        Ok(Self(key))
    }

    fn key(&self) -> HKEY {
        self.0
    }
}

impl Drop for OwnedKey {
    fn drop(&mut self) {
        // SAFETY: `self.0` is a handle this guard acquired from
        // RegCreateKeyExW / RegOpenKeyExW and no other code closes it, so
        // this Drop is the single matching RegCloseKey for every successful
        // acquisition, on all return paths.
        unsafe {
            let _ = RegCloseKey(self.0);
        }
    }
}

// --- Pure registry contract construction (C7) -----------------------------
//
// The registry-writing paths below are thin HKCU plumbing; the CONTRACT —
// key paths, command quoting, icon value, extension shape, and the
// ownership guard — is built by these pure functions and unit-tested
// without touching the developer's real registry.

/// HKCU path of the ProgID root for this product build.
fn prog_id_path() -> String {
    format!(r"Software\Classes\{PROG_ID}")
}

/// HKCU path of the ProgID DefaultIcon key.
fn default_icon_path() -> String {
    format!(r"Software\Classes\{PROG_ID}\DefaultIcon")
}

/// HKCU path of the ProgID shell-open command key.
fn shell_command_path() -> String {
    format!(r"Software\Classes\{PROG_ID}\shell\open\command")
}

/// HKCU path of an extension's OpenWithProgids membership key. The extension
/// default value is deliberately NOT written by the register path (ownership
/// guard); OpenWithProgids only makes PicoView a discoverable candidate.
fn open_with_progids_path(ext: &str) -> String {
    format!(r"Software\Classes\{ext}\OpenWithProgids")
}

/// HKCU path of an extension's default-value key (unregister only, guarded).
fn extension_default_path(ext: &str) -> String {
    format!(r"Software\Classes\{ext}")
}

/// The quoted shell-open command for the exe: `"<exe>" "%1"` — the exe path
/// is always quoted as one unit; `%1` is quoted so paths with spaces survive.
fn shell_command_for(exe: &str) -> String {
    format!("\"{exe}\" \"%1\"")
}

/// The DefaultIcon value for the exe: resource index 0 (the embedded icon).
fn icon_value_for(exe: &str) -> String {
    format!("{exe},0")
}

/// Ownership guard for unregister: the extension DEFAULT value may only be
/// cleared when it currently IS our ProgID. Another program's default (or a
/// missing value) is never touched — clearing a foreign default would be a
/// takeover in reverse. This is the single source of the ownership rule: the
/// production delete path evaluates the same predicate the tests pin.
fn may_clear_extension_default(current: Option<&str>) -> bool {
    current == Some(PROG_ID)
}

/// Write a REG_SZ value on a guard-owned key.
fn set_sz(key: &OwnedKey, name: &str, value: &str) -> anyhow::Result<()> {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{REG_SZ, RegSetValueExW};
    use windows::core::{HSTRING, PCWSTR};

    let hname = HSTRING::from(name);
    let hval = HSTRING::from(value);
    // SAFETY: `hval` is a live NUL-terminated UTF-16 HSTRING, so
    // `(len + 1) * 2` bytes starting at `as_ptr()` are exactly its UTF-16
    // data including the terminator — all readable for the call — and the
    // `*const u16 as *const u8` view covers the same allocation.
    // `PCWSTR(hname.as_ptr())` is NUL-terminated and live. `key` is an open
    // HKEY owned by the caller's guard.
    let bytes =
        unsafe { std::slice::from_raw_parts(hval.as_ptr() as *const u8, (hval.len() + 1) * 2) };
    // SAFETY: `key` is an open guard-owned HKEY; `bytes` is the readable
    // UTF-16 view built above; `PCWSTR(hname.as_ptr())` is NUL-terminated
    // and live for the call.
    let status = unsafe {
        RegSetValueExW(
            key.key(),
            PCWSTR(hname.as_ptr()),
            Some(0),
            REG_SZ,
            Some(bytes),
        )
    };
    if status != ERROR_SUCCESS {
        anyhow::bail!("RegSetValueExW({name}) failed: {status:?}");
    }
    Ok(())
}

/// OpenWithProgids membership: value name = ProgID, REG_NONE empty data.
fn set_none(key: &OwnedKey, name: &str) -> anyhow::Result<()> {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{REG_NONE, RegSetValueExW};
    use windows::core::{HSTRING, PCWSTR};

    let hname = HSTRING::from(name);
    // SAFETY: `hname` is live and NUL-terminated for the call; the REG_NONE
    // data is a zero-length slice, so no value bytes are read; `key` is an
    // open HKEY owned by the caller's guard.
    let status = unsafe {
        RegSetValueExW(
            key.key(),
            PCWSTR(hname.as_ptr()),
            Some(0),
            REG_NONE,
            Some(&[]),
        )
    };
    if status != ERROR_SUCCESS {
        anyhow::bail!("RegSetValueExW({name}) failed: {status:?}");
    }
    Ok(())
}

/// Register PicoView as an Open With / default-capable handler for the
/// conservative product set under HKCU. Idempotent.
pub fn register_associations(exe: &Path) -> anyhow::Result<()> {
    let exe_str = exe
        .canonicalize()
        .unwrap_or_else(|_| exe.to_path_buf())
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .to_string();

    let prog = OwnedKey::create_or_open(&prog_id_path(), KEY_WRITE)?;
    set_sz(&prog, "", PROG_ID_DESC)?;
    let icon_key = OwnedKey::create_or_open(&default_icon_path(), KEY_WRITE)?;
    set_sz(&icon_key, "", &icon_value_for(&exe_str))?;
    let cmd_key = OwnedKey::create_or_open(&shell_command_path(), KEY_WRITE)?;
    set_sz(&cmd_key, "", &shell_command_for(&exe_str))?;

    for ext in ASSOCIATED_EXTENSIONS {
        // Discoverable Open With candidate only. Do NOT write the
        // extension default ProgID — that silently seizes per-user
        // default ownership when no stronger UserChoice exists.
        // UserChoice remains Explorer-owned; OpenWithProgids is REG_NONE
        // (empty value name = ProgID).
        let open_with = OwnedKey::create_or_open(&open_with_progids_path(ext), KEY_WRITE)?;
        set_none(&open_with, PROG_ID)?;
    }
    // RegisteredApplications is intentionally NOT written. A bare
    // name→ProgID entry without Capabilities/FileAssociations is not a
    // valid Default Programs contract. Unregister still clears any
    // leftover entry from an earlier over-claim (migration only).
    //
    // Every guard drops here: exactly one RegCloseKey per acquired key on
    // success and on every `?` early-return above.
    Ok(())
}

/// Remove the registration written by [`register_associations`]. Idempotent.
pub fn unregister_associations() -> anyhow::Result<()> {
    use windows::Win32::System::Registry::HKEY_CURRENT_USER;
    use windows::core::{HSTRING, PCWSTR};

    for ext in ASSOCIATED_EXTENSIONS {
        // Ownership guard: only clear the extension default when it is
        // ours (may_clear_extension_default); a foreign program's
        // default is never touched.
        delete_value_if_ours(&extension_default_path(ext));
        delete_value(&open_with_progids_path(ext), PROG_ID);
    }
    let prog = HSTRING::from(prog_id_path());
    // SAFETY: `prog` is a live NUL-terminated UTF-16 path and
    // HKEY_CURRENT_USER is a predefined root. Best-effort recursive delete:
    // failure (tree absent) is ignored so unregister stays idempotent.
    let _ = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(prog.as_ptr())) };
    // Migration: clear any RegisteredApplications entry written by an
    // earlier over-claim. Current register path does not recreate it.
    delete_value(r"Software\RegisteredApplications", "PicoView");
    Ok(())
}

/// Best-effort delete of one value. An absent key or value is not an error —
/// unregister must stay idempotent.
fn delete_value(path: &str, name: &str) {
    use windows::Win32::System::Registry::RegDeleteValueW;
    use windows::core::{HSTRING, PCWSTR};

    let Ok(key) = OwnedKey::open(path, KEY_WRITE) else {
        return;
    };
    let hname = HSTRING::from(name);
    // SAFETY: `key` is an open HKEY owned by the guard; `hname` is live and
    // NUL-terminated for the call. Failure (value absent) is ignored.
    let _ = unsafe { RegDeleteValueW(key.key(), PCWSTR(hname.as_ptr())) };
}

/// Clear the extension DEFAULT value only when it currently IS our ProgID
/// (same predicate the unit tests pin). A query failure, a non-string value,
/// or a foreign ProgID all read as "not ours" and are left untouched.
fn delete_value_if_ours(path: &str) {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{REG_SZ, RegQueryValueExW, RegSetValueExW};
    use windows::core::PCWSTR;

    let Ok(key) = OwnedKey::open(path, KEY_READ | KEY_WRITE) else {
        return;
    };
    let mut buf = [0u16; 64];
    let mut len = (buf.len() * 2) as u32;
    let mut ty = REG_SZ;
    // SAFETY: `key` is an open HKEY owned by the guard. `buf` is a live
    // 64-unit (128-byte) buffer and `len` declares exactly its byte size, so
    // the API can write at most 128 bytes; the `*mut u16 as *mut u8` view
    // covers the same allocation. The API rewrites `len` with the actual
    // size (<= 128), so the later `buf[..units]` slice stays in bounds.
    let q = unsafe {
        RegQueryValueExW(
            key.key(),
            PCWSTR::null(),
            None,
            Some(&mut ty),
            Some(buf.as_mut_ptr() as *mut u8),
            Some(&mut len),
        )
    };
    if q == ERROR_SUCCESS && ty == REG_SZ {
        // len <= 128 => units <= 63 <= buf.len(); saturating_sub guards an
        // odd or zero length.
        let units = (len as usize / 2).saturating_sub(1);
        let value = String::from_utf16_lossy(&buf[..units]);
        // Same predicate the unit tests pin (may_clear_extension_default):
        // a query failure, a non-string value, or a foreign ProgID all
        // read as "not ours" and are left untouched.
        if may_clear_extension_default(Some(&value)) {
            // SAFETY: open guard-owned HKEY; PCWSTR::null() names the
            // value's default; empty REG_SZ data clears it.
            let _ =
                unsafe { RegSetValueExW(key.key(), PCWSTR::null(), Some(0), REG_SZ, Some(&[])) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Registry contract shape: every generated HKCU path hangs under the
    /// per-user Classes hive and names the single product ProgID. These pin
    /// the pure builders — no registry is touched.
    #[test]
    fn registry_paths_are_hkcu_classes_shaped() {
        assert_eq!(prog_id_path(), r"Software\Classes\PicoView.Image");
        assert_eq!(
            default_icon_path(),
            r"Software\Classes\PicoView.Image\DefaultIcon"
        );
        assert_eq!(
            shell_command_path(),
            r"Software\Classes\PicoView.Image\shell\open\command"
        );
        assert_eq!(
            open_with_progids_path(".jpg"),
            r"Software\Classes\.jpg\OpenWithProgids"
        );
        assert_eq!(extension_default_path(".png"), r"Software\Classes\.png");
    }

    #[test]
    fn command_quoting_survives_spaces() {
        let command = shell_command_for(r"C:\Program Files\PicoView\picoview.exe");
        assert_eq!(command, r#""C:\Program Files\PicoView\picoview.exe" "%1""#);
        // One quoted unit for the exe; %1 stays a quoted placeholder.
        assert!(command.starts_with('"'));
        assert!(command.ends_with("\" \"%1\""));
    }

    #[test]
    fn icon_value_references_resource_zero() {
        assert_eq!(
            icon_value_for(r"C:\pv\picoview.exe"),
            r"C:\pv\picoview.exe,0"
        );
    }

    #[test]
    fn extension_set_is_conservative_and_normalized() {
        for ext in ASSOCIATED_EXTENSIONS {
            assert!(ext.starts_with('.'), "{ext} must carry a leading dot");
            assert_eq!(*ext, ext.to_lowercase(), "{ext} must be lowercase");
        }
        // Deliberate product narrowness: no GIF (animation policy open) and
        // no WebP (baseline unproven). Widening is a product decision, not a
        // codec-discovery side effect.
        assert!(!ASSOCIATED_EXTENSIONS.contains(&".gif"));
        assert!(!ASSOCIATED_EXTENSIONS.contains(&".webp"));
        assert_eq!(ASSOCIATED_EXTENSIONS.len(), 4);
    }

    #[test]
    fn ownership_guard_never_clears_a_foreign_default() {
        // This pins the exact predicate the production delete path consumes
        // (delete_value_if_ours calls may_clear_extension_default): ours ->
        // clear; foreign/absent -> leave untouched. No registry is touched.
        assert!(may_clear_extension_default(Some("PicoView.Image")));
        assert!(!may_clear_extension_default(Some("OtherApp.Image")));
        assert!(!may_clear_extension_default(None));
    }

    /// Real-hive smoke test for the [`OwnedKey`] guard: create → validate →
    /// drop → recreate → delete, all under a throwaway PicoView test key the
    /// test removes again. Registry-visible but self-cleaning. It exercises
    /// the real constructor/close path; release-exactly-once itself is
    /// structural — a raw HKEY only exists inside the guard and Drop is its
    /// only closer.
    #[test]
    fn owned_key_guard_survives_create_drop_recreate() {
        use windows::Win32::System::Registry::HKEY_CURRENT_USER;
        use windows::core::{HSTRING, PCWSTR};

        let path = r"Software\Classes\PicoView.__lifetime_test";
        {
            let key = OwnedKey::create_or_open(path, KEY_WRITE).expect("create lifetime-test key");
            assert!(!key.key().is_invalid(), "acquired handle must be valid");
        } // guard drops here: the handle is closed exactly once
        let again = OwnedKey::create_or_open(path, KEY_WRITE).expect("recreate after first drop");
        assert!(!again.key().is_invalid());
        drop(again);
        let test_root = HSTRING::from(path);
        // SAFETY: live NUL-terminated path; predefined HKCU root. Test
        // cleanup only.
        let _ = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(test_root.as_ptr())) };
    }
}

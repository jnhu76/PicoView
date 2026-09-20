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

/// Register PicoView as an Open With / default-capable handler for the
/// conservative product set under HKCU. Idempotent.
pub fn register_associations(exe: &Path) -> anyhow::Result<()> {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, KEY_WRITE, REG_OPEN_CREATE_OPTIONS, REG_SZ, RegCloseKey,
        RegCreateKeyExW, RegSetValueExW,
    };
    use windows::core::{HSTRING, PCWSTR};

    let exe_str = exe
        .canonicalize()
        .unwrap_or_else(|_| exe.to_path_buf())
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .to_string();

    unsafe fn set_sz(key: HKEY, name: &str, value: &str) -> anyhow::Result<()> {
        unsafe {
            let hname = HSTRING::from(name);
            let hval = HSTRING::from(value);
            let bytes =
                std::slice::from_raw_parts(hval.as_ptr() as *const u8, (hval.len() + 1) * 2);
            let status = RegSetValueExW(key, PCWSTR(hname.as_ptr()), Some(0), REG_SZ, Some(bytes));
            if status != ERROR_SUCCESS {
                anyhow::bail!("RegSetValueExW({name}) failed: {status:?}");
            }
        }
        Ok(())
    }

    /// OpenWithProgids membership: value name = ProgID, REG_NONE empty data.
    unsafe fn set_none(key: HKEY, name: &str) -> anyhow::Result<()> {
        unsafe {
            use windows::Win32::System::Registry::REG_NONE;
            let hname = HSTRING::from(name);
            let status = RegSetValueExW(key, PCWSTR(hname.as_ptr()), Some(0), REG_NONE, Some(&[]));
            if status != ERROR_SUCCESS {
                anyhow::bail!("RegSetValueExW({name}) failed: {status:?}");
            }
        }
        Ok(())
    }

    unsafe fn open_key(path: &str) -> anyhow::Result<HKEY> {
        unsafe {
            let hpath = HSTRING::from(path);
            let mut key = HKEY::default();
            let status = RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(hpath.as_ptr()),
                Some(0),
                None,
                REG_OPEN_CREATE_OPTIONS(0),
                KEY_WRITE,
                None,
                &mut key,
                None,
            );
            if status != ERROR_SUCCESS {
                anyhow::bail!("RegCreateKeyExW({path}) failed: {status:?}");
            }
            Ok(key)
        }
    }

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

        for ext in ASSOCIATED_EXTENSIONS {
            // Discoverable Open With candidate only. Do NOT write the
            // extension default ProgID — that silently seizes per-user
            // default ownership when no stronger UserChoice exists.
            // UserChoice remains Explorer-owned; OpenWithProgids is REG_NONE
            // (empty value name = ProgID).
            let open_with = open_key(&open_with_progids_path(ext))?;
            set_none(open_with, PROG_ID)?;
            RegCloseKey(open_with).ok()?;
        }
        // RegisteredApplications is intentionally NOT written. A bare
        // name→ProgID entry without Capabilities/FileAssociations is not a
        // valid Default Programs contract. Unregister still clears any
        // leftover entry from an earlier over-claim (migration only).
    }

    Ok(())
}

/// Remove the registration written by [`register_associations`]. Idempotent.
pub fn unregister_associations() -> anyhow::Result<()> {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RegDeleteTreeW};
    use windows::core::{HSTRING, PCWSTR};

    unsafe {
        for ext in ASSOCIATED_EXTENSIONS {
            // Ownership guard: only clear the extension default when it is
            // ours (may_clear_extension_default); a foreign program's
            // default is never touched.
            delete_value_if_ours(&extension_default_path(ext));
            delete_value(&open_with_progids_path(ext), PROG_ID);
        }
        let prog = HSTRING::from(prog_id_path());
        let _ = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(prog.as_ptr()));
        // Migration: clear any RegisteredApplications entry written by an
        // earlier over-claim. Current register path does not recreate it.
        delete_value(r"Software\RegisteredApplications", "PicoView");
    }
    Ok(())
}

unsafe fn delete_value(path: &str, name: &str) {
    unsafe {
        use windows::Win32::Foundation::ERROR_SUCCESS;
        use windows::Win32::System::Registry::{
            HKEY, HKEY_CURRENT_USER, KEY_WRITE, RegCloseKey, RegDeleteValueW, RegOpenKeyExW,
        };
        use windows::core::{HSTRING, PCWSTR};

        let hpath = HSTRING::from(path);
        let hname = HSTRING::from(name);
        let mut key = HKEY::default();
        let status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(hpath.as_ptr()),
            Some(0),
            KEY_WRITE,
            &mut key,
        );
        if status == ERROR_SUCCESS {
            let _ = RegDeleteValueW(key, PCWSTR(hname.as_ptr()));
            let _ = RegCloseKey(key);
        }
    }
}

unsafe fn delete_value_if_ours(path: &str) {
    unsafe {
        use windows::Win32::Foundation::ERROR_SUCCESS;
        use windows::Win32::System::Registry::{
            HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_SZ, RegCloseKey, RegOpenKeyExW,
            RegQueryValueExW, RegSetValueExW,
        };
        use windows::core::{HSTRING, PCWSTR};

        let hpath = HSTRING::from(path);
        let mut key = HKEY::default();
        let status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(hpath.as_ptr()),
            Some(0),
            KEY_READ | KEY_WRITE,
            &mut key,
        );
        if status != ERROR_SUCCESS {
            return;
        }
        let mut buf = [0u16; 64];
        let mut len = (buf.len() * 2) as u32;
        let mut ty = REG_SZ;
        let q = RegQueryValueExW(
            key,
            PCWSTR::null(),
            None,
            Some(&mut ty),
            Some(buf.as_mut_ptr() as *mut u8),
            Some(&mut len),
        );
        if q == ERROR_SUCCESS && ty == REG_SZ {
            let units = (len as usize / 2).saturating_sub(1);
            let value = String::from_utf16_lossy(&buf[..units]);
            // Same predicate the unit tests pin (may_clear_extension_default):
            // a query failure, a non-string value, or a foreign ProgID all
            // read as "not ours" and are left untouched.
            if may_clear_extension_default(Some(&value)) {
                let _ = RegSetValueExW(key, PCWSTR::null(), Some(0), REG_SZ, Some(&[]));
            }
        }
        let _ = RegCloseKey(key);
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
        assert_eq!(
            command,
            r#""C:\Program Files\PicoView\picoview.exe" "%1""#
        );
        // One quoted unit for the exe; %1 stays a quoted placeholder.
        assert!(command.starts_with('"'));
        assert!(command.ends_with("\" \"%1\""));
    }

    #[test]
    fn icon_value_references_resource_zero() {
        assert_eq!(icon_value_for(r"C:\pv\picoview.exe"), r"C:\pv\picoview.exe,0");
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
}

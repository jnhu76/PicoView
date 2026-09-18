//! Conservative Windows file-association registration.
//!
//! Product truth (WINDOWS-SHELL-UI-POLISH-1):
//!   system codec availability != product promise != association eligibility.
//!
//! Only the baseline static formats PicoView claims for Open With / double-
//! click launch are registered. BrowseSession may still enumerate additional
//! WIC-decodable extensions as directory candidates; those are not claimed
//! here. Application-side HKCU registration only — no installer, no HKLM.

#![cfg(windows)]

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
    let command = format!("\"{exe_str}\" \"%1\"");

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
        let prog = open_key(&format!(r"Software\Classes\{PROG_ID}"))?;
        set_sz(prog, "", PROG_ID_DESC)?;
        let icon_key = open_key(&format!(r"Software\Classes\{PROG_ID}\DefaultIcon"))?;
        set_sz(icon_key, "", &format!("{exe_str},0"))?;
        RegCloseKey(icon_key).ok()?;
        let cmd_key = open_key(&format!(r"Software\Classes\{PROG_ID}\shell\open\command"))?;
        set_sz(cmd_key, "", &command)?;
        RegCloseKey(cmd_key).ok()?;
        RegCloseKey(prog).ok()?;

        for ext in ASSOCIATED_EXTENSIONS {
            // Discoverable Open With candidate only. Do NOT write the
            // extension default ProgID — that silently seizes per-user
            // default ownership when no stronger UserChoice exists.
            // UserChoice remains Explorer-owned; OpenWithProgids is REG_NONE
            // (empty value name = ProgID).
            let open_with = open_key(&format!(r"Software\Classes\{ext}\OpenWithProgids"))?;
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
            delete_value_if_ours(&format!(r"Software\Classes\{ext}"));
            delete_value(&format!(r"Software\Classes\{ext}\OpenWithProgids"), PROG_ID);
        }
        let prog = HSTRING::from(format!(r"Software\Classes\{PROG_ID}"));
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
            if value == PROG_ID {
                let _ = RegSetValueExW(key, PCWSTR::null(), Some(0), REG_SZ, Some(&[]));
            }
        }
        let _ = RegCloseKey(key);
    }
}

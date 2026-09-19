//! Deterministic guest-asset gate: native release embedding requires the
//! compiled `dist/picoview.js` + `dist/picoview.pak` pair to exist before
//! rustc runs. Rebuilds when either artifact changes.
//!
//! Windows release identity: the single icon authority
//! (`assets/branding/picoview-app.ico`) plus version metadata are embedded as
//! EXE resources. One icon resource feeds Explorer, the winit window class
//! (`hIcon: 0` → module-first-icon fallback for titlebar/taskbar/Alt-Tab),
//! the ProgID DefaultIcon, and the installer.

use std::path::PathBuf;

fn main() {
    let dist = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("dist");
    let js = dist.join("picoview.js");
    let pak = dist.join("picoview.pak");
    println!("cargo:rerun-if-changed={}", js.display());
    println!("cargo:rerun-if-changed={}", pak.display());
    if !js.is_file() || !pak.is_file() {
        panic!(
            "missing guest artifacts (build the guest before the native build).\n\
             expected:\n  {}\n  {}\n\
             canonical guest build (from the repository root):\n\
               pwsh -NoProfile -File scripts/build-guest.ps1\n\
             which runs:\n\
               bun third_party/pocketjs/tools/pocket.ts compile --target windows-app \\\n\
                 --manifest guest/pocket.json --project-root . --outdir dist",
            js.display(),
            pak.display()
        );
    }

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        let icon = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("assets")
            .join("branding")
            .join("picoview-app.ico");
        println!("cargo:rerun-if-changed={}", icon.display());
        res.set_icon(icon.to_str().expect("icon path is valid UTF-8"));
        // Version strings derive from the single version authority
        // (Cargo.toml package version). winresource also derives the numeric
        // FILEVERSION/PRODUCTVERSION words from CARGO_PKG_VERSION_* itself.
        let version = std::env::var("CARGO_PKG_VERSION").expect("CARGO_PKG_VERSION");
        res.set("FileDescription", "PicoView Image Viewer");
        res.set("ProductName", "PicoView");
        res.set("InternalName", "PicoView");
        res.set("OriginalFilename", "picoview.exe");
        res.set("FileVersion", &version);
        res.set("ProductVersion", &version);
        // CompanyName / LegalCopyright intentionally absent: the repository
        // declares no publisher identity or copyright holder; none is invented.
        res.compile()
            .expect("compile Windows resources (icon + version info)");
    }
}

//! Deterministic guest-asset gate: native release embedding requires the
//! compiled `dist/picoview.js` + `dist/picoview.pak` pair to exist before
//! rustc runs. Rebuilds when either artifact changes.
//!
//! Product manifest authority: `guest/pocket.json` is the single source for
//! the product version, minimum client size, and default viewport. This
//! build script enforces the version mirror (a mismatch fails the build)
//! and derives the geometry facts as compile-time env values consumed by
//! `src/product_facts.rs` — no cross-language literal copies, no source-text
//! matching.
//!
//! Windows release identity: the single icon authority
//! (`assets/branding/picoview-app.ico`) plus version metadata are embedded as
//! EXE resources. One icon resource feeds Explorer, the winit window class
//! (`hIcon: 0` → module-first-icon fallback for titlebar/taskbar/Alt-Tab),
//! the ProgID DefaultIcon, and the installer.

use std::path::{Path, PathBuf};

fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let dist = root.join("dist");
    let js = dist.join("picoview.js");
    let pak = dist.join("picoview.pak");
    println!("cargo:rerun-if-changed={}", js.display());
    println!("cargo:rerun-if-changed={}", pak.display());
    if !js.is_file() || !pak.is_file() {
        panic!(
            "missing guest artifacts (build the guest before the native build).\n\
             expected:\n  {}\n  {}\n\
             canonical guest build (from the repository root):\n\
               powershell -NoProfile -File scripts/build-guest.ps1\n\
             which runs:\n\
               bun third_party/pocketjs/tools/pocket.ts compile --target windows-app \\\n\
                 --manifest guest/pocket.json --project-root . --outdir dist",
            js.display(),
            pak.display()
        );
    }

    enforce_product_manifest_facts(&root.join("guest").join("pocket.json"));

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
        // (Cargo.toml package version, verified equal to the guest manifest
        // by enforce_product_manifest_facts). winresource also derives the
        // numeric FILEVERSION/PRODUCTVERSION words from CARGO_PKG_VERSION_*
        // itself.
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

/// Read `guest/pocket.json` (JSON — no text scraping) and:
/// 1. fail the build when the guest manifest version and the Cargo package
///    version disagree (one product identity, two mirrors);
/// 2. derive `viewport.dynamic.min` and `viewport.dynamic.default` as
///    compile-time env values for `src/product_facts.rs`.
fn enforce_product_manifest_facts(manifest_path: &Path) {
    println!("cargo:rerun-if-changed={}", manifest_path.display());
    let raw = std::fs::read_to_string(manifest_path).unwrap_or_else(|e| {
        panic!("read product manifest {}: {e}", manifest_path.display())
    });
    let manifest: serde_json::Value = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("parse product manifest {}: {e}", manifest_path.display()));

    let cargo_version = std::env::var("CARGO_PKG_VERSION").expect("CARGO_PKG_VERSION");
    let manifest_version = manifest
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("product manifest: missing top-level \"version\""));
    if manifest_version != cargo_version {
        panic!(
            "product version mismatch: native/Cargo.toml is {cargo_version} but \
             guest/pocket.json is {manifest_version}. One product identity — \
             align both before building."
        );
    }

    let viewport = manifest
        .pointer("/app/viewport/dynamic")
        .unwrap_or_else(|| panic!("product manifest: missing app.viewport.dynamic"));

    for (base, pointer) in [
        ("PICOVIEW_PRODUCT_MIN_CLIENT", "/min"),
        ("PICOVIEW_DEFAULT_VIEWPORT", "/default"),
    ] {
        let pair = viewport
            .pointer(pointer)
            .and_then(|v| v.as_array())
            .unwrap_or_else(|| panic!("product manifest: viewport.dynamic{pointer} must be [w, h]"));
        if pair.len() != 2 {
            panic!("product manifest: viewport.dynamic{pointer} must be [w, h]");
        }
        for (i, axis) in ["W", "H"].iter().enumerate() {
            let value = pair[i].as_u64().unwrap_or_else(|| {
                panic!("product manifest: viewport.dynamic{pointer}[{i}] must be a u32")
            });
            println!("cargo:rustc-env={base}_{axis}={value}");
        }
    }
}

//! Deterministic guest-asset gate: native release embedding requires the
//! compiled `dist/picoview.js` + `dist/picoview.pak` pair to exist before
//! rustc runs. Rebuilds when either artifact changes.

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
            "missing guest artifacts (compile guest before native).\n\
             expected:\n  {}\n  {}\n\
             recipe (from PocketJS checkout):\n\
               bun tools/pocket.ts compile --target windows-app \\\n\
                 --manifest guest/pocket.json --project-root . --outdir dist",
            js.display(),
            pak.display()
        );
    }
}

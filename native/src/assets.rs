//! Production guest artifacts embedded at compile time.
//!
//! Normal product startup uses these bytes. `--js` / `--pak` remain as an
//! explicit developer override only; CWD is never the runtime authority.

/// Compiled guest JS bundle (`dist/picoview.js`).
pub const EMBEDDED_JS: &str = include_str!("../../dist/picoview.js");

/// Compiled guest PAK (`dist/picoview.pak`).
pub const EMBEDDED_PAK: &[u8] = include_bytes!("../../dist/picoview.pak");

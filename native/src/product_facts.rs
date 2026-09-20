//! Product facts derived at build time from the product manifest authority
//! (`guest/pocket.json`) by `build.rs` (post-release normalization C5).
//!
//! One semantic fact — product minimum client size, default viewport — has
//! exactly one source: the manifest. Native consumes it via compile-time env
//! values; the guest oracle test (`guest/shell_layout.test.ts`) checks the
//! same manifest against `shell_layout.PRODUCT_MIN_CLIENT`. No cross-language
//! literal copies and no source-text matching.

/// Parsed `viewport.dynamic.min` from the manifest.
pub(crate) fn product_min_client() -> (f64, f64) {
    static FACTS: std::sync::OnceLock<(f64, f64)> = std::sync::OnceLock::new();
    *FACTS.get_or_init(|| {
        (
            parse_env_u32("PICOVIEW_PRODUCT_MIN_CLIENT_W") as f64,
            parse_env_u32("PICOVIEW_PRODUCT_MIN_CLIENT_H") as f64,
        )
    })
}

/// Parsed `viewport.dynamic.default` from the manifest: the initial/default
/// requested logical size (Host.viewport / CLI `--viewport` default).
pub(crate) fn default_viewport() -> (u32, u32) {
    static FACTS: std::sync::OnceLock<(u32, u32)> = std::sync::OnceLock::new();
    *FACTS.get_or_init(|| {
        (
            parse_env_u32("PICOVIEW_DEFAULT_VIEWPORT_W"),
            parse_env_u32("PICOVIEW_DEFAULT_VIEWPORT_H"),
        )
    })
}

fn parse_env_u32(name: &str) -> u32 {
    let raw = std::env::var(name).unwrap_or_else(|_| {
        panic!(
            "{name} is not set: build.rs must derive product facts from \
             guest/pocket.json"
        )
    });
    raw.parse()
        .unwrap_or_else(|_| panic!("{name}={raw} is not a u32"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The manifest is the authority; these assertions make any manifest
    /// change a deliberate, visible native contract change (the same numbers
    /// the released product shipped with).
    #[test]
    fn product_min_client_closes_the_toolbar_contract() {
        let (w, h) = product_min_client();
        assert_eq!((w, h), (384.0, 240.0));
        assert!(w >= 356.0, "min width must close the fixed toolbar contract");
    }

    #[test]
    fn default_viewport_is_a_usable_desktop_window() {
        let (w, h) = default_viewport();
        assert!(w >= 640 && h >= 480, "default viewport {w}x{h} too small");
        assert!(
            w as f64 >= product_min_client().0 && h as f64 >= product_min_client().1,
            "default viewport must satisfy the product minimum client"
        );
    }
}

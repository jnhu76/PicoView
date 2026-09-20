//! Fatal-failure observability for the Windows GUI-subsystem product binary
//! (post-release normalization C6B).
//!
//! A GUI-subsystem executable has no console: an error that only reaches
//! stderr (or a `panic!`) is invisible to a Windows user. This module makes
//! fatal host failures observable:
//!
//! - the failure SITE is recorded explicitly by the code that owns it
//!   (window creation, GPU init, runtime worker, input channel, ...),
//!   instead of being flattened into an anonymous string;
//! - `report` shows a small native error dialog (`rfd`, already a product
//!   dependency) with a bounded, meaningful user-facing message;
//! - full detail still goes to the log for development/diagnostics.
//!
//! No telemetry, no crash uploading, no logging-framework migration, no
//! always-running console. The classification/message construction is pure
//! and unit-tested; only the dialog itself touches the platform.

/// Where a fatal failure was observed. The site is Product/host truth: it
/// selects the user-facing headline and the recovery hint.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FatalSite {
    /// Initial window creation failed (never a visible window).
    WindowCreation,
    /// GPU device / swapchain / surface initialization failed.
    GpuInit,
    /// The runtime worker failed (guest boot/eval, decode loop, frame loop).
    RuntimeWorker,
    /// The UI→worker input channel disconnected (worker is gone).
    RuntimeChannel,
    /// Presenting a produced frame failed after startup.
    Presentation,
    /// Spawning the runtime worker thread failed.
    ThreadSpawn,
    /// Command-line/product configuration could not be parsed.
    Configuration,
    /// The windowing/event-loop subsystem itself failed.
    Windowing,
    /// An internal invariant was violated (guest startup state missing).
    InternalState,
}

impl FatalSite {
    /// One-line user-facing headline. Meaningful but bounded: this is the
    /// first thing a user reads, before any technical detail.
    pub(crate) fn headline(self) -> &'static str {
        match self {
            FatalSite::WindowCreation => "PicoView could not create its window.",
            FatalSite::GpuInit => {
                "PicoView could not initialize graphics (GPU device or swapchain)."
            }
            FatalSite::RuntimeWorker => "PicoView's image engine stopped unexpectedly.",
            FatalSite::RuntimeChannel => "PicoView lost its internal image-engine channel.",
            FatalSite::Presentation => "PicoView could not present a rendered frame.",
            FatalSite::ThreadSpawn => "PicoView could not start its image engine.",
            FatalSite::Configuration => "PicoView was started with an invalid option.",
            FatalSite::Windowing => "PicoView could not start the windowing subsystem.",
            FatalSite::InternalState => "PicoView reached an unexpected internal state.",
        }
    }

    /// Short recovery hint appended to the summary.
    pub(crate) fn hint(self) -> &'static str {
        match self {
            FatalSite::GpuInit => {
                "Check that a GPU driver is installed and up to date, then try again."
            }
            FatalSite::Configuration => "Check the command-line options and try again.",
            _ => "Please try starting PicoView again.",
        }
    }

    /// Short category tag used in logs so evidence can group failures.
    pub(crate) fn tag(self) -> &'static str {
        match self {
            FatalSite::WindowCreation => "window-creation",
            FatalSite::GpuInit => "gpu-init",
            FatalSite::RuntimeWorker => "runtime-worker",
            FatalSite::RuntimeChannel => "runtime-channel",
            FatalSite::Presentation => "presentation",
            FatalSite::ThreadSpawn => "thread-spawn",
            FatalSite::Configuration => "configuration",
            FatalSite::Windowing => "windowing",
            FatalSite::InternalState => "internal-state",
        }
    }
}

/// A classified fatal failure: where it happened and the bounded technical
/// detail that accompanies the user-facing summary (also logged in full).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FatalFailure {
    pub site: FatalSite,
    pub detail: String,
}

impl FatalFailure {
    pub(crate) fn new(site: FatalSite, detail: impl Into<String>) -> Self {
        Self {
            site,
            detail: detail.into(),
        }
    }
}

impl std::fmt::Display for FatalFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.site.tag(), self.detail)
    }
}

/// The user-facing dialog content built from a failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FatalReport {
    pub title: String,
    pub summary: String,
    /// Bounded technical detail for the expandable part of the dialog and
    /// the log; never unbounded host/error text.
    pub detail: String,
}

/// Layout bound for dialog text: fatal dialogs must stay readable and never
/// depend on the length of an OS error chain.
const REPORT_DETAIL_MAX: usize = 600;

/// Pure classification: failure → user-facing report.
pub(crate) fn build_report(failure: &FatalFailure) -> FatalReport {
    FatalReport {
        title: "PicoView".to_string(),
        summary: format!("{}\n{}", failure.site.headline(), failure.site.hint()),
        detail: cap_lines(&failure.detail, REPORT_DETAIL_MAX),
    }
}

/// Convert a classified failure into an `anyhow` error carrying the site tag
/// and detail, so the process exit path keeps the same observable content.
pub(crate) fn failure_to_anyhow(failure: FatalFailure) -> anyhow::Error {
    anyhow::anyhow!("{failure}")
}

/// Report a fatal error to the user (and the log). Called once from `main`
/// for any error escaping the product run. The dialog is a small blocking
/// native message box (`rfd`, an existing product dependency) — no console
/// window, no telemetry, no new logging machinery.
pub(crate) fn report_error(error: &anyhow::Error) {
    // Unwrap into the failure when the error was built from one
    // (failure_to_anyhow); otherwise classify as an unclassified runtime
    // failure so the dialog still shows something meaningful.
    let failure = fatal_failure_from_error(error);
    let report = build_report(&failure);
    log::error!("fatal: [{}] {error:#}", failure.site.tag());
    show_dialog(&report);
}

fn fatal_failure_from_error(error: &anyhow::Error) -> FatalFailure {
    if let Some(failure) = error.downcast_ref::<FatalFailure>() {
        return failure.clone();
    }
    FatalFailure::new(FatalSite::RuntimeWorker, format!("{error:#}"))
}

/// Native message box. Platform-gated like the rest of the product: the
/// crate is Windows-only by declaration (main.rs).
fn show_dialog(report: &FatalReport) {
    use rfd::MessageDialog;
    let text = if report.detail.is_empty() {
        report.summary.clone()
    } else {
        format!("{}\n\nTechnical details:\n{}", report.summary, report.detail)
    };
    MessageDialog::new()
        .set_title(&report.title)
        .set_description(&text)
        .set_level(rfd::MessageLevel::Error)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

/// First-lines-bounded text: keep whole lines, stop before exceeding `max`.
/// A single line longer than the bound is truncated rather than dropped, so
/// the detail never disappears entirely and never grows unbounded.
fn cap_lines(detail: &str, max: usize) -> String {
    let mut out = String::new();
    for line in detail.lines() {
        if out.len() + line.len() + usize::from(!out.is_empty()) > max {
            break;
        }
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(line);
    }
    if out.is_empty() {
        let first = detail.lines().next().unwrap_or("");
        out = first.chars().take(max).collect();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_site_has_meaningful_bounded_copy() {
        for site in [
            FatalSite::WindowCreation,
            FatalSite::GpuInit,
            FatalSite::RuntimeWorker,
            FatalSite::RuntimeChannel,
            FatalSite::Presentation,
            FatalSite::ThreadSpawn,
            FatalSite::Configuration,
            FatalSite::Windowing,
            FatalSite::InternalState,
        ] {
            let headline = site.headline();
            assert!(!headline.is_empty());
            assert!(headline.ends_with('.'));
            assert!(!site.hint().is_empty());
            assert!(!site.tag().is_empty());
        }
    }

    #[test]
    fn gpu_failure_names_the_recovery_path() {
        let report = build_report(&FatalFailure::new(
            FatalSite::GpuInit,
            "adapter request failed: some chain",
        ));
        assert!(report.summary.contains("GPU"));
        assert!(report.summary.to_lowercase().contains("driver"));
        assert_eq!(report.detail, "adapter request failed: some chain");
    }

    #[test]
    fn report_summary_is_bounded_for_oversized_error_chains() {
        let huge = format!("{}{}", "line one\n".repeat(200), "this tail must not appear");
        let report =
            build_report(&FatalFailure::new(FatalSite::RuntimeWorker, huge));
        assert!(report.detail.len() <= REPORT_DETAIL_MAX);
        assert!(report.detail.contains("line one"));
        assert!(!report.detail.contains("this tail must not appear"));
        // The user-facing summary never embeds the raw detail.
        assert!(!report.summary.contains("this tail must not appear"));
    }

    #[test]
    fn display_carries_site_tag_for_logs() {
        let failure = FatalFailure::new(FatalSite::WindowCreation, "access denied");
        assert_eq!(failure.to_string(), "[window-creation] access denied");
    }
}

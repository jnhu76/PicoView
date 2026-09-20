//! PicoView native host process entry (V1).
//!
//! Process shape follows the PocketJS portable desktop runtime. This file is
//! process composition only: logger setup, shell-action early dispatch, CLI
//! parse entry, event-loop construction, app/runtime assembly, and top-level
//! run / error propagation.
//!
//! Authority modules:
//! - `app` — window / event-loop authority
//! - `runtime` — worker / guest execution authority
//! - `presentation` — native host presentation plumbing (PocketJS renders)
//! - `current_item` — Product CurrentItem / decode / publication

// Product release is a GUI subsystem executable: double-click / Open With
// must not spawn a black console. Debug builds keep a console for logging.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

use anyhow::{Context as _, Result, anyhow};
use std::time::Instant;
use winit::event_loop::EventLoop;

mod app;
mod assets;
mod associations;
mod browse_session;
mod current_item;
mod presentation;
mod product_facts;
mod runtime;
mod svc_queue;

use app::Host;
use runtime::{Wake, parse_args};

/// Monotonic milliseconds since process start, for first-frame lifecycle
/// evidence. Both the window thread and the runtime worker log against this
/// base so event order is reconstructible from the log alone.
pub(crate) fn tlog(msg: &str) {
    static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    let start = START.get_or_init(Instant::now);
    log::info!(
        "[{:>8.1}ms] {}",
        start.elapsed().as_secs_f64() * 1000.0,
        msg
    );
}

/// CLI product-shell actions that exit without launching the viewer window.
enum ShellAction {
    RegisterAssociations,
    UnregisterAssociations,
}

fn parse_shell_action() -> Option<ShellAction> {
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--register-associations" => return Some(ShellAction::RegisterAssociations),
            "--unregister-associations" => return Some(ShellAction::UnregisterAssociations),
            _ => {}
        }
    }
    None
}

fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    tlog("process start");

    // Application-side Windows product shell actions (no window).
    if let Some(action) = parse_shell_action() {
        let exe = std::env::current_exe().context("resolve current exe")?;
        match action {
            ShellAction::RegisterAssociations => {
                associations::register_associations(&exe)?;
                log::info!("registered file associations for {}", exe.display());
                return Ok(());
            }
            ShellAction::UnregisterAssociations => {
                associations::unregister_associations()?;
                log::info!("unregistered file associations");
                return Ok(());
            }
        }
    }

    let args = parse_args()?;
    let event_loop = EventLoop::<Wake>::with_user_event().build()?;
    let proxy = event_loop.create_proxy();
    let mut host = Host::new(args, proxy);
    event_loop.run_app(&mut host)?;
    if let Some(error) = host.take_failure() {
        return Err(anyhow!(error));
    }
    Ok(())
}

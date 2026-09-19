//! Window / event-loop authority.
//!
//! Owns the native window, ApplicationHandler, input event translation,
//! file-dialog dispatch, presentation capture (Resized / ScaleFactorChanged),
//! first-frame visibility policy, and event-loop exit/failure handling.
//!
//! Must not own: WIC decode, CurrentItem publication, resource admission
//! internals, PocketJS texture lifetime, render loop scheduling, or image
//! semantics. Those live in `runtime`, `current_item`, and `presentation`.
//!
//! Preserved Stage-A facts:
//! - PicoView is Dynamic viewport
//! - Host.viewport = initial/default requested logical size
//! - measured physical + live OS scale are forwarded
//! - 384×240 product min
//! - AMD first-present behavior (presentation module)
//! - hidden-until-first-valid-present behavior

use crate::presentation;
use crate::runtime::{self, Args, Input, Output, RuntimeStartup, Wake};
use crate::tlog;
use anyhow::Result;
use pocket_desktop_host::{PresentationGeometry, ViewportPolicy, resolve_geometry};
use serde_json::json;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, SyncSender, TrySendError, sync_channel};
use std::time::{Duration, Instant};
use winit::application::ApplicationHandler;
use winit::dpi::LogicalSize;
use winit::event::ElementState;
use winit::event_loop::{ActiveEventLoop, EventLoopProxy};
use winit::keyboard::{Key, ModifiersState, NamedKey};
use winit::window::{Theme, Window, WindowId};

/// Titlebar identity icon: loaded once from the EXE resource table (icon
/// resource 1 = `assets/branding/picoview-app.ico`, embedded by build.rs),
/// sized to the system small-icon metric so 100/125/150% DPI each get a
/// crisp native size instead of an upscaled 16px bitmap.
#[cfg(windows)]
fn app_window_icon() -> Option<winit::window::Icon> {
    use winit::dpi::PhysicalSize;
    use winit::platform::windows::IconExtWindows;
    use windows::Win32::UI::WindowsAndMessaging::{SM_CXSMICON, GetSystemMetrics};

    let size = unsafe { GetSystemMetrics(SM_CXSMICON) }.max(16) as u32;
    winit::window::Icon::from_resource(1, Some(PhysicalSize::new(size, size))).ok()
}

/// Taskbar / Alt-Tab identity icon: same resource, system large default.
#[cfg(windows)]
fn app_taskbar_icon() -> Option<winit::window::Icon> {
    use winit::platform::windows::IconExtWindows;

    winit::window::Icon::from_resource(1, None).ok()
}

#[cfg(not(windows))]
fn app_window_icon() -> Option<winit::window::Icon> {
    None
}

#[cfg(not(windows))]
fn app_taskbar_icon() -> Option<winit::window::Icon> {
    None
}

/// PicoView product minimum logical client size.
///
/// PocketJS `windows-app` capability floor is 240×180 logical
/// (`DESKTOP_DYNAMIC_MIN`). That is a platform capability floor used by the
/// shared Dynamic resolver, not a PicoView product usability promise. The
/// fixed 8-command toolbar needs ≈356 logical px width (8×36 + group gaps +
/// padding); product closes the contract at 384×240. Keep in sync with
/// `guest/shell_layout.ts` `PRODUCT_MIN_CLIENT` and `guest/pocket.json`
/// `viewport.min`. Do **not** replace these with PocketJS 240×180.
pub(crate) const PRODUCT_MIN_CLIENT_W: f64 = 384.0;
pub(crate) const PRODUCT_MIN_CLIENT_H: f64 = 240.0;

/// R3 corrective: live presentation facts captured on the window thread.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct PresentationFacts {
    pub measured_physical: (u32, u32),
    pub os_scale: f64,
}

impl PresentationFacts {
    fn into_input(self) -> Input {
        Input::Presentation {
            measured_physical: self.measured_physical,
            os_scale: self.os_scale,
        }
    }
}

/// Producer-side latest-presentation enqueue result.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum QueueOutcome {
    /// Presentation entered the runtime input channel.
    Sent,
    /// Channel Full: retained as pending latest Presentation.
    Pending,
    /// Runtime input channel is gone — not success.
    Disconnected,
}

/// Producer-side pending-presentation flush result.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum FlushOutcome {
    /// Nothing pending.
    Idle,
    /// Pending Presentation entered the runtime input channel.
    Sent,
    /// Still Full; retry via event-loop wake.
    StillPending,
    /// Runtime input channel is gone — not success.
    Disconnected,
}

/// Host-owned latest-presentation pending slot (R3 producer contract).
///
/// Presentation must never be silently discarded merely because the bounded
/// input channel is temporarily Full. A Full `try_send` retains the facts;
/// a newer Presentation replaces the pending slot (producer-side latest-wins).
/// Flush retries until the facts enter the channel. `Disconnected` is never
/// treated as delivered.
///
/// Barrier: non-Presentation inputs must not overtake a pending Presentation
/// that was measured earlier. `barrier_allows_non_presentation` flushes first
/// and reports whether a non-Presentation send is safe this turn.
#[derive(Debug, Default)]
pub(crate) struct PendingPresentation {
    slot: Option<PresentationFacts>,
}

impl PendingPresentation {
    pub(crate) fn is_pending(&self) -> bool {
        self.slot.is_some()
    }

    pub(crate) fn peek(&self) -> Option<PresentationFacts> {
        self.slot
    }

    /// Queue Presentation facts. Success clears older pending (already
    /// superseded). Full replaces pending with the newer facts.
    pub(crate) fn queue(
        &mut self,
        tx: &SyncSender<Input>,
        facts: PresentationFacts,
    ) -> QueueOutcome {
        match tx.try_send(facts.into_input()) {
            Ok(()) => {
                self.slot = None;
                QueueOutcome::Sent
            }
            Err(TrySendError::Full(_)) => {
                self.slot = Some(facts);
                QueueOutcome::Pending
            }
            Err(TrySendError::Disconnected(_)) => {
                // Keep facts visible; Host records failure and does not treat
                // this as success.
                self.slot = Some(facts);
                QueueOutcome::Disconnected
            }
        }
    }

    /// Retry pending Presentation until it enters the channel.
    pub(crate) fn flush(&mut self, tx: &SyncSender<Input>) -> FlushOutcome {
        let Some(facts) = self.slot else {
            return FlushOutcome::Idle;
        };
        match tx.try_send(facts.into_input()) {
            Ok(()) => {
                self.slot = None;
                FlushOutcome::Sent
            }
            Err(TrySendError::Full(_)) => FlushOutcome::StillPending,
            Err(TrySendError::Disconnected(_)) => {
                self.slot = Some(facts);
                FlushOutcome::Disconnected
            }
        }
    }

    /// Barrier gate for non-Presentation inputs.
    ///
    /// Returns true when any pending Presentation has been flushed (or none
    /// is pending), so a subsequent non-Presentation `try_send` cannot
    /// overtake a measured Presentation that never entered the channel.
    pub(crate) fn barrier_allows_non_presentation(&mut self, tx: &SyncSender<Input>) -> bool {
        if self.slot.is_none() {
            return true;
        }
        matches!(self.flush(tx), FlushOutcome::Sent | FlushOutcome::Idle)
    }
}

pub(crate) struct Host {
    window: Option<Arc<Window>>,
    surface: Option<presentation::Presentation>,
    startup: Option<RuntimeStartup>,
    tx: SyncSender<Input>,
    rx: Receiver<Output>,
    frame: Option<(u64, Arc<presentation::Target>)>,
    title: String,
    viewport: (u32, u32),
    failure: Option<String>,
    modifiers: ModifiersState,
    /// Logical pointer position (window scale-normalized).
    pointer: (f64, f64),
    /// Left button down.
    pointer_down: bool,
    /// The native window stays hidden until the first valid frame is
    /// presented, so the user never sees an uninitialized white client.
    shown: bool,
    /// R3 producer-side latest Presentation when the input channel is Full.
    pending_presentation: PendingPresentation,
}

impl Host {
    pub(crate) fn new(args: Args, proxy: EventLoopProxy<Wake>) -> Self {
        let title = args.title.clone();
        let viewport = args.viewport;
        let (tx, inputs) = sync_channel(256);
        let (outputs, rx) = sync_channel(1);
        let mut host = Self {
            window: None,
            surface: None,
            startup: None,
            tx,
            rx,
            frame: None,
            title,
            viewport,
            failure: None,
            modifiers: ModifiersState::default(),
            pointer: (0.0, 0.0),
            pointer_down: false,
            shown: false,
            pending_presentation: PendingPresentation::default(),
        };
        host.startup = Some(RuntimeStartup {
            args,
            inputs,
            outputs,
            proxy,
            // Placeholder until `resumed` measures the live window. Initial
            // requested logical is known; physical/scale are not — do not invent
            // them. Resumed overwrites with Dynamic measured geometry before the
            // runtime worker boots.
            initial_geometry: PresentationGeometry::from_live(host.viewport, (1, 1), 1.0),
        });
        host
    }

    pub(crate) fn take_failure(&mut self) -> Option<String> {
        self.failure.take()
    }

    /// R3 producer contract: Presentation never silently dropped on Full.
    fn queue_presentation(&mut self, measured_physical: (u32, u32), os_scale: f64) {
        let facts = PresentationFacts {
            measured_physical,
            os_scale,
        };
        match self.pending_presentation.queue(&self.tx, facts) {
            QueueOutcome::Sent => {
                tlog(&format!(
                    "R3 presentation queued: {}x{} @{}",
                    measured_physical.0, measured_physical.1, os_scale
                ));
            }
            QueueOutcome::Pending => {
                tlog(&format!(
                    "R3 presentation pending (channel full): {}x{} @{}",
                    measured_physical.0, measured_physical.1, os_scale
                ));
            }
            QueueOutcome::Disconnected => {
                let msg = format!(
                    "runtime input channel disconnected (presentation {}x{} @{})",
                    measured_physical.0, measured_physical.1, os_scale
                );
                log::error!("{msg}");
                self.failure = Some(msg);
            }
        }
    }

    /// Retry pending Presentation until it enters the runtime channel.
    fn flush_pending_presentation(&mut self) -> bool {
        let before = self.pending_presentation.peek();
        match self.pending_presentation.flush(&self.tx) {
            FlushOutcome::Idle => true,
            FlushOutcome::Sent => {
                if let Some(facts) = before {
                    tlog(&format!(
                        "R3 pending presentation flushed: {}x{} @{}",
                        facts.measured_physical.0,
                        facts.measured_physical.1,
                        facts.os_scale
                    ));
                } else {
                    tlog("R3 pending presentation flushed into runtime channel");
                }
                true
            }
            FlushOutcome::StillPending => {
                if let Some(facts) = before {
                    tlog(&format!(
                        "R3 pending presentation still full; will retry: {}x{} @{}",
                        facts.measured_physical.0,
                        facts.measured_physical.1,
                        facts.os_scale
                    ));
                }
                false
            }
            FlushOutcome::Disconnected => {
                let msg = "runtime input channel disconnected (presentation flush)";
                log::error!("{msg}");
                self.failure = Some(msg.into());
                false
            }
        }
    }

    /// Host input send with R3 presentation reliability + barrier semantics.
    ///
    /// - Presentation: latest-wins pending slot; never silent Full drop.
    /// - Non-Presentation: flush pending Presentation first; do not overtake
    ///   a pending Presentation that cannot enter the channel this turn.
    /// - Disconnected: record failure; never treat as success.
    fn try_send_input(&mut self, input: Input, event_loop: Option<&ActiveEventLoop>) {
        if let Input::Presentation {
            measured_physical,
            os_scale,
        } = input
        {
            self.queue_presentation(measured_physical, os_scale);
            if self.failure.is_some()
                && let Some(event_loop) = event_loop
            {
                event_loop.exit();
            }
            return;
        }

        if !self
            .pending_presentation
            .barrier_allows_non_presentation(&self.tx)
        {
            if self.failure.is_some() {
                if let Some(event_loop) = event_loop {
                    event_loop.exit();
                }
                return;
            }
            // Pending Presentation could not enter. Terminal Quit still
            // attempts delivery; other non-Presentation inputs must not
            // overtake the barrier (Service/mouse were already Full-droppable).
            match input {
                Input::Quit => match self.tx.try_send(Input::Quit) {
                    Ok(()) => {}
                    Err(TrySendError::Disconnected(_)) => {
                        self.failure =
                            Some("runtime input channel disconnected (quit)".into());
                        if let Some(event_loop) = event_loop {
                            event_loop.exit();
                        }
                    }
                    Err(TrySendError::Full(_)) => {
                        tlog("R3 quit deferred: presentation pending / channel full");
                    }
                },
                _ => {
                    tlog("R3 non-presentation deferred: pending presentation not delivered");
                }
            }
            return;
        }

        match self.tx.try_send(input) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                tlog("input channel full: drop non-presentation");
            }
            Err(TrySendError::Disconnected(_)) => {
                self.failure = Some("runtime input channel disconnected".into());
                if let Some(event_loop) = event_loop {
                    event_loop.exit();
                }
            }
        }
    }

    fn present(&mut self) -> Result<()> {
        let (Some(surface), Some(window), Some(frame)) =
            (&mut self.surface, &self.window, &self.frame)
        else {
            return Ok(());
        };
        let (tick, target) = frame;
        tlog(&format!("present begin (frame tick {tick})"));
        let presented = surface.present(window, target)?;
        tlog(&format!(
            "present end (frame tick {tick}, submitted {presented})"
        ));
        if presented && !self.shown {
            self.shown = true;
            window.set_visible(true);
            tlog("window shown after first presented frame");
        }
        Ok(())
    }
}

/// Map a winit logical key to the guest's lowercase key names.
/// Guest shortcuts use: left, right, r, f5, 0, 1, =, +, -, and o with ctrl.
/// Native winit input → guest scalar representation is app/window authority.
fn key_name(key: &Key) -> String {
    match key {
        Key::Character(s) => s.to_lowercase(),
        Key::Named(n) => match n {
            NamedKey::ArrowUp => "up".into(),
            NamedKey::ArrowDown => "down".into(),
            NamedKey::ArrowLeft => "left".into(),
            NamedKey::ArrowRight => "right".into(),
            NamedKey::Enter => "enter".into(),
            NamedKey::Escape => "escape".into(),
            NamedKey::Backspace => "backspace".into(),
            NamedKey::Delete => "delete".into(),
            NamedKey::Tab => "tab".into(),
            NamedKey::Space => "space".into(),
            NamedKey::Home => "home".into(),
            NamedKey::End => "end".into(),
            NamedKey::PageUp => "pageup".into(),
            NamedKey::PageDown => "pagedown".into(),
            NamedKey::F5 => "f5".into(),
            _ => String::new(),
        },
        _ => String::new(),
    }
}

impl ApplicationHandler<Wake> for Host {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        #[cfg(windows)]
        use winit::platform::windows::WindowAttributesExtWindows as _;
        let window = Arc::new(
            event_loop
                .create_window(
                    Window::default_attributes()
                        .with_title(&self.title)
                        // App identity, installed once from the EXE resource
                        // table (winresource embeds assets/branding/
                        // picoview-app.ico as icon resource 1). Titlebar and
                        // taskbar read the same authority; nothing per frame.
                        .with_window_icon(app_window_icon())
                        .with_taskbar_icon(app_taskbar_icon())
                        // Dark native caption — matches the dark product chrome;
                        // avoids a light OS title bar sitting on a dark viewer.
                        .with_theme(Some(Theme::Dark))
                        .with_inner_size(LogicalSize::new(self.viewport.0, self.viewport.1))
                        // Product min client — closes the toolbar width
                        // contract. Do not silently allow host/pocketjs 240px
                        // capability floor to undercut product chrome.
                        .with_min_inner_size(LogicalSize::new(
                            PRODUCT_MIN_CLIENT_W,
                            PRODUCT_MIN_CLIENT_H,
                        ))
                        .with_resizable(true)
                        // Stay hidden until the first presented frame so the
                        // product never flashes an uninitialized white client.
                        .with_visible(false),
                )
                .expect("create window"),
        );
        tlog("window created (hidden until first frame)");
        let presentation = match presentation::Presentation::new(window.clone()) {
            Ok(presentation) => presentation,
            Err(error) => {
                self.failure = Some(format!("GPU initialization: {error:#}"));
                event_loop.exit();
                return;
            }
        };
        let gpu = presentation.gpu.clone();
        self.surface = Some(presentation);
        let mut startup = self.startup.take().expect("runtime startup");
        // A3 initial boot authority: measured physical client + live OS scale.
        // PicoView presentation policy is Dynamic (guest/pocket.json
        // viewport.dynamic). Host.viewport is initial/default requested
        // logical size only — not frozen Product logical authority.
        // Never construct retained physical as logical × package density,
        // and never reconstruct measured physical from logical × scale.
        let physical = window.inner_size();
        let os_scale = window.scale_factor();
        let initial_requested_logical = self.viewport;
        let initial_geometry = resolve_geometry(
            ViewportPolicy::Dynamic,
            initial_requested_logical,
            (physical.width, physical.height),
            os_scale,
        );
        tlog(&format!(
            "R1 boot geometry: policy=Dynamic initial_requested={}x{} measured_physical={}x{} os_scale={} package_density={} logical={}x{} render_scale={}",
            initial_requested_logical.0,
            initial_requested_logical.1,
            physical.width,
            physical.height,
            os_scale,
            startup.args.density,
            initial_geometry.logical_w,
            initial_geometry.logical_h,
            initial_geometry.effective_render_scale()
        ));
        startup.initial_geometry = initial_geometry;
        let RuntimeStartup {
            args,
            inputs,
            outputs,
            proxy,
            initial_geometry,
        } = startup;
        if let Err(error) = std::thread::Builder::new()
            .name("picoview-runtime".into())
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    runtime::run_runtime(
                        args,
                        inputs,
                        outputs,
                        proxy.clone(),
                        gpu,
                        initial_geometry,
                    )
                }))
                .unwrap_or_else(|_| Err(anyhow::anyhow!("Runtime worker panicked")));
                let _ = proxy.send_event(Wake::Exit(result.err().map(|e| format!("{e:#}"))));
            })
        {
            self.failure = Some(format!("Runtime startup: {error}"));
            event_loop.exit();
        }
        self.window = Some(window);
    }
    fn user_event(&mut self, event_loop: &ActiveEventLoop, event: Wake) {
        match event {
            Wake::Exit(error) => {
                if let Some(error) = error {
                    log::error!("{error}");
                    self.failure = Some(error);
                }
                event_loop.exit();
            }
            Wake::PickFile => {
                // Modal native dialog on the UI thread. Filter is the
                // conservative product association set (not every WIC type).
                let picked = rfd::FileDialog::new()
                    .set_title("Open image")
                    .add_filter("Images", &["jpg", "jpeg", "png", "bmp"])
                    .pick_file();
                if let Some(path) = picked {
                    log::info!("open file dialog picked {}", path.display());
                    self.try_send_input(Input::OpenPath(path), Some(event_loop));
                }
                // Cancel is a no-op: no publication change, no error state.
            }
            Wake::Output => {
                // Worker produced output — the input channel may have drained.
                self.flush_pending_presentation();
                if self.failure.is_some() {
                    event_loop.exit();
                    return;
                }
                while let Ok(output) = self.rx.try_recv() {
                    if let Some(target) = output.target {
                        tlog(&format!("frame ready from worker (tick {})", output.tick));
                        self.frame = Some((output.tick, target));
                        // Hidden winit windows do not receive RedrawRequested.
                        // Present the first frame on this UI thread while the
                        // window is still hidden, then show — the first
                        // composition the user sees is already PicoView.
                        if !self.shown {
                            if let Err(error) = self.present() {
                                log::error!("{error}");
                                self.failure = Some(error.to_string());
                                event_loop.exit();
                                return;
                            }
                            if !self.shown {
                                // present() declined (zero size / lost) —
                                // show and rely on a normal redraw path.
                                if let Some(window) = &self.window {
                                    window.set_visible(true);
                                    self.shown = true;
                                    tlog("window shown before first present (fallback)");
                                }
                            }
                        }
                        if let Some(window) = &self.window {
                            window.request_redraw();
                        }
                    }
                }
            }
        }
    }
    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        // R3 corrective: retry pending Presentation without blocking the
        // winit/UI thread and without busy-spin. WaitUntil is event-loop-safe.
        if self.pending_presentation.is_pending() {
            self.flush_pending_presentation();
            if self.failure.is_some() {
                event_loop.exit();
                return;
            }
            if self.pending_presentation.is_pending() {
                event_loop.set_control_flow(winit::event_loop::ControlFlow::WaitUntil(
                    Instant::now() + Duration::from_millis(16),
                ));
                return;
            }
            if let Some(window) = &self.window {
                window.request_redraw();
            }
        }
        event_loop.set_control_flow(winit::event_loop::ControlFlow::Wait);
    }
    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _: WindowId,
        event: winit::event::WindowEvent,
    ) {
        match event {
            winit::event::WindowEvent::CloseRequested => {
                self.try_send_input(Input::Quit, Some(event_loop));
                event_loop.exit();
            }
            winit::event::WindowEvent::ModifiersChanged(state) => {
                self.modifiers = state.state();
            }
            winit::event::WindowEvent::Focused(false) => {
                // MAJOR-5 / adversarial-2: focus-loss must CANCEL, not release.
                // Encoding this as a plain d:false at the last pointer position
                // can spuriously fire onPress if the cursor still sits on the
                // armed toolbar control (alt-tab mid-click). `"cancel":true`
                // tells the guest to drop the press owner without activate.
                self.pointer_down = false;
                self.try_send_input(
                    Input::Service(
                        json!({"t":"mouse","x":self.pointer.0,"y":self.pointer.1,"d":false,"b":0,"sh":false,"cancel":true})
                            .to_string(),
                    ),
                    Some(event_loop),
                );
            }
            winit::event::WindowEvent::CursorMoved { position, .. } => {
                let scale = self.window.as_ref().unwrap().scale_factor();
                self.pointer = (position.x / scale, position.y / scale);
                let line = json!({
                    "t": "mouse",
                    "x": self.pointer.0,
                    "y": self.pointer.1,
                    "d": self.pointer_down,
                    "b": 0,
                    "sh": self.modifiers.shift_key(),
                })
                .to_string();
                self.try_send_input(Input::Service(line), Some(event_loop));
            }
            winit::event::WindowEvent::MouseInput { state, button, .. } => {
                if button == winit::event::MouseButton::Left {
                    self.pointer_down = state == ElementState::Pressed;
                }
                let line = json!({
                    "t": "mouse",
                    "x": self.pointer.0,
                    "y": self.pointer.1,
                    "d": state == ElementState::Pressed,
                    "b": if button == winit::event::MouseButton::Right { 2 } else { 0 },
                    "sh": self.modifiers.shift_key(),
                })
                .to_string();
                self.try_send_input(Input::Service(line), Some(event_loop));
            }
            winit::event::WindowEvent::MouseWheel { delta, .. } => {
                let dy = match delta {
                    winit::event::MouseScrollDelta::LineDelta(_, y) => -(y as f64) * 24.0,
                    winit::event::MouseScrollDelta::PixelDelta(p) => -p.y,
                };
                // Coalesce nothing here; guest accumulates high-res deltas.
                // x/y = latest logical pointer known by the host so wheel zoom
                // stays pointer-anchored even when CursorMoved is not in this
                // turn (PR61-CORRECTIVE-1 MAJOR-B)
                let line = json!({
                    "t": "scroll",
                    "dy": dy,
                    "x": self.pointer.0,
                    "y": self.pointer.1
                })
                .to_string();
                self.try_send_input(Input::Service(line), Some(event_loop));
            }
            winit::event::WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                tlog(&format!("ScaleFactorChanged {scale_factor}"));
                let measured_physical = {
                    let Some(window) = self.window.as_ref() else { return };
                    // R1 is not resize coalescing: preserve latest measured
                    // physical + live OS scale. Dynamic policy derives logical
                    // from current inner_size + new live scale. Temporary
                    // source/swapchain mismatch is allowed; permanent settled
                    // mismatch is not.
                    // R3 corrective: Full channel retains pending latest facts.
                    let measured = window.inner_size();
                    (measured.width, measured.height)
                };
                self.try_send_input(
                    Input::Presentation {
                        measured_physical,
                        os_scale: scale_factor,
                    },
                    Some(event_loop),
                );
                if let Some(window) = &self.window {
                    window.request_redraw();
                }
            }
            winit::event::WindowEvent::KeyboardInput { event, .. } => {
                if event.state != ElementState::Pressed {
                    return;
                }
                let name = key_name(&event.logical_key);
                if name.is_empty() {
                    return;
                }
                let cmd = if cfg!(target_os = "macos") {
                    self.modifiers.super_key()
                } else {
                    self.modifiers.control_key()
                };
                let ctl = self.modifiers.control_key();
                // Guest keyboard shortcuts (REAL-VIEWER-TRAIN-1 + shell):
                // left/right navigation, r/F5 refresh, Ctrl+O open,
                // 0 Fit, 1 1:1, +/- zoom.
                let line = json!({
                    "t": "key",
                    "k": name,
                    "cmd": cmd,
                    "ctl": ctl,
                })
                .to_string();
                self.try_send_input(Input::Service(line), Some(event_loop));
            }
            winit::event::WindowEvent::RedrawRequested => {
                tlog("RedrawRequested");
                if let Err(error) = self.present() {
                    log::error!("{error}");
                    self.failure = Some(error.to_string());
                    event_loop.exit();
                }
            }
            winit::event::WindowEvent::Resized(size) => {
                tlog(&format!("Resized {}x{}", size.width, size.height));
                // Measured physical client size is presentation authority.
                // Dynamic policy: runtime derives logical from measured size
                // + current OS scale via shared R1 geometry.
                // R3 corrective: Full channel retains pending latest facts.
                let os_scale = self.window.as_ref().unwrap().scale_factor();
                self.try_send_input(
                    Input::Presentation {
                        measured_physical: (size.width, size.height),
                        os_scale,
                    },
                    Some(event_loop),
                );
                self.window.as_ref().unwrap().request_redraw();
            }
            _ => {}
        }
    }
}

/// Product-contract regressions for Dynamic R1 consumption (CORRECTIVE-1)
/// plus R3 producer-side pending presentation delivery (CORRECTIVE-2).
#[cfg(test)]
mod tests {
    use super::{
        FlushOutcome, PRODUCT_MIN_CLIENT_H, PRODUCT_MIN_CLIENT_W, PendingPresentation,
        PresentationFacts, QueueOutcome,
    };
    use crate::runtime::{Input, coalesce_presentation_batch};
    use pocket_desktop_host::{DESKTOP_DYNAMIC_MIN, PresentationGeometry, ViewportPolicy, resolve_geometry};
    use std::sync::mpsc::sync_channel;

    /// D. Product minimum remains 384×240 through PicoView window/product
    /// contract. PocketJS Dynamic floor 240×180 is platform capability only
    /// and must not replace product min.
    #[test]
    fn product_minimum_remains_384x240_through_product_contract() {
        assert_eq!(PRODUCT_MIN_CLIENT_W, 384.0);
        assert_eq!(PRODUCT_MIN_CLIENT_H, 240.0);
        assert_ne!(
            (PRODUCT_MIN_CLIENT_W as u32, PRODUCT_MIN_CLIENT_H as u32),
            DESKTOP_DYNAMIC_MIN
        );
        assert_eq!(DESKTOP_DYNAMIC_MIN, (240, 180));
        // guest/pocket.json viewport.dynamic.min and shell_layout
        // PRODUCT_MIN_CLIENT stay 384×240; OS window min uses the same
        // product constants. Shared Dynamic resolver may clamp to the
        // platform floor; product window min keeps the normal product
        // window out of that region.
        let tiny = resolve_geometry(ViewportPolicy::Dynamic, (960, 640), (200, 100), 2.0);
        assert_eq!(tiny.logical(), DESKTOP_DYNAMIC_MIN);
        assert_eq!(tiny.logical(), (240, 180));
    }

    fn facts(w: u32, h: u32, scale: f64) -> PresentationFacts {
        PresentationFacts {
            measured_physical: (w, h),
            os_scale: scale,
        }
    }

    fn is_pres_at(input: &Input, w: u32, h: u32, scale: f64) -> bool {
        matches!(
            input,
            Input::Presentation { measured_physical, os_scale }
                if *measured_physical == (w, h) && (*os_scale - scale).abs() < f64::EPSILON
        )
    }

    /// A. Full channel retains final Presentation (does not silent-drop).
    #[test]
    fn full_channel_retains_final_presentation() {
        let (tx, _rx) = sync_channel(1);
        tx.try_send(Input::Service("fill".into())).unwrap();
        let mut pending = PendingPresentation::default();
        assert_eq!(
            pending.queue(&tx, facts(800, 600, 1.0)),
            QueueOutcome::Pending
        );
        assert!(pending.is_pending());
        assert_eq!(pending.peek(), Some(facts(800, 600, 1.0)));
        assert_eq!(pending.flush(&tx), FlushOutcome::StillPending);
        assert_eq!(pending.peek(), Some(facts(800, 600, 1.0)));
    }

    /// B. Producer-side latest-wins: pending slot keeps only the newest facts.
    #[test]
    fn producer_side_latest_wins_replaces_pending() {
        let (tx, _rx) = sync_channel(1);
        tx.try_send(Input::Service("fill".into())).unwrap();
        let mut pending = PendingPresentation::default();
        assert_eq!(
            pending.queue(&tx, facts(800, 600, 1.0)),
            QueueOutcome::Pending
        );
        assert_eq!(
            pending.queue(&tx, facts(900, 700, 1.0)),
            QueueOutcome::Pending
        );
        assert_eq!(
            pending.queue(&tx, facts(1200, 800, 1.0)),
            QueueOutcome::Pending
        );
        assert_eq!(pending.peek(), Some(facts(1200, 800, 1.0)));
    }

    /// C. Eventual delivery: after capacity frees, exactly the latest enters.
    #[test]
    fn eventual_delivery_puts_exactly_latest_into_channel() {
        let (tx, rx) = sync_channel(1);
        tx.try_send(Input::Service("fill".into())).unwrap();
        let mut pending = PendingPresentation::default();
        pending.queue(&tx, facts(800, 600, 1.0));
        pending.queue(&tx, facts(900, 700, 1.0));
        pending.queue(&tx, facts(1200, 800, 1.0));
        assert_eq!(pending.peek(), Some(facts(1200, 800, 1.0)));

        // Consumer drains the filler; producer retries.
        let _dropped = rx.try_recv().unwrap();
        assert_eq!(pending.flush(&tx), FlushOutcome::Sent);
        assert!(!pending.is_pending());
        assert_eq!(pending.flush(&tx), FlushOutcome::Idle);

        let batch: Vec<Input> = rx.try_iter().collect();
        assert_eq!(batch.len(), 1);
        assert!(is_pres_at(&batch[0], 1200, 800, 1.0));

        // Consumer coalescing still observes the final facts once.
        let applied = coalesce_presentation_batch(batch);
        assert_eq!(applied.len(), 1);
        assert!(is_pres_at(&applied[0], 1200, 800, 1.0));
    }

    /// D. No permanent final mismatch after latest Presentation is applied.
    #[test]
    fn no_permanent_final_mismatch_after_latest_delivery() {
        let (tx, rx) = sync_channel(4);
        let mut pending = PendingPresentation::default();
        // Final requested client at 100% OS scale.
        assert_eq!(
            pending.queue(&tx, facts(1200, 800, 1.0)),
            QueueOutcome::Sent
        );
        let batch: Vec<Input> = rx.try_iter().collect();
        let applied = coalesce_presentation_batch(batch);
        assert_eq!(applied.len(), 1);
        let Input::Presentation {
            measured_physical,
            os_scale,
        } = &applied[0]
        else {
            panic!("expected presentation");
        };
        let geo: PresentationGeometry = resolve_geometry(
            ViewportPolicy::Dynamic,
            (960, 640), // Host.viewport initial/default only
            *measured_physical,
            *os_scale,
        );
        assert_eq!(geo.logical(), (1200, 800));
        assert_eq!(geo.physical(), (1200, 800));
        assert!(geo.is_exact_present((1200, 800)));
    }

    /// E1. Barrier not weakened: pending Presentation flushes before Service.
    #[test]
    fn barrier_flushes_pending_presentation_before_non_presentation() {
        let (tx, rx) = sync_channel(2);
        tx.try_send(Input::Service("fill1".into())).unwrap();
        tx.try_send(Input::Service("fill2".into())).unwrap();
        let mut pending = PendingPresentation::default();
        assert_eq!(
            pending.queue(&tx, facts(640, 480, 1.0)),
            QueueOutcome::Pending
        );
        // Free capacity for both flush + one Service.
        assert!(rx.try_recv().is_ok());
        assert!(rx.try_recv().is_ok());
        assert!(pending.barrier_allows_non_presentation(&tx));
        assert!(!pending.is_pending());
        assert!(tx
            .try_send(Input::Service(r#"{"t":"key","k":"0"}"#.into()))
            .is_ok());

        let batch: Vec<Input> = rx.try_iter().collect();
        let applied = coalesce_presentation_batch(batch);
        assert_eq!(applied.len(), 2);
        assert!(is_pres_at(&applied[0], 640, 480, 1.0));
        assert!(matches!(&applied[1], Input::Service(line) if line.contains("key")));
    }

    /// E2. Barrier not weakened: non-Presentation cannot overtake pending
    /// Presentation when the channel stays Full.
    #[test]
    fn barrier_blocks_non_presentation_overtake_while_pending() {
        let (tx, rx) = sync_channel(1);
        tx.try_send(Input::Service("fill".into())).unwrap();
        let mut pending = PendingPresentation::default();
        pending.queue(&tx, facts(800, 600, 1.0));
        // Still full — Service must not sneak in ahead of pending Presentation.
        assert!(!pending.barrier_allows_non_presentation(&tx));
        assert!(pending.is_pending());
        // Channel still only has the filler.
        let batch: Vec<Input> = rx.try_iter().collect();
        assert_eq!(batch.len(), 1);
        assert!(matches!(&batch[0], Input::Service(line) if line == "fill"));
        assert_eq!(pending.peek(), Some(facts(800, 600, 1.0)));
    }

    /// Disconnected is not success: pending remains, outcome is failure.
    #[test]
    fn disconnected_is_not_treated_as_success() {
        let (tx, rx) = sync_channel(1);
        drop(rx);
        let mut pending = PendingPresentation::default();
        assert_eq!(
            pending.queue(&tx, facts(1024, 768, 1.0)),
            QueueOutcome::Disconnected
        );
        assert_eq!(pending.peek(), Some(facts(1024, 768, 1.0)));
        assert_eq!(pending.flush(&tx), FlushOutcome::Disconnected);
        assert!(pending.is_pending());
    }

    /// Successful newer Presentation clears obsolete pending facts.
    #[test]
    fn successful_newer_presentation_clears_pending() {
        let (tx, rx) = sync_channel(1);
        tx.try_send(Input::Service("fill".into())).unwrap();
        let mut pending = PendingPresentation::default();
        pending.queue(&tx, facts(800, 600, 1.0));
        let _ = rx.try_recv().unwrap();
        assert_eq!(
            pending.queue(&tx, facts(1200, 800, 1.0)),
            QueueOutcome::Sent
        );
        assert!(!pending.is_pending());
        let batch: Vec<Input> = rx.try_iter().collect();
        assert_eq!(batch.len(), 1);
        assert!(is_pres_at(&batch[0], 1200, 800, 1.0));
    }
}

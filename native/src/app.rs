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
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};
use winit::application::ApplicationHandler;
use winit::dpi::LogicalSize;
use winit::event::ElementState;
use winit::event_loop::{ActiveEventLoop, EventLoopProxy};
use winit::keyboard::{Key, ModifiersState, NamedKey};
use winit::window::{Theme, Window, WindowId};

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
        let window = Arc::new(
            event_loop
                .create_window(
                    Window::default_attributes()
                        .with_title(&self.title)
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
                    self.tx.try_send(Input::OpenPath(path)).ok();
                }
                // Cancel is a no-op: no publication change, no error state.
            }
            Wake::Output => {
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
                self.tx.try_send(Input::Quit).ok();
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
                self.tx
                    .try_send(Input::Service(
                        json!({"t":"mouse","x":self.pointer.0,"y":self.pointer.1,"d":false,"b":0,"sh":false,"cancel":true})
                            .to_string(),
                    ))
                    .ok();
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
                self.tx.try_send(Input::Service(line)).ok();
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
                self.tx.try_send(Input::Service(line)).ok();
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
                self.tx.try_send(Input::Service(line)).ok();
            }
            winit::event::WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                tlog(&format!("ScaleFactorChanged {scale_factor}"));
                let Some(window) = &self.window else { return };
                // R1 is not resize coalescing: preserve latest measured
                // physical + live OS scale. Dynamic policy derives logical
                // from current inner_size + new live scale. Temporary
                // source/swapchain mismatch is allowed; permanent settled
                // mismatch is not.
                let measured = window.inner_size();
                self.tx
                    .try_send(Input::Presentation {
                        measured_physical: (measured.width, measured.height),
                        os_scale: scale_factor,
                    })
                    .ok();
                window.request_redraw();
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
                self.tx.try_send(Input::Service(line)).ok();
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
                let os_scale = self.window.as_ref().unwrap().scale_factor();
                self.tx
                    .try_send(Input::Presentation {
                        measured_physical: (size.width, size.height),
                        os_scale,
                    })
                    .ok();
                self.window.as_ref().unwrap().request_redraw();
            }
            _ => {}
        }
    }
}

/// Product-contract regressions for Dynamic R1 consumption (CORRECTIVE-1).
#[cfg(test)]
mod tests {
    use super::{PRODUCT_MIN_CLIENT_H, PRODUCT_MIN_CLIENT_W};
    use pocket_desktop_host::{DESKTOP_DYNAMIC_MIN, ViewportPolicy, resolve_geometry};

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
}

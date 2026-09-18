//! PicoView native host (V1).
//!
//! Process shape follows the PocketJS portable desktop runtime: a winit window
//! thread owns presentation, a runtime worker owns the UiSurface + QuickJS
//! guest and ticks at 60 Hz. PicoView adds the product seam on top: the
//! Current Item authority (explicit path → WIC decode → native texture →
//! bounded svc publication) lives in `current_item.rs`.

// Product release is a GUI subsystem executable: double-click / Open With
// must not spawn a black console. Debug builds keep a console for logging.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

use anyhow::{anyhow, Context as _, Result};
use pocket_mod::Guest;
use pocket_ui_surface::offload::OffloadWorker;
use pocket_ui_surface::UiSurface;
use serde_json::json;
use std::path::PathBuf;
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::Arc;
use std::time::{Duration, Instant};
use winit::application::ApplicationHandler;
use winit::dpi::LogicalSize;
use winit::event::ElementState;
use winit::event_loop::{ActiveEventLoop, EventLoop, EventLoopProxy};
use winit::keyboard::{Key, ModifiersState, NamedKey};
use winit::window::{Theme, Window, WindowId};

mod associations;
mod assets;
mod browse_session;
mod current_item;
mod gpu;
use current_item::{Command, CurrentItem, ObservationBoundary, OpenIntent, RequestPhase};

const HOST_ID: &str = "windows-app";
const HOST_ABI: u32 = 4;

/// PicoView product minimum logical client size.
///
/// PocketJS `windows-app` capability floor is 240×180 logical. That is a
/// platform capability, not a PicoView product usability promise. The fixed
/// 8-command toolbar needs ≈356 logical px width (8×36 + group gaps +
/// padding); product closes the contract at 384×240. Keep in sync with
/// `guest/shell_layout.ts` `PRODUCT_MIN_CLIENT` and `guest/pocket.json`
/// `viewport.min`.
const PRODUCT_MIN_CLIENT_W: f64 = 384.0;
const PRODUCT_MIN_CLIENT_H: f64 = 240.0;

/// Monotonic milliseconds since process start, for first-frame lifecycle
/// evidence. Both the window thread and the runtime worker log against this
/// base so event order is reconstructible from the log alone.
pub(crate) fn tlog(msg: &str) {
    static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    let start = START.get_or_init(Instant::now);
    log::info!("[{:>8.1}ms] {}", start.elapsed().as_secs_f64() * 1000.0, msg);
}

#[derive(Debug)]
enum Wake {
    Output,
    Exit(Option<String>),
    /// Runtime asked the window thread to show the native Open File dialog.
    PickFile,
}

struct Args {
    image: Option<PathBuf>,
    /// Developer override for guest JS. `None` = embedded production assets.
    js: Option<PathBuf>,
    /// Developer override for guest PAK. `None` = embedded production assets.
    pak: Option<PathBuf>,
    title: String,
    viewport: (u32, u32),
    density: u32,
}

fn parse_args() -> Result<Args> {
    let mut image = None;
    let mut js: Option<PathBuf> = None;
    let mut pak: Option<PathBuf> = None;
    let mut title = "PicoView".to_string();
    let mut viewport = (960u32, 640u32);
    let mut density = 2u32;
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            // Developer/debug override only. Normal product startup uses the
            // compile-time embedded guest pair and never depends on CWD.
            "--js" => {
                js = Some(it.next().ok_or_else(|| anyhow!("--js needs a value"))?.into());
            }
            "--pak" => {
                pak = Some(it.next().ok_or_else(|| anyhow!("--pak needs a value"))?.into());
            }
            "--title" => title = it.next().ok_or_else(|| anyhow!("--title needs a value"))?,
            "--viewport" => {
                let v = it.next().ok_or_else(|| anyhow!("--viewport needs a value"))?;
                let (w, h) = v
                    .split_once('x')
                    .ok_or_else(|| anyhow!("--viewport expects WxH"))?;
                viewport = (w.parse()?, h.parse()?);
            }
            "--density" => density = it.next().ok_or_else(|| anyhow!("--density needs a value"))?.parse()?,
            other if other.starts_with('-') => return Err(anyhow!("unknown flag {other}")),
            other => image = Some(PathBuf::from(other)),
        }
    }
    Ok(Args {
        image,
        js,
        pak,
        title,
        viewport,
        density,
    })
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

enum Input {
    Quit,
    /// Logical viewport + output scale (physical px per logical unit).
    Resize(u32, u32, f64),
    /// Prebuilt svc JSON line pushed into the guest poll queue.
    Service(String),
    /// A path chosen by the native Open File dialog. Runtime maps this to
    /// the same Product `Command::Open` path as CLI / Open With / guest open.
    OpenPath(PathBuf),
}

/// Map a winit logical key to the guest's lowercase key names.
/// Guest shortcuts use: left, right, r, f5, 0, 1, =, +, -, and o with ctrl.
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

/// Parse a guest command from a svc JSON line. The guest sends lines like:
/// `{"t":"pv","cmd":"previous"}`, `{"t":"pv","cmd":"next"}`,
/// `{"t":"pv","cmd":"refresh"}`, `{"t":"pv","cmd":"open","path":"..."}`.
/// `pick-file` is handled in Runtime::tick as host plumbing (not a Command).
fn parse_command(val: &serde_json::Value) -> Option<Command> {
    let cmd = val.get("cmd")?.as_str()?;
    match cmd {
        "previous" => Some(Command::Previous),
        "next" => Some(Command::Next),
        "refresh" => Some(Command::Refresh),
        "open" => {
            let path = val.get("path")?.as_str()?;
            Some(Command::Open(std::path::PathBuf::from(path)))
        }
        _ => None,
    }
}

fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn fnv1a64(words: &[u32]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for word in words {
        for byte in word.to_le_bytes() {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }
    hash
}

struct Runtime {
    surface: UiSurface,
    guest: Guest,
    offload: OffloadWorker,
    viewport: (u32, u32),
    density: u32,
    /// Physical pixels per UI logical unit.
    dpi_scale: f64,
    ticks: u64,
    /// Native Current Item truth.
    current: CurrentItem,
    /// Used to ask the window thread for UI-thread-only work (file dialog).
    proxy: EventLoopProxy<Wake>,
}

impl Runtime {
    fn boot(args: &Args, initial_scale: f64, proxy: EventLoopProxy<Wake>) -> Result<Self> {
        // Production path: embedded artifacts, no CWD / dist discovery.
        // Developer override: explicit --js and/or --pak paths only.
        let (pak, source) = match (&args.js, &args.pak) {
            (Some(js_path), Some(pak_path)) => {
                let pak = std::fs::read(pak_path)
                    .with_context(|| format!("missing pak {}", pak_path.display()))?;
                let source = std::fs::read_to_string(js_path)
                    .with_context(|| format!("missing js {}", js_path.display()))?;
                (pak, source)
            }
            (Some(js_path), None) => {
                let source = std::fs::read_to_string(js_path)
                    .with_context(|| format!("missing js {}", js_path.display()))?;
                (assets::EMBEDDED_PAK.to_vec(), source)
            }
            (None, Some(pak_path)) => {
                let pak = std::fs::read(pak_path)
                    .with_context(|| format!("missing pak {}", pak_path.display()))?;
                (pak, assets::EMBEDDED_JS.to_string())
            }
            (None, None) => (
                assets::EMBEDDED_PAK.to_vec(),
                assets::EMBEDDED_JS.to_string(),
            ),
        };
        let surface = UiSurface::new_with_density(
            (args.viewport.0 as f32, args.viewport.1 as f32),
            args.density,
        );
        surface.set_identity(HOST_ID, HOST_ABI);
        surface.set_tick_rate(60);
        // Enable guest→native command channel: the guest calls svcOpen("picoview")
        // to confirm the channel, then svcSend() to push command JSON lines.
        surface.set_svc_allowlist(["picoview"]);
        surface.feed_pak(&pak);
        let guest = Guest::new()?;
        surface.mount(&guest)?;
        let offload = text_worker(pak);
        offload.mount(&guest)?;
        guest.eval("picoview", &source)?;
        if !guest.has_frame() {
            return Err(anyhow!("bundle installed no frame handler"));
        }
        // MAJOR-1 (Corrective-2): hello must carry the REAL window scale at
        // boot. A 1.0 placeholder makes Actual Size display 150% DPI as 100%
        // for the whole session when the user never resizes or crosses
        // monitors. Host measures `window.scale_factor()` after create and
        // hands it here before any guest frame.
        let dpi_scale = if initial_scale > 0.0 { initial_scale } else { 1.0 };
        surface.svc_push(
            json!({"t":"hello","w":args.viewport.0,"h":args.viewport.1,"scale":dpi_scale,"epoch":epoch_ms()})
                .to_string(),
        );
        let current = if let Some(path) = &args.image {
            // Create a CurrentItem with a BrowseSession for the directory
            // containing the initial image. The browse session enumerates
            // supported images and enables Previous/Next navigation.
            let mut item = CurrentItem::with_browse(path);
            // V1's only open: the boot image is a new item (there is no prior
            // publication to preserve). Boot is a legal request phase —
            // strictly before any guest turn.
            item.open(
                &surface,
                RequestPhase::before_guest_frame(),
                path,
                OpenIntent::NewItem,
            );
            log::info!(
                "current item: generation={} handle={:?} path={}",
                item.generation(),
                item.live_handle(),
                path.display()
            );
            if let Some(browse) = item.browse() {
                log::info!(
                    "browse session: dir={} count={} index={:?}",
                    browse.dir().display(),
                    browse.count(),
                    browse.current_index()
                );
            }
            item
        } else {
            CurrentItem::new()
        };
        tlog("runtime booted (pak fed, guest mounted, source eval'd, current item opened)");
        Ok(Self {
            surface,
            guest,
            offload,
            viewport: args.viewport,
            density: args.density,
            dpi_scale,
            ticks: 0,
            current,
            proxy,
        })
    }

    fn input(&mut self, input: Input) -> Result<bool> {
        match input {
            Input::Quit => return Ok(false),
            Input::Service(line) => {
                // Keyboard and other host→guest scalar events.
                self.surface.svc_push(line);
            }
            Input::OpenPath(path) => {
                // Native file-dialog result. Same Product open path as CLI /
                // Open With / guest cmdOpen — RequestPhase is legal here
                // (input processing, before the tick's guest frame).
                self.current.handle_command(
                    &self.surface,
                    RequestPhase::before_guest_frame(),
                    Command::Open(path),
                );
            }
            Input::Resize(w, h, scale) => {
                self.viewport = (w, h);
                self.dpi_scale = if scale > 0.0 { scale } else { 1.0 };
                self.surface.with_ui(|ui| ui.set_viewport(w as f32, h as f32));
                self.guest.eval(
                    "resize",
                    &format!("globalThis.__pocketResizeViewport?.({w},{h})"),
                )?;
                self.surface.svc_push(
                    json!({"t":"resize","w":w,"h":h,"scale":self.dpi_scale}).to_string(),
                );
            }
        }
        Ok(true)
    }

    fn tick(&mut self) -> Result<()> {
        self.offload.begin_frame();
        // Process guest commands: the guest sends command JSON lines via
        // svcSend. Drain and process them before the guest frame. Each
        // command gets its own RequestPhase token (consumed by open).
        for line in self.surface.svc_drain().into_iter().take(64) {
            log::debug!("guest svc: {line}");
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                if val.get("t").and_then(|v| v.as_str()) == Some("pv") {
                    let cmd_name = val.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
                    if cmd_name == "pick-file" {
                        // Host plumbing only: ask the UI thread for a dialog.
                        // The chosen path returns as Input::OpenPath and is
                        // opened through the same CurrentItem pipeline.
                        if let Err(e) = self.proxy.send_event(Wake::PickFile) {
                            log::warn!("pick-file wake failed: {e}");
                        }
                    } else if let Some(cmd) = parse_command(&val) {
                        self.current.handle_command(&self.surface, RequestPhase::before_guest_frame(), cmd);
                    }
                }
            }
        }
        self.guest.frame(0)?;
        self.surface.tick();
        // Release boundary (PICOVIEW-LAST-GOOD-PUBLICATION-1-CORRECTIVE-1).
        // The guest turn is complete: svcPoll delivered every svc event
        // queued before this frame, the frame's commits landed in it, and
        // surface.tick rebuilt the draw list the renderer will read. Every
        // superseded publication was replaced by an event observed before
        // that frame — and the guest's turn renders only the FINAL
        // publication it observed (`guest/turn.ts`, CORRECTIVE-2), so that
        // frame's binding has really stopped resolving the superseded
        // handle. Freeing it here therefore cannot open a stale-handle hole,
        // and this runs strictly before render, so no submitted frame can
        // resolve a freed handle. This is the only place a Current Item
        // texture is ever freed.
        self.current
            .release_superseded(&self.surface, ObservationBoundary::after_guest_frame());
        self.ticks += 1;
        Ok(())
    }

    fn hash(&mut self) -> u64 {
        self.surface
            .with_ui(|ui| fnv1a64(&ui.draw().words) ^ ui.raster_revision().rotate_left(7))
    }
}

fn text_worker(pak: Vec<u8>) -> OffloadWorker {
    OffloadWorker::spawn(move || {
        let mut engine = pocket_text::Engine::new();
        engine.load_pak(&pak);
        move |record: &str| engine.reply(record)
    })
}

struct OutputPermit(Arc<std::sync::atomic::AtomicBool>);
impl OutputPermit {
    fn acquire(available: &Arc<std::sync::atomic::AtomicBool>) -> Option<Self> {
        use std::sync::atomic::Ordering;
        available
            .compare_exchange(true, false, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| Self(available.clone()))
    }
}
impl Drop for OutputPermit {
    fn drop(&mut self) {
        self.0
            .store(true, std::sync::atomic::Ordering::Release);
    }
}

struct Output {
    _permit: OutputPermit,
    tick: u64,
    target: Option<Arc<gpu::Target>>,
}

fn run_runtime(
    args: Args,
    inputs: Receiver<Input>,
    outputs: SyncSender<Output>,
    proxy: EventLoopProxy<Wake>,
    gpu: Arc<pocket3d::gpu::Gpu>,
    initial_scale: f64,
) -> Result<()> {
    use std::sync::atomic::AtomicBool;
    let available = Arc::new(AtomicBool::new(true));
    let mut renderer = gpu::Renderer::new(gpu);
    let mut runtime = Runtime::boot(&args, initial_scale, proxy.clone())?;
    let mut hash = None;
    let mut deadline = Instant::now();
    // Fixed tick order (PICOVIEW-LAST-GOOD-PUBLICATION-1-CORRECTIVE-1):
    //   1. input/request processing      — the only legal Product open phase
    //                                     (besides boot) — BEFORE_GUEST_FRAME;
    //                                     a future open trigger constructs
    //                                     `RequestPhase::before_guest_frame()`
    //                                     exactly here, and nowhere else;
    //   2. Runtime::tick                 — guest.frame observes everything
    //                                     queued, surface.tick rebuilds the
    //                                     draw list, then the release boundary
    //                                     frees superseded publications;
    //   3. hash + renderer.render        — read/consume that draw list.
    // Current Item textures are freed ONLY inside step 2, so no draw list
    // step 3 consumes can reference a freed handle. A commit inside the
    // guest turn or between it and the boundary requires fabricating a
    // `RequestPhase` — a named, greppable misuse — so every queued handle's
    // replacing event is always observed by a frame that completes before
    // the boundary that frees it.
    loop {
        for input in inputs.try_iter().take(256) {
            if !runtime.input(input)? {
                return Ok(());
            }
        }
        runtime.tick()?;
        let next = runtime.hash();
        if hash != Some(next)
            && let Some(permit) = OutputPermit::acquire(&available)
        {
            let target = renderer.render(
                &runtime.surface,
                (runtime.viewport.0 * runtime.density, runtime.viewport.1 * runtime.density),
                runtime.density as f32,
            )?;
            tlog(&format!("render submit (tick {})", runtime.ticks));
            let rendered = target.is_some();
            let output = Output {
                _permit: permit,
                tick: runtime.ticks,
                target,
            };
            match outputs.try_send(output) {
                Ok(()) => {
                    if rendered {
                        hash = Some(next);
                    }
                    let _ = proxy.send_event(Wake::Output);
                }
                Err(std::sync::mpsc::TrySendError::Full(output)) => {
                    drop(output);
                }
                Err(_) => return Ok(()),
            }
        }
        deadline += Duration::from_nanos(1_000_000_000 / 60);
        if let Some(wait) = deadline.checked_duration_since(Instant::now()) {
            std::thread::sleep(wait);
        } else {
            deadline = Instant::now();
        }
    }
}

struct RuntimeStartup {
    args: Args,
    inputs: Receiver<Input>,
    outputs: SyncSender<Output>,
    proxy: EventLoopProxy<Wake>,
    /// Measured after the window exists; 1.0 until `resumed` fills it.
    initial_scale: f64,
}

struct Host {
    window: Option<Arc<Window>>,
    surface: Option<gpu::Presentation>,
    startup: Option<RuntimeStartup>,
    tx: SyncSender<Input>,
    rx: Receiver<Output>,
    frame: Option<(u64, Arc<gpu::Target>)>,
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
        let presentation = match gpu::Presentation::new(window.clone()) {
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
        // Real OS scale for hello / 100% math — not a 1.0 placeholder.
        let measured = window.scale_factor();
        startup.initial_scale = if measured > 0.0 { measured } else { 1.0 };
        tlog(&format!(
            "window scale_factor = {} (hello dpi)",
            startup.initial_scale
        ));
        let RuntimeStartup {
            args,
            inputs,
            outputs,
            proxy,
            initial_scale,
        } = startup;
        if let Err(error) = std::thread::Builder::new()
            .name("picoview-runtime".into())
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    run_runtime(args, inputs, outputs, proxy.clone(), gpu, initial_scale)
                }))
                .unwrap_or_else(|_| Err(anyhow!("Runtime worker panicked")));
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
                        tlog(&format!(
                            "frame ready from worker (tick {})",
                            output.tick
                        ));
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
    fn window_event(&mut self, event_loop: &ActiveEventLoop, _: WindowId, event: winit::event::WindowEvent) {
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
                    winit::event::MouseScrollDelta::LineDelta(_, y) => {
                        -(y as f64) * 24.0
                    }
                    winit::event::MouseScrollDelta::PixelDelta(p) => -p.y,
                };
                // Coalesce nothing here; guest accumulates high-res deltas.
                // x/y = latest logical pointer known by the host so wheel zoom
                // stays pointer-anchored even when CursorMoved is not in this
                // turn (PR61-CORRECTIVE-1 MAJOR-B).
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
                let size = window.inner_size();
                let logical = (
                    (size.width as f64 / scale_factor)
                        .round()
                        .clamp(PRODUCT_MIN_CLIENT_W, 4096.0) as u32,
                    (size.height as f64 / scale_factor)
                        .round()
                        .clamp(PRODUCT_MIN_CLIENT_H, 4096.0) as u32,
                );
                self.tx
                    .try_send(Input::Resize(logical.0, logical.1, scale_factor))
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
                // Per-Monitor DPI V2: the runtime viewport is logical pixels;
                // physical client size is the presentation surface's business.
                let scale = self.window.as_ref().unwrap().scale_factor();
                let logical = (
                    (size.width as f64 / scale)
                        .round()
                        .clamp(PRODUCT_MIN_CLIENT_W, 4096.0) as u32,
                    (size.height as f64 / scale)
                        .round()
                        .clamp(PRODUCT_MIN_CLIENT_H, 4096.0) as u32,
                );
                self.tx
                    .try_send(Input::Resize(logical.0, logical.1, scale))
                    .ok();
                self.window.as_ref().unwrap().request_redraw();
            }
            _ => {}
        }
    }
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
    let (tx, inputs) = sync_channel(256);
    let (outputs, rx) = sync_channel(1);
    let mut host = Host {
        window: None,
        surface: None,
        startup: None,
        tx,
        rx,
        frame: None,
        title: args.title.clone(),
        viewport: args.viewport,
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
        proxy: event_loop.create_proxy(),
        initial_scale: 1.0,
    });
    event_loop.run_app(&mut host)?;
    if let Some(error) = host.failure {
        return Err(anyhow!(error));
    }
    Ok(())
}

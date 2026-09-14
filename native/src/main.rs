//! PicoView native host (V1).
//!
//! Process shape follows the PocketJS portable desktop runtime: a winit window
//! thread owns presentation, a runtime worker owns the UiSurface + QuickJS
//! guest and ticks at 60 Hz. PicoView adds the product seam on top: the
//! Current Item authority (explicit path → WIC decode → native texture →
//! bounded svc publication) lives in `current_item.rs`.
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
use winit::event_loop::{ActiveEventLoop, EventLoop, EventLoopProxy};
use winit::window::{Window, WindowId};

mod current_item;
mod gpu;
use current_item::CurrentItem;

const HOST_ID: &str = "windows-app";
const HOST_ABI: u32 = 4;

#[derive(Debug)]
enum Wake {
    Output,
    Exit(Option<String>),
}

struct Args {
    image: Option<PathBuf>,
    js: PathBuf,
    pak: PathBuf,
    title: String,
    viewport: (u32, u32),
    density: u32,
}

fn parse_args() -> Result<Args> {
    let mut image = None;
    let mut js = PathBuf::from("dist/picoview.js");
    let mut pak = PathBuf::from("dist/picoview.pak");
    let mut title = "PicoView".to_string();
    let mut viewport = (960u32, 640u32);
    let mut density = 2u32;
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--js" => js = it.next().ok_or_else(|| anyhow!("--js needs a value"))?.into(),
            "--pak" => pak = it.next().ok_or_else(|| anyhow!("--pak needs a value"))?.into(),
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

enum Input {
    Quit,
    Resize(u32, u32),
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
    ticks: u64,
    /// Native Current Item truth. V1 opens exactly once at boot; nothing reads
    /// the field back yet, but it must outlive the process for the resource
    /// identity to stay native-owned.
    #[allow(dead_code)]
    current: CurrentItem,
}

impl Runtime {
    fn boot(args: &Args) -> Result<Self> {
        let pak = std::fs::read(&args.pak)
            .with_context(|| format!("missing pak {}", args.pak.display()))?;
        let source = std::fs::read_to_string(&args.js)
            .with_context(|| format!("missing js {}", args.js.display()))?;
        let surface = UiSurface::new_with_density(
            (args.viewport.0 as f32, args.viewport.1 as f32),
            args.density,
        );
        surface.set_identity(HOST_ID, HOST_ABI);
        surface.set_tick_rate(60);
        surface.feed_pak(&pak);
        let guest = Guest::new()?;
        surface.mount(&guest)?;
        let offload = text_worker(pak);
        offload.mount(&guest)?;
        guest.eval("picoview", &source)?;
        if !guest.has_frame() {
            return Err(anyhow!("bundle installed no frame handler"));
        }
        surface.svc_push(
            json!({"t":"hello","w":args.viewport.0,"h":args.viewport.1,"epoch":epoch_ms()})
                .to_string(),
        );
        let mut current = CurrentItem::new();
        if let Some(path) = &args.image {
            current.open(&surface, path);
            log::info!(
                "current item: generation={} handle={:?} path={}",
                current.generation(),
                current.live_handle(),
                path.display()
            );
        }
        Ok(Self {
            surface,
            guest,
            offload,
            viewport: args.viewport,
            density: args.density,
            ticks: 0,
            current,
        })
    }

    fn input(&mut self, input: Input) -> Result<bool> {
        match input {
            Input::Quit => return Ok(false),
            Input::Resize(w, h) => {
                self.viewport = (w, h);
                self.surface.with_ui(|ui| ui.set_viewport(w as f32, h as f32));
                self.guest.eval(
                    "resize",
                    &format!("globalThis.__pocketResizeViewport?.({w},{h})"),
                )?;
                self.surface
                    .svc_push(json!({"t":"resize","w":w,"h":h}).to_string());
            }
        }
        Ok(true)
    }

    fn tick(&mut self) -> Result<()> {
        self.offload.begin_frame();
        // The guest emits no requests in V1; drain defensively so a stray
        // svc line can never grow unbounded.
        for line in self.surface.svc_drain().into_iter().take(64) {
            log::debug!("guest svc: {line}");
        }
        self.guest.frame(0)?;
        self.surface.tick();
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
) -> Result<()> {
    use std::sync::atomic::AtomicBool;
    let available = Arc::new(AtomicBool::new(true));
    let mut renderer = gpu::Renderer::new(gpu);
    let mut runtime = Runtime::boot(&args)?;
    let mut hash = None;
    let mut deadline = Instant::now();
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
    /// Presentation bootstrap self-heal: for a short window after startup we
    /// re-present the retained target at a low cadence. The very first present
    /// can race the swapchain/DWM handoff on some drivers and land on a surface
    /// that never reaches the screen; because a static frame is hash-gated and
    /// never re-renders, the window would stay blank until an external resize.
    /// Re-presenting only blits the existing GPU target — no re-record, no UI
    /// tick — and the window goes fully quiet (ControlFlow::Wait) afterwards,
    /// so static idle still owns no continuous loop.
    heal_until: Option<Instant>,
}

const PRESENT_HEAL_WINDOW: Duration = Duration::from_millis(2500);
const PRESENT_HEAL_CADENCE: Duration = Duration::from_millis(200);

impl Host {
    fn present(&mut self) -> Result<()> {
        let (Some(surface), Some(window), Some(frame)) =
            (&mut self.surface, &self.window, &self.frame)
        else {
            return Ok(());
        };
        let (_, target) = frame;
        surface.present(window, target)?;
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
                        .with_inner_size(LogicalSize::new(self.viewport.0, self.viewport.1))
                        .with_resizable(true),
                )
                .expect("create window"),
        );
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
        let RuntimeStartup {
            args,
            inputs,
            outputs,
            proxy,
        } = self.startup.take().expect("runtime startup");
        if let Err(error) = std::thread::Builder::new()
            .name("picoview-runtime".into())
            .spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    run_runtime(args, inputs, outputs, proxy.clone(), gpu)
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
            Wake::Output => {
                while let Ok(output) = self.rx.try_recv() {
                    if let Some(target) = output.target {
                        self.frame = Some((output.tick, target));
                        if let Some(window) = &self.window {
                            window.request_redraw();
                        }
                    }
                }
            }
        }
    }
    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        if let Some(until) = self.heal_until {
            if Instant::now() < until {
                if let Some(window) = &self.window {
                    window.request_redraw();
                }
                event_loop.set_control_flow(winit::event_loop::ControlFlow::WaitUntil(
                    Instant::now() + PRESENT_HEAL_CADENCE,
                ));
                return;
            }
            self.heal_until = None;
        }
        event_loop.set_control_flow(winit::event_loop::ControlFlow::Wait);
    }
    fn window_event(&mut self, event_loop: &ActiveEventLoop, _: WindowId, event: winit::event::WindowEvent) {
        match event {
            winit::event::WindowEvent::CloseRequested => {
                self.tx.try_send(Input::Quit).ok();
                event_loop.exit();
            }
            winit::event::WindowEvent::RedrawRequested => {
                if let Err(error) = self.present() {
                    log::error!("{error}");
                    self.failure = Some(error.to_string());
                    event_loop.exit();
                }
            }
            winit::event::WindowEvent::Resized(size) => {
                // Per-Monitor DPI V2: the runtime viewport is logical pixels;
                // physical client size is the presentation surface's business.
                let scale = self.window.as_ref().unwrap().scale_factor();
                let logical = (
                    (size.width as f64 / scale).round().clamp(240.0, 4096.0) as u32,
                    (size.height as f64 / scale).round().clamp(180.0, 4096.0) as u32,
                );
                self.tx.try_send(Input::Resize(logical.0, logical.1)).ok();
                self.window.as_ref().unwrap().request_redraw();
            }
            _ => {}
        }
    }
}

fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
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
        heal_until: Some(Instant::now() + PRESENT_HEAL_WINDOW),
    };
    host.startup = Some(RuntimeStartup {
        args,
        inputs,
        outputs,
        proxy: event_loop.create_proxy(),
    });
    event_loop.run_app(&mut host)?;
    if let Some(error) = host.failure {
        return Err(anyhow!(error));
    }
    Ok(())
}

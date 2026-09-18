//! Runtime worker / guest execution authority.
//!
//! Owns the runtime worker thread: UiSurface + QuickJS guest lifecycle,
//! OffloadWorker, Input/Output/Wake protocol, presentation geometry stored
//! by runtime, RenderSignature demand identity, and render scheduling
//! decision. The window/event-loop authority lives in `app.rs`; native host
//! presentation plumbing lives in `presentation.rs`.

use crate::current_item::{Command, CurrentItem, ObservationBoundary, OpenIntent, RequestPhase};
use crate::presentation;
use anyhow::{Context as _, Result, anyhow};
use pocket_desktop_host::{
    PresentationGeometry, RenderSignature, ViewportPolicy, resolve_geometry,
};
use pocket_mod::Guest;
use pocket_ui_surface::UiSurface;
use pocket_ui_surface::offload::OffloadWorker;
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, SyncSender};
use std::time::{Duration, Instant};
use winit::event_loop::EventLoopProxy;

const HOST_ID: &str = "windows-app";
const HOST_ABI: u32 = 4;

#[derive(Debug)]
pub(crate) enum Wake {
    Output,
    Exit(Option<String>),
    /// Runtime asked the window thread to show the native Open File dialog.
    PickFile,
}

pub(crate) struct Args {
    pub image: Option<PathBuf>,
    /// Developer override for guest JS. `None` = embedded production assets.
    pub js: Option<PathBuf>,
    /// Developer override for guest PAK. `None` = embedded production assets.
    pub pak: Option<PathBuf>,
    pub title: String,
    pub viewport: (u32, u32),
    pub density: u32,
}

pub(crate) fn parse_args() -> Result<Args> {
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
                js = Some(
                    it.next()
                        .ok_or_else(|| anyhow!("--js needs a value"))?
                        .into(),
                );
            }
            "--pak" => {
                pak = Some(
                    it.next()
                        .ok_or_else(|| anyhow!("--pak needs a value"))?
                        .into(),
                );
            }
            "--title" => title = it.next().ok_or_else(|| anyhow!("--title needs a value"))?,
            "--viewport" => {
                let v = it
                    .next()
                    .ok_or_else(|| anyhow!("--viewport needs a value"))?;
                let (w, h) = v
                    .split_once('x')
                    .ok_or_else(|| anyhow!("--viewport expects WxH"))?;
                viewport = (w.parse()?, h.parse()?);
            }
            "--density" => {
                density = it
                    .next()
                    .ok_or_else(|| anyhow!("--density needs a value"))?
                    .parse()?
            }
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

pub(crate) enum Input {
    Quit,
    /// Live presentation facts from the window thread (shared R1 geometry).
    /// Physical client size is measured (`Window::inner_size` / `Resized`);
    /// never reconstructed as logical × scale / package density.
    /// PicoView presentation policy is **Dynamic**: runtime derives logical
    /// as `measured_physical / os_scale` via shared `resolve_geometry`.
    Presentation {
        measured_physical: (u32, u32),
        os_scale: f64,
    },
    /// Prebuilt svc JSON line pushed into the guest poll queue.
    Service(String),
    /// A path chosen by the native Open File dialog. Runtime maps this to
    /// the same Product `Command::Open` path as CLI / Open With / guest open.
    OpenPath(PathBuf),
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
    /// Host.viewport / CLI `--viewport`: **initial/default requested logical
    /// size** (`guest/pocket.json` `viewport.dynamic.default`, normally
    /// 960×640). Not frozen Product logical authority. Dynamic policy derives
    /// live logical from measured physical + OS scale.
    initial_requested_logical: (u32, u32),
    /// Shared R1 presentation snapshot (Dynamic logical + measured physical
    /// + live OS scale).
    geometry: PresentationGeometry,
    ticks: u64,
    /// Native Current Item truth.
    current: CurrentItem,
    /// Used to ask the window thread for UI-thread-only work (file dialog).
    proxy: EventLoopProxy<Wake>,
}

impl Runtime {
    fn boot(
        args: &Args,
        initial_geometry: PresentationGeometry,
        proxy: EventLoopProxy<Wake>,
    ) -> Result<Self> {
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
                (crate::assets::EMBEDDED_PAK.to_vec(), source)
            }
            (None, Some(pak_path)) => {
                let pak = std::fs::read(pak_path)
                    .with_context(|| format!("missing pak {}", pak_path.display()))?;
                (pak, crate::assets::EMBEDDED_JS.to_string())
            }
            (None, None) => (
                crate::assets::EMBEDDED_PAK.to_vec(),
                crate::assets::EMBEDDED_JS.to_string(),
            ),
        };
        let initial_requested_logical = args.viewport;
        let (logical_w, logical_h) = initial_geometry.logical();
        // Package density remains cook authority for the UiSurface rasterizer.
        // Live presentation scale is geometry.effective_render_scale().
        let surface =
            UiSurface::new_with_density((logical_w as f32, logical_h as f32), args.density);
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
        // Boot hello carries MEASURED live geometry + live OS scale — not a
        // 1.0 placeholder and not physical rebuilt as logical × density.
        let live_scale = initial_geometry.effective_render_scale() as f64;
        surface.svc_push(
            json!({
                "t":"hello",
                "w":logical_w,
                "h":logical_h,
                "scale":live_scale,
                "physical_w":initial_geometry.physical_w,
                "physical_h":initial_geometry.physical_h,
                "epoch":epoch_ms()
            })
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
        crate::tlog(&format!(
            "R1 runtime booted: policy=Dynamic initial_requested={}x{} logical={}x{} physical={}x{} live_scale={} package_density={}",
            initial_requested_logical.0,
            initial_requested_logical.1,
            logical_w,
            logical_h,
            initial_geometry.physical_w,
            initial_geometry.physical_h,
            live_scale,
            args.density
        ));
        Ok(Self {
            surface,
            guest,
            offload,
            initial_requested_logical,
            geometry: initial_geometry,
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
            Input::Presentation {
                measured_physical,
                os_scale,
            } => {
                // Dynamic policy: logical follows the live client
                // (measured physical ÷ OS scale). Host.viewport is only the
                // initial/default requested size — not frozen layout authority.
                self.geometry = resolve_geometry(
                    ViewportPolicy::Dynamic,
                    self.initial_requested_logical,
                    measured_physical,
                    os_scale,
                );
                let (w, h) = self.geometry.logical();
                self.surface
                    .with_ui(|ui| ui.set_viewport(w as f32, h as f32));
                self.guest.eval(
                    "resize",
                    &format!("globalThis.__pocketResizeViewport?.({w},{h})"),
                )?;
                self.surface.svc_push(
                    json!({
                        "t":"resize",
                        "w":w,
                        "h":h,
                        "scale":self.geometry.effective_render_scale(),
                        "physical_w":self.geometry.physical_w,
                        "physical_h":self.geometry.physical_h,
                    })
                    .to_string(),
                );
                crate::tlog(&format!(
                    "R1 presentation update: logical={}x{} physical={}x{} os_scale={}",
                    w, h, self.geometry.physical_w, self.geometry.physical_h, os_scale
                ));
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
                        self.current.handle_command(
                            &self.surface,
                            RequestPhase::before_guest_frame(),
                            cmd,
                        );
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

    fn signature(&mut self) -> RenderSignature {
        let (draw_hash, raster_revision) = self
            .surface
            .with_ui(|ui| (fnv1a64(&ui.draw().words), ui.raster_revision()));
        RenderSignature::from_geometry(draw_hash, raster_revision, self.geometry)
    }
}

fn text_worker(pak: Vec<u8>) -> OffloadWorker {
    OffloadWorker::spawn(move || {
        let mut engine = pocket_text::Engine::new();
        engine.load_pak(&pak);
        move |record: &str| engine.reply(record)
    })
}

pub(crate) struct OutputPermit(Arc<std::sync::atomic::AtomicBool>);
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
        self.0.store(true, std::sync::atomic::Ordering::Release);
    }
}

pub(crate) struct Output {
    pub _permit: OutputPermit,
    pub tick: u64,
    pub target: Option<Arc<presentation::Target>>,
}

pub(crate) fn run_runtime(
    args: Args,
    inputs: Receiver<Input>,
    outputs: SyncSender<Output>,
    proxy: EventLoopProxy<Wake>,
    gpu: Arc<pocket3d::gpu::Gpu>,
    initial_geometry: PresentationGeometry,
) -> Result<()> {
    use std::sync::atomic::AtomicBool;
    let available = Arc::new(AtomicBool::new(true));
    let mut renderer = presentation::Renderer::new(gpu);
    let mut runtime = Runtime::boot(&args, initial_geometry, proxy.clone())?;
    // Shared R1 demand identity. Committed only after a target is produced
    // and handed to the presenter — never on pool miss / render None /
    // channel backpressure — so retries are not suppressed.
    let mut signature: Option<RenderSignature> = None;
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
    //   3. signature + renderer.render   — read/consume that draw list using
    //                                     shared PresentationGeometry physical
    //                                     size + live scale.
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
        let next = runtime.signature();
        if signature != Some(next)
            && let Some(permit) = OutputPermit::acquire(&available)
        {
            let geo = runtime.geometry;
            crate::tlog(&format!(
                "R1 render request: logical={}x{} physical={}x{} live_scale={}",
                geo.logical_w,
                geo.logical_h,
                geo.physical_w,
                geo.physical_h,
                geo.effective_render_scale()
            ));
            let target = renderer.render(&runtime.surface, geo)?;
            crate::tlog(&format!("render submit (tick {})", runtime.ticks));
            let rendered = target.is_some();
            let output = Output {
                _permit: permit,
                tick: runtime.ticks,
                target,
            };
            match outputs.try_send(output) {
                Ok(()) => {
                    if rendered {
                        signature = Some(next);
                    }
                    let _ = proxy.send_event(Wake::Output);
                }
                Err(std::sync::mpsc::TrySendError::Full(output)) => {
                    // Backpressure: do not commit signature; retry later.
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

pub(crate) struct RuntimeStartup {
    pub args: Args,
    pub inputs: Receiver<Input>,
    pub outputs: SyncSender<Output>,
    pub proxy: EventLoopProxy<Wake>,
    /// Filled by `resumed` with Dynamic measured geometry. Placeholder is
    /// not product logical authority.
    pub initial_geometry: PresentationGeometry,
}

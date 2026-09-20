//! Runtime worker / guest execution authority.
//!
//! Owns the runtime worker thread: UiSurface + QuickJS guest lifecycle,
//! OffloadWorker, Input/Output/Wake protocol, presentation geometry stored
//! by runtime, RenderSignature demand identity, and render scheduling
//! decision. The window/event-loop authority lives in `app.rs`; native host
//! presentation plumbing lives in `presentation.rs`.

use crate::current_item::decode_policy_for_device;
use crate::current_item::{
    Command, CurrentItem, ObservationBoundary, OpenIntent, RequestPhase,
};
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

pub(crate) const HOST_ID: &str = "windows-app";
pub(crate) const HOST_ABI: u32 = 4;

/// Worker tick cadence: the guest frame/svc cadence the runtime keeps.
/// Named budget (C5); presentation coalescing relies on this staying a
/// 60 Hz-class cadence.
const WORKER_TICK_HZ: u64 = 60;
const WORKER_TICK_PERIOD: Duration = Duration::from_nanos(1_000_000_000 / WORKER_TICK_HZ);

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
    // Product default viewport derives from guest/pocket.json (build.rs);
    // Host.viewport is only the initial/default requested logical size.
    let mut viewport = crate::product_facts::default_viewport();
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

/// C8B budget classifier: a svc line is EXPENSIVE when it is a valid Product
/// command — every one of them triggers the open/decode/publish path
/// (Previous/Next navigate, Refresh re-opens, Open opens). `pick-file` is
/// cheap host plumbing (a UI-thread wake, no decode); malformed and
/// non-command lines are cheap. The classification parses the line and the
/// tick loop parses the processed lines again — svc lines are bounded tiny
/// JSON, never pixel data.
pub(crate) fn is_expensive_command_line(line: &str) -> bool {
    match serde_json::from_str::<serde_json::Value>(line) {
        Ok(val) => {
            val.get("t").and_then(|v| v.as_str()) == Some("pv")
                && parse_command(&val).is_some()
        }
        Err(_) => false,
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

/// R3 latest-wins coalescing for one worker input batch.
///
/// Consecutive `Input::Presentation` events collapse to the latest measured
/// physical + OS scale. Service / command / open / quit remain barriers: a
/// non-presentation input flushes any pending presentation first, so command
/// ordering still observes geometry that preceded the command. A trailing
/// resize is applied once at the end of the batch.
pub(crate) fn coalesce_presentation_batch(inputs: impl IntoIterator<Item = Input>) -> Vec<Input> {
    let mut out = Vec::new();
    let mut pending: Option<Input> = None;
    for input in inputs {
        match input {
            Input::Presentation { .. } => pending = Some(input),
            other => {
                if let Some(presentation) = pending.take() {
                    out.push(presentation);
                }
                out.push(other);
            }
        }
    }
    if let Some(presentation) = pending {
        out.push(presentation);
    }
    out
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
    /// Host-owned guest→host service lines awaiting their processing tick
    /// (retention after the surface's drain-all handoff).
    svc_pending: crate::svc_queue::SvcPending,
    /// Used to ask the window thread for UI-thread-only work (file dialog).
    proxy: EventLoopProxy<Wake>,
}

impl Runtime {
    fn boot(
        args: &Args,
        initial_geometry: PresentationGeometry,
        proxy: EventLoopProxy<Wake>,
        usable_image_dim: u32,
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
        // Export created-device image capability into PocketJS logical
        // admission AND into Product CurrentItem admission policy. The fact
        // is device.limits().max_texture_dimension_2d — never adapter-only
        // support, never a second GPU authority inside decode/Product.
        surface.with_ui(|ui| ui.set_image_max_texture_dim(usable_image_dim));
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
            item.set_admission_policy(decode_policy_for_device(usable_image_dim));
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
                "current item: generation={} handle={:?} path={} usable_image_dim={} policy={:?}",
                item.generation(),
                item.live_handle(),
                path.display(),
                usable_image_dim,
                item.admission_policy()
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
            let mut item = CurrentItem::new();
            item.set_admission_policy(decode_policy_for_device(usable_image_dim));
            item
        };
        crate::tlog(&format!(
            "R1 runtime booted: policy=Dynamic initial_requested={}x{} logical={}x{} physical={}x{} live_scale={} package_density={} usable_image_dim={}",
            initial_requested_logical.0,
            initial_requested_logical.1,
            logical_w,
            logical_h,
            initial_geometry.physical_w,
            initial_geometry.physical_h,
            live_scale,
            args.density,
            usable_image_dim
        ));
        Ok(Self {
            surface,
            guest,
            offload,
            initial_requested_logical,
            geometry: initial_geometry,
            ticks: 0,
            current,
            svc_pending: crate::svc_queue::SvcPending::new(),
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
                        // Single owner of the notches→logical-units factor:
                        // the guest consumes host truth instead of a copy.
                        "notch":crate::app::WHEEL_NOTCH_LOGICAL,
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
        // svcSend. svc_drain() empties the surface queue in one call, so the
        // host owns the tail it cannot process this tick: refill pending
        // storage, process at most MAX_SVC_LINES_PER_TICK lines, and leave
        // the rest queued for later ticks — FIFO, never silently dropped.
        let pending_before = self.svc_pending.len();
        self.svc_pending.refill(self.surface.svc_drain());
        if crate::svc_queue::crossed_high_water(pending_before, self.svc_pending.len()) {
            log::warn!(
                "svc pending queue crossed high-water mark: {} lines",
                self.svc_pending.len()
            );
        }
        // C8B decode-pressure budget (mechanism gate: C8A evidence): at most
        // MAX_SVC_EXPENSIVE_COMMANDS_PER_TICK decode-triggering commands run
        // per guest frame. Everything else is retained in FIFO order for
        // later ticks, so a burst cannot serialize its decodes into one turn
        // (measured 1.57s frame starvation / 2.48GB superseded residency)
        // and cannot silently lose its tail either.
        let batch = self.svc_pending.take_batch(crate::svc_queue::MAX_SVC_LINES_PER_TICK);
        let (process_now, retain) = crate::svc_queue::split_expensive_budget(
            batch,
            is_expensive_command_line,
        );
        self.svc_pending.refill_front(retain);
        for line in process_now {
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
    // Execution authority for image admission: the created device fact.
    // Adapter support alone is not sufficient.
    let usable_image_dim = gpu.device.limits().max_texture_dimension_2d;
    log::info!(
        "PicoView image capability: adapter_max_tex2d={} device_max_tex2d={}",
        gpu.adapter.limits().max_texture_dimension_2d,
        usable_image_dim
    );
    let mut renderer = presentation::Renderer::new(gpu);
    let mut runtime = Runtime::boot(&args, initial_geometry, proxy.clone(), usable_image_dim)?;
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
    //
    // R3 latest-wins: consecutive Presentation events coalesce to the latest
    // measured geometry before a guest tick (`coalesce_presentation_batch`).
    // Service/command/open remain barriers. No easing/spring — only obsolete
    // intermediate resize applications are dropped.
    loop {
        let batch: Vec<Input> = inputs.try_iter().take(256).collect();
        for input in coalesce_presentation_batch(batch) {
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
        deadline += WORKER_TICK_PERIOD;
        if let Some(wait) = deadline.checked_duration_since(Instant::now()) {
            std::thread::sleep(wait);
        } else {
            deadline = Instant::now();
        }
    }
}

/// R3 coalescing: consecutive Presentation events collapse to the latest.
#[cfg(test)]
mod tests {
    use super::{Input, coalesce_presentation_batch};
    use std::path::PathBuf;

    fn pres(w: u32, h: u32, scale: f64) -> Input {
        Input::Presentation {
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

    #[test]
    fn consecutive_resizes_coalesce_to_latest() {
        let batch = [pres(800, 600, 1.0), pres(900, 700, 1.0), pres(1200, 800, 1.25)];
        let applied = coalesce_presentation_batch(batch);
        assert_eq!(applied.len(), 1);
        assert!(is_pres_at(&applied[0], 1200, 800, 1.25));
    }

    #[test]
    fn service_between_resizes_is_a_barrier() {
        let batch = [
            pres(800, 600, 1.0),
            Input::Service(r#"{"t":"key","k":"0"}"#.into()),
            pres(1000, 700, 1.0),
        ];
        let applied = coalesce_presentation_batch(batch);
        assert_eq!(applied.len(), 3);
        assert!(is_pres_at(&applied[0], 800, 600, 1.0));
        assert!(matches!(&applied[1], Input::Service(line) if line.contains("key")));
        assert!(is_pres_at(&applied[2], 1000, 700, 1.0));
    }

    #[test]
    fn open_command_keeps_order_against_surrounding_resizes() {
        let batch = [
            pres(640, 480, 1.0),
            pres(700, 500, 1.0),
            Input::OpenPath(PathBuf::from(r"C:\img\a.jpg")),
            pres(900, 600, 1.5),
            pres(910, 610, 1.5),
        ];
        let applied = coalesce_presentation_batch(batch);
        assert_eq!(applied.len(), 3);
        assert!(is_pres_at(&applied[0], 700, 500, 1.0));
        assert!(matches!(&applied[1], Input::OpenPath(p) if p.ends_with("a.jpg")));
        assert!(is_pres_at(&applied[2], 910, 610, 1.5));
    }

    #[test]
    fn empty_and_presentation_only_batches() {
        assert!(coalesce_presentation_batch([]).is_empty());
        let applied = coalesce_presentation_batch([pres(1, 1, 1.0)]);
        assert_eq!(applied.len(), 1);
        assert!(is_pres_at(&applied[0], 1, 1, 1.0));
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

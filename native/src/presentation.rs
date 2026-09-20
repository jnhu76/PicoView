//! Native host presentation plumbing.
//!
//! PicoView does NOT own the renderer. PocketJS renders via the shared
//! `pocket-ui-wgpu` stack (`UiRenderer` records the UI, `BlitSet` presents
//! the retained target). This module owns only PicoView native host
//! presentation: retained targets, the Renderer adapter that calls
//! `pocket-ui-wgpu::UiRenderer`, swapchain configuration, and Exact/Transient
//! present selection.
//!
//! (Adapted from the PocketJS portable desktop host for PicoView's
//! single-package runtime — no AppSupervisor child surfaces.)
//!
//! Boundary note: PocketJS renders; PicoView native host presents.
//! - Live presentation geometry and Exact/Transient identity come from the
//!   shared `pocket-desktop-host` library (`PresentationGeometry`,
//!   `RenderSignature`, `BlitFilter`). This module is window/swapchain
//!   plumbing plus product-specific first-present recovery — not a PicoView
//!   renderer and not a second R1 geometry implementation.
use anyhow::Result;
use pocket_desktop_host::PresentationGeometry;
use pocket_ui_surface::UiSurface;
use pocket_ui_wgpu::{BlitFilter, BlitSet, UiRenderer};
use pocket3d::gpu::Gpu;
use std::sync::Arc;

const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const FRAME_TARGETS: usize = 3;

// --- PicoView-owned present-path policy (pure, unit-testable, C7) ---------
//
// These helpers carry the decisions PicoView owns on the present path. They
// are extracted as pure functions so the policy is directly testable without
// a GPU; production `present()` / `acquire_target()` call them.

/// Retained-target pool decision for one acquire.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PoolDecision {
    /// The pool's generation differs from the requested size: clear first.
    Reset,
    /// Reuse the free target at this index (no live lease holds it).
    Reuse(usize),
    /// Allocate one more target (pool is under its bounded cap).
    Create,
    /// Every target is leased and the pool is at cap: bounded backpressure.
    Backpressure,
}

/// True when the retained pool was built for a different size generation.
fn pool_needs_reset(frame_sizes: &[(u32, u32)], size: (u32, u32)) -> bool {
    frame_sizes.first().is_some_and(|first| *first != size)
}

/// Which free (strong_count == 1) slot to reuse, scanning FIFO order.
fn free_slot(strong_counts: &[usize]) -> Option<usize> {
    strong_counts.iter().position(|count| *count == 1)
}

fn acquire_decision(
    frame_sizes: &[(u32, u32)],
    strong_counts: &[usize],
    size: (u32, u32),
    cap: usize,
) -> PoolDecision {
    if pool_needs_reset(frame_sizes, size) {
        return PoolDecision::Reset;
    }
    match free_slot(strong_counts) {
        Some(index) => PoolDecision::Reuse(index),
        None if strong_counts.len() < cap => PoolDecision::Create,
        None => PoolDecision::Backpressure,
    }
}

/// Acquire-error recovery: Lost/Outdated means the swapchain no longer
/// matches (reconfigure + redraw); Timeout means this frame is late (redraw,
/// no reconfigure); anything else is fatal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AcquireRecovery {
    ReconfigureRedraw,
    Redraw,
    Fatal,
}

fn acquire_recovery(error: &wgpu::SurfaceError) -> AcquireRecovery {
    match error {
        wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated => AcquireRecovery::ReconfigureRedraw,
        wgpu::SurfaceError::Timeout => AcquireRecovery::Redraw,
        _ => AcquireRecovery::Fatal,
    }
}

/// Present-path reconfigure policy state.
///
/// The AMD first-present workaround is a BOUNDED ONE-SHOT: AMD Vulkan driver
/// 25.8.1 (evidence machine) has a state-dependent defect where the first
/// swapchain created on a freshly shown window reports presents as submitted
/// while DWM never composites them — the window stays blank and nothing
/// (present result, OUT_OF_DATE, SUBOPTIMAL) reports the failure. Recreating
/// the swapchain recovers. One-shot reconfigure immediately before the first
/// present; event-shaped, no timers. Product/platform workaround — not a
/// generic PocketJS rule. See
/// docs/history/mvp-2026-09/PICOVIEW-V1-OPEN-ONE-IMAGE-1-EVIDENCE.md §7.
/// The flag is consumed exactly once, on the first present, and never
/// re-arms; afterwards the only reconfigure trigger is a measured
/// client-size change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PresentPolicy {
    first_present_reconfigure: bool,
    configured_size: (u32, u32),
}

impl PresentPolicy {
    fn new(initial_size: (u32, u32)) -> Self {
        Self {
            first_present_reconfigure: true,
            configured_size: initial_size,
        }
    }

    /// One-shot consumption on the first present; live-size change
    /// afterwards. Returns true when the swapchain must reconfigure.
    fn begin_present(&mut self, live: (u32, u32)) -> bool {
        if self.first_present_reconfigure {
            self.first_present_reconfigure = false;
            return true;
        }
        if self.configured_size != live {
            self.configured_size = live;
            return true;
        }
        false
    }
}

/// Blit-cache identity policy: entries keyed by Weak target identity; dead
/// targets are pruned before lookup; a live identity match reuses its entry;
/// no match ⇒ the caller inserts. Generic over the entry payload so tests
/// can drive the exact identity semantics without a GPU.
fn blit_cache_position<K, E>(
    entries: &mut Vec<(std::sync::Weak<K>, E)>,
    key: &std::sync::Weak<K>,
    alive: impl Fn(&std::sync::Weak<K>) -> bool,
) -> Option<usize> {
    entries.retain(|(entry_key, _)| alive(entry_key));
    entries
        .iter()
        .position(|(entry_key, _)| std::sync::Weak::ptr_eq(entry_key, key))
}

pub struct Target {
    pub _texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub size: (u32, u32),
}
impl Target {
    fn new(gpu: &Gpu, size: (u32, u32)) -> Result<Self> {
        let limit = gpu.device.limits().max_texture_dimension_2d;
        anyhow::ensure!(
            size.0 > 0 && size.1 > 0 && size.0 <= limit && size.1 <= limit,
            "GPU target exceeds device limits: {size:?}"
        );
        let texture = gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("PicoView retained render target"),
            size: wgpu::Extent3d {
                width: size.0,
                height: size.1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&Default::default());
        Ok(Self {
            _texture: texture,
            view,
            size,
        })
    }
}

pub struct Renderer {
    gpu: Arc<Gpu>,
    shell: UiRenderer,
    frames: Vec<Arc<Target>>,
}
impl Renderer {
    pub fn new(gpu: Arc<Gpu>) -> Self {
        Self {
            shell: UiRenderer::new(&gpu, FORMAT),
            gpu,
            frames: Vec::new(),
        }
    }
    fn acquire_target(&mut self, size: (u32, u32)) -> Result<Option<Arc<Target>>> {
        let decision = acquire_decision(
            &self.frames.iter().map(|frame| frame.size).collect::<Vec<_>>(),
            &self
                .frames
                .iter()
                .map(|frame| Arc::strong_count(frame))
                .collect::<Vec<_>>(),
            size,
            FRAME_TARGETS,
        );
        match decision {
            PoolDecision::Reset => {
                self.frames.clear();
                self.frames.push(Arc::new(Target::new(&self.gpu, size)?));
                let index = self.frames.len() - 1;
                Ok(Some(self.frames[index].clone()))
            }
            PoolDecision::Reuse(index) => Ok(Some(self.frames[index].clone())),
            PoolDecision::Create => {
                self.frames.push(Arc::new(Target::new(&self.gpu, size)?));
                let index = self.frames.len() - 1;
                Ok(Some(self.frames[index].clone()))
            }
            // Bounded backpressure; the next tick supplies the latest state.
            PoolDecision::Backpressure => Ok(None),
        }
    }
    /// A target remains leased until presentation has submitted its sampling
    /// commands. Shared queue ordering then makes reuse safe without readback
    /// or waiting for GPU completion on either CPU thread. Callers gate on the
    /// shared RenderSignature so static frames present the retained GPU image
    /// without re-recording.
    ///
    /// R1 Corrective A: `geometry.physical()` is measured live client size —
    /// never `logical × package_density`. `live_scale` is the effective f32
    /// passed to `render_words_scaled` (presentation authority). Package
    /// raster density remains cook authority for fonts/assets only.
    pub fn render(
        &mut self,
        surface: &UiSurface,
        geometry: PresentationGeometry,
    ) -> Result<Option<Arc<Target>>> {
        let size = geometry.physical();
        let live_scale = geometry.effective_render_scale();
        let Some(frame) = self.acquire_target(size)? else {
            return Ok(None);
        };
        let mut encoder = self
            .gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("PicoView runtime frame"),
            });
        surface.with_ui(|ui| {
            let words = ui.draw().words.clone();
            self.shell.render_words_scaled(
                &self.gpu,
                ui,
                &words,
                &mut encoder,
                &frame.view,
                size,
                live_scale,
                wgpu::LoadOp::Clear(wgpu::Color::BLACK),
            )
        })?;
        self.gpu.queue.submit([encoder.finish()]);
        Ok(Some(frame))
    }
}

pub struct Presentation {
    pub gpu: Arc<Gpu>,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    /// Cached Exact+Transient blit pair per retained Target (R1 Corrective B).
    blits: Vec<(std::sync::Weak<Target>, BlitSet)>,
    /// Present-path reconfigure policy (AMD one-shot + live-size tracking).
    policy: PresentPolicy,
}
impl Presentation {
    pub fn new(window: Arc<winit::window::Window>) -> Result<Self> {
        let instance = Gpu::new_instance();
        let surface = instance.create_surface(window.clone())?;
        let gpu = Arc::new(Gpu::from_instance_for_surface_with_power_preference(
            instance,
            &surface,
            wgpu::PowerPreference::LowPower,
        )?);
        let caps = surface.get_capabilities(&gpu.adapter);
        // Encoded byte-space color matches package colors and the portable
        // rasterizer. Avoid an additional sRGB conversion on final presentation.
        let format = [
            wgpu::TextureFormat::Bgra8Unorm,
            wgpu::TextureFormat::Rgba8Unorm,
        ]
        .into_iter()
        .find(|format| caps.formats.contains(format))
        .ok_or_else(|| anyhow::anyhow!("GPU surface has no portable 8-bit color format"))?;
        // Initial swapchain uses the measured client size at window create.
        let size = window.inner_size();
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: size.width.max(1),
            height: size.height.max(1),
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 1,
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            view_formats: vec![],
        };
        surface.configure(&gpu.device, &config);
        let info = gpu.adapter.get_info();
        log::info!(
            "PicoView GPU: {:?} / {} / {:?}",
            info.backend,
            info.name,
            format
        );
        crate::tlog(&format!(
            "surface created+configured {}x{} ({info:?}, present Fifo, latency 1)",
            config.width, config.height
        ));
        let policy = PresentPolicy::new((config.width, config.height));
        Ok(Self {
            gpu,
            surface,
            config,
            blits: Vec::new(),
            policy,
        })
    }
    pub fn present(
        &mut self,
        window: &winit::window::Window,
        target: &Arc<Target>,
    ) -> Result<bool> {
        // Presentation authority: measured live physical client size.
        let size = window.inner_size();
        if size.width == 0 || size.height == 0 {
            return Ok(false);
        }
        let live = (size.width, size.height);
        // One-shot AMD first-present recovery, then live-size reconfigures
        // (see PresentPolicy and the struct Presentation docs above).
        if self.policy.begin_present(live) {
            crate::tlog("present reconfigure: policy requested it (first-present one-shot or size change)");
            self.config.width = live.0;
            self.config.height = live.1;
            self.surface.configure(&self.gpu.device, &self.config);
        }
        let swapchain = (self.config.width, self.config.height);
        // Shared R1 policy: Exact/Nearest when retained target equals live
        // swapchain; Transient/Linear only as a size bridge. No easing.
        let policy = BlitFilter::select(target.size, swapchain);
        crate::tlog(&format!(
            "R1 present: retained={}x{} swapchain={}x{} policy={:?} filter={:?}",
            target.size.0,
            target.size.1,
            swapchain.0,
            swapchain.1,
            policy,
            policy.wgpu_filter()
        ));
        let output = match self.surface.get_current_texture() {
            Ok(output) => output,
            Err(error @ (wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated)) => {
                crate::tlog("acquire failed (Lost/Outdated) -> reconfigure + redraw");
                debug_assert_eq!(
                    acquire_recovery(&error),
                    AcquireRecovery::ReconfigureRedraw
                );
                self.surface.configure(&self.gpu.device, &self.config);
                window.request_redraw();
                return Ok(false);
            }
            Err(error @ wgpu::SurfaceError::Timeout) => {
                crate::tlog("acquire failed (Timeout) -> redraw");
                debug_assert_eq!(acquire_recovery(&error), AcquireRecovery::Redraw);
                window.request_redraw();
                return Ok(false);
            }
            Err(error) => {
                debug_assert_eq!(acquire_recovery(&error), AcquireRecovery::Fatal);
                return Err(error.into());
            }
        };
        // Weak identities retain bind groups without leasing a frame from the
        // worker's bounded pool. Prune dead targets, reuse the entry for this
        // target identity, insert only for a new identity (see
        // blit_cache_position). Filter policy is selected per present from
        // live sizes — not frozen.
        let key = std::sync::Arc::downgrade(target);
        let index = blit_cache_position(&mut self.blits, &key, |entry| {
            entry.strong_count() > 0
        });
        let index = match index {
            Some(index) => index,
            None => {
                let blits = BlitSet::new(&self.gpu, &target.view, self.config.format, false);
                self.blits.push((key, blits));
                self.blits.len() - 1
            }
        };
        let view = output.texture.create_view(&Default::default());
        let mut encoder = self
            .gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("PicoView present"),
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("PicoView present"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            self.blits[index].1.draw(&mut pass, policy);
        }
        self.gpu.queue.submit([encoder.finish()]);
        window.pre_present_notify();
        output.present();
        crate::tlog("swapchain present submitted");
        Ok(true)
    }
}

/// Shared-library Dynamic R1 consumption (PICOVIEW-63-R1-CONSUME-SUBTREE-CORRECTIVE-1).
/// PicoView is a Dynamic viewport product; logical follows live client size.
#[cfg(test)]
mod tests {
    use pocket_desktop_host::{
        DESKTOP_DYNAMIC_MIN, PresentationGeometry, RenderSignature, ViewportPolicy,
        resolve_geometry,
    };
    use pocket_ui_wgpu::BlitFilter;

    /// A. Dynamic resize @100%: logical follows measured physical; signature changes.
    #[test]
    fn dynamic_resize_at_100_follows_measured_physical() {
        let before = resolve_geometry(ViewportPolicy::Dynamic, (960, 640), (960, 640), 1.0);
        assert_eq!(before.logical(), (960, 640));
        assert_eq!(before.physical(), (960, 640));
        let after = resolve_geometry(ViewportPolicy::Dynamic, (960, 640), (1200, 800), 1.0);
        assert_eq!(after.logical(), (1200, 800));
        assert_eq!(after.physical(), (1200, 800));
        assert_eq!(after.effective_render_scale(), 1.0f32);
        let sig_before = RenderSignature::from_geometry(1, 2, before);
        let sig_after = RenderSignature::from_geometry(1, 2, after);
        assert_ne!(sig_before, sig_after);
        assert!(sig_after.needs_rerender(Some(sig_before)));
    }

    /// B. Dynamic shrink @100%.
    #[test]
    fn dynamic_shrink_at_100_follows_measured_physical() {
        let geo = resolve_geometry(ViewportPolicy::Dynamic, (960, 640), (600, 400), 1.0);
        assert_eq!(geo.logical(), (600, 400));
        assert_eq!(geo.physical(), (600, 400));
        assert_eq!(geo.effective_render_scale(), 1.0f32);
    }

    /// C. DPI geometry: same logical 960×640 from scaled physical measurements.
    #[test]
    fn dynamic_dpi_geometry_derives_logical_from_measured_scale() {
        let cases = [
            ((1200u32, 800u32), 1.25f64),
            ((1440, 960), 1.50),
            ((1920, 1280), 2.00),
        ];
        for (physical, scale) in cases {
            let geo = resolve_geometry(ViewportPolicy::Dynamic, (960, 640), physical, scale);
            assert_eq!(
                geo.logical(),
                (960, 640),
                "physical={physical:?} scale={scale}"
            );
            assert_eq!(geo.physical(), physical);
            assert_eq!(geo.effective_render_scale(), scale as f32);
        }
    }

    /// Host.viewport / CLI --viewport is initial/default requested logical
    /// size only — Dynamic ignores it for live logical derivation.
    #[test]
    fn dynamic_ignores_initial_requested_for_live_logical() {
        let geo = resolve_geometry(ViewportPolicy::Dynamic, (500, 300), (1200, 800), 1.0);
        assert_eq!(geo.logical(), (1200, 800));
        assert_ne!(geo.logical(), (500, 300));
    }

    /// Shared Dynamic floor remains platform capability (240×180); product
    /// min 384×240 is enforced by PicoView window/product contract (app.rs).
    #[test]
    fn shared_dynamic_floor_stays_pocketjs_platform_min() {
        assert_eq!(DESKTOP_DYNAMIC_MIN, (240, 180));
        let geo = resolve_geometry(ViewportPolicy::Dynamic, (960, 640), (200, 100), 2.0);
        assert_eq!(geo.logical(), DESKTOP_DYNAMIC_MIN);
        // Measured physical authority is not clamped into logical range.
        assert_eq!(geo.physical(), (200, 100));
    }

    /// E. Exact presentation remains when retained target == measured swapchain.
    #[test]
    fn exact_present_when_retained_matches_swapchain() {
        let geo = resolve_geometry(ViewportPolicy::Dynamic, (960, 640), (1200, 800), 1.0);
        assert!(geo.is_exact_present((1200, 800)));
        assert_eq!(
            BlitFilter::select(geo.physical(), (1200, 800)),
            BlitFilter::Exact
        );
        assert_eq!(
            BlitFilter::select(geo.physical(), (1200, 800)).wgpu_filter(),
            wgpu::FilterMode::Nearest
        );
        assert!(!geo.is_exact_present((960, 640)));
        assert_eq!(
            BlitFilter::select(geo.physical(), (960, 640)),
            BlitFilter::Transient
        );
        assert_eq!(
            BlitFilter::select(geo.physical(), (960, 640)).wgpu_filter(),
            wgpu::FilterMode::Linear
        );
    }

    /// RenderSignature still carries physical + effective scale bits.
    #[test]
    fn signature_includes_physical_and_effective_scale() {
        let geo = PresentationGeometry::from_live((960, 640), (1440, 960), 1.5);
        let a = RenderSignature::from_geometry(1, 2, geo);
        let b = RenderSignature::new(1, 2, (1440, 960), 1.5);
        assert_eq!(a, b);
        let resized = PresentationGeometry::from_live((1200, 800), (1200, 800), 1.0);
        assert_ne!(a, RenderSignature::from_geometry(1, 2, resized));
    }

    // --- PicoView-owned present-path policy (C7) --------------------------

    use super::{
        AcquireRecovery, PoolDecision, PresentPolicy, acquire_decision, acquire_recovery,
        blit_cache_position, free_slot, pool_needs_reset,
    };

    #[test]
    fn pool_resets_only_on_size_generation_change() {
        assert!(pool_needs_reset(&[(960, 640)], (1200, 800)));
        assert!(!pool_needs_reset(&[(960, 640), (960, 640)], (960, 640)));
        assert!(!pool_needs_reset(&[], (960, 640)));
    }

    #[test]
    fn pool_reuses_a_free_slot_and_never_a_leased_one() {
        let counts = [1, 2, 1];
        assert_eq!(free_slot(&counts), Some(0));
        assert_eq!(free_slot(&[2, 2]), None);
        // Strong count 1 means the pool is the only owner (unleased);
        // count 2 means presentation still holds the lease.
        assert_eq!(
            acquire_decision(&[(960, 640); 3], &[2, 2, 1], (960, 640), 3),
            PoolDecision::Reuse(2)
        );
    }

    #[test]
    fn pool_creates_under_cap_and_applies_backpressure_at_cap() {
        assert_eq!(
            acquire_decision(&[(960, 640)], &[2], (960, 640), 3),
            PoolDecision::Create
        );
        assert_eq!(
            acquire_decision(&[(960, 640); 3], &[2, 2, 2], (960, 640), 3),
            PoolDecision::Backpressure
        );
    }

    #[test]
    fn pool_reset_decision_wins_over_reuse_and_create() {
        assert_eq!(
            acquire_decision(&[(960, 640); 3], &[1, 1, 1], (1200, 800), 3),
            PoolDecision::Reset
        );
    }

    #[test]
    fn acquire_error_recovery_classes() {
        assert_eq!(
            acquire_recovery(&wgpu::SurfaceError::Lost),
            AcquireRecovery::ReconfigureRedraw
        );
        assert_eq!(
            acquire_recovery(&wgpu::SurfaceError::Outdated),
            AcquireRecovery::ReconfigureRedraw
        );
        assert_eq!(
            acquire_recovery(&wgpu::SurfaceError::Timeout),
            AcquireRecovery::Redraw
        );
        assert_eq!(
            acquire_recovery(&wgpu::SurfaceError::OutOfMemory),
            AcquireRecovery::Fatal
        );
        assert_eq!(
            acquire_recovery(&wgpu::SurfaceError::Other),
            AcquireRecovery::Fatal
        );
    }

    #[test]
    fn amd_first_present_reconfigure_is_a_bounded_one_shot() {
        let mut policy = PresentPolicy::new((960, 640));
        // First present: one-shot consumed exactly once.
        assert!(policy.begin_present((960, 640)));
        assert!(!policy.begin_present((960, 640)));
        assert!(!policy.begin_present((960, 640)));
        // Never re-arms, even after size changes (those reconfigure through
        // the live-size path instead).
        assert!(policy.begin_present((1200, 800)));
        assert!(!policy.begin_present((1200, 800)));
        assert!(!policy.begin_present((1200, 800)));
    }

    #[test]
    fn reconfigure_tracks_measured_client_size_after_the_one_shot() {
        let mut policy = PresentPolicy::new((960, 640));
        assert!(policy.begin_present((960, 640)));
        assert!(policy.begin_present((1920, 1080)));
        assert!(!policy.begin_present((1920, 1080)));
        assert!(policy.begin_present((1280, 720)));
        assert!(!policy.begin_present((1280, 720)));
    }

    #[test]
    fn blit_cache_prunes_dead_identities_and_reuses_live_ones() {
        use std::sync::{Arc, Weak};
        let a = Arc::new(());
        let b = Arc::new(());
        let mut entries: Vec<(Weak<()>, u32)> = vec![
            (Arc::downgrade(&a), 10),
            (Arc::downgrade(&b), 20),
        ];
        drop(a); // first identity is dead now

        let lookup_dead_only = Arc::new(());
        // Prune removes the dead entry; a foreign live key does not match.
        let key = Arc::downgrade(&b);
        assert_eq!(
            blit_cache_position(&mut entries, &key, |k| k.strong_count() > 0),
            Some(0)
        );
        assert_eq!(entries.len(), 1, "dead identity pruned before lookup");
        let foreign = Arc::downgrade(&lookup_dead_only);
        assert_eq!(
            blit_cache_position(&mut entries, &foreign, |k| k.strong_count() > 0),
            None,
            "no match ⇒ caller inserts a new entry"
        );
        // Pointer identity, not value equality: the unit payload (10/20) is
        // irrelevant to identity.
        assert_eq!(
            blit_cache_position(&mut entries, &key, |k| k.strong_count() > 0),
            Some(0)
        );
    }
}

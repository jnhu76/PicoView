//! GPU resources stay outside the guest ABI. The runtime worker records and
//! submits rendering; the window thread presents a retained GPU image.
//! (Adapted from the PocketJS portable desktop host for PicoView's
//! single-package runtime — no AppSupervisor child surfaces.)
//!
//! Boundary note: PocketJS renders; PicoView host presents.
//! - All actual rendering is the shared `pocket-ui-wgpu` stack
//!   (`UiRenderer` records the UI, `BlitSet` presents the retained target).
//! - Live presentation geometry and Exact/Transient identity come from the
//!   shared `pocket-desktop-host` library (`PresentationGeometry`,
//!   `RenderSignature`, `BlitFilter`). This module is window/swapchain
//!   plumbing plus product-specific first-present recovery — not a PicoView
//!   renderer and not a second R1 geometry implementation.
use anyhow::Result;
use pocket_desktop_host::PresentationGeometry;
use pocket_ui_wgpu::{BlitFilter, BlitSet, UiRenderer};
use pocket3d::gpu::Gpu;
use pocket_ui_surface::UiSurface;
use std::sync::Arc;

const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const FRAME_TARGETS: usize = 3;

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
        Ok(Self { _texture: texture, view, size })
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
        if self.frames.first().is_some_and(|frame| frame.size != size) {
            self.frames.clear();
        }
        let index = if let Some(i) = self
            .frames
            .iter()
            .position(|frame| Arc::strong_count(frame) == 1)
        {
            i
        } else if self.frames.len() < FRAME_TARGETS {
            self.frames.push(Arc::new(Target::new(&self.gpu, size)?));
            self.frames.len() - 1
        } else {
            return Ok(None); // bounded backpressure; the next tick supplies the latest state
        };
        Ok(Some(self.frames[index].clone()))
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
    /// AMD Vulkan driver 25.8.1 (this machine) has a state-dependent defect
    /// where the first swapchain created on a freshly shown window reports
    /// presents as submitted while DWM never composites them — the window
    /// stays blank and nothing (present result, OUT_OF_DATE, SUBOPTIMAL)
    /// reports the failure. Recreating the swapchain recovers. One-shot
    /// reconfigure immediately before the first present; event-shaped, no
    /// timers. Product/platform workaround — not a generic PocketJS rule.
    /// See docs/PICOVIEW-V1-OPEN-ONE-IMAGE-1-EVIDENCE.md §7.
    reconfigure_before_first_present: bool,
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
        Ok(Self {
            gpu,
            surface,
            config,
            blits: Vec::new(),
            reconfigure_before_first_present: true,
        })
    }
    pub fn present(&mut self, window: &winit::window::Window, target: &Arc<Target>) -> Result<bool> {
        // Presentation authority: measured live physical client size.
        let size = window.inner_size();
        if size.width == 0 || size.height == 0 {
            return Ok(false);
        }
        if self.reconfigure_before_first_present {
            self.reconfigure_before_first_present = false;
            crate::tlog("first-present recovery: reconfigure swapchain");
            self.surface.configure(&self.gpu.device, &self.config);
        }
        if (self.config.width, self.config.height) != (size.width, size.height) {
            crate::tlog(&format!(
                "surface reconfigure {}x{} -> {}x{}",
                self.config.width, self.config.height, size.width, size.height
            ));
            self.config.width = size.width;
            self.config.height = size.height;
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
            Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
                crate::tlog("acquire failed (Lost/Outdated) -> reconfigure + redraw");
                self.surface.configure(&self.gpu.device, &self.config);
                window.request_redraw();
                return Ok(false);
            }
            Err(wgpu::SurfaceError::Timeout) => {
                crate::tlog("acquire failed (Timeout) -> redraw");
                window.request_redraw();
                return Ok(false);
            }
            Err(error) => return Err(error.into()),
        };
        // Weak identities retain bind groups without leasing a frame from the
        // worker's bounded pool. Rebuild only when the pool changes on resize.
        // Filter policy is selected per present from live sizes — not frozen.
        self.blits.retain(|(frame, _)| frame.strong_count() > 0);
        let key = Arc::downgrade(target);
        let index = match self
            .blits
            .iter()
            .position(|(frame, _)| std::sync::Weak::ptr_eq(frame, &key))
        {
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
        resolve_geometry, PresentationGeometry, RenderSignature, ViewportPolicy,
        DESKTOP_DYNAMIC_MIN,
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
    /// min 384×240 is enforced by PicoView window/product contract (main.rs).
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
}

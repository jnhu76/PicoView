//! Current GPU image-capability probe (campaign evidence tool).
//!
//! Reports adapter / requested-policy / created-device limits on the SAME
//! PocketJS Gpu bootstrap path Desktop hosts use
//! (`pocket3d::gpu::Gpu` + `desktop_image_required_limits`).
//!
//! Historical pre-fix evidence (device stuck at 8192 under
//! `wgpu::Limits::default()`) lives in
//! `docs/history/corrective/PICOVIEW-ACTUAL-SIZE-CAPABILITY-1-BASELINE.md`.
//! This probe describes CURRENT behavior only.

use pocket3d::gpu::{Gpu, desktop_image_required_limits};

fn dump_limits(label: &str, limits: &wgpu::Limits) {
    println!("{label}.max_texture_dimension_2d = {}", limits.max_texture_dimension_2d);
    println!("{label}.max_texture_dimension_1d = {}", limits.max_texture_dimension_1d);
    println!("{label}.max_texture_array_layers = {}", limits.max_texture_array_layers);
    println!("{label}.max_buffer_size = {}", limits.max_buffer_size);
    println!("{label}.max_storage_buffer_binding_size = {}", limits.max_storage_buffer_binding_size);
    println!("{label}.max_uniform_buffer_binding_size = {}", limits.max_uniform_buffer_binding_size);
    println!("{label}.max_compute_workgroup_storage_size = {}", limits.max_compute_workgroup_storage_size);
    println!("{label}.max_bind_groups = {}", limits.max_bind_groups);
    println!("{label}.max_color_attachments = {}", limits.max_color_attachments);
}

fn main() {
    println!("=== PicoView GPU image-capability probe (CURRENT behavior) ===");
    println!("wgpu version: 25");
    println!(
        "pocketjs_core::NATIVE_TEX_MAX_DIM (portable default ceiling) = {}",
        pocketjs_core::NATIVE_TEX_MAX_DIM
    );
    println!(
        "MAX_DECODE_PIXELS (PicoView CPU decode guard) = {}",
        80_000_000u64
    );
    println!(
        "Desktop request policy: pocket3d::gpu::desktop_image_required_limits \
         (raises ONLY max_texture_dimension_2d to adapter.limits(); other defaults unchanged)"
    );

    println!("\n--- Creating device via pocket3d::gpu::Gpu::new_headless() ---");
    let gpu = match Gpu::new_headless() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("FAILED to create headless GPU: {e:#}");
            std::process::exit(2);
        }
    };
    let info = gpu.adapter.get_info();
    println!("adapter.name = {:?}", info.name);
    println!("adapter.backend = {:?}", info.backend);
    println!("adapter.device_type = {:?}", info.device_type);
    println!("adapter.vendor = {:#x}", info.vendor);
    println!("adapter.device = {:#x}", info.device);

    println!("\n--- adapter.limits() ---");
    dump_limits("adapter", &gpu.adapter.limits());

    let requested = desktop_image_required_limits(&gpu.adapter.limits());
    println!("\n--- requested limits via desktop_image_required_limits(adapter) ---");
    dump_limits("requested", &requested);

    println!("\n--- device.limits() (execution authority) ---");
    dump_limits("device", &gpu.device.limits());

    let device_dim = gpu.device.limits().max_texture_dimension_2d;
    println!("\nusable image capability (device.max_texture_dimension_2d) = {device_dim}");

    println!("\n--- Texture creation probes on ACTUAL device (dim={device_dim}) ---");
    for (w, h) in [
        (pocketjs_core::NATIVE_TEX_MAX_DIM, pocketjs_core::NATIVE_TEX_MAX_DIM),
        (8256u32, 5504u32),
        (8256u32, 1u32),
        (device_dim, device_dim),
    ] {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let tex = gpu.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("probe"),
                size: wgpu::Extent3d {
                    width: w,
                    height: h,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_DST
                    | wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            });
            drop(tex);
        }));
        match result {
            Ok(()) => println!("create_texture({w}x{h}) = OK"),
            Err(_) => println!("create_texture({w}x{h}) = FAILED (panic/validation)"),
        }
        let _ = gpu.device.poll(wgpu::PollType::Wait);
    }

    // Core admission is ceiling-based, not a fixed constant once a host
    // installs device truth. Probe both the portable default and the
    // installed device ceiling.
    println!("\n--- PocketJS Core admission ceiling (CPU logical gate) ---");
    let default_ui = pocket_ui_surface::UiSurface::new((8.0, 8.0));
    let default_ceiling = default_ui.with_ui(|ui| ui.image_max_texture_dim());
    println!("Ui default image_max_texture_dim = {default_ceiling}");
    println!(
        "8256 > portable default {default_ceiling}? {}",
        8256u32 > default_ceiling
    );
    default_ui.with_ui(|ui| ui.set_image_max_texture_dim(device_dim));
    let installed = default_ui.with_ui(|ui| ui.image_max_texture_dim());
    println!("Ui after set_image_max_texture_dim({device_dim}) = {installed}");
    println!("8256 > installed {installed}? {}", 8256u32 > installed);

    // Memory facts for the campaign corpus size (code constants only).
    let (w, h) = (8256u64, 5504u64);
    let pixels = w * h;
    let rgba8 = pixels * 4;
    println!("\n--- 8256x5504 memory facts ---");
    println!("source pixels = {pixels}");
    println!("RGBA8 level-0 bytes = {rgba8} ({:.2} MiB)", rgba8 as f64 / (1024.0 * 1024.0));
    let mip_levels = pocket_ui_wgpu::image_mip_level_count(w as u32, h as u32);
    println!("image_mip_level_count = {mip_levels}");
    let mut mip_total = 0u64;
    let (mut mw, mut mh) = (w, h);
    for level in 0..mip_levels {
        let level_bytes = mw * mh * 4;
        mip_total += level_bytes;
        println!(
            "  mip[{level}] {mw}x{mh} = {level_bytes} bytes ({:.2} MiB)",
            level_bytes as f64 / (1024.0 * 1024.0)
        );
        mw = (mw / 2).max(1);
        mh = (mh / 2).max(1);
    }
    println!(
        "full mip-chain bytes = {mip_total} ({:.2} MiB)",
        mip_total as f64 / (1024.0 * 1024.0)
    );

    println!("\nprobe complete");
}

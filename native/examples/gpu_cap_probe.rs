//! Phase 1 capability probe (campaign evidence tool).
//! Uses the same PocketJS Gpu bootstrap path as hosts/desktop
//! (`pocket3d::gpu::Gpu` + `wgpu::Limits::default()` request).
//! Reports adapter / requested-device / actual-device limits only.

use pocket3d::gpu::Gpu;

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
    println!("=== PICOVIEW-ACTUAL-SIZE-CAPABILITY-1 Phase 1 probe ===");
    println!("wgpu version requested by PicoView: 25");
    println!("NATIVE_TEX_MAX_DIM (pocketjs_core) = 8192");
    println!("MAX_DECODE_PIXELS (PicoView decode.rs) = 80000000");

    let default_limits = wgpu::Limits::default();
    println!("\n--- wgpu::Limits::default() (what request_device currently uses) ---");
    dump_limits("default", &default_limits);

    println!("\n--- Creating device via pocket3d::gpu::Gpu::new_headless() ---");
    println!("(hosts/desktop uses from_instance_for_surface_with_power_preference + same Limits::default)");
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

    println!("\n--- device.limits() (execution authority) ---");
    dump_limits("device", &gpu.device.limits());

    let device_dim = gpu.device.limits().max_texture_dimension_2d;
    println!("\n--- Texture creation probes on ACTUAL device (dim={device_dim}) ---");
    for (w, h) in [
        (8192u32, 8192u32),
        (8256u32, 5504u32),
        (8256u32, 1u32),
        (16384u32, 16384u32),
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
        // Force validation flush if available
        let _ = gpu.device.poll(wgpu::PollType::Wait);
    }

    // Also probe PocketJS core admission constant gate (no GPU).
    println!("\n--- PocketJS core NATIVE_TEX_MAX_DIM admission gate (CPU, no GPU) ---");
    println!("8256 > 8192? {}", 8256u32 > pocketjs_core::NATIVE_TEX_MAX_DIM);
    println!(
        "upload_owned_rgba8 would reject 8256-wide source under current constant? {}",
        8256u32 > pocketjs_core::NATIVE_TEX_MAX_DIM
    );

    // Memory facts from code constants.
    let (w, h) = (8256u64, 5504u64);
    let pixels = w * h;
    let rgba8 = pixels * 4;
    println!("\n--- 8256x5504 memory facts (from code path constants) ---");
    println!("source pixels = {pixels}");
    println!("RGBA8 level-0 bytes = {rgba8} ({:.2} MiB)", rgba8 as f64 / (1024.0 * 1024.0));
    let mip_levels = pocket_ui_wgpu::image_mip_level_count(w as u32, h as u32);
    println!("image_mip_level_count = {mip_levels}");
    let mut mip_total = 0u64;
    let (mut mw, mut mh) = (w, h);
    for level in 0..mip_levels {
        let level_bytes = mw * mh * 4;
        mip_total += level_bytes;
        println!("  mip[{level}] {mw}x{mh} = {level_bytes} bytes ({:.2} MiB)", level_bytes as f64 / (1024.0 * 1024.0));
        mw = (mw / 2).max(1);
        mh = (mh / 2).max(1);
    }
    println!("full mip-chain bytes = {mip_total} ({:.2} MiB)", mip_total as f64 / (1024.0 * 1024.0));
    println!("mip extras beyond L0 = {:.2} MiB", (mip_total - rgba8) as f64 / (1024.0 * 1024.0));
    println!("MAX_DECODE_PIXELS = 80000000; source pixels {pixels} allowed? {}", pixels <= 80_000_000);

    println!("\nprobe complete");
}

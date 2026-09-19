//! Live capability + PocketJS Core admission acceptance for the campaign
//! corpus sizes. Uses the real created device via pocket3d Gpu::new_headless()
//! and installs that device fact into Ui Core admission.
//!
//! Product admission policy (`ImageAdmissionPolicy`) truth is owned by
//! CurrentItem unit/integration tests and production app logs — this example
//! does **not** mirror Product policy constants.

use pocket_ui_surface::UiSurface;

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let gpu = pocket3d::gpu::Gpu::new_headless().expect("headless GPU");
    let adapter_dim = gpu.adapter.limits().max_texture_dimension_2d;
    let device_dim = gpu.device.limits().max_texture_dimension_2d;
    println!("adapter.name={:?}", gpu.adapter.get_info().name);
    println!("adapter.backend={:?}", gpu.adapter.get_info().backend);
    println!("adapter.max_texture_dimension_2d={adapter_dim}");
    println!("device.max_texture_dimension_2d={device_dim}");

    let surface = UiSurface::new((96.0, 64.0));
    surface.with_ui(|ui| {
        println!(
            "Ui.image_max_texture_dim_before={}",
            ui.image_max_texture_dim()
        );
        ui.set_image_max_texture_dim(device_dim);
        println!(
            "Ui.image_max_texture_dim_after={}",
            ui.image_max_texture_dim()
        );
    });

    // Core admission of the exact 8256×5504 corpus plane (no proxy).
    let (w, h) = (8256u32, 5504u32);
    let plane = vec![0xABu8; (w as usize) * (h as usize) * 4];
    let handle = surface.with_ui(|ui| ui.upload_owned_rgba8(plane, w, h, true));
    println!("upload_owned_rgba8(8256x5504) handle={handle}");
    if handle >= 0 {
        surface.with_ui(|ui| {
            let view = ui.texture(handle).expect("live texture");
            println!(
                "resource={}x{} linear={}",
                view.w, view.h, view.linear
            );
            // Geometry truth only — Product fullResolution is CurrentItem's fact.
            println!(
                "resource_matches_source={}",
                (view.w, view.h) == (w, h)
            );
        });
    } else {
        println!("resource_matches_source=false (admission rejected)");
    }

    // Control PNG size admits under the same device capability.
    let (cw, ch) = (1254u32, 1254u32);
    let cplane = vec![1u8; (cw as usize) * (ch as usize) * 4];
    let chandle = surface.with_ui(|ui| ui.upload_owned_rgba8(cplane, cw, ch, true));
    println!("upload_owned_rgba8(1254x1254) handle={chandle}");
    if chandle >= 0 {
        surface.with_ui(|ui| {
            let view = ui.texture(chandle).expect("control texture");
            println!("control_resource={}x{}", view.w, view.h);
        });
    }

    println!("probe complete");
}

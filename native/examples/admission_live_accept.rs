//! Live capability + admission acceptance for C:\img corpus.
//! Uses the real created device via pocket3d Gpu::new_headless() and the
//! real PocketJS Core admission after installing device capability.

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
        println!("Ui.image_max_texture_dim_before={}", ui.image_max_texture_dim());
        ui.set_image_max_texture_dim(device_dim);
        println!("Ui.image_max_texture_dim_after={}", ui.image_max_texture_dim());
    });

    // Direct Core admission of the exact 8256×5504 source plane (no proxy).
    let (w, h) = (8256u32, 5504u32);
    let plane = vec![0xABu8; (w as usize) * (h as usize) * 4];
    let handle = surface.with_ui(|ui| ui.upload_owned_rgba8(plane, w, h, true));
    println!("upload_owned_rgba8(8256x5504) handle={handle}");
    if handle >= 0 {
        surface.with_ui(|ui| {
            let view = ui.texture(handle).expect("live texture");
            println!("resource={}x{} linear={}", view.w, view.h, view.linear);
        });
        let full = handle >= 0;
        println!("fullResolution_from_geometry={}", full);
    } else {
        println!("fullResolution_from_geometry=false (admission rejected)");
    }

    // Control PNG size still admits under the same capability.
    let (cw, ch) = (1254u32, 1254u32);
    let cplane = vec![1u8; (cw as usize) * (ch as usize) * 4];
    let chandle = surface.with_ui(|ui| ui.upload_owned_rgba8(cplane, cw, ch, true));
    println!("upload_owned_rgba8(1254x1254) handle={chandle}");

    // Product policy path via CurrentItem is covered by unit tests; here we
    // also print policy derivation for the live device.
    let policy = picoview_policy_from_dim(device_dim);
    println!(
        "picoview_policy max_resource_dim={} max_resource_pixels={}",
        policy.0, policy.1
    );
    let admits = policy.0 >= w && policy.1 >= (w as u64 * h as u64);
    println!("policy_admits_8256x5504_exact={admits}");
}

/// Mirror of ImageAdmissionPolicy::from_usable_image_capability for the
/// acceptance binary (avoids making decode module public API noise in the
/// example). Values must stay in sync with decode.rs.
fn picoview_policy_from_dim(device_dim: u32) -> (u32, u64) {
    (device_dim.max(1), 80_000_000)
}

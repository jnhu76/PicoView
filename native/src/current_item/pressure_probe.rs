//! C8A decode/navigation pressure probe — opt-in evidence tooling
//! (PICOVIEW-POST-RELEASE-NORMALIZATION-1, Refs #75 MAJOR-5).
//!
//! NOT part of the normal test suite (`#[ignore]`; also requires the
//! `PICOVIEW_PRESSURE_PROBE` env gate so an accidental full-suite run never
//! pays the multi-second cost). Run on native Windows:
//!
//! ```text
//! PICOVIEW_PRESSURE_PROBE=1 \
//! cargo test --release --manifest-path native/Cargo.toml \
//!   pressure_probe -- --ignored --nocapture
//! ```
//!
//! What it measures, on the REAL production components (CurrentItem,
//! UiSurface + PocketJS Guest, C0 SvcPending command budget) driven exactly
//! the way `runtime::Runtime::tick` drives them:
//!
//! - single normal/large open latency (decode → admission → publish);
//! - N-command Previous/Next burst: commands processed per tick, tick wall
//!   time (== guest-frame delay), pending svc queue depth;
//! - superseded logical handles queued per observation boundary;
//! - logical texture residency (live + superseded, bytes) at the boundary;
//! - process working-set and private-commit before/after each scenario.
//!
//! No GPU device is created: this probe measures the CPU/decode/admission/
//! guest path that the burst serializes. GPU upload follows residency
//! admission one-to-one on the ordinary path (one write_texture per admitted
//! resource), so logical residency is the load-bearing residency metric here.
//!
//! Fixtures are generated on the fly (32bpp BMP; decode cost is O(pixels))
//! into the OS temp dir and deleted afterwards. No personal images, nothing
//! committed. Results land in `native/target/pressure-probe.json`.

use pocket_mod::Guest;
use pocket_ui_surface::UiSurface;
use pocket_ui_surface::offload::OffloadWorker;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::CurrentItem;
use crate::current_item::{Command, OpenIntent, decode_policy_for_device};
use crate::current_item::publication::RequestPhase;
use crate::svc_queue::{MAX_SVC_LINES_PER_TICK, SvcPending};

const NORMAL_W: u32 = 1280;
const NORMAL_H: u32 = 960;
const LARGE_W: u32 = 8064;
const LARGE_H: u32 = 6048;

fn process_memory() -> Option<(u64, u64)> {
    use windows::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
    };
    use windows::Win32::System::Threading::GetCurrentProcess;
    let mut counters = PROCESS_MEMORY_COUNTERS_EX::default();
    counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
    let ok = unsafe {
        GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters as *mut PROCESS_MEMORY_COUNTERS_EX as *mut PROCESS_MEMORY_COUNTERS,
            counters.cb,
        )
    };
    if ok.is_ok() {
        Some((counters.WorkingSetSize as u64, counters.PrivateUsage as u64))
    } else {
        None
    }
}

/// Write a 32bpp BI_RGB BMP with pseudo-noise pixels (so pages are really
/// touched and the decoder cannot shortcut uniform data).
fn write_bmp(path: &Path, w: u32, h: u32) -> std::io::Result<()> {
    use std::io::BufWriter;
    let row = (w * 4) as u32;
    let data_len = row * h;
    let mut file = BufWriter::new(std::fs::File::create(path)?);
    // BITMAPFILEHEADER (14 bytes)
    file.write_all(b"BM")?;
    file.write_all(&(54u32 + data_len).to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;
    file.write_all(&54u32.to_le_bytes())?;
    // BITMAPINFOHEADER (40 bytes)
    file.write_all(&40u32.to_le_bytes())?;
    file.write_all(&(w as i32).to_le_bytes())?;
    file.write_all(&(h as i32).to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&32u16.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?; // BI_RGB
    file.write_all(&data_len.to_le_bytes())?;
    file.write_all(&2835u32.to_le_bytes())?;
    file.write_all(&2835u32.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;
    // Pixels, bottom-up, BGRX.
    let mut seed = 0x9E3779B9u32;
    for _ in 0..h {
        let mut row_bytes = Vec::with_capacity(row as usize);
        for _ in 0..w {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            row_bytes.extend_from_slice(&(seed as u32).to_le_bytes());
        }
        file.write_all(&row_bytes)?;
    }
    file.flush()
}

struct Fixture {
    dir: PathBuf,
    files: Vec<PathBuf>,
}

fn make_fixture(tag: &str, large_count: usize, normal_count: usize) -> std::io::Result<Fixture> {
    let dir = std::env::temp_dir().join(format!("picoview-pressure-{tag}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    let mut files = Vec::new();
    for i in 0..large_count {
        let p = dir.join(format!("large-{i:02}.bmp"));
        write_bmp(&p, LARGE_W, LARGE_H)?;
        files.push(p);
    }
    for i in 0..normal_count {
        let p = dir.join(format!("normal-{i:02}.bmp"));
        write_bmp(&p, NORMAL_W, NORMAL_H)?;
        files.push(p);
    }
    Ok(Fixture { dir, files })
}

fn remove_fixture(fixture: &Fixture) {
    let _ = std::fs::remove_dir_all(&fixture.dir);
}

struct Boot {
    surface: UiSurface,
    _offload: OffloadWorker,
    guest: Guest,
}

fn boot() -> anyhow::Result<Boot> {
    let surface = UiSurface::new_with_density((960.0, 640.0), 2);
    // Same host identity the production boot declares (runtime::HOST_ID/ABI):
    // the plan-built guest asserts it before mounting.
    surface.set_identity(crate::runtime::HOST_ID, crate::runtime::HOST_ABI);
    // Portable ceiling: this probe runs without a GPU device, so admission
    // uses the portable default rather than created-device truth.
    surface.with_ui(|ui| ui.set_image_max_texture_dim(8192));
    let guest = Guest::new()?;
    surface.feed_pak(&crate::assets::EMBEDDED_PAK);
    surface.mount(&guest)?;
    let pak = crate::assets::EMBEDDED_PAK.clone();
    let offload = OffloadWorker::spawn(move || {
        let mut engine = pocket_text::Engine::new();
        engine.load_pak(&pak);
        move |record: &str| engine.reply(record)
    });
    offload.mount(&guest)?;
    guest.eval("picoview", &crate::assets::EMBEDDED_JS)?;
    Ok(Boot {
        surface,
        _offload: offload,
        guest,
    })
}

/// One faithful mirror of `Runtime::tick`'s command phase + guest frame +
/// observation boundary, timed per stage.
#[derive(Debug, Clone, Copy)]
struct TickReport {
    commands_processed: usize,
    command_us: u128,
    frame_us: u128,
    release_us: u128,
    pending_after: usize,
    superseded_before_release: usize,
    logical_residency_bytes: u64,
}

fn residency_bytes(surface: &UiSurface, live: Option<i32>, superseded: &[i32]) -> u64 {
    let mut total = 0u64;
    surface.with_ui(|ui| {
        for handle in live.into_iter().chain(superseded.iter().copied()) {
            if let Some(view) = ui.texture(handle) {
                total += view.pixels.len() as u64;
            }
        }
    });
    total
}

fn drive_tick(
    item: &mut CurrentItem,
    surface: &UiSurface,
    guest: &Guest,
    pending: &mut SvcPending,
    incoming: Vec<String>,
) -> TickReport {
    pending.refill(incoming);
    let started = Instant::now();
    let mut commands_processed = 0;
    for line in pending.take_batch(MAX_SVC_LINES_PER_TICK) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line)
            && value.get("t").and_then(|v| v.as_str()) == Some("pv")
        {
            let cmd = value.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
            let command = match cmd {
                "previous" => Some(Command::Previous),
                "next" => Some(Command::Next),
                "refresh" => Some(Command::Refresh),
                "open" => value
                    .get("path")
                    .and_then(|p| p.as_str())
                    .map(|p| Command::Open(PathBuf::from(p))),
                _ => None,
            };
            if let Some(command) = command {
                item.handle_command(surface, RequestPhase::before_guest_frame(), command);
                commands_processed += 1;
            }
        }
    }
    let command_us = started.elapsed().as_micros();
    let frame_started = Instant::now();
    let _ = guest.frame(0);
    let frame_us = frame_started.elapsed().as_micros();
    let superseded_before_release = item.superseded.len();
    let residency = residency_bytes(surface, item.live_handle(), &item.superseded);
    let release_started = Instant::now();
    item.release_superseded(surface, super::ObservationBoundary::after_guest_frame());
    let release_us = release_started.elapsed().as_micros();
    TickReport {
        commands_processed,
        command_us,
        frame_us,
        release_us,
        pending_after: pending.len(),
        superseded_before_release,
        logical_residency_bytes: residency,
    }
}

fn command_line(cmd: &str) -> String {
    format!("{{\"t\":\"pv\",\"cmd\":\"{cmd}\"}}")
}

fn fmt_ms(us: u128) -> String {
    format!("{:.1}ms", us as f64 / 1000.0)
}

fn mb(bytes: u64) -> String {
    format!("{:.0}MB", bytes as f64 / (1024.0 * 1024.0))
}

/// Median of measured values.
fn median_us(values: &mut [u128]) -> u128 {
    values.sort();
    values[values.len() / 2]
}

fn report_marker(name: &str) {
    eprintln!("probe: === {name} ===");
}

fn decode_pressure_gate() -> anyhow::Result<()> {
    let mut report = String::from("{\n  \"scenarios\": [\n");
    let mut first_section = true;

    // --- S1: single normal-image open latency ---------------------------
    report_marker("S1 single normal-image open latency");
    let fixture = make_fixture("normal", 0, 4)?;
    let boot = boot()?;
    let mut item = CurrentItem::with_browse(&fixture.files[0]);
    item.set_admission_policy(decode_policy_for_device(8192));
    // Boot open is the with_browse initial image; measure 5 further opens.
    let mut samples = Vec::new();
    for i in 0..5 {
        let path = fixture.files[i % fixture.files.len()].clone();
        let started = Instant::now();
        item.open(&boot.surface, RequestPhase::before_guest_frame(), &path, OpenIntent::NewItem);
        samples.push(started.elapsed().as_micros());
    }
    let single_normal_us = median_us(&mut samples);
    eprintln!("probe: single normal open median {} (n=5)", fmt_ms(single_normal_us));
    if !first_section {
        report.push_str(",\n");
    }
    first_section = false;
    report.push_str(&format!(
        "    {{\"scenario\": \"single_normal_open_us\", \"median_us\": {single_normal_us}}}"
    ));
    drop(item);

    // --- S2: single large-image open latency ----------------------------
    report_marker("S2 single large-image open latency");
    let large_fixture = make_fixture("large", 2, 0)?;
    let mut item = CurrentItem::with_browse(&large_fixture.files[0]);
    item.set_admission_policy(decode_policy_for_device(8192));
    let mut samples = Vec::new();
    for i in 0..3 {
        let path = large_fixture.files[i % large_fixture.files.len()].clone();
        let started = Instant::now();
        item.open(&boot.surface, RequestPhase::before_guest_frame(), &path, OpenIntent::NewItem);
        samples.push(started.elapsed().as_micros());
    }
    let single_large_us = median_us(&mut samples);
    eprintln!("probe: single large open median {} (n=3, {}x{})", fmt_ms(single_large_us), LARGE_W, LARGE_H);
    report.push_str(&format!(
        ",\n    {{\"scenario\": \"single_large_open_us\", \"median_us\": {single_large_us}}}"
    ));
    drop(item);

    // --- S3: N=64 rapid Previous/Next burst over mixed-size directory ----
    report_marker("S3 burst N=64 mixed directory (2 large + 4 normal)");
    let burst_fixture = make_fixture("burst", 2, 4)?;
    let mut item = CurrentItem::with_browse(&burst_fixture.files[0]);
    item.set_admission_policy(decode_policy_for_device(8192));
    let memory_before = process_memory();
    let mut pending = SvcPending::new();
    // One guest turn delivers one svc batch of 64 commands; the C0 queue
    // retains the tail behind the per-tick budget. Following ticks drain it.
    // Navigation ping-pongs: Previous/Next stop at directory edges by
    // contract, so a one-direction burst would collapse into 5 opens on a
    // 6-file directory instead of 64.
    let mut incoming: Vec<String> = Vec::with_capacity(64);
    for i in 0..64 {
        let leg = (i / 8) % 2;
        let cmd = if leg == 0 { "next" } else { "previous" };
        incoming.push(command_line(cmd));
    }
    let burst_started = Instant::now();
    let mut ticks: Vec<TickReport> = Vec::new();
    loop {
        ticks.push(drive_tick(
            &mut item,
            &boot.surface,
            &boot.guest,
            &mut pending,
            std::mem::take(&mut incoming),
        ));
        if pending.len() == 0 || ticks.len() > 40 {
            break;
        }
    }
    let burst_wall = burst_started.elapsed();
    let peak_superseded = ticks
        .iter()
        .map(|t| t.superseded_before_release)
        .max()
        .unwrap_or(0);
    let peak_residency = ticks
        .iter()
        .map(|t| t.logical_residency_bytes)
        .max()
        .unwrap_or(0);
    let first_tick = ticks.first().copied().expect("at least one tick");
    let memory_after = process_memory();
    eprintln!(
        "probe: burst ticks={} wall={} first_tick: cmds={} cmd={} frame={}",
        ticks.len(),
        fmt_dur(burst_wall),
        first_tick.commands_processed,
        fmt_ms(first_tick.command_us),
        fmt_ms(first_tick.frame_us),
    );
    eprintln!(
        "probe: superseded_peak={peak_superseded} residency_peak={} pending_settled_in={} ticks",
        mb(peak_residency),
        ticks.len()
    );
    if let (Some((ws_before, priv_before)), Some((ws_after, priv_after))) =
        (memory_before, memory_after)
    {
        eprintln!(
            "probe: working_set {} -> {} private {} -> {}",
            mb(ws_before),
            mb(ws_after),
            mb(priv_before),
            mb(priv_after)
        );
    }
    report.push_str(&format!(
        ",\n    {{\"scenario\": \"burst64_mixed\", \"ticks\": {}, \"first_tick_cmds\": {}, \"first_tick_command_us\": {}, \"first_tick_frame_us\": {}, \"peak_superseded\": {}, \"peak_residency_bytes\": {}, \"wall_us\": {}}}",
        ticks.len(),
        first_tick.commands_processed,
        first_tick.command_us,
        first_tick.frame_us,
        peak_superseded,
        peak_residency,
        burst_wall.as_micros()
    ));
    drop(item);
    remove_fixture(&burst_fixture);
    remove_fixture(&fixture);
    remove_fixture(&large_fixture);
    let _ = (memory_before, memory_after);

    report.push_str("\n  ]\n}\n");
    let out_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("pressure-probe.json");
    std::fs::write(&out_path, &report)?;
    eprintln!("probe: report written to {}", out_path.display());
    Ok(())
}

fn fmt_dur(d: Duration) -> String {
    format!("{:.2}s", d.as_secs_f64())
}

#[cfg(test)]
mod tests {
    /// Opt-in C8A evidence run. See module docs for invocation.
    #[test]
    #[ignore = "C8A decode-pressure probe: run with PICOVIEW_PRESSURE_PROBE=1 and --ignored"]
    fn decode_pressure_gate() {
        if std::env::var_os("PICOVIEW_PRESSURE_PROBE").is_none() {
            eprintln!("SKIP pressure probe: PICOVIEW_PRESSURE_PROBE not set");
            return;
        }
        super::decode_pressure_gate().expect("pressure probe run");
    }
}

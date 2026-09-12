# PicoView Benchmark Contract

Status: **normative for Architecture GATE-A and Release GATE-B**

This document defines how PicoView performance, memory, package-size, and idle-work claims are measured. A benchmark number without this metadata is evidence, not a gate result.

## 1. Evidence identity

Every benchmark report MUST record:

- PicoView commit SHA;
- effective PocketJS commit SHA;
- PocketJS campaign base SHA;
- build profile and compiler/toolchain versions;
- Windows edition/build;
- CPU model and logical processor count;
- installed RAM;
- GPU model and driver version;
- display refresh rate used for direct-manipulation tests;
- source image identity and dimensions;
- whether the source was on local NVMe or another medium;
- timestamp and machine power mode.

## 2. PocketJS campaign baseline

The initial Architecture Phase A baseline is:

- repository: `https://github.com/pocket-stack/pocketjs`
- base SHA: `a5a85356e172db8a32aefa983ee1259f60406f69`

If PocketJS is patched during the campaign, reports MUST name both the base and the effective patched SHA/patch series.

## 3. Build profile

Gate measurements use an optimized release build.

Debug symbols may exist for diagnosis but are excluded from application payload/install-size accounting when they are not distributed to users.

A debug build may be used to investigate a failure but cannot be used for PASS numbers.

## 4. Sample counts and percentiles

Latency gates that name P50/P95 use at least **50 measured iterations** after harness validation.

- P50 = median of the 50+ measured samples.
- P95 = nearest-rank 95th percentile over the measured samples.
- Warm-up runs, if required by the harness, are reported separately and are not silently mixed into the measured set.

If fewer than 50 runs are available, the result is exploratory and cannot close a P95 gate.

## 5. Clock and timestamp vocabulary

Use a monotonic high-resolution clock on Windows (for example QueryPerformanceCounter or an equivalent monotonic source).

Required conceptual timestamps:

- `T0_ACTIVATION_REQUEST` — external harness requests PicoView activation/open.
- `T1_PROCESS_ENTRY` — PicoView process entry begins.
- `T2_WINDOW_USABLE` — the first interactive window frame is submitted with the input loop alive; a hidden/blank HWND alone does not qualify.
- `T3_SOURCE_OPEN_BEGIN` — current-source open begins.
- `T4_DECODE_READY` — decoded/native presentation resource is ready for composition.
- `T5_IMAGE_FRAME_SUBMITTED` — a frame containing the requested image is submitted to the presentation path.
- `T6_PRESENT_SUBMITTED` — the corresponding platform present submission is issued.

PocketJS frame tracing currently measures CPU/render/presentation-submission events and does not prove GPU completion or display scanout. Therefore v1 architecture latency uses **`T6_PRESENT_SUBMITTED` as the first-useful-image proxy**.

Reports MUST call it a proxy. Hardware visual acceptance remains separate and must verify that the image actually becomes visible and correct.

## 6. Startup metrics

### Process start → usable window

Measured as:

`T2_WINDOW_USABLE - T1_PROCESS_ENTRY`

### Process-cold activation → first useful image

Measured as:

`T6_PRESENT_SUBMITTED - T0_ACTIVATION_REQUEST`

"Process-cold" means a newly created PicoView process with no prior in-process cache/state.

It does **not** imply that the Windows filesystem cache has been flushed. The report records normal OS-cache conditions instead of pretending to provide a reproducible disk-cold state.

Optional reboot/cache-pollution experiments may be reported separately but do not redefine the primary SLO.

### Warm file request → first useful image

Measured inside an already-running settled PicoView process from the semantic open request to `T6_PRESENT_SUBMITTED`.

## 7. Memory metrics

Every memory gate records both:

1. **Working Set - Private** — private resident pages attributed to the process;
2. **Private Bytes** — committed private virtual memory.

The PRD's baseline/ordinary/peak memory targets apply to **Working Set - Private** unless a later accepted ADR explicitly changes the metric. Private Bytes is a mandatory companion safety metric and must not show unbounded growth across repeated runs.

### Settled baseline

Measure after the window has been static for at least 5 seconds and all startup work required by the state has drained.

### Image workload

Measure settled and peak values for the named image workload. Record whether CPU decode buffers still exist when the settled sample is taken.

### Five-process aggregate

Open five ordinary independent PicoView processes with the specified representative state, allow each to settle, then sum per-process Working Set - Private and Private Bytes. Report both the sum and per-process distribution.

## 8. Idle CPU

Static-idle CPU is observed for 30 seconds after a 5-second settle period.

Normalized process CPU percentage is:

`process_cpu_seconds / wall_seconds / logical_processor_count × 100`

This approximates Task-Manager-style whole-machine normalization and prevents one fully busy logical processor from being reported as 100% of the whole machine.

Also record:

- count/rate of PicoView render submissions during the idle window;
- whether filesystem scans/timers continue;
- whether application network activity occurs.

A static image should require no PicoView-owned continuous render loop.

## 9. Direct-manipulation metric

For zoom/pan architecture tests, measure from host-received pointer/input event to `T6_PRESENT_SUBMITTED` for the frame reflecting that state when instrumentation can correlate the event.

Report P50/P95 plus any repeated application-caused >33 ms stalls.

This is an application/presentation-submission metric, not display-photon latency.

## 10. Package and install size

### Download payload

Size of the actual user-distributed compressed artifact (installer or portable archive). Debug symbols and benchmark corpora not shipped to users are excluded.

### Installed application-private footprint

Bytes installed specifically for PicoView and its non-OS runtime/dependencies.

OS inbox components are excluded. A runtime that the user must install specifically for PicoView is **not** excluded merely because it is shared-capable.

Every non-OS dependency requires a ledger entry with:

- compressed/distributed bytes;
- installed bytes;
- whether loaded before first image;
- startup effect;
- baseline-memory effect;
- license;
- security/update burden;
- exact user pain solved.

## 11. Reference image corpus

Architecture Phase A minimum corpus:

- ordinary 12 MP JPEG;
- ordinary 24 MP JPEG;
- ordinary 50 MP JPEG;
- large PNG with alpha;
- corrupt JPEG;
- hostile/extreme-dimension header fixture.

Product/release tests later add GIF, TIFF, BMP and conditional-codec samples.

Synthetic/generated fixtures are allowed for ownership/cancellation/resource-seam tests but cannot substitute for real encoded-image measurements.

## 12. Gate reporting

For every defining PRD metric, a gate report states exactly one:

- `PASS` — metric/behavior meets the authority document;
- `FAIL` — metric/behavior violates it;
- `PASS-WITH-CORRECTIVE` — the gate is allowed to proceed only when the corrective is explicitly bounded, tracked, and does not redefine the failed metric.

Do not make a test pass by changing sample definitions, percentile rules, machine accounting, or PRD thresholds inside the result report.

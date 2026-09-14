# UPSTREAM NOTES — DESKTOP-STARTUP-PERFORMANCE-EXPERIMENTAL-RECORD-1

This is **NOT** an issue submission, a bug report, or a fix
request. It is a future-upstream evidence draft, prepared so that the
project can open a discussion — most plausibly in the wgpu / wgpu-hal
tracker — with facts, numbers, and reproduction pointers instead of
accusations. Nothing here is submitted by this record; opening any upstream
thread requires a separate owner decision.

## 1. Readiness assessment

| Target area | Readiness | Basis |
|---|---|---|
| **wgpu / wgpu-hal** — DX12 adapter enumeration / capability probing | **READY_FOR_UPSTREAM_DISCUSSION** | Full call-path proof (nested markers + source), scheduler-level state of the expensive windows, and a causal intervention with preserved invariants; host-specificity is clearly bounded and stated |
| **winit / Win32** — first-window creation | **NOT_YET_UPSTREAM_READY** | Measurements are host/load-specific (46–74 ms across sessions); no upstream-actionable mechanism isolated; no bounded product corrective exists |
| **AMD / Windows / DXGI** — origin of the second DXGI entry (duplicate enumeration) | **NOT_YET_UPSTREAM_READY_AS_ROOT_CAUSE** | The duplicate enumeration is reproduced and quantified, but its origin (driver, virtualization/GPU-PV, display topology) is OPEN; Hyper-V presence is correlation only |

## 2. Proposed problem statement (facts only)

> On one Windows 11 / AMD integrated-GPU host, DXGI enumerates two adapters
> with the same name/VendorId/DeviceId but different LUIDs. At the audited
> wgpu-hal version (25.0.2), DX12 adapter enumeration calls
> `D3D12CreateDevice` while exposing each entry before final adapter
> selection. Both probes are expensive (~170 ms and ~145 ms). A
> measurement-only experiment skipping only the known non-selected LUID
> reduces `request_adapter` by ~152 ms and end-to-end startup by ~150 ms
> while preserving the selected adapter and rendering configuration.

### 2.1 Environment (for reproduction)

- Windows 11 Pro build 26200 (26200.9445); AMD Ryzen 7 5800H 8C/16T;
  28.9 GiB RAM; AMD Radeon(TM) Graphics iGPU, driver 31.0.21923.11000
  (Adrenalin 25.8.1).
- wgpu 25.0.2 / wgpu-hal 25.0.2 (vendored, `[patch.crates-io]`, vendoring
  for instrumentation only); winit 0.30.13; rustc 1.98.1 msvc.
- Backend: DX12 (the native Windows backend; selected explicitly for the
  audit). HypervisorPresent=True, VBS running (status 2), HVCI off; no
  GPU-PV / indirect-display device found in the PnP inventory.
- Host is a development laptop: QQPCRTP resident AV; 56 resident ETW
  sessions at capture time; the desktop was busy (explorer / Edge / WeChat
  active). All quoted numbers come from this host only.

### 2.2 What was observed (each item with its evidence)

1. **Duplicate enumeration.** `AUDIT_DXGI_ADAPTER` lines — identical across
   4 + 5 + 20 runs in three independent sessions — report:

   | Index | Name | VendorId:DeviceId | LUID |
   |---|---|---|---|
   | 0 | AMD Radeon(TM) Graphics | 0x1002:0x1638 | 0-e1e6 |
   | 1 | AMD Radeon(TM) Graphics | 0x1002:0x1638 | 0-1a8f2 |
   | 2 | Microsoft Basic Render Driver | 0x1414:0x8c | 0-f7f1 |

   The selected adapter is LUID 0-e1e6 (proven per run via a selected-LUID
   carry on the `AdapterInfo` driver string, 40/40 runs).

2. **Probe-everything enumeration.** Nested instrumentation (vendored
   wgpu-hal; markers inside `enumerate_adapters → Adapter::expose →
   D3D12Lib::create_device`) shows one real `D3D12CreateDevice` per
   enumerated adapter, before final selection. Per-segment P50s
   (instrumented build, n=8; pooled n=12 in the CSV): DXGI
   `EnumAdapters1` 6.0 ms; AMD LUID 0-e1e6 probe **162.9 ms**; its
   feature/desc queries 1.7 ms; AMD LUID 0-1a8f2 probe **140.2 ms**; its
   queries 1.7 ms; MBRD probe 6.0 ms + 1.2 ms queries. The two AMD probes
   are ~88 % of the instrumented adapter span. Headline (uninstrumented)
   `request_adapter` spans: 313.0 ms (winit+wgpu arm) / 338.0 ms (full
   app arm, P50, n=50).

3. **The expensive windows are on-CPU.** Elevated ETW kernel trace
   (CSwitch/ReadyThread, per-trace alignment ≤0.10 ms): the two probe
   windows are 97–98 % RUNNING (on-CPU) in 9 of 10 windows (B0 probe #0
   95.6 %, disclosed outlier); off-CPU waits 1.8–9.6 ms; READY ≤0.63 ms.
   Kernel-vs-user split is NOT obtainable on this host (`SampledProfile`
   unavailable), so this is deliberately reported as "CPU-heavy, mode
   unresolved" — an on-CPU spin/poll inside the driver would also read
   RUNNING.

4. **Causal intervention** (measurement class: `instrumented_no_etw` — the
   instrumented build with markers active and no ETW capture; these numbers
   are not headline-clean values). Measurement-only, env-gated, reversible
   skip of **exactly** the known non-selected LUID in `enumerate_adapters`
   (never a generic dedup by name/VendorId/DeviceId). Interleaved
   randomized n=20 + n=20 on one binary:

   | Metric (P50, ms) | pristine | skip 0-1a8f2 | Δ |
   |---|---:|---:|---:|
   | `request_adapter` | 358.0 | 206.0 | **−152.0** |
   | probe AMD 0-e1e6 (selected) | 168.9 | 170.8 | +1.9 (unchanged) |
   | probe slot 2 | 144.5 (AMD 1a8f2) | 6.3 (MBRD) | −138.2 |
   | process-entry → first present submitted | 569.1 | 419.5 | −149.6 |

   Invariants held 40/40: selected adapter LUID, adapter name, backend
   (Dx12), device type (IntegratedGpu), surface format (Bgra8Unorm),
   present mode (Fifo), full marker sequence.

### 2.3 What this evidence does NOT claim

- Not a confirmed wgpu bug; not a statement that per-adapter probing is
  wrong in general.
- Not a recommendation to deduplicate by name, VendorId or DeviceId —
  identical physical GPUs may legitimately share those fields, and the
  experiment deliberately avoided that rule.
- Not a claim that the second LUID is invalid, or that it is unused by
  other software on the machine (only that wgpu never selects it here).
- Not a claim that other Windows systems exhibit duplicate enumeration or
  pay this cost.
- Not a root-cause statement about why DXGI returns the second entry
  (origin OPEN; Hyper-V/VBS presence is correlation, no mechanism evidence
  found).

## 3. Questions for upstream

1. Is a `D3D12CreateDevice` capability probe per enumerated adapter
   intentional/required during `enumerate_adapters`, or could
   selection/filtering happen before full capability probing?
2. Is there an existing mechanism in wgpu/wgpu-hal for alias or duplicate
   DXGI adapters (e.g. two same-name/same-VendorId/DeviceId entries with
   distinct LUIDs, as observed on this host)?
3. What identity semantics are considered safe for adapter identity —
   LUID, `IDXGIAdapter` pointer identity, DXGI 1.6 `IDXGIAdapter4` /
   `DXGI_ADAPTER_DESC3`, or driver-reported physical-adapter identity?
4. Would lazy capability discovery (expose adapter info from the cheap
   description query; create the device only for the selected adapter)
   be architecturally acceptable, and what would it break?
5. Is this pattern already known for AMD / Windows virtualization /
   display-topology configurations (e.g. VBS/Hyper-V-adjacent states)?
6. Would a debug/warn log when two enumerated adapters share
   name+VendorId+DeviceId be welcome, so hosts like this are detectable
   without custom instrumentation?

## 4. Reproduction pointers

**Ref availability (read this first):** the two Windows audit branches
(`audit/windows-startup-callpath-1` @ `e8dd437`,
`audit/windows-startup-etw-1` @ `f75c283`) and the PocketJS audit series
(`e15674db..be58f53c`) are **local-only** — they were never pushed to the
PicoView or PocketJS remotes. What IS portable is this repository's docs
branch of record plus the evidence archive below, which contains the
PocketJS measurement-only patch series (so the instrumentation and the
exact-LUID skip can be inspected and re-applied without those branches).

- Reports: `docs/WINDOWS-STARTUP-CALLPATH-REALITY-AUDIT-1.md` and
  `docs/WINDOWS-STARTUP-ETW-REALITY-AUDIT-1.md` (branches
  `audit/windows-startup-callpath-1` @ `e8dd437` and
  `audit/windows-startup-etw-1` @ `f75c283`; both branches are local-only —
  the reports are also carried in the archive below).
- Selected evidence archive (this record):
  `docs/desktop-startup-performance-experimental-record-1/selected-evidence.tar.gz`
  (sha256 `b92e2cfc87554757764d109f42804bb087341ad3d76afed76e3b4a97676d7366`),
  containing:
  - the 40 raw intervention NORMTRACE logs
    (`windows-etw/intervene/{pristine,patched}/run-000..019.log`),
  - `windows-etw/summary.csv` (all headline/ETW/intervention numbers with
    variants),
  - the elevated scheduler analysis (`windows-etw/elevated-analysis.json`,
    produced by the included `tooling/analyze_elevated.py`),
  - the intervention comparator (`tooling/compare_intervene.py`) and
    capture tooling (`tooling/win-etw-elevated-rerun.ps1`,
    `tooling/pv-etw-audit.wprp`, `tooling/win-etw-intervene.ps1`),
  - the PocketJS measurement-only patch series
    (`pocketjs-audit-patch/wgpu-hal-marker-instrumentation.patch` — full
    series including the skip; `pocketjs-audit-patch/wgpu-hal-exact-luid-skip.patch`
    — the intervention commit alone; `pocketjs-audit-patch/README.md` —
    base SHA + commit table),
  - the call-path audit's `stages-summary.csv` (nested-marker
    decomposition) and both of its reviewer verdicts (both PASS).
- Recompute the intervention table:
  `python compare_intervene.py <dir containing pristine/ and patched/>`.

## 5. Boundary statement

This draft exists so that a future upstream conversation can start from
measurements on one host that are labelled as such, with a causal
intervention that is explicitly measurement-only, and with its own
unknowns stated. It must not be paraphrased into "wgpu bug confirmed" or
into a dedup recommendation. Any actual upstream submission is an owner
decision that this record does not make.

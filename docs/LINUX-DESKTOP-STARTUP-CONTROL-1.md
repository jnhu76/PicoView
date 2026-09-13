# LINUX-DESKTOP-STARTUP-CONTROL-1

Independent cross-platform control experiment, reconciled against the later
Windows critical-path audit before merge into `main`.

This document is the **curated interpretation** intended for `main`. The complete
reviewed experiment snapshot remains frozen unchanged on the archive branch and
in historical PR #41. No Linux experiment was rerun for this reconciliation.

---

## CURRENT VERDICT

**PORTABLE_DESKTOP_TAX_NOT_PROVEN**

Secondary finding:

**WINDOWS_HOST_ENVIRONMENT_TAX_CONFIRMED (MEASURED HOST ONLY)**

The original Linux experiment correctly established that the same PocketJS
portable desktop architecture can reach the first usable window in the
~150 ms class on Linux. However, its original `WINDOWS_SPECIFIC_TAX` wording
compared Linux results against historical Windows startup numbers whose T1
proxy was later shown by `WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1` (#40)
to include a large generic pre-main segment on the Windows measurement host.

After reconciling both evidence sets:

1. Linux runs the same portable desktop architecture and reaches a usable
   PocketJS window at P50 **123–127 ms** / P95 **141 ms** in the two quiet gate
   batches.
2. The Windows historical **247–261 ms** quiet window numbers are not a clean
   architecture-only `T1_PROCESS_ENTRY → T2_WINDOW_USABLE` measurement. They
   used process spawn as a T1 proxy and folded in roughly **90–130 ms** of
   generic host pre-main/process-creation cost.
3. The later Windows audit bounds quiet in-process `main-entry → T2` at roughly
   **125–153 ms** and directly measures a degraded/noisy-session P50 of
   **199 ms** (n=24, exploratory). The quiet band straddles the ≤150 ms target;
   it does not support the earlier claim of a stable ~100 ms portable-host
   architecture deficit.
4. The old inferred Windows `renderer_ready → READY ≈100–120 ms` difference is
   **superseded**. Direct Windows instrumentation measures that segment at
   approximately **17 ms**, with exactly one render, one present, one surface
   configuration, no periodic-tick wait, no startup frame-pacing delay, and no
   duplicate blank frame.
5. A real platform/host difference remains in first-window creation: Windows
   first `create_window` is ~67 ms P50 in the later direct audit, versus
   ~11–12 ms for the Linux winit-only control. On Windows, a warm second hidden
   window costs ~12.5–14.8 ms, implying a large first-window-specific component.
   Much of this work overlaps GPU-instance initialization, so the raw window
   delta is **not** equal to a same-sized T2 critical-path penalty.

Therefore the Linux control disproves a mandatory >150 ms PocketJS portable
`hosts/desktop` floor, but it does **not** prove that the portable desktop
architecture itself adds a Windows-only ~100 ms tax.

---

## AUTHORITY AND RECONCILIATION ORDER

For the merged knowledge artifact, use this order:

1. `docs/BENCHMARK.md` — normative timestamp semantics.
2. `docs/WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1.md` — later direct
   Windows decomposition and T1-anchor finding.
3. This Linux control report — cross-platform control evidence, reconciled to
   the later Windows measurements.
4. Frozen archive snapshot at `982914b...` — immutable experiment-time report,
   raw evidence and review history.

`BENCHMARK.md` defines:

- `T0_ACTIVATION_REQUEST` — external activation/open request;
- `T1_PROCESS_ENTRY` — PicoView process entry begins;
- `T2_WINDOW_USABLE` — first interactive window frame submitted with the input
  loop alive;
- process-start → usable-window metric = `T2 - T1`;
- process-cold activation → first useful image = `T6 - T0`.

The later #40 audit leaves an owner-level benchmark-policy task: make the
measurement harness anchor literal `T1_PROCESS_ENTRY` directly and specify the
startup machine state. This report does not open a new gate or re-adjudicate
GATE-A/GATE-A2.

---

## ORIGINAL EXPERIMENT-TIME VERDICT

The frozen experiment snapshot concluded:

`WINDOWS_SPECIFIC_TAX`

That conclusion was reasonable from the evidence available at that moment:
Linux produced P50 123–127 ms while the then-authoritative Windows window
numbers were 247–261 ms, and the old Windows report lacked direct markers for
the full post-renderer segment.

The archive is intentionally **not rewritten**. Subsequent #40 instrumentation
changed the interpretation, not the historical experiment record.

The following experiment-time claims are now specifically superseded:

- Windows `renderer_ready → READY ≈ +100–120 ms` as a directly attributable
  first-frame/present tax;
- `247–261 ms Windows vs 123–127 ms Linux` as an apples-to-apples
  architecture-level `T1→T2` comparison;
- the implication that a second/native Windows host is already justified by a
  ~100 ms portable-host penalty.

---

## SOURCE IDENTITY

PocketJS campaign base:

`a5a85356e172db8a32aefa983ee1259f60406f69`

PocketJS effective tree tested on Linux:

`a46eb7e055ef443f5efecdac1cc447a3c1941805`

The tree was transferred by Git bundle and verified exactly on the Linux host.
The PicoView guest source was the same campaign guest and was truthfully
resolved by the official CLI for `linux-app` (`hostAbi=4`).

See:

`docs/linux-desktop-startup-control-1/source-identity-manifest.md`

for the retained identity manifest.

---

## LINUX HOST

Measured host:

- Fedora Linux 44, KDE Plasma;
- kernel 7.1.9-200.fc44.x86_64;
- Intel Xeon E5-2666 v3, 10C/20T;
- 62 GiB RAM;
- AMD Radeon RX 580 2048SP;
- Mesa 26.1.7 / RADV;
- wgpu backend: Vulkan, hardware `DiscreteGpu`, `force_fallback_adapter=false`;
- native Wayland for the primary arm; X11/XWayland as an exploratory arm;
- 2560×1440 display;
- AC power, `schedutil` governor;
- no third-party AV;
- no Xvfb and no software renderer selected.

The experiment used a real graphical session. Temporary plasmalogin autologin
configuration was reverted after the experiment.

---

## PORTABLE DESKTOP STRUCTURE

At `a46eb7e0`, the measured Windows and Linux startup paths use the same
portable `hosts/desktop` architecture:

| Component | Windows | Linux | Relationship |
| --- | --- | --- | --- |
| winit event loop | yes | yes | same host code |
| window handler | yes | yes | same handler; Windows adds PMv2 pin/check |
| QuickJS runtime / `Runtime::boot` | yes | yes | same code |
| `UiSurface` / guest | yes | yes | same code |
| text/offload worker | yes | yes | same code |
| `AppSupervisor` / DrawList / `UiRenderer` | yes | yes | same code |
| wgpu renderer | yes | yes | same code |
| surface/adapter/device/configure | yes | yes | same shape |
| GPU policy | Vulkan pinned + `MemoryUsage` | backend default + default hints | cfg-level difference |
| HOST_ID | `windows-app` | `linux-app` | target identity only |

Other platform-specific code exists outside this window-mode startup closure
(e.g. the Windows WIC decoder), but no image decode participates in this control.

---

## LINUX MEASUREMENTS

### Gate-quality full-host batches

| Session | n | P50 | P95 | min | max | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| B, Wayland stock | 55 | **127 ms** | **141 ms** | 112 | 144 | verified quiescent |
| C, Wayland stock | 50 | **123 ms** | **141 ms** | 114 | 156 | clean rebuild, quiescent |

Additional arms:

- X11/XWayland exploratory n=20: P50 106 / P95 122 ms;
- Session A stock n=55: P50 132 / P95 279 ms, **exploratory only** because its
  tail was contaminated by self-inflicted background build load;
- attempted `--density 2` arms were invalid as density controls because plan
  loading overwrote the CLI value; they are only stock-equivalent replicates.

### Direct process-relative stage trace (Session B)

| Stage completion from `main_entry` | P50 | P95 |
| --- | ---: | ---: |
| event loop built | 7 | 9 |
| window created / runtime spawning | 11 | 13 |
| runtime boot done | 47 | 51 |
| GPU instance ready | 70 | 82 |
| adapter/device complete | 115 | 126 |
| surface configured / GPU ready | 119 | 131 |
| runtime renderer ready | 121 | 133 |
| first usable READY / present | **127** | **141** |

This gives a directly observed Linux process-entry-class startup shape in the
~127 ms median range for Session B.

### Linux controls

**Control A — winit only**

P50 **11 ms** / P95 **12 ms** (n=20, Wayland).

On Wayland a bufferless window has no compositor frame callback, so this control
means `window created + event loop alive`; on X11/XWayland the same control
reaches `RedrawRequested` at ~10 ms.

**Control B — winit + wgpu**

P50 **107 ms** / P95 **112 ms** (n=20).

Serial decomposition on this Linux host:

- wgpu instance ~69 ms;
- adapter + device ~37 ms;
- surface + configure ~4 ms;
- first clear + present ~1 ms.

**Control C — full PocketJS host**

P50 **123–127 ms** / P95 **141 ms** across the two quiet gate batches.

The full host adds only a small net amount over the winit+wgpu control because
QuickJS/guest boot is largely overlapped with GPU initialization.

---

## ORACLE VALIDATION

The Linux timing/DAG oracle remains valid.

A nominal critical-path delay requested as +100 ms actually slept ~109 ms and
moved T2 by ~51 ms because the GPU-instance lane absorbed ~58 ms in parallel.

A guest-lane delay recorded at ~115 ms moved T2 by ~27 ms because the existing
~72 ms overlap slack absorbed the remainder.

These outcomes match the independently measured DAG rather than a naive sum of
stage durations.

This result remains useful after the cross-audit reconciliation: it proves the
Linux stage trace and overlap model are meaningful.

---

## WINDOWS #40 RECONCILIATION

Later Windows audit authority:

`docs/WINDOW-STARTUP-CRITICAL-PATH-REALITY-AUDIT-1.md`

PicoView main closeout SHA:

`491d0a5e277345b2b400e8b7f0647a0057ea59bb`

### 1. Historical external startup contained generic pre-main cost

The historical Windows probe used process spawn as the T1 proxy. #40 joined
kernel process-creation timestamps, process-relative markers and READY output and
found roughly **90–130 ms** of generic pre-main/process-creation cost on the
measurement host.

Controls showed the same class of delay for non-PicoView programs, including a
small Rust hello-world binary and `cmd`, so this segment cannot be attributed to
PocketJS portable-desktop architecture.

Therefore the historical external 247–261 ms window numbers must not be
compared directly against Linux 123–127 ms and called an architecture tax.

### 2. Windows process-entry → T2 is much smaller than the old external number

#40 reports:

- quiet-session in-process estimate band: roughly **125–153 ms**;
- degraded/noisy direct P50: **199 ms**, n=24, exploratory;
- startup remains sensitive to host/session state;
- no gate re-adjudication is possible until T1 anchoring and machine-state
  policy are fixed by the owner.

The quiet Windows band is therefore in approximately the same 150 ms class as
the Linux result, rather than being stably ~100 ms slower.

### 3. Windows first-frame/present block is ~17 ms, not ~100–120 ms

Direct #40 markers measure:

`renderer_ready → first tick/render → Wake → RedrawRequested → acquire → blit → submit/present → READY`

at approximately **17 ms** on the instrumented Windows build.

Before READY the audit counted exactly:

- one render submission;
- one present;
- one surface configuration;
- one UiRenderer build;
- one Blit build.

It found no periodic-tick startup wait, no first-frame pacing delay, no duplicate
surface configuration and no initial blank frame that consumed a second present.

The old Linux report's `Windows +100–120 ms` first-frame/present estimate came
from subtracting medians from different historical measurements. It is now
**superseded and must not be used**.

### 4. Windows first-window creation remains a real difference

#40 directly measures first `create_window` at about **67 ms P50** in the
instrumented session, versus about **11–12 ms** for Linux Control A.

A second warm hidden Windows window takes only ~12.5–14.8 ms, suggesting about
~54 ms of first-window-specific work on that measured Windows host.

The interval was checked not to hide guest/GPU work: DPI pin/verify were
separately marked and no guest or GPU callbacks execute inside the measured
window-create interval.

However, Windows GPU-instance initialization runs concurrently with this window
work. Therefore the 50+ ms raw window difference cannot be treated as a 50+ ms
recoverable T2 penalty.

### 5. Correct the adapter/device dimensional comparison

The original Linux report compared `gpu_adapter_device ≈115 ms` on both hosts.
That value was a **completion timestamp from process entry**, not the duration of
adapter+device creation.

Correct comparison:

- Linux Control B adapter + device duration: about **37 ms**;
- Windows #40 direct duration: adapter ~7.6 ms + device ~13.2 ms = about
  **21 ms** in the measured session.

Because the machines, GPUs and drivers differ, these durations should not be
used to rank the backend implementations. The important correction is simply
that `115 ms vs 115 ms` was not a valid duration comparison.

---

## NORMALIZED INTERPRETATION

The most defensible cross-platform picture is now:

| Question | Linux | Windows | Interpretation |
| --- | --- | --- | --- |
| Can the same portable desktop architecture operate in the ~150 ms process-entry class? | yes, P50 123–127 / P95 141 in quiet gate batches | quiet estimate ~125–153; noisy direct P50 199 | **portable >150 ms floor not proven** |
| Is QuickJS/guest boot the dominant problem? | no, largely overlapped | no, largely overlapped | same architectural conclusion |
| Is first-frame/present a ~100 ms Windows tax? | ~6 ms after renderer ready | ~17 ms direct | **no; old inference refuted** |
| Is first-window creation materially heavier on measured Windows host? | ~11–12 ms control | ~67 ms first window | yes, but substantially overlapped |
| Does historical Windows external launch contain a large non-PocketJS term? | not isolated in this experiment | ~90–130 ms generic pre-main on measured host | yes |

The cross-platform control still matters: it shows that PocketJS portable
`hosts/desktop` is capable of meeting the 150 ms class on a real Linux desktop,
and it provides an independent architecture/control group. What it no longer
supports is the claim that Windows portable desktop necessarily carries an
extra ~100 ms runtime tax.

---

## WINDOWS CONTROLLABLE MECHANISMS FROM #40

The later Windows audit found only small bounded code mechanisms:

- E4, overlap surface-free adapter/device request with window creation:
  paired mean improvement ~**12.1 ms**;
- E5, release the device to the runtime before caps/configure completes:
  improvement ~**5 ms** after the invalid first run was discarded and rerun
  with corrected environment hygiene.

Combined proven gain: about **17 ms**, below the audit's MATERIAL band and not
shown to be gate-shaping.

Accordingly #40 closed with:

`NO_BOUNDED_CORRECTIVE_EARNED`

and created no C7.

---

## OPTION 1 — DIRECT / DEVICE-STYLE WINDOWS HOST

**OPTION_1_NOT_EARNED**

The original Linux report classified a direct/native Windows host as
`OPTION_1_PLAUSIBLY_EARNED`, based largely on the then-apparent ~100 ms Windows
portable-host deficit.

That premise no longer survives direct Windows instrumentation:

- the first-frame/present ~100–120 ms estimate collapsed to ~17 ms;
- the historical ~250 ms external startup included ~90–130 ms of generic
  pre-main host cost;
- quiet Windows in-process startup is estimated at ~125–153 ms;
- only ~17 ms of bounded Windows code optimization is currently proven.

Creating a second Windows host/renderer architecture would therefore be a large
mechanism response to a deficit that is not presently proven to belong to the
portable host.

Do not prototype the direct/device-style Windows host from this evidence.
Reconsider only if a future correctly anchored, machine-state-controlled
Windows benchmark proves a robust material deficit and attributes it to a
replaceable portable-host mechanism.

---

## LIMITATIONS

The Linux and Windows measurements come from different hardware:

- Linux: older Xeon E5-2666 v3 + discrete RX 580 / RADV;
- Windows: Ryzen 7 5800H + AMD integrated GPU / Windows driver stack.

Absolute stage durations are not portable between those machines.

Additional Linux limitations retained from the reviewed experiment:

- Session A tail was contaminated by self-inflicted background build load and is
  exploratory only;
- the attempted density-2 control was ineffective because plan loading
  overwrote the CLI density;
- Session B binary hash was not captured before the oracle build replaced the
  output path; Session C has a retained hash and source verification;
- the Wayland path later hits a wgpu-hal GLES/Mesa teardown SIGSEGV strictly
  after READY; retained phase logs show READY before teardown, so the measured
  startup interval is unaffected;
- the Linux T0/T2 harness used realtime timestamps and could in principle be
  affected by a clock step; no such outlier appears in retained samples;
- this experiment did not perform a Linux equivalent of the later Windows
  kernel-create→main wall join, so it does not claim a cross-OS pre-main cost
  comparison.

Windows limitations and machine-state sensitivity remain documented in #40.

---

## EVIDENCE RETENTION

The complete reviewed raw experiment snapshot is intentionally **not** merged
into `main`.

Full evidence remains at:

- historical full-evidence PR: **#41**, closed and unmerged;
- experiment branch: `audit/linux-desktop-startup-control-1`;
- immutable archive branch:
  `archive/linux-desktop-startup-control-1-full`;
- frozen evidence SHA:
  `982914b598171045ffa38eefa3ebbc6df6e981e2`.

The archive contains:

- all per-sample stdout/stderr;
- raw CSV batches;
- ambient-state captures;
- build logs;
- oracle traces;
- full measurement scripts;
- source identity metadata;
- the original experiment-time report and review corrections.

A second full replica remains on the Linux control host.

The slim merge candidate keeps only:

- this reconciled report;
- source identity manifest;
- summary statistics CSV;
- percentile tool;
- primary sample runner.

---

## STATUS / NEXT ACTION

This reconciliation changes only the **interpretation layer** in the slim PR.
It does not modify the frozen experiment archive, raw statistics, scripts,
historical GATE evidence, PocketJS, production code, #29 or #31.

Current campaign consequences remain:

- #40: closed, `NO_BOUNDED_CORRECTIVE_EARNED`;
- C7: none;
- #29: unchanged physical reference-class blocker;
- #31: unchanged physical cross-monitor DPI blocker;
- GATE-A3: not authorized;
- Product Phase B: blocked.

Next owner task before any new startup performance work:

1. keep `BENCHMARK.md`'s `T1_PROCESS_ENTRY` semantics unchanged and make the
   benchmark harness anchor that literal process-entry event directly;
2. define the startup benchmark machine-state specification; then
3. only remeasure/re-adjudicate if those authority changes are accepted.

No Windows perf corrective and no direct/native-host experiment is earned by
this report.

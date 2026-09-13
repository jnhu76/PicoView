# STARTUP-LAST-MILE-REALITY-AUDIT-1

Campaign: read-mostly, experiment-first startup investigation (owner goal,
2026-09-13). No production code was modified; all experiments used existing
binaries, existing measurement plumbing, one throwaway `git worktree` build
(removed after use), and scripted load/cache interventions on the host.

**VERDICT: ENVIRONMENT_BOUND** — for the audit's primary question (why the
same architecture measured P50 ≈ 293 ms in the C1 session and ≈ 364 ms in the
GATE-A2 session). The cross-session variance is dominated by an uncontrolled
machine state — background CPU load / scheduler contention on the measurement
host — proven by intervention. The project has no truthful benchmark-state
definition for that state. The variance must not be converted into a PASS or
FAIL by choosing a favorable session. **CORRECTIVE EARNED: NO. No C7.**

## 0. Identity (frozen before any reasoning)

| Item | Value |
| --- | --- |
| PicoView remote / branch / HEAD | `git@github.com:jnhu76/PicoView.git` / `main` / `b344dd62af60c1c1ee2b7794169c0e297949c373` — clean worktree |
| PocketJS remote / branch / HEAD | `https://github.com/pocket-stack/pocketjs` / `picoview-c4-present-pacing` / `a46eb7e055ef443f5efecdac1cc447a3c1941805` — clean; untracked `evidence/`, `guest/` harness artifacts only (pre-existing) |
| PocketJS campaign base | `a5a85356e172db8a32aefa983ee1259f60406f69` (frozen) |
| Product binary | `pocket-desktop-host.exe` 12,166,656 B, built 2026-09-13 14:32:20 (+0800) — the GATE-A2 build, content = `a46eb7e0` |
| Guest assets | `dist/picoview-a6-main.pak` 304,944 B + `.js` 345,215 B, built 12:49 (C3-era declaration; unchanged through the gate) |
| Toolchain | `rustc 1.98.1 (48a229cea 2026-09-01)` `stable-x86_64-pc-windows-msvc`; cargo 1.98.1; Bun 1.2.8 |
| wgpu / winit / naga | 25.0.2 / 0.30.13 / 25.0.1 (engine Cargo.lock) |
| Host | Windows 11 Pro build 26200; AMD Ryzen 7 5800H (16 LP); 28.9 GiB RAM; AMD Radeon(TM) Graphics iGPU, driver 31.0.21923.11000; power plan Balanced; display 2560×1440 @ 60 Hz |
| **AV posture (newly recorded — absent from ALL prior evidence)** | **WinDefend STOPPED; Tencent QQPCRTP realtime protection RUNNING (Auto)** — third-party AV hooks process creation in every historical measurement |
| Sample | `picoview-12mp.jpg` (12,000,000 px) on local SSD (unchanged) |

## 1. Historical comparison — C1_PASS_SESSION vs GATE_A2_FAIL_SESSION

Raw CSVs re-analyzed from `evidence/tmp/logs/` (percentiles recomputed
independently; nearest-rank; values match the recorded evidence within 1 ms).

| Condition | C1 official (`c1-startup-official.csv`) | GATE-A2 (`gate-startup-image.csv`) |
| --- | --- | --- |
| Wall time | 11:21 (probe ends 11:21:28) | 14:32:2x – 14:33:21 |
| PocketJS content | `23f634cd`+`d1ae693e` (C1) | `a46eb7e0` (C1+C2+C3+C4) |
| PicoView | C1 branch (pre-merge) | `main` @ `8c63345` |
| Exe age at probe start | ~36 min, ≥115 prior executions (built ~10:45; probes 10:49, 11:00 before it) | **<1 min, 0 prior executions (built 14:32:20)** |
| Prior same-session activity | 2×55-run image probes + fixtures (10:42–11:00) | memory/idle/pacing legs followed startup; startup ran first (14:32) |
| Image-mode T0→IMGREADY | **P50 293 / P95 339, min 279** | **P50 364 / P95 390 incl. warm-up; 363/384 excl. (min 330)** |
| Within-probe trajectory | first10 avg 503 (early-run penalty incl. 2067 outlier) → **last10 plateau ~297** | first10 avg 435 → **last10 plateau ~363** |
| Window mode | P50 247 (n=55; `c1-window-official.csv` mtime 11:36:46 — CORRECTIVE-C1 §3's "11:50" label appears mtime-swapped with the C2base window file) | P50 261 (n=20, 14:38) |
| `POCKET_GPU_BACKEND` | unset (protocol) | unset (asserted) |
| Background load | **not recorded** | **not recorded** (agent mid-campaign) |
| Spawn window state | minimized | minimized |

**Methodological differences (explicit):**

1. **Build content differs** (C1 vs chain-end) — later isolated by same-window
   interleaved A/B: **Δ ≈ 10–12 ms** (chain-end 351 vs C1-content 339;
   per-pair mean +10.2 ms, 9/12 pairs positive, against a +2.5 ms
   same-binary interleaved control). Real but an order of magnitude too
   small to explain 71 ms.
2. **Exe age/scan-state differs** (36 min/~115 runs vs <1 min/0 runs). The
   first-ever spawn of a fresh binary stalls the spawn term itself (gate run0:
   `spawnMs=606`, total 1015; today's fresh C1-content build: first-ever
   spawn `spawnMs=598`). This is a one-time-per-binary image-scan/
   repurposing event; it elevates the early part of a probe, not the plateau
   (§4).
3. **Machine state differs and was unrecorded** — the proven variance
   mechanism (§6); the per-session attribution of the two historical numbers
   to specific load states remains inference (no telemetry exists for
   11:21/14:32; thermal/soak fits the same time-of-day ordering and cannot
   be excluded retroactively).
4. Window-mode n (55 vs 20, the latter exploratory per BENCHMARK).

**The two sessions were not methodologically equivalent.** The 71 ms gap must
not be read as a runtime regression between `23f634cd` and `a46eb7e0`, and the
293 must not be read as a reproducible architecture property: the same C1
content measured 293 at 11:21 and 339 (interleaved, controlled) today.

## 2. Methodology

All experiments used the unmodified A7 probe (`bench-startup.ps1`: QPC
Stopwatch, `Start-Process -WindowStyle Minimized`, 5–10 ms file-poll
detection, per-run stdout/stderr capture, nearest-rank percentiles) and the
existing `--announce-ready` phase markers (`A7EVENT,phase,<name>,<proc_ms>`,
same-origin monotonic from process entry). New scripts created for this audit
(measurement plumbing, untracked): `audit1-phases.ps1` (instrumented spawns),
`audit1-ab.ps1` (interleaved single-spawn A/B, ABBA order), `audit1-load.ps1`
(ABA background-load blocks with N CPU workers). Raw artifacts:
`evidence/tmp/logs/audit1-*.csv|.err|.out`.

Chronological experiment log (all 2026-09-13, image mode T0→IMGREADY P50
unless noted):

| Time (artifact mtime) | Experiment | Result |
| --- | --- | --- |
| 17:57 | env snapshot | uptime 9.24 h; CPU load 70 % (agent itself); free RAM <1 GiB; QQPCRTP running, WinDefend stopped |
| 17:58 | 10 instrumented spawns | IMGREADY 380–402; phase table §5 |
| 18:00 | 55-run probe (S1-a) | 384 / 439 |
| 18:00–18:15 | 55-run probe (S1-b) + 55-run window (background pair) | 383 / 457; window **307 / 418** |
| 18:16 | E1: fresh-path copy of same-hash exe, interleaved 12+12 | A 348 / B 337 — **null** (per-path rescan is not the mechanism) |
| 18:18 | VkCache emptied (216 MiB → 44 K, one locked `.parc`; equivalent to Adrenalin "Reset Shader Cache"); 3 instrumented spawns, then 20-run curve | instrumented run0 IMGREADY 405 → run1/2 341/342 (console only; corroborated by persisted phase lines: cold `gpu_instance` **91 ms**); persisted curve `audit1-vkcold-curve.csv` run0/1/2 = **361/359/365**, plateau P50 352 / P95 366 — **null** (cache is not the mechanism) |
| 18:21 | E3 load intervention ABA (0/12/0 workers) | **334 → 619 → 317** (+285 ms at 61 % machine load, full recovery) |
| 18:35 | window 55-run re-probe, load 7 % | **260 / 275** (= GATE-A2's 261; busy-state S1 was 307) |
| 18:41 | S4 content A/B, attempt 1 (worktree binary) | **failed run — arm B 0/12 valid IMGREADY** (freshly built worktree binary exited before markers: its `dist/` is gitignored and unresolved; pair-0 spawn 598 ms = first-ever-execution stall) |
| 18:42 | S4 content A/B, attempt 2 with `POCKETJS_DIST` set for both arms (same dist as all other runs) | chain-end **351** / C1-content **339** — content Δ ≈ 10–12 ms |
| 18:44 | S5 oracle control: +100 ms test-only sleep injected before window creation in the worktree build; probed; reverted and rebuilt | P50 429 vs 339 same content (**+90 ms detected**); phase lines localize it exactly (`runtime_thread_spawning` 80→186 ms) — **oracle valid** |
| 18:48 | dose-response (0/3/0 workers) | **358 → 442 → 347** (+84 ms at ~25 % load; block B not steady-state — first-half 505 vs second-half 439 — so the +84 ms carries ±tens-of-ms uncertainty) |
| 18:48 | S3 backend: `POCKET_GPU_BACKEND=DX12` 8 runs; Vulkan control 8 runs | **760 / 964** vs 382 / 641 — DX12 disqualified; backend not a drift term |

## 3. Coldness taxonomy (as actually observable here)

| Level | Definition | Status in this audit |
| --- | --- | --- |
| L0 | same process | not admissible (BENCHMARK); not used |
| L1 | process-cold | every probe spawn (new process each time) |
| L2 | process-cold, OS file cache warm | all measurements today and in all historical sessions (BENCHMARK §6 "normal OS-cache conditions") |
| L3 | driver/shader cache warm | the default state of every recorded session (all-day build+run activity); `gpu_instance` ~90–116 ms |
| L4 | driver/shader state reset | **VkCache emptied: NO measurable startup penalty** (§2, 18:18). KNOWN: AMD user-mode Vulkan shader cache resets cleanly and costs nothing measurable here. LIKELY: ICD/driver-heap first-touch after boot carries the real "cold" cost (C1's n=1 187 ms serial-era figure). UNKNOWN: any reliable full driver reset short of reboot. |
| L5 | reboot-cold | **not exercised** — a reboot would destroy the live audit session; no truthful claim is made. Open item. |

## 4. Session matrix (image mode unless noted)

| Session | Binary content | exe age | machine state | P50 | P95 | notes |
| --- | --- | --- | --- | ---: | ---: | --- |
| 10:42 C2base | `8e9e09f9` | fresh | post-build | 455 | 531 | first10 503-class decay |
| 10:49 C1-v2 | C1 | fresh | post-build | 362 | 436 | |
| 11:00 C1-final | C1 | 15 min | settling | 331 | 381 | |
| **11:21 C1-official** | C1 | 36 min | warm; load unrecorded (label "quiet" = retrospective inference) | **293** | 339 | plateau ~295; min 279 |
| 11:22 C2base-official | `8e9e09f9` | ~40 min | warm | 354 | 441 | same-window control of the 293 (n=1 pair) |
| 12:55 C3-sanity | C3 chain | fresh-ish | campaign | 359 | 460 | n=20, exploratory |
| **14:33 GATE-A2** | `a46eb7e0` | <1 min | campaign | **364** (363 excl. warm-up) | 390 | plateau ~363; min 330 |
| 14:38 GATE-A2 window | `a46eb7e0` | 6 min | campaign | 261 | 276 | n=20 (exploratory) |
| 18:00 S1-a | `a46eb7e0` | 3.5 h | busy (load 70 %) | 384 | 439 | |
| 18:00 S1-b | `a46eb7e0` | 3.5 h | busy | 383 | 457 | |
| 18:15 S1 window | `a46eb7e0` | 3.5 h | busy | 307 | 418 | n=55 |
| 18:16 E1 A/B | `a46eb7e0` (orig vs copy) | 3.5 h | quieting | 348 / 337 | — | null |
| 18:18 VkCache-cold | `a46eb7e0` | 3.5 h | quiet; cache emptied | 352 (run0 361) | 366 | null |
| 18:21 load ABA | `a46eb7e0` | 3.6 h | 9 % / 61 % / 11 % load | 334 / **619** / 317 | — | intervention |
| 18:35 window quiet | `a46eb7e0` | 3.6 h | 7 % load | **260** | 275 | n=55 |
| 18:42 content A/B | `a46eb7e0` vs C1 | mixed | quiet | 351 / 339 | — | content Δ 10–12 ms |
| 18:44 oracle +100 ms | C1+delay | fresh | quiet | 429 | — | detected; stage-localized |
| 18:48 dose 3w | `a46eb7e0` | 3.8 h | 14 % / 25 % / 10 % | 358 / **442** / 347 | — | +84 ms; block B not steady-state |
| 18:48 DX12 / Vulkan | `a46eb7e0` | 3.9 h | quiet-ish | 760 / 382 | 964 / 641 | backend constant, not drift |

## 5. Stage decomposition (current build, instrumented runs)

`A7EVENT,phase` medians, process-entry origin (ms):

| Stage | S1 busy (17:58) | VkCache-cold quiet (18:18) | C1-era warm (CORRECTIVE-C1 §3, 5-run medians) |
| --- | ---: | ---: | ---: |
| entry → event_loop_built | ~17 | ~16 | — |
| → window created (`runtime_thread_spawning`) | ~96 | ~81 | 69 |
| → `gpu_instance` (side thread: ICD + instance) | ~106 | ~92 | 89 |
| → `runtime_boot_done` (guest boot, overlaps GPU) | ~131 | ~113 | 96 |
| → `gpu_adapter_device` | ~133 | ~115 | — |
| → `gpu_surface_configured` / `gpu_ready` | ~152 / ~156 | ~131 / ~135 | — / 121 |
| → `runtime_renderer_ready` | ~151–169 | ~139 | 123 |
| external T0→IMGREADY | 380–402 | 341–405 | ~291 (plateau) |

Reading: every stage shifts together with machine state (±10–20 ms per stage,
compounding to the ±40–90 ms totals); no single stage owns the drift. The
largest single block is the post-`gpu_ready` span to first present
(~180–210 ms in image mode: first-tick scheduling + 12 MP WIC decode +
composition + present submission; decode-in-critical-path is A3/A5/Phase-B
scope per GATE-A2 §10 and was not modified).

**Overlap audit (Phase 8):** C1's overlap is live and verified in the current
build — guest boot (`runtime_boot_done` ~111–131) completes before
`gpu_ready` (~135–160) in every instrumented run; the instance side thread
overlaps window creation. Remaining serial chain on the main thread: window
creation → short wait on instance (usually pre-completed) → adapter/device →
surface → renderer → first tick. No accidentally serialized independent work
was found beyond what C1 already overlapped; text initialization does not
block the first image.

## 6. Proven mechanism behind the cross-session variance

**Measurement-host background CPU load state** — proven by intervention for
the variance itself; the attribution of the *specific historical* session
numbers to specific load states is inference (their load was never recorded;
§13):

1. **Correlation** — same binary, same hour: busy 383–384 vs quiet 317–334
   (image), 307 vs 260 (window); historical session plateaus (293 → 363 → 376)
   track the day's ambient activity and fit the load mechanism (thermal/soak
   fits the same ordering and is not excluded).
2. **Mechanism** — startup is dense CPU-parallel work (process creation,
   image/DLL page-in, QuickJS boot, wgpu ICD load, adapter/device init, WIC
   decode); scheduler contention from background workers directly inflates
   all of it. The intervention was not further decomposed (CPU contention vs
   memory/page-cache pressure vs AV hooks on worker spawns are folded into
   "load"); with free RAM <1 GiB the memory-pressure contribution is
   untested. QQPCRTP's kernel-side process-creation hook sits on the same
   path in every measurement.
3. **Intervention** — ABA blocks: 0/12/0 workers ⇒ **334 → 619 → 317**;
   0/3/0 workers ⇒ **358 → 442 → 347**. +11 % machine load (+3 workers)
   costs ~+84 ms — the historical ±70 ms band is fully covered by
   ordinary ambient-load differences (agent harness, browser, AV scans).

## 7. Cache findings (Phase 7)

- App-owned shader/pipeline compile ≈ 5 ms (C1) — nothing to cache.
- **AMD `VkCache` (216 MiB) emptied → no startup penalty** (`gpu_instance`
  91 ms cold-first-run, faster than the same-day warm mean; IMGREADY plateau
  unchanged 341–352). The 216 MiB cache is not a startup asset on this
  driver; C1's serial-era 187 ms "cold" `gpu_instance` was first-touch-after-
  boot driver state, not shader-cache coldness.
- Per-path AV rescan of a copied (same-hash) exe: null (348 vs 337).
- Per-binary first-ever-execution stall is real (fresh-build first spawn:
  598–606 ms `spawnMs`) but is a run0/warm-up phenomenon, not a session
  plateau shifter.
- OS file cache: BENCHMARK §6 counts it as normal conditions; all recorded
  sessions are L2.

## 8. Backend comparison (Phase 6)

| Backend (same binary, env knob) | P50 / P95 (n=8) | verdict |
| --- | --- | --- |
| Vulkan (default, `POCKET_GPU_BACKEND` unset) | 382 / 641 (this window); 317–352 plateaus elsewhere | only viable backend |
| DX12 (`POCKET_GPU_BACKEND=DX12`) | **760 / 964** | disqualified: constant +~400 ms P50 (confirms C1's n=1 +514 ms) and C2's memory accounting |

Backend selection is a constant offset, not a session-variable term — it
cannot explain cross-session drift. Decision priority (1) "reliably passes
the hard startup gate" is met by no backend on this host.

## 9. Window-mode analysis (Phase 9)

Window mode (no decode) quiet-state plateau for the C1 and chain-end content
is stable across sessions: **247 (C1, `c1-window-official.csv` 11:36) / 261
(GATE-A2, 14:38) / 260 (today, 18:35)**; busy state inflates it to 307. This
stability is **content-scoped, not universal**: the C2-era content measured
**323 / 363** in the same quiet midday state (`c2base-window-official.csv`,
11:50, cited in CORRECTIVE-C1 §3) — C1's startup-overlap corrective
demonstrably moved the window-mode quiet plateau by ~76 ms, so that
difference is content-addressable. For the admitted candidate content,
however, every observed state — quiet or busy, morning or evening — stays in
247–307: the dominant stages (instrumented: entry→window ~80–96, GPU
instance+adapter+surface ~60–70, guest boot ~35 overlapped, first present
~50; none of them JPEG decode) put the ≤150 ms interactive budget ~100 ms out
of reach in the **best** observed environmental state. This is a
host-architecture shortfall (STABLE_FAIL on the current candidate), not an
environmental one, and it does not reduce to Phase-B decode work.

## 10. Benchmark oracle (Phase 11)

- **T0 validity**: T0 = QPC Stopwatch start immediately before
  `Start-Process`; the process-creation term (~14–25 ms typical) is included
  by definition (probe header; PRD measures from activation request).
- **T6 validity**: IMGREADY is printed by the host on the first successful
  present after `image_pending` (present-submission proxy per BENCHMARK §5);
  the probe's matcher tests IMGREADY before READY (C1 review fix verified in
  script source).
- **Stub validation**: `validate-probe.ps1` (±60 ms on known READY→IMGREADY
  intervals) pre-exists.
- **Injected-delay control (this audit)**: +100 ms test-only sleep before
  window creation in a throwaway build ⇒ probe read +90 ms at P50 and the
  phase lines localized it exactly (`runtime_thread_spawning` 80 → 186 ms).
  The delay build was reverted and removed; no production tree was touched.
- **Verdict: BENCHMARK ORACLE VALID.** The 293-vs-364 contradiction is not a
  measurement artifact. Known instrument limits: poll quantization ≤ ~10–15
  ms/run (symmetric across arms), no clock-domain mixing (single QPC domain;
  epoch-markers used only as corroborating second channel).

## 11. Environmental confounders (Phase 10)

| Confounder | status |
| --- | --- |
| Background CPU load | **PROVEN dominant** (§6) |
| QQPCRTP realtime AV (WinDefend STOPPED) | active in every session incl. historical; kernel-side process-create hook inside every measurement; per-path rescan excluded (E1); per-hash first-run stall confined to run0. Uncontrolled; constant-ish, variance contribution unresolved |
| Agent harness (ZCode/node) | present in every session incl. historical; contributes baseline load (~7–11 % machine load observed); part of §6's mechanism |
| Free RAM <1 GiB (today) | constant across today's quiet/busy arms (334/317 quiet despite pressure) — no measured independent effect; unrecorded historically |
| Thermal/boost state | no clock telemetry recorded; HYPOTHESIS only (would inflate late-day sessions; cannot retro-verify) |
| Defender | STOPPED on this host — not a factor (but note: any future host with Defender live is a different AV posture than all recorded evidence) |
| Disk cache / NVMe | L2-warm everywhere per protocol; not drift |

## 12. Proven mechanism / hypotheses

- **PROVEN BY INTERVENTION (variance mechanism)**: background CPU load state
  of the measurement host (§6). Same content swings 293 ↔ 384 under realistic
  machine states. The mapping of the specific historical sessions (11:21's
  293, 14:32's 364) to specific load values is **inference** — no telemetry
  was recorded then.
- **QUANTIFIED (content)**: C3+C4 additions cost ≈ 10–12 ms on the startup
  plateau (interleaved A/B) — real, accepted as part of the merged
  correctives, an order below the drift band.
- **HYPOTHESIS (unproven)**: thermal/boost decay across the day; QQPCRTP
  scan-schedule variance; residual sub-ms page-cache differences. None meets
  the three-part standard; none is claimed.

## 13. Unresolved uncertainty

- L5 reboot-cold and true post-boot first-launch behavior were not measured
  (session-killing); C1-era serial 187 ms `gpu_instance` remains the only
  first-touch-after-boot data point.
- The exact ambient load at the 11:21 C1-official and 14:32 gate sessions is
  unrecoverable (no telemetry was recorded then). The plateau ordering
  (293 < 363 < 376) is consistent with the proven mechanism but the precise
  per-session load values are unknown.
- Whether QQPCRTP's scan scheduling adds minute-scale variance on top of
  nominal load (its kernel-side cost is inside every number ever recorded).
- **Transferability**: every number in this audit — and in the entire
  Architecture-A campaign — comes from ONE host (Ryzen 7 5800H laptop, AMD
  iGPU, Vulkan-only after C2/C1 disqualifications, 28.9 GiB RAM, one AV
  posture). The load-variance mechanism is physically generic, but its
  magnitude on other CPUs/GPUs/AV stacks is unmeasured; this audit makes no
  transferability claim.

## 14. Current classification

- **Session-variance classification: UNSTABLE_CROSSING** — comparable
  sessions of the same build straddle the 300 ms line (293 pass-state vs
  363/384 fail-states), with the discriminator now identified and proven
  (background load), not architectural regression and not measurement error.
- Image-mode budget (≤300 P50): best truthful observed state = 293 (7 ms
  margin, once, IQR 4); representative states with the development agent
  alive = 317–390. **FAIL in every robust reading.**
- Interactive budget (≤150 P50, window mode): 247–261 quiet / 307 busy —
  **STABLE_FAIL**, architecture-owned, environment-independent.
- Measurement oracle: VALID.

## 15. Verdict and dispositions

**OUTCOME: ENVIRONMENT_BOUND.**

- The variance between the 293 and 364 sessions is real, explained by a
  proven (intervention-grade) environmental mechanism, and must not be
  converted into a PASS by session selection. The audit's primary question is
  answered.
- **CORRECTIVE EARNED: NO.** A runtime C7 cannot flip the gate: the best
  observed state leaves ≤7 ms margin on the image budget and the interactive
  budget fails by ~100 ms in the best state; a load-spec is a benchmark-
  protocol decision, not a code corrective.
- What the project actually lacks is a **truthful benchmark-state
  definition**: BENCHMARK should name the machine-state conditions (ambient
  load ceiling + telemetry, AV posture, exe-age/warm-up handling, uptime)
  under which startup numbers are admissible, and gate runs must record them.
  This is an owner/gate authority decision and is NOT made here.
- GATE-A2's FAIL verdict stands; historical evidence is not rewritten; #29
  and #31 remain blocked and untouched; no new gate is opened; Product Phase
  B remains blocked.

#29 STATUS: UNCHANGED (blocked — reference-class hardware unavailable).
#31 STATUS: UNCHANGED (blocked — single-display host).
PRODUCT PHASE B: BLOCKED.

**NEXT ACTION**: owner decision — adopt (or reject) a BENCHMARK machine-state
specification for startup evidence (ambient-load ceiling with recorded
telemetry, AV posture, exe-age/warm-up rule, uptime recording), then
re-adjudicate startup under that spec together with the still-open C5/C6
blockers.

## 16. Review trail

Two fresh-context adversarial reviews ran against the draft of this document
(both had full read access to the raw artifacts and recomputed percentiles
independently):

- **STARTUP-MECHANISM-ADVERSARY — REVISE**, 2 MAJOR + 7 MINOR. All MAJORs
  fixed in this revision: (1) §9's window-plateau stability claim was
  content-scoped and the contradicting `c2base-window-official.csv` 323/363
  datum (same quiet midday, cited by CORRECTIVE-C1 itself) is now in §9 —
  the STABLE_FAIL conclusion on the candidate content is unchanged; (2) the
  unpersisted VkCache "405/341/342" instrumented-run series is replaced by
  the persisted curve values (361/359/365, P50 352) with the corroborating
  persisted phase lines (`gpu_instance` 91 ms) named. MINOR dispositions:
  "PROVEN" wording narrowed to mechanism-proven/attribution-inferred (§6,
  §12); chronology re-anchored to artifact mtimes (§2, §4); §5 table
  corrected (renderer-ready filled from persisted `.err`; C1-era column
  replaced with CORRECTIVE-C1 §3's 5-run medians, single-run numbers
  dropped); C3-sanity P95 corrected 376 → 460 (nearest-rank, n=20); window
  file timestamp swap noted (§1); ambiguous IQR figures replaced by exact
  min/max; C2base "paired control" softened to an n=1 observation (§6);
  failed first content-A/B attempt disclosed (§2); single-host/Vulkan-only
  transferability limitation added (§13); load-block steadiness caveat added
  (§2 dose row).
- **BENCHMARK-ORACLE-ADVERSARY — CONFIRM**, 0 BLOCKER/MAJOR + 7 MINOR
  (overlapping the above; additionally: T6 code-verified as strictly
  post-`queue.submit`/`present` with no skip path printing markers; sample
  independence verified — no single-instance/mutex/window-reuse path exists
  in the host; no headline percentile drops outliers; smallest
  decision-relevant delta (content Δ ≈ 10–12 ms) is ≥ the 5–10 ms poll
  quantization and is used only for the ≪71 ms conclusion; injected-delay
  validation corroborated within-run by phase-line localization).

Verdict unchanged under both reviews: **ENVIRONMENT_BOUND**, no C7, startup
FAIL stands on both budget lines in every robust reading.

STOP. Do not begin Phase B. Do not run a new gate.

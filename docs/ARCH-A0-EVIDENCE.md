# ARCH-A0 Evidence Report — Baseline, Topology, and Benchmark-Contract Freeze

Ticket: [#13 `[ARCH-A0`] Freeze PocketJS baseline, integration topology, and benchmark contract](https://github.com/jnhu76/PicoView/issues/13)
Date: 2026-09-12
Verdict: **PASS** (no blockers)

## 1. Source identity

| Item | Value |
|---|---|
| PicoView SHA (at evidence capture) | `db7d4cfbcbf22b6253b7cd32c06d7eb474bd2666` (`main`, clean) |
| PocketJS repository | `https://github.com/pocket-stack/pocketjs` |
| PocketJS campaign base SHA | `a5a85356e172db8a32aefa983ee1259f60406f69` |
| PocketJS effective SHA | `a5a85356e172db8a32aefa983ee1259f60406f69` (identical to base — no patches in this ticket) |
| PocketJS checkout state | local branch `pico-arch-a` at base SHA, worktree clean, no submodules |
| Note | `origin/main` equaled the base SHA at clone time; the local pin, not upstream tracking, is authoritative for the campaign |

All runtime evidence below was captured at `db7d4cf`. The authority docs were then amended by the native-Windows environment freeze (`8ba174c`…`5c1e4c4` — host confirmation, toolchain identity, evidence-identity fields) and this report is committed on top of that freeze; its statements remain consistent with the amended authority docs (see §7).

## 2. Native Windows confirmation

Native Windows, **not** WSL:

- `uname -a` → `MINGW64_NT-10.0-26200 ... x86_64 Msys` (Git Bash / MSYS2 on the Windows kernel)
- `WSL_DISTRO_NAME` unset; no WSL distro present
- Windows CIM inventory confirms a physical Windows 11 host (below)

All gate evidence is produced by native Windows processes on this host.

## 3. Machine and OS identity

| Item | Value |
|---|---|
| OS | Windows 11 Pro, 25H2, 64-bit |
| Build | 10.0.26200.9445 |
| Machine | AZW SER (mini PC) |
| CPU | AMD Ryzen 7 5800H with Radeon Graphics — 8 cores / 16 logical processors |
| Installed RAM | 32 GiB (28.92 GiB reported available to the OS) |
| GPU | AMD Radeon(TM) Graphics (integrated) |
| GPU driver | 31.0.21923.11000, dated 2025-07-01 |

Recorded deviation from the PRD reference system: the PRD names Windows 11 x64 / 16 GiB as the reference class; this host has 32 GiB. `docs/BENCHMARK.md` §1 requires recording installed RAM rather than requiring the reference machine, so this is a recorded machine fact, not a contradiction. Later gate reports must state this identity per §1.

## 4. Toolchain identity (exact outputs)

```
> rustup show active-toolchain
stable-x86_64-pc-windows-msvc (default)

> rustc -Vv
rustc 1.98.1 (48a229cea 2026-09-01)
binary: rustc
commit-hash: 48a229ceaefd4985c50990b14116b6d856af0985
commit-date: 2026-09-01
host: x86_64-pc-windows-msvc
release: 1.98.1
LLVM version: 22.1.8

> cargo -V
cargo 1.98.1 (797e8a9bc 2026-08-05)

> git --version
git version 2.55.0.windows.5
```

Installed rustc targets: `x86_64-pc-windows-msvc`, `wasm32-unknown-unknown`.

Matches the ticket's authoritative Windows development baseline exactly: `stable-x86_64-pc-windows-msvc`, `rustc 1.98.1`.

## 5. MSVC / Windows SDK readiness

Discovery results (plain shell, not a VS dev prompt):

- `where cl` → **not found on PATH** (expected: `cl.exe` is exposed only inside a VS developer environment)
- `where link` → only `C:\Program Files\Git\usr\bin\link.exe` — GNU coreutils `link`, **not** the MSVC linker

Installed on disk (queried via `vswhere` and the standard install roots):

| Component | Identity |
|---|---|
| Visual Studio | Community 2022, 17.14.33 (May 2026), instance complete, at `C:\Program Files\Microsoft Visual Studio\2022\Community` |
| MSVC toolset | `VC\Tools\MSVC\14.44.35207` with `bin\Hostx64\x64\cl.exe` and `link.exe` present |
| Windows SDK | `10.0.26100.0` and `10.0.22621.0` (`Include` + `Lib`; `um\x64\kernel32.lib` present in both) |
| CRT | `libcmt.lib` / `msvcrt.lib` in the MSVC toolset `lib\x64`; UCRT libs (`ucrt.lib`, `libucrt.lib`, …) in SDK `Lib\10.0.26100.0\ucrt\x64` |

**End-to-end probe:** `rustc -C opt-level=2 probe.rs -o probe.exe && probe.exe` compiled, linked against the MSVC linker/SDK, and ran successfully (`A0 MSVC toolchain probe OK`). Rust's MSVC toolchain locates the VS linker automatically without a dev prompt.

Verdict: the prerequisites needed by the next PocketJS desktop-host ticket are **present**. Nothing was installed in this ticket; no heavyweight runtime was added.

## 6. Workspace topology

```text
C:\Users\fred1\source\
  PicoView\     # jnhu76/PicoView  (this repo)
  pocketjs\     # pocket-stack/pocketjs, branch pico-arch-a @ a5a85356e172db8a32aefa983ee1259f60406f69
```

- Sibling checkouts; PocketJS is **not** vendored or copied into PicoView.
- Pinning is reproducible: `git clone https://github.com/pocket-stack/pocketjs && git -C pocketjs checkout a5a85356e172db8a32aefa983ee1259f60406f69` (local branch `pico-arch-a` carries the pin).
- **Patch identification rule for later tickets:** runtime-generic PocketJS work happens as commits on a branch rooted at the base SHA in `pocketjs/`; the effective identity is `git -C ../pocketjs rev-parse HEAD`, with the patch series listed by `git -C ../pocketjs log --oneline a5a85356e172db8a32aefa983ee1259f60406f69..HEAD`. Every PicoView architecture report names PicoView SHA, base SHA, and this effective SHA.

### Baseline facts verified against the checkout (read-only)

- `hosts/desktop/src/plan.rs:1-6` — `#[cfg]` selects `macos-app`/`linux-app`; other targets hit `compile_error!("pocket-desktop-host supports macOS and Linux")`. Confirms Windows is **not** already supported.
- `framework/src/host.ts:64` — `uploadTexture(buf: Uint8Array, w, h, psm): number`, documented `pow2 dims ≤ 512`; same constraint in `contracts/spec/spec.ts:87`. Confirms this is not PicoView's multi-megapixel data plane.
- `TEX_QUAD` image-node/texture-handle semantics exist (`engine/core/src/lib.rs`, `engine/backends/*`). Confirms the planned extension seam.

All facts recorded in `docs/POCKETJS-BASELINE.md` match the pinned checkout.

## 7. Benchmark-contract readiness (`docs/BENCHMARK.md`)

Assessment: **sufficient to plan instrumentation for later tickets**. Each A0-required semantic is present and unambiguous:

| Requirement | Contract location | Status |
|---|---|---|
| T0–T6 timestamp vocabulary | §5 (T0_ACTIVATION_REQUEST … T6_PRESENT_SUBMITTED, with per-timestamp qualifying conditions) | Unambiguous; concrete probe placement is an implementation task for later tickets |
| ≥50 samples for P50/P95 gates | §4 (≥50 measured iterations, P50 median, nearest-rank P95, warm-ups separate, <50 = exploratory) | Unambiguous |
| Process-cold definition | §6 (new process, no in-process cache/state; OS file cache explicitly **not** flushed; recorded, not faked) | Unambiguous |
| First-useful-image = T6_PRESENT_SUBMITTED proxy | §5 (proxy named, must be labeled a proxy, visual acceptance separate) | Unambiguous |
| Working Set - Private + Private Bytes | §7 (both mandatory; PRD targets bind to Working Set - Private; settled/peak/five-process rules) | Unambiguous; measurable via `GetProcessMemoryInfo` / performance counters |
| Normalized 30s idle CPU | §8 (5s settle + 30s window; `cpu_seconds / wall_seconds / logical_processors × 100`; render-scan/network side-records) | Unambiguous |
| Package/install accounting | §10 (download payload vs installed app-private footprint; OS-inbox exclusion rule; per-dependency ledger) | Unambiguous |

Evidence-identity fields required by §1 (SHAs, build profile, Windows build, CPU/RAM/GPU/driver, refresh rate, sample identity, medium, power mode) are all obtainable on this host; GPU/driver/CPU/RAM/OS values recorded above satisfy the A0 evidence-format requirement.

Alignment with the amended contract (`5c1e4c4`): BENCHMARK §1 now additionally requires **native Windows host confirmation** and the **exact `rustc -Vv`/Cargo identity** — both are recorded in §2 and §4 of this report, so the evidence above already satisfies the extended identity list.

Gaps to carry into later tickets (none block A0; none justify weakening the contract):

1. **T2/T6 probe placement** — BENCHMARK defines the conceptual timestamps; the host-side instrumentation points (window-usable signal, present-submission hook inside the PocketJS desktop host) do not exist at this baseline and are created by A1+ work, not by A0.
2. **Harness-validation rule** — §4 requires gates to run "after harness validation" but does not define how the harness itself is validated; the first instrumentation ticket should state its validation procedure.
3. **Refresh rate / power mode capture** — §1 requires them; trivially readable via Windows APIs but must not be forgotten in report templates.

## 8. Authority cross-check

- PRD, SPEC, BENCHMARK, CONTEXT, and POCKETJS-BASELINE agree on the base SHA `a5a8535`, the freeze-first phase policy, and the benchmark proxy semantics. No authority contradiction found.
- No accepted ADRs exist yet (no `docs/ADR/`); nothing to reconcile.
- Issue #13 was `open` + `ready-for-agent` at start; no declared blockers.

## 9. Scope compliance

In this ticket there was: no PocketJS host/runtime code change, no `windows-app` target work, no WIC integration, no native-image resource seam, no viewer UI, no BrowseSession, no dependency installs or upgrades, and no downstream issue started. The only artifacts produced are this report and the pinned sibling `pocketjs` checkout.

## 10. Verdict

**PASS.** All #13 acceptance criteria are satisfied with executable evidence:

- native Windows recorded (§2), exact toolchain recorded (§4);
- base SHA + URL recorded, sibling checkout actually pinned at the exact SHA (§1, §6);
- patch identification procedure defined (§6);
- MSVC/Windows SDK prerequisites discovered, recorded, and proven by a working compile+link probe (§5) — no installs required;
- benchmark semantics assessed implementable, with three non-blocking gaps recorded (§7);
- evidence format covers all §1 identity fields (§3, §4, §7);
- no forbidden work performed (§9).

**Issue #2 `[ARCH-A1]` is safe to unblock** once the tracker explicitly moves it from `blocked` to `ready-for-agent`: the substrate identity, Windows toolchain, and measurement contract are frozen, and the first A1 prerequisite (MSVC + Windows SDK) is verified present.

# PicoView Context

## Current phase

PicoView is in **Architecture Phase A — PocketJS Windows admission**.

The product definition is already narrow enough. The current task is to prove that PocketJS can land on Windows and satisfy PicoView's physical budgets **before** broad product implementation begins.

Product Phase B is blocked until **GATE-A** passes.

## Product thesis

PicoView is a Windows 11 local image viewer with one deliberately narrow responsibility chain:

**Open → View → Inspect → Browse → Handle**

Release-level goals:

- **Fast** — current image dominates the critical path.
- **Light** — small payload, low baseline/peak memory, no hidden runtime/service.
- **Focused** — no editor/library/cloud/file-manager creep.

## Frozen decisions

- Product name: **PicoView**.
- Target: Windows 11 desktop.
- Runtime/UI substrate: **PocketJS**.
- PocketJS is not in a framework bake-off.
- Architecture Phase A guest profile: **Octane-first**.
- QuickJS is a **control plane**, not a decoded-pixel transport.
- Large image decode, native image-resource ownership, GPU/resource lifetime, cancellation, and source-handle lifetime stay native.
- WIC is the baseline decoder substrate.
- libjpeg-turbo is benchmark-gated.
- Exact browse order uses a completed compact navigation generation; no speculative Next/Previous.
- Per-Monitor DPI Awareness V2 is required.
- No telemetry, resident updater/service, startup network dependency, media database, plugin system, Filmstrip, Slideshow, Print, or Share in v1.
- Architecture GATE-A precedes Product Phase B.

## Authoritative development environment

Architecture Phase A Windows evidence is now produced on **native Windows**, not inside WSL.

Current Rust campaign toolchain:

```text
stable-x86_64-pc-windows-msvc
rustc 1.98.1
```

WSL remains acceptable for reading, note-taking, repository inspection, and non-Windows helper scripts, but it is not authoritative evidence for Windows stock-target behavior, winit/wgpu presentation, WIC, DPI, Windows startup/memory/idle metrics, or packaging.

The exact `rustc -Vv` / Cargo identity used by a gate report is recorded with the report.

## PocketJS campaign baseline

Architecture Phase A is planned against:

- repository: `https://github.com/pocket-stack/pocketjs`
- base SHA: `a5a85356e172db8a32aefa983ee1259f60406f69`

See `docs/POCKETJS-BASELINE.md`.

Do not silently follow a moving PocketJS `main` during the campaign.

Every runtime-dependent report records the PicoView SHA, campaign base SHA, effective PocketJS SHA/patch series, and native Windows toolchain identity.

## Important PocketJS reality

The frozen PocketJS baseline already has a portable desktop architecture using winit/wgpu, QuickJS/runtime-worker semantics, DrawList rendering, retained GPU targets, and presentation handoff.

But it is **not already a Windows desktop host**:

- stock target profiles cover macOS/Linux desktop apps;
- `hosts/desktop/src/plan.rs` explicitly accepts macOS/Linux and compile-errors other host OS values.

Therefore the first Windows task is:

> **extend the existing PocketJS desktop architecture to Windows, rather than inventing an unrelated PicoView-only host.**

## Largest architecture unknown

The most important missing seam is not WIC itself.

PocketJS currently exposes a JS-facing texture-upload contract intended for small uploaded textures. PicoView requires multi-megapixel decoded images to remain native.

Architecture Phase A must prove:

```text
native-owned large image resource
        ↓
PocketJS image/resource handle
        ↓
DrawList composition/presentation
```

without O(image-bytes) traffic through QuickJS.

This proof is intentionally separate from JPEG/WIC decode so the failure mechanism remains identifiable.

## Architecture execution frontier

The tracker is deliberately staged.

Initial frontier:

- **#13 `[ARCH-A0]`** — freeze PocketJS baseline, workspace topology, native-Windows toolchain identity, and benchmark contract.

Downstream Architecture Phase A:

- #2 `[ARCH-A1]` — extend desktop architecture to a Windows stock target;
- #14 `[ARCH-A2]` — native large-image composition seam;
- #3 `[ARCH-A3]` — first JPEG/WIC;
- #4 `[ARCH-A4]` — large JPEG / Fit / 100% / zoom / pan proof;
- #7 `[ARCH-A5]` — generation cancellation / hostile-resource proof;
- #9 `[ARCH-A6]` — minimal Per-Monitor DPI proof;
- #15 `[ARCH-A7]` — startup/package/idle/five-process footprint;
- #11 `[GATE-A]` — admit or reject the architecture.

Product Phase B remains blocked behind #11:

- #5 Open/refresh/source lifetime;
- #6 BrowseSession;
- #8 Handle;
- #10 format/animation;
- #17 final viewer chrome/Inspect;
- #16 bounded Windows UI Automation;
- #18 GATE-B release verification.

Only issues actually labeled `ready-for-agent` are executable frontier work. `blocked` means do not start.

## Benchmark authority

`docs/BENCHMARK.md` defines:

- source/build/machine identity required for evidence;
- minimum 50 iterations for P50/P95 gate claims;
- process-cold semantics;
- first-useful-image present-submission proxy;
- Working Set - Private and Private Bytes memory reporting;
- static-idle CPU normalization;
- package/install size accounting.

A benchmark number that changes definitions to obtain PASS is not valid gate evidence.

## Browse ordering working truth

Product Phase B natural ordering is no longer an informal “Explorer-like” statement.

The PRD freezes PicoView Natural Order v1:

- arbitrary-length ASCII digit runs compare numerically without integer parsing;
- equal numeric value sorts fewer leading zeroes first;
- non-digit spans compare ordinal case-insensitively;
- case-sensitive ordinal/full-path tie-break gives deterministic total order.

Browse eligibility is established cheaply through extension/capability knowledge. Directory indexing does not decode/sniff every candidate.

## Authority order

1. `docs/PRD/PicoView-PRD-v0.5.md`
2. `docs/SPEC/PicoView-v1.md`
3. `docs/BENCHMARK.md`
4. accepted PicoView ADRs
5. `CONTEXT.md`
6. current GitHub execution ticket

`docs/POCKETJS-BASELINE.md` freezes the external source identity and authoritative native-Windows campaign host used by Architecture Phase A.

A lower-authority source must not silently override a higher one.

## Current highest-value test seam

Architecture Phase A prefers the largest real seam practical:

> **real Windows PocketJS guest → bounded semantic image request → native image resource → PocketJS composition → present submission / observable state**

The native-resource proof comes before WIC so we do not conflate decoder integration with renderer/resource-contract failure.

## Stop-the-line rules

Stop and investigate when:

- PocketJS/host physical cost fails a defining PRD budget;
- a multi-megapixel pixel plane crosses QuickJS;
- a native image resource cannot be retired independently of JS GC;
- stale generations can publish;
- a static image requires a PicoView-owned continuous render loop;
- Windows support is implemented as an unrelated PicoView-only runtime fork without earned evidence;
- a dependency enters without recorded user pain and budget cost;
- a `blocked` Product Phase B ticket is started before GATE-A;
- a `/goal` or other autonomous run attempts to continue past the assigned ticket, silently weakens a gate, changes the PocketJS baseline, or starts a downstream blocked issue.

For autonomous runs, **stopping with a concrete blocker is success of the control system, not failure of the project**.

## Near-term outcome

The first meaningful milestone is not “PicoView v1 complete.”

It is:

> **PocketJS Windows + native image-resource architecture admitted or rejected by GATE-A using reproducible evidence.**

Only after that decision does ordinary product implementation become executable.

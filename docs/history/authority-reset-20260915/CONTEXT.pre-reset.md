# PicoView Context

## Current phase

PicoView is in **PRODUCT IMPLEMENTATION — VIEWER BASELINE**.

PocketJS has been accepted as PicoView's Windows UI/runtime/view foundation
(owner decision `POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT`, 2026-09-14).
Product implementation is authorized.

The historical admission/startup campaign is closed with sufficient evidence
to proceed with product implementation. Unresolved startup-performance
questions are deferred until a real product workload exists. No historical
GATE-A budget is retroactively claimed as PASS; the campaign record (PR #44,
`CLOSED_FOR_NOW` / `MEASUREMENT_SUFFICIENT_FOR_CURRENT_PRODUCT_BUILD`) and
all earlier evidence are frozen history, indexed in `docs/history/README.md`.

Execution proceeds by the sequential roadmap slices in `docs/ROADMAP.md`
(V0 Product Shell → V1 Open One Image → V2 View Interaction → V3
BrowseSession → V4 Handle + Inspect → V5 Real Viewer Baseline).

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
- Runtime/UI substrate: **PocketJS**, consumed at the exact revision pinned in `POCKETJS.lock`.
- PocketJS is not in a framework bake-off.
- Guest profile: **Octane** (TSX/QuickJS control plane).
- QuickJS is a **control plane**, not a decoded-pixel transport.
- Large image decode, native image-resource ownership, GPU/resource lifetime, cancellation, and source-handle lifetime stay native.
- WIC is the baseline decoder substrate.
- Third-party decoders (libjpeg-turbo, Rust PNG decoders, …) remain benchmark-gated and **deferred** (`docs/ARCHITECTURE.md`, DEFERRED list).
- Exact browse order uses a completed compact navigation generation; no speculative Next/Previous.
- Per-Monitor DPI Awareness V2 is required.
- No telemetry, resident updater/service, startup network dependency, media database, plugin system, Filmstrip, Slideshow, Print, or Share in v1.

## Authoritative development environment

Product development and all Windows evidence are produced on **native Windows**, not inside WSL.

WSL remains acceptable for reading, note-taking, repository inspection, and non-Windows helper scripts, but it is not authoritative evidence for Windows host behavior, winit/wgpu presentation, WIC, DPI, process memory, startup/idle metrics, or packaging.

Any report that records a measurement also records the exact `rustc -Vv` / Cargo identity and machine/GPU identity used.

## PocketJS dependency

PicoView consumes `jnhu76/pocketjs` at the exact revision pinned in `POCKETJS.lock`. The revision is authority; the branch name is informational only. Do not silently follow a moving branch tip.

- No git submodule, no vendoring, no copying PocketJS source into PicoView.
- The default topology is a PicoView checkout plus a sibling PocketJS checkout/worktree pinned to the locked revision.
- Runtime-generic capability work happens in `jnhu76/pocketjs` first, merges there, and only then advances `POCKETJS.lock`.
- The `archive/picoview-20260914/*` refs on the fork are museum/history only.
- Historical campaign baselines (e.g. `pocket-stack/pocketjs` `a5a8535…`, `docs/POCKETJS-BASELINE.md`) are research history.

## Benchmark authority

`docs/BENCHMARK.md` defines how any performance/memory/package claim is measured:

- source/build/machine identity required for evidence;
- minimum 50 iterations for P50/P95 gate claims;
- process-cold semantics;
- first-useful-image present-submission proxy;
- Working Set - Private and Private Bytes memory reporting;
- static-idle CPU normalization;
- package/install size accounting.

A benchmark number that changes definitions to obtain PASS is not valid evidence. No microbenchmark is authorized before `PICOVIEW-REAL-WORKLOAD-PERFORMANCE-1` (after ROADMAP V5).

## Browse ordering working truth

The PRD freezes PicoView Natural Order v1:

- arbitrary-length ASCII digit runs compare numerically without integer parsing;
- equal numeric value sorts fewer leading zeroes first;
- non-digit spans compare ordinal case-insensitively;
- case-sensitive ordinal/full-path tie-break gives deterministic total order.

Browse eligibility is established cheaply through extension/capability knowledge. Directory indexing does not decode/sniff every candidate.

## Authority order

1. `docs/PRD/PicoView-PRD-v0.5.md`
2. `docs/SPEC/PicoView-v1.md`
3. accepted PicoView ADRs
4. `docs/ARCHITECTURE.md`
5. `CONTEXT.md`
6. `docs/ROADMAP.md`
7. current GitHub execution ticket

`POCKETJS.lock` is the dependency authority for the PocketJS source identity. `docs/BENCHMARK.md` is the measurement-semantics authority whenever a measurement claim is made. Historical evidence documents remain evidence authority for their historical claims only — they are not current product execution gates.

A lower-authority source must not silently override a higher one.

## Stop-the-line rules

Stop and investigate when:

- a multi-megapixel pixel plane or encoded file crosses QuickJS;
- a native image resource cannot be retired independently of JS GC;
- stale generations can publish;
- a static image requires a PicoView-owned continuous render loop;
- Windows support drifts toward an unrelated PicoView-only runtime fork instead of the PocketJS seam;
- a dependency enters without recorded user pain and budget cost;
- work silently weakens a PRD/SPEC gate or boundary in `docs/ARCHITECTURE.md`;
- work proceeds on a roadmap slice other than the assigned one;
- a `/goal` or other autonomous run attempts to continue past the assigned ticket, change the `POCKETJS.lock` identity without the cross-repo process, or start downstream work without an explicit unblock.

For autonomous runs, **stopping with a concrete blocker is success of the control system, not failure of the project**.

## Near-term outcome

The next meaningful milestone is not "PicoView v1 complete."

It is:

> **V1 — Open One Image: a real file decoded natively via WIC and presented through PocketJS composition, with no image bytes through QuickJS.**

Sequencing and subsequent slices live in `docs/ROADMAP.md`.

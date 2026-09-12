# PicoView Context

## Current phase

PicoView is at **foundation / PocketJS Windows landing**.

The product definition and architecture constraints were developed before implementation so that the project can reject a runtime path that is functionally correct but physically too slow, large, memory-heavy, or background-active.

Do **not** treat “we can render a window” as completion. The current phase ends only when the PocketJS Windows path and native image path are measured against the PRD gates.

## Product thesis

PicoView is a Windows 11 local image viewer with one deliberately narrow responsibility chain:

**Open → View → Inspect → Browse → Handle**

The three release-level goals are:

- **Fast** — current image dominates the critical path.
- **Light** — small payload, low baseline/peak memory, no hidden runtime/service.
- **Focused** — no editor/library/cloud/file-manager creep.

## Frozen decisions

- Product name: **PicoView**.
- Target: Windows 11 desktop.
- Runtime/UI substrate: **PocketJS**.
- PocketJS is not a candidate in a framework bake-off; it is the chosen runtime.
- QuickJS is a **control plane**, not a decoded-pixel transport.
- Image decode, native pixel memory, GPU texture lifetime, cancellation, and source-handle lifetime stay native.
- WIC is the baseline decoder substrate.
- libjpeg-turbo is benchmark-gated and enters only if WIC JPEG materially misses the SLO.
- Exact browse order uses a completed compact navigation index; no speculative Next/Previous.
- Per-Monitor DPI Awareness V2 is required.
- No telemetry, resident updater, startup network dependency, media database, plugin system, Filmstrip, Slideshow, Print, or Share in v1.

## Important PocketJS reality

The external PocketJS project already has a generic desktop host. It uses winit for window/input, wgpu for the portable desktop DrawList backend, a runtime worker for QuickJS/layout/GPU command recording, retained GPU targets, and frame/presentation handoff.

PocketJS's current stock desktop target registry includes macOS and Linux application targets. It does not currently expose a `windows-app` stock target.

Therefore, the first PicoView engineering question is **not** “write a Windows runtime from zero.”

It is:

> Can the existing PocketJS desktop seam be admitted as a real Windows 11 stock target and still satisfy PicoView's physical budgets?

Only measured failure earns Windows-specific specialization.

## External dependency

PocketJS upstream:

- https://github.com/pocket-stack/pocketjs

Relevant upstream concepts:

- target capability registry;
- portable desktop host;
- DrawList backend;
- runtime worker;
- QuickJS guest;
- winit input/window layer;
- wgpu presentation;
- frame trace / backend verification.

PicoView issues may require upstream PocketJS pull requests. Keep the product authority in PicoView and runtime-generic changes in PocketJS where appropriate.

## Authority order

1. `docs/PRD/PicoView-PRD-v0.4.md`
2. `docs/SPEC/PicoView-v1.md`
3. `CONTEXT.md`
4. Accepted PicoView ADRs, once they exist
5. GitHub ticket currently being implemented

A lower authority source must not silently override a higher one.

## Current test seam

Prefer the highest end-to-end seam:

> **file/shell request → PocketJS guest intent → native image capability → WIC/resource decision → GPU presentation → observable PicoView state**

Avoid introducing many narrow mocks around internal classes when the full seam can be tested.

## Stop-the-line rules

Do not proceed to full viewer feature implementation merely because a demo works.

Stop and investigate when:

- PocketJS baseline footprint fails PRD limits;
- image pixels cross the QuickJS boundary as large payloads;
- stale generations can publish;
- directory work blocks first image;
- a static image requires a custom continuous frame loop;
- a dependency enters without a recorded user pain and budget cost;
- Windows-specific behavior is hidden in PicoView guest code that belongs in the host/runtime boundary.

## Tracker convention

The project uses GitHub issues as execution tickets.

Tickets are intended to be **tracer bullets**: narrow, demoable end-to-end slices, not horizontal “build all rendering” / “build all UI” buckets.

The `ready-for-agent` label is the execution triage label for the parent spec and the tracer-bullet tickets produced from it.

## Near-term outcome

The first meaningful milestone is not “PicoView v1 complete.”

It is:

> **PocketJS Windows + PicoView first-image path proven against measurable budgets.**

Once that passes, Browse, Handle, DPI/accessibility, format breadth, and packaging proceed through the ticket dependency graph.

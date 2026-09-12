# AGENTS.md

## Mission

Build **PicoView**, a fast, small, focused Windows 11 local image viewer on PocketJS.

The project is currently in **PocketJS Windows landing / architecture-spike** phase. Do not skip the spike gates and jump directly to broad feature implementation.

## Read before changing code

Read, in order:

1. `docs/PRD/PicoView-PRD-v0.4.md`
2. `docs/SPEC/PicoView-v1.md`
3. `CONTEXT.md`
4. the GitHub issue assigned to you
5. relevant PocketJS upstream contracts/docs when the ticket touches runtime behavior

If they disagree, higher authority wins. Do not “fix” the PRD implicitly in code.

## Non-negotiable architecture rules

- PocketJS is the runtime choice.
- QuickJS is control/state only; normal image presentation must not shuttle full encoded files or decoded pixel planes through JS.
- Decode buffers and GPU textures are native resources with explicit lifetime.
- Current image work outranks browse discovery, metadata, optional prefetch, and every derived task.
- A stale request generation may not publish over a newer one.
- Static idle must not require an application-owned continuous render loop.
- Exact Previous/Next may not speculate on partial directory enumeration.
- Do not add Electron, WebView, .NET/Windows App SDK runtime, JVM, Python runtime, FFmpeg-class stacks, databases, plugin runtimes, telemetry, background services, or resident updaters.
- Third-party image decoders require benchmark evidence and an explicit decision.
- Per-Monitor DPI Awareness V2 semantics are part of correctness, not polish.

## PocketJS boundary

Prefer extending/reusing the existing PocketJS desktop host seam.

Do not create a parallel Windows host architecture until measurements prove the existing desktop seam cannot satisfy a required observable behavior or PRD budget.

Runtime-generic fixes belong upstream in PocketJS when practical. PicoView-specific product logic belongs here.

If a PicoView ticket requires upstream work:

- isolate the runtime-generic change;
- link the upstream commit/PR from the PicoView ticket;
- keep PicoView's product requirement and acceptance evidence in this repository.

## Ticket discipline

Work only the assigned ticket and its acceptance criteria.

Tickets are vertical tracer bullets. A ticket should leave a demonstrable or measurable end-to-end behavior.

Do not opportunistically add adjacent features.

Before coding:

- identify blockers and confirm they are complete;
- identify the highest practical test seam;
- record any new dependency or architecture decision that the ticket would introduce.

During coding:

- keep obsolete work cancellable;
- keep native resource ownership explicit;
- keep guest/native messages small;
- prefer deletion/reduction/delay/cancellation before optimization.

Before marking complete:

- run the ticket's acceptance checks;
- capture benchmark/evidence required by the issue;
- update documentation if the ticket proves an assumption false;
- leave the worktree clean;
- do not weaken a PRD budget merely to make a test pass.

## Testing style

Prefer external behavior and measurable contracts over implementation-detail tests.

High-value tests include:

- real Windows PocketJS guest presentation;
- file → decode → visible image;
- generation cancellation/no stale publication;
- deterministic browse order;
- hostile resource bounds;
- DPI transition behavior;
- filesystem effects of current-file actions;
- package/startup/memory/idle benchmark gates.

Use existing PocketJS desktop/backend/simulator testing patterns where they fit instead of inventing a separate testing philosophy.

## Scope guard

v1 explicitly excludes:

- editing;
- library/database behavior;
- cloud/account behavior;
- Filmstrip;
- Slideshow;
- Print;
- Share;
- batch operations;
- plugins;
- RAW development;
- true HDR;
- generalized updater/telemetry/network subsystems.

If a task seems to require one of these, stop and surface the conflict rather than implementing it.

## Documentation

Keep product truth concise and centralized.

- PRD owns product boundary and budgets.
- Spec owns cross-cutting implementation and testing decisions.
- CONTEXT owns current state and working assumptions.
- Issues own bounded execution slices.
- ADRs should be added only when a durable technical choice needs a recorded rationale after evidence exists.

Do not create a second competing architecture document.

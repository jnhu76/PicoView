# AGENTS.md

## Mission

Build **PicoView**, a fast, small, focused Windows 11 local image viewer on PocketJS.

The project is in **PRODUCT IMPLEMENTATION**. PocketJS is the accepted Windows UI/runtime/view foundation (`POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT`); the historical architecture/startup campaigns are frozen history (`docs/history/README.md`).

Do not equate "a window renders" or "a JPEG appears" with a slice's acceptance. Work only the assigned roadmap slice.

## Read before changing code

Read, in order:

1. `docs/PRD/PicoView-PRD-v0.5.md`
2. `docs/SPEC/PicoView-v1.md`
3. relevant accepted ADRs
4. `docs/ARCHITECTURE.md`
5. `CONTEXT.md`
6. `docs/ROADMAP.md`
7. `POCKETJS.lock` when runtime behavior or the PocketJS dependency is involved
8. `docs/BENCHMARK.md` when the ticket measures a physical property
9. the assigned GitHub issue
10. relevant PocketJS upstream contracts/docs/code

If sources disagree, higher authority wins. Do not "fix" a higher authority implicitly in code. Historical evidence documents are not current execution authority.

## Execution-state labels are authoritative

GitHub issue labels are execution state:

- `ready-for-agent` — the issue is on the current executable frontier;
- `blocked` — **do not start implementation**;
- `spec` — parent/spec authority, not an implementation ticket.

Before coding, verify the assigned issue is open and labeled `ready-for-agent`.

If it is `blocked`, stop. Do not work around the blocker just because the body looks implementable.

When a blocker closes, the tracker must explicitly move the newly unblocked issue from `blocked` to `ready-for-agent`; agents must not infer the transition silently.

## Authoritative environment

PicoView is developed and evidenced on **native Windows**, not inside WSL.

WSL may be used for reading, repository inspection, and non-Windows helper scripts, but WSL results cannot close Windows host, WIC, DPI, process-memory, startup/idle, or packaging behavior.

Record the exact toolchain identity (`rustc -Vv`, Cargo, machine/GPU) in any runtime-dependent evidence. Do not silently update the toolchain during a measurement campaign.

## PocketJS dependency authority

PicoView consumes `jnhu76/pocketjs` at the exact revision pinned in `POCKETJS.lock`. The revision is authority; the branch name is informational only.

- Verify the locked revision before any runtime-dependent work; do not silently build against a moving branch tip.
- No git submodule, no vendoring, no copying PocketJS source into PicoView.
- The default topology is a PicoView checkout plus a sibling PocketJS checkout/worktree pinned to the locked revision.

**Cross-repo rule.** If PicoView needs a generic runtime/platform capability, implement it in `jnhu76/pocketjs` first, review/merge it there, record the PocketJS commit/PR, link it from the PicoView ticket, then advance `POCKETJS.lock`. Do not patch a vendored/local hidden copy. If the capability is PicoView-specific product policy, keep it in PicoView.

## Non-negotiable architecture rules

- PocketJS is the runtime.
- QuickJS is control/state only; ordinary image presentation must not shuttle full encoded files or decoded multi-megapixel pixel planes through JS.
- Decode buffers, native image resources, and GPU resources have explicit lifetime independent of QuickJS GC.
- Current-image work outranks folder discovery, metadata, prefetch, and every derived task.
- A stale request generation may never publish over a newer generation.
- Static idle must not require a PicoView-owned continuous render loop.
- Exact Previous/Next may not speculate on partial directory enumeration.
- Per-Monitor DPI V2 is correctness, not polish.
- Do not add Electron, WebView, .NET/Windows App SDK as a second app runtime, JVM, Python runtime, FFmpeg-class stacks, databases, plugin runtimes, telemetry, background services, or resident updaters.
- Third-party image decoders require benchmark evidence and an explicit admission decision — and are deferred until `PICOVIEW-REAL-WORKLOAD-PERFORMANCE-1` (`docs/ARCHITECTURE.md`).

## Ownership boundaries

The frozen PocketJS / PicoView guest / PicoView native ownership boundaries live in `docs/ARCHITECTURE.md`. The hard boundary: **O(image-bytes) never crosses QuickJS**; JS receives bounded semantic data only (handle, dimensions, status, metadata, events).

Prefer the smallest extension of existing PocketJS image-node / resource-handle / DrawList texture semantics. Do not introduce a new DrawList opcode or independent compositor-surface architecture unless a ticket produces evidence that the existing resource model cannot satisfy the required size/lifetime/composition semantics.

## Roadmap discipline

Execution follows the sequential slices in `docs/ROADMAP.md` (V0 … V5, then `PICOVIEW-REAL-WORKLOAD-PERFORMANCE-1`).

Do **not** implement work that belongs to a later slice merely because its shape is already known. Decoder choice, buffer/texture pools, preload/cache policy, and GPU-transfer optimization are **deferred** (`docs/ARCHITECTURE.md`, DEFERRED — REAL WORKLOAD REQUIRED); no microbenchmark is authorized before the real-workload performance ticket.

## Autonomous-run brake rule

`/goal` or any other long-running agent mode may execute **one tracker ticket only** unless the user explicitly starts a new goal for the next ticket.

Completion of a ticket does not authorize starting its successor.

The autonomous run MUST stop and report a concrete blocker if any of the following happens:

- the assigned issue is not `ready-for-agent`;
- a required authority document is missing or contradictory;
- the effective PocketJS source identity cannot be stated exactly;
- continuing requires changing the `POCKETJS.lock` identity outside the cross-repo process;
- continuing requires weakening a PRD/SPEC gate or an `docs/ARCHITECTURE.md` boundary;
- continuing would start work reserved for a later roadmap slice;
- continuing would introduce a new runtime, decoder, DrawList opcode, compositor mechanism, or architecture seam not authorized by the assigned ticket;
- a defining acceptance criterion is impossible on the observed substrate without such an authority change.

Do not hide an architecture failure with a workaround merely to complete the goal.

A truthful `blocked/impossible` result with executable evidence is a successful outcome of the control system.

## Ticket discipline

Tickets are vertical tracer bullets. Work only the assigned ticket and its acceptance criteria.

Before coding:

- confirm the ticket is `ready-for-agent`;
- confirm all declared blockers are complete;
- identify the highest practical end-to-end seam;
- record any new dependency or architecture decision the ticket would introduce;
- confirm the exact PocketJS source identity if runtime behavior is involved.

During coding:

- keep obsolete work cancellable;
- keep native resource ownership explicit;
- keep guest/native messages bounded;
- prefer deletion/reduction/delay/cancellation before optimization;
- do not broaden the ticket into adjacent product work.

Before marking complete:

- run the ticket's acceptance checks;
- capture required evidence/benchmarks;
- use `docs/BENCHMARK.md` definitions rather than ad hoc metrics;
- update authority docs if an assumption is disproved;
- leave the worktree clean;
- do not weaken a PRD budget to obtain PASS;
- identify which single next issue(s), if any, are now truly unblocked so tracker labels can be advanced explicitly.

## Benchmark discipline

A performance/memory/package claim cannot close anything unless the report follows `docs/BENCHMARK.md`.

At minimum record:

- exact PicoView and PocketJS SHAs;
- optimized release build identity;
- Windows build and machine/GPU identity;
- sample identity;
- required sample count/percentile rule;
- timestamp definitions used;
- both Working Set - Private and Private Bytes for memory claims.

Do not call present submission "display photon latency." Present submission is a named proxy; visual acceptance stays separate.

## Testing style

Prefer external behavior and measurable contracts over implementation-detail mocks.

High-value product-phase tests include:

- file → WIC decode → native image resource → visible presentation (V1);
- Fit/100%/zoom/pan/resize/DPI correctness (V2);
- generation cancellation / no stale publication;
- resource release independent of QuickJS GC;
- deterministic BrowseSession ordering fixtures (V3);
- current-file filesystem effects (V4);
- bounded Windows UI Automation;
- release-candidate regressions against the frozen boundaries.

The historical Phase-A harness (stress bursts, A3/A4/A5 request streams) is retired under `experiments/phase-a-guest/` — do not import it into product code.

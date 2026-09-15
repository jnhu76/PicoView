# PicoView Product Roadmap

Status: **active product authority** (rank 6 in the authority order).

Product implementation is authorized (owner decision
`POCKETJS_ACCEPTED_FOR_PRODUCT_DEVELOPMENT`). The historical
architecture/startup campaigns are frozen history — see
`docs/history/README.md`. Optimization work is governed by the DEFERRED list
in `docs/ARCHITECTURE.md`; nothing below may be turned into a performance
experiment.

Slices are **sequential vertical tracer bullets**. Each slice states a goal;
acceptance is defined when the slice's execution ticket is written, within
the PRD/SPEC/ARCHITECTURE boundaries.

## V0 — Product Shell

Launch PicoView through PocketJS and render the normal PicoView UI shell.

- proves: PocketJS app bundle → PicoView TSX → product shell on screen;
- no decoder, no image pipeline;
- starting point: the clean `guest/` skeleton established by PICOVIEW-PRODUCT-BASELINE-RESET-1; executing the launch/render proof is folded into the start of the next ticket rather than tracked as a separate campaign.

## V1 — Open One Image

Real file path → native Rust → WIC baseline decode → native image resource →
PocketJS image composition → pixels visible.

- the first meaningful product slice;
- only bounded semantic state (handle/dimensions/status) crosses to JS.

## V2 — View Interaction

Fit, 100%, zoom, pan, resize, DPI correctness.

## V3 — BrowseSession

Directory enumeration, PicoView Natural Order, Current Item authority,
Next/Previous, generation-safe switching.

## V4 — Handle + Inspect

Metadata; rename/delete/open-location as defined by the product authority
(PRD/SPEC).

## V5 — Real Viewer Baseline

Launch → open → present → navigate → zoom/pan → resize → close/reopen →
bounded lifecycle. The complete minimal real viewer.

## Only after V5

`PICOVIEW-REAL-WORKLOAD-PERFORMANCE-1` — the first authorized performance
work on a real workload, executed per `docs/BENCHMARK.md`. Before that point,
the DEFERRED list in `docs/ARCHITECTURE.md` is closed for business.

# PicoView Roadmap

Status: **CURRENT OPERATIONAL SEQUENCING**  
Date: **2026-09-18**

This roadmap sequences work under current Product, Architecture, and SPEC authority. It does not redefine those semantics. Closed architecture campaigns are history, not future work — see `docs/history/`.

---

## Completed MVP

The following are **done on `main`** and must not be restated as open roadmap items:

- Local image open (native dialog, CLI path, Windows associations)
- Browse Previous / Next
- View transforms: Fit / 1:1 / zoom / pan / rotate / flip
- Windows product shell (toolbar, status, empty/error UX, associations, embedded guest)
- Last-good publication ordering and guest publication/request split
- Direct Desktop/wgpu image admission on the ordinary path (ADR-0002)
- PocketJS git-subtree under `third_party/pocketjs` + `POCKETJS.lock` provenance
- R1 presentation geometry consumed from shared PocketJS (Dynamic logical from measured physical + live OS scale)
- Stage B native structure cleanup (`main.rs` / `app.rs` / `runtime.rs` / `presentation.rs` / `current_item/*`)
- Documentation authority surface cleanup (this campaign)

---

## Stabilization

Active near-term work. Goal: rendering quality and DPI truth, not new product surface.

### R2 — Image minification quality

- Improve downscale quality when the full-resolution admitted image is fit to window or zoomed out
- Prefer mip / better minification over destructive pre-shrink
- Do not invent a PicoView-local GPU path; generic quality belongs in PocketJS first if it is backend-generic

### R3 — Resize scheduling / presentation quality

- Window resize / DPI-change scheduling that keeps presentation stable
- Avoid redundant full re-upload while valid residency exists
- Keep Fit/center/pan geometry correct after chrome and scale changes

### Small visual corrective

- Toolbar icons
- 12/14px UI fonts (readable desktop chrome)
- No product-semantics changes

### Live DPI acceptance

- Acceptance runs at 125% / 150% / 200% on native Windows
- Confirm Fit, 1:1 Actual Size, and zoom% readout stay truthful
- Evidence follows `docs/BENCHMARK.md` identity rules where physical claims are made

---

## Release hardening

After stabilization gates pass:

- Packaging (distributionable Windows build)
- File association regression checks
- Clean-machine build verification
- Release smoke (open/browse/view/associate/uninstall path)
- Version / tag / release notes

Do not start packaging as a substitute for unfinished R2/R3 quality work.

---

## Future / explicitly non-MVP

Only genuine deferred work. Do not expand this into a speculative wishlist.

- Generic color/alpha/precision admission contract (beyond current RGBA8 path)
- Truthful full-resolution capability separation for giant images
- Proved software renderer fallback contract on Windows
- Format capability matrix by product truth (not decoder discovery alone)
- Advanced display fidelity (wide-gamut / HDR) only after base path is stable
- Further PocketJS generic graphics capabilities **implemented and reviewed upstream first** (see `docs/integration/POCKETJS.md`)

---

## Performance rule

Architecture correctness is not deferred. Workload-dependent optimization remains evidence-driven.

Physical claims follow `docs/BENCHMARK.md`. An already-RGBA8 decode materializing unexplained full-plane copies is an architecture differential first, not a benchmark-tuning choice.

---

## Rule for existing GitHub issues

An issue created before the architecture reset or before MVP closeout is not automatically executable.

Before reuse, check it against current Product authority, Architecture authority, SPEC, accepted ADRs, `docs/integration/POCKETJS.md`, and current code. If drift is material, rewrite or close/recreate the issue rather than preserving obsolete wording.

# PicoView Roadmap

Status: **CURRENT OPERATIONAL SEQUENCING**  
Date: **2026-09-20**

This roadmap sequences work under current Product, Architecture, and SPEC authority. It does not redefine those semantics. Closed campaigns are history, not future work — see `docs/history/`.

---

## Released: v0.1.0

The following are **released** (tag `v0.1.0`, `main` @ `f7b08ca`) and must not be restated as open roadmap items:

- Local image open (native dialog, CLI path, Windows associations)
- Browse Previous / Next
- View transforms: Fit / 1:1 / zoom / pan / rotate / flip
- Windows product shell (toolbar, status, empty/error UX, associations, embedded guest)
- Last-good publication ordering and guest publication/request split
- Direct Desktop/wgpu image admission on the ordinary path (ADR-0002)
- PocketJS git-subtree under `third_party/pocketjs` + `POCKETJS.lock` provenance
- R1 presentation geometry consumed from shared PocketJS (Dynamic logical from measured physical + live OS scale)
- R2 image minification quality (GPU mip chain, generic in PocketJS)
- R3 resize scheduling / presentation-input latest-wins coalescing
- Small visual corrective (toolbar icons, 12/14px UI fonts)
- Live DPI acceptance at 125% / 150% / 200% on native Windows
- Windows release hardening: packaging, Inno Setup installer, portable artifact, release script, association regression, clean-machine build verification, release smoke
- Stage B native structure cleanup and documentation authority surface cleanup

---

## Current: post-release normalization

Active work. Authoritative finding list: [Issue #75](https://github.com/jnhu76/PicoView/issues/75) — post-v0.1.0 whole-repository architecture/code audit.

Campaign order (each campaign keeps its own boundary, oracle, and checkpoint commit):

1. **C2** — post-release authority reset (docs describe released truth; `POCKETJS.lock` is the only machine provenance)
2. **C0** — guest→host svc command-loss repair (bounded work per tick, FIFO, no silent tail loss)
3. **C1** — refresh loading/error status visibility (last-good image stays published)
4. **C3** — retire legacy `guest/view_state.ts` semantics (keep only publication reconcile contract)
5. **C4** — guest composition-root normalization (one display-derivation authority)
6. **C5** — cross-boundary constant contracts (version/extension/geometry mirrors get owners or oracles)
7. **C6A** — make Windows-only product truth explicit in native sources
8. **C6B** — fatal-error observability in the GUI-subsystem binary
9. **C7** — test architecture repair (presentation/associations oracles, corpus gating, fixture dedup)
10. **C8A** — decode/navigation pressure mechanism gate (measurements; no mechanism pre-selected)
11. **C8B** — conditional: implement only the mechanism C8A evidence selects
12. **C9** — remaining MINOR/NIT normalization and naming

Rules: campaign order is fixed; a new MAJOR discovered mid-campaign stops execution; `third_party/pocketjs` is not patched for upstream findings (upstream issues only); CJK glyph fallback (#74) stays separate.

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

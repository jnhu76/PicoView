# PicoView Context

Current operational state only. Campaign chronology and evidence live under `docs/history/` and in git history.

---

## Product state

PicoView is a Windows 11 local image viewer on PocketJS.

**MVP is feature-complete.** The viewer can open a local image, browse previous/next, apply Fit / 1:1 / zoom / pan, rotate/flip, open via native dialog, and register file associations. Product use is local-only.

Current phase: **release hardening** (R2/R3 quality closure and live DPI acceptance complete on `main`). Windows release packaging — app icon authority, EXE resources, Inno Setup installer, portable artifact, release script — is authored on `release/windows-release-hardening-1` (authority: [`docs/RELEASE-WINDOWS.md`](docs/RELEASE-WINDOWS.md)).

---

## Current source baseline

- Stage C campaign branch: `docs/mvp-authority-cleanup-1` (docs-only)
- **Code baseline before Stage C** = PR #66 merge `6eb578ef7215642ca7852113f9987f004a8c36bb`
  (`refactor/native-structure-cleanup-1` — Stage B native structure)
- Stage C (this documentation authority cleanup) changes **docs only**.
  `native/`, `guest/`, and `third_party/pocketjs/` are unchanged relative to that baseline.
- Stage A R1 presentation consume is already in that code baseline (Dynamic viewport from measured physical + live OS scale)
- Do not treat Stage C docs commits as a new runtime/code baseline
- Historical Stage A/B campaign worktrees may still exist; do not reuse them for new work

---

## PocketJS integration

| Fact | Value |
| --- | --- |
| Source path | `third_party/pocketjs` |
| Upstream | `jnhu76/pocketjs` |
| Integration branch | `integration/picoview-desktop` |
| Provenance revision | `4cf84b8d0124ae2e67681f279e6f5427917b4aff` |
| Mechanism | `git subtree` (`--squash`) — not a submodule, not a Cargo git dependency |
| Human contract | [`docs/integration/POCKETJS.md`](docs/integration/POCKETJS.md) |
| Machine provenance | [`POCKETJS.lock`](POCKETJS.lock) |

Cargo PocketJS crates resolve as path dependencies into `third_party/pocketjs`. A normal clone contains the required PocketJS source.

---

## Current architecture authorities

- Product: `docs/PRD/PicoView-PRD-v0.6.md`
- Architecture decisions: `docs/ADR/` (ADR-0001, ADR-0002 accepted)
- Detailed program semantics: `docs/ARCHITECTURE.md`
- Execution contract: `docs/SPEC/PicoView-v1.1.md`
- Sequencing: `docs/ROADMAP.md`
- PocketJS integration contract: `docs/integration/POCKETJS.md`
- PocketJS provenance: `POCKETJS.lock`
- Agent rules: `AGENTS.md`
- Measurement semantics: `docs/BENCHMARK.md`

Historical/non-normative: `docs/history/**`. Superseded pre-reset authority is under `docs/history/authority-reset-20260915/`.

### Native source authority (post Stage B)

| Module | Authority |
| --- | --- |
| `native/src/main.rs` | process composition only |
| `native/src/app.rs` | window / winit / native input |
| `native/src/runtime.rs` | guest worker / scheduling |
| `native/src/presentation.rs` | retained target / swapchain (PocketJS renders) |
| `native/src/current_item/mod.rs` | Product CurrentItem orchestration |
| `native/src/current_item/decode.rs` | decode / Image (WIC, EXIF O, RGBA) |
| `native/src/current_item/publication.rs` | publication / lifetime protocol |

There is no `gpu.rs` and no monolithic `current_item.rs`. Host presentation plumbing is product-owned; generic R1 geometry/signature/filter identity is consumed from shared PocketJS (`pocket-desktop-host` + `pocket-ui-wgpu`).

---

## Open work / known debt

Architecture-authority work for MVP is closed. Known implementation debt (not authority redesign):

- R2 image minification — **implemented** via PocketJS `4cf84b8` GPU mip chain for linear images (PICOVIEW-63 PR #68; pending review)
- R3 resize scheduling — **implemented** via PicoView presentation-input latest-wins coalescing + Host producer-side pending-presentation slot (Full channel retains/retries final Presentation; Disconnected ≠ success) (same PR corrective; pending review)
- Small visual corrective: toolbar icons, 12/14px fonts
- Live DPI acceptance at 125/150/200%
- Sampling partly stored as texture state rather than pure draw policy
- Desktop image admission follows created-device capability (`Ui::image_max_texture_dim` /
  PicoView `ImageAdmissionPolicy`); `NATIVE_TEX_MAX_DIM` remains the portable default
  ceiling until a host installs device truth
- Giant-image Proxy path remains for sources that exceed usable capability or the
  product pixel budget; full-resolution is derived (`resource == source`)
- Color/alpha admission remains RGBA8-oriented rather than the generic Architecture contract
- Windows path has no proved software renderer fallback
- Packaging / file-association regression / clean-machine build not closed

---

## Next tasks

See [`docs/ROADMAP.md`](docs/ROADMAP.md). Immediate sequencing is stabilization (R2/R3 + visual corrective + live DPI), then release hardening. Do not reopen closed architecture campaigns without new evidence that disproves an accepted ADR/SPEC assumption.

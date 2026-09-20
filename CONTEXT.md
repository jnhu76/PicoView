# PicoView Context

Current operational state only. Campaign chronology and evidence live under `docs/history/` and in git history.

---

## Product state

PicoView is a Windows 11 local image viewer on PocketJS.

**PicoView v0.1.0 is released** (tag `v0.1.0`, BASE `main` = `f7b08ca`). The viewer opens a local image (native dialog, CLI path, or Windows file association), browses previous/next in the containing folder, applies Fit / 1:1 / zoom / pan / rotate / flip, and installs conservative HKCU OpenWith associations. Product use is local-only.

Current phase: **post-release correctness / architecture normalization** ([Issue #75](https://github.com/jnhu76/PicoView/issues/75)). Released Windows packaging — app icon authority, EXE resources, Inno Setup installer, portable artifact, release script — is shipped and is release evidence (authority: [`docs/RELEASE-WINDOWS.md`](docs/RELEASE-WINDOWS.md)).

Release **build topology** (corrective: PICOVIEW-WINDOWS-RELEASE-BUILD-CORRECTIVE-1): the guest compiles as a PocketJS *external project* from the repository root — `tsconfig.json` carries the project's module resolution, `scripts/build-guest.ps1` is the canonical guest build, and the release script is orchestration only. No junction/symlink scaffolding and no `node_modules` surgery anywhere in the build path: the only dependency install in it is `bun install --frozen-lockfile --cwd third_party/pocketjs`, which restores PocketJS's own pinned dependencies into the framework's own gitignored `node_modules` and creates nothing on the PicoView side; evidence: [`docs/history/windows-release-build-corrective-1/EVIDENCE.md`](docs/history/windows-release-build-corrective-1/EVIDENCE.md).

---

## Current source baseline

- Code baseline: `main` @ `f7b08ca9107d91144de3aac2e428d0f85f9314c8` (= tag `v0.1.0`)
- Current work happens on normalization branches; `native/`, `guest/`, and `third_party/pocketjs/` are the released runtime surface
- Do not treat documentation-only commits as runtime/code baselines

---

## PocketJS integration

| Fact | Value |
| --- | --- |
| Source path | `third_party/pocketjs` |
| Upstream | `jnhu76/pocketjs` |
| Integration branch | `integration/picoview-desktop` |
| Provenance revision | see [`POCKETJS.lock`](POCKETJS.lock) — machine provenance authority; docs do not duplicate the revision literal |
| Mechanism | `git subtree` (`--squash`) — not a submodule, not a Cargo git dependency |
| Human contract | [`docs/integration/POCKETJS.md`](docs/integration/POCKETJS.md) |

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

### Native source authority

| Module | Authority |
| --- | --- |
| `native/src/main.rs` | process composition only |
| `native/src/app.rs` | window / winit / native input |
| `native/src/runtime.rs` | guest worker / scheduling |
| `native/src/presentation.rs` | retained target / swapchain (PocketJS renders) |
| `native/src/current_item/mod.rs` | Product CurrentItem orchestration |
| `native/src/current_item/decode.rs` | decode / Image (WIC, EXIF O, RGBA) |
| `native/src/current_item/publication.rs` | publication / lifetime protocol |

There is no `gpu.rs` and no monolithic `current_item.rs`. Host presentation plumbing is product-owned; generic presentation geometry/signature/filter identity is consumed from shared PocketJS (`pocket-desktop-host` + `pocket-ui-wgpu`).

---

## Open work / known debt

v0.1.0 release gates are closed. Current work is the post-release normalization campaign ([Issue #75](https://github.com/jnhu76/PicoView/issues/75)); its finding list is the authoritative debt inventory.

Standing architecture notes that survive the release (not campaign findings):

- Sampling partly stored as texture state rather than pure draw policy
- Desktop image admission follows created-device capability (`Ui::image_max_texture_dim` /
  PicoView `ImageAdmissionPolicy`); `NATIVE_TEX_MAX_DIM` remains the portable default
  ceiling until a host installs device truth
- Giant-image Proxy path remains for sources that exceed usable capability or the
  product pixel budget; full-resolution is derived (`resource == source`)
- Color/alpha admission remains RGBA8-oriented rather than the generic Architecture contract
- Windows path has no proved software renderer fallback

---

## Next tasks

See [`docs/ROADMAP.md`](docs/ROADMAP.md). Immediate sequencing is the post-release normalization campaign order from Issue #75. Do not reopen closed architecture campaigns without new evidence that disproves an accepted ADR/SPEC assumption.

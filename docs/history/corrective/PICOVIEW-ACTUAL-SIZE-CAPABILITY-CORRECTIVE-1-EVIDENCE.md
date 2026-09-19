# PICOVIEW-ACTUAL-SIZE-CAPABILITY-CORRECTIVE-1 — Evidence

Campaign: PICOVIEW-ACTUAL-SIZE-CAPABILITY-CORRECTIVE-1
PR: #70 (https://github.com/jnhu76/PicoView/pull/70)
PRIOR_HEAD: `642ba0d1add0a784886f5b5ef65843982a4308e1`
Branch: `fix/actual-size-capability-1`
DPI: 100% Windows only
Stop: PR open, **not merged**

## PocketJS provenance

| Fact | Value |
| --- | --- |
| Prior integration SHA | `3f31a20f3a0c82d74dc4e640fb55b889b6486a9f` |
| New upstream feature | `jnhu76/pocketjs` `feat/desktop-image-device-capability-1` @ `720e6ee3ed91d53038ae6c6330420bb46dabca30` |
| New integration SHA | `integration/picoview-desktop` @ `720e6ee3ed91d53038ae6c6330420bb46dabca30` |
| Import | `git subtree pull --prefix=third_party/pocketjs pocketjs integration/picoview-desktop --squash` |
| POCKETJS.lock | `720e6ee3ed91d53038ae6c6330420bb46dabca30` |

## MINOR 1 — child surface capability inheritance

**Requirement:** every UiSurface owned by the same Desktop runtime/device receives the same immutable created-device image capability.

**Root capability:** `device.limits().max_texture_dimension_2d` = **16384** (this host).

**Propagation shape (PocketJS `hosts/desktop`):**

```text
created device
  → usable_image_dim = device.limits().max_texture_dimension_2d
  → Runtime::boot(..., usable_image_dim)
  → AppSupervisor::new(shell, usable_image_dim)
       → shell.set_image_max_texture_dim(usable_image_dim)
  → AppSupervisor::open → install_image_capability(child)
       → child.set_image_max_texture_dim(same usable_image_dim)
```

No adapter re-query in AppSupervisor. No second GPU authority. No new magic constant.

**Propagation proof:** PocketJS test `tests::child_surfaces_inherit_created_device_image_capability`
- fresh Ui default = portable `NATIVE_TEX_MAX_DIM` (8192)
- after supervisor construction, root shell = 16384
- child before install = 8192
- child after `install_image_capability` = 16384
- root == child == second child

## MINOR 2 — max_resource_pixels strict invariant

**Old counterexample** (independent axis `round(scale)`):

| Input | Value |
| --- | --- |
| source | 113 × 8858 |
| max_resource_dim | 16384 |
| max_resource_pixels | 1,000,000 |
| old output | **113 × 8854 = 1,000,502** (**violates** budget) |

**Corrected output:**

| Path | Size | Product | Invariant |
| --- | --- | --- | --- |
| ideal integer target after round | 113 × 8854 | 1,000,502 | would violate |
| after hard shrink (`proxy_resource_size`) | **113 × 8849 = 999,937** | ≤ 1,000,000 | **holds** |

**Algorithm (not bare floor, not free growth):**
1. ideal continuous scale = min(dim_ceiling, pixel_budget, never-upscale)
2. integer target = `round(source × scale)` clamped to `max_resource_dim`
3. hard shrink longer axis until `cw*ch <= max_resource_pixels`
4. optional grow **only toward the ideal integer target**, never past either ceiling

**Invariant tests (native):**
- `proxy_pixel_budget_counterexample_113x8858_stays_invariant`
- `proxy_pixel_budget_exactly_on_budget_case` (20×20 @ 100 → 10×10 exact)
- `proxy_dimension_bound_only_case` (200×50 @ dim=100 → 100×25; pixels do not bind)
- `proxy_exact_capability_8256_path_unchanged` (8256×5504 under dim=16384 + 80M stays exact)
- `proxy_pixel_budget_invariant_holds_across_fuzz_sizes`
- existing CASE A–F + live corpus test still pass
- `giant_decodes_prepare_as_fitted_planes` still expects 8192×41 under portable policy

## MINOR 3 — evidence tools

| Item | Closure |
| --- | --- |
| Stale probe wording | `gpu_cap_probe` now describes CURRENT `desktop_image_required_limits` (raises only `max_texture_dimension_2d` to adapter); prints requested vs adapter vs device. Historical 8192 device evidence remains in BASELINE.md |
| Duplicate Product policy mirror | removed `picoview_policy_from_dim` / `(device_dim.max(1), 80_000_000)` from `admission_live_accept`. Example reports adapter/device/Core admission + resource geometry only |

## Reverification (LOCAL — not GitHub CI)

| Suite | Result |
| --- | --- |
| `cargo test --manifest-path native/Cargo.toml` | **64 pass / 0 fail** |
| `bun test guest/` (toolbar baseline worktree; guest unchanged) | **194 pass / 0 fail** |
| PocketJS core `upload_owned*` | **4 pass** |
| PocketJS pocket3d `desktop_image*` | **3 pass** |
| PocketJS desktop host tests | **6 pass / 0 fail / 1 GPU-ignored** |
| `cargo build --release --manifest-path native/Cargo.toml` | **OK** |
| live probe CURRENT limits | device dim **16384**; create_texture(8256×5504)=OK |
| live Core admission 8256 | handle≥0, resource=8256×5504 |
| live release open 8256 | fullResolution=true; present submitted; no validation/device-lost |
| live release open 1254 | fullResolution=true; unchanged |

### Live 8256 log (CORRECTIVE-1 HEAD)

```text
device limits: max_texture_dimension_2d=16384 (adapter 16384)
PicoView image capability: adapter_max_tex2d=16384 device_max_tex2d=16384
current-item open: source=8256x5504 resource=8256x5504 fullResolution=true policy.max_dim=16384 policy.max_pixels=80000000
present end (frame tick 1, submitted true)
```

### Live 1254 log

```text
current-item open: source=1254x1254 resource=1254x1254 fullResolution=true policy.max_dim=16384 policy.max_pixels=80000000
```

1:1 gate remains `can100 = publication.fullResolution === true` (unchanged guest).

## GitHub status

Separate from LOCAL tests: PR #70 is **OPEN** against `main`. This corrective pushed additional commits to the same branch; **GitHub Actions / required checks were not claimed green** — only local suites above were executed. Reviewer should read actual PR check results on GitHub.

## Final verdict

`ACTUAL_SIZE_CAPABILITY_CORRECTIVE_READY_FOR_REVIEW`

STOP. DO NOT MERGE.

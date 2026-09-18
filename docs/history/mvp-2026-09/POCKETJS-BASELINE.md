# PocketJS Baseline for PicoView Architecture Phase A

Status: **frozen campaign baseline**

## Repository

`https://github.com/pocket-stack/pocketjs`

## Base commit

`a5a85356e172db8a32aefa983ee1259f60406f69`

This is the source identity against which PicoView Architecture Phase A was planned and adversarially reviewed.

## Authoritative development host

Architecture Phase A Windows results are produced on **native Windows**, not inside WSL.

Current Rust toolchain baseline supplied for the campaign:

```text
stable-x86_64-pc-windows-msvc
rustc 1.98.1
```

WSL may still be used for reading, note-taking, repository inspection, and non-Windows helper scripts, but it is **not authoritative evidence** for:

- Windows stock-target admission;
- winit/wgpu Windows behavior;
- WIC integration;
- Per-Monitor DPI V2;
- Windows process startup timing;
- Working Set - Private / Private Bytes;
- native Windows idle CPU behavior;
- Windows packaging/association behavior.

Every gate report records the exact `rustc -Vv` / Cargo identity actually used. A toolchain update after evidence collection does not silently inherit old measurements; the report states whether rerun is required.

## Baseline facts relevant to PicoView

At this commit:

- PocketJS has a portable `hosts/desktop` architecture using winit/wgpu and QuickJS/runtime-worker semantics.
- Stock desktop target profiles exist for macOS/Linux, not Windows.
- `hosts/desktop/src/plan.rs` explicitly compile-errors targets other than macOS/Linux.
- The public JS-facing UI host contract exposes `uploadTexture(Uint8Array, ...)` for ordinary texture upload and documents a small-texture `≤512` dimension contract.
- Existing image-node / texture-handle / DrawList `TEX_QUAD` semantics exist, but PicoView has not yet proved a large native-owned dynamic image resource can enter that composition path without O(image-bytes) QuickJS transport.

These are baseline observations, not permanent PocketJS truths. If upstream changes, Architecture Phase A still compares against this exact baseline unless an explicit rebase decision updates this file and the affected evidence.

## Development topology

Default campaign topology on native Windows:

```text
<workspace>\
  PicoView\     # jnhu76/PicoView
  pocketjs\     # pocket-stack/pocketjs or an equivalent worktree
```

The PocketJS checkout is pinned to the exact base SHA before architecture work begins.

Runtime-generic changes belong in the PocketJS checkout/branch rather than being copied into PicoView. PicoView-specific product logic remains in PicoView.

Every architecture report records:

- PicoView SHA;
- PocketJS base SHA;
- effective PocketJS SHA (if patched);
- patch/PR reference when available;
- native Windows toolchain identity.

## Rebase policy

Do not follow PocketJS `main` implicitly during Architecture Phase A.

A rebase to a newer PocketJS commit requires an explicit recorded decision that states:

1. why the newer baseline is required;
2. what changed in the relevant host/resource contract;
3. which prior measurements become stale;
4. whether Architecture GATE-A evidence must be rerun.

## Authority boundary

This file freezes source identity, authoritative development host, and integration assumptions only.

- PRD owns PicoView product boundaries and physical budgets.
- SPEC owns system behavior and phase/gate structure.
- `docs/BENCHMARK.md` owns measurement semantics.
- accepted ADRs may freeze a durable implementation choice after evidence exists.

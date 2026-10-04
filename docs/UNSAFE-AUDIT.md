# Unsafe Audit — PicoView site inventory and safety contracts

> **Audit identity — read this first.** Every claim, count, and line number
> below is pinned to exactly one tree and one PocketJS snapshot. It
> describes those revisions, not "the repo at any later date". Re-run §7's
> commands before trusting any number against a newer tree.

```text
PicoView baseline SHA-1 : c6211c792843b2fd1a71373e62a2c13c01f627d2
                          (main — the tree every count/inventory below is pinned to)
PocketJS subtree SHA    : 720e6ee3ed91d53038ae6c6330420bb46dabca30
                          (POCKETJS.lock revision — the third_party/pocketjs snapshot audited)
Audit performed         : 2026-10-04 (UTC)
Document last revised   : 2026-10-04T15:47:36Z (adds §9 eliminability assessment)
```

This document is a **descriptive code audit** of every `unsafe` construct in
PicoView-owned Rust, plus a bounded survey of the in-tree PocketJS subtree.
It documents code reality and the local safety contract at each site. It is
**not** a new authority layer: Product/Architecture/SPEC meaning stays with
their own documents, and nothing here redefines them.

| Field | Value |
|---|---|
| Audited tree | `c6211c792843b2fd1a71373e62a2c13c01f627d2` (`main`, worktree clean) |
| Audit date | 2026-10-04 |
| Method | Exhaustive read of every `unsafe` site (grep enumeration + per-site source read); no tool-equivalence claim beyond that |
| PicoView scope | `native/` only — the single crate `picoview` (src, examples, build.rs) |
| PocketJS scope | Bounded survey of `third_party/pocketjs` at `POCKETJS.lock` revision `720e6ee3ed91d53038ae6c6330420bb46dabca30` |
| Out of scope | `guest/` (TypeScript — no `unsafe` concept), crates.io dependencies (§6), the withdrawn 2026-09-30 rust-review report's full findings (§10) |

Counting caveat: "site" counts here are **declaration-kind counts**
(`unsafe {` blocks, `unsafe fn`, `unsafe impl`, `static mut`, `extern`
blocks). Raw `grep unsafe` mention counts are larger because SAFETY
comments and lint attributes also contain the word. Both numbers are
stated wherever both exist.

---

## 1. Executive summary

PicoView-owned code (`native/`), at the audited tree:

| Construct | Count |
|---|---|
| `unsafe { }` blocks | **15** (12 production, 3 test/tooling-gated) |
| `unsafe fn` | 0 |
| `unsafe impl` (Send/Sync or otherwise) | 0 |
| `static mut` | 0 |
| `extern` blocks / `#[no_mangle]` | 0 |
| Sites with a local SAFETY contract comment | 15 / 15 |

All 15 sites are Win32/COM call sites over the `windows-rs` bindings or
plain pointer-view constructions; none touches image bytes, PocketJS
resources, or GPU state directly. Enforcement is mechanized (§2).

The PocketJS subtree actually **compiled into the PicoView desktop binary**
contains exactly **9 `unsafe { }` blocks and nothing else** — no `unsafe
fn`, no `unsafe impl`, no `static mut`, no FFI reachable on desktop. All 9
were read at this audit; all carry safety comments; all are bounded
view/copy reinterpretations (§5). The `pocket-ui-wgpu` backend and the
shared `hosts/desktop` host — the ADR-0002 presentation path — contain
**zero** unsafe lines.

---

## 2. Enforcement gates

`native/Cargo.toml` mechanizes the local proof obligation:

```toml
[lints.rust]
unsafe_op_in_unsafe_fn = "deny"

[lints.clippy]
undocumented_unsafe_blocks = "deny"
```

- `undocumented_unsafe_blocks` requires a `// SAFETY:` comment on every
  `unsafe { }` block (private items included) — this is what the 15/15
  coverage number reflects.
- `unsafe_op_in_unsafe_fn` is belt-and-braces: the crate has no `unsafe fn`
  today, so the gate currently fires nowhere by construction.
- `missing_safety_doc` is deliberately **not** adopted: it covers public
  `unsafe fn` only, and this crate has none. It would be a gate that fires
  nowhere.

The PocketJS crates carry no `[lints]` section; their discipline is
upstream review ownership, not local gating (§5.4).

---

## 3. PicoView unsafe site inventory

Line numbers are pinned to the audited tree SHA above and will drift;
`file` + operation is the durable key.

### 3.1 `native/src/associations.rs` — Win32 registry (10 production sites)

Domain: `--register-associations` / `--unregister-associations` one-shot CLI
actions under HKCU. Handle ownership is centralized in the `OwnedKey` RAII
guard (introduced by corrective commit `a2d43e8`, resolving the historical
RAWFD-001 leak, §9): a raw `HKEY` exists only inside the two constructors,
and `Drop` is the single matching `RegCloseKey` on success and on every `?`
early-return.

| # | Site | Operation | Local safety contract |
|---|---|---|---|
| 1 | `associations.rs:63` | `RegCreateKeyExW` | `hpath` is a live NUL-terminated UTF-16 `HSTRING` for the call; `&mut key` is a valid out-pointer; on `ERROR_SUCCESS` the API transfers one open `HKEY` into the guard; on failure no guard wraps it, so nothing is closed twice |
| 2 | `associations.rs:92` | `RegOpenKeyExW` | Same contract as site 1 |
| 3 | `associations.rs:118` | `RegCloseKey` (in `Drop for OwnedKey`) | `self.0` was acquired by site 1/2 and no other code closes it — Drop is the exactly-once close on all return paths; close failure ignored deliberately (aborting cleanup was the leak pattern) |
| 4 | `associations.rs:193` | `slice::from_raw_parts` (u16→u8 byte view) | `hval` is a live NUL-terminated `HSTRING`; `(len+1)*2` bytes from `as_ptr()` are exactly its UTF-16 data including terminator, all inside one allocation; `*const u16 as *const u8` is a valid view (u8 has alignment 1) |
| 5 | `associations.rs:197` | `RegSetValueExW` (REG_SZ) | guard-owned open `HKEY`; `bytes` view from site 4 is readable for the call; value name `PCWSTR` live and NUL-terminated |
| 6 | `associations.rs:222` | `RegSetValueExW` (REG_NONE) | name pointer live/NUL-terminated; data is a zero-length slice so no value bytes are read |
| 7 | `associations.rs:289` | `RegDeleteTreeW` | live NUL-terminated path; `HKEY_CURRENT_USER` is a predefined root; result ignored so unregister stays idempotent |
| 8 | `associations.rs:308` | `RegDeleteValueW` | guard-owned open `HKEY`; name live/NUL-terminated; absent-value failure ignored |
| 9 | `associations.rs:330` | `RegQueryValueExW` | guard-owned key; `buf` is a live 64-unit (128-byte) stack buffer and `len` declares exactly its byte size, so the API can write at most 128 bytes; the API rewrites `len` with the actual size, keeping the later `buf[..units]` slice in bounds; over-size results fail with `ERROR_MORE_DATA` and are skipped |
| 10 | `associations.rs:352` | `RegSetValueExW` (clear default) | guard-owned key; `PCWSTR::null()` names the default value; empty REG_SZ data clears it — reached only behind the `may_clear_extension_default` ownership predicate (unit-pinned) |

Test-only site in the same file (not in production builds):

| # | Site | Operation | Local safety contract |
|---|---|---|---|
| 11 | `associations.rs:445` (`#[cfg(test)]`) | `RegDeleteTreeW` | live NUL-terminated throwaway test-root path; predefined HKCU root; test cleanup only. Companion smoke test exercises the real create→drop→recreate→delete guard lifecycle |

### 3.2 `native/src/app.rs` — window icon (1 site)

| # | Site | Operation | Local safety contract |
|---|---|---|---|
| 12 | `app.rs:47` | `GetSystemMetrics(SM_CXSMICON)` | pointer-free system-metrics query — no handle, buffer, or lifetime involved; a zero result is clamped to 16 instead of being trusted as an icon size |

### 3.3 `native/src/current_item/decode.rs` — WIC decode (1 site)

| # | Site | Operation | Local safety contract |
|---|---|---|---|
| 13 | `decode.rs:451` | whole-body COM/WIC sequence over **attacker-controlled bytes**: `CoInitializeEx` (MTA), `CoCreateInstance` factory, `CreateStream` + `InitializeFromMemory`, `CreateDecoderFromStream`, `GetFrame(0)`, format converter to `32bppRGBA`, `CopyPixels` | three named invariants: **COM** — factory/stream/decoder/converter are COM locals outliving every use, released on drop (windows-rs handles), MTA join valid on OK/S_FALSE; **lifetime** — WIC's `InitializeFromMemory` does not copy `bytes`; the stream references caller memory, so `bytes` (a shared borrow) must outlive every created object, which all drop before return; **buffer** — `decode_alloc_len` rejects frames above `MAX_DECODE_PIXELS` before allocation (so `pixels*4` cannot overflow usize, stride ≤ 320 MB < 2^32), and `CopyPixels` with a null rect writes at most `stride*height == rgba.len()` bytes into the live buffer |

This is the only PicoView site where untrusted input reaches an `unsafe`
boundary directly. EXIF orientation is materialized **after** the unsafe
block in safe code (`apply_exif_orientation`), so orientation handling adds
no unsafe surface.

### 3.4 Test/tooling-gated sites (2 more, not in production builds)

| # | Site | Operation | Local safety contract |
|---|---|---|---|
| 14 | `current_item/tests.rs:696` (`#[cfg(test)]`, `#[cfg(windows)]`) | test-only WIC **JPEG encode** helper: COM init, `CreateStreamOnHGlobal(fDeleteOnRelease=true)` (HGLOBAL transfers to stream), encoder/frame locals released on drop; `WritePixels`/`Read` given live, correctly sized slices (Read bounded to a 1 MiB buffer with matching length) | drives the production decoder with real encoded JPEG fixtures |
| 15 | `current_item/pressure_probe.rs:64` (module is `#[cfg(test)]`; also `#[ignore]` + `PICOVIEW_PRESSURE_PROBE` env gate) | `K32GetProcessMemoryInfo(GetCurrentProcess(), …)` | `GetCurrentProcess` returns a pseudo-handle that must not be closed; `PROCESS_MEMORY_COUNTERS_EX` is `repr(C)` with `PROCESS_MEMORY_COUNTERS` as its declared prefix (EX only appends `PrivateUsage`), so the cast to the base pointer type is the documented pattern; `cb` declares the full EX size so the API fills and reads back nothing beyond this exact buffer |

---

## 4. Absences worth stating

PicoView-owned Rust contains **no** `unsafe fn`, no `unsafe impl Send/Sync`,
no `static mut`, no `extern` blocks, no `#[no_mangle]`, no manual
`Vec::set_len`/uninitialized-memory tricks, and no raw-pointer plumbing of
image bytes. Interop is confined to call-site blocks over `windows-rs`
typed wrappers, which keeps every proof obligation local to one block.

---

## 5. PocketJS subtree — bounded survey

Provenance: `third_party/pocketjs` is an in-tree git-subtree squash of
`jnhu76/pocketjs` at `POCKETJS.lock` revision
`720e6ee3ed91d53038ae6c6330420bb46dabca30` (branch hint
`integration/picoview-desktop`). No nested `.git` — the committed snapshot
is the reviewed integration source.

### 5.1 Whole subtree vs. linked graph

Whole subtree (all hosts and backends, declaration-kind counts):
328 `unsafe fn`, 216 `unsafe { }` blocks, 8 `unsafe impl`, 0 `unsafe trait`
(796 raw mention lines).

That number is misleading for risk: the concentration lives in **device
hosts and non-desktop backends that are not in PicoView's dependency
graph**. `native/Cargo.lock` pins the actual link closure; the PocketJS
crates in it are exactly:

`pocketjs-core`, `pocket-mod`, `pocket-ui-surface`, `pocket-text`,
`pocket-ui-wgpu`, `pocket3d`, `pocket3d-anim`, `pocket3d-bsp`,
`pocket3d-mesh`, `pocket-desktop-host`.

Unsafe in the **linked** set:

| Crate | `unsafe fn` | `unsafe { }` | `unsafe impl` |
|---|---|---|---|
| `pocketjs-core` | 0 | 7 | 0 |
| `pocket-ui-surface` | 0 | 1 | 0 |
| `pocket3d-bsp` | 0 | 1 | 0 |
| `pocket3d`, `pocket3d-anim`, `pocket3d-mesh` | 0 | 0 | 0 |
| `pocket-mod` | 0 | 0 | 0 |
| `pocket-text` (desktop compilation) | 0 | 0 | 0 |
| `pocket-ui-wgpu` | 0 | 0 | 0 |
| `pocket-desktop-host` (`hosts/desktop`) | 0 | 0 | 0 |
| **Total linked** | **0** | **9** | **0** |

Note on `pocket-text`: its `src/wasm.rs` FFI surface (`#[no_mangle] extern
"C"` functions, two `static mut`, 2 unsafe blocks) is `#[cfg(target_arch =
"wasm32")]`-gated and is **not compiled** into the desktop binary. It is
counted as zero above for that reason and listed here so the wasm surface
stays visible.

### 5.2 The 9 linked sites, individually

All 9 were read at this audit. Every one is a bounded view/copy
reinterpretation inside PocketJS's own data structures; none is FFI, none
spawns concurrency, none touches GPU objects.

**`pocketjs-core` (`engine/core`):**

| Site | Operation | Stated invariant |
|---|---|---|
| `lib.rs:121` `Texture::pixels()` | reinterpret `Vec<u128>` aligned backing as `&[u8]` of `byte_len` | the backing `Vec<u128>` owns at least `byte_len` initialized bytes (constructed only through `copy_aligned`/RLE paths below) |
| `lib.rs:132` `Texture::palette()` | reinterpret palette backing as the fixed 1024-byte CLUT slice | palette is always `TEX_PALETTE_BYTES/16` u128 chunks, by construction |
| `lib.rs:229` `copy_aligned` | `copy_nonoverlapping` `src →` fresh 16-byte-aligned `u128` chunks | caller guarantees `src.len() >= byte_len`; destination is a live, exactly-chunked allocation |
| `lib.rs:731` RLE-into-backing | `from_raw_parts_mut` over `u128` chunks as the `packbits_decode` destination | stream must decode to EXACTLY `byte_len` bytes (codec contract); anything else is rejected as malformed |
| `lib.rs:887` in-place update | copy palette + pixels into the aligned backing | length checked `pixels.len() == byte_len` immediately above; palette fixed-size; `content_revision` bumped after the copies |
| `raster.rs:121` `fill_opaque_span` | u8 span → `&mut [u32]` word-fill fast path | 4-byte alignment checked at runtime just above; span length a multiple of four; temporary word slice covers exactly the span; unaligned fallback stays safe |
| `draw.rs:516` | copy finished pixel buffer into `u128` chunks | same shape as `copy_aligned`; `byte_len` derived from the buffer just written |

**`pocket-ui-surface`:**

| Site | Operation | Stated invariant |
|---|---|---|
| `surface.rs:51` | read a `CString` as raw bytes (`from_raw_parts(c.as_ptr(), c.len())`) | view is over the live `CString` itself for exactly its own length — deliberately avoids `as_str()`'s UTF-8 assumption (lone surrogates) |

**`pocket3d-bsp`:**

| Site | Operation | Stated invariant |
|---|---|---|
| `cooked.rs:251` | `&[u8]` → `&[u16]` cast for cooked map sections | even length checked above; `u16` has no invalid bit patterns; little-endian target compile-checked; source data must stay alive as long as the map (borrowed, not owned) |

Architecturally notable: `pocket-ui-wgpu` — the backend that receives
decoded RGBA8 and issues `Queue::write_texture` under ADR-0002's direct
image-admission path — achieves the whole upload path with **zero unsafe
lines**, as does the shared `hosts/desktop` host.

### 5.3 Unlinked concentration (not compiled into PicoView)

For completeness, an accounting of the subtree's other sites — all outside
the link closure (cross-checked by package name against `Cargo.lock`,
including non-`pocket`-prefixed crates such as `ui-cabi`):

| Area | Kind counts | Status |
|---|---|---|
| `pocket3d-vita` | 50 fn, 6 blk, 2 impl (`Sync` wrappers for GU state) | Vita GU backend — not linked |
| `pocket3d-gles2` | 25 fn, 8 blk | GLES2 backend — not linked |
| `pocket3d-gu` | 8 fn, 4 blk | GU shared backend code — not linked |
| `pocket3d` `gu-demo` | 3 fn, 1 blk | standalone demo binary — not linked |
| `pocket-db` | 2 blk | not a dependency |
| `pocket-net` | 1 blk | not a dependency |
| `engine/ui-cabi` | 2 impl (`GlobalAlloc`, `Sync for ExtensionV1`) | C-ABI engine shell — not linked |
| `hosts/psp`, `hosts/vita`, `hosts/3ds`, `hosts/esp-idf`, `hosts/pocketbook` | remainder of the fn/block bulk (~240 fn, ~190 blk), incl. 6 of the 8 subtree impls (3 `GlobalAlloc` allocators, `psp` `Sync` slot, esp-idf allocator, 3ds allocator) | device hosts — comparative evidence only per AGENTS.md, not linked |
| all other `hosts/*` | 0 | — |

This fully accounts the subtree's 8 `unsafe impl` (allocator + FFI-state
`Sync` wrappers for embedded/ABI targets, all pattern-different from
anything PicoView links) and leaves no unexplained remainder. If a future
PicoView change adds any of these areas to the dependency graph, §5.1 must
be re-run before this document's totals remain true.

### 5.4 Ownership rule

Per AGENTS.md's cross-repo rule, PocketJS unsafe is reviewed **upstream**:
generic capability changes land in `jnhu76/pocketjs` first, are frozen on
`integration/picoview-desktop`, and reach PicoView only via `git subtree
pull` + a `POCKETJS.lock` revision advance. This audit documents what the
locked revision contains; it does not re-review it and does not authorize
local patches inside `third_party/pocketjs`.

---

## 6. What this audit does not claim

This is a source-level site inventory, not a proof of program safety:

- **WIC and installed codecs.** Hostile encoded bytes are parsed by Windows
  codec implementations outside PicoView's code. Site 13's contract covers
  PicoView-owned glue (buffer sizing, COM lifetimes, bounds) only.
- **windows-rs bindings / Win32 / COM.** Treated as correct wrappers;
  underlying API contracts were checked at the call sites listed, nowhere
  else.
- **wgpu / winit / rfd / cosmic-text / other crates.io dependencies.**
  Consumed at their `Cargo.lock` versions; they contain their own internal
  unsafe, not surveyed here.
- **PocketJS soundness.** The 9 linked sites were read and their stated
  invariants recorded; upstream review remains the authority for their
  correctness (§5.4).

Prior full security review of this crate: the 2026-09-30 rust-review
campaign found no surviving Medium+ under its frozen REMOTE threat model
(§10).

---

## 7. Verification

Reproducible enumeration at the audited tree (any POSIX shell):

```sh
# PicoView sites by kind (expect at baseline: blocks 15 — 14 after §9.1's
# set_sz elimination; fn/impl/static-mut/extern 0)
grep -rEn 'unsafe[[:space:]]*\{'  native/src native/examples --include='*.rs'
grep -rEn 'unsafe[[:space:]]+fn'  native --include='*.rs'
grep -rEn 'unsafe[[:space:]]+impl' native/src --include='*.rs'

# Linked PocketJS crates (from native/Cargo.lock), then per-crate counts
grep -E '^name = "pocket' native/Cargo.lock
grep -rEn 'unsafe[[:space:]]*\{' third_party/pocketjs/engine/core \
  third_party/pocketjs/engine/crates/pocket-ui-surface \
  third_party/pocketjs/engine/pocket3d/crates/pocket3d-bsp --include='*.rs'
```

The gate itself: `cargo clippy --all-targets` fails the build if a new
`unsafe { }` block lands without a `// SAFETY:` comment.

---

## 8. Maintenance rule for new unsafe sites

A new `unsafe` site is acceptable only when all of the following hold:

1. The operation cannot be expressed safely; a safe standard-library or
   binding-level alternative does not exist.
2. The block carries a `// SAFETY:` comment naming the concrete invariant
   (pointer validity/lifetime, buffer byte length, termination, layout
   contract, handle ownership) — the lint gate enforces presence; keep the
   content honest.
3. `unsafe` is not used to cross an authority boundary (no image bytes
   through QuickJS, no backend nouns in Product/Image policy, no Product
   ownership of `wgpu::Texture` — see AGENTS.md hard-stop list).
4. The block is minimal: prefer safe helper functions around the smallest
   possible `unsafe { }` (the `OwnedKey` pattern), not whole-function
   `unsafe fn`.
5. This document's inventory tables and totals are updated in the same
   change.

---

## 9. Eliminability assessment (2026-10-04)

Question: can the remaining `unsafe` be eliminated? Answer: **not to zero,
and zero is not the right target.** 14 of the 15 baseline sites are
language-inherent FFI — any call through `windows-rs` bindings requires
`unsafe` — so their only true eliminations are wrapper dependencies or an
architecture change owned by Product/Architecture. This assessment is
pinned to the baseline SHA above and to linked PocketJS `720e6ee3`.

### 9.1 PicoView sites

| Tier | Sites | Disposition |
|---|---|---|
| Eliminable now, zero behavior change | `associations.rs:193` (`set_sz` u16→u8 pointer view) | the only non-FFI-inherent site: `value.encode_utf16()` → little-endian bytes expresses the same REG_SZ payload safely, for one small allocation on a one-shot CLI path. **Implemented by the change that carries this document** — the inventory above stays the baseline truth (15 sites); post-change totals are 14 blocks (11 production + 3 test-gated). |
| Eliminable at a dependency cost | the registry FFI blocks in `associations.rs` (9 production + 1 test cleanup) | microsoft's `windows-registry` crate would wrap open/create/set/delete/remove_tree safely and retire the `OwnedKey` guard. Rejected for now: every site already carries RAII + a per-block proof + the deny gates, so the swap buys count, not safety, and rewrites validated code. Revisit when `associations.rs` is next touched. |
| Keep | `app.rs:47` | a winit `scale_factor()` derivation is per-window DPI while `SM_CXSMICON` reads system DPI — not equivalence-safe on multi-monitor; the call is pointer-free. |
| Keep (architecture-owned) | `decode.rs:451` | `unsafe` is inherent to the COM/WIC call surface. Elimination means replacing the WIC baseline decoder — a Product/Architecture decision (PRD), not an unsafe-hygiene one. |
| Keep (test tooling) | `pressure_probe.rs:64`, `tests.rs:696`, `associations.rs:445` | `#[cfg(test)]`-gated; safe alternatives are heavyweight dependencies (e.g. `sysinfo`) for opt-in tooling. |

### 9.2 Linked PocketJS sites (upstream-owned)

Any change here follows the cross-repo rule (upstream review first, then
subtree sync) — none of these are PicoView-local fixes:

| Site | Eliminability |
|---|---|
| `pocket-ui-surface` `surface.rs:51` | **Not locally eliminable.** rquickjs 0.12.2's `CString` is not `std::ffi::CStr`: its `as_str`/`Deref`/`AsRef<[u8]>` all route through `from_utf8_unchecked`, and the type exposes no safe byte accessor — reading the raw QuickJS bytes is the only lossy decode path for lone surrogates. Elimination needs an upstream rquickjs API (e.g. `as_bytes`). |
| `pocket3d-bsp` `cooked.rs:251` | Eliminable upstream: `bytemuck::cast_slice` (bytemuck is already in the tree transitively) or a per-element `from_le_bytes` copy at the cost of one allocation per map cook. |
| `pocketjs-core` aligned-backing family (7 sites) | Exists for the PSP GE's 16-byte-aligned data pointers. The desktop wgpu path (`Queue::write_texture`) needs no alignment, so conditioning the aligned backing on device backends is a plausible upstream evolution — PocketJS-generic work involving device-host behavior; not a PicoView decision. |

### 9.3 Bottom line

Zero `unsafe` in PicoView-owned code would not make the process
unsafe-free: wgpu, winit, windows-rs, and the rest of the crates.io graph
carry order-of-magnitude more `unsafe` internally. The durable control is
the one already in place — minimal blocks, local SAFETY contracts,
deny-level lint gates (§2, §8) — with the one cheap elimination above
taken.

---

## 10. History

- **2026-09-30** — full rust-review security campaign against tree
  `9f506c4b`. Key findings later fixed: RAWFD-001 (HKEY leak on
  early-return; fixed by `a2d43e8` RAII `OwnedKey`), the systemic
  SAFETYDOC-001..010 + CARGOLINT-001 proof-obligation gap (fixed by
  `9782006`: per-site SAFETY contracts + `[lints]` gate), MSRV-001 (fixed
  by `a855a8b`: `rust-version = "1.89"`). Report artifacts were
  deliberately withdrawn from the tree by `afc315f` (PRs must not carry
  `.rust-review-results/`); the report remains recoverable from git
  history at `afc315f^:.rust-review-results/20260930T143750Z/REPORT.md`.
- **2026-10-04** — this document: durable unsafe inventory at
  `c6211c7`, adding the linked-graph PocketJS bounding survey that the
  withdrawn report had explicitly left as an inherited trust boundary.

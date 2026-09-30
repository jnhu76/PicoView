# Coverage gate — worker-2 (cluster memory-safety)

| Pass prefix | Bug class            | Outcome                                                                                                                                    |
|-------------|----------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| UNINITREAD  | uninitialized-read   | cleared (no `assume_init*`/`mem::uninitialized`/`MaybeUninit::uninit` anywhere; all unsafe-boundary buffers zero-initialized: `vec![0u8; n]`, `[0u16; 64]`, `::default()`) |
| SETLEN      | vec-set-len-uninit   | cleared (no `Vec::set_len`/`Vec::from_raw_parts`/`spare_capacity_mut`; the single `slice::from_raw_parts` at native/src/associations.rs:104 claims exactly the HSTRING buffer's initialized `(len+1)*2` bytes incl. NUL — no init gap) |
| INVFREE     | invalid-free         | cleared (no `alloc`/`dealloc`/`realloc` calls, no `*ptr =` deref-assign sites, no `MaybeUninit::uninit` in the crate)                        |
| UAF         | use-after-free       | cleared (all `as_ptr`/`as_mut_ptr` extractions bind to locals outliving each use; the WIC stream's borrow of attacker `bytes` lasts only the `decode_wic` body; no `into_raw`/`transmute`/`Box::leak`) |
| DFREE       | double-free          | cleared (no `ptr::read`; `RegCloseKey` called exactly once per successfully opened key — early `?` paths leak handles, the opposite of a double close) |
| BOF         | buffer-overflow-unsafe | cleared (no `get_unchecked`/`copy_nonoverlapping`/raw-pointer `.add/.offset` sinks; `CopyPixels` at decode.rs:469 writes into a buffer of exactly `stride*height` bytes from `decode_alloc_len` — pixels ≤ 80M checked, so `stride as u32` cannot truncate; box-fit indexing in `prepare_for_admission`/`apply_exif_orientation` verified in-bounds for orientations 2..=8) |
| UNIONUB     | union-ub             | cleared (no `union` declarations in `native/` — seed empty)                                                                                 |
| PANICUNWIND | panic-unwind-unsafe  | cleared (no custom unsafe element-storage containers; `catch_unwind` at app.rs:575 and examples/gpu_cap_probe.rs:77 convert a worker panic into an `Exit` event with no retry of mutated unsafe state) |

Note: the `unsafe` block at native/src/current_item/tests.rs:687 (WIC JPEG encoder helper) is `#[cfg(windows)]` test-only, unreachable from the production binary under the REMOTE threat model; its 1 MiB `Read` buffer and bounded `truncate` were inspected and are sound regardless.

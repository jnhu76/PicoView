---
id: SAFETYDOC-009
bug_class: safety-doc
title: decode_wic's large unsafe block over attacker-controlled bytes has no SAFETY documentation
location: native/src/current_item/decode.rs:433
function: decode_wic
confidence: High
worker: worker-1
fp_verdict: TRUE_POSITIVE
fp_rationale: "Verified: decode_wic's entire body is one undocumented unsafe block (decode.rs:433) receiving attacker-controlled image bytes via InitializeFromMemory; the sizing invariants (decode_alloc_len/MAX_DECODE_PIXELS cap, stride u32 fit, stream body-lifetime) hold at this revision, so the missing contract is a valid hardening gap, not unsoundness."
severity: LOW
attack_vector: Remote
exploitability: Theoretical
severity_rationale: "The unsafe boundary itself faces attacker bytes (REMOTE site), but the finding is the missing documentation of verified-sound invariants; hardening-gap rule places it at LOW."
---

## Description
`decode_wic` is a safe `pub fn` (in `pub(super) mod wic`) that takes fully attacker-controllable image bytes and runs its entire body inside a single `unsafe { ... }` block (lines 433-484): COM initialization, `IWICStream::InitializeFromMemory(bytes)` (which the WIC contract says borrows the caller's memory for the stream's lifetime), decoder/frame creation, dimension reads, and `CopyPixels` into a heap buffer. There is no `// SAFETY:` comment anywhere in the block. This is the crate's highest-value unsafe boundary — untrusted input flowing to Win32 — and the load-bearing invariants are invisible: (1) `bytes` outlives every WIC use because the stream is dropped before the function returns and `bytes` is borrowed for the whole body; (2) the `CopyPixels` buffer is sized `decode_alloc_len(width, height)?` — pixels ≤ 80M checked, `width*height*4` exactly equals `stride*height` the API requires for the full frame; (3) `stride as u32` cannot truncate because width ≤ 80M implies stride ≤ 320M < u32::MAX; (4) the `Exif` post-transform indexes a freshly-allocated exact-size plane. The audit verified all four hold; the finding is that none of this reasoning is documented at the boundary.

## Code
```rust
    pub fn decode_wic(bytes: &[u8]) -> Result<DecodedImage, OpenError> {
        unsafe {
            // OK / S_FALSE both mean a usable apartment on this thread.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED).ok();
            ...
            let mut rgba = vec![0u8; decode_alloc_len(width, height)?];
            let stride = width as usize * 4;
            converter
                .CopyPixels(std::ptr::null(), stride as u32, &mut rgba)
                .map_err(plain)?;
```

## Data flow
- **Source:** attacker-controlled image file bytes (`open_decoded` → `read_encoded_bounded` → `decode_wic`, reached from CLI/file-association open paths).
- **Sink:** `IWICStream::InitializeFromMemory(bytes)` (borrowed memory) and `CopyPixels(..., &mut rgba)` (bounded heap write) inside the undocumented unsafe block at native/src/current_item/decode.rs:433.
- **Validation:** present and verified — `decode_alloc_len` caps pixels at 80M and sizes the buffer exactly; `width == 0 || height == 0` rejected; stream lifetime is the function body. Validation exists but is not documented as a safety contract.

## Reachability trace
`main::run_product → app/runtime command handling → CurrentItem::open → open_decoded → decode_wic → unsafe { WIC COM calls }`

## Impact
No exploitable unsoundness found at this revision (all four invariants verified). The missing documentation at the untrusted-input unsafe boundary means the buffer-sizing and lifetime invariants that keep malicious images bounded are implicit; any edit to `decode_alloc_len`, the stride computation, or stream lifetime can silently invalidate the block.

## Mitigations checked
- Buffer size check exists (`decode_alloc_len`, `MAX_DECODE_PIXELS = 80_000_000`) and is unit-tested elsewhere, but no `// SAFETY:` comment ties it to the `CopyPixels` contract.
- No crate lint (`clippy::undocumented_unsafe_blocks`, `missing_unsafe_docs`) configured; `Cargo.toml` has no `[lints]` table.
- No MIRI/sanitizer coverage on Win32 paths (platform-inherent).

## Recommendation
Add an inline `// SAFETY:` comment enumerating the four invariants (bytes borrowed only for the body; exact-size `CopyPixels` buffer via `decode_alloc_len`; stride fits `u32`; post-transform indexes its own allocation). Consider shrinking the block: run the bounded allocation and the EXIF transform outside `unsafe {}`, and split COM acquisition into a small documented helper.

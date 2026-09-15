# ADR-0002 — Desktop/wgpu Direct Image Admission

Status: **ACCEPTED**  
Date: **2026-09-16**  
Scope: PicoView Windows/Desktop image admission into the PocketJS desktop/wgpu graphics path

## Context

ADR-0001 separates PicoView Product/Image authority from PocketJS logical resources and backend physical representation. It also establishes that semantic boundaries are not memcpy boundaries.

The locked PocketJS architecture already defines the stock desktop graphics backend as `pocket-ui-wgpu`. Other PocketJS targets legitimately use different physical resource paths: PSP can consume its PSM-oriented core storage directly; software rendering can sample core texture bytes directly; 3DS performs required layout conversion for PICA200; ESP32-P4 has hardware-specific direct paths.

The current desktop/wgpu implementation predates the PicoView authority reset and still mirrors core textures through a portable PSM-oriented CPU representation. For an already-decoded RGBA8 image this can produce an avoidable chain such as:

```text
decoder RGBA8
→ PicoView/core-owned PSM_8888-compatible CPU texture
→ another temporary RGBA8 plane
→ wgpu::Texture
```

That chain is a current implementation differential, not the desired Desktop contract.

This ADR freezes the Desktop specialization so future work does not accidentally preserve or recreate the PSM_8888 intermediate merely because the legacy portable texture API exists.

## Decision

### 1. Stock Windows/Desktop rendering uses the PocketJS wgpu backend

PicoView follows PocketJS's existing desktop backend model:

```text
PicoView Windows/Desktop
→ PocketJS desktop graphics path
→ pocket-ui-wgpu
→ wgpu resource/presentation
```

PicoView does not introduce a second desktop image renderer, a PicoView-specific GPU compositor, or a parallel native-image handle namespace.

### 2. Normal CPU-decoded RGBA8 path is direct-to-wgpu admission

When the selected decoder produces an RGBA8 pixel plane whose representation is directly admissible by the PocketJS desktop/wgpu path, the normative physical path is:

```text
encoded source
→ decode
→ decoder-owned RGBA8 pixel plane
→ PocketJS generic image admission
→ direct wgpu upload/admission
→ wgpu::Texture residency
→ existing opaque logical image resource / DrawList
```

For this case, there must be **no additional complete CPU pixel-plane materialization solely to convert the image into PocketJS `PSM_8888` storage**, and no additional complete RGBA8 plane solely to undo/re-expand that same representation before wgpu upload.

In shorthand:

```text
decoded RGBA8
→ wgpu::Texture
```

where PocketJS logical admission/lifetime still occurs, but **logical admission does not imply a separate canonical CPU texture allocation**.

### 3. `PSM_8888` is not the canonical Desktop image-resource representation

PocketJS PSM formats may remain valid portable/legacy physical representations for backends and workloads that need them.

They do not define the mandatory physical representation of a native Desktop image resource.

Specifically, the following is forbidden as the normal PicoView Desktop path:

```text
decoded RGBA8
→ allocate/copy full PSM_8888 backing merely for Core uniformity
→ expand/copy back to RGBA8
→ wgpu upload
```

A PSM representation may appear only when there is a named semantic or physical reason independent of “PocketJS historically stores textures this way.”

### 4. Backend chooses the shortest legal representation path

For Desktop/wgpu image admission:

1. if the admitted representation can be consumed/uploaded directly by wgpu, use it directly;
2. if conversion is required, fuse the required conversion into the final backend backing where practical;
3. create a complete intermediate pixel plane only when a named correctness/physical constraint makes it unavoidable.

This is a specialization of ADR-0001's large-object rule, not a second resource architecture.

Examples of valid reasons for conversion include genuinely incompatible pixel encoding, alpha representation, color transform, row/layout constraints, orientation materialization where chosen, frame composition, or another proven backend requirement.

A module/API boundary by itself is not such a reason.

### 5. Direct admission does not bypass PocketJS Core authority

“Direct to wgpu” does **not** mean PicoView owns `wgpu::Texture` or bypasses PocketJS resource semantics.

PocketJS Core still owns:

- logical image-resource identity;
- handle generation / stale-handle safety;
- logical lifetime;
- `content_revision`;
- the generic resource/draw contract.

The wgpu backend owns the physical `wgpu::Texture`, residency, upload/import mechanics, in-flight use, and destruction.

The intended shape is:

```text
PicoView Image facts + decoded storage
              │
              ▼
      PocketJS logical admission
              │
              ├── logical handle/lifetime/revision
              │
              ▼
       wgpu backend residency
              │
              ▼
          wgpu::Texture
```

Logical and physical ownership remain separate even when no full CPU copy exists between them.

### 6. Accelerator/native-import paths may be even shorter

This ADR does not require a CPU RGBA8 plane when a platform/hardware decoder can provide a representation directly importable/consumable by the selected wgpu path while preserving required image semantics.

Such a path may be:

```text
encoded source
→ platform/hardware decode
→ backend-importable/native storage
→ PocketJS logical admission
→ wgpu/backend residency
```

It must still obey ADR-0001 authority/lifetime/color/alpha rules and must account for hidden staging, interop, format conversion, and cross-adapter copies before being described as zero-copy.

### 7. Desktop fallback does not redefine the resource semantics

If a verified software graphics backend is selected instead of wgpu, that backend may require CPU-accessible image storage. That is a different backend realization under the same logical image-resource contract.

The possibility of software fallback is **not** a reason to force the normal wgpu path to retain a permanent PSM_8888 canonical copy.

Recovery/re-decode/re-admission policy may provide the fallback storage when needed.

## Stop-the-line conditions

For PicoView Windows/Desktop, stop implementation and repair the design if continuing requires any of the following without a separately proven physical/correctness reason:

1. decoded RGBA8 is copied into a full `PSM_8888`/portable CPU texture solely to enter PocketJS;
2. an already-RGBA8 image is copied into another full RGBA8 plane solely before `wgpu` upload;
3. a new public `NativeImageHandle` or parallel compositor is introduced to avoid fixing generic PocketJS admission;
4. PicoView Product/Image code directly owns or exposes `wgpu::Texture`;
5. a software-fallback requirement is used to justify permanent duplicate CPU+GPU full-image residency on the normal wgpu path;
6. view-only operations such as Fit/100%/Zoom/Pan/Rotate/Flip cause re-admission or full re-upload while valid residency exists.

## Current implementation differential

At the locked PocketJS revision used during the architecture reset, the desktop/wgpu path still expands Core PSM textures through a temporary RGBA buffer; `PSM_8888` therefore incurs an unnecessary full-plane copy before `wgpu` upload. PicoView also currently copies decoded pixels into its/native/core registration path before that stage.

Those behaviors are migration targets. They must not be cited as authority for new code.

## Cross-repo consequence

The generic capability required to satisfy this ADR belongs in `jnhu76/pocketjs` first. PicoView then advances `POCKETJS.lock` deliberately.

The PocketJS correction should preserve the existing logical resource/DrawList identity and existing backends while allowing the desktop/wgpu backend to consume directly admissible image storage without forcing it through a portable PSM backing.

## Non-decisions

This ADR does not freeze:

- the exact Rust API/type name for generic image admission;
- the exact wgpu upload API (`write_texture`, staging buffer, mapped transfer, import, etc.);
- a universal working pixel format for every source;
- a permanent CPU copy for device-loss recovery;
- the implementation of future software fallback;
- the exact hardware decode/import API;
- identical physical paths on PSP, Vita, 3DS, ESP32-P4, WASM/software, or other PocketJS targets.

Those choices may vary while preserving the Desktop rule above.
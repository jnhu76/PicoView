# ADR-0002 — Desktop/wgpu Direct Image Admission

Status: **ACCEPTED**  
Date: **2026-09-16**  
Scope: PicoView Windows/Desktop image admission into the PocketJS native-desktop/wgpu graphics family

## Context

ADR-0001 separates PicoView Product/Image authority from PocketJS logical resources and backend physical representation. It also establishes that semantic boundaries are not memcpy boundaries.

PocketJS already has a native desktop family: `macos-app` and `linux-app` use the shared `hosts/desktop` host and `pocket-ui-wgpu` graphics path. Windows desktop work must extend that family rather than derive a separate renderer/resource model from PSP, Vita, 3DS, or another device backend.

The upstream Windows stock-target work in `pocket-stack/pocketjs#419` demonstrates the intended host lineage: Windows is admitted as another target identity of the same `hosts/desktop` host, with no Windows-specific renderer, DrawList ABI, compositor, or UI stack. Until that PR is merged it is evidence of the intended upstream direction, not a substitute for the exact `POCKETJS.lock` source identity.

Other PocketJS targets legitimately use different physical resource paths: PSP can consume its PSM-oriented core storage directly; software rendering can sample core texture bytes directly; 3DS performs required layout conversion for PICA200; ESP32-P4 has hardware-specific direct paths. Those are backend-specific implementations and useful comparative evidence, but they do **not** define the mandatory physical representation of the native desktop/wgpu family.

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

### 1. Windows follows PocketJS's existing native-desktop host/backend family

The reference architecture for PicoView Windows is the existing PocketJS native desktop path already exercised by macOS/Linux:

```text
PocketJS guest / DrawList
        ↓
shared hosts/desktop
        ↓
pocket-ui-wgpu
        ↓
wgpu resource / presentation
```

PicoView Windows extends/consumes this shared family. It does not introduce a second desktop host, Windows-specific image renderer, PicoView-specific GPU compositor, or parallel native-image handle namespace.

Before proposing a Windows-specific graphics/resource mechanism, implementation must first inspect the corresponding macOS/Linux `hosts/desktop` + `pocket-ui-wgpu` path. A Windows-only branch requires a named platform/API constraint that the shared desktop path cannot represent.

PSP/Vita/3DS/ESP32 implementations may inform optimization techniques, but their physical texture formats, alignment rules, tiled layouts, CLUTs, or device-specific limits are **not Windows/Desktop requirements** unless independently required by wgpu/the selected desktop backend.

### 2. Normal CPU-decoded RGBA8 path is direct-to-wgpu admission

When the selected decoder produces an RGBA8 pixel plane whose representation is directly admissible by the shared PocketJS desktop/wgpu path, the normative physical path is:

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

This is a generic correction to the shared desktop/wgpu backend family, not a PicoView-only or Windows-only fast path.

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

The existence of PSP-compatible storage in PocketJS Core is not such a reason for macOS/Linux/Windows desktop wgpu rendering.

### 4. Backend chooses the shortest legal representation path

For the shared Desktop/wgpu image-admission family:

1. if the admitted representation can be consumed/uploaded directly by wgpu, use it directly;
2. if conversion is required, fuse the required conversion into the final backend backing where practical;
3. create a complete intermediate pixel plane only when a named correctness/physical constraint makes it unavoidable.

This is a specialization of ADR-0001's large-object rule, not a second resource architecture.

Examples of valid reasons for conversion include genuinely incompatible pixel encoding, alpha representation, color transform, row/layout constraints, orientation materialization where chosen, frame composition, or another proven backend requirement.

A module/API boundary, legacy PocketJS uniformity, or another device backend's native representation is not such a reason.

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

A platform-specific import path is added only when the shared desktop abstraction cannot express the required capability; the default is to extend `pocket-ui-wgpu` generically for its native desktop consumers.

### 7. Desktop fallback does not redefine the resource semantics

If a verified software graphics backend is selected instead of wgpu, that backend may require CPU-accessible image storage. That is a different backend realization under the same logical image-resource contract.

The possibility of software fallback is **not** a reason to force the normal wgpu path to retain a permanent PSM_8888 canonical copy.

Recovery/re-decode/re-admission policy may provide the fallback storage when needed.

## Stop-the-line conditions

For PicoView Windows/Desktop, stop implementation and repair the design if continuing requires any of the following without a separately proven physical/correctness reason:

1. decoded RGBA8 is copied into a full `PSM_8888`/portable CPU texture solely to enter PocketJS;
2. an already-RGBA8 image is copied into another full RGBA8 plane solely before `wgpu` upload;
3. a Windows-only renderer/resource path is introduced before checking whether the existing macOS/Linux `hosts/desktop` + `pocket-ui-wgpu` path can express the requirement;
4. PSP/Vita/3DS/other-device physical representation rules are treated as native Desktop requirements without an independent wgpu/Desktop reason;
5. a new public `NativeImageHandle` or parallel compositor is introduced to avoid fixing generic PocketJS admission;
6. PicoView Product/Image code directly owns or exposes `wgpu::Texture`;
7. a software-fallback requirement is used to justify permanent duplicate CPU+GPU full-image residency on the normal wgpu path;
8. view-only operations such as Fit/100%/Zoom/Pan/Rotate/Flip cause re-admission or full re-upload while valid residency exists.

## Current implementation differential

**Resolved.** The differential below existed at an earlier PocketJS revision.
Generic capability `Ui::upload_owned_rgba8` (developed in `jnhu76/pocketjs`,
frozen on `integration/picoview-desktop`) moves a host decoder's tight RGBA8
plane into the existing logical texture record (`TexBacking::Owned`), and
`pocket-ui-wgpu` borrows Owned planes directly into `Queue::write_texture`
with no conversion or staging plane.

**Current consume:** PicoView imports that capability via the in-tree git
subtree at `third_party/pocketjs`. `POCKETJS.lock` `revision` is
`24638737473cc7cd85202ba15adba511b79d9980`. Cargo uses path dependencies —
not remote PocketJS git pins. Ordinary decodes publish through the owned API.
See `docs/integration/POCKETJS.md`.

Campaign evidence for the migration era is archived at
`docs/history/corrective/PICOVIEW-DIRECT-IMAGE-ADMISSION-MIGRATION-1-EVIDENCE.md`.

Historical differential (for the record): at the locked PocketJS revision
used during the architecture reset, the desktop/wgpu path expanded Core PSM
textures through a temporary RGBA buffer, so `PSM_8888` incurred an
unnecessary full-plane copy before `wgpu` upload; PicoView's own
decoded-pixels copy had been removed earlier on 2026-09-16
(`PICOVIEW-DESKTOP-WGPU-CONFORMANCE-CLEANUP-1`), admitting the decoder's
RGBA plane by borrow into the legacy seam.

Those historical behaviors must not be cited as authority for new code.

The correction should be evaluated first against the existing macOS/Linux shared desktop implementation because that is the PocketJS family Windows joins. Device-specific backends are comparative evidence, not the Desktop authority source.

## Cross-repo consequence

The generic capability required to satisfy this ADR belongs in `jnhu76/pocketjs` first. PicoView then advances `POCKETJS.lock` deliberately.

The PocketJS correction should preserve the existing logical resource/DrawList identity and existing backends while allowing the shared desktop/wgpu backend to consume directly admissible image storage without forcing it through a portable PSM backing.

Do not create a Windows-only patch when the change belongs in shared `hosts/desktop` / `pocket-ui-wgpu` semantics.

## Non-decisions

This ADR does not freeze:

- the exact Rust API/type name for generic image admission;
- the exact wgpu upload API (`write_texture`, staging buffer, mapped transfer, import, etc.);
- a universal working pixel format for every source;
- a permanent CPU copy for device-loss recovery;
- the implementation of future software fallback;
- the exact hardware decode/import API;
- identical physical paths on PSP, Vita, 3DS, ESP32-P4, WASM/software, or other PocketJS targets.

Those choices may vary while preserving the shared native-desktop rule above.
# PicoView v1 Spec — PocketJS Windows Architecture and Product Execution

**Status:** Architecture Phase A ready  
**Product:** PicoView  
**Primary authority:** `docs/PRD/PicoView-PRD-v0.5.md`  
**Measurement authority:** `docs/BENCHMARK.md`  
**PocketJS source baseline:** `docs/POCKETJS-BASELINE.md`  
**Runtime choice:** PocketJS  
**Target:** Windows 11 desktop

## Problem Statement

PicoView has already frozen its product responsibility around:

**Open → View → Inspect → Browse → Handle**

The main remaining risk is not product scope. It is whether PocketJS can become a modern Windows desktop substrate that remains small, fast, idle when idle, and able to present large native-owned images without turning QuickJS into a pixel transport.

The previous v0.4 execution plan had four defects:

1. it put the architecture release gate after several product features, allowing half the viewer to be built before the substrate was admitted;
2. it described the portable desktop host as if Windows were merely unregistered, while the frozen PocketJS baseline explicitly compile-errors non-macOS/Linux hosts;
3. it skipped the central resource problem between native-decoded multi-megapixel images and PocketJS composition;
4. it did not freeze the external PocketJS SHA or benchmark definitions strongly enough for reproducible evidence.

The v1 execution spec therefore uses two phases with a hard architecture gate between them.

## Solution

PicoView is a PocketJS application with a deliberately split control/data architecture:

```text
PocketView/PicoView product intent
       ↓
PocketJS guest / QuickJS
       │ bounded commands/state only
       ↓
native image capability
       │
       ├─ source-file access
       ├─ WIC decode
       ├─ native pixel/resource lifetime
       ├─ generation cancellation
       └─ native image resource registration
                       ↓
               PocketJS composition
                       ↓
                DrawList/present
```

QuickJS owns application/product state and small semantic messages.

It does not transport ordinary full encoded images or decoded multi-megapixel pixel planes.

### Phase split

**Architecture Phase A** proves:

- reproducible PocketJS source identity and benchmark semantics;
- extension of the existing desktop architecture to a real Windows stock target;
- large native-owned image resource composition without JS pixel payloads;
- first JPEG/WIC path;
- large-JPEG Fit/100%/zoom/pan physical behavior;
- generation cancellation/resource bounds;
- minimal Per-Monitor DPI correctness;
- startup/package-prototype/memory/idle/five-process budgets.

Then **GATE-A** admits or rejects the architecture.

Only after GATE-A passes does **Product Phase B** implement BrowseSession, final Open/refresh UX, Handle, broad format/animation behavior, final viewer chrome, bounded UI Automation, and release packaging.

Finally **GATE-B** reruns the physical budgets against the complete v1 product.

---

## Architecture reality and source identity

The Architecture Phase A PocketJS campaign starts from:

`a5a85356e172db8a32aefa983ee1259f60406f69`

Relevant facts at that baseline:

- a portable desktop architecture exists;
- macOS/Linux stock targets exist;
- `hosts/desktop/src/plan.rs` compile-errors other host OS values;
- JS-facing `uploadTexture(Uint8Array, ...)` is documented as a small texture upload path with ≤512 dimensions;
- image-node / texture-handle / DrawList texture semantics exist;
- a large native-owned dynamically replaced image-resource path has not yet been proved.

Therefore Windows work begins by **extending the existing desktop architecture**, not by inventing a PicoView-only parallel host and not by assuming Windows already works.

Every architecture report records both PicoView and effective PocketJS SHAs.

---

## User Stories

1. As a Windows user, I want an ordinary JPEG to appear quickly after I open it, so the viewer feels direct.
2. As a Windows user, I want PicoView to stay small on disk and in memory, so a simple viewer does not behave like a platform.
3. As a Windows user, I want a static viewer to settle to near-zero PicoView-owned work.
4. As a Windows user, I want the current image to appear before folder navigation context is ready.
5. As a Windows user, I want large JPEG Fit viewing to avoid retaining needless full-resolution pixel surfaces where WIC native scaling can help.
6. As a Windows user, I want large PNG/corrupt/hostile inputs to remain bounded even when they cannot use JPEG-style native scaling.
7. As a Windows user, I want zoom/pan to stay directly coupled to input and preserve pointer anchoring.
8. As a multi-monitor user, I want image geometry and chrome to remain correct across DPI transitions.
9. As a Windows user, I want deterministic natural-order Previous/Next and no speculative enumeration-order history.
10. As a Windows user, I want rapid image requests to cancel/retire obsolete generations so stale images never replace the newest request.
11. As a Windows user, I want Open With, Delete, Rename, Copy, Reveal, refresh, and external-editor workflows without a file-manager subsystem.
12. As a Windows user, I want missing codecs and corrupt files to fail clearly without destroying browsing context.
13. As a keyboard/screen-reader user, I want core controls keyboard reachable and exposed through bounded Windows UI Automation.
14. As a privacy-conscious user, I want no telemetry, resident updater/service, or startup network requirement.
15. As a PicoView developer, I want PocketJS pinned to an exact architecture-campaign baseline so measurements can be reproduced.
16. As a PicoView developer, I want a Windows target implemented through the existing PocketJS desktop architecture first.
17. As a PicoView developer, I want QuickJS to remain a control plane and native resources to have explicit lifetime/generation authority.
18. As a PicoView developer, I want native-generated 4K pixels to reach PocketJS composition without a JS Uint8Array before WIC is added.
19. As a PicoView developer, I want first-image performance measured by a common timestamp/percentile contract rather than ad hoc stopwatches.
20. As a PicoView developer, I want five-process memory measured before any activation broker is admitted.
21. As a PicoView developer, I want third-party codecs to require benchmark evidence.
22. As a PicoView developer, I want Browse ordering to have an executable oracle, including leading-zero and long-digit-run behavior.
23. As a PicoView developer, I want directory eligibility established cheaply rather than by opening thousands of files.
24. As a PicoView developer, I want Product Phase B blocked until GATE-A admits the runtime/image architecture.
25. As a PicoView developer, I want final GATE-B measurements to detect product-level regressions of an architecture that once passed.

---

## Implementation Decisions

### Runtime and guest

- PocketJS is frozen as the runtime.
- Octane-first is the Architecture Phase A guest profile.
- Architecture host measurements use a minimal **PicoView-shaped Octane guest**, not hello-world, to avoid understating real guest/runtime cost.
- No second application UI runtime is admitted.

### Windows host strategy

- Extend the existing portable desktop architecture to a real Windows stock target.
- A Windows target is observable capability, not successful compilation alone.
- Windows command/modifier/input/DPI behavior must be explicit.
- Windows-specific specialization may be added below the existing contract only when a concrete observable deficit earns it.

### Native image-resource contract

This is an explicit architecture seam.

The implementation should prefer the smallest extension of existing image-node/texture-handle/DrawList semantics that permits:

- native creation or registration of a multi-megapixel image resource;
- guest reference through a bounded opaque handle/id;
- clipping/z-order/transforms required by PicoView;
- explicit replacement/retirement/release;
- no dependence on QuickJS GC;
- no dependence on the existing JS `uploadTexture` ≤512 constraint.

A new DrawList opcode or independent compositor-surface architecture is not assumed. It requires evidence that existing resource semantics cannot express the need.

### Decode

- WIC is the first decoder substrate.
- JPEG source-transform/native scaling behavior is measured.
- PNG and non-native-scale formats are treated honestly as different workloads.
- `libjpeg-turbo` is benchmark-gated and absent unless WIC materially misses a defining SLO.

### Current Image First

Folder discovery, BrowseSession, broad metadata, thumbnails, and prefetch do not gate first presentation.

### Resource generations

Every expensive image request belongs to a generation.

Obsolete work may finish unavoidable lower-level calls but cannot publish current state afterward and should skip later avoidable expensive work.

Large resources must be reclaimable independently of QuickJS GC.

### BrowseSession

BrowseSession is Product Phase B work.

Before its compact immutable index is authoritative, Previous/Next is disabled and no speculative enumeration order is exposed.

Natural ordering follows the PRD's **PicoView Natural Order v1** oracle:

- ASCII decimal runs compare by arbitrary-length numeric magnitude without integer parsing;
- equal numeric value sorts fewer leading zeroes first;
- non-digit spans use ordinal case-insensitive Windows semantics;
- deterministic case-sensitive ordinal/full-path tie-breaks resolve equality.

Directory membership uses a cheap extension/capability filter, not decode/sniff of every candidate.

### External changes

Activation, F5, candidate open/navigation, and source-dependent actions revalidate.

Filesystem notifications are optional dirty hints, not database truth.

### Process model

One window/process is the baseline until measured otherwise.

A tiny activation router must be earned by five-process evidence and may not introduce a resident service, shared decode cache, or generalized IPC framework.

### Packaging/privacy

- unpackaged native executable + small installer is the baseline;
- optional portable ZIP;
- no resident updater/service;
- no telemetry;
- no startup network dependency.

---

## Testing Decisions

### Measurement authority

All gate measurements follow `docs/BENCHMARK.md`.

Important consequences:

- optimized release builds provide PASS numbers;
- P50/P95 latency gates use at least 50 measured iterations;
- all reports record exact PicoView/PocketJS SHAs and machine/OS/GPU identity;
- first-useful-image architecture latency uses present submission as an explicitly named proxy, not a false display-photon claim;
- memory reports both Working Set - Private and Private Bytes;
- static idle CPU follows the normalized 30 s observation definition.

### Highest useful seams

Architecture tests prefer:

```text
Windows activation/input
 → real PocketJS guest
 → native image request/resource
 → composition
 → present submission / observable state
```

Avoid replacing the defining seam with mocks that cannot prove ownership, cancellation, presentation, or budget behavior.

### Architecture-specific proof sequence

1. Windows guest presents through the extended desktop architecture.
2. Native-generated ≥4K image composes without JS pixel transport.
3. WIC JPEG enters that resource seam.
4. Large JPEG Fit/100%/zoom/pan uses the same seam.
5. Rapid synthetic requests prove generation retirement without requiring BrowseSession.
6. Minimal cross-DPI movement proves coordinate/presentation correctness.
7. Physical-cost campaign produces startup/package/memory/idle/five-process evidence.
8. GATE-A decides whether Product Phase B may begin.

### Product tests after GATE-A

- Open/drag/drop/association converge on one image-open seam;
- BrowseSession ordering oracle fixtures;
- external mutation/F5 behavior;
- Handle filesystem effects;
- format/animation bounds;
- UI Automation inspection;
- final GATE-B reruns architecture budgets on the release candidate.

---

## Execution Graph

GitHub issues are the executable tracker.

### Architecture Phase A

```text
#13 [ARCH-A0] baseline + benchmark freeze       READY
  ↓
#2  [ARCH-A1] Windows stock-target extension
  ↓
#14 [ARCH-A2] native large-image composition seam
  ↓
#3  [ARCH-A3] first JPEG / WIC
  ├────────→ #4  [ARCH-A4] large JPEG / Fit / zoom / pan
  ├────────→ #7  [ARCH-A5] cancellation / hostile bounds
  └────────→ #15 [ARCH-A7] physical footprint
                 
#4 ─────────→ #9  [ARCH-A6] Per-Monitor DPI proof

#4 + #7 + #9 + #15
        ↓
#11 [GATE-A] architecture admission
```

Only #13 is initially `ready-for-agent`. Downstream issues are `blocked` until their declared blockers complete.

### Product Phase B

After GATE-A PASS:

```text
#11
 ├──→ #5  Open / refresh / source lifetime
 ├──→ #6  BrowseSession
 ├──→ #10 format / animation
 └──→ #17 viewer chrome / Inspect

#5 + #6 ─→ #8 Handle
#5 + #6 + #9 + #11 ─→ #16 UI Automation

#5 + #6 + #8 + #10 + #16 + #17
                ↓
#18 [GATE-B] release candidate verification
```

Tracker labels are execution state, not decoration:

- `ready-for-agent` = no unresolved declared blocker;
- `blocked` = do not start implementation;
- `spec` = parent authority issue, not execution work.

---

## Out of Scope

- replacing PocketJS with another runtime/UI framework;
- building a second complete Windows UI framework in PicoView;
- Filmstrip;
- Slideshow;
- Print;
- Share;
- destructive image editing/save;
- photo library/albums/favorites/tags/search database;
- cloud/account system;
- plugin runtime;
- batch file management/conversion;
- RAW development;
- professional proofing/true HDR;
- multi-page TIFF navigation;
- guaranteed animated WebP/AVIF;
- broad bundled multimedia stack;
- resident updater/service/telemetry;
- shared cross-process decoded cache;
- generalized filesystem identity database;
- generalized cross-platform accessibility framework.

---

## Authority

When sources conflict:

1. `docs/PRD/PicoView-PRD-v0.5.md`
2. this SPEC
3. `docs/BENCHMARK.md`
4. accepted ADRs
5. `CONTEXT.md`
6. current ticket

`docs/POCKETJS-BASELINE.md` freezes external source identity for the architecture campaign.

A ticket can narrow an execution slice but cannot silently expand product authority or weaken a physical gate.

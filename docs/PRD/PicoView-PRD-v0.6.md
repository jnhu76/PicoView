# PicoView PRD v0.6 — Viewer Semantics Reset

Status: **CURRENT PRODUCT AUTHORITY**  
Date: **2026-09-16**  
Target: **Windows 11 local image viewer**

This document defines **user-visible product meaning only**. Architecture, graphics-backend policy, ownership, lifetime, and physical data movement are owned by accepted ADRs and `docs/ARCHITECTURE.md`.

---

## 1. Product thesis

PicoView is a fast, small, focused local image viewer.

Its job is:

> **Open an image, show it faithfully, let the user inspect it, move to neighboring images, and perform a narrow set of current-file actions.**

PicoView is not an editor, photo library, cloud product, DAM, media database, batch processor, or general file manager.

The product optimizes for:

- **directness** — opening an image goes straight to that image;
- **fidelity** — viewing does not silently rewrite image meaning;
- **responsiveness** — current-image interaction outranks background work;
- **smallness** — a viewer does not grow into a platform;
- **truthfulness** — unavailable capabilities are reported as unavailable rather than simulated dishonestly.

---

## 2. Core product semantics

### 2.1 Open

PicoView can open a local image from normal Windows entry points such as file association, command line, Open File, and drag/drop.

A supplied file is the initial product truth. A gallery/home screen must not intercept a valid direct-open request.

### 2.2 Current Item

Exactly one logical item is current in a window.

CurrentItem represents product publication state, not decoder implementation, graphics-resource internals, zoom implementation, or directory enumeration machinery.

CurrentItem may expose bounded product facts such as source identity, request generation, loading/ready/error state, logical display dimensions, published opaque image-resource identity, view capabilities, last-good publication where applicable, and bounded product error.

### 2.3 Previous / Next

Previous and Next navigate the authoritative BrowseSession ordering.

PicoView must not invent exact neighbors from a partial directory enumeration. Until authoritative ordering is ready, navigation may be temporarily unavailable while the current image remains usable.

### 2.4 Fit

Fit shows the complete logical image inside the available image viewport while preserving aspect ratio.

Fit is presentation state. It does not rewrite the source image.

### 2.5 Actual Size / 100%

Actual Size means truthful native image-pixel inspection according to the coordinate semantics defined by the Architecture authority.

A reduced proxy must never masquerade as source-resolution 100%.

If true full-resolution inspection is unavailable, PicoView exposes that capability honestly.

### 2.6 Zoom / Pan

Zoom changes image-to-view scale; Pan changes image position inside the viewport.

They are presentation operations and do not imply source mutation.

Pointer-anchored zoom should preserve the image-space point under the pointer where practical.

### 2.7 Rotate View / Flip View

Rotate and Flip are non-destructive view operations by default.

They do not change the file on disk. A future explicit save/edit feature would be a separate product authority and is not implied by view rotation.

### 2.8 Reset View

Reset View clears user-controlled transient view state. It does **not** discard intrinsic source interpretation such as EXIF orientation.

### 2.9 Fullscreen

Fullscreen changes presentation/chrome state only. It does not change image identity or source data.

### 2.10 Refresh / Revalidate

Refresh revalidates the current source and attempts to publish a replacement.

When refreshing an already-visible item, PicoView retains the last-good image until a replacement is ready or product policy explicitly requires otherwise. Navigating to a corrupt new item may publish an error item instead. These are intentionally different product cases.

### 2.11 Product shell chrome and minimum client

PicoView is a Windows desktop photo viewer with icon-first chrome: a command toolbar, an image viewport, and a status readout. Zoom percentage lives in the **status bar** (Fit / Zoom In / Zoom Out move that number). Toolbar `1:1` means Actual Size / 100%, not an aspect ratio.

Current product command bar:

```text
Open · Zoom Out · Zoom In · Fit · 1:1 · Rotate · Flip Horizontal · Flip Vertical
```

Previous / Next are viewport-edge and keyboard navigation, not toolbar commands. Refresh (R / F5) remains a recovery path, not chrome vocabulary.

**Product chrome allocation is Product authority.** Shell row heights define the image-viewport extent that Fit / center / pan consume as input geometry. Changing those heights is a Product chrome decision. It does **not** transfer ownership of ViewTransform equations, Fit algorithm, pan clamp, or orientation math (those remain Architecture / PR #61 authority). Formulas may be unchanged while the viewport boundary changes.

**Minimum usable logical client size: `384 × 240`.**

- The 8-command fixed toolbar needs ≈356 logical width (8×36 hit targets + group gaps + padding). Product closes that contract at **384** with margin.
- Height keeps toolbar+status chrome plus a non-zero image viewport.
- PocketJS `windows-app` capability floor is `240×180`. That is a **platform capability**, not a PicoView usability promise. PicoView does not claim a fully usable command bar at 240 logical width.
- Native host must enforce the product min (`with_min_inner_size` + resize clamp) so UI-required width and host-allowed width cannot silently disagree.

---

## 3. Source fidelity

PicoView's default behavior is non-destructive viewing.

The product must not silently:

- reduce source resolution and then claim full-resolution viewing;
- discard meaningful bit depth, gamut, alpha, or HDR semantics merely for implementation convenience;
- bake Fit/Zoom/Pan/Rotate/Flip into a replacement source image;
- modify the file while performing view-only commands.

Display adaptation is allowed when required by the target display. For example, showing HDR content on an SDR output may require tone mapping. That is presentation adaptation, not mutation of source truth.

---

## 4. Image-format support semantics

Format support is a **product capability decision**, not a side effect of whichever codecs happen to be installed.

For each advertised format, PicoView states the supported capability dimensions that matter for that format, including as applicable:

- still-image decode;
- orientation;
- alpha/transparency;
- color profile / color description;
- source precision / bit depth;
- HDR behavior;
- animation;
- frame/page behavior;
- corrupt/truncated input behavior;
- full-resolution / large-image behavior.

A decoder being technically able to open a file is insufficient to advertise complete product support.

Exact format promises belong in the current format matrix/spec and may expand over time without changing architecture boundaries.

---

## 5. Rendering product requirement

PicoView's rendering goal is:

> **Present the logical image as faithfully as the active rendering path and display allow, without hidden destructive conversion.**

The product does not expose graphics implementation details as normal user concepts.

User-visible image semantics remain coherent when the rendering implementation changes, although performance and advanced-display capability may differ.

For common static images, Fit, Zoom, Pan, Rotate View, Flip View, window resize, DPI changes, or ordinary UI redraw must behave like view operations rather than image reloads.

### Basic fallback requirement

PicoView's release architecture should provide a **basic software-rendered fallback** for systems where no viable hardware-GPU path exists.

The fallback must preserve truthful basic viewing semantics. It may expose reduced performance or advanced-display capability. The product must not claim this fallback is available until the implementation actually exists and is verified.

The exact GPU/adapter/backend selection policy is **not Product authority**; it belongs to Architecture.

---

## 6. HDR and advanced color

PicoView architecture must preserve the semantics needed for HDR, wide-gamut, and advanced-color images even when a release does not yet advertise every advanced-display capability.

No ordinary SDR implementation may permanently define all images as `RGBA8 sRGB` at the product boundary.

When an advanced output path is officially supported, PicoView should preserve sufficient source precision and present it faithfully. When the active output cannot reproduce the source directly, display adaptation must remain truthful about the source.

---

## 7. BrowseSession

BrowseSession owns deterministic neighbor ordering and lightweight eligibility for the current source context.

It must not become a media library or require decoding every file merely to discover navigation candidates.

Current-image work outranks directory discovery, metadata enrichment, and future prefetch.

---

## 8. Handle

PicoView may provide a narrow set of actions on the current file, such as copy/reveal/rename/delete/open-with according to the active product spec.

It does not grow multi-select, batch conversion, or general file-manager authority from these commands.

---

## 9. Error truthfulness

Product-visible failures are bounded and meaningful.

The UI should distinguish product-relevant classes such as unsupported image/capability, corrupt image, source unavailable, full-resolution unavailable, display/rendering unavailable, and generic open failure.

Decoder errors, resource-admission errors, and presentation errors must not all be mislabeled as “decode failed.”

---

## 10. Non-goals

Unless separately admitted by a future product decision, PicoView does not become:

- a destructive image editor;
- RAW development software;
- a photo catalog/database;
- a cloud/account product;
- a batch converter;
- a plugin runtime;
- a background indexing service;
- a broad multimedia player;
- a general file manager.

---

## 11. Success criteria

The product architecture is serving PicoView when:

1. users can reason about commands as view/navigation commands rather than hidden image rewrites;
2. unavailable full-resolution/advanced-display/format capability is reported truthfully;
3. the current image stays the highest-priority product object;
4. product behavior stays coherent across rendering implementations;
5. the implementation remains small enough that a local image viewer does not behave like a platform.

---

## 12. Related authority

- Architecture decisions: `docs/ADR/`
- Detailed architecture/program semantics: `docs/ARCHITECTURE.md`
- Executable product/architecture contract: `docs/SPEC/PicoView-v1.1.md`
- Current operational state: `CONTEXT.md`
- Agent rules: `AGENTS.md`

Superseded authority is archived under `docs/history/authority-reset-20260915/` and does not override current Product or Architecture authority.
# PicoView PRD v0.6 — Viewer Semantics Reset

Status: **CURRENT PRODUCT AUTHORITY**  
Date: **2026-09-15**  
Target: **Windows 11 local image viewer**

This document replaces `PicoView-PRD-v0.5.md` as current product authority. v0.5 remains historical context only.

Architecture authority lives in accepted ADRs and `docs/ARCHITECTURE.md`. This PRD defines user-visible product meaning; it does not redefine graphics/resource internals.

---

## 1. Product thesis

PicoView is a fast, small, focused local image viewer.

Its job is simple:

> **Open an image, show it faithfully, let the user inspect it, move to neighboring images, and perform a narrow set of current-file actions.**

PicoView is not an editor, photo library, cloud product, DAM, media database, batch processor, or general file manager.

The product optimizes for:

- **directness** — opening an image goes straight to that image;
- **fidelity** — the viewer does not silently rewrite image meaning merely to make rendering easier;
- **responsiveness** — current-image interaction outranks background work;
- **smallness** — no second application runtime or broad media stack without explicit evidence;
- **truthfulness** — unavailable capabilities are reported as unavailable rather than simulated dishonestly.

---

## 2. Core product semantics

### 2.1 Open

PicoView can open a local image from normal Windows entry points such as file association, command line, Open File, and drag/drop.

A supplied file is the initial product truth. A gallery/home screen must not intercept a valid direct-open request.

### 2.2 Current Item

Exactly one logical item is current in a window.

CurrentItem represents product publication state, not decoder implementation, GPU resource internals, zoom implementation, or directory enumeration machinery.

CurrentItem may expose bounded product facts such as:

- source identity;
- request generation;
- loading / ready / error status;
- logical display dimensions;
- published image-resource identity;
- view capabilities;
- last-good publication when applicable;
- bounded product error.

### 2.3 Previous / Next

Previous and Next navigate the authoritative BrowseSession ordering.

PicoView must not invent exact neighbors from a partial directory enumeration. Until authoritative ordering is ready, navigation may be temporarily unavailable while the current image remains usable.

### 2.4 Fit

Fit shows the complete logical image inside the available image viewport while preserving aspect ratio.

Fit is presentation state. It does not rewrite the source image.

### 2.5 Actual Size / 100%

Actual Size means truthful native image-pixel inspection, subject to the capabilities of the admitted image resource and current rendering backend.

If true full-resolution inspection is unavailable, PicoView must expose that capability honestly. A reduced proxy must never masquerade as source-resolution 100%.

### 2.6 Zoom / Pan

Zoom changes image-to-view scale; Pan changes image position inside the viewport.

They are presentation operations and do not imply source mutation.

Pointer-anchored zoom should preserve the image-space point under the pointer where practical.

### 2.7 Rotate View / Flip View

Rotate and Flip are non-destructive view operations by default.

They do not change the file on disk. A future explicit save/edit feature would be a separate product authority and is not implied by view rotation.

### 2.8 Reset View

Reset View returns transient view state to the product-defined default without reinterpreting source semantics.

### 2.9 Fullscreen

Fullscreen changes presentation/chrome state only. It does not change image identity or source data.

### 2.10 Refresh / Revalidate

Refresh revalidates the current source and attempts to publish a replacement.

When refreshing an already-visible item, PicoView may retain the last-good image until a replacement succeeds. Navigating to a corrupt new item may instead publish an error item. These are intentionally different product cases.

---

## 3. Source fidelity

PicoView’s default behavior is non-destructive viewing.

The product must not silently:

- reduce source resolution and then claim full-resolution viewing;
- discard meaningful bit depth, gamut or HDR semantics merely for implementation convenience;
- bake Fit/Zoom/Pan/Rotate/Flip into a replacement source image;
- modify the file while performing view-only commands.

Display adaptation is allowed when required by the target display. For example, showing HDR content on an SDR display may require tone mapping. That is a presentation adaptation, not a mutation of source truth.

---

## 4. Image-format support semantics

Format support is a **product capability decision**, not a side effect of whichever codecs happen to be installed.

For each advertised format, PicoView must state the supported capability dimensions that matter for that format, including as applicable:

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

Exact format promises belong in the current format matrix/spec and may expand over time without changing the architecture boundary.

---

## 5. Rendering product requirement

PicoView’s rendering goal is:

> **Present the logical image as faithfully as the current backend and display allow, without hidden destructive conversion.**

The product does not require users to know whether the active path is iGPU, discrete GPU, or software fallback.

User-visible behavior must remain semantically consistent across backends, although performance and advanced-display capability may differ.

For common static images, view-state changes such as Fit, Zoom, Pan, Rotate View, Flip View, window resize, or ordinary UI redraw must feel like view operations rather than image reloads.

---

## 6. GPU / fallback product policy

PicoView is **GPU-first, not GPU-required**.

Normal Windows rendering should use an eligible GPU path when available. The graphics runtime should prefer a surface-compatible low-power adapter where appropriate, normally the integrated GPU on hybrid systems, then use a compatible discrete GPU when necessary.

If no usable GPU path exists, a software renderer is the final product fallback where correct viewing can still be provided.

The product must not sacrifice correct presentation merely to force a particular GPU class.

---

## 7. HDR and advanced color

PicoView architecture must preserve the semantics needed for HDR/wide-gamut/advanced-color images.

Product support may be delivered incrementally, but no ordinary SDR implementation is allowed to permanently define all images as “RGBA8 sRGB” at the product boundary.

When HDR output is available and officially supported, PicoView should preserve sufficient source precision and use an HDR-capable presentation path.

When the active display path is SDR, HDR content requires truthful display adaptation rather than pretending the source itself is SDR.

---

## 8. BrowseSession

BrowseSession owns deterministic neighbor ordering and lightweight eligibility for the current source context.

It must not become a media library or require decoding every file merely to discover navigation candidates.

Current-image work outranks directory discovery, metadata enrichment and future prefetch.

---

## 9. Handle

PicoView may provide a narrow set of actions on the current file, such as copy/reveal/rename/delete/open-with according to the active product spec.

It does not grow multi-select, batch conversion or general file-manager authority from these commands.

---

## 10. Error truthfulness

Product-visible failures are bounded and meaningful.

The UI should distinguish product-relevant classes such as:

- unsupported image / unsupported capability;
- corrupt image;
- source unavailable;
- full-resolution unavailable / image too large for the current path;
- display/rendering unavailable;
- generic open failure.

Decoder errors, resource-admission errors and presentation errors must not all be mislabeled as “decode failed.”

---

## 11. Non-goals

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

## 12. Success criteria

The product architecture is serving PicoView when all of the following remain true:

1. the user can reason about commands as view/navigation commands rather than hidden image rewrites;
2. adding a new decoder does not require changing TSX or generic rendering semantics;
3. adding a new graphics backend does not require changing PicoView image-format semantics;
4. unavailable full-resolution/HDR/format capability is reported truthfully;
5. the current image stays the highest-priority product object;
6. the implementation remains small enough that a local image viewer does not behave like a platform.

---

## 13. Related authority

- Architecture decisions: `docs/ADR/`
- Detailed architecture/program semantics: `docs/ARCHITECTURE.md`
- Executable product/architecture contract: `docs/SPEC/PicoView-v1.1.md`
- Current operational state: `CONTEXT.md`
- Agent rules: `AGENTS.md`

Older PRD/SPEC versions are historical documents and do not override the current Product or Architecture authorities.
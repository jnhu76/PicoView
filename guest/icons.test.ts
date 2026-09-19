import { test, expect } from "bun:test";
import {
  ICON_ASSETS,
  REMIX_ICON_PROVENANCE,
  TOOL_SEMANTIC,
  TOOLBAR_COMMANDS,
  toolSemantic,
  iconLabel,
} from "./icons.ts";
import { SHELL_CHROME } from "./shell_layout.ts";

test("toolbar icon assets exist as string literals for the compiler", () => {
  for (const name of Object.keys(ICON_ASSETS) as (keyof typeof ICON_ASSETS)[]) {
    expect(ICON_ASSETS[name].endsWith(".svg")).toBe(true);
    expect(ICON_ASSETS[name].endsWith("-line.svg")).toBe(true);
  }
});

test("Remix semantic mapping uses official line-family filenames", () => {
  expect(ICON_ASSETS.open).toBe("folder-open-line.svg");
  expect(ICON_ASSETS.previous).toBe("arrow-left-s-line.svg");
  expect(ICON_ASSETS.next).toBe("arrow-right-s-line.svg");
  expect(ICON_ASSETS.zoomOut).toBe("zoom-out-line.svg");
  expect(ICON_ASSETS.zoomIn).toBe("zoom-in-line.svg");
  expect(ICON_ASSETS.fit).toBe("aspect-ratio-line.svg");
  expect(ICON_ASSETS.rotate).toBe("clockwise-line.svg");
  expect(ICON_ASSETS.flipH).toBe("flip-horizontal-line.svg");
  expect(ICON_ASSETS.flipV).toBe("flip-vertical-line.svg");
  expect(ICON_ASSETS.empty).toBe("image-line.svg");
  expect(ICON_ASSETS.warn).toBe("error-warning-line.svg");
});

test("Remix provenance revision is recorded", () => {
  expect(REMIX_ICON_PROVENANCE.repository).toBe("Remix-Design/RemixIcon");
  expect(REMIX_ICON_PROVENANCE.revision).toBe(
    "9fb7967c0a4c09910161192bde99efd3df09f5eb",
  );
  expect(REMIX_ICON_PROVENANCE.license).toBe("Remix Icon License v1.0");
  expect(REMIX_ICON_PROVENANCE.family).toBe("line");
  expect(REMIX_ICON_PROVENANCE.designViewBox).toBe("0 0 24 24");
});

test("PR62 semantic names stay full product strings", () => {
  expect(toolSemantic("open")).toBe("Open");
  expect(toolSemantic("zoomOut")).toBe("Zoom Out");
  expect(toolSemantic("zoomIn")).toBe("Zoom In");
  expect(toolSemantic("fit")).toBe("Fit");
  expect(toolSemantic("oneToOne")).toBe("1:1");
  expect(toolSemantic("rotate")).toBe("Rotate");
  expect(toolSemantic("flipH")).toBe("Flip Horizontal");
  expect(toolSemantic("flipV")).toBe("Flip Vertical");
  expect(toolSemantic("previous")).toBe("Previous");
  expect(toolSemantic("next")).toBe("Next");
  expect(iconLabel("open")).toBe("Open");
});

test("toolbar command vocabulary includes separate FlipH and FlipV", () => {
  expect([...TOOLBAR_COMMANDS]).toEqual([
    "open",
    "zoomOut",
    "zoomIn",
    "fit",
    "oneToOne",
    "rotate",
    "flipH",
    "flipV",
  ]);
  const semanticKeys = Object.keys(TOOL_SEMANTIC).sort();
  expect(semanticKeys).toEqual(
    [
      "open",
      "zoomOut",
      "zoomIn",
      "fit",
      "oneToOne",
      "rotate",
      "flipH",
      "flipV",
      "previous",
      "next",
    ].sort(),
  );
});

test("obsolete single Reflect / dual-rotate toolbar semantics are gone", () => {
  const banned = [
    "rotateLeft",
    "rotateRight",
    "reflect",
    "reset",
    "refresh",
    "mirror",
    "Mirror",
  ] as const;
  for (const key of banned) {
    expect(key in TOOL_SEMANTIC).toBe(false);
    expect(key in ICON_ASSETS).toBe(false);
  }
});

test("toolbar chrome excludes Previous/Next; edge nav owns them", () => {
  expect(SHELL_CHROME.toolbarH).toBe(44);
  expect(SHELL_CHROME.titleH).toBe(0);
  expect(SHELL_CHROME.statusH).toBe(24);
  for (const key of TOOLBAR_COMMANDS) {
    expect(key === "previous" || key === "next").toBe(false);
  }
});

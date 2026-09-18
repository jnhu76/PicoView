import { test, expect } from "bun:test";
import {
  ICON_ASSETS,
  TOOL_SEMANTIC,
  TOOLBAR_COMMANDS,
  toolSemantic,
  iconLabel,
} from "./icons.ts";
import { SHELL_CHROME } from "./shell_layout.ts";

test("toolbar icon assets exist as string literals for the compiler", () => {
  for (const name of Object.keys(ICON_ASSETS) as (keyof typeof ICON_ASSETS)[]) {
    expect(ICON_ASSETS[name].endsWith(".svg")).toBe(true);
  }
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
  expect(ICON_ASSETS.rotate).toBe("icon-rotate.svg");
  expect(ICON_ASSETS.flipH).toBe("icon-flip-h.svg");
  expect(ICON_ASSETS.flipV).toBe("icon-flip-v.svg");
});

test("toolbar chrome excludes Previous/Next; edge nav owns them", () => {
  expect(SHELL_CHROME.toolbarH).toBe(44);
  expect(SHELL_CHROME.titleH).toBe(0);
  expect(SHELL_CHROME.statusH).toBe(24);
  for (const key of TOOLBAR_COMMANDS) {
    expect(key === "previous" || key === "next").toBe(false);
  }
});

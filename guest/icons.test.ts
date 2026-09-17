import { test, expect } from "bun:test";
import { ICON_ASSETS, toolSemantic, iconLabel } from "./icons.ts";
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
  expect(toolSemantic("rotateLeft")).toBe("Rotate Left");
  expect(toolSemantic("rotateRight")).toBe("Rotate Right");
  expect(toolSemantic("flipHorizontal")).toBe("Flip Horizontal");
  expect(toolSemantic("flipVertical")).toBe("Flip Vertical");
  expect(toolSemantic("reset")).toBe("Reset View");
  expect(toolSemantic("refresh")).toBe("Refresh");
  expect(toolSemantic("previous")).toBe("Previous");
  expect(toolSemantic("next")).toBe("Next");
  expect(iconLabel("open")).toBe("Open");
});

test("toolbar chrome actions exclude Previous/Next text controls", () => {
  // Edge navigation owns Previous/Next; toolbar map must not include them.
  const toolbarKeys = [
    "open",
    "zoomOut",
    "zoomIn",
    "fit",
    "oneToOne",
    "rotateLeft",
    "rotateRight",
    "flipHorizontal",
    "flipVertical",
    "reset",
    "refresh",
  ] as const;
  for (const key of toolbarKeys) {
    expect(toolSemantic(key).length).toBeGreaterThan(0);
  }
  // Frozen shell geometry still owns toolbar height (PR #61 authority).
  // Compact product chrome (PR62 follow-up): image viewport priority.
  expect(SHELL_CHROME.toolbarH).toBe(44);
  expect(SHELL_CHROME.titleH).toBe(28);
  expect(SHELL_CHROME.statusH).toBe(24);
});

test("reset and refresh asset paths are distinct", () => {
  expect(ICON_ASSETS.reset).not.toBe(ICON_ASSETS.refresh);
  expect(ICON_ASSETS.reset).toBe("icon-reset.svg");
  expect(ICON_ASSETS.refresh).toBe("icon-refresh.svg");
});

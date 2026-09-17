import { test, expect } from "bun:test";
import { ICON_ASSETS, iconLabel } from "./icons.ts";

test("toolbar icon assets exist as string literals for the compiler", () => {
  for (const name of Object.keys(ICON_ASSETS) as (keyof typeof ICON_ASSETS)[]) {
    expect(ICON_ASSETS[name].endsWith(".svg")).toBe(true);
  }
  expect(iconLabel("open")).toBe("Open");
  expect(iconLabel("oneToOne")).toBe("1:1");
  expect(iconLabel("zoomOut")).toBe("Zoom-");
  expect(iconLabel("previous")).toBe("Prev");
});

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const guestDir = join(import.meta.dir);

function readSvg(name: string): string {
  return readFileSync(join(guestDir, name), "utf8");
}

/** Toolbar command artwork — source grid 20×20, display w-5 h-5. */
const TOOLBAR_COMMAND_SVGS = [
  "icon-open.svg",
  "icon-zoom-out.svg",
  "icon-zoom-in.svg",
  "icon-fit.svg",
  "icon-rotate.svg",
  "icon-flip-h.svg",
  "icon-flip-v.svg",
];

/** Viewport-edge chevrons only (not toolbar commands). */
const EDGE_SVGS = ["icon-prev.svg", "icon-next.svg"];

const ALL_CHROME_SVGS = [...TOOLBAR_COMMAND_SVGS, ...EDGE_SVGS];

test("obsolete single-reflect / dual-rotate / reset / refresh icons are gone", () => {
  for (const gone of [
    "icon-rotate-left.svg",
    "icon-rotate-right.svg",
    "icon-reflect.svg",
    "icon-reset.svg",
    "icon-refresh.svg",
  ]) {
    let exists = true;
    try {
      readFileSync(join(guestDir, gone), "utf8");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  }
});

test("chrome SVGs use 20-unit design grid on a pow2 texture root", () => {
  for (const file of ALL_CHROME_SVGS) {
    const svg = readSvg(file);
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
    expect(svg).toContain('viewBox="0 0 20 20"');
  }
});

test("command icons use high-contrast neutral fill, not secondary gray", () => {
  for (const file of ALL_CHROME_SVGS) {
    const svg = readSvg(file);
    expect(svg.includes("#A0A0A0")).toBe(false);
    expect(svg.includes("#a0a0a0")).toBe(false);
  }
  const open = readSvg("icon-open.svg");
  expect(open).toContain("#E6E6E6");
  const flipH = readSvg("icon-flip-h.svg");
  const flipV = readSvg("icon-flip-v.svg");
  expect(flipH).toContain("#E6E6E6");
  expect(flipV).toContain("#E6E6E6");
  expect(flipH).toContain("#F2F2F2");
  expect(flipV).toContain("#F2F2F2");
});

test("SVGs stay inside the PocketJS baker subset", () => {
  for (const file of ALL_CHROME_SVGS) {
    const svg = readSvg(file);
    expect(svg.includes("stroke=")).toBe(false);
    expect(svg.includes("<filter")).toBe(false);
    expect(svg.includes("<mask")).toBe(false);
    expect(svg.includes("<linearGradient")).toBe(false);
  }
});

test("rotate is image+quarter-turn, not a circular refresh glyph", () => {
  const rotate = readSvg("icon-rotate.svg");
  expect(rotate).toContain('rect x="2" y="7"');
  expect(rotate).toContain('rect x="8" y="2"');
  expect(rotate).toContain("M11 6 L18 6");
  expect(rotate.includes("C")).toBe(false);
});

test("flipH is vertical axis + L/R shapes", () => {
  const flipH = readSvg("icon-flip-h.svg");
  expect(flipH).toContain('rect x="9" y="2" width="2" height="16"');
  expect(flipH).toContain("M2 3 L8 10 L2 17 Z");
  expect(flipH).toContain("M18 3 L12 10 L18 17 Z");
});

test("flipV is horizontal axis + T/B shapes", () => {
  const flipV = readSvg("icon-flip-v.svg");
  expect(flipV).toContain('rect x="2" y="9" width="16" height="2"');
  expect(flipV).toContain("M3 2 L10 8 L17 2 Z");
  expect(flipV).toContain("M3 18 L10 12 L17 18 Z");
});

test("flipH and flipV sources are distinct", () => {
  const flipH = readSvg("icon-flip-h.svg");
  const flipV = readSvg("icon-flip-v.svg");
  expect(flipH).not.toBe(flipV);
});

test("images.json marks chrome icons for bilinear sampling", () => {
  const meta = JSON.parse(readFileSync(join(guestDir, "images.json"), "utf8"));
  for (const file of ALL_CHROME_SVGS) {
    expect(meta[file]?.linear).toBe(true);
  }
});

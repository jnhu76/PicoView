import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const guestDir = join(import.meta.dir);

function readSvg(name: string): string {
  return readFileSync(join(guestDir, name), "utf8");
}

const TOOLBAR_SVGS = [
  "icon-open.svg",
  "icon-zoom-out.svg",
  "icon-zoom-in.svg",
  "icon-fit.svg",
  "icon-rotate-left.svg",
  "icon-rotate-right.svg",
  "icon-flip-h.svg",
  "icon-flip-v.svg",
  "icon-reset.svg",
  "icon-refresh.svg",
  "icon-prev.svg",
  "icon-next.svg",
];

test("every chrome SVG is a 16×16 design grid", () => {
  for (const file of TOOLBAR_SVGS) {
    const svg = readSvg(file);
    expect(svg).toContain('width="16"');
    expect(svg).toContain('height="16"');
    expect(svg).toContain('viewBox="0 0 16 16"');
  }
});

test("SVGs stay inside the PocketJS baker subset", () => {
  for (const file of TOOLBAR_SVGS) {
    const svg = readSvg(file);
    // No elliptical arcs, no stroke paints, no filters/masks.
    expect(svg.includes("stroke=")).toBe(false);
    expect(/\sA\s|a\s+\d/.test(svg)).toBe(false);
    expect(svg.includes("<filter")).toBe(false);
    expect(svg.includes("<mask")).toBe(false);
    expect(svg.includes("<linearGradient")).toBe(false);
  }
});

test("reset and refresh remain visually different sources", () => {
  const reset = readSvg("icon-reset.svg");
  const refresh = readSvg("icon-refresh.svg");
  const fit = readSvg("icon-fit.svg");
  expect(reset).not.toBe(refresh);
  expect(reset).not.toBe(fit);
  // Reset is recenter target (corners + center crosshair) — not download,
  // not circular reload, not fit corners alone.
  expect(reset).toContain("rect x=\"7\" y=\"7\"");
  expect(reset.includes("12.5")).toBe(false);
  expect(refresh.toLowerCase()).toContain("path");
});

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

test("chrome SVGs use 20-unit design grid on a pow2 texture root", () => {
  // Pak textures must be pow2; design stays 20×20 via viewBox; display is w-5 h-5.
  for (const file of TOOLBAR_SVGS) {
    const svg = readSvg(file);
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
    expect(svg).toContain('viewBox="0 0 20 20"');
  }
});

test("command icons use high-contrast neutral fill, not secondary gray", () => {
  for (const file of TOOLBAR_SVGS) {
    const svg = readSvg(file);
    expect(svg.includes("#A0A0A0")).toBe(false);
    expect(svg.includes("#a0a0a0")).toBe(false);
  }
  const open = readSvg("icon-open.svg");
  expect(open).toContain("#E6E6E6");
});

test("SVGs stay inside the PocketJS baker subset", () => {
  for (const file of TOOLBAR_SVGS) {
    const svg = readSvg(file);
    expect(svg.includes("stroke=")).toBe(false);
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
  expect(reset).toContain('rect x="8" y="8"');
  expect(refresh.toLowerCase()).toContain("path");
});

test("images.json marks toolbar icons for bilinear sampling", () => {
  const meta = JSON.parse(readFileSync(join(guestDir, "images.json"), "utf8"));
  for (const file of TOOLBAR_SVGS) {
    expect(meta[file]?.linear).toBe(true);
  }
});

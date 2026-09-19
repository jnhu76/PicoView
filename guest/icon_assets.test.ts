import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ICON_ASSETS } from "./icons.ts";
import { bakeSvg } from "../third_party/pocketjs/framework/compiler/bake-svg.ts";

const guestDir = join(import.meta.dir);

function readSvg(name: string): string {
  return readFileSync(join(guestDir, name), "utf8");
}

/** Remix line-family functional UI assets (toolbars, edge, empty/error). */
const ALL_CHROME_SVGS = [
  "folder-open-line.svg",
  "arrow-left-s-line.svg",
  "arrow-right-s-line.svg",
  "zoom-out-line.svg",
  "zoom-in-line.svg",
  "aspect-ratio-line.svg",
  "clockwise-line.svg",
  "flip-horizontal-line.svg",
  "flip-vertical-line.svg",
  "image-line.svg",
  "error-warning-line.svg",
];

const LEGACY_HAND_AUTHORED = [
  "icon-open.svg",
  "icon-prev.svg",
  "icon-next.svg",
  "icon-zoom-out.svg",
  "icon-zoom-in.svg",
  "icon-fit.svg",
  "icon-rotate.svg",
  "icon-flip-h.svg",
  "icon-flip-v.svg",
  "icon-empty.svg",
  "icon-warn.svg",
  "icon-rotate-left.svg",
  "icon-rotate-right.svg",
  "icon-reflect.svg",
  "icon-reset.svg",
  "icon-refresh.svg",
];

function exists(name: string): boolean {
  try {
    readFileSync(join(guestDir, name), "utf8");
    return true;
  } catch {
    return false;
  }
}

test("every ICON_ASSETS entry resolves to a vendored Remix SVG", () => {
  for (const file of Object.values(ICON_ASSETS)) {
    expect(exists(file)).toBe(true);
    const svg = readSvg(file);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
  }
});

test("old hand-authored icon-*.svg assets are gone", () => {
  for (const gone of LEGACY_HAND_AUTHORED) {
    expect(exists(gone)).toBe(false);
  }
});

test("Remix sources keep 24×24 design grid on a pow2 texture root", () => {
  for (const file of ALL_CHROME_SVGS) {
    const svg = readSvg(file);
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
    expect(svg).toContain('viewBox="0 0 24 24"');
  }
});

test("command icons use PicoView neutral fill, not currentColor / secondary gray", () => {
  for (const file of ALL_CHROME_SVGS) {
    const svg = readSvg(file);
    expect(svg.includes("currentColor")).toBe(false);
    expect(svg.includes("#A0A0A0")).toBe(false);
    expect(svg.includes("#a0a0a0")).toBe(false);
    expect(svg).toContain("#E6E6E6");
  }
});

test("SVGs stay inside the actually supported PocketJS baker subset", () => {
  for (const file of ALL_CHROME_SVGS) {
    const svg = readSvg(file);
    // baker: filled path/circle/rect only
    expect(svg.includes("stroke=")).toBe(false);
    expect(svg.includes("<filter")).toBe(false);
    expect(svg.includes("<mask")).toBe(false);
    expect(svg.includes("<linearGradient")).toBe(false);
    expect(svg.includes("<g ")).toBe(false);
    expect(svg.includes("<g>")).toBe(false);
    expect(svg.includes("transform=")).toBe(false);
    // elliptical arcs are a loud baker error
    expect(/\s[Aa]\s*[-\d.]/.test(svg)).toBe(false);
  }
});

test("each Remix SVG bakes via PocketJS bakeSvg to a pow2 texture", () => {
  for (const file of ALL_CHROME_SVGS) {
    const img = bakeSvg(readSvg(file));
    expect(img.width).toBe(32);
    expect(img.height).toBe(32);
    // Must actually paint some coverage
    let painted = 0;
    for (let i = 3; i < img.rgba.length; i += 4) {
      if (img.rgba[i] > 0) painted++;
    }
    expect(painted).toBeGreaterThan(0);
  }
});

test("Rotate maps to clockwise-line; Zoom In/Out map to zoom-*-line", () => {
  expect(ICON_ASSETS.rotate).toBe("clockwise-line.svg");
  expect(ICON_ASSETS.zoomIn).toBe("zoom-in-line.svg");
  expect(ICON_ASSETS.zoomOut).toBe("zoom-out-line.svg");
  // clockwise-line must not be a hand-drawn "image+quarter-turn" mock
  const rotate = readSvg("clockwise-line.svg");
  expect(rotate).not.toContain('rect x="2" y="7"');
  expect(rotate).toContain('viewBox="0 0 24 24"');
});

test("flipH and flipV remain distinct official Remix assets", () => {
  const flipH = readSvg("flip-horizontal-line.svg");
  const flipV = readSvg("flip-vertical-line.svg");
  expect(ICON_ASSETS.flipH).toBe("flip-horizontal-line.svg");
  expect(ICON_ASSETS.flipV).toBe("flip-vertical-line.svg");
  expect(flipH).not.toBe(flipV);
  // Official Remix geometry uses path d, not hand-authored triangle rects
  expect(flipH).toContain("<path");
  expect(flipV).toContain("<path");
});

test("images.json marks Remix chrome icons for bilinear sampling", () => {
  const meta = JSON.parse(readFileSync(join(guestDir, "images.json"), "utf8"));
  for (const file of ALL_CHROME_SVGS) {
    expect(meta[file]?.linear).toBe(true);
  }
  for (const gone of LEGACY_HAND_AUTHORED) {
    expect(meta[gone]).toBeUndefined();
  }
});

test("remix-icons.json provenance matches ICON_ASSETS filenames", () => {
  const prov = JSON.parse(
    readFileSync(join(guestDir, "remix-icons.json"), "utf8"),
  );
  expect(prov.repository).toBe("Remix-Design/RemixIcon");
  expect(prov.revision).toBe(
    "9fb7967c0a4c09910161192bde99efd3df09f5eb",
  );
  expect(prov.license).toBe("Remix Icon License v1.0");
  for (const key of Object.keys(ICON_ASSETS) as (keyof typeof ICON_ASSETS)[]) {
    expect(prov.mapping[key]?.file).toBe(ICON_ASSETS[key]);
  }
});

test("no whole-library vendor: only the 11 selected Remix SVGs ship", () => {
  const files = ALL_CHROME_SVGS.filter(exists);
  expect(files.length).toBe(11);
  // Sanity: remix-icons.json is the only provenance sidecar, not an npm dump
  expect(exists("package.json")).toBe(false);
  expect(exists("remixicon.css")).toBe(false);
  expect(exists("fonts")).toBe(false);
});

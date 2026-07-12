// Authored 16x16 overlay sprites shared by every skin's build script, so each
// death effect has its own graphics regardless of how the rest of the skin is
// produced (drawn parody art or CHR-extracted ROM art). Kept in one module so
// the grids/palettes are defined once (no duplication across the builders).

import { encodeRgbaPng } from "./png-codec.mjs";

// Render a pixel grid (one char per pixel, indexing the palette) to a PNG.
export function drawGridSprite(grid, paletteMap, width = 16, height = 16) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = grid[y] ?? "";
    for (let x = 0; x < width; x += 1) {
      const rgba = paletteMap[row[x] ?? "."] ?? paletteMap["."];
      const offset = (y * width + x) * 4;
      pixels[offset] = rgba[0];
      pixels[offset + 1] = rgba[1];
      pixels[offset + 2] = rgba[2];
      pixels[offset + 3] = rgba[3];
    }
  }
  return encodeRgbaPng({ width, height, pixels });
}

// Dead eyes: two X-ed-out eyes over a transparent field, laid over the face on
// a drowning float-up or a spike impaling so the body reads as unmistakably
// dead. Aligned to the player face's eye rows/columns.
export const deadEyesPalette = { ".": [0, 0, 0, 0], X: [24, 20, 18, 255] };
export const deadEyesGrid = [
  "................",
  "................",
  "................",
  "................",
  "....X.X..X.X....",
  ".....X....X.....",
  "....X.X..X.X....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

// Smoke puff: a soft grey cloud that peels off the burning body and rises.
export const smokePalette = {
  ".": [0, 0, 0, 0],
  o: [206, 206, 206, 210],
  O: [150, 150, 150, 200],
};
export const smokeGrid = [
  "................",
  "................",
  "................",
  "......oo........",
  ".....oOOo.......",
  "....oOOOOo......",
  "...oOOOOOOo.....",
  "...oOOOOOOo.....",
  "....oOOOOo......",
  ".....oOOo.......",
  "......oo........",
  "................",
  "................",
  "................",
  "................",
  "................",
];

// Flame tongue: a licking fire that clings to a burning body. Skin-agnostic
// (fire is orange/yellow regardless of the character), so it is shared like the
// smoke puff. Yellow-white core (Y), orange body (r), deep-red edges (R).
export const flamePalette = {
  ".": [0, 0, 0, 0],
  R: [176, 42, 16, 235],
  r: [240, 122, 28, 240],
  Y: [255, 224, 120, 255],
};
export const flameGrid = [
  "................",
  ".......R........",
  "......RrR.......",
  "......rrR.......",
  ".....RrrrR......",
  ".....RrYrR......",
  "....RrrYrrR.....",
  "....RrYYYrR.....",
  "...RrrYYYrrR....",
  "...RrYYYYYrR....",
  "..RrrYYYYYrrR...",
  "..RrrYYYYYrrR...",
  "..RrRrYYYrRrR...",
  "...RRRrrrRRR....",
  "....RR.R.RR.....",
  "................",
];

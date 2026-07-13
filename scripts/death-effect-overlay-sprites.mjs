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

// Dismemberment body parts: dedicated, recognizable severed-part sprites (not
// crops of the body), thrown as projectiles when the body explodes. Skin-agnostic
// generic humanoid colours: skin (s), hair (H), tunic (T), shoe (d), dark (e),
// and a raw-red stump (R). The head's eyes come from the X-ed-eyes overlay.
export const bodyPartPalette = {
  ".": [0, 0, 0, 0],
  s: [226, 184, 140, 255],
  H: [92, 60, 36, 255],
  T: [120, 150, 96, 255],
  d: [96, 64, 40, 255],
  e: [34, 28, 28, 255],
  R: [186, 44, 40, 255],
};
export const partHeadGrid = [
  "................",
  "................",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HssssssH....",
  "....ssssssss....",
  "....ssssssss....",
  "....ssssssss....",
  ".....ssssss.....",
  ".....ssssss.....",
  "......RRRR......",
  "......RRRR......",
  "................",
  "................",
  "................",
  "................",
];
export const partTorsoGrid = [
  "................",
  "................",
  "......RRRR......",
  ".....TTTTTT.....",
  "....TTTTTTTT....",
  "...RTTTTTTTTR...",
  "...RTTTTTTTTR...",
  "....TTTTTTTT....",
  "....TTTTTTTT....",
  "....TTTTTTTT....",
  "....TT..TT......",
  "....RR..RR......",
  "................",
  "................",
  "................",
  "................",
];
export const partArmGrid = [
  "................",
  "................",
  ".....RR.........",
  ".....TTs........",
  "....TTss........",
  ".....sss........",
  "......sss.......",
  ".......sss......",
  "........ss......",
  "........ss......",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];
export const partLegGrid = [
  "................",
  "................",
  ".....RR.........",
  "....Tss.........",
  "....Tss.........",
  ".....ss.........",
  ".....ss.........",
  ".....ss.........",
  ".....ss.........",
  "....ddd.........",
  "...dddd.........",
  "................",
  "................",
  "................",
  "................",
  "................",
];

// Explosion burst: a bright starburst flash at the moment of dismemberment.
// White-hot core (W), yellow (Y), orange (r), deep-red rays (R). Skin-agnostic.
export const burstPalette = {
  ".": [0, 0, 0, 0],
  R: [206, 62, 20, 255],
  r: [246, 140, 40, 255],
  Y: [255, 226, 120, 255],
  W: [255, 252, 236, 255],
};
export const burstGrid = [
  "......R..R......",
  "...R..rYYr..R...",
  "....r.rYYr.r....",
  "R....rYYYYr....R",
  ".r..rYYYYYYr..r.",
  "..rrYYWWWWYYrr..",
  "..rYYWWWWWWYYr..",
  "RrYYWWWWWWWWYYrR",
  "RrYYWWWWWWWWYYrR",
  "..rYYWWWWWWYYr..",
  "..rrYYWWWWYYrr..",
  ".r..rYYYYYYr..r.",
  "R....rYYYYr....R",
  "....r.rYYr.r....",
  "...R..rYYr..R...",
  "......R..R......",
];

// Burned husk: a charred, hunched ragdoll of the body left after burning.
// Charcoal (k), a lighter ash edge (K), and a few glowing embers (e).
export const huskPalette = {
  ".": [0, 0, 0, 0],
  k: [40, 36, 40, 255],
  K: [78, 70, 74, 255],
  e: [210, 90, 30, 255],
};
export const huskGrid = [
  "................",
  ".....kkkkk......",
  "....kKkkkKk.....",
  "....kkkekkk.....",
  "....kkkkkkk.....",
  "...KkkkkkkkK....",
  "..kkkkeekkkkk...",
  "..kkkkkkkkkkk...",
  "..Kkkkkkkkkk....",
  "...kkkekkkk.....",
  "...kkkkkkkk.....",
  "...kk.kkk.k.....",
  "..kk...kk..K....",
  "..k....kk..k....",
  "................",
  "................",
];

#!/usr/bin/env node
// Producer for an original "shabby castaway" parody asset set (Decision 0019).
// Every sprite here is authored from scratch as a pixel grid in this file — it is
// original expression, not derived from any third party's art. It writes an
// `authored` content set (descriptor + PNGs) into the ignored cache so it can be
// composed with any map set and selected as an alternative skin.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { encodeRgbaPng } from "./png-codec.mjs";
import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const spriteSize = 16;
const defaultOutDir = resolve(userLevelCacheRoot, "asset-sets/castaway-parody");

// Original palette for the marooned castaway: unkempt dark hair, weathered skin,
// stubble, a faded patched tunic, bare feet. No cap, no brand colors.
const palette = {
  ".": [0, 0, 0, 0],
  H: [86, 58, 34, 255],
  s: [214, 170, 128, 255],
  d: [170, 130, 92, 255],
  b: [120, 110, 100, 255],
  T: [126, 138, 92, 255],
  p: [156, 92, 60, 255],
  e: [24, 20, 18, 255],
  w: [245, 245, 245, 255],
  // Merman tail: teal scales (F) and a lighter aqua fin/fluke (f), used only by
  // the water-world swim frames.
  F: [46, 155, 148, 255],
  f: [140, 210, 195, 255],
};

// Original grumpy "grumbler" enemy palette: mossy body, pale belly, big eyes.
const enemyPalette = {
  ".": [0, 0, 0, 0],
  G: [96, 120, 70, 255],
  L: [188, 204, 150, 255],
  e: [24, 20, 18, 255],
  w: [245, 245, 245, 255],
  m: [70, 46, 40, 255],
};

// Water enemies: a red "nipper" fish (cheep-cheep stand-in) and a cream "drifter"
// squid (blooper stand-in).
const waterEnemyPalette = {
  ".": [0, 0, 0, 0],
  R: [214, 74, 60, 255], // fish red body
  r: [242, 150, 96, 255], // fish orange fins
  C: [236, 226, 208, 255], // squid cream mantle
  c: [198, 182, 160, 255], // squid tentacle/shadow
  e: [24, 20, 18, 255], // pupil
  w: [245, 245, 245, 255], // eye white
  y: [250, 214, 120, 255], // fish lip
};

// Nipper fish: a round body facing right, tail fins to the left, eye + lips.
const castawayFish = [
  "................",
  "................",
  "................",
  ".........RRR....",
  ".r......RRRRRR..",
  "rr....RRRRRRRw..",
  ".rr..RRRRRReRw..",
  "rrrrRRRRRRRRRy..",
  ".rr..RRRRRReRw..",
  ".r....RRRRRRw...",
  ".......RRRRR....",
  ".........RR.....",
  "................",
  "................",
  "................",
  "................",
];

// Drifter squid: a domed cream mantle with two eyes and dangling tentacles.
const castawaySquid = [
  "................",
  ".....CCCC.......",
  "....CCCCCC......",
  "...CCCCCCCC.....",
  "..CCCCCCCCCC....",
  "..CweCCCCweC....",
  "..CCCCCCCCCC....",
  "..CCCCCCCCCC....",
  "...CCCCCCCC.....",
  "...cCcCCcCc.....",
  "..c.c.cc.c.c....",
  ".c..c.c.c..c....",
  "................",
  "................",
  "................",
  "................",
];

// 16x16 grids. Each string is one row; each char indexes the palette.
const castawayIdle = [
  "................",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HssssssH....",
  "....sHsssHss....",
  "....seswwses....",
  "....ssswwsss....",
  "....ssbbbsss....",
  "...TTTTTTTTT....",
  "..TTpTTTTpTT....",
  "..TTTTTTTTTT....",
  "..sTTTTTTTTs....",
  "..ss.TTTT.ss....",
  ".....dd.dd......",
  "....ddd.ddd.....",
  "................",
];

const castawayWalk1 = [
  "................",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HssssssH....",
  "....sHsssHss....",
  "....seswwses....",
  "....ssswwsss....",
  "....ssbbbsss....",
  "...TTTTTTTTT....",
  "..TTpTTTTpTT....",
  "..TTTTTTTTTT....",
  "...sTTTTTTs.....",
  "....ssTTTTss....",
  "...dd....dd.....",
  "..ddd......dd...",
  "................",
];

const castawayWalk2 = [
  "................",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HssssssH....",
  "....sHsssHss....",
  "....seswwses....",
  "....ssswwsss....",
  "....ssbbbsss....",
  "...TTTTTTTTT....",
  "..TTpTTTTpTT....",
  "..TTTTTTTTTT....",
  "..sTTTTTTTTs....",
  "...ssTTTTss.....",
  "....dd..dd......",
  "....ddd.ddd.....",
  "................",
];

const castawayJump = [
  "................",
  "..s..HHHHHH..s..",
  ".ss.HHHHHHHH.ss.",
  "..s.HssssssH.s..",
  "....sHsssHss....",
  "....seswwses....",
  "....ssswwsss....",
  "....ssbbbsss....",
  "..sTTTTTTTTTs...",
  ".ssTpTTTTpTTss..",
  "..TTTTTTTTTT....",
  "...sTTTTTTs.....",
  "..dd......dd....",
  ".ddd........dd..",
  "................",
  "................",
];

// Climbing: hands raised gripping the vine above, body compact, feet planted —
// distinct from the arms-down idle used when standing.
const castawayClimb = [
  "................",
  "...s.HHHHHH.s...",
  "..ss.HHHHHH.ss..",
  "...s.HssssssH...",
  "....sHsssHss....",
  "....seswwses....",
  "....ssswwsss....",
  "....ssbbbsss....",
  "...TTTTTTTTT....",
  "..sTTpTTTTpTs...",
  "...TTTTTTTTT....",
  "...sTTTTTTs.....",
  "....dTTTTd......",
  "...dd....dd.....",
  "................",
  "................",
];

// Swimming: a merman seen in profile, facing right (boot-scene mirrors him to
// face his travel direction). A human castaway top — profile head, one stroking
// arm — flows into a teal fish tail curving down-and-back, ending in an aqua
// fluke. Two frames (arm + tail up vs forward + tail down) animate a swim stroke
// only while he is moving; the diagonal pose reads as gliding forward like a
// fish rather than jumping.
const castawaySwimA = [
  "................",
  "................",
  "................",
  "...........HHH..",
  "..........HHsss.",
  ".f.......HHssss.",
  "ff.....TTTsswe..",
  "fFF..sTTTTTTsb..",
  "fFFFTTTTTTTss...",
  "ffFFTTTTTTs.....",
  ".fF...TTs.......",
  "................",
  "................",
  "................",
  "................",
  "................",
];
const castawaySwimB = [
  "................",
  "................",
  "................",
  "...........HHH..",
  "..........HHsss.",
  "........HHssss..",
  "f......TTTsswe..",
  "fF...TTTTTTTsb..",
  "fFFFTTTTTTTssss.",
  "fFFFTTTTTTss....",
  ".fF..TTs........",
  "................",
  "................",
  "................",
  "................",
  "................",
];

// The pained head-hold pose: hands up to the head, eyes screwed shut, "ouch".
const castawayOuch = [
  "...s......s.....",
  "..ss.HHHHHH.ss..",
  "..s.HHHHHHHH.s..",
  "....HssssssH....",
  "....sHHssHHs....",
  "....s.b..b.s....",
  "....sswwwss.....",
  "....ssbbbss.....",
  "...TTTTTTTTT....",
  "..TTpTTTTpTT....",
  "..TTTTTTTTTT....",
  "..sTTTTTTTTs....",
  "..ss.TTTT.ss....",
  ".....dd.dd......",
  "....ddd.ddd.....",
  "................",
];

const grumblerIdle = [
  "................",
  "....GGGGGGGG....",
  "...GGGGGGGGGG...",
  "..GGwwGGGGwwG...",
  "..GGweGGGGweG...",
  "..GGGGGGGGGGG...",
  "..GGGmmmmGGGG...",
  "..LGGGGGGGGGL...",
  "..LLLGGGGLLLL...",
  "...LLLLLLLLLL...",
  "....LLLLLLLL....",
  "....GG....GG....",
  "...GGG....GGG...",
  "..mmm......mmm..",
  "................",
  "................",
];

// The exaggerated squashed reaction: bulging eyes, flattened body, splayed feet.
const grumblerSquashed = [
  "................",
  "................",
  "................",
  "..w..GGGGGG..w..",
  ".wew.GGGGGG.wew.",
  ".wew GGGGGG wew.",
  "..w.GGGGGGGG.w..",
  "..GGGmmmmmmGGG..",
  ".GGGGGGGGGGGGGG.",
  ".LLLLLLLLLLLLLL.",
  "..LLLLLLLLLLLL..",
  ".mmm..mmmm..mmm.",
  "................",
  "................",
  "................",
  "................",
];

function drawSprite(grid, paletteMap) {
  const pixels = new Uint8Array(spriteSize * spriteSize * 4);

  for (let y = 0; y < spriteSize; y += 1) {
    const row = grid[y] ?? "";
    for (let x = 0; x < spriteSize; x += 1) {
      const key = row[x] ?? ".";
      const rgba = paletteMap[key] ?? paletteMap["."];
      const offset = (y * spriteSize + x) * 4;
      pixels[offset] = rgba[0];
      pixels[offset + 1] = rgba[1];
      pixels[offset + 2] = rgba[2];
      pixels[offset + 3] = rgba[3];
    }
  }

  return encodeRgbaPng({ width: spriteSize, height: spriteSize, pixels });
}

// Original "shabby island" tile palette: sand, driftwood, bamboo, rope, shell.
const tilePalette = {
  ".": [0, 0, 0, 0],
  s: [226, 202, 148, 255],
  S: [206, 180, 122, 255],
  w: [150, 106, 66, 255],
  W: [110, 74, 44, 255],
  g: [96, 150, 80, 255],
  G: [70, 116, 58, 255],
  r: [214, 196, 160, 255],
  y: [242, 208, 96, 255],
  k: [40, 32, 24, 255],
};

const tileCannonTop = [
  "....kkkkkkkk....",
  "...kWWWWWWWWk...",
  "...kWkkkkkkWk...",
  "...kWkkkkkkWk...",
  "...kWWWWWWWWk...",
  "..kkWWWWWWWWkk..",
  "..kWWWWWWWWWWk..",
  "..kWWWWWWWWWWk..",
  "..kWWWWWWWWWWk..",
  "..kWWWWWWWWWWk..",
  "..kWWWWWWWWWWk..",
  "..kkWWWWWWWWkk..",
  "...kkkkkkkkkk...",
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
];
const tileCannonBottom = [
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
];
const tileSpringTop = [
  "................",
  "................",
  "..yyyyyyyyyyyy..",
  "..yssssssssssy..",
  "..yyyyyyyyyyyy..",
  "....g......g....",
  "...gGgggggGg....",
  "....g......g....",
  "...gGgggggGg....",
  "....g......g....",
  "...gGgggggGg....",
  "....g......g....",
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
  "................",
];
const tileSpringBottom = [
  "................",
  "....g......g....",
  "...gGgggggGg....",
  "....g......g....",
  "...gGgggggGg....",
  "....g......g....",
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
  "..wWWWWWWWWWWw..",
  "..wWWWWWWWWWWw..",
  "..wwwwwwwwwwww..",
];

function repeatRow(row) {
  return Array.from({ length: spriteSize }, () => row);
}

// Sand ground: speckled tan.
const tileSand = [
  "ssssssssssssssss",
  "sSsssSssssSsssSs",
  "ssssssssssssssss",
  "sssSssssSssssSss",
  ...repeatRow("ssssssssssssssss").slice(0, 12),
];

// Driftwood plank (breakable / brick): stacked boards.
const tilePlank = [
  "wwwwwwwwwwwwwwww",
  "wWWWWWWWWWWWWWWk",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wWWWWWWWWWWWWWWk",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wWWWWWWWWWWWWWWk",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wWWWWWWWWWWWWWWk",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wWWWWWWWWWWWWWWk",
  "wwwwwwwwwwwwwwww",
  "kkkkkkkkkkkkkkkk",
];

// Crate (question block): boarded box with an X brace.
const tileCrate = [
  "wwwwwwwwwwwwwwww",
  "wkWWWWWWWWWWWWkw",
  "wWkWWWWWWWWWWkWw",
  "wWWkWWWWWWWWkWWw",
  "wWWWkWWWWWWkWWWw",
  "wWWWWkWWWWkWWWWw",
  "wWWWWWkWWkWWWWWw",
  "wWWWWWWkkWWWWWWw",
  "wWWWWWWkkWWWWWWw",
  "wWWWWWkWWkWWWWWw",
  "wWWWWkWWWWkWWWWw",
  "wWWWkWWWWWWkWWWw",
  "wWWkWWWWWWWWkWWw",
  "wWkWWWWWWWWWWkWw",
  "wkWWWWWWWWWWWWkw",
  "wwwwwwwwwwwwwwww",
];

// Spent crate (used question block): a flat dark, pried-open box with corner
// rivets and no X brace, so a bumped block reads as emptied.
const tileCrateUsed = [
  "kkkkkkkkkkkkkkkk",
  "kWWWWWWWWWWWWWWk",
  "kWwWWWWWWWWWWwWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kWwWWWWWWWWWWwWk",
  "kWWWWWWWWWWWWWWk",
  "kWWWWWWWWWWWWWWk",
  "kkkkkkkkkkkkkkkk",
];

// Bamboo stalk (pipe): vertical green segments.
const tileBamboo = [
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
  "kkkkkkkkkkkkkkkk",
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
  "kkkkkkkkkkkkkkkk",
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
  "kkkkkkkkkkkkkkkk",
  "gGGggggggggGGGgg",
  "gGGggggggggGGGgg",
];

// Rope pole (flagpole): thin vertical rope.
const tilePole = [
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
  ".......rr.......",
];

// Shell token (coin): a curled shell.
const tileShell = [
  "................",
  ".....kkkkkk.....",
  "...kkyyyyyykk...",
  "..kyyyyyyyyyyk..",
  ".kyyyywyyyyyyyk.",
  ".kyyyywwyyyyyyk.",
  ".kyyywwwyyyyyyk.",
  ".kyywwwwwyyyyyk.",
  ".kyywwwwwyyyyyk.",
  ".kyyywwwyyyyyyk.",
  ".kyyyywwyyyyyyk.",
  ".kyyyyyyyyyyyyk.",
  "..kyyyyyyyyyyk..",
  "...kkyyyyyykk...",
  ".....kkkkkk.....",
  "................",
];

// Sharpened driftwood stakes — the island's hazard tile.
const tileSpikes = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "..w...w...w...w.",
  "..w...w...w...w.",
  ".swW.swW.swW.swW",
  ".swW.swW.swW.swW",
  "swwWswwWswwWswwW",
  "swwWswwWswwWswwW",
  "swwWswwWswwWswwW",
  "swwWswwWswwWswwW",
  "swwWswwWswwWswwW",
  "kkkkkkkkkkkkkkkk",
  "kkkkkkkkkkkkkkkk",
];

// Original "castaway ration" power-up: a weathered spotted mushroom the
// marooned hero eats to toughen up. Authored from scratch (not derived art).
const powerUpPalette = {
  ".": [0, 0, 0, 0],
  c: [150, 96, 58, 255],
  C: [110, 68, 38, 255],
  s: [222, 198, 150, 255],
  w: [245, 240, 225, 255],
  e: [24, 20, 18, 255],
};
const castawayPowerUp = [
  "................",
  ".....eeeee......",
  "...eecccccee....",
  "..eccCcccCcce...",
  ".ecccssccccce...",
  ".eccssscccCcce..",
  ".ecccccccsscce..",
  ".eCcccssccccce..",
  "..eeCcccccCee...",
  "....eesssee.....",
  ".....ewwwe......",
  ".....ewwwe......",
  ".....ewwwe......",
  "....ewwwwwe.....",
  ".....eeeee......",
  "................",
];

// Red-shelled snapper variant (ledge-staying koopas and the red winged one).
const redEnemyPalette = {
  ".": [0, 0, 0, 0],
  G: [168, 66, 48, 255],
  L: [232, 160, 120, 255],
  e: [24, 20, 18, 255],
  w: [245, 245, 245, 255],
  m: [70, 46, 40, 255],
};

// Spike-backed "urchin" (spiny stand-in): dark body under a thorny crown.
const spinyPalette = {
  ".": [0, 0, 0, 0],
  G: [104, 58, 96, 255],
  L: [210, 120, 170, 255],
  e: [24, 20, 18, 255],
  w: [245, 245, 245, 255],
  m: [46, 26, 44, 255],
};

// The big castle "warden" (Bowser stand-in): charcoal hide, ember accents.
const wardenPalette = {
  ".": [0, 0, 0, 0],
  G: [58, 54, 60, 255],
  L: [214, 118, 52, 255],
  e: [24, 20, 18, 255],
  w: [245, 240, 220, 255],
  m: [120, 34, 26, 255],
};

// A dark finned slug for the bullet volleys.
const bulletPalette = {
  ".": [0, 0, 0, 0],
  G: [40, 40, 46, 255],
  L: [90, 90, 100, 255],
  e: [24, 20, 18, 255],
  w: [245, 245, 245, 255],
};

const bulletSlug = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "....GGGGGGGG....",
  "..GGGGGGGGGGLL..",
  ".GweGGGGGGGGLLL.",
  ".GweGGGGGGGGLLL.",
  "..GGGGGGGGGGLL..",
  "....GGGGGGGG....",
  "................",
  "................",
  "................",
  "................",
  "................",
];

// The warden reuses the snapper body doubled to fill the frame.
function scaleGridDouble(grid) {
  const scaled = [];
  for (const row of grid.slice(0, 8)) {
    const wide = [...row.slice(0, 8)].map((cell) => cell + cell).join("");
    scaled.push(wide, wide);
  }
  return scaled;
}

// Original "snapper" — the shabby castaway's turtle. Green mossy shell, cross
// stubborn eyes; becomes a bare shell when jumped on.
const snapperWalk = [
  "................",
  "....eeee........",
  "...eGGGGe.......",
  "..eGwGwGe.......",
  "..eGeGeGe.......",
  "..eeGGGee.......",
  ".eeeeeeeeee.....",
  "eGLLGLLGLLGe....",
  "eGLLGLLGLLGe....",
  "eGLLGLLGLLGe....",
  "eGLLGLLGLLGe....",
  ".eeeeeeeeee.....",
  "...L....L.......",
  "..LL....LL......",
  "..mm....mm......",
  "................",
];
const snapperShell = [
  "................",
  "................",
  "................",
  "................",
  "....eeeeee......",
  "..eeGLLGLGee....",
  ".eGLGLLGLLGe....",
  ".eGLLGLGLLGe....",
  ".eGLLGLLGLGe....",
  ".eGLGLLGLLGe....",
  ".eeGLLGLGGee....",
  "..eeeeeeeee.....",
  "................",
  "................",
  "................",
  "................",
];

// Original "washed-up star" invincibility token and green 1-up ration.
const starPalette = {
  ".": [0, 0, 0, 0],
  y: [242, 208, 96, 255],
  o: [206, 150, 40, 255],
  e: [24, 20, 18, 255],
};
const castawayStar = [
  "................",
  ".......e........",
  "......eye e.....",
  "......eye.......",
  "..e..eyyye..e...",
  "..eyyyyyyyyye...",
  "...eyyyyyyye....",
  "....eyyyyye.....",
  "....eyyoyye.....",
  "...eyye.eyye....",
  "..eyye...eyye...",
  ".eye.......eye..",
  "..e.........e...",
  "................",
  "................",
  "................",
];
const greenRationPalette = {
  ".": [0, 0, 0, 0],
  c: [70, 140, 70, 255],
  C: [44, 96, 44, 255],
  s: [222, 198, 150, 255],
  w: [245, 240, 225, 255],
  e: [24, 20, 18, 255],
};

function spriteEntry(fileName) {
  return {
    source: { kind: "url", url: fileName },
    frame: { x: 0, y: 0, width: spriteSize, height: spriteSize },
  };
}

// A walking enemy needs left/right walk frames; this skin reuses one body frame.
function walkingEnemySprite(fileName) {
  return {
    ...spriteEntry(fileName),
    stateSprites: {
      "walk-left": spriteEntry(fileName),
      "walk-right": spriteEntry(fileName),
    },
  };
}

// A shelled (koopa-like) enemy also needs idle/left/right shell frames.
function shelledEnemySprite(walkFileName, shellFileName) {
  return {
    ...walkingEnemySprite(walkFileName),
    stateSprites: {
      "walk-left": spriteEntry(walkFileName),
      "walk-right": spriteEntry(walkFileName),
      "shell-idle": spriteEntry(shellFileName),
      "shell-left": spriteEntry(shellFileName),
      "shell-right": spriteEntry(shellFileName),
    },
  };
}

function playerStateSprites() {
  // Map every engine player state key to an authored frame; powered/recovering
  // reuse the small frames (this parody skin has one body size), and fall/run
  // reuse jump/walk.
  const small = {
    "small-idle": "castaway-idle.png",
    "small-walk": "castaway-walk-1.png",
    "small-run": "castaway-walk-2.png",
    "small-jump": "castaway-jump.png",
    "small-fall": "castaway-jump.png",
    "small-climb": "castaway-climb.png",
    "small-swim": "castaway-swim.png",
    "small-swim-2": "castaway-swim-2.png",
  };
  const stateSprites = {};
  for (const [key, file] of Object.entries(small)) {
    stateSprites[key] = spriteEntry(file);
    stateSprites[key.replace("small-", "powered-")] = spriteEntry(file);
    stateSprites[key.replace("small-", "recovering-")] = spriteEntry(file);
  }
  return stateSprites;
}

async function main() {
  const outDir = assertUserLevelCachePath(
    readOption("--out-dir") ?? defaultOutDir,
    "--out-dir",
  );
  await mkdir(outDir, { recursive: true });

  const sprites = [
    ["castaway-idle.png", castawayIdle, palette],
    ["castaway-walk-1.png", castawayWalk1, palette],
    ["castaway-walk-2.png", castawayWalk2, palette],
    ["castaway-jump.png", castawayJump, palette],
    ["castaway-climb.png", castawayClimb, palette],
    ["castaway-swim.png", castawaySwimA, palette],
    ["castaway-swim-2.png", castawaySwimB, palette],
    ["castaway-ouch.png", castawayOuch, palette],
    ["grumbler-idle.png", grumblerIdle, enemyPalette],
    ["grumbler-squashed.png", grumblerSquashed, enemyPalette],
    ["tile-sand.png", tileSand, tilePalette],
    ["tile-plank.png", tilePlank, tilePalette],
    ["tile-crate.png", tileCrate, tilePalette],
    ["tile-crate-used.png", tileCrateUsed, tilePalette],
    ["tile-bamboo.png", tileBamboo, tilePalette],
    ["tile-pole.png", tilePole, tilePalette],
    ["tile-shell.png", tileShell, tilePalette],
    ["tile-spikes.png", tileSpikes, tilePalette],
    ["tile-cannon-top.png", tileCannonTop, tilePalette],
    ["tile-cannon-bottom.png", tileCannonBottom, tilePalette],
    ["tile-spring-top.png", tileSpringTop, tilePalette],
    ["tile-spring-bottom.png", tileSpringBottom, tilePalette],
    ["castaway-powerup.png", castawayPowerUp, powerUpPalette],
    ["castaway-1up.png", castawayPowerUp, greenRationPalette],
    ["castaway-star.png", castawayStar, starPalette],
    ["snapper-walk.png", snapperWalk, enemyPalette],
    ["snapper-shell.png", snapperShell, enemyPalette],
    ["snapper-red-walk.png", snapperWalk, redEnemyPalette],
    ["snapper-red-shell.png", snapperShell, redEnemyPalette],
    ["urchin-walk.png", snapperShell, spinyPalette],
    ["warden.png", scaleGridDouble(snapperWalk), wardenPalette],
    ["bullet-slug.png", bulletSlug, bulletPalette],
    ["castaway-fish.png", castawayFish, waterEnemyPalette],
    ["castaway-squid.png", castawaySquid, waterEnemyPalette],
  ];
  for (const [fileName, grid, paletteMap] of sprites) {
    await writeFile(resolve(outDir, fileName), drawSprite(grid, paletteMap));
  }

  // Map the VGLC SMB 1-1 tile ids to the original island tiles.
  const tileSprites = {
    ground: spriteEntry("tile-sand.png"),
    "breakable-block": spriteEntry("tile-plank.png"),
    "multi-coin-brick": spriteEntry("tile-plank.png"),
    "extra-life-brick": spriteEntry("tile-plank.png"),
    "star-block": spriteEntry("tile-crate.png"),
    "beanstalk-block": spriteEntry("tile-crate.png"),
    "empty-question-block": spriteEntry("tile-crate-used.png"),
    "full-question-block-coin": spriteEntry("tile-crate.png"),
    "full-question-block-power-up": spriteEntry("tile-crate.png"),
    "pipe-top-left": spriteEntry("tile-bamboo.png"),
    "pipe-top-right": spriteEntry("tile-bamboo.png"),
    "pipe-left": spriteEntry("tile-bamboo.png"),
    "pipe-right": spriteEntry("tile-bamboo.png"),
    flagpole: spriteEntry("tile-pole.png"),
    "castle-bridge": spriteEntry("tile-plank.png"),
    "power-up-brick": spriteEntry("tile-plank.png"),
    "cannon-top": spriteEntry("tile-cannon-top.png"),
    "cannon-bottom": spriteEntry("tile-cannon-bottom.png"),
    "spring-top": spriteEntry("tile-spring-top.png"),
    "spring-bottom": spriteEntry("tile-spring-bottom.png"),
    coin: spriteEntry("tile-shell.png"),
    // Level-editor tile ids, so editor-made levels render with this skin too.
    grass: spriteEntry("tile-sand.png"),
    stone: spriteEntry("tile-crate.png"),
    thorn: spriteEntry("tile-spikes.png"),
    gate: spriteEntry("tile-pole.png"),
  };

  const descriptor = {
    id: "castaway-parody",
    title: "Shabby Castaway (parody)",
    origin: "authored",
    reactionStyle: "exaggerated",
    reactionSprites: {
      "player-head-bonk": spriteEntry("castaway-ouch.png"),
      "enemy-stomped": spriteEntry("grumbler-squashed.png"),
    },
    playerSprite: {
      ...spriteEntry("castaway-idle.png"),
      stateSprites: playerStateSprites(),
    },
    actorSprites: {
      // Every vglc-smb actor id the importer can emit is covered so any decoded
      // SMB level renders fully (no vector fallbacks), reusing this skin's art.
      "vglc-smb-enemy": walkingEnemySprite("grumbler-idle.png"),
      "vglc-smb-throwing-enemy": walkingEnemySprite("grumbler-idle.png"),
      "vglc-smb-aerial-throwing-enemy": walkingEnemySprite("grumbler-idle.png"),
      "vglc-smb-koopa": shelledEnemySprite(
        "snapper-walk.png",
        "snapper-shell.png",
      ),
      "vglc-smb-parakoopa": shelledEnemySprite(
        "snapper-walk.png",
        "snapper-shell.png",
      ),
      "vglc-smb-turtle": shelledEnemySprite(
        "snapper-walk.png",
        "snapper-shell.png",
      ),
      "vglc-smb-cheep": walkingEnemySprite("castaway-fish.png"),
      "vglc-smb-blooper": walkingEnemySprite("castaway-squid.png"),
      "vglc-smb-koopa-red": shelledEnemySprite(
        "snapper-red-walk.png",
        "snapper-red-shell.png",
      ),
      "vglc-smb-parakoopa-red": shelledEnemySprite(
        "snapper-red-walk.png",
        "snapper-red-shell.png",
      ),
      "vglc-smb-parakoopa-hopper": shelledEnemySprite(
        "snapper-walk.png",
        "snapper-shell.png",
      ),
      "vglc-smb-spiny": walkingEnemySprite("urchin-walk.png"),
      "vglc-smb-bowser": walkingEnemySprite("warden.png"),
      "vglc-smb-bowser-hammers": walkingEnemySprite("warden.png"),
      "vglc-smb-bullet": walkingEnemySprite("bullet-slug.png"),
      "vglc-smb-coin": spriteEntry("tile-shell.png"),
      "vglc-smb-question-block-contents": spriteEntry("tile-shell.png"),
      "vglc-smb-power-up": spriteEntry("castaway-powerup.png"),
      "vglc-smb-extra-life": spriteEntry("castaway-1up.png"),
      "vglc-smb-invincibility": spriteEntry("castaway-star.png"),
      "vglc-smb-climbable": spriteEntry("tile-bamboo.png"),
      "vglc-smb-transition-pipe": spriteEntry("tile-bamboo.png"),
      "vglc-smb-transition-pipe-a": spriteEntry("tile-bamboo.png"),
      "vglc-smb-transition-pipe-b": spriteEntry("tile-bamboo.png"),
      "open-gate": spriteEntry("tile-pole.png"),
      // Level-editor actor ids (Goomba/Koopa/Flyer, item, power-up).
      beetle: walkingEnemySprite("grumbler-idle.png"),
      flutterby: walkingEnemySprite("grumbler-idle.png"),
      shellback: shelledEnemySprite("snapper-walk.png", "snapper-shell.png"),
      "star-shard": spriteEntry("tile-shell.png"),
      "spark-cap": spriteEntry("castaway-powerup.png"),
    },
    tileSprites,
    sounds: {},
    music: {},
  };
  await writeFile(
    resolve(outDir, "asset-set.json"),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );

  console.log(
    `Wrote original castaway parody asset set (${sprites.length} sprites) to ${outDir}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

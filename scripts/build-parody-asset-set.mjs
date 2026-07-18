#!/usr/bin/env node
// Producer for an original "shabby castaway" parody asset set (Decision 0019).
// Every sprite here is authored from scratch as a pixel grid in this file — it is
// original expression, not derived from any third party's art. It writes an
// `authored` content set (descriptor + PNGs) into the ignored cache so it can be
// composed with any map set and selected as an alternative skin.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// prettier-ignore
import { bodyPartPalette, burstGrid, burstPalette, deadEyesGrid, deadEyesPalette, drawGridSprite, flameGrid, flamePalette as deathFlamePalette, huskGrid, huskPalette, partArmGrid, partHeadGrid, partLegGrid, partTorsoGrid, smokeGrid, smokePalette } from "./death-effect-overlay-sprites.mjs";
import { princessGrid, princessPalette } from "./rescued-friend-sprite.mjs";
// prettier-ignore
import { robotCostumes, luigiCostume, robotPartHeadGrid, robotPartTorsoGrid, robotPartArmGrid, robotPartLegGrid } from "./robot-costume-sprites.mjs";
// prettier-ignore
import { goombaCostume, princessCostume, revengeEnemyVariants, revengeStompPop } from "./revenge-costume-sprites.mjs";
import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

// The shared grid renderer, aliased to this script's long-standing name.
const drawSprite = drawGridSprite;

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

// Crouching (big tier only): hunched down into the lower rows, head pulled in
// and knees bent, so he reads as ducking — the top rows clear where hammers and
// flames pass over.
const castawayCrouch = [
  "................",
  "................",
  "................",
  ".....HHHHHH.....",
  "....HHHHHHHH....",
  "....HssssssH....",
  "....seswwses....",
  "....ssswwsss....",
  "...TTTTTTTTTT...",
  "..TTpTTTTTpTT...",
  "..TTTTTTTTTTT...",
  "..sTTTTTTTTs....",
  "..ssTTTTTTss....",
  "...dd....dd.....",
  "..ddd....ddd....",
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

// Mirror a pixel grid horizontally (for right-facing variants of caps/slopes).
function mirrorGrid(grid, width = spriteSize) {
  return grid.map((row) => [...row.padEnd(width, ".")].reverse().join(""));
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

// Giant bamboo culm (the travel pipe): a 2-tile-wide cylinder. The mouth is a
// thicker node ring that overhangs the body by 2px per side (classic pipe
// silhouette); the body halves carry an outline, an inner highlight/shade and
// a node ring so stacked tiles read as one segmented stalk.
const tilePipeTopLeft = [
  "kkkkkkkkkkkkkkkk",
  "kyyggggggggggggg",
  "kygggggggggggggg",
  "kygggggggggggggg",
  "kGGGGGGGGGGGGGGG",
  "kkkkkkkkkkkkkkkk",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
];
const tilePipeTopRight = [
  "kkkkkkkkkkkkkkkk",
  "gggggggggggggGGk",
  "ggggggggggggGGGk",
  "ggggggggggggGGGk",
  "GGGGGGGGGGGGGGGk",
  "kkkkkkkkkkkkkkkk",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
];
const tilePipeLeft = [
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kGGGGGGGGGGGGG",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
];
const tilePipeRight = [
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "GGGGGGGGGGGGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
  "gggggggggggGGk..",
];

// Sideways (left-facing) bamboo pipe, the vertical culm design rotated 90°:
// a full-bleed rim ring on the left with the whole mouth interior dark (an
// unmistakably open end), a horizontal tube inset 2px top/bottom with a node
// column, and joint tiles where the tube merges into a vertical culm (whose
// seam stays in front).
const tilePipeSideMouthTop = [
  "kyggGk..........",
  "kyggGk..........",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
];
const tilePipeSideMouthBottom = [
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGkkkkkkkkkkk",
  "kyggGk..........",
  "kyggGk..........",
  "kyggGk..........",
];
const tilePipeSideShaftTop = [
  "................",
  "................",
  "kkkkkkkkkkkkkkkk",
  "yyyyyyyGGyyyyyyy",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
];
const tilePipeSideShaftBottom = [
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "gggggggGGggggggg",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "kkkkkkkkkkkkkkkk",
  "................",
  "................",
  "................",
];
const tilePipeSideJointTop = [
  "..kygggggggggggg",
  "..kygggggggggggg",
  "kkkygggggggggggg",
  "yykygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
];
const tilePipeSideJointBottom = [
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "ggkygggggggggggg",
  "GGkygggggggggggg",
  "GGkygggggggggggg",
  "kkkygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
  "..kygggggggggggg",
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

// Original "kelp trap" (piranha-plant stand-in): a carnivorous beach pod on a
// kelp stalk, toothy jaws agape.
const kelpTrap = [
  "................",
  "....eeeeee......",
  "...errrrrre.....",
  "..errDrrDrre....",
  "..errrrrrrre....",
  "..ewrwrwrwre....",
  "..errrrrrrre....",
  "..erwrwrwrwe....",
  "...errrrrre.....",
  "....eeGGee......",
  "..Le..GG..eL....",
  ".eLLe.GG.eLLe...",
  "..eLLeGGeLLe....",
  "...eeeGGeee.....",
  ".....eGGe.......",
  "................",
];
const kelpTrapPalette = {
  ".": [0, 0, 0, 0],
  e: [24, 20, 18, 255],
  r: [178, 62, 56, 255],
  D: [110, 30, 30, 255],
  w: [245, 245, 245, 255],
  G: [96, 140, 70, 255],
  L: [168, 200, 120, 255],
};

// The "hurler" (hammer-thrower stand-in): a lanky crab-armored islander with
// a driftwood helm, one claw raised to throw.
const hurler = [
  "................",
  "....dddddd......",
  "...dddddddd..S..",
  "...eGGGGGGe..S..",
  "...GwGGwGGG.dd..",
  "...GeGGeGG..dd..",
  "...GGGGGGG.dd...",
  "....GGGGG.dd....",
  "..eGGGGGGGd.....",
  ".eGLLGLLGGe.....",
  ".eGLLGLLGGe.....",
  ".eGLLGLLGGe.....",
  "..eeeeeeee......",
  "...L....L.......",
  "..LL....LL......",
  "..mm....mm......",
];

// The "cloud tosser" (Lakitu stand-in): a hooded drifter peeking over the rim
// of his cloud, egg in claw.
const cloudTosser = [
  "................",
  "....eeeeee......",
  "...eGGGGGGe.....",
  "...eGwGwGGe.....",
  "...eGeGeGGe..P..",
  "...eGGGGGGe.PPP.",
  "....eGGGGe...P..",
  "..wwwwwwwwwww...",
  ".wwwwwwwwwwwww..",
  "wwwwwwwwwwwwwww.",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  ".wwwwwwwwwwwwww.",
  "..cccccccccccc..",
  "................",
  "................",
];
const cloudTosserPalette = {
  ".": [0, 0, 0, 0],
  e: [24, 20, 18, 255],
  G: [96, 120, 70, 255],
  w: [252, 252, 252, 255],
  c: [202, 226, 242, 255],
  P: [104, 58, 96, 255],
};

// Buzzy stand-in: a bare shell walking on stubby legs, kiln-fired charcoal.
const buzzyPalette = {
  ".": [0, 0, 0, 0],
  G: [64, 70, 92, 255],
  L: [108, 118, 148, 255],
  e: [24, 20, 18, 255],
  w: [245, 245, 245, 255],
  m: [36, 40, 54, 255],
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

// The keep's boss ("the warden", our Bowser): a hulking horned keeper, drawn
// 16x16 and doubled to the ROM boss's 32x32 footprint. Facing left (toward
// the approaching player). Two leg frames; the hammer variant holds a maul
// over the shell.
const bossPalette = {
  ".": [0, 0, 0, 0],
  S: [44, 104, 46, 255],
  s: [96, 158, 66, 255],
  k: [236, 224, 176, 255],
  b: [224, 180, 110, 255],
  o: [186, 108, 44, 255],
  e: [24, 20, 18, 255],
  w: [245, 240, 220, 255],
  r: [198, 44, 34, 255],
  m: [120, 34, 26, 255],
  h: [138, 138, 146, 255],
  t: [124, 84, 48, 255],
};
const bossBodyRows = [
  "...k......k.....",
  "..ekk....kke....",
  "..krrekkrrke....",
  ".ereewereewe....",
  ".esssssssse.SSe.",
  "esssmmmssseSSSSe",
  "emmmmmmsssSSSSSe",
  ".emmemssbSSkSSSe",
  "..eesssbbSSSSkSe",
  ".essbbbbbSSSSSSe",
  "esbbbbbbSSkSSSe.",
  "esbbbbbSSSSSSe..",
  "essbbbbeSSSSe...",
];
const bossLegsA = [".eossooeoosoe...", ".ekkokkekkokke..", "..ee..ee..ee...."];
const bossLegsB = ["..eossoeoosoe...", "..ekkokekkoke...", "...ee..ee.ee...."];
const bossWalk1 = [...bossBodyRows, ...bossLegsA];
const bossWalk2 = [...bossBodyRows, ...bossLegsB];
// Hammer variant: a maul brandished over the shell (top-right).
function withBossHammer(grid) {
  const rows = grid.map((row) => row.split(""));
  const overlay = [
    [0, 13, "h"],
    [0, 14, "h"],
    [1, 13, "h"],
    [1, 14, "h"],
    [2, 14, "t"],
    [3, 14, "t"],
  ];
  return applyPixelOverlay(rows, overlay);
}
// Stamp [row, column, letter] pixels onto a split-row grid, then rejoin.
function applyPixelOverlay(rows, overlay) {
  for (const [row, column, letter] of overlay) {
    if (rows[row] !== undefined && rows[row][column] !== undefined) {
      rows[row][column] = letter;
    }
  }
  return rows.map((row) => row.join(""));
}

// Double a 16x16 grid to 32x32 (scaleGridDouble only handles 8x8 bodies).
function scaleGrid16Double(grid) {
  const scaled = [];
  for (const row of grid.slice(0, 16)) {
    const wide = [...row.slice(0, 16)].map((cell) => cell + cell).join("");
    scaled.push(wide, wide);
  }
  return scaled;
}
// The boss's manifest entry: true 32x32 frames, legs alternating with his
// patrol direction flips as he paces the bridge.
function bossEnemySprite(leftFileName, rightFileName) {
  return {
    ...spriteEntry(leftFileName, 32, 32),
    stateSprites: {
      "walk-left": spriteEntry(leftFileName, 32, 32),
      "walk-right": spriteEntry(rightFileName, 32, 32),
    },
  };
}

// The gate axe: the castle's end-of-bridge axe (chopping it drops the
// bridge in the ROM); doubles as the generic exit-gate marker.
// A fully transparent tile: the goal "gate" column is an invisible trigger
// (the axe actor is its one visible marker, as in the ROM).
const tileNone = Array.from({ length: 16 }, () => "................");

// The fire bloom (our fire flower): a blazing petal ring on a leafy stem.
// The freed attendant (worlds 1-7's keep captive): a small island elder in a
// leaf-brim hat with a lantern — an original design, distinct from the
// friend rescued at the final keep.
const attendantPalette = {
  ".": [0, 0, 0, 0],
  e: [24, 20, 18, 255],
  h: [110, 150, 62, 255],
  H: [82, 118, 48, 255],
  s: [214, 170, 128, 255],
  b: [150, 132, 108, 255],
  w: [245, 240, 220, 255],
  L: [246, 202, 80, 255],
  t: [124, 84, 48, 255],
};
const attendantGrid = [
  "................",
  "....hhhhhhhh....",
  "...hHhhhhhhHh...",
  "..hHhhhhhhhhHh..",
  "..eeeeeeeeeeee..",
  "....ssssssss....",
  "....sewssews....",
  "....ssssssss....",
  "....ssseesss....",
  ".....bbbbbb.....",
  "....bbbbbbbb..t.",
  "...wbbbbbbbbw.t.",
  "...wbbbbbbbbwLL.",
  "....bbbbbbbb.LL.",
  "....bbb..bbb....",
  "....ee....ee....",
];

const fireBloomPalette = {
  ".": [0, 0, 0, 0],
  e: [24, 20, 18, 255],
  r: [214, 60, 30, 255],
  o: [246, 150, 46, 255],
  w: [246, 236, 200, 255],
  g: [70, 140, 60, 255],
  d: [46, 96, 42, 255],
};
const fireBloom = [
  "................",
  "....eooe.eooe...",
  "...eorroeorroe..",
  "...eorroeorroe..",
  "....eooewooe....",
  "...eoowwwwooe...",
  "...eorwewwroe...",
  "...eorwwwwroe...",
  "....eoowwooe....",
  ".....eogggoe....",
  "......egde......",
  "...gg..egd.gg...",
  "..gddg.egdgddg..",
  "...gg..egd.gg...",
  "......eggde.....",
  ".......ee.......",
];

const gateAxePalette = {
  ".": [0, 0, 0, 0],
  e: [24, 20, 18, 255],
  h: [168, 168, 178, 255],
  w: [235, 235, 242, 255],
  t: [136, 92, 50, 255],
  d: [96, 62, 32, 255],
};
const gateAxe = [
  "....ehhe........",
  "...ehwwhe.......",
  "..ehwwhhhe......",
  "..ehwhhhhe......",
  "..ehhhhhhee.....",
  "...ehhhheete....",
  "....eheeetde....",
  ".....eetdee.....",
  ".....etdee......",
  "....etdee.......",
  "...etdee........",
  "..etdee.........",
  ".etdee..........",
  ".edee...........",
  ".ee.............",
  "................",
];

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
const snapperWinged = [
  "....www.........",
  "...wwwweeee.....",
  "..wwwweGGGGe....",
  ".wwww.eGwGwGe...",
  "..ww..eGeGeGe...",
  "......eeGGGee...",
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

function spriteEntry(fileName, width = spriteSize, height = spriteSize) {
  return {
    source: { kind: "url", url: fileName },
    frame: { x: 0, y: 0, width, height },
  };
}

// The koopa's Elvis pompadour: two 16x24 frames (8 hair rows over the 16x16
// body) with the quiff swinging against his motion — authored for a
// left-facing walker; the right-facing frames swing the other way.
const elvisHairPalette = {
  q: [34, 30, 28, 255],
  Q: [70, 62, 58, 255],
};
function elvisSnapperFrames(bodyGrid) {
  const hairBack = [
    "....qqqq........",
    "..qqqQQqq.......",
    ".qqQQQQqqq......",
    ".qqQQQqqqqq.....",
    "..qqqqqqqqqq....",
    "...qqq..qqqq....",
    "........qqq.....",
    "................",
  ];
  const hairForward = [
    "......qqqq......",
    "....qqQQqqq.....",
    "...qqQQQQqqq....",
    "..qqqQQQqqqq....",
    "..qqqqqqqqq.....",
    "..qqqq..qqq.....",
    "...qq...........",
    "................",
  ];
  return [
    [...hairBack, ...bodyGrid],
    [...hairForward, ...bodyGrid],
  ];
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

// A winged (paratroopa-like) enemy adds airborne frames on top of the
// shelled set; a stomp drops it to the plain walking look.
function wingedEnemySprite(walkFileName, shellFileName, wingedFileName) {
  const base = shelledEnemySprite(walkFileName, shellFileName);
  return {
    ...base,
    stateSprites: {
      ...base.stateSprites,
      winged: spriteEntry(wingedFileName),
      "winged-left": spriteEntry(wingedFileName),
      "winged-right": spriteEntry(wingedFileName),
      "winged-idle": spriteEntry(wingedFileName),
    },
  };
}

// Map each engine player action to the pose id a costume draws it with. The
// castaway (and full Luigi) have dedicated crouch/climb/swim poses; the robots
// have no such poses, so those actions reuse a near frame (idle / gliding jump)
// — see the per-costume maps below.
const fullActionPoses = {
  idle: "idle",
  walk: "walk-1",
  run: "walk-2",
  "walk-anim-1": "walk-1",
  "walk-anim-2": "walk-2",
  jump: "jump",
  fall: "jump",
  crouch: "crouch",
  climb: "climb",
  swim: "swim",
  "swim-2": "swim-2",
  "burning-1": "burning-1",
  "burning-2": "burning-2",
};

// The on-fire pose (god mode standing on lava): the costume's idle frame
// engulfed in flames. Two deterministic flame phases (no RNG) with yellow
// tips over orange tongues, drawn over whatever body pixel is there. The
// flames LEAN LEFT — the trail behind a rightward runner; the shell flips
// the sprite when the player faces the other way.
const burningFlameHeightsA = [3, 5, 4, 6, 3, 7, 4, 5, 6, 4, 7, 3, 5, 4, 6, 3];
const burningFlameHeightsB = [5, 3, 6, 4, 7, 4, 6, 3, 4, 7, 4, 6, 3, 6, 4, 5];
function burningGrid(grid, phase = 1) {
  const heights = phase === 1 ? burningFlameHeightsA : burningFlameHeightsB;
  const height = grid.length;
  const width = grid[0]?.length ?? 16;
  const scale = Math.max(1, Math.round(width / 16));
  const rows = grid.map((row) => row.split(""));
  for (let column = 0; column < width; column += 1) {
    const flameHeight = (heights[Math.floor(column / scale) % 16] ?? 3) * scale;
    for (let step = 0; step < flameHeight; step += 1) {
      const row = height - 1 - step;
      if (rows[row] === undefined) {
        continue;
      }
      // The tongue leans one pixel left near its tip (the wind-blown trail).
      const lean = step >= flameHeight - 2 ? 1 : 0;
      const leanedColumn = column - lean;
      if (rows[row][leanedColumn] === undefined) {
        continue;
      }
      rows[row][leanedColumn] = step === flameHeight - 1 ? "2" : "1";
    }
  }
  // Tongues licking over the head/shoulders so tall frames read as fully
  // ablaze; the two phases flicker between spots.
  const tonguesA = [
    [1, 4, "2"],
    [2, 4, "1"],
    [1, 11, "2"],
    [2, 11, "1"],
    [0, 8, "2"],
    [1, 8, "1"],
  ];
  const tonguesB = [
    [0, 5, "2"],
    [1, 5, "1"],
    [2, 12, "2"],
    [3, 12, "1"],
    [1, 9, "2"],
    [2, 9, "1"],
  ];
  return applyPixelOverlay(rows, phase === 1 ? tonguesA : tonguesB);
}
function burningPalette(basePalette) {
  return {
    ...basePalette,
    1: [235, 92, 22, 255],
    2: [255, 214, 64, 255],
  };
}
const luigiActionPoses = {
  ...fullActionPoses,
  // The full Luigi has its own crouch/climb; it glides (jump pose) when swimming.
  swim: "jump",
  "swim-2": "jump",
};
const robotActionPoses = {
  idle: "idle",
  walk: "walk-1",
  run: "walk-2",
  "walk-anim-1": "walk-1",
  "walk-anim-2": "walk-2",
  jump: "jump",
  fall: "jump",
  crouch: "idle",
  climb: "idle",
  swim: "jump",
  "swim-2": "jump",
  "burning-1": "burning-1",
  "burning-2": "burning-2",
};

// Emit the four vitality-tier keys for every action of one costume. `keyPrefix`
// is "" for the base castaway (unprefixed keys) or "<character>-" for a costume
// that resolvePlayerSpriteImage looks up by character prefix. `fileStem` is the
// PNG basename prefix; powered/fire reuse the pose grid under a tier palette.
function costumeStateSprites(
  keyPrefix,
  fileStem,
  actionPoses,
  frameSizePixels = spriteSize,
) {
  const stateSprites = {};
  for (const [action, pose] of Object.entries(actionPoses)) {
    const base = `${fileStem}-${pose}`;
    stateSprites[`${keyPrefix}small-${action}`] = spriteEntry(
      `${base}.png`,
      frameSizePixels,
      frameSizePixels,
    );
    stateSprites[`${keyPrefix}recovering-${action}`] = spriteEntry(
      `${base}.png`,
      frameSizePixels,
      frameSizePixels,
    );
    stateSprites[`${keyPrefix}powered-${action}`] = spriteEntry(
      `${base}-powered.png`,
      frameSizePixels,
      frameSizePixels,
    );
    stateSprites[`${keyPrefix}fire-${action}`] = spriteEntry(
      `${base}-fire.png`,
      frameSizePixels,
      frameSizePixels,
    );
  }
  return stateSprites;
}

function playerStateSprites() {
  return {
    // Default castaway (unprefixed keys — the base art the others fall back to).
    ...costumeStateSprites("", "castaway", fullActionPoses),
    // Full green companion costume (distinct art, not a palette swap).
    ...costumeStateSprites("luigi-", "luigi", luigiActionPoses),
    // Four distinct Futurama-style robots, each its own character prefix.
    ...robotCostumes.reduce(
      (all, costume) => ({
        ...all,
        ...costumeStateSprites(
          `${costume.key}-`,
          costume.key,
          robotActionPoses,
        ),
      }),
      {},
    ),
    // Revenge-mode protagonists (tall Goomba, Princess): idle/walk/jump art,
    // reused across the crouch/climb/swim actions like the robots.
    ...costumeStateSprites("goomba-", "goomba", robotActionPoses),
    // The princess's fluid 32x32 pose set: 4-phase walk, profile jump,
    // front-facing straight-up jump, parachute fall.
    ...costumeStateSprites(
      "princess-",
      "princess",
      {
        idle: "idle",
        walk: "walk-1",
        run: "walk-3",
        "walk-anim-1": "walk-1",
        "walk-anim-2": "walk-2",
        "walk-anim-3": "walk-3",
        "walk-anim-4": "walk-4",
        jump: "jump",
        "jump-up": "jump-up",
        fall: "fall",
        crouch: "idle",
        climb: "idle",
        swim: "jump",
        "swim-2": "jump",
        "burning-1": "burning-1",
        "burning-2": "burning-2",
      },
      32,
    ),
  };
}

// A single-tier costume (Goomba / Princess) has no powered/fire art; emit the
// base grid under every tier suffix so the character candidate chain always
// resolves to its one look.
function singleTierCostumeFiles(costume) {
  const size = costume.frameSizePixels ?? spriteSize;
  return Object.entries(costume.poses).flatMap(([pose, grid]) => [
    [`${costume.key}-${pose}.png`, grid, costume.palette, size, size],
    [`${costume.key}-${pose}-powered.png`, grid, costume.palette, size, size],
    [`${costume.key}-${pose}-fire.png`, grid, costume.palette, size, size],
  ]);
}

// The half-height Mario/Luigi "enemy" sprites for revenge mode: walk frames, a
// jump frame, and the eye-bulge stomped frame — one set per (enemy type, colour)
// variant, each wearing its true type as a helmet.
function revengeEnemyFiles() {
  return revengeEnemyVariants.flatMap((variant) =>
    Object.entries(variant.poses).map(([pose, grid]) => [
      `${variant.key}-${pose}.png`,
      grid,
      variant.palette,
    ]),
  );
}

// Expand a costume descriptor (from robot-costume-sprites.mjs) into the
// [filename, grid, palette] tuples the sprite writer consumes: one base +
// powered + fire PNG per pose grid.
function costumeSpriteFiles(costume) {
  return Object.entries(costume.poses).flatMap(([pose, grid]) => [
    [`${costume.key}-${pose}.png`, grid, costume.palettes.base],
    [`${costume.key}-${pose}-powered.png`, grid, costume.palettes.powered],
    [`${costume.key}-${pose}-fire.png`, grid, costume.palettes.fire],
  ]);
}

// Each robot's own body-part sprites (the shared boxy-metal set under that
// robot's palette), so it explodes into its own colours.
function robotPartFiles(costume) {
  return [
    [`${costume.key}-part-head.png`, robotPartHeadGrid, costume.palettes.base],
    [
      `${costume.key}-part-torso.png`,
      robotPartTorsoGrid,
      costume.palettes.base,
    ],
    [`${costume.key}-part-arm.png`, robotPartArmGrid, costume.palettes.base],
    [`${costume.key}-part-leg.png`, robotPartLegGrid, costume.palettes.base],
  ];
}

// ---------------------------------------------------------------------------
// Background scenery, mechanisms and furniture — so the decoded levels render
// with authored art everywhere (no flat vector fallbacks). All original
// "shabby island" designs.

const sceneryPalette = {
  ".": [0, 0, 0, 0],
  w: [252, 252, 252, 255], // cloud white
  c: [202, 226, 242, 255], // cloud underside shading
  G: [64, 158, 74, 255], // leaf green
  g: [116, 202, 112, 255], // sunlit leaf
  D: [34, 100, 44, 255], // deep foliage shade
  d: [142, 106, 66, 255], // driftwood
  k: [92, 66, 40, 255], // dark wood
  r: [198, 174, 130, 255], // rope
  s: [222, 198, 150, 255], // pale sand
};

// Clouds: rounded caps and a puffier middle, flat shaded base so runs of
// left/middle/right read as one drifting bank.
const sceneryCloudLeft = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......wwwwwwwwww",
  "....wwwwwwwwwwww",
  "...wwwwwwwwwwwww",
  "..wwwwwwwwwwwwww",
  ".wwwwwwwwwwwwwww",
  ".wwwwwwwwwwwwwww",
  "..cccccccccccccc",
  "................",
  "................",
  "................",
  "................",
];
const sceneryCloudMiddle = [
  "................",
  "................",
  "................",
  "...ww......ww...",
  "..wwww....wwww..",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwww",
  "cccccccccccccccc",
  "................",
  "................",
  "................",
  "................",
];
const sceneryCloudRight = mirrorGrid(sceneryCloudLeft);

// Bushes: the cloud silhouette grown low to the ground in greens.
const sceneryBushLeft = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "......GGGGGGGGGG",
  "....GgGGGGGGGGGG",
  "..GGGGGGGGGGGGGG",
  ".GGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "DGGGGGGGGGGGGGGG",
  "DDDDDDDDDDDDDDDD",
];
const sceneryBushMiddle = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...gg......gg...",
  "..gggg....gggg..",
  "GGGGGGGGGGGGGGGG",
  "GGgGGGGGGGGGgGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "DDDDDDDDDDDDDDDD",
];
const sceneryBushRight = mirrorGrid(sceneryBushLeft);

// Hills: generated slopes with a sunlit edge, a speckled dome peak, and a
// solid fill for the body rows.
const sceneryHillLeft = Array.from({ length: spriteSize }, (_, y) => {
  const start = 15 - y;
  return `${".".repeat(start)}g${"G".repeat(15 - start)}`;
});
const sceneryHillRight = mirrorGrid(sceneryHillLeft);
const sceneryHillPeak = [
  "................",
  "................",
  ".......gg.......",
  "......gGGg......",
  ".....gGGGGg.....",
  "....gGGGGGGg....",
  "...gGGGDGGGGg...",
  "..gGGGGGGGGGGg..",
  ".gGGGDGGGGDGGGg.",
  "gGGGGGGGGGGGGGGg",
  "GGGGGGGGGGGGGGGG",
  "GGGGDGGGGGGDGGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "GGDGGGGGDGGGGGGG",
  "GGGGGGGGGGGGGGGG",
];
const sceneryHillFill = [
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGDGGGGGGGGDGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGDGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "GDGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGDGGG",
  "GGGGGGGGGGGGGGGG",
  "GGGGDGGGGGGGGGGG",
  "GGGGGGGGGGDGGGGG",
  "GGGGGGGGGGGGGGGG",
  "GGDGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGDGG",
  "GGGGGGGDGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
];

// A driftwood picket fence lashed with two rope rails.
const sceneryFence = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".dd..dd..dd..dd.",
  "rrrrrrrrrrrrrrrr",
  ".dd..dd..dd..dd.",
  ".dd..dd..dd..dd.",
  "rrrrrrrrrrrrrrrr",
  ".dd..dd..dd..dd.",
  ".kk..kk..kk..kk.",
];

// Tree canopies (tall crown and the one-tile shrub), bark trunk, and the pale
// stem under the giant mushroom ledges.
const sceneryTreeTop = [
  "................",
  "......gggg......",
  "....ggGGGGgg....",
  "...gGGGGGGGGg...",
  "..gGGGGGGGGGGg..",
  ".gGGGGGGGGGGGGg.",
  "GGGGGGGGGGGGGGGG",
  "GGGGDGGGGDGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "DGGGGGGGGGGGGGGD",
  ".DGGGGGGGGGGGGD.",
  "..DDGGGGGGGGDD..",
  "....DDGGGGDD....",
  "................",
  "................",
  "................",
];
const sceneryTreeTopSmall = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......gGGg......",
  "....gGGGGGGg....",
  "...GGGGGGGGGG...",
  "...GGGDGGDGGG...",
  "....DGGGGGGD....",
  ".....DGGGGD.....",
  ".......kk.......",
  ".......kk.......",
  ".......kk.......",
  ".......kk.......",
  ".......kk.......",
];
const sceneryTrunk = [
  "......dkkd......",
  "......dkkd......",
  "......dkdd......",
  "......dkkd......",
  "......ddkd......",
  "......dkkd......",
  "......dkkd......",
  "......dkdd......",
  "......dkkd......",
  "......dkkd......",
  "......ddkd......",
  "......dkkd......",
  "......dkdd......",
  "......dkkd......",
  "......dkkd......",
  "......dkkd......",
];
const sceneryMushroomStem = [
  ".....kkkkkk.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
  ".....dssssd.....",
];

// The low rope railing that runs along the bridge levels.
const sceneryRail = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "rrrrrrrrrrrrrrrr",
  ".d...d...d...d..",
  ".d...d...d...d..",
  ".d...d...d...d..",
  ".d...d...d...d..",
  ".d...d...d...d..",
];

// Castle masonry: coursed stone with offset joints, merlons, a barred window
// and the keep door.
const stonePalette = {
  ".": [0, 0, 0, 0],
  S: [148, 150, 162, 255],
  m: [104, 106, 120, 255],
  k: [38, 38, 48, 255],
};
const castleWall = [
  "SSSSSSSmSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "mmmmmmmmmmmmmmmm",
  "SSSmSSSSSSSSmSSS",
  "SSSmSSSSSSSSmSSS",
  "SSSmSSSSSSSSmSSS",
  "mmmmmmmmmmmmmmmm",
  "SSSSSSSmSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "mmmmmmmmmmmmmmmm",
  "SSSmSSSSSSSSmSSS",
  "SSSmSSSSSSSSmSSS",
  "SSSmSSSSSSSSmSSS",
  "mmmmmmmmmmmmmmmm",
];
const castleBattlement = [
  "SSSSS......SSSSS",
  "SSSSS......SSSSS",
  "SSSSS......SSSSS",
  "SmSSS......SSSmS",
  "SSSSS......SSSSS",
  "SSSSS......SSSSS",
  "mmmmm......mmmmm",
  "SSSSSSSSSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "mmmmmmmmmmmmmmmm",
  "SSSmSSSSSSSSmSSS",
  "SSSmSSSSSSSSmSSS",
  "SSSmSSSSSSSSmSSS",
  "mmmmmmmmmmmmmmmm",
];
const castleWindow = [
  "SSSSSSSmSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "mmmmmmmmmmmmmmmm",
  "SSSSSSkkkkSSSSSS",
  "SSSSSkkkkkkSSSSS",
  "SSSSSkkkkkkSSSSS",
  "SSSSSkkkkkkSSSSS",
  "SSSSSkkkkkkSSSSS",
  "SSSSSkkkkkkSSSSS",
  "SSSSSkkkkkkSSSSS",
  "SSSSSkkkkkkSSSSS",
  "SSSSSkkkkkkSSSSS",
  "mmmmmmmmmmmmmmmm",
  "SSSmSSSSSSSSmSSS",
  "SSSmSSSSSSSSmSSS",
  "mmmmmmmmmmmmmmmm",
];
const castleDoor = [
  "SSSSSSSmSSSSSSSS",
  "SSSSSSSmSSSSSSSS",
  "mmmmmmmmmmmmmmmm",
  "SSSmSSSSSSSSmSSS",
  "SSSSSSkkkkSSSSSS",
  "SSSSSkkkkkkSSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
  "SSSSkkkkkkkkSSSS",
];

// Water and lava bands (the "over water" fore scenery and castle pits).
const waterPalette = {
  ".": [0, 0, 0, 0],
  W: [62, 132, 222, 255],
  w: [122, 182, 240, 255],
  f: [238, 248, 255, 255],
  D: [40, 96, 180, 255],
};
const waterSurface = [
  "fwwfwwwffwwwfwfw",
  "wWWwWWwwWWwwWWww",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWwWWWWWWWWWWW",
  "WWWWWWWWWWWDWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWDWWWWWWWWWWWWW",
  "WWWWWWWWwWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWDWWWWWWWWWW",
  "WWWWWWWWWWWWwWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
];
const waterBody = [
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWDWWWWWWWWWWWW",
  "WWWWWWWWWWWwWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWDWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WwWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWDWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWDWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWW",
];
// Swim-through coral banks (water-area terrain the player passes through).
const coralPalette = {
  ".": [0, 0, 0, 0],
  C: [47, 158, 110, 255],
  c: [99, 230, 190, 255],
  D: [27, 108, 78, 255],
};
const coralBank = [
  "cCCcCCCCcCCCCCcC",
  "CCCCCCCCCCCCCCCC",
  "CCDCCCCCCCCDCCCC",
  "CCCCCCCDCCCCCCCC",
  "CCCCcCCCCCCCCCCC",
  "CDCCCCCCCCCCCDCC",
  "CCCCCCCCCcCCCCCC",
  "CCCCCDCCCCCCCCCC",
  "CCcCCCCCCCCCCCcC",
  "CCCCCCCCDCCCCCCC",
  "CCCCCCCCCCCCCCCC",
  "CDCCCCcCCCCCDCCC",
  "CCCCCCCCCCCCCCCC",
  "CCCCCCCCCcCCCCCC",
  "CCCDCCCCCCCCCCCC",
  "CCCCCCCCCCCCCCCC",
];

const lavaPalette = {
  ".": [0, 0, 0, 0],
  R: [214, 64, 42, 255],
  O: [240, 140, 50, 255],
  Y: [252, 214, 110, 255],
  D: [150, 34, 26, 255],
};
const lavaSurface = [
  "YOYYOOYYOYYOOYYO",
  "OORROORROORROORR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRORRRRRRRRRRR",
  "RRRRRRRRRRRDRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRDRRRRRRRRRRRRR",
  "RRRRRRRRORRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRDRRRRRRRRRR",
  "RRRRRRRRRRRRORRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
];
const lavaBody = [
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRDRRRRRRRRRRRR",
  "RRRRRRRRRRRORRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRDRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RORRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRDRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRDRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRRRR",
];

// Mechanisms and projectiles: firebar orbs, podoboos, lift rafts, the
// player's fireball, hammers, castle flame jets, and Lakitu's eggs.
const flamePalette = {
  ".": [0, 0, 0, 0],
  Y: [255, 236, 150, 255],
  O: [248, 150, 54, 255],
  R: [220, 70, 40, 255],
};
const flameOrb = [
  "..RRRR..",
  ".RROORR.",
  "RROYYORR",
  "ROYYYYOR",
  "ROYYYYOR",
  "RROYYORR",
  ".RROORR.",
  "..RRRR..",
];
const podoboo = [
  ".......R........",
  "......RO........",
  ".....ROY........",
  "......ROY.......",
  ".......ROY......",
  "......ROYO......",
  ".....ROOOOR.....",
  "....RRRRRRR.....",
  "...ROOOOOOR.....",
  "..ROOYYYYOOR....",
  "..ROYYYYYYOR....",
  "..ROYYYYYYOR....",
  "..ROOYYYYOOR....",
  "...ROOOOOOR.....",
  "....RRRRRR......",
  "................",
];
const projectileFireball = [
  ".OOOO...",
  "OOYYOO..",
  "OYYYYO..",
  "OYYYYO..",
  "OOYYOO..",
  ".OOOO...",
  "........",
  "........",
];
const flameJet = [
  "................",
  "....OO..OOO.....",
  ".YYOOORROOOORR..",
  "YYYYOOOOOOORRRR.",
  "YYYYOOOOOOORRRR.",
  ".YYOOORROOOORR..",
  "....OO..OOO.....",
  "................",
];
const hammerPalette = {
  ".": [0, 0, 0, 0],
  S: [176, 178, 188, 255],
  d: [142, 106, 66, 255],
};
const projectileHammer = [
  "SSSSS...",
  "SSSSS...",
  "SSSSS...",
  "..dd....",
  "...dd...",
  "....dd..",
  ".....dd.",
  "......dd",
];
const eggPalette = {
  ".": [0, 0, 0, 0],
  e: [24, 20, 18, 255],
  P: [104, 58, 96, 255],
  w: [210, 120, 170, 255],
};
const projectileEgg = [
  ".e.ee.e.",
  "ePPPPPPe",
  "PPwPPwPP",
  "PPPPPPPP",
  "ePPPPPPe",
  ".ePPPPe.",
  "..eeee..",
  "........",
];
const liftPlank = [
  "rrrrrrrrrrrrrrrr",
  "dddddddddddddddd",
  "dkdddddkdddddkdd",
  "dddddddddddddddd",
  "ddkdddddkdddddkd",
  "dddddddddddddddd",
  "kkkkkkkkkkkkkkkk",
  "................",
];

// The goal pennant: patched sailcloth pointing left off the pole.
const flagPennant = [
  "..............ss",
  "............ssss",
  "..........ssssss",
  "........ssssssss",
  "......ssssssssss",
  "....ssssssssssss",
  "..ssssssssppssss",
  "ssssssssssppssss",
  "..ssssssssssssss",
  "....ssssssssssss",
  "......ssssssssss",
  "........ssssssss",
  "..........ssssss",
  "............ssss",
  "..............ss",
  "................",
];
const flagPalette = {
  ".": [0, 0, 0, 0],
  s: [222, 198, 150, 255],
  p: [156, 92, 60, 255],
};

// Powered / fire tiers: the classic palette swap. The powered castaway wears
// a crimson-dyed tunic; the fire tier bleaches it bone-white with red patches.
const poweredPlayerPalette = {
  ...palette,
  T: [158, 54, 44, 255],
  p: [214, 150, 70, 255],
};
const firePlayerPalette = {
  ...palette,
  T: [236, 226, 204, 255],
  p: [196, 62, 46, 255],
};

async function main() {
  const outDir = assertUserLevelCachePath(
    readOption("--out-dir") ?? defaultOutDir,
    "--out-dir",
  );
  // Wipe any prior output so renamed/removed sprites (e.g. the old
  // castaway-*-luigi tint frames replaced by dedicated luigi art) never linger
  // as orphans that the bundler would ship.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const sprites = [
    ["castaway-idle.png", castawayIdle, palette],
    ["castaway-walk-1.png", castawayWalk1, palette],
    ["castaway-walk-2.png", castawayWalk2, palette],
    ["castaway-jump.png", castawayJump, palette],
    ["castaway-crouch.png", castawayCrouch, palette],
    ["castaway-climb.png", castawayClimb, palette],
    ["castaway-swim.png", castawaySwimA, palette],
    ["castaway-swim-2.png", castawaySwimB, palette],
    ["castaway-ouch.png", castawayOuch, palette],
    ["castaway-dead-eyes.png", deadEyesGrid, deadEyesPalette],
    ["smoke-puff.png", smokeGrid, smokePalette],
    ["burn-flame.png", flameGrid, deathFlamePalette],
    ["explosion-burst.png", burstGrid, burstPalette],
    ["burned-husk.png", huskGrid, huskPalette],
    ["part-head.png", partHeadGrid, bodyPartPalette],
    ["part-torso.png", partTorsoGrid, bodyPartPalette],
    ["part-arm.png", partArmGrid, bodyPartPalette],
    ["part-leg.png", partLegGrid, bodyPartPalette],
    ["rescued-friend.png", princessGrid, princessPalette],
    ["freed-attendant.png", attendantGrid, attendantPalette],
    ["grumbler-idle.png", grumblerIdle, enemyPalette],
    ["grumbler-squashed.png", grumblerSquashed, enemyPalette],
    ["tile-sand.png", tileSand, tilePalette],
    ["tile-plank.png", tilePlank, tilePalette],
    ["tile-crate.png", tileCrate, tilePalette],
    ["tile-crate-used.png", tileCrateUsed, tilePalette],
    ["tile-bamboo.png", tileBamboo, tilePalette],
    ["tile-pipe-top-left.png", tilePipeTopLeft, tilePalette],
    ["tile-pipe-top-right.png", tilePipeTopRight, tilePalette],
    ["tile-pipe-left.png", tilePipeLeft, tilePalette],
    ["tile-pipe-right.png", tilePipeRight, tilePalette],
    ["tile-pipe-side-mouth-top.png", tilePipeSideMouthTop, tilePalette],
    ["tile-pipe-side-mouth-bottom.png", tilePipeSideMouthBottom, tilePalette],
    ["tile-pipe-side-shaft-top.png", tilePipeSideShaftTop, tilePalette],
    ["tile-pipe-side-shaft-bottom.png", tilePipeSideShaftBottom, tilePalette],
    ["tile-pipe-side-joint-top.png", tilePipeSideJointTop, tilePalette],
    ["tile-pipe-side-joint-bottom.png", tilePipeSideJointBottom, tilePalette],
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
    ...elvisSnapperFrames(snapperWalk).flatMap((grid, index) => [
      [
        `snapper-elvis-${index + 1}.png`,
        grid,
        { ...enemyPalette, ...elvisHairPalette },
        16,
        24,
      ],
      [
        `snapper-red-elvis-${index + 1}.png`,
        grid,
        { ...redEnemyPalette, ...elvisHairPalette },
        16,
        24,
      ],
    ]),
    ["snapper-shell.png", snapperShell, enemyPalette],
    ["snapper-red-walk.png", snapperWalk, redEnemyPalette],
    ["snapper-red-shell.png", snapperShell, redEnemyPalette],
    ["snapper-winged.png", snapperWinged, enemyPalette],
    ["snapper-red-winged.png", snapperWinged, redEnemyPalette],
    ["urchin-walk.png", snapperShell, spinyPalette],
    ["kelp-trap.png", kelpTrap, kelpTrapPalette],
    ["hurler.png", hurler, enemyPalette],
    ["cloud-tosser.png", cloudTosser, cloudTosserPalette],
    ["buzzy-shell.png", snapperShell, buzzyPalette],
    ["warden.png", scaleGridDouble(snapperWalk), wardenPalette],
    // The keep's boss at true 32x32 (fire and hammer-throwing variants).
    ["gate-axe.png", gateAxe, gateAxePalette],
    ["fire-bloom.png", fireBloom, fireBloomPalette],
    ["tile-none.png", tileNone, gateAxePalette],
    ["warden-boss-1.png", scaleGrid16Double(bossWalk1), bossPalette, 32, 32],
    ["warden-boss-2.png", scaleGrid16Double(bossWalk2), bossPalette, 32, 32],
    [
      "warden-boss-hammer-1.png",
      scaleGrid16Double(withBossHammer(bossWalk1)),
      bossPalette,
      32,
      32,
    ],
    [
      "warden-boss-hammer-2.png",
      scaleGrid16Double(withBossHammer(bossWalk2)),
      bossPalette,
      32,
      32,
    ],
    ["bullet-slug.png", bulletSlug, bulletPalette],
    ["castaway-fish.png", castawayFish, waterEnemyPalette],
    ["castaway-squid.png", castawaySquid, waterEnemyPalette],
    // Powered / fire player tiers (palette-swapped castaway frames).
    ["castaway-idle-powered.png", castawayIdle, poweredPlayerPalette],
    ["castaway-walk-1-powered.png", castawayWalk1, poweredPlayerPalette],
    ["castaway-walk-2-powered.png", castawayWalk2, poweredPlayerPalette],
    ["castaway-jump-powered.png", castawayJump, poweredPlayerPalette],
    ["castaway-crouch-powered.png", castawayCrouch, poweredPlayerPalette],
    ["castaway-climb-powered.png", castawayClimb, poweredPlayerPalette],
    ["castaway-swim-powered.png", castawaySwimA, poweredPlayerPalette],
    ["castaway-swim-2-powered.png", castawaySwimB, poweredPlayerPalette],
    ["castaway-idle-fire.png", castawayIdle, firePlayerPalette],
    ["castaway-walk-1-fire.png", castawayWalk1, firePlayerPalette],
    ["castaway-walk-2-fire.png", castawayWalk2, firePlayerPalette],
    ["castaway-jump-fire.png", castawayJump, firePlayerPalette],
    ["castaway-crouch-fire.png", castawayCrouch, firePlayerPalette],
    ["castaway-climb-fire.png", castawayClimb, firePlayerPalette],
    ["castaway-swim-fire.png", castawaySwimA, firePlayerPalette],
    ["castaway-swim-2-fire.png", castawaySwimB, firePlayerPalette],
    // On-fire frames (god mode on lava), every costume and tier: the idle
    // frame under the shared flame overlay.
    // On-fire frames (god mode on lava): two flame phases per costume/tier,
    // flames leaning behind a rightward runner (the shell flips the sprite
    // to face the other way).
    ...[1, 2].flatMap((phase) => [
      [
        `castaway-burning-${phase}.png`,
        burningGrid(castawayIdle, phase),
        burningPalette(palette),
      ],
      [
        `castaway-burning-${phase}-powered.png`,
        burningGrid(castawayIdle, phase),
        burningPalette(poweredPlayerPalette),
      ],
      [
        `castaway-burning-${phase}-fire.png`,
        burningGrid(castawayIdle, phase),
        burningPalette(firePlayerPalette),
      ],
      ...[luigiCostume, ...robotCostumes].flatMap((costume) => [
        [
          `${costume.key}-burning-${phase}.png`,
          burningGrid(costume.poses.idle, phase),
          burningPalette(costume.palettes.base),
        ],
        [
          `${costume.key}-burning-${phase}-powered.png`,
          burningGrid(costume.poses.idle, phase),
          burningPalette(costume.palettes.powered),
        ],
        [
          `${costume.key}-burning-${phase}-fire.png`,
          burningGrid(costume.poses.idle, phase),
          burningPalette(costume.palettes.fire),
        ],
      ]),
      ...[goombaCostume, princessCostume].flatMap((costume) => {
        const size = costume.frameSizePixels ?? spriteSize;
        return [
          [
            `${costume.key}-burning-${phase}.png`,
            burningGrid(costume.poses.idle, phase),
            burningPalette(costume.palette),
            size,
            size,
          ],
          [
            `${costume.key}-burning-${phase}-powered.png`,
            burningGrid(costume.poses.idle, phase),
            burningPalette(costume.palette),
            size,
            size,
          ],
          [
            `${costume.key}-burning-${phase}-fire.png`,
            burningGrid(costume.poses.idle, phase),
            burningPalette(costume.palette),
            size,
            size,
          ],
        ];
      }),
    ]),
    // Full green companion costume — distinct art (base/powered/fire per pose).
    ...costumeSpriteFiles(luigiCostume),
    // Four distinct robots (base/powered/fire per pose) plus each robot's own
    // dismemberment body parts, recoloured to that robot's palette.
    ...robotCostumes.flatMap(costumeSpriteFiles),
    ...robotCostumes.flatMap(robotPartFiles),
    // Revenge mode: the tall Goomba + Princess players and the half-height
    // Mario/Luigi "enemy" frames (walk / jump / eye-bulge stomp).
    ...singleTierCostumeFiles(goombaCostume),
    ...singleTierCostumeFiles(princessCostume),
    ...revengeEnemyFiles(),
    [
      `${revengeStompPop.key}.png`,
      revengeStompPop.grid,
      revengeStompPop.palette,
    ],
    // Background scenery.
    ["scenery-cloud-left.png", sceneryCloudLeft, sceneryPalette],
    ["scenery-cloud-middle.png", sceneryCloudMiddle, sceneryPalette],
    ["scenery-cloud-right.png", sceneryCloudRight, sceneryPalette],
    ["scenery-bush-left.png", sceneryBushLeft, sceneryPalette],
    ["scenery-bush-middle.png", sceneryBushMiddle, sceneryPalette],
    ["scenery-bush-right.png", sceneryBushRight, sceneryPalette],
    ["scenery-hill-left.png", sceneryHillLeft, sceneryPalette],
    ["scenery-hill-peak.png", sceneryHillPeak, sceneryPalette],
    ["scenery-hill-right.png", sceneryHillRight, sceneryPalette],
    ["scenery-hill-fill.png", sceneryHillFill, sceneryPalette],
    ["scenery-fence.png", sceneryFence, sceneryPalette],
    ["scenery-tree-top.png", sceneryTreeTop, sceneryPalette],
    ["scenery-tree-top-small.png", sceneryTreeTopSmall, sceneryPalette],
    ["scenery-trunk.png", sceneryTrunk, sceneryPalette],
    ["scenery-mushroom-stem.png", sceneryMushroomStem, sceneryPalette],
    ["scenery-rail.png", sceneryRail, sceneryPalette],
    ["castle-wall.png", castleWall, stonePalette],
    ["castle-battlement.png", castleBattlement, stonePalette],
    ["castle-window.png", castleWindow, stonePalette],
    ["castle-door.png", castleDoor, stonePalette],
    ["water-surface.png", waterSurface, waterPalette],
    ["water-body.png", waterBody, waterPalette],
    ["lava-surface.png", lavaSurface, lavaPalette],
    ["lava-body.png", lavaBody, lavaPalette],
    ["coral.png", coralBank, coralPalette],
    // Mechanisms, projectiles, and the goal pennant.
    ["flame-orb.png", flameOrb, flamePalette, 8, 8],
    ["podoboo.png", podoboo, flamePalette],
    ["projectile-fireball.png", projectileFireball, flamePalette, 8, 8],
    ["flame-jet.png", flameJet, flamePalette, 16, 8],
    ["projectile-hammer.png", projectileHammer, hammerPalette, 8, 8],
    ["projectile-egg.png", projectileEgg, eggPalette, 8, 8],
    ["lift-plank.png", liftPlank, sceneryPalette, 16, 8],
    ["flag-pennant.png", flagPennant, flagPalette],
  ];
  for (const [fileName, grid, paletteMap, width, height] of sprites) {
    await writeFile(
      resolve(outDir, fileName),
      drawSprite(grid, paletteMap, width, height),
    );
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
    "pipe-top-left": spriteEntry("tile-pipe-top-left.png"),
    "pipe-top-right": spriteEntry("tile-pipe-top-right.png"),
    "pipe-left": spriteEntry("tile-pipe-left.png"),
    "pipe-right": spriteEntry("tile-pipe-right.png"),
    "pipe-side-mouth-top": spriteEntry("tile-pipe-side-mouth-top.png"),
    "pipe-side-mouth-bottom": spriteEntry("tile-pipe-side-mouth-bottom.png"),
    "pipe-side-shaft-top": spriteEntry("tile-pipe-side-shaft-top.png"),
    "pipe-side-shaft-bottom": spriteEntry("tile-pipe-side-shaft-bottom.png"),
    "pipe-side-joint-top": spriteEntry("tile-pipe-side-joint-top.png"),
    "pipe-side-joint-bottom": spriteEntry("tile-pipe-side-joint-bottom.png"),
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
    gate: spriteEntry("tile-none.png"),
    // Decoded background scenery (empty-collision decorative tiles).
    "scenery-cloud-left": spriteEntry("scenery-cloud-left.png"),
    "scenery-cloud-middle": spriteEntry("scenery-cloud-middle.png"),
    "scenery-cloud-right": spriteEntry("scenery-cloud-right.png"),
    "scenery-bush-left": spriteEntry("scenery-bush-left.png"),
    "scenery-bush-middle": spriteEntry("scenery-bush-middle.png"),
    "scenery-bush-right": spriteEntry("scenery-bush-right.png"),
    "scenery-hill-left": spriteEntry("scenery-hill-left.png"),
    "scenery-hill-peak": spriteEntry("scenery-hill-peak.png"),
    "scenery-hill-right": spriteEntry("scenery-hill-right.png"),
    "scenery-hill-fill": spriteEntry("scenery-hill-fill.png"),
    "scenery-fence": spriteEntry("scenery-fence.png"),
    "scenery-tree-top": spriteEntry("scenery-tree-top.png"),
    "scenery-tree-top-small": spriteEntry("scenery-tree-top-small.png"),
    "scenery-trunk": spriteEntry("scenery-trunk.png"),
    "scenery-mushroom-stem": spriteEntry("scenery-mushroom-stem.png"),
    "scenery-rail": spriteEntry("scenery-rail.png"),
    "castle-wall": spriteEntry("castle-wall.png"),
    "castle-battlement": spriteEntry("castle-battlement.png"),
    "castle-window": spriteEntry("castle-window.png"),
    "castle-door": spriteEntry("castle-door.png"),
    "water-surface": spriteEntry("water-surface.png"),
    "water-body": spriteEntry("water-body.png"),
    "lava-surface": spriteEntry("lava-surface.png"),
    "lava-body": spriteEntry("lava-body.png"),
    coral: spriteEntry("coral.png"),
    // Goal furniture (looked up by the shell's flagpole renderer).
    "flagpole-flag": spriteEntry("flag-pennant.png"),
  };

  const descriptor = {
    id: "castaway-parody",
    title: "Shabby Castaway (parody)",
    origin: "authored",
    reactionStyle: "exaggerated",
    reactionSprites: {
      "player-head-bonk": spriteEntry("castaway-ouch.png"),
      "enemy-stomped": spriteEntry("grumbler-squashed.png"),
      // Death-effect overlays: X-ed-out eyes (drown/impale) and rising smoke
      // (burn). Authored art so every death effect has its own graphics.
      "player-dead-eyes": spriteEntry("castaway-dead-eyes.png"),
      "smoke-puff": spriteEntry("smoke-puff.png"),
      "burn-flame": spriteEntry("burn-flame.png"),
      "explosion-burst": spriteEntry("explosion-burst.png"),
      "burned-husk": spriteEntry("burned-husk.png"),
      "part-head": spriteEntry("part-head.png"),
      "part-torso": spriteEntry("part-torso.png"),
      "part-arm": spriteEntry("part-arm.png"),
      "part-leg": spriteEntry("part-leg.png"),
      "rescued-friend": spriteEntry("rescued-friend.png"),
      "freed-attendant": spriteEntry("freed-attendant.png"),
      // Each robot's own body parts, so a bot explodes into its own colours.
      ...Object.fromEntries(
        robotCostumes.flatMap((costume) =>
          ["head", "torso", "arm", "leg"].map((part) => [
            `${costume.key}-part-${part}`,
            spriteEntry(`${costume.key}-part-${part}.png`),
          ]),
        ),
      ),
      // Revenge mode: the half-height Mario/Luigi enemy frames (walk / jump /
      // eye-bulge stomp) for every (type, colour) variant, looked up directly by
      // the shell when it re-skins the enemies as stompable heroes.
      ...Object.fromEntries(
        revengeEnemyVariants.flatMap((variant) =>
          Object.keys(variant.poses).map((pose) => [
            `${variant.key}-${pose}`,
            spriteEntry(`${variant.key}-${pose}.png`),
          ]),
        ),
      ),
      // Revenge mode: the Mario-head-with-bulging-eyes stomp pop, shown in place
      // of the default squashed-enemy reaction when a Goomba stomps a hero.
      [revengeStompPop.key]: spriteEntry(`${revengeStompPop.key}.png`),
    },
    playerSprite: {
      ...spriteEntry("castaway-idle.png"),
      stateSprites: playerStateSprites(),
    },
    actorSprites: {
      // Every vglc-smb actor id the importer can emit is covered so any decoded
      // SMB level renders fully (no vector fallbacks), reusing this skin's art.
      "vglc-smb-enemy": walkingEnemySprite("grumbler-idle.png"),
      "vglc-smb-throwing-enemy": walkingEnemySprite("hurler.png"),
      "vglc-smb-aerial-throwing-enemy": walkingEnemySprite("cloud-tosser.png"),
      "vglc-smb-koopa": {
        ...shelledEnemySprite("snapper-walk.png", "snapper-shell.png"),
        stateSprites: {
          ...shelledEnemySprite("snapper-walk.png", "snapper-shell.png")
            .stateSprites,
          "walk-left-1": spriteEntry("snapper-elvis-1.png", 16, 24),
          "walk-left-2": spriteEntry("snapper-elvis-2.png", 16, 24),
          "walk-right-1": spriteEntry("snapper-elvis-2.png", 16, 24),
          "walk-right-2": spriteEntry("snapper-elvis-1.png", 16, 24),
        },
      },
      "vglc-smb-parakoopa": wingedEnemySprite(
        "snapper-walk.png",
        "snapper-shell.png",
        "snapper-winged.png",
      ),
      "vglc-smb-turtle": shelledEnemySprite(
        "buzzy-shell.png",
        "buzzy-shell.png",
      ),
      "vglc-smb-cheep": walkingEnemySprite("castaway-fish.png"),
      "vglc-smb-blooper": walkingEnemySprite("castaway-squid.png"),
      "vglc-smb-koopa-red": {
        ...shelledEnemySprite("snapper-red-walk.png", "snapper-red-shell.png"),
        stateSprites: {
          ...shelledEnemySprite("snapper-red-walk.png", "snapper-red-shell.png")
            .stateSprites,
          "walk-left-1": spriteEntry("snapper-red-elvis-1.png", 16, 24),
          "walk-left-2": spriteEntry("snapper-red-elvis-2.png", 16, 24),
          "walk-right-1": spriteEntry("snapper-red-elvis-2.png", 16, 24),
          "walk-right-2": spriteEntry("snapper-red-elvis-1.png", 16, 24),
        },
      },
      "vglc-smb-parakoopa-red": wingedEnemySprite(
        "snapper-red-walk.png",
        "snapper-red-shell.png",
        "snapper-red-winged.png",
      ),
      "vglc-smb-parakoopa-hopper": wingedEnemySprite(
        "snapper-walk.png",
        "snapper-shell.png",
        "snapper-winged.png",
      ),
      "vglc-smb-spiny": walkingEnemySprite("urchin-walk.png"),
      "vglc-smb-piranha": walkingEnemySprite("kelp-trap.png"),
      // Mechanism/projectile art (looked up by the shell's dedicated
      // renderers, not by level actors).
      "mechanism-flame-orb": spriteEntry("flame-orb.png", 8, 8),
      "mechanism-podoboo": spriteEntry("podoboo.png"),
      "mechanism-lift": spriteEntry("lift-plank.png", 16, 8),
      "projectile-fireball": spriteEntry("projectile-fireball.png", 8, 8),
      "projectile-hammer": spriteEntry("projectile-hammer.png", 8, 8),
      "projectile-flame": spriteEntry("flame-jet.png", 16, 8),
      "projectile-egg": spriteEntry("projectile-egg.png", 8, 8),
      "vglc-smb-bowser": bossEnemySprite(
        "warden-boss-1.png",
        "warden-boss-2.png",
      ),
      "vglc-smb-bowser-hammers": bossEnemySprite(
        "warden-boss-hammer-1.png",
        "warden-boss-hammer-2.png",
      ),
      "vglc-smb-bullet": walkingEnemySprite("bullet-slug.png"),
      "vglc-smb-coin": spriteEntry("tile-shell.png"),
      "vglc-smb-question-block-contents": spriteEntry("tile-shell.png"),
      "vglc-smb-power-up": spriteEntry("castaway-powerup.png"),
      "vglc-smb-fire-flower": spriteEntry("fire-bloom.png"),
      "vglc-smb-extra-life": spriteEntry("castaway-1up.png"),
      "vglc-smb-invincibility": spriteEntry("castaway-star.png"),
      "vglc-smb-climbable": spriteEntry("tile-bamboo.png"),
      "vglc-smb-transition-pipe": spriteEntry("tile-bamboo.png"),
      "vglc-smb-transition-pipe-a": spriteEntry("tile-bamboo.png"),
      "vglc-smb-transition-pipe-b": spriteEntry("tile-bamboo.png"),
      "open-gate": spriteEntry("gate-axe.png"),
      // Level-editor actor ids — the editor's whole cast renders with this
      // skin's art (no fallback capsules).
      beetle: walkingEnemySprite("grumbler-idle.png"),
      flutterby: walkingEnemySprite("grumbler-idle.png"),
      shellback: shelledEnemySprite("snapper-walk.png", "snapper-shell.png"),
      "buzzy-beetle": shelledEnemySprite("buzzy-shell.png", "buzzy-shell.png"),
      "chomp-bud": walkingEnemySprite("kelp-trap.png"),
      "hammer-bro": walkingEnemySprite("hurler.png"),
      "cloud-tosser": walkingEnemySprite("cloud-tosser.png"),
      "spike-hunter": walkingEnemySprite("urchin-walk.png"),
      "snapper-red": shelledEnemySprite(
        "snapper-red-walk.png",
        "snapper-red-shell.png",
      ),
      "snapper-winged": wingedEnemySprite(
        "snapper-walk.png",
        "snapper-shell.png",
        "snapper-winged.png",
      ),
      urchin: walkingEnemySprite("urchin-walk.png"),
      "keep-warden": walkingEnemySprite("warden.png"),
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

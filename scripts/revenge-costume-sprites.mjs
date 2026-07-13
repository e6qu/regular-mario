// Authored 16x16 sprites for "Revenge" mode: you play a tall Goomba (or the
// Princess) and stomp half-height Mario/Luigi "enemies". All original pixel art
// (one char per pixel indexing a palette), matching the parody set's format so
// the parody builder emits them and keys them with a character prefix
// (goomba-*, princess-*) or as revenge enemy sprites.

// ---------------------------------------------------------------------------
// Tall Goomba player: as tall as Mario, same width, but unmistakably a Goomba —
// a brown mushroom cap, angry slanted brows over white eyes, a fanged frown, and
// two little feet. Stretched vertically into a full-height body.
// ---------------------------------------------------------------------------
export const goombaPalette = {
  ".": [0, 0, 0, 0],
  G: [156, 100, 56, 255], // cap brown
  g: [112, 68, 38, 255], // brown shadow / outline
  L: [206, 162, 112, 255], // lighter lower body
  e: [30, 24, 20, 255], // eyes / brows / mouth
  w: [245, 245, 240, 255], // eye white
  f: [72, 46, 30, 255], // feet
  t: [236, 236, 228, 255], // fang
};
const goombaIdle = [
  "................",
  ".....gGGGGg.....",
  "...ggGGGGGGgg...",
  "..gGGGGGGGGGGg..",
  "..gGGGGGGGGGGg..",
  "..gGeeeGGeeeGg..",
  "..gGwweGGewwGg..",
  "..gGeewGGweeGg..",
  "..gGGGGGGGGGGg..",
  "..gGGetGGteGGg..",
  "..gLGGGGGGGGLg..",
  "..gLLGGGGGGLLg..",
  "...gLLGGGGLLg...",
  "....ffff ffff...",
  "...ffff..ffff...",
  "................",
];
const goombaWalk1 = [
  "................",
  ".....gGGGGg.....",
  "...ggGGGGGGgg...",
  "..gGGGGGGGGGGg..",
  "..gGGGGGGGGGGg..",
  "..gGeeeGGeeeGg..",
  "..gGwweGGewwGg..",
  "..gGeewGGweeGg..",
  "..gGGGGGGGGGGg..",
  "..gGGetGGteGGg..",
  "..gLGGGGGGGGLg..",
  "..gLLGGGGGGLLg..",
  "...gLLGGGGLLg...",
  "...ffff..ffff...",
  "..ffff....ffff..",
  "................",
];
const goombaWalk2 = [
  "................",
  ".....gGGGGg.....",
  "...ggGGGGGGgg...",
  "..gGGGGGGGGGGg..",
  "..gGGGGGGGGGGg..",
  "..gGeeeGGeeeGg..",
  "..gGwweGGewwGg..",
  "..gGeewGGweeGg..",
  "..gGGGGGGGGGGg..",
  "..gGGetGGteGGg..",
  "..gLGGGGGGGGLg..",
  "..gLLGGGGGGLLg..",
  "...gLLGGGGLLg...",
  "....ffffffff....",
  "....ff....ff....",
  "................",
];
const goombaJump = [
  "................",
  ".....gGGGGg.....",
  "...ggGGGGGGgg...",
  "..gGGGGGGGGGGg..",
  "..gGGGGGGGGGGg..",
  "..gGeeeGGeeeGg..",
  "..gGwweGGewwGg..",
  "..gGeewGGweeGg..",
  "..gGGGGGGGGGGg..",
  "..gGGetGGteGGg..",
  "..gLGGGGGGGGLg..",
  "..gLLGGGGGGLLg..",
  "..fLLGGGGLLf....",
  ".ff..gLLg..ff...",
  "................",
  "................",
];

// ---------------------------------------------------------------------------
// Princess player: a crowned princess in a pink gown (built out from the shared
// rescued-friend design into idle/walk/jump poses). Slightly narrower gown so
// the legs read while walking.
// ---------------------------------------------------------------------------
export const princessPlayerPalette = {
  ".": [0, 0, 0, 0],
  c: [232, 194, 66, 255], // crown gold
  j: [120, 200, 232, 255], // crown jewel
  H: [236, 208, 124, 255], // hair (blonde)
  s: [238, 202, 170, 255], // skin
  S: [206, 168, 138, 255], // skin shadow
  e: [40, 30, 30, 255], // eyes
  D: [232, 120, 172, 255], // gown
  d: [198, 88, 140, 255], // gown shadow
  b: [64, 44, 30, 255], // shoes
};
const princessIdle = [
  "................",
  ".....cjcjc......",
  "....ccccccc.....",
  "....HHHHHHH.....",
  "...HHsssssHH....",
  "...HHsesesHH....",
  "...HsssssssH....",
  "....SssssS......",
  ".....DDDDD......",
  "....DDDDDDD.....",
  "...DDDDDDDDD....",
  "...DdDDDDDdD....",
  "..DDDDDDDDDDD...",
  "..dddddddddd...",
  "...bb....bb....",
  "................",
];
const princessWalk1 = [
  "................",
  ".....cjcjc......",
  "....ccccccc.....",
  "....HHHHHHH.....",
  "...HHsssssHH....",
  "...HHsesesHH....",
  "...HsssssssH....",
  "....SssssS......",
  ".....DDDDD......",
  "....DDDDDDD.....",
  "...DDDDDDDDD....",
  "...DdDDDDDdD....",
  "..DDDDDDDDD.....",
  "..dddddddd.....",
  "..bb....bb.....",
  ".bb........bb..",
];
const princessWalk2 = [
  "................",
  ".....cjcjc......",
  "....ccccccc.....",
  "....HHHHHHH.....",
  "...HHsssssHH....",
  "...HHsesesHH....",
  "...HsssssssH....",
  "....SssssS......",
  ".....DDDDD......",
  "....DDDDDDD.....",
  "...DDDDDDDDD....",
  "...DdDDDDDdD....",
  "..DDDDDDDDDDD...",
  "...dddddddd....",
  "....bb.bb......",
  "................",
];
const princessJump = [
  "................",
  ".s...cjcjc...s..",
  "ss..ccccccc..ss.",
  ".s..HHHHHHH..s..",
  "...HHsssssHH....",
  "...HHsesesHH....",
  "..sHsssssssHs...",
  "..s.SssssS.s....",
  ".....DDDDD......",
  "....DDDDDDD.....",
  "...DDDDDDDDD....",
  "...DdDDDDDdD....",
  "..DDDDDDDDDDD...",
  "..dd.dddd.dd...",
  ".bb........bb..",
  "................",
];

// ---------------------------------------------------------------------------
// Half-height Mario/Luigi "enemies": same width as a normal actor but squashed
// to half height (short torso + stubby legs), sitting in the lower rows of the
// frame. A cap, a big nose + moustache, dungarees. The stomped frame flattens
// them further and bulges the eyes wide (the exaggerated "itsa-me" yelp).
//   C cap+shirt   c cap shadow   s skin   S skin shadow   m moustache/hair
//   O overalls    o overalls shadow   e eyes   w eye white   b boots   B button
// Each enemy supplies its own palette (Mario red / Luigi green) over these keys.
const shortHeroWalk1 = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "....CCCCC.......",
  "...CCCCCCc......",
  "...ssSssss......",
  "...smmmmss......",
  "...OOCCCOO......",
  "..OoOBBOoO......",
  "..OOOOOOOO......",
  "...bb..bb......",
  "..bbb..bbb.....",
  "................",
  "................",
];
const shortHeroWalk2 = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "....CCCCC.......",
  "...CCCCCCc......",
  "...ssSssss......",
  "...smmmmss......",
  "...OOCCCOO......",
  "..OoOBBOoO......",
  "...OOOOOO.......",
  "..bb....bb.....",
  ".bbb....bbb....",
  "................",
  "................",
];
// Stomped: driven into the ground, cap crushed down, eyes bulging wide open in
// shock (the "itsa-me!" yelp).
const shortHeroStomped = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..CCCCCCCCCC....",
  "..CcCCCCCCcC....",
  ".swwSssswws....",
  ".sweSsssews....",
  ".ssmmmmmmss....",
  ".OOOOOOOOOO....",
  ".ObbOOOObbO....",
  "..bb....bb.....",
  "................",
];
const shortHeroJump = [
  "................",
  "................",
  "................",
  "................",
  "....CCCCC.......",
  "...CCCCCCc......",
  "...ssSssss......",
  "...smmmmss......",
  "..s OOCCO s.....",
  "..sOoOBBOos....",
  "...OOOOOO......",
  "..bb....bb.....",
  ".bb......bb....",
  "................",
  "................",
  "................",
];

export const marioEnemyPalette = {
  ".": [0, 0, 0, 0],
  C: [216, 56, 44, 255], // red cap + shirt
  c: [158, 34, 28, 255], // red shadow
  s: [238, 194, 150, 255], // skin
  S: [206, 158, 118, 255], // skin shadow
  m: [92, 56, 32, 255], // moustache / hair
  O: [70, 92, 170, 255], // overalls blue
  o: [48, 66, 132, 255], // overalls shadow
  e: [34, 28, 28, 255], // eyes
  w: [246, 246, 242, 255], // eye white
  b: [74, 50, 32, 255], // boots
  B: [232, 206, 96, 255], // buttons
};
export const luigiEnemyPalette = {
  ...marioEnemyPalette,
  C: [72, 168, 82, 255], // green cap + shirt
  c: [42, 118, 52, 255], // green shadow
};

export const goombaCostume = {
  key: "goomba",
  poses: {
    idle: goombaIdle,
    "walk-1": goombaWalk1,
    "walk-2": goombaWalk2,
    jump: goombaJump,
  },
  palette: goombaPalette,
};

export const princessCostume = {
  key: "princess",
  poses: {
    idle: princessIdle,
    "walk-1": princessWalk1,
    "walk-2": princessWalk2,
    jump: princessJump,
  },
  palette: princessPlayerPalette,
};

// The half-height hero "enemies" a Goomba stomps in revenge mode, one entry per
// colour. `walk1`/`walk2` animate the patrol; `stomped` is the eye-bulge squash.
export const revengeHeroEnemies = [
  {
    key: "mario-enemy",
    palette: marioEnemyPalette,
  },
  {
    key: "luigi-enemy",
    palette: luigiEnemyPalette,
  },
];
export const revengeHeroGrids = {
  "walk-1": shortHeroWalk1,
  "walk-2": shortHeroWalk2,
  stomped: shortHeroStomped,
  jump: shortHeroJump,
};

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

// The base hero palette carries the Mario/Luigi body colours PLUS a shared set
// of "true type" marker glyphs, so one palette renders every enemy-type helmet
// (Koopa shell, Hammer Bro helmet, Spiny shell, Lakitu cloud, Piranha bud) drawn
// over the same body. A Goomba wears no helmet — it is just a full Mario. Only
// the tunic colour (C/c) differs between Mario (red) and Luigi (green).
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
  K: [98, 182, 72, 255], // Koopa shell green
  k: [46, 110, 40, 255], // Koopa shell dark / segment lines
  R: [238, 224, 150, 255], // Koopa shell rim cream
  H: [86, 116, 92, 255], // Hammer Bro helmet
  h: [44, 66, 50, 255], // Hammer Bro helmet dark
  V: [156, 186, 158, 255], // Hammer Bro visor
  P: [220, 100, 56, 255], // Spiny shell orange
  p: [150, 52, 32, 255], // Spiny shell dark
  Q: [242, 238, 224, 255], // spike / spot cream
  W: [236, 240, 248, 255], // Lakitu cloud white
  U: [198, 206, 220, 255], // Lakitu cloud shadow
  Z: [212, 66, 70, 255], // Piranha bud red
  z: [150, 40, 46, 255], // Piranha bud dark red
  E: [88, 168, 72, 255], // Piranha leaf green
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

// A "type marker" is a small helmet/hat drawn over the hero's head so a stomped
// hero still reads as the real enemy it stands in for. Each marker is a 16-wide
// overlay anchored to the upright walk head (the cap at rows 5-6); non-empty
// cells overwrite the body, '.' keeps it. The same overlay is nudged up one row
// for the higher jump head and down two rows for the squashed stomp head, so one
// design covers every frame.
const typeMarkers = {
  // Goomba: a plain, full Mario/Luigi in his own cap — no helmet at all. (The
  // empty overlay keeps the base body, so the tunic-coloured cap shows through.)
  goomba: [
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
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Koopa Troopa: a domed green shell with segment lines and a cream brim.
  koopa: [
    "................",
    "................",
    "................",
    "....kKKKKk......",
    "..kKKKKKKKKk....",
    "..kKkKKKKkKk....",
    "..RRRRRRRRRR....",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Hammer Bro: a horned combat helmet with a light visor band.
  hammer: [
    "................",
    "................",
    ".....hVh........",
    "...hHHHHHHh.....",
    "..hHHHHHHHHh....",
    "..hHHHHHHHHh....",
    "..hVVVVVVVVh....",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Spiny: a red shell bristling with pale spikes.
  spiny: [
    "................",
    "................",
    "..Q.Q.Q.Q.Q....",
    "..pPPPPPPPPp....",
    "..pPPPPPPPPp....",
    "..pPPPPPPPPp....",
    "..pppppppppp....",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Lakitu: peeking over a little white cloud, green shell on top.
  lakitu: [
    "................",
    "................",
    "...kKKKKk.......",
    "..kKKKKKKk.....",
    "..WUWWUWWUW....",
    "..UWWUWWUWU....",
    "..WUWWUWWUW....",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Piranha Plant: a red bud with cream spots between two green leaves.
  piranha: [
    "................",
    "................",
    "..E.EZZE.E......",
    "..EZZZZZZZE.....",
    "..ZQZZZZQZZ.....",
    "..ZZZZZZZZZZ....",
    "..zzzzzzzzzz....",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
};

// Shift a 16-tall grid up (negative) or down (positive) by `rows`, padding the
// vacated rows with empty cells so it stays 16 tall.
function shiftGrid(grid, rows) {
  const empty = ".".repeat(16);
  if (rows === 0) {
    return grid.slice();
  }
  if (rows > 0) {
    return [...Array.from({ length: rows }, () => empty), ...grid].slice(0, 16);
  }
  return [...grid.slice(-rows), ...Array.from({ length: -rows }, () => empty)];
}

// Composite a marker overlay onto a body grid: any non-empty marker cell wins.
function applyMarker(body, marker) {
  return body.map((row, y) => {
    const markerRow = marker[y] ?? "";
    let out = "";
    for (let x = 0; x < 16; x += 1) {
      const markerCell = markerRow[x] ?? ".";
      out += markerCell === "." ? (row[x] ?? ".") : markerCell;
    }
    return out;
  });
}

// The half-height hero body, one grid per pose, plus how far its type marker
// shifts to sit on that pose's head (the jump head is one row higher, the stomp
// head two rows lower than the walk head).
const revengeHeroBodies = {
  "walk-1": { grid: shortHeroWalk1, markerShift: 0 },
  "walk-2": { grid: shortHeroWalk2, markerShift: 0 },
  jump: { grid: shortHeroJump, markerShift: -1 },
  stomped: { grid: shortHeroStomped, markerShift: 2 },
};

// Mario (red) vs Luigi (green): the shell picks one per enemy by a stable hash.
export const revengeEnemyColors = [
  { key: "mario", palette: marioEnemyPalette },
  { key: "luigi", palette: luigiEnemyPalette },
];
export const revengeEnemyTypeKeys = Object.keys(typeMarkers);

// Every (type, colour) variant with its four composited pose grids, keyed
// `${type}-${colour}` (e.g. "koopa-mario") to match the shell's lookup. Each is
// a half-height Mario/Luigi wearing its true enemy type as a helmet.
export const revengeEnemyVariants = revengeEnemyTypeKeys.flatMap((type) =>
  revengeEnemyColors.map((color) => ({
    key: `${type}-${color.key}`,
    palette: color.palette,
    poses: Object.fromEntries(
      Object.entries(revengeHeroBodies).map(([pose, body]) => [
        pose,
        applyMarker(body.grid, shiftGrid(typeMarkers[type], body.markerShift)),
      ]),
    ),
  })),
);

// The stomp "pop" for revenge mode: a full Mario head with eyes bulging out of
// their sockets (the over-acted "itsa-me!" shock), branded as Mario rather than
// the default squashed-enemy reaction. Drawn at the stomped hero's position when
// a Goomba lands on them.
const revengeStompPopGrid = [
  "................",
  ".....CCCCC......",
  "...CCCCCCCCC....",
  "..CCCCCCCCCCC...",
  "..ssssssssss....",
  ".wwwwsssssswwww.",
  ".weewssssssweew.",
  ".weewssssssweew.",
  ".wwwwsssssswwww.",
  "...sssSSsss.....",
  "..mmmm..mmmm....",
  "..mmmmssmmmm....",
  "...ssssssss.....",
  "................",
  "................",
  "................",
];
export const revengeStompPop = {
  key: "revenge-stomp-pop",
  grid: revengeStompPopGrid,
  palette: marioEnemyPalette,
};

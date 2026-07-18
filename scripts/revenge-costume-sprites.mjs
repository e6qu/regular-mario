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

// ---------------------------------------------------------------------------
// Fluid 32x32 princess frames (Prince-of-Persia-inspired). Cloth and hair are
// driven by a TRAVELING wave: offset(depth, t) = A(depth) * sin(k*depth - w*t),
// with the amplitude growing toward the free end — the way real fabric whips.
// The body itself bobs and the arms swing through the 6-phase stride, so the
// cloth has motion to react to. Art faces RIGHT; the shell flips it.
// (Math.sin runs at BUILD time only — the game stays deterministic.)
// ---------------------------------------------------------------------------
function blankGrid32() {
  return Array.from({ length: 32 }, () =>
    Array.from({ length: 32 }, () => "."),
  );
}
function plotPx(grid, x, y, letter) {
  if (y >= 0 && y < 32 && x >= 0 && x < 32) {
    const row = grid[y];
    if (row !== undefined) {
      row[Math.round(x)] = letter;
    }
  }
}
function fillPx(grid, x0, y0, width, height, letter) {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      plotPx(grid, x, y, letter);
    }
  }
}
function gridRows(grid) {
  return grid.map((row) => row.join(""));
}

// The traveling cloth wave: phase in [0..cycle), depth = rows from the
// attachment point. Amplitude ramps in over the first 8 rows of depth.
function clothWave(depth, phase, cycle, amplitude, wavelengthRows) {
  const envelope = Math.min(1, depth / 8);
  return Math.round(
    amplitude *
      envelope *
      Math.sin((2 * Math.PI * phase) / cycle - depth / wavelengthRows),
  );
}

function princessProfileFrame(params) {
  const {
    phase = 0,
    cycle = 6,
    sweep = 3,
    hairSweep = 3,
    hairLift = 0,
    bob = 0,
    lean = 0,
    bell = 0,
    legsShown = true,
    train = 6,
    waveAmplitude = 2.5,
  } = params;
  const g = blankGrid32();
  const headX = 15 + lean;
  const topY = bob; // the whole body dips on contact steps

  // Waist-length hair whipping on the traveling wave.
  for (let y = 3 + topY - hairLift; y <= 23 - hairLift; y += 1) {
    const depth = y - (3 + topY - hairLift);
    const drift = Math.min(9, Math.round((depth * (2 + hairSweep)) / 6));
    const wave = clothWave(depth, phase, cycle, waveAmplitude, 2.6);
    const backX = headX - 2 - drift + wave;
    const width =
      depth < 3
        ? 8
        : Math.max(3, 5 + Math.round(depth / 5) - Math.floor(depth / 9));
    fillPx(g, backX, y, width, 1, "H");
    plotPx(g, backX, y, "G");
  }
  // Head profile + crown riding the bob.
  fillPx(g, headX, 4 + topY, 7, 7, "s");
  fillPx(g, headX + 1, 10 + topY, 5, 1, "S");
  fillPx(g, headX, 3 + topY, 7, 2, "H");
  plotPx(g, headX + 6, 4 + topY, "H");
  fillPx(g, headX + 1, 1 + topY, 5, 2, "c");
  plotPx(g, headX + 1, 0 + topY, "j");
  plotPx(g, headX + 3, 0 + topY, "j");
  plotPx(g, headX + 5, 0 + topY, "j");
  plotPx(g, headX + 5, 6 + topY, "e");
  plotPx(g, headX + 7, 7 + topY, "s");
  plotPx(g, headX + 7, 8 + topY, "S");
  // Neck + bodice.
  fillPx(g, headX + 1, 11 + topY, 3, 1, "s");
  fillPx(g, 14 + lean, 12 + topY, 6, 3, "D");
  fillPx(g, 14 + lean, 14 + topY, 6, 1, "d");
  // The forward arm swings with the stride phase.
  const armSwing = Math.round(3 * Math.sin((2 * Math.PI * phase) / cycle));
  fillPx(g, 19 + lean + armSwing, 12 + topY, 2, 4, "s");
  // Gown bell, centre drifting back with the sweep; the bell swells with
  // the parachute parameter.
  const hemY = Math.min(29, 27 + Math.min(2, bell));
  for (let y = 15 + topY; y <= hemY; y += 1) {
    const depth = y - (15 + topY);
    const span = hemY - (15 + topY);
    // A filled parachute rounds off: the last rows pull back in.
    const rounding = bell >= 4 && y >= hemY - 1 ? (y === hemY ? 3 : 1) : 0;
    const half =
      3 + Math.round((depth * (6 + bell)) / Math.max(1, span)) - rounding;
    const drift = Math.round((depth * sweep) / Math.max(1, span));
    const flow = clothWave(depth + 4, phase, cycle, waveAmplitude * 0.7, 3.2);
    const x0 = 16 - half - drift + Math.min(0, flow);
    const width = half * 2 + 1 + Math.abs(flow);
    fillPx(g, x0, y, width, 1, "D");
    fillPx(g, x0, y, 2, 1, "d");
    plotPx(g, x0 + width - 1, y, "d");
  }
  // The dragging train: whips vertically with its own, tip-heavy wave.
  const trainBaseX = 16 - 9 - sweep;
  for (let step = 1; step <= train; step += 1) {
    const whip = clothWave(step + 6, phase, cycle, 2.2, 2.0);
    const trainY = hemY - Math.floor(step / 3) + whip;
    const thickness = step < train - 1 ? 2 : 1;
    fillPx(g, trainBaseX - step, trainY - thickness + 1, 1, thickness, "D");
    plotPx(g, trainBaseX - step, trainY, "d");
  }
  // Hem scallops shift through the cycle.
  for (let x = trainBaseX; x <= 16 + 9; x += 2) {
    plotPx(g, x + (phase % 2), hemY + 1, "d");
  }
  // Legs mid-stride under the hem.
  if (legsShown) {
    const front = Math.round(3.5 * Math.sin((2 * Math.PI * phase) / cycle));
    fillPx(g, 16 + front, hemY + 1, 2, 2, "s");
    fillPx(g, 16 + front, hemY + 3, 3, 1, "b");
    fillPx(g, 14 - front, hemY + 1, 2, 2, "S");
    fillPx(g, 13 - front, hemY + 3, 3, 1, "b");
  }
  return gridRows(g);
}

// Front-facing frames (idle sway + the straight-up jump flare).
function princessFrontFrame(params) {
  const { flare = 0, legsShown = true, sway = 0 } = params;
  const g = blankGrid32();
  fillPx(g, 10 + sway, 4, 12, 3, "H");
  fillPx(g, 9 + sway, 6, 3, 10, "H");
  fillPx(g, 20 + sway, 6, 3, 10, "H");
  plotPx(g, 9 + sway, 6, "G");
  plotPx(g, 22 + sway, 6, "G");
  fillPx(g, 12, 5, 8, 6, "s");
  fillPx(g, 12, 10, 8, 1, "S");
  plotPx(g, 14, 7, "e");
  plotPx(g, 17, 7, "e");
  fillPx(g, 15, 9, 2, 1, "S");
  fillPx(g, 13, 2, 6, 2, "c");
  plotPx(g, 13, 1, "j");
  plotPx(g, 15, 1, "j");
  plotPx(g, 18, 1, "j");
  fillPx(g, 13, 11, 6, 4, "D");
  fillPx(g, 11, 12, 2, 3, "s");
  fillPx(g, 19, 12, 2, 3, "s");
  const hemY = 27;
  for (let y = 15; y <= hemY; y += 1) {
    const depth = y - 15;
    const half = 3 + Math.round((depth * (7 + flare)) / (hemY - 15));
    fillPx(g, 16 - half + sway, y, half * 2 + 1, 1, "D");
    fillPx(g, 16 - half + sway, y, 1, 1, "d");
    plotPx(g, 16 + half + sway, y, "d");
  }
  for (let x = 16 - 10 - flare; x <= 16 + 10 + flare; x += 2) {
    plotPx(g, x + sway, hemY + 1, "d");
  }
  if (legsShown) {
    fillPx(g, 12, hemY + 1, 2, 2, "s");
    fillPx(g, 18, hemY + 1, 2, 2, "s");
    fillPx(g, 11, hemY + 3, 3, 1, "b");
    fillPx(g, 18, hemY + 3, 3, 1, "b");
  }
  return gridRows(g);
}

export const princessFluidPalette = {
  ...princessPlayerPalette,
  G: [206, 172, 92, 255], // hair shadow edge
};

// 6-phase walk (traveling cloth wave + body bob + arm/leg swing), two
// breathing parachute fall frames, a swept jump, a front flare for the
// straight-up jump, and a two-frame idle sway.
const walkFrames = Object.fromEntries(
  Array.from({ length: 6 }, (_unused, index) => [
    `walk-${index + 1}`,
    princessProfileFrame({
      phase: index,
      cycle: 6,
      bob: index % 3 === 1 ? 1 : 0,
      lean: 1,
      train: 6,
    }),
  ]),
);
export const princessFluidPoses = {
  ...walkFrames,
  "idle-1": princessFrontFrame({ sway: 0 }),
  "idle-2": princessFrontFrame({ sway: 1 }),
  idle: princessFrontFrame({ sway: 0 }),
  jump: princessProfileFrame({
    phase: 1,
    sweep: 5,
    hairSweep: 5,
    hairLift: 2,
    lean: 1,
    train: 8,
    waveAmplitude: 3,
  }),
  "jump-up": princessFrontFrame({ flare: 2 }),
  // The parachute: the bell swells wide, then relaxes — alternating frames
  // read as the skirt filling with air on the way down.
  "fall-1": princessProfileFrame({
    phase: 2,
    bell: 2,
    hairLift: 3,
    legsShown: false,
    train: 4,
    waveAmplitude: 3,
  }),
  "fall-2": princessProfileFrame({
    phase: 5,
    bell: 7,
    hairLift: 4,
    legsShown: false,
    train: 3,
    waveAmplitude: 3,
  }),
  fall: princessProfileFrame({
    phase: 2,
    bell: 3,
    hairLift: 3,
    legsShown: false,
    train: 4,
    waveAmplitude: 3,
  }),
};

export const princessCostume = {
  key: "princess",
  poses: princessFluidPoses,
  palette: princessFluidPalette,
  // 32x32 art shown at the 16px world size (2x detail).
  frameSizePixels: 32,
};

// The legacy 16x16 frames stay referenced (revenge enemy markers reuse the
// walk heads); keep them exported for the marker composition below.
export const princessLegacyPoses = {
  idle: princessIdle,
  "walk-1": princessWalk1,
  "walk-2": princessWalk2,
  jump: princessJump,
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

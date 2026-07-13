// Authored 16x16 costume sprites for the co-op cast: four fully distinct
// Futurama-inspired robots and a full green companion ("Luigi-like") costume.
// Every grid here is original pixel art authored from scratch (one char per
// pixel indexing a palette), matching the parody set's format so the parody
// builder can emit them and key them with a character prefix
// (robot1-*, robot2-*, robot3-*, robot4-*, luigi-*) that the shell's
// resolvePlayerSpriteImage looks up.
//
// Shared palette chars across robots (each robot supplies its own colours):
//   .  transparent      M  main plating       m  plating shadow
//   L  plating highlight E  eye / visor glow   e  dark outline / socket
//   A  antenna / accent  G  glass dome         w  white glint
//   J  joint / limb metal

// ---------------------------------------------------------------------------
// Robot 1 — "boxy Bender-like": a tall rounded can-body with a domed cylinder
// head, a single ball-tipped antenna, a wide visor eye, tube arms and boot
// feet. Gunmetal grey with a cyan visor.
// ---------------------------------------------------------------------------
export const robot1Palette = {
  ".": [0, 0, 0, 0],
  M: [150, 158, 170, 255],
  m: [96, 104, 118, 255],
  L: [198, 206, 216, 255],
  E: [90, 226, 236, 255],
  e: [40, 46, 56, 255],
  A: [210, 214, 222, 255],
  w: [245, 250, 255, 255],
  J: [72, 80, 92, 255],
};
const robot1Idle = [
  "................",
  ".......A........",
  ".......A........",
  ".....LMMML......",
  ".....MMMMM......",
  ".....MEEEM......",
  ".....LMMML......",
  "....mMMMMMm.....",
  "...JMMMMMMMJ....",
  "...JMMMMMMMJ....",
  "...JmMMMMMmJ....",
  "....MMMMMMM.....",
  "....mM...Mm.....",
  "....JJ...JJ.....",
  "...eJJ...JJe....",
  "................",
];
const robot1Walk1 = [
  "................",
  ".......A........",
  ".......A........",
  ".....LMMML......",
  ".....MMMMM......",
  ".....MEEEM......",
  ".....LMMML......",
  "....mMMMMMm.....",
  "..JMMMMMMMJ.....",
  "..JMMMMMMMJ.....",
  "...JmMMMMMmJ....",
  "....MMMMMMM.....",
  "...mM....Mm.....",
  "..JJ......JJ....",
  ".eJJ......JJ....",
  "................",
];
const robot1Walk2 = [
  "................",
  ".......A........",
  ".......A........",
  ".....LMMML......",
  ".....MMMMM......",
  ".....MEEEM......",
  ".....LMMML......",
  "....mMMMMMm.....",
  ".....JMMMMMMMJ..",
  ".....JMMMMMMMJ..",
  "....JmMMMMMmJ...",
  "....MMMMMMM.....",
  "....mM..Mm......",
  ".....JJJJ.......",
  "....eJJ.JJe.....",
  "................",
];
const robot1Jump = [
  ".......A........",
  ".......A........",
  "L....LMMML....L.",
  "Le...MMMMM...eL.",
  ".J...MEEEM...J..",
  ".J...LMMML...J..",
  "....mMMMMMm.....",
  "...JMMMMMMMJ....",
  "...JMMMMMMMJ....",
  "...JmMMMMMmJ....",
  "....MMMMMMM.....",
  "...mM.....Mm....",
  "..JJ.......JJ...",
  ".eJ.........Je..",
  "................",
  "................",
];

// ---------------------------------------------------------------------------
// Robot 2 — "tall thin": a slender rod body on long stilt legs, a small square
// head with a single rod antenna and one round eye. Bronze / copper.
// ---------------------------------------------------------------------------
export const robot2Palette = {
  ".": [0, 0, 0, 0],
  M: [198, 138, 74, 255],
  m: [138, 88, 44, 255],
  L: [232, 186, 118, 255],
  E: [255, 226, 96, 255],
  e: [58, 36, 20, 255],
  A: [220, 200, 160, 255],
  w: [255, 244, 210, 255],
  J: [96, 62, 32, 255],
};
const robot2Idle = [
  "........A.......",
  "........A.......",
  ".......AA.......",
  ".....LMMMM......",
  ".....MEEeM......",
  ".....MMMMM......",
  "......mMm.......",
  ".....MMMMM......",
  "....LMMMMML.....",
  ".....MMMMM......",
  "......mMm.......",
  "......JMJ.......",
  "......J.J.......",
  "......J.J.......",
  ".....eJ.Je......",
  "................",
];
const robot2Walk1 = [
  "........A.......",
  "........A.......",
  ".......AA.......",
  ".....LMMMM......",
  ".....MEEeM......",
  ".....MMMMM......",
  "......mMm.......",
  ".....MMMMM......",
  "....LMMMMML.....",
  ".....MMMMM......",
  "......mMm.......",
  "......JMJ.......",
  ".....J..J.......",
  "....J....J......",
  "...eJ.....Je....",
  "................",
];
const robot2Walk2 = [
  "........A.......",
  "........A.......",
  ".......AA.......",
  ".....LMMMM......",
  ".....MEEeM......",
  ".....MMMMM......",
  "......mMm.......",
  ".....MMMMM......",
  "....LMMMMML.....",
  ".....MMMMM......",
  "......mMm.......",
  "......JMJ.......",
  "......JJJ.......",
  ".....J...J......",
  "....eJ...Je.....",
  "................",
];
const robot2Jump = [
  "........A.......",
  "........A.......",
  ".L.....AA....L..",
  ".Je..LMMMM..eJ..",
  "..J..MEEeM..J...",
  ".....MMMMM......",
  "......mMm.......",
  ".....MMMMM......",
  "....LMMMMML.....",
  ".....MMMMM......",
  "......mMm.......",
  "......JMJ.......",
  ".....J...J......",
  "....J.....J.....",
  "...eJ.....Je....",
  "................",
];

// ---------------------------------------------------------------------------
// Robot 3 — "round dome": a bubble body under a clear glass dome holding a
// round head, stubby arms and little rounded feet. Off-white shell, teal trim.
// ---------------------------------------------------------------------------
export const robot3Palette = {
  ".": [0, 0, 0, 0],
  M: [230, 234, 238, 255],
  m: [168, 176, 186, 255],
  L: [255, 255, 255, 255],
  E: [40, 180, 190, 255],
  e: [48, 60, 70, 255],
  A: [60, 200, 210, 255],
  G: [176, 224, 232, 150],
  w: [255, 255, 255, 255],
  J: [120, 130, 140, 255],
};
const robot3Idle = [
  "................",
  "......GGGG......",
  ".....GMMMMG.....",
  ".....GMEEMG.....",
  ".....GMMMMG.....",
  "......mMMm......",
  "....LMMMMMML....",
  "...MMMMMMMMMM...",
  "...MMMMMMMMMM...",
  "..JMMMMMMMMMMJ..",
  "...MMMMMMMMMM...",
  "....mMMMMMMm....",
  ".....MMMMMM.....",
  "....JJ....JJ....",
  "...eJJ....JJe...",
  "................",
];
const robot3Walk1 = [
  "................",
  "......GGGG......",
  ".....GMMMMG.....",
  ".....GMEEMG.....",
  ".....GMMMMG.....",
  "......mMMm......",
  "....LMMMMMML....",
  "..JMMMMMMMMMM...",
  "..JMMMMMMMMMM...",
  "...MMMMMMMMMMJ..",
  "...MMMMMMMMMM...",
  "....mMMMMMMm....",
  ".....MMMMMM.....",
  "...JJ......JJ...",
  "..eJJ......JJ...",
  "................",
];
const robot3Walk2 = [
  "................",
  "......GGGG......",
  ".....GMMMMG.....",
  ".....GMEEMG.....",
  ".....GMMMMG.....",
  "......mMMm......",
  "....LMMMMMML....",
  "...MMMMMMMMMMJ..",
  "...MMMMMMMMMMJ..",
  "..JMMMMMMMMMM...",
  "...MMMMMMMMMM...",
  "....mMMMMMMm....",
  ".....MMMMMM.....",
  "....JJ....JJ....",
  "...eJ......Je...",
  "................",
];
const robot3Jump = [
  "......GGGG......",
  ".....GMMMMG.....",
  "L....GMEEMG....L",
  "Je...GMMMMG...eJ",
  ".J....mMMm....J.",
  "....LMMMMMML....",
  "...MMMMMMMMMM...",
  "...MMMMMMMMMM...",
  "..JMMMMMMMMMMJ..",
  "...MMMMMMMMMM...",
  "....mMMMMMMm....",
  ".....MMMMMM.....",
  "...JJ......JJ...",
  "..eJ........Je..",
  "................",
  "................",
];

// ---------------------------------------------------------------------------
// Robot 4 — "squat treads": a wide low chassis riding a caterpillar tread
// instead of legs, a slot-eye visor and two claw arms. Rust orange with dark
// treads.
// ---------------------------------------------------------------------------
export const robot4Palette = {
  ".": [0, 0, 0, 0],
  M: [214, 116, 58, 255],
  m: [150, 74, 34, 255],
  L: [244, 168, 104, 255],
  E: [255, 210, 90, 255],
  e: [40, 30, 24, 255],
  A: [230, 200, 170, 255],
  w: [255, 240, 210, 255],
  J: [60, 56, 54, 255],
};
const robot4Idle = [
  "................",
  ".......A........",
  "......mMm.......",
  ".....LMMML......",
  "....mMMMMMm.....",
  "J...MEEEEEM...J.",
  "J..LMMMMMMML..J.",
  "J..MMMMMMMMM..J.",
  "...MMMMMMMMM....",
  "...mMMMMMMMm....",
  "..eJJJJJJJJJe...",
  "..JOJOJOJOJOJ...",
  "..eJJJJJJJJJe...",
  "................",
  "................",
  "................",
];
const robot4Walk1 = [
  "................",
  ".......A........",
  "......mMm.......",
  ".....LMMML......",
  "....mMMMMMm.....",
  "J...MEEEEEM...J.",
  "JJ.LMMMMMMML.JJ.",
  "J..MMMMMMMMM..J.",
  "...MMMMMMMMM....",
  "...mMMMMMMMm....",
  "..eJJJJJJJJJe...",
  "..JJOJOJOJOJJ...",
  "..eJJJJJJJJJe...",
  "................",
  "................",
  "................",
];
const robot4Walk2 = [
  "................",
  ".......A........",
  "......mMm.......",
  ".....LMMML......",
  "....mMMMMMm.....",
  "J...MEEEEEM...J.",
  "J..LMMMMMMML..J.",
  "JJ.MMMMMMMMM.JJ.",
  "...MMMMMMMMM....",
  "...mMMMMMMMm....",
  "..eJJJJJJJJJe...",
  "..JOJOJOJOJOJ...",
  "..eJJJJJJJJJe...",
  "................",
  "................",
  "................",
];
const robot4Jump = [
  ".......A........",
  "......mMm.......",
  "L....LMMML....L.",
  "Je..mMMMMMm..eJ.",
  ".J..MEEEEEM..J..",
  "...LMMMMMMML....",
  "...MMMMMMMMM....",
  "...MMMMMMMMM....",
  "...mMMMMMMMm....",
  "..eJJJJJJJJJe...",
  "..JOJOJOJOJOJ...",
  "..eJJJJJJJJJe...",
  "................",
  "................",
  "................",
  "................",
];

// A robot uses a black tread-hole colour O only in robot 4; other robots never
// reference it, so it is added to every robot palette to keep the renderer's
// missing-key fallback from ever firing.
for (const p of [robot1Palette, robot2Palette, robot3Palette, robot4Palette]) {
  p.O = [26, 24, 24, 255];
}

// ---------------------------------------------------------------------------
// Full "Luigi-like" green companion: a distinct costume (not a recolour of the
// castaway) — a brimmed cap with an emblem, a big friendly moustache, green
// shirt over blue overalls, and boots. Its own pose grids so it reads as a
// separate character, not a palette swap.
// ---------------------------------------------------------------------------
export const luigiCostumePalette = {
  ".": [0, 0, 0, 0],
  C: [46, 150, 66, 255], // cap + shirt green
  c: [30, 108, 46, 255], // green shadow
  s: [232, 186, 140, 255], // skin
  S: [196, 150, 104, 255], // skin shadow
  m: [70, 46, 30, 255], // moustache / hair brown
  O: [64, 92, 168, 255], // overalls blue
  o: [44, 66, 128, 255], // overalls shadow
  b: [220, 200, 120, 255], // buttons / emblem
  d: [64, 44, 28, 255], // boots
  e: [24, 20, 18, 255], // eyes
  w: [245, 245, 245, 255], // emblem field
};
const luigiIdle = [
  "................",
  "....CCCCCC......",
  "...CCCCCCCCC....",
  "...CwbwC.ss.....",
  "...ssssssss.....",
  "..sSseewwes.....",
  "..ssmmmmmss.....",
  "...smmmmms......",
  "...CCCCCCC......",
  "..OCCbbCCO......",
  "..OOCCCCOO......",
  "..OOOOOOOO......",
  "..sOOOOOOs......",
  "...dd..dd.......",
  "..ddd..ddd......",
  "................",
];
const luigiWalk1 = [
  "................",
  "....CCCCCC......",
  "...CCCCCCCCC....",
  "...CwbwC.ss.....",
  "...ssssssss.....",
  "..sSseewwes.....",
  "..ssmmmmmss.....",
  "...smmmmms......",
  "...CCCCCCC......",
  "..OCCbbCCO......",
  "..OOCCCCOO......",
  "...OOOOOO.......",
  "..sOO..OOs......",
  "..dd....dd......",
  ".ddd......dd....",
  "................",
];
const luigiWalk2 = [
  "................",
  "....CCCCCC......",
  "...CCCCCCCCC....",
  "...CwbwC.ss.....",
  "...ssssssss.....",
  "..sSseewwes.....",
  "..ssmmmmmss.....",
  "...smmmmms......",
  "...CCCCCCC......",
  "..OCCbbCCO......",
  "..OOCCCCOO......",
  "..OOOOOOOO......",
  "...sOOOOs.......",
  "...dd..dd.......",
  "...ddd.ddd......",
  "................",
];
const luigiJump = [
  "....CCCCCC......",
  "...CCCCCCCCC....",
  "s..CwbwC.ss..s..",
  "ss.ssssssss.ss..",
  ".s.sSseewwes.s..",
  "...ssmmmmmss....",
  "..C.smmmmms.C...",
  "..CCCCCCCCCCC...",
  "..OCCbbCCO......",
  "..OOCCCCOO......",
  "...OOOOOO.......",
  "..dd....dd......",
  ".ddd......dd....",
  "................",
  "................",
  "................",
];
const luigiCrouch = [
  "................",
  "................",
  "....CCCCCC......",
  "...CCCCCCCCC....",
  "...CwbwC.ss.....",
  "..sSseewwes.....",
  "..ssmmmmmss.....",
  "..CCCCCCCCC.....",
  ".OCCbbCCCO......",
  ".OOCCCCCOO......",
  ".OOOOOOOOO......",
  ".sOOOOOOOs......",
  "..dd...dd.......",
  ".ddd...ddd......",
  "................",
  "................",
];
const luigiClimb = [
  "................",
  "...C.CCCCCC.C...",
  "..CC.CCCCCC.CC..",
  "...C.CwbwCss....",
  "...ssssssss.....",
  "..sSseewwes.....",
  "..ssmmmmmss.....",
  "...smmmmms......",
  "...CCCCCCC......",
  "..sCCbbCCs......",
  "..OOCCCCOO......",
  "...OOOOOO.......",
  "...sOOOOs.......",
  "...dd..dd.......",
  "................",
  "................",
];

// Robot body parts: a shared boxy-metal dismemberment set — a cracked head, a
// panelled torso, a bolt-jointed arm and a piston leg — recoloured per robot
// via that robot's own palette so each explodes into its own colours. The
// sever stumps use e (dark) and a spark accent uses E (the robot's glow).
export const robotPartHeadGrid = [
  "................",
  "................",
  ".....LMMML......",
  "....MMMMMM......",
  "....MEEEEM......",
  "....MMMMMM......",
  ".....MMMM.......",
  "......ee........",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];
export const robotPartTorsoGrid = [
  "................",
  "................",
  ".....mMMm.......",
  "....JMMMMJ......",
  "....MMMMMM......",
  "....MmMMmM......",
  "....MMMMMM......",
  "....JMMMMJ......",
  ".....eMMe.......",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];
export const robotPartArmGrid = [
  "................",
  "................",
  ".....JJ.........",
  "....JMMJ........",
  "....JMMJ........",
  ".....MM.........",
  ".....MM.........",
  ".....JJ.........",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];
export const robotPartLegGrid = [
  "................",
  "................",
  ".....JJ.........",
  "....JMMJ........",
  ".....MM.........",
  ".....MM.........",
  ".....JJ.........",
  "....JMMJ........",
  "....eJJe........",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

// Every co-op costume, in the shape the parody builder consumes: a character
// key (the sprite-prefix), its pose grids, and its tier palettes. Robots reuse
// their own poses for the secondary states (crouch/climb/swim) so each stays a
// single distinct silhouette; the parody builder maps those keys.
function robotTierPalettes(base) {
  // Powered brightens the plating; fire washes it toward white-hot with a warm
  // eye — mirroring how the castaway tiers relate.
  const powered = { ...base, M: lighten(base.M, 40), L: lighten(base.L, 30) };
  const fire = {
    ...base,
    M: [236, 236, 228, 255],
    m: [180, 180, 172, 255],
    L: [255, 255, 250, 255],
    E: [255, 150, 60, 255],
  };
  return { base, powered, fire };
}
function lighten(rgba, amount) {
  return [
    Math.min(255, rgba[0] + amount),
    Math.min(255, rgba[1] + amount),
    Math.min(255, rgba[2] + amount),
    rgba[3],
  ];
}

export const robotCostumes = [
  {
    key: "robot1",
    poses: {
      idle: robot1Idle,
      "walk-1": robot1Walk1,
      "walk-2": robot1Walk2,
      jump: robot1Jump,
    },
    palettes: robotTierPalettes(robot1Palette),
  },
  {
    key: "robot2",
    poses: {
      idle: robot2Idle,
      "walk-1": robot2Walk1,
      "walk-2": robot2Walk2,
      jump: robot2Jump,
    },
    palettes: robotTierPalettes(robot2Palette),
  },
  {
    key: "robot3",
    poses: {
      idle: robot3Idle,
      "walk-1": robot3Walk1,
      "walk-2": robot3Walk2,
      jump: robot3Jump,
    },
    palettes: robotTierPalettes(robot3Palette),
  },
  {
    key: "robot4",
    poses: {
      idle: robot4Idle,
      "walk-1": robot4Walk1,
      "walk-2": robot4Walk2,
      jump: robot4Jump,
    },
    palettes: robotTierPalettes(robot4Palette),
  },
];

// The full green companion costume, in the same shape (distinct grids for every
// pose, one green/blue tier plus a brighter powered and a white-shirt fire).
export const luigiCostume = {
  key: "luigi",
  poses: {
    idle: luigiIdle,
    "walk-1": luigiWalk1,
    "walk-2": luigiWalk2,
    jump: luigiJump,
    crouch: luigiCrouch,
    climb: luigiClimb,
  },
  palettes: {
    base: luigiCostumePalette,
    powered: {
      ...luigiCostumePalette,
      C: [86, 202, 104, 255],
      O: [96, 118, 190, 255],
    },
    fire: {
      ...luigiCostumePalette,
      C: [236, 236, 224, 255],
      O: [46, 150, 66, 255],
    },
  },
};

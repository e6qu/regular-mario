// Original robotic call-signs for the co-op bots, shown as a small label above
// each one. Kept framework-free so the pick is unit-testable without a scene.
//
// The names are original, generic "robot" call-signs (not any third party's
// characters), matching the repo's original-expression rule.
const robotBotNames: readonly string[] = [
  "CLANKER",
  "SPROCKET",
  "RUSTY",
  "GIZMO",
  "COG-9",
  "RIVET",
  "KLANG",
  "DIODE",
  "SPARKY",
  "WIDGET",
  "GEARBOX",
  "TIN-CAN",
  "BOLT-3",
  "ZAPPER",
  "CHROME",
  "OM-BOT",
  "VOLTA",
  "FIZZLE",
  "NUTS-5",
  "WRENCH",
];

// A bot's call-sign, chosen deterministically from its spawn counter so it is
// stable for that bot's life yet scattered across the pool (7 is coprime with
// the 20-name pool, so the first 20 bots all draw distinct names rather than
// marching down the list in order).
export function robotNameForBotSpawn(spawnCounter: number): string {
  const index = (spawnCounter * 7 + 3) % robotBotNames.length;
  return robotBotNames[index] ?? "ROBO";
}

export const robotBotNameCount = robotBotNames.length;

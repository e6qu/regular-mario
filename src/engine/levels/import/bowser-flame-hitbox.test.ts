import { describe, expect, it } from "vitest";

import { loadOfficialLevelSpec } from "./sim-scenario.test-support";

// Regression for the hitbox audit's BUG 2: the ROM's Bowser flame is a wide
// (24×8) sprite with a tiny 4×4 hitbox, so the flame is dodgeable. Ours used
// the full sprite as the collision box, making Bowser fights harder than the
// original. The decoded castle flame spawners must now carry a symmetric
// collision inset that shrinks the hazard box well inside the sprite.
describe("official Bowser flames have an inset collision box", () => {
  // Every castle stages a boss with flame jets.
  for (const name of [
    "smb-1-5",
    "smb-2-5",
    "smb-3-4",
    "smb-4-5",
    "smb-5-4",
    "smb-6-4",
    "smb-7-5",
    "smb-8-4",
  ]) {
    it(`${name} insets its flame collision box inside the sprite`, () => {
      const spec = loadOfficialLevelSpec(name);
      const flames = spec.timedHazardProjectileSpawners.filter(
        (spawner) => spawner.widthPixels === 24 && spawner.heightPixels === 8,
      );
      expect(flames.length).toBeGreaterThan(0);
      for (const flame of flames) {
        // Inset shrinks the box on both axes, and never inverts it.
        expect(flame.hazardInsetXPixels).toBeGreaterThan(0);
        expect(flame.hazardInsetYPixels).toBeGreaterThan(0);
        expect(flame.hazardInsetXPixels * 2).toBeLessThan(flame.widthPixels);
        expect(flame.hazardInsetYPixels * 2).toBeLessThan(flame.heightPixels);
        // The effective threat is far smaller than the 24×8 render.
        const boxWidth = flame.widthPixels - flame.hazardInsetXPixels * 2;
        const boxHeight = flame.heightPixels - flame.hazardInsetYPixels * 2;
        expect(boxWidth).toBeLessThanOrEqual(8);
        expect(boxHeight).toBeLessThanOrEqual(6);
      }
    });
  }
});

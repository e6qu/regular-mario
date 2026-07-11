import { describe, expect, it } from "vitest";

import { loadOfficialLevelSpec } from "./sim-scenario.test-support";

// Regression for the hitbox audit's BUG 1: cannon-fired Bullet Bills are in the
// ROM's EnemyStomped set, so a descending player defeats them. The stomp logic
// already honoured `stompable`, but the decoded official metadata never set it,
// making every cannon bill lethal on a clean jump. Cannon spawners (16×14
// projectiles) must now be stompable; Bowser-flame spawners (24-wide) must not.
describe("official cannon Bullet Bills are stompable", () => {
  // Levels whose object stream carries Bullet Bill cannons.
  for (const name of ["smb-5-1", "smb-5-2", "smb-7-1", "smb-8-2", "smb-8-3"]) {
    it(`${name} marks every cannon Bullet Bill spawner stompable`, () => {
      const spec = loadOfficialLevelSpec(name);
      const cannonSpawners = spec.timedHazardProjectileSpawners.filter(
        (spawner) => spawner.widthPixels === 16 && spawner.heightPixels === 14,
      );
      expect(cannonSpawners.length).toBeGreaterThan(0);
      for (const spawner of cannonSpawners) {
        expect(spawner.stompable, `${name} ${spawner.spawnerId}`).toBe(true);
      }
    });
  }

  it("does not make Bowser-flame spawners stompable", () => {
    // smb-8-4's castle rooms fire Bowser flames (24-wide), which are lethal —
    // never stompable.
    const spec = loadOfficialLevelSpec("smb-8-4");
    const flameSpawners = spec.timedHazardProjectileSpawners.filter(
      (spawner) => spawner.widthPixels === 24,
    );
    for (const spawner of flameSpawners) {
      expect(spawner.stompable, spawner.spawnerId).toBe(false);
    }
  });
});

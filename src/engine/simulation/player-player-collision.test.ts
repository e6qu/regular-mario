import { describe, expect, it } from "vitest";

import { spawnedPrimaryPlayer } from "./level-test-support";
import type { PlayerSimulationState } from "./player-state";
import { resolvePlayerCollisions } from "./player-player-collision";
import {
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "./simulation-units";

function basePlayer(): PlayerSimulationState {
  return spawnedPrimaryPlayer();
}

function playerAt(x: number, y: number): PlayerSimulationState {
  return {
    ...basePlayer(),
    position: {
      x: requireSimulationPixelPosition(x, "player.position.x"),
      y: requireSimulationPixelPosition(y, "player.position.y"),
    },
    velocity: {
      x: requireSimulationVelocity(0, "player.velocity.x"),
      y: requireSimulationVelocity(0, "player.velocity.y"),
    },
  };
}

function width(player: PlayerSimulationState): number {
  return Number(player.collider.width);
}

describe("resolvePlayerCollisions", () => {
  it("leaves a single player untouched", () => {
    const players = [playerAt(100, 100)];
    expect(resolvePlayerCollisions(players, players)).toBe(players);
  });

  it("stops players walking through each other (side-by-side separation)", () => {
    const a = playerAt(100, 100);
    const b = playerAt(108, 100); // overlapping horizontally
    const [ra, rb] = resolvePlayerCollisions([a, b], [a, b]);
    // They no longer overlap: the right edge of the left one is at or left of
    // the left edge of the right one.
    expect(Number(ra!.position.x) + width(ra!)).toBeLessThanOrEqual(
      Number(rb!.position.x) + 0.001,
    );
  });

  it("rests a player on top of the one beneath it", () => {
    const upper = playerAt(100, 90);
    const lower = playerAt(100, 100);
    const [ru] = resolvePlayerCollisions([upper, lower], [upper, lower]);
    // The upper player's feet sit exactly on the lower player's head.
    expect(Number(ru!.position.y) + Number(ru!.collider.height)).toBeCloseTo(
      100,
      1,
    );
  });

  it("carries a stacked player along with the player beneath it", () => {
    // Previously: upper stood on lower (feet on head).
    const prevLower = playerAt(100, 100);
    const prevUpper = playerAt(100, 100 - Number(prevLower.collider.height));
    // This frame the lower player moved right by 10; the upper stayed put.
    const lower = playerAt(110, 100);
    const upper = playerAt(
      100,
      100 - Number(prevLower.collider.height),
    );
    const [ru] = resolvePlayerCollisions(
      [upper, lower],
      [prevUpper, prevLower],
    );
    // The rider was carried right with its platform-player.
    expect(Number(ru!.position.x)).toBeGreaterThan(100 + 5);
  });
});

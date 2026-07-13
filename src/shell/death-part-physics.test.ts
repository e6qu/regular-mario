import { describe, expect, it } from "vitest";

import {
  type DeathPartBody,
  type DeathPartBox,
  type DeathPartPhysicsParams,
  type SolidTileQuery,
  stepDeathPartBody,
} from "./death-part-physics";

const params: DeathPartPhysicsParams = {
  gravity: 0.3,
  restitution: 0.6,
  friction: 0.8,
  stopSpeed: 0.7,
  tileSize: 16,
};

function makeBody(overrides: Partial<DeathPartBody> = {}): DeathPartBody {
  return {
    x: 24,
    y: 24,
    vx: 0,
    vy: 0,
    halfWidth: 4,
    halfHeight: 4,
    ...overrides,
  };
}

// A floor: every tile on row 4 (y ≥ 64) and below is solid; out of bounds is
// open air, so a part that leaves the sides/bottom keeps falling.
const floorAtRow4: SolidTileQuery = (_column, row) => row >= 4;
const noTiles: SolidTileQuery = () => false;

describe("stepDeathPartBody", () => {
  it("accelerates downward under gravity when nothing is in the way", () => {
    const body = makeBody({ y: 0 });
    const before = body.vy;
    stepDeathPartBody(body, noTiles, [], params);
    expect(body.vy).toBeGreaterThan(before);
    expect(body.y).toBeGreaterThan(0);
  });

  it("keeps falling with no floor (parts leave the level)", () => {
    const body = makeBody({ y: 0, vy: 5 });
    for (let frame = 0; frame < 40; frame += 1) {
      stepDeathPartBody(body, noTiles, [], params);
    }
    expect(body.y).toBeGreaterThan(200);
  });

  it("lands and rests on top of a block", () => {
    const body = makeBody({ y: 40, vy: 6 });
    // Top of the solid row is y = 64; a resting part sits half its height above.
    for (let frame = 0; frame < 120; frame += 1) {
      stepDeathPartBody(body, floorAtRow4, [], params);
    }
    expect(body.y).toBeCloseTo(64 - body.halfHeight, 1);
    expect(Math.abs(body.vy)).toBeLessThan(params.stopSpeed);
  });

  it("bounces elastically off the ground and each bounce is weaker (falloff)", () => {
    const body = makeBody({ y: 40, vy: 6 });
    const peakHeights: number[] = [];
    let previousY = body.y;
    let rising = false;
    for (let frame = 0; frame < 200; frame += 1) {
      stepDeathPartBody(body, floorAtRow4, [], params);
      const goingUp = body.y < previousY;
      // Record an apex each time the part turns from rising back to falling.
      if (rising && !goingUp) {
        peakHeights.push(previousY);
      }
      rising = goingUp;
      previousY = body.y;
    }
    // It bounced multiple times...
    expect(peakHeights.length).toBeGreaterThanOrEqual(2);
    // ...each apex lower than the last (energy lost), and never higher than the
    // drop it started from.
    for (let index = 1; index < peakHeights.length; index += 1) {
      expect(peakHeights[index]!).toBeGreaterThan(peakHeights[index - 1]!);
    }
  });

  it("bounces off a side wall, reversing horizontal velocity", () => {
    // A wall filling column 3 (x ≥ 48). A part moving right into it rebounds.
    const wall: SolidTileQuery = (column) => column >= 3;
    const body = makeBody({ x: 40, y: 24, vx: 6 });
    const result = stepDeathPartBody(body, wall, [], params);
    expect(result.bouncedWall).toBe(true);
    expect(body.vx).toBeLessThan(0);
    expect(body.x + body.halfWidth).toBeLessThanOrEqual(48.001);
  });

  it("bounces off an enemy box and reports the hit", () => {
    const enemy: DeathPartBox = { left: 30, top: 20, right: 46, bottom: 36 };
    const body = makeBody({ x: 24, y: 28, vx: 5, vy: 0 });
    const result = stepDeathPartBody(body, noTiles, [enemy], params);
    expect(result.hitEnemyIndices).toContain(0);
    // Pushed back out of the enemy and rebounded leftward.
    expect(body.x + body.halfWidth).toBeLessThanOrEqual(enemy.left + 0.001);
    expect(body.vx).toBeLessThan(0);
  });

  it("does not report an enemy it never overlaps", () => {
    const enemy: DeathPartBox = { left: 200, top: 200, right: 216, bottom: 216 };
    const body = makeBody({ x: 24, y: 24, vx: 1 });
    const result = stepDeathPartBody(body, noTiles, [enemy], params);
    expect(result.hitEnemyIndices).toHaveLength(0);
  });
});

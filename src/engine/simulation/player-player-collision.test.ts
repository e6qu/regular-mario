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

  // A separation push is a shove outside the movement integration. Without a
  // terrain re-resolve, two players squeezed at a wall pushed each other
  // straight into the tiles and ended the frame embedded in them.
  it("never pushes a player through a wall", () => {
    // A wall at x >= 120: the settle clamps anybody who crosses it.
    const wallLeftEdgeX = 120;
    const settle = (
      _before: PlayerSimulationState,
      after: PlayerSimulationState,
    ): PlayerSimulationState => {
      const right = Number(after.position.x) + width(after);
      if (right <= wallLeftEdgeX) {
        return after;
      }
      return {
        ...after,
        position: {
          x: requireSimulationPixelPosition(
            wallLeftEdgeX - width(after),
            "player.position.x",
          ),
          y: after.position.y,
        },
      };
    };
    const left = playerAt(100, 100);
    const right = playerAt(106, 100); // overlapping, and against the wall
    const [rl, rr] = resolvePlayerCollisions(
      [left, right],
      [left, right],
      settle,
    );
    // Nobody is inside the wall...
    expect(Number(rr!.position.x) + width(rr!)).toBeLessThanOrEqual(
      wallLeftEdgeX + 0.001,
    );
    // ...and the pair is still separated: the blocked player's share of the
    // push is taken up by the one who can still move.
    expect(Number(rl!.position.x) + width(rl!)).toBeLessThanOrEqual(
      Number(rr!.position.x) + 0.001,
    );
  });

  it("never shoves a player off the left edge of the world", () => {
    const a = playerAt(0, 100);
    const b = playerAt(4, 100);
    const [ra] = resolvePlayerCollisions([a, b], [a, b]);
    expect(Number(ra!.position.x)).toBeGreaterThanOrEqual(0);
  });

  // The shallower-axis rule alone squirted a fast faller out sideways, which
  // made jumping onto a friend unreliable at exactly the speeds people jump.
  it("lands a falling player on the head they were above, however deep the overlap", () => {
    const lower = playerAt(100, 100);
    const height = Number(lower.collider.height);
    // Last frame the upper player's feet were just above the lower's head;
    // this frame a fast fall has buried them well past the shallower axis.
    const previousUpper = playerAt(100, 100 - height);
    const upper: PlayerSimulationState = {
      ...playerAt(102, 100 - height + 12),
      velocity: {
        x: requireSimulationVelocity(0, "player.velocity.x"),
        y: requireSimulationVelocity(240, "player.velocity.y"),
      },
    };
    const [ru] = resolvePlayerCollisions(
      [upper, lower],
      [previousUpper, lower],
    );
    expect(Number(ru!.position.y) + Number(ru!.collider.height)).toBeCloseTo(
      100,
      1,
    );
    // Landing kills the downward speed rather than leaving them falling.
    expect(Number(ru!.velocity.y)).toBe(0);
  });

  // Zeroing both players' speed stopped the player in front too, so a pair
  // walking the same way both halted the moment the one behind caught up.
  it("stops only the player moving into the other", () => {
    const runningIntoBack: PlayerSimulationState = {
      ...playerAt(100, 100),
      velocity: {
        x: requireSimulationVelocity(80, "player.velocity.x"),
        y: requireSimulationVelocity(0, "player.velocity.y"),
      },
    };
    const walkingAway: PlayerSimulationState = {
      ...playerAt(108, 100),
      velocity: {
        x: requireSimulationVelocity(40, "player.velocity.x"),
        y: requireSimulationVelocity(0, "player.velocity.y"),
      },
    };
    const [back, front] = resolvePlayerCollisions(
      [runningIntoBack, walkingAway],
      [runningIntoBack, walkingAway],
    );
    expect(Number(back!.velocity.x)).toBe(0);
    expect(Number(front!.velocity.x)).toBe(40);
  });

  // Riding two carriers at once used to add both their movements and fling
  // the rider at double speed.
  it("carries a rider straddling two carriers exactly once", () => {
    const carrierHeight = Number(basePlayer().collider.height);
    const riderY = 100 - carrierHeight;
    const prevLeft = playerAt(94, 100);
    const prevRight = playerAt(106, 100);
    const prevRider = playerAt(100, riderY); // straddling both heads
    // Both carriers moved right by 10 this frame.
    const left = playerAt(104, 100);
    const right = playerAt(116, 100);
    const rider = playerAt(100, riderY);
    const [rr] = resolvePlayerCollisions(
      [rider, left, right],
      [prevRider, prevLeft, prevRight],
    );
    // Carried by ten, not twenty.
    expect(Number(rr!.position.x)).toBeCloseTo(110, 1);
  });

  // A three-high stack used to carry differently depending on slot order,
  // because a rider could be moved before the carrier it stands on.
  it("carries a three-high stack fully regardless of slot order", () => {
    const bodyHeight = Number(basePlayer().collider.height);
    const groundY = 100;
    const prevBottom = playerAt(100, groundY);
    const prevMiddle = playerAt(100, groundY - bodyHeight);
    const prevTop = playerAt(100, groundY - 2 * bodyHeight);
    // The bottom player moved right by 10; the others have not moved yet.
    const bottom = playerAt(110, groundY);
    const middle = playerAt(100, groundY - bodyHeight);
    const top = playerAt(100, groundY - 2 * bodyHeight);

    // Top-first ordering (the order that used to break the chain)...
    const topFirst = resolvePlayerCollisions(
      [top, middle, bottom],
      [prevTop, prevMiddle, prevBottom],
    );
    // ...and bottom-first ordering must agree, and both must carry the whole
    // stack the full ten pixels.
    const bottomFirst = resolvePlayerCollisions(
      [bottom, middle, top],
      [prevBottom, prevMiddle, prevTop],
    );
    expect(Number(topFirst[0]!.position.x)).toBeCloseTo(110, 1);
    expect(Number(topFirst[1]!.position.x)).toBeCloseTo(110, 1);
    expect(Number(bottomFirst[2]!.position.x)).toBeCloseTo(110, 1);
    expect(Number(bottomFirst[1]!.position.x)).toBeCloseTo(110, 1);
  });

  it("carries a stacked player along with the player beneath it", () => {
    // Previously: upper stood on lower (feet on head).
    const prevLower = playerAt(100, 100);
    const prevUpper = playerAt(100, 100 - Number(prevLower.collider.height));
    // This frame the lower player moved right by 10; the upper stayed put.
    const lower = playerAt(110, 100);
    const upper = playerAt(100, 100 - Number(prevLower.collider.height));
    const [ru] = resolvePlayerCollisions(
      [upper, lower],
      [prevUpper, prevLower],
    );
    // The rider was carried right with its platform-player.
    expect(Number(ru!.position.x)).toBeGreaterThan(100 + 5);
  });
});

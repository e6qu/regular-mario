import { describe, expect, it } from "vitest";

import {
  playerHurtbox,
  playerOverlapsActorPixel,
} from "./player-actor-overlap";
import {
  makeInitialPlayerSimulationState,
  resizePlayerForVitality,
} from "./player-state";
import { PlayerVitalityKind } from "./player-vitality";

// The player's object-collision box matches the ROM's BoundBoxCtrlData: small
// Mario 10×12 and big Mario 12×24, feet-anchored and centred in the terrain
// collider. Object collisions (enemies, hazards, items) use it; terrain does
// not. Head-height threats miss the short box, as in the original.
describe("player hurtbox", () => {
  const smallPlayer = makeInitialPlayerSimulationState();
  const bigPlayer = resizePlayerForVitality(smallPlayer, {
    kind: PlayerVitalityKind.Powered,
  });
  const crouchingBigPlayer = { ...bigPlayer, crouching: true };

  it("gives small Mario a 10×12 box at the feet, centred in the collider", () => {
    const box = playerHurtbox(smallPlayer);
    // Spawn: position (16, 56), collider 14×24 → feet at y=80.
    expect(box.right - box.left).toBe(10);
    expect(box.bottom - box.top).toBe(12);
    expect(box.bottom).toBe(
      smallPlayer.position.y + smallPlayer.collider.height,
    );
    // Centred horizontally in the 14-wide collider (2px inset each side).
    expect(box.left).toBe(smallPlayer.position.x + 2);
  });

  it("gives big Mario a 12×24 box at the feet", () => {
    const box = playerHurtbox(bigPlayer);
    expect(box.right - box.left).toBe(12);
    expect(box.bottom - box.top).toBe(24);
    expect(box.bottom).toBe(bigPlayer.position.y + bigPlayer.collider.height);
    expect(box.left).toBe(bigPlayer.position.x + 1);
  });

  it("misses a head-height threat that the full collider would have hit", () => {
    // A 3px hazard at the very top of the small player's collider: inside the
    // terrain collider [y, y+16] but above the feet-anchored hurtbox [y+4,y+16].
    const y = smallPlayer.position.y;
    const headThreat = { x: smallPlayer.position.x + 4, y };
    expect(
      playerOverlapsActorPixel(smallPlayer, headThreat, {
        width: 6,
        height: 3,
      }),
    ).toBe(false);
  });

  it("hits a body-height threat overlapping the hurtbox", () => {
    const box = playerHurtbox(smallPlayer);
    const bodyThreat = { x: box.left + 1, y: box.top + 1 };
    expect(
      playerOverlapsActorPixel(smallPlayer, bodyThreat, {
        width: 6,
        height: 6,
      }),
    ).toBe(true);
  });

  it("shrinks big Mario to a 12×12 duck box while crouching", () => {
    const standing = playerHurtbox(bigPlayer);
    const ducking = playerHurtbox(crouchingBigPlayer);
    expect(ducking.right - ducking.left).toBe(12);
    expect(ducking.bottom - ducking.top).toBe(12);
    // Same feet, but the box top is lower than standing — a threat between the
    // two tops now sails over the ducking player.
    expect(ducking.bottom).toBe(standing.bottom);
    expect(ducking.top).toBeGreaterThan(standing.top);
  });

  it("ducks a threat at big Mario's chest that would hit him standing", () => {
    const standing = playerHurtbox(bigPlayer);
    // A hazard band just below the standing hurtbox top (chest height).
    const chestThreat = { x: standing.left, y: standing.top + 2 };
    const size = { width: 6, height: 6 };
    expect(playerOverlapsActorPixel(bigPlayer, chestThreat, size)).toBe(true);
    expect(
      playerOverlapsActorPixel(crouchingBigPlayer, chestThreat, size),
    ).toBe(false);
  });
});

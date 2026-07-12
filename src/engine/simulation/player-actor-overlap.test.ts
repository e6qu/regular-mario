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
    // A 6px hazard at the very top of the small player's collider: inside the
    // terrain collider [y, y+24] but above the feet-anchored hurtbox [y+12,y+24].
    const y = smallPlayer.position.y;
    const headThreat = { x: smallPlayer.position.x + 4, y };
    expect(
      playerOverlapsActorPixel(smallPlayer, headThreat, {
        width: 6,
        height: 6,
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
});

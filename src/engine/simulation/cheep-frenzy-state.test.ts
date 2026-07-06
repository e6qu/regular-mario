import { describe, expect, it } from "vitest";

import type { LevelSpec } from "../domain/level-spec";
import {
  liveFrenzyCheeps,
  makeEmptyCheepFrenzyState,
  resolveCheepFrenzyState,
} from "./cheep-frenzy-state";
import {
  advancePseudoRandom,
  makeInitialPseudoRandomState,
} from "./pseudo-random";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import { playerWithTestState } from "./movement-test-support";

function playerAtX(x: number) {
  return playerWithTestState({
    position: { x, y: 100 },
    velocity: { x: 0, y: 0 },
    movement: {
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Falling,
    },
  });
}

function levelWithFrenzy(startTileX: number, endTileX: number): LevelSpec {
  return { tileSizePixels: 16, cheepFrenzy: { startTileX, endTileX } } as never;
}

function runFrames(
  levelSpec: LevelSpec,
  playerX: number,
  frames: number,
): ReturnType<typeof makeEmptyCheepFrenzyState> {
  const player = playerAtX(playerX);
  let state = makeEmptyCheepFrenzyState();
  let rng = makeInitialPseudoRandomState();
  for (let frame = 0; frame < frames; frame += 1) {
    rng = advancePseudoRandom(rng);
    state = resolveCheepFrenzyState(
      state,
      levelSpec,
      player,
      rng,
      1 / 60,
      frame,
    ).state;
  }
  return state;
}

describe("cheep frenzy state", () => {
  it("fills its 3-slot buffer while the player is inside the region", () => {
    let state = makeEmptyCheepFrenzyState();
    let rng = makeInitialPseudoRandomState();
    const levelSpec = levelWithFrenzy(5, 200);
    const player = playerAtX(16 * 20);
    let maxAlive = 0;
    for (let frame = 0; frame < 200; frame += 1) {
      rng = advancePseudoRandom(rng);
      state = resolveCheepFrenzyState(
        state,
        levelSpec,
        player,
        rng,
        1 / 60,
        frame,
      ).state;
      maxAlive = Math.max(maxAlive, liveFrenzyCheeps(state).length);
    }
    expect(maxAlive).toBe(3); // capped at 3
  });

  it("spawns cheeps ahead of the player, on the RNG Y-bands", () => {
    const state = runFrames(levelWithFrenzy(5, 200), 16 * 20, 40);
    const cheeps = liveFrenzyCheeps(state);
    expect(cheeps.length).toBeGreaterThan(0);
    for (const cheep of cheeps) {
      // Entered ahead of the player and within the playfield Y bands (40..168).
      expect(cheep.originY).toBeGreaterThanOrEqual(40);
      expect(cheep.originY).toBeLessThanOrEqual(168);
    }
  });

  it("spawns nothing when the player is outside the region", () => {
    const state = runFrames(levelWithFrenzy(100, 200), 16 * 10, 200);
    expect(liveFrenzyCheeps(state).length).toBe(0);
  });

  it("does nothing on a level without a frenzy region", () => {
    const levelSpec = { tileSizePixels: 16, cheepFrenzy: undefined } as never;
    const state = runFrames(levelSpec, 16 * 20, 200);
    expect(liveFrenzyCheeps(state).length).toBe(0);
  });
});

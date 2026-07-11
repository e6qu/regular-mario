import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import type { LevelSpecInput } from "../domain/level-spec";
import { makeInitialSimulationStateWithPlayerVitality } from "./simulation-state";
import { stepSimulation } from "./step-simulation";
import { HorizontalInput } from "./input-command";
import { initialMovementConstants } from "./movement-model";
import {
  makeFirePlayerVitalityState,
  makeInitialPlayerVitalityState,
  PlayerVitalityKind,
} from "./player-vitality";
import { PlayerOutcomeKind } from "./player-outcome";
import type { PlayerVitalityState } from "./player-vitality";

const nominalFrameMilliseconds = 1000 / 60;

// The player spawns at the fixed initial simulation position (x=16, y=56 —
// tile column 1, rows 3-5); a hazard tile placed in that footprint contacts
// on the first step.
function makeHazardLevelInput(): LevelSpecInput {
  const width = 16;
  const height = 15;
  const rows: string[][] = Array.from({ length: height }, (_, rowIndex) =>
    Array.from({ length: width }, () => (rowIndex >= 13 ? "ground" : "empty")),
  );
  rows[4] = rows[4]!.map((tile, columnIndex) =>
    columnIndex === 1 ? "thorns" : tile,
  );
  return {
    widthTiles: width,
    heightTiles: height,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "empty", collision: "empty" },
      { tileId: "ground", collision: "solid" },
      { tileId: "thorns", collision: "hazard" },
    ],
    actorDefinitions: [
      { actorId: "player", role: "player-start" },
      { actorId: "gate", role: "exit" },
    ],
    tiles: rows,
    actors: [
      { entityId: "player-1", actorId: "player", x: 2, y: 11 },
      { entityId: "exit-1", actorId: "gate", x: 14, y: 12 },
    ],
  };
}

function stepOnce(vitality: PlayerVitalityState) {
  const levelResult = makeLevelSpec(makeHazardLevelInput());
  if (!levelResult.ok) {
    throw new Error(
      levelResult.errors.map((error) => error.message).join(", "),
    );
  }
  const stateResult = makeInitialSimulationStateWithPlayerVitality(
    nominalFrameMilliseconds,
    levelResult.value,
    initialMovementConstants,
    vitality,
  );
  if (!stateResult.ok) {
    throw new Error("expected initial state");
  }
  return stepSimulation(
    stateResult.value,
    {
      horizontal: HorizontalInput.Neutral,
      jumpPressed: false,
      runHeld: false,
      firePressed: false,
      upHeld: false,
      downHeld: false,
    },
    initialMovementConstants,
    levelResult.value,
  );
}

describe("hazard damage tiering", () => {
  it("defeats a small player on hazard contact", () => {
    const next = stepOnce(makeInitialPlayerVitalityState());
    expect(next.playerOutcome.kind).toBe(PlayerOutcomeKind.Defeated);
  });

  it("shrinks a fire player into recovery instead of defeating them", () => {
    const next = stepOnce(makeFirePlayerVitalityState());
    expect(next.playerOutcome.kind).toBe(PlayerOutcomeKind.Active);
    expect(next.playerVitality.kind).toBe(PlayerVitalityKind.Recovering);
  });

  it("star invincibility ignores hazard contact entirely", () => {
    const levelResult = makeLevelSpec(makeHazardLevelInput());
    if (!levelResult.ok) {
      throw new Error("expected level");
    }
    const stateResult = makeInitialSimulationStateWithPlayerVitality(
      nominalFrameMilliseconds,
      levelResult.value,
      initialMovementConstants,
      makeFirePlayerVitalityState(),
    );
    if (!stateResult.ok) {
      throw new Error("expected initial state");
    }
    const starred = {
      ...stateResult.value,
      playerInvincibility: {
        ...stateResult.value.playerInvincibility,
        remainingFrames: 60,
      } as (typeof stateResult.value)["playerInvincibility"],
    };
    const next = stepSimulation(
      starred,
      {
        horizontal: HorizontalInput.Neutral,
        jumpPressed: false,
        runHeld: false,
        firePressed: false,
        upHeld: false,
        downHeld: false,
      },
      initialMovementConstants,
      levelResult.value,
    );
    expect(next.playerOutcome.kind).toBe(PlayerOutcomeKind.Active);
    expect(next.playerVitality.kind).toBe(PlayerVitalityKind.Fire);
  });

  it("ignores hazard contact during the recovery window", () => {
    const shrunk = stepOnce(makeFirePlayerVitalityState());
    const afterAnotherFrame = stepSimulation(
      shrunk,
      {
        horizontal: HorizontalInput.Neutral,
        jumpPressed: false,
        runHeld: false,
        firePressed: false,
        upHeld: false,
        downHeld: false,
      },
      initialMovementConstants,
      (() => {
        const levelResult = makeLevelSpec(makeHazardLevelInput());
        if (!levelResult.ok) {
          throw new Error("expected level");
        }
        return levelResult.value;
      })(),
    );
    expect(afterAnotherFrame.playerOutcome.kind).toBe(PlayerOutcomeKind.Active);
  });
});

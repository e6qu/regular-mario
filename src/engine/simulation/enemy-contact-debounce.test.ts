import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import type { LevelSpecInput } from "../domain/level-spec";
import { HorizontalInput, type SimulationInputCommand } from "./input-command";
import { initialMovementConstants } from "./movement-model";
import { PlayerOutcomeKind } from "./player-outcome";
import {
  makeInitialPlayerVitalityState,
  makePoweredPlayerVitalityState,
  PlayerVitalityKind,
} from "./player-vitality";
import { makeInitialSimulationStateWithPlayerVitality } from "./simulation-state";
import {
  enemyDamageContactCooldownFrames,
  stepSimulation,
} from "./step-simulation";
import type { SimulationState } from "./simulation-state";

const nominalFrameMilliseconds = 1000 / 60;

// A flat strip: the player starts a couple of tiles left of a single Goomba, so
// running right walks straight into it and stays overlapping.
function makeContactLevelInput(
  options: { readonly secondEnemy?: boolean } = {},
): LevelSpecInput {
  const width = 12;
  const height = 9;
  // Solid walls on both ends (and grass floor) so knockback can't shove the
  // player off the level into a pit — isolating the enemy-contact outcome.
  const rows = Array.from({ length: height }, (_, rowIndex) =>
    Array.from({ length: width }, (_unused, columnIndex) =>
      rowIndex === height - 1 || columnIndex === 0 || columnIndex === width - 1
        ? rowIndex === height - 1
          ? "grass"
          : "stone"
        : "sky",
    ),
  );
  const actors: LevelSpecInput["actors"] = [
    { entityId: "player-1", actorId: "player", x: 2, y: height - 2 },
    { entityId: "goomba-1", actorId: "goomba", x: 4, y: height - 2 },
    { entityId: "exit-1", actorId: "gate", x: width - 2, y: height - 2 },
    ...(options.secondEnemy === true
      ? [
          {
            entityId: "goomba-2",
            actorId: "goomba",
            x: 6,
            y: height - 2,
          },
        ]
      : []),
  ];
  return {
    widthTiles: width,
    heightTiles: height,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "sky", collision: "empty" },
      { tileId: "grass", collision: "solid" },
      { tileId: "stone", collision: "solid" },
      { tileId: "gate", collision: "goal" },
    ],
    actorDefinitions: [
      { actorId: "player", role: "player-start" },
      { actorId: "goomba", role: "enemy" },
      { actorId: "gate", role: "exit" },
    ],
    tiles: rows,
    actors,
  };
}

function runRight(): SimulationInputCommand {
  return {
    horizontal: HorizontalInput.Right,
    jumpPressed: false,
    runHeld: true,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

function makeState(
  options: { readonly secondEnemy?: boolean } = {},
): { state: SimulationState; level: ReturnType<typeof makeLevelSpec> } {
  const level = makeLevelSpec(makeContactLevelInput(options));
  if (!level.ok) {
    throw new Error(level.errors.map((e) => e.message).join(", "));
  }
  const stateResult = makeInitialSimulationStateWithPlayerVitality(
    nominalFrameMilliseconds,
    level.value,
    initialMovementConstants,
    makePoweredPlayerVitalityState(),
  );
  if (!stateResult.ok) {
    throw new Error("expected initial state");
  }
  return { state: stateResult.value, level };
}

describe("per-enemy contact debounce", () => {
  it("lets one enemy finish a big player off, but only via a second hit more than a second later", () => {
    const { state, level } = makeState();
    if (!level.ok) {
      throw new Error("level");
    }
    let current = state;
    let demoteFrame = -1;
    let defeatFrame = -1;
    // Run right into the one Goomba and keep pushing well past the damage-
    // recovery window (120 frames) and the per-enemy debounce window (60).
    for (let frame = 0; frame < 260; frame += 1) {
      current = stepSimulation(
        current,
        runRight(),
        initialMovementConstants,
        level.value,
      );
      if (
        demoteFrame < 0 &&
        current.playerVitality.kind !== PlayerVitalityKind.Powered
      ) {
        demoteFrame = frame;
      }
      if (
        defeatFrame < 0 &&
        current.playerOutcome.kind === PlayerOutcomeKind.Defeated
      ) {
        defeatFrame = frame;
        break;
      }
    }
    // The first hit only demotes the big player, and the SAME enemy is debounced
    // so it cannot immediately double-hit: it must land a distinct second touch
    // more than a second (60 frames) later to finish the small player off.
    expect(demoteFrame).toBeGreaterThanOrEqual(0);
    expect(defeatFrame).toBeGreaterThanOrEqual(0);
    expect(defeatFrame - demoteFrame).toBeGreaterThan(
      enemyDamageContactCooldownFrames,
    );
  });

  it("still lets a DIFFERENT enemy land its own hit", () => {
    // A small player walking into a fresh enemy is defeated — the debounce is
    // per-enemy, so it never shields against a different enemy.
    const level = makeLevelSpec(makeContactLevelInput());
    if (!level.ok) {
      throw new Error("level");
    }
    const stateResult = makeInitialSimulationStateWithPlayerVitality(
      nominalFrameMilliseconds,
      level.value,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
    );
    if (!stateResult.ok) {
      throw new Error("state");
    }
    let current = stateResult.value;
    for (
      let frame = 0;
      frame < 120 &&
      current.playerOutcome.kind !== PlayerOutcomeKind.Defeated;
      frame += 1
    ) {
      current = stepSimulation(
        current,
        runRight(),
        initialMovementConstants,
        level.value,
      );
    }
    expect(current.playerOutcome.kind).toBe(PlayerOutcomeKind.Defeated);
  });
});

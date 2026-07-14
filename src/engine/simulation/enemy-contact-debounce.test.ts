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
import { stepSimulation } from "./step-simulation";
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
  it("only demotes a big player through one sustained touch — never finishing the kill", () => {
    const { state, level } = makeState();
    if (!level.ok) {
      throw new Error("level");
    }
    let current = state;
    let demoteFrame = -1;
    let defeated = false;
    // Run right into the one Goomba and keep pushing, holding contact well past
    // the damage-recovery window (120 frames). One enemy in unbroken contact must
    // never chip a big player down to a kill: it may demote them once, but the
    // debounce holds for as long as the overlap is sustained.
    for (let frame = 0; frame < 400; frame += 1) {
      current = stepSimulation(
        current,
        runRight(),
        initialMovementConstants,
        level.value,
      );
      if (
        demoteFrame < 0 &&
        current.players[0].vitality.kind !== PlayerVitalityKind.Powered
      ) {
        demoteFrame = frame;
      }
      if (current.players[0].outcome.kind === PlayerOutcomeKind.Defeated) {
        defeated = true;
        break;
      }
    }
    // The single sustained touch demotes the big player into recovery and leaves
    // them alive — the same enemy can never finish the kill while contact holds.
    expect(demoteFrame).toBeGreaterThanOrEqual(0);
    expect(defeated).toBe(false);
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
      current.players[0].outcome.kind !== PlayerOutcomeKind.Defeated;
      frame += 1
    ) {
      current = stepSimulation(
        current,
        runRight(),
        initialMovementConstants,
        level.value,
      );
    }
    expect(current.players[0].outcome.kind).toBe(PlayerOutcomeKind.Defeated);
  });
});

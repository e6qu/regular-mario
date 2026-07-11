import { HorizontalInput } from "../../simulation/input-command";
import { makeSimulationInputCommand } from "../../simulation/input-command";
import type { SimulationInputCommand } from "../../simulation/input-command";
import { initialMovementConstants } from "../../simulation/movement-model";
import {
  makeInitialSimulationStateWithPlayerVitality,
  type SimulationState,
} from "../../simulation/simulation-state";
import type { PlayerVitalityState } from "../../simulation/player-vitality";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../../simulation/simulation-units";
import { stepSimulation } from "../../simulation/step-simulation";
import { loadOfficialSmbPack } from "./official-smb-pack.test-support";
import type { LevelSpec } from "../../domain/level-spec";

// Shared scaffolding for the official-pack scenario regression tests: load a
// level, drop the player onto a chosen pixel position, and drive real
// simulation steps. Keeps each scenario test to just the geometry it asserts.

export function loadOfficialLevelSpec(name: string): LevelSpec {
  const spec = loadOfficialSmbPack().get(name)?.levelSpec;
  if (spec === undefined) {
    throw new Error(`Official pack is missing level ${name}.`);
  }
  return spec;
}

export function startStateAtPixel(
  spec: LevelSpec,
  vitality: PlayerVitalityState,
  pixelX: number,
  pixelY: number,
): SimulationState {
  const init = makeInitialSimulationStateWithPlayerVitality(
    nominalSixtyHertzFrameDurationMilliseconds,
    spec,
    initialMovementConstants,
    vitality,
  );
  if (!init.ok) {
    throw new Error("Expected the scenario level to build an initial state.");
  }
  return {
    ...init.value,
    player: {
      ...init.value.player,
      position: {
        x: pixelX as never,
        y: pixelY as never,
      },
    },
  };
}

export function makeScenarioInput(input: {
  readonly horizontal?: HorizontalInput;
  readonly jump?: boolean;
  readonly run?: boolean;
  readonly crouch?: boolean;
}): SimulationInputCommand {
  const command = makeSimulationInputCommand(
    input.horizontal ?? HorizontalInput.Neutral,
    input.jump ?? false,
    input.run ?? false,
    false,
    false,
    input.crouch ?? false,
  );
  if (!command.ok) {
    throw new Error("Expected a valid scenario input command.");
  }
  return command.value;
}

export function stepScenario(
  state: SimulationState,
  input: SimulationInputCommand,
  spec: LevelSpec,
  frames: number,
): SimulationState {
  let next = state;
  for (let frame = 0; frame < frames; frame += 1) {
    next = stepSimulation(next, input, initialMovementConstants, spec);
  }
  return next;
}

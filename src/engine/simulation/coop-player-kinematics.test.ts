import { describe, expect, it } from "vitest";

import { stepCoopPlayerKinematics } from "./coop-player-kinematics";
import {
  firstAuthoredLevelSpec,
  spawnedPrimaryPlayer,
} from "./level-test-support";
import { HorizontalInput, type SimulationInputCommand } from "./input-command";
import { initialMovementConstants } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "./simulation-units";

function spawnPlayer(): PlayerSimulationState {
  return spawnedPrimaryPlayer();
}

function input(
  overrides: Partial<SimulationInputCommand> = {},
): SimulationInputCommand {
  return {
    horizontal: HorizontalInput.Neutral,
    jumpPressed: false,
    runHeld: false,
    firePressed: false,
    upHeld: false,
    downHeld: false,
    ...overrides,
  };
}

function step(
  player: PlayerSimulationState,
  command: SimulationInputCommand,
): PlayerSimulationState {
  return stepCoopPlayerKinematics(
    player,
    command,
    nominalSixtyHertzFrameDurationMilliseconds,
    initialMovementConstants,
    firstAuthoredLevelSpec(),
  );
}

describe("stepCoopPlayerKinematics", () => {
  it("walks a co-op player right with rightward input", () => {
    let player = spawnPlayer();
    const startX = player.position.x;
    for (let frame = 0; frame < 15; frame += 1) {
      player = step(player, input({ horizontal: HorizontalInput.Right }));
    }
    expect(player.position.x).toBeGreaterThan(startX);
  });

  it("jumps upward on jump input, then gravity brings it back down", () => {
    let player = spawnPlayer();
    const restY = player.position.y;
    player = step(player, input({ jumpPressed: true }));
    const apex = player.position.y;
    expect(apex).toBeLessThan(restY);
    for (let frame = 0; frame < 60; frame += 1) {
      player = step(player, input());
    }
    // Landed back on the ground (never below the starting rest level).
    expect(player.position.y).toBeGreaterThan(apex);
    expect(player.position.y).toBeLessThanOrEqual(restY + 1);
  });

  it("rests on solid ground under gravity with no input", () => {
    let player = spawnPlayer();
    for (let frame = 0; frame < 10; frame += 1) {
      player = step(player, input());
    }
    const settledY = player.position.y;
    player = step(player, input());
    expect(Math.abs(player.position.y - settledY)).toBeLessThan(1);
  });
});

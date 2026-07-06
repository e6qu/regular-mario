import {
  makeFrameDurationMilliseconds,
  makePixelPosition,
  makeVelocityPixelsPerSecond,
} from "../domain/units";
import { makeInitialPlayerSimulationState } from "./player-state";
import type { PlayerSimulationState } from "./player-state";

export function testFrameDurationMilliseconds(value: number) {
  const result = makeFrameDurationMilliseconds(value, "test.frameDuration");

  if (!result.ok) {
    throw new Error("Expected valid test frame duration.");
  }

  return result.value;
}

export function playerWithTestVelocity(
  velocity: {
    readonly x: number;
    readonly y: number;
  },
  movement: PlayerSimulationState["movement"],
): PlayerSimulationState {
  const velocityXResult = makeVelocityPixelsPerSecond(
    velocity.x,
    "test.player.velocity.x",
  );
  const velocityYResult = makeVelocityPixelsPerSecond(
    velocity.y,
    "test.player.velocity.y",
  );
  const initialPlayer = makeInitialPlayerSimulationState();

  if (!velocityXResult.ok || !velocityYResult.ok) {
    throw new Error("Expected valid test velocity.");
  }

  return {
    ...initialPlayer,
    velocity: {
      x: velocityXResult.value,
      y: velocityYResult.value,
    },
    movement,
  };
}

export function playerWithTestState(input: {
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  readonly velocity: {
    readonly x: number;
    readonly y: number;
  };
  readonly movement: PlayerSimulationState["movement"];
}): PlayerSimulationState {
  const positionXResult = makePixelPosition(
    input.position.x,
    "test.player.position.x",
  );
  const positionYResult = makePixelPosition(
    input.position.y,
    "test.player.position.y",
  );
  const player = playerWithTestVelocity(input.velocity, input.movement);

  if (!positionXResult.ok || !positionYResult.ok) {
    throw new Error("Expected valid test position.");
  }

  return {
    ...player,
    position: {
      x: positionXResult.value,
      y: positionYResult.value,
    },
  };
}

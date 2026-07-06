import {
  makePixelPosition,
  type FrameDurationMilliseconds,
} from "../domain/units";
import type { PlayerSimulationState } from "./player-state";
import { makeFrameDurationSeconds } from "./simulation-units";

function requirePixelPosition(value: number, path: string) {
  const result = makePixelPosition(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid pixel position.`);
  }

  return result.value;
}

export function applyPositionMovement(
  player: PlayerSimulationState,
  frameDurationMilliseconds: FrameDurationMilliseconds,
): PlayerSimulationState {
  const frameDurationSeconds = makeFrameDurationSeconds(
    frameDurationMilliseconds,
  );

  return {
    position: {
      x: requirePixelPosition(
        player.position.x + player.velocity.x * frameDurationSeconds,
        "player.position.x",
      ),
      y: requirePixelPosition(
        player.position.y + player.velocity.y * frameDurationSeconds,
        "player.position.y",
      ),
    },
    velocity: player.velocity,
    collider: player.collider,
    movement: player.movement,
    coyoteFramesRemaining: player.coyoteFramesRemaining,
    jumpBufferFramesRemaining: player.jumpBufferFramesRemaining,
    jumpCutApplied: player.jumpCutApplied,
  };
}

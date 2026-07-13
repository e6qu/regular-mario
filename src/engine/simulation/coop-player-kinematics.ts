import type { FrameDurationMilliseconds } from "../domain/units";
import type { LevelSpec } from "../domain/level-spec";
import { applyHorizontalMovement } from "./horizontal-movement";
import type { SimulationInputCommand } from "./input-command";
import type { MovementConstants } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import { applyPositionMovement } from "./position-movement";
import { resolveSolidTileCollision } from "./solid-tile-collision";
import { applyVerticalMovement } from "./vertical-movement";

// The shared per-player movement step for a co-op player: walk/run, gravity and
// jump, integrate the position, and resolve solid-tile collision so the player
// stands on ground and is stopped by walls. Deliberately the plain terrain
// movement — no block bumps, climbing, pipes, crouch or enemy/collectible
// interactions yet (those arrive with the uniform-interaction increment). Pure,
// so every player runs the identical function.
export function stepCoopPlayerKinematics(
  player: PlayerSimulationState,
  inputCommand: SimulationInputCommand,
  frameDurationMilliseconds: FrameDurationMilliseconds,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
): PlayerSimulationState {
  const horizontallyMoved = applyHorizontalMovement(
    player,
    inputCommand,
    frameDurationMilliseconds,
    movementConstants,
  );
  const verticallyMoved = applyVerticalMovement(
    horizontallyMoved,
    inputCommand,
    frameDurationMilliseconds,
    movementConstants,
  );
  const moved = applyPositionMovement(
    verticallyMoved,
    frameDurationMilliseconds,
  );
  return resolveSolidTileCollision(player, moved, levelSpec);
}

import type { BreakableBlockState } from "./breakable-block-state";
import type { FrameDurationMilliseconds, TilePoint } from "../domain/units";
import type { LevelSpec } from "../domain/level-spec";
import { applyHorizontalMovement } from "./horizontal-movement";
import type { SimulationInputCommand } from "./input-command";
import type { MovementConstants } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import { applyPositionMovement } from "./position-movement";
import { resolveSolidTileCollisionWithBlockBumps } from "./solid-tile-collision";
import { applyVerticalMovement } from "./vertical-movement";

/** What a co-op player did to the world this frame, besides moving. */
export interface CoopPlayerKinematicsResult {
  readonly player: PlayerSimulationState;
  /** `?`/hidden blocks this player head-bumped. */
  readonly bumpedInteractiveBlocks: readonly TilePoint[];
  /** Brick blocks this player head-bumped; breaking still needs the size. */
  readonly bumpedBreakableBlocks: readonly TilePoint[];
}

// The shared per-player movement step for a co-op player: walk/run, gravity and
// jump, integrate the position, and resolve solid-tile collision so the player
// stands on ground and is stopped by walls.
//
// Head bumps are reported rather than swallowed. This used to call a
// bump-discarding collision wrapper with an *empty* breakable-block state, which
// cost two things at once: a co-op player's head bumps never reached the block
// resolvers, so only the primary player could break a brick or knock a power-up
// out of a `?` block; and blocks the party had already broken stayed solid for
// everybody else, because a collision told there are no broken blocks still
// treats their tiles as walls. Passing the live state fixes both directions.
//
// Still deliberately terrain-only beyond blocks: no climbing, pipes, crouch or
// enemy/collectible interaction.
export function stepCoopPlayerKinematics(
  player: PlayerSimulationState,
  inputCommand: SimulationInputCommand,
  frameDurationMilliseconds: FrameDurationMilliseconds,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
): CoopPlayerKinematicsResult {
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
  return resolveSolidTileCollisionWithBlockBumps(
    player,
    moved,
    levelSpec,
    breakableBlocks,
    movementConstants.springLaunchSpeed,
  );
}

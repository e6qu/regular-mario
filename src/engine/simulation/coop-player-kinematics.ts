import type { BreakableBlockState } from "./breakable-block-state";
import type { TileId } from "../domain/identifiers";
import type { FrameDurationMilliseconds, TilePoint } from "../domain/units";
import type { LevelSpec } from "../domain/level-spec";
import { applyClimbableMovement } from "./climbable-interaction";
import { resolveCrouchState } from "./crouch-state";
import { applyHorizontalMovement } from "./horizontal-movement";
import type { SimulationInputCommand } from "./input-command";
import type { MovementConstants } from "./movement-model";
import type { PlayerVitalityState } from "./player-vitality";
import type { PlayerSimulationState } from "./player-state";
import { applyPositionMovement } from "./position-movement";
import { resolveSolidTileCollisionWithBlockBumps } from "./solid-tile-collision";
import type { SpawnedActor } from "./interactive-block-state";
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
// Climbing is here too, in the same position the primary player applies it, so
// a vine is climbable by whoever grabs it rather than only by slot 0 — a level
// gated behind a beanstalk was otherwise impassable for everybody else.
//
// Crouching runs through the same `resolveCrouchState` the primary uses, so a
// big co-op player can duck and crawl the one-tile gaps 1-2 and 4-2 are built
// around. Sharing the helper rather than restating the five coupled rules is
// the point: a restated rule is how the paths drift apart again.
//
// Still missing, and still needless variance: pipes.
export function stepCoopPlayerKinematics(
  player: PlayerSimulationState,
  inputCommand: SimulationInputCommand,
  frameDurationMilliseconds: FrameDurationMilliseconds,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
  spawnedActors: readonly SpawnedActor[],
  vitality: PlayerVitalityState,
  makeCrawlMovementConstants: (base: MovementConstants) => MovementConstants,
  // Positions of hidden blocks the party has already revealed: they are solid
  // for every player. Omitting them meant a co-op player fell straight through
  // the platform a teammate had just bumped into existence.
  revealedHiddenPositionKeys: ReadonlySet<string>,
  // Tiles a god-mode player may stand on (lava), identical to the primary's.
  walkableHazardTileIds: ReadonlySet<TileId>,
): CoopPlayerKinematicsResult {
  const crouch = resolveCrouchState(
    player,
    vitality,
    inputCommand,
    inputCommand,
    levelSpec,
    breakableBlocks,
    movementConstants,
    makeCrawlMovementConstants,
    // Only the primary player can enter a pipe today.
    false,
  );
  const horizontallyMoved = applyHorizontalMovement(
    crouch.player,
    crouch.inputCommand,
    frameDurationMilliseconds,
    crouch.movementConstants,
  );
  const climbableMovement = applyClimbableMovement(
    horizontallyMoved,
    crouch.inputCommand,
    levelSpec,
    spawnedActors,
    movementConstants,
  );
  const verticallyMoved = climbableMovement.climbing
    ? climbableMovement.player
    : applyVerticalMovement(
        horizontallyMoved,
        crouch.inputCommand,
        frameDurationMilliseconds,
        movementConstants,
      );
  const moved = applyPositionMovement(
    verticallyMoved,
    frameDurationMilliseconds,
  );
  const resolved = resolveSolidTileCollisionWithBlockBumps(
    crouch.player,
    moved,
    levelSpec,
    breakableBlocks,
    movementConstants.springLaunchSpeed,
    revealedHiddenPositionKeys,
    walkableHazardTileIds,
    // A spring landing launches at the boosted speed while jump is held,
    // exactly as the primary's collision call passes its own jump input.
    crouch.inputCommand.jumpPressed,
  );
  // Re-stamp the crouch flag, exactly as the primary player's step does: the
  // collision rebuilders drop it, and without it the ducked hurtbox and the
  // "stay ducked under a low ceiling" rule both stop applying next frame.
  return crouch.crouching
    ? { ...resolved, player: { ...resolved.player, crouching: true } }
    : resolved;
}

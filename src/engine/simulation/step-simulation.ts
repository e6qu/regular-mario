import { makeFrameIndex } from "../domain/units";
import type { FrameIndex, TilePoint } from "../domain/units";
import type { EntityId } from "../domain/identifiers";
import {
  assertValidCollectibleInteractionState,
  resolveCollectibleInteractionState,
} from "./collectible-interaction";
import { applyClimbableMovement } from "./climbable-interaction";
import {
  assertValidEnemyContactResponseState,
  EnemyContactResponseKind,
  EnemySideContactSide,
  type EnemyContactResponseState,
  resolveEnemyContactResponseState,
} from "./enemy-contact-response";
import {
  assertValidEnemyInteractionState,
  consecutiveDefeatAwardsExtraLife,
  countNewlyDefeated,
  type EnemyInteractionState,
  playerContactsLiveEnemy,
  resolveEnemyInteractionState,
  scoreForConsecutiveDefeat,
} from "./enemy-interaction";
import {
  assertValidEnemyMotionState,
  stopDefeatedEnemyMotionState,
  stepEnemyMotionState,
} from "./enemy-motion";
import { applyHorizontalMovement } from "./horizontal-movement";
import { HorizontalInput } from "./input-command";
import type { SimulationInputCommand } from "./input-command";
import {
  assertValidBreakableBlockState,
  type BreakableBlockState,
  resolveBreakableBlockState,
} from "./breakable-block-state";
import {
  assertValidInteractiveBlockInteractionState,
  assertValidSpawnedActorsState,
  type InteractiveBlockInteractionState,
  resolveInteractiveBlockInteractionState,
  resolveSpawnedActorsState,
  type SpawnedActor,
  type SpawnedActorsState,
  stepSpawnedActorsState,
} from "./interactive-block-state";
import {
  detectLevelContactState,
  hasPlayerFallenIntoPit,
} from "./level-contact";
import {
  assertValidLevelTimerState,
  hasLevelTimerExpired,
  stepLevelTimerState,
} from "./level-timer-state";
import type { MovementConstants } from "./movement-model";
import { VerticalMovementState } from "./movement-model";
import { applyPositionMovement } from "./position-movement";
import { makeActorColliderSizePixels } from "./actor-interaction";
import {
  assertValidPowerUpInteractionState,
  resolvePowerUpInteractionState,
} from "./power-up-interaction";
import {
  applyCrouchResize,
  poweredPlayerColliderDimensions,
  resizePlayerForVitality,
  type PlayerSimulationState,
} from "./player-state";
import {
  assertValidPlayerOutcomeState,
  PlayerDefeatReason,
  PlayerFinishReason,
  PlayerOutcomeKind,
  resolvePlayerOutcomeState,
} from "./player-outcome";
import {
  applyPowerUpCollectionToVitality,
  assertValidPlayerVitalityState,
  makeRecoveryFrameCount,
  PlayerVitalityKind,
  type PlayerVitalityState,
  type RecoveryFrameCount,
} from "./player-vitality";
import { resolvePlayerReactionState } from "./player-reaction";
import { resolveStompReactionState } from "./stomp-reaction";
import {
  applyInvincibilityEnemyDefeats,
  assertValidPlayerInvincibilityState,
  resolvePlayerInvincibilityState,
} from "./player-invincibility";
import {
  assertValidProjectilesState,
  resolveProjectilesState,
} from "./projectile-state";
import {
  assertValidTimedHazardProjectilesState,
  resolveTimedHazardProjectilesState,
} from "./timed-hazard-projectile-state";
import {
  assertValidPipeEntryState,
  isPlayerFrozenByPipeEntry,
  PipeEntryPhase,
  resolvePipeState,
  teleportPlayerToTilePosition,
} from "./pipe-state";
import {
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "./simulation-units";
import { advancePseudoRandom } from "./pseudo-random";
import { resolveCheepFrenzyState } from "./cheep-frenzy-state";
import { playerTouchesFlameHazard } from "./flame-hazards";
import {
  assertValidPlatformsState,
  resolvePlatformsState,
} from "./platform-state";
import {
  assertValidAerialFrenzyState,
  resolveAerialFrenzyState,
} from "./aerial-frenzy-state";
import { assertValidLoopZoneState, resolveLoopZones } from "./loop-zone-state";
import {
  assertValidHatchedSpinyState,
  resolveHatchedSpinyState,
} from "./hatched-spiny-state";
import type {
  PlayerRuntime,
  SimulationPlayers,
  SimulationState,
} from "./simulation-state";
import { stepCoopPlayerKinematics } from "./coop-player-kinematics";
import { resolvePlayerCollisions } from "./player-player-collision";
import {
  computeCoinExtraLives,
  computeTimeBonusScore,
  scoreForGoalContactHeight,
  scorePerBreakableBlock,
  scorePerBulletBillStomp,
  scorePerProjectileKill,
} from "./game-score";
import type { LevelSpec } from "../domain/level-spec";
import { ActorRole } from "../domain/level-spec";
import type { TileId } from "../domain/identifiers";
import {
  playerHasStandingHeadroom,
  resolveSolidTileCollisionWithBlockBumps,
} from "./solid-tile-collision";
import {
  hiddenBlockPositionKey,
  makeLavaTileIds,
} from "./tile-collision-support";

// Shared empty set: no walkable hazard tiles outside god mode.
const emptyWalkableHazardTileIds: ReadonlySet<TileId> = new Set<TileId>();
import { applyVerticalMovement } from "./vertical-movement";
import {
  ArmoredEnemyBehavior,
  type EnemyMotionState,
  requireEnemyActorState,
} from "./enemy-motion";

// A given enemy can deal the player at most one damaging contact per *unbroken*
// contact — a per-enemy debounce keyed on overlap, not a timer. Once an enemy
// lands a hit it stays debounced for as long as the player keeps overlapping it,
// and only re-arms once the player fully separates (a frame with no overlap).
// So a single, sustained touch on one enemy can only ever demote a big player
// into recovery — it can never finish the kill while that contact is held. A
// *different* enemy is never shielded (the debounce is per-enemy), and a small
// player is still defeated on the very first hit.

// The top two grid rows of every decoded level are reserved for the HUD overlay
// (the decoder's row offset), so gameplay content — and the water surface —
// begins at grid row 2.
const hudReservedRowCount = 2;

// Ducked movement is a slow crawl at 40% of the walk speed; a duck-slide
// entered above this speed keeps its momentum and decays by friction.
const crawlSpeedPixels = 36;

function makeCrawlMovementConstants(
  movementConstants: MovementConstants,
): MovementConstants {
  const crawlSpeed = requireSimulationVelocity(
    crawlSpeedPixels,
    "movement.crawlSpeed",
  );
  return {
    ...movementConstants,
    maxWalkSpeed: crawlSpeed,
    maxRunSpeed: crawlSpeed,
  };
}

export function stepSimulation(
  state: SimulationState,
  inputCommand: SimulationInputCommand,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  // Per-player inputs for the additional co-op players (index i drives
  // state.players[i + 1]); empty/short means those players hold neutral. Single-
  // player callers omit this entirely.
  coopInputCommands: readonly SimulationInputCommand[] = [],
  // Network co-op intentionally permits players to overlap.  Remote players
  // otherwise become an accidental wall when one friend is idle, which makes
  // a shared-screen Internet game needlessly easy to deadlock.
  resolveCoopPlayerCollisions = true,
): SimulationState {
  const nextClock = makeNextSimulationClock(state);
  assertValidPlayerVitalityState(state.players[0].vitality);
  assertValidPlayerInvincibilityState(
    state.players[0].invincibility,
    levelSpec,
    state.spawnedActors.spawnedActors,
  );
  assertValidPlayerOutcomeState(state.players[0].outcome);
  assertValidSpawnedActorsState(state.spawnedActors);
  assertValidCollectibleInteractionState(
    state.collectibles,
    levelSpec,
    state.spawnedActors.spawnedActors,
  );
  assertValidPowerUpInteractionState(
    state.powerUps,
    levelSpec,
    state.spawnedActors.spawnedActors,
  );
  assertValidEnemyInteractionState(state.enemies, levelSpec);
  assertValidEnemyContactResponseState(state.enemyContactResponse, levelSpec);
  assertValidEnemyMotionState(state.enemyMotion, levelSpec);
  assertValidInteractiveBlockInteractionState(state.interactiveBlocks);
  assertValidBreakableBlockState(state.breakableBlocks);
  assertValidProjectilesState(state.projectiles);
  assertValidPipeEntryState(state.pipeEntry);
  assertValidLevelTimerState(state.levelTimer);
  assertValidTimedHazardProjectilesState(state.timedHazardProjectiles);
  assertValidPlatformsState(state.platforms, levelSpec);
  assertValidAerialFrenzyState(state.aerialFrenzy);
  assertValidLoopZoneState(state.loopZones);
  assertValidHatchedSpinyState(state.hatchedSpinies);

  // Co-op players move first, so their head bumps are known before the block
  // state is resolved. Their *outcomes* still resolve afterwards, because
  // whether a co-op player was killed depends on where the primary step left
  // the enemies. Only movement is hoisted, not the fate of anybody.
  const coopMovement = stepCoopPlayerMovement(
    state.players.slice(1),
    coopInputCommands,
    state.clock.frameDurationMilliseconds,
    movementConstants,
    levelSpec,
    state.breakableBlocks,
  );
  const primaryStepped = stepPrimaryPlayer(
    state,
    inputCommand,
    movementConstants,
    levelSpec,
    nextClock,
    coopMovement.blockBumps,
  );
  const primaryRuntime = primaryStepped.players[0];
  const coopRuntimes = resolveCoopPlayerOutcomes(
    coopMovement.runtimes,
    state.clock.frameDurationMilliseconds,
    Number(nextClock.frameIndex),
    levelSpec,
    primaryStepped.enemyMotion,
    primaryStepped.enemies.defeatedEnemyEntityIds,
  );
  // Local co-op retains its solid-player mechanics. Online co-op opts out so
  // an idle player cannot block the party's route.
  const runtimesBeforePlayerCollision = [primaryRuntime, ...coopRuntimes];
  const activePlayerIndices = runtimesBeforePlayerCollision.flatMap(
    (runtime, index) =>
      runtime.outcome.kind === PlayerOutcomeKind.Active ? [index] : [],
  );
  const collidedActivePlayers = resolveCoopPlayerCollisions
    ? resolvePlayerCollisions(
        activePlayerIndices.map(
          (index) => runtimesBeforePlayerCollision[index]!.player,
        ),
        activePlayerIndices.map((index) => state.players[index]!.player),
      )
    : activePlayerIndices.map(
        (index) => runtimesBeforePlayerCollision[index]!.player,
      );
  const collidedPlayerByIndex = new Map(
    activePlayerIndices.map((index, activeIndex) => [
      index,
      collidedActivePlayers[activeIndex] ??
        runtimesBeforePlayerCollision[index]!.player,
    ]),
  );
  // Any player reaching the goal completes the level for everyone: if a co-op
  // player touches the goal while the primary is still active, finish the level.
  const anyCoopReachedGoal = coopRuntimes.some(
    (runtime) => detectLevelContactState(runtime.player, levelSpec).goal,
  );
  const primaryOutcome =
    anyCoopReachedGoal &&
    primaryRuntime.outcome.kind === PlayerOutcomeKind.Active
      ? {
          kind: PlayerOutcomeKind.Finished as const,
          reason: PlayerFinishReason.GoalContact,
        }
      : primaryRuntime.outcome;

  const players: SimulationPlayers = [
    {
      ...primaryRuntime,
      player: collidedPlayerByIndex.get(0) ?? primaryRuntime.player,
      outcome: primaryOutcome,
    },
    ...coopRuntimes.map((runtime, index) => ({
      ...runtime,
      player: collidedPlayerByIndex.get(index + 1) ?? runtime.player,
    })),
  ];
  return { ...primaryStepped, players };
}

// The primary player's full pipeline (unchanged), selected by outcome.
function stepPrimaryPlayer(
  state: SimulationState,
  inputCommand: SimulationInputCommand,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  nextClock: SimulationClock,
  coopBlockBumps: readonly CoopBlockBump[],
): SimulationState {
  switch (state.players[0].outcome.kind) {
    case PlayerOutcomeKind.Active:
      return stepActiveSimulation(
        state,
        inputCommand,
        movementConstants,
        levelSpec,
        nextClock,
        coopBlockBumps,
      );
    case PlayerOutcomeKind.Defeated:
    case PlayerOutcomeKind.Finished:
    case PlayerOutcomeKind.DefeatedAndFinished:
      // The primary is out, but the party is not: a surviving team-mate's head
      // bumps must still break bricks and pop power-ups. Resolving blocks only
      // inside the active branch meant one dead player froze the level's blocks
      // for everybody still playing.
      return applyBlockBumps(
        { ...state, clock: nextClock },
        levelSpec,
        nextClock,
        coopBlockBumps,
      );
    default: {
      const invalidOutcome: never = state.players[0].outcome;
      throw new Error(
        `Invalid player outcome state: ${String(invalidOutcome)}`,
      );
    }
  }
}

// Advance each additional co-op player through the shared terrain kinematics
// with its own input (or neutral when none is provided this frame).
// Co-op bots are invincible for the first 10 seconds of a level so they survive
// the crowded spawn (a pile of bots would otherwise knock each other into the
// first enemy/pit before anyone gets moving).
const coopSpawnInvincibilityMilliseconds = 10000;

/**
 * One co-op player's head bumps this frame, tagged with that player's vitality.
 *
 * The vitality travels with the bumps because the block rules read it: a small
 * player nudges a brick and it stays, an enlarged one breaks it. Merging every
 * player's bumps into one flat list and resolving them against slot 0's vitality
 * would let a small primary veto a super team-mate's break — and vice versa.
 */
interface CoopBlockBump {
  readonly vitality: PlayerVitalityState;
  readonly bumpedInteractiveBlocks: readonly TilePoint[];
  readonly bumpedBreakableBlocks: readonly TilePoint[];
}

interface CoopPlayersMovement {
  readonly runtimes: readonly PlayerRuntime[];
  readonly blockBumps: readonly CoopBlockBump[];
}

interface BumpedBlocksResolution {
  readonly interactiveBlocks: InteractiveBlockInteractionState;
  readonly breakableBlocks: BreakableBlockState;
  readonly spawnedActors: SpawnedActorsState;
}

/**
 * Apply every player's head bumps to the world's blocks, in one place.
 *
 * `?` blocks are position-only, so those bumps merge into one list. Bricks and
 * block contents are not: both read the vitality of whoever swung, so the
 * bumpers are folded one at a time. Flattening them and resolving against a
 * single vitality would let a small player veto a super team-mate's break, or
 * quietly upgrade a small player's nudge into a break because somebody else in
 * the party happened to be big.
 */
function resolveBumpedBlocks(
  state: SimulationState,
  levelSpec: LevelSpec,
  nextClock: SimulationClock,
  bumpers: readonly CoopBlockBump[],
): BumpedBlocksResolution {
  return {
    interactiveBlocks: resolveInteractiveBlockInteractionState(
      state.interactiveBlocks,
      bumpers.flatMap((bumper) => bumper.bumpedInteractiveBlocks),
    ),
    breakableBlocks: bumpers.reduce(
      (blocks, bumper) =>
        resolveBreakableBlockState(
          blocks,
          bumper.bumpedBreakableBlocks,
          bumper.vitality,
        ),
      state.breakableBlocks,
    ),
    spawnedActors: bumpers.reduce(
      (spawned, bumper) =>
        resolveSpawnedActorsState(
          spawned,
          levelSpec,
          bumper.bumpedInteractiveBlocks,
          nextClock.frameIndex,
          // A super player's power-up block yields the fire flower (ROM
          // size-dependent contents) — again per bumper, not per slot 0.
          bumper.vitality.kind !== PlayerVitalityKind.Small,
        ),
      state.spawnedActors,
    ),
  };
}

/**
 * Fold co-op head bumps into a state whose primary player is not being stepped.
 *
 * Used when slot 0 is defeated or finished: the rest of the party is still
 * playing, and their bumps have to land somewhere.
 */
function applyBlockBumps(
  state: SimulationState,
  levelSpec: LevelSpec,
  nextClock: SimulationClock,
  bumpers: readonly CoopBlockBump[],
): SimulationState {
  if (bumpers.length === 0) {
    return state;
  }
  const resolved = resolveBumpedBlocks(state, levelSpec, nextClock, bumpers);
  return {
    ...state,
    interactiveBlocks: resolved.interactiveBlocks,
    breakableBlocks: resolved.breakableBlocks,
    spawnedActors: stepSpawnedActorsState(
      resolved.spawnedActors,
      state.clock.frameDurationMilliseconds,
      levelSpec,
      resolved.breakableBlocks,
    ),
  };
}

function stepCoopPlayerMovement(
  coopRuntimes: readonly PlayerRuntime[],
  coopInputCommands: readonly SimulationInputCommand[],
  frameDurationMilliseconds: SimulationClock["frameDurationMilliseconds"],
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
): CoopPlayersMovement {
  if (coopRuntimes.length === 0) {
    return { runtimes: coopRuntimes, blockBumps: [] };
  }
  // Each co-op player's head bumps are kept beside that player's own vitality:
  // whether a bumped brick breaks is a property of who hit it, not of whoever
  // happens to occupy slot 0.
  const blockBumps: CoopBlockBump[] = [];
  const moved = coopRuntimes.map((runtime, index) => {
    if (runtime.outcome.kind !== PlayerOutcomeKind.Active) {
      return runtime;
    }
    const stepped = stepCoopPlayerKinematics(
      runtime.player,
      coopInputCommands[index] ?? neutralInputCommand,
      frameDurationMilliseconds,
      movementConstants,
      levelSpec,
      breakableBlocks,
    );
    if (
      stepped.bumpedInteractiveBlocks.length > 0 ||
      stepped.bumpedBreakableBlocks.length > 0
    ) {
      blockBumps.push({
        vitality: runtime.vitality,
        bumpedInteractiveBlocks: stepped.bumpedInteractiveBlocks,
        bumpedBreakableBlocks: stepped.bumpedBreakableBlocks,
      });
    }
    return { ...runtime, player: stepped.player };
  });
  return { runtimes: moved, blockBumps };
}

// Decide what became of each co-op player after everything else moved: reaching
// the goal, touching an enemy the primary step may just have stomped, falling
// into a pit. Split from the movement above so head bumps are available before
// the block state is resolved, while fates still settle against the final world.
function resolveCoopPlayerOutcomes(
  moved: readonly PlayerRuntime[],
  frameDurationMilliseconds: SimulationClock["frameDurationMilliseconds"],
  frameIndex: number,
  levelSpec: LevelSpec,
  enemyMotion: EnemyMotionState,
  defeatedEnemyEntityIds: readonly EntityId[],
): readonly PlayerRuntime[] {
  if (moved.length === 0) {
    return moved;
  }
  // A co-op member reaching the goal completes the shared level immediately,
  // including during the brief spawn-invincibility window. The authoritative
  // multiplayer runner ends the whole game when any runtime is finished.
  const withGoalOutcomes = moved.map<PlayerRuntime>((runtime) => {
    if (runtime.outcome.kind !== PlayerOutcomeKind.Active) {
      return runtime;
    }
    return detectLevelContactState(runtime.player, levelSpec).goal
      ? {
          ...runtime,
          outcome: {
            kind: PlayerOutcomeKind.Finished,
            reason: PlayerFinishReason.GoalContact,
          },
        }
      : runtime;
  });
  // During the spawn-invincibility window nobody is removed, so the bots ride
  // out the initial scrum unharmed.
  if (
    frameIndex * Number(frameDurationMilliseconds) <
    coopSpawnInvincibilityMilliseconds
  ) {
    return withGoalOutcomes;
  }
  // A defeated co-op player remains in the uniform player array as a spectator
  // until the level ends. Keeping the stable slot is required by authoritative
  // multiplayer: network player IDs must never silently shift when somebody
  // dies. Defeated runtimes no longer collide or consume input above.
  const runtimes = moved.map<PlayerRuntime>((runtime) => {
    if (runtime.outcome.kind !== PlayerOutcomeKind.Active) {
      return runtime;
    }
    const enemyContact = playerContactsLiveEnemy(
      runtime.player,
      levelSpec,
      enemyMotion,
      defeatedEnemyEntityIds,
    );
    const levelContact = detectLevelContactState(runtime.player, levelSpec);
    const fellIntoPit =
      levelSpec.fallExitTransition === undefined &&
      hasPlayerFallenIntoPit(runtime.player, levelSpec);
    const reason = fellIntoPit
      ? PlayerDefeatReason.PitContact
      : enemyContact && levelContact.hazard
        ? PlayerDefeatReason.HazardAndEnemyContact
        : enemyContact
          ? PlayerDefeatReason.EnemyContact
          : levelContact.hazard
            ? PlayerDefeatReason.HazardContact
            : undefined;
    if (reason === undefined) {
      return levelContact.goal
        ? {
            ...runtime,
            outcome: {
              kind: PlayerOutcomeKind.Finished,
              reason: PlayerFinishReason.GoalContact,
            },
          }
        : runtime;
    }
    return {
      ...runtime,
      outcome: levelContact.goal
        ? {
            kind: PlayerOutcomeKind.DefeatedAndFinished,
            defeatReason: reason,
            finishReason: PlayerFinishReason.GoalContact,
          }
        : {
            kind: PlayerOutcomeKind.Defeated,
            reason,
          },
    };
  });
  return runtimes;
}

const neutralInputCommand: SimulationInputCommand = {
  horizontal: HorizontalInput.Neutral,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

type SimulationClock = SimulationState["clock"];

function makeNextSimulationClock(state: SimulationState): SimulationClock {
  if (state.clock.frameIndex === Number.MAX_SAFE_INTEGER) {
    throw new Error("Simulation frame index cannot advance safely.");
  }

  const nextFrameIndexResult = makeFrameIndex(
    state.clock.frameIndex + 1,
    "clock.frameIndex",
  );

  if (!nextFrameIndexResult.ok) {
    throw new Error("Next simulation frame index is invalid.");
  }

  return {
    frameIndex: nextFrameIndexResult.value,
    frameDurationMilliseconds: state.clock.frameDurationMilliseconds,
  };
}

function stepActiveSimulation(
  state: SimulationState,
  inputCommand: SimulationInputCommand,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  nextClock: SimulationClock,
  coopBlockBumps: readonly CoopBlockBump[],
): SimulationState {
  const playerVitalityAfterRecoveryTick = stepPlayerVitalityRecovery(
    state.players[0].vitality,
  );
  const levelTimer = stepLevelTimerState(state.levelTimer);

  const pipeState = resolvePipeState(
    { downHeld: inputCommand.downHeld, horizontal: inputCommand.horizontal },
    state.players[0].player,
    state.pipeEntry,
    movementConstants,
    levelSpec,
    undefined,
  );

  const teleportResult = pipeState.teleport;

  // Crouch (big Mario ducking): Down held while grounded, when not entering a
  // pipe (the pipe entry also reads Down and takes precedence). Ducking stops
  // the walk and — via the player's `crouching` flag stamped below — shrinks the
  // hurtbox to the ROM's 12×12 crouch box.
  const isBigVitality =
    playerVitalityAfterRecoveryTick.kind === PlayerVitalityKind.Powered ||
    playerVitalityAfterRecoveryTick.kind === PlayerVitalityKind.Fire;
  const wantsCrouch =
    isBigVitality &&
    state.players[0].player.movement.vertical ===
      VerticalMovementState.Grounded &&
    inputCommand.downHeld &&
    !isPlayerFrozenByPipeEntry(pipeState.pipeEntry);
  // A ducked player under a low ceiling stays ducked (no standing up inside a
  // one-tile crawl) until the standing box has headroom again. Only a player
  // whose collider is actually the ducked size can be held crouched — the
  // headroom probe assumes the small box, and a standing player near a low
  // ceiling must never be pulled back into a crouch.
  const mustStayCrouched =
    state.players[0].player.crouching === true &&
    isBigVitality &&
    state.players[0].player.collider.height <
      Number(poweredPlayerColliderDimensions.height) &&
    !playerHasStandingHeadroom(
      state.players[0].player,
      Number(poweredPlayerColliderDimensions.height),
      levelSpec,
      state.breakableBlocks,
    );
  const crouching = wantsCrouch || mustStayCrouched;
  // Ducking shrinks the terrain collider to the small one-tile box
  // (feet-anchored) like the ROM's lowered duck probes; standing back up
  // restores the big box. This is what lets a running duck slide through the
  // canonical 1-2/4-2 one-tile crawls as big Mario.
  const crouchSizedPlayer = applyCrouchResize(
    state.players[0].player,
    crouching,
    playerVitalityAfterRecoveryTick,
  );

  const baseInputCommand = isPlayerFrozenByPipeEntry(pipeState.pipeEntry)
    ? freezePlayerInputCommand(inputCommand)
    : makeRecoveryAdjustedInputCommand(
        inputCommand,
        playerVitalityAfterRecoveryTick,
      );
  // Ducked movement is a slow crawl (the ROM forbids walking while ducked
  // entirely, but that makes the 1-2/4-2 one-tile crawls unusable from a
  // standstill and lets you soft-lock mid-slide — deliberate deviation).
  // A duck-slide above crawl speed keeps its momentum: input is neutralized
  // so friction plays out exactly like the original's slide.
  const crouchSliding =
    crouching &&
    Math.abs(Number(state.players[0].player.velocity.x)) > crawlSpeedPixels;
  const effectiveInputCommand = crouchSliding
    ? { ...baseInputCommand, horizontal: HorizontalInput.Neutral }
    : baseInputCommand;
  const effectiveMovementConstants =
    crouching && !crouchSliding
      ? makeCrawlMovementConstants(movementConstants)
      : movementConstants;

  const horizontallyMovedPlayer = applyHorizontalMovement(
    crouchSizedPlayer,
    effectiveInputCommand,
    state.clock.frameDurationMilliseconds,
    effectiveMovementConstants,
    state.bloodiness,
  );
  const climbableMovement = applyClimbableMovement(
    horizontallyMovedPlayer,
    effectiveInputCommand,
    levelSpec,
    state.spawnedActors.spawnedActors,
    movementConstants,
  );
  const verticallyMovedPlayer = climbableMovement.climbing
    ? climbableMovement.player
    : applyVerticalMovement(
        horizontallyMovedPlayer,
        effectiveInputCommand,
        state.clock.frameDurationMilliseconds,
        movementConstants,
      );

  const movedPlayer = applyPositionMovement(
    verticallyMovedPlayer,
    state.clock.frameDurationMilliseconds,
  );

  // Hidden blocks revealed on earlier frames are solid now; feed their positions
  // to the collision so the player can stand on / bonk them like normal blocks.
  const revealedHiddenPositionKeys = new Set(
    state.interactiveBlocks.bumpedBlockTilePositions.map((position) =>
      hiddenBlockPositionKey(position.x, position.y),
    ),
  );
  // God mode walks ON lava: the surface becomes landable ground (the hazard
  // contact still fires each frame, which the shell presents as sizzling).
  const walkableHazardTileIds = movementConstants.godMode
    ? makeLavaTileIds(levelSpec)
    : emptyWalkableHazardTileIds;
  const resolvedPlayerWithBumps = resolveSolidTileCollisionWithBlockBumps(
    crouchSizedPlayer,
    movedPlayer,
    levelSpec,
    state.breakableBlocks,
    movementConstants.springLaunchSpeed,
    revealedHiddenPositionKeys,
    walkableHazardTileIds,
    effectiveInputCommand.jumpPressed,
  );
  const resolvedPlayerWithBumpsPlayer = resolvedPlayerWithBumps.player;

  // Water surface: the top two grid rows are the HUD-reserved band, so the
  // swimmable water starts at grid row 2. Swimming can't carry the player above
  // that waterline — repeated strokes would otherwise send him off-screen (open
  // water has no solid ceiling). He bumps the surface and his upward speed is
  // cancelled.
  const waterSurfaceY = hudReservedRowCount * levelSpec.tileSizePixels;
  const resolvedPlayer =
    movementConstants.swimming &&
    resolvedPlayerWithBumpsPlayer.position.y < waterSurfaceY
      ? {
          ...resolvedPlayerWithBumpsPlayer,
          position: {
            x: resolvedPlayerWithBumpsPlayer.position.x,
            y: requireSimulationPixelPosition(
              waterSurfaceY,
              "player.position.y",
            ),
          },
          velocity: {
            x: resolvedPlayerWithBumpsPlayer.velocity.x,
            y: requireSimulationVelocity(
              Math.max(0, resolvedPlayerWithBumpsPlayer.velocity.y),
              "player.velocity.y",
            ),
          },
        }
      : resolvedPlayerWithBumpsPlayer;

  // Moving platforms: advance the lifts and settle the player onto whichever
  // one they ride (carried by its motion). Runs after tile collision so solid
  // ground still wins where both apply.
  const platformsResolution = resolvePlatformsState(
    state.platforms,
    levelSpec,
    resolvedPlayer,
    Number(state.clock.frameDurationMilliseconds),
    state.clock.frameIndex,
  );
  // A platform carry is a positional shove outside the movement integration —
  // re-resolve it against solids so a plank sweeping toward a wall can never
  // embed its rider inside the tiles (8-4's lava shuttle did exactly that).
  const platformAdjustedPlayer =
    platformsResolution.player === resolvedPlayer
      ? resolvedPlayer
      : resolveSolidTileCollisionWithBlockBumps(
          resolvedPlayer,
          platformsResolution.player,
          levelSpec,
          state.breakableBlocks,
          movementConstants.springLaunchSpeed,
          revealedHiddenPositionKeys,
          walkableHazardTileIds,
          effectiveInputCommand.jumpPressed,
        ).player;

  // Castle maze checkpoints: crossing on the wrong row loops the player back
  // four pages.
  const loopZonesResolution = resolveLoopZones(
    state.loopZones,
    levelSpec,
    state.players[0].player,
    platformAdjustedPlayer,
  );
  const loopAdjustedPlayer = loopZonesResolution.player;

  const teleportedPlayerBase =
    teleportResult.kind === "same-level"
      ? teleportPlayerToTilePosition(
          loopAdjustedPlayer,
          teleportResult.targetTilePosition,
          levelSpec,
        )
      : loopAdjustedPlayer;
  // Stamp the crouch flag onto the player the collision phase reads; the stomp/
  // knockback rebuilders drop it (they leave the ground), so it self-clears.
  const teleportedPlayer = crouching
    ? { ...teleportedPlayerBase, crouching: true }
    : teleportedPlayerBase;

  // Everybody who bumped a block this frame, primary first, each carrying the
  // vitality the block rules must judge them by. Co-op bumps used to be dropped
  // on the floor, so a team-mate could stand under a brick and pound it forever
  // while only slot 0's hits ever registered.
  const bumpedBlocks = resolveBumpedBlocks(state, levelSpec, nextClock, [
    {
      vitality: playerVitalityAfterRecoveryTick,
      bumpedInteractiveBlocks: resolvedPlayerWithBumps.bumpedInteractiveBlocks,
      bumpedBreakableBlocks: resolvedPlayerWithBumps.bumpedBreakableBlocks,
    },
    ...coopBlockBumps,
  ]);
  const { interactiveBlocks, breakableBlocks } = bumpedBlocks;
  const spawnedActors = stepSpawnedActorsState(
    bumpedBlocks.spawnedActors,
    state.clock.frameDurationMilliseconds,
    levelSpec,
    breakableBlocks,
  );
  const headBonked =
    resolvedPlayerWithBumps.bumpedInteractiveBlocks.length > 0 ||
    resolvedPlayerWithBumps.bumpedBreakableBlocks.length > 0;
  // Shabby mode: each head-bonk bloodies the player more the faster they hit,
  // reaching maximum (half speed) after ~10 full-speed bonks. Never in the
  // faithful/original mode (bloodyBonks off ⇒ bloodiness stays 0).
  const bloodiness =
    headBonked && movementConstants.bloodyBonks
      ? Math.min(
          1,
          state.bloodiness +
            bloodinessPerHeadBonk *
              // Speed at the moment of impact (before the bonk halts movement).
              Math.min(
                1,
                Math.abs(movedPlayer.velocity.x) /
                  movementConstants.maxRunSpeed,
              ),
        )
      : state.bloodiness;
  const playerReaction = resolvePlayerReactionState(state.players[0].reaction, {
    headBonked,
  });
  const levelContacts = detectLevelContactState(teleportedPlayer, levelSpec);
  const collectibles = resolveCollectibleInteractionState(
    teleportedPlayer,
    levelSpec,
    spawnedActors.spawnedActors,
    state.collectibles,
  );
  const powerUpResolution = resolvePowerUpInteractionState(
    teleportedPlayer,
    levelSpec,
    spawnedActors.spawnedActors,
    state.powerUps,
  );
  const playerVitalityAfterPowerUp = applyPowerUpCollectionToVitality(
    playerVitalityAfterRecoveryTick,
    powerUpResolution.newlyCollectedPowerUpEntityIds.length,
  );
  const playerAfterPowerUpResize = resizePlayerForVitality(
    teleportedPlayer,
    playerVitalityAfterPowerUp,
    crouching,
  );
  const playerInvincibility = resolvePlayerInvincibilityState(
    playerAfterPowerUpResize,
    levelSpec,
    spawnedActors.spawnedActors,
    state.players[0].invincibility,
  );
  const enemyMotion = stepEnemyMotionState(
    state.enemyMotion,
    levelSpec,
    state.enemies,
    state.clock.frameDurationMilliseconds,
    movementConstants,
    playerAfterPowerUpResize,
    nextClock.frameIndex,
  );
  const projectileEnemies = {
    ...state.enemies,
    defeatedEnemyEntityIds: state.enemies.defeatedEnemyEntityIds,
  };
  const projectiles = resolveProjectilesState(
    inputCommand,
    playerAfterPowerUpResize,
    playerVitalityAfterPowerUp,
    enemyMotion,
    projectileEnemies,
    state.projectiles,
    breakableBlocks,
    movementConstants,
    levelSpec,
    state.clock.frameDurationMilliseconds,
    nextClock.frameIndex,
  );
  const enemiesBeforeProjectileMerge = resolveEnemyInteractionState(
    state.players[0].player,
    playerAfterPowerUpResize,
    levelSpec,
    enemyMotion,
    movementConstants,
    state.enemies,
    Number(nextClock.frameIndex),
  );
  const enemiesAfterInvincibility = applyInvincibilityEnemyDefeats(
    enemiesBeforeProjectileMerge,
    playerInvincibility,
  );
  const anyShellMoving = enemyMotion.armoredActors.some(
    (shellActor) =>
      shellActor.behavior === ArmoredEnemyBehavior.Shell &&
      shellActor.velocity.x !== 0,
  );
  const enemiesAfterShellCollisions = mergeShellDefeatedEnemies(
    enemiesAfterInvincibility,
    resolveShellDefeatedEnemyEntityIds(
      levelSpec,
      enemyMotion,
      enemiesAfterInvincibility,
    ),
    anyShellMoving,
  );
  const enemies = mergeProjectileDefeatedEnemies(
    enemiesAfterShellCollisions,
    projectiles.newlyDefeatedEnemyEntityIds,
    levelSpec,
  );
  // Per-enemy damage debounce: an enemy that has already landed a damaging hit
  // stays debounced for as long as the player keeps overlapping it, so it cannot
  // chip a big player down and then finish the kill from one sustained touch. It
  // re-arms only once the player fully separates from it. Different enemies still
  // hurt independently. `enemies.contactedEnemyEntityIds` here is exactly the
  // damaging-contact set (stomps / shell + star kills have already been removed),
  // so filtering it gates only the damage path — the stomp/defeat path is
  // untouched.
  const currentFrame = nextClock.frameIndex;
  const previousEnemyDamageFrames = state.enemyDamageContactFrameByEntityId;
  const contactedEnemySet = new Set(enemies.contactedEnemyEntityIds);
  const freshDamagingEnemyEntityIds = enemies.contactedEnemyEntityIds.filter(
    (entityId) => !previousEnemyDamageFrames.has(entityId),
  );
  const damagingEnemies: EnemyInteractionState = {
    ...enemies,
    contactedEnemyEntityIds: freshDamagingEnemyEntityIds,
  };
  // Next debounce map. An enemy's entry is carried forward only while the player
  // stays in contact with it; the moment contact breaks the entry is dropped, so
  // a genuine re-engagement (separate, then touch again) can land a fresh hit.
  // This frame's fresh hits (re)start a debounce.
  const nextEnemyDamageFrames = new Map<EntityId, FrameIndex>();
  for (const [entityId, lastFrame] of previousEnemyDamageFrames) {
    if (contactedEnemySet.has(entityId)) {
      nextEnemyDamageFrames.set(entityId, lastFrame);
    }
  }
  for (const entityId of freshDamagingEnemyEntityIds) {
    nextEnemyDamageFrames.set(entityId, currentFrame);
  }
  const stompedThisFrame =
    enemies.defeatedEnemyEntityIds.length >
      state.enemies.defeatedEnemyEntityIds.length &&
    enemies.cumulativeProjectileKillScore ===
      state.enemies.cumulativeProjectileKillScore;
  // Emit the reaction at the squashed enemy, not the player (who is above it) —
  // otherwise the burst/"wide eyes" frame floats up off the enemy's head.
  const previouslyDefeated = new Set(state.enemies.defeatedEnemyEntityIds);
  const newlyStompedEntityId = enemies.defeatedEnemyEntityIds.find(
    (entityId) => !previouslyDefeated.has(entityId),
  );
  let stompReactionPosition: { readonly x: number; readonly y: number } =
    teleportedPlayer.position;
  if (stompedThisFrame && newlyStompedEntityId !== undefined) {
    try {
      stompReactionPosition = requireEnemyActorState(
        enemyMotion,
        newlyStompedEntityId,
      ).position;
    } catch {
      // The enemy has already left the motion state; keep the player fallback.
    }
  }
  const enemyStompReaction = resolveStompReactionState(
    state.enemyStompReaction,
    {
      stomped: stompedThisFrame,
      x: stompReactionPosition.x,
      y: stompReactionPosition.y,
    },
  );
  const playerAfterEnemyResponse = applyEnemyStompRebound(
    playerAfterPowerUpResize,
    state.enemies,
    enemiesBeforeProjectileMerge,
    movementConstants,
  );
  const enemyContactResponse = resolveEnemyContactResponseState(
    playerAfterEnemyResponse,
    enemyMotion,
    damagingEnemies,
    levelSpec,
    nextClock.frameIndex,
    movementConstants.enemySideContactKnockbackSpeed,
  );
  const playerVitalityAfterEnemyContact =
    resolvePlayerVitalityAfterEnemyContact(
      playerVitalityAfterPowerUp,
      enemyContactResponse,
      nextClock.frameIndex,
      movementConstants,
    );
  const playerAfterContactResize = resizePlayerForVitality(
    playerAfterEnemyResponse,
    playerVitalityAfterEnemyContact,
    crouching,
  );
  const playerAfterContactResponse = applyEnemySideContactResponse(
    playerAfterContactResize,
    enemyContactResponse,
    playerVitalityAfterEnemyContact,
    movementConstants,
  );
  const enemyMotionAfterEnemyResponse = stopDefeatedEnemyMotionState(
    enemyMotion,
    levelSpec,
    enemies,
    movementConstants,
  );
  const timedHazardProjectiles = resolveTimedHazardProjectilesState(
    state.timedHazardProjectiles,
    levelSpec,
    breakableBlocks,
    playerAfterContactResponse,
    enemyMotionAfterEnemyResponse,
    enemies,
    movementConstants,
    state.clock.frameDurationMilliseconds,
    nextClock.frameIndex,
    state.players[0].player,
  );
  // Stomping a Bullet Bill bounces the player up, just like stomping an enemy.
  const playerAfterProjectileStomp =
    timedHazardProjectiles.stompedProjectileCount > 0
      ? reboundPlayerFromStomp(playerAfterContactResponse, movementConstants)
      : playerAfterContactResponse;
  // SMB advances its PseudoRandom register once per frame regardless of use; the
  // underwater Cheep-cheep frenzy reads it to spawn the shoal. Touching a cheep
  // harms the player like any hazard (you can't stomp underwater).
  const nextPseudoRandom = advancePseudoRandom(state.pseudoRandom);
  const cheepFrenzy = resolveCheepFrenzyState(
    state.cheepFrenzy,
    levelSpec,
    playerAfterProjectileStomp,
    nextPseudoRandom,
    Number(state.clock.frameDurationMilliseconds) / 1000,
    Number(nextClock.frameIndex),
  );
  // Aerial frenzies (leaping cheeps over the bridges, offscreen Bullet Bill
  // volleys): stompable — a stomp removes the entity and rebounds the player;
  // any other contact harms like a hazard.
  const aerialFrenzy = resolveAerialFrenzyState(
    state.aerialFrenzy,
    levelSpec,
    state.players[0].player,
    playerAfterProjectileStomp,
    nextPseudoRandom,
    movementConstants,
    Number(state.clock.frameDurationMilliseconds) / 1000,
    Number(nextClock.frameIndex),
  );
  const playerAfterAerialStomp =
    aerialFrenzy.stompedCount > 0
      ? reboundPlayerFromStomp(playerAfterProjectileStomp, movementConstants)
      : playerAfterProjectileStomp;
  // Lakitu's landed eggs hatch into walking Spinies; player fireballs defeat
  // them (and are consumed doing it).
  const hatchedSpinies = resolveHatchedSpinyState(
    state.hatchedSpinies,
    levelSpec,
    playerAfterAerialStomp,
    projectiles.state.projectiles,
    timedHazardProjectiles.hatchedPositions,
    Number(state.clock.frameDurationMilliseconds) / 1000,
    Number(nextClock.frameIndex),
  );
  const projectilesAfterSpinyKills =
    hatchedSpinies.consumedProjectileIds.length === 0
      ? projectiles.state
      : {
          ...projectiles.state,
          projectiles: projectiles.state.projectiles.filter(
            (projectile) =>
              !hatchedSpinies.consumedProjectileIds.includes(projectile.id),
          ),
        };
  // Hazard-like contact (hazard tiles, hammers/bullets, frenzy cheeps,
  // firebars/podoboos) damages with the same tiering as enemy contact:
  // a small player is defeated, a powered one shrinks into the recovery
  // window, and star invincibility or an active recovery window protects.
  const hazardContacted =
    levelContacts.hazard ||
    timedHazardProjectiles.playerContact ||
    cheepFrenzy.playerContacted ||
    aerialFrenzy.playerContacted ||
    hatchedSpinies.playerContacted ||
    playerTouchesFlameHazard(
      playerAfterProjectileStomp,
      levelSpec,
      nextClock.frameIndex,
    );
  const hazardProtected =
    playerInvincibility.remainingFrames > 0 ||
    playerVitalityAfterEnemyContact.kind === PlayerVitalityKind.Recovering ||
    movementConstants.godMode;
  const effectiveHazardContact = hazardContacted && !hazardProtected;
  const playerVitalityAfterHazard =
    effectiveHazardContact &&
    (playerVitalityAfterEnemyContact.kind === PlayerVitalityKind.Powered ||
      playerVitalityAfterEnemyContact.kind === PlayerVitalityKind.Fire)
      ? {
          kind: PlayerVitalityKind.Recovering as const,
          sourceEnemyEntityId: "hazard-contact" as EntityId,
          contactSide: EnemySideContactSide.Left,
          startFrameIndex: nextClock.frameIndex,
          remainingKnockbackFrames:
            movementConstants.damageRecoveryKnockbackFrameCount,
          remainingInvulnerabilityFrames:
            movementConstants.damageRecoveryInvulnerabilityFrameCount,
        }
      : playerVitalityAfterEnemyContact;
  // God mode: damage never sticks — any downgrade (a big tier knocked into
  // recovery, or down to small) is discarded and the prior tier kept.
  // Power-ups still upgrade normally.
  const vitalityRank = (kind: PlayerVitalityKind): number =>
    kind === PlayerVitalityKind.Fire
      ? 2
      : kind === PlayerVitalityKind.Powered
        ? 1
        : 0;
  const godSpared =
    movementConstants.godMode &&
    (playerVitalityAfterHazard.kind === PlayerVitalityKind.Recovering ||
      vitalityRank(playerVitalityAfterHazard.kind) <
        vitalityRank(state.players[0].vitality.kind));
  const guardedVitality = godSpared
    ? state.players[0].vitality
    : playerVitalityAfterHazard;
  const playerAfterHazardResize = resizePlayerForVitality(
    playerAfterAerialStomp,
    guardedVitality,
    crouching,
  );
  const outcomeLevelContacts = {
    ...levelContacts,
    hazard:
      effectiveHazardContact &&
      playerVitalityAfterEnemyContact.kind === PlayerVitalityKind.Small,
  };

  const resolvedOutcome = resolvePlayerOutcomeState(
    state.players[0].outcome,
    outcomeLevelContacts,
    damagingEnemies,
    guardedVitality,
    levelSpec.fallExitTransition === undefined &&
      hasPlayerFallenIntoPit(playerAfterContactResponse, levelSpec),
    hasLevelTimerExpired(levelTimer),
  );
  // God mode: only a pit fall can end the run (anything else would soft-lock
  // at the bottom of the hole); every other defeat is discarded. A defeat
  // that coincided with a goal contact still counts as the finish.
  const playerOutcome =
    movementConstants.godMode &&
    resolvedOutcome.kind === PlayerOutcomeKind.Defeated &&
    resolvedOutcome.reason !== PlayerDefeatReason.PitContact
      ? state.players[0].outcome
      : movementConstants.godMode &&
          resolvedOutcome.kind === PlayerOutcomeKind.DefeatedAndFinished
        ? {
            kind: PlayerOutcomeKind.Finished as const,
            reason: resolvedOutcome.finishReason,
          }
        : resolvedOutcome;

  const justFinished =
    state.players[0].outcome.kind !== PlayerOutcomeKind.Finished &&
    playerOutcome.kind === PlayerOutcomeKind.Finished;

  const timeBonusScore = justFinished
    ? computeTimeBonusScore(state.levelTimer.remainingFrames)
    : state.timeBonusScore;

  // The goal grab awards by height (the flagpole's 100..5000 bands).
  const goalHeightScore = justFinished
    ? ((state.goalHeightScore +
        scoreForGoalContactHeight(
          playerAfterContactResponse.position.y,
          levelSpec.tileSizePixels,
        )) as SimulationState["goalHeightScore"])
    : state.goalHeightScore;

  const newlyBrokenBlockCount =
    breakableBlocks.brokenBlockTilePositions.length -
    state.breakableBlocks.brokenBlockTilePositions.length;

  const breakableBlockScore = (state.breakableBlockScore +
    newlyBrokenBlockCount *
      scorePerBreakableBlock) as SimulationState["breakableBlockScore"];

  const bulletBillStompScore = (state.bulletBillStompScore +
    (timedHazardProjectiles.stompedProjectileCount +
      aerialFrenzy.stompedCount) *
      scorePerBulletBillStomp +
    hatchedSpinies.defeatedCount *
      scorePerProjectileKill) as SimulationState["bulletBillStompScore"];

  const extraLifeMushroomsCollected =
    collectibles.collectedExtraLifeEntityIds.length -
    state.collectibles.collectedExtraLifeEntityIds.length;

  // Coin 1-Ups key off the whole-session coin total (the base from prior levels
  // plus the coins collected in this one), so the every-100-coins award crosses
  // level boundaries as in the original. The base is constant within a level.
  const coinExtraLives = computeCoinExtraLives(
    state.sessionCoinBase + state.collectibles.collectedCoinEntityIds.length,
    state.sessionCoinBase + collectibles.collectedCoinEntityIds.length,
  );

  // 1-UPs earned this frame by stomp / kicked-shell chains past 8000 points.
  const stompChainExtraLives =
    enemies.cumulativeStompChainExtraLives -
    state.enemies.cumulativeStompChainExtraLives;
  const shellChainExtraLives =
    enemies.cumulativeShellKillExtraLives -
    state.enemies.cumulativeShellKillExtraLives;

  const justDefeated =
    state.players[0].outcome.kind !== PlayerOutcomeKind.Defeated &&
    state.players[0].outcome.kind !== PlayerOutcomeKind.DefeatedAndFinished &&
    (playerOutcome.kind === PlayerOutcomeKind.Defeated ||
      playerOutcome.kind === PlayerOutcomeKind.DefeatedAndFinished);

  const livesRemaining = Math.max(
    0,
    state.livesRemaining +
      extraLifeMushroomsCollected +
      coinExtraLives +
      stompChainExtraLives +
      shellChainExtraLives -
      (justDefeated ? 1 : 0),
  );

  // Persist the crouch flag onto the returned player so the renderer shows a
  // ducking pose and the next frame's covered check can keep him ducked; it is
  // re-derived fresh each frame (grounded+Down, or held while under a ceiling).
  const finalPlayer = crouching
    ? { ...playerAfterHazardResize, crouching: true }
    : playerAfterHazardResize.crouching === true
      ? { ...playerAfterHazardResize, crouching: false }
      : playerAfterHazardResize;

  return {
    clock: nextClock,
    // Player one's freshly-computed runtime at index 0; the co-op players are
    // carried through unchanged here and re-stepped by the outer stepSimulation.
    players: [
      {
        player: finalPlayer,
        vitality: guardedVitality,
        invincibility: playerInvincibility,
        outcome: playerOutcome,
        reaction: playerReaction,
      },
      ...state.players.slice(1),
    ],
    levelContacts: outcomeLevelContacts,
    collectibles,
    powerUps: powerUpResolution.state,
    enemies,
    enemyDamageContactFrameByEntityId: nextEnemyDamageFrames,
    enemyContactResponse,
    enemyMotion: enemyMotionAfterEnemyResponse,
    interactiveBlocks,
    breakableBlocks,
    spawnedActors,
    projectiles: projectilesAfterSpinyKills,
    pipeEntry: resolveAreaTransferPipeEntry(
      pipeState.pipeEntry,
      teleportedPlayer,
      levelSpec,
      movementConstants,
      spawnedActors.spawnedActors,
    ),
    levelTimer,
    timedHazardProjectiles,
    timeBonusScore,
    goalHeightScore,
    breakableBlockScore,
    bulletBillStompScore,
    livesRemaining,
    sessionCoinBase: state.sessionCoinBase,
    enemyStompReaction,
    bloodiness,
    pseudoRandom: nextPseudoRandom,
    cheepFrenzy: cheepFrenzy.state,
    aerialFrenzy: aerialFrenzy.state,
    platforms: platformsResolution.state,
    loopZones: loopZonesResolution.state,
    hatchedSpinies: hatchedSpinies.state,
  };
}

// Each full-speed head-bonk adds this much bloodiness; ~10 reach the max (1).
const bloodinessPerHeadBonk = 0.1;

// Vine climbs and bonus-area fall exits transfer to another area by starting
// a synthetic pipe entry — the same machinery that carries warp pipes across
// levels then does the rest.
const vineTransferHorizontalTolerancePixels = 20;

function resolveAreaTransferPipeEntry(
  pipeEntry: SimulationState["pipeEntry"],
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  movementConstants: MovementConstants,
  spawnedActors: readonly SpawnedActor[] = [],
): SimulationState["pipeEntry"] {
  if (pipeEntry.phase !== PipeEntryPhase.None) {
    return pipeEntry;
  }

  const tileSize = levelSpec.tileSizePixels;

  if (
    levelSpec.fallExitTransition !== undefined &&
    hasPlayerFallenIntoPit(player, levelSpec)
  ) {
    const fallExit = levelSpec.fallExitTransition;
    return {
      phase: PipeEntryPhase.Entering,
      pipeEntityId: "area-fall-exit" as EntityId,
      sourceLevelName: undefined,
      targetLevelName: fallExit.targetLevelName,
      targetTilePosition: {
        x: fallExit.targetTileX,
        y: fallExit.targetTileY,
      },
      remainingFrames: movementConstants.pipeEntryFrameCount,
    } as SimulationState["pipeEntry"];
  }

  if (player.movement.vertical !== VerticalMovementState.Climbing) {
    return pipeEntry;
  }

  for (const vine of levelSpec.vineTransitions) {
    const vineTopPixelY = (vine.y - 1) * tileSize + 4;
    const vineCenterX = vine.x * tileSize + tileSize / 2;
    const playerCenterX = player.position.x + player.collider.width / 2;
    // The warp waits for the vine itself: a still-growing beanstalk at this
    // column must have risen to the transfer height before it carries anyone.
    const vineActor = spawnedActors.find(
      (actor) =>
        actor.active &&
        actor.role === ActorRole.Climbable &&
        Math.floor(actor.position.x / tileSize) === vine.x,
    );
    if (vineActor !== undefined && vineActor.position.y > vineTopPixelY) {
      continue;
    }
    if (
      player.position.y <= vineTopPixelY &&
      Math.abs(playerCenterX - vineCenterX) <=
        vineTransferHorizontalTolerancePixels
    ) {
      return {
        phase: PipeEntryPhase.Entering,
        pipeEntityId: "vine-transfer" as EntityId,
        sourceLevelName: undefined,
        targetLevelName: vine.targetLevelName,
        targetTilePosition: {
          x: vine.targetTileX,
          y: vine.targetTileY,
        },
        remainingFrames: movementConstants.pipeEntryFrameCount,
      } as SimulationState["pipeEntry"];
    }
  }

  return pipeEntry;
}

function freezePlayerInputCommand(
  inputCommand: SimulationInputCommand,
): SimulationInputCommand {
  return {
    horizontal: HorizontalInput.Neutral,
    jumpPressed: false,
    runHeld: inputCommand.runHeld,
    firePressed: false,
    upHeld: inputCommand.upHeld,
    downHeld: inputCommand.downHeld,
  };
}

// Bounce the player upward off whatever they just stomped (an enemy or a
// stompable Bullet Bill).
function reboundPlayerFromStomp(
  player: PlayerSimulationState,
  movementConstants: MovementConstants,
): PlayerSimulationState {
  return {
    position: player.position,
    velocity: {
      x: player.velocity.x,
      y: requireSimulationVelocity(
        0 - movementConstants.enemyStompReboundSpeed,
        "player.velocity.y",
      ),
    },
    collider: player.collider,
    movement: {
      horizontal: player.movement.horizontal,
      vertical: VerticalMovementState.Jumping,
    },
    coyoteFramesRemaining: player.coyoteFramesRemaining,
    jumpBufferFramesRemaining: player.jumpBufferFramesRemaining,
    jumpCutApplied: player.jumpCutApplied,
    jumpTierIndex: player.jumpTierIndex,
  };
}

function applyEnemyStompRebound(
  player: PlayerSimulationState,
  previousEnemies: EnemyInteractionState,
  enemies: EnemyInteractionState,
  movementConstants: MovementConstants,
): PlayerSimulationState {
  if (!hasNewlyStompedEnemy(previousEnemies, enemies)) {
    return player;
  }

  return reboundPlayerFromStomp(player, movementConstants);
}

// Every stomp bounces Mario up: defeating a simple enemy, shelling a koopa
// (Active → resting shell, or stopping a sliding shell), or kicking a resting
// shell into a slide. Beyond matching the original feel, the bounce lifts Mario
// clear of the enemy, so a just-created or just-kicked shell can't overlap and
// harm him on the following frame (which read as "jumping on a koopa killed me").
function hasNewlyStompedEnemy(
  previousEnemies: EnemyInteractionState,
  enemies: EnemyInteractionState,
): boolean {
  return (
    hasNewEnemyEntityId(
      previousEnemies.defeatedEnemyEntityIds,
      enemies.defeatedEnemyEntityIds,
    ) ||
    hasNewEnemyEntityId(
      previousEnemies.shelledEnemyEntityIds,
      enemies.shelledEnemyEntityIds,
    ) ||
    hasNewEnemyEntityId(
      previousEnemies.nudgedShellEnemyEntityIds,
      enemies.nudgedShellEnemyEntityIds,
    )
  );
}

function hasNewEnemyEntityId(
  previous: readonly EntityId[],
  current: readonly EntityId[],
): boolean {
  return current.some((entityId) => !previous.includes(entityId));
}

function applyEnemySideContactResponse(
  player: PlayerSimulationState,
  enemyContactResponse: EnemyContactResponseState,
  playerVitality: PlayerVitalityState,
  movementConstants: MovementConstants,
): PlayerSimulationState {
  // God mode: undamageable also means unshoved — a contact knockback that
  // deals no damage could still push the player into a pit (8-4's lava
  // ledge under the paratroopa stream did exactly that).
  if (movementConstants.godMode) {
    return player;
  }
  if (playerVitality.kind === PlayerVitalityKind.Recovering) {
    return applyRecoveryKnockbackVelocity(
      player,
      playerVitality,
      movementConstants,
    );
  }

  switch (enemyContactResponse.kind) {
    case EnemyContactResponseKind.None:
      return player;
    case EnemyContactResponseKind.SideContact:
      return {
        position: player.position,
        velocity: {
          x: enemyContactResponse.velocity.x,
          y: player.velocity.y,
        },
        collider: player.collider,
        movement: player.movement,
        coyoteFramesRemaining: player.coyoteFramesRemaining,
        jumpBufferFramesRemaining: player.jumpBufferFramesRemaining,
        jumpCutApplied: player.jumpCutApplied,
        jumpTierIndex: player.jumpTierIndex,
      };
    default: {
      const invalidResponse: never = enemyContactResponse;
      throw new Error(
        `Invalid enemy contact response: ${String(invalidResponse)}`,
      );
    }
  }
}

// A fireball kill scores by enemy, as in the ROM (smbdis EnemyScoreData): a
// Goomba is worth 100, a Hammer Bro 1000, Bowser 5000; everyone else is the
// default 200.
const projectileKillScoreByActorId: Readonly<Record<string, number>> = {
  "vglc-smb-enemy": 100,
  "vglc-smb-throwing-enemy": 1000,
  "vglc-smb-bowser": 5000,
  "vglc-smb-bowser-hammers": 5000,
};

function projectileKillScoreFor(
  levelSpec: LevelSpec,
  entityId: EntityId,
): number {
  const actor = levelSpec.actors.find(
    (candidate) => candidate.entityId === entityId,
  );
  return actor === undefined
    ? scorePerProjectileKill
    : (projectileKillScoreByActorId[actor.actorId] ?? scorePerProjectileKill);
}

function mergeProjectileDefeatedEnemies(
  enemies: EnemyInteractionState,
  projectileDefeatedEnemyEntityIds: readonly EntityId[],
  levelSpec: LevelSpec,
): EnemyInteractionState {
  const defeatedSet = new Set(enemies.defeatedEnemyEntityIds);
  let addedScore = 0;
  for (const entityId of projectileDefeatedEnemyEntityIds) {
    if (!defeatedSet.has(entityId)) {
      defeatedSet.add(entityId);
      addedScore += projectileKillScoreFor(levelSpec, entityId);
    }
  }

  return {
    ...enemies,
    defeatedEnemyEntityIds: [...defeatedSet],
    cumulativeProjectileKillScore: (enemies.cumulativeProjectileKillScore +
      addedScore) as EnemyInteractionState["cumulativeProjectileKillScore"],
  };
}

function mergeShellDefeatedEnemies(
  enemies: EnemyInteractionState,
  shellDefeatedEnemyEntityIds: readonly EntityId[],
  anyShellMoving: boolean,
): EnemyInteractionState {
  const defeatedSet = new Set(enemies.defeatedEnemyEntityIds);
  const newKills = countNewlyDefeated(defeatedSet, shellDefeatedEnemyEntityIds);

  // A kicked shell scores the same rising chain as a stomp: 100, 200, 400 … then
  // a 1-UP. The chain runs while a shell is still sliding and resets once none
  // are moving.
  const chainBase = anyShellMoving ? enemies.currentShellKillChainCount : 0;
  let addedScore = 0;
  let addedExtraLives = 0;
  for (let index = 1; index <= newKills; index += 1) {
    const chainCount = chainBase + index;
    addedScore += scoreForConsecutiveDefeat(chainCount);
    if (consecutiveDefeatAwardsExtraLife(chainCount)) {
      addedExtraLives += 1;
    }
  }

  return {
    ...enemies,
    contactedEnemyEntityIds: enemies.contactedEnemyEntityIds.filter(
      (entityId) => !defeatedSet.has(entityId),
    ),
    shelledEnemyEntityIds: enemies.shelledEnemyEntityIds.filter(
      (entityId) => !defeatedSet.has(entityId),
    ),
    nudgedShellEnemyEntityIds: enemies.nudgedShellEnemyEntityIds.filter(
      (entityId) => !defeatedSet.has(entityId),
    ),
    nudgedShellDirectionByEntityId: new Map(
      Array.from(enemies.nudgedShellDirectionByEntityId.entries()).filter(
        ([entityId]) => !defeatedSet.has(entityId),
      ),
    ),
    defeatedEnemyEntityIds: [...defeatedSet],
    currentShellKillChainCount: chainBase + newKills,
    cumulativeShellKillScore: (enemies.cumulativeShellKillScore +
      addedScore) as EnemyInteractionState["cumulativeShellKillScore"],
    cumulativeShellKillExtraLives:
      enemies.cumulativeShellKillExtraLives + addedExtraLives,
  };
}

function resolveShellDefeatedEnemyEntityIds(
  levelSpec: LevelSpec,
  enemyMotion: EnemyMotionState,
  enemies: EnemyInteractionState,
): readonly EntityId[] {
  const alreadyDefeatedEntityIds = new Set(enemies.defeatedEnemyEntityIds);
  const shellDefeatedEntityIds: EntityId[] = [];

  for (const shellActor of enemyMotion.armoredActors) {
    const shellLevelActor = levelSpec.actors.find(
      (actor) => actor.entityId === shellActor.entityId,
    );

    if (shellLevelActor === undefined) {
      throw new Error("Validated shell actor is missing from level actors.");
    }

    if (
      shellActor.behavior !== ArmoredEnemyBehavior.Shell ||
      shellActor.velocity.x === 0 ||
      alreadyDefeatedEntityIds.has(shellActor.entityId)
    ) {
      continue;
    }

    for (const actor of levelSpec.actors) {
      if (
        actor.entityId === shellActor.entityId ||
        alreadyDefeatedEntityIds.has(actor.entityId) ||
        shellDefeatedEntityIds.includes(actor.entityId)
      ) {
        continue;
      }

      const actorDefinition = levelSpec.actorDefinitions.find(
        (definition) => definition.actorId === actor.actorId,
      );

      if (actorDefinition === undefined) {
        throw new Error(
          "Validated level actor is missing an actor definition.",
        );
      }

      if (!isShellDefeatableActorRole(actorDefinition.role)) {
        continue;
      }

      if (
        actorsOverlap(
          shellActor.position,
          makeActorColliderSizePixels(levelSpec, shellLevelActor.actorId),
          requireEnemyActorState(enemyMotion, actor.entityId).position,
          makeActorColliderSizePixels(levelSpec, actor.actorId),
        )
      ) {
        shellDefeatedEntityIds.push(actor.entityId);
      }
    }
  }

  return shellDefeatedEntityIds;
}

function isShellDefeatableActorRole(role: ActorRole): boolean {
  return (
    role === ActorRole.Enemy ||
    role === ActorRole.FlyingEnemy ||
    role === ActorRole.ChasingEnemy ||
    role === ActorRole.ArmoredEnemy ||
    role === ActorRole.ThrowingEnemy ||
    role === ActorRole.AerialThrowingEnemy
  );
}

function actorsOverlap(
  firstPosition: { readonly x: number; readonly y: number },
  firstSize: { readonly width: number; readonly height: number },
  secondPosition: { readonly x: number; readonly y: number },
  secondSize: { readonly width: number; readonly height: number },
): boolean {
  return (
    firstPosition.x < secondPosition.x + secondSize.width &&
    firstPosition.x + firstSize.width > secondPosition.x &&
    firstPosition.y < secondPosition.y + secondSize.height &&
    firstPosition.y + firstSize.height > secondPosition.y
  );
}

function makeRecoveryAdjustedInputCommand(
  inputCommand: SimulationInputCommand,
  playerVitality: PlayerVitalityState,
): SimulationInputCommand {
  if (
    playerVitality.kind !== PlayerVitalityKind.Recovering ||
    playerVitality.remainingKnockbackFrames === 0
  ) {
    return inputCommand;
  }

  return {
    horizontal: HorizontalInput.Neutral,
    jumpPressed: inputCommand.jumpPressed,
    runHeld: inputCommand.runHeld,
    firePressed: inputCommand.firePressed,
    upHeld: inputCommand.upHeld,
    downHeld: inputCommand.downHeld,
  };
}

function stepPlayerVitalityRecovery(
  playerVitality: PlayerVitalityState,
): PlayerVitalityState {
  switch (playerVitality.kind) {
    case PlayerVitalityKind.Small:
    case PlayerVitalityKind.Powered:
    case PlayerVitalityKind.Fire:
      return playerVitality;
    case PlayerVitalityKind.Recovering: {
      const remainingInvulnerabilityFrames = decrementRecoveryFrameCount(
        playerVitality.remainingInvulnerabilityFrames,
        "playerVitality.remainingInvulnerabilityFrames",
      );

      if (remainingInvulnerabilityFrames === 0) {
        return {
          kind: PlayerVitalityKind.Small,
        };
      }

      return {
        kind: PlayerVitalityKind.Recovering,
        sourceEnemyEntityId: playerVitality.sourceEnemyEntityId,
        contactSide: playerVitality.contactSide,
        startFrameIndex: playerVitality.startFrameIndex,
        remainingKnockbackFrames: decrementRecoveryFrameCount(
          playerVitality.remainingKnockbackFrames,
          "playerVitality.remainingKnockbackFrames",
        ),
        remainingInvulnerabilityFrames,
      };
    }
    default: {
      const invalidVitality: never = playerVitality;
      throw new Error(
        `Invalid player vitality state: ${String(invalidVitality)}`,
      );
    }
  }
}

function resolvePlayerVitalityAfterEnemyContact(
  playerVitality: PlayerVitalityState,
  enemyContactResponse: EnemyContactResponseState,
  frameIndex: SimulationClock["frameIndex"],
  movementConstants: MovementConstants,
): PlayerVitalityState {
  switch (playerVitality.kind) {
    case PlayerVitalityKind.Small:
    case PlayerVitalityKind.Recovering:
      return playerVitality;
    case PlayerVitalityKind.Powered:
    case PlayerVitalityKind.Fire:
      switch (enemyContactResponse.kind) {
        case EnemyContactResponseKind.None:
          return playerVitality;
        case EnemyContactResponseKind.SideContact:
          return {
            kind: PlayerVitalityKind.Recovering,
            sourceEnemyEntityId: enemyContactResponse.enemyEntityId,
            contactSide: enemyContactResponse.contactSide,
            startFrameIndex: frameIndex,
            remainingKnockbackFrames:
              movementConstants.damageRecoveryKnockbackFrameCount,
            remainingInvulnerabilityFrames:
              movementConstants.damageRecoveryInvulnerabilityFrameCount,
          };
        default: {
          const invalidResponse: never = enemyContactResponse;
          throw new Error(
            `Invalid enemy contact response: ${String(invalidResponse)}`,
          );
        }
      }
    default: {
      const invalidVitality: never = playerVitality;
      throw new Error(
        `Invalid player vitality state: ${String(invalidVitality)}`,
      );
    }
  }
}

function applyRecoveryKnockbackVelocity(
  player: PlayerSimulationState,
  playerVitality: Extract<PlayerVitalityState, { readonly kind: "recovering" }>,
  movementConstants: MovementConstants,
): PlayerSimulationState {
  if (playerVitality.remainingKnockbackFrames === 0) {
    return player;
  }

  const knockbackVelocityX =
    playerVitality.contactSide === EnemySideContactSide.Left
      ? movementConstants.enemySideContactKnockbackSpeed
      : requireSimulationVelocity(
          0 - movementConstants.enemySideContactKnockbackSpeed,
          "player.velocity.x",
        );

  return {
    position: player.position,
    velocity: {
      x: knockbackVelocityX,
      y: player.velocity.y,
    },
    collider: player.collider,
    movement: player.movement,
    coyoteFramesRemaining: player.coyoteFramesRemaining,
    jumpBufferFramesRemaining: player.jumpBufferFramesRemaining,
    jumpCutApplied: player.jumpCutApplied,
    jumpTierIndex: player.jumpTierIndex,
  };
}

function decrementRecoveryFrameCount(
  frameCount: RecoveryFrameCount,
  path: string,
): RecoveryFrameCount {
  if (frameCount === 0) {
    return frameCount;
  }

  const result = makeRecoveryFrameCount(frameCount - 1, path);

  if (!result.ok) {
    throw new Error(`${path} must remain a valid recovery frame count.`);
  }

  return result.value;
}

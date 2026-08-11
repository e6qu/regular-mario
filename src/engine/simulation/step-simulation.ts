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
  liveEnemyContactEntityIds,
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
import { resolveCrouchState } from "./crouch-state";
import {
  assertValidPowerUpInteractionState,
  resolvePowerUpInteractionState,
} from "./power-up-interaction";
import {
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
  isEnlargedPlayerVitalityKind,
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
  timedHazardProjectilesDamagePlayer,
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
import { furthestAdvancedPlayer } from "./player-targeting";
import {
  cheepFrenzyTouchesPlayer,
  resolveCheepFrenzyState,
} from "./cheep-frenzy-state";
import { playerTouchesFlameHazard } from "./flame-hazards";
import {
  assertValidPlatformsState,
  resolvePlatformsState,
} from "./platform-state";
import {
  aerialFrenzyDamagesPlayer,
  assertValidAerialFrenzyState,
  resolveAerialFrenzyState,
} from "./aerial-frenzy-state";
import { assertValidLoopZoneState, resolveLoopZones } from "./loop-zone-state";
import {
  assertValidHatchedSpinyState,
  hatchedSpiniesTouchPlayer,
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
import { resolveSolidTileCollisionWithBlockBumps } from "./solid-tile-collision";
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
  //
  // Their collision sees the same world the primary's does: hidden blocks the
  // party has revealed are solid for everyone (a co-op player used to fall
  // straight through the platform a teammate had just bumped into existence),
  // and god mode's walkable lava applies to every player.
  const partyRevealedHiddenPositionKeys = new Set(
    state.interactiveBlocks.bumpedBlockTilePositions.map((position) =>
      hiddenBlockPositionKey(position.x, position.y),
    ),
  );
  const partyWalkableHazardTileIds = movementConstants.godMode
    ? makeLavaTileIds(levelSpec)
    : emptyWalkableHazardTileIds;
  const coopSteps = stepCoopPlayerMovement(
    state.players.slice(1),
    coopInputCommands,
    state.clock.frameDurationMilliseconds,
    movementConstants,
    levelSpec,
    state.breakableBlocks,
    state.spawnedActors.spawnedActors,
    partyRevealedHiddenPositionKeys,
    partyWalkableHazardTileIds,
  );
  const primaryStepped = stepPrimaryPlayer(
    state,
    inputCommand,
    movementConstants,
    levelSpec,
    nextClock,
    coopSteps,
  );
  const primaryRuntime = primaryStepped.players[0];
  // Co-op runtimes come back out of the world step, not straight from movement:
  // a co-op player who stomped an enemy has been rebounded upward by it.
  const coopRuntimes = resolveCoopPlayerOutcomes(
    primaryStepped.players.slice(1),
    state.players.slice(1),
    primaryStepped,
    state,
    levelSpec,
    movementConstants,
  );
  // Every co-op mode keeps solid-player mechanics: players cannot walk through
  // each other, can stand on each other's heads, and a stack rides its bottom
  // player. Online play used to opt out so an idle friend could not become an
  // accidental wall, but that also removed head-standing and made online feel
  // different from local play; a body one tile tall is jumpable, so the wall
  // concern is handled the same way the original games handle it.
  const runtimesBeforePlayerCollision = [primaryRuntime, ...coopRuntimes];
  const activePlayerIndices = runtimesBeforePlayerCollision.flatMap(
    (runtime, index) =>
      runtime.outcome.kind === PlayerOutcomeKind.Active ? [index] : [],
  );
  const collidedActivePlayers = resolvePlayerCollisions(
    activePlayerIndices.map(
      (index) => runtimesBeforePlayerCollision[index]!.player,
    ),
    activePlayerIndices.map((index) => state.players[index]!.player),
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
  const coopGoalFinisher = coopRuntimes.find(
    (runtime) => detectLevelContactState(runtime.player, levelSpec).goal,
  );
  const anyCoopReachedGoal = coopGoalFinisher !== undefined;
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
  // A finish through a co-op grab pays like any finish. The primary path's
  // scoring keys off ITS outcome edge inside the world step, which runs before
  // this fold — so a co-op player reaching the flag used to end the level with
  // zero time bonus and zero grab-height score.
  const coopFinishAwardsScores =
    coopGoalFinisher !== undefined &&
    state.players[0].outcome.kind !== PlayerOutcomeKind.Finished &&
    primaryRuntime.outcome.kind === PlayerOutcomeKind.Active;
  if (!coopFinishAwardsScores) {
    return { ...primaryStepped, players };
  }
  return {
    ...primaryStepped,
    players,
    timeBonusScore: computeTimeBonusScore(state.levelTimer.remainingFrames),
    goalHeightScore: (primaryStepped.goalHeightScore +
      scoreForGoalContactHeight(
        coopGoalFinisher.player.position.y,
        levelSpec.tileSizePixels,
      )) as SimulationState["goalHeightScore"],
  };
}

// The primary player's full pipeline (unchanged), selected by outcome.
function stepPrimaryPlayer(
  state: SimulationState,
  inputCommand: SimulationInputCommand,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  nextClock: SimulationClock,
  coopSteps: readonly CoopPlayerStep[],
): SimulationState {
  // Whatever happens to slot 0, the co-op players have already moved; the state
  // the world is stepped against must show them where they now are.
  const stateWithMovedCoop: SimulationState = {
    ...state,
    players: [
      state.players[0],
      ...coopSteps.map((step) => step.runtime),
    ] as SimulationState["players"],
  };
  switch (state.players[0].outcome.kind) {
    case PlayerOutcomeKind.Active:
      return stepActiveSimulation(
        stateWithMovedCoop,
        inputCommand,
        movementConstants,
        levelSpec,
        nextClock,
        coopSteps,
      );
    case PlayerOutcomeKind.Defeated:
    case PlayerOutcomeKind.Finished:
    case PlayerOutcomeKind.DefeatedAndFinished:
      // The primary is out, but the party is not: a surviving team-mate's head
      // bumps must still break bricks and pop power-ups. Resolving blocks only
      // inside the active branch meant one dead player froze the level's blocks
      // for everybody still playing.
      return applyBlockBumps(
        { ...stateWithMovedCoop, clock: nextClock },
        levelSpec,
        nextClock,
        coopBlockBumpsOf(coopSteps),
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
 * Whether co-op players are still under the spawn grace.
 *
 * Exported because the grace has to hold against every source of harm, not only
 * the ones this module resolves: flung body parts are thrown by the renderer,
 * and a window only the simulation honours is not a window.
 */
export function isWithinCoopSpawnInvincibility(
  frameIndex: number,
  frameDurationMilliseconds: number,
): boolean {
  return (
    frameIndex * frameDurationMilliseconds < coopSpawnInvincibilityMilliseconds
  );
}

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

/**
 * One co-op player's movement this frame, with everything the world needs from
 * it: where the player was before moving (enemy interaction is judged on the
 * *crossing*, not the destination), where they are now, and what they bumped.
 */
interface CoopPlayerStep {
  readonly runtime: PlayerRuntime;
  readonly previousPlayer: PlayerSimulationState;
  /** The command this player acted on, for the phases that read input again. */
  readonly inputCommand: SimulationInputCommand;
  readonly bumpedInteractiveBlocks: readonly TilePoint[];
  readonly bumpedBreakableBlocks: readonly TilePoint[];
}

function coopBlockBumpsOf(
  steps: readonly CoopPlayerStep[],
): readonly CoopBlockBump[] {
  return steps
    .filter(
      (step) =>
        step.bumpedInteractiveBlocks.length > 0 ||
        step.bumpedBreakableBlocks.length > 0,
    )
    .map((step) => ({
      vitality: step.runtime.vitality,
      bumpedInteractiveBlocks: step.bumpedInteractiveBlocks,
      bumpedBreakableBlocks: step.bumpedBreakableBlocks,
    }));
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
  spawnedActors: readonly SpawnedActor[],
  revealedHiddenPositionKeys: ReadonlySet<string>,
  walkableHazardTileIds: ReadonlySet<TileId>,
): readonly CoopPlayerStep[] {
  return coopRuntimes.map((runtime, index) => {
    if (runtime.outcome.kind !== PlayerOutcomeKind.Active) {
      return {
        runtime,
        previousPlayer: runtime.player,
        inputCommand: neutralInputCommand,
        bumpedInteractiveBlocks: [],
        bumpedBreakableBlocks: [],
      };
    }
    const inputCommand = coopInputCommands[index] ?? neutralInputCommand;
    const stepped = stepCoopPlayerKinematics(
      runtime.player,
      inputCommand,
      frameDurationMilliseconds,
      movementConstants,
      levelSpec,
      breakableBlocks,
      spawnedActors,
      runtime.vitality,
      makeCrawlMovementConstants,
      revealedHiddenPositionKeys,
      walkableHazardTileIds,
    );
    return {
      runtime: { ...runtime, player: stepped.player },
      previousPlayer: runtime.player,
      inputCommand,
      bumpedInteractiveBlocks: stepped.bumpedInteractiveBlocks,
      bumpedBreakableBlocks: stepped.bumpedBreakableBlocks,
    };
  });
}

// Decide what became of each co-op player after everything else moved: reaching
// the goal, touching an enemy the primary step may just have stomped, falling
// into a pit. Split from the movement above so head bumps are available before
// the block state is resolved, while fates still settle against the final world.
function resolveCoopPlayerOutcomes(
  moved: readonly PlayerRuntime[],
  previousRuntimes: readonly PlayerRuntime[],
  // The world as the primary step left it this frame, and the world as the
  // previous frame left it: fates settle against the final positions, while
  // fresh-contact edges compare against where everything genuinely was.
  steppedWorld: SimulationState,
  previousWorld: SimulationState,
  levelSpec: LevelSpec,
  movementConstants: MovementConstants,
): readonly PlayerRuntime[] {
  const frameDurationMilliseconds =
    previousWorld.clock.frameDurationMilliseconds;
  const nextFrameIndex = steppedWorld.clock.frameIndex;
  const frameIndex = Number(nextFrameIndex);
  const enemyMotion = steppedWorld.enemyMotion;
  const defeatedEnemyEntityIds = steppedWorld.enemies.defeatedEnemyEntityIds;
  const previousEnemyMotion = previousWorld.enemyMotion;
  const previousDefeatedEnemyEntityIds =
    previousWorld.enemies.defeatedEnemyEntityIds;
  const levelTimerExpired = hasLevelTimerExpired(steppedWorld.levelTimer);
  if (moved.length === 0) {
    return moved;
  }
  // Time runs out for the whole party, not only for slot 0.
  //
  // The clock used to be read on the primary player's path alone, so when it
  // expired the creator died and everybody else played on for ever. That is
  // what left three players alive and stuck in World 1-1's staircase notch at
  // frame 15,993 — long past a 400-unit timer — with the run unable to end and
  // unable to continue. Checked before the spawn grace: that window exists for
  // the crowded spawn, not to make anyone immortal.
  if (levelTimerExpired) {
    return moved.map<PlayerRuntime>((runtime) =>
      runtime.outcome.kind === PlayerOutcomeKind.Active
        ? {
            ...runtime,
            outcome: {
              kind: PlayerOutcomeKind.Defeated,
              reason: PlayerDefeatReason.TimeUp,
            },
          }
        : runtime,
    );
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
  // During the spawn-invincibility window nobody is defeated, so the bots ride
  // out the initial scrum unharmed.
  if (
    isWithinCoopSpawnInvincibility(
      frameIndex,
      Number(frameDurationMilliseconds),
    )
  ) {
    return withGoalOutcomes;
  }
  // A defeated co-op player remains in the uniform player array as a spectator
  // until the level ends. Keeping the stable slot is required by authoritative
  // multiplayer: network player IDs must never silently shift when somebody
  // dies. Defeated runtimes no longer collide or consume input above.
  //
  // Damage carries the same tiering as the primary path: a big player shrinks
  // into the blinking recovery window instead of dying, star power / an active
  // recovery window / god mode protect from enemy and hazard damage, and only
  // a small unprotected player is defeated. This used to be a flat kill — a
  // Fire co-op player died to a walker's touch that would merely have shrunk
  // the host.
  const runtimes = moved.map<PlayerRuntime>((runtime, index) => {
    if (runtime.outcome.kind !== PlayerOutcomeKind.Active) {
      return runtime;
    }
    // The recovery window ticks down each frame exactly as for the primary;
    // expiry returns the player to small (identical collider, no resize).
    const tickedVitality = stepPlayerVitalityRecovery(runtime.vitality);
    const levelContact = detectLevelContactState(runtime.player, levelSpec);
    const fellIntoPit =
      levelSpec.fallExitTransition === undefined &&
      hasPlayerFallenIntoPit(runtime.player, levelSpec);
    // Damage needs a FRESH enemy touch: an enemy this player was already
    // overlapping on the previous frame cannot land a second hit without
    // genuine separation. This is the primary's per-enemy damage debounce,
    // expressed as a contact edge between consecutive frames.
    const contactedNow = liveEnemyContactEntityIds(
      runtime.player,
      levelSpec,
      enemyMotion,
      defeatedEnemyEntityIds,
    );
    const previousRuntime = previousRuntimes[index];
    const contactedBefore = new Set(
      previousRuntime === undefined
        ? []
        : liveEnemyContactEntityIds(
            previousRuntime.player,
            levelSpec,
            previousEnemyMotion,
            previousDefeatedEnemyEntityIds,
          ),
    );
    const freshEnemyContacts = contactedNow.filter(
      (entityId) => !contactedBefore.has(entityId),
    );
    const damageProtected =
      runtime.invincibility.remainingFrames > 0 ||
      tickedVitality.kind === PlayerVitalityKind.Recovering ||
      movementConstants.godMode;
    const enemyDamage = freshEnemyContacts.length > 0 && !damageProtected;
    // Hazard-like contact reaches every player, exactly as it reaches the
    // primary: hazard tiles, castle firebars and podoboos, hammers/Bullet
    // Bills/cannonballs, cheep and aerial frenzies, and hatched spinies.
    // Bullets and frenzy entities exempt a stomp-shaped landing — the classic
    // bounce play must not hurt the bouncer.
    const previousPlayer = previousRuntime?.player ?? runtime.player;
    const hazardContacted =
      levelContact.hazard ||
      playerTouchesFlameHazard(runtime.player, levelSpec, nextFrameIndex) ||
      timedHazardProjectilesDamagePlayer(
        steppedWorld.timedHazardProjectiles,
        previousPlayer,
        runtime.player,
        movementConstants,
      ) ||
      cheepFrenzyTouchesPlayer(steppedWorld.cheepFrenzy, runtime.player) ||
      aerialFrenzyDamagesPlayer(
        steppedWorld.aerialFrenzy,
        previousPlayer,
        runtime.player,
        movementConstants,
      ) ||
      hatchedSpiniesTouchPlayer(steppedWorld.hatchedSpinies, runtime.player);
    const hazardDamage = hazardContacted && !damageProtected;
    const reason = fellIntoPit
      ? PlayerDefeatReason.PitContact
      : enemyDamage && hazardDamage
        ? PlayerDefeatReason.HazardAndEnemyContact
        : enemyDamage
          ? PlayerDefeatReason.EnemyContact
          : hazardDamage
            ? PlayerDefeatReason.HazardContact
            : undefined;
    if (reason === undefined) {
      return {
        ...runtime,
        vitality: tickedVitality,
        outcome: levelContact.goal
          ? {
              kind: PlayerOutcomeKind.Finished,
              reason: PlayerFinishReason.GoalContact,
            }
          : runtime.outcome,
      };
    }
    // A pit swallows any tier; everything else shrinks a big player instead.
    if (
      reason !== PlayerDefeatReason.PitContact &&
      isEnlargedPlayerVitalityKind(tickedVitality.kind)
    ) {
      const recovering: PlayerVitalityState = {
        kind: PlayerVitalityKind.Recovering,
        sourceEnemyEntityId:
          freshEnemyContacts[0] ?? ("hazard-contact" as EntityId),
        contactSide: EnemySideContactSide.Left,
        startFrameIndex: nextFrameIndex,
        remainingKnockbackFrames:
          movementConstants.damageRecoveryKnockbackFrameCount,
        remainingInvulnerabilityFrames:
          movementConstants.damageRecoveryInvulnerabilityFrameCount,
      };
      return {
        ...runtime,
        vitality: recovering,
        player: resizePlayerForVitality(
          runtime.player,
          recovering,
          runtime.player.crouching === true,
        ),
        outcome: levelContact.goal
          ? {
              kind: PlayerOutcomeKind.Finished,
              reason: PlayerFinishReason.GoalContact,
            }
          : runtime.outcome,
      };
    }
    return {
      ...runtime,
      vitality: tickedVitality,
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
  coopSteps: readonly CoopPlayerStep[],
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
  const crouchResolution = resolveCrouchState(
    state.players[0].player,
    playerVitalityAfterRecoveryTick,
    inputCommand,
    isPlayerFrozenByPipeEntry(pipeState.pipeEntry)
      ? freezePlayerInputCommand(inputCommand)
      : makeRecoveryAdjustedInputCommand(
          inputCommand,
          playerVitalityAfterRecoveryTick,
        ),
    levelSpec,
    state.breakableBlocks,
    movementConstants,
    makeCrawlMovementConstants,
    isPlayerFrozenByPipeEntry(pipeState.pipeEntry),
  );
  const crouching = crouchResolution.crouching;
  const crouchSizedPlayer = crouchResolution.player;
  const effectiveInputCommand = crouchResolution.inputCommand;
  const effectiveMovementConstants = crouchResolution.movementConstants;

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
  // The whole party rides. Platforms used to be resolved for slot 0 alone, so a
  // co-op player stood still while the plank slid out from under them and then
  // fell — a level built around a lift was unfinishable by anyone else.
  const ridingPlayers = [
    resolvedPlayer,
    ...coopSteps.map((step) => step.runtime.player),
  ];
  const platformsResolution = resolvePlatformsState(
    state.platforms,
    levelSpec,
    ridingPlayers,
    Number(state.clock.frameDurationMilliseconds),
    state.clock.frameIndex,
  );
  // A platform carry is a positional shove outside the movement integration —
  // re-resolve it against solids so a plank sweeping toward a wall can never
  // embed its rider inside the tiles (8-4's lava shuttle did exactly that).
  const settleAfterPlatformCarry = (
    before: PlayerSimulationState,
    after: PlayerSimulationState,
  ): PlayerSimulationState =>
    after === before
      ? before
      : resolveSolidTileCollisionWithBlockBumps(
          before,
          after,
          levelSpec,
          state.breakableBlocks,
          movementConstants.springLaunchSpeed,
          revealedHiddenPositionKeys,
          walkableHazardTileIds,
          effectiveInputCommand.jumpPressed,
        ).player;
  const platformAdjustedPlayer = settleAfterPlatformCarry(
    resolvedPlayer,
    platformsResolution.players[0] ?? resolvedPlayer,
  );
  const coopAfterPlatforms = coopSteps.map((step, index) => {
    const carried = platformsResolution.players[index + 1];
    return carried === undefined
      ? step.runtime
      : {
          ...step.runtime,
          player: settleAfterPlatformCarry(step.runtime.player, carried),
        };
  });

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
    ...coopBlockBumpsOf(coopSteps),
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
  // Coins and power-ups reach everybody. These ran for the primary alone, so a
  // co-op player walked through coins without collecting them and could never
  // grow: permanently small, unable to break a brick, and killed by contact
  // with anything. Folded one player at a time against the running state, so
  // two players cannot both collect the same mushroom, and each player's own
  // vitality grows from what that player picked up.
  let partyCollectibles = collectibles;
  let partyPowerUps = powerUpResolution.state;
  const coopAfterPickups = coopAfterPlatforms.map((runtime) => {
    if (runtime.outcome.kind !== PlayerOutcomeKind.Active) {
      return runtime;
    }
    partyCollectibles = resolveCollectibleInteractionState(
      runtime.player,
      levelSpec,
      spawnedActors.spawnedActors,
      partyCollectibles,
    );
    const collected = resolvePowerUpInteractionState(
      runtime.player,
      levelSpec,
      spawnedActors.spawnedActors,
      partyPowerUps,
    );
    partyPowerUps = collected.state;
    const vitality = applyPowerUpCollectionToVitality(
      runtime.vitality,
      collected.newlyCollectedPowerUpEntityIds.length,
    );
    return {
      ...runtime,
      vitality,
      // Co-op players have no crouch yet, so they are never crouch-sized.
      player: resizePlayerForVitality(runtime.player, vitality, false),
    };
  });
  const playerInvincibility = resolvePlayerInvincibilityState(
    playerAfterPowerUpResize,
    levelSpec,
    spawnedActors.spawnedActors,
    state.players[0].invincibility,
  );
  // A star belongs to whoever ran into it. Invincibility resolved for the
  // primary alone, so a co-op player passed through a star and gained nothing —
  // and, since the star also clears enemies on contact, the party lost the
  // clearing too whenever anybody but the host picked it up.
  const coopAfterInvincibility = coopAfterPickups.map((runtime) =>
    runtime.outcome.kind === PlayerOutcomeKind.Active
      ? {
          ...runtime,
          invincibility: resolvePlayerInvincibilityState(
            runtime.player,
            levelSpec,
            spawnedActors.spawnedActors,
            runtime.invincibility,
          ),
        }
      : runtime,
  );
  const enemyMotion = stepEnemyMotionState(
    state.enemyMotion,
    levelSpec,
    state.enemies,
    state.clock.frameDurationMilliseconds,
    movementConstants,
    playerAfterPowerUpResize,
    nextClock.frameIndex,
    // Enemies see the whole party: chasers, Hammer Bros, Lakitu and piranha
    // plants react to their nearest player, not only slot 0.
    coopAfterInvincibility
      .filter((runtime) => runtime.outcome.kind === PlayerOutcomeKind.Active)
      .map((runtime) => runtime.player),
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
  // Fireballs belong to whoever pressed fire. Projectiles resolved for the
  // primary alone, so a co-op player who had earned a fire flower still could
  // not throw anything — the power-up was collectable and inert.
  const partyProjectiles = coopAfterInvincibility.reduce(
    (carried, runtime, index) => {
      const step = coopSteps[index];
      if (
        step === undefined ||
        runtime.outcome.kind !== PlayerOutcomeKind.Active
      ) {
        return carried;
      }
      const resolved = resolveProjectilesState(
        step.inputCommand,
        runtime.player,
        runtime.vitality,
        enemyMotion,
        projectileEnemies,
        carried.state,
        breakableBlocks,
        movementConstants,
        levelSpec,
        state.clock.frameDurationMilliseconds,
        nextClock.frameIndex,
      );
      return {
        state: resolved.state,
        newlyDefeatedEnemyEntityIds: [
          ...carried.newlyDefeatedEnemyEntityIds,
          ...resolved.newlyDefeatedEnemyEntityIds,
        ],
        firedProjectile: carried.firedProjectile || resolved.firedProjectile,
      };
    },
    projectiles,
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
  // Every player meets the enemies, not just slot 0. This used to run for the
  // primary alone, so a co-op player falling onto a goomba passed straight
  // through it — measurably: the identical player state stomping the identical
  // enemy defeated it from slot 0 and did nothing from any other slot. That made
  // co-op unplayable for everyone but the host, and it is the same shape of bug
  // as the blocks only slot 0 could break.
  //
  // Folded one player at a time, each against their own before/after pair, so a
  // stomp rebounds the player who actually landed on the enemy rather than
  // whoever happens to be first in the array.
  let enemiesAfterEveryPlayer = enemiesBeforeProjectileMerge;
  const coopRuntimesAfterEnemies = coopSteps.map((step, index) => {
    const runtime = coopAfterInvincibility[index] ?? step.runtime;
    if (runtime.outcome.kind !== PlayerOutcomeKind.Active) {
      return runtime;
    }
    const enemiesBeforeThisPlayer = enemiesAfterEveryPlayer;
    enemiesAfterEveryPlayer = resolveEnemyInteractionState(
      step.previousPlayer,
      runtime.player,
      levelSpec,
      enemyMotion,
      movementConstants,
      enemiesBeforeThisPlayer,
      Number(nextClock.frameIndex),
    );
    return {
      ...runtime,
      player: applyEnemyStompRebound(
        runtime.player,
        enemiesBeforeThisPlayer,
        enemiesAfterEveryPlayer,
        movementConstants,
      ),
    };
  });
  const enemiesAfterInvincibility = coopAfterInvincibility.reduce(
    (enemies, runtime) =>
      applyInvincibilityEnemyDefeats(enemies, runtime.invincibility),
    applyInvincibilityEnemyDefeats(
      enemiesAfterEveryPlayer,
      playerInvincibility,
    ),
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
    partyProjectiles.newlyDefeatedEnemyEntityIds,
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
  // The interaction state's contact list is a party-wide union — the co-op fold
  // above adds every player's touches. The debounce here gates the PRIMARY's
  // damage, so a FRESH hit must come from an enemy the primary personally
  // overlaps: otherwise a co-op player brushing enemy X registered X as having
  // damaged the primary, and the primary then walked through X unharmed.
  // Retention deliberately stays on the party-wide list: an enemy that has
  // landed its hit remains debounced through the knockback's momentary
  // separations rather than re-arming mid-engagement.
  const contactedEnemySet = new Set(enemies.contactedEnemyEntityIds);
  const primaryContactedEnemyIds = new Set(
    liveEnemyContactEntityIds(
      playerAfterPowerUpResize,
      levelSpec,
      enemyMotion,
      enemies.defeatedEnemyEntityIds,
    ),
  );
  const freshDamagingEnemyEntityIds = enemies.contactedEnemyEntityIds.filter(
    (entityId) =>
      primaryContactedEnemyIds.has(entityId) &&
      !previousEnemyDamageFrames.has(entityId),
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
  // Co-op players participate in the projectile subsystems: their previous and
  // current frame states drive per-player stomps (any player's stomp defeats a
  // Bullet Bill), and spawn gates / aim / frenzy regions see the whole party.
  const coopPlayerPairIndices = coopRuntimesAfterEnemies.flatMap(
    (runtime, index) =>
      runtime.outcome.kind === PlayerOutcomeKind.Active ? [index] : [],
  );
  const coopPlayerPairs = coopPlayerPairIndices.map((index) => ({
    previous: state.players[index + 1]?.player ?? state.players[0].player,
    current: coopRuntimesAfterEnemies[index]!.player,
  }));
  const timedHazardResolution = resolveTimedHazardProjectilesState(
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
    coopPlayerPairs,
  );
  const timedHazardProjectiles = timedHazardResolution.state;
  // Stomping a Bullet Bill bounces the player up, just like stomping an enemy.
  const playerAfterProjectileStomp =
    (timedHazardResolution.stompedProjectileCountByPlayer[0] ?? 0) > 0
      ? reboundPlayerFromStomp(playerAfterContactResponse, movementConstants)
      : playerAfterContactResponse;
  // SMB advances its PseudoRandom register once per frame regardless of use; the
  // underwater Cheep-cheep frenzy reads it to spawn the shoal. Touching a cheep
  // harms the player like any hazard (you can't stomp underwater).
  const nextPseudoRandom = advancePseudoRandom(state.pseudoRandom);
  const partyFrenzyAnchor = furthestAdvancedPlayer([
    playerAfterProjectileStomp,
    ...coopPlayerPairs.map((pair) => pair.current),
  ]);
  const cheepFrenzy = resolveCheepFrenzyState(
    state.cheepFrenzy,
    levelSpec,
    playerAfterProjectileStomp,
    nextPseudoRandom,
    Number(state.clock.frameDurationMilliseconds) / 1000,
    Number(nextClock.frameIndex),
    partyFrenzyAnchor,
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
    coopPlayerPairs,
  );
  const playerAfterAerialStomp =
    (aerialFrenzy.stompedCountByPlayer[0] ?? 0) > 0
      ? reboundPlayerFromStomp(playerAfterProjectileStomp, movementConstants)
      : playerAfterProjectileStomp;
  // Each co-op stomper bounces off what they landed on, exactly as the
  // primary does.
  const coopReboundIndices = new Set(
    coopPlayerPairIndices.filter(
      (_coopIndex, pairPosition) =>
        (timedHazardResolution.stompedProjectileCountByPlayer[
          pairPosition + 1
        ] ?? 0) > 0 ||
        (aerialFrenzy.stompedCountByPlayer[pairPosition + 1] ?? 0) > 0,
    ),
  );
  const coopRuntimesAfterProjectileStomps = coopRuntimesAfterEnemies.map(
    (runtime, index) =>
      coopReboundIndices.has(index)
        ? {
            ...runtime,
            player: reboundPlayerFromStomp(runtime.player, movementConstants),
          }
        : runtime,
  );
  // Lakitu's landed eggs hatch into walking Spinies; player fireballs defeat
  // them (and are consumed doing it).
  const hatchedSpinies = resolveHatchedSpinyState(
    state.hatchedSpinies,
    levelSpec,
    playerAfterAerialStomp,
    partyProjectiles.state.projectiles,
    timedHazardProjectiles.hatchedPositions,
    Number(state.clock.frameDurationMilliseconds) / 1000,
    Number(nextClock.frameIndex),
  );
  const projectilesAfterSpinyKills =
    hatchedSpinies.consumedProjectileIds.length === 0
      ? partyProjectiles.state
      : {
          ...partyProjectiles.state,
          projectiles: partyProjectiles.state.projectiles.filter(
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

  // Party-wide, not primary-only: the retained state's collectible lists carry
  // every player's pickups, so diffing them against the primary's own
  // resolution silently discarded whatever a co-op player collected — their
  // 1-UP mushrooms awarded nothing, and their coins pushed the session total
  // across the every-100 boundary without the 1-UP.
  const extraLifeMushroomsCollected =
    partyCollectibles.collectedExtraLifeEntityIds.length -
    state.collectibles.collectedExtraLifeEntityIds.length;

  // Coin 1-Ups key off the whole-session coin total (the base from prior levels
  // plus the coins collected in this one), so the every-100-coins award crosses
  // level boundaries as in the original. The base is constant within a level.
  const coinExtraLives = computeCoinExtraLives(
    state.sessionCoinBase + state.collectibles.collectedCoinEntityIds.length,
    state.sessionCoinBase + partyCollectibles.collectedCoinEntityIds.length,
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
    // Player one's freshly-computed runtime at index 0, then the co-op players
    // as the world left them — moved, and rebounded off anything they stomped.
    // Their outcomes are settled afterwards by the outer stepSimulation.
    players: [
      {
        player: finalPlayer,
        vitality: guardedVitality,
        invincibility: playerInvincibility,
        outcome: playerOutcome,
        reaction: playerReaction,
      },
      ...coopRuntimesAfterProjectileStomps,
    ],
    levelContacts: outcomeLevelContacts,
    collectibles: partyCollectibles,
    powerUps: partyPowerUps,
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

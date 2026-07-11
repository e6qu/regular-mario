import { makeFrameIndex } from "../domain/units";
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
  resolveBreakableBlockState,
} from "./breakable-block-state";
import {
  assertValidInteractiveBlockInteractionState,
  assertValidSpawnedActorsState,
  resolveInteractiveBlockInteractionState,
  resolveSpawnedActorsState,
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
  resizePlayerForVitality,
  type PlayerSimulationState,
} from "./player-state";
import {
  assertValidPlayerOutcomeState,
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
import type { SimulationState } from "./simulation-state";
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
import { resolveSolidTileCollisionWithBlockBumps } from "./solid-tile-collision";
import { hiddenBlockPositionKey } from "./tile-collision-support";
import { applyVerticalMovement } from "./vertical-movement";
import {
  ArmoredEnemyBehavior,
  type EnemyMotionState,
  requireEnemyActorState,
} from "./enemy-motion";

// The top two grid rows of every decoded level are reserved for the HUD overlay
// (the decoder's row offset), so gameplay content — and the water surface —
// begins at grid row 2.
const hudReservedRowCount = 2;

export function stepSimulation(
  state: SimulationState,
  inputCommand: SimulationInputCommand,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
): SimulationState {
  const nextClock = makeNextSimulationClock(state);
  assertValidPlayerVitalityState(state.playerVitality);
  assertValidPlayerInvincibilityState(
    state.playerInvincibility,
    levelSpec,
    state.spawnedActors.spawnedActors,
  );
  assertValidPlayerOutcomeState(state.playerOutcome);
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

  switch (state.playerOutcome.kind) {
    case PlayerOutcomeKind.Active:
      return stepActiveSimulation(
        state,
        inputCommand,
        movementConstants,
        levelSpec,
        nextClock,
      );
    case PlayerOutcomeKind.Defeated:
    case PlayerOutcomeKind.Finished:
    case PlayerOutcomeKind.DefeatedAndFinished:
      return {
        ...state,
        clock: nextClock,
      };
    default: {
      const invalidOutcome: never = state.playerOutcome;
      throw new Error(
        `Invalid player outcome state: ${String(invalidOutcome)}`,
      );
    }
  }
}

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
): SimulationState {
  const playerVitalityAfterRecoveryTick = stepPlayerVitalityRecovery(
    state.playerVitality,
  );
  const levelTimer = stepLevelTimerState(state.levelTimer);

  const pipeState = resolvePipeState(
    { downHeld: inputCommand.downHeld },
    state.player,
    state.pipeEntry,
    movementConstants,
    levelSpec,
    undefined,
  );

  const teleportResult = pipeState.teleport;

  const effectiveInputCommand = isPlayerFrozenByPipeEntry(pipeState.pipeEntry)
    ? freezePlayerInputCommand(inputCommand)
    : makeRecoveryAdjustedInputCommand(
        inputCommand,
        playerVitalityAfterRecoveryTick,
      );

  const horizontallyMovedPlayer = applyHorizontalMovement(
    state.player,
    effectiveInputCommand,
    state.clock.frameDurationMilliseconds,
    movementConstants,
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
  const resolvedPlayerWithBumps = resolveSolidTileCollisionWithBlockBumps(
    state.player,
    movedPlayer,
    levelSpec,
    state.breakableBlocks,
    movementConstants.springLaunchSpeed,
    revealedHiddenPositionKeys,
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
  const platformAdjustedPlayer = platformsResolution.player;

  // Castle maze checkpoints: crossing on the wrong row loops the player back
  // four pages.
  const loopZonesResolution = resolveLoopZones(
    state.loopZones,
    levelSpec,
    state.player,
    platformAdjustedPlayer,
  );
  const loopAdjustedPlayer = loopZonesResolution.player;

  const teleportedPlayer =
    teleportResult.kind === "same-level"
      ? teleportPlayerToTilePosition(
          loopAdjustedPlayer,
          teleportResult.targetTilePosition,
          levelSpec,
        )
      : loopAdjustedPlayer;

  const interactiveBlocks = resolveInteractiveBlockInteractionState(
    state.interactiveBlocks,
    resolvedPlayerWithBumps.bumpedInteractiveBlocks,
  );
  const breakableBlocks = resolveBreakableBlockState(
    state.breakableBlocks,
    resolvedPlayerWithBumps.bumpedBreakableBlocks,
    playerVitalityAfterRecoveryTick,
  );
  const spawnedActorsAfterBlockBumps = resolveSpawnedActorsState(
    state.spawnedActors,
    levelSpec,
    resolvedPlayerWithBumps.bumpedInteractiveBlocks,
    nextClock.frameIndex,
  );
  const spawnedActors = stepSpawnedActorsState(
    spawnedActorsAfterBlockBumps,
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
  const playerReaction = resolvePlayerReactionState(state.playerReaction, {
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
  );
  const playerInvincibility = resolvePlayerInvincibilityState(
    playerAfterPowerUpResize,
    levelSpec,
    spawnedActors.spawnedActors,
    state.playerInvincibility,
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
    state.player,
    playerAfterPowerUpResize,
    levelSpec,
    enemyMotion,
    movementConstants,
    state.enemies,
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
  );
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
    enemies,
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
    state.player,
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
    state.player,
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
    playerVitalityAfterEnemyContact.kind === PlayerVitalityKind.Recovering;
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
  const playerAfterHazardResize = resizePlayerForVitality(
    playerAfterAerialStomp,
    playerVitalityAfterHazard,
  );
  const outcomeLevelContacts = {
    ...levelContacts,
    hazard:
      effectiveHazardContact &&
      playerVitalityAfterEnemyContact.kind === PlayerVitalityKind.Small,
  };

  const playerOutcome = resolvePlayerOutcomeState(
    state.playerOutcome,
    outcomeLevelContacts,
    enemies,
    playerVitalityAfterHazard,
    levelSpec.fallExitTransition === undefined &&
      hasPlayerFallenIntoPit(playerAfterContactResponse, levelSpec),
    hasLevelTimerExpired(levelTimer),
  );

  const justFinished =
    state.playerOutcome.kind !== PlayerOutcomeKind.Finished &&
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

  const coinExtraLives = computeCoinExtraLives(
    state.collectibles.collectedCoinEntityIds.length,
    collectibles.collectedCoinEntityIds.length,
  );

  // 1-UPs earned this frame by stomp / kicked-shell chains past 8000 points.
  const stompChainExtraLives =
    enemies.cumulativeStompChainExtraLives -
    state.enemies.cumulativeStompChainExtraLives;
  const shellChainExtraLives =
    enemies.cumulativeShellKillExtraLives -
    state.enemies.cumulativeShellKillExtraLives;

  const justDefeated =
    state.playerOutcome.kind !== PlayerOutcomeKind.Defeated &&
    state.playerOutcome.kind !== PlayerOutcomeKind.DefeatedAndFinished &&
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

  return {
    clock: nextClock,
    player: playerAfterHazardResize,
    playerVitality: playerVitalityAfterHazard,
    playerInvincibility,
    levelContacts: outcomeLevelContacts,
    playerOutcome,
    collectibles,
    powerUps: powerUpResolution.state,
    enemies,
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
    ),
    levelTimer,
    timedHazardProjectiles,
    timeBonusScore,
    goalHeightScore,
    breakableBlockScore,
    bulletBillStompScore,
    livesRemaining,
    playerReaction,
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
      };
    default: {
      const invalidResponse: never = enemyContactResponse;
      throw new Error(
        `Invalid enemy contact response: ${String(invalidResponse)}`,
      );
    }
  }
}

function mergeProjectileDefeatedEnemies(
  enemies: EnemyInteractionState,
  projectileDefeatedEnemyEntityIds: readonly EntityId[],
): EnemyInteractionState {
  const defeatedSet = new Set(enemies.defeatedEnemyEntityIds);
  const newKills = countNewlyDefeated(
    defeatedSet,
    projectileDefeatedEnemyEntityIds,
  );

  return {
    ...enemies,
    defeatedEnemyEntityIds: [...defeatedSet],
    cumulativeProjectileKillScore: (enemies.cumulativeProjectileKillScore +
      newKills *
        scorePerProjectileKill) as EnemyInteractionState["cumulativeProjectileKillScore"],
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

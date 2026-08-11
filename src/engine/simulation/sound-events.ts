import {
  isPlayerOutcomeDefeated,
  isPlayerOutcomeFinished,
} from "./player-outcome";
import { ActorRole } from "../domain/level-spec";
import {
  initialMovementConstants,
  VerticalMovementState,
} from "./movement-model";
import { headBonkReactionFrames, PlayerReactionKind } from "./player-reaction";
import type { SimulationState } from "./simulation-state";

export enum SoundEvent {
  Jump = "jump",
  Land = "land",
  Collect = "collect",
  PowerUp = "power-up",
  Stomp = "stomp",
  Defeat = "defeat",
  Finish = "finish",
  ProjectileFire = "projectile-fire",
  LevelComplete = "level-complete",
  HeadBonk = "head-bonk",
  BlockBreak = "block-break",
  EnemyShot = "enemy-shot",
  Firework = "firework",
  TimeTick = "time-tick",
  SpringBounce = "spring-bounce",
  VineGrow = "vine-grow",
}

type PlayerRuntimeForSound = SimulationState["players"][number];

function isSpringBounce(
  previousRuntime: PlayerRuntimeForSound,
  currentRuntime: PlayerRuntimeForSound,
): boolean {
  // A springboard landing snaps a downward-moving player to exactly the
  // spring launch speed (passive or A-boosted) within a single step; nothing
  // else converts downward motion straight into either of those exact upward
  // speeds, so the velocity transition alone identifies the bounce.
  const previousVelocityY = previousRuntime.player.velocity.y;
  const currentVelocityY = currentRuntime.player.velocity.y;

  if (previousVelocityY <= 0) {
    return false;
  }

  return (
    currentVelocityY === 0 - initialMovementConstants.springLaunchSpeed ||
    currentVelocityY === 0 - initialMovementConstants.springBoostLaunchSpeed
  );
}

function isFreshHeadBonk(
  previousRuntime: PlayerRuntimeForSound,
  currentRuntime: PlayerRuntimeForSound,
): boolean {
  // A fresh bonk sets the countdown to its maximum; a mid-reaction re-bonk
  // resets it to the maximum too, so both fire the sound.
  const current = currentRuntime.reaction;
  if (
    current.kind !== PlayerReactionKind.HeadBonk ||
    current.remainingFrames !== headBonkReactionFrames
  ) {
    return false;
  }

  const previous = previousRuntime.reaction;
  return (
    previous.kind !== PlayerReactionKind.HeadBonk ||
    previous.remainingFrames !== headBonkReactionFrames
  );
}

function hasNewProjectileKill(
  previousState: SimulationState,
  currentState: SimulationState,
): boolean {
  return (
    currentState.enemies.cumulativeProjectileKillScore >
    previousState.enemies.cumulativeProjectileKillScore
  );
}

function hasNewProjectile(
  previousState: SimulationState,
  currentState: SimulationState,
): boolean {
  if (
    currentState.projectiles.projectiles.length <=
    previousState.projectiles.projectiles.length
  ) {
    return false;
  }

  const previousIds = new Set(
    previousState.projectiles.projectiles.map((projectile) => projectile.id),
  );

  return currentState.projectiles.projectiles.some(
    (projectile) => !previousIds.has(projectile.id),
  );
}

function isAirborne(vertical: VerticalMovementState): boolean {
  return (
    vertical === VerticalMovementState.Jumping ||
    vertical === VerticalMovementState.Falling
  );
}

function hasNewEntityId(
  previousIds: readonly string[],
  currentIds: readonly string[],
): boolean {
  if (currentIds.length <= previousIds.length) {
    return false;
  }

  const previousSet = new Set(previousIds);
  return currentIds.some((entityId) => !previousSet.has(entityId));
}

export function resolveSoundEvents(
  previousState: SimulationState,
  currentState: SimulationState,
  // Whose body the personal cues (jump, land, spring twang, head bonk,
  // defeat, finish) belong to: the local player's slot in multiplayer, slot 0
  // in local play. Every cue used to derive from slot 0, so a guest heard the
  // HOST jump and die instead of themselves. A slot absent from either state
  // (a roster change mid-frame) falls back to the primary, which always
  // exists. World cues (coins, blocks, stomps, power-ups) are party-wide.
  perspectiveSlot = 0,
): readonly SoundEvent[] {
  const events: SoundEvent[] = [];

  const previousPerspective =
    previousState.players[perspectiveSlot] ?? previousState.players[0];
  const currentPerspective =
    currentState.players[perspectiveSlot] ?? currentState.players[0];
  const previousVertical = previousPerspective.player.movement.vertical;
  const currentVertical = currentPerspective.player.movement.vertical;

  if (
    previousVertical !== VerticalMovementState.Jumping &&
    currentVertical === VerticalMovementState.Jumping
  ) {
    events.push(SoundEvent.Jump);
  }

  // Layered over the jump chirp (the spring launch also enters Jumping): the
  // springboard's own bounce twang.
  if (isSpringBounce(previousPerspective, currentPerspective)) {
    events.push(SoundEvent.SpringBounce);
  }

  // A beanstalk sprouting from its bumped block (the ROM's Sfx_GrowVine):
  // a new climbable spawned actor appeared this frame.
  const previousClimbableCount =
    previousState.spawnedActors.spawnedActors.filter(
      (actor) => actor.role === ActorRole.Climbable,
    ).length;
  const currentClimbableCount = currentState.spawnedActors.spawnedActors.filter(
    (actor) => actor.role === ActorRole.Climbable,
  ).length;
  if (currentClimbableCount > previousClimbableCount) {
    events.push(SoundEvent.VineGrow);
  }

  if (
    isAirborne(previousVertical) &&
    currentVertical === VerticalMovementState.Grounded
  ) {
    events.push(SoundEvent.Land);
  }

  if (
    hasNewEntityId(
      previousState.collectibles.collectedCoinEntityIds,
      currentState.collectibles.collectedCoinEntityIds,
    ) ||
    hasNewEntityId(
      previousState.collectibles.collectedItemEntityIds,
      currentState.collectibles.collectedItemEntityIds,
    )
  ) {
    events.push(SoundEvent.Collect);
  }

  if (
    hasNewEntityId(
      previousState.powerUps.collectedPowerUpEntityIds,
      currentState.powerUps.collectedPowerUpEntityIds,
    )
  ) {
    events.push(SoundEvent.PowerUp);
  }

  if (hasNewProjectile(previousState, currentState)) {
    events.push(SoundEvent.ProjectileFire);
  }

  const enemyShot = hasNewProjectileKill(previousState, currentState);
  if (enemyShot) {
    events.push(SoundEvent.EnemyShot);
  }

  // A newly defeated enemy that was not a projectile kill is a stomp/shell/star
  // defeat; a projectile kill fires EnemyShot instead of Stomp.
  if (
    !enemyShot &&
    hasNewEntityId(
      previousState.enemies.defeatedEnemyEntityIds,
      currentState.enemies.defeatedEnemyEntityIds,
    )
  ) {
    events.push(SoundEvent.Stomp);
  }

  if (isFreshHeadBonk(previousPerspective, currentPerspective)) {
    events.push(SoundEvent.HeadBonk);
  }

  // A brick shattering (big Mario bonking a breakable block) adds one or more
  // tiles to the broken set — a distinct "bricks breaking" crunch, layered over
  // the bonk thud.
  if (
    currentState.breakableBlocks.brokenBlockTilePositions.length >
    previousState.breakableBlocks.brokenBlockTilePositions.length
  ) {
    events.push(SoundEvent.BlockBreak);
  }

  // Ask whether the player IS defeated / finished rather than comparing the
  // outcome kind. Both facts live in two variants each — a player killed on the
  // goal is `DefeatedAndFinished` — so kind comparisons silently skipped that
  // case and it played neither the death sound nor the finish sound.
  const previousOutcome = previousPerspective.outcome;
  const currentOutcome = currentPerspective.outcome;

  // Finishing takes precedence over dying, which is the convention the rest of
  // the game already follows: hasFinishedOutcome() and the flagpole cinematic
  // both treat DefeatedAndFinished as a finish and advance the level. Firing
  // both cues would contradict that and stack two sounds on one frame.
  if (
    !isPlayerOutcomeDefeated(previousOutcome) &&
    isPlayerOutcomeDefeated(currentOutcome) &&
    !isPlayerOutcomeFinished(currentOutcome)
  ) {
    events.push(SoundEvent.Defeat);
  }

  if (
    !isPlayerOutcomeFinished(previousOutcome) &&
    isPlayerOutcomeFinished(currentOutcome)
  ) {
    events.push(SoundEvent.Finish);
  }

  return events;
}

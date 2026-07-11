import type { DomainResult } from "../domain/result";
import { fail, succeed } from "../domain/result";
import type { LevelSpec } from "../domain/level-spec";
import type { FrameDurationMilliseconds, FrameIndex } from "../domain/units";
import { makeFrameDurationMilliseconds, makeFrameIndex } from "../domain/units";
import type { ValidationError } from "../domain/validation-error";
import {
  makeInitialPlayerSimulationState,
  type PlayerSimulationState,
} from "./player-state";
import {
  makeInitialPlayerVitalityState,
  type PlayerVitalityState,
} from "./player-vitality";
import {
  makeEmptyPlayerInvincibilityState,
  type PlayerInvincibilityState,
} from "./player-invincibility";
import {
  makeActivePlayerOutcomeState,
  type PlayerOutcomeState,
} from "./player-outcome";
import {
  makeEmptyLevelContactState,
  type LevelContactState,
} from "./level-contact";
import {
  makeEmptyCollectibleInteractionState,
  type CollectibleInteractionState,
} from "./collectible-interaction";
import {
  makeEmptyPowerUpInteractionState,
  type PowerUpInteractionState,
} from "./power-up-interaction";
import {
  makeEmptyEnemyInteractionState,
  type EnemyInteractionState,
} from "./enemy-interaction";
import {
  makeEmptyEnemyContactResponseState,
  type EnemyContactResponseState,
} from "./enemy-contact-response";
import {
  makeInitialEnemyMotionState,
  type EnemyMotionState,
} from "./enemy-motion";
import {
  makeEmptyInteractiveBlockInteractionState,
  makeEmptySpawnedActorsState,
  type InteractiveBlockInteractionState,
  type SpawnedActorsState,
} from "./interactive-block-state";
import {
  makeEmptyBreakableBlockState,
  type BreakableBlockState,
} from "./breakable-block-state";
import type { MovementConstants } from "./movement-model";
import {
  makeEmptyProjectilesState,
  type ProjectilesState,
} from "./projectile-state";
import { makeInitialPipeEntryState, type PipeEntryState } from "./pipe-state";
import {
  makeInitialLevelTimerState,
  type LevelTimerState,
} from "./level-timer-state";
import { type Score } from "./game-score";
import {
  makeEmptyPlayerReactionState,
  type PlayerReactionState,
} from "./player-reaction";
import {
  makeEmptyStompReactionState,
  type StompReactionState,
} from "./stomp-reaction";
import {
  makeEmptyTimedHazardProjectilesState,
  type TimedHazardProjectilesState,
} from "./timed-hazard-projectile-state";
import {
  makeInitialPseudoRandomState,
  type PseudoRandomState,
} from "./pseudo-random";
import {
  makeEmptyCheepFrenzyState,
  type CheepFrenzyState,
} from "./cheep-frenzy-state";
import { makeEmptyPlatformsState, type PlatformsState } from "./platform-state";
import {
  makeEmptyAerialFrenzyState,
  type AerialFrenzyState,
} from "./aerial-frenzy-state";
import {
  makeEmptyLoopZoneState,
  type LoopZoneRuntimeState,
} from "./loop-zone-state";

export const initialLivesCount = 3;

type SimulationClock = {
  readonly frameIndex: FrameIndex;
  readonly frameDurationMilliseconds: FrameDurationMilliseconds;
};

export type SimulationState = {
  readonly clock: SimulationClock;
  readonly player: PlayerSimulationState;
  readonly playerVitality: PlayerVitalityState;
  readonly playerInvincibility: PlayerInvincibilityState;
  readonly levelContacts: LevelContactState;
  readonly playerOutcome: PlayerOutcomeState;
  readonly collectibles: CollectibleInteractionState;
  readonly powerUps: PowerUpInteractionState;
  readonly enemies: EnemyInteractionState;
  readonly enemyContactResponse: EnemyContactResponseState;
  readonly enemyMotion: EnemyMotionState;
  readonly interactiveBlocks: InteractiveBlockInteractionState;
  readonly breakableBlocks: BreakableBlockState;
  readonly spawnedActors: SpawnedActorsState;
  readonly projectiles: ProjectilesState;
  readonly pipeEntry: PipeEntryState;
  readonly levelTimer: LevelTimerState;
  readonly timedHazardProjectiles: TimedHazardProjectilesState;
  readonly timeBonusScore: Score;
  readonly breakableBlockScore: Score;
  readonly bulletBillStompScore: Score;
  readonly livesRemaining: number;
  readonly playerReaction: PlayerReactionState;
  readonly enemyStompReaction: StompReactionState;
  // Accumulated head-bonk "bloodiness" in [0, 1] (shabby mode only). Each bonk
  // adds more the faster the player was going; at 1 the player is at half speed.
  readonly bloodiness: number;
  // SMB's shared PseudoRandom register, advanced once per frame; drives the
  // underwater Cheep-cheep frenzy.
  readonly pseudoRandom: PseudoRandomState;
  readonly cheepFrenzy: CheepFrenzyState;
  readonly aerialFrenzy: AerialFrenzyState;
  readonly platforms: PlatformsState;
  readonly loopZones: LoopZoneRuntimeState;
};

export function makeInitialSimulationState(
  frameDurationMilliseconds: number,
  levelSpec: LevelSpec,
  movementConstants: MovementConstants,
): DomainResult<SimulationState, ValidationError> {
  return makeInitialSimulationStateWithPlayerVitality(
    frameDurationMilliseconds,
    levelSpec,
    movementConstants,
    makeInitialPlayerVitalityState(),
  );
}

export function makeInitialSimulationStateWithPlayerVitality(
  frameDurationMilliseconds: number,
  levelSpec: LevelSpec,
  movementConstants: MovementConstants,
  playerVitality: PlayerVitalityState,
): DomainResult<SimulationState, ValidationError> {
  const errors: ValidationError[] = [];
  const frameIndexResult = makeFrameIndex(0, "clock.frameIndex");
  const frameDurationResult = makeFrameDurationMilliseconds(
    frameDurationMilliseconds,
    "clock.frameDurationMilliseconds",
  );

  if (!frameIndexResult.ok) {
    errors.push(...frameIndexResult.errors);
  }

  if (!frameDurationResult.ok) {
    errors.push(...frameDurationResult.errors);
  }

  if (!frameIndexResult.ok || !frameDurationResult.ok) {
    return fail(errors);
  }

  return succeed({
    clock: {
      frameIndex: frameIndexResult.value,
      frameDurationMilliseconds: frameDurationResult.value,
    },
    player: makeInitialPlayerSimulationState(),
    playerVitality,
    playerInvincibility: makeEmptyPlayerInvincibilityState(),
    levelContacts: makeEmptyLevelContactState(),
    playerOutcome: makeActivePlayerOutcomeState(),
    collectibles: makeEmptyCollectibleInteractionState(),
    powerUps: makeEmptyPowerUpInteractionState(),
    enemies: makeEmptyEnemyInteractionState(),
    enemyContactResponse: makeEmptyEnemyContactResponseState(),
    enemyMotion: makeInitialEnemyMotionState(levelSpec, movementConstants),
    interactiveBlocks: makeEmptyInteractiveBlockInteractionState(),
    breakableBlocks: makeEmptyBreakableBlockState(),
    spawnedActors: makeEmptySpawnedActorsState(),
    projectiles: makeEmptyProjectilesState(),
    pipeEntry: makeInitialPipeEntryState(),
    levelTimer: makeInitialLevelTimerState(levelSpec),
    timedHazardProjectiles: makeEmptyTimedHazardProjectilesState(),
    timeBonusScore: 0 as Score,
    breakableBlockScore: 0 as Score,
    bulletBillStompScore: 0 as Score,
    livesRemaining: initialLivesCount,
    playerReaction: makeEmptyPlayerReactionState(),
    enemyStompReaction: makeEmptyStompReactionState(),
    bloodiness: 0,
    pseudoRandom: makeInitialPseudoRandomState(),
    cheepFrenzy: makeEmptyCheepFrenzyState(),
    aerialFrenzy: makeEmptyAerialFrenzyState(),
    platforms: makeEmptyPlatformsState(levelSpec),
    loopZones: makeEmptyLoopZoneState(),
  });
}

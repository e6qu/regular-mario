import type { DomainResult } from "../domain/result";
import { fail, succeed } from "../domain/result";
import type { EntityId } from "../domain/identifiers";
import type { LevelSpec } from "../domain/level-spec";
import type { FrameDurationMilliseconds, FrameIndex } from "../domain/units";
import { makeFrameDurationMilliseconds, makeFrameIndex } from "../domain/units";
import type { ValidationError } from "../domain/validation-error";
import {
  makeCoopPlayerSimulationState,
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
import {
  makeEmptyHatchedSpinyState,
  type HatchedSpinyState,
} from "./hatched-spiny-state";

export const initialLivesCount = 3;

// Same-screen co-op supports up to this many players (all equally important).
export const maxSimulationPlayers = 16;

// All the per-player state slices bundled as one unit. Simultaneous co-op is a
// uniform array of these — no privileged "main" player.
export type PlayerRuntime = {
  readonly player: PlayerSimulationState;
  readonly vitality: PlayerVitalityState;
  readonly invincibility: PlayerInvincibilityState;
  readonly outcome: PlayerOutcomeState;
  readonly reaction: PlayerReactionState;
};

// Expand/contract migration to N players: the canonical per-player slices still
// live as the singular top-level fields, and `players` is derived from them at
// every state boundary. This lets N-player-aware code read a uniform array while
// the singular fields are progressively retired (contract phase), keeping every
// step behaviour-identical for a single player in the meantime.
export function deriveSimulationPlayers(source: {
  readonly player: PlayerSimulationState;
  readonly playerVitality: PlayerVitalityState;
  readonly playerInvincibility: PlayerInvincibilityState;
  readonly playerOutcome: PlayerOutcomeState;
  readonly playerReaction: PlayerReactionState;
  readonly coopPlayers?: readonly PlayerSimulationState[];
}): readonly PlayerRuntime[] {
  const primary: PlayerRuntime = {
    player: source.player,
    vitality: source.playerVitality,
    invincibility: source.playerInvincibility,
    outcome: source.playerOutcome,
    reaction: source.playerReaction,
  };
  // Additional co-op players currently carry only kinematics; their vitality/
  // outcome/reaction are neutral placeholders until the uniform-interaction
  // increment gives each player its own full runtime.
  const additional: readonly PlayerRuntime[] = (source.coopPlayers ?? []).map(
    (player) => ({
      player,
      vitality: makeInitialPlayerVitalityState(),
      invincibility: makeEmptyPlayerInvincibilityState(),
      outcome: makeActivePlayerOutcomeState(),
      reaction: makeEmptyPlayerReactionState(),
    }),
  );
  return [primary, ...additional];
}

type SimulationClock = {
  readonly frameIndex: FrameIndex;
  readonly frameDurationMilliseconds: FrameDurationMilliseconds;
};

export type SimulationState = {
  readonly clock: SimulationClock;
  // The uniform co-op player array (length 1 in single-player), derived from the
  // singular player slices below plus coopPlayers at every state boundary during
  // the N-player migration. See deriveSimulationPlayers.
  readonly players: readonly PlayerRuntime[];
  // Additional co-op players beyond the primary (empty/absent in single-player).
  // Authoritative for their own kinematics; stepped through the shared movement.
  readonly coopPlayers?: readonly PlayerSimulationState[];
  readonly player: PlayerSimulationState;
  readonly playerVitality: PlayerVitalityState;
  readonly playerInvincibility: PlayerInvincibilityState;
  readonly levelContacts: LevelContactState;
  readonly playerOutcome: PlayerOutcomeState;
  readonly collectibles: CollectibleInteractionState;
  readonly powerUps: PowerUpInteractionState;
  readonly enemies: EnemyInteractionState;
  // The frame each enemy last dealt the player a damaging contact, so the same
  // enemy is debounced to at most one hit per cooldown window (a particular
  // enemy cannot chip a big player down and then kill them; different enemies
  // still hurt independently).
  readonly enemyDamageContactFrameByEntityId: ReadonlyMap<EntityId, FrameIndex>;
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
  readonly goalHeightScore: Score;
  readonly livesRemaining: number;
  // Coins collected in prior levels of this play session. The displayed coin
  // total and the every-100-coins 1-Up both key off this base plus the coins
  // collected in the current level (collectibles.collectedCoinEntityIds), so the
  // count persists across levels as in the original. Reset only on a new game.
  readonly sessionCoinBase: number;
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
  readonly hatchedSpinies: HatchedSpinyState;
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
  // Total simultaneous players (1 = single-player). Additional players spawn
  // beside the primary as co-op players; clamped to maxSimulationPlayers.
  playerCount = 1,
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

  const player = makeInitialPlayerSimulationState();
  const playerInvincibility = makeEmptyPlayerInvincibilityState();
  const playerOutcome = makeActivePlayerOutcomeState();
  const playerReaction = makeEmptyPlayerReactionState();
  const additionalPlayerCount = Math.max(
    0,
    Math.min(playerCount, maxSimulationPlayers) - 1,
  );
  const coopPlayers = Array.from(
    { length: additionalPlayerCount },
    (_unused, index) => makeCoopPlayerSimulationState(index),
  );

  return succeed({
    clock: {
      frameIndex: frameIndexResult.value,
      frameDurationMilliseconds: frameDurationResult.value,
    },
    players: deriveSimulationPlayers({
      player,
      playerVitality,
      playerInvincibility,
      playerOutcome,
      playerReaction,
      coopPlayers,
    }),
    coopPlayers,
    player,
    playerVitality,
    playerInvincibility,
    levelContacts: makeEmptyLevelContactState(),
    playerOutcome,
    collectibles: makeEmptyCollectibleInteractionState(),
    powerUps: makeEmptyPowerUpInteractionState(),
    enemies: makeEmptyEnemyInteractionState(),
    enemyDamageContactFrameByEntityId: new Map(),
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
    goalHeightScore: 0 as Score,
    livesRemaining: initialLivesCount,
    sessionCoinBase: 0,
    playerReaction,
    enemyStompReaction: makeEmptyStompReactionState(),
    bloodiness: 0,
    pseudoRandom: makeInitialPseudoRandomState(),
    cheepFrenzy: makeEmptyCheepFrenzyState(),
    aerialFrenzy: makeEmptyAerialFrenzyState(),
    platforms: makeEmptyPlatformsState(levelSpec),
    loopZones: makeEmptyLoopZoneState(),
    hatchedSpinies: makeEmptyHatchedSpinyState(),
  });
}

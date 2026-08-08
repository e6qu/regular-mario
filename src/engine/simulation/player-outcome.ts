import type { LevelContactState } from "./level-contact";
import type { EnemyInteractionState } from "./enemy-interaction";
import {
  assertValidPlayerVitalityState,
  doesEnemyContactDefeatPlayer,
  type PlayerVitalityState,
} from "./player-vitality";

export enum PlayerDefeatReason {
  HazardContact = "hazard-contact",
  EnemyContact = "enemy-contact",
  HazardAndEnemyContact = "hazard-and-enemy-contact",
  PitContact = "pit-contact",
  TimeUp = "time-up",
}

export enum PlayerFinishReason {
  GoalContact = "goal-contact",
}

export enum PlayerOutcomeKind {
  Active = "active",
  Defeated = "defeated",
  Finished = "finished",
  DefeatedAndFinished = "defeated-and-finished",
}

export type PlayerOutcomeState =
  | {
      readonly kind: PlayerOutcomeKind.Active;
    }
  | {
      readonly kind: PlayerOutcomeKind.Defeated;
      readonly reason: PlayerDefeatReason;
    }
  | {
      readonly kind: PlayerOutcomeKind.Finished;
      readonly reason: PlayerFinishReason;
    }
  | {
      readonly kind: PlayerOutcomeKind.DefeatedAndFinished;
      readonly defeatReason: PlayerDefeatReason;
      readonly finishReason: PlayerFinishReason;
    };

/**
 * The defeat carried by an outcome, or undefined when the player is not
 * defeated.
 *
 * Defeat lives in TWO variants — `Defeated`, and `DefeatedAndFinished` for a
 * player killed on the goal — so every `kind === Defeated` comparison silently
 * misses the second. `revive()` did exactly that and refused to revive a player
 * defeated at the flagpole with "Only defeated players can revive."
 *
 * Reached through isPlayerOutcomeDefeated below rather than exported: the
 * question callers ask is "is this player defeated?", and the dead-code gate
 * rightly rejects an export nothing consumes.
 *
 * Ask through this instead of comparing `kind`. The switch is exhaustive over
 * the union with a `never` default, so a new outcome kind is a compile error
 * here rather than a wrong answer at a call site.
 */
function playerOutcomeDefeat(
  outcome: PlayerOutcomeState,
): PlayerDefeatReason | undefined {
  switch (outcome.kind) {
    case PlayerOutcomeKind.Active:
    case PlayerOutcomeKind.Finished:
      return undefined;
    case PlayerOutcomeKind.Defeated:
      return outcome.reason;
    case PlayerOutcomeKind.DefeatedAndFinished:
      return outcome.defeatReason;
    default: {
      const invalidOutcome: never = outcome;
      throw new Error(
        `Invalid player outcome state: ${String(invalidOutcome)}`,
      );
    }
  }
}

/**
 * The finish carried by an outcome, or undefined when the player has not
 * finished. The mirror of {@link playerOutcomeDefeat}: finishing also lives in
 * two variants, `Finished` and `DefeatedAndFinished`.
 */
function playerOutcomeFinish(
  outcome: PlayerOutcomeState,
): PlayerFinishReason | undefined {
  switch (outcome.kind) {
    case PlayerOutcomeKind.Active:
    case PlayerOutcomeKind.Defeated:
      return undefined;
    case PlayerOutcomeKind.Finished:
      return outcome.reason;
    case PlayerOutcomeKind.DefeatedAndFinished:
      return outcome.finishReason;
    default: {
      const invalidOutcome: never = outcome;
      throw new Error(
        `Invalid player outcome state: ${String(invalidOutcome)}`,
      );
    }
  }
}

/** Whether the player has finished, in either variant that carries a finish. */
export function isPlayerOutcomeFinished(outcome: PlayerOutcomeState): boolean {
  return playerOutcomeFinish(outcome) !== undefined;
}

/** Whether the player is defeated, in either variant that carries a defeat. */
export function isPlayerOutcomeDefeated(outcome: PlayerOutcomeState): boolean {
  return playerOutcomeDefeat(outcome) !== undefined;
}

export function makeActivePlayerOutcomeState(): PlayerOutcomeState {
  return {
    kind: PlayerOutcomeKind.Active,
  };
}

export function assertValidPlayerOutcomeState(
  playerOutcome: unknown,
): asserts playerOutcome is PlayerOutcomeState {
  if (typeof playerOutcome !== "object" || playerOutcome === null) {
    throw new Error("Player outcome state must be an object.");
  }

  const candidate = playerOutcome as Readonly<Record<string, unknown>>;

  switch (candidate.kind) {
    case PlayerOutcomeKind.Active:
      return;
    case PlayerOutcomeKind.Defeated:
      if (!isPlayerDefeatReason(candidate.reason)) {
        throw new Error("Defeated player outcome reason is invalid.");
      }

      return;
    case PlayerOutcomeKind.Finished:
      if (candidate.reason !== PlayerFinishReason.GoalContact) {
        throw new Error("Finished player outcome reason is invalid.");
      }

      return;
    case PlayerOutcomeKind.DefeatedAndFinished:
      if (!isPlayerDefeatReason(candidate.defeatReason)) {
        throw new Error(
          "Defeated-and-finished player outcome defeat reason is invalid.",
        );
      }

      if (candidate.finishReason !== PlayerFinishReason.GoalContact) {
        throw new Error(
          "Defeated-and-finished player outcome finish reason is invalid.",
        );
      }

      return;
    default:
      throw new Error(
        `Invalid player outcome state: ${String(candidate.kind)}`,
      );
  }
}

export function resolvePlayerOutcomeState(
  previousOutcome: PlayerOutcomeState,
  levelContacts: LevelContactState,
  enemyInteractions: EnemyInteractionState,
  playerVitality: PlayerVitalityState,
  fellIntoPit: boolean,
  levelTimerExpired: boolean,
): PlayerOutcomeState {
  assertValidPlayerOutcomeState(previousOutcome);
  assertValidPlayerVitalityState(playerVitality);

  switch (previousOutcome.kind) {
    case PlayerOutcomeKind.Active:
      return resolveActivePlayerOutcomeState(
        levelContacts,
        enemyInteractions,
        playerVitality,
        fellIntoPit,
        levelTimerExpired,
      );
    case PlayerOutcomeKind.Defeated:
    case PlayerOutcomeKind.Finished:
    case PlayerOutcomeKind.DefeatedAndFinished:
      return previousOutcome;
    default: {
      const invalidOutcome: never = previousOutcome;
      throw new Error(
        `Invalid player outcome state: ${String(invalidOutcome)}`,
      );
    }
  }
}

function resolveActivePlayerOutcomeState(
  levelContacts: LevelContactState,
  enemyInteractions: EnemyInteractionState,
  playerVitality: PlayerVitalityState,
  fellIntoPit: boolean,
  levelTimerExpired: boolean,
): PlayerOutcomeState {
  if (fellIntoPit) {
    return {
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.PitContact,
    };
  }

  if (levelTimerExpired) {
    return {
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.TimeUp,
    };
  }

  const defeatReason = makePlayerDefeatReason(
    levelContacts,
    enemyInteractions,
    playerVitality,
  );

  if (defeatReason !== undefined && levelContacts.goal) {
    return {
      kind: PlayerOutcomeKind.DefeatedAndFinished,
      defeatReason,
      finishReason: PlayerFinishReason.GoalContact,
    };
  }

  if (defeatReason !== undefined) {
    return {
      kind: PlayerOutcomeKind.Defeated,
      reason: defeatReason,
    };
  }

  if (levelContacts.goal) {
    return {
      kind: PlayerOutcomeKind.Finished,
      reason: PlayerFinishReason.GoalContact,
    };
  }

  return makeActivePlayerOutcomeState();
}

function isPlayerDefeatReason(value: unknown): value is PlayerDefeatReason {
  return (
    value === PlayerDefeatReason.HazardContact ||
    value === PlayerDefeatReason.EnemyContact ||
    value === PlayerDefeatReason.HazardAndEnemyContact ||
    value === PlayerDefeatReason.PitContact ||
    value === PlayerDefeatReason.TimeUp
  );
}

function makePlayerDefeatReason(
  levelContacts: LevelContactState,
  enemyInteractions: EnemyInteractionState,
  playerVitality: PlayerVitalityState,
): PlayerDefeatReason | undefined {
  const enemyContacted =
    enemyInteractions.contactedEnemyEntityIds.length > 0 &&
    doesEnemyContactDefeatPlayer(playerVitality);

  if (levelContacts.hazard && enemyContacted) {
    return PlayerDefeatReason.HazardAndEnemyContact;
  }

  if (levelContacts.hazard) {
    return PlayerDefeatReason.HazardContact;
  }

  if (enemyContacted) {
    return PlayerDefeatReason.EnemyContact;
  }

  return undefined;
}

import type { Brand } from "../domain/brand";
import type { EntityId } from "../domain/identifiers";
import type { DomainResult } from "../domain/result";
import { fail, succeed } from "../domain/result";
import { makeFrameIndex } from "../domain/units";
import type { FrameIndex } from "../domain/units";
import type { ValidationError } from "../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../domain/validation-error";
import { EnemySideContactSide } from "./enemy-contact-response";

export type RecoveryFrameCount = Brand<number, "RecoveryFrameCount">;

export enum PlayerVitalityKind {
  Small = "small",
  Powered = "powered",
  Fire = "fire",
  Recovering = "recovering",
}

// Powered (super) and Fire are both the enlarged form: same collider, both
// survive a hit (dropping to small), both break bricks. Only Fire throws
// fireballs. A second power-up promotes Powered -> Fire, like the original.
export function isEnlargedPlayerVitalityKind(
  kind: PlayerVitalityKind,
): boolean {
  return (
    kind === PlayerVitalityKind.Powered || kind === PlayerVitalityKind.Fire
  );
}

export type PlayerVitalityState =
  | {
      readonly kind: PlayerVitalityKind.Small;
    }
  | {
      readonly kind: PlayerVitalityKind.Powered;
    }
  | {
      readonly kind: PlayerVitalityKind.Fire;
    }
  | {
      readonly kind: PlayerVitalityKind.Recovering;
      readonly sourceEnemyEntityId: EntityId;
      readonly contactSide: EnemySideContactSide;
      readonly startFrameIndex: FrameIndex;
      readonly remainingKnockbackFrames: RecoveryFrameCount;
      readonly remainingInvulnerabilityFrames: RecoveryFrameCount;
    };

export function makeInitialPlayerVitalityState(): PlayerVitalityState {
  return {
    kind: PlayerVitalityKind.Small,
  };
}

export function makePoweredPlayerVitalityState(): PlayerVitalityState {
  return {
    kind: PlayerVitalityKind.Powered,
  };
}

export function makeFirePlayerVitalityState(): PlayerVitalityState {
  return {
    kind: PlayerVitalityKind.Fire,
  };
}

export function applyPowerUpCollectionToVitality(
  playerVitality: PlayerVitalityState,
  newlyCollectedPowerUpCount: number,
): PlayerVitalityState {
  assertValidPlayerVitalityState(playerVitality);

  if (newlyCollectedPowerUpCount <= 0) {
    return playerVitality;
  }

  switch (playerVitality.kind) {
    case PlayerVitalityKind.Small:
      return {
        kind: PlayerVitalityKind.Powered,
      };
    case PlayerVitalityKind.Powered:
      // A second power-up promotes super Mario to fire Mario.
      return {
        kind: PlayerVitalityKind.Fire,
      };
    case PlayerVitalityKind.Fire:
    case PlayerVitalityKind.Recovering:
      return playerVitality;
    default: {
      const invalidVitality: never = playerVitality;
      throw new Error(
        `Invalid player vitality state: ${String(invalidVitality)}`,
      );
    }
  }
}

export function makeRecoveryFrameCount(
  value: number,
  path: string,
): DomainResult<RecoveryFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.RecoveryFrameCountInvalid,
        `${path} must be a non-negative safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as RecoveryFrameCount);
}

export function assertValidPlayerVitalityState(
  playerVitality: unknown,
): asserts playerVitality is PlayerVitalityState {
  if (typeof playerVitality !== "object" || playerVitality === null) {
    throw new Error("Player vitality state must be an object.");
  }

  const candidate = playerVitality as Readonly<Record<string, unknown>>;

  switch (candidate.kind) {
    case "small":
    case "powered":
    case "fire":
      return;
    case "recovering":
      assertValidRecoveringPlayerVitalityState(candidate);
      return;
    default:
      throw new Error(
        `Invalid player vitality state: ${String(candidate.kind)}`,
      );
  }
}

export function doesEnemyContactDefeatPlayer(
  playerVitality: PlayerVitalityState,
): boolean {
  assertValidPlayerVitalityState(playerVitality);

  switch (playerVitality.kind) {
    case PlayerVitalityKind.Small:
      return true;
    case PlayerVitalityKind.Powered:
    case PlayerVitalityKind.Fire:
    case PlayerVitalityKind.Recovering:
      return false;
    default: {
      const invalidVitality: never = playerVitality;
      throw new Error(
        `Invalid player vitality state: ${String(invalidVitality)}`,
      );
    }
  }
}

function assertValidRecoveringPlayerVitalityState(
  candidate: Readonly<Record<string, unknown>>,
): void {
  if (typeof candidate.sourceEnemyEntityId !== "string") {
    throw new Error("playerVitality.sourceEnemyEntityId must be a string.");
  }

  if (
    candidate.contactSide !== EnemySideContactSide.Left &&
    candidate.contactSide !== EnemySideContactSide.Right
  ) {
    throw new Error("playerVitality.contactSide must be left or right.");
  }

  if (typeof candidate.startFrameIndex !== "number") {
    throw new Error("playerVitality.startFrameIndex must be a number.");
  }

  const startFrameIndexResult = makeFrameIndex(
    candidate.startFrameIndex,
    "playerVitality.startFrameIndex",
  );
  if (!startFrameIndexResult.ok) {
    throw new Error(
      "playerVitality.startFrameIndex must be a valid frame index.",
    );
  }

  requireRecoveryFrameCount(
    candidate.remainingKnockbackFrames,
    "playerVitality.remainingKnockbackFrames",
  );
  const remainingInvulnerabilityFrames = requireRecoveryFrameCount(
    candidate.remainingInvulnerabilityFrames,
    "playerVitality.remainingInvulnerabilityFrames",
  );

  if (remainingInvulnerabilityFrames === 0) {
    throw new Error(
      "playerVitality.remainingInvulnerabilityFrames must be positive while recovering.",
    );
  }
}

function requireRecoveryFrameCount(
  value: unknown,
  path: string,
): RecoveryFrameCount {
  if (typeof value !== "number") {
    throw new Error(`${path} must be a number.`);
  }

  const result = makeRecoveryFrameCount(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid recovery frame count.`);
  }

  return result.value;
}

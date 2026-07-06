import { EnemySideContactSide } from "./enemy-contact-response";
import { describe, expect, it } from "vitest";

import {
  assertValidPlayerVitalityState,
  doesEnemyContactDefeatPlayer,
  makePoweredPlayerVitalityState,
  makeRecoveryFrameCount,
  makeInitialPlayerVitalityState,
  PlayerVitalityKind,
  type PlayerVitalityState,
} from "./player-vitality";
import type { EntityId } from "../domain/identifiers";
import type { FrameIndex } from "../domain/units";
import { ValidationErrorCode } from "../domain/validation-error";

describe("player vitality state", () => {
  function recoveryFrameCount(value: number) {
    const result = makeRecoveryFrameCount(value, "test.recoveryFrameCount");

    if (!result.ok) {
      throw new Error("Expected recovery frame count to validate.");
    }

    return result.value;
  }

  it("creates the initial small-player vitality state", () => {
    expect(makeInitialPlayerVitalityState()).toEqual({
      kind: "small",
    });
  });

  it("makes enemy contact defeat the small player", () => {
    expect(doesEnemyContactDefeatPlayer(makeInitialPlayerVitalityState())).toBe(
      true,
    );
  });

  it("creates a powered-player vitality state that survives enemy contact", () => {
    expect(makePoweredPlayerVitalityState()).toEqual({
      kind: "powered",
    });
    expect(doesEnemyContactDefeatPlayer(makePoweredPlayerVitalityState())).toBe(
      false,
    );
  });

  it("accepts a recovering vitality state that survives enemy contact", () => {
    const recoveringVitality: PlayerVitalityState = {
      kind: PlayerVitalityKind.Recovering,
      sourceEnemyEntityId: "beetle-1" as EntityId,
      contactSide: EnemySideContactSide.Right,
      startFrameIndex: 10 as FrameIndex,
      remainingKnockbackFrames: recoveryFrameCount(18),
      remainingInvulnerabilityFrames: recoveryFrameCount(120),
    };

    expect(() =>
      assertValidPlayerVitalityState(recoveringVitality),
    ).not.toThrow();
    expect(doesEnemyContactDefeatPlayer(recoveringVitality)).toBe(false);
  });

  it("creates branded recovery frame counts", () => {
    expect(makeRecoveryFrameCount(18, "recovery.knockbackFrames")).toEqual({
      ok: true,
      value: 18,
    });
  });

  it("rejects negative recovery frame counts", () => {
    expect(makeRecoveryFrameCount(-1, "recovery.knockbackFrames")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.RecoveryFrameCountInvalid,
          message:
            "recovery.knockbackFrames must be a non-negative safe integer.",
          path: "recovery.knockbackFrames",
        },
      ],
    });
  });

  it("rejects malformed vitality state", () => {
    expect(() => assertValidPlayerVitalityState({ kind: "unknown" })).toThrow(
      "Invalid player vitality state: unknown",
    );
  });

  it("rejects recovering vitality without positive invulnerability frames", () => {
    expect(() =>
      assertValidPlayerVitalityState({
        kind: "recovering",
        sourceEnemyEntityId: "beetle-1",
        contactSide: EnemySideContactSide.Left,
        startFrameIndex: 10,
        remainingKnockbackFrames: 0,
        remainingInvulnerabilityFrames: 0,
      }),
    ).toThrow(
      "playerVitality.remainingInvulnerabilityFrames must be positive while recovering.",
    );
  });
});

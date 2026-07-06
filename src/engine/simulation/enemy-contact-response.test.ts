import { EnemySideContactSide } from "./enemy-contact-response";
import { describe, expect, it } from "vitest";

import type { EntityId } from "../domain/identifiers";
import type { FrameIndex } from "../domain/units";
import {
  assertValidEnemyContactResponseState,
  makeEmptyEnemyContactResponseState,
  resolveEnemyContactResponseState,
} from "./enemy-contact-response";
import {
  makeInitialEnemyMotionState,
  type EnemyMotionState,
} from "./enemy-motion";
import {
  makeEmptyEnemyInteractionState,
  type EnemyInteractionState,
} from "./enemy-interaction";
import { firstAuthoredLevelSpec, playerAt } from "./level-test-support";
import { initialMovementConstants } from "./movement-model";

function initialEnemyMotion(): EnemyMotionState {
  return makeInitialEnemyMotionState(
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );
}

function contactedEnemyState(entityId: EntityId): EnemyInteractionState {
  return {
    contactedEnemyEntityIds: [entityId],
    defeatedEnemyEntityIds: [],
    shelledEnemyEntityIds: [],
    nudgedShellEnemyEntityIds: [],
    nudgedShellDirectionByEntityId: new Map(),
    currentStompChainCount: 0,
    cumulativeStompScore: 0 as EnemyInteractionState["cumulativeStompScore"],
    cumulativeStompChainExtraLives: 0,
    cumulativeInvincibilityScore:
      0 as EnemyInteractionState["cumulativeInvincibilityScore"],
    cumulativeShellKillScore:
      0 as EnemyInteractionState["cumulativeShellKillScore"],
    currentShellKillChainCount: 0,
    cumulativeShellKillExtraLives: 0,
    cumulativeProjectileKillScore:
      0 as EnemyInteractionState["cumulativeProjectileKillScore"],
  };
}

const responseFrameIndex = 7 as FrameIndex;

describe("enemy contact response", () => {
  it("creates an explicit empty response state", () => {
    expect(makeEmptyEnemyContactResponseState()).toEqual({
      kind: "none",
    });
  });

  it("records right-side contact with leftward response velocity", () => {
    expect(
      resolveEnemyContactResponseState(
        playerAt({
          x: 88,
          y: 56,
        }),
        initialEnemyMotion(),
        contactedEnemyState("beetle-1" as EntityId),
        firstAuthoredLevelSpec(),
        responseFrameIndex,
        initialMovementConstants.enemySideContactKnockbackSpeed,
      ),
    ).toEqual({
      kind: "side-contact",
      enemyEntityId: "beetle-1",
      contactSide: EnemySideContactSide.Right,
      frameIndex: responseFrameIndex,
      velocity: {
        x: -150,
      },
    });
  });

  it("records left-side contact with rightward response velocity", () => {
    expect(
      resolveEnemyContactResponseState(
        playerAt({
          x: 110,
          y: 56,
        }),
        initialEnemyMotion(),
        contactedEnemyState("beetle-1" as EntityId),
        firstAuthoredLevelSpec(),
        responseFrameIndex,
        initialMovementConstants.enemySideContactKnockbackSpeed,
      ),
    ).toEqual({
      kind: "side-contact",
      enemyEntityId: "beetle-1",
      contactSide: EnemySideContactSide.Left,
      frameIndex: responseFrameIndex,
      velocity: {
        x: 150,
      },
    });
  });

  it("returns no response without enemy contact", () => {
    expect(
      resolveEnemyContactResponseState(
        playerAt({
          x: 16,
          y: 56,
        }),
        initialEnemyMotion(),
        makeEmptyEnemyInteractionState(),
        firstAuthoredLevelSpec(),
        responseFrameIndex,
        initialMovementConstants.enemySideContactKnockbackSpeed,
      ),
    ).toEqual({
      kind: "none",
    });
  });

  it("rejects malformed response kind", () => {
    expect(() =>
      assertValidEnemyContactResponseState(
        {
          kind: "fallback",
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow("Enemy contact response kind must be none or side-contact.");
  });

  it("rejects malformed contact sides", () => {
    expect(() =>
      assertValidEnemyContactResponseState(
        {
          kind: "side-contact",
          enemyEntityId: "beetle-1",
          contactSide: "top",
          frameIndex: 1,
          velocity: {
            x: -150,
          },
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow("enemyContactResponse.contactSide must be left or right.");
  });

  it("rejects response entity ids that do not reference enemy actors", () => {
    expect(() =>
      assertValidEnemyContactResponseState(
        {
          kind: "side-contact",
          enemyEntityId: "shard-1",
          contactSide: EnemySideContactSide.Right,
          frameIndex: 1,
          velocity: {
            x: -150,
          },
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow(
      "Enemy contact response entity id shard-1 must reference an enemy actor.",
    );
  });
});

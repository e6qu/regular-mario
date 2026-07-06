import { PlayerDefeatReason } from "./player-outcome";
import { EnemySideContactSide } from "./enemy-contact-response";
import { describe, expect, it } from "vitest";

import {
  assertValidPlayerOutcomeState,
  makeActivePlayerOutcomeState,
  PlayerFinishReason,
  PlayerOutcomeKind,
  resolvePlayerOutcomeState as resolvePlayerOutcomeStateCore,
  type PlayerOutcomeState,
} from "./player-outcome";
import type { EntityId } from "../domain/identifiers";
import {
  makeEmptyEnemyInteractionState,
  type EnemyInteractionState,
} from "./enemy-interaction";
import {
  makeInitialPlayerVitalityState,
  makePoweredPlayerVitalityState,
  makeRecoveryFrameCount,
  PlayerVitalityKind,
  type PlayerVitalityState,
} from "./player-vitality";
import type { FrameIndex } from "../domain/units";

function recoveryFrameCount(value: number) {
  const result = makeRecoveryFrameCount(value, "test.recoveryFrameCount");

  if (!result.ok) {
    throw new Error("Expected recovery frame count to validate.");
  }

  return result.value;
}

const emptyEnemyInteractions = makeEmptyEnemyInteractionState();
const smallPlayerVitality = makeInitialPlayerVitalityState();
const poweredPlayerVitality = makePoweredPlayerVitalityState();
const recoveringPlayerVitality: PlayerVitalityState = {
  kind: PlayerVitalityKind.Recovering,
  sourceEnemyEntityId: "beetle-1" as EntityId,
  contactSide: EnemySideContactSide.Left,
  startFrameIndex: 1 as FrameIndex,
  remainingKnockbackFrames: recoveryFrameCount(0),
  remainingInvulnerabilityFrames: recoveryFrameCount(30),
};
const enemyContactInteractions: EnemyInteractionState = {
  ...makeEmptyEnemyInteractionState(),
  contactedEnemyEntityIds: ["beetle-1" as EntityId],
};
const enemyDefeatedInteractions: EnemyInteractionState = {
  ...makeEmptyEnemyInteractionState(),
  defeatedEnemyEntityIds: ["beetle-1" as EntityId],
};

function resolvePlayerOutcomeState(
  previousOutcome: PlayerOutcomeState,
  levelContacts: { readonly hazard: boolean; readonly goal: boolean },
  enemyInteractions: EnemyInteractionState,
  playerVitality: PlayerVitalityState,
  fellIntoPit: boolean,
): PlayerOutcomeState {
  return resolvePlayerOutcomeStateCore(
    previousOutcome,
    levelContacts,
    enemyInteractions,
    playerVitality,
    fellIntoPit,
    false,
  );
}

describe("player outcome state", () => {
  it("creates an explicit active outcome", () => {
    expect(makeActivePlayerOutcomeState()).toEqual({
      kind: "active",
    });
  });

  it("stays active without level contacts", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: false,
        },
        emptyEnemyInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "active",
    });
  });

  it("records defeat from hazard contact", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: true,
          goal: false,
        },
        emptyEnemyInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "defeated",
      reason: PlayerDefeatReason.HazardContact,
    });
  });

  it("records defeat from enemy contact", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: false,
        },
        enemyContactInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "defeated",
      reason: PlayerDefeatReason.EnemyContact,
    });
  });

  it("keeps powered enemy contact active", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: false,
        },
        enemyContactInteractions,
        poweredPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "active",
    });
  });

  it("keeps recovering enemy contact active while invulnerable", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: false,
        },
        enemyContactInteractions,
        recoveringPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "active",
    });
  });

  it("stays active after enemy defeat without harmful enemy contact", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: false,
        },
        enemyDefeatedInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "active",
    });
  });

  it("records simultaneous hazard and enemy defeat as a first-class reason", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: true,
          goal: false,
        },
        enemyContactInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "defeated",
      reason: PlayerDefeatReason.HazardAndEnemyContact,
    });
  });

  it("records finish from goal contact", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: true,
        },
        emptyEnemyInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "finished",
      reason: PlayerFinishReason.GoalContact,
    });
  });

  it("records simultaneous defeat and finish as a first-class outcome", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: true,
          goal: true,
        },
        emptyEnemyInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "defeated-and-finished",
      defeatReason: PlayerDefeatReason.HazardContact,
      finishReason: PlayerFinishReason.GoalContact,
    });
  });

  it("records simultaneous enemy defeat and finish as a first-class outcome", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: true,
        },
        enemyContactInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "defeated-and-finished",
      defeatReason: PlayerDefeatReason.EnemyContact,
      finishReason: PlayerFinishReason.GoalContact,
    });
  });

  it("records simultaneous hazard, enemy, and finish as a first-class outcome", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: true,
          goal: true,
        },
        enemyContactInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toEqual({
      kind: "defeated-and-finished",
      defeatReason: PlayerDefeatReason.HazardAndEnemyContact,
      finishReason: PlayerFinishReason.GoalContact,
    });
  });

  it("preserves a non-active outcome", () => {
    const defeatedOutcome: PlayerOutcomeState = {
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.HazardContact,
    };

    expect(
      resolvePlayerOutcomeState(
        defeatedOutcome,
        {
          hazard: false,
          goal: true,
        },
        enemyContactInteractions,
        smallPlayerVitality,
        false,
      ),
    ).toBe(defeatedOutcome);
  });

  it("rejects malformed known outcome variants", () => {
    const malformedOutcome = {
      kind: "defeated",
    } as unknown as PlayerOutcomeState;

    expect(() => assertValidPlayerOutcomeState(malformedOutcome)).toThrow(
      "Defeated player outcome reason is invalid.",
    );
  });

  it("defeats the player with a pit-contact reason when they have fallen into a pit", () => {
    expect(
      resolvePlayerOutcomeState(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: false,
        },
        emptyEnemyInteractions,
        smallPlayerVitality,
        true,
      ),
    ).toEqual({
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.PitContact,
    });
  });

  it("defeats the player with a time-up reason when the level timer expires", () => {
    expect(
      resolvePlayerOutcomeStateCore(
        makeActivePlayerOutcomeState(),
        {
          hazard: false,
          goal: false,
        },
        emptyEnemyInteractions,
        smallPlayerVitality,
        false,
        true,
      ),
    ).toEqual({
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.TimeUp,
    });
  });
});

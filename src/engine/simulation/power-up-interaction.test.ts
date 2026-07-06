import { ActorRole } from "../domain/level-spec";
import { describe, expect, it } from "vitest";

import type { LevelSpec } from "../domain/level-spec";
import {
  applyPowerUpCollectionToVitality,
  makeInitialPlayerVitalityState,
  makeFirePlayerVitalityState,
  makePoweredPlayerVitalityState,
} from "./player-vitality";
import {
  assertValidPowerUpInteractionState,
  makeEmptyPowerUpInteractionState,
  resolvePowerUpInteractionState,
} from "./power-up-interaction";
import {
  firstAuthoredLevelSpec,
  playerAt,
  powerUpRouteLevelSpec,
} from "./level-test-support";

describe("power-up interactions", () => {
  it("creates an explicit empty power-up interaction state", () => {
    expect(makeEmptyPowerUpInteractionState()).toEqual({
      collectedPowerUpEntityIds: [],
    });
  });

  it("collects an authored power-up actor overlapped by the player", () => {
    expect(
      resolvePowerUpInteractionState(
        playerAt({
          x: 32,
          y: 56,
        }),
        powerUpRouteLevelSpec(),
        [],
        makeEmptyPowerUpInteractionState(),
      ),
    ).toEqual({
      state: {
        collectedPowerUpEntityIds: ["spark-1"],
      },
      newlyCollectedPowerUpEntityIds: ["spark-1"],
    });
  });

  it("does not collect non-power-up actors overlapped by the player", () => {
    expect(
      resolvePowerUpInteractionState(
        playerAt({
          x: 96,
          y: 56,
        }),
        firstAuthoredLevelSpec(),
        [],
        makeEmptyPowerUpInteractionState(),
      ),
    ).toEqual({
      state: {
        collectedPowerUpEntityIds: [],
      },
      newlyCollectedPowerUpEntityIds: [],
    });
  });

  it("preserves previous power-up collections without duplicating entity ids", () => {
    const levelSpec = powerUpRouteLevelSpec();
    const collected = resolvePowerUpInteractionState(
      playerAt({
        x: 32,
        y: 56,
      }),
      levelSpec,
      [],
      makeEmptyPowerUpInteractionState(),
    );

    expect(
      resolvePowerUpInteractionState(
        playerAt({
          x: 32,
          y: 56,
        }),
        levelSpec,
        [],
        collected.state,
      ),
    ).toEqual({
      state: {
        collectedPowerUpEntityIds: ["spark-1"],
      },
      newlyCollectedPowerUpEntityIds: [],
    });
  });

  it("rejects duplicated collected power-up entity ids", () => {
    expect(() =>
      assertValidPowerUpInteractionState(
        {
          collectedPowerUpEntityIds: ["spark-1", "spark-1"],
        },
        powerUpRouteLevelSpec(),
      ),
    ).toThrow("Collected power-up entity id spark-1 is duplicated.");
  });

  it("rejects collected entity ids that do not reference power-up actors", () => {
    expect(() =>
      assertValidPowerUpInteractionState(
        {
          collectedPowerUpEntityIds: ["gate-1"],
        },
        powerUpRouteLevelSpec(),
      ),
    ).toThrow(
      "Collected power-up entity id gate-1 must reference a power-up actor.",
    );
  });

  it("rejects malformed collected power-up entity id collections", () => {
    expect(() =>
      assertValidPowerUpInteractionState(
        {
          collectedPowerUpEntityIds: ["spark_1"],
        },
        powerUpRouteLevelSpec(),
      ),
    ).toThrow("Collected power-up entity id at index 0 is invalid.");
  });

  it("transitions small vitality to powered when a power-up is collected", () => {
    expect(
      applyPowerUpCollectionToVitality(makeInitialPlayerVitalityState(), 1),
    ).toEqual(makePoweredPlayerVitalityState());
  });

  it("promotes powered vitality to fire when a second power-up is collected", () => {
    expect(
      applyPowerUpCollectionToVitality(makePoweredPlayerVitalityState(), 1),
    ).toEqual(makeFirePlayerVitalityState());
  });

  it("leaves fire vitality unchanged when a further power-up is collected", () => {
    expect(
      applyPowerUpCollectionToVitality(makeFirePlayerVitalityState(), 1),
    ).toEqual(makeFirePlayerVitalityState());
  });

  it("leaves vitality unchanged when no power-up is collected", () => {
    expect(
      applyPowerUpCollectionToVitality(makeInitialPlayerVitalityState(), 0),
    ).toEqual(makeInitialPlayerVitalityState());
  });

  it("fails loudly when a validated actor is missing its definition at runtime", () => {
    const levelSpec = powerUpRouteLevelSpec();
    const corruptedLevelSpec = {
      ...levelSpec,
      actorDefinitions: levelSpec.actorDefinitions.filter(
        (actorDefinition) => actorDefinition.actorId !== "spark-cap",
      ),
    } as LevelSpec;

    expect(() =>
      resolvePowerUpInteractionState(
        playerAt({
          x: 32,
          y: 56,
        }),
        corruptedLevelSpec,
        [],
        makeEmptyPowerUpInteractionState(),
      ),
    ).toThrow("Validated level actor is missing an actor definition.");
  });

  it("fails loudly when a validated actor definition is duplicated at runtime", () => {
    const levelSpec = powerUpRouteLevelSpec();
    const duplicatedLevelSpec = {
      ...levelSpec,
      actorDefinitions: [
        ...levelSpec.actorDefinitions,
        {
          actorId: "spark-cap",
          role: ActorRole.Enemy,
        },
      ],
    } as LevelSpec;

    expect(() =>
      resolvePowerUpInteractionState(
        playerAt({
          x: 32,
          y: 56,
        }),
        duplicatedLevelSpec,
        [],
        makeEmptyPowerUpInteractionState(),
      ),
    ).toThrow("Validated level actor definition spark-cap is duplicated.");
  });
});

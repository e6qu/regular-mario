import { describe, expect, it } from "vitest";

import { makeEntityId } from "../domain/identifiers";
import { ActorRole, makeLevelSpec } from "../domain/level-spec";
import { initialMovementConstants } from "../simulation/movement-model";
import { makeInitialSimulationState } from "../simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../simulation/simulation-units";
import { enemyGauntletRouteLevelInput } from "./enemy-gauntlet-route-level";

function entityId(value: string) {
  const result = makeEntityId(value, "test.entityId");
  if (!result.ok) {
    throw new Error("Expected valid test entity id.");
  }
  return result.value;
}

describe("enemy gauntlet route level", () => {
  it("validates as a playable level", () => {
    expect(makeLevelSpec(enemyGauntletRouteLevelInput).ok).toBe(true);
  });

  it("produces an initial simulation state", () => {
    const levelSpecResult = makeLevelSpec(enemyGauntletRouteLevelInput);

    if (!levelSpecResult.ok) {
      throw new Error("Expected enemy gauntlet route level to validate.");
    }

    const stateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpecResult.value,
      initialMovementConstants,
    );

    expect(stateResult.ok).toBe(true);
  });

  it("combines flying, chasing, and armored enemy roles", () => {
    const levelSpecResult = makeLevelSpec(enemyGauntletRouteLevelInput);

    if (!levelSpecResult.ok) {
      throw new Error("Expected enemy gauntlet route level to validate.");
    }

    const roles = new Set(
      levelSpecResult.value.actorDefinitions.map(
        (definition) => definition.role,
      ),
    );

    expect(roles.has(ActorRole.FlyingEnemy)).toBe(true);
    expect(roles.has(ActorRole.ChasingEnemy)).toBe(true);
    expect(roles.has(ActorRole.ArmoredEnemy)).toBe(true);
  });

  it("adds pacing overrides for the chase and armored encounters", () => {
    const levelSpecResult = makeLevelSpec(enemyGauntletRouteLevelInput);

    if (!levelSpecResult.ok) {
      throw new Error("Expected enemy gauntlet route level to validate.");
    }

    expect(
      levelSpecResult.value.enemyPatrolSpeedByEntityId.get(
        entityId("hunter-1"),
      ),
    ).toBe(48);
    expect(
      levelSpecResult.value.enemyPatrolSpeedByEntityId.get(entityId("crab-1")),
    ).toBe(32);
  });

  it("keeps the first floor lane free of unavoidable thorn contact", () => {
    const levelSpecResult = makeLevelSpec(enemyGauntletRouteLevelInput);

    if (!levelSpecResult.ok) {
      throw new Error("Expected enemy gauntlet route level to validate.");
    }

    expect(levelSpecResult.value.tiles[5]?.[8]).toBe("sky");
    expect(levelSpecResult.value.tiles[5]?.[19]).toBe("thorn");
  });
});

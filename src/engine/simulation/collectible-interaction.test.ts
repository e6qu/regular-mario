import { ActorRole } from "../domain/level-spec";
import type { TileCoordinate } from "../domain/units";
import { describe, expect, it } from "vitest";

import type { LevelSpec } from "../domain/level-spec";
import {
  assertValidCollectibleInteractionState,
  makeEmptyCollectibleInteractionState,
  resolveCollectibleInteractionState,
} from "./collectible-interaction";
import {
  firstAuthoredLevelSpec,
  interactiveCoinBlockLevelSpec,
  interactiveExtraLifeBlockLevelSpec,
  playerAt,
} from "./level-test-support";
import {
  makeEmptySpawnedActorsState,
  resolveSpawnedActorsState,
  type SpawnedActorsState,
} from "./interactive-block-state";

function spawnedCoinActors(): {
  readonly levelSpec: LevelSpec;
  readonly spawnedActors: SpawnedActorsState;
} {
  const levelSpec = interactiveCoinBlockLevelSpec();
  const spawnedActors = resolveSpawnedActorsState(
    makeEmptySpawnedActorsState(),
    levelSpec,
    [{ x: 2 as TileCoordinate, y: 4 as TileCoordinate }],
  );

  return { levelSpec, spawnedActors };
}

function spawnedExtraLifeActors(): {
  readonly levelSpec: LevelSpec;
  readonly spawnedActors: SpawnedActorsState;
} {
  const levelSpec = interactiveExtraLifeBlockLevelSpec();
  const spawnedActors = resolveSpawnedActorsState(
    makeEmptySpawnedActorsState(),
    levelSpec,
    [{ x: 2 as TileCoordinate, y: 4 as TileCoordinate }],
  );

  return { levelSpec, spawnedActors };
}

describe("collectible interactions", () => {
  it("creates an explicit empty collectible interaction state", () => {
    expect(makeEmptyCollectibleInteractionState()).toEqual({
      collectedCoinEntityIds: [],
      collectedItemEntityIds: [],
      collectedExtraLifeEntityIds: [],
    });
  });

  it("collects an authored item actor overlapped by the player", () => {
    expect(
      resolveCollectibleInteractionState(
        playerAt({
          x: 64,
          y: 16,
        }),
        firstAuthoredLevelSpec(),
        [],
        makeEmptyCollectibleInteractionState(),
      ),
    ).toEqual({
      collectedCoinEntityIds: [],
      collectedItemEntityIds: ["shard-1"],
      collectedExtraLifeEntityIds: [],
    });
  });

  it("collects a spawned coin actor separately from generic items", () => {
    const { levelSpec, spawnedActors } = spawnedCoinActors();

    expect(
      resolveCollectibleInteractionState(
        playerAt({
          x: 32,
          y: 48,
        }),
        levelSpec,
        spawnedActors.spawnedActors,
        makeEmptyCollectibleInteractionState(),
      ),
    ).toEqual({
      collectedCoinEntityIds: ["spawned-2-4"],
      collectedItemEntityIds: [],
      collectedExtraLifeEntityIds: [],
    });
  });

  it("collects a spawned extra-life actor separately from coins and items", () => {
    const { levelSpec, spawnedActors } = spawnedExtraLifeActors();

    expect(
      resolveCollectibleInteractionState(
        playerAt({
          x: 32,
          y: 56,
        }),
        levelSpec,
        spawnedActors.spawnedActors,
        makeEmptyCollectibleInteractionState(),
      ),
    ).toEqual({
      collectedCoinEntityIds: [],
      collectedItemEntityIds: [],
      collectedExtraLifeEntityIds: ["spawned-2-4"],
    });
  });

  it("collects a block-spawned coin immediately without requiring player overlap", () => {
    const { levelSpec, spawnedActors } = spawnedCoinActors();

    expect(
      resolveCollectibleInteractionState(
        playerAt({
          x: 112,
          y: 48,
        }),
        levelSpec,
        spawnedActors.spawnedActors,
        makeEmptyCollectibleInteractionState(),
      ),
    ).toEqual({
      collectedCoinEntityIds: ["spawned-2-4"],
      collectedItemEntityIds: [],
      collectedExtraLifeEntityIds: [],
    });
  });

  it("does not collect non-item actors overlapped by the player", () => {
    expect(
      resolveCollectibleInteractionState(
        playerAt({
          x: 96,
          y: 56,
        }),
        firstAuthoredLevelSpec(),
        [],
        makeEmptyCollectibleInteractionState(),
      ),
    ).toEqual({
      collectedCoinEntityIds: [],
      collectedItemEntityIds: [],
      collectedExtraLifeEntityIds: [],
    });
  });

  it("preserves previous item collections without duplicating entity ids", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const collectedState = resolveCollectibleInteractionState(
      playerAt({
        x: 64,
        y: 16,
      }),
      levelSpec,
      [],
      makeEmptyCollectibleInteractionState(),
    );

    expect(
      resolveCollectibleInteractionState(
        playerAt({
          x: 64,
          y: 16,
        }),
        levelSpec,
        [],
        collectedState,
      ),
    ).toEqual({
      collectedCoinEntityIds: [],
      collectedItemEntityIds: ["shard-1"],
      collectedExtraLifeEntityIds: [],
    });
  });

  it("rejects duplicated collected item entity ids", () => {
    expect(() =>
      assertValidCollectibleInteractionState(
        {
          collectedCoinEntityIds: [],
          collectedItemEntityIds: ["shard-1", "shard-1"],
          collectedExtraLifeEntityIds: [],
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow("Collected item entity id shard-1 is duplicated.");
  });

  it("rejects collected entity ids that do not reference item actors", () => {
    expect(() =>
      assertValidCollectibleInteractionState(
        {
          collectedCoinEntityIds: [],
          collectedItemEntityIds: ["beetle-1"],
          collectedExtraLifeEntityIds: [],
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow(
      "Collected item entity id beetle-1 must reference an item actor.",
    );
  });

  it("rejects malformed collected item entity id collections", () => {
    expect(() =>
      assertValidCollectibleInteractionState(
        {
          collectedCoinEntityIds: [],
          collectedItemEntityIds: ["shard_1"],
          collectedExtraLifeEntityIds: [],
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow("Collected item entity id at index 0 is invalid.");
  });

  it("fails loudly when a validated actor is missing its definition at runtime", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const corruptedLevelSpec = {
      ...levelSpec,
      actorDefinitions: levelSpec.actorDefinitions.filter(
        (actorDefinition) => actorDefinition.actorId !== "star-shard",
      ),
    } as LevelSpec;

    expect(() =>
      resolveCollectibleInteractionState(
        playerAt({
          x: 64,
          y: 16,
        }),
        corruptedLevelSpec,
        [],
        makeEmptyCollectibleInteractionState(),
      ),
    ).toThrow("Validated level actor is missing an actor definition.");
  });

  it("fails loudly when a validated actor definition is duplicated at runtime", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const duplicatedLevelSpec = {
      ...levelSpec,
      actorDefinitions: [
        ...levelSpec.actorDefinitions,
        {
          actorId: "star-shard",
          role: ActorRole.Enemy,
        },
      ],
    } as LevelSpec;

    expect(() =>
      resolveCollectibleInteractionState(
        playerAt({
          x: 64,
          y: 16,
        }),
        duplicatedLevelSpec,
        [],
        makeEmptyCollectibleInteractionState(),
      ),
    ).toThrow("Validated level actor definition star-shard is duplicated.");
  });
});

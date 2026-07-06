import { describe, expect, it } from "vitest";

import type { EntityId } from "../domain/identifiers";
import {
  ActorRole,
  makeLevelSpec,
  TileCollisionKind,
  type LevelSpec,
} from "../domain/level-spec";
import {
  applyInvincibilityEnemyDefeats,
  authoredInvincibilityFrameCount,
  assertValidPlayerInvincibilityState,
  makeEmptyPlayerInvincibilityState,
  makeInvincibilityFrameCount,
  resolvePlayerInvincibilityState,
} from "./player-invincibility";
import { makeEmptyEnemyInteractionState } from "./enemy-interaction";
import { playerAt } from "./level-test-support";
import { EnemyPatrolDirection } from "./enemy-motion";

function invincibilityLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 4,
    heightTiles: 4,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "sky", collision: TileCollisionKind.Empty },
      { tileId: "ground", collision: TileCollisionKind.Solid },
    ],
    actorDefinitions: [
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      {
        actorId: "invincibility",
        role: ActorRole.InvincibilityPowerUp,
      },
      { actorId: "enemy", role: ActorRole.Enemy },
      { actorId: "exit", role: ActorRole.Exit },
    ],
    tiles: [
      ["sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky"],
      ["ground", "ground", "ground", "ground"],
    ],
    actors: [
      { entityId: "runner", actorId: "runner-start", x: 0, y: 2 },
      { entityId: "invincible-1", actorId: "invincibility", x: 1, y: 2 },
      { entityId: "enemy-1", actorId: "enemy", x: 2, y: 2 },
      { entityId: "exit-1", actorId: "exit", x: 3, y: 2 },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected invincibility level to validate.");
  }

  return result.value;
}

function frameCount(value: number) {
  const result = makeInvincibilityFrameCount(value, "test.remainingFrames");

  if (!result.ok) {
    throw new Error("Expected test invincibility frame count to validate.");
  }

  return result.value;
}

describe("player invincibility state", () => {
  it("creates an explicit empty state", () => {
    expect(makeEmptyPlayerInvincibilityState()).toEqual({
      collectedInvincibilityEntityIds: [],
      remainingFrames: 0,
    });
  });

  it("collects an invincibility power-up and resets the authored timer", () => {
    expect(
      resolvePlayerInvincibilityState(
        playerAt({ x: 16, y: 32 }),
        invincibilityLevelSpec(),
        [],
        makeEmptyPlayerInvincibilityState(),
      ),
    ).toEqual({
      collectedInvincibilityEntityIds: ["invincible-1"],
      remainingFrames: authoredInvincibilityFrameCount,
    });
  });

  it("ticks an active timer down when no new pickup is collected", () => {
    expect(
      resolvePlayerInvincibilityState(
        playerAt({ x: 0, y: 32 }),
        invincibilityLevelSpec(),
        [],
        {
          collectedInvincibilityEntityIds: [],
          remainingFrames: frameCount(3),
        },
      ),
    ).toEqual({
      collectedInvincibilityEntityIds: [],
      remainingFrames: 2,
    });
  });

  it("rejects collected ids that are not invincibility actors", () => {
    expect(() =>
      assertValidPlayerInvincibilityState(
        {
          collectedInvincibilityEntityIds: ["enemy-1"],
          remainingFrames: 0,
        },
        invincibilityLevelSpec(),
      ),
    ).toThrow(
      "Collected invincibility entity id enemy-1 must reference an invincibility-power-up actor.",
    );
  });

  it("turns contacted enemies into defeated enemies while active", () => {
    expect(
      applyInvincibilityEnemyDefeats(
        {
          ...makeEmptyEnemyInteractionState(),
          contactedEnemyEntityIds: ["enemy-1" as EntityId],
          nudgedShellEnemyEntityIds: ["enemy-1" as EntityId],
          nudgedShellDirectionByEntityId: new Map([
            ["enemy-1" as EntityId, EnemyPatrolDirection.Right],
          ]),
        },
        {
          collectedInvincibilityEntityIds: ["invincible-1" as EntityId],
          remainingFrames: frameCount(1),
        },
      ),
    ).toEqual({
      ...makeEmptyEnemyInteractionState(),
      defeatedEnemyEntityIds: ["enemy-1"],
      cumulativeInvincibilityScore: 100,
    });
  });
});

import { describe, expect, it } from "vitest";

import { makeEntityId } from "../domain/identifiers";
import type { CollectibleInteractionState } from "./collectible-interaction";
import type { EnemyInteractionState } from "./enemy-interaction";
import {
  coinsPerExtraLife,
  computeCoinExtraLives,
  computeCollectibleScore,
  computeEnemyScore,
  computeTimeBonusScore,
  computeTotalScore,
  emptyScore,
  scorePerBreakableBlock,
  scorePerCoin,
  scorePerInvincibilityKill,
  scorePerItem,
  scorePerProjectileKill,
  scorePerTimeBonusDisplayUnit,
  timeBonusFramesPerDisplayUnit,
} from "./game-score";

function entityId(prefix: string, index: number) {
  const result = makeEntityId(`${prefix}-${index + 1}`, "test.entityId");
  if (!result.ok) {
    throw new Error("Expected valid test entity id.");
  }
  return result.value;
}

function collectiblesWith(input: {
  readonly itemCount: number;
  readonly coinCount: number;
}): CollectibleInteractionState {
  const collectedItemEntityIds = Array.from(
    { length: input.itemCount },
    (_, index) => entityId("shard", index),
  );
  const collectedCoinEntityIds = Array.from(
    { length: input.coinCount },
    (_, index) => entityId("coin", index),
  );

  return {
    collectedCoinEntityIds,
    collectedItemEntityIds,
    collectedExtraLifeEntityIds: [],
  };
}

describe("game score", () => {
  it("scores zero collectibles as zero", () => {
    expect(
      computeCollectibleScore(collectiblesWith({ itemCount: 0, coinCount: 0 })),
    ).toBe(emptyScore());
  });

  it("scores each collected item at the authored per-item value", () => {
    expect(
      computeCollectibleScore(collectiblesWith({ itemCount: 1, coinCount: 0 })),
    ).toBe(scorePerItem);
    expect(
      computeCollectibleScore(collectiblesWith({ itemCount: 3, coinCount: 0 })),
    ).toBe(scorePerItem * 3);
  });

  it("scores each collected coin at the authored per-coin value", () => {
    expect(
      computeCollectibleScore(collectiblesWith({ itemCount: 0, coinCount: 1 })),
    ).toBe(scorePerCoin);
    expect(
      computeCollectibleScore(collectiblesWith({ itemCount: 0, coinCount: 3 })),
    ).toBe(scorePerCoin * 3);
  });
});

function enemiesWith(cumulativeStompScore: number): EnemyInteractionState {
  return {
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: [],
    shelledEnemyEntityIds: [],
    nudgedShellEnemyEntityIds: [],
    nudgedShellDirectionByEntityId: new Map(),
    currentStompChainCount: 0,
    cumulativeStompScore:
      cumulativeStompScore as EnemyInteractionState["cumulativeStompScore"],
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

function enemiesWithInvincibilityScore(
  invincibilityScore: number,
): EnemyInteractionState {
  return {
    ...enemiesWith(0),
    cumulativeStompChainExtraLives: 0,
    cumulativeInvincibilityScore:
      invincibilityScore as EnemyInteractionState["cumulativeInvincibilityScore"],
  };
}

function enemiesWithShellKillScore(
  shellKillScore: number,
): EnemyInteractionState {
  return {
    ...enemiesWith(0),
    cumulativeShellKillScore:
      shellKillScore as EnemyInteractionState["cumulativeShellKillScore"],
  };
}

function enemiesWithProjectileKillScore(
  projectileKillScore: number,
): EnemyInteractionState {
  return {
    ...enemiesWith(0),
    cumulativeProjectileKillScore:
      projectileKillScore as EnemyInteractionState["cumulativeProjectileKillScore"],
  };
}

describe("enemy score", () => {
  it("returns zero when no enemies have been stomped", () => {
    expect(computeEnemyScore(enemiesWith(0))).toBe(emptyScore());
  });

  it("returns the cumulative stomp score as computed by the interaction state", () => {
    expect(computeEnemyScore(enemiesWith(300))).toBe(300);
    expect(computeEnemyScore(enemiesWith(1000))).toBe(1000);
  });

  it("includes projectile kill score in the total enemy score", () => {
    expect(
      computeEnemyScore(enemiesWithProjectileKillScore(scorePerProjectileKill)),
    ).toBe(scorePerProjectileKill);
    expect(
      computeEnemyScore({
        ...enemiesWith(100),
        cumulativeProjectileKillScore: (2 *
          scorePerProjectileKill) as EnemyInteractionState["cumulativeProjectileKillScore"],
      }),
    ).toBe(100 + 2 * scorePerProjectileKill);
  });

  it("includes shell kill score in the total enemy score", () => {
    expect(computeEnemyScore(enemiesWithShellKillScore(100))).toBe(100);
    expect(
      computeEnemyScore({
        ...enemiesWith(200),
        cumulativeShellKillScore:
          300 as EnemyInteractionState["cumulativeShellKillScore"],
      }),
    ).toBe(200 + 300);
  });

  it("includes invincibility kill score in the total enemy score", () => {
    expect(
      computeEnemyScore(
        enemiesWithInvincibilityScore(scorePerInvincibilityKill),
      ),
    ).toBe(scorePerInvincibilityKill);
    expect(
      computeEnemyScore({
        ...enemiesWith(300),
        cumulativeStompChainExtraLives: 0,
        cumulativeInvincibilityScore: (2 *
          scorePerInvincibilityKill) as EnemyInteractionState["cumulativeInvincibilityScore"],
      }),
    ).toBe(300 + 2 * scorePerInvincibilityKill);
  });
});

describe("time bonus score", () => {
  it("returns zero when remainingFrames is undefined", () => {
    expect(computeTimeBonusScore(undefined)).toBe(0);
  });

  it("returns 50 per display unit at exactly one display unit of frames", () => {
    expect(computeTimeBonusScore(timeBonusFramesPerDisplayUnit)).toBe(
      scorePerTimeBonusDisplayUnit,
    );
  });

  it("floors partial display units", () => {
    expect(computeTimeBonusScore(timeBonusFramesPerDisplayUnit - 1)).toBe(0);
    expect(computeTimeBonusScore(timeBonusFramesPerDisplayUnit + 1)).toBe(
      scorePerTimeBonusDisplayUnit,
    );
  });

  it("scales linearly with display units", () => {
    expect(computeTimeBonusScore(5 * timeBonusFramesPerDisplayUnit)).toBe(
      5 * scorePerTimeBonusDisplayUnit,
    );
  });
});

describe("coin extra lives", () => {
  it("returns zero when no milestone is crossed", () => {
    expect(computeCoinExtraLives(0, coinsPerExtraLife - 1)).toBe(0);
    expect(computeCoinExtraLives(50, 99)).toBe(0);
  });

  it("returns 1 when the first milestone is crossed", () => {
    expect(computeCoinExtraLives(0, coinsPerExtraLife)).toBe(1);
    expect(computeCoinExtraLives(99, coinsPerExtraLife)).toBe(1);
  });

  it("returns 2 when two milestones are crossed in one step", () => {
    expect(computeCoinExtraLives(0, 2 * coinsPerExtraLife)).toBe(2);
  });

  it("does not award lives for coins already past a milestone", () => {
    expect(
      computeCoinExtraLives(coinsPerExtraLife, 2 * coinsPerExtraLife - 1),
    ).toBe(0);
  });
});

describe("total score", () => {
  it("sums collectible and enemy scores", () => {
    expect(
      computeTotalScore(
        collectiblesWith({ itemCount: 1, coinCount: 1 }),
        enemiesWith(100),
      ),
    ).toBe(scorePerItem + scorePerCoin + 100);
  });

  it("returns zero when nothing is collected or defeated", () => {
    expect(
      computeTotalScore(
        collectiblesWith({ itemCount: 0, coinCount: 0 }),
        enemiesWith(0),
      ),
    ).toBe(emptyScore());
  });

  it("includes time bonus in the total", () => {
    expect(
      computeTotalScore(
        collectiblesWith({ itemCount: 0, coinCount: 0 }),
        enemiesWith(0),
        (3 * scorePerTimeBonusDisplayUnit) as ReturnType<typeof emptyScore>,
      ),
    ).toBe(3 * scorePerTimeBonusDisplayUnit);
  });

  it("includes breakable block score in the total", () => {
    expect(
      computeTotalScore(
        collectiblesWith({ itemCount: 0, coinCount: 0 }),
        enemiesWith(0),
        0 as ReturnType<typeof emptyScore>,
        (2 * scorePerBreakableBlock) as ReturnType<typeof emptyScore>,
      ),
    ).toBe(2 * scorePerBreakableBlock);
  });
});

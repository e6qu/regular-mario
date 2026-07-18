import type { Brand } from "../domain/brand";
import type { CollectibleInteractionState } from "./collectible-interaction";
import type { EnemyInteractionState } from "./enemy-interaction";

export type Score = Brand<number, "Score">;

export const scorePerItem: Score = 100 as Score;
// Every coin awards 200 points, as in the original.
export const scorePerCoin: Score = 200 as Score;
export const scorePerInvincibilityKill: Score = 100 as Score;
export const scorePerProjectileKill: Score = 200 as Score;
export const scorePerBreakableBlock: Score = 50 as Score;
export const scorePerBulletBillStomp: Score = 1000 as Score;
export const coinsPerExtraLife = 100;

export function computeCoinExtraLives(
  previousCoinCount: number,
  currentCoinCount: number,
): number {
  return (
    Math.floor(currentCoinCount / coinsPerExtraLife) -
    Math.floor(previousCoinCount / coinsPerExtraLife)
  );
}
export const timeBonusFramesPerDisplayUnit = 24;
export const scorePerTimeBonusDisplayUnit: Score = 50 as Score;

export function emptyScore(): Score {
  return 0 as Score;
}

export function computeCollectibleScore(
  collectibles: CollectibleInteractionState,
): Score {
  return (collectibles.collectedItemEntityIds.length * scorePerItem +
    collectibles.collectedCoinEntityIds.length * scorePerCoin) as Score;
}

export function computeEnemyScore(enemies: EnemyInteractionState): Score {
  return (enemies.cumulativeStompScore +
    enemies.cumulativeInvincibilityScore +
    enemies.cumulativeShellKillScore +
    enemies.cumulativeProjectileKillScore) as Score;
}

export function computeTimeBonusScore(
  remainingFrames: number | undefined,
): Score {
  if (remainingFrames === undefined) {
    return 0 as Score;
  }

  return (Math.floor(remainingFrames / timeBonusFramesPerDisplayUnit) *
    scorePerTimeBonusDisplayUnit) as Score;
}

// The ROM awards 1000 points for a mushroom, flower or star pickup (the
// 1-up gives a life instead of points).
const scorePerPowerUp = 1000;

export function computeTotalScore(
  collectibles: CollectibleInteractionState,
  enemies: EnemyInteractionState,
  timeBonusScore: Score = 0 as Score,
  breakableBlockScore: Score = 0 as Score,
  bulletBillStompScore: Score = 0 as Score,
  goalHeightScore: Score = 0 as Score,
  powerUpCollectionCount = 0,
): Score {
  return (computeCollectibleScore(collectibles) +
    computeEnemyScore(enemies) +
    powerUpCollectionCount * scorePerPowerUp +
    timeBonusScore +
    breakableBlockScore +
    bulletBillStompScore +
    goalHeightScore) as Score;
}

// The flagpole grab awards by height, like the original's 100/400/800/2000/
// 5000 bands from the base to the very top.
const goalHeightScoreBands: readonly (readonly [number, number])[] = [
  [4, 5000],
  [6, 2000],
  [8, 800],
  [10, 400],
];

// Each victory firework is worth 500, exactly as in the original.
export const fireworksScorePerBurst = 500 as Score;

// SMB launches end-of-level fireworks by the ones digit of the remaining timer
// as it is displayed: a 1 fires one, a 3 fires three, a 6 fires six, and any
// other digit fires none.
export function fireworksCountForDisplayTime(displayTime: number): number {
  const onesDigit = ((Math.trunc(displayTime) % 10) + 10) % 10;
  if (onesDigit === 1) {
    return 1;
  }
  if (onesDigit === 3) {
    return 3;
  }
  if (onesDigit === 6) {
    return 6;
  }
  return 0;
}

export function scoreForGoalContactHeight(
  playerTopPixelY: number,
  tileSizePixels: number,
): Score {
  const row = Math.floor(playerTopPixelY / tileSizePixels);
  for (const [maxRow, points] of goalHeightScoreBands) {
    if (row <= maxRow) {
      return points as Score;
    }
  }
  return 100 as Score;
}

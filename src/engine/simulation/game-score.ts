import type { Brand } from "../domain/brand";
import type { CollectibleInteractionState } from "./collectible-interaction";
import type { EnemyInteractionState } from "./enemy-interaction";

export type Score = Brand<number, "Score">;

export const scorePerItem: Score = 100 as Score;
export const scorePerCoin: Score = 100 as Score;
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

export function computeTotalScore(
  collectibles: CollectibleInteractionState,
  enemies: EnemyInteractionState,
  timeBonusScore: Score = 0 as Score,
  breakableBlockScore: Score = 0 as Score,
  bulletBillStompScore: Score = 0 as Score,
): Score {
  return (computeCollectibleScore(collectibles) +
    computeEnemyScore(enemies) +
    timeBonusScore +
    breakableBlockScore +
    bulletBillStompScore) as Score;
}

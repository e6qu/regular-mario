import { makeLevelSpec, type LevelSpec } from "../engine/domain/level-spec";
import { publicOriginalLevels } from "../engine/levels/public-level-catalog";

export type BundledMultiplayerLevel = {
  readonly id: string;
  readonly label: string;
  readonly levelSpec: LevelSpec;
};

function requireBundledLevelSpec(
  source: Parameters<typeof makeLevelSpec>[0],
): LevelSpec {
  const parsed = makeLevelSpec(source);
  if (!parsed.ok) {
    throw new Error("A bundled multiplayer level did not validate.");
  }
  return parsed.value;
}

export const bundledMultiplayerLevels: readonly BundledMultiplayerLevel[] =
  publicOriginalLevels.map((level) => ({
    id: level.id,
    label: level.label,
    levelSpec: requireBundledLevelSpec(level.levelInput),
  }));

export function requireBundledMultiplayerLevel(
  levelId: string,
): BundledMultiplayerLevel {
  const level = bundledMultiplayerLevels.find(
    (candidate) => candidate.id === levelId,
  );
  if (level === undefined) {
    throw new Error("Requested multiplayer level is not bundled.");
  }
  return level;
}

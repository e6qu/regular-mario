import { makeLevelSpec, type LevelSpec } from "../engine/domain/level-spec";
import { cavernRouteLevelInput } from "../engine/levels/cavern-route-level";
import { coinBlockRouteLevelInput } from "../engine/levels/coin-block-route-level";
import { multiplayerOnboardingLevelInput } from "../engine/levels/multiplayer-onboarding-level";

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

export const bundledMultiplayerLevels: readonly BundledMultiplayerLevel[] = [
  {
    id: "multiplayer-onboarding",
    label: "Party Runway",
    levelSpec: requireBundledLevelSpec(multiplayerOnboardingLevelInput),
  },
  {
    id: "coin-block-route",
    label: "Coinbox Crossing",
    levelSpec: requireBundledLevelSpec(coinBlockRouteLevelInput),
  },
  {
    id: "cavern-route",
    label: "Cavern Route",
    levelSpec: requireBundledLevelSpec(cavernRouteLevelInput),
  },
];

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

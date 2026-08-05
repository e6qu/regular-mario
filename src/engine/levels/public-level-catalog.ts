import type { LevelSpecInput } from "../domain/level-spec";
import { enemyStompRouteLevelInput } from "./enemy-stomp-route-level";
import { firstAuthoredLevelInput } from "./first-authored-level";
import { pipeRouteLevelInput } from "./pipe-route-level";

/**
 * The public course catalogue is an engine-level contract. Both local play
 * and multiplayer consume these exact inputs; online play has no substitute
 * maps or decorative collision-only routes.
 */
export type PublicOriginalLevel = {
  readonly id: "first-authored" | "pipe-route" | "enemy-stomp-route";
  readonly label: string;
  readonly levelInput: LevelSpecInput;
};

export const publicOriginalLevels: readonly PublicOriginalLevel[] = [
  {
    id: "first-authored",
    label: "First Authored Route",
    levelInput: firstAuthoredLevelInput,
  },
  {
    id: "pipe-route",
    label: "Pipe Route",
    levelInput: pipeRouteLevelInput,
  },
  {
    id: "enemy-stomp-route",
    label: "Enemy Stomp Route",
    levelInput: enemyStompRouteLevelInput,
  },
];

export function requirePublicOriginalLevel(
  levelId: string,
): PublicOriginalLevel {
  const level = publicOriginalLevels.find(
    (candidate) => candidate.id === levelId,
  );
  if (level === undefined) {
    throw new Error("Requested level is not in the public original catalogue.");
  }
  return level;
}

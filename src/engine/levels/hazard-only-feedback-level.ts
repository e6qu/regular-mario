import type { LevelSpecInput } from "../domain/level-spec";
import { firstAuthoredLevelInput } from "./first-authored-level";

const combinedRouteEnemyEntityId = "beetle-1";

export const hazardOnlyFeedbackLevelInput: LevelSpecInput = {
  ...firstAuthoredLevelInput,
  actors: firstAuthoredLevelInput.actors.filter(
    (actor) => actor.entityId !== combinedRouteEnemyEntityId,
  ),
};

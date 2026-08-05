import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { multiplayerOnboardingLevelInput } from "./multiplayer-onboarding-level";

describe("multiplayerOnboardingLevelInput", () => {
  it("is a full, valid shared course with a safe opening screen", () => {
    const result = makeLevelSpec(multiplayerOnboardingLevelInput);

    expect(result.ok).toBe(true);
    expect(multiplayerOnboardingLevelInput.widthTiles).toBe(64);
    expect(multiplayerOnboardingLevelInput.tiles[2]?.slice(6, 9)).toEqual([
      "stone",
      "stone",
      "stone",
    ]);
    expect(
      multiplayerOnboardingLevelInput.actors.filter(
        (actor) => actor.actorId === "beetle",
      ),
    ).toHaveLength(0);
    expect(multiplayerOnboardingLevelInput.actors).toContainEqual({
      entityId: "gate-1",
      actorId: "open-gate",
      x: 56,
      y: 4,
    });
  });
});

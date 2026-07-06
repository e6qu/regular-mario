import { describe, expect, it } from "vitest";

import {
  detectLevelContactState,
  hasPlayerFallenIntoPit,
  makeEmptyLevelContactState,
} from "./level-contact";
import {
  exitActorWithoutGoalTileLevelSpec,
  firstAuthoredLevelSpec,
  playerAt,
  solidHazardBlockLevelSpec,
} from "./level-test-support";

describe("level tile contacts", () => {
  it("creates an explicit empty contact state", () => {
    expect(makeEmptyLevelContactState()).toEqual({
      hazard: false,
      goal: false,
    });
  });

  it("detects no authored tile contacts for the initial player area", () => {
    expect(
      detectLevelContactState(
        playerAt({
          x: 16,
          y: 56,
        }),
        firstAuthoredLevelSpec(),
      ),
    ).toEqual({
      hazard: false,
      goal: false,
    });
  });

  it("detects overlap with an authored hazard tile", () => {
    expect(
      detectLevelContactState(
        playerAt({
          x: 90,
          y: 56,
        }),
        firstAuthoredLevelSpec(),
      ),
    ).toEqual({
      hazard: true,
      goal: false,
    });
  });

  it("detects overlap with a solid hazard tile as hazard contact", () => {
    expect(
      detectLevelContactState(
        playerAt({
          x: 32,
          y: 64,
        }),
        solidHazardBlockLevelSpec(),
      ),
    ).toEqual({
      hazard: true,
      goal: false,
    });
  });

  it("detects overlap with an authored goal tile", () => {
    expect(
      detectLevelContactState(
        playerAt({
          x: 480,
          y: 32,
        }),
        firstAuthoredLevelSpec(),
      ),
    ).toEqual({
      hazard: false,
      goal: true,
    });
  });

  it("does not treat exit actor overlap as goal tile contact", () => {
    expect(
      detectLevelContactState(
        playerAt({
          x: 32,
          y: 64,
        }),
        exitActorWithoutGoalTileLevelSpec(),
      ),
    ).toEqual({
      hazard: false,
      goal: false,
    });
  });

  it("detects a player that has fallen below the level bottom as a pit", () => {
    expect(
      hasPlayerFallenIntoPit(
        playerAt({
          x: 16,
          y: 96,
        }),
        firstAuthoredLevelSpec(),
      ),
    ).toBe(true);
  });

  it("does not treat an in-bounds player as fallen into a pit", () => {
    expect(
      hasPlayerFallenIntoPit(
        playerAt({
          x: 16,
          y: 56,
        }),
        firstAuthoredLevelSpec(),
      ),
    ).toBe(false);
  });
});

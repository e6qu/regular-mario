import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { enemyStompRouteLevelInput } from "./enemy-stomp-route-level";
import { firstAuthoredLevelInput } from "./first-authored-level";
import { hazardOnlyFeedbackLevelInput } from "./hazard-only-feedback-level";

const prohibitedSourceTerms = ["mario", "super mario"];

function collectFixtureStrings(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectFixtureStrings(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap((entry) =>
      collectFixtureStrings(entry),
    );
  }

  return [];
}

describe("firstAuthoredLevelInput", () => {
  it("validates through the LevelSpec constructor", () => {
    const result = makeLevelSpec(firstAuthoredLevelInput);

    expect(result.ok).toBe(true);
  });

  it("has a tile grid matching its declared width and height", () => {
    expect(firstAuthoredLevelInput.tiles).toHaveLength(
      firstAuthoredLevelInput.heightTiles,
    );

    for (const tileRow of firstAuthoredLevelInput.tiles) {
      expect(tileRow).toHaveLength(firstAuthoredLevelInput.widthTiles);
    }
  });

  it("keeps actor y positions inside the declared height", () => {
    for (const actor of firstAuthoredLevelInput.actors) {
      expect(actor.y).toBeLessThan(firstAuthoredLevelInput.heightTiles);
    }
  });

  it("contains only authored source-neutral identifiers", () => {
    const fixtureText = collectFixtureStrings(firstAuthoredLevelInput)
      .join("\n")
      .toLocaleLowerCase("en-US");

    for (const prohibitedSourceTerm of prohibitedSourceTerms) {
      expect(fixtureText).not.toContain(prohibitedSourceTerm);
    }
  });
});

describe("hazardOnlyFeedbackLevelInput", () => {
  it("validates through the LevelSpec constructor", () => {
    const result = makeLevelSpec(hazardOnlyFeedbackLevelInput);

    expect(result.ok).toBe(true);
  });

  it("keeps the authored hazard route without the overlapping enemy actor", () => {
    const entityIds = hazardOnlyFeedbackLevelInput.actors.map(
      (actor) => actor.entityId,
    );

    expect(entityIds).not.toContain("beetle-1");
    expect(entityIds).toContain("beetle-2");
    expect(hazardOnlyFeedbackLevelInput.tiles[4]?.[5]).toBe("thorn");
  });

  it("contains only authored source-neutral identifiers", () => {
    const fixtureText = collectFixtureStrings(hazardOnlyFeedbackLevelInput)
      .join("\n")
      .toLocaleLowerCase("en-US");

    for (const prohibitedSourceTerm of prohibitedSourceTerms) {
      expect(fixtureText).not.toContain(prohibitedSourceTerm);
    }
  });
});

describe("enemyStompRouteLevelInput", () => {
  it("validates through the LevelSpec constructor", () => {
    const result = makeLevelSpec(enemyStompRouteLevelInput);

    expect(result.ok).toBe(true);
  });

  it("keeps the authored route enemy on a flat route", () => {
    const entityIds = enemyStompRouteLevelInput.actors.map(
      (actor) => actor.entityId,
    );

    expect(entityIds).toContain("beetle-1");
    expect(
      enemyStompRouteLevelInput.actors.find(
        (actor) => actor.entityId === "beetle-1",
      )?.x,
    ).toBe(7);
    expect(enemyStompRouteLevelInput.tiles[4]?.[5]).toBe("sky");
  });

  it("contains only authored source-neutral identifiers", () => {
    const fixtureText = collectFixtureStrings(enemyStompRouteLevelInput)
      .join("\n")
      .toLocaleLowerCase("en-US");

    for (const prohibitedSourceTerm of prohibitedSourceTerms) {
      expect(fixtureText).not.toContain(prohibitedSourceTerm);
    }
  });
});

import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { importedVglcRouteLevelInput } from "./imported-vglc-route-level";

describe("imported VGLC route level", () => {
  it("validates through LevelSpec", () => {
    expect(makeLevelSpec(importedVglcRouteLevelInput).ok).toBe(true);
  });

  it("is sourced from the VGLC text importer with authored dimensions", () => {
    expect(importedVglcRouteLevelInput.widthTiles).toBe(8);
    expect(importedVglcRouteLevelInput.heightTiles).toBe(6);
    expect(importedVglcRouteLevelInput.tileSizePixels).toBe(16);
  });

  it("includes exactly one player-start and at least one exit", () => {
    const roles = importedVglcRouteLevelInput.actorDefinitions.map(
      (definition) => definition.role,
    );
    expect(roles.filter((role) => role === "player-start").length).toBe(1);
    expect(
      roles.filter((role) => role === "exit").length,
    ).toBeGreaterThanOrEqual(1);
  });
});

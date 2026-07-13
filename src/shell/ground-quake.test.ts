import { describe, expect, it } from "vitest";

import {
  hardLandingDropTiles,
  resolveGroundQuake,
} from "./ground-quake";

describe("resolveGroundQuake", () => {
  it("does not quake for a routine platforming drop (at or below the threshold)", () => {
    expect(resolveGroundQuake(0)).toBeNull();
    expect(resolveGroundQuake(hardLandingDropTiles - 1)).toBeNull();
    expect(resolveGroundQuake(hardLandingDropTiles)).toBeNull();
    // A negative "drop" (landing higher than takeoff) never quakes.
    expect(resolveGroundQuake(-3)).toBeNull();
  });

  it("quakes only for a genuine plunge past the threshold", () => {
    const quake = resolveGroundQuake(hardLandingDropTiles + 1);
    expect(quake).not.toBeNull();
    expect(quake?.intensity).toBeGreaterThan(0);
    expect(quake?.durationMs).toBeGreaterThan(0);
  });

  it("scales up with the drop and saturates for very deep falls", () => {
    const shallow = resolveGroundQuake(hardLandingDropTiles + 1);
    const deep = resolveGroundQuake(hardLandingDropTiles + 4);
    const abyss = resolveGroundQuake(500);
    if (shallow === null || deep === null || abyss === null) {
      throw new Error("expected quakes for drops past the threshold");
    }
    expect(deep.intensity).toBeGreaterThan(shallow.intensity);
    expect(deep.durationMs).toBeGreaterThan(shallow.durationMs);
    // A bottomless fall clamps to the same (max) strength as any other very deep
    // fall — no runaway intensity.
    const alsoBottomless = resolveGroundQuake(1000);
    if (alsoBottomless === null) {
      throw new Error("expected a quake for a very deep fall");
    }
    expect(abyss.intensity).toBeCloseTo(alsoBottomless.intensity);
    expect(abyss.durationMs).toBeCloseTo(alsoBottomless.durationMs);
  });
});

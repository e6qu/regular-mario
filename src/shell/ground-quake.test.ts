import { describe, expect, it } from "vitest";

import {
  hardLandingDropTiles,
  resolveGroundQuake,
} from "./ground-quake";

describe("resolveGroundQuake", () => {
  it("does not quake for a fall of two blocks or fewer", () => {
    expect(resolveGroundQuake(0)).toBeNull();
    expect(resolveGroundQuake(1)).toBeNull();
    expect(resolveGroundQuake(hardLandingDropTiles)).toBeNull();
    // A negative "drop" (landing higher than takeoff) never quakes.
    expect(resolveGroundQuake(-3)).toBeNull();
  });

  it("quakes for a fall of more than two blocks", () => {
    const quake = resolveGroundQuake(3);
    expect(quake).not.toBeNull();
    expect(quake?.intensity).toBeGreaterThan(0);
    expect(quake?.durationMs).toBeGreaterThan(0);
  });

  it("scales up with the drop and saturates for very deep falls", () => {
    const shallow = resolveGroundQuake(3);
    const deep = resolveGroundQuake(7);
    const abyss = resolveGroundQuake(50);
    if (shallow === null || deep === null || abyss === null) {
      throw new Error("expected quakes for drops past the threshold");
    }
    expect(deep.intensity).toBeGreaterThan(shallow.intensity);
    expect(deep.durationMs).toBeGreaterThan(shallow.durationMs);
    // A bottomless fall clamps to the same strength as the saturation depth.
    const saturated = resolveGroundQuake(8);
    if (saturated === null) {
      throw new Error("expected a quake at the saturation depth");
    }
    expect(abyss.intensity).toBeCloseTo(saturated.intensity);
    expect(abyss.durationMs).toBeCloseTo(saturated.durationMs);
  });
});

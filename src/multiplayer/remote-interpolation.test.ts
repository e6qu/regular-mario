import { describe, expect, it } from "vitest";

import { makeRemotePlayerInterpolator } from "./remote-interpolation";

describe("remote player interpolation", () => {
  it("renders remote positions between two authoritative snapshots", () => {
    const interpolator = makeRemotePlayerInterpolator(100);
    interpolator.push([{ playerId: "ren", x: 10, y: 20 }], 0);
    interpolator.push([{ playerId: "ren", x: 30, y: 40 }], 100);
    expect(interpolator.positions(150).get("ren")).toEqual({
      playerId: "ren",
      x: 20,
      y: 30,
    });
  });

  it("clamps to the latest authoritative position after a long delay", () => {
    const interpolator = makeRemotePlayerInterpolator(100);
    interpolator.push([{ playerId: "ren", x: 10, y: 20 }], 0);
    interpolator.push([{ playerId: "ren", x: 30, y: 40 }], 100);
    expect(interpolator.positions(500).get("ren")?.x).toBe(30);
  });
});

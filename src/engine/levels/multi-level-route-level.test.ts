import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { multiLevelRouteSequence } from "./multi-level-route-level";

describe("multi-level route sequence", () => {
  it("contains at least two validated levels", () => {
    expect(multiLevelRouteSequence.length).toBeGreaterThanOrEqual(2);

    for (const levelInput of multiLevelRouteSequence) {
      const result = makeLevelSpec(levelInput);
      expect(result.ok).toBe(true);
    }
  });
});

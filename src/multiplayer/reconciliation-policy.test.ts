import { describe, expect, it } from "vitest";

import { shouldReconcilePrediction } from "./reconciliation-policy";

describe("multiplayer reconciliation policy", () => {
  it("waits for acknowledgement of an immediately predicted input edge", () => {
    expect(shouldReconcilePrediction(false, false, 4, 5, 0)).toBe(false);
    expect(shouldReconcilePrediction(false, false, 5, 5, 0)).toBe(true);
  });

  it("does not reset prediction for later held-input heartbeats", () => {
    expect(shouldReconcilePrediction(false, false, 9, 5, 5)).toBe(false);
  });

  it("always accepts a required baseline or player lifecycle transition", () => {
    expect(shouldReconcilePrediction(true, false, 0, -1, -1)).toBe(true);
    expect(shouldReconcilePrediction(false, true, 0, -1, -1)).toBe(true);
  });
});

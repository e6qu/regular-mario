import { describe, expect, it } from "vitest";

import {
  applyStateDelta,
  makeStateDelta,
  stateTransportEncodedBytes,
} from "./state-transport";

describe("state transport", () => {
  it("round-trips nested state without mutating its baseline", () => {
    const baseline = {
      frame: 10,
      players: [
        { x: 16, y: 64 },
        { x: 144, y: 64 },
      ],
      entities: { coin: { active: true } },
    };
    const target = {
      frame: 11,
      players: [
        { x: 18, y: 64 },
        { x: 147, y: 63 },
      ],
      entities: { coin: { active: false }, shard: { active: true } },
    };

    const delta = makeStateDelta(baseline, target);

    expect(applyStateDelta(baseline, delta)).toEqual(target);
    expect(baseline.players[0]?.x).toBe(16);
  });

  it("replaces changed-length arrays and reports their encoded byte size", () => {
    const delta = makeStateDelta({ players: [{ x: 1 }] }, { players: [] });

    expect(applyStateDelta({ players: [{ x: 1 }] }, delta)).toEqual({
      players: [],
    });
    expect(stateTransportEncodedBytes(delta)).toBeGreaterThan(0);
  });
});

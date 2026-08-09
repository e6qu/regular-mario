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

  it("copy-on-write applies only changed branches", () => {
    const baseline = {
      frame: 10,
      moving: { player: { x: 16, y: 64 } },
      unchangedWorld: { tiles: [1, 2, 3] },
    };
    const target = {
      ...baseline,
      frame: 11,
      moving: { player: { x: 18, y: 64 } },
    };

    const applied = applyStateDelta(baseline, makeStateDelta(baseline, target));

    expect(applied).toEqual(target);
    expect(applied.unchangedWorld).toBe(baseline.unchangedWorld);
    expect(applied.moving).not.toBe(baseline.moving);
  });
});

describe("state delta path compression", () => {
  // A delta spends most of its bytes saying *where* a change goes, not what it
  // is: measured on a live two-player game, 69 bytes of addressing carried 9
  // bytes of data. Changes arrive depth-first, so neighbours share nearly all
  // of their path and only the tail needs sending.
  it("sends only the part of a path that differs from the change before", () => {
    const baseline = {
      enemies: [
        { position: { x: 1, y: 2 }, alive: true },
        { position: { x: 5, y: 6 }, alive: true },
      ],
    };
    const target = {
      enemies: [
        { position: { x: 3, y: 4 }, alive: true },
        { position: { x: 7, y: 6 }, alive: true },
      ],
    };

    const delta = makeStateDelta(baseline, target);

    // x and y of the same enemy share ["enemies", 0, "position"].
    expect(delta.changes).toEqual([
      { p: ["enemies", 0, "position", "x"], v: 3 },
      { s: 3, p: ["y"], v: 4 },
      { s: 1, p: [1, "position", "x"], v: 7 },
    ]);
    // And it still round-trips.
    expect(applyStateDelta(baseline, delta)).toEqual(target);
  });

  it("refuses a delta that reuses more path than exists", () => {
    expect(() =>
      applyStateDelta({ a: 1 }, { changes: [{ s: 2, p: ["b"], v: 1 }] }),
    ).toThrow("reuses more path parts");
  });
});

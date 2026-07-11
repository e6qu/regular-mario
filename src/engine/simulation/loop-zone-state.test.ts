import { describe, expect, it } from "vitest";

import type { LevelSpecInput, LoopZoneInput } from "../domain/level-spec";
import { makeEmptyLoopZoneState, resolveLoopZones } from "./loop-zone-state";
import {
  makeFlatLevelInput,
  makePlayerAt,
  requireMechanicsLevelSpec,
} from "./mechanics-test-support";

function makeLoopLevelInput(
  loopZones: readonly LoopZoneInput[],
): LevelSpecInput {
  return makeFlatLevelInput(160, { loopZones });
}

const requireLevelSpec = requireMechanicsLevelSpec;
const playerAt = makePlayerAt;

const singleZone: LoopZoneInput = {
  loopZoneId: "loop-0",
  checkTileX: 80,
  requiredRowMin: 10,
  requiredRowMax: 12,
  groupId: "group-0",
  groupSize: 1,
};

describe("loop zones", () => {
  it("passes a checkpoint crossed on the required row", () => {
    const levelSpec = requireLevelSpec(makeLoopLevelInput([singleZone]));
    const before = playerAt(80 * 16 - 8, 11 * 16);
    const after = playerAt(80 * 16 + 4, 11 * 16);
    const resolution = resolveLoopZones(
      makeEmptyLoopZoneState(),
      levelSpec,
      before,
      after,
    );
    expect(resolution.loopedBack).toBe(false);
    expect(resolution.player.position.x).toBe(after.position.x);
  });

  it("loops the player back four pages when crossing on the wrong row", () => {
    const levelSpec = requireLevelSpec(makeLoopLevelInput([singleZone]));
    const before = playerAt(80 * 16 - 8, 4 * 16);
    const after = playerAt(80 * 16 + 4, 4 * 16);
    const resolution = resolveLoopZones(
      makeEmptyLoopZoneState(),
      levelSpec,
      before,
      after,
    );
    expect(resolution.loopedBack).toBe(true);
    expect(resolution.player.position.x).toBe(after.position.x - 4 * 16 * 16);
  });

  it("resolves multi-part groups only after the final member", () => {
    const group: LoopZoneInput[] = [0, 1, 2].map((part) => ({
      loopZoneId: `loop-${part}`,
      checkTileX: 64 + part * 16,
      requiredRowMin: 10,
      requiredRowMax: 12,
      groupId: "trio",
      groupSize: 3,
    }));
    const levelSpec = requireLevelSpec(makeLoopLevelInput(group));

    // Fail the first part (wrong row) — nothing happens yet.
    let state = makeEmptyLoopZoneState();
    let resolution = resolveLoopZones(
      state,
      levelSpec,
      playerAt(64 * 16 - 8, 4 * 16),
      playerAt(64 * 16 + 4, 4 * 16),
    );
    expect(resolution.loopedBack).toBe(false);
    state = resolution.state;

    // Pass the second part.
    resolution = resolveLoopZones(
      state,
      levelSpec,
      playerAt(80 * 16 - 8, 11 * 16),
      playerAt(80 * 16 + 4, 11 * 16),
    );
    expect(resolution.loopedBack).toBe(false);
    state = resolution.state;

    // The third part resolves the group: one earlier failure loops back.
    resolution = resolveLoopZones(
      state,
      levelSpec,
      playerAt(96 * 16 - 8, 11 * 16),
      playerAt(96 * 16 + 4, 11 * 16),
    );
    expect(resolution.loopedBack).toBe(true);
    // The group re-arms for the retry.
    expect(resolution.state.groupProgress).toEqual({});
  });

  it("an unreachable row band always loops (pipe-gated checkpoints)", () => {
    const levelSpec = requireLevelSpec(
      makeLoopLevelInput([
        {
          ...singleZone,
          requiredRowMin: 15,
          requiredRowMax: 15,
        },
      ]),
    );
    const resolution = resolveLoopZones(
      makeEmptyLoopZoneState(),
      levelSpec,
      playerAt(80 * 16 - 8, 11 * 16),
      playerAt(80 * 16 + 4, 11 * 16),
    );
    expect(resolution.loopedBack).toBe(true);
  });
});

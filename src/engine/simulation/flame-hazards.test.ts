import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import type { LevelSpecInput } from "../domain/level-spec";
import type { FrameIndex } from "../domain/units";
import type { PixelPosition } from "../domain/units";
import {
  computeFirebarOrbs,
  computePodobooPositions,
  playerTouchesFlameHazard,
} from "./flame-hazards";
import {
  makeFlatLevelInput,
  requireMechanicsLevelSpec,
} from "./mechanics-test-support";
import { makeInitialPlayerSimulationState } from "./player-state";

const frame = (value: number): FrameIndex => value as FrameIndex;

function makeFlameLevelInput(
  overrides: Partial<LevelSpecInput> = {},
): LevelSpecInput {
  return makeFlatLevelInput(16, overrides);
}

const requireLevelSpec = requireMechanicsLevelSpec;

const slowClockwiseFirebar = {
  firebarId: "bar-1",
  x: 4,
  y: 8,
  orbCount: 6,
  direction: "clockwise",
  speed: "slow",
} as const;

describe("flame hazards", () => {
  it("rejects malformed firebar definitions", () => {
    const result = makeLevelSpec(
      makeFlameLevelInput({
        firebars: [
          {
            firebarId: "bar-1",
            x: 4,
            y: 8,
            orbCount: 6,
            direction: "sideways",
            speed: "slow",
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rotates firebar orbs around the anchor block", () => {
    const levelSpec = requireLevelSpec(
      makeFlameLevelInput({ firebars: [slowClockwiseFirebar] }),
    );

    const orbsAtStart = computeFirebarOrbs(levelSpec, frame(0));
    expect(orbsAtStart).toHaveLength(6);
    // Frame 0: the bar points along +x from the anchor centre (72, 136).
    expect(orbsAtStart[0]).toEqual({ x: 68, y: 132, sizePixels: 8 });
    expect(orbsAtStart[5]?.x).toBeCloseTo(68 + 5 * 8);
    expect(orbsAtStart[5]?.y).toBeCloseTo(132);

    // A quarter of the slow revolution later the bar points along +y.
    const quarter = computeFirebarOrbs(levelSpec, frame(51));
    expect(quarter[5]?.y).toBeGreaterThan(orbsAtStart[5]?.y ?? 0);
    // Counter-clockwise mirrors the vertical direction.
    const ccwSpec = requireLevelSpec(
      makeFlameLevelInput({
        firebars: [{ ...slowClockwiseFirebar, direction: "counter-clockwise" }],
      }),
    );
    const ccwQuarter = computeFirebarOrbs(ccwSpec, frame(51));
    expect(ccwQuarter[5]?.y).toBeLessThan(orbsAtStart[5]?.y ?? 0);
  });

  it("keeps podoboos hidden between leaps and leaps them above the pit", () => {
    const levelSpec = requireLevelSpec(
      makeFlameLevelInput({
        podoboos: [{ podobooId: "pod-1", x: 6, phaseOffsetFrames: 0 }],
      }),
    );

    // Phase 0 is the launch instant — no rise yet, still hidden.
    expect(computePodobooPositions(levelSpec, frame(0))).toHaveLength(0);
    // Mid-leap it is visible above the level bottom.
    const midLeap = computePodobooPositions(levelSpec, frame(30));
    expect(midLeap).toHaveLength(1);
    expect(midLeap[0]?.y).toBeLessThan(15 * 16);
    // After the flight window it is hidden again until the next cycle.
    expect(computePodobooPositions(levelSpec, frame(120))).toHaveLength(0);
    // And the next cycle leaps again.
    expect(computePodobooPositions(levelSpec, frame(384 + 30))).toHaveLength(1);
  });

  it("reports player contact with a firebar orb", () => {
    const levelSpec = requireLevelSpec(
      makeFlameLevelInput({ firebars: [slowClockwiseFirebar] }),
    );
    const player = makeInitialPlayerSimulationState();
    // The player spawns far from the firebar: no contact at frame 0.
    expect(playerTouchesFlameHazard(player, levelSpec, frame(0))).toBe(false);

    // Teleport the player onto the anchor: immediate contact.
    const touching = {
      ...player,
      position: {
        x: 68 as PixelPosition,
        y: 128 as PixelPosition,
      },
    };
    expect(playerTouchesFlameHazard(touching, levelSpec, frame(0))).toBe(true);
  });
});

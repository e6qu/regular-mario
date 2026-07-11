import { describe, expect, it } from "vitest";

import type { Projectile } from "./projectile-state";
import {
  liveHatchedSpinies,
  makeEmptyHatchedSpinyState,
  resolveHatchedSpinyState,
} from "./hatched-spiny-state";
import {
  makeFlatLevelInput,
  makePlayerAt,
  requireMechanicsLevelSpec,
} from "./mechanics-test-support";

const nominalFrameSeconds = 1 / 60;
const levelSpec = requireMechanicsLevelSpec(makeFlatLevelInput(32));
// The flat floor's surface is row 13 (y=208); a hatch spot resting on it.
const floorHatch = { x: 8 * 16, y: 13 * 16 - 14 };

describe("hatched spinies", () => {
  it("hatches a landed egg into a walker moving toward the player", () => {
    const player = makePlayerAt(4 * 16, 12 * 16);
    const resolution = resolveHatchedSpinyState(
      makeEmptyHatchedSpinyState(),
      levelSpec,
      player,
      [],
      [floorHatch],
      nominalFrameSeconds,
      0,
    );
    const spinies = liveHatchedSpinies(resolution.state);
    expect(spinies).toHaveLength(1);
    // The player is to the left, so the spiny walks left.
    expect(spinies[0]?.velocityX ?? 0).toBeLessThan(0);
  });

  it("walks along the floor and reports harmful contact", () => {
    const player = makePlayerAt(4 * 16, 12 * 16);
    let state = resolveHatchedSpinyState(
      makeEmptyHatchedSpinyState(),
      levelSpec,
      player,
      [],
      [floorHatch],
      nominalFrameSeconds,
      0,
    ).state;
    const startX = state.spinies[0]?.position.x ?? 0;
    for (let i = 1; i <= 30; i += 1) {
      state = resolveHatchedSpinyState(
        state,
        levelSpec,
        player,
        [],
        [],
        nominalFrameSeconds,
        i,
      ).state;
    }
    const walked = state.spinies[0];
    expect(walked?.position.x ?? startX).toBeLessThan(startX);
    // Standing on the floor, not sinking or floating.
    expect(walked?.position.y ?? 0).toBeCloseTo(13 * 16 - 14, 0);

    // A player standing inside the spiny is contacted (harm goes through the
    // hazard tiering in the step).
    const touching = makePlayerAt(
      walked?.position.x ?? 0,
      (walked?.position.y ?? 0) - 8,
    );
    const contact = resolveHatchedSpinyState(
      state,
      levelSpec,
      touching,
      [],
      [],
      nominalFrameSeconds,
      31,
    );
    expect(contact.playerContacted).toBe(true);
  });

  it("dies to a player fireball, consuming it", () => {
    const player = makePlayerAt(4 * 16, 12 * 16);
    const state = resolveHatchedSpinyState(
      makeEmptyHatchedSpinyState(),
      levelSpec,
      player,
      [],
      [floorHatch],
      nominalFrameSeconds,
      0,
    ).state;
    const spiny = state.spinies[0];
    if (spiny === undefined) {
      throw new Error("expected a hatched spiny");
    }
    const fireball = {
      id: "fireball-1",
      position: { x: spiny.position.x, y: spiny.position.y },
      velocity: { x: 120, y: 0 },
      width: 8,
      height: 8,
      active: true,
      remainingLifetimeFrames: 60,
    } as unknown as Projectile;
    const resolution = resolveHatchedSpinyState(
      state,
      levelSpec,
      player,
      [fireball],
      [],
      nominalFrameSeconds,
      1,
    );
    expect(resolution.defeatedCount).toBe(1);
    expect(resolution.consumedProjectileIds).toEqual(["fireball-1"]);
    expect(liveHatchedSpinies(resolution.state)).toHaveLength(0);
  });

  it("caps the live spinies at three", () => {
    const player = makePlayerAt(4 * 16, 12 * 16);
    const resolution = resolveHatchedSpinyState(
      makeEmptyHatchedSpinyState(),
      levelSpec,
      player,
      [],
      [floorHatch, floorHatch, floorHatch, floorHatch, floorHatch],
      nominalFrameSeconds,
      0,
    );
    expect(liveHatchedSpinies(resolution.state)).toHaveLength(3);
  });
});

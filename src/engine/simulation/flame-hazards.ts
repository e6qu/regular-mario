// Castle flame hazards: rotating firebars and leaping podoboos. Both are pure
// functions of the level spec and the frame index — they carry no mutable
// simulation state, so replays reproduce them exactly for free.

import type { LevelSpec } from "../domain/level-spec";
import type { FrameIndex } from "../domain/units";
import { playerOverlapsActorPixel } from "./player-actor-overlap";
import type { PlayerSimulationState } from "./player-state";

// A firebar advances a 16-bit spin state by $28 (slow) or $38 (fast) per frame
// in the original; the high byte's 32 steps make one revolution, giving
// 256*32/$28 ≈ 205 and 256*32/$38 ≈ 146 frames per revolution.
const firebarSlowRevolutionFrames = 205;
const firebarFastRevolutionFrames = 146;
const firebarOrbSpacingPixels = 8;
const firebarOrbSizePixels = 8;

// A podoboo leaps roughly six tiles above the pit on a regular cycle, rising
// and falling under gravity, and hides below the playfield between leaps.
const podobooCycleFrames = 384;
const podobooLaunchSpeedPixelsPerSecond = 340;
const podobooGravityPixelsPerSecondSquared = 600;
const podobooSizePixels = 12;
const nominalFrameSeconds = 1 / 60;

export type FlameHazardPoint = {
  readonly x: number;
  readonly y: number;
  readonly sizePixels: number;
};

export function computeFirebarOrbs(
  levelSpec: LevelSpec,
  frameIndex: FrameIndex,
): readonly FlameHazardPoint[] {
  const orbs: FlameHazardPoint[] = [];
  for (const firebar of levelSpec.firebars) {
    const revolutionFrames =
      firebar.speed === "fast"
        ? firebarFastRevolutionFrames
        : firebarSlowRevolutionFrames;
    const directionSign = firebar.direction === "clockwise" ? 1 : -1;
    const angleRadians =
      ((2 * Math.PI * Number(frameIndex)) / revolutionFrames) * directionSign;
    const centerX =
      firebar.anchorTileX * levelSpec.tileSizePixels +
      levelSpec.tileSizePixels / 2;
    const centerY =
      firebar.anchorTileY * levelSpec.tileSizePixels +
      levelSpec.tileSizePixels / 2;
    for (let orb = 0; orb < firebar.orbCount; orb += 1) {
      const radius = orb * firebarOrbSpacingPixels;
      orbs.push({
        x: centerX + radius * Math.cos(angleRadians) - firebarOrbSizePixels / 2,
        y: centerY + radius * Math.sin(angleRadians) - firebarOrbSizePixels / 2,
        sizePixels: firebarOrbSizePixels,
      });
    }
  }
  return orbs;
}

// The podoboo's vertical position over its cycle: hidden below the playfield
// until launch, then a gravity parabola up and back down.
export function computePodobooPositions(
  levelSpec: LevelSpec,
  frameIndex: FrameIndex,
): readonly FlameHazardPoint[] {
  const positions: FlameHazardPoint[] = [];
  const bottomY = levelSpec.heightTiles * levelSpec.tileSizePixels;
  for (const podoboo of levelSpec.podoboos) {
    const cyclePhase =
      (Number(frameIndex) + podoboo.phaseOffsetFrames) % podobooCycleFrames;
    const flightSeconds = cyclePhase * nominalFrameSeconds;
    const rise =
      podobooLaunchSpeedPixelsPerSecond * flightSeconds -
      0.5 *
        podobooGravityPixelsPerSecondSquared *
        flightSeconds *
        flightSeconds;
    if (rise <= 0) {
      continue; // below the pit — hidden between leaps
    }
    positions.push({
      x:
        podoboo.tileX * levelSpec.tileSizePixels +
        levelSpec.tileSizePixels / 2 -
        podobooSizePixels / 2,
      y: bottomY - rise - podobooSizePixels,
      sizePixels: podobooSizePixels,
    });
  }
  return positions;
}

export function playerTouchesFlameHazard(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  frameIndex: FrameIndex,
): boolean {
  if (levelSpec.firebars.length === 0 && levelSpec.podoboos.length === 0) {
    return false;
  }
  const hazards = [
    ...computeFirebarOrbs(levelSpec, frameIndex),
    ...computePodobooPositions(levelSpec, frameIndex),
  ];
  return hazards.some((hazard) =>
    playerOverlapsActorPixel(
      player,
      { x: hazard.x, y: hazard.y },
      { width: hazard.sizePixels, height: hazard.sizePixels },
    ),
  );
}

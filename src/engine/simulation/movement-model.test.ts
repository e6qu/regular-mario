import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import { describe, expect, it } from "vitest";

import {
  initialMovementConstants,
  makeInitialMovementState,
  type MovementConstants,
} from "./movement-model";
import { makeTileSizePixels } from "../domain/units";
import { measureMovementConstants } from "./movement-measurements";
import { nominalSixtyHertzFrameDurationMilliseconds } from "./simulation-units";

function authoredTileSizePixels() {
  const result = makeTileSizePixels(16, "test.tileSizePixels");

  if (!result.ok) {
    throw new Error("Expected authored tile size to validate.");
  }

  return result.value;
}

describe("movement model", () => {
  it("starts grounded and idle", () => {
    expect(makeInitialMovementState()).toEqual({
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Grounded,
    });
  });

  it("exposes explicit authored movement constants", () => {
    expect(initialMovementConstants).toEqual({
      walkAcceleration: 455,
      runAcceleration: 640,
      groundFriction: 580,
      airFriction: 70,
      maxWalkSpeed: 90,
      maxRunSpeed: 150,
      jumpLaunchSpeed: 264,
      runningJumpLaunchSpeed: 324,
      enemyStompReboundSpeed: 300,
      springLaunchSpeed: 360,
      enemyStompForgivenessPixels: 4,
      enemyActivationLeadPixels: 256,
      enemySideContactKnockbackSpeed: 150,
      damageRecoveryKnockbackFrameCount: 18,
      damageRecoveryInvulnerabilityFrameCount: 120,
      enemyPatrolSpeed: 40,
      flyingEnemyPatrolSpeed: 45,
      flyingEnemyVerticalAmplitudePixels: 8,
      flyingEnemyVerticalPeriodFrames: 120,
      wingedVerticalFlyerAmplitudePixels: 48,
      wingedVerticalFlyerPeriodFrames: 240,
      wingedHopTakeoffSpeed: 200,
      chasingEnemySpeed: 60,
      chasingEnemyDetectionWidthPixels: 112,
      chasingEnemyDetectionHeightPixels: 48,
      shellSlideSpeed: 180,
      climbSpeed: 48,
      aerialThrowingEnemySpeed: 36,
      aerialThrowingEnemyProjectileSpeed: 96,
      aerialThrowingEnemyProjectileIntervalFrameCount: 120,
      aerialThrowingEnemyProjectileLifetimeFrameCount: 180,
      aerialThrowingEnemyProjectileColliderWidth: 8,
      aerialThrowingEnemyProjectileColliderHeight: 8,
      throwingEnemyProjectileSpeed: 96,
      throwingEnemyProjectileUpwardSpeed: 120,
      throwingEnemyProjectileIntervalFrameCount: 90,
      throwingEnemyProjectileLifetimeFrameCount: 180,
      throwingEnemyProjectileColliderWidth: 6,
      throwingEnemyProjectileColliderHeight: 6,
      gravityRisingHeld: 563,
      gravityRisingReleased: 2000,
      gravityFalling: 2250,
      maxFallSpeed: 240,
      coyoteFrameCount: 6,
      jumpBufferFrameCount: 6,
      projectileSpeed: 240,
      projectileGravity: 540,
      projectileBounceSpeed: 225,
      projectileCooldownFrameCount: 20,
      projectileLifetimeFrameCount: 120,
      projectileColliderWidth: 6,
      projectileColliderHeight: 6,
      pipeEntryFrameCount: 30,
      pipeExitCooldownFrameCount: 30,
      swimming: false,
      bloodyBonks: false,
    });
  });

  it("keeps running speed above walking speed", () => {
    expect(initialMovementConstants.maxRunSpeed).toBeGreaterThan(
      initialMovementConstants.maxWalkSpeed,
    );
  });

  it("keeps run acceleration above walk acceleration", () => {
    expect(initialMovementConstants.runAcceleration).toBeGreaterThan(
      initialMovementConstants.walkAcceleration,
    );
  });

  it("measures current movement constants at the authored tile size and nominal frame duration", () => {
    const measurements = measureMovementConstants(
      initialMovementConstants,
      authoredTileSizePixels(),
      nominalSixtyHertzFrameDurationMilliseconds,
    );

    expect(measurements.horizontal.maxWalkSpeedTilesPerSecond).toBeCloseTo(
      5.625,
      9,
    );
    expect(measurements.horizontal.maxRunSpeedTilesPerSecond).toBeCloseTo(
      9.375,
      9,
    );
    expect(measurements.horizontal.framesToMaxWalkSpeed).toBe(12);
    expect(
      measurements.horizontal.secondsToMaxWalkSpeedAtFrameDuration,
    ).toBeCloseTo(0.2, 9);
    expect(measurements.horizontal.framesToMaxRunSpeed).toBe(15);
    expect(
      measurements.horizontal.secondsToMaxRunSpeedAtFrameDuration,
    ).toBeCloseTo(0.25, 9);
    expect(measurements.horizontal.framesToStopFromMaxWalkSpeed).toBe(10);
    expect(
      measurements.horizontal.secondsToStopFromMaxWalkSpeedAtFrameDuration,
    ).toBeCloseTo(0.166_666_666_666, 9);
    expect(measurements.horizontal.framesToStopFromMaxRunSpeed).toBe(16);
    expect(
      measurements.horizontal.secondsToStopFromMaxRunSpeedAtFrameDuration,
    ).toBeCloseTo(0.266_666_666_672, 9);

    expect(measurements.vertical.jumpLaunchSpeedTilesPerSecond).toBeCloseTo(
      16.5,
      9,
    );
    expect(measurements.vertical.gravityTilesPerSecondSquared).toBeCloseTo(
      35.1875,
      9,
    );
    expect(measurements.vertical.continuousJumpApexSeconds).toBeCloseTo(
      0.468_916_518_650,
      9,
    );
    expect(measurements.vertical.continuousJumpApexHeightPixels).toBeCloseTo(
      61.896_980_461_812,
      9,
    );
    expect(measurements.vertical.continuousJumpApexHeightTiles).toBeCloseTo(
      3.868_561_278_863,
      9,
    );
    expect(
      measurements.vertical.framesToContinuousJumpApexAtFrameDuration,
    ).toBe(29);
    expect(
      measurements.vertical.continuousReturnToLaunchHeightSeconds,
    ).toBeCloseTo(0.937_833_037_300, 9);
    expect(
      measurements.vertical
        .framesToContinuousReturnToLaunchHeightAtFrameDuration,
    ).toBe(57);
    expect(measurements.vertical.simulatedApexFrameAtFrameDuration).toBe(29);
    expect(
      measurements.vertical.simulatedApexHeightPixelsAtFrameDuration,
    ).toBeCloseTo(64.106_111_111_111, 9);
    expect(
      measurements.vertical.simulatedApexHeightTilesAtFrameDuration,
    ).toBeCloseTo(4.006_631_944_444, 9);
    expect(
      measurements.vertical.simulatedReturnToLaunchHeightFrameAtFrameDuration,
    ).toBe(58);
  });

  it("rejects non-positive vertical measurement constants loudly", () => {
    const invalidMovementConstants = {
      ...initialMovementConstants,
      gravityRisingHeld: 0,
    } as unknown as MovementConstants;

    expect(() =>
      measureMovementConstants(
        invalidMovementConstants,
        authoredTileSizePixels(),
        nominalSixtyHertzFrameDurationMilliseconds,
      ),
    ).toThrow("movement.gravityRisingHeld must be a positive finite number.");
  });
});

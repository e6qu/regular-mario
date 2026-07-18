import {
  makePrincessMovementConstants,
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
      walkAcceleration: 133.6,
      runAcceleration: 200.4,
      groundFriction: 182.8,
      airFriction: 70,
      maxWalkSpeed: 90,
      maxRunSpeed: 150,
      jumpLaunchSpeed: 240,
      runningJumpLaunchSpeed: 300,
      enemyStompReboundSpeed: 300,
      springLaunchSpeed: 360,
      springBoostLaunchSpeed: 480,
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
      gravityRisingHeld: 450,
      gravityRisingReleased: 1575,
      gravityFalling: 1575,
      jumpTiers: [
        {
          minHorizontalSpeed: 0,
          launchSpeed: 240,
          gravityRisingHeld: 450,
          gravityFalling: 1575,
        },
        {
          minHorizontalSpeed: 60,
          launchSpeed: 240,
          gravityRisingHeld: 421.875,
          gravityFalling: 1350,
        },
        {
          minHorizontalSpeed: 93.75,
          launchSpeed: 300,
          gravityRisingHeld: 562.5,
          gravityFalling: 2025,
        },
      ],
      maxFallSpeed: 270,
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
      godMode: false,
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
    expect(measurements.horizontal.framesToMaxWalkSpeed).toBe(41);
    expect(
      measurements.horizontal.secondsToMaxWalkSpeedAtFrameDuration,
    ).toBeCloseTo(0.683_333_333_347, 9);
    expect(measurements.horizontal.framesToMaxRunSpeed).toBe(45);
    expect(
      measurements.horizontal.secondsToMaxRunSpeedAtFrameDuration,
    ).toBeCloseTo(0.75, 9);
    expect(measurements.horizontal.framesToStopFromMaxWalkSpeed).toBe(30);
    expect(
      measurements.horizontal.secondsToStopFromMaxWalkSpeedAtFrameDuration,
    ).toBeCloseTo(0.5, 9);
    expect(measurements.horizontal.framesToStopFromMaxRunSpeed).toBe(50);
    expect(
      measurements.horizontal.secondsToStopFromMaxRunSpeedAtFrameDuration,
    ).toBeCloseTo(0.833_333_333_35, 9);

    // The scalar (slow-tier) jump measures the ROM's 4-tile standing apex.
    expect(measurements.vertical.jumpLaunchSpeedTilesPerSecond).toBeCloseTo(
      15,
      9,
    );
    expect(measurements.vertical.gravityTilesPerSecondSquared).toBeCloseTo(
      28.125,
      9,
    );
    expect(measurements.vertical.continuousJumpApexSeconds).toBeCloseTo(
      0.533_333_333_333,
      9,
    );
    expect(measurements.vertical.continuousJumpApexHeightPixels).toBeCloseTo(
      64,
      9,
    );
    expect(measurements.vertical.continuousJumpApexHeightTiles).toBeCloseTo(
      4,
      9,
    );
    expect(
      measurements.vertical.framesToContinuousJumpApexAtFrameDuration,
    ).toBe(32);
    expect(
      measurements.vertical.continuousReturnToLaunchHeightSeconds,
    ).toBeCloseTo(1.066_666_666_667, 9);
    expect(
      measurements.vertical
        .framesToContinuousReturnToLaunchHeightAtFrameDuration,
    ).toBe(64);
    expect(measurements.vertical.simulatedApexFrameAtFrameDuration).toBe(32);
    expect(
      measurements.vertical.simulatedApexHeightPixelsAtFrameDuration,
    ).toBeCloseTo(66.000_000_000_08, 9);
    expect(
      measurements.vertical.simulatedApexHeightTilesAtFrameDuration,
    ).toBeCloseTo(4.125_000_000_005, 9);
    expect(
      measurements.vertical.simulatedReturnToLaunchHeightFrameAtFrameDuration,
    ).toBe(65);
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

describe("princess movement constants", () => {
  it("slows the fall and boosts the jump slightly, leaving the rest alone", () => {
    const princess = makePrincessMovementConstants(initialMovementConstants);
    expect(princess.gravityFalling).toBeCloseTo(
      Number(initialMovementConstants.gravityFalling) * 0.82,
    );
    expect(princess.maxFallSpeed).toBeCloseTo(
      Number(initialMovementConstants.maxFallSpeed) * 0.82,
    );
    expect(princess.jumpLaunchSpeed).toBeCloseTo(
      Number(initialMovementConstants.jumpLaunchSpeed) * 1.06,
    );
    expect(princess.jumpTiers[0]?.launchSpeed).toBeCloseTo(
      Number(initialMovementConstants.jumpTiers[0]?.launchSpeed) * 1.06,
    );
    // Rising gravity, walk speed and everything else stay stock.
    expect(princess.gravityRisingHeld).toBe(
      initialMovementConstants.gravityRisingHeld,
    );
    expect(princess.maxWalkSpeed).toBe(initialMovementConstants.maxWalkSpeed);
  });
});

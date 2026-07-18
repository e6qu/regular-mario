import type {
  AccelerationPixelsPerSecondSquared,
  ColliderDimensionPixels,
  VelocityPixelsPerSecond,
} from "../domain/units";
import {
  makeAccelerationPixelsPerSecondSquared,
  makeVelocityPixelsPerSecond,
  requireColliderDimensionPixels,
} from "../domain/units";
import type { Brand } from "../domain/brand";
import type { DomainResult } from "../domain/result";
import { fail, succeed } from "../domain/result";
import type { ValidationError } from "../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../domain/validation-error";
import {
  makeRecoveryFrameCount,
  type RecoveryFrameCount,
} from "./player-vitality";

export type CoyoteFrameCount = Brand<number, "CoyoteFrameCount">;
export type JumpBufferFrameCount = Brand<number, "JumpBufferFrameCount">;
export type ProjectileFrameCount = Brand<number, "ProjectileFrameCount">;

export function makeProjectileFrameCount(
  value: number,
  path: string,
): DomainResult<ProjectileFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.ProjectileFrameCountInvalid,
        `${path} must be a non-negative safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as ProjectileFrameCount);
}

function makeCoyoteFrameCount(
  value: number,
  path: string,
): DomainResult<CoyoteFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.CoyoteFrameCountInvalid,
        `${path} must be a non-negative safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as CoyoteFrameCount);
}

function makeJumpBufferFrameCount(
  value: number,
  path: string,
): DomainResult<JumpBufferFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.JumpBufferFrameCountInvalid,
        `${path} must be a non-negative safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as JumpBufferFrameCount);
}

function requireCoyoteFrameCount(
  value: number,
  path: string,
): CoyoteFrameCount {
  const result = makeCoyoteFrameCount(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid coyote frame count.`);
  }

  return result.value;
}

function requireJumpBufferFrameCount(
  value: number,
  path: string,
): JumpBufferFrameCount {
  const result = makeJumpBufferFrameCount(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid jump buffer frame count.`);
  }

  return result.value;
}

function requirePositiveProjectileFrameCount(
  value: number,
  path: string,
): ProjectileFrameCount {
  const result = makeProjectileFrameCount(value, path);

  if (!result.ok || result.value === 0) {
    throw new Error(`${path} must be a positive projectile frame count.`);
  }

  return result.value;
}

export enum HorizontalMovementState {
  Idle = "idle",
  Walking = "walking",
  Running = "running",
}

export enum VerticalMovementState {
  Grounded = "grounded",
  Jumping = "jumping",
  Falling = "falling",
  Climbing = "climbing",
}

export type MovementState = {
  readonly horizontal: HorizontalMovementState;
  readonly vertical: VerticalMovementState;
};

// SMB's speed-indexed jump physics (JumpMForceData / FallMForceData /
// PlayerYSpdData): the tier is picked from |horizontal speed| when the jump
// launches and stays latched for the whole arc — running jumps launch faster
// and fall harder. Releasing the jump button while rising applies the tier's
// falling gravity (the ROM dumps VerticalForceDown into VerticalForce).
type JumpTier = {
  readonly minHorizontalSpeed: VelocityPixelsPerSecond;
  readonly launchSpeed: VelocityPixelsPerSecond;
  readonly gravityRisingHeld: AccelerationPixelsPerSecondSquared;
  readonly gravityFalling: AccelerationPixelsPerSecondSquared;
};

export type MovementConstants = {
  readonly walkAcceleration: AccelerationPixelsPerSecondSquared;
  readonly runAcceleration: AccelerationPixelsPerSecondSquared;
  readonly groundFriction: AccelerationPixelsPerSecondSquared;
  readonly airFriction: AccelerationPixelsPerSecondSquared;
  readonly maxWalkSpeed: VelocityPixelsPerSecond;
  readonly maxRunSpeed: VelocityPixelsPerSecond;
  readonly jumpLaunchSpeed: VelocityPixelsPerSecond;
  readonly runningJumpLaunchSpeed: VelocityPixelsPerSecond;
  readonly enemyStompReboundSpeed: VelocityPixelsPerSecond;
  readonly springLaunchSpeed: VelocityPixelsPerSecond;
  // Launch speed when the jump button is held on the launch frame (ROM
  // JumpspringHandler: pressing A during the bounce stores the stronger $f4
  // jumpspring force instead of the passive one).
  readonly springBoostLaunchSpeed: VelocityPixelsPerSecond;
  readonly enemyStompForgivenessPixels: ColliderDimensionPixels;
  readonly enemyActivationLeadPixels: ColliderDimensionPixels;
  readonly enemySideContactKnockbackSpeed: VelocityPixelsPerSecond;
  readonly damageRecoveryKnockbackFrameCount: RecoveryFrameCount;
  readonly damageRecoveryInvulnerabilityFrameCount: RecoveryFrameCount;
  readonly enemyPatrolSpeed: VelocityPixelsPerSecond;
  readonly flyingEnemyPatrolSpeed: VelocityPixelsPerSecond;
  readonly flyingEnemyVerticalAmplitudePixels: number;
  readonly flyingEnemyVerticalPeriodFrames: number;
  // Winged armored enemies (Paratroopas): the vertical-flyer's oscillation
  // range/period and the hopper's take-off speed.
  readonly wingedVerticalFlyerAmplitudePixels: number;
  readonly wingedVerticalFlyerPeriodFrames: number;
  readonly wingedHopTakeoffSpeed: VelocityPixelsPerSecond;
  readonly chasingEnemySpeed: VelocityPixelsPerSecond;
  readonly chasingEnemyDetectionWidthPixels: number;
  readonly chasingEnemyDetectionHeightPixels: number;
  readonly shellSlideSpeed: VelocityPixelsPerSecond;
  readonly climbSpeed: VelocityPixelsPerSecond;
  readonly aerialThrowingEnemySpeed: VelocityPixelsPerSecond;
  readonly aerialThrowingEnemyProjectileSpeed: VelocityPixelsPerSecond;
  readonly aerialThrowingEnemyProjectileIntervalFrameCount: ProjectileFrameCount;
  readonly aerialThrowingEnemyProjectileLifetimeFrameCount: ProjectileFrameCount;
  readonly aerialThrowingEnemyProjectileColliderWidth: ColliderDimensionPixels;
  readonly aerialThrowingEnemyProjectileColliderHeight: ColliderDimensionPixels;
  readonly throwingEnemyProjectileSpeed: VelocityPixelsPerSecond;
  readonly throwingEnemyProjectileUpwardSpeed: VelocityPixelsPerSecond;
  readonly throwingEnemyProjectileIntervalFrameCount: ProjectileFrameCount;
  readonly throwingEnemyProjectileLifetimeFrameCount: ProjectileFrameCount;
  readonly throwingEnemyProjectileColliderWidth: ColliderDimensionPixels;
  readonly throwingEnemyProjectileColliderHeight: ColliderDimensionPixels;
  readonly gravityRisingHeld: AccelerationPixelsPerSecondSquared;
  readonly gravityRisingReleased: AccelerationPixelsPerSecondSquared;
  readonly gravityFalling: AccelerationPixelsPerSecondSquared;
  // Speed-indexed jump tiers (ascending minHorizontalSpeed). Empty means the
  // scalar launch/gravity fields above apply unconditionally (swimming).
  readonly jumpTiers: readonly JumpTier[];
  readonly maxFallSpeed: VelocityPixelsPerSecond;
  readonly coyoteFrameCount: CoyoteFrameCount;
  readonly jumpBufferFrameCount: JumpBufferFrameCount;
  readonly projectileSpeed: VelocityPixelsPerSecond;
  // Fireballs fall under gravity and bounce off the ground in an arc (0 gravity
  // underwater, where they travel straight and buoyant like SMB).
  readonly projectileGravity: AccelerationPixelsPerSecondSquared;
  readonly projectileBounceSpeed: VelocityPixelsPerSecond;
  readonly projectileCooldownFrameCount: ProjectileFrameCount;
  readonly projectileLifetimeFrameCount: ProjectileFrameCount;
  readonly projectileColliderWidth: ColliderDimensionPixels;
  readonly projectileColliderHeight: ColliderDimensionPixels;
  readonly pipeEntryFrameCount: ProjectileFrameCount;
  readonly pipeExitCooldownFrameCount: ProjectileFrameCount;
  // Underwater physics: buoyant (weak) gravity and a repeatable jump "stroke"
  // instead of a single grounded jump.
  readonly swimming: boolean;
  // "Shabby" mechanics: head-bonks bloody the player and cumulatively slow them
  // (up to 50%). Off in the faithful/original mode.
  readonly bloodyBonks: boolean;
  // God mode: the player cannot be damaged or defeated by enemies, hazards or
  // the timer (pit falls still reset — a bottomless pit would soft-lock).
  readonly godMode: boolean;
};

function requireAcceleration(
  value: number,
  path: string,
): AccelerationPixelsPerSecondSquared {
  const result = makeAccelerationPixelsPerSecondSquared(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid acceleration constant.`);
  }

  return result.value;
}

function requireVelocity(value: number, path: string): VelocityPixelsPerSecond {
  const result = makeVelocityPixelsPerSecond(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid velocity constant.`);
  }

  return result.value;
}

function requirePositiveRecoveryFrameCount(
  value: number,
  path: string,
): RecoveryFrameCount {
  const result = makeRecoveryFrameCount(value, path);

  if (!result.ok || result.value === 0) {
    throw new Error(`${path} must be a positive recovery frame count.`);
  }

  return result.value;
}

export const initialMovementConstants: MovementConstants = {
  // Ground acceleration/friction from the ROM's FrictionData ($98 walking,
  // $e4 running with B, $d0 decelerating from run speed), converted from
  // 1/4096 px/frame^2 at 60 fps: value / 4096 * 3600 px/s^2.
  walkAcceleration: requireAcceleration(133.6, "movement.walkAcceleration"),
  runAcceleration: requireAcceleration(200.4, "movement.runAcceleration"),
  groundFriction: requireAcceleration(182.8, "movement.groundFriction"),
  airFriction: requireAcceleration(70, "movement.airFriction"),
  // MaxRightXSpdData: $18 walking, $28 running (1/16 px/frame at 60 fps).
  maxWalkSpeed: requireVelocity(90, "movement.maxWalkSpeed"),
  maxRunSpeed: requireVelocity(150, "movement.maxRunSpeed"),
  // Scalar fallbacks mirror the slow tier (used when jumpTiers is empty).
  jumpLaunchSpeed: requireVelocity(240, "movement.jumpLaunchSpeed"),
  runningJumpLaunchSpeed: requireVelocity(
    300,
    "movement.runningJumpLaunchSpeed",
  ),
  enemyStompReboundSpeed: requireVelocity(
    300,
    "movement.enemyStompReboundSpeed",
  ),
  springLaunchSpeed: requireVelocity(360, "movement.springLaunchSpeed"),
  springBoostLaunchSpeed: requireVelocity(
    480,
    "movement.springBoostLaunchSpeed",
  ),
  enemyStompForgivenessPixels: requireColliderDimensionPixels(
    4,
    "movement.enemyStompForgivenessPixels",
  ),
  enemyActivationLeadPixels: requireColliderDimensionPixels(
    256,
    "movement.enemyActivationLeadPixels",
  ),
  enemySideContactKnockbackSpeed: requireVelocity(
    150,
    "movement.enemySideContactKnockbackSpeed",
  ),
  damageRecoveryKnockbackFrameCount: requirePositiveRecoveryFrameCount(
    18,
    "movement.damageRecoveryKnockbackFrameCount",
  ),
  damageRecoveryInvulnerabilityFrameCount: requirePositiveRecoveryFrameCount(
    120,
    "movement.damageRecoveryInvulnerabilityFrameCount",
  ),
  enemyPatrolSpeed: requireVelocity(40, "movement.enemyPatrolSpeed"),
  flyingEnemyPatrolSpeed: requireVelocity(
    45,
    "movement.flyingEnemyPatrolSpeed",
  ),
  flyingEnemyVerticalAmplitudePixels: 8,
  flyingEnemyVerticalPeriodFrames: 120,
  wingedVerticalFlyerAmplitudePixels: 48,
  wingedVerticalFlyerPeriodFrames: 240,
  wingedHopTakeoffSpeed: requireVelocity(200, "movement.wingedHopTakeoffSpeed"),
  chasingEnemySpeed: requireVelocity(60, "movement.chasingEnemySpeed"),
  chasingEnemyDetectionWidthPixels: 112,
  chasingEnemyDetectionHeightPixels: 48,
  shellSlideSpeed: requireVelocity(180, "movement.shellSlideSpeed"),
  climbSpeed: requireVelocity(48, "movement.climbSpeed"),
  aerialThrowingEnemySpeed: requireVelocity(
    36,
    "movement.aerialThrowingEnemySpeed",
  ),
  aerialThrowingEnemyProjectileSpeed: requireVelocity(
    96,
    "movement.aerialThrowingEnemyProjectileSpeed",
  ),
  aerialThrowingEnemyProjectileIntervalFrameCount:
    requirePositiveProjectileFrameCount(
      120,
      "movement.aerialThrowingEnemyProjectileIntervalFrameCount",
    ),
  aerialThrowingEnemyProjectileLifetimeFrameCount:
    requirePositiveProjectileFrameCount(
      180,
      "movement.aerialThrowingEnemyProjectileLifetimeFrameCount",
    ),
  aerialThrowingEnemyProjectileColliderWidth: requireColliderDimensionPixels(
    8,
    "movement.aerialThrowingEnemyProjectileColliderWidth",
  ),
  aerialThrowingEnemyProjectileColliderHeight: requireColliderDimensionPixels(
    8,
    "movement.aerialThrowingEnemyProjectileColliderHeight",
  ),
  throwingEnemyProjectileSpeed: requireVelocity(
    96,
    "movement.throwingEnemyProjectileSpeed",
  ),
  throwingEnemyProjectileUpwardSpeed: requireVelocity(
    120,
    "movement.throwingEnemyProjectileUpwardSpeed",
  ),
  throwingEnemyProjectileIntervalFrameCount:
    requirePositiveProjectileFrameCount(
      90,
      "movement.throwingEnemyProjectileIntervalFrameCount",
    ),
  throwingEnemyProjectileLifetimeFrameCount:
    requirePositiveProjectileFrameCount(
      180,
      "movement.throwingEnemyProjectileLifetimeFrameCount",
    ),
  throwingEnemyProjectileColliderWidth: requireColliderDimensionPixels(
    6,
    "movement.throwingEnemyProjectileColliderWidth",
  ),
  throwingEnemyProjectileColliderHeight: requireColliderDimensionPixels(
    6,
    "movement.throwingEnemyProjectileColliderHeight",
  ),
  // Scalar gravity fallbacks mirror the slow tier; the tier table below is
  // what actually drives land jumps.
  gravityRisingHeld: requireAcceleration(450, "movement.gravityRisingHeld"),
  gravityRisingReleased: requireAcceleration(
    1575,
    "movement.gravityRisingReleased",
  ),
  gravityFalling: requireAcceleration(1575, "movement.gravityFalling"),
  // JumpMForceData/FallMForceData/PlayerYSpdData by launch-speed band
  // (thresholds $10 and $19 in 1/16 px/frame): forces are 1/256 px/frame^2
  // (value / 256 * 3600 px/s^2), launches whole px/frame. Standing jumps
  // apex 4 tiles, full-run jumps 5, exactly like the original.
  jumpTiers: [
    {
      minHorizontalSpeed: requireVelocity(0, "movement.jumpTiers[0].min"),
      launchSpeed: requireVelocity(240, "movement.jumpTiers[0].launch"),
      gravityRisingHeld: requireAcceleration(450, "movement.jumpTiers[0].up"),
      gravityFalling: requireAcceleration(1575, "movement.jumpTiers[0].down"),
    },
    {
      minHorizontalSpeed: requireVelocity(60, "movement.jumpTiers[1].min"),
      launchSpeed: requireVelocity(240, "movement.jumpTiers[1].launch"),
      gravityRisingHeld: requireAcceleration(
        421.875,
        "movement.jumpTiers[1].up",
      ),
      gravityFalling: requireAcceleration(1350, "movement.jumpTiers[1].down"),
    },
    {
      minHorizontalSpeed: requireVelocity(93.75, "movement.jumpTiers[2].min"),
      launchSpeed: requireVelocity(300, "movement.jumpTiers[2].launch"),
      gravityRisingHeld: requireAcceleration(562.5, "movement.jumpTiers[2].up"),
      gravityFalling: requireAcceleration(2025, "movement.jumpTiers[2].down"),
    },
  ],
  // $04 whole px/frame plus up to $80/256 fractional before the clamp.
  maxFallSpeed: requireVelocity(270, "movement.maxFallSpeed"),
  coyoteFrameCount: requireCoyoteFrameCount(6, "movement.coyoteFrameCount"),
  jumpBufferFrameCount: requireJumpBufferFrameCount(
    6,
    "movement.jumpBufferFrameCount",
  ),
  projectileSpeed: requireVelocity(240, "movement.projectileSpeed"),
  projectileGravity: requireAcceleration(540, "movement.projectileGravity"),
  projectileBounceSpeed: requireVelocity(225, "movement.projectileBounceSpeed"),
  projectileCooldownFrameCount: requirePositiveProjectileFrameCount(
    20,
    "movement.projectileCooldownFrameCount",
  ),
  projectileLifetimeFrameCount: requirePositiveProjectileFrameCount(
    120,
    "movement.projectileLifetimeFrameCount",
  ),
  projectileColliderWidth: requireColliderDimensionPixels(
    6,
    "movement.projectileColliderWidth",
  ),
  projectileColliderHeight: requireColliderDimensionPixels(
    6,
    "movement.projectileColliderHeight",
  ),
  pipeEntryFrameCount: requirePositiveProjectileFrameCount(
    30,
    "movement.pipeEntryFrameCount",
  ),
  pipeExitCooldownFrameCount: requirePositiveProjectileFrameCount(
    30,
    "movement.pipeExitCooldownFrameCount",
  ),
  swimming: false,
  bloodyBonks: false,
  godMode: false,
};

// Underwater physics: buoyant gravity (a slow sink), a low terminal sink speed,
// and a gentle jump "stroke" the player can repeat to swim upward.
export const swimmingMovementConstants: MovementConstants = {
  ...initialMovementConstants,
  swimming: true,
  // Swim strokes are tier 5 of the same ROM tables: stroke launch -1.5
  // px/frame ($fe + $80/256), rising force $0d, sinking force $0a.
  jumpTiers: [],
  gravityRisingHeld: requireAcceleration(
    182.8,
    "movement.swim.gravityRisingHeld",
  ),
  gravityRisingReleased: requireAcceleration(
    140.6,
    "movement.swim.gravityRisingReleased",
  ),
  gravityFalling: requireAcceleration(140.6, "movement.swim.gravityFalling"),
  maxFallSpeed: requireVelocity(105, "movement.swim.maxFallSpeed"),
  jumpLaunchSpeed: requireVelocity(90, "movement.swim.jumpLaunchSpeed"),
  runningJumpLaunchSpeed: requireVelocity(
    90,
    "movement.swim.runningJumpLaunchSpeed",
  ),
  // Water caps horizontal speed at $10 (1 px/frame) regardless of B, with the
  // swim-class friction $d0 as the acceleration.
  maxWalkSpeed: requireVelocity(60, "movement.swim.maxWalkSpeed"),
  maxRunSpeed: requireVelocity(60, "movement.swim.maxRunSpeed"),
  walkAcceleration: requireAcceleration(
    182.8,
    "movement.swim.walkAcceleration",
  ),
  runAcceleration: requireAcceleration(182.8, "movement.swim.runAcceleration"),
  airFriction: requireAcceleration(120, "movement.swim.airFriction"),
  // A swimming chaser (Blooper) is driven by horizontal proximity alone (the
  // pulse cycle in enemy-motion), so the land detection box is unused here.
  // Underwater fireballs travel straight and buoyant — no gravity, no bounce.
  projectileGravity: requireAcceleration(0, "movement.swim.projectileGravity"),
};

export function makeInitialMovementState(): MovementState {
  return {
    horizontal: HorizontalMovementState.Idle,
    vertical: VerticalMovementState.Grounded,
  };
}

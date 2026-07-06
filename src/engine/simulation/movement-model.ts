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
  readonly enemyStompForgivenessPixels: ColliderDimensionPixels;
  readonly enemyActivationLeadPixels: ColliderDimensionPixels;
  readonly enemySideContactKnockbackSpeed: VelocityPixelsPerSecond;
  readonly damageRecoveryKnockbackFrameCount: RecoveryFrameCount;
  readonly damageRecoveryInvulnerabilityFrameCount: RecoveryFrameCount;
  readonly enemyPatrolSpeed: VelocityPixelsPerSecond;
  readonly flyingEnemyPatrolSpeed: VelocityPixelsPerSecond;
  readonly flyingEnemyVerticalAmplitudePixels: number;
  readonly flyingEnemyVerticalPeriodFrames: number;
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
  walkAcceleration: requireAcceleration(455, "movement.walkAcceleration"),
  runAcceleration: requireAcceleration(640, "movement.runAcceleration"),
  groundFriction: requireAcceleration(580, "movement.groundFriction"),
  airFriction: requireAcceleration(70, "movement.airFriction"),
  maxWalkSpeed: requireVelocity(90, "movement.maxWalkSpeed"),
  maxRunSpeed: requireVelocity(150, "movement.maxRunSpeed"),
  jumpLaunchSpeed: requireVelocity(264, "movement.jumpLaunchSpeed"),
  runningJumpLaunchSpeed: requireVelocity(
    324,
    "movement.runningJumpLaunchSpeed",
  ),
  enemyStompReboundSpeed: requireVelocity(
    300,
    "movement.enemyStompReboundSpeed",
  ),
  springLaunchSpeed: requireVelocity(360, "movement.springLaunchSpeed"),
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
  gravityRisingHeld: requireAcceleration(563, "movement.gravityRisingHeld"),
  gravityRisingReleased: requireAcceleration(
    2000,
    "movement.gravityRisingReleased",
  ),
  gravityFalling: requireAcceleration(2250, "movement.gravityFalling"),
  maxFallSpeed: requireVelocity(240, "movement.maxFallSpeed"),
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
};

// Underwater physics: buoyant gravity (a slow sink), a low terminal sink speed,
// and a gentle jump "stroke" the player can repeat to swim upward.
export const swimmingMovementConstants: MovementConstants = {
  ...initialMovementConstants,
  swimming: true,
  gravityRisingHeld: requireAcceleration(
    320,
    "movement.swim.gravityRisingHeld",
  ),
  gravityRisingReleased: requireAcceleration(
    380,
    "movement.swim.gravityRisingReleased",
  ),
  gravityFalling: requireAcceleration(380, "movement.swim.gravityFalling"),
  maxFallSpeed: requireVelocity(105, "movement.swim.maxFallSpeed"),
  jumpLaunchSpeed: requireVelocity(150, "movement.swim.jumpLaunchSpeed"),
  runningJumpLaunchSpeed: requireVelocity(
    150,
    "movement.swim.runningJumpLaunchSpeed",
  ),
  // Water resists horizontal motion: lower top speeds, sluggish acceleration,
  // and more drag, so swimming feels slower and floatier than running on land.
  // (SMB's exact swim constants aren't source-verified — see the compatibility
  // study — so these are tuned toward that feel rather than measured.)
  maxWalkSpeed: requireVelocity(52, "movement.swim.maxWalkSpeed"),
  maxRunSpeed: requireVelocity(78, "movement.swim.maxRunSpeed"),
  walkAcceleration: requireAcceleration(210, "movement.swim.walkAcceleration"),
  runAcceleration: requireAcceleration(260, "movement.swim.runAcceleration"),
  airFriction: requireAcceleration(120, "movement.swim.airFriction"),
  // A Blooper senses the swimmer across a somewhat taller slice of water than a
  // land chaser (so it can drift up/down to follow) but not the whole column —
  // it should be avoidable, not clingy.
  chasingEnemyDetectionHeightPixels: 72,
  // Underwater fireballs travel straight and buoyant — no gravity, no bounce.
  projectileGravity: requireAcceleration(0, "movement.swim.projectileGravity"),
};

export function makeInitialMovementState(): MovementState {
  return {
    horizontal: HorizontalMovementState.Idle,
    vertical: VerticalMovementState.Grounded,
  };
}

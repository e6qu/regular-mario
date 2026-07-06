import type { Brand } from "./brand";
import { makeActorId } from "./identifiers";
import type { ActorId } from "./identifiers";
import { ActorRole } from "./level-spec";
import type { DomainResult } from "./result";
import { fail, succeed } from "./result";
import type { ColliderDimensionPixels } from "./units";
import { makeColliderDimensionPixels } from "./units";
import type { ValidationError } from "./validation-error";
import { makeValidationError, ValidationErrorCode } from "./validation-error";

type CompatibilityProfileId = Brand<string, "CompatibilityProfileId">;
type CompatibilitySourceActorId = Brand<string, "CompatibilitySourceActorId">;
type CompatibilityBehaviorProfileId = Brand<
  string,
  "CompatibilityBehaviorProfileId"
>;
type CompatibilityStateId = Brand<string, "CompatibilityStateId">;
type CompatibilityFeatureId = Brand<string, "CompatibilityFeatureId">;

type CompatibilityStateColliderInput = {
  readonly stateId: string;
  readonly colliderWidthPixels: number;
  readonly colliderHeightPixels: number;
};

export type CompatibilityActorProfileInput = {
  readonly sourceActorId: string;
  readonly actorId: string;
  readonly role: string;
  readonly spriteWidthPixels: number;
  readonly spriteHeightPixels: number;
  readonly colliderWidthPixels: number;
  readonly colliderHeightPixels: number;
  readonly behaviorProfileId: string;
  readonly stateColliders: readonly CompatibilityStateColliderInput[];
};

type CompatibilityNumberConstantInput = {
  readonly id: string;
  readonly value: number;
};

type CompatibilityUnsupportedFeatureInput = {
  readonly featureId: string;
  readonly reason: string;
};

export type CompatibilityProfileInput = {
  readonly profileId: string;
  readonly actors: readonly CompatibilityActorProfileInput[];
  readonly movementConstants: readonly CompatibilityNumberConstantInput[];
  readonly timers: readonly CompatibilityNumberConstantInput[];
  readonly unsupportedFeatures: readonly CompatibilityUnsupportedFeatureInput[];
};

type CompatibilityStateCollider = {
  readonly stateId: CompatibilityStateId;
  readonly colliderWidthPixels: ColliderDimensionPixels;
  readonly colliderHeightPixels: ColliderDimensionPixels;
};

type CompatibilityActorProfile = {
  readonly sourceActorId: CompatibilitySourceActorId;
  readonly actorId: ActorId;
  readonly role: ActorRole;
  readonly spriteWidthPixels: ColliderDimensionPixels;
  readonly spriteHeightPixels: ColliderDimensionPixels;
  readonly colliderWidthPixels: ColliderDimensionPixels;
  readonly colliderHeightPixels: ColliderDimensionPixels;
  readonly behaviorProfileId: CompatibilityBehaviorProfileId;
  readonly stateColliders: readonly CompatibilityStateCollider[];
};

type CompatibilityNumberConstant = {
  readonly id: CompatibilityFeatureId;
  readonly value: number;
};

type CompatibilitySpawnedPowerUpMovement = {
  readonly velocityX: number;
  readonly gravity: number;
  readonly terminalFallVelocityY: number;
};

type CompatibilityUnsupportedFeature = {
  readonly featureId: CompatibilityFeatureId;
  readonly reason: string;
};

export type CompatibilityProfile = {
  readonly profileId: CompatibilityProfileId;
  readonly actors: readonly CompatibilityActorProfile[];
  readonly movementConstants: readonly CompatibilityNumberConstant[];
  readonly spawnedPowerUpMovement:
    | CompatibilitySpawnedPowerUpMovement
    | undefined;
  readonly timers: readonly CompatibilityNumberConstant[];
  readonly unsupportedFeatures: readonly CompatibilityUnsupportedFeature[];
};

export const spawnedPowerUpVelocityXConstantId = "spawned-power-up.velocity-x";
export const spawnedPowerUpGravityConstantId = "spawned-power-up.gravity";
export const spawnedPowerUpTerminalFallVelocityYConstantId =
  "spawned-power-up.terminal-fall-velocity-y";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const compatibilityActorRoleByValue = new Map<string, ActorRole>([
  ["player-start", ActorRole.PlayerStart],
  ["enemy", ActorRole.Enemy],
  ["flying-enemy", ActorRole.FlyingEnemy],
  ["chasing-enemy", ActorRole.ChasingEnemy],
  ["armored-enemy", ActorRole.ArmoredEnemy],
  ["throwing-enemy", ActorRole.ThrowingEnemy],
  ["aerial-throwing-enemy", ActorRole.AerialThrowingEnemy],
  ["coin", ActorRole.Coin],
  ["item", ActorRole.Item],
  ["power-up", ActorRole.PowerUp],
  ["extra-life", ActorRole.ExtraLife],
  ["invincibility-power-up", ActorRole.InvincibilityPowerUp],
  ["climbable", ActorRole.Climbable],
  ["exit", ActorRole.Exit],
  ["pipe", ActorRole.Pipe],
]);

export function makeCompatibilityProfile(
  input: CompatibilityProfileInput,
): DomainResult<CompatibilityProfile, ValidationError> {
  const errors: ValidationError[] = [];
  const profileId = makeCompatibilityId(
    input.profileId,
    "profileId",
    ValidationErrorCode.CompatibilityProfileIdInvalid,
    (value) => value as CompatibilityProfileId,
  );
  const actors = parseActorProfiles(input.actors, errors);
  const movementConstants = parseNumberConstants(
    input.movementConstants,
    "movementConstants",
    errors,
  );
  const spawnedPowerUpMovement = parseSpawnedPowerUpMovement(
    movementConstants,
    errors,
  );
  const timers = parseTimerConstants(input.timers, errors);
  const unsupportedFeatures = parseUnsupportedFeatures(
    input.unsupportedFeatures,
    errors,
  );

  if (!profileId.ok) {
    errors.push(...profileId.errors);
  }

  if (errors.length > 0 || !profileId.ok) {
    return fail(errors);
  }

  return succeed({
    profileId: profileId.value,
    actors,
    movementConstants,
    spawnedPowerUpMovement,
    timers,
    unsupportedFeatures,
  });
}

function parseActorProfiles(
  input: readonly CompatibilityActorProfileInput[],
  errors: ValidationError[],
): readonly CompatibilityActorProfile[] {
  const actors: CompatibilityActorProfile[] = [];
  const sourceActorIds = new Set<string>();

  for (const [actorIndex, actorInput] of input.entries()) {
    const path = `actors[${actorIndex}]`;
    const sourceActorId = makeCompatibilityId(
      actorInput.sourceActorId,
      `${path}.sourceActorId`,
      ValidationErrorCode.CompatibilitySourceActorIdInvalid,
      (value) => value as CompatibilitySourceActorId,
    );
    const actorId = makeActorId(actorInput.actorId, `${path}.actorId`);
    const role = makeCompatibilityActorRole(actorInput.role, `${path}.role`);
    const spriteWidth = makeColliderDimensionPixels(
      actorInput.spriteWidthPixels,
      `${path}.spriteWidthPixels`,
    );
    const spriteHeight = makeColliderDimensionPixels(
      actorInput.spriteHeightPixels,
      `${path}.spriteHeightPixels`,
    );
    const colliderWidth = makeColliderDimensionPixels(
      actorInput.colliderWidthPixels,
      `${path}.colliderWidthPixels`,
    );
    const colliderHeight = makeColliderDimensionPixels(
      actorInput.colliderHeightPixels,
      `${path}.colliderHeightPixels`,
    );
    const behaviorProfileId = makeCompatibilityId(
      actorInput.behaviorProfileId,
      `${path}.behaviorProfileId`,
      ValidationErrorCode.CompatibilityBehaviorProfileIdInvalid,
      (value) => value as CompatibilityBehaviorProfileId,
    );
    const stateColliders = parseStateColliders(
      actorInput.stateColliders,
      path,
      errors,
    );

    if (sourceActorId.ok) {
      if (sourceActorIds.has(actorInput.sourceActorId)) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.CompatibilitySourceActorIdInvalid,
            `${path}.sourceActorId must be unique within the compatibility profile.`,
            `${path}.sourceActorId`,
          ),
        );
      } else {
        sourceActorIds.add(actorInput.sourceActorId);
      }
    } else {
      errors.push(...sourceActorId.errors);
    }

    pushResultErrors(
      errors,
      actorId,
      role,
      spriteWidth,
      spriteHeight,
      colliderWidth,
      colliderHeight,
      behaviorProfileId,
    );

    if (
      sourceActorId.ok &&
      actorId.ok &&
      role.ok &&
      spriteWidth.ok &&
      spriteHeight.ok &&
      colliderWidth.ok &&
      colliderHeight.ok &&
      behaviorProfileId.ok
    ) {
      actors.push({
        sourceActorId: sourceActorId.value,
        actorId: actorId.value,
        role: role.value,
        spriteWidthPixels: spriteWidth.value,
        spriteHeightPixels: spriteHeight.value,
        colliderWidthPixels: colliderWidth.value,
        colliderHeightPixels: colliderHeight.value,
        behaviorProfileId: behaviorProfileId.value,
        stateColliders,
      });
    }
  }

  return actors;
}

function parseStateColliders(
  input: readonly CompatibilityStateColliderInput[],
  actorPath: string,
  errors: ValidationError[],
): readonly CompatibilityStateCollider[] {
  const stateColliders: CompatibilityStateCollider[] = [];
  const stateIds = new Set<string>();

  for (const [stateIndex, stateInput] of input.entries()) {
    const path = `${actorPath}.stateColliders[${stateIndex}]`;
    const stateId = makeCompatibilityId(
      stateInput.stateId,
      `${path}.stateId`,
      ValidationErrorCode.CompatibilityStateIdInvalid,
      (value) => value as CompatibilityStateId,
    );
    const colliderWidth = makeColliderDimensionPixels(
      stateInput.colliderWidthPixels,
      `${path}.colliderWidthPixels`,
    );
    const colliderHeight = makeColliderDimensionPixels(
      stateInput.colliderHeightPixels,
      `${path}.colliderHeightPixels`,
    );

    if (stateId.ok) {
      if (stateIds.has(stateInput.stateId)) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.CompatibilityStateIdInvalid,
            `${path}.stateId must be unique for this actor profile.`,
            `${path}.stateId`,
          ),
        );
      } else {
        stateIds.add(stateInput.stateId);
      }
    } else {
      errors.push(...stateId.errors);
    }

    pushResultErrors(errors, colliderWidth, colliderHeight);

    if (stateId.ok && colliderWidth.ok && colliderHeight.ok) {
      stateColliders.push({
        stateId: stateId.value,
        colliderWidthPixels: colliderWidth.value,
        colliderHeightPixels: colliderHeight.value,
      });
    }
  }

  return stateColliders;
}

function parseNumberConstants(
  input: readonly CompatibilityNumberConstantInput[],
  path: string,
  errors: ValidationError[],
): readonly CompatibilityNumberConstant[] {
  const constants: CompatibilityNumberConstant[] = [];
  const ids = new Set<string>();

  for (const [constantIndex, constantInput] of input.entries()) {
    const constantPath = `${path}[${constantIndex}]`;
    const id = makeCompatibilityId(
      constantInput.id,
      `${constantPath}.id`,
      ValidationErrorCode.CompatibilityFeatureInvalid,
      (value) => value as CompatibilityFeatureId,
    );

    if (id.ok) {
      if (ids.has(constantInput.id)) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.CompatibilityFeatureInvalid,
            `${constantPath}.id must be unique within ${path}.`,
            `${constantPath}.id`,
          ),
        );
      } else {
        ids.add(constantInput.id);
      }
    } else {
      errors.push(...id.errors);
    }

    if (!Number.isFinite(constantInput.value)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.CompatibilityNumberInvalid,
          `${constantPath}.value must be a finite number.`,
          `${constantPath}.value`,
        ),
      );
      continue;
    }

    if (id.ok) {
      constants.push({
        id: id.value,
        value: constantInput.value,
      });
    }
  }

  return constants;
}

function parseTimerConstants(
  input: readonly CompatibilityNumberConstantInput[],
  errors: ValidationError[],
): readonly CompatibilityNumberConstant[] {
  const timers = parseNumberConstants(input, "timers", errors);

  for (const [timerIndex, timerInput] of input.entries()) {
    if (!Number.isSafeInteger(timerInput.value) || timerInput.value <= 0) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.CompatibilityNumberInvalid,
          `timers[${timerIndex}].value must be a positive safe integer frame count.`,
          `timers[${timerIndex}].value`,
        ),
      );
    }
  }

  return timers.filter(
    (timer) => Number.isSafeInteger(timer.value) && timer.value > 0,
  );
}

function parseSpawnedPowerUpMovement(
  movementConstants: readonly CompatibilityNumberConstant[],
  errors: ValidationError[],
): CompatibilitySpawnedPowerUpMovement | undefined {
  const constantsById = new Map(
    movementConstants.map((constant) => [String(constant.id), constant.value]),
  );
  const ids = [
    spawnedPowerUpVelocityXConstantId,
    spawnedPowerUpGravityConstantId,
    spawnedPowerUpTerminalFallVelocityYConstantId,
  ];
  const suppliedIds = ids.filter((id) => constantsById.has(id));

  if (suppliedIds.length === 0) {
    return undefined;
  }

  const velocityX = constantsById.get(spawnedPowerUpVelocityXConstantId);
  const gravity = constantsById.get(spawnedPowerUpGravityConstantId);
  const terminalFallVelocityY = constantsById.get(
    spawnedPowerUpTerminalFallVelocityYConstantId,
  );

  if (gravity !== undefined && gravity <= 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.CompatibilityNumberInvalid,
        `${spawnedPowerUpGravityConstantId} must be a positive finite number.`,
        "movementConstants",
      ),
    );
  }

  if (terminalFallVelocityY !== undefined && terminalFallVelocityY <= 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.CompatibilityNumberInvalid,
        `${spawnedPowerUpTerminalFallVelocityYConstantId} must be a positive finite number.`,
        "movementConstants",
      ),
    );
  }

  if (suppliedIds.length !== ids.length) {
    for (const id of ids) {
      if (!constantsById.has(id)) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.CompatibilityFeatureInvalid,
            `movementConstants must include ${id} when any spawned power-up movement constant is supplied.`,
            "movementConstants",
          ),
        );
      }
    }

    return undefined;
  }

  if (
    velocityX === undefined ||
    gravity === undefined ||
    terminalFallVelocityY === undefined
  ) {
    throw new Error("Spawned power-up movement constants are incomplete.");
  }

  if (gravity <= 0 || terminalFallVelocityY <= 0) {
    return undefined;
  }

  return {
    velocityX,
    gravity,
    terminalFallVelocityY,
  };
}

function parseUnsupportedFeatures(
  input: readonly CompatibilityUnsupportedFeatureInput[],
  errors: ValidationError[],
): readonly CompatibilityUnsupportedFeature[] {
  const features: CompatibilityUnsupportedFeature[] = [];
  const featureIds = new Set<string>();

  for (const [featureIndex, featureInput] of input.entries()) {
    const path = `unsupportedFeatures[${featureIndex}]`;
    const featureId = makeCompatibilityId(
      featureInput.featureId,
      `${path}.featureId`,
      ValidationErrorCode.CompatibilityFeatureInvalid,
      (value) => value as CompatibilityFeatureId,
    );

    if (featureId.ok) {
      if (featureIds.has(featureInput.featureId)) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.CompatibilityFeatureInvalid,
            `${path}.featureId must be unique within unsupportedFeatures.`,
            `${path}.featureId`,
          ),
        );
      } else {
        featureIds.add(featureInput.featureId);
      }
    } else {
      errors.push(...featureId.errors);
    }

    if (featureInput.reason.trim().length === 0) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.CompatibilityFeatureInvalid,
          `${path}.reason must be non-empty.`,
          `${path}.reason`,
        ),
      );
    }

    if (featureId.ok && featureInput.reason.trim().length > 0) {
      features.push({
        featureId: featureId.value,
        reason: featureInput.reason,
      });
    }
  }

  return features;
}

function makeCompatibilityActorRole(
  value: string,
  path: string,
): DomainResult<ActorRole, ValidationError> {
  const actorRole = compatibilityActorRoleByValue.get(value);

  if (actorRole !== undefined) {
    return succeed(actorRole);
  }

  return fail([
    makeValidationError(
      ValidationErrorCode.CompatibilityActorInvalid,
      `${path} must be a supported ActorRole value.`,
      path,
    ),
  ]);
}

function makeCompatibilityId<Value>(
  value: string,
  path: string,
  errorCode: ValidationErrorCode,
  brandValue: (acceptedValue: string) => Value,
): DomainResult<Value, ValidationError> {
  if (!idPattern.test(value)) {
    return fail([
      makeValidationError(
        errorCode,
        `${path} must start with an alphanumeric character and contain only alphanumerics, dots, underscores, colons, or hyphens.`,
        path,
      ),
    ]);
  }

  return succeed(brandValue(value));
}

function pushResultErrors(
  errors: ValidationError[],
  ...results: readonly DomainResult<unknown, ValidationError>[]
): void {
  for (const result of results) {
    if (!result.ok) {
      errors.push(...result.errors);
    }
  }
}

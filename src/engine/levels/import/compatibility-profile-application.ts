import type { CompatibilityProfile } from "../../domain/compatibility-profile";
import type { LevelSpecInput } from "../../domain/level-spec";

export function applyCompatibilityProfileToLevelInput(
  levelSpecInput: LevelSpecInput,
  compatibilityProfile: CompatibilityProfile | undefined,
): LevelSpecInput {
  if (compatibilityProfile === undefined) {
    return levelSpecInput;
  }

  const actorProfileByActorId = new Map(
    compatibilityProfile.actors.map((actorProfile) => [
      String(actorProfile.actorId),
      actorProfile,
    ]),
  );

  const appliedInput: LevelSpecInput = {
    ...levelSpecInput,
    levelTimers: [
      ...(levelSpecInput.levelTimers ?? []),
      ...compatibilityProfile.timers.map((timer) => ({
        timerId: String(timer.id),
        frames: timer.value,
      })),
    ],
    actorDefinitions: levelSpecInput.actorDefinitions.map((actorDefinition) => {
      const actorProfile = actorProfileByActorId.get(actorDefinition.actorId);

      if (actorProfile === undefined) {
        return actorDefinition;
      }

      return {
        ...actorDefinition,
        spriteWidthPixels: actorProfile.spriteWidthPixels,
        spriteHeightPixels: actorProfile.spriteHeightPixels,
        colliderWidthPixels: actorProfile.colliderWidthPixels,
        colliderHeightPixels: actorProfile.colliderHeightPixels,
      };
    }),
  };

  if (compatibilityProfile.spawnedPowerUpMovement === undefined) {
    return appliedInput;
  }

  return {
    ...appliedInput,
    spawnedPowerUpMovement: compatibilityProfile.spawnedPowerUpMovement,
  };
}

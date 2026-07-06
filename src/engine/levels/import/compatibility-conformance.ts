import type { CompatibilityProfile } from "../../domain/compatibility-profile";
import type { LevelSpecInput } from "../../domain/level-spec";

export enum CompatibilityConformanceIssueKind {
  UnsupportedFeature = "unsupported-feature",
  ActorProfileUnmapped = "actor-profile-unmapped",
  ActorRoleMismatch = "actor-role-mismatch",
}

type CompatibilityConformanceIssue = {
  readonly kind: CompatibilityConformanceIssueKind;
  readonly message: string;
  readonly sourceActorId: string | undefined;
  readonly actorId: string | undefined;
  readonly featureId: string | undefined;
};

export type CompatibilityConformanceReport = {
  readonly profileId: string | undefined;
  readonly actorProfileCount: number;
  readonly unsupportedFeatureCount: number;
  readonly issues: readonly CompatibilityConformanceIssue[];
};

export function makeCompatibilityConformanceReport(
  levelSpecInput: LevelSpecInput,
  compatibilityProfile: CompatibilityProfile | undefined,
): CompatibilityConformanceReport {
  if (compatibilityProfile === undefined) {
    return {
      profileId: undefined,
      actorProfileCount: 0,
      unsupportedFeatureCount: 0,
      issues: [],
    };
  }

  const actorRoleByActorId = new Map(
    levelSpecInput.actorDefinitions.map((definition) => [
      definition.actorId,
      definition.role,
    ]),
  );
  const issues: CompatibilityConformanceIssue[] = [];

  for (const actorProfile of compatibilityProfile.actors) {
    const importedRole = actorRoleByActorId.get(actorProfile.actorId);

    if (importedRole === undefined) {
      issues.push({
        kind: CompatibilityConformanceIssueKind.ActorProfileUnmapped,
        message: `Compatibility actor profile ${actorProfile.sourceActorId} maps to actorId ${actorProfile.actorId}, but that actorId is not defined by the imported level.`,
        sourceActorId: actorProfile.sourceActorId,
        actorId: actorProfile.actorId,
        featureId: undefined,
      });
      continue;
    }

    if (importedRole !== String(actorProfile.role)) {
      issues.push({
        kind: CompatibilityConformanceIssueKind.ActorRoleMismatch,
        message: `Compatibility actor profile ${actorProfile.sourceActorId} expects role ${actorProfile.role}, but imported actorId ${actorProfile.actorId} has role ${importedRole}.`,
        sourceActorId: actorProfile.sourceActorId,
        actorId: actorProfile.actorId,
        featureId: undefined,
      });
    }
  }

  for (const unsupportedFeature of compatibilityProfile.unsupportedFeatures) {
    issues.push({
      kind: CompatibilityConformanceIssueKind.UnsupportedFeature,
      message: unsupportedFeature.reason,
      sourceActorId: undefined,
      actorId: undefined,
      featureId: unsupportedFeature.featureId,
    });
  }

  return {
    profileId: compatibilityProfile.profileId,
    actorProfileCount: compatibilityProfile.actors.length,
    unsupportedFeatureCount: compatibilityProfile.unsupportedFeatures.length,
    issues,
  };
}

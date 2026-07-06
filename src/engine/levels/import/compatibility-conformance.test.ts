import { describe, expect, it } from "vitest";

import {
  makeCompatibilityProfile,
  type CompatibilityProfileInput,
} from "../../domain/compatibility-profile";
import { ActorRole, type LevelSpecInput } from "../../domain/level-spec";
import {
  CompatibilityConformanceIssueKind,
  makeCompatibilityConformanceReport,
} from "./compatibility-conformance";

function makeLevelSpecInput(): LevelSpecInput {
  return {
    widthTiles: 2,
    heightTiles: 2,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "sky", collision: "empty" },
      { tileId: "ground", collision: "solid" },
    ],
    actorDefinitions: [
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      { actorId: "beetle", role: ActorRole.Enemy },
      { actorId: "open-gate", role: ActorRole.Exit },
    ],
    tiles: [
      ["sky", "sky"],
      ["ground", "ground"],
    ],
    actors: [
      { entityId: "runner-1", actorId: "runner-start", x: 0, y: 0 },
      { entityId: "exit-1", actorId: "open-gate", x: 1, y: 0 },
    ],
  };
}

function makeProfile(input: CompatibilityProfileInput) {
  const result = makeCompatibilityProfile(input);

  if (!result.ok) {
    throw new Error("Expected synthetic compatibility profile to validate.");
  }

  return result.value;
}

function makeProfileInput(): CompatibilityProfileInput {
  return {
    profileId: "synthetic-profile",
    actors: [
      {
        sourceActorId: "source:runner",
        actorId: "runner-start",
        role: ActorRole.PlayerStart,
        spriteWidthPixels: 13,
        spriteHeightPixels: 15,
        colliderWidthPixels: 11,
        colliderHeightPixels: 15,
        behaviorProfileId: "profile.runner",
        stateColliders: [],
      },
      {
        sourceActorId: "source:walker",
        actorId: "beetle",
        role: ActorRole.Enemy,
        spriteWidthPixels: 18,
        spriteHeightPixels: 12,
        colliderWidthPixels: 17,
        colliderHeightPixels: 10,
        behaviorProfileId: "profile.walker",
        stateColliders: [],
      },
    ],
    movementConstants: [],
    timers: [],
    unsupportedFeatures: [],
  };
}

describe("makeCompatibilityConformanceReport", () => {
  it("returns an empty report when no compatibility profile is loaded", () => {
    const report = makeCompatibilityConformanceReport(
      makeLevelSpecInput(),
      undefined,
    );

    expect(report).toEqual({
      profileId: undefined,
      actorProfileCount: 0,
      unsupportedFeatureCount: 0,
      issues: [],
    });
  });

  it("accepts profile actors that map to imported actor definitions with matching roles", () => {
    const report = makeCompatibilityConformanceReport(
      makeLevelSpecInput(),
      makeProfile(makeProfileInput()),
    );

    expect(report.profileId).toBe("synthetic-profile");
    expect(report.actorProfileCount).toBe(2);
    expect(report.issues).toEqual([]);
  });

  it("reports unsupported profile features explicitly", () => {
    const report = makeCompatibilityConformanceReport(
      makeLevelSpecInput(),
      makeProfile({
        ...makeProfileInput(),
        unsupportedFeatures: [
          {
            featureId: "screen-wrap",
            reason: "The runtime does not support horizontal screen wrapping.",
          },
        ],
      }),
    );

    expect(report.unsupportedFeatureCount).toBe(1);
    expect(report.issues).toContainEqual({
      kind: CompatibilityConformanceIssueKind.UnsupportedFeature,
      message: "The runtime does not support horizontal screen wrapping.",
      sourceActorId: undefined,
      actorId: undefined,
      featureId: "screen-wrap",
    });
  });

  it("reports unmapped actor profiles and role mismatches", () => {
    const profileInput = makeProfileInput();
    const report = makeCompatibilityConformanceReport(
      makeLevelSpecInput(),
      makeProfile({
        ...profileInput,
        actors: [
          {
            ...profileInput.actors[0]!,
            role: ActorRole.Enemy,
          },
          {
            ...profileInput.actors[1]!,
            actorId: "unknown-actor",
          },
        ],
      }),
    );

    expect(report.issues.map((issue) => issue.kind)).toEqual([
      CompatibilityConformanceIssueKind.ActorRoleMismatch,
      CompatibilityConformanceIssueKind.ActorProfileUnmapped,
    ]);
  });
});

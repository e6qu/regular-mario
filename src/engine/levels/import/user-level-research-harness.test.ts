import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { makeCompatibilityProfile } from "../../domain/compatibility-profile";
import { makeLevelSpec } from "../../domain/level-spec";
import {
  parseUserAssetManifest,
  UserAssetSourceKind,
  UserLevelEntryFormat,
  type UserAssetManifest,
  type UserAssetSource,
} from "../../domain/user-asset-manifest";
import { makeCompatibilityConformanceReport } from "./compatibility-conformance";
import { applyCompatibilityProfileToLevelInput } from "./compatibility-profile-application";
import {
  importUserLevel,
  UserLevelFileContentKind,
  type UserLevelFileContent,
} from "./level-importer-registry";

const researchManifestPath = process.env.REGULAR_MARIO_RESEARCH_MANIFEST;
const cacheRoot = resolve(".cache/user-levels");

function assertCachePath(filePath: string): void {
  const resolvedPath = resolve(filePath);

  if (
    resolvedPath !== cacheRoot &&
    !resolvedPath.startsWith(`${cacheRoot}${sep}`)
  ) {
    throw new Error(
      `Research harness input ${resolvedPath} must be under .cache/user-levels.`,
    );
  }
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function loadResearchManifest(manifestPath: string): UserAssetManifest {
  assertCachePath(manifestPath);

  const manifestResult = parseUserAssetManifest(
    readJsonFile(manifestPath) as never,
  );

  if (!manifestResult.ok) {
    throw new Error(
      manifestResult.errors
        .map((error) => `${error.path}: ${error.message} (${error.code})`)
        .join("\n"),
    );
  }

  return manifestResult.value;
}

function resolveCacheFile(
  manifestPath: string,
  source: UserAssetSource,
): string {
  if (source.kind !== UserAssetSourceKind.File) {
    throw new Error(
      "Research harness manifests must reference already-downloaded local files, not URL sources.",
    );
  }

  const filePath = resolve(dirname(manifestPath), source.fileName);
  assertCachePath(filePath);
  return filePath;
}

function makeLevelFileContent(
  filePath: string,
  format: UserLevelEntryFormat,
): UserLevelFileContent {
  const text = readFileSync(filePath, "utf8");

  if (
    format === UserLevelEntryFormat.VglcText ||
    format === UserLevelEntryFormat.VglcSmbText ||
    format === UserLevelEntryFormat.VglcSmbMultiLayer
  ) {
    return {
      kind: UserLevelFileContentKind.Text,
      value: text,
    };
  }

  return {
    kind: UserLevelFileContentKind.Json,
    value: JSON.parse(text) as unknown,
  };
}

if (researchManifestPath === undefined) {
  describe.skip("user level compatibility research harness", () => {
    it("requires REGULAR_MARIO_RESEARCH_MANIFEST", () => {
      expect(researchManifestPath).toBeUndefined();
    });
  });
} else {
  describe("user level compatibility research harness", () => {
    const manifestPath = researchManifestPath;
    const manifest = loadResearchManifest(manifestPath);

    for (const levelEntry of manifest.levels) {
      it(`imports and validates cached user level "${levelEntry.name}"`, () => {
        const levelPath = resolveCacheFile(manifestPath, levelEntry.source);
        const importMetadata =
          levelEntry.importMetadataSource === undefined
            ? undefined
            : readJsonFile(
                resolveCacheFile(manifestPath, levelEntry.importMetadataSource),
              );
        const importResult = importUserLevel(
          levelEntry.format,
          makeLevelFileContent(levelPath, levelEntry.format),
          importMetadata,
        );

        if (!importResult.ok) {
          throw new Error(
            importResult.errors
              .map((error) => `${error.path}: ${error.message} (${error.code})`)
              .join("\n"),
          );
        }
        expect(importResult.ok).toBe(true);

        const compatibilityProfile =
          levelEntry.compatibilityProfileSource === undefined
            ? undefined
            : makeResearchCompatibilityProfile(
                resolveCacheFile(
                  manifestPath,
                  levelEntry.compatibilityProfileSource,
                ),
              );
        const conformanceReport = makeCompatibilityConformanceReport(
          importResult.value,
          compatibilityProfile,
        );

        expect(conformanceReport.issues).toEqual([]);

        const runtimeLevelSpecInput = applyCompatibilityProfileToLevelInput(
          importResult.value,
          compatibilityProfile,
        );
        const levelSpecResult = makeLevelSpec(runtimeLevelSpecInput);

        if (!levelSpecResult.ok) {
          throw new Error(
            levelSpecResult.errors
              .map((error) => `${error.path}: ${error.message} (${error.code})`)
              .join("\n"),
          );
        }
        expect(levelSpecResult.ok).toBe(true);
      });
    }
  });
}

function makeResearchCompatibilityProfile(profilePath: string) {
  const profileResult = makeCompatibilityProfile(
    readJsonFile(profilePath) as never,
  );

  if (!profileResult.ok) {
    throw new Error(
      profileResult.errors
        .map((error) => `${error.path}: ${error.message} (${error.code})`)
        .join("\n"),
    );
  }

  return profileResult.value;
}

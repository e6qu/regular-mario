// Shared loader for tests over the committed official-smb map set: parses and
// validates every level in the pack once, exposing the raw metadata alongside
// the resolved LevelSpec.

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { makeLevelSpec } from "../../domain/level-spec";
import type { LevelSpec } from "../../domain/level-spec";
import { parseVglcSmbMultiLayerLevel } from "./vglc-smb-text-level";

export const officialSmbPackDir = resolve("content/map-sets/official-smb");

export type OfficialPackLevel = {
  readonly name: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly levelSpec: LevelSpec;
};

export function loadOfficialSmbPack(): ReadonlyMap<string, OfficialPackLevel> {
  const levels = new Map<string, OfficialPackLevel>();
  for (const file of readdirSync(officialSmbPackDir)) {
    if (!file.endsWith(".txt")) {
      continue;
    }
    const name = file.replace(/\.txt$/, "");
    const text = readFileSync(resolve(officialSmbPackDir, file), "utf8");
    const metadata = JSON.parse(
      readFileSync(
        resolve(officialSmbPackDir, `${name}.metadata.json`),
        "utf8",
      ),
    ) as Readonly<Record<string, unknown>>;
    const parsed = parseVglcSmbMultiLayerLevel(text, metadata);
    if (!parsed.ok) {
      throw new Error(
        `${name} failed to parse: ${parsed.errors
          .map((error) => error.message)
          .join(", ")}`,
      );
    }
    const spec = makeLevelSpec(parsed.value);
    if (!spec.ok) {
      throw new Error(
        `${name} failed to validate: ${spec.errors
          .map((error) => error.message)
          .join(", ")}`,
      );
    }
    levels.set(name, { name, metadata, levelSpec: spec.value });
  }
  return levels;
}

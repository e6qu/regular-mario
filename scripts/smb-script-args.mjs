// Shared argument resolution for the SMB ROM tooling: a user-supplied ROM path
// and an ignored-cache output directory. Keeps the acquisition/extraction/
// capture scripts consistent and free of duplicated CLI boilerplate.

import { resolve } from "node:path";

import {
  assertUserLevelCachePath,
  readOption,
} from "./user-level-cache-policy.mjs";

export function resolveRomPath(defaultRomPath) {
  return resolve(readOption("--rom") ?? defaultRomPath);
}

export function resolveCacheOutputDirectory(defaultOutputDirectory) {
  return assertUserLevelCachePath(
    readOption("--out-dir") ?? defaultOutputDirectory,
    "--out-dir",
  );
}

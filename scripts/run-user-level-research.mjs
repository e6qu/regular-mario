#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  assertUserLevelCachePath,
  requireOption,
} from "./user-level-cache-policy.mjs";

const harnessTestPath =
  "src/engine/levels/import/user-level-research-harness.test.ts";

function printUsage() {
  console.log(`Usage:
  node scripts/run-user-level-research.mjs --manifest .cache/user-levels/research-manifest.json

Runs the compatibility import research harness against local user-provided files.
The manifest and all referenced files must already be under .cache/user-levels.
No downloaded maps, ROMs, patches, extracted assets, or generated dumps are tracked by git.`);
}

function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const manifestPath = assertUserLevelCachePath(
    requireOption("--manifest"),
    "Research manifest",
  );

  if (!existsSync(manifestPath)) {
    throw new Error(`Research manifest does not exist: ${manifestPath}`);
  }

  execFileSync("pnpm", ["exec", "vitest", "run", harnessTestPath], {
    env: {
      ...process.env,
      REGULAR_MARIO_RESEARCH_MANIFEST: manifestPath,
    },
    stdio: "inherit",
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

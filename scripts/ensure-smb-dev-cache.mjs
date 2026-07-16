#!/usr/bin/env node
// Dev-server cache gate (Decision 0018, Milestone 8 phase A5). `pnpm run dev`
// runs this first so the default route can boot the local SMB bundle:
// - complete cache: proceed.
// - incomplete + a user-supplied ROM source available: run prepare:smb
//   automatically, then proceed.
// - incomplete + no ROM source: print setup instructions and proceed; the
//   default browser route fails visibly instead of booting placeholders.

import { runNodeScriptInherit } from "./run-node-script.mjs";
import {
  computePipelineStamp,
  readPipelineStamp,
  writePipelineStamp,
} from "./content-pipeline-stamp.mjs";
import {
  defaultSmbCacheRoot,
  readSmbCacheStatus,
} from "./smb-cache-status.mjs";
import {
  assertUserLevelCachePath,
  readOption,
} from "./user-level-cache-policy.mjs";

const skipEnvironmentVariableName = "SMB_DEV_SKIP_PREP";

const setupInstructions = `SMB dev cache is incomplete and no ROM source is configured, so the default
route will show a visible import failure instead of the faithful SMB level.
To enable it, supply your own legally obtained ROM once:

  pnpm run acquire:smb -- --rom /path/to/your/smb.nes
  pnpm run prepare:smb

or set SMB_ROM=/path/to/your/smb.nes before pnpm run dev. Set
${skipEnvironmentVariableName}=1 to silence this check for non-SMB work.`;

async function runPrepareSmb() {
  await runNodeScriptInherit(
    "scripts/prepare-smb.mjs",
    [],
    (code) =>
      `prepare:smb failed with exit code ${code}; fix the reported step before running dev, or set ${skipEnvironmentVariableName}=1 for non-SMB work.`,
  );
}

async function main() {
  if (process.env[skipEnvironmentVariableName] === "1") {
    console.log(
      `Skipping SMB dev cache check because ${skipEnvironmentVariableName}=1.`,
    );
    return;
  }

  const dryRun = process.argv.includes("--dry-run");
  const cacheRootOption = readOption("--cache-root");
  const cacheRoot =
    cacheRootOption === undefined
      ? defaultSmbCacheRoot
      : assertUserLevelCachePath(cacheRootOption, "--cache-root");
  const status = await readSmbCacheStatus(cacheRoot);

  if (status.browserDemoManifest) {
    // Complete — but is it FRESH? A pulled change to the content pipeline
    // (level decoder, asset/map builders) leaves previously-built maps and
    // bundles stale; rebuild the content steps when the stamp mismatches.
    const expectedStamp = await computePipelineStamp();
    if ((await readPipelineStamp()) === expectedStamp) {
      console.log("SMB dev cache is ready.");
      return;
    }
    if (dryRun) {
      console.log(
        "SMB dev cache content is stale (pipeline scripts changed); the content steps would rebuild now.",
      );
      return;
    }
    console.log(
      "SMB dev cache content is stale (pipeline scripts changed); rebuilding content sets ...",
    );
    for (const [script, args] of [
      ["scripts/build-rom-asset-set.mjs", []],
      ["scripts/build-parody-asset-set.mjs", []],
      ["scripts/build-official-map-set.mjs", []],
      ["scripts/build-sound-packs.mjs", []],
      ["scripts/content-sets.mjs", ["index"]],
      ["scripts/content-sets.mjs", ["bundle-all"]],
    ]) {
      await runNodeScriptInherit(
        script,
        args,
        (code) => `${script} failed with exit code ${code}.`,
      );
    }
    await writePipelineStamp(expectedStamp);
    return;
  }

  const romSourceAvailable = status.rom || process.env.SMB_ROM !== undefined;

  if (romSourceAvailable) {
    if (dryRun) {
      console.log(
        "SMB dev cache is incomplete; a ROM source is available, so prepare:smb would run now.",
      );
      return;
    }

    console.log("SMB dev cache is incomplete; running prepare:smb ...");
    await runPrepareSmb();
    return;
  }

  console.error(setupInstructions);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

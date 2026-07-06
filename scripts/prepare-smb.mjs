#!/usr/bin/env node
// One-command SMB dev cache preparation (Decision 0018, Milestone 8 phase A4):
// acquire sources -> extract ROM graphics -> generate VGLC research metadata ->
// build the local asset fragment -> pack the browser-demo bundle. Every output
// stays under ignored .cache/user-levels; nothing is committed.

import { resolve } from "node:path";

import { runNodeScriptInherit } from "./run-node-script.mjs";
import {
  defaultSmbCacheRoot,
  readSmbCacheStatus,
  resolveSmbCachePaths,
} from "./smb-cache-status.mjs";
import {
  assertUserLevelCachePath,
  readOption,
} from "./user-level-cache-policy.mjs";

function printUsage() {
  console.log(`Usage:
  pnpm run prepare:smb -- [options]

Options:
  --rom <path-or-url>       User-supplied SMB ROM source, forwarded to
                            acquire:smb (also read from the SMB_ROM env var).
  --expected-sha256 <hex>   Forwarded to acquire:smb for checksum pinning.
  --force                   Rerun every step even when outputs exist.
  --status                  Print cache artifact status JSON and exit.
  --dry-run                 Print the planned steps without running them.
  --cache-root <path>       Cache root override for --status/--dry-run tests
                            only; running steps requires the default root.

Runs only the steps whose outputs are missing. The ROM is always user-supplied;
when it is missing this fails loudly with setup instructions from acquire:smb.`);
}

function buildPlan({ status, force, romSource, expectedSha256, cacheRoot }) {
  const paths = resolveSmbCachePaths(cacheRoot);
  const steps = [];

  if (force || romSource !== undefined || !status.vglcMarker || !status.rom) {
    const args = [];

    if (romSource !== undefined) {
      args.push("--rom", romSource);
    }

    if (expectedSha256 !== undefined) {
      args.push("--expected-sha256", expectedSha256);
    }

    steps.push({
      id: "acquire",
      script: "scripts/acquire-smb-sources.mjs",
      args,
    });
  }

  if (force || !status.extractionReport) {
    steps.push({
      id: "extract",
      script: "scripts/extract-smb-rom-assets.mjs",
      args: [],
    });
  }

  if (force || !status.researchManifest) {
    steps.push({
      id: "research",
      script: "scripts/prepare-vglc-smb-research.mjs",
      args: ["--smb-root", resolve(cacheRoot, "vglc/Super Mario Bros")],
    });
  }

  if (force || !status.assetFragment) {
    steps.push({
      id: "fragment",
      script: "scripts/prepare-vglc-smb-asset-fragment.mjs",
      args: [
        "--fill-vglc-smb-1-1-from-reference",
        resolve(cacheRoot, "vglc/Super Mario Bros/Original/mario-1-1.png"),
      ],
    });
  }

  if (force || steps.length > 0 || !status.browserDemoManifest) {
    steps.push({
      id: "browser-demo",
      script: "scripts/prepare-vglc-smb-browser-demo.mjs",
      args: [],
    });
  }

  // Content sets (Decision 0019): assemble the rom-extracted and parody asset
  // sets, the official map set, the dropdown index, and a ready-to-boot bundle
  // of the default pair. These follow extraction/research so the composed
  // sprites and level exist.
  if (force || steps.length > 0) {
    steps.push(
      {
        id: "rom-asset-set",
        script: "scripts/build-rom-asset-set.mjs",
        args: [],
      },
      {
        id: "parody-asset-set",
        script: "scripts/build-parody-asset-set.mjs",
        args: [],
      },
      {
        id: "official-map-set",
        script: "scripts/build-official-map-set.mjs",
        args: [],
      },
      {
        id: "sound-packs",
        script: "scripts/build-sound-packs.mjs",
        args: [],
      },
      {
        id: "content-sets-index",
        script: "scripts/content-sets.mjs",
        args: ["index"],
      },
      {
        id: "content-sets-bundle",
        script: "scripts/content-sets.mjs",
        args: ["bundle-all"],
      },
    );
  }

  return { paths, steps };
}

async function runStep(step) {
  console.log(`\n=== prepare:smb step "${step.id}" ===`);

  await runNodeScriptInherit(
    step.script,
    step.args,
    (code) => `prepare:smb step "${step.id}" failed with exit code ${code}.`,
  );
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const statusOnly = process.argv.includes("--status");
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const cacheRootOption = readOption("--cache-root");
  const cacheRoot =
    cacheRootOption === undefined
      ? defaultSmbCacheRoot
      : assertUserLevelCachePath(cacheRootOption, "--cache-root");

  if (cacheRootOption !== undefined && !statusOnly && !dryRun) {
    throw new Error(
      "--cache-root is only supported with --status or --dry-run; running steps requires the default cache root because the underlying scripts write there.",
    );
  }

  const status = await readSmbCacheStatus(cacheRoot);

  if (statusOnly) {
    console.log(JSON.stringify({ cacheRoot, status }, null, 2));
    return;
  }

  const { steps } = buildPlan({
    status,
    force,
    romSource: readOption("--rom") ?? process.env.SMB_ROM,
    expectedSha256: readOption("--expected-sha256"),
    cacheRoot,
  });

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          cacheRoot,
          status,
          plannedSteps: steps.map((step) => ({
            id: step.id,
            script: step.script,
            args: step.args,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (steps.length === 0) {
    console.log("SMB dev cache is already complete; nothing to do.");
    return;
  }

  for (const step of steps) {
    await runStep(step);
  }

  const finalStatus = await readSmbCacheStatus(cacheRoot);

  if (!finalStatus.browserDemoManifest) {
    throw new Error(
      "prepare:smb finished but the browser-demo manifest is still missing; inspect the step output above.",
    );
  }

  console.log("\nSMB dev cache is ready. Start the game with: pnpm run dev");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

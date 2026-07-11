#!/usr/bin/env node
// Assemble the static content the public release serves: the authored
// "Shabby Castaway" skin composed with the committed numeric SMB level layouts,
// written to `public/game-content/` as plain relative-path files (no ROM, no
// dev-server middleware). GitHub Pages / `vite build` then serve it verbatim.
//
// The authored skin sprites are regenerated deterministically from
// `build-parody-asset-set.mjs` (no ROM, no third-party input). The SMB level
// layouts come from the committed, numeric-only `content/map-sets/official-smb`
// (tile indices/coordinates/timings — never graphics or audio bytes).

import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = resolve(repoRoot, ".cache/user-levels");
const publicContentDir = resolve(repoRoot, "public/game-content");

const assetSetId = "castaway-parody";
const mapSetId = "official-smb";
const bundleId = `${assetSetId}__${mapSetId}`;

function run(script, args) {
  execFileSync("node", [resolve(repoRoot, script), ...args], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  // 1. Restore the committed numeric map set into the cache the bundler reads.
  const committedMapSet = resolve(repoRoot, "content/map-sets", mapSetId);
  const cacheMapSet = resolve(cacheRoot, "map-sets", mapSetId);
  await mkdir(dirname(cacheMapSet), { recursive: true });
  await rm(cacheMapSet, { recursive: true, force: true });
  await cp(committedMapSet, cacheMapSet, { recursive: true });

  // 2. Regenerate the authored skin sprites (ROM-free, deterministic).
  run("scripts/build-parody-asset-set.mjs", []);

  // 3. Compose + bundle the authored skin x the SMB layouts into the cache.
  run("scripts/content-sets.mjs", [
    "bundle",
    "--asset-set",
    assetSetId,
    "--map-set",
    mapSetId,
  ]);

  // 4. Copy the self-contained bundle into the served static dir — plus any
  // other locally built bundles (e.g. the ROM-extracted dev skin, which only
  // ever exists in the ignored cache and is never committed or released).
  await rm(publicContentDir, { recursive: true, force: true });
  const bundlesRoot = resolve(cacheRoot, "content-set-bundles");
  const localBundleIds = new Set([bundleId]);
  try {
    for (const entry of await readdir(bundlesRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        localBundleIds.add(entry.name);
      }
    }
  } catch {
    // No extra local bundles — fresh clones ship the release bundle only.
  }
  for (const id of localBundleIds) {
    const bundleOut = resolve(publicContentDir, "content-set-bundles", id);
    await mkdir(bundleOut, { recursive: true });
    await cp(resolve(bundlesRoot, id), bundleOut, { recursive: true });
  }

  // 4b. Include the authored sound packs (synthesized WAVs; no ROM) so the
  // "Shabby (ouch voices)" option works statically; "Classic" is synthesized
  // in-code and needs no files.
  run("scripts/build-sound-packs.mjs", []);
  await cp(
    resolve(cacheRoot, "sound-packs"),
    resolve(publicContentDir, "sound-packs"),
    { recursive: true },
  );

  // 5. Write the dropdown index describing exactly what this release ships.
  const assetSet = await readJson(
    resolve(cacheRoot, "asset-sets", assetSetId, "asset-set.json"),
  );
  const mapSet = await readJson(resolve(committedMapSet, "map-set.json"));
  const index = {
    assetSets: [
      {
        id: assetSetId,
        title: assetSet.title ?? assetSetId,
        origin: assetSet.origin ?? "authored",
        selectable: true,
      },
    ],
    mapSets: [
      {
        id: mapSetId,
        title: mapSet.title ?? mapSetId,
        levelCount: mapSet.levels.length,
        selectable: true,
      },
    ],
  };
  await writeFile(
    resolve(publicContentDir, "content-sets-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );

  console.log(
    `Release content ready: ${mapSet.levels.length} levels, skin "${index.assetSets[0].title}" -> public/game-content/`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

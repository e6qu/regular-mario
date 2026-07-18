#!/usr/bin/env node
// Local content-set organization (Decision 0019). Asset sets (visual/audio skin)
// and map sets (levels) are stored separately under the ignored cache and can be
// composed in any combination into the runtime manifest the dev server loads.
// Nothing here is committed; all reads and writes stay under .cache/user-levels.

import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertUserLevelCachePath,
  readOption,
  requireOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const defaultAssetSetsRoot = resolve(userLevelCacheRoot, "asset-sets");
const defaultMapSetsRoot = resolve(userLevelCacheRoot, "map-sets");
const defaultComposedRoot = resolve(userLevelCacheRoot, "composed-manifests");
const assetSetDescriptorName = "asset-set.json";
const mapSetDescriptorName = "map-set.json";
const runtimeManifestVersion = "1";
const knownAssetSetOrigins = ["rom-extracted", "authored"];

function printUsage() {
  console.log(`Usage:
  pnpm run content-sets -- <command> [options]

Commands:
  list
      List asset sets and map sets with a validation summary.
  index [--out <path>]
      Write a servable index (id/title/selectable) for the dev-start dropdowns.
  init-asset-set --id <id> --title <title> [--origin authored|rom-extracted]
      Scaffold an authored asset-set skeleton to fill in.
  init-map-set --id <id> --title <title>
      Scaffold a map-set skeleton to fill in.
  validate --asset-set <id> | --map-set <id>
      Validate a single descriptor.
  compose --asset-set <id> --map-set <id> [--out <path>]
      Merge one asset set and one map set into a runtime remote-manifest.json.
  bundle --asset-set <id> --map-set <id> [--out-dir <path>]
      Compose and gather all referenced files into one servable bundle dir.
  bundle-all
      Bundle every valid asset-set x map-set combination.

Roots default to .cache/user-levels/{asset-sets,map-sets,composed-manifests} and
can be overridden with --assets-root / --maps-root / --out (all must stay under
.cache/user-levels).`);
}

function assetsRoot() {
  return assertUserLevelCachePath(
    readOption("--assets-root") ?? defaultAssetSetsRoot,
    "--assets-root",
  );
}

function mapsRoot() {
  return assertUserLevelCachePath(
    readOption("--maps-root") ?? defaultMapSetsRoot,
    "--maps-root",
  );
}

async function readJsonIfPresent(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Malformed JSON in ${filePath}`, { cause: error });
  }
}

async function listSetIds(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function countAssetEntries(descriptor) {
  const records = [
    descriptor.actorSprites,
    descriptor.tileSprites,
    descriptor.reactionSprites,
    descriptor.levelVisuals,
    descriptor.sounds,
    descriptor.music,
  ];
  const recordCount = records.reduce(
    (total, record) => total + Object.keys(record ?? {}).length,
    0,
  );
  return recordCount + (descriptor.playerSprite ? 1 : 0);
}

function identityErrors(descriptor) {
  const errors = [];
  if (typeof descriptor.id !== "string" || descriptor.id.trim() === "") {
    errors.push("id must be a non-empty string");
  }
  if (typeof descriptor.title !== "string" || descriptor.title.trim() === "") {
    errors.push("title must be a non-empty string");
  }
  return errors;
}

function validateAssetSet(descriptor) {
  const errors = identityErrors(descriptor);
  if (!knownAssetSetOrigins.includes(descriptor.origin)) {
    errors.push(`origin must be one of ${knownAssetSetOrigins.join(", ")}`);
  }
  if (countAssetEntries(descriptor) === 0) {
    errors.push(
      "must define at least one sprite, audio, or level-visual entry",
    );
  }
  return errors;
}

function validateMapSet(descriptor) {
  const errors = identityErrors(descriptor);
  if (!Array.isArray(descriptor.levels) || descriptor.levels.length === 0) {
    errors.push("levels must be a non-empty array");
  }
  return errors;
}

async function buildSummary() {
  const assetIds = await listSetIds(assetsRoot());
  const mapIds = await listSetIds(mapsRoot());

  const assetSets = [];
  for (const id of assetIds) {
    const descriptor = await readJsonIfPresent(
      resolve(assetsRoot(), id, assetSetDescriptorName),
    );
    assetSets.push({
      id,
      title: descriptor?.title,
      origin: descriptor?.origin,
      entryCount: descriptor ? countAssetEntries(descriptor) : 0,
      errors: descriptor
        ? validateAssetSet(descriptor)
        : ["descriptor missing"],
    });
  }

  const mapSets = [];
  for (const id of mapIds) {
    const descriptor = await readJsonIfPresent(
      resolve(mapsRoot(), id, mapSetDescriptorName),
    );
    mapSets.push({
      id,
      title: descriptor?.title,
      levelCount: Array.isArray(descriptor?.levels)
        ? descriptor.levels.length
        : 0,
      errors: descriptor ? validateMapSet(descriptor) : ["descriptor missing"],
    });
  }

  return { assetSets, mapSets };
}

async function commandList() {
  console.log(JSON.stringify(await buildSummary(), null, 2));
}

// Writes a servable index of available sets. The dev UI fetches this to
// populate the asset-set and map-set dropdowns at dev start; each entry carries
// the id/title and whether the set is valid enough to select.
async function commandIndex() {
  const summary = await buildSummary();
  const index = {
    assetSets: summary.assetSets.map((set) => ({
      id: set.id,
      title: set.title ?? set.id,
      origin: set.origin,
      selectable: set.errors.length === 0,
    })),
    mapSets: summary.mapSets.map((set) => ({
      id: set.id,
      title: set.title ?? set.id,
      levelCount: set.levelCount,
      selectable: set.errors.length === 0,
    })),
  };

  const outPath = assertUserLevelCachePath(
    readOption("--out") ??
      resolve(userLevelCacheRoot, "content-sets-index.json"),
    "--out",
  );
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log(JSON.stringify({ ...index, out: outPath }, null, 2));
}

async function commandInitAssetSet() {
  const id = requireOption("--id");
  const title = requireOption("--title");
  const origin = readOption("--origin") ?? "authored";

  if (!knownAssetSetOrigins.includes(origin)) {
    throw new Error(
      `--origin must be one of ${knownAssetSetOrigins.join(", ")}.`,
    );
  }

  const directory = assertUserLevelCachePath(
    resolve(assetsRoot(), id),
    "asset-set directory",
  );
  await mkdir(directory, { recursive: true });

  const descriptor = {
    id,
    title,
    origin,
    playerSprite: null,
    actorSprites: {},
    tileSprites: {},
    levelVisuals: {},
    sounds: {},
    music: {},
  };
  await writeFile(
    resolve(directory, assetSetDescriptorName),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );

  console.log(`Scaffolded asset set "${id}" at ${directory}`);
}

async function commandInitMapSet() {
  const id = requireOption("--id");
  const title = requireOption("--title");

  const directory = assertUserLevelCachePath(
    resolve(mapsRoot(), id),
    "map-set directory",
  );
  await mkdir(directory, { recursive: true });

  const descriptor = { id, title, levels: [] };
  await writeFile(
    resolve(directory, mapSetDescriptorName),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );

  console.log(`Scaffolded map set "${id}" at ${directory}`);
}

async function requireAssetSet(id) {
  const descriptor = await readJsonIfPresent(
    resolve(assetsRoot(), id, assetSetDescriptorName),
  );
  if (descriptor === undefined) {
    throw new Error(`Asset set "${id}" not found under ${assetsRoot()}.`);
  }
  const errors = validateAssetSet(descriptor);
  if (errors.length > 0) {
    throw new Error(`Asset set "${id}" is invalid: ${errors.join("; ")}.`);
  }
  return descriptor;
}

async function requireMapSet(id) {
  const descriptor = await readJsonIfPresent(
    resolve(mapsRoot(), id, mapSetDescriptorName),
  );
  if (descriptor === undefined) {
    throw new Error(`Map set "${id}" not found under ${mapsRoot()}.`);
  }
  const errors = validateMapSet(descriptor);
  if (errors.length > 0) {
    throw new Error(`Map set "${id}" is invalid: ${errors.join("; ")}.`);
  }
  return descriptor;
}

async function commandValidate() {
  const assetSetId = readOption("--asset-set");
  const mapSetId = readOption("--map-set");

  if (assetSetId === undefined && mapSetId === undefined) {
    throw new Error("validate requires --asset-set or --map-set.");
  }

  if (assetSetId !== undefined) {
    await requireAssetSet(assetSetId);
    console.log(`Asset set "${assetSetId}" is valid.`);
  }
  if (mapSetId !== undefined) {
    await requireMapSet(mapSetId);
    console.log(`Map set "${mapSetId}" is valid.`);
  }
}

function buildComposedManifest(assetSet, mapSet) {
  const manifest = {
    version: runtimeManifestVersion,
    tileSprites: assetSet.tileSprites ?? {},
    actorSprites: assetSet.actorSprites ?? {},
    reactionSprites: assetSet.reactionSprites ?? {},
    levelVisuals: assetSet.levelVisuals ?? {},
    sounds: assetSet.sounds ?? {},
    music: assetSet.music ?? {},
    levels: mapSet.levels,
  };
  if (assetSet.playerSprite) {
    manifest.playerSprite = assetSet.playerSprite;
  }
  return manifest;
}

// Collects every relative url filename referenced by a value tree (sprite/tile/
// level entries carry { source: { kind: "url", url } } and nested stateSprites).
function collectUrlFileNames(value, found) {
  if (value === null || typeof value !== "object") {
    return found;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectUrlFileNames(entry, found);
    }
    return found;
  }
  if (value.kind === "url" && typeof value.url === "string") {
    found.add(value.url);
    return found;
  }
  for (const entry of Object.values(value)) {
    collectUrlFileNames(entry, found);
  }
  return found;
}

async function copyReferenced(sourceDir, outDir, fileNames) {
  for (const fileName of fileNames) {
    await copyFile(resolve(sourceDir, fileName), resolve(outDir, fileName));
  }
}

async function bundleOne(assetSetId, mapSetId, outDirOverride) {
  const assetSet = await requireAssetSet(assetSetId);
  const mapSet = await requireMapSet(mapSetId);
  const manifest = buildComposedManifest(assetSet, mapSet);

  const outDir = assertUserLevelCachePath(
    outDirOverride ??
      resolve(
        userLevelCacheRoot,
        "content-set-bundles",
        `${assetSetId}__${mapSetId}`,
      ),
    "--out-dir",
  );
  await mkdir(outDir, { recursive: true });

  // Asset files come from the asset-set dir; level files from the map-set dir.
  const assetFiles = collectUrlFileNames(
    {
      tileSprites: manifest.tileSprites,
      actorSprites: manifest.actorSprites,
      playerSprite: manifest.playerSprite,
      reactionSprites: manifest.reactionSprites,
      levelVisuals: manifest.levelVisuals,
      sounds: manifest.sounds,
      music: manifest.music,
    },
    new Set(),
  );
  const levelFiles = collectUrlFileNames(manifest.levels, new Set());

  await copyReferenced(resolve(assetsRoot(), assetSetId), outDir, assetFiles);
  await copyReferenced(resolve(mapsRoot(), mapSetId), outDir, levelFiles);
  await writeFile(
    resolve(outDir, "remote-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  // A single-request pack of every bundled file: the runtime prefers this
  // blob (one fetch instead of hundreds of small ones, which turns any
  // transient CDN hiccup into a failed boot) and falls back to per-file
  // fetches when it is absent.
  await writeBundleBlob(outDir, [...assetFiles, ...levelFiles]);

  return { assetSet: assetSetId, mapSet: mapSetId, outDir };
}

const blobContentTypes = new Map([
  ["png", "image/png"],
  ["json", "application/json"],
  ["txt", "text/plain"],
  ["wav", "audio/wav"],
  ["mp3", "audio/mpeg"],
  ["ogg", "audio/ogg"],
]);

async function writeBundleBlob(outDir, fileNames) {
  const files = {};
  for (const fileName of [...new Set(fileNames)].sort()) {
    const bytes = await readFile(resolve(outDir, fileName));
    const extension = fileName.split(".").pop() ?? "";
    files[fileName] = {
      type: blobContentTypes.get(extension) ?? "application/octet-stream",
      base64: bytes.toString("base64"),
    };
  }
  await writeFile(
    resolve(outDir, "bundle-blob.json"),
    JSON.stringify({ files }),
  );
}

async function commandBundle() {
  const result = await bundleOne(
    requireOption("--asset-set"),
    requireOption("--map-set"),
    readOption("--out-dir"),
  );
  console.log(JSON.stringify(result, null, 2));
}

// Bundles every valid asset-set x map-set combination so any dropdown choice
// resolves to a ready-to-serve manifest (no on-demand bundling in the browser).
async function commandBundleAll() {
  const summary = await buildSummary();
  const assetIds = summary.assetSets
    .filter((set) => set.errors.length === 0)
    .map((set) => set.id);
  const mapIds = summary.mapSets
    .filter((set) => set.errors.length === 0)
    .map((set) => set.id);

  const bundled = [];
  for (const assetId of assetIds) {
    for (const mapId of mapIds) {
      const result = await bundleOne(assetId, mapId, undefined);
      bundled.push(`${result.assetSet}__${result.mapSet}`);
    }
  }

  console.log(JSON.stringify({ bundled }, null, 2));
}

async function commandCompose() {
  const assetSetId = requireOption("--asset-set");
  const mapSetId = requireOption("--map-set");
  const assetSet = await requireAssetSet(assetSetId);
  const mapSet = await requireMapSet(mapSetId);

  const manifest = buildComposedManifest(assetSet, mapSet);

  const outPath = assertUserLevelCachePath(
    readOption("--out") ??
      resolve(defaultComposedRoot, `${assetSetId}__${mapSetId}.json`),
    "--out",
  );
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        assetSet: assetSetId,
        mapSet: mapSetId,
        levelCount: mapSet.levels.length,
        assetEntryCount: countAssetEntries(assetSet),
        out: outPath,
      },
      null,
      2,
    ),
  );
}

const commands = {
  list: commandList,
  index: commandIndex,
  "init-asset-set": commandInitAssetSet,
  "init-map-set": commandInitMapSet,
  validate: commandValidate,
  compose: commandCompose,
  bundle: commandBundle,
  "bundle-all": commandBundleAll,
};

async function main() {
  const command = process.argv[2];

  if (command === undefined || command === "--help") {
    printUsage();
    return;
  }

  const handler = commands[command];
  if (handler === undefined) {
    throw new Error(`Unknown command "${command}". Run with --help.`);
  }

  await handler();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

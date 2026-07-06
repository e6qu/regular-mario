#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const defaultResearchManifestPath = resolve(
  userLevelCacheRoot,
  "vglc-smb-research/research-manifest.json",
);
const defaultOutputDirectory = resolve(
  userLevelCacheRoot,
  "vglc-smb-browser-demo",
);
const defaultAssetFragmentPath = resolve(
  userLevelCacheRoot,
  "vglc-smb-assets/fragment.json",
);
const remoteManifestFileName = "remote-manifest.json";
const defaultLevelName = "vglc-smb-processed-mario-1-1";
const playerStartActorRole = "player-start";
const packerPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "prepare-browser-demo-manifest.mjs",
);

function printUsage() {
  console.log(`Usage:
  pnpm run prepare:vglc-smb-browser-demo
  pnpm run prepare:vglc-smb-browser-demo -- --allow-map-only
  node scripts/prepare-vglc-smb-browser-demo.mjs --research-manifest .cache/user-levels/vglc-smb-research/research-manifest.json --out-dir .cache/user-levels/vglc-smb-browser-demo --asset-fragment .cache/user-levels/vglc-smb-assets/fragment.json

Builds the ignored cache bundle that the Vite dev server loads by default:
  ${defaultOutputDirectory}/remote-manifest.json

Inputs:
  - ${defaultResearchManifestPath}
  - optional ${defaultAssetFragmentPath}

The optional asset fragment may reference user-provided sprite/audio files under
.cache/user-levels. No maps, sprites, audio, ROMs, patches, extraction outputs,
or generated demo files are committed.`);
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, label) {
  const text = await readFile(filePath, "utf8");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON: ${filePath}`);
  }
}

function expectManifestObject(value, label) {
  const isObjectRecord =
    value !== null && typeof value === "object" && !Array.isArray(value);

  if (!isObjectRecord) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function expectManifestString(value, label) {
  const valid = typeof value === "string" && value.trim().length > 0;

  if (!valid) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function expectManifestArray(value, label) {
  return Array.isArray(value)
    ? value
    : (() => {
        throw new Error(`${label} must be an array.`);
      })();
}

function collectRequiredTileSpriteIds(levelInput) {
  const tileIds = new Set();
  const tileRows = expectManifestArray(levelInput.tiles, "default level tiles");

  for (const row of tileRows) {
    for (const tileId of expectManifestArray(row, "default level tile row")) {
      tileIds.add(expectManifestString(tileId, "default level tile id"));
    }
  }

  return [...tileIds].sort();
}

function collectRequiredActorSpriteIds(levelInput) {
  const actorDefinitionsById = new Map();

  for (const definition of expectManifestArray(
    levelInput.actorDefinitions,
    "default level actorDefinitions",
  )) {
    const actorDefinition = expectManifestObject(
      definition,
      "default level actor definition",
    );
    actorDefinitionsById.set(
      expectManifestString(actorDefinition.actorId, "default level actorId"),
      actorDefinition,
    );
  }

  const actorIds = new Set();

  for (const actor of expectManifestArray(
    levelInput.actors,
    "default level actors",
  )) {
    const actorPlacement = expectManifestObject(
      actor,
      "default level actor placement",
    );
    const actorId = expectManifestString(
      actorPlacement.actorId,
      "default level actor placement actorId",
    );
    const definition = actorDefinitionsById.get(actorId);

    if (definition === undefined) {
      throw new Error(
        `Default level actor ${actorId} is missing a definition.`,
      );
    }

    if (definition.role !== playerStartActorRole) {
      actorIds.add(actorId);
    }
  }

  return [...actorIds].sort();
}

function collectMissingKeys(requiredKeys, availableRecord) {
  const available = expectManifestObject(availableRecord ?? {}, "sprite map");

  return requiredKeys.filter((key) => available[key] === undefined);
}

async function validateDefaultSpriteCoverage(outputDirectory) {
  const remoteManifestPath = assertUserLevelCachePath(
    resolve(outputDirectory, remoteManifestFileName),
    "Default VGLC SMB browser demo remote manifest",
  );
  const manifest = expectManifestObject(
    await readJsonFile(remoteManifestPath, "Default remote manifest"),
    "Default remote manifest",
  );
  const levels = expectManifestArray(
    manifest.levels,
    "Default remote manifest levels",
  );
  const defaultLevel = levels.find((level) => {
    const levelRecord = expectManifestObject(
      level,
      "Default remote manifest level",
    );
    return levelRecord.name === defaultLevelName;
  });

  if (defaultLevel === undefined) {
    throw new Error(
      `Default VGLC SMB browser demo manifest must include ${defaultLevelName}.`,
    );
  }

  const defaultLevelRecord = expectManifestObject(
    defaultLevel,
    "Default remote manifest default level",
  );
  const source = expectManifestObject(
    defaultLevelRecord.source,
    "Default remote manifest default level source",
  );

  if (source.kind !== "url") {
    throw new Error('Default remote manifest level source.kind must be "url".');
  }

  const errors = [];

  if (manifest.playerSprite === undefined) {
    errors.push("missing playerSprite");
  }

  if (errors.length > 0) {
    throw new Error(
      `Default VGLC SMB sprite coverage is incomplete for ${defaultLevelName}: ${errors.join("; ")}.`,
    );
  }

  const sourceUrl = expectManifestString(source.url, "default level url");

  if (extname(sourceUrl) !== ".json") {
    console.log(
      `Default VGLC SMB selected level ${sourceUrl} is not JSON; converted tile/actor sprite coverage is enforced at browser import time.`,
    );
    return;
  }

  const levelPath = assertUserLevelCachePath(
    resolve(outputDirectory, sourceUrl),
    "Default copied level file",
  );
  const levelInput = expectManifestObject(
    await readJsonFile(levelPath, "Default copied level"),
    "Default copied level",
  );

  const missingTileSprites = collectMissingKeys(
    collectRequiredTileSpriteIds(levelInput),
    manifest.tileSprites,
  );

  if (missingTileSprites.length > 0) {
    errors.push(`missing tileSprites: ${missingTileSprites.join(", ")}`);
  }

  const missingActorSprites = collectMissingKeys(
    collectRequiredActorSpriteIds(levelInput),
    manifest.actorSprites,
  );

  if (missingActorSprites.length > 0) {
    errors.push(`missing actorSprites: ${missingActorSprites.join(", ")}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Default VGLC SMB sprite coverage is incomplete for ${defaultLevelName}: ${errors.join("; ")}.`,
    );
  }

  console.log(
    `Default VGLC SMB sprite coverage complete for ${defaultLevelName}.`,
  );
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }
  const allowMapOnly = process.argv.includes("--allow-map-only");

  const researchManifestPath = assertUserLevelCachePath(
    readOption("--research-manifest") ?? defaultResearchManifestPath,
    "Default VGLC SMB research manifest",
  );
  const outputDirectory = assertUserLevelCachePath(
    readOption("--out-dir") ?? defaultOutputDirectory,
    "Default VGLC SMB browser demo output directory",
  );
  const assetFragmentPath = assertUserLevelCachePath(
    readOption("--asset-fragment") ?? defaultAssetFragmentPath,
    "Default VGLC SMB asset fragment",
  );
  const args = [
    packerPath,
    "--research-manifest",
    researchManifestPath,
    "--out-dir",
    outputDirectory,
  ];

  if (await pathExists(assetFragmentPath)) {
    args.push("--asset-fragment", assetFragmentPath);
    console.log(`Using optional asset fragment: ${assetFragmentPath}`);
  } else {
    if (!allowMapOnly) {
      throw new Error(
        `Default VGLC SMB dev mode requires ignored local sprite assets at ${assetFragmentPath}. Add a fragment with playerSprite and rerun, or pass --allow-map-only for importer-only testing.`,
      );
    }

    console.log(`No asset fragment found at: ${assetFragmentPath}`);
    console.log("Building a map-only bundle because --allow-map-only was set.");
  }

  await new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
    });

    child.on("error", rejectProcess);
    child.on("close", (code) => {
      if (code === 0) {
        resolveProcess();
        return;
      }

      rejectProcess(
        new Error(`prepare-browser-demo-manifest exited with code ${code}.`),
      );
    });
  });

  if (!allowMapOnly) {
    await validateDefaultSpriteCoverage(outputDirectory);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

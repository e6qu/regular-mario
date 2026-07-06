#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import {
  assertUserLevelCachePath,
  makeCacheRelativePath,
  makeSafeCacheFileStem,
  readOption,
  requireOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const defaultOutputDirectory = resolve(userLevelCacheRoot, "browser-demo");
const localManifestFileName = "manifest.json";
const remoteManifestFileName = "remote-manifest.json";
const copiedLevelsDirectoryName = "levels";
const copiedMetadataDirectoryName = "metadata";
const copiedAssetsDirectoryName = "assets";

function printUsage() {
  console.log(`Usage:
  node scripts/prepare-browser-demo-manifest.mjs --research-manifest .cache/user-levels/vglc-smb-research/research-manifest.json [--out-dir .cache/user-levels/browser-demo] [--asset-fragment .cache/user-levels/assets/fragment.json]

Creates an ignored browser-demo import bundle from an ignored research manifest.
The bundle contains:
  - manifest.json for the local file picker
  - remote-manifest.json for ?importAssets=1&manifestUrl=... when the output directory is served by a static file server
  - flattened copied level/metadata files under the output directory

Optional --asset-fragment may provide tileSprites, actorSprites, playerSprite,
sounds, and music entries whose file sources are copied from .cache/user-levels.
No URLs, maps, sprites, audio, ROMs, patches, or generated copies are committed.`);
}

function optionalCachePath(optionName, fallback) {
  const value = readOption(optionName) ?? fallback;

  if (value === undefined || value.startsWith("--")) {
    return undefined;
  }

  return assertUserLevelCachePath(value, optionName);
}

function readJsonFile(filePath, label) {
  return readFile(filePath, "utf8").then((text) => {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${label} must be valid JSON: ${filePath}`);
    }
  });
}

function assertRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function assertFileSource(source, label) {
  const record = assertRecord(source, label);

  if (record.kind !== "file") {
    throw new Error(`${label}.kind must be "file" for cache demo packing.`);
  }

  return {
    kind: "file",
    fileName: assertString(record.fileName, `${label}.fileName`),
  };
}

function resolveManifestFileSource(manifestDirectory, source, label) {
  const resolvedPath = resolve(manifestDirectory, source.fileName);
  return assertUserLevelCachePath(resolvedPath, label);
}

async function copySourceFile({
  sourcePath,
  outputDirectory,
  subdirectoryName,
  outputFileName,
}) {
  const targetDirectory = resolve(outputDirectory, subdirectoryName);
  const targetPath = resolve(targetDirectory, outputFileName);
  assertUserLevelCachePath(targetPath, "Browser demo copied file");
  await mkdir(targetDirectory, { recursive: true });
  await copyFile(sourcePath, targetPath);

  return {
    localFileName: outputFileName,
    remoteUrl: makeCacheRelativePath(
      outputDirectory,
      targetPath,
      "Generated browser-demo path",
    ),
  };
}

async function copyLevelEntry({
  entry,
  researchManifestDirectory,
  outputDirectory,
}) {
  const level = assertRecord(entry, "research level entry");
  const name = assertString(level.name, "research level entry.name");
  const format = assertString(level.format, `research level "${name}".format`);
  const source = assertFileSource(
    level.source,
    `research level "${name}".source`,
  );
  const sourcePath = resolveManifestFileSource(
    researchManifestDirectory,
    source,
    `research level "${name}" source`,
  );
  const sourceExtension = extname(source.fileName) || ".txt";
  const copiedSource = await copySourceFile({
    sourcePath,
    outputDirectory,
    subdirectoryName: copiedLevelsDirectoryName,
    outputFileName: `${makeSafeCacheFileStem(name)}${sourceExtension}`,
  });
  const localLevel = {
    name,
    format,
    source: { kind: "file", fileName: copiedSource.localFileName },
  };
  const remoteLevel = {
    name,
    format,
    source: { kind: "url", url: copiedSource.remoteUrl },
  };

  if (level.importMetadataSource !== undefined) {
    const metadataSource = assertFileSource(
      level.importMetadataSource,
      `research level "${name}".importMetadataSource`,
    );
    const metadataPath = resolveManifestFileSource(
      researchManifestDirectory,
      metadataSource,
      `research level "${name}" import metadata`,
    );
    const copiedMetadata = await copySourceFile({
      sourcePath: metadataPath,
      outputDirectory,
      subdirectoryName: copiedMetadataDirectoryName,
      outputFileName: `${makeSafeCacheFileStem(name)}.metadata.json`,
    });
    localLevel.importMetadataSource = {
      kind: "file",
      fileName: copiedMetadata.localFileName,
    };
    remoteLevel.importMetadataSource = {
      kind: "url",
      url: copiedMetadata.remoteUrl,
    };
  }

  if (level.compatibilityProfileSource !== undefined) {
    const profileSource = assertFileSource(
      level.compatibilityProfileSource,
      `research level "${name}".compatibilityProfileSource`,
    );
    const profilePath = resolveManifestFileSource(
      researchManifestDirectory,
      profileSource,
      `research level "${name}" compatibility profile`,
    );
    const copiedProfile = await copySourceFile({
      sourcePath: profilePath,
      outputDirectory,
      subdirectoryName: copiedMetadataDirectoryName,
      outputFileName: `${makeSafeCacheFileStem(name)}.profile.json`,
    });
    localLevel.compatibilityProfileSource = {
      kind: "file",
      fileName: copiedProfile.localFileName,
    };
    remoteLevel.compatibilityProfileSource = {
      kind: "url",
      url: copiedProfile.remoteUrl,
    };
  }

  return { localLevel, remoteLevel };
}

function assetEntrySource(entry, label) {
  const record = assertRecord(entry, label);
  return assertFileSource(record.source, `${label}.source`);
}

async function copyAssetEntry({
  entry,
  assetFragmentDirectory,
  outputDirectory,
  outputStem,
}) {
  const record = assertRecord(entry, outputStem);
  const source = assetEntrySource(record, outputStem);
  const sourcePath = resolveManifestFileSource(
    assetFragmentDirectory,
    source,
    `${outputStem} source`,
  );
  const sourceExtension =
    extname(source.fileName) || extname(basename(sourcePath));
  const copiedAsset = await copySourceFile({
    sourcePath,
    outputDirectory,
    subdirectoryName: copiedAssetsDirectoryName,
    outputFileName: `${makeSafeCacheFileStem(outputStem)}${sourceExtension}`,
  });
  const copiedStateSprites =
    record.stateSprites === undefined
      ? undefined
      : await copyStateSpriteMap({
          input: record.stateSprites,
          assetFragmentDirectory,
          outputDirectory,
          outputStem,
        });

  return {
    localEntry: {
      ...record,
      source: { kind: "file", fileName: copiedAsset.localFileName },
      ...(copiedStateSprites === undefined
        ? {}
        : { stateSprites: copiedStateSprites.local }),
    },
    remoteEntry: {
      ...record,
      source: { kind: "url", url: copiedAsset.remoteUrl },
      ...(copiedStateSprites === undefined
        ? {}
        : { stateSprites: copiedStateSprites.remote }),
    },
  };
}

async function copyStateSpriteMap({
  input,
  assetFragmentDirectory,
  outputDirectory,
  outputStem,
}) {
  const stateSprites = assertRecord(input, `${outputStem}.stateSprites`);
  const local = {};
  const remote = {};

  for (const [stateKey, stateEntry] of Object.entries(stateSprites)) {
    const copied = await copyAssetEntry({
      entry: stateEntry,
      assetFragmentDirectory,
      outputDirectory,
      outputStem: `${outputStem}-${stateKey}`,
    });
    local[stateKey] = copied.localEntry;
    remote[stateKey] = copied.remoteEntry;
  }

  return { local, remote };
}

async function copyAssetMap({
  input,
  assetFragmentDirectory,
  outputDirectory,
  label,
}) {
  if (input === undefined) {
    return { local: {}, remote: {} };
  }

  const inputMap = assertRecord(input, label);
  const local = {};
  const remote = {};

  for (const [key, entry] of Object.entries(inputMap)) {
    const copied = await copyAssetEntry({
      entry,
      assetFragmentDirectory,
      outputDirectory,
      outputStem: `${label}-${key}`,
    });
    local[key] = copied.localEntry;
    remote[key] = copied.remoteEntry;
  }

  return { local, remote };
}

async function copyOptionalAssetEntry({
  input,
  assetFragmentDirectory,
  outputDirectory,
  label,
}) {
  if (input === undefined) {
    return { local: undefined, remote: undefined };
  }

  const copied = await copyAssetEntry({
    entry: input,
    assetFragmentDirectory,
    outputDirectory,
    outputStem: label,
  });

  return { local: copied.localEntry, remote: copied.remoteEntry };
}

async function copyAssetFragment({ assetFragmentPath, outputDirectory }) {
  if (assetFragmentPath === undefined) {
    return {
      local: {},
      remote: {},
    };
  }

  const fragmentDirectory = dirname(assetFragmentPath);
  const fragment = assertRecord(
    await readJsonFile(assetFragmentPath, "--asset-fragment"),
    "--asset-fragment",
  );
  const tileSprites = await copyAssetMap({
    input: fragment.tileSprites,
    assetFragmentDirectory: fragmentDirectory,
    outputDirectory,
    label: "tileSprites",
  });
  const actorSprites = await copyAssetMap({
    input: fragment.actorSprites,
    assetFragmentDirectory: fragmentDirectory,
    outputDirectory,
    label: "actorSprites",
  });
  const playerSprite = await copyOptionalAssetEntry({
    input: fragment.playerSprite,
    assetFragmentDirectory: fragmentDirectory,
    outputDirectory,
    label: "playerSprite",
  });
  const levelVisuals = await copyAssetMap({
    input: fragment.levelVisuals,
    assetFragmentDirectory: fragmentDirectory,
    outputDirectory,
    label: "levelVisuals",
  });
  const sounds = await copyAssetMap({
    input: fragment.sounds,
    assetFragmentDirectory: fragmentDirectory,
    outputDirectory,
    label: "sounds",
  });
  const music = await copyAssetMap({
    input: fragment.music,
    assetFragmentDirectory: fragmentDirectory,
    outputDirectory,
    label: "music",
  });

  return {
    local: {
      tileSprites: tileSprites.local,
      actorSprites: actorSprites.local,
      ...(playerSprite.local === undefined
        ? {}
        : { playerSprite: playerSprite.local }),
      levelVisuals: levelVisuals.local,
      sounds: sounds.local,
      music: music.local,
    },
    remote: {
      tileSprites: tileSprites.remote,
      actorSprites: actorSprites.remote,
      ...(playerSprite.remote === undefined
        ? {}
        : { playerSprite: playerSprite.remote }),
      levelVisuals: levelVisuals.remote,
      sounds: sounds.remote,
      music: music.remote,
    },
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const researchManifestPath = assertUserLevelCachePath(
    requireOption("--research-manifest"),
    "--research-manifest",
  );
  const outputDirectory = optionalCachePath(
    "--out-dir",
    defaultOutputDirectory,
  );
  const assetFragmentPath = optionalCachePath("--asset-fragment");

  if (outputDirectory === undefined) {
    throw new Error("--out-dir resolved to an invalid cache path.");
  }

  const researchManifest = assertRecord(
    await readJsonFile(researchManifestPath, "--research-manifest"),
    "--research-manifest",
  );

  if (researchManifest.version !== "1") {
    throw new Error('--research-manifest.version must be "1".');
  }

  if (!Array.isArray(researchManifest.levels)) {
    throw new Error("--research-manifest.levels must be an array.");
  }

  if (researchManifest.levels.length === 0) {
    throw new Error("--research-manifest.levels must not be empty.");
  }

  await mkdir(outputDirectory, { recursive: true });

  const localLevels = [];
  const remoteLevels = [];
  const researchManifestDirectory = dirname(researchManifestPath);

  for (const entry of researchManifest.levels) {
    const copied = await copyLevelEntry({
      entry,
      researchManifestDirectory,
      outputDirectory,
    });
    localLevels.push(copied.localLevel);
    remoteLevels.push(copied.remoteLevel);
  }

  const assetFragment = await copyAssetFragment({
    assetFragmentPath,
    outputDirectory,
  });
  const localManifest = {
    version: "1",
    ...assetFragment.local,
    levels: localLevels,
  };
  const remoteManifest = {
    version: "1",
    ...assetFragment.remote,
    levels: remoteLevels,
  };
  const localManifestPath = resolve(outputDirectory, localManifestFileName);
  const remoteManifestPath = resolve(outputDirectory, remoteManifestFileName);
  await writeFile(
    localManifestPath,
    `${JSON.stringify(localManifest, null, 2)}\n`,
  );
  await writeFile(
    remoteManifestPath,
    `${JSON.stringify(remoteManifest, null, 2)}\n`,
  );

  console.log(`Generated ${localLevels.length} browser demo level entries.`);
  console.log(`Local file-picker manifest: ${localManifestPath}`);
  console.log(`Remote URL manifest: ${remoteManifestPath}`);
  console.log(
    `Serve ${outputDirectory} with a local static server, then open: ?importAssets=1&manifestUrl=<served remote-manifest.json URL>`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

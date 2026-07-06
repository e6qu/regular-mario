#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import {
  assertUserLevelCachePath,
  makeCacheRelativePath,
  makeSafeCacheFileStem,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const defaultOutputDirectory = resolve(userLevelCacheRoot, "vglc-smb-assets");
const defaultFragmentPath = resolve(defaultOutputDirectory, "fragment.json");
const defaultVglcSmbOneOneLevelPath = resolve(
  userLevelCacheRoot,
  "vglc/Super Mario Bros/Processed/mario-1-1.txt",
);
const defaultVglcSmbOneOneMetadataPath = resolve(
  userLevelCacheRoot,
  "vglc-smb-research/metadata/mario-1-1.metadata.json",
);
const copiedAssetsDirectoryName = "source";
const defaultVglcSmbOneOneLevelName = "vglc-smb-processed-mario-1-1";
const vglcSmbTileSizePixels = 16;
const sourceImageLevelRowOffset = 1;
const vglcSmbSkyTransparentColor = {
  red: 92,
  green: 148,
  blue: 252,
  tolerance: 12,
};
const vglcSmbSkyFillColor = {
  red: 92,
  green: 148,
  blue: 252,
};

function printUsage() {
  console.log(`Usage:
  pnpm run prepare:vglc-smb-asset-fragment -- --player-sprite .cache/user-levels/<asset>.png --player-frame 0,0,16,32

Optional repeated entries:
  --actor-sprite vglc-smb-enemy=.cache/user-levels/<enemy>.png --actor-frame vglc-smb-enemy=0,0,16,16
  --actor-transparent-color vglc-smb-enemy=92,148,252,8
  --tile-sprite ground=.cache/user-levels/<tiles>.png --tile-frame ground=0,0,16,16
  --tile-transparent-color ground=92,148,252,8

Optional player transparency:
  --player-transparent-color 92,148,252,8
  --player-state-sprite small-idle=.cache/user-levels/<player-sheet>.png --player-state-frame small-idle=0,0,16,32
  --player-state-transparent-color small-idle=92,148,252,8

Optional actor state sprites:
  --actor-state-sprite vglc-smb-enemy:walk-left=.cache/user-levels/<enemy-sheet>.png
  --actor-state-frame vglc-smb-enemy:walk-left=0,0,16,16
  --actor-state-transparent-color vglc-smb-enemy:walk-left=92,148,252,8

Optional local-only VGLC SMB 1-1 reference preset:
  --fill-vglc-smb-1-1-from-reference .cache/user-levels/vglc/Super\\ Mario\\ Bros/Original/mario-1-1.png
  --fill-vglc-smb-1-1-level .cache/user-levels/vglc/Super\\ Mario\\ Bros/Processed/mario-1-1.txt
  --fill-vglc-smb-1-1-metadata .cache/user-levels/vglc-smb-research/metadata/mario-1-1.metadata.json

The preset derives tile/actor frames from user-provided ignored cache files. It
does not assert license provenance or pixel-perfect fidelity; it only creates
complete local sprite coverage for visual comparison and fails if required
source symbols or exit metadata are missing.

Writes ignored output:
  ${defaultFragmentPath}

All input files must already be under .cache/user-levels. This script creates
only a local ignored manifest fragment; it does not download assets and does not
commit maps, sprites, audio, ROMs, patches, or extraction outputs.`);
}

function readOptions(optionName) {
  const values = [];

  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === optionName) {
      const value = process.argv[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${optionName} requires a value.`);
      }

      values.push(value);
      index += 1;
    }
  }

  return values;
}

function requireOption(optionName) {
  const value = readOption(optionName);

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${optionName} is required.`);
  }

  return value;
}

function parseFrame(value, label) {
  const parts = value.split(",").map((part) => Number(part));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part) || part < 0) ||
    parts[2] === 0 ||
    parts[3] === 0
  ) {
    throw new Error(`${label} must be x,y,width,height with positive size.`);
  }

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function parseTransparentColor(value, label) {
  const parts = value.split(",").map((part) => Number(part));

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255 ||
        !Number.isFinite(part),
    )
  ) {
    throw new Error(`${label} must be red,green,blue,tolerance bytes.`);
  }

  return {
    red: parts[0],
    green: parts[1],
    blue: parts[2],
    tolerance: parts[3],
  };
}

function parseKeyValue(value, label) {
  const separatorIndex = value.indexOf("=");

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`${label} must be key=value.`);
  }

  return {
    key: value.slice(0, separatorIndex),
    value: value.slice(separatorIndex + 1),
  };
}

async function copyAssetFile(sourcePathInput, outputDirectory, outputStem) {
  const sourcePath = assertUserLevelCachePath(
    resolve(sourcePathInput),
    `${outputStem} source`,
  );
  const extension = extname(sourcePath) || extname(basename(sourcePath));
  const targetDirectory = resolve(outputDirectory, copiedAssetsDirectoryName);
  const targetPath = assertUserLevelCachePath(
    resolve(
      targetDirectory,
      `${makeSafeCacheFileStem(outputStem)}${extension}`,
    ),
    `${outputStem} copied output`,
  );

  await mkdir(targetDirectory, { recursive: true });
  await copyFile(sourcePath, targetPath);

  return {
    kind: "file",
    fileName: makeCacheRelativePath(
      outputDirectory,
      targetPath,
      "Generated VGLC SMB asset path",
    ),
  };
}

function makeFrameLookup(values, label) {
  const lookup = new Map();

  for (const rawValue of values) {
    const parsed = parseKeyValue(rawValue, label);
    lookup.set(parsed.key, parseFrame(parsed.value, `${label}.${parsed.key}`));
  }

  return lookup;
}

function makeTransparentColorLookup(values, label) {
  const lookup = new Map();

  for (const rawValue of values) {
    const parsed = parseKeyValue(rawValue, label);
    lookup.set(
      parsed.key,
      parseTransparentColor(parsed.value, `${label}.${parsed.key}`),
    );
  }

  return lookup;
}

function assertLookupKeysUsed(lookup, usedKeys, label) {
  for (const key of lookup.keys()) {
    if (!usedKeys.has(key)) {
      throw new Error(`${label} ${key} does not match a configured sprite.`);
    }
  }
}

function assertSpriteKeyExists(spriteKey, spriteKeys, label) {
  if (!spriteKeys.has(spriteKey)) {
    throw new Error(`${label} ${spriteKey} has no matching base sprite.`);
  }
}

function addOptionalTransparentColor(spriteEntry, transparentColor) {
  if (transparentColor === undefined) {
    return spriteEntry;
  }

  return {
    ...spriteEntry,
    transparentColor,
  };
}

async function copySpriteMap({
  spriteValues,
  frameLookup,
  transparentColorLookup,
  outputDirectory,
  label,
}) {
  const sprites = {};
  const spriteKeys = new Set();

  for (const rawSpriteValue of spriteValues) {
    const parsed = parseKeyValue(rawSpriteValue, label);
    spriteKeys.add(parsed.key);
    const frame = frameLookup.get(parsed.key);

    if (frame === undefined) {
      throw new Error(`${label} ${parsed.key} requires a matching frame.`);
    }

    sprites[parsed.key] = addOptionalTransparentColor(
      {
        source: await copyAssetFile(
          parsed.value,
          outputDirectory,
          `${label}-${parsed.key}`,
        ),
        frame,
      },
      transparentColorLookup.get(parsed.key),
    );
  }

  assertLookupKeysUsed(frameLookup, spriteKeys, `${label} frame`);
  assertLookupKeysUsed(
    transparentColorLookup,
    spriteKeys,
    `${label} transparent color`,
  );

  return sprites;
}

async function copyGroupedActorStateSpriteMap({
  spriteValues,
  frameLookup,
  transparentColorLookup,
  outputDirectory,
  actorSpriteKeys,
}) {
  const stateSpritesByActorId = {};
  const stateKeys = new Set();

  for (const rawSpriteValue of spriteValues) {
    const parsed = parseKeyValue(rawSpriteValue, "actor-state");
    stateKeys.add(parsed.key);
    const keyParts = parsed.key.split(":");

    if (keyParts.length !== 2 || keyParts[0] === "" || keyParts[1] === "") {
      throw new Error("actor-state key must be actorId:stateName.");
    }

    const [actorId, stateName] = keyParts;
    assertSpriteKeyExists(actorId, actorSpriteKeys, "actor-state");
    const frame = frameLookup.get(parsed.key);

    if (frame === undefined) {
      throw new Error(`actor-state ${parsed.key} requires a matching frame.`);
    }

    stateSpritesByActorId[actorId] ??= {};
    stateSpritesByActorId[actorId][stateName] = addOptionalTransparentColor(
      {
        source: await copyAssetFile(
          parsed.value,
          outputDirectory,
          `actor-state-${actorId}-${stateName}`,
        ),
        frame,
      },
      transparentColorLookup.get(parsed.key),
    );
  }

  assertLookupKeysUsed(frameLookup, stateKeys, "actor-state frame");
  assertLookupKeysUsed(
    transparentColorLookup,
    stateKeys,
    "actor-state transparent color",
  );

  return stateSpritesByActorId;
}

function levelRowToSourceY(levelRowIndex) {
  return (
    Math.max(0, levelRowIndex - sourceImageLevelRowOffset) *
    vglcSmbTileSizePixels
  );
}

function makeTileFrame(columnIndex, rowIndex) {
  return {
    x: columnIndex * vglcSmbTileSizePixels,
    y: levelRowToSourceY(rowIndex),
    width: vglcSmbTileSizePixels,
    height: vglcSmbTileSizePixels,
  };
}

function makeEraseRect(x, y, width, height, fill = vglcSmbSkyFillColor) {
  return {
    x,
    y,
    width,
    height,
    fill,
  };
}

function makeTileEraseRect(columnIndex, rowIndex) {
  return makeEraseRect(
    columnIndex * vglcSmbTileSizePixels,
    levelRowToSourceY(rowIndex),
    vglcSmbTileSizePixels,
    vglcSmbTileSizePixels,
  );
}

function collectSymbolEraseRects(rows, symbols) {
  const eraseRects = [];
  const symbolSet = new Set(symbols);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (symbolSet.has(row[columnIndex])) {
        eraseRects.push(makeTileEraseRect(columnIndex, rowIndex));
      }
    }
  }

  return eraseRects;
}

function findFirstSymbolFrame(rows, symbols, label) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (symbols.includes(row[columnIndex])) {
        return makeTileFrame(columnIndex, rowIndex);
      }
    }
  }

  throw new Error(
    `VGLC SMB 1-1 preset requires ${label} symbol(s): ${symbols.join(", ")}`,
  );
}

function findBottomRowSymbolFrame(rows, symbols, label) {
  const bottomRowIndex = rows.length - 1;
  const bottomRow = rows[bottomRowIndex];

  if (bottomRow === undefined) {
    throw new Error(
      `VGLC SMB 1-1 preset cannot read ${label} from empty rows.`,
    );
  }

  for (let columnIndex = 0; columnIndex < bottomRow.length; columnIndex += 1) {
    if (symbols.includes(bottomRow[columnIndex])) {
      return makeTileFrame(columnIndex, bottomRowIndex);
    }
  }

  throw new Error(
    `VGLC SMB 1-1 preset requires bottom-row ${label} symbol(s): ${symbols.join(", ")}`,
  );
}

function readLevelRows(text, label) {
  const rows = text.trimEnd().split(/\r?\n/u);

  if (rows.length === 0 || rows.some((row) => row.length === 0)) {
    throw new Error(`${label} must contain non-empty text rows.`);
  }

  const width = rows[0].length;

  if (rows.some((row) => row.length !== width)) {
    throw new Error(`${label} rows must all have the same width.`);
  }

  return rows;
}

function readPlayerStartFromMetadata(metadata, label) {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    typeof metadata.playerStart !== "object" ||
    metadata.playerStart === null ||
    !Number.isInteger(metadata.playerStart.x) ||
    !Number.isInteger(metadata.playerStart.y) ||
    metadata.playerStart.x < 0 ||
    metadata.playerStart.y < 0
  ) {
    throw new Error(
      `${label}.playerStart must contain non-negative x/y tiles.`,
    );
  }

  return metadata.playerStart;
}

function readExitFromMetadata(metadata, label) {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !Array.isArray(metadata.exits) ||
    metadata.exits.length === 0
  ) {
    throw new Error(`${label} must contain a non-empty exits array.`);
  }

  const [exit] = metadata.exits;

  if (
    typeof exit !== "object" ||
    exit === null ||
    !Number.isInteger(exit.x) ||
    !Number.isInteger(exit.y) ||
    exit.x < 0 ||
    exit.y < 0
  ) {
    throw new Error(`${label}.exits[0] must contain non-negative x/y tiles.`);
  }

  return exit;
}

function makePlayerStartEraseRect(playerStart) {
  return makeEraseRect(
    Math.max(0, (playerStart.x - 3) * vglcSmbTileSizePixels),
    levelRowToSourceY(playerStart.y),
    vglcSmbTileSizePixels * 4,
    vglcSmbTileSizePixels * 2,
  );
}

async function makeVglcSmbOneOneReferenceSprites({
  referenceImagePathInput,
  levelPathInput,
  metadataPathInput,
  outputDirectory,
}) {
  if (referenceImagePathInput === undefined) {
    return { actorSprites: {}, levelVisuals: {}, tileSprites: {} };
  }

  const referenceSource = await copyAssetFile(
    referenceImagePathInput,
    outputDirectory,
    "vglc-smb-1-1-reference",
  );
  const levelPath = assertUserLevelCachePath(
    resolve(levelPathInput ?? defaultVglcSmbOneOneLevelPath),
    "VGLC SMB 1-1 preset level text",
  );
  const metadataPath = assertUserLevelCachePath(
    resolve(metadataPathInput ?? defaultVglcSmbOneOneMetadataPath),
    "VGLC SMB 1-1 preset metadata",
  );
  const rows = readLevelRows(
    await readFile(levelPath, "utf8"),
    "VGLC SMB 1-1 preset level text",
  );
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const playerStart = readPlayerStartFromMetadata(
    metadata,
    "VGLC SMB 1-1 preset metadata",
  );
  const exit = readExitFromMetadata(metadata, "VGLC SMB 1-1 preset metadata");
  const makeTileEntry = (frame) => ({
    source: referenceSource,
    frame,
  });
  const makeActorEntry = (frame) =>
    addOptionalTransparentColor(
      {
        source: referenceSource,
        frame,
      },
      vglcSmbSkyTransparentColor,
    );

  return {
    actorSprites: {
      "open-gate": makeActorEntry({
        x: exit.x * vglcSmbTileSizePixels,
        y: levelRowToSourceY(Math.max(0, exit.y - 2)),
        width: vglcSmbTileSizePixels,
        height: vglcSmbTileSizePixels * 3,
      }),
      "vglc-smb-enemy": makeActorEntry(
        findFirstSymbolFrame(rows, ["E"], "basic enemy"),
      ),
    },
    levelVisuals: {
      [defaultVglcSmbOneOneLevelName]: {
        source: referenceSource,
        frame: {
          x: 0,
          y: 0,
          width: rows[0].length * vglcSmbTileSizePixels,
          height:
            (rows.length - sourceImageLevelRowOffset) * vglcSmbTileSizePixels,
        },
        offsetX: 0,
        offsetY: sourceImageLevelRowOffset * vglcSmbTileSizePixels,
        eraseRects: [
          makePlayerStartEraseRect(playerStart),
          ...collectSymbolEraseRects(rows, ["E", "o"]),
        ],
      },
    },
    tileSprites: {
      "breakable-block": makeTileEntry(
        findFirstSymbolFrame(rows, ["S"], "breakable block"),
      ),
      empty: makeTileEntry(findFirstSymbolFrame(rows, ["-"], "empty sky")),
      "empty-question-block": makeTileEntry(
        findFirstSymbolFrame(rows, ["Q"], "used question block"),
      ),
      flagpole: makeTileEntry(makeTileFrame(exit.x, Math.max(0, exit.y - 1))),
      "full-question-block-coin": makeTileEntry(
        findFirstSymbolFrame(rows, ["?"], "full question block"),
      ),
      ground: makeTileEntry(findBottomRowSymbolFrame(rows, ["X"], "ground")),
      "pipe-left": makeTileEntry(
        findFirstSymbolFrame(rows, ["["], "pipe-left"),
      ),
      "pipe-right": makeTileEntry(
        findFirstSymbolFrame(rows, ["]"], "pipe-right"),
      ),
      "pipe-top-left": makeTileEntry(
        findFirstSymbolFrame(rows, ["<"], "pipe-top-left"),
      ),
      "pipe-top-right": makeTileEntry(
        findFirstSymbolFrame(rows, [">"], "pipe-top-right"),
      ),
    },
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const outputDirectory = assertUserLevelCachePath(
    defaultOutputDirectory,
    "Default VGLC SMB asset fragment directory",
  );
  const fragmentPath = assertUserLevelCachePath(
    defaultFragmentPath,
    "Default VGLC SMB asset fragment",
  );
  const playerSpritePath = requireOption("--player-sprite");
  const playerFrame = parseFrame(
    requireOption("--player-frame"),
    "--player-frame",
  );
  const actorFrames = makeFrameLookup(readOptions("--actor-frame"), "actor");
  const tileFrames = makeFrameLookup(readOptions("--tile-frame"), "tile");
  const actorTransparentColors = makeTransparentColorLookup(
    readOptions("--actor-transparent-color"),
    "actor-transparent-color",
  );
  const tileTransparentColors = makeTransparentColorLookup(
    readOptions("--tile-transparent-color"),
    "tile-transparent-color",
  );
  const playerTransparentColorOption = readOption("--player-transparent-color");
  const playerTransparentColor =
    playerTransparentColorOption === undefined
      ? undefined
      : parseTransparentColor(
          playerTransparentColorOption,
          "--player-transparent-color",
        );
  const vglcSmbOneOneReferenceSprites = await makeVglcSmbOneOneReferenceSprites(
    {
      referenceImagePathInput: readOption("--fill-vglc-smb-1-1-from-reference"),
      levelPathInput: readOption("--fill-vglc-smb-1-1-level"),
      metadataPathInput: readOption("--fill-vglc-smb-1-1-metadata"),
      outputDirectory,
    },
  );

  await mkdir(outputDirectory, { recursive: true });

  const playerStateFrames = makeFrameLookup(
    readOptions("--player-state-frame"),
    "player-state",
  );
  const playerStateTransparentColors = makeTransparentColorLookup(
    readOptions("--player-state-transparent-color"),
    "player-state-transparent-color",
  );
  const playerStateSprites = await copySpriteMap({
    spriteValues: readOptions("--player-state-sprite"),
    frameLookup: playerStateFrames,
    transparentColorLookup: playerStateTransparentColors,
    outputDirectory,
    label: "player-state",
  });
  const fragment = {
    playerSprite: addOptionalTransparentColor(
      {
        source: await copyAssetFile(
          playerSpritePath,
          outputDirectory,
          "playerSprite",
        ),
        frame: playerFrame,
        stateSprites: playerStateSprites,
      },
      playerTransparentColor,
    ),
    actorSprites: await copySpriteMap({
      spriteValues: readOptions("--actor-sprite"),
      frameLookup: actorFrames,
      transparentColorLookup: actorTransparentColors,
      outputDirectory,
      label: "actor",
    }),
    tileSprites: await copySpriteMap({
      spriteValues: readOptions("--tile-sprite"),
      frameLookup: tileFrames,
      transparentColorLookup: tileTransparentColors,
      outputDirectory,
      label: "tile",
    }),
  };

  fragment.actorSprites = {
    ...fragment.actorSprites,
    ...vglcSmbOneOneReferenceSprites.actorSprites,
  };
  const actorStateSprites = await copyGroupedActorStateSpriteMap({
    spriteValues: readOptions("--actor-state-sprite"),
    frameLookup: makeFrameLookup(
      readOptions("--actor-state-frame"),
      "actor-state",
    ),
    transparentColorLookup: makeTransparentColorLookup(
      readOptions("--actor-state-transparent-color"),
      "actor-state-transparent-color",
    ),
    outputDirectory,
    actorSpriteKeys: new Set(Object.keys(fragment.actorSprites)),
  });

  for (const [actorId, stateSprites] of Object.entries(actorStateSprites)) {
    fragment.actorSprites[actorId] = {
      ...fragment.actorSprites[actorId],
      stateSprites,
    };
  }

  fragment.levelVisuals = {
    ...vglcSmbOneOneReferenceSprites.levelVisuals,
  };
  fragment.tileSprites = {
    ...fragment.tileSprites,
    ...vglcSmbOneOneReferenceSprites.tileSprites,
  };

  await writeFile(fragmentPath, `${JSON.stringify(fragment, null, 2)}\n`);
  console.log(`Wrote ignored VGLC SMB asset fragment: ${fragmentPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

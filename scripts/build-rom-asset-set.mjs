#!/usr/bin/env node
// Producer for the `rom-extracted` asset set (Decision 0019). Assembles the
// composed sprite PNGs from the CHR extractor into an asset set that covers the
// VGLC SMB tile/actor/player ids the level renderer expects, so it can be
// composed with the official map set and selected as a skin. Extraction outputs
// and the assembled set both live in the ignored cache; nothing is committed.

import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const spriteSize = 16;
const defaultSpritesDir = resolve(userLevelCacheRoot, "smb-rom-assets/sprites");
const defaultOutDir = resolve(userLevelCacheRoot, "asset-sets/rom-smb");

const bigSpriteHeight = 32;

// Small player states use 16x16 frames from the small-Mario compositions.
const smallPlayerStateSources = {
  "small-idle": "mario-small-idle.png",
  "small-walk": "mario-small-walk-1.png",
  "small-run": "mario-small-walk-2.png",
  "small-jump": "mario-small-jump.png",
  "small-fall": "mario-small-jump.png",
  "small-climb": "mario-small-climb-1.png",
};

// Powered/recovering states use the 16x32 big-Mario compositions (recovering
// reuses the powered art; it only flashes at runtime).
const bigPlayerStateSources = {
  idle: "mario-big-idle.png",
  walk: "mario-big-walk-1.png",
  run: "mario-big-walk-2.png",
  jump: "mario-big-jump.png",
  fall: "mario-big-jump.png",
  climb: "mario-big-idle.png",
};

const enemyActorId = "vglc-smb-enemy";
const enemyStateSources = {
  "walk-left": "goomba-walk.png",
  "walk-right": "goomba-walk.png",
};

// Spawned item actors (from question blocks) -> composed item sprite file.
const itemSpriteSources = {
  "vglc-smb-coin": "tile-coin.png",
  "vglc-smb-power-up": "item-super-mushroom.png",
  "vglc-smb-extra-life": "item-1up-mushroom.png",
  "vglc-smb-invincibility": "item-star.png",
};

// Green Koopa Troopa: a 16x24 walking metasprite plus a 16x16 shell.
const koopaWalkFile = "koopa-walk-1.png";
const koopaShellFile = "koopa-shell.png";
const koopaWalkHeight = 24;

// VGLC SMB tile id -> composed tile sprite file. Ids without a dedicated
// composition reuse the closest documented tile.
const tileSpriteSources = {
  ground: "tile-ground.png",
  "breakable-block": "tile-brick.png",
  "multi-coin-brick": "tile-brick.png",
  "extra-life-brick": "tile-brick.png",
  "star-block": "tile-question-block.png",
  "beanstalk-block": "tile-brick.png",
  "empty-question-block": "tile-used-block.png",
  "full-question-block-coin": "tile-question-block.png",
  "full-question-block-power-up": "tile-question-block.png",
  "used-question-block": "tile-used-block.png",
  "pipe-top-left": "tile-pipe-top-left.png",
  "pipe-top-right": "tile-pipe-top-right.png",
  "pipe-left": "tile-pipe-body-left.png",
  "pipe-right": "tile-pipe-body-right.png",
  flagpole: "tile-flagpole-shaft.png",
  coin: "tile-coin.png",
};

function printUsage() {
  console.log(`Usage:
  pnpm run build:rom-asset-set -- [options]

Options:
  --sprites-dir <path>  Composed sprite directory from extract:smb-rom
                        (default ${defaultSpritesDir}).
  --out-dir <path>      Asset-set output directory under .cache/user-levels
                        (default ${defaultOutDir}).

Assembles the extracted CHR sprites into a rom-extracted asset set (player
state sprites, enemy actor sprites, and SMB tile sprites). Run extract:smb-rom
first. All outputs stay in the ignored cache.`);
}

function spriteEntry(fileName, height = spriteSize) {
  return {
    source: { kind: "url", url: fileName },
    frame: { x: 0, y: 0, width: spriteSize, height },
  };
}

// Assembles the 18 player state keys: small-* from 16x16 frames plus the
// powered-*/recovering-* variants from the 16x32 big-Mario frames.
function buildPlayerStateSprites() {
  const stateSprites = {};
  for (const [state, fileName] of Object.entries(smallPlayerStateSources)) {
    stateSprites[state] = spriteEntry(fileName);
  }
  for (const [suffix, fileName] of Object.entries(bigPlayerStateSources)) {
    const bigEntry = spriteEntry(fileName, bigSpriteHeight);
    stateSprites[`powered-${suffix}`] = bigEntry;
    stateSprites[`recovering-${suffix}`] = bigEntry;
  }
  return stateSprites;
}

function playerSpriteFileNames() {
  return [
    ...Object.values(smallPlayerStateSources),
    ...Object.values(bigPlayerStateSources),
  ];
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copySprites(spritesDir, outDir, fileNames) {
  for (const fileName of fileNames) {
    const sourcePath = resolve(spritesDir, fileName);
    if (!(await fileExists(sourcePath))) {
      throw new Error(
        `Missing composed sprite ${fileName} in ${spritesDir}. Run extract:smb-rom first.`,
      );
    }
    await copyFile(sourcePath, resolve(outDir, fileName));
  }
}

function mapStateSprites(sources) {
  const stateSprites = {};
  for (const [state, fileName] of Object.entries(sources)) {
    stateSprites[state] = spriteEntry(fileName);
  }
  return stateSprites;
}

function mapTileSprites(sources) {
  const tileSprites = {};
  for (const [tileId, fileName] of Object.entries(sources)) {
    tileSprites[tileId] = spriteEntry(fileName);
  }
  return tileSprites;
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const spritesDir = resolve(readOption("--sprites-dir") ?? defaultSpritesDir);
  const outDir = assertUserLevelCachePath(
    readOption("--out-dir") ?? defaultOutDir,
    "--out-dir",
  );
  await mkdir(outDir, { recursive: true });

  const uniqueFiles = [
    ...new Set([
      ...playerSpriteFileNames(),
      ...Object.values(enemyStateSources),
      ...Object.values(itemSpriteSources),
      ...Object.values(tileSpriteSources),
      koopaWalkFile,
      koopaShellFile,
    ]),
  ];
  await copySprites(spritesDir, outDir, uniqueFiles);

  const playerStateSprites = buildPlayerStateSprites();
  const descriptor = {
    id: "rom-smb",
    title: "Super Mario Bros (ROM extracted)",
    origin: "rom-extracted",
    playerSprite: {
      ...spriteEntry(smallPlayerStateSources["small-idle"]),
      stateSprites: playerStateSprites,
    },
    actorSprites: {
      [enemyActorId]: {
        ...spriteEntry(enemyStateSources["walk-left"]),
        stateSprites: mapStateSprites(enemyStateSources),
      },
      "vglc-smb-coin": spriteEntry(itemSpriteSources["vglc-smb-coin"]),
      "vglc-smb-power-up": spriteEntry(itemSpriteSources["vglc-smb-power-up"]),
      "vglc-smb-extra-life": spriteEntry(
        itemSpriteSources["vglc-smb-extra-life"],
      ),
      "vglc-smb-invincibility": spriteEntry(
        itemSpriteSources["vglc-smb-invincibility"],
      ),
      "vglc-smb-koopa": {
        ...spriteEntry(koopaWalkFile, koopaWalkHeight),
        stateSprites: {
          "walk-left": spriteEntry(koopaWalkFile, koopaWalkHeight),
          "walk-right": spriteEntry(koopaWalkFile, koopaWalkHeight),
          shell: spriteEntry(koopaShellFile),
          "shell-idle": spriteEntry(koopaShellFile),
          "shell-left": spriteEntry(koopaShellFile),
          "shell-right": spriteEntry(koopaShellFile),
        },
      },
      "open-gate": spriteEntry("tile-flagpole-shaft.png"),
    },
    tileSprites: mapTileSprites(tileSpriteSources),
    sounds: {},
    music: {},
  };
  await writeFile(
    resolve(outDir, "asset-set.json"),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        outDir,
        tileIds: Object.keys(tileSpriteSources).length,
        playerStates: Object.keys(playerStateSprites).length,
        copiedSprites: uniqueFiles.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

#!/usr/bin/env node
// Producer for the `rom-extracted` asset set (Decision 0019). Assembles the
// composed sprite PNGs from the CHR extractor into an asset set that covers the
// VGLC SMB tile/actor/player ids the level renderer expects, so it can be
// composed with the official map set and selected as a skin. Extraction outputs
// and the assembled set both live in the ignored cache; nothing is committed.

import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// prettier-ignore
import { bodyPartPalette, burstGrid, burstPalette, deadEyesGrid, deadEyesPalette, drawGridSprite, flameGrid, flamePalette, huskGrid, huskPalette, partArmGrid, partHeadGrid, partLegGrid, partTorsoGrid, smokeGrid, smokePalette } from "./death-effect-overlay-sprites.mjs";
import { princessGrid, princessPalette } from "./rescued-friend-sprite.mjs";

// Spikes ("thorn") are a non-SMB addition, so the CHR set has no sprite for
// them — author one: a row of metal spikes on a dark base.
const spikePalette = {
  ".": [0, 0, 0, 0],
  m: [176, 180, 190, 255],
  M: [120, 124, 138, 255],
  k: [66, 68, 82, 255],
};
const spikeGrid = [
  "................",
  "................",
  "................",
  "................",
  "................",
  ".m...m...m...m..",
  "mmm.mmm.mmm.mmm.",
  "MMMMMMMMMMMMMMMM",
  "MMMMMMMMMMMMMMMM",
  "MMMMMMMMMMMMMMMM",
  "kMMMMMMMMMMMMMMk",
  "kMMMMMMMMMMMMMMk",
  "kkMMMMMMMMMMMMkk",
  "kkkkkkkkkkkkkkkk",
  "kkkkkkkkkkkkkkkk",
  "................",
];
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
// reuses the powered art; it only flashes at runtime); the fire tier uses the
// palette-swapped clones.
const bigPlayerStateSources = {
  idle: "mario-big-idle.png",
  walk: "mario-big-walk-1.png",
  run: "mario-big-walk-2.png",
  jump: "mario-big-jump.png",
  fall: "mario-big-jump.png",
  climb: "mario-big-idle.png",
};
const firePlayerStateSources = {
  idle: "mario-fire-idle.png",
  walk: "mario-fire-walk-1.png",
  run: "mario-fire-walk-2.png",
  jump: "mario-fire-jump.png",
  fall: "mario-fire-jump.png",
  climb: "mario-fire-idle.png",
};
const fireMarioFiles = Object.values(firePlayerStateSources);

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

// The rest of the cast: composed metasprites (heights vary), one entry per
// actor id the importer can emit.
const castSprites = {
  "vglc-smb-throwing-enemy": ["hammer-bro.png", 24],
  "vglc-smb-aerial-throwing-enemy": ["lakitu.png", 24],
  "vglc-smb-koopa-red": ["koopa-red-walk.png", 24],
  "vglc-smb-parakoopa": ["paratroopa-walk.png", 24],
  "vglc-smb-parakoopa-red": ["paratroopa-red-walk.png", 24],
  "vglc-smb-parakoopa-hopper": ["paratroopa-walk.png", 24],
  "vglc-smb-turtle": ["buzzy-walk.png", 16],
  "vglc-smb-spiny": ["spiny-walk.png", 16],
  "vglc-smb-blooper": ["blooper.png", 16],
  "vglc-smb-cheep": ["cheep-red.png", 16],
  "vglc-smb-piranha": ["piranha-plant.png", 24],
  "vglc-smb-bullet": ["bullet-bill.png", 16],
  "vglc-smb-bowser": ["bowser.png", 32, 32],
  "vglc-smb-bowser-hammers": ["bowser.png", 32, 32],
  "vglc-smb-climbable": ["tile-flagpole-shaft.png", 16],
  "vglc-smb-transition-pipe": ["tile-pipe-body-left.png", 16],
  "mechanism-flame-orb": ["fire-orb.png", 8, 8],
  "mechanism-podoboo": ["podoboo.png", 16],
  "mechanism-lift": ["lift-plank.png", 8, 24],
  "projectile-fireball": ["fire-orb.png", 8, 8],
  "projectile-hammer": ["hammer.png", 16, 8],
  "projectile-flame": ["bowser-flame.png", 8, 16],
  "projectile-egg": ["spiny-egg-proj.png", 16],
};

// Extra tile ids: scenery, coral, mechanisms, and editor-facing tiles.
const extraTileSpriteSources = {
  "scenery-cloud-left": "scenery-cloud-left.png",
  "scenery-cloud-middle": "scenery-cloud-middle.png",
  "scenery-cloud-right": "scenery-cloud-right.png",
  "scenery-bush-left": "scenery-bush-left.png",
  "scenery-bush-middle": "scenery-bush-middle.png",
  "scenery-bush-right": "scenery-bush-right.png",
  "scenery-hill-left": "scenery-hill-left.png",
  "scenery-hill-peak": "scenery-hill-peak.png",
  "scenery-hill-right": "scenery-hill-right.png",
  "scenery-hill-fill": "scenery-hill-fill.png",
  "scenery-fence": "scenery-fence.png",
  "scenery-tree-top": "scenery-tree-top.png",
  "scenery-tree-top-small": "scenery-tree-top-small.png",
  "scenery-trunk": "scenery-trunk.png",
  "scenery-mushroom-stem": "scenery-mushroom-stem.png",
  "scenery-rail": "scenery-rail.png",
  "castle-wall": "castle-wall.png",
  "castle-battlement": "castle-battlement.png",
  "castle-window": "castle-window.png",
  "castle-door": "castle-door.png",
  "water-surface": "water-surface.png",
  "water-body": "water-body.png",
  "lava-surface": "lava-surface.png",
  "lava-body": "lava-body.png",
  coral: "coral.png",
  "castle-bridge": "castle-bridge.png",
  "cannon-top": "cannon-top.png",
  "cannon-bottom": "cannon-bottom.png",
  "spring-top": "jumpspring-rest.png",
  "spring-bottom": "jumpspring-rest.png",
  "power-up-brick": "tile-brick.png",
  "flagpole-flag": "flag-pennant.png",
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
  "pipe-side-mouth-top": "tile-pipe-side-mouth-top.png",
  "pipe-side-mouth-bottom": "tile-pipe-side-mouth-bottom.png",
  "pipe-side-shaft-top": "tile-pipe-side-shaft-top.png",
  "pipe-side-shaft-bottom": "tile-pipe-side-shaft-bottom.png",
  "pipe-side-joint-top": "tile-pipe-side-joint-top.png",
  "pipe-side-joint-bottom": "tile-pipe-side-joint-bottom.png",
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
  for (const [suffix, fileName] of Object.entries(firePlayerStateSources)) {
    stateSprites[`fire-${suffix}`] = spriteEntry(fileName, bigSpriteHeight);
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

// A shelled/armored actor entry: walking frames plus shell states.
function shelledActorEntry(walkFileName, walkHeight, shellFileName) {
  return {
    ...spriteEntry(walkFileName, walkHeight),
    stateSprites: {
      "walk-left": spriteEntry(walkFileName, walkHeight),
      "walk-right": spriteEntry(walkFileName, walkHeight),
      shell: spriteEntry(shellFileName),
      "shell-idle": spriteEntry(shellFileName),
      "shell-left": spriteEntry(shellFileName),
      "shell-right": spriteEntry(shellFileName),
    },
  };
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
      ...Object.values(castSprites).map((entry) => entry[0]),
      ...Object.values(extraTileSpriteSources),
      ...fireMarioFiles,
      "koopa-red-shell.png",
      "buzzy-shell.png",
      koopaWalkFile,
      koopaShellFile,
    ]),
  ];
  await copySprites(spritesDir, outDir, uniqueFiles);

  // Author the death-effect overlays that the CHR set does not provide.
  await writeFile(
    resolve(outDir, "smb-dead-eyes.png"),
    drawGridSprite(deadEyesGrid, deadEyesPalette),
  );
  await writeFile(
    resolve(outDir, "smb-smoke-puff.png"),
    drawGridSprite(smokeGrid, smokePalette),
  );
  await writeFile(
    resolve(outDir, "smb-burn-flame.png"),
    drawGridSprite(flameGrid, flamePalette),
  );
  await writeFile(
    resolve(outDir, "smb-explosion-burst.png"),
    drawGridSprite(burstGrid, burstPalette),
  );
  await writeFile(
    resolve(outDir, "smb-burned-husk.png"),
    drawGridSprite(huskGrid, huskPalette),
  );
  for (const [file, grid] of [
    ["smb-part-head.png", partHeadGrid],
    ["smb-part-torso.png", partTorsoGrid],
    ["smb-part-arm.png", partArmGrid],
    ["smb-part-leg.png", partLegGrid],
  ]) {
    await writeFile(
      resolve(outDir, file),
      drawGridSprite(grid, bodyPartPalette),
    );
  }
  await writeFile(
    resolve(outDir, "smb-rescued-friend.png"),
    drawGridSprite(princessGrid, princessPalette),
  );
  await writeFile(
    resolve(outDir, "smb-spikes.png"),
    drawGridSprite(spikeGrid, spikePalette),
  );

  const playerStateSprites = buildPlayerStateSprites();
  const descriptor = {
    id: "rom-smb",
    title: "Super Mario Bros (ROM extracted)",
    origin: "rom-extracted",
    reactionSprites: {
      // Death-effect overlays (authored, not CHR-extracted): X-ed-out eyes for
      // drown/impale deaths and a smoke puff for burn deaths.
      "player-dead-eyes": spriteEntry("smb-dead-eyes.png"),
      "smoke-puff": spriteEntry("smb-smoke-puff.png"),
      "burn-flame": spriteEntry("smb-burn-flame.png"),
      "explosion-burst": spriteEntry("smb-explosion-burst.png"),
      "burned-husk": spriteEntry("smb-burned-husk.png"),
      "part-head": spriteEntry("smb-part-head.png"),
      "part-torso": spriteEntry("smb-part-torso.png"),
      "part-arm": spriteEntry("smb-part-arm.png"),
      "part-leg": spriteEntry("smb-part-leg.png"),
      "rescued-friend": spriteEntry("smb-rescued-friend.png"),
    },
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
      "vglc-smb-koopa": shelledActorEntry(
        koopaWalkFile,
        koopaWalkHeight,
        koopaShellFile,
      ),
      "open-gate": spriteEntry("tile-flagpole-shaft.png"),
      ...Object.fromEntries(
        Object.entries(castSprites).map(([actorId, entry]) => {
          const [fileName, height, width] = entry;
          const base = {
            source: { kind: "url", url: fileName },
            frame: {
              x: 0,
              y: 0,
              width: width ?? spriteSize,
              height: height ?? spriteSize,
            },
          };
          return [
            actorId,
            {
              ...base,
              stateSprites: { "walk-left": base, "walk-right": base },
            },
          ];
        }),
      ),
      // Winged armored enemies drop to walking shells when stomped.
      "vglc-smb-parakoopa": shelledActorEntry(
        "paratroopa-walk.png",
        24,
        koopaShellFile,
      ),
      "vglc-smb-parakoopa-hopper": shelledActorEntry(
        "paratroopa-walk.png",
        24,
        koopaShellFile,
      ),
      "vglc-smb-parakoopa-red": shelledActorEntry(
        "paratroopa-red-walk.png",
        24,
        "koopa-red-shell.png",
      ),
      // Shelled state art for red koopas and buzzies.
      "vglc-smb-koopa-red": shelledActorEntry(
        "koopa-red-walk.png",
        24,
        "koopa-red-shell.png",
      ),
      "vglc-smb-turtle": shelledActorEntry(
        "buzzy-walk.png",
        16,
        "buzzy-shell.png",
      ),
    },
    tileSprites: {
      ...mapTileSprites(tileSpriteSources),
      ...mapTileSprites(extraTileSpriteSources),
      // Authored floor-spike tile (no CHR source; SMB has none).
      thorn: spriteEntry("smb-spikes.png"),
      // The extracted flag is a single 8x8 sprite tile.
      "flagpole-flag": {
        source: { kind: "url", url: "flag-pennant.png" },
        frame: { x: 0, y: 0, width: 8, height: 8 },
      },
    },
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

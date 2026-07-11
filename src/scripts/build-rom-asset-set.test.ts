import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runNodeScript } from "../../tests/support/script-test-support";
import {
  AssetSetOrigin,
  validateAssetSetDescriptor,
  type AssetSetDescriptor,
} from "../engine/domain/content-sets";

const scriptPath = resolve("scripts/build-rom-asset-set.mjs");
const testRoot = resolve(".cache/user-levels/test-build-rom-asset-set");
const spritesDir = resolve(testRoot, "sprites");
const outDir = resolve(testRoot, "rom-smb");

const composedSpriteFiles = [
  "mario-small-idle.png",
  "mario-small-walk-1.png",
  "mario-small-walk-2.png",
  "mario-small-jump.png",
  "mario-small-climb-1.png",
  "mario-big-idle.png",
  "mario-big-walk-1.png",
  "mario-big-walk-2.png",
  "mario-big-jump.png",
  "goomba-walk.png",
  "item-super-mushroom.png",
  "item-1up-mushroom.png",
  "item-star.png",
  "koopa-walk-1.png",
  "koopa-shell.png",
  "tile-ground.png",
  "tile-brick.png",
  "tile-used-block.png",
  "tile-question-block.png",
  "tile-pipe-top-left.png",
  "tile-pipe-top-right.png",
  "tile-pipe-body-left.png",
  "tile-pipe-body-right.png",
  "tile-flagpole-shaft.png",
  "tile-coin.png",
  // The full cast, mechanisms, scenery and fire-tier player frames.
  "mario-fire-idle.png",
  "mario-fire-walk-1.png",
  "mario-fire-walk-2.png",
  "mario-fire-jump.png",
  "hammer-bro.png",
  "lakitu.png",
  "koopa-red-walk.png",
  "koopa-red-shell.png",
  "paratroopa-walk.png",
  "paratroopa-red-walk.png",
  "buzzy-walk.png",
  "buzzy-shell.png",
  "spiny-walk.png",
  "blooper.png",
  "cheep-red.png",
  "piranha-plant.png",
  "bullet-bill.png",
  "bowser.png",
  "fire-orb.png",
  "podoboo.png",
  "lift-plank.png",
  "hammer.png",
  "bowser-flame.png",
  "spiny-egg-proj.png",
  "jumpspring-rest.png",
  "flag-pennant.png",
  "scenery-cloud-left.png",
  "scenery-cloud-middle.png",
  "scenery-cloud-right.png",
  "scenery-bush-left.png",
  "scenery-bush-middle.png",
  "scenery-bush-right.png",
  "scenery-hill-left.png",
  "scenery-hill-peak.png",
  "scenery-hill-right.png",
  "scenery-hill-fill.png",
  "scenery-fence.png",
  "scenery-tree-top.png",
  "scenery-tree-top-small.png",
  "scenery-trunk.png",
  "scenery-mushroom-stem.png",
  "scenery-rail.png",
  "castle-wall.png",
  "castle-battlement.png",
  "castle-window.png",
  "castle-door.png",
  "water-surface.png",
  "water-body.png",
  "lava-surface.png",
  "lava-body.png",
  "coral.png",
  "castle-bridge.png",
  "cannon-top.png",
  "cannon-bottom.png",
];

const requiredPlayerStates = [
  "small-idle",
  "small-walk",
  "small-run",
  "small-jump",
  "small-fall",
  "small-climb",
  "powered-idle",
  "powered-walk",
  "powered-run",
  "powered-jump",
  "powered-fall",
  "powered-climb",
  "recovering-idle",
  "recovering-walk",
  "recovering-run",
  "recovering-jump",
  "recovering-fall",
  "recovering-climb",
];

const expectedTileIds = [
  "ground",
  "breakable-block",
  "multi-coin-brick",
  "empty-question-block",
  "full-question-block-coin",
  "full-question-block-power-up",
  "pipe-top-left",
  "pipe-top-right",
  "pipe-left",
  "pipe-right",
  "flagpole",
  "coin",
];

type SpriteFrameEntry = { readonly frame: { readonly height: number } };

type RomAssetSet = AssetSetDescriptor & {
  readonly playerSprite: {
    stateSprites: Record<string, SpriteFrameEntry | undefined>;
  };
  readonly actorSprites: Record<
    string,
    { stateSprites: Record<string, unknown> }
  >;
  readonly tileSprites: Record<string, unknown>;
};

describe("build-rom-asset-set", () => {
  it("assembles a valid rom-extracted asset set covering the SMB ids", async () => {
    await rm(testRoot, { recursive: true, force: true });
    await mkdir(spritesDir, { recursive: true });
    for (const file of composedSpriteFiles) {
      await writeFile(resolve(spritesDir, file), "synthetic-png");
    }

    const result = await runNodeScript(scriptPath, [
      "--sprites-dir",
      spritesDir,
      "--out-dir",
      outDir,
    ]);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    const descriptor = JSON.parse(
      await readFile(resolve(outDir, "asset-set.json"), "utf8"),
    ) as RomAssetSet;

    expect(descriptor.origin).toBe(AssetSetOrigin.RomExtracted);
    for (const state of requiredPlayerStates) {
      expect(descriptor.playerSprite.stateSprites[state]).toBeDefined();
    }
    // Small states use 16x16 frames; powered/recovering use 16x32 big-Mario.
    expect(
      descriptor.playerSprite.stateSprites["small-idle"]?.frame.height,
    ).toBe(16);
    expect(
      descriptor.playerSprite.stateSprites["powered-idle"]?.frame.height,
    ).toBe(32);
    expect(
      descriptor.actorSprites["vglc-smb-enemy"]?.stateSprites["walk-left"],
    ).toBeDefined();
    for (const tileId of expectedTileIds) {
      expect(descriptor.tileSprites[tileId]).toBeDefined();
    }

    const validation = validateAssetSetDescriptor(descriptor);
    expect(validation.ok).toBe(true);
  });

  it("fails loudly when a composed sprite is missing", async () => {
    await rm(testRoot, { recursive: true, force: true });
    await mkdir(spritesDir, { recursive: true });
    // Only write one file, leaving the rest missing.
    await writeFile(resolve(spritesDir, "mario-small-idle.png"), "synthetic");

    const result = await runNodeScript(scriptPath, [
      "--sprites-dir",
      spritesDir,
      "--out-dir",
      outDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Run extract:smb-rom first");
  });
});

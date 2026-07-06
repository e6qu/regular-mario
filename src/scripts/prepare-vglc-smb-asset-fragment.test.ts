import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runNodeScript } from "../../tests/support/script-test-support";

function testRootPath(suffix: string): string {
  return resolve(".cache/user-levels/test-vglc-smb-asset-fragment", suffix);
}

const scriptPath = resolve("scripts/prepare-vglc-smb-asset-fragment.mjs");

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeSyntheticPresetCache(root: string): Promise<{
  readonly levelPath: string;
  readonly metadataPath: string;
  readonly playerPath: string;
  readonly referencePath: string;
}> {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const playerPath = resolve(root, "player.png");
  const referencePath = resolve(root, "reference.png");
  const levelPath = resolve(root, "level.txt");
  const metadataPath = resolve(root, "metadata.json");

  await writeFile(playerPath, "synthetic-player");
  await writeFile(referencePath, "synthetic-reference");
  await writeFile(
    levelPath,
    [
      "----------------",
      "----E-----------",
      "----S?Q---<>----",
      "----------[]----",
      "XXXXXXXXXXXXXXXX",
    ].join("\n"),
  );
  await writeJson(metadataPath, {
    playerStart: { x: 2, y: 3 },
    exits: [{ x: 14, y: 4 }],
  });

  return {
    levelPath,
    metadataPath,
    playerPath,
    referencePath,
  };
}

describe("prepare-vglc-smb-asset-fragment", () => {
  it("derives a complete VGLC SMB 1-1 sprite fragment from ignored cache inputs", async () => {
    const paths = await writeSyntheticPresetCache(testRootPath("preset"));
    const result = await runNodeScript(scriptPath, [
      "--player-sprite",
      paths.playerPath,
      "--player-frame",
      "0,0,16,32",
      "--player-state-sprite",
      `small-idle=${paths.playerPath}`,
      "--player-state-frame",
      "small-idle=0,0,16,32",
      "--actor-state-sprite",
      `vglc-smb-enemy:walk-left=${paths.referencePath}`,
      "--actor-state-frame",
      "vglc-smb-enemy:walk-left=64,0,16,16",
      "--fill-vglc-smb-1-1-from-reference",
      paths.referencePath,
      "--fill-vglc-smb-1-1-level",
      paths.levelPath,
      "--fill-vglc-smb-1-1-metadata",
      paths.metadataPath,
    ]);

    const fragment = JSON.parse(
      await readFile(
        resolve(".cache/user-levels/vglc-smb-assets/fragment.json"),
        "utf8",
      ),
    ) as {
      readonly actorSprites: Record<
        string,
        {
          readonly frame: unknown;
          readonly stateSprites?: Record<string, { readonly frame: unknown }>;
        }
      >;
      readonly levelVisuals: Record<
        string,
        {
          readonly eraseRects: unknown;
          readonly frame: unknown;
          readonly offsetX: number;
          readonly offsetY: number;
        }
      >;
      readonly playerSprite: {
        readonly stateSprites: Record<string, { readonly frame: unknown }>;
      };
      readonly tileSprites: Record<string, { readonly frame: unknown }>;
    };

    expect(result.exitCode).toBe(0);
    expect(Object.keys(fragment.tileSprites).sort()).toEqual([
      "breakable-block",
      "empty",
      "empty-question-block",
      "flagpole",
      "full-question-block-coin",
      "ground",
      "pipe-left",
      "pipe-right",
      "pipe-top-left",
      "pipe-top-right",
    ]);
    expect(Object.keys(fragment.actorSprites).sort()).toEqual([
      "open-gate",
      "vglc-smb-enemy",
    ]);
    expect(Object.keys(fragment.levelVisuals)).toEqual([
      "vglc-smb-processed-mario-1-1",
    ]);
    const groundSprite = fragment.tileSprites.ground;
    const openGateSprite = fragment.actorSprites["open-gate"];
    const levelVisual = fragment.levelVisuals["vglc-smb-processed-mario-1-1"];

    expect(groundSprite).toBeDefined();
    expect(openGateSprite).toBeDefined();
    expect(levelVisual).toBeDefined();
    expect(groundSprite!.frame).toEqual({
      x: 0,
      y: 48,
      width: 16,
      height: 16,
    });
    expect(openGateSprite!.frame).toEqual({
      x: 224,
      y: 16,
      width: 16,
      height: 48,
    });
    expect(fragment.playerSprite.stateSprites["small-idle"]?.frame).toEqual({
      x: 0,
      y: 0,
      width: 16,
      height: 32,
    });
    expect(openGateSprite!.stateSprites).toBeUndefined();
    expect(
      fragment.actorSprites["vglc-smb-enemy"]!.stateSprites?.["walk-left"]
        ?.frame,
    ).toEqual({
      x: 64,
      y: 0,
      width: 16,
      height: 16,
    });
    expect(levelVisual!.frame).toEqual({
      x: 0,
      y: 0,
      width: 256,
      height: 64,
    });
    expect(levelVisual!.offsetX).toBe(0);
    expect(levelVisual!.offsetY).toBe(16);
    expect(levelVisual!.eraseRects).toEqual([
      {
        x: 0,
        y: 32,
        width: 64,
        height: 32,
        fill: { red: 92, green: 148, blue: 252 },
      },
      {
        x: 64,
        y: 0,
        width: 16,
        height: 16,
        fill: { red: 92, green: 148, blue: 252 },
      },
    ]);
  });

  it("fails loudly when the reference preset level lacks required source symbols", async () => {
    const paths = await writeSyntheticPresetCache(
      testRootPath("missing-symbol"),
    );
    await writeFile(paths.levelPath, "-----\n-----\n-----");

    const result = await runNodeScript(scriptPath, [
      "--player-sprite",
      paths.playerPath,
      "--player-frame",
      "0,0,16,32",
      "--fill-vglc-smb-1-1-from-reference",
      paths.referencePath,
      "--fill-vglc-smb-1-1-level",
      paths.levelPath,
      "--fill-vglc-smb-1-1-metadata",
      paths.metadataPath,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "VGLC SMB 1-1 preset requires basic enemy symbol(s): E",
    );
  });
});

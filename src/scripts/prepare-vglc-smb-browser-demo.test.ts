import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  runNodeScript,
  type ScriptRunResult,
} from "../../tests/support/script-test-support";

const scriptPath = resolve("scripts/prepare-vglc-smb-browser-demo.mjs");
const defaultLevelName = "vglc-smb-processed-mario-1-1";

type SpriteCoverage = "complete" | "player-only";
type DefaultSourceFormat = "json" | "text";

function testRootPath(suffix: string): string {
  return resolve(".cache/user-levels/test-vglc-smb-browser-demo", suffix);
}

function sourceEntry(fileName: string): unknown {
  return {
    kind: "file",
    fileName,
  };
}

type SyntheticSpriteEntry = {
  readonly source: unknown;
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
};

function spriteEntry(fileName: string): SyntheticSpriteEntry {
  return {
    source: sourceEntry(fileName),
    frame: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
  };
}

function defaultLevelInput(): unknown {
  return {
    widthTiles: 3,
    heightTiles: 2,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "sky", collision: "empty" },
      { tileId: "grass", collision: "solid" },
      { tileId: "gate", collision: "goal" },
    ],
    actorDefinitions: [
      { actorId: "runner-start", role: "player-start" },
      { actorId: "open-gate", role: "exit" },
    ],
    tiles: [
      ["sky", "gate", "sky"],
      ["grass", "grass", "grass"],
    ],
    actors: [
      { entityId: "runner-1", actorId: "runner-start", x: 0, y: 0 },
      { entityId: "gate-1", actorId: "open-gate", x: 1, y: 0 },
    ],
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeSyntheticCache(
  root: string,
  coverage: SpriteCoverage,
  sourceFormat: DefaultSourceFormat = "json",
): Promise<{
  readonly researchManifestPath: string;
  readonly assetFragmentPath: string;
  readonly outputDirectory: string;
}> {
  await rm(root, { recursive: true, force: true });

  const researchDirectory = resolve(root, "research");
  const assetDirectory = resolve(root, "assets");
  const outputDirectory = resolve(root, "browser-demo");
  await mkdir(resolve(researchDirectory, "levels"), { recursive: true });
  await mkdir(resolve(assetDirectory, "source"), { recursive: true });
  const sourceFileName =
    sourceFormat === "json" ? "default-level.json" : "default-level.txt";

  if (sourceFormat === "json") {
    await writeJson(
      resolve(researchDirectory, "levels", sourceFileName),
      defaultLevelInput(),
    );
  } else {
    await writeFile(
      resolve(researchDirectory, "levels", sourceFileName),
      "---",
    );
  }

  await writeJson(resolve(researchDirectory, "research-manifest.json"), {
    version: "1",
    levels: [
      {
        name: defaultLevelName,
        format: sourceFormat === "json" ? "original-json" : "vglc-smb-text",
        source: sourceEntry(`levels/${sourceFileName}`),
      },
    ],
  });

  for (const fileName of [
    "player.png",
    "player-idle.png",
    "sky.png",
    "grass.png",
    "gate.png",
    "open-gate.png",
    "gate-open.png",
    "level-visual.png",
  ]) {
    await writeFile(resolve(assetDirectory, "source", fileName), "synthetic");
  }

  const completeCoverage = {
    tileSprites: {
      gate: spriteEntry("source/gate.png"),
      grass: spriteEntry("source/grass.png"),
      sky: spriteEntry("source/sky.png"),
    },
    actorSprites: {
      "open-gate": {
        ...spriteEntry("source/open-gate.png"),
        stateSprites: {
          open: spriteEntry("source/gate-open.png"),
        },
      },
    },
    levelVisuals: {
      [defaultLevelName]: {
        source: sourceEntry("source/level-visual.png"),
        frame: { x: 0, y: 0, width: 48, height: 32 },
        offsetX: 0,
        offsetY: 16,
      },
    },
  };

  await writeJson(resolve(assetDirectory, "fragment.json"), {
    playerSprite: {
      ...spriteEntry("source/player.png"),
      stateSprites: {
        "small-idle": spriteEntry("source/player-idle.png"),
      },
    },
    ...(coverage === "complete" ? completeCoverage : {}),
  });

  return {
    researchManifestPath: resolve(researchDirectory, "research-manifest.json"),
    assetFragmentPath: resolve(assetDirectory, "fragment.json"),
    outputDirectory,
  };
}

async function runPrepareScript(input: {
  readonly researchManifestPath: string;
  readonly assetFragmentPath: string;
  readonly outputDirectory: string;
}): Promise<ScriptRunResult> {
  return runNodeScript(scriptPath, [
    "--research-manifest",
    input.researchManifestPath,
    "--out-dir",
    input.outputDirectory,
    "--asset-fragment",
    input.assetFragmentPath,
  ]);
}

describe("prepare-vglc-smb-browser-demo", () => {
  it("fails loudly when default sprite coverage is incomplete", async () => {
    const cachePaths = await writeSyntheticCache(
      testRootPath("missing-coverage"),
      "player-only",
    );
    const result = await runPrepareScript(cachePaths);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Default VGLC SMB sprite coverage is incomplete",
    );
    expect(result.stderr).toContain("missing tileSprites: gate, grass, sky");
    expect(result.stderr).toContain("missing actorSprites: open-gate");
  });

  it("accepts complete default selected-level sprite coverage", async () => {
    const cachePaths = await writeSyntheticCache(
      testRootPath("complete-coverage"),
      "complete",
    );
    const result = await runPrepareScript(cachePaths);
    const remoteManifest = JSON.parse(
      await readFile(
        resolve(cachePaths.outputDirectory, "remote-manifest.json"),
        "utf8",
      ),
    ) as {
      readonly tileSprites: Record<string, unknown>;
      readonly actorSprites: Record<
        string,
        {
          readonly stateSprites?: Record<
            string,
            { readonly source: { readonly kind: string; readonly url: string } }
          >;
        }
      >;
      readonly levelVisuals: Record<string, unknown>;
      readonly playerSprite: {
        readonly stateSprites?: Record<
          string,
          { readonly source: { readonly kind: string; readonly url: string } }
        >;
      };
    };

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      `Default VGLC SMB sprite coverage complete for ${defaultLevelName}.`,
    );
    expect(remoteManifest.playerSprite).toBeDefined();
    expect(Object.keys(remoteManifest.tileSprites).sort()).toEqual([
      "gate",
      "grass",
      "sky",
    ]);
    expect(Object.keys(remoteManifest.actorSprites)).toEqual(["open-gate"]);
    expect(
      remoteManifest.playerSprite.stateSprites?.["small-idle"]?.source,
    ).toEqual({
      kind: "url",
      url: "assets/playerSprite-small-idle.png",
    });
    expect(
      remoteManifest.actorSprites["open-gate"]?.stateSprites?.open?.source,
    ).toEqual({
      kind: "url",
      url: "assets/actorSprites-open-gate-open.png",
    });
    expect(remoteManifest.levelVisuals[defaultLevelName]).toEqual({
      source: {
        kind: "url",
        url: "assets/levelVisuals-vglc-smb-processed-mario-1-1.png",
      },
      frame: { x: 0, y: 0, width: 48, height: 32 },
      offsetX: 0,
      offsetY: 16,
    });
  });

  it("does not parse VGLC text defaults as JSON during prep", async () => {
    const cachePaths = await writeSyntheticCache(
      testRootPath("text-default"),
      "player-only",
      "text",
    );
    const result = await runPrepareScript(cachePaths);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "is not JSON; converted tile/actor sprite coverage is enforced at browser import time.",
    );
  });
});

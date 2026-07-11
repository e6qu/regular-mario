import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  decodeRgbaPng,
  readPngPixel,
} from "../../tests/support/png-test-support";
import {
  makeCleanScriptTestRoot,
  runNodeScript,
  type ScriptRunResult,
} from "../../tests/support/script-test-support";
import { makeSyntheticSmbRom } from "../../tests/support/smb-rom-test-support";

const scriptPath = resolve("scripts/extract-smb-rom-assets.mjs");
const testBaseDirectory = ".cache/user-levels/test-extract-smb-rom-assets";
const tilePixelCount = 64;

type ExtractionReport = {
  readonly paletteNames: readonly string[];
  readonly spriteCompositionCount: number;
  readonly outputs: readonly string[];
};

async function readExtractionReport(outDir: string): Promise<ExtractionReport> {
  return JSON.parse(
    await readFile(resolve(outDir, "extraction-report.json"), "utf8"),
  ) as ExtractionReport;
}

function solidTile(value: number): number[] {
  return Array.from({ length: tilePixelCount }, () => value);
}

function cornerTile(value: number): number[] {
  const pixels = solidTile(0);
  pixels[0] = value;
  return pixels;
}

function syntheticMasterPalette(): number[][] {
  return Array.from({ length: 64 }, (_, index) => [
    index,
    index * 2,
    index * 3,
  ]);
}

function makeTestMap(): unknown {
  return {
    ines: { prgBanks: 2, chrBanks: 1, mapper: 0 },
    masterPaletteRgb: syntheticMasterPalette(),
    palettes: {
      "test-sprite": { backdrop: null, colors: [1, 2, 3] },
      "test-background": { backdrop: 4, colors: [5, 6, 7] },
    },
    spriteCompositions: [
      {
        id: "test-hero",
        patternTable: 0,
        palette: "test-sprite",
        widthTiles: 2,
        heightTiles: 1,
        tiles: [
          { index: 0, column: 0, row: 0 },
          { index: 1, column: 1, row: 0 },
        ],
      },
    ],
  };
}

type SyntheticInputs = {
  readonly romPath: string;
  readonly mapPath: string;
  readonly outDir: string;
};

async function writeSyntheticInputs(root: string): Promise<SyntheticInputs> {
  const romPath = resolve(root, "rom.nes");
  const mapPath = resolve(root, "map.json");
  const outDir = resolve(root, "out");

  await writeFile(
    romPath,
    makeSyntheticSmbRom(
      new Map([
        [0, solidTile(3)],
        [1, cornerTile(1)],
        [256, solidTile(2)],
      ]),
    ),
  );
  await writeFile(mapPath, `${JSON.stringify(makeTestMap(), null, 2)}\n`);

  return { romPath, mapPath, outDir };
}

async function runExtractOnSyntheticInputs(suffix: string): Promise<{
  readonly inputs: SyntheticInputs;
  readonly result: ScriptRunResult;
}> {
  const root = await makeCleanScriptTestRoot(testBaseDirectory, suffix);
  const inputs = await writeSyntheticInputs(root);
  const result = await runNodeScript(scriptPath, [
    "--rom",
    inputs.romPath,
    "--map",
    inputs.mapPath,
    "--out-dir",
    inputs.outDir,
  ]);
  return { inputs, result };
}

async function readOutputPng(
  outDir: string,
  relativePath: string,
): Promise<ReturnType<typeof decodeRgbaPng>> {
  return decodeRgbaPng(await readFile(resolve(outDir, relativePath)));
}

async function runExtractWithCustomMap(
  suffix: string,
  map: unknown,
  cornerTileValue: number,
): Promise<{ outDir: string; result: ScriptRunResult }> {
  const root = await makeCleanScriptTestRoot(testBaseDirectory, suffix);
  const romPath = resolve(root, "rom.nes");
  const mapPath = resolve(root, "map.json");
  const outDir = resolve(root, "out");
  await writeFile(
    romPath,
    makeSyntheticSmbRom(new Map([[0, cornerTile(cornerTileValue)]])),
  );
  await writeFile(mapPath, JSON.stringify(map));

  const result = await runNodeScript(scriptPath, [
    "--rom",
    romPath,
    "--map",
    mapPath,
    "--out-dir",
    outDir,
  ]);
  return { outDir, result };
}

describe("extract-smb-rom-assets", () => {
  it("decodes CHR pattern tables into grayscale sheets", async () => {
    const { inputs, result } = await runExtractOnSyntheticInputs("grayscale");

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    const sheet = await readOutputPng(inputs.outDir, "pattern-table-0.png");
    expect(sheet.width).toBe(128);
    expect(sheet.height).toBe(128);
    expect(readPngPixel(sheet, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(readPngPixel(sheet, 7, 7)).toEqual([255, 255, 255, 255]);
    expect(readPngPixel(sheet, 8, 0)).toEqual([85, 85, 85, 255]);
    expect(readPngPixel(sheet, 9, 0)).toEqual([0, 0, 0, 255]);
  });

  it("renders named palette sheets with transparent and colored backdrops", async () => {
    const { inputs, result } = await runExtractOnSyntheticInputs("palettes");

    expect(result.exitCode).toBe(0);

    const spriteSheet = await readOutputPng(
      inputs.outDir,
      "pattern-table-0-test-sprite.png",
    );
    expect(readPngPixel(spriteSheet, 0, 0)).toEqual([3, 6, 9, 255]);
    expect(readPngPixel(spriteSheet, 9, 0)).toEqual([0, 0, 0, 0]);

    const backgroundSheet = await readOutputPng(
      inputs.outDir,
      "pattern-table-1-test-background.png",
    );
    expect(readPngPixel(backgroundSheet, 0, 0)).toEqual([6, 12, 18, 255]);
    expect(readPngPixel(backgroundSheet, 8, 0)).toEqual([4, 8, 12, 255]);
  });

  it("renders a direct-RGB palette with exact colors and transparency", async () => {
    const { outDir, result } = await runExtractWithCustomMap(
      "rgb-palette",
      {
        ines: { prgBanks: 2, chrBanks: 1, mapper: 0 },
        masterPaletteRgb: syntheticMasterPalette(),
        palettes: {
          "direct-rgb": {
            rgb: [null, [92, 148, 252], [216, 40, 0], [136, 112, 0]],
          },
        },
        spriteCompositions: [
          {
            id: "direct-tile",
            patternTable: 0,
            palette: "direct-rgb",
            widthTiles: 1,
            heightTiles: 1,
            tiles: [{ index: 0, column: 0, row: 0 }],
          },
        ],
      },
      1,
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    const sprite = await readOutputPng(outDir, "sprites/direct-tile.png");
    expect(readPngPixel(sprite, 0, 0)).toEqual([92, 148, 252, 255]);
    expect(readPngPixel(sprite, 1, 0)).toEqual([0, 0, 0, 0]);
  });

  it("rejects a direct-RGB palette without exactly four entries", async () => {
    const root = await makeCleanScriptTestRoot(
      testBaseDirectory,
      "rgb-palette-invalid",
    );
    const { romPath, outDir } = await writeSyntheticInputs(root);
    const mapPath = resolve(root, "bad-rgb-map.json");
    await writeFile(
      mapPath,
      JSON.stringify({
        ines: { prgBanks: 2, chrBanks: 1, mapper: 0 },
        masterPaletteRgb: syntheticMasterPalette(),
        palettes: { "bad-rgb": { rgb: [null, [1, 2, 3]] } },
        spriteCompositions: [],
      }),
    );

    const result = await runNodeScript(scriptPath, [
      "--rom",
      romPath,
      "--map",
      mapPath,
      "--out-dir",
      outDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("exactly 4 entries");
  });

  it("horizontally flips a composition tile when flipX is set", async () => {
    const { outDir, result } = await runExtractWithCustomMap(
      "flip",
      {
        ines: { prgBanks: 2, chrBanks: 1, mapper: 0 },
        masterPaletteRgb: syntheticMasterPalette(),
        palettes: {
          flip: { rgb: [null, [10, 20, 30], [40, 50, 60], [70, 80, 90]] },
        },
        spriteCompositions: [
          {
            id: "flip-pair",
            patternTable: 0,
            palette: "flip",
            widthTiles: 2,
            heightTiles: 1,
            tiles: [
              { index: 0, column: 0, row: 0 },
              { index: 0, column: 1, row: 0, flipX: true },
            ],
          },
        ],
      },
      1,
    );
    expect(result.exitCode).toBe(0);

    // cornerTile places the lit pixel at column 0; the flipped copy moves it to
    // the far column of its 8px tile.
    const sprite = await readOutputPng(outDir, "sprites/flip-pair.png");
    expect(readPngPixel(sprite, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(readPngPixel(sprite, 15, 0)).toEqual([10, 20, 30, 255]);
    expect(readPngPixel(sprite, 8, 0)).toEqual([0, 0, 0, 0]);
  });

  it("composes sprites from the numeric layout map", async () => {
    const { inputs, result } = await runExtractOnSyntheticInputs("sprites");

    expect(result.exitCode).toBe(0);

    const sprite = await readOutputPng(inputs.outDir, "sprites/test-hero.png");
    expect(sprite.width).toBe(16);
    expect(sprite.height).toBe(8);
    expect(readPngPixel(sprite, 0, 0)).toEqual([3, 6, 9, 255]);
    expect(readPngPixel(sprite, 8, 0)).toEqual([1, 2, 3, 255]);
    expect(readPngPixel(sprite, 9, 0)).toEqual([0, 0, 0, 0]);
  });

  it("writes an extraction report listing every output", async () => {
    const { inputs, result } = await runExtractOnSyntheticInputs("report");

    expect(result.exitCode).toBe(0);

    const report = await readExtractionReport(inputs.outDir);
    expect(report.paletteNames).toEqual(["test-sprite", "test-background"]);
    expect(report.spriteCompositionCount).toBe(1);
    expect(report.outputs).toHaveLength(7);
    expect(report.outputs).toContain("sprites/test-hero.png");
  });

  it("works end-to-end with the committed default extraction map", async () => {
    const root = await makeCleanScriptTestRoot(
      testBaseDirectory,
      "default-map",
    );
    const { romPath, outDir } = await writeSyntheticInputs(root);

    const result = await runNodeScript(scriptPath, [
      "--rom",
      romPath,
      "--out-dir",
      outDir,
    ]);

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    const report = await readExtractionReport(outDir);
    expect(report.paletteNames).toEqual([
      "mario-small",
      "enemy-overworld",
      "overworld-terrain",
      "overworld-coin-block",
      "overworld-pipe",
      "item-mushroom",
      "sprite-green",
      "sprite-red",
      "sprite-grey",
      "sprite-fire",
      "sprite-bowser",
      "mario-fire",
      "bg-cloud",
      "bg-green",
      "bg-castle",
      "bg-water",
      "bg-orange",
    ]);
    expect(report.spriteCompositionCount).toBe(86);
    expect(report.outputs).toContain("sprites/mario-small-idle.png");
    expect(report.outputs).toContain("sprites/goomba-walk.png");
    expect(report.outputs).toContain("sprites/tile-brick.png");
    expect(report.outputs).toContain("sprites/tile-question-block.png");
    expect(report.outputs).toContain("sprites/item-super-mushroom.png");
  });

  it("fails loudly on a structurally invalid ROM", async () => {
    const root = await makeCleanScriptTestRoot(
      testBaseDirectory,
      "invalid-rom",
    );
    const { mapPath, outDir } = await writeSyntheticInputs(root);
    const truncatedPath = resolve(root, "truncated.nes");
    await writeFile(
      truncatedPath,
      makeSyntheticSmbRom(new Map()).subarray(0, 1000),
    );

    const result = await runNodeScript(scriptPath, [
      "--rom",
      truncatedPath,
      "--map",
      mapPath,
      "--out-dir",
      outDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("bytes");
  });

  it("rejects a map whose sprite composition references an unknown palette", async () => {
    const root = await makeCleanScriptTestRoot(
      testBaseDirectory,
      "invalid-map",
    );
    const { romPath, outDir } = await writeSyntheticInputs(root);
    const badMap = makeTestMap() as {
      spriteCompositions: { palette: string }[];
    };
    const composition = badMap.spriteCompositions[0];

    if (composition === undefined) {
      throw new Error("Expected the test map to have a sprite composition.");
    }

    composition.palette = "missing-palette";
    const badMapPath = resolve(root, "bad-map.json");
    await writeFile(badMapPath, JSON.stringify(badMap));

    const result = await runNodeScript(scriptPath, [
      "--rom",
      romPath,
      "--map",
      badMapPath,
      "--out-dir",
      outDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing-palette");
  });
});

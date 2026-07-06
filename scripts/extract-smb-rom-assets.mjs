#!/usr/bin/env node
// Extract CHR pattern-table graphics from the user-supplied SMB ROM into the
// ignored cache (Decision 0018). Outputs (pattern-table sheets, palette
// variants, composed sprites) are derived from the user's own ROM and are
// written only under .cache/user-levels; nothing extracted is ever committed.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

import { encodeRgbaPng } from "./png-codec.mjs";
import {
  chrPatternTableCount,
  chrPatternTableTileCount,
  chrTilePixelSize,
  decodeChrTile,
  extractChrData,
} from "./smb-rom-format.mjs";
import {
  resolveCacheOutputDirectory,
  resolveRomPath,
} from "./smb-script-args.mjs";
import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const defaultRomPath = resolve(userLevelCacheRoot, "smb/rom.nes");
const defaultOutputDirectory = resolve(userLevelCacheRoot, "smb-rom-assets");
const defaultExtractionMapPath = resolve(
  "scripts/data/smb-rom-extraction-map.json",
);
const sheetTilesPerRow = 16;
const masterPaletteEntryCount = 64;
const grayscaleLevels = [
  [0, 0, 0],
  [85, 85, 85],
  [170, 170, 170],
  [255, 255, 255],
];

function printUsage() {
  console.log(`Usage:
  pnpm run extract:smb-rom -- [options]

Options:
  --rom <path>                  ROM path (default ${defaultRomPath}).
  --out-dir <path>              Output directory under .cache/user-levels
                                (default ${defaultOutputDirectory}).
  --map <path>                  Numeric extraction map JSON
                                (default ${defaultExtractionMapPath}).
  --master-palette-file <path>  Ignored-cache JSON overriding the 64-entry
                                master palette table.

Writes pattern-table sheets (grayscale plus each named palette), composed
sprite PNGs from the map's spriteCompositions, and extraction-report.json into
the output directory. All outputs are ROM-derived and must stay ignored.`);
}

function assertByte(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${label} must be an integer 0-255; got ${value}.`);
  }
}

function assertMasterPalette(masterPaletteRgb, label) {
  if (
    !Array.isArray(masterPaletteRgb) ||
    masterPaletteRgb.length !== masterPaletteEntryCount
  ) {
    throw new Error(
      `${label} must be an array of exactly ${masterPaletteEntryCount} [r,g,b] entries.`,
    );
  }

  masterPaletteRgb.forEach((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 3) {
      throw new Error(`${label}[${index}] must be an [r,g,b] triplet.`);
    }

    entry.forEach((channel, channelIndex) =>
      assertByte(channel, `${label}[${index}][${channelIndex}]`),
    );
  });
}

function assertPaletteIndex(value, label) {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value >= masterPaletteEntryCount
  ) {
    throw new Error(
      `${label} must be a NES master palette index 0-${masterPaletteEntryCount - 1}; got ${value}.`,
    );
  }
}

function assertRgbTriplet(entry, label) {
  if (!Array.isArray(entry) || entry.length !== 3) {
    throw new Error(`${label} must be an [r,g,b] triplet.`);
  }

  entry.forEach((channel, index) => assertByte(channel, `${label}[${index}]`));
}

function assertNamedPalette(palette, label) {
  if (palette === null || typeof palette !== "object") {
    throw new Error(`${label} must be an object.`);
  }

  // Direct-RGB form: exact colors (e.g. sampled from a reference image) as a
  // 4-entry array where each entry is null (transparent) or an [r,g,b] triplet.
  // This lets palettes match a reference pixel-exactly instead of approximating
  // through NES master-palette indices.
  if ("rgb" in palette) {
    if (!Array.isArray(palette.rgb) || palette.rgb.length !== 4) {
      throw new Error(`${label}.rgb must have exactly 4 entries.`);
    }

    palette.rgb.forEach((entry, index) => {
      if (entry !== null) {
        assertRgbTriplet(entry, `${label}.rgb[${index}]`);
      }
    });

    return;
  }

  // Master-index form: backdrop plus three NES master-palette indices.
  if (palette.backdrop !== null) {
    assertPaletteIndex(palette.backdrop, `${label}.backdrop`);
  }

  if (!Array.isArray(palette.colors) || palette.colors.length !== 3) {
    throw new Error(`${label}.colors must have exactly 3 entries.`);
  }

  palette.colors.forEach((color, index) =>
    assertPaletteIndex(color, `${label}.colors[${index}]`),
  );
}

function assertSpriteComposition(composition, palettes, label) {
  if (typeof composition.id !== "string" || composition.id.length === 0) {
    throw new Error(`${label}.id must be a non-empty string.`);
  }

  if (composition.patternTable !== 0 && composition.patternTable !== 1) {
    throw new Error(`${label}.patternTable must be 0 or 1.`);
  }

  if (!(composition.palette in palettes)) {
    throw new Error(
      `${label}.palette "${composition.palette}" is not a named palette in the map.`,
    );
  }

  if (
    !Number.isInteger(composition.widthTiles) ||
    !Number.isInteger(composition.heightTiles) ||
    composition.widthTiles <= 0 ||
    composition.heightTiles <= 0
  ) {
    throw new Error(
      `${label} widthTiles/heightTiles must be positive integers.`,
    );
  }

  if (!Array.isArray(composition.tiles) || composition.tiles.length === 0) {
    throw new Error(`${label}.tiles must be a non-empty array.`);
  }

  composition.tiles.forEach((tile, index) => {
    const tileLabel = `${label}.tiles[${index}]`;

    if (
      !Number.isInteger(tile.index) ||
      tile.index < 0 ||
      tile.index >= chrPatternTableTileCount
    ) {
      throw new Error(
        `${tileLabel}.index must be 0-${chrPatternTableTileCount - 1}.`,
      );
    }

    if (
      !Number.isInteger(tile.column) ||
      !Number.isInteger(tile.row) ||
      tile.column < 0 ||
      tile.row < 0 ||
      tile.column >= composition.widthTiles ||
      tile.row >= composition.heightTiles
    ) {
      throw new Error(
        `${tileLabel} column/row must fit inside ${composition.widthTiles}x${composition.heightTiles} tiles.`,
      );
    }

    if (tile.flipX !== undefined && typeof tile.flipX !== "boolean") {
      throw new Error(`${tileLabel}.flipX must be a boolean when present.`);
    }
  });
}

function parseExtractionMap(mapJson, label) {
  const map = JSON.parse(mapJson);

  assertMasterPalette(map.masterPaletteRgb, `${label}.masterPaletteRgb`);

  if (map.palettes === null || typeof map.palettes !== "object") {
    throw new Error(`${label}.palettes must be an object.`);
  }

  for (const [name, palette] of Object.entries(map.palettes)) {
    assertNamedPalette(palette, `${label}.palettes.${name}`);
  }

  if (!Array.isArray(map.spriteCompositions)) {
    throw new Error(`${label}.spriteCompositions must be an array.`);
  }

  map.spriteCompositions.forEach((composition, index) =>
    assertSpriteComposition(
      composition,
      map.palettes,
      `${label}.spriteCompositions[${index}]`,
    ),
  );

  return map;
}

function makeRgbaLookup({ palette, masterPaletteRgb }) {
  const lookup = [];

  if (palette === undefined) {
    grayscaleLevels.forEach((rgb) => lookup.push([...rgb, 255]));
    return lookup;
  }

  if ("rgb" in palette) {
    palette.rgb.forEach((entry) =>
      lookup.push(entry === null ? [0, 0, 0, 0] : [...entry, 255]),
    );
    return lookup;
  }

  lookup.push(
    palette.backdrop === null
      ? [0, 0, 0, 0]
      : [...masterPaletteRgb[palette.backdrop], 255],
  );
  palette.colors.forEach((color) =>
    lookup.push([...masterPaletteRgb[color], 255]),
  );

  return lookup;
}

function blitTile({
  pixels,
  imageWidth,
  tilePixels,
  originX,
  originY,
  rgbaLookup,
  flipX = false,
}) {
  for (let y = 0; y < chrTilePixelSize; y += 1) {
    for (let x = 0; x < chrTilePixelSize; x += 1) {
      const sourceX = flipX ? chrTilePixelSize - 1 - x : x;
      const value = tilePixels[y * chrTilePixelSize + sourceX];
      const offset = ((originY + y) * imageWidth + originX + x) * 4;
      const [red, green, blue, alpha] = rgbaLookup[value];
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = alpha;
    }
  }
}

function renderPatternTableSheet({ chrData, patternTable, rgbaLookup }) {
  const sheetPixelSize = sheetTilesPerRow * chrTilePixelSize;
  const pixels = new Uint8Array(sheetPixelSize * sheetPixelSize * 4);

  for (let tile = 0; tile < chrPatternTableTileCount; tile += 1) {
    blitTile({
      pixels,
      imageWidth: sheetPixelSize,
      tilePixels: decodeChrTile(
        chrData,
        patternTable * chrPatternTableTileCount + tile,
      ),
      originX: (tile % sheetTilesPerRow) * chrTilePixelSize,
      originY: Math.floor(tile / sheetTilesPerRow) * chrTilePixelSize,
      rgbaLookup,
    });
  }

  return encodeRgbaPng({
    width: sheetPixelSize,
    height: sheetPixelSize,
    pixels,
  });
}

function renderSpriteComposition({ chrData, composition, map }) {
  const width = composition.widthTiles * chrTilePixelSize;
  const height = composition.heightTiles * chrTilePixelSize;
  const pixels = new Uint8Array(width * height * 4);
  const rgbaLookup = makeRgbaLookup({
    palette: map.palettes[composition.palette],
    masterPaletteRgb: map.masterPaletteRgb,
  });

  for (const tile of composition.tiles) {
    blitTile({
      pixels,
      imageWidth: width,
      tilePixels: decodeChrTile(
        chrData,
        composition.patternTable * chrPatternTableTileCount + tile.index,
      ),
      originX: tile.column * chrTilePixelSize,
      originY: tile.row * chrTilePixelSize,
      rgbaLookup,
      flipX: tile.flipX === true,
    });
  }

  return encodeRgbaPng({ width, height, pixels });
}

async function writeOutput(outputDirectory, relativePath, bytes, outputs) {
  const outputPath = resolve(outputDirectory, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  outputs.push(relativePath);
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const romPath = resolveRomPath(defaultRomPath);
  const outputDirectory = resolveCacheOutputDirectory(defaultOutputDirectory);
  const mapPath = resolve(readOption("--map") ?? defaultExtractionMapPath);
  const map = parseExtractionMap(await readFile(mapPath, "utf8"), "map");
  const masterPaletteFile = readOption("--master-palette-file");

  if (masterPaletteFile !== undefined) {
    const overridePath = assertUserLevelCachePath(
      masterPaletteFile,
      "--master-palette-file",
    );
    const override = JSON.parse(await readFile(overridePath, "utf8"));
    assertMasterPalette(override, "--master-palette-file");
    map.masterPaletteRgb = override;
  }

  const romBytes = await readFile(romPath);
  const chrData = extractChrData(romBytes);
  const outputs = [];

  for (let table = 0; table < chrPatternTableCount; table += 1) {
    await writeOutput(
      outputDirectory,
      `pattern-table-${table}.png`,
      renderPatternTableSheet({
        chrData,
        patternTable: table,
        rgbaLookup: makeRgbaLookup({
          palette: undefined,
          masterPaletteRgb: map.masterPaletteRgb,
        }),
      }),
      outputs,
    );

    for (const [name, palette] of Object.entries(map.palettes)) {
      await writeOutput(
        outputDirectory,
        `pattern-table-${table}-${name}.png`,
        renderPatternTableSheet({
          chrData,
          patternTable: table,
          rgbaLookup: makeRgbaLookup({
            palette,
            masterPaletteRgb: map.masterPaletteRgb,
          }),
        }),
        outputs,
      );
    }
  }

  for (const composition of map.spriteCompositions) {
    await writeOutput(
      outputDirectory,
      `sprites/${composition.id}.png`,
      renderSpriteComposition({ chrData, composition, map }),
      outputs,
    );
  }

  const report = {
    romPath,
    romSha256: createHash("sha256").update(romBytes).digest("hex"),
    mapPath,
    paletteNames: Object.keys(map.palettes),
    spriteCompositionCount: map.spriteCompositions.length,
    outputs,
  };
  await writeFile(
    resolve(outputDirectory, "extraction-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(JSON.stringify(report, null, 2));
  console.log(
    `Extracted ${outputs.length} ROM-derived files into ${outputDirectory} (ignored cache only).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

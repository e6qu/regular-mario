// Builds fully synthetic iNES ROM images for script tests. No real game data
// is used or reproduced; tile pixel patterns are supplied by each test.

const inesHeaderByteLength = 16;
const prgByteLength = 2 * 16384;
const chrByteLength = 8192;
const chrTileByteLength = 16;
const chrTilePixelSize = 8;
const chrTilePixelCount = chrTilePixelSize * chrTilePixelSize;

export function makeSyntheticSmbRom(
  tilePatterns: ReadonlyMap<number, readonly number[]>,
): Buffer {
  const rom = Buffer.alloc(
    inesHeaderByteLength + prgByteLength + chrByteLength,
  );
  rom[0] = 0x4e;
  rom[1] = 0x45;
  rom[2] = 0x53;
  rom[3] = 0x1a;
  rom[4] = 2;
  rom[5] = 1;

  const chrStart = inesHeaderByteLength + prgByteLength;

  for (const [tileIndex, pixels] of tilePatterns) {
    if (pixels.length !== chrTilePixelCount) {
      throw new Error(
        `Synthetic tile ${tileIndex} must have ${chrTilePixelCount} pixel values.`,
      );
    }

    const tileStart = chrStart + tileIndex * chrTileByteLength;

    for (let y = 0; y < chrTilePixelSize; y += 1) {
      let planeZeroByte = 0;
      let planeOneByte = 0;

      for (let x = 0; x < chrTilePixelSize; x += 1) {
        const value = pixels[y * chrTilePixelSize + x];

        if (
          value === undefined ||
          !Number.isInteger(value) ||
          value < 0 ||
          value > 3
        ) {
          throw new Error(
            `Synthetic tile ${tileIndex} pixel (${x},${y}) must be 0-3.`,
          );
        }

        const bit = 7 - x;
        planeZeroByte |= (value & 1) << bit;
        planeOneByte |= ((value >> 1) & 1) << bit;
      }

      rom[tileStart + y] = planeZeroByte;
      rom[tileStart + chrTilePixelSize + y] = planeOneByte;
    }
  }

  return rom;
}

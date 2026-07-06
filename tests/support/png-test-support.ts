// Independent strict PNG decoder for test assertions (8-bit RGBA, filter type
// 0 only). Deliberately separate from the script-side encoder so tests verify
// encoded output rather than round-tripping one implementation.

import { inflateSync } from "node:zlib";

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const rgbaBytesPerPixel = 4;

export type DecodedRgbaPng = {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
};

export function decodeRgbaPng(pngBytes: Buffer): DecodedRgbaPng {
  pngSignature.forEach((expected, index) => {
    if (pngBytes[index] !== expected) {
      throw new Error("File does not start with the PNG signature.");
    }
  });

  let offset = pngSignature.length;
  let width: number | undefined;
  let height: number | undefined;
  const idatParts: Buffer[] = [];

  while (offset + 8 <= pngBytes.length) {
    const dataLength = pngBytes.readUInt32BE(offset);
    const chunkType = pngBytes
      .subarray(offset + 4, offset + 8)
      .toString("ascii");
    const data = pngBytes.subarray(offset + 8, offset + 8 + dataLength);

    if (chunkType === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);

      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error(
          "PNG is outside the supported test profile (8-bit RGBA, non-interlaced).",
        );
      }
    } else if (chunkType === "IDAT") {
      idatParts.push(data);
    } else if (chunkType === "IEND") {
      break;
    }

    offset += 12 + dataLength;
  }

  if (width === undefined || height === undefined || idatParts.length === 0) {
    throw new Error("PNG is missing IHDR or IDAT chunks.");
  }

  const filtered = inflateSync(Buffer.concat(idatParts));
  const rowByteLength = width * rgbaBytesPerPixel;
  const pixels = new Uint8Array(width * height * rgbaBytesPerPixel);

  for (let y = 0; y < height; y += 1) {
    const filterType = filtered[y * (rowByteLength + 1)];

    if (filterType !== 0) {
      throw new Error(
        `PNG row ${y} uses filter type ${filterType}; only filter type 0 is supported.`,
      );
    }

    pixels.set(
      filtered.subarray(
        y * (rowByteLength + 1) + 1,
        y * (rowByteLength + 1) + 1 + rowByteLength,
      ),
      y * rowByteLength,
    );
  }

  return { width, height, pixels };
}

export function readPngPixel(
  decoded: DecodedRgbaPng,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  if (x < 0 || y < 0 || x >= decoded.width || y >= decoded.height) {
    throw new Error(
      `Pixel (${x},${y}) is outside the ${decoded.width}x${decoded.height} image.`,
    );
  }

  const offset = (y * decoded.width + x) * rgbaBytesPerPixel;
  const red = decoded.pixels[offset];
  const green = decoded.pixels[offset + 1];
  const blue = decoded.pixels[offset + 2];
  const alpha = decoded.pixels[offset + 3];

  if (
    red === undefined ||
    green === undefined ||
    blue === undefined ||
    alpha === undefined
  ) {
    throw new Error(`Pixel (${x},${y}) is missing channel data.`);
  }

  return [red, green, blue, alpha];
}

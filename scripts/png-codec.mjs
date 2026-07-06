// Minimal PNG encode/decode for local tooling: 8-bit RGBA, no interlace,
// filter type 0. Uses node:zlib; no third-party dependencies.

import { Buffer } from "node:buffer";
import { deflateSync, inflateSync } from "node:zlib";

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const rgbaBytesPerPixel = 4;
const bitDepthEightBits = 8;
const colorTypeRgba = 6;

const crc32Table = makeCrc32Table();

function makeCrc32Table() {
  const table = new Uint32Array(256);

  for (let value = 0; value < 256; value += 1) {
    let crc = value;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[value] = crc >>> 0;
  }

  return table;
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const lengthBytes = Buffer.alloc(4);
  lengthBytes.writeUInt32BE(data.length, 0);
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);

  return Buffer.concat([lengthBytes, typeBytes, data, crcBytes]);
}

export function encodeRgbaPng({ width, height, pixels }) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      `PNG dimensions must be positive integers; got ${width}x${height}.`,
    );
  }

  const expectedPixelByteLength = width * height * rgbaBytesPerPixel;

  if (pixels.length !== expectedPixelByteLength) {
    throw new Error(
      `PNG pixel buffer is ${pixels.length} bytes; expected ${expectedPixelByteLength} for ${width}x${height} RGBA.`,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepthEightBits;
  ihdr[9] = colorTypeRgba;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowByteLength = width * rgbaBytesPerPixel;
  const filtered = Buffer.alloc((rowByteLength + 1) * height);

  for (let y = 0; y < height; y += 1) {
    filtered[y * (rowByteLength + 1)] = 0;
    Buffer.from(
      pixels.buffer,
      pixels.byteOffset + y * rowByteLength,
      rowByteLength,
    ).copy(filtered, y * (rowByteLength + 1) + 1);
  }

  return Buffer.concat([
    pngSignature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", deflateSync(filtered)),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function decodeRgbaPng(pngBytes) {
  if (
    pngBytes.length < pngSignature.length ||
    !pngSignature.equals(pngBytes.subarray(0, pngSignature.length))
  ) {
    throw new Error("File does not start with the PNG signature.");
  }

  let offset = pngSignature.length;
  let width;
  let height;
  const idatParts = [];

  while (offset + 8 <= pngBytes.length) {
    const dataLength = pngBytes.readUInt32BE(offset);
    const chunkType = pngBytes
      .subarray(offset + 4, offset + 8)
      .toString("ascii");
    const data = pngBytes.subarray(offset + 8, offset + 8 + dataLength);

    if (chunkType === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);

      if (
        data[8] !== bitDepthEightBits ||
        data[9] !== colorTypeRgba ||
        data[12] !== 0
      ) {
        throw new Error(
          "PNG is outside the supported profile (8-bit RGBA, non-interlaced).",
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

    filtered.copy(
      Buffer.from(pixels.buffer),
      y * rowByteLength,
      y * (rowByteLength + 1) + 1,
      y * (rowByteLength + 1) + 1 + rowByteLength,
    );
  }

  return { width, height, pixels };
}

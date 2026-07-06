import { describe, expect, it } from "vitest";

import { buildStoreOnlyZip, crc32 } from "./store-only-zip";

// Parse a store-only archive by walking its local file headers, to prove the
// bytes we emit are a well-formed, extractable ZIP.
function extractStoreOnlyZip(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let offset = 0;

  while (
    offset + 4 <= zip.length &&
    view.getUint32(offset, true) === 0x04034b50
  ) {
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(
      zip.slice(offset + 30, offset + 30 + nameLength),
    );
    const dataStart = offset + 30 + nameLength + extraLength;
    entries.set(name, zip.slice(dataStart, dataStart + uncompressedSize));
    offset = dataStart + uncompressedSize;
  }

  return entries;
}

describe("store-only zip", () => {
  const encoder = new TextEncoder();

  it("computes standard CRC32 values", () => {
    expect(crc32(encoder.encode(""))).toBe(0);
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips entries through a valid, extractable archive", () => {
    const runJsonData = encoder.encode('{"frameCount":2}');
    const framePngData = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const entries = [
      { path: "run.json", data: runJsonData },
      { path: "frames/000001.png", data: framePngData },
    ];

    const zip = buildStoreOnlyZip(entries);

    // Local file header magic "PK\x03\x04".
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // End-of-central-directory magic "PK\x05\x06" near the tail.
    expect(Array.from(zip.slice(zip.length - 22, zip.length - 18))).toEqual([
      0x50, 0x4b, 0x05, 0x06,
    ]);

    const extracted = extractStoreOnlyZip(zip);
    expect(extracted.size).toBe(2);
    expect(extracted.get("run.json")).toEqual(runJsonData);
    expect(extracted.get("frames/000001.png")).toEqual(framePngData);
  });

  it("produces an empty but valid archive for no entries", () => {
    const zip = buildStoreOnlyZip([]);
    expect(zip.length).toBe(22);
    expect(extractStoreOnlyZip(zip).size).toBe(0);
  });
});

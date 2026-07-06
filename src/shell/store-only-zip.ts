// A minimal store-only (uncompressed) ZIP writer with no external dependency,
// so it respects the app's strict CSP / no-deps constraints while still
// producing a standard .zip that any tool can open. Used to package a recorded
// run (replay log + screenshots) for download.

export type ZipEntry = {
  readonly path: string;
  readonly data: Uint8Array;
};

const localFileHeaderSignature = 0x04034b50;
const centralDirectoryHeaderSignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;
const zipVersion = 20;

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const crcTable = makeCrcTable();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index] ?? 0;
    const tableIndex = (crc ^ byte) & 0xff;
    crc = (crc >>> 8) ^ (crcTable[tableIndex] ?? 0);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

type PreparedEntry = {
  readonly nameBytes: Uint8Array;
  readonly data: Uint8Array;
  readonly crc: number;
  readonly localHeaderOffset: number;
};

export function buildStoreOnlyZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const prepared: PreparedEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, localFileHeaderSignature, true);
    view.setUint16(4, zipVersion, true);
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression: store
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, crc, true);
    view.setUint32(18, entry.data.length, true); // compressed size
    view.setUint32(22, entry.data.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // extra length
    localHeader.set(nameBytes, 30);

    prepared.push({
      nameBytes,
      data: entry.data,
      crc,
      localHeaderOffset: offset,
    });
    chunks.push(localHeader, entry.data);
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  let centralDirectorySize = 0;

  for (const entry of prepared) {
    const header = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, centralDirectoryHeaderSignature, true);
    view.setUint16(4, zipVersion, true); // version made by
    view.setUint16(6, zipVersion, true); // version needed
    view.setUint16(8, 0, true); // flags
    view.setUint16(10, 0, true); // compression: store
    view.setUint16(12, 0, true); // mod time
    view.setUint16(14, 0, true); // mod date
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.data.length, true); // compressed size
    view.setUint32(24, entry.data.length, true); // uncompressed size
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true); // extra length
    view.setUint16(32, 0, true); // comment length
    view.setUint16(34, 0, true); // disk number start
    view.setUint16(36, 0, true); // internal attributes
    view.setUint32(38, 0, true); // external attributes
    view.setUint32(42, entry.localHeaderOffset, true);
    header.set(entry.nameBytes, 46);

    chunks.push(header);
    centralDirectorySize += header.length;
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, endOfCentralDirectorySignature, true);
  endView.setUint16(4, 0, true); // disk number
  endView.setUint16(6, 0, true); // disk with central directory
  endView.setUint16(8, prepared.length, true); // entries on this disk
  endView.setUint16(10, prepared.length, true); // total entries
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true); // comment length
  chunks.push(endRecord);

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let cursor = 0;

  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }

  return result;
}

// Shared iNES container and CHR pattern-table parsing for the local-only SMB
// ROM tooling (Decision 0018). This module encodes documented file-format facts
// only; it never contains ROM bytes, pixel data, or other game content. All
// parsing fails loudly on unexpected input instead of guessing.

export const inesHeaderByteLength = 16;
export const inesMagicBytes = [0x4e, 0x45, 0x53, 0x1a];
export const prgBankByteLength = 16384;
export const chrBankByteLength = 8192;

export const smbPrgBankCount = 2;
export const smbChrBankCount = 1;
export const smbMapperNumber = 0;
export const smbRomTotalByteLength =
  inesHeaderByteLength +
  smbPrgBankCount * prgBankByteLength +
  smbChrBankCount * chrBankByteLength;

export const chrTileByteLength = 16;
export const chrTilePixelSize = 8;
export const chrPatternTableTileCount = 256;
export const chrPatternTableCount = 2;
export const chrTotalTileCount =
  chrPatternTableTileCount * chrPatternTableCount;

export function parseInesHeader(romBytes) {
  if (romBytes.length < inesHeaderByteLength) {
    throw new Error(
      `ROM file is ${romBytes.length} bytes, smaller than the ${inesHeaderByteLength}-byte iNES header.`,
    );
  }

  for (let index = 0; index < inesMagicBytes.length; index += 1) {
    if (romBytes[index] !== inesMagicBytes[index]) {
      throw new Error(
        "ROM file does not start with the iNES magic bytes; this is not an iNES ROM file.",
      );
    }
  }

  const flags6 = romBytes[6];
  const flags7 = romBytes[7];

  return {
    prgBankCount: romBytes[4],
    chrBankCount: romBytes[5],
    mapperNumber: (flags6 >> 4) | (flags7 & 0xf0),
    hasTrainer: (flags6 & 0x04) !== 0,
  };
}

export function assertSmbRomStructure(romBytes) {
  const header = parseInesHeader(romBytes);

  if (header.hasTrainer) {
    throw new Error(
      "ROM file contains a 512-byte trainer; expected a clean dump without a trainer.",
    );
  }

  if (header.prgBankCount !== smbPrgBankCount) {
    throw new Error(
      `ROM has ${header.prgBankCount} PRG banks; expected ${smbPrgBankCount} for Super Mario Bros.`,
    );
  }

  if (header.chrBankCount !== smbChrBankCount) {
    throw new Error(
      `ROM has ${header.chrBankCount} CHR banks; expected ${smbChrBankCount} for Super Mario Bros.`,
    );
  }

  if (header.mapperNumber !== smbMapperNumber) {
    throw new Error(
      `ROM uses mapper ${header.mapperNumber}; expected mapper ${smbMapperNumber} (NROM) for Super Mario Bros.`,
    );
  }

  if (romBytes.length !== smbRomTotalByteLength) {
    throw new Error(
      `ROM file is ${romBytes.length} bytes; expected exactly ${smbRomTotalByteLength} bytes (header + PRG + CHR).`,
    );
  }

  return header;
}

export function extractChrData(romBytes) {
  assertSmbRomStructure(romBytes);

  const chrStart = inesHeaderByteLength + smbPrgBankCount * prgBankByteLength;

  return romBytes.subarray(chrStart, chrStart + chrBankByteLength);
}

// SMB is NROM (mapper 0): its 32 KB of PRG ROM is mapped straight to CPU
// $8000-$FFFF. This returns the two PRG banks as one contiguous buffer so the
// level decoder can follow the game's own pointer tables.
export function extractPrgData(romBytes) {
  assertSmbRomStructure(romBytes);

  return romBytes.subarray(
    inesHeaderByteLength,
    inesHeaderByteLength + smbPrgBankCount * prgBankByteLength,
  );
}

export const smbPrgCpuBaseAddress = 0x8000;

// Converts a CPU address in the PRG window ($8000-$FFFF) to an index into the
// buffer returned by extractPrgData. Fails loudly outside the PRG window.
export function cpuAddressToPrgOffset(cpuAddress) {
  if (
    !Number.isInteger(cpuAddress) ||
    cpuAddress < smbPrgCpuBaseAddress ||
    cpuAddress > 0xffff
  ) {
    throw new Error(
      `CPU address ${cpuAddress} is outside the PRG window $8000-$FFFF.`,
    );
  }

  return cpuAddress - smbPrgCpuBaseAddress;
}

// Reads a little-endian 16-bit pointer from a table in PRG and returns the CPU
// address it holds.
export function readPrgPointer(prgData, tableCpuAddress, index) {
  const base = cpuAddressToPrgOffset(tableCpuAddress) + index * 2;
  return prgData[base] | (prgData[base + 1] << 8);
}

export function decodeChrTile(chrData, tileIndex) {
  if (
    !Number.isInteger(tileIndex) ||
    tileIndex < 0 ||
    tileIndex >= chrTotalTileCount
  ) {
    throw new Error(
      `CHR tile index ${tileIndex} is out of range 0..${chrTotalTileCount - 1}.`,
    );
  }

  const tileStart = tileIndex * chrTileByteLength;
  const pixels = new Uint8Array(chrTilePixelSize * chrTilePixelSize);

  for (let y = 0; y < chrTilePixelSize; y += 1) {
    const planeZeroByte = chrData[tileStart + y];
    const planeOneByte = chrData[tileStart + chrTilePixelSize + y];

    for (let x = 0; x < chrTilePixelSize; x += 1) {
      const bit = 7 - x;
      const lowBit = (planeZeroByte >> bit) & 1;
      const highBit = (planeOneByte >> bit) & 1;
      pixels[y * chrTilePixelSize + x] = lowBit | (highBit << 1);
    }
  }

  return pixels;
}

// Builds a minimal-but-valid iNES SMB ROM image for hermetic tests of the
// level decoder: a correct NROM header, a 32 KB PRG with the level/enemy
// pointer tables wired to one small Ground area (world 1-1), and an 8 KB CHR
// bank. Contains only synthetic numeric data — no game content.

const HEADER = 16;
const PRG = 32768;
const CHR = 8192;

// CPU addresses of the pointer tables the decoder follows (see the decoder /
// docs/smb-level-format.md). PRG offset = CPU address - 0x8000.
const WORLD_ADDR_OFFSETS = 0x9cb4;
const AREA_ADDR_OFFSETS = 0x9cbc;
const ENEMY_ADDR_H_OFFSETS = 0x9ce0;
const ENEMY_DATA_ADDR_LOW = 0x9ce4;
const ENEMY_DATA_ADDR_HIGH = 0x9d06;
const AREA_DATA_H_OFFSETS = 0x9d28;
const AREA_DATA_ADDR_LOW = 0x9d2c;
const AREA_DATA_ADDR_HIGH = 0x9d4e;

const LEVEL_STREAM_ADDR = 0xa600; // free PRG space for the object stream
const ENEMY_STREAM_ADDR = 0xa700; // free PRG space for the enemy stream

// A single Ground area (AreaPointer $25 → type 1, index 5), with a power-up
// block at col 5 row 7, a coin block at col 8 row 7, and a Goomba at col 6.
const AREA_POINTER = 0x25;
const AREA_INDEX = 0x25 & 0x1f; // 5

export function makeSyntheticSmbLevelRom(): Buffer {
  const rom = Buffer.alloc(HEADER + PRG + CHR, 0);
  rom[0] = 0x4e;
  rom[1] = 0x45;
  rom[2] = 0x53;
  rom[3] = 0x1a;
  rom[4] = 2; // PRG banks
  rom[5] = 1; // CHR bank
  // flags6/flags7 = 0 → mapper 0, no trainer

  const prg = (cpuAddr: number): number => HEADER + (cpuAddr - 0x8000);

  // World 1 starts at area-list index 0 and has 1 level slot.
  rom[prg(WORLD_ADDR_OFFSETS + 0)] = 0;
  rom[prg(WORLD_ADDR_OFFSETS + 1)] = 1;
  rom[prg(AREA_ADDR_OFFSETS + 0)] = AREA_POINTER;

  // Per-area-type base offsets: Ground (type 1) → 0 for both tables.
  rom[prg(AREA_DATA_H_OFFSETS + 1)] = 0;
  rom[prg(ENEMY_ADDR_H_OFFSETS + 1)] = 0;

  rom[prg(AREA_DATA_ADDR_LOW + AREA_INDEX)] = LEVEL_STREAM_ADDR & 0xff;
  rom[prg(AREA_DATA_ADDR_HIGH + AREA_INDEX)] = LEVEL_STREAM_ADDR >> 8;
  rom[prg(ENEMY_DATA_ADDR_LOW + AREA_INDEX)] = ENEMY_STREAM_ADDR & 0xff;
  rom[prg(ENEMY_DATA_ADDR_HIGH + AREA_INDEX)] = ENEMY_STREAM_ADDR >> 8;

  // Level stream: header, power-up block, coin block, terminator.
  const level = [0x50, 0x21, 0x57, 0x00, 0x87, 0x01, 0xfd];
  level.forEach((b, i) => {
    rom[prg(LEVEL_STREAM_ADDR) + i] = b;
  });

  // Enemy stream: one Goomba at col 6 row 11, terminator.
  const enemies = [0x6b, 0x06, 0xff];
  enemies.forEach((b, i) => {
    rom[prg(ENEMY_STREAM_ADDR) + i] = b;
  });

  return rom;
}

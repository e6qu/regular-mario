// Decode the original Super Mario Bros. background music from a locally-supplied
// ROM into NUMERIC note data (MIDI pitch + duration in seconds) for all three
// pitched channels, and write it to a committed JSON the game plays. Only the
// numeric note data is committed (like the SMB level layouts under content/);
// the ROM itself and any rendered audio stay local and are never committed.
//
// Format references (cross-checked against the ROM, not guessed):
//   - Data Crystal, "Super Mario Bros./Notes"
//     https://datacrystal.tcrf.net/wiki/Super_Mario_Bros./Notes
//   - pgattic/smb1-disasm audio/engine.asm + audio/music.asm (channel handlers)
//   - Verified in-ROM: FreqRegLookupTbl, MusicLengthLookupTbl, the per-song
//     headers, and the note streams are all located and confirmed in place.
//
// Header (6 bytes): [lengthOffset, dataLo, dataHi, triOffset, sq1Offset, noise].
// The square-2 stream starts at the data address; triangle / square-1 start at
// dataAddress + their offset. The engine ticks every frame with no tempo divider,
// so a note of L frames lasts L / 60 s (the ground song's quarter = 36 frames =
// 0.6 s = the documented 100 BPM).
//
// Channel byte encodings (from engine.asm):
//   square-2 / triangle: d7=1 -> length (d2-d0 index the length table);
//                        else the byte is a freq-table offset; $00 stops.
//   square-1: every byte is note (d5-d1 = byte & 0x3e) + length index whose
//             bits are (d0, d7, d6); $00 is a control byte (skip).
//   A freq-table entry is a 16-bit big-endian NES period; hz = CPU/(16*(p+1)),
//   CPU = 1789773 (NTSC). Offset $04 / period 0 is a rest.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const romPath = resolve(here, "../.cache/user-levels/smb/rom.nes");
const outPath = resolve(here, "../src/shell/smb-rom-music.json");

const CPU_HZ = 1789773;
const INES_HEADER = 16;
const FREQ_TABLE_BASE = 0xfefe; // note offset O -> period at FREQ_TABLE_BASE + O
const LENGTH_TABLE_BASE = 0xff66; // right after the frequency table
const REST_NOTE_BYTE = 0x04;
const FRAMES_PER_SECOND = 60;
// This ROM's length table begins one row later than the reference disassembly's,
// so the ground song's length offset ($18) lands on a row whose note lengths are
// exactly 2/3 of the standard-tempo row (quarter = 24 frames instead of 36). That
// plays the music at 3/2 speed, so scale note durations back to the documented
// 100 BPM (quarter = 36 frames = 0.6 s).
const TEMPO_SCALE = 1.5;

// Each theme lists the square-2 note streams (located by their opening bytes) to
// play in order; every other channel is found via the stream's header.
const THEMES = {
  overworld: [
    "82 34 84 34 34 82 2c 84 34 86 3a", // GroundMLdIn — the "E E E C E G" intro
    "85 2c 22 1c 84 26 2a 82 28 26 04", // GroundM_P1
    "84 04 82 3a 38 36 32 04 34", // GroundM_P2A
    "84 04 82 3a 38 36 32 04 34 04 64 04 64", // GroundM_P2B
    "84 04 85 32 85 30 86 2c 04 00", // GroundM_P2C
    "82 2c 84 2c 2c 82 2c 30 04 34 2c 04 26 86 22 00", // GroundM_P3A
  ],
  underground: ["82 14 2c 62 26 10 28 80 04"],
  castle: ["80 22 28 22 26 22 24 22 26"],
  // WaterMusData — the swimming theme's square-2 stream.
  water: ["82 18 1c 20 22 26 28 81 2a 2a 2a"],
  // Star_CloudMData — the invincibility (star power) theme; loops fast.
  star: ["84 2c 2c 2c 82 04 2c 04 85 2c 84 2c 2c"],
  // WinLevelMusData — the flagpole/level-clear fanfare (played once).
  levelClear: ["87 04 06 0c 14 1c 22 86 2c 22"],
  // VictoryMusData — the world-8 castle rescue victory theme (played once).
  victory: ["83 04 84 0c 83 62 10 84 12"],
  // GameOverMusData — the game-over jingle (played once).
  gameOver: ["82 2c 04 04 22 04 04 84 1c 87"],
  // TimeRunOutMusData — the "hurry up!" time-warning sting (played once).
  timeWarning: ["81 1c 30 04 30 30 04 1e 32 04 32 32"],
  // DeathMusData — the brief "you died" jingle ($86 $04 then GroundM_P4CData).
  death: ["86 04 82 2a 36 04 36 87 36 34 30 86 2c 04 00"],
};

const loadPrg = (rom) => rom.subarray(INES_HEADER, INES_HEADER + 32 * 1024);

function makeReaders(prg) {
  const readByte = (cpu) => prg[cpu - 0x8000];
  const readPeriod = (cpu) => (readByte(cpu) << 8) | readByte(cpu + 1);
  const lengthFrames = (songOffset, index) =>
    readByte(LENGTH_TABLE_BASE + songOffset + index) || 8;
  return { readByte, readPeriod, lengthFrames };
}

function findStream(prg, signatureHex) {
  const signature = signatureHex.split(" ").map((byte) => parseInt(byte, 16));
  for (let index = 0; index <= prg.length - signature.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < signature.length; offset += 1) {
      if (prg[index + offset] !== signature[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return 0x8000 + index;
    }
  }
  return -1;
}

// Locate a 6-byte area-music header whose data address is dataAddr.
function findHeader({ readByte }, dataAddr) {
  const lo = dataAddr & 0xff;
  const hi = (dataAddr >> 8) & 0xff;
  for (let cpu = 0xf800; cpu < 0xfa10; cpu += 1) {
    if (readByte(cpu) === lo && readByte(cpu + 1) === hi) {
      const lengthOffset = readByte(cpu - 1);
      if (lengthOffset <= 0x20) {
        return {
          lengthOffset,
          triOffset: readByte(cpu + 2),
          sq1Offset: readByte(cpu + 3),
        };
      }
    }
  }
  return null;
}

function periodToMidi(period) {
  if (period <= 0) {
    return null;
  }
  const hz = CPU_HZ / (16 * (period + 1));
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

const secondsOf = (frames) =>
  Number(((frames * TEMPO_SCALE) / FRAMES_PER_SECOND).toFixed(4));

// square-2 / triangle stream -> notes; stops at the $00 terminator.
function decodeMelodicChannel(readers, startAddr, lengthOffset) {
  const { readByte, readPeriod, lengthFrames } = readers;
  const notes = [];
  let frames = 8;
  let addr = startAddr;
  for (let guard = 0; guard < 512; guard += 1) {
    const byte = readByte(addr);
    addr += 1;
    if (byte === 0) {
      break;
    }
    if ((byte & 0x80) !== 0) {
      frames = lengthFrames(lengthOffset, byte & 0x07);
      continue;
    }
    const midi =
      byte === REST_NOTE_BYTE
        ? null
        : periodToMidi(readPeriod(FREQ_TABLE_BASE + byte));
    notes.push({ midi, seconds: secondsOf(frames) });
  }
  return notes;
}

// square-1 stream -> notes for at least targetFrames (it loops under the melody).
function decodeSquare1Channel(readers, startAddr, lengthOffset, targetFrames) {
  const { readByte, readPeriod, lengthFrames } = readers;
  const notes = [];
  let accumulated = 0;
  let addr = startAddr;
  for (let guard = 0; guard < 512 && accumulated < targetFrames; guard += 1) {
    const byte = readByte(addr);
    addr += 1;
    if (byte === 0) {
      continue; // control byte
    }
    const index = ((byte & 1) << 2) | ((byte >> 7) << 1) | ((byte >> 6) & 1);
    const frames = lengthFrames(lengthOffset, index);
    const noteOffset = byte & 0x3e;
    const midi =
      noteOffset === 0
        ? null
        : periodToMidi(readPeriod(FREQ_TABLE_BASE + noteOffset));
    notes.push({ midi, seconds: secondsOf(frames) });
    accumulated += frames;
  }
  return notes;
}

const totalFrames = (notes) =>
  Math.round(
    (notes.reduce((sum, note) => sum + note.seconds, 0) * FRAMES_PER_SECOND) /
      TEMPO_SCALE,
  );

// Decode every theme to { theme: [{ melody, bass, harmony }] } (one entry per part).
export function decodeSmbMusic(romBytes) {
  const prg = loadPrg(romBytes);
  const readers = makeReaders(prg);
  const decoded = {};
  for (const [name, parts] of Object.entries(THEMES)) {
    decoded[name] = [];
    for (const signature of parts) {
      const dataAddr = findStream(prg, signature);
      if (dataAddr < 0) {
        continue;
      }
      const header = findHeader(readers, dataAddr);
      const lengthOffset = header?.lengthOffset ?? 0x18;
      const melody = decodeMelodicChannel(readers, dataAddr, lengthOffset);
      const frames = totalFrames(melody);
      // triOffset 0 means the triangle shares the melody data (underground).
      const bass =
        header && header.triOffset !== 0
          ? decodeMelodicChannel(
              readers,
              dataAddr + header.triOffset,
              lengthOffset,
            )
          : melody;
      const harmony =
        header && header.sq1Offset !== 0
          ? decodeSquare1Channel(
              readers,
              dataAddr + header.sq1Offset,
              lengthOffset,
              frames,
            )
          : [];
      decoded[name].push({ melody, bass, harmony });
    }
  }
  return decoded;
}

async function main() {
  let romBytes;
  try {
    romBytes = new Uint8Array(await readFile(romPath));
  } catch {
    console.error(
      `No ROM at ${romPath} — supply it locally to decode the music. Nothing was written.`,
    );
    process.exitCode = 1;
    return;
  }

  const decoded = decodeSmbMusic(romBytes);
  for (const [name, parts] of Object.entries(decoded)) {
    const melodyCount = parts.reduce(
      (sum, part) => sum + part.melody.length,
      0,
    );
    const preview = (parts[0]?.melody ?? [])
      .slice(0, 12)
      .map((note) => (note.midi === null ? "rest" : String(note.midi)))
      .join(" ");
    console.log(
      `  ${name}: ${parts.length} parts, ${melodyCount} melody notes — ${preview}…`,
    );
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(decoded, null, 2)}\n`, "utf8");
  console.log(`Wrote numeric note data to ${outPath} (git-ignored).`);
}

// Run as a CLI (but not when imported by a test).
if (process.argv[1] && process.argv[1].endsWith("decode-smb-music.mjs")) {
  await main();
}

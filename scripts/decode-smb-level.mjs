#!/usr/bin/env node
// Decoder for the original Super Mario Bros. area/level data, straight from the
// ROM's own object and enemy streams (Decision 0020). This reproduces the
// canonical layout of every area the game ships — no community reconstruction.
//
// The format facts encoded here (pointer tables, object/enemy bit layouts, the
// object/enemy type tables, terrain-pattern bits, warp-zone number rows, and
// entrance-position semantics) are documented in docs/smb-level-format.md and
// come from publicly available disassembly/RE work. This script reads only the
// numeric layout streams; it never emits ROM bytes, graphics, or audio.

import { readFile } from "node:fs/promises";
import { extractPrgData, cpuAddressToPrgOffset } from "./smb-rom-format.mjs";

// ---- Pointer tables (CPU addresses; read live from the PRG) ----------------
const worldAddrOffsetsAddr = 0x9cb4; // 8 bytes: per-world start into area list
const areaAddrOffsetsAddr = 0x9cbc; // flat AreaPointer list, grouped by world
const enemyAddrHOffsetsAddr = 0x9ce0; // 4 bytes: per-area-type base (enemy)
const enemyDataAddrLowAddr = 0x9ce4;
const enemyDataAddrHighAddr = 0x9d06;
const areaDataHOffsetsAddr = 0x9d28; // 4 bytes: per-area-type base (level)
const areaDataAddrLowAddr = 0x9d2c;
const areaDataAddrHighAddr = 0x9d4e;

const areaTypeNames = ["water", "ground", "underground", "castle"];

const gridHeight = 15; // 2 HUD rows + 13-row playfield (rows 2..14); object R -> grid R+2
const rowOffset = 2; // status-bar offset (object y-pixel = row*16 + 32)
const floorRow = 13; // ground SURFACE row; row 14 is the sub-surface ground row

const emptySymbol = "-";

function u8(prg, addr) {
  return prg[cpuAddressToPrgOffset(addr)];
}

// Resolve an area straight from its AreaPointer byte (type bits 6-5, index bits
// 4-0). Used both for the world/level tables and for warp-pipe connection
// destinations, which reference an area the same way.
export function resolveAreaByPointer(prg, areaPointer) {
  const areaType = (areaPointer >> 5) & 0x3;
  const index5 = areaPointer & 0x1f;

  const eIdx = u8(prg, enemyAddrHOffsetsAddr + areaType) + index5;
  const enemyAddr =
    (u8(prg, enemyDataAddrHighAddr + eIdx) << 8) |
    u8(prg, enemyDataAddrLowAddr + eIdx);

  const lIdx = u8(prg, areaDataHOffsetsAddr + areaType) + index5;
  const levelAddr =
    (u8(prg, areaDataAddrHighAddr + lIdx) << 8) |
    u8(prg, areaDataAddrLowAddr + lIdx);

  return {
    areaPointer,
    areaType,
    areaTypeName: areaTypeNames[areaType],
    index5,
    levelAddr,
    enemyAddr,
  };
}

export function resolveArea(prg, world, level) {
  const worldStart = u8(prg, worldAddrOffsetsAddr + world);
  const areaPointer = u8(prg, areaAddrOffsetsAddr + worldStart + level);
  return resolveAreaByPointer(prg, areaPointer);
}

export function levelCountForWorld(prg, world) {
  const start = u8(prg, worldAddrOffsetsAddr + world);
  const next =
    world < 7 ? u8(prg, worldAddrOffsetsAddr + world + 1) : start + 4;
  return next - start;
}

// ---- Area header ------------------------------------------------------------
// Header byte 0: bits 7-6 timer setting, bits 5-3 player entrance control,
// bits 2-0 foreground scenery (>= 4: background colour control instead).
// Header byte 1: bits 7-6 area style (3 = cloud override, style 0),
// bits 5-4 background scenery, bits 3-0 terrain (floor/ceiling) pattern.
export function parseAreaHeader(byte0, byte1) {
  const styleBits = (byte1 >> 6) & 0x3;
  return {
    byte0,
    byte1,
    timerSetting: (byte0 >> 6) & 0x3,
    entranceCtrl: (byte0 >> 3) & 0x7,
    foregroundScenery: byte0 & 0x7,
    terrainControl: byte1 & 0xf,
    backgroundScenery: (byte1 >> 4) & 0x3,
    areaStyle: styleBits === 3 ? 0 : styleBits, // 0 trees, 1 mushrooms, 2 cannons
    cloudOverride: styleBits === 3,
  };
}

// TerrainRenderBits: 16 patterns x 2 bytes. Byte 0 bit N = playfield row N
// (rows 0-7) solid; byte 1 bits 0-4 = playfield rows 8-12 solid. The standard
// ground is pattern 1 ("no ceiling, floor 2" = rows 11-12).
const terrainRenderBits = [
  [0b00000000, 0b00000000], // no ceiling or floor
  [0b00000000, 0b00011000], // no ceiling, floor 2
  [0b00000001, 0b00011000], // ceiling 1, floor 2
  [0b00000111, 0b00011000], // ceiling 3, floor 2
  [0b00001111, 0b00011000], // ceiling 4, floor 2
  [0b11111111, 0b00011000], // ceiling 8, floor 2
  [0b00000001, 0b00011111], // ceiling 1, floor 5
  [0b00000111, 0b00011111], // ceiling 3, floor 5
  [0b00001111, 0b00011111], // ceiling 4, floor 5
  [0b10000001, 0b00011111], // ceiling 1, floor 6
  [0b00000001, 0b00000000], // ceiling 1, no floor
  [0b10001111, 0b00011111], // ceiling 4, floor 6
  [0b11110001, 0b00011111], // ceiling 1, floor 9
  [0b11111001, 0b00011000], // ceiling 1, middle 5, floor 2
  [0b11110001, 0b00011000], // ceiling 1, middle 4, floor 2
  [0b11111111, 0b00011111], // completely solid top to bottom
];

// Solid playfield rows (0-12) for a terrain pattern. With the cloud override
// (coin heavens) only byte 0 applies in full; of byte 1 only bit 3 (row 11)
// survives — the single cloud floor row.
function terrainSolidRows(terrainControl, cloudOverride) {
  const [b0, rawB1] = terrainRenderBits[terrainControl & 0xf];
  const b1 = cloudOverride ? rawB1 & 0b00001000 : rawB1;
  const rows = [];
  for (let r = 0; r < 8; r += 1) if (b0 & (1 << r)) rows.push(r);
  for (let r = 0; r < 5; r += 1) if (b1 & (1 << r)) rows.push(8 + r);
  return rows;
}

// ---- Object stream ---------------------------------------------------------
// Each object is 2 bytes; the stream ends at $FD. See docs for the bit layout.
function decodeObjects(prg, levelAddr) {
  let off = cpuAddressToPrgOffset(levelAddr);
  const header = parseAreaHeader(prg[off], prg[off + 1]);
  off += 2;

  const objects = [];
  let page = 0;
  let guard = 0;
  while (guard++ < 4096) {
    const b0 = prg[off];
    if (b0 === 0xfd) break;
    const b1 = prg[off + 1];
    off += 2;

    const x = (b0 >> 4) & 0xf;
    const y = b0 & 0xf;
    if (b1 & 0x80) page += 1; // new-page flag
    const col = page * 16 + x;
    const c = (b1 >> 4) & 0x7;
    const low = b1 & 0xf;

    if (y === 0xd && (b1 & 0x40) === 0) {
      // page-skip command: set absolute page (no object)
      page = b1 & 0x1f;
      continue;
    }
    objects.push({
      col,
      row: y,
      c,
      low,
      b1,
      kind: classifyObject(y, c, low, b1),
    });
  }
  return { header, objects };
}

function classifyObject(y, c, low, b1) {
  if (y <= 0xb) {
    if (c === 0) return `small:${low}`;
    if (c === 7) return b1 & 0x08 ? "pipe-warp" : "pipe";
    return (
      [
        "",
        "areastyle", // tree/mushroom ledge or bullet-bill cannon, by area style
        "row-bricks",
        "row-solid",
        "row-coins",
        "col-bricks",
        "col-solid",
      ][c] ?? "unknown"
    );
  }
  if (y === 0xc) {
    return (
      [
        "hole",
        "pulley-rope",
        "bridge-hi",
        "bridge-mid",
        "bridge-lo",
        "hole-water",
        "qblock-row-hi",
        "qblock-row-lo",
      ][c] ?? "unknown"
    );
  }
  if (y === 0xd) return `special13:${b1 & 0x3f}`;
  if (y === 0xe) return "alter-attributes";
  if (y === 0xf) {
    return (
      [
        "endless-rope",
        "balance-rope",
        "castle",
        "staircase",
        "exit-pipe",
        "flagballs",
      ][c] ?? "unknown"
    );
  }
  return "unknown";
}

// Special row-13 object ids (b1 & 0x3f): the jump table order from the
// disassembly. 9 is the Bullet-Bill-or-swimming-Cheep frenzy (by area type).
const special13Names = {
  0: "intro-pipe",
  1: "flagpole",
  2: "axe",
  3: "chain",
  4: "castle-bridge",
  5: "scroll-lock-warp",
  6: "scroll-lock",
  7: "scroll-lock",
  8: "frenzy-flying-cheep",
  9: "frenzy-bbill-or-cheep",
  10: "frenzy-stop",
  11: "loop-command",
};

function special13Name(kind) {
  if (!kind.startsWith("special13:")) return undefined;
  return special13Names[Number(kind.slice(10))];
}

// ---- Enemy stream ----------------------------------------------------------
// Each enemy is 2 bytes (one 3-byte area-connection); stream ends at $FF.
function decodeEnemies(prg, enemyAddr) {
  let off = cpuAddressToPrgOffset(enemyAddr);
  const enemies = [];
  let page = 0;
  let guard = 0;
  while (guard++ < 2048) {
    const b0 = prg[off];
    if (b0 === 0xff) break;
    const y = b0 & 0xf;
    const x = (b0 >> 4) & 0xf;

    if (y === 0xe) {
      // area-connection command (3 bytes) — destination area/world/page. The
      // command activates when the level scroll reaches its column, so a
      // stream can point different pipes/vines at different destinations and
      // a shared bonus area can hold one return connection per world.
      const b1 = prg[off + 1];
      const b2 = prg[off + 2];
      off += 3;
      enemies.push({
        kind: "connection",
        col: page * 16 + x,
        areaPointer: b1,
        world: (b2 >> 5) & 0x7,
        entrancePage: b2 & 0x1f,
      });
      continue;
    }
    const b1 = prg[off + 1];
    off += 2;
    if (b1 & 0x80) page += 1;
    const col = page * 16 + x;
    if (y === 0xf) {
      page = b1 & 0x3f; // enemy page-set
      continue;
    }
    const hardOnly = (b1 & 0x40) !== 0;
    const id = b1 & 0x3f;
    if (id >= 0x37 && id <= 0x3e) {
      // group enemies: n = id - 0x37
      const n = id - 0x37;
      const koopa = n >= 4;
      const count = n & 1 ? 3 : 2;
      const raised = (n & 2) !== 0;
      for (let i = 0; i < count; i += 1) {
        enemies.push({
          kind: koopa ? "koopa" : "goomba",
          col: col + i,
          row: raised ? 7 : 11,
          hardOnly,
          group: true,
        });
      }
      continue;
    }
    enemies.push({ kind: enemyIdName(id), id, col, row: y, hardOnly });
  }
  return enemies;
}

// SMB enemy-object ids (from the disassembly's enemy constants, validated
// against the ROM's own enemy streams). Only ids we model are named; anything
// else stays `enemy-<hex>` and is skipped.
function enemyIdName(id) {
  if (id === 0x00) return "koopa"; // green koopa troopa
  if (id === 0x03) return "koopa-red"; // red koopa (ledge-staying)
  if (id === 0x02) return "buzzy"; // buzzy beetle (fireproof armored)
  if (id === 0x05) return "hammer-bro";
  if (id === 0x06) return "goomba";
  if (id === 0x07) return "blooper"; // squid — pulses toward the swimmer
  if (id === 0x0a || id === 0x0b) return "cheep"; // cheep-cheep (swimming fish)
  if (id === 0x0c) return "podoboo"; // lava fireball (metadata, not a glyph)
  if (id === 0x0e) return "paratroopa-hop"; // green paratroopa (hops forward)
  if (id === 0x0f) return "paratroopa-red"; // red paratroopa (vertical flyer)
  if (id === 0x10) return "paratroopa-fly"; // green paratroopa (glides)
  if (id === 0x11) return "lakitu";
  if (id === 0x12) return "spiny";
  if (id === 0x14) return "frenzy-flying-cheep-cmd"; // enemy-stream frenzy
  if (id === 0x17) return "frenzy-bbill-cmd";
  if (id === 0x18) return "frenzy-stop-cmd";
  if (id >= 0x1b && id <= 0x1f) return "firebar"; // metadata, not a glyph
  if (id >= 0x24 && id <= 0x2c) return "platform"; // lifts (metadata)
  return `enemy-${id.toString(16)}`;
}

// Lift enemy ids -> platform kinds/widths. $24 balance platforms pair up in
// stream order; $26/$27 and $2B/$2C are the wrapping elevator lifts (large 3
// tiles / small 2 tiles); $28/$2A oscillate horizontally; $29 falls when
// ridden; $25 oscillates vertically.
const platformVariants = {
  0x24: { kind: "balance", widthTiles: 2 },
  0x25: { kind: "vertical", widthTiles: 3 },
  0x26: { kind: "lift-up", widthTiles: 3 },
  0x27: { kind: "lift-down", widthTiles: 3 },
  0x28: { kind: "horizontal", widthTiles: 3 },
  0x29: { kind: "drop", widthTiles: 3 },
  0x2a: { kind: "horizontal", widthTiles: 3 },
  0x2b: { kind: "lift-up", widthTiles: 2 },
  0x2c: { kind: "lift-down", widthTiles: 2 },
};

// Firebar variants $1B-$1F: direction/speed from the init tables
// (FirebarSpinDirData/FirebarSpinSpdData), $1F is the long 12-orb bar.
const firebarVariants = {
  0x1b: { direction: "clockwise", speed: "slow", orbCount: 6 },
  0x1c: { direction: "clockwise", speed: "fast", orbCount: 6 },
  0x1d: { direction: "counter-clockwise", speed: "slow", orbCount: 6 },
  0x1e: { direction: "counter-clockwise", speed: "fast", orbCount: 6 },
  0x1f: { direction: "clockwise", speed: "slow", orbCount: 12 },
};

// Stagger podoboo leaps deterministically by column (the original uses its
// pseudo-random register; we keep replays exact instead).
const podobooCycleFrames = 384;

function podobooPhaseForColumn(col) {
  return (col * 89) % podobooCycleFrames;
}

// Grid symbol per modeled enemy kind (matches the runtime multi-layer legend).
const enemyKindSymbol = {
  goomba: "g",
  koopa: "k",
  "koopa-red": "r",
  buzzy: "t",
  "hammer-bro": "h",
  "paratroopa-hop": "J",
  "paratroopa-red": "R",
  "paratroopa-fly": "K",
  lakitu: "l",
  spiny: "s",
  blooper: "q", // squid (b/c are taken by cannon/coin tiles)
  cheep: "F", // fish
};

// ---- Render objects into a symbol grid ------------------------------------
function makeGrid(widthCols) {
  return Array.from({ length: gridHeight }, () =>
    new Array(widthCols).fill(emptySymbol),
  );
}

function set(grid, col, row, symbol) {
  if (row < 0 || row >= gridHeight || col < 0 || col >= grid[0].length) return;
  grid[row][col] = symbol;
}

// small-object (Y0-11, C=0) sub-types -> block symbol
const smallObjectSymbols = {
  0: "M", // ? power-up
  1: "?", // ? coin
  2: "i", // hidden coin block
  3: "I", // hidden 1-up block
  4: "m", // brick w/ power-up
  5: "H", // brick w/ vine (beanstalk block)
  6: "*", // brick w/ star
  7: "O", // brick w/ multi-coins
  8: "+", // brick w/ 1-up
  9: "water-pipe", // small sideways pipe end (2 rows, handled below)
  10: "#", // used/empty block (solid)
  11: "jumpspring", // springboard (2 rows, handled below)
};

// Fixed rows (playfield coordinates) from the disassembly's object handlers.
const qblockRowHigh = 3; // QuestionBlockRow_High
const qblockRowLow = 7; // QuestionBlockRow_Low
const bridgeFloorRows = { "bridge-hi": 7, "bridge-mid": 8, "bridge-lo": 10 };
const holeTopPlayfieldRow = 8; // holes clear playfield rows 8-12
const introPipeMouthRow = 9; // sideways intro pipe mouth rows 9-10

// Bullet-Bill cannon fire pattern for decoded levels: SMB fires roughly every
// few seconds while the cannon is near the screen; we stagger cannons by
// column so volleys do not synchronise. Bullet speed ~2 px/frame at 60 fps.
const cannonIntervalFrames = 288;
const cannonSpeedPixelsPerSecond = 120;
const cannonBulletWidthPixels = 16;
const cannonBulletHeightPixels = 14;
const cannonBulletLifetimeFrames = 900;

function renderArea(header, objects, enemies) {
  // width: from the furthest object/enemy column, rounded up to a page,
  // min 16 pages
  let maxCol = 16;
  for (const o of objects) maxCol = Math.max(maxCol, o.col + 8);
  for (const e of enemies) maxCol = Math.max(maxCol, (e.col ?? 0) + 4);
  const widthCols = Math.ceil((maxCol + 4) / 16) * 16;
  const grid = makeGrid(widthCols);
  const cannons = [];

  // Terrain (floor/ceiling pattern) per column: the header's pattern, updated
  // mid-level by alter-attributes objects (d6 clear variant).
  let terrainControl = header.terrainControl;
  const terrainByCol = new Array(widthCols);
  const alterObjects = objects
    .filter((o) => o.kind === "alter-attributes" && (o.b1 & 0x40) === 0)
    .sort((a, b) => a.col - b.col);
  let alterIndex = 0;
  for (let x = 0; x < widthCols; x += 1) {
    while (
      alterIndex < alterObjects.length &&
      alterObjects[alterIndex].col <= x
    ) {
      terrainControl = alterObjects[alterIndex].b1 & 0xf;
      alterIndex += 1;
    }
    terrainByCol[x] = terrainControl;
  }
  for (let x = 0; x < widthCols; x += 1) {
    for (const r of terrainSolidRows(terrainByCol[x], header.cloudOverride)) {
      set(grid, x, r + rowOffset, "#");
    }
  }

  // Objects overwrite terrain in stream order (matches the NES renderer).
  for (const o of objects) {
    const gr = o.row + rowOffset;
    const len = (o.low & 0xf) + 1;
    switch (o.kind) {
      case "hole":
      case "hole-water": {
        // Holes clear playfield rows 8-12 (grid 10-14) regardless of floor
        // thickness; water holes differ only in (unmodelled) visuals.
        for (let i = 0; i < len; i += 1) {
          for (
            let r = holeTopPlayfieldRow + rowOffset;
            r < gridHeight;
            r += 1
          ) {
            set(grid, o.col + i, r, emptySymbol);
          }
        }
        break;
      }
      case "row-bricks":
        for (let i = 0; i < len; i += 1) set(grid, o.col + i, gr, "B");
        break;
      case "row-solid":
        for (let i = 0; i < len; i += 1) set(grid, o.col + i, gr, "#");
        break;
      case "row-coins":
        for (let i = 0; i < len; i += 1) set(grid, o.col + i, gr, "o");
        break;
      case "col-bricks":
        for (let i = 0; i < len; i += 1) set(grid, o.col, gr + i, "B");
        break;
      case "col-solid":
        for (let i = 0; i < len; i += 1) set(grid, o.col, gr + i, "#");
        break;
      case "areastyle": {
        if (header.areaStyle === 2) {
          // Bullet-bill cannon column: top at the object row, shaft below.
          // The low nybble is the height count here, not a length.
          const height = o.low & 0xf;
          set(grid, o.col, gr, "C");
          for (let r = 1; r <= height; r += 1) set(grid, o.col, gr + r, "c");
          cannons.push({ col: o.col, row: gr });
        } else {
          // Tree/mushroom (and cloud) ledge: the top row is the platform; the
          // trunk/stem below is background-only scenery.
          for (let i = 0; i < len; i += 1) set(grid, o.col + i, gr, "#");
        }
        break;
      }
      case "bridge-hi":
      case "bridge-mid":
      case "bridge-lo": {
        const floor = bridgeFloorRows[o.kind] + rowOffset;
        for (let i = 0; i < len; i += 1) set(grid, o.col + i, floor, "#");
        break;
      }
      case "qblock-row-hi":
        for (let i = 0; i < len; i += 1) {
          set(grid, o.col + i, qblockRowHigh + rowOffset, "?");
        }
        break;
      case "qblock-row-lo":
        for (let i = 0; i < len; i += 1) {
          set(grid, o.col + i, qblockRowLow + rowOffset, "?");
        }
        break;
      case "pipe":
      case "pipe-warp": {
        const height = Math.max(o.low & 0x7, 1);
        set(grid, o.col, gr, "[");
        set(grid, o.col + 1, gr, "]");
        for (let r = gr + 1; r < gr + height; r += 1) {
          set(grid, o.col, r, "p");
          set(grid, o.col + 1, r, "P");
        }
        break;
      }
      case "staircase": {
        // right-rising staircase of solid blocks, `len` steps
        for (let s = 0; s < len; s += 1) {
          for (let h = 0; h <= Math.min(s, 7); h += 1) {
            set(grid, o.col + s, floorRow - 1 - h, "#");
          }
        }
        break;
      }
      case "castle":
        // The start/end castle is background scenery the player walks past —
        // nothing solid to emit.
        break;
      case "exit-pipe": {
        // Side pipe out of a bonus room: vertical shaft from the top of the
        // screen with a left-facing mouth. Mouth rows are (length-2, length-1)
        // in playfield coordinates.
        const mouthTop = Math.max((o.low & 0xf) - 2, 0) + rowOffset;
        set(grid, o.col, mouthTop, "{");
        set(grid, o.col, mouthTop + 1, "d");
        set(grid, o.col + 1, mouthTop, "}");
        set(grid, o.col + 1, mouthTop + 1, "D");
        for (let r = rowOffset; r < mouthTop; r += 1) {
          set(grid, o.col + 1, r, "p");
        }
        break;
      }
      case "pulley-rope":
      case "endless-rope":
      case "balance-rope":
      case "flagballs":
        // Rope/pulley furniture for the balance lifts and the castle flag
        // balls are visual-only; the lifts themselves are enemy objects.
        break;
      default: {
        if (o.kind.startsWith("small:")) {
          const sub = Number(o.kind.slice(6));
          const sym = smallObjectSymbols[sub];
          if (sym === "water-pipe") {
            set(grid, o.col, gr, "d");
            set(grid, o.col, gr + 1, "D");
          } else if (sym === "jumpspring") {
            set(grid, o.col, gr, "Y");
            set(grid, o.col, gr + 1, "y");
          } else if (sym !== undefined) {
            set(grid, o.col, gr, sym);
          }
          break;
        }
        const special = special13Name(o.kind);
        if (special === "flagpole") {
          for (let r = 2; r <= floorRow - 1; r += 1) set(grid, o.col, r, "|");
        } else if (special === "intro-pipe") {
          const mouthTop = introPipeMouthRow + rowOffset;
          set(grid, o.col, mouthTop, "{");
          set(grid, o.col, mouthTop + 1, "d");
          set(grid, o.col + 1, mouthTop, "}");
          set(grid, o.col + 1, mouthTop + 1, "D");
          for (let r = rowOffset; r < mouthTop; r += 1) {
            set(grid, o.col + 1, r, "p");
          }
        }
        // axe/chain/castle-bridge/scroll-locks/frenzies/loop commands carry
        // no terrain; they become mechanics metadata in later passes.
        break;
      }
    }
  }

  // Enemies onto the grid using each kind's legend symbol. Enemy Y-pixels omit
  // the 32px status-bar offset that objects carry, so a data-row-R enemy stands
  // one grid row above a data-row-R object — i.e. on top of it / on the floor.
  for (const e of enemies) {
    const symbol = enemyKindSymbol[e.kind];
    if (symbol !== undefined) {
      set(grid, e.col, e.row + rowOffset - 1, symbol);
    }
  }

  return { grid, widthCols, cannons };
}

// An underwater area runs a swimming Cheep-cheep frenzy where the level object
// stream issues the Bullet-Bill-or-Cheep frenzy command (special13:9 — cheeps
// in water areas); special13:10 stops it. Returns the tile-column span the
// frenzy is active over (water areas only; ground areas get Bullet Bills from
// the same command, modelled in a later pass).
function computeCheepFrenzy(objects, areaTypeName, widthCols) {
  if (areaTypeName !== "water") return undefined;
  const starts = objects
    .filter((o) => special13Name(o.kind) === "frenzy-bbill-or-cheep")
    .map((o) => o.col)
    .sort((a, b) => a - b);
  if (starts.length === 0) return undefined;
  const startTileX = starts[0];
  const endTileX = objects
    .filter(
      (o) => special13Name(o.kind) === "frenzy-stop" && o.col > startTileX,
    )
    .map((o) => o.col)
    .sort((a, b) => a - b)[0];
  return { startTileX, endTileX: endTileX ?? widthCols - 1 };
}

// Frenzy regions come from start commands in either stream: the object
// stream's special row-13 ids or the enemy-stream frenzy ids ($14/$17), each
// closed by the matching stop command (or the level end).
function frenzySpan(
  objects,
  enemies,
  objectStartName,
  enemyStartName,
  widthCols,
) {
  const starts = [
    ...objects
      .filter((o) => special13Name(o.kind) === objectStartName)
      .map((o) => o.col),
    ...enemies.filter((e) => e.kind === enemyStartName).map((e) => e.col),
  ].sort((a, b) => a - b);
  if (starts.length === 0) return undefined;
  const startTileX = starts[0];
  const endTileX = [
    ...objects
      .filter(
        (o) => special13Name(o.kind) === "frenzy-stop" && o.col > startTileX,
      )
      .map((o) => o.col),
    ...enemies
      .filter((e) => e.kind === "frenzy-stop-cmd" && e.col > startTileX)
      .map((e) => e.col),
  ].sort((a, b) => a - b)[0];
  return { startTileX, endTileX: endTileX ?? widthCols - 1 };
}

// The flying-Cheep frenzy (bridge levels) has its own start command.
function computeFlyingCheepFrenzy(objects, enemies, widthCols) {
  return frenzySpan(
    objects,
    enemies,
    "frenzy-flying-cheep",
    "frenzy-flying-cheep-cmd",
    widthCols,
  );
}

// The Bullet-Bill-or-Cheep command spawns Bullet Bills in ground areas — but
// only from world 5 on (InitBulletBill kills the spawn in earlier worlds,
// which is how 1-3 and 5-3 share an area yet only 5-3 gets bullets).
const firstBulletBillWorld = 4; // 0-based world index (world 5)

function computeBulletBillFrenzy(
  objects,
  enemies,
  areaTypeName,
  world,
  widthCols,
) {
  if (areaTypeName === "water" || world < firstBulletBillWorld) {
    return undefined;
  }
  return frenzySpan(
    objects,
    enemies,
    "frenzy-bbill-or-cheep",
    "frenzy-bbill-cmd",
    widthCols,
  );
}

export async function decodeLevel(romPath, world, level) {
  const prg = extractPrgData(await readFile(romPath));
  const area = resolveArea(prg, world, level);
  const { header, objects } = decodeObjects(prg, area.levelAddr);
  const enemies = decodeEnemies(prg, area.enemyAddr);
  const { grid, widthCols, cannons } = renderArea(header, objects, enemies);
  return { area, header, objects, enemies, grid, widthCols, cannons };
}

export function gridToText(grid) {
  return grid.map((row) => row.join("")).join("\n") + "\n";
}

// Header timer setting -> SMB time units; setting 0 means "keep the running
// timer" (used by bonus/sub areas), which we express by inheriting the
// entering level's units.
const timerUnitsBySetting = [undefined, 400, 300, 200];

// Player entrance control (header bits 5-3) -> starting playfield grid row.
// Entrance Y pixels from the disassembly: $00 fall-in from the top, $20 upper
// third, $b0 standing on the standard floor, $50 mid-height, 6/7 are the
// side-pipe intro walk (floor height).
const entranceGridRowByCtrl = [2, 4, 12, 7, 2, 2, 12, 12];

// The ROM's area type selects the world's colour theme; "ground" is overworld.
const themeByAreaTypeName = {
  water: "water",
  ground: "overworld",
  underground: "underground",
  castle: "castle",
};

export function buildMetadata(grid, header, options = {}) {
  const {
    transitions = [],
    cannons = [],
    piranhaPlants = [],
    firebars = [],
    podoboos = [],
    platforms = [],
    areaTypeName = "ground",
    inheritedTimerUnits = 400,
  } = options;
  const walkRow = floorRow - 1; // standing row on top of the floor
  let exitX = grid[0].length - 2;
  outer: for (let x = 0; x < grid[0].length; x += 1) {
    for (let y = 0; y < gridHeight; y += 1) {
      if (grid[y][x] === "|") {
        exitX = x;
        break outer;
      }
    }
  }
  const timeUnits =
    timerUnitsBySetting[header.timerSetting] ?? inheritedTimerUnits;
  const startY = entranceGridRowByCtrl[header.entranceCtrl] ?? walkRow;
  const metadata = {
    playerStart: { x: 2, y: startY },
    exits: [{ x: exitX, y: walkRow - 1 }],
    paths: [],
    // The runtime timer is keyed by this id (see level-timer-state.ts).
    timers: [
      { id: "level-timer.frames", value: timeUnits, unit: "smb-time-units" },
    ],
    transitions,
    multiLayer: { playerPathRows: [] },
    questionBlockContentsDefault: "power-up",
    theme: header.cloudOverride
      ? "overworld"
      : (themeByAreaTypeName[areaTypeName] ?? "overworld"),
  };
  if (piranhaPlants.length > 0) {
    metadata.piranhaPlants = piranhaPlants;
  }
  if (firebars.length > 0) {
    metadata.firebars = firebars;
  }
  if (podoboos.length > 0) {
    metadata.podoboos = podoboos;
  }
  if (platforms.length > 0) {
    metadata.platforms = platforms;
  }
  if (cannons.length > 0) {
    metadata.cannonProjectiles = cannons.map((cannon, index) => ({
      spawnerId: `cannon-${index}`,
      x: cannon.col,
      y: cannon.row,
      direction: "left",
      intervalFrames: cannonIntervalFrames,
      initialDelayFrames: (cannon.col * 53) % cannonIntervalFrames,
      speedPixelsPerSecond: cannonSpeedPixelsPerSecond,
      widthPixels: cannonBulletWidthPixels,
      heightPixels: cannonBulletHeightPixels,
      lifetimeFrames: cannonBulletLifetimeFrames,
    }));
  }
  return metadata;
}

// ---- Warp zones -------------------------------------------------------------
// A scroll-lock-warp object turns the pipes that follow it into the warp zone.
// The zone number is picked exactly like the game: world 1 -> zone {4,3,2};
// otherwise ground areas -> zone {8,7,6}, non-ground -> zone {-,5,-} (the
// blanks are not usable warps). Each zone row maps the left/middle/right pipe
// to a destination world whose FIRST area slot is entered at page 0.
const warpZoneRows = {
  4: [4, 3, 2],
  5: [undefined, 5, undefined],
  6: [8, 7, 6],
};

function warpZoneNumberFor(world, areaTypeName) {
  if (world === 0) return 4;
  return areaTypeName === "ground" ? 6 : 5;
}

// ---- Full-pack decoding -----------------------------------------------------
// Decode every area slot the game ships (world 1-8, each world's level slots),
// then resolve pipe/exit transitions through the stream-ordered, world-scoped
// area-connection commands — materialising pipe-reached sub-areas (bonus rooms,
// warp destinations) as their own named levels, one per (area, world).
export async function decodeAllLevels(romPath) {
  const prg = extractPrgData(await readFile(romPath));

  // Pass 1: resolve every main slot so connections can point back at them.
  const mains = [];
  const mainNameByWorldAndPointer = new Map();
  for (let world = 0; world < 8; world += 1) {
    const count = levelCountForWorld(prg, world);
    for (let slot = 0; slot < count; slot += 1) {
      const area = resolveArea(prg, world, slot);
      // Skip slots whose pointers do not resolve into the PRG window (only
      // happens for malformed/partial ROMs, e.g. test fixtures).
      if (area.levelAddr < 0x8000 || area.enemyAddr < 0x8000) continue;
      const name = `smb-${world + 1}-${slot + 1}`;
      mains.push({ world, slot, area, name });
      // Key by area type+index: connection commands may carry stray high bits
      // in their AreaPointer byte (e.g. $a5 and $25 both mean ground #5).
      mainNameByWorldAndPointer.set(
        `${world}:${area.areaType}:${area.index5}`,
        name,
      );
    }
  }

  const levels = [];
  const materialized = new Map(); // name -> level entry (mains + subs)
  const mainByName = new Map(mains.map((m) => [m.name, m]));

  const materialize = (area, world, name, inheritedTimerUnits) => {
    if (materialized.has(name)) return materialized.get(name);
    const { header, objects } = decodeObjects(prg, area.levelAddr);
    const enemies = decodeEnemies(prg, area.enemyAddr);
    const { grid, widthCols, cannons } = renderArea(header, objects, enemies);
    const mainInfo = mainByName.get(name);
    const entry = {
      world: mainInfo !== undefined ? mainInfo.world + 1 : world + 1,
      slot: mainInfo !== undefined ? mainInfo.slot + 1 : area.index5 + 1,
      name,
      area,
      grid,
      widthCols,
      metadata: undefined,
    };
    // Register before recursing so connection cycles (A->B->A) terminate.
    materialized.set(name, entry);

    const timeUnits =
      timerUnitsBySetting[header.timerSetting] ?? inheritedTimerUnits;

    // World-scoped, stream-ordered connections: a transfer initiated at column
    // X uses the latest connection at or before roughly one screen ahead.
    const connections = enemies
      .filter((e) => e.kind === "connection" && e.world === world)
      .sort((a, b) => a.col - b.col);
    const connectionForCol = (col) => {
      let active;
      for (const connection of connections) {
        if (connection.col <= col + 8) active = connection;
      }
      return active ?? connections[0];
    };

    // The destination's starting row comes straight from its header (its
    // metadata may not be built yet when areas reference each other in a
    // cycle, e.g. 1-1 <-> its bonus room <-> 1-2).
    const areaStartRow = (someArea) => {
      const destHeader = parseAreaHeader(
        prg[cpuAddressToPrgOffset(someArea.levelAddr)],
        prg[cpuAddressToPrgOffset(someArea.levelAddr) + 1],
      );
      return entranceGridRowByCtrl[destHeader.entranceCtrl] ?? floorRow - 1;
    };

    const resolveDestination = (connection) => {
      const destArea = resolveAreaByPointer(prg, connection.areaPointer);
      if (destArea.levelAddr < 0x8000 || destArea.enemyAddr < 0x8000) {
        return undefined;
      }
      const mainName = mainNameByWorldAndPointer.get(
        `${world}:${destArea.areaType}:${destArea.index5}`,
      );
      const destName =
        mainName ??
        `smb-warp-${destArea.areaType}-${destArea.index5}-w${world + 1}`;
      const destEntry = materialize(destArea, world, destName, timeUnits);
      if (destEntry === undefined) return undefined;
      return {
        targetLevelName: destName,
        targetTileX: connection.entrancePage * 16 + 2,
        targetTileY: areaStartRow(destArea),
      };
    };

    // Warp-zone handling: pipes past a scroll-lock-warp object use the zone
    // number rows, not the stream connections.
    const warpZoneObject = objects.find(
      (o) => special13Name(o.kind) === "scroll-lock-warp",
    );
    const zoneRow =
      warpZoneObject === undefined
        ? undefined
        : warpZoneRows[warpZoneNumberFor(world, area.areaTypeName)];

    const transitions = [];
    let transitionIndex = 0;
    const pushTransition = (x, y, target, entryDirection) => {
      if (target === undefined) return;
      transitions.push({
        id: `warp-${transitionIndex++}`,
        x,
        y,
        ...target,
        ...(entryDirection === undefined ? {} : { entryDirection }),
      });
    };

    const warpPipes = objects
      .filter((o) => o.kind === "pipe-warp")
      .sort((a, b) => a.col - b.col);
    // The scroll-lock-warp object can sit up to a couple of pages past the
    // pipes it converts (the runtime renders ahead of the player), so include
    // pipes shortly before it as well.
    const zonePipes =
      warpZoneObject === undefined
        ? []
        : warpPipes.filter((o) => o.col >= warpZoneObject.col - 32);
    for (const pipe of warpPipes) {
      const zoneIndex = zonePipes.indexOf(pipe);
      if (zoneIndex >= 0 && zoneRow !== undefined) {
        const destWorld = zoneRow[Math.min(zoneIndex, zoneRow.length - 1)];
        if (destWorld !== undefined) {
          pushTransition(pipe.col, pipe.row + rowOffset, {
            targetLevelName: `smb-${destWorld}-1`,
            targetTileX: 2,
            targetTileY: areaStartRow(resolveArea(prg, destWorld - 1, 0)),
          });
        }
        continue;
      }
      const connection = connectionForCol(pipe.col);
      if (connection === undefined) continue;
      pushTransition(
        pipe.col,
        pipe.row + rowOffset,
        resolveDestination(connection),
      );
    }

    // Side exit pipes (bonus-room returns) and intro pipes are walk-in
    // transitions: the player moves right into the left-facing mouth. An
    // intro pipe without a stream connection advances to the world's next
    // level slot instead (the game's pipe-intro cutscene does NextArea).
    for (const o of objects) {
      const special = special13Name(o.kind);
      const isExitPipe = o.kind === "exit-pipe";
      const isIntroPipe = special === "intro-pipe";
      if (!isExitPipe && !isIntroPipe) continue;
      const mouthTop = isIntroPipe
        ? introPipeMouthRow + rowOffset
        : Math.max((o.low & 0xf) - 2, 0) + rowOffset;
      const connection = connectionForCol(o.col);
      if (connection !== undefined) {
        pushTransition(
          o.col,
          mouthTop + 1,
          resolveDestination(connection),
          "right",
        );
        continue;
      }
      if (isIntroPipe && mainInfo !== undefined) {
        const nextSlot = mainByName.get(
          `smb-${mainInfo.world + 1}-${mainInfo.slot + 2}`,
        );
        if (nextSlot !== undefined) {
          pushTransition(
            o.col,
            mouthTop + 1,
            {
              targetLevelName: nextSlot.name,
              targetTileX: 2,
              targetTileY: areaStartRow(nextSlot.area),
            },
            "right",
          );
        }
      }
    }

    // The game auto-spawns a Piranha Plant in every vertical pipe outside
    // world 1-1 (the VerticalPipe handler); the plant shares the pipe-top
    // cell, so it travels as metadata rather than a grid symbol.
    const piranhaPlants =
      name === "smb-1-1"
        ? []
        : objects
            .filter((o) => o.kind === "pipe" || o.kind === "pipe-warp")
            .map((o) => ({ x: o.col, y: o.row + rowOffset }));

    // Flame hazards from the enemy stream: firebars anchor to the block at
    // their position; podoboos leap from the pit at their column.
    const firebars = enemies
      .filter((e) => e.kind === "firebar")
      .map((e) => ({
        x: e.col,
        y: e.row + rowOffset - 1,
        ...firebarVariants[e.id],
      }));
    const podoboos = enemies
      .filter((e) => e.kind === "podoboo")
      .map((e) => ({
        x: e.col,
        phaseOffsetFrames: podobooPhaseForColumn(e.col),
      }));

    // Lift platforms from the enemy stream. Balance ($24) platforms pair up
    // in stream order — each consecutive couple shares one rope.
    const platforms = [];
    let pendingBalanceId;
    for (const e of enemies) {
      if (e.kind !== "platform") continue;
      const variant = platformVariants[e.id];
      const id = `lift-${platforms.length}`;
      const platform = {
        id,
        kind: variant.kind,
        x: e.col,
        y: e.row + rowOffset - 1,
        widthTiles: variant.widthTiles,
      };
      if (variant.kind === "balance") {
        if (pendingBalanceId === undefined) {
          pendingBalanceId = id;
        } else {
          platform.balancePartnerId = pendingBalanceId;
          const pending = platforms.find((q) => q.id === pendingBalanceId);
          pending.balancePartnerId = id;
          pendingBalanceId = undefined;
        }
      }
      platforms.push(platform);
    }
    // An unpaired balance platform (data quirk) falls back to a drop lift so
    // validation cannot fail on a dangling rope.
    if (pendingBalanceId !== undefined) {
      const pending = platforms.find((q) => q.id === pendingBalanceId);
      pending.kind = "drop";
    }

    entry.metadata = buildMetadata(grid, header, {
      transitions,
      cannons,
      piranhaPlants,
      firebars,
      podoboos,
      platforms,
      areaTypeName: area.areaTypeName,
      inheritedTimerUnits,
    });
    const cheepFrenzy = computeCheepFrenzy(
      objects,
      area.areaTypeName,
      widthCols,
    );
    if (cheepFrenzy !== undefined) {
      entry.metadata.cheepFrenzy = cheepFrenzy;
    }
    const flyingCheepFrenzy = computeFlyingCheepFrenzy(
      objects,
      enemies,
      widthCols,
    );
    if (flyingCheepFrenzy !== undefined) {
      entry.metadata.flyingCheepFrenzy = flyingCheepFrenzy;
    }
    const bulletBillFrenzy = computeBulletBillFrenzy(
      objects,
      enemies,
      area.areaTypeName,
      world,
      widthCols,
    );
    if (bulletBillFrenzy !== undefined) {
      entry.metadata.bulletBillFrenzy = bulletBillFrenzy;
    }
    return entry;
  };

  for (const main of mains) {
    materialize(main.area, main.world, main.name, 400);
  }

  // Mains first (world order), then sub-areas, matching materialization order.
  const mainNames = new Set(mains.map((m) => m.name));
  for (const main of mains) {
    levels.push(materialized.get(main.name));
  }
  for (const [name, entry] of materialized) {
    if (!mainNames.has(name)) levels.push(entry);
  }
  return levels;
}

// CLI: node decode-smb-level.mjs <rom> <world> <level>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [romPath, worldArg, levelArg] = process.argv.slice(2);
  const world = Number(worldArg ?? "1") - 1;
  const level = Number(levelArg ?? "1") - 1;
  const result = await decodeLevel(romPath, world, level);
  console.error(
    `Area ${result.area.areaTypeName}#${result.area.index5} ptr=$${result.area.areaPointer.toString(16)} width=${result.widthCols} objects=${result.objects.length} enemies=${result.enemies.length}`,
  );
  process.stdout.write(gridToText(result.grid));
}

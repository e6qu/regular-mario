#!/usr/bin/env node
// Decoder for the original Super Mario Bros. area/level data, straight from the
// ROM's own object and enemy streams (Decision 0020). This reproduces the
// canonical layout of every area the game ships — no community reconstruction.
//
// The format facts encoded here (pointer tables, object/enemy bit layouts, and
// the object/enemy type tables) are documented in docs/smb-level-format.md and
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

const gridHeight = 14; // rows 0..13; play rows 2..13 (object row R -> grid R+2)
const rowOffset = 2; // status-bar offset (object y-pixel = row*16 + 32)
const floorRow = 13; // ground surface row in the grid

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

// ---- Object stream ---------------------------------------------------------
// Each object is 2 bytes; the stream ends at $FD. See docs for the bit layout.
function decodeObjects(prg, levelAddr) {
  let off = cpuAddressToPrgOffset(levelAddr);
  const header = { byte0: prg[off], byte1: prg[off + 1] };
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
    if (c === 0) return `small:${low}`; // 22 + low
    if (c === 7) return b1 & 0x08 ? "pipe-warp" : "pipe";
    return (
      [
        "",
        "areastyle",
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
        "pulley",
        "bridge-hi",
        "bridge-mid",
        "bridge-lo",
        "hole-water",
        "qblock-row-hi",
        "qblock-row-lo",
      ][c] ?? "unknown"
    );
  }
  if (y === 0xd) return `special13:${b1 & 0x3f}`; // 34 + low6
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
      // area-connection command (3 bytes) — destination area/world/page
      const b1 = prg[off + 1];
      const b2 = prg[off + 2];
      off += 3;
      enemies.push({
        kind: "connection",
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
      // group (frenzy) enemies: n = id - 0x37
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

function enemyIdName(id) {
  if (id === 0x00) return "koopa"; // green koopa troopa
  if (id === 0x03) return "koopa-red";
  if (id === 0x06) return "goomba";
  return `enemy-${id.toString(16)}`;
}

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
  2: "?", // hidden coin block (render as coin block)
  3: "+", // hidden 1-up
  4: "p-brick", // brick w/ power-up (handled specially below)
  5: "B", // brick w/ vine
  6: "*", // brick w/ star
  7: "O", // brick w/ multi-coins
  8: "+", // brick w/ 1-up
  9: "P", // sideways pipe (approx solid)
  10: "#", // used/empty block (approx solid)
  11: "B", // jumpspring (approx)
};

function renderArea(objects, enemies) {
  // width: from the furthest object column, rounded up to a page, min 16 pages
  let maxCol = 16;
  for (const o of objects) maxCol = Math.max(maxCol, o.col + 8);
  const widthCols = Math.ceil((maxCol + 4) / 16) * 16;
  const grid = makeGrid(widthCols);

  // Floor: fill the ground row across the whole width; holes clear it.
  const holes = new Set();
  for (const o of objects) {
    if (o.kind === "hole" || o.kind === "hole-water") {
      const len = (o.low & 0xf) + 1;
      for (let i = 0; i < len; i += 1) holes.add(o.col + i);
    }
  }
  for (let x = 0; x < widthCols; x += 1) {
    if (!holes.has(x)) set(grid, x, floorRow, "#");
  }

  for (const o of objects) {
    const gr = o.row + rowOffset;
    const len = (o.low & 0xf) + 1;
    switch (o.kind) {
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
      case "qblock-row-hi":
      case "qblock-row-lo":
        for (let i = 0; i < len; i += 1) set(grid, o.col + i, gr, "?");
        break;
      case "pipe":
      case "pipe-warp": {
        const height = o.low & 0x7;
        const topRow = gr;
        set(grid, o.col, topRow, "[");
        set(grid, o.col + 1, topRow, "]");
        for (let r = topRow + 1; r <= floorRow - 1; r += 1) {
          set(grid, o.col, r, "p");
          set(grid, o.col + 1, r, "P");
        }
        void height;
        break;
      }
      case "staircase": {
        // right-rising staircase of solid blocks, `len` steps
        for (let s = 0; s < len; s += 1) {
          for (let h = 0; h <= s; h += 1) {
            set(grid, o.col + s, floorRow - 1 - h, "#");
          }
        }
        break;
      }
      case "flagballs":
        break;
      case "castle":
        for (let i = 0; i < 5; i += 1) set(grid, o.col + i, floorRow - 1, "#");
        break;
      default: {
        if (o.kind.startsWith("small:")) {
          const sub = Number(o.kind.slice(6));
          const sym = smallObjectSymbols[sub];
          if (sym === "p-brick") {
            set(grid, o.col, gr, "B");
          } else if (sym !== undefined) {
            set(grid, o.col, gr, sym);
          }
        }
        // areastyle, special13 (flagpole), bridges, ropes: handled minimally
        if (o.kind.startsWith("special13:")) {
          const t = Number(o.kind.slice(10));
          if (t === 1) {
            // flagpole: vertical run near the end
            for (let r = 2; r <= floorRow - 1; r += 1) set(grid, o.col, r, "|");
          }
        }
        break;
      }
    }
  }

  // Enemies onto the grid (goomba `g`, koopa `k`). Enemy Y-pixels omit the
  // 32px status-bar offset that objects carry, so a data-row-R enemy stands one
  // grid row above a data-row-R object — i.e. on top of it / on the floor.
  for (const e of enemies) {
    if (e.kind === "goomba") set(grid, e.col, e.row + rowOffset - 1, "g");
    else if (e.kind === "koopa") set(grid, e.col, e.row + rowOffset - 1, "k");
  }

  return { grid, widthCols };
}

export async function decodeLevel(romPath, world, level) {
  const prg = extractPrgData(await readFile(romPath));
  const area = resolveArea(prg, world, level);
  const { header, objects } = decodeObjects(prg, area.levelAddr);
  const enemies = decodeEnemies(prg, area.enemyAddr);
  const { grid, widthCols } = renderArea(objects, enemies);
  return { area, header, objects, enemies, grid, widthCols };
}

export function gridToText(grid) {
  return grid.map((row) => row.join("")).join("\n") + "\n";
}

// Minimal import metadata for a decoded area: where the player spawns, where
// the level ends, and the default ? block contents. The player-path layer is
// left empty (the engine does not require it for these levels).
// Header byte 0 bits 7-6 select the level time limit (in SMB time units).
function timerDisplayUnitsFromHeader(header) {
  return [400, 400, 300, 200][(header.byte0 >> 6) & 0x3];
}

// The ROM's area type selects the world's colour theme; "ground" is overworld.
const themeByAreaTypeName = {
  water: "water",
  ground: "overworld",
  underground: "underground",
  castle: "castle",
};

export function buildMetadata(grid, header, transitions = [], areaTypeName) {
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
  const timeUnits = timerDisplayUnitsFromHeader(header);
  return {
    playerStart: { x: 2, y: walkRow },
    exits: [{ x: exitX, y: walkRow - 1 }],
    paths: [],
    // The runtime timer is keyed by this id (see level-timer-state.ts).
    timers: [
      { id: "level-timer.frames", value: timeUnits, unit: "smb-time-units" },
    ],
    transitions,
    multiLayer: { playerPathRows: [] },
    questionBlockContentsDefault: "power-up",
    theme: themeByAreaTypeName[areaTypeName] ?? "overworld",
  };
}

// Link a level's enterable warp pipe(s) to the area-connection destination:
// decode that destination area as its own named sub-level (deduped across the
// pack) and emit a transition per warp pipe so the runtime loads it on entry.
// Mario drops in near the top-left of the sub-area (targetTile 2,2) as a falling
// body, which the landing collision settles.
function resolveWarpTransitions(prg, objects, enemies, subLevelsByPointer) {
  const pipeWarps = objects.filter((o) => o.kind === "pipe-warp");
  const connection = enemies.find((e) => e.kind === "connection");

  if (pipeWarps.length === 0 || connection === undefined) {
    return { transitions: [], subLevels: [] };
  }

  const destArea = resolveAreaByPointer(prg, connection.areaPointer);

  if (destArea.levelAddr < 0x8000 || destArea.enemyAddr < 0x8000) {
    return { transitions: [], subLevels: [] };
  }

  const destName = `smb-warp-${destArea.areaType}-${destArea.index5}`;
  const subLevels = [];

  if (!subLevelsByPointer.has(destName)) {
    const { header: destHeader, objects: destObjects } = decodeObjects(
      prg,
      destArea.levelAddr,
    );
    const destEnemies = decodeEnemies(prg, destArea.enemyAddr);
    const { grid, widthCols } = renderArea(destObjects, destEnemies);
    const subLevel = {
      world: destArea.areaType + 1,
      slot: destArea.index5 + 1,
      name: destName,
      area: destArea,
      grid,
      widthCols,
      metadata: buildMetadata(grid, destHeader, [], destArea.areaTypeName),
    };
    subLevelsByPointer.set(destName, subLevel);
    subLevels.push(subLevel);
  }

  const transitions = pipeWarps.map((pipe, index) => ({
    id: `warp-${index}`,
    x: pipe.col,
    y: pipe.row + rowOffset,
    targetLevelName: destName,
    targetTileX: 2,
    targetTileY: 2,
  }));

  return { transitions, subLevels };
}

// Decode every area slot the game ships (world 1-8, each world's level slots),
// returning one entry per slot with a stable "world-slot" name.
export async function decodeAllLevels(romPath) {
  const prg = extractPrgData(await readFile(romPath));
  const levels = [];
  const subLevelsByPointer = new Map();
  for (let world = 0; world < 8; world += 1) {
    const count = levelCountForWorld(prg, world);
    for (let slot = 0; slot < count; slot += 1) {
      const area = resolveArea(prg, world, slot);
      // Skip slots whose pointers do not resolve into the PRG window (only
      // happens for malformed/partial ROMs, e.g. test fixtures).
      if (area.levelAddr < 0x8000 || area.enemyAddr < 0x8000) continue;
      const { header, objects } = decodeObjects(prg, area.levelAddr);
      const enemies = decodeEnemies(prg, area.enemyAddr);
      const { grid, widthCols } = renderArea(objects, enemies);
      const { transitions, subLevels } = resolveWarpTransitions(
        prg,
        objects,
        enemies,
        subLevelsByPointer,
      );
      for (const subLevel of subLevels) {
        levels.push(subLevel);
      }
      levels.push({
        world: world + 1,
        slot: slot + 1,
        name: `smb-${world + 1}-${slot + 1}`,
        area,
        grid,
        widthCols,
        metadata: buildMetadata(grid, header, transitions, area.areaTypeName),
      });
    }
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
    `Area ${result.area.areaTypeName}#${result.area.index5} ptr=$${result.area.areaPointer.toString(16)} width=${result.widthCols} objects=${result.objects.length} enemies=${result.enemies.filter((e) => e.kind === "goomba" || e.kind === "koopa").length}`,
  );
  process.stdout.write(gridToText(result.grid));
}

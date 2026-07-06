# Super Mario Bros. level-data format (decoder reference)

This documents the on-ROM level format that `scripts/decode-smb-level.mjs`
decodes, so every area the game ships can be reproduced from the ROM's own data
rather than a community reconstruction.

**Content policy.** This file records only _format/structure facts and numeric
type tables_ derived from publicly available reverse-engineering work (see
[Sources](#sources)) plus our own validation against a user-supplied ROM. It
contains no ROM bytes, graphics, audio, or other copyrighted game content. The
decoder likewise emits only derived numeric layout data into the ignored
`.cache/user-levels/` tree; nothing game-derived is committed.

## ROM model

SMB is **mapper 0 (NROM-256)**: two 16 KB PRG banks map contiguously to CPU
`$8000–$FFFF` (no bank switching). A CPU address converts to an index into the
PRG buffer returned by `extractPrgData` as:

```
prgOffset = cpuAddr - 0x8000            // file offset = prgOffset + 16 (iNES header)
```

## Area indirection

Level data is not indexed by world/level directly. A player-facing
`(WorldNumber, AreaNumber)` maps through pointer tables to an **AreaPointer**
byte, which selects an area type and an index within that type:

```
AreaPointer:  TTI IIIII
  bits 6–5 (TT) = area type: 0=water, 1=ground(overworld), 2=underground, 3=castle
  bits 4–0 (I)  = 5-bit index within that area type
```

### Pointer tables (CPU addresses; read live from the PRG)

| Table               | CPU addr | Purpose                                   |
| ------------------- | -------- | ----------------------------------------- |
| `WorldAddrOffsets`  | `$9CB4`  | 8 bytes: per-world start into area list   |
| `AreaAddrOffsets`   | `$9CBC`  | flat AreaPointer list, grouped by world   |
| `EnemyAddrHOffsets` | `$9CE0`  | 4 bytes: per-area-type base (enemy ptrs)  |
| `EnemyDataAddrLow`  | `$9CE4`  | low byte of each enemy-data block address |
| `EnemyDataAddrHigh` | `$9D06`  | high byte                                 |
| `AreaDataHOffsets`  | `$9D28`  | 4 bytes: per-area-type base (level ptrs)  |
| `AreaDataAddrLow`   | `$9D2C`  | low byte of each level-data block address |
| `AreaDataAddrHigh`  | `$9D4E`  | high byte                                 |

### Resolution

```
worldStart  = WorldAddrOffsets[world]
areaPointer = AreaAddrOffsets[worldStart + level]
areaType    = (areaPointer >> 5) & 3
index5      =  areaPointer & 0x1F
enemyAddr   = (EnemyDataAddrHigh[EnemyAddrHOffsets[areaType] + index5] << 8)
            |  EnemyDataAddrLow [EnemyAddrHOffsets[areaType] + index5]
levelAddr   = (AreaDataAddrHigh [AreaDataHOffsets [areaType] + index5] << 8)
            |  AreaDataAddrLow  [AreaDataHOffsets [areaType] + index5]
```

World 1-1 resolves to AreaPointer `$25` → ground, index 5 → level data at
`$A68E`, enemy data at `$9F01`.

## Object (terrain/block) stream

`levelAddr` points to a 2-byte header followed by 2-byte objects, terminated by
`$FD`.

**Header:** byte 0 = timer / entrance / foreground-scenery; byte 1 = area style /
background scenery / terrain (floor+ceiling) pattern.

**Each object (2 bytes):**

```
byte0:  XXXX YYYY   X = column-in-page (0–15), Y = row (0–11 normal; 12–15 special)
byte1:  P CCC LLLL  P = new-page flag; C = category/sub-selector; L = length/sub-type
```

Absolute column = `page*16 + X`, where `page` advances by one each time the
new-page flag is set. A `Y=13` object with bit 6 clear is a page-skip command
(`page = byte1 & 0x1F`).

### Object type table (by row band and category `C`)

| Row band | C     | Object                                                            |
| -------- | ----- | ----------------------------------------------------------------- |
| 0–11     | 0     | small object; sub-type = `L` (see below)                          |
| 0–11     | 1     | area-style object (ledges/trees/cloud, style-specific)            |
| 0–11     | 2/3   | row of bricks / row of solid blocks (length `L`)                  |
| 0–11     | 4     | row of coins                                                      |
| 0–11     | 5/6   | column of bricks / column of solid blocks (height `L`)            |
| 0–11     | 7     | vertical pipe; **byte1 bit 3 set ⇒ enterable/warp**; height=`L&7` |
| 12       | 0/5   | hole in floor / water hole (length `L`)                           |
| 12       | 2–4   | bridges (high/mid/low)                                            |
| 12       | 6/7   | ?-block row (high/low)                                            |
| 13       | —     | flagpole (`L6=1`), axe, castle-bridge, scroll-locks, frenzies     |
| 15       | 2/3/4 | castle / staircase / exit pipe                                    |

**Small objects (row 0–11, C=0), sub-type `L`:** `0` ?-block power-up, `1`
?-block coin, `2` hidden coin block, `3` hidden 1-up, `4` brick w/ power-up,
`5` brick w/ vine, `6` brick w/ star, `7` brick w/ multi-coins, `8` brick w/
1-up, `9` sideways pipe, `10` used/empty block, `11` jumpspring.

## Enemy stream

`enemyAddr` points to mostly 2-byte enemies, terminated by `$FF`.

```
byte0:  XXXX YYYY   X = column-in-page, Y = row (special: 0x0E, 0x0F)
byte1:  P H IIIIII  P = new-page; H = hard-mode-only; I = enemy id (0x00–0x3F)
```

- `Y=0x0F`: page-set command (`page = byte1 & 0x3F`).
- `Y=0x0E`: 3-byte area-connection command (destination AreaPointer + world +
  entrance page) — this is how a warp pipe names its target area.
- IDs `0x37–0x3E` are **group codes**: `n = id-0x37`; `n<4` Goombas, `n≥4` green
  Koopas; bit 0 → 2 or 3 enemies; bit 1 → ground or raised row.

**Enemy ids used here:** `$00` green Koopa Troopa, `$03` red Koopa, `$06`
Goomba (the decoder maps the rest by id and ignores non-walkers for now).

## How the decoder renders to a grid

`scripts/decode-smb-level.mjs` walks the object/enemy streams and paints a
rectangular grid of the engine's multi-layer symbols (`#` ground, `B` brick,
`?`/`M` coin/power-up blocks, `O` multi-coin brick, `*` star brick, `+` 1-up,
`[]`/`pP` pipe, `|` flagpole, `g` Goomba, `k` Koopa, `o` coin).

Coordinate mapping (to match the engine's 14-row levels):

- Object row `R` → grid row `R + 2` (objects carry a 32 px status-bar offset).
- Enemy row `R` → grid row `R + 1` (enemy Y-pixels omit that offset, so a
  same-row enemy stands one grid row above / on top of an object, i.e. on the
  floor).
- The ground surface is grid row 13; holes clear it.

Every area's decoded grid plus minimal import metadata (player start, exit,
default ? contents) is written by `build-official-map-set`, which emits all 36
area slots as levels (`smb-1-1` … `smb-8-4`).

## Sources

- doppelganger / 1wErt3r **SMBDIS.ASM** disassembly (gist `1wErt3r/4048722`) —
  pointer tables, object/enemy bit layouts, jump/type tables, enemy constants.
- DataCrystal TCRF, _Super Mario Bros._ ROM map / RAM map / Notes.
- NESdev Wiki — NROM / mapper 0 and the iNES header.

All addresses and type codes above were validated by decoding the actual ROM
and confirming the output reproduces the known canonical layouts.

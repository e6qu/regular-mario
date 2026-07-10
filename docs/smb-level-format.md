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

### Header

```
byte0:  TT EEE FFF   TT = timer setting (0 keep running timer, 1=400, 2=300, 3=200)
                     EEE = player entrance control, FFF = foreground scenery
                     (FFF >= 4 selects background colour control instead)
byte1:  SS BB TTTT   SS = area style (0 trees, 1 mushrooms, 2 bullet-bill
                     cannons; 3 = cloud override with style 0)
                     BB = background scenery, TTTT = terrain pattern
```

**Entrance control** selects the player's starting Y (from the disassembly's
`PlayerStarting_Y_Pos`): 0/4/5 fall in from the top, 1 upper third (`$20`),
2 standing on the standard floor (`$b0`), 3 mid-height (`$50`), 6/7 the
side-pipe intro walk (floor height).

**Terrain pattern** (`TerrainRenderBits`, 16 entries x 2 bytes) paints the
floor/ceiling per column: byte 0 bit N = playfield row N solid (rows 0-7),
byte 1 bits 0-4 = rows 8-12. Pattern 1 (`%00000000 %00011000`) is the standard
two-row ground; castles/underground use ceiling patterns. With the cloud
override (coin heavens) only byte 0 plus bit 3 of byte 1 (row 11) apply — the
single cloud floor row. An **alter-attributes object** (row 14, d6 of byte 1
clear) replaces the terrain pattern (low nybble) and background scenery
mid-level from its column onward; the d6-set variant only changes colours.

**Each object (2 bytes):**

```
byte0:  XXXX YYYY   X = column-in-page (0–15), Y = row (0–11 normal; 12–15 special)
byte1:  P CCC LLLL  P = new-page flag; C = category/sub-selector; L = length/sub-type
```

Absolute column = `page*16 + X`, where `page` advances by one each time the
new-page flag is set. A `Y=13` object with bit 6 clear is a page-skip command
(`page = byte1 & 0x1F`).

### Object type table (by row band and category `C`)

| Row band | C     | Object                                                             |
| -------- | ----- | ------------------------------------------------------------------ |
| 0–11     | 0     | small object; sub-type = `L` (see below)                           |
| 0–11     | 1     | area-style object: tree/mushroom ledge (top row is the platform,   |
|          |       | trunk/stem is scenery) or a **bullet-bill cannon column** when the |
|          |       | header area style is 2 (`L` = height count there, not length)      |
| 0–11     | 2/3   | row of bricks / row of solid blocks (length `L`)                   |
| 0–11     | 4     | row of coins                                                       |
| 0–11     | 5/6   | column of bricks / column of solid blocks (height `L`)             |
| 0–11     | 7     | vertical pipe; **byte1 bit 3 set ⇒ enterable/warp**; height=`L&7`  |
|          |       | (rows `R … R+height-1`; the mouth is 2 columns wide)               |
| 12       | 0/5   | hole in floor / water hole — clears playfield rows 8–12 (length    |
|          |       | `L+1`); the water variant differs only in visuals                  |
| 12       | 1     | pulley rope furniture for balance lifts (visual only)              |
| 12       | 2–4   | bridges: rail at rows 6/7/9, **solid bridge floor at rows 7/8/10** |
| 12       | 6/7   | ?-coin-block row at **fixed rows 3 / 7** (length `L+1`)            |
| 13       | d6=1  | special object, id = `byte1 & 0x3F` (table below)                  |
| 14       | —     | alter-attributes (see Header)                                      |
| 15       | 0/1   | endless rope / balance-lift rope (visual only)                     |
| 15       | 2/3/4 | castle (background scenery) / staircase / **side exit pipe**       |
| 15       | 5     | flag balls (visual)                                                |

**Small objects (row 0–11, C=0), sub-type `L`:** `0` ?-block power-up, `1`
?-block coin, `2` hidden coin block, `3` hidden 1-up, `4` brick w/ power-up,
`5` brick w/ vine, `6` brick w/ star, `7` brick w/ multi-coins, `8` brick w/
1-up, `9` sideways water pipe (2 rows, decorative), `10` used/empty block,
`11` jumpspring (2 rows: spring top + base).

**Special row-13 objects (`byte1 & 0x3F`, d6 set):** `0` intro pipe (the
side-pipe cutscene mouth at playfield rows 9–10; without a stream connection
it advances to the world's next level slot), `1` flagpole, `2` axe (row 6),
`3` chain (row 7), `4` castle bridge (row 8, 13 columns), `5` scroll-lock-warp
(turns nearby enterable pipes into the **warp zone**), `6`/`7` scroll lock,
`8` flying-Cheep frenzy start, `9` Bullet-Bill-or-swimming-Cheep frenzy start
(cheeps in water areas, bullet bills elsewhere), `10` frenzy stop, `11` loop
command (castle maze checkpoints).

**Warp zones.** The zone number is derived exactly like the game: world 1 →
zone `{4,3,2}`; otherwise ground areas → `{8,7,6}`, non-ground → `{-,5,-}`.
The left/middle/right enterable pipes near the scroll-lock-warp object map to
those world numbers; each warps to the destination world's first level slot at
page 0. (The blank slots of zone 5 are not usable warps.)

**Exit pipes** (row 15, C=4) render a vertical shaft from the top of the
screen with a left-facing mouth at playfield rows `L-2`/`L-1`; the player
walks right into the mouth and the transfer uses the area's active connection
(see the enemy stream) — this is how bonus rooms return to their source level.

## Enemy stream

`enemyAddr` points to mostly 2-byte enemies, terminated by `$FF`.

```
byte0:  XXXX YYYY   X = column-in-page, Y = row (special: 0x0E, 0x0F)
byte1:  P H IIIIII  P = new-page; H = hard-mode-only; I = enemy id (0x00–0x3F)
```

- `Y=0x0F`: page-set command (`page = byte1 & 0x3F`).
- `Y=0x0E`: 3-byte area-connection command (destination AreaPointer + world +
  entrance page). Connections are **stream-ordered and world-scoped**: a
  transfer (warp pipe, exit pipe, vine) initiated at column X uses the latest
  connection at or before it, and a connection only applies when its world
  field matches the world being played — this is how the shared underground
  bonus area returns each world to its own level, and how one area points
  different pipes at different destinations. The AreaPointer byte may carry
  stray high bits (`$a5` ≡ `$25`); only type+index (bits 6–0) matter.
- IDs `0x37–0x3E` are **group codes**: `n = id-0x37`; `n<4` Goombas, `n≥4` green
  Koopas; bit 0 → 2 or 3 enemies; bit 1 clear → floor row 11, set → raised
  row 7 (the data row nybble is ignored).

**Enemy ids** (from the disassembly's enemy constants): `$00` green Koopa,
`$02` Buzzy Beetle, `$03` red Koopa, `$05` Hammer Bro, `$06` Goomba, `$07`
Blooper, `$08` Bullet Bill (frenzy variant), `$0A`/`$0B` grey/red Cheep-cheep,
`$0C` Podoboo, `$0D` Piranha Plant, `$0E` green Paratroopa (jumping), `$0F`
red Paratroopa (vertical flyer), `$10` green Paratroopa (horizontal flyer),
`$11` Lakitu, `$12` Spiny, `$14` flying-Cheep frenzy, `$15` Bowser flame,
`$16` fireworks, `$17` Bullet-Bill-or-Cheep frenzy, `$18` stop frenzy,
`$1B–$1E` short firebars (direction/speed variants), `$1F` long firebar,
`$24` balance lift pair, `$25` vertical lift, `$26`/`$27` large lift up/down,
`$28`/`$2A` horizontal lifts, `$29` drop lift, `$2B`/`$2C` small lift up/down,
`$2D` Bowser, `$2E` power-up, `$2F` vine, `$32` jumpspring, `$33` Bullet Bill
(cannon variant), `$35` rescue retainer. **Piranha Plants are not in the
enemy stream at all** — the game auto-spawns one in every vertical pipe
outside world 1-1 (`VerticalPipe` handler).

The hard-mode bit (byte 1, d6) marks second-quest-only enemies; the decoder
targets the first quest and skips none (the flag is recorded but unused).

## How the decoder renders to a grid

`scripts/decode-smb-level.mjs` walks the object/enemy streams and paints a
rectangular grid of the engine's multi-layer symbols (`#` ground, `B` brick,
`?`/`M` coin/power-up blocks, `O` multi-coin brick, `*` star brick, `+` 1-up,
`[]`/`pP` pipe, `|` flagpole, `g` Goomba, `k` Koopa, `o` coin).

Coordinate mapping (to match the engine's 15-row levels — 2 HUD rows + a
13-row playfield, mirroring the NES 15-row screen):

- Object row `R` → grid row `R + 2` (objects carry a 32 px status-bar offset).
- Enemy row `R` → grid row `R + 1` (enemy Y-pixels omit that offset, so a
  same-row enemy stands one grid row above / on top of an object, i.e. on the
  floor).
- The ground surface is grid row 13 and the sub-surface ground is row 14 (the
  standard two-row ground); holes clear both. Rows 0–1 are the HUD band.

Grid symbols beyond the basics: `i`/`I` hidden coin/1-up blocks, `m` brick w/
power-up, `H` brick w/ vine (beanstalk block), `*`/`+`/`O` star/1-up/multi-coin
bricks, `Y`/`y` jumpspring, `C`/`c` bullet-bill cannon (with
`cannonProjectiles` metadata), `{`/`}`/`d`/`D` sideways pipe mouths (intro and
exit pipes; their `transitions` metadata carries `entryDirection`).

Every area's decoded grid plus import metadata (player start from the header's
entrance control, exit, timer from the header's timer setting — setting 0
inherits the entering level's units — transitions, cannons, theme) is written
by `build-official-map-set`, which emits every main slot (`smb-1-1` …
`smb-8-4`, including the shared side-pipe intro fragments) plus every
pipe-reached sub-area as `smb-warp-<type>-<index>-w<world>` — one copy per
world, because connections are world-scoped.

## Sources

- doppelganger / 1wErt3r **SMBDIS.ASM** disassembly (gist `1wErt3r/4048722`) —
  pointer tables, object/enemy bit layouts, jump/type tables, enemy constants.
- DataCrystal TCRF, _Super Mario Bros._ ROM map / RAM map / Notes.
- NESdev Wiki — NROM / mapper 0 and the iNES header.

All addresses and type codes above were validated by decoding the actual ROM
and confirming the output reproduces the known canonical layouts.

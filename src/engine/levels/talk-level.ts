// A presentation as a level: one room per slide, side by side, in one long original
// level. The shell draws each slide's text in the sky of its room (rows 0–15) and the
// presenter walks the castaway from room to room. What stands between two rooms is
// chosen by the next slide: a row of crates, an enemy, a pipe down to the next room, or
// a staircase at the start of a new world. Each room may also float a few platforms of
// its own (see the shell's talk-platforms.ts), so no two rooms look alike. Nothing in a
// talk level can be fallen into: the ground is unbroken, so the only hazards are ones
// god mode absorbs. Scenery (hills, bushes, ruins, torches…) is drawn by the shell per
// world, behind the tiles.
import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";
import { makeGoalTileRow, makeTileRun } from "./level-builder";

export const talkRoomFeatures = [
  "flat",
  "crates",
  "enemy",
  "pipe",
  "stairs",
] as const;
export type TalkRoomFeature = (typeof talkRoomFeatures)[number];

export const talkTileSizePixels = 16;
// 40 tiles = 640 px: one room fills a 16:9 view at the engine's integer zooms
export const talkRoomWidthTiles = 40;
export const talkLevelHeightTiles = 22;
// The slide panel's box inside each room, in pixels relative to the room's left edge.
export const talkPanelLeftPixels = 20;
export const talkPanelTopPixels = 8;
export const talkPanelWidthPixels = 600;
export const talkPanelHeightPixels = 232;
// Where the castaway stands to present a room (and where a jump to a room lands).
export const talkStandColumn = 4;

export const talkGroundRow = 20;
const groundRow = talkGroundRow;
const walkRow = groundRow - 1;
const crateRow = groundRow - 4;
const featureColumn = 30;
const gateColumn = 36;

// The rows a floating platform may use: clear of the sign (which ends at row 15's top,
// so row 15 would hang off it) and above the head of a big castaway walking the ground
// (rows 18–19).
export const talkPlatformRows = [16, 17] as const;
// The tiles a floating platform may be built from, all from the castaway art set.
export const talkPlatformTileIds = [
  "full-question-block-coin",
  "empty-question-block",
  "breakable-block",
  "castle-wall",
  "scenery-cloud-left",
  "scenery-cloud-middle",
  "scenery-cloud-right",
] as const;
export type TalkPlatformTileId = (typeof talkPlatformTileIds)[number];

// One tile of a floating platform, in the room's own columns.
export interface TalkPlatformTile {
  readonly column: number;
  readonly row: number;
  readonly tileId: TalkPlatformTileId;
}

const tileIds = {
  sky: "sky",
  grass: "grass",
  ground: "ground",
  stone: "stone",
  gate: "gate",
  crate: "full-question-block-coin",
  pipeLeft: "pipe-top-left",
  pipeRight: "pipe-top-right",
  bushLeft: "scenery-bush-left",
  bushMiddle: "scenery-bush-middle",
  bushRight: "scenery-bush-right",
  hillLeft: "scenery-hill-left",
  hillPeak: "scenery-hill-peak",
  hillRight: "scenery-hill-right",
} as const;

const actorIds = {
  runner: "runner-start",
  enemy: "beetle",
  coin: "vglc-smb-coin",
  pipe: "talk-pipe",
  gate: "open-gate",
} as const;

const tileDefinitions: LevelSpecInput["tileDefinitions"] = [
  { tileId: tileIds.sky, collision: TileCollisionKind.Empty },
  { tileId: tileIds.grass, collision: TileCollisionKind.Solid },
  { tileId: tileIds.ground, collision: TileCollisionKind.Solid },
  { tileId: tileIds.stone, collision: TileCollisionKind.Solid },
  { tileId: tileIds.gate, collision: TileCollisionKind.Goal },
  {
    tileId: tileIds.crate,
    collision: TileCollisionKind.Interactive,
    contentsActorId: actorIds.coin,
  },
  // A pipe is entered by standing on its mouth and pressing Down, so the mouth
  // stays Empty (see pipeMouthTileDefinitions).
  { tileId: tileIds.pipeLeft, collision: TileCollisionKind.Empty },
  { tileId: tileIds.pipeRight, collision: TileCollisionKind.Empty },
  { tileId: tileIds.bushLeft, collision: TileCollisionKind.Empty },
  { tileId: tileIds.bushMiddle, collision: TileCollisionKind.Empty },
  { tileId: tileIds.bushRight, collision: TileCollisionKind.Empty },
  { tileId: tileIds.hillLeft, collision: TileCollisionKind.Empty },
  { tileId: tileIds.hillPeak, collision: TileCollisionKind.Empty },
  { tileId: tileIds.hillRight, collision: TileCollisionKind.Empty },
  // floating platforms: the crate above holds a coin; the rest are plain solid ground
  ...talkPlatformTileIds
    .filter((tileId) => tileId !== tileIds.crate)
    .map((tileId) => ({ tileId, collision: TileCollisionKind.Solid })),
];

const actorDefinitions: LevelSpecInput["actorDefinitions"] = [
  { actorId: actorIds.runner, role: ActorRole.PlayerStart },
  { actorId: actorIds.enemy, role: ActorRole.Enemy },
  { actorId: actorIds.coin, role: ActorRole.Coin },
  { actorId: actorIds.pipe, role: ActorRole.Pipe },
  { actorId: actorIds.gate, role: ActorRole.Exit },
];

export interface TalkLevel {
  readonly levelInput: LevelSpecInput;
  readonly roomCount: number;
}

// The pixel x where the castaway stands to present room `index`.
export function talkStandXPixels(index: number): number {
  return (index * talkRoomWidthTiles + talkStandColumn) * talkTileSizePixels;
}

export function talkStandYPixels(): number {
  return walkRow * talkTileSizePixels;
}

// The room the castaway is in, from its x in pixels.
export function talkRoomAt(xPixels: number, roomCount: number): number {
  const room = Math.floor(xPixels / (talkRoomWidthTiles * talkTileSizePixels));
  return Math.min(roomCount - 1, Math.max(0, room));
}

// `features[i]` is what stands at the end of room i, on the way to room i + 1; the
// last room ends at the gate, so its feature is ignored. `platforms[i]`, when given, are
// room i's floating platforms; they replace the default row of three crates.
export function makeTalkLevel(
  features: readonly TalkRoomFeature[],
  platforms?: readonly (readonly TalkPlatformTile[])[],
): TalkLevel {
  const roomCount = features.length;
  if (roomCount === 0) {
    throw new Error("A talk level needs at least one room.");
  }
  const width = roomCount * talkRoomWidthTiles;
  const rows: string[][] = Array.from({ length: talkLevelHeightTiles }, () =>
    makeTileRun(tileIds.sky, width),
  );
  const put = (row: number, column: number, tileId: string): void => {
    const target = rows[row];
    if (target === undefined || column < 0 || column >= width) {
      throw new Error(
        `Talk tile ${tileId} at (${String(column)}, ${String(row)}) is outside the level.`,
      );
    }
    target[column] = tileId;
  };
  rows[groundRow] = makeTileRun(tileIds.grass, width);
  for (let row = groundRow + 1; row < talkLevelHeightTiles; row++) {
    rows[row] = makeTileRun(tileIds.ground, width);
  }

  const actors: LevelSpecInput["actors"][number][] = [
    {
      entityId: "talk-runner",
      actorId: actorIds.runner,
      x: talkStandColumn,
      y: walkRow,
    },
  ];

  features.forEach((feature, index) => {
    const left = index * talkRoomWidthTiles;
    const roomPlatforms = platforms?.[index];
    for (const tile of roomPlatforms ?? []) {
      if (
        tile.column < 0 ||
        tile.column >= talkRoomWidthTiles ||
        !(talkPlatformRows as readonly number[]).includes(tile.row) ||
        rows[tile.row]?.[left + tile.column] !== tileIds.sky
      ) {
        throw new Error(
          `Room ${String(index + 1)}: a platform tile at (${String(tile.column)}, ${String(tile.row)}) is out of place.`,
        );
      }
      put(tile.row, left + tile.column, tile.tileId);
    }
    const at = left + featureColumn;
    if (index === roomCount - 1) {
      rows[walkRow] = makeGoalTileRowWithin(rows[walkRow], left + gateColumn);
      actors.push({
        entityId: "talk-gate",
        actorId: actorIds.gate,
        x: left + gateColumn,
        y: walkRow,
      });
      return;
    }
    switch (feature) {
      case "flat":
        break;
      case "crates":
        if (roomPlatforms === undefined) {
          for (let column = at; column < at + 3; column++) {
            put(crateRow, column, tileIds.crate);
          }
        }
        break;
      case "enemy":
        actors.push({
          entityId: `talk-enemy-${String(index)}`,
          actorId: actorIds.enemy,
          x: at + 2,
          y: walkRow,
        });
        break;
      case "pipe":
        put(walkRow, at + 2, tileIds.pipeLeft);
        put(walkRow, at + 3, tileIds.pipeRight);
        actors.push({
          entityId: `talk-pipe-${String(index)}`,
          actorId: actorIds.pipe,
          x: at + 2,
          y: walkRow,
          targetTileX: (index + 1) * talkRoomWidthTiles + talkStandColumn,
          targetTileY: walkRow,
        });
        break;
      case "stairs": {
        // up three steps and down three, like the end of a world
        const heights = [1, 2, 3, 3, 2, 1];
        heights.forEach((height, step) => {
          for (let level = 0; level < height; level++) {
            put(walkRow - level, at + step, tileIds.stone);
          }
        });
        break;
      }
    }
  });

  return {
    roomCount,
    levelInput: {
      widthTiles: width,
      heightTiles: talkLevelHeightTiles,
      tileSizePixels: talkTileSizePixels,
      tileDefinitions,
      actorDefinitions,
      tiles: rows,
      actors,
    },
  };
}

// One room of every kind, then the gate: authored-route-coherence.test.ts checks every
// exported *LevelInput of this folder, so this keeps the talk builder under its rules.
export const talkSampleLevelInput: LevelSpecInput = makeTalkLevel([
  ...talkRoomFeatures,
  "flat",
]).levelInput;

// The finish row of the last room: the gate's goal tile in the gate's own cell, keeping
// the scenery already drawn in that row.
function makeGoalTileRowWithin(
  row: readonly string[] | undefined,
  gateColumn: number,
): string[] {
  if (row === undefined) {
    throw new Error("The talk level has no walk row.");
  }
  const goal = makeGoalTileRow(row.length, gateColumn);
  return row.map((tile, column) =>
    goal[column] === tileIds.gate ? tileIds.gate : tile,
  );
}

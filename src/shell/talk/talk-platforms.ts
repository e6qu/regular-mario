// Each room's floating platforms: one to five blocks, laid out as a row, a staircase or
// a scatter, at a seeded place and height, built from the world's own materials (crates,
// planks, stone, clouds). Seeded by the room's index, so a talk looks the same every
// time it runs, and no two neighbouring rooms look alike. Pure: no Phaser.
//
// Where a platform may go: under the sign and over a walking castaway's head
// (talkPlatformRows), clear of the castaway's stand point, of the props (which stand,
// or float, in the middle of the room) and of whatever stands at the room's end.
import {
  talkPlatformRows,
  type TalkPlatformTile,
  type TalkPlatformTileId,
  type TalkRoomFeature,
} from "../../engine/levels/talk-level";
import {
  talkPlatformKindTiles,
  talkThemes,
  type TalkPlatformKind,
  type TalkThemeId,
} from "./talk-themes";
import { talkSeededRandom } from "./talk-random";

// Columns between the castaway's stand point and the props.
const leftZone = { first: 6, last: 18 } as const;
// Columns after the props, before the gate column; free only when nothing tall stands
// there (stairs and pipes are climbed on).
const rightZone = { first: 31, last: 37 } as const;

export interface TalkPlatformRoom {
  readonly index: number;
  readonly theme: TalkThemeId;
  readonly feature: TalkRoomFeature;
  readonly last: boolean;
  // the mounts slide's herd paces through the left zone, labels and all
  readonly herd: boolean;
}

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) {
    value = Math.imul(value ^ (character.codePointAt(0) ?? 0), 16777619);
  }
  return value >>> 0;
}

type Zone = { readonly first: number; readonly last: number };

export function talkRoomPlatforms(room: TalkPlatformRoom): TalkPlatformTile[] {
  const random = talkSeededRandom(
    Math.imul(room.index + 1, 0x9e3779b1) ^ hash(room.theme),
  );
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) {
      throw new Error("Nothing to pick from.");
    }
    return item;
  };
  const zones: Zone[] = [
    ...(room.herd ? [] : [leftZone]),
    ...(!room.last &&
    (room.feature === "crates" ||
      room.feature === "flat" ||
      room.feature === "enemy")
      ? [rightZone]
      : []),
  ];
  if (zones.length === 0) {
    return [];
  }
  const kinds = talkThemes[room.theme].platforms;
  // the first kind is the world's main material: weight it
  const kind = (): TalkPlatformKind =>
    random() < 0.5 ? (kinds[0] ?? "crate") : pick(kinds);
  const tiles: TalkPlatformTile[] = [];
  const taken = new Set<string>();
  const key = (column: number, row: number): string =>
    `${String(column)},${String(row)}`;
  // a group keeps one empty column from any other, so groups never merge
  const free = (column: number, row: number): boolean =>
    [-1, 0, 1].every((offset) => !taken.has(key(column + offset, row))) &&
    !taken.has(key(column, row - 1)) &&
    !taken.has(key(column, row + 1));
  const place = (
    cells: readonly { column: number; row: number }[],
    tileIds: readonly TalkPlatformTileId[],
  ): boolean => {
    if (!cells.every((cell) => free(cell.column, cell.row))) {
      return false;
    }
    cells.forEach((cell, index) => {
      taken.add(key(cell.column, cell.row));
      tiles.push({
        column: cell.column,
        row: cell.row,
        tileId: tileIds[index] ?? "full-question-block-coin",
      });
    });
    return true;
  };
  const rows = talkPlatformRows;
  let remaining = 1 + Math.floor(random() * 5);
  for (let attempt = 0; attempt < 24 && remaining > 0; attempt++) {
    const zone = pick(zones);
    const width = zone.last - zone.first + 1;
    const material = kind();
    if (material === "cloud") {
      // a cloud is two or three tiles wide, on one row
      const size = Math.min(remaining, random() < 0.5 ? 2 : 3, width);
      if (size < 2) {
        continue;
      }
      const column = zone.first + Math.floor(random() * (width - size + 1));
      const row = pick(rows);
      const ids: TalkPlatformTileId[] =
        size === 2
          ? ["scenery-cloud-left", "scenery-cloud-right"]
          : [
              "scenery-cloud-left",
              "scenery-cloud-middle",
              "scenery-cloud-right",
            ];
      if (
        place(
          ids.map((_, offset) => ({ column: column + offset, row })),
          ids,
        )
      ) {
        remaining -= size;
      }
      continue;
    }
    const shape = pick(["row", "row", "steps", "single"] as const);
    const size =
      shape === "single"
        ? 1
        : Math.min(remaining, 1 + Math.floor(random() * 3));
    if (size > width) {
      continue;
    }
    const column = zone.first + Math.floor(random() * (width - size + 1));
    const startRow = pick(rows);
    const lowest = Math.max(...rows);
    const highest = Math.min(...rows);
    const goesUp = startRow === lowest || random() < 0.5;
    const cells = Array.from({ length: size }, (_, offset) => {
      const step = shape === "steps" ? (goesUp ? -offset : offset) : 0;
      const row = Math.min(lowest, Math.max(highest, startRow + step));
      return { column: column + offset, row };
    });
    // a row of plain blocks often hides one crate among them
    const ids = cells.map((_, offset): TalkPlatformTileId => {
      const chosen =
        shape === "row" &&
        size > 1 &&
        offset === Math.floor(size / 2) &&
        random() < 0.6
          ? "crate"
          : material;
      return talkPlatformKindTiles[chosen];
    });
    if (place(cells, ids)) {
      remaining -= size;
    }
  }
  return tiles;
}

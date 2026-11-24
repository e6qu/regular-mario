import { describe, expect, it } from "vitest";

import {
  makeTalkLevel,
  talkPlatformRows,
  talkRoomFeatures,
  type TalkRoomFeature,
} from "../../engine/levels/talk-level";
import { makeLevelSpec } from "../../engine/domain/level-spec";
import { talkRoomPlatforms, type TalkPlatformRoom } from "./talk-platforms";
import { talkThemeIds } from "./talk-themes";

const rooms: TalkPlatformRoom[] = Array.from({ length: 80 }, (_, index) => ({
  index,
  theme: talkThemeIds[index % talkThemeIds.length] ?? "plains",
  feature: talkRoomFeatures[index % talkRoomFeatures.length] ?? "flat",
  last: index === 79,
  herd: index === 3,
}));

describe("talk platforms", () => {
  it("are the same every time for the same room", () => {
    for (const room of rooms) {
      expect(talkRoomPlatforms(room)).toEqual(talkRoomPlatforms(room));
    }
  });

  it("vary from room to room, one to five blocks each", () => {
    const layouts = rooms.map((room) =>
      JSON.stringify(talkRoomPlatforms(room)),
    );
    expect(new Set(layouts).size).toBeGreaterThan(rooms.length * 0.9);
    const counts = new Set(rooms.map((room) => talkRoomPlatforms(room).length));
    expect(counts.size).toBeGreaterThanOrEqual(4);
    for (const room of rooms) {
      expect(talkRoomPlatforms(room).length).toBeLessThanOrEqual(5);
    }
    rooms.forEach((room, index) => {
      const next = rooms[index + 1];
      if (next !== undefined) {
        expect(talkRoomPlatforms(next)).not.toEqual(talkRoomPlatforms(room));
      }
    });
  });

  it("stay clear of the stand point, the props, the sign and the walkway", () => {
    for (const room of rooms) {
      const tiles = talkRoomPlatforms(room);
      const cells = tiles.map(
        (tile) => `${String(tile.column)},${String(tile.row)}`,
      );
      expect(new Set(cells).size).toBe(cells.length);
      for (const tile of tiles) {
        expect(talkPlatformRows).toContain(tile.row);
        const left = tile.column >= 6 && tile.column <= 18;
        const right = tile.column >= 31 && tile.column <= 37;
        expect(left || right).toBe(true);
        if (room.herd) {
          expect(left).toBe(false);
        }
        if (right) {
          expect(room.last).toBe(false);
          expect(["crates", "flat", "enemy"]).toContain(room.feature);
        }
      }
    }
  });

  it("build a level that validates", () => {
    const features: TalkRoomFeature[] = [...talkRoomFeatures, "flat"];
    const platforms = features.map((feature, index) =>
      talkRoomPlatforms({
        index,
        theme: talkThemeIds[index] ?? "plains",
        feature,
        last: index === features.length - 1,
        herd: false,
      }),
    );
    const spec = makeLevelSpec(makeTalkLevel(features, platforms).levelInput);
    expect(spec.ok).toBe(true);
  });
});

import { TileCollisionKind } from "../../domain/level-spec";
import { ValidationErrorCode } from "../../domain/validation-error";
import {
  parseTiledJsonLevel,
  TiledLayerType,
  type TiledLayer,
} from "./tiled-json-level";
import { describe, expect, it } from "vitest";

import {
  requireParseFailure,
  requireParseSuccess,
  stepImportedLevelOnce,
} from "./import-test-support";

function skyGrassTileset() {
  return [
    {
      firstgid: 1,
      tiles: [
        { id: 0, type: "sky", collision: TileCollisionKind.Empty },
        { id: 1, type: "grass", collision: TileCollisionKind.Solid },
      ],
    },
  ];
}

function makeValidTiledInput() {
  return {
    width: 3,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    tilesets: skyGrassTileset(),
    layers: tiledLayers([1, 1, 1, 2, 2, 2]),
  };
}

function playerStartObject() {
  return { name: "runner-start", type: "player-start", x: 16, y: 0 };
}

function exitObject() {
  return { name: "open-gate", type: "exit", x: 32, y: 0 };
}

function tiledLayers(
  data: readonly number[],
  objects = [playerStartObject(), exitObject()],
): readonly TiledLayer[] {
  return [
    { type: TiledLayerType.TileLayer, data },
    { type: TiledLayerType.ObjectGroup, objects },
  ];
}

describe("parseTiledJsonLevel", () => {
  it("converts a valid Tiled map into a validating LevelSpecInput", () => {
    const value = requireParseSuccess(
      parseTiledJsonLevel(makeValidTiledInput()),
    );

    expect(value.widthTiles).toBe(3);
    expect(value.heightTiles).toBe(2);
    expect(value.tileSizePixels).toBe(16);
    expect(value.tiles).toEqual([
      ["sky", "sky", "sky"],
      ["grass", "grass", "grass"],
    ]);
    expect(value.tileDefinitions).toContainEqual({
      tileId: "empty",
      collision: TileCollisionKind.Empty,
    });
    expect(value.actors).toEqual([
      { entityId: "runner-start-1", actorId: "runner-start", x: 1, y: 0 },
      { entityId: "open-gate-1", actorId: "open-gate", x: 2, y: 0 },
    ]);
  });

  it("treats global tile id 0 as empty", () => {
    const value = requireParseSuccess(
      parseTiledJsonLevel({
        ...makeValidTiledInput(),
        layers: tiledLayers([0, 1, 1, 2, 2, 2]),
      }),
    );

    expect(value.tiles[0]?.[0]).toBe("empty");
  });

  it("rejects non-square tiles", () => {
    const errors = requireParseFailure(
      parseTiledJsonLevel({
        ...makeValidTiledInput(),
        tilewidth: 16,
        tileheight: 24,
      }),
    );

    expect(
      errors.some((e) => e.code === ValidationErrorCode.TiledTileNotSquare),
    ).toBe(true);
  });

  it("rejects maps without a tile layer", () => {
    const errors = requireParseFailure(
      parseTiledJsonLevel({
        ...makeValidTiledInput(),
        layers: [
          {
            type: TiledLayerType.ObjectGroup,
            objects: [
              { name: "runner-start", type: "player-start", x: 16, y: 0 },
            ],
          },
        ],
      }),
    );

    expect(
      errors.some((e) => e.code === ValidationErrorCode.TiledTileLayerMissing),
    ).toBe(true);
  });

  it("rejects tile layer data whose length does not match width * height", () => {
    const errors = requireParseFailure(
      parseTiledJsonLevel({
        ...makeValidTiledInput(),
        layers: tiledLayers([1, 1, 1, 2, 2]),
      }),
    );

    expect(
      errors.some(
        (e) => e.code === ValidationErrorCode.TiledTileLayerLengthMismatch,
      ),
    ).toBe(true);
  });

  it("rejects unknown global tile ids in the tile layer", () => {
    const errors = requireParseFailure(
      parseTiledJsonLevel({
        ...makeValidTiledInput(),
        layers: tiledLayers([99, 1, 1, 2, 2, 2]),
      }),
    );

    expect(errors[0]?.code).toBe(ValidationErrorCode.TiledUnknownGlobalTileId);
  });

  it("rejects objects missing a name", () => {
    const errors = requireParseFailure(
      parseTiledJsonLevel({
        ...makeValidTiledInput(),
        layers: tiledLayers(
          [1, 1, 1, 2, 2, 2],
          [{ name: "", type: "player-start", x: 16, y: 0 }, exitObject()],
        ),
      }),
    );

    expect(
      errors.some((e) => e.code === ValidationErrorCode.TiledObjectNameMissing),
    ).toBe(true);
  });

  it("rejects objects missing a role type", () => {
    const errors = requireParseFailure(
      parseTiledJsonLevel({
        ...makeValidTiledInput(),
        layers: tiledLayers(
          [1, 1, 1, 2, 2, 2],
          [{ name: "runner-start", type: "", x: 16, y: 0 }, exitObject()],
        ),
      }),
    );

    expect(
      errors.some((e) => e.code === ValidationErrorCode.TiledObjectRoleMissing),
    ).toBe(true);
  });

  it("drives the runtime simulation from an imported Tiled level", () => {
    // A realistic 6-tall, 4-wide map so the fixed player spawn (y=56) sits on the grass floor.
    const tileData = [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2,
    ];
    const value = requireParseSuccess(
      parseTiledJsonLevel({
        width: 4,
        height: 6,
        tilewidth: 16,
        tileheight: 16,
        tilesets: skyGrassTileset(),
        layers: tiledLayers(tileData),
      }),
    );
    const nextState = stepImportedLevelOnce(value);

    expect(nextState.clock.frameIndex).toBe(1);
    expect(nextState.players[0].outcome.kind).toBe("active");
  });
});

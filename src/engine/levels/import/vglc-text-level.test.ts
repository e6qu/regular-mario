import { TileCollisionKind, ActorRole } from "../../domain/level-spec";
import { describe, expect, it } from "vitest";

import {
  requireParseFailure,
  requireParseSuccess,
  stepImportedLevelOnce,
} from "./import-test-support";
import { parseVglcTextLevel } from "./vglc-text-level";
import { ValidationErrorCode } from "../../domain/validation-error";

function makeValidVglcInput() {
  return {
    widthTiles: 4,
    heightTiles: 2,
    tileSizePixels: 16,
    tileLegend: {
      ".": { tileId: "sky", collision: TileCollisionKind.Empty },
      "#": { tileId: "stone", collision: TileCollisionKind.Solid },
    } as const,
    actorLegend: {
      P: { actorId: "runner-start", role: ActorRole.PlayerStart },
      E: { actorId: "open-gate", role: ActorRole.Exit },
    } as const,
    tileRows: ["....", ".##."],
    actorRows: ["P E ", "    "],
  };
}

describe("parseVglcTextLevel", () => {
  it("converts a valid text grid into a validating LevelSpecInput", () => {
    expect(() =>
      stepImportedLevelOnce(
        requireParseSuccess(parseVglcTextLevel(makeValidVglcInput())),
      ),
    ).not.toThrow();
  });

  it("maps tile characters through the tile legend", () => {
    const value = requireParseSuccess(parseVglcTextLevel(makeValidVglcInput()));

    expect(value.tileDefinitions).toEqual([
      { tileId: "sky", collision: TileCollisionKind.Empty },
      { tileId: "stone", collision: TileCollisionKind.Solid },
    ]);
    expect(value.tiles).toEqual([
      ["sky", "sky", "sky", "sky"],
      ["sky", "stone", "stone", "sky"],
    ]);
  });

  it("preserves interactive tile contents from the tile legend", () => {
    const value = requireParseSuccess(
      parseVglcTextLevel({
        ...makeValidVglcInput(),
        tileLegend: {
          ".": { tileId: "sky", collision: TileCollisionKind.Empty },
          "?": {
            tileId: "question",
            collision: TileCollisionKind.Interactive,
            contentsActorId: "star-shard",
          },
          "#": { tileId: "stone", collision: TileCollisionKind.Solid },
        },
        actorLegend: {
          ...makeValidVglcInput().actorLegend,
          S: { actorId: "star-shard", role: ActorRole.Item },
        },
        tileRows: [".?..", ".##."],
      }),
    );

    expect(value.tileDefinitions).toContainEqual({
      tileId: "question",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "star-shard",
    });
  });

  it("places actors from the actor grid with deterministic entity ids", () => {
    const value = requireParseSuccess(parseVglcTextLevel(makeValidVglcInput()));

    expect(value.actorDefinitions).toEqual([
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      { actorId: "open-gate", role: ActorRole.Exit },
    ]);
    expect(value.actors).toEqual([
      { entityId: "runner-start-1", actorId: "runner-start", x: 0, y: 0 },
      { entityId: "open-gate-1", actorId: "open-gate", x: 2, y: 0 },
    ]);
  });

  it("rejects legend keys that are not single characters", () => {
    const errors = requireParseFailure(
      parseVglcTextLevel({
        ...makeValidVglcInput(),
        tileLegend: {
          "..": { tileId: "sky", collision: TileCollisionKind.Empty },
        },
      }),
    );

    expect(errors[0]?.code).toBe(ValidationErrorCode.VglcLegendKeyInvalid);
  });

  it("rejects tile grids whose row count does not match heightTiles", () => {
    const errors = requireParseFailure(
      parseVglcTextLevel({
        ...makeValidVglcInput(),
        tileRows: ["...."],
        actorRows: ["    "],
      }),
    );

    expect(
      errors.some((e) => e.code === ValidationErrorCode.VglcGridHeightMismatch),
    ).toBe(true);
  });

  it("rejects tile rows whose width does not match widthTiles", () => {
    const errors = requireParseFailure(
      parseVglcTextLevel({
        ...makeValidVglcInput(),
        tileRows: ["...", ".##."],
        actorRows: ["P E ", "    "],
      }),
    );

    expect(
      errors.some((e) => e.code === ValidationErrorCode.VglcGridWidthMismatch),
    ).toBe(true);
  });

  it("rejects tile characters missing from the tile legend", () => {
    const errors = requireParseFailure(
      parseVglcTextLevel({
        ...makeValidVglcInput(),
        tileRows: ["..?.", ".##."],
      }),
    );

    expect(errors[0]?.code).toBe(ValidationErrorCode.VglcTileCharacterUnknown);
  });

  it("rejects actor characters missing from the actor legend", () => {
    const errors = requireParseFailure(
      parseVglcTextLevel({
        ...makeValidVglcInput(),
        actorRows: ["P?E ", "    "],
      }),
    );

    expect(errors[0]?.code).toBe(ValidationErrorCode.VglcActorCharacterUnknown);
  });

  it("reports duplicate actor ids across legend entries", () => {
    const errors = requireParseFailure(
      parseVglcTextLevel({
        ...makeValidVglcInput(),
        actorLegend: {
          P: { actorId: "runner-start", role: ActorRole.PlayerStart },
          Q: { actorId: "runner-start", role: ActorRole.PlayerStart },
          E: { actorId: "open-gate", role: ActorRole.Exit },
        },
      }),
    );

    expect(
      errors.some(
        (e) => e.code === ValidationErrorCode.ActorDefinitionDuplicate,
      ),
    ).toBe(true);
  });

  it("does not fall back when the converted level fails LevelSpec validation", () => {
    const value = requireParseSuccess(
      parseVglcTextLevel({
        ...makeValidVglcInput(),
        tileLegend: {
          ".": { tileId: "sky", collision: "not-a-collision" },
          "#": { tileId: "stone", collision: TileCollisionKind.Solid },
        },
      }),
    );

    expect(() => stepImportedLevelOnce(value)).toThrow();
  });
});

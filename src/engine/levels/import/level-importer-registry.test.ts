import { TileCollisionKind, ActorRole } from "../../domain/level-spec";
import { UserLevelEntryFormat } from "../../domain/user-asset-manifest";
import { TiledLayerType } from "./tiled-json-level";
import { describe, expect, it } from "vitest";

import {
  importUserLevel,
  UserLevelFileContentKind,
} from "./level-importer-registry";
import { finishRouteLevelInput } from "../finish-route-level";

describe("importUserLevel", () => {
  it("imports an original-json level", () => {
    const result = importUserLevel(UserLevelEntryFormat.OriginalJson, {
      kind: UserLevelFileContentKind.Json,
      value: finishRouteLevelInput,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected successful import.");
    }

    expect(result.value.widthTiles).toBe(finishRouteLevelInput.widthTiles);
    expect(result.value.heightTiles).toBe(finishRouteLevelInput.heightTiles);
  });

  it("rejects original-json with non-json content", () => {
    const result = importUserLevel(UserLevelEntryFormat.OriginalJson, {
      kind: UserLevelFileContentKind.Text,
      value: "not json",
    });

    expect(result.ok).toBe(false);
  });

  it("rejects original-json with invalid shape", () => {
    const result = importUserLevel(UserLevelEntryFormat.OriginalJson, {
      kind: UserLevelFileContentKind.Json,
      value: { notALevel: true },
    });

    expect(result.ok).toBe(false);
  });

  it("imports a tiled-json level from a minimal valid fixture", () => {
    const tiledInput = {
      width: 10,
      height: 6,
      tilewidth: 16,
      tileheight: 16,
      tilesets: [
        {
          firstgid: 1,
          tiles: [
            { id: 0, type: "grass", collision: TileCollisionKind.Solid },
            { id: 1, type: "sky", collision: TileCollisionKind.Empty },
            { id: 2, type: "gate", collision: TileCollisionKind.Goal },
          ],
        },
      ],
      layers: [
        {
          type: TiledLayerType.TileLayer,
          data: Array.from({ length: 60 }, () => 2),
        },
        {
          type: TiledLayerType.ObjectGroup,
          objects: [
            { name: "runner-start", type: "player-start", x: 16, y: 80 },
            { name: "open-gate", type: "exit", x: 128, y: 80 },
          ],
        },
      ],
    };
    const result = importUserLevel(UserLevelEntryFormat.TiledJson, {
      kind: UserLevelFileContentKind.Json,
      value: tiledInput,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects tiled-json with non-square tiles", () => {
    const result = importUserLevel(UserLevelEntryFormat.TiledJson, {
      kind: UserLevelFileContentKind.Json,
      value: {
        width: 10,
        height: 6,
        tilewidth: 16,
        tileheight: 32,
        tilesets: [],
        layers: [],
      },
    });

    expect(result.ok).toBe(false);
  });

  it("imports a vglc-text level from wrapped JSON text", () => {
    const vglcInput = {
      widthTiles: 10,
      heightTiles: 6,
      tileSizePixels: 16,
      tileLegend: {
        ".": { tileId: "sky", collision: TileCollisionKind.Empty },
        "#": { tileId: "grass", collision: TileCollisionKind.Solid },
      },
      actorLegend: {
        P: { actorId: "runner-start", role: ActorRole.PlayerStart },
        E: { actorId: "open-gate", role: ActorRole.Exit },
      },
      tileRows: [
        "..........",
        "..........",
        "..........",
        "..........",
        "..........",
        "##########",
      ],
      actorRows: [
        "          ",
        "          ",
        "          ",
        "          ",
        "P        E",
        "          ",
      ],
    };
    const result = importUserLevel(UserLevelEntryFormat.VglcText, {
      kind: UserLevelFileContentKind.Text,
      value: JSON.stringify(vglcInput),
    });

    expect(result.ok).toBe(true);
  });

  it("rejects vglc-text with invalid wrapped JSON", () => {
    const result = importUserLevel(UserLevelEntryFormat.VglcText, {
      kind: UserLevelFileContentKind.Text,
      value: "not valid json",
    });

    expect(result.ok).toBe(false);
  });

  it("imports a direct VGLC SMB text level", () => {
    const result = importUserLevel(UserLevelEntryFormat.VglcSmbText, {
      kind: UserLevelFileContentKind.Text,
      value: ["P--G", "-Eo-", "XXXX"].join("\n"),
    });

    expect(result.ok).toBe(true);
  });

  it("imports a direct VGLC SMB text level with sidecar metadata", () => {
    const result = importUserLevel(
      UserLevelEntryFormat.VglcSmbText,
      {
        kind: UserLevelFileContentKind.Text,
        value: ["-Eo-", "XXXX"].join("\n"),
      },
      {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 3, y: 0 }],
      },
    );

    expect(result.ok).toBe(true);
  });

  it("imports a direct VGLC SMB multi-layer structural level with sidecar metadata", () => {
    const result = importUserLevel(
      UserLevelEntryFormat.VglcSmbMultiLayer,
      {
        kind: UserLevelFileContentKind.Text,
        value: ["---", "###"].join("\n"),
      },
      {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 2, y: 0 }],
        multiLayer: {
          playerPathLayer: ["x-x", "---"].join("\n"),
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected successful multi-layer import.");
    }

    expect(result.value.pathAnnotations).toEqual([
      {
        pathId: "vglc-smb-multi-layer-player-path",
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    ]);
  });

  it("rejects direct VGLC SMB text with JSON content", () => {
    const result = importUserLevel(UserLevelEntryFormat.VglcSmbText, {
      kind: UserLevelFileContentKind.Json,
      value: {},
    });

    expect(result.ok).toBe(false);
  });

  it("rejects direct VGLC SMB multi-layer with JSON content", () => {
    const result = importUserLevel(UserLevelEntryFormat.VglcSmbMultiLayer, {
      kind: UserLevelFileContentKind.Json,
      value: {},
    });

    expect(result.ok).toBe(false);
  });
});

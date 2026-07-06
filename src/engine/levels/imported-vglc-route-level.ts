import {
  ActorRole,
  TileCollisionKind,
  makeLevelSpec,
} from "../domain/level-spec";
import { parseVglcTextLevel } from "./import/vglc-text-level";

const importedVglcRouteWidthTiles = 8;
const importedVglcRouteHeightTiles = 6;

export const importedVglcRouteLevelInput = resolveImportedVglcRouteLevelInput();

function resolveImportedVglcRouteLevelInput() {
  const parseResult = parseVglcTextLevel({
    widthTiles: importedVglcRouteWidthTiles,
    heightTiles: importedVglcRouteHeightTiles,
    tileSizePixels: 16,
    tileLegend: {
      ".": { tileId: "sky", collision: TileCollisionKind.Empty },
      g: { tileId: "grass", collision: TileCollisionKind.Solid },
      s: { tileId: "stone", collision: TileCollisionKind.Solid },
      G: { tileId: "gate", collision: TileCollisionKind.Goal },
    },
    actorLegend: {
      P: { actorId: "runner-start", role: ActorRole.PlayerStart },
      b: { actorId: "beetle", role: ActorRole.Enemy },
      E: { actorId: "open-gate", role: ActorRole.Exit },
    },
    tileRows: [
      "........",
      "........",
      "......G.",
      "...ss...",
      "........",
      "gggggggg",
    ],
    actorRows: [
      "        ",
      "        ",
      "      E ",
      "        ",
      "P  b    ",
      "        ",
    ],
  });

  if (!parseResult.ok) {
    throw new Error("Imported VGLC route level must parse before boot.");
  }

  const levelSpecResult = makeLevelSpec(parseResult.value);

  if (!levelSpecResult.ok) {
    throw new Error("Imported VGLC route level must validate before boot.");
  }

  return parseResult.value;
}

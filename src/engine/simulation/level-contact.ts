import type { TileId } from "../domain/identifiers";
import { TileCollisionKind } from "../domain/level-spec";
import type { LevelSpec } from "../domain/level-spec";
import type { PlayerSimulationState } from "./player-state";
import {
  makePlayerTileColumnSpan,
  makePlayerTileRowSpan,
} from "./player-tile-span";

export type LevelContactState = {
  readonly hazard: boolean;
  readonly goal: boolean;
};

export function makeEmptyLevelContactState(): LevelContactState {
  return {
    hazard: false,
    goal: false,
  };
}

function makeTileIdsForCollisionKind(
  levelSpec: LevelSpec,
  collisionKind: TileCollisionKind.Hazard | TileCollisionKind.Goal,
): ReadonlySet<TileId> {
  const tileIds = new Set<TileId>();

  for (const tileDefinition of levelSpec.tileDefinitions) {
    if (
      tileDefinition.collision === collisionKind ||
      (collisionKind === TileCollisionKind.Hazard &&
        tileDefinition.collision === TileCollisionKind.SolidHazard)
    ) {
      tileIds.add(tileDefinition.tileId);
    }
  }

  return tileIds;
}

function playerOverlapsAnyTileId(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  targetTileIds: ReadonlySet<TileId>,
): boolean {
  const rowSpan = makePlayerTileRowSpan(player, levelSpec.tileSizePixels);
  const columnSpan = makePlayerTileColumnSpan(player, levelSpec.tileSizePixels);

  for (let rowIndex = rowSpan.start; rowIndex <= rowSpan.end; rowIndex += 1) {
    const row = levelSpec.tiles[rowIndex];

    if (row === undefined) {
      continue;
    }

    for (
      let columnIndex = columnSpan.start;
      columnIndex <= columnSpan.end;
      columnIndex += 1
    ) {
      const tileId = row[columnIndex];

      if (tileId !== undefined && targetTileIds.has(tileId)) {
        return true;
      }
    }
  }

  return false;
}

export function detectLevelContactState(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
): LevelContactState {
  const hazardTileIds = makeTileIdsForCollisionKind(
    levelSpec,
    TileCollisionKind.Hazard,
  );
  const goalTileIds = makeTileIdsForCollisionKind(
    levelSpec,
    TileCollisionKind.Goal,
  );

  return {
    hazard: playerOverlapsAnyTileId(player, levelSpec, hazardTileIds),
    goal: playerOverlapsAnyTileId(player, levelSpec, goalTileIds),
  };
}

export function hasPlayerFallenIntoPit(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
): boolean {
  const levelBottomPixelY = levelSpec.heightTiles * levelSpec.tileSizePixels;
  return player.position.y >= levelBottomPixelY;
}

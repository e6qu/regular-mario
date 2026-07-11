import type { TileId } from "../domain/identifiers";
import { TileCollisionKind } from "../domain/level-spec";
import type { LevelSpec } from "../domain/level-spec";
import type { TileCoordinate } from "../domain/units";
import type { BreakableBlockState } from "./breakable-block-state";
import { isBreakableBlockBroken } from "./breakable-block-state";

export type TileIndexRange = {
  readonly start: number;
  readonly end: number;
};

export enum HorizontalSolidCrossingDirection {
  Left = "left",
  Right = "right",
}

export type HorizontalSolidCrossing = {
  readonly columnIndex: number;
  readonly tileBoundary: number;
};

export function makeInteractiveTileIds(
  levelSpec: LevelSpec,
): ReadonlySet<TileId> {
  const interactiveTileIds = new Set<TileId>();

  for (const tileDefinition of levelSpec.tileDefinitions) {
    if (tileDefinition.collision === TileCollisionKind.Interactive) {
      interactiveTileIds.add(tileDefinition.tileId);
    }
  }

  return interactiveTileIds;
}

export function makeBreakableTileIds(
  levelSpec: LevelSpec,
): ReadonlySet<TileId> {
  const breakableTileIds = new Set<TileId>();

  for (const tileDefinition of levelSpec.tileDefinitions) {
    if (tileDefinition.collision === TileCollisionKind.Breakable) {
      breakableTileIds.add(tileDefinition.tileId);
    }
  }

  return breakableTileIds;
}

export function makeSpringTileIds(levelSpec: LevelSpec): ReadonlySet<TileId> {
  const springTileIds = new Set<TileId>();

  for (const tileDefinition of levelSpec.tileDefinitions) {
    if (tileDefinition.collision === TileCollisionKind.Spring) {
      springTileIds.add(tileDefinition.tileId);
    }
  }

  return springTileIds;
}

export function makeSolidTileIds(levelSpec: LevelSpec): ReadonlySet<TileId> {
  const solidTileIds = new Set<TileId>();

  for (const tileDefinition of levelSpec.tileDefinitions) {
    if (
      tileDefinition.collision === TileCollisionKind.Solid ||
      tileDefinition.collision === TileCollisionKind.Interactive ||
      tileDefinition.collision === TileCollisionKind.Breakable ||
      tileDefinition.collision === TileCollisionKind.SolidHazard ||
      tileDefinition.collision === TileCollisionKind.Spring
    ) {
      solidTileIds.add(tileDefinition.tileId);
    }
  }

  return solidTileIds;
}

export function makeHiddenTileIds(levelSpec: LevelSpec): ReadonlySet<TileId> {
  const hiddenTileIds = new Set<TileId>();

  for (const tileDefinition of levelSpec.tileDefinitions) {
    if (tileDefinition.collision === TileCollisionKind.Hidden) {
      hiddenTileIds.add(tileDefinition.tileId);
    }
  }

  return hiddenTileIds;
}

// A hidden block is intangible until bumped from below; once its tile position is
// revealed it becomes solid like an interactive block. This context carries the
// hidden tile ids plus the revealed positions (keyed "column,row"). It defaults to
// empty so every collision caller without hidden blocks behaves exactly as before.
export type HiddenBlockCollisionContext = {
  readonly hiddenTileIds: ReadonlySet<TileId>;
  readonly revealedPositionKeys: ReadonlySet<string>;
};

export const emptyHiddenBlockCollisionContext: HiddenBlockCollisionContext = {
  hiddenTileIds: new Set<TileId>(),
  revealedPositionKeys: new Set<string>(),
};

// True when the tile at (rowIndex, columnIndex) is one of the solid ids.
export function tileIsSolid(
  levelSpec: LevelSpec,
  solidTileIds: ReadonlySet<TileId>,
  rowIndex: number,
  columnIndex: number,
): boolean {
  const tileId = levelSpec.tiles[rowIndex]?.[columnIndex];

  if (tileId === undefined) {
    return false;
  }

  return solidTileIds.has(tileId);
}

export function hiddenBlockPositionKey(
  columnIndex: number,
  rowIndex: number,
): string {
  return `${String(columnIndex)},${String(rowIndex)}`;
}

export function tileRowHasSpringInColumns(
  levelSpec: LevelSpec,
  springTileIds: ReadonlySet<TileId>,
  rowIndex: number,
  columnRange: TileIndexRange,
): boolean {
  return tileRowHasMatchingTileInColumns(
    levelSpec,
    rowIndex,
    columnRange,
    (tileId) => springTileIds.has(tileId),
  );
}

function tileRowHasMatchingTileInColumns(
  levelSpec: LevelSpec,
  rowIndex: number,
  columnRange: TileIndexRange,
  matchesTile: (tileId: TileId, columnIndex: number) => boolean,
): boolean {
  const row = levelSpec.tiles[rowIndex];

  if (row === undefined) {
    return false;
  }

  for (
    let columnIndex = columnRange.start;
    columnIndex <= columnRange.end;
    columnIndex += 1
  ) {
    const tileId = row[columnIndex];

    if (tileId !== undefined && matchesTile(tileId, columnIndex)) {
      return true;
    }
  }

  return false;
}

function tileIsSolidAt(
  tileId: TileId,
  solidTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
  breakableBlocks: BreakableBlockState,
  columnIndex: number,
  rowIndex: number,
  hidden: HiddenBlockCollisionContext = emptyHiddenBlockCollisionContext,
): boolean {
  // Hidden blocks are intangible until bumped from below — solid only once the
  // tile position has been revealed.
  if (hidden.hiddenTileIds.has(tileId)) {
    return hidden.revealedPositionKeys.has(
      hiddenBlockPositionKey(columnIndex, rowIndex),
    );
  }

  if (!solidTileIds.has(tileId)) {
    return false;
  }

  if (!breakableTileIds.has(tileId)) {
    return true;
  }

  return !isBreakableBlockBroken(breakableBlocks, {
    x: columnIndex as TileCoordinate,
    y: rowIndex as TileCoordinate,
  });
}

export function tileRowHasSolidInColumns(
  levelSpec: LevelSpec,
  solidTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
  breakableBlocks: BreakableBlockState,
  rowIndex: number,
  columnRange: TileIndexRange,
  hidden: HiddenBlockCollisionContext = emptyHiddenBlockCollisionContext,
): boolean {
  return tileRowHasMatchingTileInColumns(
    levelSpec,
    rowIndex,
    columnRange,
    (tileId, columnIndex) =>
      tileIsSolidAt(
        tileId,
        solidTileIds,
        breakableTileIds,
        breakableBlocks,
        columnIndex,
        rowIndex,
        hidden,
      ),
  );
}

// Any hidden tile in the row/columns, revealed or not — used to trigger the
// upward head-bump that reveals a hidden block.
export function tileRowHasHiddenInColumns(
  levelSpec: LevelSpec,
  hiddenTileIds: ReadonlySet<TileId>,
  rowIndex: number,
  columnRange: TileIndexRange,
): boolean {
  return tileRowHasMatchingTileInColumns(
    levelSpec,
    rowIndex,
    columnRange,
    (tileId) => hiddenTileIds.has(tileId),
  );
}

function tileColumnHasSolidInRows(
  levelSpec: LevelSpec,
  solidTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
  breakableBlocks: BreakableBlockState,
  columnIndex: number,
  rowRange: TileIndexRange,
  excludedRowIndexes: ReadonlySet<number> = new Set<number>(),
  hidden: HiddenBlockCollisionContext = emptyHiddenBlockCollisionContext,
): boolean {
  for (let rowIndex = rowRange.start; rowIndex <= rowRange.end; rowIndex += 1) {
    if (excludedRowIndexes.has(rowIndex)) {
      continue;
    }

    const tileId = levelSpec.tiles[rowIndex]?.[columnIndex];

    if (
      tileId !== undefined &&
      tileIsSolidAt(
        tileId,
        solidTileIds,
        breakableTileIds,
        breakableBlocks,
        columnIndex,
        rowIndex,
        hidden,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function findHorizontalSolidCrossing(input: {
  readonly levelSpec: LevelSpec;
  readonly solidTileIds: ReadonlySet<TileId>;
  readonly breakableTileIds: ReadonlySet<TileId>;
  readonly breakableBlocks: BreakableBlockState;
  readonly rowRange: TileIndexRange;
  readonly excludedRowIndexes?: ReadonlySet<number>;
  readonly previousLeadingEdge: number;
  readonly movedLeadingEdge: number;
  readonly direction: HorizontalSolidCrossingDirection;
  readonly hidden?: HiddenBlockCollisionContext;
}): HorizontalSolidCrossing | undefined {
  const tileSizePixels = input.levelSpec.tileSizePixels;
  const crossedStartColumn = Math.floor(
    input.previousLeadingEdge / tileSizePixels,
  );
  const crossedEndColumn = Math.floor(input.movedLeadingEdge / tileSizePixels);
  const scan = makeHorizontalCrossingScan(input.direction);

  for (
    let columnIndex = crossedStartColumn;
    scan.shouldContinue(columnIndex, crossedEndColumn);
    columnIndex += scan.step
  ) {
    const tileBoundary = scan.makeTileBoundary(columnIndex, tileSizePixels);

    if (
      scan.didCrossBoundary(
        input.previousLeadingEdge,
        input.movedLeadingEdge,
        tileBoundary,
      ) &&
      tileColumnHasSolidInRows(
        input.levelSpec,
        input.solidTileIds,
        input.breakableTileIds,
        input.breakableBlocks,
        columnIndex,
        input.rowRange,
        input.excludedRowIndexes,
        input.hidden ?? emptyHiddenBlockCollisionContext,
      )
    ) {
      return { columnIndex, tileBoundary };
    }
  }

  return undefined;
}

type HorizontalCrossingScan = {
  readonly step: 1 | -1;
  readonly shouldContinue: (
    columnIndex: number,
    crossedEndColumn: number,
  ) => boolean;
  readonly makeTileBoundary: (
    columnIndex: number,
    tileSizePixels: number,
  ) => number;
  readonly didCrossBoundary: (
    previousLeadingEdge: number,
    movedLeadingEdge: number,
    tileBoundary: number,
  ) => boolean;
};

function makeHorizontalCrossingScan(
  direction: HorizontalSolidCrossingDirection,
): HorizontalCrossingScan {
  switch (direction) {
    case HorizontalSolidCrossingDirection.Right:
      return {
        step: 1,
        shouldContinue: (columnIndex, crossedEndColumn) =>
          columnIndex <= crossedEndColumn,
        makeTileBoundary: (columnIndex, tileSizePixels) =>
          columnIndex * tileSizePixels,
        didCrossBoundary: (
          previousLeadingEdge,
          movedLeadingEdge,
          tileBoundary,
        ) =>
          previousLeadingEdge <= tileBoundary &&
          movedLeadingEdge >= tileBoundary,
      };
    case HorizontalSolidCrossingDirection.Left:
      return {
        step: -1,
        shouldContinue: (columnIndex, crossedEndColumn) =>
          columnIndex >= crossedEndColumn,
        makeTileBoundary: (columnIndex, tileSizePixels) =>
          (columnIndex + 1) * tileSizePixels,
        didCrossBoundary: (
          previousLeadingEdge,
          movedLeadingEdge,
          tileBoundary,
        ) =>
          previousLeadingEdge >= tileBoundary &&
          movedLeadingEdge <= tileBoundary,
      };
    default: {
      const invalidDirection: never = direction;
      throw new Error(
        `Invalid horizontal solid crossing direction: ${String(invalidDirection)}`,
      );
    }
  }
}

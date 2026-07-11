import type { LevelSpec } from "../domain/level-spec";
import type {
  TileCoordinate,
  TilePoint,
  VelocityPixelsPerSecond,
} from "../domain/units";
import {
  initialMovementConstants,
  VerticalMovementState,
} from "./movement-model";
import type { TileId } from "../domain/identifiers";
import type { PlayerSimulationState } from "./player-state";
import type { BreakableBlockState } from "./breakable-block-state";
import {
  isBreakableBlockBroken,
  makeEmptyBreakableBlockState,
} from "./breakable-block-state";
import {
  makePlayerTileColumnSpan,
  makePlayerTileRowSpan,
  type TileSpan,
} from "./player-tile-span";
import {
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "./simulation-units";
import {
  emptyHiddenBlockCollisionContext,
  findHorizontalSolidCrossing,
  type HiddenBlockCollisionContext,
  HorizontalSolidCrossingDirection,
  makeBreakableTileIds,
  makeHiddenTileIds,
  makeInteractiveTileIds,
  makeSpringTileIds,
  makeSolidTileIds,
  tileRowHasHiddenInColumns,
  tileRowHasSpringInColumns,
  tileRowHasSolidInColumns,
} from "./tile-collision-support";

type DownwardRowCrossing = {
  readonly previousBottom: number;
  readonly movedBottom: number;
  readonly rowRange: TileSpan;
};

function makeSweptTileRowRange(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  tileSizePixels: number,
): TileSpan {
  const previousRowRange = makePlayerTileRowSpan(
    previousPlayer,
    tileSizePixels,
  );
  const movedRowRange = makePlayerTileRowSpan(movedPlayer, tileSizePixels);

  return {
    start: Math.min(previousRowRange.start, movedRowRange.start),
    end: Math.max(previousRowRange.end, movedRowRange.end),
  };
}

function makeDownwardRowCrossing(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  tileSizePixels: number,
): DownwardRowCrossing {
  const previousBottom =
    previousPlayer.position.y + previousPlayer.collider.height;
  const movedBottom = movedPlayer.position.y + movedPlayer.collider.height;

  return {
    previousBottom,
    movedBottom,
    rowRange: {
      start: Math.floor(previousBottom / tileSizePixels),
      end: Math.floor(movedBottom / tileSizePixels),
    },
  };
}

function visitDownwardCrossedRows(
  crossing: DownwardRowCrossing,
  tileSizePixels: number,
  visit: (rowIndex: number, tileTop: number) => void,
): void {
  for (
    let rowIndex = crossing.rowRange.start;
    rowIndex <= crossing.rowRange.end;
    rowIndex += 1
  ) {
    const tileTop = rowIndex * tileSizePixels;

    if (crossing.previousBottom <= tileTop && crossing.movedBottom >= tileTop) {
      visit(rowIndex, tileTop);
    }
  }
}

function makeDownwardLandingRowIndexes(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  tileSizePixels: number,
): ReadonlySet<number> {
  const landingRowIndexes = new Set<number>();

  if (movedPlayer.velocity.y <= 0) {
    return landingRowIndexes;
  }

  const crossing = makeDownwardRowCrossing(
    previousPlayer,
    movedPlayer,
    tileSizePixels,
  );

  visitDownwardCrossedRows(crossing, tileSizePixels, (rowIndex) => {
    landingRowIndexes.add(rowIndex);
  });

  return landingRowIndexes;
}

function recordTileBumps(
  levelSpec: LevelSpec,
  rowIndex: number,
  columnRange: TileSpan,
  shouldRecord: (tileId: TileId, position: TilePoint) => boolean,
  bumpedBlocks: TilePoint[],
): void {
  const row = levelSpec.tiles[rowIndex];

  if (row === undefined) {
    return;
  }

  for (
    let columnIndex = columnRange.start;
    columnIndex <= columnRange.end;
    columnIndex += 1
  ) {
    const tileId = row[columnIndex];
    const position = {
      x: columnIndex as TileCoordinate,
      y: rowIndex as TileCoordinate,
    };

    if (tileId !== undefined && shouldRecord(tileId, position)) {
      bumpedBlocks.push(position);
    }
  }
}

function recordInteractiveBlockBump(
  levelSpec: LevelSpec,
  interactiveTileIds: ReadonlySet<TileId>,
  rowIndex: number,
  columnRange: TileSpan,
  bumpedInteractiveBlocks: TilePoint[],
): void {
  recordTileBumps(
    levelSpec,
    rowIndex,
    columnRange,
    (tileId) => interactiveTileIds.has(tileId),
    bumpedInteractiveBlocks,
  );
}

function recordBreakableBlockBump(
  levelSpec: LevelSpec,
  breakableTileIds: ReadonlySet<TileId>,
  rowIndex: number,
  columnRange: TileSpan,
  breakableBlocks: BreakableBlockState,
  bumpedBreakableBlocks: TilePoint[],
): void {
  recordTileBumps(
    levelSpec,
    rowIndex,
    columnRange,
    (tileId, position) =>
      breakableTileIds.has(tileId) &&
      !isBreakableBlockBroken(breakableBlocks, position),
    bumpedBreakableBlocks,
  );
}

function stopHorizontalMovementAt(
  movedPlayer: PlayerSimulationState,
  positionX: number,
): PlayerSimulationState {
  return {
    position: {
      x: requireSimulationPixelPosition(positionX, "player.position.x"),
      y: movedPlayer.position.y,
    },
    velocity: {
      x: requireSimulationVelocity(0, "player.velocity.x"),
      y: movedPlayer.velocity.y,
    },
    collider: movedPlayer.collider,
    movement: movedPlayer.movement,
    coyoteFramesRemaining: movedPlayer.coyoteFramesRemaining,
    jumpBufferFramesRemaining: movedPlayer.jumpBufferFramesRemaining,
    jumpCutApplied: movedPlayer.jumpCutApplied,
    jumpTierIndex: movedPlayer.jumpTierIndex,
  };
}

function resolveHorizontalSolidTileCollision(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  levelSpec: LevelSpec,
  solidTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
  breakableBlocks: BreakableBlockState,
  hidden: HiddenBlockCollisionContext,
): PlayerSimulationState {
  if (movedPlayer.velocity.x === 0) {
    return movedPlayer;
  }

  const tileSizePixels = levelSpec.tileSizePixels;
  const previousLeft = previousPlayer.position.x;
  const previousRight =
    previousPlayer.position.x + previousPlayer.collider.width;
  const movedLeft = movedPlayer.position.x;
  const movedRight = movedPlayer.position.x + movedPlayer.collider.width;
  const rowRange = makeSweptTileRowRange(
    previousPlayer,
    movedPlayer,
    tileSizePixels,
  );
  const landingRowIndexes = makeDownwardLandingRowIndexes(
    previousPlayer,
    movedPlayer,
    tileSizePixels,
  );

  if (movedPlayer.velocity.x > 0) {
    const crossing = findHorizontalSolidCrossing({
      levelSpec,
      solidTileIds,
      breakableTileIds,
      breakableBlocks,
      rowRange,
      excludedRowIndexes: landingRowIndexes,
      previousLeadingEdge: previousRight,
      movedLeadingEdge: movedRight,
      direction: HorizontalSolidCrossingDirection.Right,
      hidden,
    });

    if (crossing !== undefined) {
      return stopHorizontalMovementAt(
        movedPlayer,
        crossing.tileBoundary - movedPlayer.collider.width,
      );
    }
  }

  if (movedPlayer.velocity.x < 0) {
    const crossing = findHorizontalSolidCrossing({
      levelSpec,
      solidTileIds,
      breakableTileIds,
      breakableBlocks,
      rowRange,
      excludedRowIndexes: landingRowIndexes,
      previousLeadingEdge: previousLeft,
      movedLeadingEdge: movedLeft,
      direction: HorizontalSolidCrossingDirection.Left,
      hidden,
    });

    if (crossing !== undefined) {
      return stopHorizontalMovementAt(movedPlayer, crossing.tileBoundary);
    }
  }

  return movedPlayer;
}

function resolveDownwardSolidTileCollision(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  levelSpec: LevelSpec,
  solidTileIds: ReadonlySet<TileId>,
  springTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
  breakableBlocks: BreakableBlockState,
  springLaunchSpeed: VelocityPixelsPerSecond,
  hidden: HiddenBlockCollisionContext,
): PlayerSimulationState {
  if (movedPlayer.velocity.y <= 0) {
    return movedPlayer;
  }

  const tileSizePixels = levelSpec.tileSizePixels;
  const crossing = makeDownwardRowCrossing(
    previousPlayer,
    movedPlayer,
    tileSizePixels,
  );
  const columnRange = makePlayerTileColumnSpan(movedPlayer, tileSizePixels);
  let resolvedPlayer: PlayerSimulationState | undefined;

  visitDownwardCrossedRows(crossing, tileSizePixels, (rowIndex, tileTop) => {
    if (
      resolvedPlayer === undefined &&
      tileRowHasSolidInColumns(
        levelSpec,
        solidTileIds,
        breakableTileIds,
        breakableBlocks,
        rowIndex,
        columnRange,
        hidden,
      )
    ) {
      const landedOnSpring = tileRowHasSpringInColumns(
        levelSpec,
        springTileIds,
        rowIndex,
        columnRange,
      );
      resolvedPlayer = {
        position: {
          x: movedPlayer.position.x,
          y: requireSimulationPixelPosition(
            tileTop - movedPlayer.collider.height,
            "player.position.y",
          ),
        },
        velocity: {
          x: movedPlayer.velocity.x,
          y: landedOnSpring
            ? requireSimulationVelocity(
                0 - springLaunchSpeed,
                "player.velocity.y",
              )
            : requireSimulationVelocity(0, "player.velocity.y"),
        },
        collider: movedPlayer.collider,
        movement: {
          horizontal: movedPlayer.movement.horizontal,
          vertical: landedOnSpring
            ? VerticalMovementState.Jumping
            : VerticalMovementState.Grounded,
        },
        coyoteFramesRemaining: movedPlayer.coyoteFramesRemaining,
        jumpBufferFramesRemaining: movedPlayer.jumpBufferFramesRemaining,
        jumpCutApplied: movedPlayer.jumpCutApplied,
        jumpTierIndex: movedPlayer.jumpTierIndex,
      };
    }
  });

  if (resolvedPlayer !== undefined) {
    return resolvedPlayer;
  }

  return movedPlayer;
}

function resolveUpwardSolidTileCollision(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  levelSpec: LevelSpec,
  solidTileIds: ReadonlySet<TileId>,
  interactiveTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
  breakableBlocks: BreakableBlockState,
  bumpedInteractiveBlocks: TilePoint[],
  bumpedBreakableBlocks: TilePoint[],
  hidden: HiddenBlockCollisionContext,
): PlayerSimulationState {
  if (movedPlayer.velocity.y >= 0) {
    return movedPlayer;
  }

  const tileSizePixels = levelSpec.tileSizePixels;
  const previousTop = previousPlayer.position.y;
  const movedTop = movedPlayer.position.y;
  const crossedStartRow = Math.floor(previousTop / tileSizePixels);
  const crossedEndRow = Math.floor(movedTop / tileSizePixels);
  const columnRange = makePlayerTileColumnSpan(movedPlayer, tileSizePixels);
  let resolvedPlayer: PlayerSimulationState | undefined;

  for (
    let rowIndex = crossedStartRow;
    rowIndex >= crossedEndRow;
    rowIndex -= 1
  ) {
    if (resolvedPlayer !== undefined) {
      break;
    }

    const tileBottom = (rowIndex + 1) * tileSizePixels;

    if (
      previousTop >= tileBottom &&
      movedTop <= tileBottom &&
      // A revealed hidden block is already solid; an unrevealed one still stops
      // and reveals on the head-bump, so trigger on any hidden tile too.
      (tileRowHasSolidInColumns(
        levelSpec,
        solidTileIds,
        breakableTileIds,
        breakableBlocks,
        rowIndex,
        columnRange,
        hidden,
      ) ||
        tileRowHasHiddenInColumns(
          levelSpec,
          hidden.hiddenTileIds,
          rowIndex,
          columnRange,
        ))
    ) {
      resolvedPlayer = {
        position: {
          x: movedPlayer.position.x,
          y: requireSimulationPixelPosition(tileBottom, "player.position.y"),
        },
        velocity: {
          x: movedPlayer.velocity.x,
          y: requireSimulationVelocity(0, "player.velocity.y"),
        },
        collider: movedPlayer.collider,
        movement: {
          horizontal: movedPlayer.movement.horizontal,
          vertical: VerticalMovementState.Falling,
        },
        coyoteFramesRemaining: movedPlayer.coyoteFramesRemaining,
        jumpBufferFramesRemaining: movedPlayer.jumpBufferFramesRemaining,
        jumpCutApplied: movedPlayer.jumpCutApplied,
        jumpTierIndex: movedPlayer.jumpTierIndex,
      };
      recordInteractiveBlockBump(
        levelSpec,
        interactiveTileIds,
        rowIndex,
        columnRange,
        bumpedInteractiveBlocks,
      );
      // A hidden block reveals and yields its contents through the same path as
      // an interactive block, so route its bumps into bumpedInteractiveBlocks.
      recordInteractiveBlockBump(
        levelSpec,
        hidden.hiddenTileIds,
        rowIndex,
        columnRange,
        bumpedInteractiveBlocks,
      );
      recordBreakableBlockBump(
        levelSpec,
        breakableTileIds,
        rowIndex,
        columnRange,
        breakableBlocks,
        bumpedBreakableBlocks,
      );
    }
  }

  if (resolvedPlayer !== undefined) {
    return resolvedPlayer;
  }

  return movedPlayer;
}

export function resolveSolidTileCollision(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  levelSpec: LevelSpec,
): PlayerSimulationState {
  return resolveSolidTileCollisionWithBlockBumps(
    previousPlayer,
    movedPlayer,
    levelSpec,
    makeEmptyBreakableBlockState(),
    initialMovementConstants.springLaunchSpeed,
  ).player;
}

export function resolveSolidTileCollisionWithBlockBumps(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
  springLaunchSpeed: VelocityPixelsPerSecond,
  // Positions (keyed "column,row") of hidden blocks revealed on earlier frames;
  // a revealed hidden block behaves as solid. Empty by default.
  revealedHiddenPositionKeys: ReadonlySet<string> = new Set<string>(),
): {
  readonly player: PlayerSimulationState;
  readonly bumpedInteractiveBlocks: readonly TilePoint[];
  readonly bumpedBreakableBlocks: readonly TilePoint[];
} {
  const solidTileIds = makeSolidTileIds(levelSpec);
  const springTileIds = makeSpringTileIds(levelSpec);
  const interactiveTileIds = makeInteractiveTileIds(levelSpec);
  const breakableTileIds = makeBreakableTileIds(levelSpec);
  const hiddenTileIds = makeHiddenTileIds(levelSpec);
  const hidden: HiddenBlockCollisionContext =
    hiddenTileIds.size === 0
      ? emptyHiddenBlockCollisionContext
      : { hiddenTileIds, revealedPositionKeys: revealedHiddenPositionKeys };
  // A revealed hidden block is bumped exactly like an interactive block: it joins
  // bumpedInteractiveBlocks so the shared machinery reveals it and spawns contents.
  const bumpedInteractiveBlocks: TilePoint[] = [];
  const bumpedBreakableBlocks: TilePoint[] = [];
  const horizontallyResolvedPlayer = resolveHorizontalSolidTileCollision(
    previousPlayer,
    movedPlayer,
    levelSpec,
    solidTileIds,
    breakableTileIds,
    breakableBlocks,
    hidden,
  );
  const upwardResolvedPlayer = resolveUpwardSolidTileCollision(
    previousPlayer,
    horizontallyResolvedPlayer,
    levelSpec,
    solidTileIds,
    interactiveTileIds,
    breakableTileIds,
    breakableBlocks,
    bumpedInteractiveBlocks,
    bumpedBreakableBlocks,
    hidden,
  );

  return {
    player: resolveDownwardSolidTileCollision(
      previousPlayer,
      upwardResolvedPlayer,
      levelSpec,
      solidTileIds,
      springTileIds,
      breakableTileIds,
      breakableBlocks,
      springLaunchSpeed,
      hidden,
    ),
    bumpedInteractiveBlocks,
    bumpedBreakableBlocks,
  };
}

export function resolveSolidTileCollisionWithInteractiveBumps(
  previousPlayer: PlayerSimulationState,
  movedPlayer: PlayerSimulationState,
  levelSpec: LevelSpec,
): {
  readonly player: PlayerSimulationState;
  readonly bumpedInteractiveBlocks: readonly TilePoint[];
} {
  const result = resolveSolidTileCollisionWithBlockBumps(
    previousPlayer,
    movedPlayer,
    levelSpec,
    makeEmptyBreakableBlockState(),
    initialMovementConstants.springLaunchSpeed,
  );

  return {
    player: result.player,
    bumpedInteractiveBlocks: result.bumpedInteractiveBlocks,
  };
}

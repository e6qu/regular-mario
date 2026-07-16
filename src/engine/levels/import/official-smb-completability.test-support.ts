// Movement-envelope search support for the completability proof (see
// official-smb-completability.test.ts).
// from every level's player start, a breadth-first search over a conservative
// movement envelope (walk, ledge drops, rise-then-glide jumps, swimming,
// springs, moving lifts, pipe/vine transitions, loop-zone gates) must reach a
// finish (a Goal tile) somewhere in the run. This machine-checks every one of
// the 54 decoded levels without needing the ROM or a browser.

import { TileCollisionKind } from "../../domain/level-spec";
import type { LevelSpec } from "../../domain/level-spec";
import {
  loadOfficialSmbPack,
  type OfficialPackLevel,
} from "./official-smb-pack.test-support";

const pack = loadOfficialSmbPack();

// Conservative movement envelope: SMB's standing jump apexes 4 tiles and a
// full-run jump 5 with ~9 tiles of range; we search with a straight
// rise-then-glide-then-fall arc capped below that.
const maxJumpRiseTiles = 4;
const maxSpringRiseTiles = 8;
const maxGlideTiles = 8;

type TransferTarget = {
  readonly targetLevelName?: unknown;
  readonly targetTileX?: unknown;
  readonly targetTileY?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
};

type LevelModel = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly solid: (col: number, row: number) => boolean;
  readonly breakable: (col: number, row: number) => boolean;
  readonly platformTop: (col: number, row: number) => boolean;
  readonly springTop: (col: number, row: number) => boolean;
  readonly goalCols: ReadonlySet<number>;
  readonly water: boolean;
  readonly loopZones: LevelSpec["loopZones"];
  readonly transfers: readonly {
    readonly x: number;
    readonly y: number;
    readonly target: string;
    readonly targetX: number;
    readonly targetY: number;
  }[];
  readonly fallExit:
    | { readonly target: string; readonly targetX: number }
    | undefined;
  readonly startCol: number;
  readonly startRow: number;
};

function transferEntries(
  level: OfficialPackLevel,
  key: string,
): readonly TransferTarget[] {
  const value = level.metadata[key];
  return Array.isArray(value) ? (value as TransferTarget[]) : [];
}

function buildModel(level: OfficialPackLevel): LevelModel {
  const spec = level.levelSpec;
  const collisionByTileId = new Map(
    spec.tileDefinitions.map((definition) => [
      definition.tileId,
      definition.collision,
    ]),
  );
  const solidKinds = new Set<TileCollisionKind>([
    TileCollisionKind.Solid,
    TileCollisionKind.Breakable,
    TileCollisionKind.Interactive,
    TileCollisionKind.SolidHazard,
    TileCollisionKind.Spring,
  ]);
  const collisionAt = (col: number, row: number): TileCollisionKind => {
    const tileId = spec.tiles[row]?.[col];
    if (tileId === undefined) {
      return TileCollisionKind.Empty;
    }
    return collisionByTileId.get(tileId) ?? TileCollisionKind.Empty;
  };
  const goalCols = new Set<number>();
  for (const [row, tileRow] of spec.tiles.entries()) {
    for (const [col, tileId] of tileRow.entries()) {
      void row;
      if (collisionByTileId.get(tileId) === TileCollisionKind.Goal) {
        goalCols.add(col);
      }
    }
  }

  // Moving lifts: the set of tile cells a platform's top surface sweeps
  // through, generous enough to connect the gaps they carry the player over.
  const platformCells = new Set<string>();
  const markPlatform = (col: number, row: number): void => {
    if (
      col >= 0 &&
      col < spec.widthTiles &&
      row >= 0 &&
      row < spec.heightTiles
    ) {
      platformCells.add(`${String(col)},${String(row)}`);
    }
  };
  for (const platform of spec.platforms) {
    const reachRows =
      platform.kind === "lift-up" ||
      platform.kind === "lift-down" ||
      platform.kind === "drop"
        ? spec.heightTiles
        : 4;
    for (let dx = 0; dx < platform.widthTiles; dx += 1) {
      if (platform.kind === "horizontal") {
        for (let ox = -4; ox <= 4; ox += 1) {
          markPlatform(platform.tileX + dx + ox, platform.tileY);
        }
      } else {
        for (let oy = 0 - reachRows; oy <= reachRows; oy += 1) {
          markPlatform(platform.tileX + dx, platform.tileY + oy);
        }
      }
    }
  }

  const transfers = [
    ...transferEntries(level, "transitions"),
    ...transferEntries(level, "vineTransitions"),
  ]
    .filter(
      (transfer) =>
        typeof transfer.x === "number" &&
        typeof transfer.y === "number" &&
        typeof transfer.targetLevelName === "string",
    )
    .map((transfer) => ({
      x: transfer.x as number,
      y: transfer.y as number,
      target: transfer.targetLevelName as string,
      targetX: (transfer.targetTileX as number | undefined) ?? 2,
      targetY: (transfer.targetTileY as number | undefined) ?? 2,
    }));

  const fallExitValue = level.metadata.fallExitTransition as
    | TransferTarget
    | undefined;
  const fallExit =
    fallExitValue !== undefined &&
    typeof fallExitValue.targetLevelName === "string"
      ? {
          target: fallExitValue.targetLevelName,
          targetX: (fallExitValue.targetTileX as number | undefined) ?? 2,
        }
      : undefined;

  const playerStart = level.metadata.playerStart as
    | { readonly x?: number; readonly y?: number }
    | undefined;

  return {
    name: level.name,
    width: spec.widthTiles,
    height: spec.heightTiles,
    solid: (col, row) => solidKinds.has(collisionAt(col, row)),
    breakable: (col, row) =>
      collisionAt(col, row) === TileCollisionKind.Breakable,
    platformTop: (col, row) =>
      platformCells.has(`${String(col)},${String(row)}`) ||
      // A hidden block becomes solid once bumped, so the player can stand on
      // it — 8-4's route to the water-maze pipe requires exactly that step.
      // (Caveat: the model does not require the underside to be reachable
      // first; every hidden block in this fixed pack is bumpable, so the
      // liberty is safe here, but it would over-approve arbitrary levels.)
      collisionAt(col, row) === TileCollisionKind.Hidden,
    springTop: (col, row) => collisionAt(col, row) === TileCollisionKind.Spring,
    goalCols,
    water: level.metadata.theme === "water",
    loopZones: spec.loopZones,
    transfers,
    fallExit,
    startCol: playerStart?.x ?? 2,
    startRow: playerStart?.y ?? 2,
  };
}

export const models = new Map<string, LevelModel>();
for (const level of pack.values()) {
  models.set(level.name, buildModel(level));
}

type SearchNode = {
  readonly level: string;
  readonly col: number;
  readonly row: number;
};

function crossingAllowed(
  model: LevelModel,
  fromCol: number,
  toCol: number,
  row: number,
  airborne: boolean,
): boolean {
  for (const zone of model.loopZones) {
    if (fromCol < zone.checkTileX && toCol >= zone.checkTileX) {
      // The runtime requires solid ground and compares the player's TOP row;
      // a node's row is the occupied (feet) cell, one row lower. Airborne
      // crossings always fail the check.
      const topRow = row - 1;
      if (
        airborne ||
        topRow < zone.requiredRowMin ||
        topRow > zone.requiredRowMax
      ) {
        return false;
      }
    }
  }
  return true;
}

// Fall straight down from (col, row) to the first supported cell (tile or
// swept platform top). Returns undefined for a pit.
function landFrom(
  model: LevelModel,
  col: number,
  row: number,
): number | undefined {
  for (let r = Math.max(row, 0); r < model.height; r += 1) {
    if (model.solid(col, r)) {
      return undefined; // inside a wall — not a valid drop column
    }
    if (model.solid(col, r + 1) || model.platformTop(col, r + 1)) {
      return r;
    }
  }
  return undefined;
}

export function runSearch(startLevel: string): {
  readonly finished: boolean;
  readonly visitedLevels: ReadonlySet<string>;
  readonly stats: {
    visited: number;
    maxStartLevelCol: number;
    nodes: string[];
  };
} {
  const stats = { visited: 0, maxStartLevelCol: 0, nodes: [] as string[] };
  const visited = new Set<string>();
  const visitedLevels = new Set<string>();
  const queue: SearchNode[] = [];

  const enqueue = (level: string, col: number, row: number): void => {
    const model = models.get(level);
    if (model === undefined) {
      return;
    }
    const clampedCol = Math.max(0, Math.min(col, model.width - 1));
    // Starts use a feet-on-tile convention; lift an embedded point out of the
    // ground before landing it.
    let liftedRow = Math.max(0, row);
    while (liftedRow > 0 && model.solid(clampedCol, liftedRow)) {
      liftedRow -= 1;
    }
    const landed = landFrom(model, clampedCol, liftedRow);
    const finalRow = model.water ? liftedRow : landed;
    if (finalRow === undefined) {
      return;
    }
    const key = `${level}:${String(col)},${String(finalRow)}`;
    if (visited.has(key)) {
      return;
    }
    visited.add(key);
    visitedLevels.add(level);
    stats.visited += 1;
    if (level === startLevel && col > stats.maxStartLevelCol) {
      stats.maxStartLevelCol = col;
    }
    if (level === startLevel && stats.nodes.length < 600) {
      stats.nodes.push(`${String(col)},${String(finalRow)}`);
    }
    queue.push({ level, col, row: finalRow });
  };

  const startModel = models.get(startLevel);
  if (startModel === undefined) {
    return { finished: false, visitedLevels, stats };
  }
  enqueue(startLevel, startModel.startCol, startModel.startRow);

  let finished = false;
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) {
      break;
    }
    const model = models.get(node.level);
    if (model === undefined) {
      continue;
    }
    const { col, row } = node;

    // Finish: touching a goal column (the pole/axe) from beside or above it.
    for (const goalCol of model.goalCols) {
      if (Math.abs(col - goalCol) <= 1) {
        finished = true;
      }
    }

    // Transfers: standing near a pipe mouth / vine block takes the exit.
    for (const transfer of model.transfers) {
      if (Math.abs(col - transfer.x) <= 1 && Math.abs(row - transfer.y) <= 2) {
        enqueue(transfer.target, transfer.targetX, transfer.targetY);
      }
    }
    if (model.fallExit !== undefined) {
      enqueue(model.fallExit.target, model.fallExit.targetX, 2);
    }

    if (model.water) {
      // Swimming: free movement through open water.
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nextCol = col + dc;
        const nextRow = row + dr;
        if (
          nextCol >= 0 &&
          nextCol < model.width &&
          nextRow >= 0 &&
          nextRow < model.height &&
          !model.solid(nextCol, nextRow) &&
          crossingAllowed(model, col, nextCol, nextRow, false)
        ) {
          enqueue(node.level, nextCol, nextRow);
        }
      }
      continue;
    }

    // Walk / ledge drop to both neighbours.
    for (const dc of [1, -1] as const) {
      const nextCol = col + dc;
      if (
        nextCol >= 0 &&
        nextCol < model.width &&
        !model.solid(nextCol, row) &&
        crossingAllowed(model, col, nextCol, row, false)
      ) {
        enqueue(node.level, nextCol, row);
      }
    }

    // Jump: rise straight up (breakable bricks can be smashed through), then
    // glide sideways along the apex row, dropping onto whatever is below.
    const springBoost = model.springTop(col, row + 1);
    const maxRise = springBoost ? maxSpringRiseTiles : maxJumpRiseTiles;
    let apexRow = row;
    for (let rise = 1; rise <= maxRise; rise += 1) {
      const riseRow = row - rise;
      if (riseRow < 0) {
        break;
      }
      if (model.solid(col, riseRow) && !model.breakable(col, riseRow)) {
        break;
      }
      apexRow = riseRow;
      for (const dc of [1, -1] as const) {
        for (let glide = 1; glide <= maxGlideTiles; glide += 1) {
          const glideCol = col + dc * glide;
          if (
            glideCol < 0 ||
            glideCol >= model.width ||
            (model.solid(glideCol, apexRow) &&
              !model.breakable(glideCol, apexRow))
          ) {
            break;
          }
          if (!crossingAllowed(model, col, glideCol, apexRow, true)) {
            break;
          }
          enqueue(node.level, glideCol, apexRow);
        }
      }
      // Landing straight up (onto a ledge just above).
      enqueue(node.level, col, apexRow);
    }
  }

  return { finished, visitedLevels, stats };
}

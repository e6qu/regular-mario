import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";

export function makeTileRun(tileId: string, length: number): string[] {
  return Array.from({ length }, () => tileId);
}

// The row that carries a level's finish.
//
// Finishing is tile-driven: the deterministic core ends a level on contact
// with a Goal tile, and the Exit actor is only the picture of a gate. A route
// with the picture and no goal tile looks complete and cannot be completed —
// you walk into the drawn gate and nothing happens. Every authored route puts
// the goal in the gate's own cell, so the thing you can see is the thing that
// ends the level.
export function makeGoalTileRow(
  width: number,
  goalColumn: number,
  fillTileId = "sky",
): string[] {
  if (!Number.isInteger(goalColumn) || goalColumn < 0 || goalColumn >= width) {
    throw new Error(
      `Goal column ${String(goalColumn)} is outside a ${String(width)}-tile row.`,
    );
  }
  const row = makeTileRun(fillTileId, width);
  row[goalColumn] = "gate";
  return row;
}

// A pipe's art, and the only way a pipe is ever seen.
//
// The renderer never draws a Pipe actor (see isRenderedActorRole) because the
// decoded maps paint theirs as terrain, so a route that places only the actor
// has an invisible warp: the player walks over an ordinary patch of ground and
// falls into a hole in the world. The mouth is two tiles wide and keeps Empty
// collision — the pipe is entered by standing on it and pressing Down, so a
// solid mouth would wall the player out of the mechanic.
export const pipeMouthTileDefinitions: LevelSpecInput["tileDefinitions"] = [
  { tileId: "pipe-top-left", collision: TileCollisionKind.Empty },
  { tileId: "pipe-top-right", collision: TileCollisionKind.Empty },
];

// Draw the mouth of each pipe into `row`, at the column its Pipe actor stands
// on. The row is returned as a copy.
export function withPipeMouthsAt(
  row: readonly string[],
  columns: readonly number[],
): string[] {
  const painted = [...row];
  for (const column of columns) {
    if (column < 0 || column + 1 >= painted.length) {
      throw new Error(
        `A pipe mouth at column ${String(column)} does not fit a ${String(painted.length)}-tile row.`,
      );
    }
    painted[column] = "pipe-top-left";
    painted[column + 1] = "pipe-top-right";
  }
  return painted;
}

export function makeSegmentedTileRow(
  width: number,
  segments: readonly { readonly tile: string; readonly length: number }[],
): string[] {
  const result: string[] = [];

  for (const segment of segments) {
    result.push(...makeTileRun(segment.tile, segment.length));
  }

  if (result.length !== width) {
    throw new Error(
      `Tile row segments must sum to ${width} but got ${result.length}.`,
    );
  }

  return result;
}

export function makeRouteActorDefinitions(
  options: {
    readonly includeItem?: boolean;
    readonly includePowerUp?: boolean;
    readonly enemyActorId?: string;
  } = {},
): LevelSpecInput["actorDefinitions"] {
  const actorDefinitions = [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: options.enemyActorId ?? "beetle",
      role: ActorRole.Enemy,
    },
  ];

  if (options.includeItem) {
    actorDefinitions.push({
      actorId: "star-shard",
      role: ActorRole.Item,
    });
  }

  if (options.includePowerUp) {
    actorDefinitions.push({
      actorId: "spark-cap",
      role: ActorRole.PowerUp,
    });
  }

  actorDefinitions.push({
    actorId: "open-gate",
    role: ActorRole.Exit,
  });

  return actorDefinitions;
}

export function makeEnemyChallengeActorDefinitions(
  enemyRoles: readonly {
    readonly actorId: string;
    readonly role: ActorRole;
  }[],
): LevelSpecInput["actorDefinitions"] {
  return [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    ...enemyRoles,
    {
      actorId: "star-shard",
      role: ActorRole.Item,
    },
    {
      actorId: "spark-cap",
      role: ActorRole.PowerUp,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ];
}

export const standardSurfaceTileDefinitions: LevelSpecInput["tileDefinitions"] =
  [
    {
      tileId: "sky",
      collision: TileCollisionKind.Empty,
    },
    {
      tileId: "grass",
      collision: TileCollisionKind.Solid,
    },
    {
      tileId: "stone",
      collision: TileCollisionKind.Solid,
    },
    {
      // Spikes kill on contact (Hazard): the player dies the moment their box
      // overlaps a spike tile — walking into ground spikes or dropping onto/into
      // raised spikes both trigger the impale death. (SolidHazard is avoided
      // here: a body resting exactly on top of a solid tile does not overlap it,
      // so it would not register the hazard and would not die.)
      tileId: "thorn",
      collision: TileCollisionKind.Hazard,
    },
    {
      tileId: "gate",
      collision: TileCollisionKind.Goal,
    },
    {
      tileId: "flagpole",
      collision: TileCollisionKind.Goal,
    },
  ];

export const standardSkyGrassTileDefinitions: LevelSpecInput["tileDefinitions"] =
  [
    {
      tileId: "sky",
      collision: TileCollisionKind.Empty,
    },
    {
      tileId: "grass",
      collision: TileCollisionKind.Solid,
    },
    {
      // Every route these definitions describe draws a gate at its end, so the
      // palette has to contain the tile that actually ends a level. Without it
      // a route can only draw the picture of a finish.
      tileId: "gate",
      collision: TileCollisionKind.Goal,
    },
  ];

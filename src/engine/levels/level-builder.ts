import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";

export function makeTileRun(tileId: string, length: number): string[] {
  return Array.from({ length }, () => tileId);
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
  ];

import { ActorRole, TileCollisionKind } from "../engine/domain/level-spec";

/**
 * Which ids a level actually puts on screen.
 *
 * The renderer, the import validator, and the shipped-content check all have to
 * answer this identically. When they drifted, both directions hurt: art that
 * nothing supplied reached the scene and threw mid-build (which reads as a
 * hang), and art that is never drawn was demanded of imports that render fine.
 * One module, one answer.
 *
 * Deliberately structural rather than tied to `LevelSpec`: the renderer holds a
 * validated spec while the import path only has raw input, and the question is
 * the same for both.
 */

export const flagpoleTileId = "flagpole";

// A validated `LevelSpec` carries enum members while raw import input carries
// the same values as plain strings. Naming them once as strings lets both be
// compared without widening the enums at every call site.
const playerStartRole: string = ActorRole.PlayerStart;
const pipeRole: string = ActorRole.Pipe;
const exitRole: string = ActorRole.Exit;
const hiddenCollision: string = TileCollisionKind.Hidden;

export type LevelArtSource = {
  readonly tiles: readonly (readonly string[])[];
  readonly tileDefinitions: readonly {
    readonly tileId: string;
    readonly collision: TileCollisionKind | string;
    readonly contentsActorId?: string | undefined;
  }[];
  readonly actorDefinitions: readonly {
    readonly actorId: string;
    readonly role: ActorRole | string;
  }[];
  readonly actors: readonly { readonly actorId: string }[];
};

/**
 * A level with an authored flagpole marks its exit with the pole itself, so the
 * exit actor is not drawn and needs no art. The gate-axe visual is for castle
 * exits, where the gate IS the axe.
 */
export function levelDrawsExitActors(tiles: LevelArtSource["tiles"]): boolean {
  return !tiles.some((row) => row.some((tileId) => tileId === flagpoleTileId));
}

/**
 * A player start is where the player begins rather than something drawn, and a
 * pipe is drawn from its tiles. Mirrors the renderer's `isRenderedActorRole`.
 */
export function isRenderedActorRole(role: ActorRole | string): boolean {
  return role !== playerStartRole && role !== pipeRole;
}

/**
 * Cells that exist for collision alone: transparent sky and the invisible
 * finish trigger the goal columns paint above the authored pole art.
 */
export function isIntentionallyInvisibleTile(tileId: string): boolean {
  return tileId === "empty" || tileId === "sky" || tileId === "goal-reach";
}

/**
 * Tile ids the level draws.
 *
 * Note what is *not* excluded: decorative scenery has Empty collision and is
 * still raster art, so collision is the wrong axis to filter on. Only the three
 * intentionally invisible ids and hidden blocks (which draw nothing until
 * bumped) are exempt.
 */
export function drawnTileIds(level: LevelArtSource): readonly string[] {
  const hiddenTileIds = new Set(
    level.tileDefinitions
      .filter((definition) => definition.collision === hiddenCollision)
      .map((definition) => definition.tileId),
  );
  const drawn = new Set<string>();

  for (const row of level.tiles) {
    for (const tileId of row) {
      if (!isIntentionallyInvisibleTile(tileId) && !hiddenTileIds.has(tileId)) {
        drawn.add(tileId);
      }
    }
  }

  return [...drawn].sort();
}

/**
 * Actor ids the level draws, including what its blocks dispense — a coin that
 * appears when a block is bumped is every bit as rendered as one placed by hand.
 */
export function drawnActorIds(level: LevelArtSource): readonly string[] {
  const roleByActorId = new Map(
    level.actorDefinitions.map((definition) => [
      definition.actorId,
      definition.role,
    ]),
  );
  const drawsExits = levelDrawsExitActors(level.tiles);
  const drawn = new Set<string>();

  for (const actor of level.actors) {
    const role = roleByActorId.get(actor.actorId);

    if (role === undefined || !isRenderedActorRole(role)) {
      continue;
    }
    if (role === exitRole && !drawsExits) {
      continue;
    }

    drawn.add(actor.actorId);
  }

  const placedTileIds = new Set(level.tiles.flat());

  for (const definition of level.tileDefinitions) {
    const contents = definition.contentsActorId;

    if (contents !== undefined && placedTileIds.has(definition.tileId)) {
      drawn.add(contents);
    }
  }

  return [...drawn].sort();
}

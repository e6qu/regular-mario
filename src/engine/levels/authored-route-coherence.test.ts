import { describe, expect, it } from "vitest";

import {
  ActorRole,
  makeLevelSpec,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";

/**
 * Every authored route draws the truth about itself.
 *
 * Two things a level says are only pictures. The Exit actor is the picture of
 * a gate — finishing is tile-driven, and the core ends a level on contact with
 * a Goal tile. A Pipe actor is not drawn at all (see isRenderedActorRole); a
 * pipe is only ever seen as the pipe-mouth tiles under it.
 *
 * So a route can draw a gate it can never finish at, put its finish somewhere
 * other than the gate the player can see, or hide a warp in an empty patch of
 * ground. All three shipped: nine routes had a gate and no goal tile,
 * `showcase-level` finished twelve tiles before its own gate on a 32-tile
 * course, and three routes had invisible pipes.
 */
const levelModules = import.meta.glob<Record<string, unknown>>("./*-level.ts", {
  eager: true,
});

type AuthoredRoute = {
  readonly name: string;
  readonly input: LevelSpecInput;
};

const authoredRoutes: AuthoredRoute[] = Object.entries(levelModules).flatMap(
  ([path, module]) =>
    Object.entries(module).flatMap(([exportName, value]) =>
      exportName.endsWith("LevelInput")
        ? [{ name: `${path} ${exportName}`, input: value as LevelSpecInput }]
        : [],
    ),
);

function cellsOf(
  input: LevelSpecInput,
  matches: (tileId: string) => boolean,
): { readonly x: number; readonly y: number }[] {
  const spec = makeLevelSpec(input);
  if (!spec.ok) {
    throw new Error("Expected the route to validate.");
  }
  return spec.value.tiles.flatMap((row, y) =>
    row.flatMap((tileId, x) => (matches(tileId) ? [{ x, y }] : [])),
  );
}

function actorsInRole(
  input: LevelSpecInput,
  role: ActorRole,
): LevelSpecInput["actors"] {
  const rolesById = new Map(
    input.actorDefinitions.map((definition) => [
      definition.actorId,
      definition.role,
    ]),
  );
  return input.actors.filter((actor) => rolesById.get(actor.actorId) === role);
}

function goalTileIds(input: LevelSpecInput): Set<string> {
  const spec = makeLevelSpec(input);
  if (!spec.ok) {
    throw new Error("Expected the route to validate.");
  }
  return new Set(
    spec.value.tileDefinitions
      .filter((definition) => definition.collision === TileCollisionKind.Goal)
      .map((definition) => definition.tileId),
  );
}

describe("authored route coherence", () => {
  it("finds the authored routes", () => {
    expect(authoredRoutes.length).toBeGreaterThan(10);
  });

  for (const route of authoredRoutes) {
    const exits = actorsInRole(route.input, ActorRole.Exit);
    if (exits.length > 0) {
      it(`${route.name} finishes at the gate it draws`, () => {
        const goals = cellsOf(route.input, (tileId) =>
          goalTileIds(route.input).has(tileId),
        );
        expect(
          goals.length,
          "draws a gate but has no goal tile to finish on",
        ).toBeGreaterThan(0);
        for (const exit of exits) {
          expect(
            goals.some((goal) => goal.x === exit.x && goal.y === exit.y),
            `the gate at (${String(exit.x)},${String(exit.y)}) has no goal tile in its own cell`,
          ).toBe(true);
        }
      });
    }

    const pipes = actorsInRole(route.input, ActorRole.Pipe);
    if (pipes.length > 0) {
      it(`${route.name} draws the pipes it can be entered by`, () => {
        const mouths = cellsOf(route.input, (tileId) =>
          tileId.startsWith("pipe-top"),
        );
        for (const pipe of pipes) {
          expect(
            mouths.some((mouth) => mouth.x === pipe.x && mouth.y === pipe.y),
            `the pipe at (${String(pipe.x)},${String(pipe.y)}) is invisible: no pipe mouth is drawn on it`,
          ).toBe(true);
        }
      });
    }
  }
});

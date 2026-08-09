import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ActorRole,
  makeLevelSpec,
  TileCollisionKind,
} from "../engine/domain/level-spec";
import {
  BrowserLevelKey,
  selectBrowserGameBootstrap,
} from "./browser-level-selection";

/**
 * Every id a level names must be drawable by the shipped content set.
 *
 * This is the check that was missing while six separate art gaps shipped. Each
 * one behaved identically and misleadingly: the scene throws while building,
 * the debug API is never published, and the browser test that was waiting for
 * it times out thirty seconds later pointing at nothing. `glide-wasp` and
 * `shell-crab` had never existed; `mystery-box`, `hidden-block`, `warp-pipe`
 * and `coin` were offered by the editor or named as block contents with no
 * sprite behind them. Every one was found by hand, days or months after it
 * shipped.
 *
 * Both single-player and multiplayer draw from the same bundle through the same
 * BootScene, so one check covers both: a level unusable in one is unusable in
 * the other.
 */

type Manifest = {
  readonly tileSprites: Readonly<Record<string, unknown>>;
  readonly actorSprites: Readonly<Record<string, unknown>>;
};

function loadShippedManifest(): Manifest {
  const candidates = globSync(
    "public/game-content/content-set-bundles/*/remote-manifest.json",
  );
  const path = candidates[0];
  if (path === undefined) {
    throw new Error(
      "No content bundle found. Run `pnpm run build:release-content` first; " +
        "this check compares levels against the art that actually ships.",
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

/**
 * Tiles the scene draws. An empty tile is background and has no art, which is
 * why `sky` is absent from every bundle and correctly so.
 */
function drawnTileIds(
  levelInput: Parameters<typeof makeLevelSpec>[0],
): readonly string[] {
  const result = makeLevelSpec(levelInput);
  if (!result.ok) {
    throw new Error(
      `Level does not validate: ${result.errors.map((e) => e.message).join(" ")}`,
    );
  }
  const spec = result.value;
  const drawn = new Set<string>();
  for (const definition of spec.tileDefinitions) {
    if (definition.collision !== TileCollisionKind.Empty) {
      drawn.add(definition.tileId);
    }
  }
  return [...drawn];
}

/**
 * Actors the scene draws, and the contents blocks spawn.
 *
 * Mirrors `isRenderedActorRole`: a player start is where the player begins
 * rather than something drawn, and a pipe is drawn from its tiles. Block
 * contents are included because a coin that appears when a block is bumped is
 * every bit as rendered as one placed by hand — the distinction I got wrong
 * when I first scanned for this and concluded `coin` was safe.
 */
function drawnActorIds(
  levelInput: Parameters<typeof makeLevelSpec>[0],
): readonly string[] {
  const result = makeLevelSpec(levelInput);
  if (!result.ok) {
    throw new Error("Level does not validate.");
  }
  const spec = result.value;
  const drawn = new Set<string>();
  for (const definition of spec.actorDefinitions) {
    if (
      definition.role !== ActorRole.PlayerStart &&
      definition.role !== ActorRole.Pipe
    ) {
      drawn.add(definition.actorId);
    }
  }
  for (const definition of spec.tileDefinitions) {
    const contents = definition.contentsActorId;
    if (contents !== undefined) {
      drawn.add(contents);
    }
  }
  return [...drawn];
}

describe("every bundled level can be drawn by the shipped content set", () => {
  const manifest = loadShippedManifest();
  const tileArt = new Set(Object.keys(manifest.tileSprites));
  const actorArt = new Set(Object.keys(manifest.actorSprites));

  for (const key of Object.values(BrowserLevelKey)) {
    it(`${key} names only art that ships`, () => {
      const bootstrap = selectBrowserGameBootstrap(`?browserLevel=${key}`);
      const levels = [
        bootstrap.levelInput,
        ...(bootstrap.levelSequence ?? []),
        ...(bootstrap.warpLevelsByName === undefined
          ? []
          : [...bootstrap.warpLevelsByName.values()]),
      ];
      const missingTiles = new Set<string>();
      const missingActors = new Set<string>();
      for (const level of levels) {
        for (const tileId of drawnTileIds(level)) {
          if (!tileArt.has(tileId)) {
            missingTiles.add(tileId);
          }
        }
        for (const actorId of drawnActorIds(level)) {
          if (!actorArt.has(actorId)) {
            missingActors.add(actorId);
          }
        }
      }
      expect(
        { tiles: [...missingTiles], actors: [...missingActors] },
        `${key} names art the bundle cannot draw; the scene throws while ` +
          `building and every test on this level times out with no clue why`,
      ).toEqual({ tiles: [], actors: [] });
    });
  }
});

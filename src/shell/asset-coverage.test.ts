import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../engine/domain/level-spec";
import {
  BrowserLevelKey,
  selectBrowserGameBootstrap,
} from "./browser-level-selection";
import {
  drawnActorIds,
  drawnTileIds,
  isIntentionallyInvisibleTile,
} from "./level-art-requirements";
import { editorAuthorableArtIds } from "./level-editor";

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
 * The level as the renderer will see it.
 *
 * Validating first matters: `drawnTileIds` and `drawnActorIds` answer the same
 * question the scene asks, and the scene only ever asks it of a validated spec.
 */
function requireLevelSpec(levelInput: Parameters<typeof makeLevelSpec>[0]) {
  const result = makeLevelSpec(levelInput);
  if (!result.ok) {
    throw new Error(
      `Level does not validate: ${result.errors.map((e) => e.message).join(" ")}`,
    );
  }
  return result.value;
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
        const spec = requireLevelSpec(level);
        for (const tileId of drawnTileIds(spec)) {
          if (!tileArt.has(tileId)) {
            missingTiles.add(tileId);
          }
        }
        for (const actorId of drawnActorIds(spec)) {
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

  // The palette is the other source of ids: nothing in a level file names a
  // coin block, so nothing pulled `coin-block-2` into an asset set and every
  // authored level with one hung the play-test.
  it("the level editor cannot paint art the bundle lacks", () => {
    const authorable = editorAuthorableArtIds();
    expect({
      tiles: authorable.tileIds.filter(
        (tileId) =>
          !tileArt.has(tileId) && !isIntentionallyInvisibleTile(tileId),
      ),
      actors: authorable.actorIds.filter((actorId) => !actorArt.has(actorId)),
    }).toEqual({ tiles: [], actors: [] });
  });
});

import { describe, expect, it } from "vitest";

import {
  ActorRole,
  makeLevelSpec,
  TileCollisionKind,
} from "../engine/domain/level-spec";
import type { TilePoint } from "../engine/domain/units";
import {
  makeEmptySpawnedActorsState,
  resolveSpawnedActorsState,
} from "../engine/simulation/interactive-block-state";
import { decodeSharedLevel } from "./level-editor";

function tilePoint(x: number, y: number): TilePoint {
  return { x, y } as unknown as TilePoint;
}

// Encode a shared level the way the editor's Share button does:
// "<width>.<height>.<cells>", one palette char per cell (row-major).
function encode(
  width: number,
  height: number,
  rows: readonly string[],
): string {
  return `${width}.${height}.${rows.join("")}`;
}

// A minimal valid level: exactly one player start (p) and one exit/goal (x),
// on a ground floor (g) — the structural minimum makeLevelSpec accepts.
const validRows: readonly string[] = [
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
  "..p....x..",
  "gggggggggg",
];

describe("decodeSharedLevel", () => {
  it("decodes a well-formed shared level with a player and exit", () => {
    const level = decodeSharedLevel(encode(10, 8, validRows));
    expect(level).toBeDefined();
    expect(level?.widthTiles).toBe(10);
    expect(level?.heightTiles).toBe(8);
  });

  it("round-trips the player and exit into actors", () => {
    const level = decodeSharedLevel(encode(10, 8, validRows));
    // Exactly one player start and at least one exit must survive the decode,
    // or makeLevelSpec would have rejected it (returning undefined) above.
    expect(level).toBeDefined();
    expect(level?.actors.length).toBeGreaterThanOrEqual(2);
  });

  it("decodes coin bricks (A-I) and coin blocks (1-9) into their tiles", () => {
    const rows = [
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "...A..1...",
      "..p....x..",
      "gggggggggg",
    ];
    const level = decodeSharedLevel(encode(10, 8, rows));
    expect(level).toBeDefined();
    const tileIds = new Set(level?.tiles.flat() ?? []);
    // A = a 1-coin brick (keeps its brick look); 1 = a 1-coin "?" block.
    expect(tileIds.has("coin-brick-1")).toBe(true);
    expect(tileIds.has("coin-block-1")).toBe(true);
  });

  it("rejects a level missing the player start and exit", () => {
    const noActors = Array.from({ length: 8 }, (_row, y) =>
      y === 7 ? "gggggggggg" : "..........",
    );
    expect(decodeSharedLevel(encode(10, 8, noActors))).toBeUndefined();
  });

  it("rejects oversized dimensions (DoS guard against crafted links)", () => {
    const huge = ".".repeat(300 * 300);
    expect(decodeSharedLevel(`300.300.${huge}`)).toBeUndefined();
  });

  it("rejects a width just past the editor maximum", () => {
    const cells = ".".repeat(401 * 8);
    expect(decodeSharedLevel(`401.8.${cells}`)).toBeUndefined();
  });

  it("rejects dimensions below the editor minimum", () => {
    const tiny = Array.from({ length: 5 }, () => ".....");
    expect(decodeSharedLevel(encode(5, 5, tiny))).toBeUndefined();
  });

  it("rejects a cell-count / dimension mismatch", () => {
    expect(decodeSharedLevel("10.8.abc")).toBeUndefined();
  });

  it("rejects malformed input", () => {
    expect(decodeSharedLevel("not-a-level")).toBeUndefined();
    expect(decodeSharedLevel("")).toBeUndefined();
    expect(decodeSharedLevel("10..gggg")).toBeUndefined();
  });
});

describe("editor coin blocks", () => {
  // A "3" cell is a coin block holding 3 coins, at (5, 3).
  const coinRows: readonly string[] = [
    "..........",
    "..........",
    "..........",
    ".....3....",
    "..........",
    "..........",
    "..p....x..",
    "gggggggggg",
  ];

  it("decodes a coin block into an interactive tile that holds N coins", () => {
    const level = decodeSharedLevel(encode(10, 8, coinRows));
    expect(level).toBeDefined();
    if (level === undefined) {
      return;
    }
    expect(level.tiles[3]?.[5]).toBe("coin-block-3");
    const definition = level.tileDefinitions.find(
      (tile) => tile.tileId === "coin-block-3",
    );
    expect(definition?.collision).toBe(TileCollisionKind.Interactive);
    expect(definition?.contentSpawnLimit).toBe(3);
    expect(definition?.contentsActorId).toBe("vglc-smb-coin");
    const coinActor = level.actorDefinitions.find(
      (actor) => actor.actorId === "vglc-smb-coin",
    );
    expect(coinActor?.role).toBe(ActorRole.Coin);
  });

  it("makes a valid spec whose coin block dispenses a coin when bumped", () => {
    const level = decodeSharedLevel(encode(10, 8, coinRows));
    expect(level).toBeDefined();
    if (level === undefined) {
      return;
    }
    const result = makeLevelSpec(level);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const spawned = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      result.value,
      [tilePoint(5, 3)],
    );
    expect(spawned.spawnedActors).toHaveLength(1);
    expect(spawned.spawnedActors[0]?.role).toBe(ActorRole.Coin);
  });

  it("round-trips coin counts encode → decode", () => {
    const level = decodeSharedLevel(encode(10, 8, coinRows));
    expect(level?.tiles[3]?.[5]).toBe("coin-block-3");
  });
});

describe("editor pipes", () => {
  // "d" is the pipe-mouth brush.
  const pipeRows: readonly string[] = [
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..p..d.x..",
    "gggggggggg",
  ];

  // A pipe actor needs a target tile or the level it is in fails validation —
  // and the whole shared level went with it, decoding to nothing at all.
  it("decodes a shared level containing a pipe", () => {
    expect(decodeSharedLevel(encode(10, 8, pipeRows))).toBeDefined();
  });

  it("gives an unconnected pipe its own cell as its destination", () => {
    const level = decodeSharedLevel(encode(10, 8, pipeRows));
    const pipe = level?.actors.find((actor) => actor.x === 5 && actor.y === 6);
    expect(pipe?.targetTileX).toBe(5);
    expect(pipe?.targetTileY).toBe(6);
  });

  // A Pipe actor is never rendered, so a pipe is only ever seen as the mouth
  // tiles under it. The palette had no way to paint the mouth's left half.
  it("draws a whole two-tile mouth under the pipe", () => {
    const level = decodeSharedLevel(encode(10, 8, pipeRows));
    expect(level?.tiles[6]?.[5]).toBe("pipe-top-left");
    expect(level?.tiles[6]?.[6]).toBe("pipe-top-right");
  });

  it("never draws the mouth over something the author painted", () => {
    const rows = [...pipeRows];
    // A ground tile immediately right of the pipe stays ground.
    rows[6] = "..p..dg.x.";
    const level = decodeSharedLevel(encode(10, 8, rows));
    expect(level?.tiles[6]?.[5]).toBe("pipe-top-left");
    expect(level?.tiles[6]?.[6]).toBe("grass");
  });

  // The destination lives on the actor, not in any cell, so a cells-only code
  // could not describe it: every shared warp pointed nowhere.
  it("carries a connected pipe's destination through a shared link", () => {
    const level = decodeSharedLevel(`${encode(10, 8, pipeRows)}.5-6-8-6`);
    const pipe = level?.actors.find((actor) => actor.x === 5 && actor.y === 6);
    expect(pipe?.targetTileX).toBe(8);
    expect(pipe?.targetTileY).toBe(6);
  });

  it("still decodes a link shared before destinations were carried", () => {
    expect(decodeSharedLevel(encode(10, 8, validRows))).toBeDefined();
  });
});

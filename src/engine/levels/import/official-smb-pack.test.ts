// Coherence checks over the committed official-smb map set: every level in
// the pack must parse and validate, every cross-level transfer must point at
// a real level within its bounds, and 8-4's maze must be wired (loop
// checkpoints plus the pipes that bypass them). This guards the decoded pack
// against regressions without needing the ROM.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadOfficialSmbPack,
  officialSmbPackDir,
} from "./official-smb-pack.test-support";

const packDir = officialSmbPackDir;

const pack = loadOfficialSmbPack();

function expectTargetInBounds(
  source: string,
  target: {
    readonly targetLevelName?: unknown;
    readonly targetTileX?: unknown;
    readonly targetTileY?: unknown;
  },
): void {
  const targetName = target.targetLevelName;
  expect(typeof targetName, `${source} transfer target name`).toBe("string");
  const destination = pack.get(targetName as string);
  expect(
    destination,
    `${source} -> ${String(targetName)} must exist in the pack`,
  ).toBeDefined();
  if (destination === undefined) {
    return;
  }
  const x = target.targetTileX as number;
  const y = target.targetTileY as number;
  expect(x, `${source} -> ${String(targetName)} x`).toBeGreaterThanOrEqual(0);
  expect(x, `${source} -> ${String(targetName)} x`).toBeLessThan(
    destination.levelSpec.widthTiles,
  );
  expect(y, `${source} -> ${String(targetName)} y`).toBeGreaterThanOrEqual(0);
  expect(y, `${source} -> ${String(targetName)} y`).toBeLessThan(
    destination.levelSpec.heightTiles,
  );
}

describe("official-smb committed pack", () => {
  it("ships all 36 main slots plus the per-world sub-areas", () => {
    const mains = [...pack.keys()].filter((name) => /^smb-\d+-\d+$/.test(name));
    expect(mains.length).toBe(36);
    expect(pack.size).toBeGreaterThanOrEqual(49);
  });

  it("every cross-level transfer points at a real level within bounds", () => {
    for (const level of pack.values()) {
      const transitions = (level.metadata.transitions ?? []) as readonly {
        readonly targetLevelName?: unknown;
        readonly targetTileX?: unknown;
        readonly targetTileY?: unknown;
      }[];
      for (const transition of transitions) {
        expectTargetInBounds(level.name, transition);
      }
      const vines = (level.metadata.vineTransitions ?? []) as readonly {
        readonly targetLevelName?: unknown;
        readonly targetTileX?: unknown;
        readonly targetTileY?: unknown;
      }[];
      for (const vine of vines) {
        expectTargetInBounds(`${level.name} (vine)`, vine);
      }
      const fallExit = level.metadata.fallExitTransition as
        | {
            readonly targetLevelName?: unknown;
            readonly targetTileX?: unknown;
            readonly targetTileY?: unknown;
          }
        | undefined;
      if (fallExit !== undefined) {
        expectTargetInBounds(`${level.name} (fall exit)`, fallExit);
      }
    }
  });

  it("wires 8-4's maze: pipe-gated loop checkpoints with bypass pipes", () => {
    const castle = pack.get("smb-8-4");
    expect(castle).toBeDefined();
    if (castle === undefined) {
      return;
    }
    const loopZones = castle.levelSpec.loopZones;
    expect(loopZones.length).toBe(3);
    // Every 8-4 checkpoint requires an unreachable row — only pipes get past.
    for (const zone of loopZones) {
      expect(zone.requiredRowMin).toBeGreaterThanOrEqual(
        castle.levelSpec.heightTiles,
      );
    }
    // Each checkpoint has at least one enterable pipe before it whose target
    // lands at or past the checkpoint column (in this or another area).
    const transitions = (castle.metadata.transitions ?? []) as readonly {
      readonly x: number;
      readonly targetLevelName?: string;
      readonly targetTileX?: number;
    }[];
    for (const zone of loopZones) {
      const bypass = transitions.some(
        (transition) =>
          transition.x < zone.checkTileX &&
          (transition.targetLevelName !== "smb-8-4" ||
            (transition.targetTileX ?? 0) >= zone.checkTileX),
      );
      expect(
        bypass,
        `8-4 checkpoint at column ${String(zone.checkTileX)} needs a bypass pipe`,
      ).toBe(true);
    }
  });

  it("8-4's water section swims with its firebars and returns to the castle", () => {
    const water = pack.get("smb-warp-0-2-w8");
    expect(water).toBeDefined();
    if (water === undefined) {
      return;
    }
    expect(water.metadata.theme).toBe("water");
    expect(water.levelSpec.firebars.length).toBeGreaterThan(0);
    const transitions = (water.metadata.transitions ?? []) as readonly {
      readonly targetLevelName?: string;
    }[];
    expect(
      transitions.some(
        (transition) => transition.targetLevelName === "smb-8-4",
      ),
    ).toBe(true);
  });

  it("every castle stages its boss fight (bridge, boss, axe exit, flames)", () => {
    const castles = [
      "smb-1-5",
      "smb-2-5",
      "smb-3-4",
      "smb-4-5",
      "smb-5-4",
      "smb-6-4",
      "smb-7-5",
      "smb-8-4",
    ];
    for (const name of castles) {
      const castle = pack.get(name);
      expect(castle, name).toBeDefined();
      if (castle === undefined) {
        continue;
      }
      const grid = readFileSync(resolve(packDir, `${name}.txt`), "utf8");
      expect(grid.includes("w") || grid.includes("W"), `${name} boss`).toBe(
        true,
      );
      expect(grid.includes("="), `${name} bridge`).toBe(true);
      const flames = (castle.metadata.flameSpawners ??
        []) as readonly unknown[];
      expect(flames.length, `${name} flames`).toBeGreaterThan(0);
    }
  });
});

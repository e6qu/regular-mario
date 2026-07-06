import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeSyntheticSmbLevelRom } from "../../tests/support/synthetic-smb-rom";

// The decoder is an .mjs script (typed via scripts/decode-smb-level.d.mts);
// import it dynamically so the test runs against the same module the build uses.
const decoderModule = import("../../scripts/decode-smb-level.mjs");

const testRoot = resolve(".cache/user-levels/test-decode-smb-level");
const romPath = resolve(testRoot, "rom.nes");

describe("decode-smb-level", () => {
  beforeAll(async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(romPath, makeSyntheticSmbLevelRom());
  });
  afterAll(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("resolves world 1-1 to the Ground area via the ROM pointer tables", async () => {
    const { decodeLevel } = await decoderModule;
    const { area } = await decodeLevel(romPath, 0, 0);
    expect(area.areaTypeName).toBe("ground");
    expect(area.areaPointer).toBe(0x25);
    expect(area.index5).toBe(5);
  });

  it("renders objects and enemies at their canonical grid positions", async () => {
    const { decodeLevel, gridToText } = await decoderModule;
    const { grid } = await decodeLevel(romPath, 0, 0);
    // Object row 7 -> grid row 9; enemy row 11 -> grid row 12 (stands on floor).
    expect(grid[9]?.[5]).toBe("M"); // power-up ? block
    expect(grid[9]?.[8]).toBe("?"); // coin ? block
    expect(grid[12]?.[6]).toBe("g"); // Goomba on the floor
    expect(grid[13]?.[0]).toBe("#"); // ground row
    // Text form is a rectangular grid.
    const text = gridToText(grid).trimEnd().split("\n");
    expect(new Set(text.map((row) => row.length)).size).toBe(1);
  });

  it("decodes every world's level slots with stable names", async () => {
    const { decodeAllLevels } = await decoderModule;
    const levels = await decodeAllLevels(romPath);
    expect(levels.length).toBeGreaterThanOrEqual(1);
    expect(levels[0]?.name).toBe("smb-1-1");
    expect(levels[0]?.metadata.playerStart).toEqual({ x: 2, y: 12 });
  });
});

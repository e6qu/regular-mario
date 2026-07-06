import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runNodeScript } from "../../tests/support/script-test-support";
import { makeSyntheticSmbLevelRom } from "../../tests/support/synthetic-smb-rom";
import {
  validateMapSetDescriptor,
  type MapSetDescriptor,
} from "../engine/domain/content-sets";

const scriptPath = resolve("scripts/build-official-map-set.mjs");
const testRoot = resolve(".cache/user-levels/test-build-official-map-set");

type MapSet = MapSetDescriptor & {
  readonly levels: readonly {
    readonly name: string;
    readonly format: string;
    readonly source: { readonly kind: string; readonly url: string };
    readonly importMetadataSource: { readonly url: string };
  }[];
};

describe("build-official-map-set", () => {
  it("decodes the ROM into a self-contained multi-level map set", async () => {
    await rm(testRoot, { recursive: true, force: true });
    await mkdir(testRoot, { recursive: true });
    const romPath = resolve(testRoot, "rom.nes");
    const outDir = resolve(testRoot, "official-smb");
    await writeFile(romPath, makeSyntheticSmbLevelRom());

    const result = await runNodeScript(scriptPath, [
      "--rom",
      romPath,
      "--out-dir",
      outDir,
    ]);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    const descriptor = JSON.parse(
      await readFile(resolve(outDir, "map-set.json"), "utf8"),
    ) as MapSet;
    expect(descriptor.id).toBe("official-smb");
    expect(descriptor.levels[0]?.name).toBe("smb-1-1");
    expect(descriptor.levels[0]?.format).toBe("vglc-smb-multi-layer");
    expect(descriptor.levels[0]?.source.url).toBe("smb-1-1.txt");
    expect(descriptor.levels[0]?.importMetadataSource.url).toBe(
      "smb-1-1.metadata.json",
    );
    expect(validateMapSetDescriptor(descriptor).ok).toBe(true);

    // The level layout is emitted for self-contained serving.
    const level = await readFile(resolve(outDir, "smb-1-1.txt"), "utf8");
    expect(level).toContain("M"); // the decoded power-up block
    expect(level).toContain("g"); // the decoded Goomba
  });

  it("fails loudly when the ROM is missing", async () => {
    await rm(testRoot, { recursive: true, force: true });
    await mkdir(testRoot, { recursive: true });

    const result = await runNodeScript(scriptPath, [
      "--rom",
      resolve(testRoot, "absent.nes"),
      "--out-dir",
      resolve(testRoot, "out"),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

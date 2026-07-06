import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  makeCleanScriptTestRoot,
  runNodeScript,
} from "../../tests/support/script-test-support";

const scriptPath = resolve("scripts/content-sets.mjs");
const testBaseDirectory = ".cache/user-levels/test-content-sets";

type Roots = {
  readonly root: string;
  readonly assetsRoot: string;
  readonly mapsRoot: string;
};

async function makeRoots(suffix: string): Promise<Roots> {
  const root = await makeCleanScriptTestRoot(testBaseDirectory, suffix);
  const assetsRoot = resolve(root, "asset-sets");
  const mapsRoot = resolve(root, "map-sets");
  await mkdir(assetsRoot, { recursive: true });
  await mkdir(mapsRoot, { recursive: true });
  return { root, assetsRoot, mapsRoot };
}

function rootArgs(roots: Roots): string[] {
  return ["--assets-root", roots.assetsRoot, "--maps-root", roots.mapsRoot];
}

async function writeAssetSet(
  roots: Roots,
  id: string,
  descriptor: unknown,
): Promise<void> {
  const dir = resolve(roots.assetsRoot, id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    resolve(dir, "asset-set.json"),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );
}

async function writeMapSet(
  roots: Roots,
  id: string,
  descriptor: unknown,
): Promise<void> {
  const dir = resolve(roots.mapsRoot, id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    resolve(dir, "map-set.json"),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );
}

function romAssetSet(id: string, groundUrl: string): unknown {
  return {
    id,
    title: `Assets ${id}`,
    origin: "rom-extracted",
    tileSprites: {
      ground: {
        source: { kind: "url", url: groundUrl },
        frame: { x: 0, y: 0, width: 16, height: 16 },
      },
    },
  };
}

function vglcMapSet(id: string, levelName: string): unknown {
  return {
    id,
    title: `Maps ${id}`,
    levels: [
      {
        name: levelName,
        format: "vglc-smb-text",
        source: { kind: "url", url: `${levelName}.txt` },
      },
    ],
  };
}

describe("content-sets CLI", () => {
  it("scaffolds asset and map sets", async () => {
    const roots = await makeRoots("init");

    const initAsset = await runNodeScript(scriptPath, [
      "init-asset-set",
      "--id",
      "authored-skin",
      "--title",
      "Authored skin",
      ...rootArgs(roots),
    ]);
    expect(initAsset.exitCode).toBe(0);

    const initMap = await runNodeScript(scriptPath, [
      "init-map-set",
      "--id",
      "vglc-smb",
      "--title",
      "VGLC SMB",
      ...rootArgs(roots),
    ]);
    expect(initMap.exitCode).toBe(0);

    const assetDescriptor = JSON.parse(
      await readFile(
        resolve(roots.assetsRoot, "authored-skin", "asset-set.json"),
        "utf8",
      ),
    ) as { origin: string };
    expect(assetDescriptor.origin).toBe("authored");
  });

  it("lists sets with a validation summary", async () => {
    const roots = await makeRoots("list");
    await writeAssetSet(roots, "rom-smb", romAssetSet("rom-smb", "ground.png"));
    await writeMapSet(roots, "vglc-smb", vglcMapSet("vglc-smb", "mario-1-1"));

    const result = await runNodeScript(scriptPath, [
      "list",
      ...rootArgs(roots),
    ]);
    expect(result.exitCode).toBe(0);

    const listing = JSON.parse(result.stdout) as {
      assetSets: { id: string; errors: string[] }[];
      mapSets: { id: string; levelCount: number; errors: string[] }[];
    };
    expect(listing.assetSets[0]?.id).toBe("rom-smb");
    expect(listing.assetSets[0]?.errors).toEqual([]);
    expect(listing.mapSets[0]?.levelCount).toBe(1);
    expect(listing.mapSets[0]?.errors).toEqual([]);
  });

  it("writes a servable index for the dev-start dropdowns", async () => {
    const roots = await makeRoots("index");
    await writeAssetSet(roots, "rom-smb", romAssetSet("rom-smb", "ground.png"));
    await writeAssetSet(roots, "broken", { id: "broken", title: "Broken" });
    await writeMapSet(roots, "vglc-smb", vglcMapSet("vglc-smb", "mario-1-1"));

    const outPath = resolve(roots.root, "index.json");
    const result = await runNodeScript(scriptPath, [
      "index",
      "--out",
      outPath,
      ...rootArgs(roots),
    ]);
    expect(result.exitCode).toBe(0);

    const index = JSON.parse(await readFile(outPath, "utf8")) as {
      assetSets: { id: string; title: string; selectable: boolean }[];
      mapSets: { id: string; title: string; selectable: boolean }[];
    };
    const rom = index.assetSets.find((set) => set.id === "rom-smb");
    const broken = index.assetSets.find((set) => set.id === "broken");
    expect(rom?.selectable).toBe(true);
    expect(rom?.title).toBe("Assets rom-smb");
    expect(broken?.selectable).toBe(false);
    expect(index.mapSets[0]?.selectable).toBe(true);
  });

  it("bundles a pair with all referenced files into one servable dir", async () => {
    const roots = await makeRoots("bundle");
    await writeAssetSet(roots, "rom-smb", romAssetSet("rom-smb", "ground.png"));
    await writeMapSet(roots, "vglc-smb", vglcMapSet("vglc-smb", "mario-1-1"));
    // The referenced files must exist in their set dirs to be copied.
    await writeFile(resolve(roots.assetsRoot, "rom-smb", "ground.png"), "png");
    await writeFile(
      resolve(roots.mapsRoot, "vglc-smb", "mario-1-1.txt"),
      "level",
    );

    const outDir = resolve(roots.root, "bundle-out");
    const result = await runNodeScript(scriptPath, [
      "bundle",
      "--asset-set",
      "rom-smb",
      "--map-set",
      "vglc-smb",
      "--out-dir",
      outDir,
      ...rootArgs(roots),
    ]);
    expect(result.exitCode).toBe(0);

    // Manifest plus both referenced files land in the bundle dir.
    expect(await readFile(resolve(outDir, "ground.png"), "utf8")).toBe("png");
    expect(await readFile(resolve(outDir, "mario-1-1.txt"), "utf8")).toBe(
      "level",
    );
    const manifest = JSON.parse(
      await readFile(resolve(outDir, "remote-manifest.json"), "utf8"),
    ) as { levels: unknown[]; tileSprites: Record<string, unknown> };
    expect(manifest.levels).toHaveLength(1);
    expect(manifest.tileSprites.ground).toBeDefined();
  });

  it("composes any asset set with any map set into a runtime manifest", async () => {
    const roots = await makeRoots("compose");
    await writeAssetSet(
      roots,
      "rom-smb",
      romAssetSet("rom-smb", "rom/ground.png"),
    );
    await writeAssetSet(
      roots,
      "authored",
      romAssetSet("authored", "authored/ground.png"),
    );
    await writeMapSet(roots, "vglc-smb", vglcMapSet("vglc-smb", "mario-1-1"));

    const outRom = resolve(roots.root, "rom.json");
    const outAuthored = resolve(roots.root, "authored.json");

    const composeRom = await runNodeScript(scriptPath, [
      "compose",
      "--asset-set",
      "rom-smb",
      "--map-set",
      "vglc-smb",
      "--out",
      outRom,
      ...rootArgs(roots),
    ]);
    expect(composeRom.exitCode).toBe(0);

    const composeAuthored = await runNodeScript(scriptPath, [
      "compose",
      "--asset-set",
      "authored",
      "--map-set",
      "vglc-smb",
      "--out",
      outAuthored,
      ...rootArgs(roots),
    ]);
    expect(composeAuthored.exitCode).toBe(0);

    const romManifest = JSON.parse(await readFile(outRom, "utf8")) as {
      levels: { name: string }[];
      tileSprites: { ground: { source: { url: string } } };
    };
    const authoredManifest = JSON.parse(
      await readFile(outAuthored, "utf8"),
    ) as {
      levels: { name: string }[];
      tileSprites: { ground: { source: { url: string } } };
    };

    // Same map on both.
    expect(romManifest.levels).toEqual(authoredManifest.levels);
    // Different art.
    expect(romManifest.tileSprites.ground.source.url).toBe("rom/ground.png");
    expect(authoredManifest.tileSprites.ground.source.url).toBe(
      "authored/ground.png",
    );
  });

  it("fails loudly when composing a missing set", async () => {
    const roots = await makeRoots("missing");
    await writeMapSet(roots, "vglc-smb", vglcMapSet("vglc-smb", "mario-1-1"));

    const result = await runNodeScript(scriptPath, [
      "compose",
      "--asset-set",
      "does-not-exist",
      "--map-set",
      "vglc-smb",
      ...rootArgs(roots),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not found");
  });

  it("rejects composing an invalid map set with no levels", async () => {
    const roots = await makeRoots("invalid-map");
    await writeAssetSet(roots, "rom-smb", romAssetSet("rom-smb", "ground.png"));
    await writeMapSet(roots, "empty", {
      id: "empty",
      title: "Empty",
      levels: [],
    });

    const result = await runNodeScript(scriptPath, [
      "compose",
      "--asset-set",
      "rom-smb",
      "--map-set",
      "empty",
      ...rootArgs(roots),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("levels");
  });
});

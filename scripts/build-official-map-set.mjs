#!/usr/bin/env node
// Producer for the official SMB map set (Decision 0019/0020). Decodes every
// area the ROM ships — straight from the game's own object/enemy streams (see
// scripts/decode-smb-level.mjs and docs/smb-level-format.md) — into the
// multi-layer level format the engine imports, and writes a map-set descriptor
// listing every level. Level layouts are derived numeric data, kept in the
// ignored cache; no ROM bytes, graphics, or audio are emitted or committed.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";
import { decodeAllLevels, gridToText } from "./decode-smb-level.mjs";

const defaultRomPath = resolve(userLevelCacheRoot, "smb/rom.nes");
const defaultOutDir = resolve(userLevelCacheRoot, "map-sets/official-smb");
const levelFormat = "vglc-smb-multi-layer";

function printUsage() {
  console.log(`Usage:
  pnpm run build:official-map-set -- [options]

Options:
  --rom <path>      SMB ROM (default ${defaultRomPath}).
  --out-dir <path>  Map-set output directory under .cache/user-levels
                    (default ${defaultOutDir}).

Decodes every SMB area from the ROM into the multi-layer level format and
writes the official-smb map set. Provide your own ROM at the default path
(pnpm run acquire:smb). All outputs stay in the ignored cache.`);
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const romPath = resolve(readOption("--rom") ?? defaultRomPath);
  const outDir = assertUserLevelCachePath(
    readOption("--out-dir") ?? defaultOutDir,
    "--out-dir",
  );
  await mkdir(outDir, { recursive: true });

  const levels = await decodeAllLevels(romPath);
  const descriptorLevels = [];
  for (const level of levels) {
    const levelFileName = `${level.name}.txt`;
    const metadataFileName = `${level.name}.metadata.json`;
    await writeFile(resolve(outDir, levelFileName), gridToText(level.grid));
    await writeFile(
      resolve(outDir, metadataFileName),
      `${JSON.stringify(level.metadata, null, 2)}\n`,
    );
    descriptorLevels.push({
      name: level.name,
      format: levelFormat,
      source: { kind: "url", url: levelFileName },
      importMetadataSource: { kind: "url", url: metadataFileName },
    });
  }

  // Present levels in the original world-then-level order (1-1, 1-2, … 8-4),
  // with pipe-reached sub-areas (smb-warp-*) grouped after the main levels
  // rather than interleaved among them.
  const orderKey = (name) => {
    const isWarp = name.startsWith("smb-warp-");
    const match = /(\d+)-(\d+)$/.exec(name);
    return [
      isWarp ? 1 : 0,
      match ? Number(match[1]) : 0,
      match ? Number(match[2]) : 0,
    ];
  };
  descriptorLevels.sort((a, b) => {
    const [aw, ax, ay] = orderKey(a.name);
    const [bw, bx, by] = orderKey(b.name);
    return aw - bw || ax - bx || ay - by;
  });

  const descriptor = {
    id: "official-smb",
    title: "Super Mario Bros (all levels, ROM-decoded)",
    levels: descriptorLevels,
  };
  await writeFile(
    resolve(outDir, "map-set.json"),
    `${JSON.stringify(descriptor, null, 2)}\n`,
  );

  console.log(
    JSON.stringify({ outDir, levelCount: descriptorLevels.length }, null, 2),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

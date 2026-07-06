#!/usr/bin/env node
// Acquire the local-only SMB source inputs (Decision 0018):
// - VGLC level corpus (MIT licensed): auto-cloned into the ignored cache.
// - SMB ROM: always user-supplied (local path or user-configured URL). This
//   script never embeds ROM download locations and writes only into ignored
//   .cache/user-levels paths.

import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { assertSmbRomStructure } from "./smb-rom-format.mjs";
import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const execFileAsync = promisify(execFile);

const vglcRepositoryUrl = "https://github.com/TheVGLC/TheVGLC.git";
const defaultVglcRoot = resolve(userLevelCacheRoot, "vglc");
const vglcMarkerRelativePath = "Super Mario Bros/Processed/mario-1-1.txt";
const defaultRomCachePath = resolve(userLevelCacheRoot, "smb/rom.nes");
const defaultReportPath = resolve(
  userLevelCacheRoot,
  "smb/acquire-report.json",
);
const romEnvironmentVariableName = "SMB_ROM";

const missingRomInstructions = `No SMB ROM source is configured. The repository never ships or hardcodes ROM
sources; you must supply your own legally obtained copy. Provide it one of
these ways:

  1. Local file:   pnpm run acquire:smb -- --rom /path/to/your/smb.nes
  2. Your own URL: pnpm run acquire:smb -- --rom https://your-own-host/smb.nes
  3. Environment:  SMB_ROM=/path/to/your/smb.nes pnpm run acquire:smb
  4. Pre-placed:   copy it to ${defaultRomCachePath}

The ROM is copied only into ignored .cache/user-levels storage and is never
committed.`;

function printUsage() {
  console.log(`Usage:
  pnpm run acquire:smb -- [--rom <path-or-url>] [options]

Options:
  --rom <path-or-url>       User-supplied SMB ROM file path or URL. Also read
                            from the ${romEnvironmentVariableName} environment variable.
  --rom-cache-path <path>   Cache destination (default ${defaultRomCachePath}).
  --expected-sha256 <hex>   Fail unless the ROM matches this SHA-256.
  --vglc-root <path>        VGLC clone location (default ${defaultVglcRoot}).
  --skip-vglc               Do not check or clone the VGLC corpus.
  --report <path>           Report JSON path (default ${defaultReportPath}).

Ensures the MIT-licensed VGLC level corpus is present (cloning it if missing)
and validates + caches the user-supplied SMB ROM (iNES structure, exact size,
SHA-256). All outputs stay under ignored .cache/user-levels.`);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureVglcCorpus(vglcRoot) {
  const markerPath = resolve(vglcRoot, vglcMarkerRelativePath);

  if (await fileExists(markerPath)) {
    return { status: "present", root: vglcRoot };
  }

  if (await fileExists(vglcRoot)) {
    throw new Error(
      `VGLC root ${vglcRoot} exists but is missing "${vglcMarkerRelativePath}"; remove the directory and rerun to clone it cleanly.`,
    );
  }

  console.log(`Cloning VGLC corpus into ${vglcRoot} ...`);
  await execFileAsync("git", [
    "clone",
    "--depth",
    "1",
    vglcRepositoryUrl,
    vglcRoot,
  ]);

  if (!(await fileExists(markerPath))) {
    throw new Error(
      `VGLC clone completed but "${vglcMarkerRelativePath}" is still missing under ${vglcRoot}.`,
    );
  }

  return { status: "cloned", root: vglcRoot };
}

function isUrlSource(value) {
  return (
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("data:")
  );
}

async function readRomBytesFromSource(romSource) {
  if (isUrlSource(romSource)) {
    const response = await globalThis.fetch(romSource);

    if (!response.ok) {
      throw new Error(
        `ROM download failed with HTTP status ${response.status}.`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  return readFile(resolve(romSource));
}

async function acquireRom({ romSource, romCachePath, expectedSha256 }) {
  let romBytes;
  let sourceKind;

  if (romSource !== undefined) {
    sourceKind = isUrlSource(romSource) ? "url" : "path";
    romBytes = await readRomBytesFromSource(romSource);
  } else if (await fileExists(romCachePath)) {
    sourceKind = "cache";
    romBytes = await readFile(romCachePath);
  } else {
    throw new Error(missingRomInstructions);
  }

  assertSmbRomStructure(romBytes);

  const sha256 = createHash("sha256").update(romBytes).digest("hex");

  if (expectedSha256 !== undefined && sha256 !== expectedSha256.toLowerCase()) {
    throw new Error(
      `ROM SHA-256 ${sha256} does not match the expected checksum ${expectedSha256.toLowerCase()}; this is a different ROM revision or a corrupted file.`,
    );
  }

  if (sourceKind !== "cache") {
    await mkdir(dirname(romCachePath), { recursive: true });

    if (sourceKind === "url") {
      await writeFile(romCachePath, romBytes);
    } else {
      await copyFile(resolve(romSource), romCachePath);
    }
  }

  return {
    sourceKind,
    cachePath: romCachePath,
    byteLength: romBytes.length,
    sha256,
    checksumVerified: expectedSha256 !== undefined,
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const skipVglc = process.argv.includes("--skip-vglc");
  const vglcRoot = resolve(readOption("--vglc-root") ?? defaultVglcRoot);
  const romSource =
    readOption("--rom") ?? process.env[romEnvironmentVariableName];
  const romCachePath = assertUserLevelCachePath(
    readOption("--rom-cache-path") ?? defaultRomCachePath,
    "--rom-cache-path",
  );
  const reportPath = assertUserLevelCachePath(
    readOption("--report") ?? defaultReportPath,
    "--report",
  );

  const vglc = skipVglc
    ? { status: "skipped" }
    : await ensureVglcCorpus(vglcRoot);
  const rom = await acquireRom({
    romSource,
    romCachePath,
    expectedSha256: readOption("--expected-sha256"),
  });

  const report = { vglc, rom };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote acquire report to ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

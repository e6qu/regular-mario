#!/usr/bin/env node
// Pixel-frame verification (Decision 0018, Milestone 8 phase B): compare our
// engine's captured checkpoint frames against the emulator reference frames,
// pixel-exactly at 256x240. The milestone target is zero differing pixels per
// checkpoint. Both frame sets live in the ignored cache; this script reads them
// and emits a report but never commits image data.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { decodeRgbaPng } from "./png-codec.mjs";
import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const nesFrameWidth = 256;
const nesFrameHeight = 240;
const defaultReferenceDirectory = resolve(
  userLevelCacheRoot,
  "smb-reference-frames",
);
const defaultActualDirectory = resolve(userLevelCacheRoot, "smb-engine-frames");
const defaultReportPath = resolve(
  userLevelCacheRoot,
  "smb-reference-frames/verify-report.json",
);

// The checkpoints captured by capture:smb-frames. Verification is meaningful
// only for the frames both sides produce.
const checkpointNames = [
  "01-start-card",
  "02-level-start",
  "03-first-run",
  "04-question-blocks",
  "05-first-pipe",
  "06-pipe-gap",
];

function printUsage() {
  console.log(`Usage:
  pnpm run verify:smb-frames -- [options]

Options:
  --reference-dir <path>  Emulator reference frames
                          (default ${defaultReferenceDirectory}).
  --actual-dir <path>     Engine-captured frames
                          (default ${defaultActualDirectory}).
  --report <path>         Report JSON output (default alongside references).

Compares each checkpoint PNG pixel-exactly at ${nesFrameWidth}x${nesFrameHeight}.
Exits non-zero if any checkpoint differs, is missing, or has the wrong size.
Reference frames come from capture:smb-frames; both sets stay in the ignored
cache and are never committed.`);
}

async function readFrame(directory, name) {
  const path = resolve(directory, `${name}.png`);
  let bytes;

  try {
    bytes = await readFile(path);
  } catch {
    return { name, status: "missing", path };
  }

  const image = decodeRgbaPng(bytes);

  if (image.width !== nesFrameWidth || image.height !== nesFrameHeight) {
    return {
      name,
      status: "wrong-size",
      path,
      width: image.width,
      height: image.height,
    };
  }

  return { name, status: "ok", image };
}

function comparePixels(referencePixels, actualPixels) {
  let differingPixels = 0;
  let maxChannelDelta = 0;

  for (let offset = 0; offset < referencePixels.length; offset += 4) {
    let pixelDiffers = false;

    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(
        referencePixels[offset + channel] - actualPixels[offset + channel],
      );
      if (delta > 0) {
        pixelDiffers = true;
      }
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }

    if (pixelDiffers) {
      differingPixels += 1;
    }
  }

  return { differingPixels, maxChannelDelta };
}

async function verifyCheckpoint(name, referenceDirectory, actualDirectory) {
  const reference = await readFrame(referenceDirectory, name);

  if (reference.status !== "ok") {
    return {
      name,
      pass: false,
      reason: `reference ${reference.status}`,
      side: "reference",
    };
  }

  const actual = await readFrame(actualDirectory, name);

  if (actual.status !== "ok") {
    return {
      name,
      pass: false,
      reason: `actual ${actual.status}`,
      side: "actual",
    };
  }

  const totalPixels = nesFrameWidth * nesFrameHeight;
  const { differingPixels, maxChannelDelta } = comparePixels(
    reference.image.pixels,
    actual.image.pixels,
  );

  return {
    name,
    pass: differingPixels === 0,
    totalPixels,
    differingPixels,
    differingRatio: differingPixels / totalPixels,
    maxChannelDelta,
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const referenceDirectory = assertUserLevelCachePath(
    readOption("--reference-dir") ?? defaultReferenceDirectory,
    "--reference-dir",
  );
  const actualDirectory = assertUserLevelCachePath(
    readOption("--actual-dir") ?? defaultActualDirectory,
    "--actual-dir",
  );
  const reportPath = assertUserLevelCachePath(
    readOption("--report") ?? defaultReportPath,
    "--report",
  );

  const checkpoints = [];
  for (const name of checkpointNames) {
    checkpoints.push(
      await verifyCheckpoint(name, referenceDirectory, actualDirectory),
    );
  }

  const passed = checkpoints.filter((checkpoint) => checkpoint.pass).length;
  const report = {
    referenceDirectory,
    actualDirectory,
    checkpointCount: checkpoints.length,
    passedCount: passed,
    allPixelIdentical: passed === checkpoints.length,
    checkpoints,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (!report.allPixelIdentical) {
    console.error(
      `verify:smb-frames: ${passed}/${checkpoints.length} checkpoints pixel-identical. See ${reportPath}.`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

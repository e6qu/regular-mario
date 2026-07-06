#!/usr/bin/env node
// Capture reference key frames by running the user-supplied SMB ROM through a
// headless NES emulator (jsnes) into the ignored cache (Decision 0018). These
// frames are the independent ground truth for pixel-frame verification. The ROM
// and every captured frame stay under .cache/user-levels and are never
// committed.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Controller } from "jsnes";

import { loadRomBinary, makeHeadlessNes } from "./smb-emulator.mjs";

import { encodeRgbaPng } from "./png-codec.mjs";
import {
  resolveCacheOutputDirectory,
  resolveRomPath,
} from "./smb-script-args.mjs";
import { readOption, userLevelCacheRoot } from "./user-level-cache-policy.mjs";

const nesFrameWidth = 256;
const nesFrameHeight = 240;
const defaultRomPath = resolve(userLevelCacheRoot, "smb/rom.nes");
const defaultOutputDirectory = resolve(
  userLevelCacheRoot,
  "smb-reference-frames",
);

// Player 1 controller button ids (jsnes.Controller).
const button = {
  START: Controller.BUTTON_START,
  RIGHT: Controller.BUTTON_RIGHT,
  A: Controller.BUTTON_A,
  B: Controller.BUTTON_B,
};

function printUsage() {
  console.log(`Usage:
  pnpm run capture:smb-frames -- [options]

Options:
  --rom <path>        ROM path (default ${defaultRomPath}).
  --out-dir <path>    Output directory under .cache/user-levels
                      (default ${defaultOutputDirectory}).
  --scan              Discovery mode: dump frames at a fixed stride so title
                      and gameplay start can be located.
  --scan-stride <n>   Frames between scan captures (default 20).
  --scan-count <n>    Number of scan captures (default 24).

Runs the ROM headlessly and writes 256x240 PNGs. Without --scan, captures the
named checkpoints defined in this script. All outputs stay in the ignored
cache and are never committed.`);
}

function framebufferToRgba(framebuffer) {
  const pixels = new Uint8Array(nesFrameWidth * nesFrameHeight * 4);

  // jsnes packs each pixel as 0xBBGGRR (red in the low byte, blue in the high
  // byte), so read red from the low byte and blue from the high byte.
  for (let i = 0; i < framebuffer.length; i += 1) {
    const packed = framebuffer[i];
    const offset = i * 4;
    pixels[offset] = packed & 0xff;
    pixels[offset + 1] = (packed >> 8) & 0xff;
    pixels[offset + 2] = (packed >> 16) & 0xff;
    pixels[offset + 3] = 0xff;
  }

  return pixels;
}

async function writeFrame(outputDirectory, name, framebuffer, outputs) {
  const outputPath = resolve(outputDirectory, `${name}.png`);
  await writeFile(
    outputPath,
    encodeRgbaPng({
      width: nesFrameWidth,
      height: nesFrameHeight,
      pixels: framebufferToRgba(framebuffer),
    }),
  );
  outputs.push(`${name}.png`);
}

function pressForOneFrame(nes, buttonId) {
  nes.buttonDown(1, buttonId);
  nes.frame();
  nes.buttonUp(1, buttonId);
}

const skyProbeRow = 48;

// Gameplay frames light up the sky band near the top of the screen; the black
// title and "WORLD 1-1" card leave that band black. Used to detect the first
// playable frame without hardcoding a fragile frame number.
function skyBandIsLit(framebuffer) {
  for (let x = 0; x < nesFrameWidth; x += 8) {
    if ((framebuffer[skyProbeRow * nesFrameWidth + x] & 0xffffff) !== 0) {
      return true;
    }
  }
  return false;
}

async function advanceToGameplayStart({
  nes,
  state,
  outputDirectory,
  outputs,
}) {
  const startPressFrame = 40;
  const cardCaptureFrame = 75;
  const settleFrames = 32;
  const maxBootFrames = 600;

  for (let frame = 0; frame < maxBootFrames; frame += 1) {
    if (frame === startPressFrame) {
      pressForOneFrame(nes, button.START);
    } else {
      nes.frame();
    }

    if (frame === cardCaptureFrame) {
      await writeFrame(
        outputDirectory,
        "01-start-card",
        state.framebuffer,
        outputs,
      );
    }

    if (frame > cardCaptureFrame && skyBandIsLit(state.framebuffer)) {
      // Sky lights up during the fade-in before the level and HUD finish
      // painting; settle a few frames so the first captured frame is the fully
      // rendered spawn frame.
      for (let settle = 0; settle < settleFrames; settle += 1) {
        nes.frame();
      }
      return;
    }
  }

  throw new Error(
    "Could not detect the first gameplay frame within the boot window.",
  );
}

// Named checkpoints along a deterministic right-running route. Offsets are
// frames after the first playable frame; a jump is tapped periodically so the
// runner clears pipes instead of stalling against them.
const checkpointPlan = [
  { name: "02-level-start", framesAfterStart: 0 },
  { name: "03-first-run", framesAfterStart: 90 },
  { name: "04-question-blocks", framesAfterStart: 190 },
  { name: "05-first-pipe", framesAfterStart: 320 },
  { name: "06-pipe-gap", framesAfterStart: 470 },
];

async function runCheckpoints({ nes, state, outputDirectory, outputs }) {
  await advanceToGameplayStart({ nes, state, outputDirectory, outputs });

  const totalFrames =
    checkpointPlan[checkpointPlan.length - 1].framesAfterStart;
  const captureByFrame = new Map(
    checkpointPlan.map((checkpoint) => [
      checkpoint.framesAfterStart,
      checkpoint.name,
    ]),
  );

  for (let frame = 0; frame <= totalFrames; frame += 1) {
    const checkpointName = captureByFrame.get(frame);
    if (checkpointName !== undefined) {
      await writeFrame(
        outputDirectory,
        checkpointName,
        state.framebuffer,
        outputs,
      );
    }

    nes.buttonDown(1, button.RIGHT);
    if (frame % 48 < 12) {
      nes.buttonDown(1, button.A);
    }
    nes.frame();
    nes.buttonUp(1, button.A);
  }

  nes.buttonUp(1, button.RIGHT);
}

async function runScan({
  nes,
  state,
  outputDirectory,
  stride,
  count,
  outputs,
}) {
  let frameIndex = 0;

  for (let capture = 0; capture < count; capture += 1) {
    for (let step = 0; step < stride; step += 1) {
      // Tap START midway through the first scan window so the title screen
      // advances into gameplay during discovery.
      if (frameIndex === 40) {
        pressForOneFrame(nes, button.START);
      } else {
        nes.frame();
      }
      frameIndex += 1;
    }

    await writeFrame(
      outputDirectory,
      `scan-${String(frameIndex).padStart(4, "0")}`,
      state.framebuffer,
      outputs,
    );
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const romPath = resolveRomPath(defaultRomPath);
  const outputDirectory = resolveCacheOutputDirectory(defaultOutputDirectory);
  await mkdir(outputDirectory, { recursive: true });

  const romBytes = await readFile(romPath);
  const { nes, state } = makeHeadlessNes();
  loadRomBinary(nes, romBytes);

  const outputs = [];

  if (process.argv.includes("--scan")) {
    await runScan({
      nes,
      state,
      outputDirectory,
      stride: Number(readOption("--scan-stride") ?? "20"),
      count: Number(readOption("--scan-count") ?? "24"),
      outputs,
    });
  } else {
    await runCheckpoints({ nes, state, outputDirectory, outputs });
  }

  console.log(JSON.stringify({ romPath, outputDirectory, outputs }, null, 2));
  console.log(
    `Captured ${outputs.length} reference frames into ${outputDirectory} (ignored cache only).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

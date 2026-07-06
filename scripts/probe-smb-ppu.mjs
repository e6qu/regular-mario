#!/usr/bin/env node
// Ground-truth PPU probe: boots the user-supplied SMB ROM headlessly (jsnes),
// advances to a chosen moment, and prints the real palette RAM and sprite (OAM)
// table so sprite extraction uses the emulator's actual tile indices and colors
// instead of hand-authored guesses. Read-only: prints to stdout, writes nothing.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Controller } from "jsnes";

import { loadRomBinary, makeHeadlessNes } from "./smb-emulator.mjs";
import { readOption, userLevelCacheRoot } from "./user-level-cache-policy.mjs";

const nesFrameWidth = 256;
const defaultRomPath = resolve(userLevelCacheRoot, "smb/rom.nes");
const skyProbeRow = 48;

function skyBandIsLit(framebuffer) {
  if (framebuffer === null) {
    return false;
  }
  for (let x = 0; x < nesFrameWidth; x += 8) {
    if ((framebuffer[skyProbeRow * nesFrameWidth + x] & 0xffffff) !== 0) {
      return true;
    }
  }
  return false;
}

function advanceToGameplayStart(nes, state, extraFrames) {
  const startPressFrame = 40;
  const settleFrames = 32;
  const maxBootFrames = 600;

  for (let frame = 0; frame < maxBootFrames; frame += 1) {
    if (frame === startPressFrame) {
      nes.buttonDown(1, Controller.BUTTON_START);
      nes.frame();
      nes.buttonUp(1, Controller.BUTTON_START);
    } else {
      nes.frame();
    }

    if (frame > 75 && skyBandIsLit(state.framebuffer)) {
      for (let settle = 0; settle < settleFrames + extraFrames; settle += 1) {
        nes.frame();
      }
      return;
    }
  }
  throw new Error("Could not reach gameplay start.");
}

function toRgb(packed) {
  return [packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff];
}

function dumpPalettes(label, palette) {
  const groups = [];
  for (let p = 0; p < 4; p += 1) {
    const colors = [];
    for (let c = 0; c < 4; c += 1) {
      colors.push(toRgb(palette[p * 4 + c]));
    }
    groups.push(colors);
  }
  console.log(`${label}:`);
  groups.forEach((colors, index) => {
    console.log(`  palette ${index}: ${JSON.stringify(colors)}`);
  });
}

function dumpOam(nes) {
  const oam = nes.ppu.spriteMem;
  const spriteSize16 = nes.ppu.f_spriteSize === 1;
  console.log(`sprite size: ${spriteSize16 ? "8x16" : "8x8"}`);
  console.log("OAM (visible sprites) [idx: x,y tile attr(pal,flipH,flipV)]:");
  for (let i = 0; i < 64; i += 1) {
    const y = oam[i * 4 + 0];
    const tile = oam[i * 4 + 1];
    const attr = oam[i * 4 + 2];
    const x = oam[i * 4 + 3];
    if (y >= 0xef) {
      continue; // off-screen / unused
    }
    const palette = attr & 0x03;
    const flipH = (attr & 0x40) !== 0;
    const flipV = (attr & 0x80) !== 0;
    console.log(
      `  ${i}: x=${x} y=${y} tile=${tile} pal=${palette} flipH=${flipH} flipV=${flipV}`,
    );
  }
}

async function main() {
  const romPath = readOption("--rom") ?? defaultRomPath;
  const extraFrames = Number(readOption("--extra-frames") ?? 0);
  const romBytes = await readFile(romPath);
  const { nes, state } = makeHeadlessNes();
  loadRomBinary(nes, romBytes);
  advanceToGameplayStart(nes, state, extraFrames);

  console.log(`# PPU ground truth at gameplay start + ${extraFrames} frames`);
  dumpPalettes("BG palettes (imgPalette)", nes.ppu.imgPalette);
  dumpPalettes("Sprite palettes (sprPalette)", nes.ppu.sprPalette);
  dumpOam(nes);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

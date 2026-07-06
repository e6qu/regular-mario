// Shared headless jsnes setup for the SMB tooling (frame capture, PPU probe).
// Keeps the emulator wiring in one place so scripts don't duplicate it.

import { NES } from "jsnes";

// Returns { nes, state } where state.framebuffer holds the latest frame (jsnes
// packs each pixel as 0xBBGGRR).
export function makeHeadlessNes() {
  const state = { framebuffer: null };
  const nes = new NES({
    onFrame: (framebuffer) => {
      state.framebuffer = framebuffer;
    },
    onAudioSample: () => {},
  });
  return { nes, state };
}

// jsnes expects the ROM as a binary (latin1) string.
export function loadRomBinary(nes, romBytes) {
  nes.loadROM(romBytes.toString("binary"));
}

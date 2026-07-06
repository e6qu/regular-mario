import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runNodeScriptInCleanDir } from "../../tests/support/script-test-support";

const scriptPath = resolve("scripts/build-sound-packs.mjs");
const outDir = resolve(".cache/user-levels/test-sound-packs/shabby");

function readRiffHeader(bytes: Buffer): {
  readonly riff: string;
  readonly wave: string;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly dataByteLength: number;
} {
  return {
    riff: bytes.toString("ascii", 0, 4),
    wave: bytes.toString("ascii", 8, 12),
    sampleRate: bytes.readUInt32LE(24),
    bitsPerSample: bytes.readUInt16LE(34),
    dataByteLength: bytes.readUInt32LE(40),
  };
}

describe("build-sound-packs", () => {
  it("writes an authored ouch sound pack with mappable sound keys", async () => {
    const result = await runNodeScriptInCleanDir(scriptPath, outDir, [
      "--out-dir",
      outDir,
    ]);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    const manifest = JSON.parse(
      await readFile(resolve(outDir, "manifest.json"), "utf8"),
    ) as { readonly sounds: Record<string, unknown> };

    // The manifest keys must match SoundEvent values used by the audio engine.
    expect(Object.keys(manifest.sounds).sort()).toEqual([
      "enemy-shot",
      "head-bonk",
      "stomp",
    ]);
  });

  it("produces valid, non-empty 16-bit PCM WAV files", async () => {
    await runNodeScriptInCleanDir(scriptPath, outDir, ["--out-dir", outDir]);

    for (const fileName of ["player-ouch.wav", "enemy-ouch.wav"]) {
      const bytes = await readFile(resolve(outDir, fileName));
      const header = readRiffHeader(bytes);
      expect(header.riff).toBe("RIFF");
      expect(header.wave).toBe("WAVE");
      expect(header.bitsPerSample).toBe(16);
      expect(header.sampleRate).toBeGreaterThan(0);
      // Audible content, not a silent/empty buffer.
      expect(header.dataByteLength).toBeGreaterThan(1000);
    }
  });
});

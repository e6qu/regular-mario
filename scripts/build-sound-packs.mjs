#!/usr/bin/env node
// Builds authored "shabby" sound packs: original formant-synthesized "ouch"
// voices — a deeper one for the player head-bonk and a squeakier one for the
// enemies that get jumped on / shot. All audio is synthesized from scratch here
// (no sampled/recorded/extracted audio) and written to the ignored cache.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";
import { encodeWavPcm16 } from "./wav-codec.mjs";

const sampleRate = 22050;

// One resonant bandpass (RBJ biquad) evaluated sample-by-sample so the formant
// centre frequency can glide over the sound — that glide is what turns a static
// buzz into a vowel-like "ow".
function makeBandpass() {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (input, centreHz, q) => {
    const w0 = (2 * Math.PI * centreHz) / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cosW0 = Math.cos(w0);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * cosW0) / a0;
    const a2 = (1 - alpha) / a0;
    const output = b0 * input + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = input;
    y2 = y1;
    y1 = output;
    return output;
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Synthesize a short "ouch"-like vocalization. A sawtooth glottal buzz at a
// gliding pitch is shaped by three gliding formants (an "ah" -> "oo" diphthong),
// then an amplitude envelope with a quick attack and a rounded decay.
function synthesizeOuch({
  durationSeconds,
  startPitchHz,
  endPitchHz,
  startFormants,
  endFormants,
}) {
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const samples = new Float32Array(sampleCount);
  const f1 = makeBandpass();
  const f2 = makeBandpass();
  const f3 = makeBandpass();
  let phase = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleCount;
    const pitch = lerp(startPitchHz, endPitchHz, t);
    phase += pitch / sampleRate;
    phase -= Math.floor(phase);
    // Sawtooth glottal source (harmonically rich) with a touch of vibrato.
    const vibrato = 1 + 0.015 * Math.sin(2 * Math.PI * 6 * t * durationSeconds);
    const source =
      (2 * (phase * vibrato - Math.floor(phase * vibrato)) - 1) * 0.6;

    const formant1 = f1(source, lerp(startFormants[0], endFormants[0], t), 12);
    const formant2 = f2(source, lerp(startFormants[1], endFormants[1], t), 16);
    const formant3 = f3(source, lerp(startFormants[2], endFormants[2], t), 20);
    const voiced = formant1 * 1 + formant2 * 0.6 + formant3 * 0.3;

    // Envelope: fast attack (~12ms), sustain, rounded exponential release.
    const attack = Math.min(1, t / 0.06);
    const release = Math.min(1, (1 - t) / 0.5);
    const envelope = attack * Math.pow(release, 0.6);
    samples[i] = voiced * envelope;
  }

  // Normalize to a comfortable peak.
  let peak = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
  }
  const gain = peak > 0 ? 0.85 / peak : 1;
  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] *= gain;
  }
  return samples;
}

function soundEntry(fileName) {
  return { source: { kind: "url", url: fileName } };
}

async function main() {
  const outDir = assertUserLevelCachePath(
    readOption("--out-dir") ??
      resolve(userLevelCacheRoot, "sound-packs", "shabby"),
    "--out-dir",
  );
  await mkdir(outDir, { recursive: true });

  // Deep, weary player "ouch": low pitch that sags, dark formants.
  const playerOuch = synthesizeOuch({
    durationSeconds: 0.42,
    startPitchHz: 138,
    endPitchHz: 96,
    startFormants: [720, 1080, 2400],
    endFormants: [430, 900, 2300],
  });
  // Squeaky enemy "ouch": high pitch that spikes then drops, bright formants.
  const enemyOuch = synthesizeOuch({
    durationSeconds: 0.24,
    startPitchHz: 430,
    endPitchHz: 300,
    startFormants: [900, 1700, 2900],
    endFormants: [640, 1300, 2800],
  });

  await writeFile(
    resolve(outDir, "player-ouch.wav"),
    encodeWavPcm16(sampleRate, playerOuch),
  );
  await writeFile(
    resolve(outDir, "enemy-ouch.wav"),
    encodeWavPcm16(sampleRate, enemyOuch),
  );

  const manifest = {
    version: "1",
    sounds: {
      // Player bonks head -> deep ouch.
      "head-bonk": soundEntry("player-ouch.wav"),
      // Enemy jumped on or shot -> squeaky ouch.
      stomp: soundEntry("enemy-ouch.wav"),
      "enemy-shot": soundEntry("enemy-ouch.wav"),
    },
  };
  await writeFile(
    resolve(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      { outDir, sounds: Object.keys(manifest.sounds), sampleRate },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

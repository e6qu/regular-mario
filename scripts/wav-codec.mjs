// Minimal WAV (RIFF/PCM 16-bit mono) encoder for authored sound effects.
// No external dependencies; used by build-sound-packs.mjs.

import { Buffer } from "node:buffer";

// samples: Float32-ish array in [-1, 1]. Returns a Buffer holding a complete
// mono 16-bit PCM WAV file at the given sample rate.
export function encodeWavPcm16(sampleRate, samples) {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error(
      `WAV sample rate must be a positive integer: ${sampleRate}`,
    );
  }

  const bytesPerSample = 2;
  const dataByteLength = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataByteLength);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk length
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataByteLength, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }

  return buffer;
}

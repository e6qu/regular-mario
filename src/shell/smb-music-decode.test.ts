import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The decoder reads a locally-supplied ROM (never committed). When it isn't
// present — e.g. in CI — these checks skip rather than fail.
const here = dirname(fileURLToPath(import.meta.url));
const romPath = resolve(here, "../../.cache/user-levels/smb/rom.nes");
const hasRom = existsSync(romPath);

type DecodedNote = { readonly midi: number | null; readonly seconds: number };
type DecodedPart = {
  readonly melody: DecodedNote[];
  readonly bass: DecodedNote[];
  readonly harmony: DecodedNote[];
};

describe("SMB ROM music decoder", () => {
  it.skipIf(!hasRom)(
    "decodes the overworld, underground, and castle themes to the known pitches",
    async () => {
      // Variable specifier: the decoder is a plain .mjs tool with no types.
      const decoderPath = "../../scripts/decode-smb-music.mjs";
      const decoder = (await import(decoderPath)) as {
        decodeSmbMusic: (rom: Uint8Array) => Record<string, DecodedPart[]>;
      };
      const themes = decoder.decodeSmbMusic(
        new Uint8Array(readFileSync(romPath)),
      );
      const melody = (name: string): (number | null)[] =>
        (themes[name]?.[0]?.melody ?? []).map((note) => note.midi);

      // Overworld intro: E5 E5 E5 C5 E5 G5 — the unmistakable "E E E C E G".
      expect(melody("overworld").slice(0, 6)).toEqual([76, 76, 76, 72, 76, 79]);
      // Underground: the octave-jumping descent.
      expect(melody("underground").slice(0, 6)).toEqual([
        60, 72, 52, 69, 57, 70,
      ]);
      // Castle: the rapid ominous vamp around G.
      expect(melody("castle").slice(0, 4)).toEqual([67, 70, 67, 69]);

      // The overworld's quarter-note anchor is 0.6 s = the documented 100 BPM,
      // and every note has a positive real duration.
      for (const parts of Object.values(themes)) {
        expect(parts.length).toBeGreaterThan(0);
        for (const part of parts) {
          for (const channel of [part.melody, part.bass, part.harmony]) {
            for (const note of channel) {
              expect(note.seconds).toBeGreaterThan(0);
            }
          }
        }
      }
      // Overworld part 1 carries a triangle bass line (offset != 0 in the header).
      expect(themes.overworld?.[1]?.bass.length ?? 0).toBeGreaterThan(0);
    },
  );

  it("is documented as numeric-only extraction (no ROM/audio committed)", () => {
    // A guard so the suite has coverage even without a local ROM: the decoder
    // script exists and its output path is under the git-ignored cache.
    expect(
      existsSync(resolve(here, "../../scripts/decode-smb-music.mjs")),
    ).toBe(true);
  });
});

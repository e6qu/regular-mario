// A song for each theme of a talk (talk-themes.ts), composed here from scratch in the
// spirit of a classic platformer's level types (a bouncy overworld, a sparse cave bass,
// an eerie haunted house, a sky waltz, a tense castle) — not derived from any existing
// tune. Each voice is written as space-separated steps: a note (C4, F#5, Bb3), "." for
// a rest or "-" to hold the note before; "|" marks a bar and is ignored. Every voice of
// a song has the same number of steps, so its voices loop together. Pure: no audio.
import type { MusicNote, MusicSong, MusicVoice } from "../game-audio";
import type { TalkThemeId } from "./talk-themes";

const semitones: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

// The MIDI number of a note name such as "C4", "F#5" or "Bb3".
export function talkNoteMidi(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  const base = match === null ? undefined : semitones[match[1] ?? ""];
  if (match === null || base === undefined) {
    throw new Error(`Not a note: ${name}`);
  }
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + base + accidental;
}

// The steps of a voice: one entry per step, a note's MIDI number, null for a rest, or
// "hold" to keep the note before sounding.
export function talkVoiceSteps(pattern: string): (number | null | "hold")[] {
  return pattern
    .split(/\s+/)
    .filter((token) => token.length > 0 && token !== "|")
    .map((token) =>
      token === "." ? null : token === "-" ? "hold" : talkNoteMidi(token),
    );
}

function notes(pattern: string, stepSeconds: number): MusicNote[] {
  const out: { midi: number | null; seconds: number }[] = [];
  for (const step of talkVoiceSteps(pattern)) {
    const last = out[out.length - 1];
    if (step === "hold" && last !== undefined) {
      last.seconds += stepSeconds;
    } else {
      out.push({ midi: step === "hold" ? null : step, seconds: stepSeconds });
    }
  }
  return out;
}

interface VoiceSpec {
  readonly pattern: string;
  readonly type: OscillatorType;
  readonly gain: number;
  readonly channel: MusicVoice["channel"];
  readonly pluck?: boolean;
}

interface SongSpec {
  readonly stepSeconds: number;
  readonly voices: readonly VoiceSpec[];
}

const lead = (pattern: string, pluck = false): VoiceSpec => ({
  pattern,
  type: "square",
  gain: 0.05,
  channel: "melody",
  pluck,
});
const bell = (pattern: string): VoiceSpec => ({
  pattern,
  type: "triangle",
  gain: 0.07,
  channel: "melody",
  pluck: true,
});
const bass = (pattern: string, pluck = false): VoiceSpec => ({
  pattern,
  type: "triangle",
  gain: 0.06,
  channel: "bass",
  pluck,
});
const pad = (pattern: string): VoiceSpec => ({
  pattern,
  type: "sine",
  gain: 0.04,
  channel: "harmony",
});

export const talkSongSpecs: Readonly<Record<TalkThemeId, SongSpec>> = {
  // a bouncy walk in G major
  plains: {
    stepSeconds: 0.14,
    voices: [
      lead(
        "G4 . B4 D5 G5 . D5 B4 | C5 . E5 G5 C6 . G5 E5 | D5 . F#5 A5 D6 . C6 A5 | B4 G4 A4 B4 G4 . . .",
      ),
      bass(
        "G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 . | D3 . A3 . D3 . A3 . | G2 . D3 . G2 . . .",
        true,
      ),
    ],
  },
  // a slow desert air over a drone
  ruins: {
    stepSeconds: 0.2,
    voices: [
      lead(
        "D5 - Eb5 F#5 G5 - F#5 Eb5 | D5 - - . A4 - Bb4 A4 | G4 - A4 Bb4 C5 - Bb4 A4 | D5 - - - . . . .",
      ),
      bass(
        "D3 - - - A2 - - - | D3 - - - A2 - - - | G2 - - - C3 - - - | D3 - - - D3 - - -",
      ),
    ],
  },
  // a walking bass in the dark, with drips of light
  cave: {
    stepSeconds: 0.16,
    voices: [
      bass(
        "E2 . . E3 . . B2 . | D3 . . . C3 . B2 . | E2 . . E3 . . G2 . | A2 . B2 . . . . .",
        true,
      ),
      bell(
        "B5 . . . . . . . | . . . . G5 . . . | E6 . . . . . . . | . . D6 . . B5 . .",
      ),
    ],
  },
  // a creeping chromatic line over long low notes
  ghost: {
    stepSeconds: 0.26,
    voices: [
      pad(
        "A4 - - Bb4 A4 - - . | E5 - - F5 E5 - - . | C5 - B4 - Bb4 - A4 - | G#4 - - - - - . .",
      ),
      bass(
        "A2 - - - - - - - | Bb2 - - - - - - - | A2 - - - - - - - | E2 - - - - - - -",
      ),
      bell(
        "E6 . . . . . . . | . . . F6 . . . . | . . . . . . E6 . | . . . . D#6 . . .",
      ),
    ],
  },
  // a lilting night song in six
  forest: {
    stepSeconds: 0.18,
    voices: [
      bell(
        "A4 . C5 E5 . D5 | C5 . B4 A4 . . | G4 . B4 D5 . C5 | B4 . A4 G4 . . | F4 . A4 C5 . E5 | D5 . C5 B4 . .",
      ),
      bass(
        "A2 . . E3 . . | A2 . . E3 . . | G2 . . D3 . . | G2 . . D3 . . | F2 . . C3 . . | E2 . . B2 . .",
      ),
    ],
  },
  // a skipping beach tune in F
  island: {
    stepSeconds: 0.13,
    voices: [
      bell(
        "F5 . A5 . C6 A5 . F5 | G5 . Bb5 . D6 Bb5 . G5 | A5 . C6 . A5 F5 . C5 | D5 . E5 . F5 . . .",
      ),
      bass(
        "F2 . . F3 C3 . . . | Bb2 . . Bb3 F3 . . . | F2 . . F3 C3 . . . | C3 . . C3 F2 . . .",
        true,
      ),
    ],
  },
  // a waltz above the clouds
  sky: {
    stepSeconds: 0.17,
    voices: [
      lead(
        "E5 - - G#5 - B5 | E6 - - D#6 C#6 B5 | A5 - - F#5 - A5 | B5 - - - - . | C#6 - - B5 A5 G#5 | F#5 - - A5 G#5 F#5 | E5 - - B4 - - | E5 - - - . .",
      ),
      bass(
        "E2 G#3 G#3 E2 G#3 G#3 | E2 B3 B3 E2 B3 B3 | A2 C#4 C#4 A2 C#4 C#4 | B2 D#4 D#4 B2 D#4 D#4 | A2 C#4 C#4 A2 C#4 C#4 | B2 D#4 D#4 B2 D#4 D#4 | E2 G#3 G#3 B2 D#4 D#4 | E2 G#3 G#3 E2 . .",
        true,
      ),
    ],
  },
  // sparkling arpeggios in D
  palace: {
    stepSeconds: 0.11,
    voices: [
      bell(
        "D6 A5 F#5 A5 D6 A5 F#5 A5 | E6 B5 G5 B5 E6 B5 G5 B5 | F#6 D6 A5 D6 E6 C#6 A5 C#6 | D6 . A5 . D6 . . .",
      ),
      bass(
        "D3 . . . D3 . . . | G2 . . . G2 . . . | D3 . . . A2 . . . | D3 . A2 . D2 . . .",
      ),
    ],
  },
  // a driving low riff under a slow cry
  valley: {
    stepSeconds: 0.13,
    voices: [
      {
        pattern:
          "C#2 C#2 C#3 C#2 C#2 C#3 E2 F#2 | C#2 C#2 C#3 C#2 G#2 G2 F#2 E2 | A1 A1 A2 A1 A1 A2 B1 C#2 | G#1 G#1 G#2 G#1 G#1 . . .",
        type: "square",
        gain: 0.035,
        channel: "bass",
        pluck: true,
      },
      lead(
        "G#4 - - - A4 - - - | G#4 - F#4 - E4 - - - | E4 - - - F#4 - - - | D#4 - - - - - . .",
      ),
    ],
  },
  // a tense climb in C minor
  castle: {
    stepSeconds: 0.12,
    voices: [
      lead(
        "C5 Eb5 G5 F#5 G5 . Eb5 . | D5 F5 Ab5 G5 Ab5 . F5 . | Eb5 G5 B5 Bb5 B5 . G5 . | C6 . G5 . Eb5 . C5 .",
      ),
      bass(
        "C3 . C3 . F#2 . G2 . | C3 . C3 . F#2 . G2 . | Ab2 . Ab2 . G2 . G2 . | C3 . G2 . C2 . . .",
      ),
    ],
  },
};

function song(spec: SongSpec): MusicSong {
  return {
    voices: spec.voices.map((voice) => ({
      notes: notes(voice.pattern, spec.stepSeconds),
      type: voice.type,
      gain: voice.gain,
      channel: voice.channel,
      ...(voice.pluck === true ? { pluck: true } : {}),
    })),
  };
}

const songs = new Map<TalkThemeId, MusicSong>();

// The song for a theme, built once.
export function talkThemeSong(theme: TalkThemeId): MusicSong {
  const cached = songs.get(theme);
  if (cached !== undefined) {
    return cached;
  }
  const built = song(talkSongSpecs[theme]);
  songs.set(theme, built);
  return built;
}

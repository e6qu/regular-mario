import { SoundEvent } from "../engine/simulation/sound-events";
import romMusicData from "./smb-rom-music.json";

type ToneSpec = {
  readonly frequencyHertz: number;
  readonly endFrequencyHertz: number;
  readonly durationSeconds: number;
  readonly type: OscillatorType;
  readonly gain: number;
};

// --- Background music ------------------------------------------------------
// The three area themes decoded from the original SMB ROM (see
// scripts/decode-smb-music.mjs) as numeric note data — MIDI pitch + duration in
// seconds, per pitched channel (square-2 melody, triangle bass, square-1
// harmony), one entry per song part. Each channel becomes a looping voice.

function midiToHertz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

type RomNote = { readonly midi: number | null; readonly seconds: number };
type RomPart = {
  readonly melody: readonly RomNote[];
  readonly bass: readonly RomNote[];
  readonly harmony: readonly RomNote[];
};
const romMusic = romMusicData as Record<string, readonly RomPart[]>;

type SongVoice = {
  readonly notes: readonly RomNote[];
  readonly type: OscillatorType;
  readonly gain: number;
  readonly channel: "melody" | "bass" | "harmony";
};
type Song = { readonly voices: readonly SongVoice[] };

// Concatenate one channel across all of a theme's parts into one looping voice.
function makeVoice(
  parts: readonly RomPart[],
  channel: "melody" | "bass" | "harmony",
  type: OscillatorType,
  gain: number,
): SongVoice {
  return { notes: parts.flatMap((part) => part[channel]), type, gain, channel };
}

function makeSong(parts: readonly RomPart[]): Song {
  const voices: SongVoice[] = [makeVoice(parts, "melody", "square", 0.06)];
  const bass = makeVoice(parts, "bass", "triangle", 0.05);
  if (bass.notes.length > 0) {
    voices.push(bass);
  }
  const harmony = makeVoice(parts, "harmony", "square", 0.03);
  if (harmony.notes.length > 0) {
    voices.push(harmony);
  }
  return { voices };
}

const overworldSong: Song = makeSong(romMusic.overworld ?? []);
const songsByTheme: Record<string, Song> = {
  overworld: overworldSong,
  underground: makeSong(romMusic.underground ?? []),
  castle: makeSong(romMusic.castle ?? []),
  water: makeSong(romMusic.water ?? []),
};

const toneSpecs: Record<SoundEvent, ToneSpec> = {
  [SoundEvent.Jump]: {
    frequencyHertz: 440,
    endFrequencyHertz: 880,
    durationSeconds: 0.12,
    type: "square",
    gain: 0.08,
  },
  [SoundEvent.Land]: {
    frequencyHertz: 220,
    endFrequencyHertz: 160,
    durationSeconds: 0.08,
    type: "sine",
    gain: 0.05,
  },
  [SoundEvent.Collect]: {
    frequencyHertz: 990,
    endFrequencyHertz: 1320,
    durationSeconds: 0.1,
    type: "sine",
    gain: 0.08,
  },
  [SoundEvent.PowerUp]: {
    frequencyHertz: 660,
    endFrequencyHertz: 1320,
    durationSeconds: 0.2,
    type: "triangle",
    gain: 0.09,
  },
  [SoundEvent.Stomp]: {
    frequencyHertz: 330,
    endFrequencyHertz: 165,
    durationSeconds: 0.1,
    type: "square",
    gain: 0.08,
  },
  [SoundEvent.Defeat]: {
    frequencyHertz: 330,
    endFrequencyHertz: 82,
    durationSeconds: 0.3,
    type: "sawtooth",
    gain: 0.09,
  },
  [SoundEvent.Finish]: {
    frequencyHertz: 660,
    endFrequencyHertz: 990,
    durationSeconds: 0.25,
    type: "triangle",
    gain: 0.09,
  },
  [SoundEvent.ProjectileFire]: {
    frequencyHertz: 880,
    endFrequencyHertz: 440,
    durationSeconds: 0.08,
    type: "square",
    gain: 0.07,
  },
  [SoundEvent.LevelComplete]: {
    frequencyHertz: 660,
    endFrequencyHertz: 1320,
    durationSeconds: 0.4,
    type: "triangle",
    gain: 0.1,
  },
  [SoundEvent.HeadBonk]: {
    frequencyHertz: 220,
    endFrequencyHertz: 110,
    durationSeconds: 0.18,
    type: "square",
    gain: 0.09,
  },
  [SoundEvent.EnemyShot]: {
    frequencyHertz: 990,
    endFrequencyHertz: 220,
    durationSeconds: 0.12,
    type: "sawtooth",
    gain: 0.08,
  },
  // The victory firework: a bright rising sparkle-burst per shell explosion.
  [SoundEvent.Firework]: {
    frequencyHertz: 520,
    endFrequencyHertz: 2600,
    durationSeconds: 0.22,
    type: "triangle",
    gain: 0.09,
  },
};

type AudioContextConstructor = typeof AudioContext;

export class GameAudio {
  private audioContext: AudioContext | undefined;
  private soundBuffers: ReadonlyMap<SoundEvent, AudioBuffer> = new Map();
  private musicEnabled = false;
  // When true, the melody channel is sung as a baritone "ba ba ba" vocal (the
  // "shabby soundtrack"); the bass/harmony channels stay chiptune. Off = the
  // original all-chiptune soundtrack.
  private vocalMelody = false;
  private currentSong: Song = overworldSong;
  // One independent timer per voice: each voice walks its own note stream and
  // loops, so channels with different rhythms don't need a shared grid.
  private voiceTimers: (ReturnType<typeof setTimeout> | undefined)[] = [];
  // The node every music voice connects to. Usually the raw destination; for
  // water levels it's the head of the "underwater Morty" effect bus.
  private musicOutput: AudioNode | undefined;
  // LFO oscillators driving the water bus, kept so they can be stopped on exit.
  private musicBusOscillators: OscillatorNode[] = [];

  public registerSoundBuffers(
    buffers: ReadonlyMap<SoundEvent, AudioBuffer>,
  ): void {
    this.soundBuffers = buffers;
  }

  // Choose the soundtrack: true sings the melody as a baritone vocal (shabby),
  // false keeps the original chiptune melody.
  public setVocalSoundtrack(enabled: boolean): void {
    this.vocalMelody = enabled;
  }

  public startBackgroundMusic(theme?: string): boolean {
    if (this.musicEnabled) {
      return true;
    }

    const audioContext = this.requireAudioContext();

    if (audioContext === undefined) {
      return false;
    }

    this.currentSong = songsByTheme[theme ?? "overworld"] ?? overworldSong;
    // Water levels play the theme as if heard underwater and hummed by a
    // nervous, nasal, Morty-ish voice — a small comedic touch.
    this.musicOutput =
      theme === "water"
        ? this.makeUnderwaterMortyBus(audioContext)
        : audioContext.destination;
    this.musicEnabled = true;
    this.voiceTimers = this.currentSong.voices.map(() => undefined);
    this.currentSong.voices.forEach((_voice, voiceIndex) => {
      this.playVoiceNote(voiceIndex, 0);
    });
    return true;
  }

  public stopBackgroundMusic(): void {
    this.musicEnabled = false;

    for (const timer of this.voiceTimers) {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
    this.voiceTimers = [];

    for (const oscillator of this.musicBusOscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped; ignore.
      }
    }
    this.musicBusOscillators = [];
    this.musicOutput = undefined;
  }

  // The water-level effect bus: the chiptune voices are muffled by a lowpass
  // (sound travels poorly underwater), that cutoff slowly wobbles (a bubbly
  // sway), a peaking boost adds a nasal "honk", and a tremolo makes it waver —
  // together it reads as the theme hummed, nervously and underwater, by a
  // Morty-ish voice (high, nasal, unsteady). Returns the bus input node.
  private makeUnderwaterMortyBus(audioContext: AudioContext): AudioNode {
    const now = audioContext.currentTime;
    const input = audioContext.createGain();

    // Nasal honk (Morty): a peaking boost in the nasal band.
    const nasal = audioContext.createBiquadFilter();
    nasal.type = "peaking";
    nasal.frequency.setValueAtTime(1700, now);
    nasal.Q.setValueAtTime(1.3, now);
    nasal.gain.setValueAtTime(10, now);

    // Underwater muffle: a resonant lowpass whose cutoff slowly wobbles.
    const muffle = audioContext.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.setValueAtTime(900, now);
    muffle.Q.setValueAtTime(7, now);
    const wobble = audioContext.createOscillator();
    wobble.type = "sine";
    wobble.frequency.setValueAtTime(1.7, now);
    const wobbleDepth = audioContext.createGain();
    wobbleDepth.gain.setValueAtTime(360, now);
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(muffle.frequency);

    // Nervous waver: a tremolo on the output level.
    const tremolo = audioContext.createGain();
    tremolo.gain.setValueAtTime(0.82, now);
    const waver = audioContext.createOscillator();
    waver.type = "sine";
    waver.frequency.setValueAtTime(6.5, now);
    const waverDepth = audioContext.createGain();
    waverDepth.gain.setValueAtTime(0.2, now);
    waver.connect(waverDepth);
    waverDepth.connect(tremolo.gain);

    input.connect(nasal);
    nasal.connect(muffle);
    muffle.connect(tremolo);
    tremolo.connect(audioContext.destination);

    wobble.start(now);
    waver.start(now);
    this.musicBusOscillators = [wobble, waver];
    return input;
  }

  // Play one voice's note, then schedule its next after the note's duration.
  private playVoiceNote(voiceIndex: number, noteIndex: number): void {
    if (!this.musicEnabled) {
      return;
    }

    const audioContext = this.requireAudioContext();

    if (audioContext === undefined) {
      return;
    }

    const voice = this.currentSong.voices[voiceIndex];
    if (voice === undefined || voice.notes.length === 0) {
      return;
    }

    const note = voice.notes[noteIndex % voice.notes.length];
    if (note === undefined) {
      return;
    }

    if (note.midi !== null) {
      if (this.vocalMelody && voice.channel === "melody") {
        this.playVocalNote(audioContext, midiToHertz(note.midi), note.seconds);
      } else {
        this.playMusicNote(
          audioContext,
          midiToHertz(note.midi),
          note.seconds,
          voice,
        );
      }
    }

    this.voiceTimers[voiceIndex] = setTimeout(
      () => {
        this.playVoiceNote(voiceIndex, (noteIndex + 1) % voice.notes.length);
      },
      Math.max(1, note.seconds * 1000),
    );
  }

  private playMusicNote(
    audioContext: AudioContext,
    frequencyHertz: number,
    durationSeconds: number,
    voice: SongVoice,
  ): void {
    try {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      // Slightly detached (staccato) with a soft attack, so repeated notes
      // articulate instead of smearing into one tone.
      const sustain = Math.max(0.05, durationSeconds * 0.85);

      oscillator.type = voice.type;
      oscillator.frequency.setValueAtTime(frequencyHertz, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(voice.gain, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + sustain);

      oscillator.connect(gain);
      gain.connect(this.musicOutput ?? audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + sustain + 0.02);
    } catch {
      // Audio playback is best-effort; never throw.
    }
  }

  // Sing one melody note as a baritone "ba": a harmonic-rich glottal buzz with a
  // little vibrato, shaped by three "ah"-vowel formant filters, gated by a "ba"
  // amplitude envelope (lips closed → plosive onset → sustained vowel → release).
  // The pitch is folded into the baritone register so it reads as a man's voice.
  private playVocalNote(
    audioContext: AudioContext,
    frequencyHertz: number,
    durationSeconds: number,
  ): void {
    try {
      const now = audioContext.currentTime;
      const sustain = Math.max(0.1, durationSeconds * 0.92);

      let fundamental = frequencyHertz;
      while (fundamental > 300) {
        fundamental /= 2;
      }
      while (fundamental < 90) {
        fundamental *= 2;
      }

      // Glottal source + gentle vibrato for a human, not-quite-steady pitch.
      const source = audioContext.createOscillator();
      source.type = "sawtooth";
      source.frequency.setValueAtTime(fundamental, now);
      const vibrato = audioContext.createOscillator();
      vibrato.type = "sine";
      vibrato.frequency.setValueAtTime(5.5, now);
      const vibratoDepth = audioContext.createGain();
      vibratoDepth.gain.setValueAtTime(fundamental * 0.02, now);
      vibrato.connect(vibratoDepth);
      vibratoDepth.connect(source.frequency);

      // "ah" vowel: three baritone formant resonances, summed.
      const mix = audioContext.createGain();
      mix.gain.setValueAtTime(1, now);
      const formants: readonly [number, number, number][] = [
        [650, 5, 1.0],
        [1080, 6, 0.65],
        [2500, 8, 0.4],
      ];
      for (const [formantHertz, q, formantGain] of formants) {
        const bandpass = audioContext.createBiquadFilter();
        bandpass.type = "bandpass";
        bandpass.frequency.setValueAtTime(formantHertz, now);
        bandpass.Q.setValueAtTime(q, now);
        const formantLevel = audioContext.createGain();
        formantLevel.gain.setValueAtTime(formantGain, now);
        source.connect(bandpass);
        bandpass.connect(formantLevel);
        formantLevel.connect(mix);
      }

      const peak = 0.4;
      const amp = audioContext.createGain();
      amp.gain.setValueAtTime(0.0001, now);
      // The "b": a quick plosive open from silence, then the sustained vowel.
      amp.gain.exponentialRampToValueAtTime(peak, now + 0.03);
      amp.gain.setValueAtTime(peak, now + Math.min(0.07, sustain * 0.5));
      amp.gain.exponentialRampToValueAtTime(0.0001, now + sustain);
      mix.connect(amp);
      amp.connect(this.musicOutput ?? audioContext.destination);

      source.start(now);
      vibrato.start(now);
      source.stop(now + sustain + 0.03);
      vibrato.stop(now + sustain + 0.03);
    } catch {
      // Audio playback is best-effort; never throw.
    }
  }

  public playEvents(events: readonly SoundEvent[]): void {
    if (events.length === 0) {
      return;
    }

    const audioContext = this.requireAudioContext();
    if (audioContext === undefined) {
      return;
    }

    for (const event of events) {
      const buffer = this.soundBuffers.get(event);

      if (buffer !== undefined) {
        this.playBuffer(audioContext, buffer);
      } else {
        this.playTone(audioContext, toneSpecs[event]);
      }
    }
  }

  private requireAudioContext(): AudioContext | undefined {
    if (this.audioContext !== undefined) {
      // Autoplay policy can leave the context suspended until a user gesture;
      // resume it (best-effort) so sound isn't silently inaudible.
      if (this.audioContext.state === "suspended") {
        void this.audioContext.resume();
      }
      return this.audioContext;
    }

    const constructor: AudioContextConstructor | undefined = (
      window as unknown as { AudioContext?: AudioContextConstructor }
    ).AudioContext;
    if (constructor === undefined) {
      return undefined;
    }

    try {
      this.audioContext = new constructor();
    } catch {
      this.audioContext = undefined;
    }

    return this.audioContext;
  }

  private playBuffer(audioContext: AudioContext, buffer: AudioBuffer): void {
    try {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + buffer.duration);
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start(now);
    } catch {
      // Audio playback is best-effort; never throw from the simulation step.
    }
  }

  private playTone(audioContext: AudioContext, spec: ToneSpec): void {
    try {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;

      oscillator.type = spec.type;
      oscillator.frequency.setValueAtTime(spec.frequencyHertz, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        spec.endFrequencyHertz,
        now + spec.durationSeconds,
      );
      gain.gain.setValueAtTime(spec.gain, now);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + spec.durationSeconds,
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + spec.durationSeconds);
    } catch {
      // Audio playback is best-effort; never throw from the simulation step.
    }
  }
}

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
  // Pluck the note (a short, fast-decaying ring like a ukulele string) instead
  // of holding it for the note's full length.
  readonly pluck?: boolean;
};
type Song = { readonly voices: readonly SongVoice[] };

// An original, bouncy ukulele-style tune for Revenge mode, composed here from
// scratch (major-key arpeggios over a plucked root bass) — not derived from any
// existing song. MIDI pitch + duration in seconds, looped.
function revengeNotes(
  midis: readonly (number | null)[],
  seconds: number,
): readonly RomNote[] {
  return midis.map((midi) => ({ midi, seconds }));
}
const revengeSong: Song = {
  voices: [
    {
      // Cheeky arpeggio melody (C major: C, Am, F, G, then an octave-up reprise).
      notes: revengeNotes(
        [
          72, 76, 79, 76, 69, 72, 76, 72, 65, 69, 72, 69, 67, 71, 74, 67, 76,
          79, 84, 79, 72, 76, 81, 76, 74, 77, 81, 77, 79, 74, 71, 67,
        ],
        0.18,
      ),
      type: "triangle",
      gain: 0.07,
      channel: "melody",
      pluck: true,
    },
    {
      // A simple plucked root bass, one root per arpeggio group.
      notes: revengeNotes(
        [48, 45, 41, 43, 48, 45, 41, 43, 48, 45, 41, 43, 48, 45, 41, 43],
        0.36,
      ),
      type: "triangle",
      gain: 0.06,
      channel: "bass",
      pluck: true,
    },
  ],
};

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
// The star-power theme loops (fast) over the level, replacing its music while
// invincibility lasts.
const starSong: Song = makeSong(romMusic.star ?? []);
const songsByTheme: Record<string, Song> = {
  overworld: overworldSong,
  underground: makeSong(romMusic.underground ?? []),
  castle: makeSong(romMusic.castle ?? []),
  water: makeSong(romMusic.water ?? []),
};

// One-shot event jingles (played once, not looped): the flagpole fanfare, the
// world-clear victory theme, the death riff, and the game-over sting.
export type MusicJingle =
  | "level-clear"
  | "victory"
  | "death"
  | "game-over"
  | "time-warning";
const jingleSongs: Record<MusicJingle, Song> = {
  "level-clear": makeSong(romMusic.levelClear ?? []),
  victory: makeSong(romMusic.victory ?? []),
  death: makeSong(romMusic.death ?? []),
  "game-over": makeSong(romMusic.gameOver ?? []),
  "time-warning": makeSong(romMusic.timeWarning ?? []),
};

// Every event has a synthesized fallback tone EXCEPT the brick shatter, which
// is a dedicated multi-layer noise synth (see playBrickShatter) rather than a
// single oscillator sweep.
const toneSpecs: Record<
  Exclude<SoundEvent, SoundEvent.BlockBreak>,
  ToneSpec
> = {
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
  // The end-of-level time-bonus tick: a short high blip per time unit converted.
  [SoundEvent.TimeTick]: {
    frequencyHertz: 1760,
    endFrequencyHertz: 1760,
    durationSeconds: 0.03,
    type: "square",
    gain: 0.05,
  },
  // The springboard "boing": a fast coiled-release sweep from low to high.
  [SoundEvent.SpringBounce]: {
    frequencyHertz: 150,
    endFrequencyHertz: 950,
    durationSeconds: 0.18,
    type: "triangle",
    gain: 0.1,
  },
};

// The cause-specific cartoony death sounds (see playDeathSound).
export type DeathSoundKind = "splat" | "burn" | "drown" | "impale";

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
  // Playback speed multiplier for the looping voices (1 = normal). The
  // time-warning bumps this so the theme races when the clock runs low.
  private tempoScale = 1;
  // Timers for the currently-playing one-shot jingle, cleared when a new jingle
  // or the background music takes over.
  private jingleTimers: ReturnType<typeof setTimeout>[] = [];

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

  // Revenge mode swaps the theme for the original ukulele revenge tune.
  private revengeMusic = false;
  public setRevengeMusic(enabled: boolean): void {
    this.revengeMusic = enabled;
  }

  public startBackgroundMusic(theme?: string): boolean {
    if (this.musicEnabled) {
      return true;
    }

    const audioContext = this.requireAudioContext();

    if (audioContext === undefined) {
      return false;
    }

    this.stopJingles();
    this.tempoScale = 1;
    this.currentSong = this.revengeMusic
      ? revengeSong
      : (songsByTheme[theme ?? "overworld"] ?? overworldSong);
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
    this.tempoScale = 1;

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
    this.stopJingles();
  }

  // Swap the looping background between the star-power theme (while invincible)
  // and the level theme, without tearing down the audio graph (so the water bus
  // and enabled state survive). A no-op if the music isn't playing.
  public setInvincibilityMusic(active: boolean, levelTheme?: string): void {
    if (!this.musicEnabled) {
      return;
    }
    const target = active
      ? starSong
      : (songsByTheme[levelTheme ?? "overworld"] ?? overworldSong);
    if (this.currentSong === target) {
      return;
    }
    this.switchLoopingSong(target);
  }

  // Race the looping theme when the clock runs low (SMB speeds the music up as
  // "time running out"). 1 = normal; the change takes effect on the next note.
  public setMusicTempoScale(scale: number): void {
    this.tempoScale = scale > 0 ? scale : 1;
  }

  // Play a one-shot event jingle (fanfare, victory, death, game-over, or the
  // time-warning sting) once. Takeover jingles silence the looping background;
  // the brief time-warning plays over it.
  public playJingle(jingle: MusicJingle): void {
    const audioContext = this.requireAudioContext();
    if (audioContext === undefined) {
      return;
    }
    if (jingle !== "time-warning") {
      this.stopBackgroundMusic();
    }
    this.stopJingles();
    const song = jingleSongs[jingle];
    for (const voice of song.voices) {
      this.playJingleVoice(voice, 0);
    }
  }

  private stopJingles(): void {
    for (const timer of this.jingleTimers) {
      clearTimeout(timer);
    }
    this.jingleTimers = [];
  }

  // Restart the looping voices on a new song without touching musicEnabled or
  // the output bus, so an in-place theme swap keeps everything else intact.
  private switchLoopingSong(song: Song): void {
    for (const timer of this.voiceTimers) {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
    this.currentSong = song;
    this.voiceTimers = song.voices.map(() => undefined);
    song.voices.forEach((_voice, voiceIndex) => {
      this.playVoiceNote(voiceIndex, 0);
    });
  }

  // Walk a jingle voice's notes once (no loop), scheduling each after the last.
  private playJingleVoice(voice: SongVoice, noteIndex: number): void {
    if (noteIndex >= voice.notes.length) {
      return;
    }
    const audioContext = this.requireAudioContext();
    if (audioContext === undefined) {
      return;
    }
    const note = voice.notes[noteIndex];
    if (note === undefined) {
      return;
    }
    if (note.midi !== null) {
      this.playMusicNote(
        audioContext,
        midiToHertz(note.midi),
        note.seconds,
        voice,
      );
    }
    const timer = setTimeout(
      () => {
        this.playJingleVoice(voice, noteIndex + 1);
      },
      Math.max(1, note.seconds * 1000),
    );
    this.jingleTimers.push(timer);
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

    const seconds = note.seconds / this.tempoScale;
    if (note.midi !== null) {
      if (this.vocalMelody && voice.channel === "melody") {
        this.playVocalNote(audioContext, midiToHertz(note.midi), seconds);
      } else {
        this.playMusicNote(
          audioContext,
          midiToHertz(note.midi),
          seconds,
          voice,
        );
      }
    }

    this.voiceTimers[voiceIndex] = setTimeout(
      () => {
        this.playVoiceNote(voiceIndex, (noteIndex + 1) % voice.notes.length);
      },
      Math.max(1, seconds * 1000),
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
      // A plucked voice rings briefly then decays (ukulele); otherwise it holds
      // most of the note (a soft-attack staccato).
      const sustain =
        voice.pluck === true
          ? Math.min(durationSeconds * 0.9, 0.22)
          : Math.max(0.05, durationSeconds * 0.85);

      oscillator.type = voice.type;
      oscillator.frequency.setValueAtTime(frequencyHertz, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(voice.gain, now + 0.006);
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
        continue;
      }

      if (event === SoundEvent.BlockBreak) {
        // No generic oscillator sweep — a brick breaking is a dedicated
        // noise-based shatter (crack + rubble + low thud).
        this.emitBrickShatter(audioContext);
        continue;
      }

      this.playTone(audioContext, toneSpecs[event]);
    }
  }

  // The looping steak-sizzle bed for a god-mode player standing on lava:
  // band-passed noise with a slow crackle flutter. Started/stopped by the
  // scene as the player steps on/off the surface.
  private sizzleNodes:
    | {
        readonly source: AudioBufferSourceNode;
        readonly flutter: OscillatorNode;
        readonly gain: GainNode;
      }
    | undefined;

  public setLavaSizzle(active: boolean): void {
    if (!active) {
      if (this.sizzleNodes !== undefined) {
        try {
          this.sizzleNodes.source.stop();
          this.sizzleNodes.flutter.stop();
          this.sizzleNodes.gain.disconnect();
        } catch {
          // Best-effort audio teardown.
        }
        this.sizzleNodes = undefined;
      }
      return;
    }
    if (this.sizzleNodes !== undefined) {
      return;
    }
    const audioContext = this.requireAudioContext();
    if (audioContext === undefined) {
      return;
    }
    try {
      const now = audioContext.currentTime;
      const source = audioContext.createBufferSource();
      source.buffer = this.requireNoiseBuffer(audioContext);
      source.loop = true;
      const filter = audioContext.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(4200, now);
      filter.Q.setValueAtTime(0.9, now);
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.12, now);
      // The crackle: an 11 Hz flutter riding on the gain, like fat spitting.
      const flutter = audioContext.createOscillator();
      flutter.frequency.setValueAtTime(11, now);
      const flutterDepth = audioContext.createGain();
      flutterDepth.gain.setValueAtTime(0.05, now);
      flutter.connect(flutterDepth);
      flutterDepth.connect(gain.gain);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      source.start(now);
      flutter.start(now);
      this.sizzleNodes = { source, flutter, gain };
    } catch {
      this.sizzleNodes = undefined;
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

  // A cached mono white-noise buffer for the "wet"/"sizzle"/"bubble" textures of
  // the cartoony death sounds. Filled from a fixed LCG (not Math.random) so it is
  // reproducible.
  private noiseBuffer: AudioBuffer | undefined;
  private requireNoiseBuffer(audioContext: AudioContext): AudioBuffer {
    if (this.noiseBuffer !== undefined) {
      return this.noiseBuffer;
    }
    const length = Math.floor(audioContext.sampleRate * 0.5);
    const buffer = audioContext.createBuffer(
      1,
      length,
      audioContext.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let seed = 22695477;
    for (let index = 0; index < length; index += 1) {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      data[index] = (seed / 0x3fffffff - 1) * 0.9;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  // A glottal-pulse waveform for the voice: harmonics rolling off ~-12 dB/octave
  // (amplitude 1/n²) instead of a sawtooth's harsh -6 dB/octave. This soft,
  // vowel-like source is the biggest step from "synth" to "voice".
  private glottalWave: PeriodicWave | undefined;
  private requireGlottalWave(audioContext: AudioContext): PeriodicWave {
    if (this.glottalWave !== undefined) {
      return this.glottalWave;
    }
    const harmonics = 26;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n += 1) {
      imag[n] = 1 / (n * n);
    }
    this.glottalWave = audioContext.createPeriodicWave(real, imag);
    return this.glottalWave;
  }

  // A short burst of band-passed noise (the shared texture for splats/sizzles).
  private playNoiseBurst(
    audioContext: AudioContext,
    options: {
      readonly durationSeconds: number;
      readonly filterType: BiquadFilterType;
      readonly startHertz: number;
      readonly endHertz: number;
      readonly q: number;
      readonly gain: number;
      // Delay the burst's onset (seconds) so staggered layers read as several
      // fragments — e.g. rubble falling after the initial crack.
      readonly startDelaySeconds?: number;
    },
  ): void {
    try {
      const now = audioContext.currentTime + (options.startDelaySeconds ?? 0);
      const source = audioContext.createBufferSource();
      source.buffer = this.requireNoiseBuffer(audioContext);
      const filter = audioContext.createBiquadFilter();
      filter.type = options.filterType;
      filter.frequency.setValueAtTime(options.startHertz, now);
      filter.frequency.exponentialRampToValueAtTime(
        options.endHertz,
        now + options.durationSeconds,
      );
      filter.Q.setValueAtTime(options.q, now);
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(options.gain, now);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + options.durationSeconds,
      );
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      source.start(now);
      source.stop(now + options.durationSeconds);
    } catch {
      // Best-effort audio; never throw from the simulation step.
    }
  }

  // A brick shattering: a sharp bright crack, then two staggered mid-band
  // crunches for the tumbling rubble, over a short low thud as the block's mass
  // gives way. Built from the shared noise burst so it reads as real debris, not
  // a chiptune blip.
  private emitBrickShatter(audioContext: AudioContext): void {
    // Sharp initial crack — bright, high, and very short.
    this.playNoiseBurst(audioContext, {
      durationSeconds: 0.05,
      filterType: "highpass",
      startHertz: 3400,
      endHertz: 1500,
      q: 0.7,
      gain: 0.16,
    });
    // Granular rubble — two mid-band crunches, the second delayed so the shards
    // scatter rather than land as one hit.
    this.playNoiseBurst(audioContext, {
      durationSeconds: 0.16,
      filterType: "bandpass",
      startHertz: 1150,
      endHertz: 380,
      q: 1.1,
      gain: 0.14,
    });
    this.playNoiseBurst(audioContext, {
      durationSeconds: 0.22,
      filterType: "bandpass",
      startHertz: 720,
      endHertz: 230,
      q: 0.9,
      gain: 0.1,
      startDelaySeconds: 0.045,
    });
    // Low body thud — the block's mass hitting.
    this.playNoiseBurst(audioContext, {
      durationSeconds: 0.12,
      filterType: "lowpass",
      startHertz: 260,
      endHertz: 90,
      q: 0.6,
      gain: 0.12,
    });
  }

  // Exaggerated, cartoony death sounds — one per cause — part of the "shabby"
  // identity. Layered so each reads distinctly: a wet splat, a fiery sizzle, an
  // underwater glug, or a metallic impale.
  public playDeathSound(kind: DeathSoundKind): void {
    const audioContext = this.requireAudioContext();
    if (audioContext === undefined) {
      return;
    }
    switch (kind) {
      case "splat":
        // A low body thud plus a wet burst.
        this.playTone(audioContext, {
          frequencyHertz: 240,
          endFrequencyHertz: 55,
          durationSeconds: 0.22,
          type: "sine",
          gain: 0.12,
        });
        this.playNoiseBurst(audioContext, {
          durationSeconds: 0.16,
          filterType: "bandpass",
          startHertz: 900,
          endHertz: 200,
          q: 0.7,
          gain: 0.12,
        });
        return;
      case "burn":
        // A hissing sizzle sweeping down, with a crackle.
        this.playNoiseBurst(audioContext, {
          durationSeconds: 0.45,
          filterType: "bandpass",
          startHertz: 2600,
          endHertz: 700,
          q: 0.9,
          gain: 0.1,
        });
        this.playNoiseBurst(audioContext, {
          durationSeconds: 0.3,
          filterType: "highpass",
          startHertz: 1400,
          endHertz: 3000,
          q: 0.5,
          gain: 0.05,
        });
        return;
      case "drown":
        // A descending, wobbling glug plus bubbling.
        this.playTone(audioContext, {
          frequencyHertz: 520,
          endFrequencyHertz: 120,
          durationSeconds: 0.4,
          type: "sine",
          gain: 0.1,
        });
        this.playNoiseBurst(audioContext, {
          durationSeconds: 0.35,
          filterType: "lowpass",
          startHertz: 700,
          endHertz: 180,
          q: 6,
          gain: 0.08,
        });
        return;
      case "impale":
        // A metallic "shwing" then a thud.
        this.playTone(audioContext, {
          frequencyHertz: 500,
          endFrequencyHertz: 2200,
          durationSeconds: 0.09,
          type: "sawtooth",
          gain: 0.08,
        });
        this.playTone(audioContext, {
          frequencyHertz: 300,
          endFrequencyHertz: 70,
          durationSeconds: 0.18,
          type: "square",
          gain: 0.1,
        });
        return;
      default: {
        const exhaustive: never = kind;
        throw new Error(`Unhandled death sound kind: ${String(exhaustive)}`);
      }
    }
  }

  // A cartoony "ouch" for a head-bonk: a quick nasal yelp (pitch up then down).
  public playOuch(): void {
    const audioContext = this.requireAudioContext();
    if (audioContext === undefined) {
      return;
    }
    try {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(300, now);
      oscillator.frequency.linearRampToValueAtTime(720, now + 0.06);
      oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.22);
      // A nasal formant peak so it reads as a voiced "ow".
      const nasal = audioContext.createBiquadFilter();
      nasal.type = "bandpass";
      nasal.frequency.setValueAtTime(1200, now);
      nasal.Q.setValueAtTime(4, now);
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      oscillator.connect(nasal);
      nasal.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.26);
    } catch {
      // Best-effort audio.
    }
  }

  // Exaggerated cartoon-Italian stomp yelps for revenge mode: "itsa" then "me"
  // cycle on consecutive stomps, with an "ow" mixed in every third. Original
  // formant synthesis (no sampled voice) — high, bright, and over-acted.
  private revengeVoiceIndex = 0;
  public playRevengeStompVoice(): void {
    const audioContext = this.requireAudioContext();
    if (audioContext === undefined) {
      return;
    }
    const step = this.revengeVoiceIndex % 3;
    this.revengeVoiceIndex += 1;
    const now = audioContext.currentTime;
    // Pitch register + vowel formants below are set from acoustic analysis of a
    // reference voice: a bright cartoon tenor whose stressed syllables sit high
    // (~410-440 Hz F0) and sag to ~250 on the trailing vowel, with measured
    // vowel formants (open 'ah' F1~900/F2~1450, front 'ee' F1~440/F2~2400).
    // Original synthesis of our own "itsa/me/ow" — not a copy of any clip.
    if (step === 0) {
      // "IT'S-A" (snappy, leading into the "me"): a crisp glottal-onset 'ih', a
      // real hissed 't-s', then a short open 'a' falling away. Sharper upper
      // formants (higher Q) read as clearer vowels.
      this.playFormantYelp(
        audioContext,
        now,
        [
          [563, 6],
          [1734, 11, 1.6],
          [2734, 9, 1.3],
        ],
        430,
        405,
        0.14,
        0.42,
        { hardOnset: true },
      );
      this.playFricative(audioContext, now + 0.16, 0.09, 0.14, 3600);
      this.playFormantYelp(
        audioContext,
        now + 0.26,
        [
          [906, 6],
          [1453, 11, 1.4],
          [2703, 9, 1.2],
        ],
        400,
        250,
        0.16,
        0.55,
        { vibratoDepth: 11, trailSeconds: 0.14 },
      );
    } else if (step === 1) {
      // "MEE!" (punched, with the glottal-stop catch): a muffled nasal 'm' hum
      // that releases (mouth opening: tract + formants glide up) into a long,
      // bright, high 'eee' — its high F2/F3 boosted so the vowel really rings.
      this.playFormantYelp(
        audioContext,
        now,
        [
          [320, 8],
          [1050, 4, 2.6],
          [3000, 4, 1.8],
        ],
        410,
        345,
        0.5,
        0.58,
        {
          hardOnset: true,
          nasalMuffleSeconds: 0.14,
          endFormants: [
            [438, 6],
            [2406, 12],
            [3313, 9],
          ],
          vibratoDepth: 12,
          trailSeconds: 0.5,
        },
      );
    } else {
      // "OW!" (a full word): a glottal-onset open 'ah' up high that swoops down
      // into a long, rounded 'ooo' and lingers.
      this.playFormantYelp(
        audioContext,
        now,
        [
          [906, 6],
          [1453, 10, 1.4],
        ],
        430,
        335,
        0.16,
        0.6,
        { hardOnset: true },
      );
      this.playFormantYelp(
        audioContext,
        now + 0.16,
        [
          [453, 6],
          [953, 10],
        ],
        335,
        205,
        0.34,
        0.55,
        { vibratoDepth: 11, trailSeconds: 0.5 },
      );
    }
  }

  // One vocalised formant burst: a buzzing glottal source pitch-swept from
  // startPitch to endPitch, shaped by bandpass "formant" resonances. Optional
  // vibrato gives the operatic Italian waver; `trailSeconds` lets the vowel ring
  // on and fade out slowly (the drawn-out Italian trail-off). Building block for
  // the revenge yelps.
  private playFormantYelp(
    audioContext: AudioContext,
    startTime: number,
    // Each formant is [centreHz, Q, gain?] — gain boosts the upper formants so
    // a bright vowel's high F2/F3 survive the glottal source's rolloff.
    formants: readonly (readonly [number, number, number?])[],
    startPitchHertz: number,
    endPitchHertz: number,
    durationSeconds: number,
    gain: number,
    options?: {
      readonly vibratoDepth?: number;
      readonly trailSeconds?: number;
      // A hard, creaky voiced attack (the glottal-stop onset) instead of a soft
      // fade — used on word-initial segments for the "it's-a • me" catch.
      readonly hardOnset?: boolean;
      // Glide the formants to these over the segment (coarticulation), e.g. a
      // nasal "m" opening into the "ee" of "me". Only the centre frequency is
      // used from each.
      readonly endFormants?: readonly (readonly [number, number, number?])[];
      // Start muffled (mouth nearly closed for a nasal) and open the tract over
      // this many seconds, with a slower amplitude rise — the "m" release.
      readonly nasalMuffleSeconds?: number;
    },
  ): void {
    try {
      const trailSeconds = options?.trailSeconds ?? 0;
      const vibratoDepth = options?.vibratoDepth ?? 0;
      const hardOnset = options?.hardOnset ?? false;
      const endFormants = options?.endFormants;
      const nasalMuffleSeconds = options?.nasalMuffleSeconds ?? 0;
      const totalSeconds = durationSeconds + trailSeconds;

      // Glottal source: two slightly detuned glottal-pulse waves (a chorus). A
      // hard onset scoops the pitch up from below (a glottal-stop catch); a soft
      // onset just kicks up then settles — natural, not a straight ramp.
      const glottalWave = this.requireGlottalWave(audioContext);
      const sources = [-6, 6].map((detune) => {
        const osc = audioContext.createOscillator();
        osc.setPeriodicWave(glottalWave);
        osc.detune.setValueAtTime(detune, startTime);
        if (hardOnset) {
          osc.frequency.setValueAtTime(startPitchHertz * 0.88, startTime);
          osc.frequency.linearRampToValueAtTime(
            startPitchHertz,
            startTime + 0.03,
          );
        } else {
          osc.frequency.setValueAtTime(startPitchHertz, startTime);
        }
        osc.frequency.linearRampToValueAtTime(
          startPitchHertz * 1.05,
          startTime + durationSeconds * 0.25,
        );
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(50, endPitchHertz),
          startTime + durationSeconds,
        );
        return osc;
      });

      // Modulate the pitch with an eased-in operatic waver PLUS a faster, tiny
      // jitter — a real voice is never perfectly steady, and that unevenness is
      // most of what sells it as human.
      const addPitchLfo = (
        rateHertz: number,
        depthHertz: number,
        easeIn: boolean,
      ): void => {
        const lfo = audioContext.createOscillator();
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(rateHertz, startTime);
        const lfoGain = audioContext.createGain();
        if (easeIn) {
          lfoGain.gain.setValueAtTime(0, startTime);
          lfoGain.gain.linearRampToValueAtTime(
            depthHertz,
            startTime + Math.min(0.2, durationSeconds),
          );
        } else {
          lfoGain.gain.setValueAtTime(depthHertz, startTime);
        }
        lfo.connect(lfoGain);
        for (const osc of sources) {
          lfoGain.connect(osc.frequency);
        }
        lfo.start(startTime);
        lfo.stop(startTime + totalSeconds + 0.05);
      };
      if (vibratoDepth > 0) {
        addPitchLfo(5.2, vibratoDepth, true);
      }
      addPitchLfo(11.3, Math.max(1.4, startPitchHertz * 0.006), false);

      // Warm the buzz before the vocal tract (a glottal spectral rolloff), so
      // the raw sawtooth edge doesn't read as a synth.
      const glottalLowpass = audioContext.createBiquadFilter();
      glottalLowpass.type = "lowpass";
      glottalLowpass.frequency.setValueAtTime(3900, startTime);
      glottalLowpass.Q.setValueAtTime(0.4, startTime);
      for (const osc of sources) {
        osc.connect(glottalLowpass);
      }

      // Breath: a bed of noise through the same vocal tract, stronger at the
      // onset then fading — real vowels are breathy, not pure tones.
      const breath = audioContext.createBufferSource();
      breath.buffer = this.requireNoiseBuffer(audioContext);
      breath.loop = true;
      const breathGain = audioContext.createGain();
      // A light aspiration at the onset that fades quickly — enough to feel
      // alive without a synthetic hiss riding the whole vowel.
      breathGain.gain.setValueAtTime(gain * 0.1, startTime);
      breathGain.gain.linearRampToValueAtTime(
        gain * 0.02,
        startTime + Math.min(0.12, durationSeconds),
      );
      breath.connect(breathGain);

      const tract = audioContext.createGain();
      tract.gain.setValueAtTime(1, startTime);
      glottalLowpass.connect(tract);
      breathGain.connect(tract);

      const mix = audioContext.createGain();
      formants.forEach(([hertz, q, formantGain], index) => {
        const bandpass = audioContext.createBiquadFilter();
        bandpass.type = "bandpass";
        bandpass.frequency.setValueAtTime(hertz, startTime);
        bandpass.Q.setValueAtTime(q, startTime);
        // Coarticulation: glide this formant toward its target over the segment.
        const target = endFormants?.[index]?.[0];
        if (target !== undefined) {
          bandpass.frequency.linearRampToValueAtTime(
            target,
            startTime + durationSeconds,
          );
        }
        // Per-formant gain lifts a high F2/F3 back up over the source rolloff.
        const level = audioContext.createGain();
        level.gain.setValueAtTime(formantGain ?? 1, startTime);
        tract.connect(bandpass);
        bandpass.connect(level);
        level.connect(mix);
      });
      // A high "presence" formant (F4) so the voice has air, not just muffle.
      const presence = audioContext.createBiquadFilter();
      presence.type = "bandpass";
      presence.frequency.setValueAtTime(3300, startTime);
      presence.Q.setValueAtTime(5, startTime);
      const presenceGain = audioContext.createGain();
      presenceGain.gain.setValueAtTime(0.28, startTime);
      tract.connect(presence);
      presence.connect(presenceGain);
      presenceGain.connect(mix);

      // Output tilt: a nasal starts muffled (mouth closed) and opens as it
      // releases into the vowel; otherwise it just tames the residual buzz.
      const tilt = audioContext.createBiquadFilter();
      tilt.type = "lowpass";
      tilt.Q.setValueAtTime(0.5, startTime);
      if (nasalMuffleSeconds > 0) {
        tilt.frequency.setValueAtTime(650, startTime);
        tilt.frequency.linearRampToValueAtTime(
          3800,
          startTime + nasalMuffleSeconds,
        );
      } else {
        tilt.frequency.setValueAtTime(3800, startTime);
      }
      mix.connect(tilt);

      const amp = audioContext.createGain();
      amp.gain.setValueAtTime(0.0001, startTime);
      // A nasal builds up as the mouth opens; a plain vowel gets a soft (not
      // clicky) onset, a hard onset a near-instant one.
      const onsetSeconds =
        nasalMuffleSeconds > 0
          ? nasalMuffleSeconds * 0.9
          : hardOnset
            ? 0.012
            : 0.04;
      amp.gain.exponentialRampToValueAtTime(gain, startTime + onsetSeconds);
      // Hold the vowel, then let it ring on and fade away slowly (the trail).
      amp.gain.setValueAtTime(gain, startTime + durationSeconds * 0.7);
      amp.gain.exponentialRampToValueAtTime(0.0001, startTime + totalSeconds);
      tilt.connect(amp);
      amp.connect(audioContext.destination);

      for (const osc of sources) {
        osc.start(startTime);
        osc.stop(startTime + totalSeconds + 0.05);
      }
      breath.start(startTime);
      breath.stop(startTime + totalSeconds + 0.05);
    } catch {
      // Best-effort audio.
    }
  }

  // A voiced fricative ("s"/"ts"): a burst of (deterministic) noise through a
  // high-pass, so the consonant hisses like a real one instead of a tonal beep.
  private playFricative(
    audioContext: AudioContext,
    startTime: number,
    durationSeconds: number,
    gain: number,
    cutoffHertz: number,
  ): void {
    try {
      const source = audioContext.createBufferSource();
      source.buffer = this.requireNoiseBuffer(audioContext);
      const highpass = audioContext.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.setValueAtTime(cutoffHertz, startTime);
      highpass.Q.setValueAtTime(0.6, startTime);
      const amp = audioContext.createGain();
      amp.gain.setValueAtTime(0.0001, startTime);
      amp.gain.exponentialRampToValueAtTime(gain, startTime + 0.02);
      amp.gain.exponentialRampToValueAtTime(
        0.0001,
        startTime + durationSeconds,
      );
      source.connect(highpass);
      highpass.connect(amp);
      amp.connect(audioContext.destination);
      source.start(startTime);
      source.stop(startTime + durationSeconds + 0.02);
    } catch {
      // Best-effort audio.
    }
  }

  // A long, agonized, cartoony scream for burning to death: a wavering wail that
  // slides up in panic then falls away, with a nasal vocal formant and a tremolo.
  public playScream(): void {
    const audioContext = this.requireAudioContext();
    if (audioContext === undefined) {
      return;
    }
    try {
      const now = audioContext.currentTime;
      const duration = 0.9;
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(420, now);
      oscillator.frequency.linearRampToValueAtTime(880, now + 0.12);
      oscillator.frequency.linearRampToValueAtTime(760, now + 0.5);
      oscillator.frequency.exponentialRampToValueAtTime(180, now + duration);
      // A vibrato/tremolo LFO wobbling the pitch so the wail sounds panicked.
      const vibrato = audioContext.createOscillator();
      vibrato.type = "sine";
      vibrato.frequency.setValueAtTime(11, now);
      const vibratoGain = audioContext.createGain();
      vibratoGain.gain.setValueAtTime(35, now);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(oscillator.frequency);
      // A voiced formant so it reads as a scream, not a synth sweep.
      const formant = audioContext.createBiquadFilter();
      formant.type = "bandpass";
      formant.frequency.setValueAtTime(1400, now);
      formant.Q.setValueAtTime(5, now);
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.05);
      gain.gain.setValueAtTime(0.16, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(formant);
      formant.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
      vibrato.start(now);
      vibrato.stop(now + duration + 0.02);
    } catch {
      // Best-effort audio.
    }
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

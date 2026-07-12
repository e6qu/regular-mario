import { afterEach, describe, expect, it, vi } from "vitest";

import { GameAudio } from "./game-audio";

class FakeAudioParam {
  public setValueAtTime(): void {
    return;
  }

  public exponentialRampToValueAtTime(): void {
    return;
  }
}

class FakeOscillatorNode {
  public type: OscillatorType = "sine";
  public readonly frequency = new FakeAudioParam();
  public started = false;
  public stopped = false;

  public connect(): void {
    return;
  }

  public start(): void {
    this.started = true;
  }

  public stop(): void {
    this.stopped = true;
  }
}

class FakeGainNode {
  public readonly gain = new FakeAudioParam();

  public connect(): void {
    return;
  }
}

class FakeBiquadFilterNode {
  public type: BiquadFilterType = "lowpass";
  public readonly frequency = new FakeAudioParam();
  public readonly Q = new FakeAudioParam();
  public readonly gain = new FakeAudioParam();

  public connect(): void {
    return;
  }
}

class FakeAudioContext {
  public static createdOscillators: FakeOscillatorNode[] = [];
  public static createdFilters: FakeBiquadFilterNode[] = [];

  public readonly currentTime = 0;
  public readonly destination = {};

  public createOscillator(): FakeOscillatorNode {
    const oscillator = new FakeOscillatorNode();
    FakeAudioContext.createdOscillators.push(oscillator);
    return oscillator;
  }

  public createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  public createBiquadFilter(): FakeBiquadFilterNode {
    const filter = new FakeBiquadFilterNode();
    FakeAudioContext.createdFilters.push(filter);
    return filter;
  }
}

function installFakeAudioContext(): void {
  FakeAudioContext.createdOscillators = [];
  FakeAudioContext.createdFilters = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    },
  });
}

function uninstallFakeAudioContext(): void {
  Reflect.deleteProperty(globalThis, "window");
}

describe("GameAudio background music", () => {
  afterEach(() => {
    vi.useRealTimers();
    uninstallFakeAudioContext();
  });

  it("starts the overworld's three ROM voices immediately", () => {
    vi.useFakeTimers();
    installFakeAudioContext();

    const gameAudio = new GameAudio();
    const started = gameAudio.startBackgroundMusic();

    expect(started).toBe(true);
    // Overworld: square-wave melody, triangle bass, and square-wave harmony each
    // fire their first note when the song starts.
    expect(FakeAudioContext.createdOscillators).toHaveLength(3);
    expect(FakeAudioContext.createdOscillators[0]?.type).toBe("square");
    expect(FakeAudioContext.createdOscillators[1]?.type).toBe("triangle");
    expect(FakeAudioContext.createdOscillators[2]?.type).toBe("square");
  });

  it("selects a different song per theme (underground has melody + bass)", () => {
    vi.useFakeTimers();
    installFakeAudioContext();

    const gameAudio = new GameAudio();
    gameAudio.startBackgroundMusic("underground");

    // Underground's header doubles the melody on the triangle and has no
    // square-1, so two voices start.
    expect(FakeAudioContext.createdOscillators).toHaveLength(2);
    expect(FakeAudioContext.createdOscillators[0]?.type).toBe("square");
    expect(FakeAudioContext.createdOscillators[1]?.type).toBe("triangle");
  });

  it("routes the water theme through the underwater Morty effect bus", () => {
    vi.useFakeTimers();
    installFakeAudioContext();

    const gameAudio = new GameAudio();
    gameAudio.startBackgroundMusic("water");

    // The bus adds two sine LFOs (cutoff wobble + tremolo waver) on top of the
    // song's voices, and builds biquad filters (nasal peak + underwater
    // lowpass) that a plain theme never creates.
    const sineOscillators = FakeAudioContext.createdOscillators.filter(
      (oscillator) => oscillator.type === "sine",
    );
    expect(sineOscillators).toHaveLength(2);
    expect(FakeAudioContext.createdFilters.length).toBeGreaterThanOrEqual(2);

    // Stopping the music stops the bus LFOs too.
    gameAudio.stopBackgroundMusic();
    expect(sineOscillators.every((oscillator) => oscillator.stopped)).toBe(
      true,
    );
  });

  it("does not build the effect bus for a non-water theme", () => {
    vi.useFakeTimers();
    installFakeAudioContext();

    new GameAudio().startBackgroundMusic("overworld");
    expect(FakeAudioContext.createdFilters).toHaveLength(0);
  });

  it("does not start duplicate music loops", () => {
    vi.useFakeTimers();
    installFakeAudioContext();

    const gameAudio = new GameAudio();
    const firstStarted = gameAudio.startBackgroundMusic();
    const secondStarted = gameAudio.startBackgroundMusic();

    expect(firstStarted).toBe(true);
    expect(secondStarted).toBe(true);
    expect(FakeAudioContext.createdOscillators).toHaveLength(3);
  });

  it("stops scheduling notes when background music is stopped", () => {
    vi.useFakeTimers();
    installFakeAudioContext();

    const gameAudio = new GameAudio();
    gameAudio.startBackgroundMusic();
    gameAudio.stopBackgroundMusic();
    vi.advanceTimersByTime(2000);

    expect(FakeAudioContext.createdOscillators).toHaveLength(3);
  });

  it("reports when background music cannot start without an audio context", () => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    const gameAudio = new GameAudio();

    expect(gameAudio.startBackgroundMusic()).toBe(false);
  });
});

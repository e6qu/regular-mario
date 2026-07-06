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

class FakeAudioContext {
  public static createdOscillators: FakeOscillatorNode[] = [];

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
}

function installFakeAudioContext(): void {
  FakeAudioContext.createdOscillators = [];
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

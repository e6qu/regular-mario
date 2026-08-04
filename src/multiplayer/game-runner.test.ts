import { describe, expect, it } from "vitest";

import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeInitialSimulationState } from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
import {
  MultiplayerGameMode,
  requireMultiplayerAvatar,
  requireMultiplayerGameId,
  requireMultiplayerNickname,
  requireMultiplayerPlayerId,
} from "./domain";
import {
  makeAuthoritativeGameRunner,
  MultiplayerGamePhase,
  type MultiplayerPlayerProfile,
} from "./game-runner";

const neutral: SimulationInputCommand = {
  horizontal: HorizontalInput.Neutral,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

function profile(id: string, nickname = "Mira"): MultiplayerPlayerProfile {
  return {
    playerId: requireMultiplayerPlayerId(id),
    nickname: requireMultiplayerNickname(nickname),
    avatarId: requireMultiplayerAvatar("castaway"),
  };
}

function makeRunner() {
  const initial = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );
  if (!initial.ok) {
    throw new Error("Expected a valid simulation state.");
  }
  return makeAuthoritativeGameRunner({
    gameId: requireMultiplayerGameId("game-1"),
    creator: profile("mira"),
    mode: MultiplayerGameMode.Regular,
    initialState: initial.value,
    levelSpec: firstAuthoredLevelSpec(),
    movementConstants: initialMovementConstants,
  });
}

describe("authoritative multiplayer game runner", () => {
  it("spawns joining players in the shared screen and preserves stable slots", () => {
    const runner = makeRunner();
    const joined = runner.join(profile("ren", "Ren"));
    expect(joined.players).toHaveLength(2);
    expect(joined.players[1]).toMatchObject({
      playerId: "ren",
      slot: 1,
      x: 144,
      y: 64,
    });
  });

  it("runs only after the creator starts and acknowledges queued input", () => {
    const runner = makeRunner();
    expect(runner.snapshot().phase).toBe(MultiplayerGamePhase.Waiting);
    expect(() => runner.start(requireMultiplayerPlayerId("ren"))).toThrow(
      "creator",
    );
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.submitInput(
      {
        playerId: requireMultiplayerPlayerId("mira"),
        sequence: 1,
        intendedFrame: 1,
        receivedAtMilliseconds: 0,
        command: { ...neutral, horizontal: HorizontalInput.Right },
      },
      0,
    );
    const stepped = runner.step(1);
    expect(stepped.frame).toBe(1);
    expect(stepped.players[0]!.acknowledgedInputSequence).toBe(1);
    expect(stepped.queue.depth).toBe(0);
  });

  it("supports admin-style pause and exact one-frame advancement", () => {
    const runner = makeRunner();
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.pause();
    expect(runner.snapshot().phase).toBe(MultiplayerGamePhase.Paused);
    expect(() => runner.step(1)).toThrow("Only playing");
    expect(runner.stepPaused(1)).toMatchObject({
      frame: 1,
      phase: MultiplayerGamePhase.Paused,
    });
  });
});

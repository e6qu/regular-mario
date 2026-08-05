import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import { makeLevelSpec } from "../engine/domain/level-spec";
import { finishRouteLevelInput } from "../engine/levels/finish-route-level";
import { firstAuthoredLevelInput } from "../engine/levels/first-authored-level";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import {
  makeInitialSimulationState,
  type SimulationState,
} from "../engine/simulation/simulation-state";
import { stepSimulation } from "../engine/simulation/step-simulation";
import {
  PlayerDefeatReason,
  PlayerFinishReason,
  PlayerOutcomeKind,
} from "../engine/simulation/player-outcome";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationPixelPosition,
} from "../engine/simulation/simulation-units";
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
  type AuthoritativeGameRunner,
  type MultiplayerPlayerProfile,
} from "./game-runner";
import { decodeMultiplayerSimulationState } from "./simulation-wire";
import { loadOfficialSmbPack } from "../engine/levels/import/official-smb-pack.test-support";

const neutral: SimulationInputCommand = {
  horizontal: HorizontalInput.Neutral,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

type RecordedWorld11Input = {
  readonly count: number;
  readonly horizontal: HorizontalInput;
  readonly jump: boolean;
  readonly down: boolean;
  readonly run: boolean;
};

function readWorld11SmallInputTrace(): readonly RecordedWorld11Input[] {
  const encoded = readFileSync(
    "tests/multiplayer-browser/world11-small-input-trace.json.gz.base64",
    "utf8",
  ).trim();
  return JSON.parse(
    gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"),
  ) as readonly RecordedWorld11Input[];
}

function profile(id: string, nickname = "Mira"): MultiplayerPlayerProfile {
  return {
    playerId: requireMultiplayerPlayerId(id),
    nickname: requireMultiplayerNickname(nickname),
    avatarId: requireMultiplayerAvatar("castaway"),
  };
}

function makeInitialState(): SimulationState {
  const initial = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    multiplayerLevelSpec(),
    initialMovementConstants,
  );
  if (!initial.ok) {
    throw new Error("Expected a valid simulation state.");
  }
  return initial.value;
}

function multiplayerLevelSpec() {
  const result = makeLevelSpec(finishRouteLevelInput);
  if (!result.ok) {
    throw new Error("Expected a valid authored multiplayer level.");
  }
  return result.value;
}

function makeRunnerForMode(
  initialState: SimulationState,
  mode: MultiplayerGameMode,
) {
  return makeAuthoritativeGameRunner({
    gameId: requireMultiplayerGameId("game-1"),
    levelId: "finish-route",
    creator: profile("mira"),
    mode,
    initialState,
    levelSpec: multiplayerLevelSpec(),
    movementConstants: initialMovementConstants,
  });
}

function makeRunnerWithInitialState(initialState: SimulationState) {
  return makeRunnerForMode(initialState, MultiplayerGameMode.Regular);
}

function makeRunner() {
  return makeRunnerWithInitialState(makeInitialState());
}

function runCreatorRightToFinish(runner: AuthoritativeGameRunner) {
  let snapshot = runner.snapshot();
  for (let frame = 1; frame <= 1_200; frame += 1) {
    runner.submitInput(
      {
        playerId: requireMultiplayerPlayerId("mira"),
        sequence: frame,
        intendedFrame: frame,
        receivedAtMilliseconds: frame,
        command: {
          ...neutral,
          horizontal: HorizontalInput.Right,
          runHeld: true,
        },
      },
      frame,
    );
    snapshot = runner.step(frame);
    if (snapshot.phase === MultiplayerGamePhase.Finished) {
      break;
    }
  }
  return snapshot;
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

  it("spawns a late joiner in the current authoritative camera screen", () => {
    const initial = makeInitialState();
    const runner = makeRunnerWithInitialState({
      ...initial,
      players: [
        {
          ...initial.players[0],
          player: {
            ...initial.players[0].player,
            position: {
              x: requireSimulationPixelPosition(560, "test.player.x"),
              y: initial.players[0].player.position.y,
            },
          },
        },
      ],
    });
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.step(1);
    const beforeJoin = runner.snapshot();
    expect(beforeJoin.cameraLeftPixels).toBeGreaterThan(0);
    const joined = runner.join(profile("ren", "Ren"));
    expect(joined.players[1]?.x).toBe(beforeJoin.cameraLeftPixels + 128 + 16);
  });

  it("follows the leading active guest when the creator remains idle", () => {
    const runner = makeRunner();
    runner.join(profile("ren", "Ren"));
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.submitInput(
      {
        playerId: requireMultiplayerPlayerId("ren"),
        sequence: 1,
        intendedFrame: 1,
        receivedAtMilliseconds: 0,
        command: {
          ...neutral,
          horizontal: HorizontalInput.Right,
          runHeld: true,
        },
      },
      0,
    );
    const snapshot = runner.step(1);
    expect(snapshot.players[1]!.x).toBeGreaterThan(snapshot.players[0]!.x);
    expect(snapshot.cameraLeftPixels).toBeGreaterThan(0);
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
    expect(stepped.players[0]!.inputAcknowledgementLagMilliseconds).toBe(1);
    expect(stepped.queue.depth).toBe(0);
  });

  it("can run the introductory course to its ground-level goal", () => {
    const runner = makeRunner();
    runner.start(requireMultiplayerPlayerId("mira"));
    const snapshot = runCreatorRightToFinish(runner);
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Finished);
  });

  it("lets a moving player pass idle online party members", () => {
    const runner = makeRunner();
    runner.join(profile("ren", "Ren"));
    runner.join(profile("sol", "Sol"));
    runner.join(profile("ivy", "Ivy"));
    runner.start(requireMultiplayerPlayerId("mira"));
    const snapshot = runCreatorRightToFinish(runner);
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Finished);
  });

  it("keeps the World 1-1 completion trace valid with four online players", () => {
    const world11 = loadOfficialSmbPack().get("smb-1-1");
    if (world11 === undefined) {
      throw new Error("World 1-1 is missing from the bundled level pack.");
    }
    const initial = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      world11.levelSpec,
      initialMovementConstants,
    );
    if (!initial.ok) {
      throw new Error("World 1-1 initial state is invalid.");
    }
    const runner = makeAuthoritativeGameRunner({
      gameId: requireMultiplayerGameId("world11-trace"),
      levelId: "smb-1-1",
      creator: profile("mira"),
      mode: MultiplayerGameMode.Regular,
      initialState: initial.value,
      levelSpec: world11.levelSpec,
      movementConstants: initialMovementConstants,
    });
    runner.join(profile("ren", "Ren"));
    runner.join(profile("sol", "Sol"));
    runner.join(profile("ivy", "Ivy"));
    runner.start(requireMultiplayerPlayerId("mira"));

    let sequence = 0;
    let frame = 0;
    let snapshot = runner.snapshot();
    for (const input of readWorld11SmallInputTrace()) {
      sequence += 1;
      runner.submitInput(
        {
          playerId: requireMultiplayerPlayerId("mira"),
          sequence,
          intendedFrame: frame + 1,
          receivedAtMilliseconds: frame,
          command: {
            ...neutral,
            horizontal: input.horizontal,
            jumpPressed: input.jump,
            downHeld: input.down,
            runHeld: input.run,
          },
        },
        frame,
      );
      for (let repeat = 0; repeat < input.count; repeat += 1) {
        frame += 1;
        snapshot = runner.step(frame);
        if (snapshot.phase === MultiplayerGamePhase.Finished) {
          break;
        }
      }
      if (snapshot.phase === MultiplayerGamePhase.Finished) {
        break;
      }
    }
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Finished);
  });

  it("is bit-for-bit state-equivalent to a local two-player engine trace", () => {
    const traceLevelResult = makeLevelSpec(firstAuthoredLevelInput);
    if (!traceLevelResult.ok) {
      throw new Error("Expected a valid authored trace level.");
    }
    const traceInitial = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      traceLevelResult.value,
      initialMovementConstants,
    );
    if (!traceInitial.ok) {
      throw new Error("Expected a valid authored trace state.");
    }
    const runner = makeAuthoritativeGameRunner({
      gameId: requireMultiplayerGameId("game-trace"),
      levelId: "first-authored",
      creator: profile("mira"),
      mode: MultiplayerGameMode.Regular,
      initialState: traceInitial.value,
      levelSpec: traceLevelResult.value,
      movementConstants: initialMovementConstants,
    });
    const joined = runner.join(profile("ren", "Ren"));
    let localState = decodeMultiplayerSimulationState(joined.simulationState);
    runner.start(requireMultiplayerPlayerId("mira"));

    const creatorCommand: SimulationInputCommand = {
      ...neutral,
      horizontal: HorizontalInput.Right,
      runHeld: true,
    };
    const guestCommand: SimulationInputCommand = {
      ...neutral,
      horizontal: HorizontalInput.Left,
      jumpPressed: true,
    };
    for (let frame = 1; frame <= 12; frame += 1) {
      const currentGuestCommand =
        frame === 1 ? guestCommand : { ...guestCommand, jumpPressed: false };
      if (frame === 1) {
        runner.submitInput(
          {
            playerId: requireMultiplayerPlayerId("mira"),
            sequence: 1,
            intendedFrame: frame,
            receivedAtMilliseconds: 0,
            command: creatorCommand,
          },
          0,
        );
        runner.submitInput(
          {
            playerId: requireMultiplayerPlayerId("ren"),
            sequence: 1,
            intendedFrame: frame,
            receivedAtMilliseconds: 0,
            command: currentGuestCommand,
          },
          0,
        );
      } else {
        runner.submitInput(
          {
            playerId: requireMultiplayerPlayerId("ren"),
            sequence: frame,
            intendedFrame: frame,
            receivedAtMilliseconds: 0,
            command: currentGuestCommand,
          },
          0,
        );
      }
      localState = stepSimulation(
        localState,
        creatorCommand,
        initialMovementConstants,
        traceLevelResult.value,
        [currentGuestCommand],
        false,
      );
      const server = runner.step(frame);
      expect(decodeMultiplayerSimulationState(server.simulationState)).toEqual(
        localState,
      );
    }
  });

  it("steps the same authoritative lifecycle in regular and revenge modes", () => {
    for (const mode of [
      MultiplayerGameMode.Regular,
      MultiplayerGameMode.Revenge,
    ]) {
      const runner = makeRunnerForMode(makeInitialState(), mode);
      runner.start(requireMultiplayerPlayerId("mira"));
      expect(runner.step(1)).toMatchObject({
        mode,
        phase: MultiplayerGamePhase.Playing,
        frame: 1,
      });
    }
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

  it("issues a strictly increasing snapshot sequence across same-frame lifecycle changes", () => {
    const runner = makeRunner();
    const waiting = runner.snapshot();
    const playing = runner.start(requireMultiplayerPlayerId("mira"));
    const paused = runner.pause();

    expect(waiting.frame).toBe(0);
    expect(playing.frame).toBe(0);
    expect(paused.frame).toBe(0);
    expect(waiting.snapshotSequence).toBeLessThan(playing.snapshotSequence);
    expect(playing.snapshotSequence).toBeLessThan(paused.snapshotSequence);
  });

  it("retains defeated members as spectators while active players continue", () => {
    const initial = makeInitialState();
    const runner = makeRunnerWithInitialState({
      ...initial,
      players: [
        {
          ...initial.players[0],
          outcome: {
            kind: PlayerOutcomeKind.Defeated,
            reason: PlayerDefeatReason.PitContact,
          },
        },
      ],
    });
    const snapshot = runner.snapshot();
    expect(snapshot.players[0]?.spectator).toBe(true);
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Waiting);
  });

  it("enforces the hard sixteen-player game cap", () => {
    const runner = makeRunner();
    for (let playerNumber = 1; playerNumber < 16; playerNumber += 1) {
      runner.join(profile(`player-${playerNumber}`, `Player ${playerNumber}`));
    }
    expect(runner.snapshot().players).toHaveLength(16);
    expect(() => runner.join(profile("overflow", "Overflow"))).toThrow(
      "cannot exceed 16",
    );
  });

  it("finishes the whole game when any authoritative player has finished", () => {
    const initial = makeInitialState();
    const runner = makeRunnerWithInitialState({
      ...initial,
      players: [
        {
          ...initial.players[0],
          outcome: {
            kind: PlayerOutcomeKind.Finished,
            reason: PlayerFinishReason.GoalContact,
          },
        },
      ],
    });
    runner.start(requireMultiplayerPlayerId("mira"));
    expect(runner.step(1).phase).toBe(MultiplayerGamePhase.Finished);
  });

  it("finishes the whole game when a joined player reaches the goal", () => {
    const levelResult = makeLevelSpec({
      ...finishRouteLevelInput,
      tiles: finishRouteLevelInput.tiles.map((row, rowIndex) =>
        row.map((tile, columnIndex) =>
          rowIndex === 4 && columnIndex === 9 ? "gate" : tile,
        ),
      ),
    });
    if (!levelResult.ok) {
      throw new Error("Expected a valid joined-player goal test level.");
    }
    const initial = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelResult.value,
      initialMovementConstants,
    );
    if (!initial.ok) {
      throw new Error("Expected a valid joined-player goal test state.");
    }
    const runner = makeAuthoritativeGameRunner({
      gameId: requireMultiplayerGameId("game-1"),
      levelId: "joined-player-goal",
      creator: profile("mira"),
      mode: MultiplayerGameMode.Regular,
      initialState: initial.value,
      levelSpec: levelResult.value,
      movementConstants: initialMovementConstants,
    });
    runner.join(profile("ren", "Ren"));
    runner.start(requireMultiplayerPlayerId("mira"));
    const snapshot = runner.step(1);
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Finished);
    expect(snapshot.players[1]).toMatchObject({
      playerId: "ren",
      spectator: true,
    });
  });
});

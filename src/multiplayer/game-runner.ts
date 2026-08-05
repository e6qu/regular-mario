import type { LevelSpec } from "../engine/domain/level-spec";
import type { MovementConstants } from "../engine/simulation/movement-model";
import { PlayerOutcomeKind } from "../engine/simulation/player-outcome";
import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import {
  appendSimulationPlayerAt,
  removeSimulationPlayerAt,
  type SimulationState,
} from "../engine/simulation/simulation-state";
import { stepSimulation } from "../engine/simulation/step-simulation";
import { requireSimulationPixelPosition } from "../engine/simulation/simulation-units";
import {
  multiplayerInputExpiryMilliseconds,
  multiplayerMaximumPlayers,
  type MultiplayerAvatarId,
  type MultiplayerGameId,
  type MultiplayerNickname,
  type MultiplayerPlayerId,
} from "./domain";
import type { MultiplayerGameMode } from "./domain";
import {
  makeExpiringInputQueue,
  type ExpiringInputQueue,
  type InputQueueMetrics,
  type QueuedSimulationInput,
} from "./input-queue";
import {
  encodeMultiplayerSimulationState,
  type MultiplayerSimulationWireState,
} from "./simulation-wire";

const sharedCameraWidthPixels = 256;
const multiplayerInputQueueMaximumMessages = 16 * 180;

export enum MultiplayerGamePhase {
  Waiting = "waiting",
  Playing = "playing",
  Paused = "paused",
  Finished = "finished",
}

export type MultiplayerPlayerProfile = {
  readonly playerId: MultiplayerPlayerId;
  readonly nickname: MultiplayerNickname;
  readonly avatarId: MultiplayerAvatarId;
};

type AuthoritativePlayer = MultiplayerPlayerProfile & {
  readonly slot: number;
};

type AuthoritativePlayerSnapshot = MultiplayerPlayerProfile & {
  readonly slot: number;
  readonly spectator: boolean;
  readonly x: number;
  readonly y: number;
  readonly acknowledgedInputSequence: number;
  readonly inputAcknowledgementLagMilliseconds: number;
};

export type AuthoritativeGameSnapshot = {
  readonly gameId: MultiplayerGameId;
  /**
   * Monotonic transport ordering token. Simulation frames reset on a course
   * handoff and lifecycle changes may share a frame, so `frame` alone cannot
   * identify a snapshot or a delta baseline.
   */
  readonly snapshotSequence: number;
  readonly levelId: string;
  readonly mode: MultiplayerGameMode;
  readonly phase: MultiplayerGamePhase;
  readonly frame: number;
  readonly cameraLeftPixels: number;
  /** Positions alone cannot faithfully render the authored game. */
  readonly simulationState: MultiplayerSimulationWireState;
  readonly players: readonly AuthoritativePlayerSnapshot[];
  readonly queue: InputQueueMetrics;
};

export type AuthoritativeGameRunner = {
  join(player: MultiplayerPlayerProfile): AuthoritativeGameSnapshot;
  leave(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  updateProfile(player: MultiplayerPlayerProfile): AuthoritativeGameSnapshot;
  start(requestedBy: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  pause(): AuthoritativeGameSnapshot;
  resume(): AuthoritativeGameSnapshot;
  submitInput(
    input: QueuedSimulationInput,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  step(nowMilliseconds: number): AuthoritativeGameSnapshot;
  stepPaused(nowMilliseconds: number): AuthoritativeGameSnapshot;
  snapshot(): AuthoritativeGameSnapshot;
};

export type MakeAuthoritativeGameRunnerConfig = {
  readonly gameId: MultiplayerGameId;
  readonly levelId: string;
  readonly creator: MultiplayerPlayerProfile;
  readonly mode: MultiplayerGameMode;
  readonly initialState: SimulationState;
  readonly levelSpec: LevelSpec;
  readonly movementConstants: MovementConstants;
};

const neutralCommand: SimulationInputCommand = {
  horizontal: HorizontalInput.Neutral,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

export function makeAuthoritativeGameRunner(
  config: MakeAuthoritativeGameRunnerConfig,
): AuthoritativeGameRunner {
  if (config.initialState.players.length !== 1) {
    throw new Error(
      "An authoritative game must begin with exactly its creator.",
    );
  }
  let state = config.initialState;
  let phase = MultiplayerGamePhase.Waiting;
  let cameraLeftPixels = 0;
  let snapshotSequence = 0;
  let players: AuthoritativePlayer[] = [{ ...config.creator, slot: 0 }];
  const commandByPlayerId = new Map<
    MultiplayerPlayerId,
    SimulationInputCommand
  >([[config.creator.playerId, neutralCommand]]);
  const acknowledgedInputSequenceByPlayerId = new Map<
    MultiplayerPlayerId,
    number
  >();
  const acknowledgementLagByPlayerId = new Map<MultiplayerPlayerId, number>();
  const inputQueue: ExpiringInputQueue = makeExpiringInputQueue(
    multiplayerInputQueueMaximumMessages,
    multiplayerInputExpiryMilliseconds,
  );

  function requirePlayer(playerId: MultiplayerPlayerId): AuthoritativePlayer {
    const player = players.find((candidate) => candidate.playerId === playerId);
    if (player === undefined) {
      throw new Error("Player is not a member of this game.");
    }
    return player;
  }

  function updateCamera(): void {
    // The shared camera follows the party's forward progress, not the creator
    // slot. An idle creator must never pin every remote browser at the start
    // while another active player legitimately leads the run.
    const cameraTarget = state.players
      .filter((runtime) => runtime.outcome.kind === PlayerOutcomeKind.Active)
      .reduce<
        SimulationState["players"][number] | undefined
      >((leading, runtime) => (leading === undefined || runtime.player.position.x > leading.player.position.x ? runtime : leading), undefined);
    if (cameraTarget === undefined) {
      return;
    }
    cameraLeftPixels = Math.max(
      0,
      Number(cameraTarget.player.position.x) - sharedCameraWidthPixels / 2,
    );
  }

  function makeSnapshot(): AuthoritativeGameSnapshot {
    return {
      gameId: config.gameId,
      snapshotSequence: (snapshotSequence += 1),
      levelId: config.levelId,
      mode: config.mode,
      phase,
      frame: Number(state.clock.frameIndex),
      cameraLeftPixels,
      simulationState: encodeMultiplayerSimulationState(state),
      players: players.map((player) => {
        const runtime = state.players[player.slot];
        if (runtime === undefined) {
          throw new Error(
            "Player slot is missing from authoritative simulation.",
          );
        }
        return {
          playerId: player.playerId,
          nickname: player.nickname,
          avatarId: player.avatarId,
          slot: player.slot,
          spectator: runtime.outcome.kind !== PlayerOutcomeKind.Active,
          x: Number(runtime.player.position.x),
          y: Number(runtime.player.position.y),
          acknowledgedInputSequence:
            acknowledgedInputSequenceByPlayerId.get(player.playerId) ?? 0,
          inputAcknowledgementLagMilliseconds:
            acknowledgementLagByPlayerId.get(player.playerId) ?? 0,
        };
      }),
      queue: inputQueue.metrics(),
    };
  }

  function advance(nowMilliseconds: number): AuthoritativeGameSnapshot {
    const nextFrame = Number(state.clock.frameIndex) + 1;
    for (const player of players) {
      const messages = inputQueue.drainThroughFrame(
        player.playerId,
        nextFrame,
        nowMilliseconds,
      );
      const newest = messages.at(-1);
      if (newest !== undefined) {
        commandByPlayerId.set(player.playerId, newest.command);
        acknowledgedInputSequenceByPlayerId.set(
          player.playerId,
          newest.sequence,
        );
        acknowledgementLagByPlayerId.set(
          player.playerId,
          Math.max(0, nowMilliseconds - newest.receivedAtMilliseconds),
        );
      }
    }
    const commands = players.map(
      (player) => commandByPlayerId.get(player.playerId) ?? neutralCommand,
    );
    state = stepSimulation(
      state,
      commands[0] ?? neutralCommand,
      config.movementConstants,
      config.levelSpec,
      commands.slice(1),
      false,
    );
    updateCamera();
    if (
      state.players.some(
        (runtime) => runtime.outcome.kind === PlayerOutcomeKind.Finished,
      )
    ) {
      phase = MultiplayerGamePhase.Finished;
    }
    return makeSnapshot();
  }

  return {
    join(player) {
      if (phase === MultiplayerGamePhase.Finished) {
        throw new Error("Finished games cannot accept new players.");
      }
      if (players.some((candidate) => candidate.playerId === player.playerId)) {
        return this.updateProfile(player);
      }
      if (players.length >= multiplayerMaximumPlayers) {
        throw new Error(
          `Games cannot exceed ${multiplayerMaximumPlayers} players.`,
        );
      }
      const spawnY = state.players[0].player.position.y;
      const spawnX = requireSimulationPixelPosition(
        cameraLeftPixels + sharedCameraWidthPixels / 2 + players.length * 16,
        "multiplayer.join.spawn.x",
      );
      state = appendSimulationPlayerAt(state, { x: spawnX, y: spawnY });
      players = [...players, { ...player, slot: players.length }];
      commandByPlayerId.set(player.playerId, neutralCommand);
      return makeSnapshot();
    },
    leave(playerId) {
      const leaving = requirePlayer(playerId);
      if (players.length <= 1) {
        throw new Error("The final player must end the game instead.");
      }
      state = removeSimulationPlayerAt(state, leaving.slot);
      players = players
        .filter((candidate) => candidate.playerId !== playerId)
        .map((candidate, slot) => ({ ...candidate, slot }));
      commandByPlayerId.delete(playerId);
      acknowledgedInputSequenceByPlayerId.delete(playerId);
      acknowledgementLagByPlayerId.delete(playerId);
      return makeSnapshot();
    },
    updateProfile(player) {
      requirePlayer(player.playerId);
      players = players.map((candidate) =>
        candidate.playerId === player.playerId
          ? { ...player, slot: candidate.slot }
          : candidate,
      );
      return makeSnapshot();
    },
    start(requestedBy) {
      if (requestedBy !== config.creator.playerId) {
        throw new Error("Only the game creator can start this game.");
      }
      if (phase !== MultiplayerGamePhase.Waiting) {
        throw new Error("Only waiting games can be started.");
      }
      phase = MultiplayerGamePhase.Playing;
      return makeSnapshot();
    },
    pause() {
      if (phase !== MultiplayerGamePhase.Playing) {
        throw new Error("Only playing games can be paused.");
      }
      phase = MultiplayerGamePhase.Paused;
      return makeSnapshot();
    },
    resume() {
      if (phase !== MultiplayerGamePhase.Paused) {
        throw new Error("Only paused games can be resumed.");
      }
      phase = MultiplayerGamePhase.Playing;
      return makeSnapshot();
    },
    submitInput(input, nowMilliseconds) {
      requirePlayer(input.playerId);
      if (phase === MultiplayerGamePhase.Finished) {
        throw new Error("Finished games cannot accept input.");
      }
      const rejection = inputQueue.enqueue(input, nowMilliseconds);
      if (rejection !== undefined) {
        throw new Error(`Input was rejected: ${rejection}.`);
      }
      return makeSnapshot();
    },
    step(nowMilliseconds) {
      if (phase !== MultiplayerGamePhase.Playing) {
        throw new Error("Only playing games can advance simulation frames.");
      }
      return advance(nowMilliseconds);
    },
    stepPaused(nowMilliseconds) {
      if (phase !== MultiplayerGamePhase.Paused) {
        throw new Error("Only paused games can advance exactly one frame.");
      }
      const advancedSnapshot = advance(nowMilliseconds);
      if (advancedSnapshot.phase !== MultiplayerGamePhase.Finished) {
        phase = MultiplayerGamePhase.Paused;
      }
      return makeSnapshot();
    },
    snapshot: makeSnapshot,
  };
}

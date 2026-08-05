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
  reviveSimulationPlayerAt,
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
  readonly connected: boolean;
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
  pauseByPlayer(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  resume(): AuthoritativeGameSnapshot;
  resumeByPlayer(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  revive(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
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
  // An empty party pause is a lifecycle safeguard, not a player choice.  The
  // next member must be able to resume the existing world simply by joining;
  // an explicit P pause deliberately remains paused.
  let pausedBecausePartyIsEmpty = false;
  let cameraLeftPixels = 0;
  let snapshotSequence = 0;
  // This is a party checkpoint, not a rendered camera target: it advances
  // only from an active member, and a revive never rewinds the shared world.
  let partyCheckpoint = config.initialState.players[0].player.position;
  let players: AuthoritativePlayer[] = [
    { ...config.creator, slot: 0, connected: true },
  ];
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
    const player = players.find(
      (candidate) => candidate.playerId === playerId && candidate.connected,
    );
    if (player === undefined) {
      throw new Error("Player is not a member of this game.");
    }
    return player;
  }

  function updateCamera(): void {
    // The shared camera follows the party's forward progress, not the creator
    // slot. An idle creator must never pin every remote browser at the start
    // while another active player legitimately leads the run.
    const cameraTarget = players
      .filter((player) => player.connected)
      .map((player) => state.players[player.slot])
      .filter(
        (runtime): runtime is SimulationState["players"][number] =>
          runtime !== undefined &&
          runtime.outcome.kind === PlayerOutcomeKind.Active,
      )
      .reduce<SimulationState["players"][number] | undefined>(
        (leading, runtime) =>
          leading === undefined ||
          runtime.player.position.x > leading.player.position.x
            ? runtime
            : leading,
        undefined,
      );
    if (cameraTarget === undefined) {
      return;
    }
    if (cameraTarget.player.position.x > partyCheckpoint.x) {
      partyCheckpoint = cameraTarget.player.position;
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
      players: players
        .filter((player) => player.connected)
        .map((player) => {
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
    for (const player of players.filter((candidate) => candidate.connected)) {
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
      const knownPlayer = players.find(
        (candidate) => candidate.playerId === player.playerId,
      );
      if (knownPlayer?.connected === true) {
        return this.updateProfile(player);
      }
      const dormantSlot = players.find((candidate) => !candidate.connected);
      if (dormantSlot !== undefined) {
        state = reviveSimulationPlayerAt(
          state,
          dormantSlot.slot,
          partyCheckpoint,
        );
        players = players.map((candidate) =>
          candidate === dormantSlot
            ? { ...player, slot: dormantSlot.slot, connected: true }
            : candidate,
        );
        commandByPlayerId.set(player.playerId, neutralCommand);
        if (
          phase === MultiplayerGamePhase.Paused &&
          pausedBecausePartyIsEmpty
        ) {
          phase = MultiplayerGamePhase.Playing;
          pausedBecausePartyIsEmpty = false;
        }
        return makeSnapshot();
      }
      if (
        players.filter((candidate) => candidate.connected).length >=
        multiplayerMaximumPlayers
      ) {
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
      players = [
        ...players,
        { ...player, slot: players.length, connected: true },
      ];
      commandByPlayerId.set(player.playerId, neutralCommand);
      return makeSnapshot();
    },
    leave(playerId) {
      const leaving = requirePlayer(playerId);
      if (players.filter((candidate) => candidate.connected).length <= 1) {
        players = players.map((candidate) =>
          candidate.playerId === playerId
            ? { ...candidate, connected: false }
            : candidate,
        );
        commandByPlayerId.delete(playerId);
        acknowledgedInputSequenceByPlayerId.delete(playerId);
        acknowledgementLagByPlayerId.delete(playerId);
        if (phase === MultiplayerGamePhase.Playing) {
          phase = MultiplayerGamePhase.Paused;
          pausedBecausePartyIsEmpty = true;
        }
        return makeSnapshot();
      }
      state = removeSimulationPlayerAt(state, leaving.slot);
      players = players
        .filter((candidate) => candidate.playerId !== playerId)
        .map((candidate, slot) => ({ ...candidate, slot, connected: true }));
      commandByPlayerId.delete(playerId);
      acknowledgedInputSequenceByPlayerId.delete(playerId);
      acknowledgementLagByPlayerId.delete(playerId);
      return makeSnapshot();
    },
    updateProfile(player) {
      requirePlayer(player.playerId);
      players = players.map((candidate) =>
        candidate.playerId === player.playerId
          ? { ...player, slot: candidate.slot, connected: candidate.connected }
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
      pausedBecausePartyIsEmpty = false;
      return makeSnapshot();
    },
    pause() {
      if (phase !== MultiplayerGamePhase.Playing) {
        throw new Error("Only playing games can be paused.");
      }
      phase = MultiplayerGamePhase.Paused;
      pausedBecausePartyIsEmpty = false;
      return makeSnapshot();
    },
    pauseByPlayer(playerId) {
      requirePlayer(playerId);
      return this.pause();
    },
    resume() {
      if (phase !== MultiplayerGamePhase.Paused) {
        throw new Error("Only paused games can be resumed.");
      }
      phase = MultiplayerGamePhase.Playing;
      pausedBecausePartyIsEmpty = false;
      return makeSnapshot();
    },
    resumeByPlayer(playerId) {
      requirePlayer(playerId);
      return this.resume();
    },
    revive(playerId) {
      const player = requirePlayer(playerId);
      if (phase !== MultiplayerGamePhase.Playing) {
        throw new Error("Only playing games can revive a player.");
      }
      const runtime = state.players[player.slot];
      if (runtime === undefined) {
        throw new Error(
          "Player slot is missing from authoritative simulation.",
        );
      }
      if (runtime.outcome.kind !== PlayerOutcomeKind.Defeated) {
        throw new Error("Only defeated players can revive.");
      }
      state = reviveSimulationPlayerAt(state, player.slot, partyCheckpoint);
      commandByPlayerId.set(playerId, neutralCommand);
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

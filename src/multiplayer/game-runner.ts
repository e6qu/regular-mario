import type { LevelSpec } from "../engine/domain/level-spec";
import {
  VerticalMovementState,
  type MovementConstants,
} from "../engine/simulation/movement-model";
import {
  isPlayerOutcomeDefeated,
  PlayerOutcomeKind,
} from "../engine/simulation/player-outcome";
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
import {
  hasLevelTimerExpired,
  makeInitialLevelTimerState,
} from "../engine/simulation/level-timer-state";
import { stepSimulation } from "../engine/simulation/step-simulation";
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

/**
 * Whether a phase can take input at all.
 *
 * Stated once and enforced at both ends. The runner refuses input outside these
 * phases — that refusal stays an error, because a client sending into a phase
 * that cannot accept it is a bug worth surfacing, not something to swallow. The
 * browser asks the same question before sending, so it never provokes the
 * refusal in the first place.
 *
 * The case this fixes: when one player reaches the goal the party's game becomes
 * Finished while the completion presentation plays and the lobby prepares the
 * next level. Everyone else is still holding keys, and the held-input heartbeat
 * kept firing into a finished game — so mid-level-2 the other players were shown
 * "Finished games cannot accept input."
 *
 * Exhaustive with a `never` default: a new phase must decide this explicitly
 * rather than inherit an answer.
 */
export function multiplayerPhaseAcceptsInput(
  phase: MultiplayerGamePhase,
): boolean {
  switch (phase) {
    case MultiplayerGamePhase.Waiting:
    case MultiplayerGamePhase.Playing:
    case MultiplayerGamePhase.Paused:
      // Waiting accepts input too: a player may already be holding a key when
      // the party starts, and that input queues for the first frame. Widening
      // the refusal to Waiting broke exactly that, which its test caught.
      return true;
    case MultiplayerGamePhase.Finished:
      return false;
    default: {
      const invalidPhase: never = phase;
      throw new Error(
        `Invalid multiplayer game phase: ${String(invalidPhase)}`,
      );
    }
  }
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
  togglePauseByPlayer(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  revive(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  submitInput(
    input: QueuedSimulationInput,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  step(nowMilliseconds: number): AuthoritativeGameSnapshot;
  stepPaused(nowMilliseconds: number): AuthoritativeGameSnapshot;
  snapshot(): AuthoritativeGameSnapshot;
  /**
   * The live simulation, for server logic that needs to read the world.
   *
   * Callers used to reach it by decoding `snapshot.simulationState` — a full
   * serialise and reparse of the whole world, run every frame just to read a
   * couple of pipe fields the runner was holding in memory all along.
   */
  simulationState(): SimulationState;
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
  // Serialising a complete immutable simulation is intentionally reserved for
  // a state receipt.  The authoritative loop and input queue both query game
  // state more often than the 20 Hz transport publishes it; rebuilding the
  // exact same JSON receipt on those reads used enough CPU to delay the fixed
  // frame clock under a few active games.
  let cachedSnapshot: AuthoritativeGameSnapshot | undefined;
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
    // A checkpoint is somewhere a player can stand, so it only advances while
    // the leader is on the ground.
    //
    // It used to take the leader's position outright, and a leader falling into
    // a pit is still active and still moving right for the whole descent — so
    // the checkpoint could land in mid-air over the pit. Every revive then
    // dropped the party straight back down it. A wiped party could never
    // recover: everyone spectating at the same point below the floor, the game
    // still "playing", its frame counter climbing, revive after revive dying
    // before it could move. That is how CI found this.
    if (
      cameraTarget.player.position.x > partyCheckpoint.x &&
      cameraTarget.player.movement.vertical === VerticalMovementState.Grounded
    ) {
      partyCheckpoint = cameraTarget.player.position;
    }
    cameraLeftPixels = Math.max(
      0,
      Number(cameraTarget.player.position.x) - sharedCameraWidthPixels / 2,
    );
  }

  function invalidateSnapshot(): void {
    cachedSnapshot = undefined;
  }

  function makeSnapshot(): AuthoritativeGameSnapshot {
    if (cachedSnapshot !== undefined) {
      return cachedSnapshot;
    }
    // The wire form is built on demand and remembered, from the world as it
    // stands right now. The runner produces a snapshot every 60 Hz frame but
    // the transport publishes at 20 Hz, so eagerly encoding meant two of every
    // three encodes — a full stringify and reparse of the entire world — were
    // thrown away. Capturing `state` here (rather than reading the mutable
    // binding later) keeps a retained snapshot the world it described.
    const encodedState = state;
    let encodedWireState: MultiplayerSimulationWireState | undefined;
    cachedSnapshot = {
      gameId: config.gameId,
      snapshotSequence: (snapshotSequence += 1),
      levelId: config.levelId,
      mode: config.mode,
      phase,
      frame: Number(state.clock.frameIndex),
      cameraLeftPixels,
      get simulationState(): MultiplayerSimulationWireState {
        encodedWireState ??= encodeMultiplayerSimulationState(encodedState);
        return encodedWireState;
      },
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
    return cachedSnapshot;
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
    );
    updateCamera();
    if (
      state.players.some(
        (runtime) => runtime.outcome.kind === PlayerOutcomeKind.Finished,
      )
    ) {
      phase = MultiplayerGamePhase.Finished;
    }
    invalidateSnapshot();
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
        // This client is starting a fresh input sequence at zero. Anything the
        // queue still remembers from its previous session would reject the
        // whole of the new one as out-of-order.
        inputQueue.forget(player.playerId);
        if (
          phase === MultiplayerGamePhase.Paused &&
          pausedBecausePartyIsEmpty
        ) {
          phase = MultiplayerGamePhase.Playing;
          pausedBecausePartyIsEmpty = false;
        }
        invalidateSnapshot();
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
      // A joiner materialises at the party checkpoint: the most recent spot an
      // active member actually stood, the same place a revive uses. The
      // camera-centre spawn this replaces was not a place anyone had been — on
      // a party near a course's end it could sit past the goal, and beyond a
      // short course's edge entirely, where the joiner fell out of the world
      // before touching it. Spawning on a teammate is fine: players are solid
      // and the collision step separates overlapping bodies.
      state = appendSimulationPlayerAt(state, partyCheckpoint);
      players = [
        ...players,
        { ...player, slot: players.length, connected: true },
      ];
      commandByPlayerId.set(player.playerId, neutralCommand);
      invalidateSnapshot();
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
        inputQueue.forget(playerId);
        if (phase === MultiplayerGamePhase.Playing) {
          phase = MultiplayerGamePhase.Paused;
          pausedBecausePartyIsEmpty = true;
        }
        invalidateSnapshot();
        return makeSnapshot();
      }
      state = removeSimulationPlayerAt(state, leaving.slot);
      players = players
        .filter((candidate) => candidate.playerId !== playerId)
        .map((candidate, slot) => ({ ...candidate, slot }));
      commandByPlayerId.delete(playerId);
      acknowledgedInputSequenceByPlayerId.delete(playerId);
      acknowledgementLagByPlayerId.delete(playerId);
      inputQueue.forget(playerId);
      invalidateSnapshot();
      return makeSnapshot();
    },
    updateProfile(player) {
      requirePlayer(player.playerId);
      players = players.map((candidate) =>
        candidate.playerId === player.playerId
          ? { ...player, slot: candidate.slot, connected: candidate.connected }
          : candidate,
      );
      invalidateSnapshot();
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
      invalidateSnapshot();
      return makeSnapshot();
    },
    pause() {
      if (phase !== MultiplayerGamePhase.Playing) {
        throw new Error("Only playing games can be paused.");
      }
      phase = MultiplayerGamePhase.Paused;
      pausedBecausePartyIsEmpty = false;
      invalidateSnapshot();
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
      invalidateSnapshot();
      return makeSnapshot();
    },
    resumeByPlayer(playerId) {
      requirePlayer(playerId);
      return this.resume();
    },
    togglePauseByPlayer(playerId) {
      requirePlayer(playerId);
      if (phase === MultiplayerGamePhase.Playing) {
        return this.pause();
      }
      if (phase === MultiplayerGamePhase.Paused) {
        return this.resume();
      }
      throw new Error("Only live games can toggle pause.");
    },
    revive(playerId) {
      const player = requirePlayer(playerId);
      if (
        phase !== MultiplayerGamePhase.Playing &&
        phase !== MultiplayerGamePhase.Paused
      ) {
        throw new Error("Only live or paused games can revive a player.");
      }
      const runtime = state.players[player.slot];
      if (runtime === undefined) {
        throw new Error(
          "Player slot is missing from authoritative simulation.",
        );
      }
      // Both defeat-carrying variants revive, not just `Defeated`: a player
      // killed on the goal is `DefeatedAndFinished` and was refused here.
      if (!isPlayerOutcomeDefeated(runtime.outcome)) {
        throw new Error("Only defeated players can revive.");
      }
      state = reviveSimulationPlayerAt(state, player.slot, partyCheckpoint);
      // A revive into an expired clock is not a revive: the next step times the
      // player out again, and the party is right back where it was. Time-up now
      // defeats the whole party rather than the creator alone, so without this
      // the run would dead-end exactly the way a checkpoint over a pit did.
      // Winding the clock back is the only way back into play that does not
      // invent a game-over flow this runner does not have.
      if (hasLevelTimerExpired(state.levelTimer)) {
        state = {
          ...state,
          levelTimer: makeInitialLevelTimerState(config.levelSpec),
        };
      }
      commandByPlayerId.set(playerId, neutralCommand);
      invalidateSnapshot();
      return makeSnapshot();
    },
    submitInput(input, nowMilliseconds) {
      requirePlayer(input.playerId);
      if (!multiplayerPhaseAcceptsInput(phase)) {
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
        invalidateSnapshot();
      }
      return makeSnapshot();
    },
    snapshot: makeSnapshot,
    simulationState: () => state,
  };
}

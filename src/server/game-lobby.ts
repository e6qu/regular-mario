import type { LevelSpec } from "../engine/domain/level-spec";
import type { TilePoint } from "../engine/domain/units";
import type { MovementConstants } from "../engine/simulation/movement-model";
import { teleportPlayerToTilePosition } from "../engine/simulation/pipe-state";
import {
  makeInitialSimulationState,
  type SimulationState,
} from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
import { PipeEntryPhase } from "../engine/simulation/pipe-state";
import {
  requireMultiplayerGameId,
  type MultiplayerGameId,
  type MultiplayerPlayerId,
} from "../multiplayer/domain";
import type { MultiplayerGameMode } from "../multiplayer/domain";
import {
  makeAuthoritativeGameRunner,
  MultiplayerGamePhase,
  type AuthoritativeGameRunner,
  type AuthoritativeGameSnapshot,
  type MultiplayerPlayerProfile,
} from "../multiplayer/game-runner";
import { decodeMultiplayerSimulationState } from "../multiplayer/simulation-wire";
import { multiplayerCompletionPresentationMilliseconds } from "../multiplayer/completion-presentation";
import type { QueuedSimulationInput } from "../multiplayer/input-queue";
import {
  makeEphemeralChatRoom,
  type ChatMessage,
  type EphemeralChatRoom,
} from "./chat";

export type ServerLevelOption = {
  readonly id: string;
  readonly label: string;
  readonly levelSpec: LevelSpec;
};

export type PublicGameSummary = {
  readonly gameId: MultiplayerGameId;
  readonly creator: MultiplayerPlayerProfile;
  readonly levelId: string;
  readonly mode: MultiplayerGameMode;
  readonly phase: MultiplayerGamePhase;
  readonly playerCount: number;
  readonly maximumPlayerCount: number;
};

type HostedGame = {
  readonly creatorPlayerId: MultiplayerPlayerId;
  readonly creator: MultiplayerPlayerProfile;
  levelId: string;
  runner: AuthoritativeGameRunner;
  readonly chat: EphemeralChatRoom;
  pendingWarp: PipeWarpTarget | undefined;
  completionReadyAtMilliseconds: number | undefined;
};

type PipeWarpTarget = {
  readonly levelId: string;
  readonly targetTilePosition: TilePoint;
};

export type MultiplayerLobby = {
  createGame(
    creator: MultiplayerPlayerProfile,
    levelId: string,
    mode: MultiplayerGameMode,
  ): PublicGameSummary;
  joinGame(
    player: MultiplayerPlayerProfile,
    gameId: MultiplayerGameId,
  ): PublicGameSummary;
  leaveGame(playerId: MultiplayerPlayerId): void;
  revivePlayer(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  pauseGameByPlayer(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  resumeGameByPlayer(playerId: MultiplayerPlayerId): AuthoritativeGameSnapshot;
  updatePlayerProfile(player: MultiplayerPlayerProfile): void;
  startGame(
    playerId: MultiplayerPlayerId,
    gameId: MultiplayerGameId,
  ): PublicGameSummary;
  endGame(playerId: MultiplayerPlayerId, gameId: MultiplayerGameId): void;
  pauseGame(gameId: MultiplayerGameId): AuthoritativeGameSnapshot;
  resumeGame(gameId: MultiplayerGameId): AuthoritativeGameSnapshot;
  stepPausedGame(
    gameId: MultiplayerGameId,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  gameForPlayer(playerId: MultiplayerPlayerId): MultiplayerGameId | undefined;
  games(): readonly PublicGameSummary[];
  gameSnapshot(gameId: MultiplayerGameId): AuthoritativeGameSnapshot;
  submitGameInput(
    input: QueuedSimulationInput,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  stepAll(nowMilliseconds: number): readonly AuthoritativeGameSnapshot[];
  sendLobbyChat(
    player: MultiplayerPlayerProfile,
    text: string,
    nowMilliseconds: number,
  ): ChatMessage;
  lobbyMessages(): readonly ChatMessage[];
  sendGameChat(
    player: MultiplayerPlayerProfile,
    gameId: MultiplayerGameId,
    text: string,
    nowMilliseconds: number,
  ): ChatMessage;
  gameMessages(gameId: MultiplayerGameId): readonly ChatMessage[];
};

export type MakeMultiplayerLobbyConfig = {
  readonly levels: readonly ServerLevelOption[];
  /** Non-selectable bundled areas that an entry pipe may target. */
  readonly linkedLevels: readonly ServerLevelOption[];
  readonly movementConstants: MovementConstants;
  readonly nextGameId: () => string;
};

export function makeMultiplayerLobby(
  config: MakeMultiplayerLobbyConfig,
): MultiplayerLobby {
  if (config.levels.length === 0) {
    throw new Error("Multiplayer lobby requires at least one bundled level.");
  }
  const levelById = new Map(config.levels.map((level) => [level.id, level]));
  for (const linkedLevel of config.linkedLevels) {
    if (levelById.has(linkedLevel.id)) {
      throw new Error(`Bundled level ${linkedLevel.id} was registered twice.`);
    }
    levelById.set(linkedLevel.id, linkedLevel);
  }
  const gamesById = new Map<MultiplayerGameId, HostedGame>();
  const gameIdByPlayerId = new Map<MultiplayerPlayerId, MultiplayerGameId>();
  const lobbyChat = makeEphemeralChatRoom();

  function requireGame(gameId: MultiplayerGameId): HostedGame {
    const game = gamesById.get(gameId);
    if (game === undefined) {
      throw new Error("Game does not exist.");
    }
    return game;
  }

  function summary(
    gameId: MultiplayerGameId,
    game: HostedGame,
  ): PublicGameSummary {
    const snapshot = game.runner.snapshot();
    return {
      gameId,
      creator: game.creator,
      levelId: game.levelId,
      mode: snapshot.mode,
      phase: snapshot.phase,
      playerCount: snapshot.players.length,
      maximumPlayerCount: 16,
    };
  }

  function assertPlayerHasNoOtherGame(playerId: MultiplayerPlayerId): void {
    if (gameIdByPlayerId.has(playerId)) {
      throw new Error("A player may belong to only one game at a time.");
    }
  }

  function makeRunner(
    gameId: MultiplayerGameId,
    creator: MultiplayerPlayerProfile,
    levelId: string,
    mode: MultiplayerGameMode,
    members: readonly MultiplayerPlayerProfile[],
    pipeDestination: TilePoint | undefined = undefined,
  ): AuthoritativeGameRunner {
    const level = levelById.get(levelId);
    if (level === undefined) {
      throw new Error("Selected level is not a bundled multiplayer level.");
    }
    const initialState = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      level.levelSpec,
      config.movementConstants,
    );
    if (!initialState.ok) {
      throw new Error(
        "Selected level cannot create an initial simulation state.",
      );
    }
    const stateAtPipeDestination =
      pipeDestination === undefined
        ? initialState.value
        : {
            ...initialState.value,
            players: [
              {
                ...initialState.value.players[0],
                player: teleportPlayerToTilePosition(
                  initialState.value.players[0].player,
                  pipeDestination,
                  level.levelSpec,
                ),
              },
            ] as SimulationState["players"],
          };
    const runner = makeAuthoritativeGameRunner({
      gameId,
      levelId,
      creator,
      mode,
      initialState: stateAtPipeDestination,
      levelSpec: level.levelSpec,
      movementConstants: config.movementConstants,
    });
    for (const member of members.slice(1)) {
      runner.join(member);
    }
    return runner;
  }

  function nextLevelId(levelId: string): string | undefined {
    const index = config.levels.findIndex((level) => level.id === levelId);
    if (index < 0) {
      throw new Error("Current game level is not bundled.");
    }
    return config.levels[index + 1]?.id;
  }

  function advanceCompletedGame(
    gameId: MultiplayerGameId,
    game: HostedGame,
  ): AuthoritativeGameSnapshot | undefined {
    const nextId = nextLevelId(game.levelId);
    if (nextId === undefined) {
      return undefined;
    }
    const previous = game.runner.snapshot();
    const members = previous.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
    }));
    const creator = members.find(
      (member) => member.playerId === game.creatorPlayerId,
    );
    if (creator === undefined) {
      throw new Error("Game creator is absent from its own game.");
    }
    game.levelId = nextId;
    game.runner = makeRunner(gameId, creator, nextId, previous.mode, members);
    game.runner.start(game.creatorPlayerId);
    return game.runner.snapshot();
  }

  function advancePipeWarp(
    gameId: MultiplayerGameId,
    game: HostedGame,
    snapshot: AuthoritativeGameSnapshot,
  ): AuthoritativeGameSnapshot | undefined {
    const state = decodeMultiplayerSimulationState(snapshot.simulationState);
    if (
      state.pipeEntry.phase === PipeEntryPhase.Entering &&
      state.pipeEntry.targetLevelName !== undefined
    ) {
      if (!levelById.has(state.pipeEntry.targetLevelName)) {
        throw new Error(
          `Entry pipe targets unavailable bundled level ${state.pipeEntry.targetLevelName}.`,
        );
      }
      game.pendingWarp = {
        levelId: state.pipeEntry.targetLevelName,
        targetTilePosition: state.pipeEntry.targetTilePosition,
      };
      return undefined;
    }
    const pendingWarp = game.pendingWarp;
    if (
      pendingWarp === undefined ||
      state.pipeEntry.phase !== PipeEntryPhase.None
    ) {
      return undefined;
    }
    const members = snapshot.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
    }));
    const firstMember = members[0];
    if (firstMember === undefined) {
      throw new Error("A running entry pipe cannot warp an empty party.");
    }
    game.levelId = pendingWarp.levelId;
    game.runner = makeRunner(
      gameId,
      firstMember,
      pendingWarp.levelId,
      snapshot.mode,
      members,
      pendingWarp.targetTilePosition,
    );
    game.runner.start(firstMember.playerId);
    game.pendingWarp = undefined;
    return game.runner.snapshot();
  }

  return {
    createGame(creator, levelId, mode) {
      assertPlayerHasNoOtherGame(creator.playerId);
      const gameId = requireMultiplayerGameId(config.nextGameId());
      if (gamesById.has(gameId)) {
        throw new Error("Generated game ID already exists.");
      }
      const game: HostedGame = {
        creatorPlayerId: creator.playerId,
        creator,
        levelId,
        runner: makeRunner(gameId, creator, levelId, mode, [creator]),
        chat: makeEphemeralChatRoom(),
        pendingWarp: undefined,
        completionReadyAtMilliseconds: undefined,
      };
      gamesById.set(gameId, game);
      gameIdByPlayerId.set(creator.playerId, gameId);
      return summary(gameId, game);
    },
    joinGame(player, gameId) {
      assertPlayerHasNoOtherGame(player.playerId);
      const game = requireGame(gameId);
      game.runner.join(player);
      gameIdByPlayerId.set(player.playerId, gameId);
      return summary(gameId, game);
    },
    leaveGame(playerId) {
      const gameId = gameIdByPlayerId.get(playerId);
      if (gameId === undefined) {
        return;
      }
      const game = requireGame(gameId);
      game.runner.leave(playerId);
      gameIdByPlayerId.delete(playerId);
    },
    revivePlayer(playerId) {
      const gameId = gameIdByPlayerId.get(playerId);
      if (gameId === undefined) {
        throw new Error("Only game members can revive.");
      }
      return requireGame(gameId).runner.revive(playerId);
    },
    pauseGameByPlayer(playerId) {
      const gameId = gameIdByPlayerId.get(playerId);
      if (gameId === undefined) {
        throw new Error("Only game members can pause.");
      }
      return requireGame(gameId).runner.pauseByPlayer(playerId);
    },
    resumeGameByPlayer(playerId) {
      const gameId = gameIdByPlayerId.get(playerId);
      if (gameId === undefined) {
        throw new Error("Only game members can resume.");
      }
      return requireGame(gameId).runner.resumeByPlayer(playerId);
    },
    updatePlayerProfile(player) {
      const gameId = gameIdByPlayerId.get(player.playerId);
      if (gameId !== undefined) {
        requireGame(gameId).runner.updateProfile(player);
      }
    },
    startGame(playerId, gameId) {
      const game = requireGame(gameId);
      game.runner.start(playerId);
      return summary(gameId, game);
    },
    endGame(playerId, gameId) {
      const game = requireGame(gameId);
      if (gameIdByPlayerId.get(playerId) !== gameId) {
        throw new Error("Only current game members can cancel this game.");
      }
      gamesById.delete(gameId);
      for (const player of game.runner.snapshot().players) {
        gameIdByPlayerId.delete(player.playerId);
      }
    },
    pauseGame(gameId) {
      return requireGame(gameId).runner.pause();
    },
    resumeGame(gameId) {
      return requireGame(gameId).runner.resume();
    },
    stepPausedGame(gameId, nowMilliseconds) {
      return requireGame(gameId).runner.stepPaused(nowMilliseconds);
    },
    gameForPlayer(playerId) {
      return gameIdByPlayerId.get(playerId);
    },
    games() {
      return [...gamesById.entries()].map(([gameId, game]) =>
        summary(gameId, game),
      );
    },
    gameSnapshot(gameId) {
      return requireGame(gameId).runner.snapshot();
    },
    submitGameInput(input, nowMilliseconds) {
      const gameId = gameIdByPlayerId.get(input.playerId);
      if (gameId === undefined) {
        throw new Error("Only game members can send game input.");
      }
      return requireGame(gameId).runner.submitInput(input, nowMilliseconds);
    },
    stepAll(nowMilliseconds) {
      const snapshots: AuthoritativeGameSnapshot[] = [];
      const completedGameIds: MultiplayerGameId[] = [];
      for (const [gameId, game] of gamesById.entries()) {
        const current = game.runner.snapshot();
        if (current.phase === MultiplayerGamePhase.Finished) {
          if (game.completionReadyAtMilliseconds === undefined) {
            game.completionReadyAtMilliseconds =
              nowMilliseconds + multiplayerCompletionPresentationMilliseconds;
          }
          if (nowMilliseconds < game.completionReadyAtMilliseconds) {
            snapshots.push(current);
            continue;
          }
          const advanced = advanceCompletedGame(gameId, game);
          if (advanced === undefined) {
            completedGameIds.push(gameId);
          } else {
            game.completionReadyAtMilliseconds = undefined;
            snapshots.push(advanced);
          }
          continue;
        }
        if (current.phase === MultiplayerGamePhase.Playing) {
          const snapshot = game.runner.step(nowMilliseconds);
          snapshots.push(snapshot);
          const warped = advancePipeWarp(gameId, game, snapshot);
          if (warped !== undefined) {
            snapshots[snapshots.length - 1] = warped;
            continue;
          }
          if (snapshot.phase === MultiplayerGamePhase.Finished) {
            game.completionReadyAtMilliseconds =
              nowMilliseconds + multiplayerCompletionPresentationMilliseconds;
          }
        }
      }
      for (const gameId of completedGameIds) {
        const completedGame = requireGame(gameId);
        gamesById.delete(gameId);
        for (const player of completedGame.runner.snapshot().players) {
          gameIdByPlayerId.delete(player.playerId);
        }
      }
      return snapshots;
    },
    sendLobbyChat(player, text, nowMilliseconds) {
      return lobbyChat.send(
        player.playerId,
        player.nickname,
        text,
        nowMilliseconds,
      );
    },
    lobbyMessages() {
      return lobbyChat.messages();
    },
    sendGameChat(player, gameId, text, nowMilliseconds) {
      const game = requireGame(gameId);
      if (gameIdByPlayerId.get(player.playerId) !== gameId) {
        throw new Error("Only game members can chat in a game.");
      }
      return game.chat.send(
        player.playerId,
        player.nickname,
        text,
        nowMilliseconds,
      );
    },
    gameMessages(gameId) {
      return requireGame(gameId).chat.messages();
    },
  };
}

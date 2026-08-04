import type { LevelSpec } from "../engine/domain/level-spec";
import type { MovementConstants } from "../engine/simulation/movement-model";
import { makeInitialSimulationState } from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
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
  readonly levelId: string;
  readonly runner: AuthoritativeGameRunner;
  readonly chat: EphemeralChatRoom;
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

  return {
    createGame(creator, levelId, mode) {
      assertPlayerHasNoOtherGame(creator.playerId);
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
      const gameId = requireMultiplayerGameId(config.nextGameId());
      if (gamesById.has(gameId)) {
        throw new Error("Generated game ID already exists.");
      }
      const game: HostedGame = {
        creatorPlayerId: creator.playerId,
        creator,
        levelId,
        runner: makeAuthoritativeGameRunner({
          gameId,
          creator,
          mode,
          initialState: initialState.value,
          levelSpec: level.levelSpec,
          movementConstants: config.movementConstants,
        }),
        chat: makeEphemeralChatRoom(),
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
      if (game.runner.snapshot().players.length === 1) {
        gamesById.delete(gameId);
        gameIdByPlayerId.delete(playerId);
        return;
      }
      game.runner.leave(playerId);
      gameIdByPlayerId.delete(playerId);
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
      if (game.creatorPlayerId !== playerId) {
        throw new Error("Only the game creator can end this game.");
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
        if (game.runner.snapshot().phase === MultiplayerGamePhase.Playing) {
          const snapshot = game.runner.step(nowMilliseconds);
          snapshots.push(snapshot);
          if (snapshot.phase === MultiplayerGamePhase.Finished) {
            completedGameIds.push(gameId);
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

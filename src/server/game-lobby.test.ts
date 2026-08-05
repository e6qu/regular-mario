import { describe, expect, it } from "vitest";

import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import {
  MultiplayerGameMode,
  requireMultiplayerAvatar,
  requireMultiplayerGameId,
  requireMultiplayerNickname,
  requireMultiplayerPlayerId,
} from "../multiplayer/domain";
import type { MultiplayerPlayerProfile } from "../multiplayer/game-runner";
import { MultiplayerGamePhase } from "../multiplayer/game-runner";
import { makeMultiplayerLobby } from "./game-lobby";

function profile(id: string, nickname: string): MultiplayerPlayerProfile {
  return {
    playerId: requireMultiplayerPlayerId(id),
    nickname: requireMultiplayerNickname(nickname),
    avatarId: requireMultiplayerAvatar("castaway"),
  };
}

function makeLobby() {
  let id = 0;
  return makeMultiplayerLobby({
    levels: [
      {
        id: "first-authored",
        label: "First Authored Level",
        levelSpec: firstAuthoredLevelSpec(),
      },
    ],
    movementConstants: initialMovementConstants,
    nextGameId: () => `game-${++id}`,
  });
}

describe("public multiplayer lobby", () => {
  it("lists public games and limits each player to one active game", () => {
    const lobby = makeLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const game = lobby.createGame(
      mira,
      "first-authored",
      MultiplayerGameMode.Regular,
    );
    expect(lobby.games()).toEqual([game]);
    expect(lobby.joinGame(ren, game.gameId).playerCount).toBe(2);
    expect(() =>
      lobby.createGame(ren, "first-authored", MultiplayerGameMode.Revenge),
    ).toThrow("only one game");
  });

  it("lets only a creator start/end a game and steps all playing games", () => {
    const lobby = makeLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const game = lobby.createGame(
      mira,
      "first-authored",
      MultiplayerGameMode.Revenge,
    );
    expect(() => lobby.startGame(ren.playerId, game.gameId)).toThrow("creator");
    expect(lobby.startGame(mira.playerId, game.gameId).phase).toBe(
      MultiplayerGamePhase.Playing,
    );
    expect(lobby.stepAll(1)).toHaveLength(1);
    expect(() => lobby.endGame(ren.playerId, game.gameId)).toThrow("creator");
    lobby.endGame(mira.playerId, game.gameId);
    expect(lobby.games()).toEqual([]);
  });

  it("keeps lobby and game chat separate and membership-gated", () => {
    const lobby = makeLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const game = lobby.createGame(
      mira,
      "first-authored",
      MultiplayerGameMode.Regular,
    );
    lobby.sendLobbyChat(mira, "lobby hello", 0);
    lobby.sendGameChat(mira, game.gameId, "game hello", 0);
    expect(lobby.lobbyMessages()).toHaveLength(1);
    expect(lobby.gameMessages(requireMultiplayerGameId("game-1"))).toHaveLength(
      1,
    );
    expect(() => lobby.sendGameChat(ren, game.gameId, "intrude", 0)).toThrow(
      "members",
    );
  });

  it("lets a player leave to join another game and removes an empty game", () => {
    const lobby = makeLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const first = lobby.createGame(
      mira,
      "first-authored",
      MultiplayerGameMode.Regular,
    );
    lobby.joinGame(ren, first.gameId);
    lobby.leaveGame(ren.playerId);
    expect(lobby.gameForPlayer(ren.playerId)).toBeUndefined();
    const second = lobby.createGame(
      ren,
      "first-authored",
      MultiplayerGameMode.Regular,
    );
    expect(second.playerCount).toBe(1);
    lobby.leaveGame(mira.playerId);
    expect(lobby.games().map((game) => game.gameId)).toEqual([second.gameId]);
  });

  it("lets a spectator-sized slot leave and rejoin the same running party", () => {
    const lobby = makeLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const game = lobby.createGame(
      mira,
      "first-authored",
      MultiplayerGameMode.Regular,
    );
    lobby.joinGame(ren, game.gameId);
    lobby.startGame(mira.playerId, game.gameId);

    // This is the server operation used by the death-spectator drawer. It
    // must free the slot even though the game itself keeps running for Mira.
    lobby.leaveGame(ren.playerId);
    expect(lobby.gameForPlayer(ren.playerId)).toBeUndefined();
    expect(lobby.games()).toMatchObject([
      {
        gameId: game.gameId,
        playerCount: 1,
        phase: MultiplayerGamePhase.Playing,
      },
    ]);

    const rejoined = lobby.joinGame(ren, game.gameId);
    expect(rejoined).toMatchObject({
      gameId: game.gameId,
      playerCount: 2,
      phase: MultiplayerGamePhase.Playing,
    });
    expect(lobby.gameForPlayer(ren.playerId)).toBe(game.gameId);
  });
});

import { describe, expect, it } from "vitest";

import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import { finishRouteLevelInput } from "../engine/levels/finish-route-level";
import { multiplayerCompletionPresentationMilliseconds } from "../multiplayer/completion-presentation";
import { HorizontalInput } from "../engine/simulation/input-command";
import { makeLevelSpec } from "../engine/domain/level-spec";
import {
  warpRouteLevelInput,
  warpRouteUndergroundLevelInput,
  warpRouteUndergroundLevelName,
} from "../engine/levels/warp-route-level";
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
import { decodeMultiplayerSimulationState } from "../multiplayer/simulation-wire";
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
    linkedLevels: [],
    movementConstants: initialMovementConstants,
    nextGameId: () => `game-${++id}`,
  });
}

function createRegularGame(
  lobby: ReturnType<typeof makeLobby>,
  creator: ReturnType<typeof profile>,
) {
  return lobby.createGame(
    creator,
    "first-authored",
    MultiplayerGameMode.Regular,
  );
}

function makeStartedGameWithTwoProfiles() {
  const lobby = makeLobby();
  const mira = profile("mira", "Mira");
  const ren = profile("ren", "Ren");
  const game = createRegularGame(lobby, mira);
  lobby.startGame(mira.playerId, game.gameId);
  return { lobby, mira, ren, game };
}

function requireWarpRouteLevelSpec() {
  const result = makeLevelSpec({
    ...warpRouteLevelInput,
    actors: warpRouteLevelInput.actors.map((actor) =>
      actor.entityId === "warp-pipe-1" ? { ...actor, x: 1 } : actor,
    ),
  });
  if (!result.ok) {
    throw new Error("Expected the test warp route to validate.");
  }
  return result.value;
}

function requireWarpRouteUndergroundLevelSpec() {
  const result = makeLevelSpec(warpRouteUndergroundLevelInput);
  if (!result.ok) {
    throw new Error("Expected the test underground route to validate.");
  }
  return result.value;
}

function makeTwoCourseLobby() {
  let id = 0;
  return makeMultiplayerLobby({
    levels: [
      {
        id: "finish-route",
        label: "Finish Route",
        levelSpec: requireFinishRouteLevelSpec(),
      },
      {
        id: "first-authored",
        label: "First Authored Level",
        levelSpec: firstAuthoredLevelSpec(),
      },
    ],
    linkedLevels: [],
    movementConstants: initialMovementConstants,
    nextGameId: () => `game-${++id}`,
  });
}

function requireFinishRouteLevelSpec() {
  const result = makeLevelSpec(finishRouteLevelInput);
  if (!result.ok) {
    throw new Error("Expected the finish route to validate.");
  }
  return result.value;
}

describe("public multiplayer lobby", () => {
  it("lists public games and limits each player to one active game", () => {
    const lobby = makeLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const game = createRegularGame(lobby, mira);
    expect(lobby.games()).toEqual([game]);
    expect(lobby.joinGame(ren, game.gameId).playerCount).toBe(2);
    expect(() =>
      lobby.createGame(ren, "first-authored", MultiplayerGameMode.Revenge),
    ).toThrow("only one game");
  });

  it("lets only a creator start but any current member cancel a game", () => {
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
    expect(() => lobby.endGame(ren.playerId, game.gameId)).toThrow("member");
    lobby.joinGame(ren, game.gameId);
    lobby.endGame(ren.playerId, game.gameId);
    expect(lobby.games()).toEqual([]);
  });

  it("authoritatively hands an entry pipe into its linked bundled area", () => {
    let id = 0;
    const lobby = makeMultiplayerLobby({
      levels: [
        {
          id: "warp-route",
          label: "Warp Route",
          levelSpec: requireWarpRouteLevelSpec(),
        },
      ],
      linkedLevels: [
        {
          id: warpRouteUndergroundLevelName,
          label: "Warp Route Underground",
          levelSpec: requireWarpRouteUndergroundLevelSpec(),
        },
      ],
      movementConstants: initialMovementConstants,
      nextGameId: () => `game-${++id}`,
    });
    const mira = profile("mira", "Mira");
    const game = lobby.createGame(
      mira,
      "warp-route",
      MultiplayerGameMode.Regular,
    );
    lobby.startGame(mira.playerId, game.gameId);
    lobby.submitGameInput(
      {
        playerId: mira.playerId,
        sequence: 1,
        intendedFrame: 1,
        receivedAtMilliseconds: 0,
        command: {
          horizontal: HorizontalInput.Neutral,
          jumpPressed: false,
          runHeld: false,
          firePressed: false,
          upHeld: false,
          downHeld: true,
        },
      },
      0,
    );
    for (let frame = 1; frame <= 32; frame += 1) {
      lobby.stepAll(frame);
    }

    const handoff = lobby.gameSnapshot(game.gameId);
    expect(handoff).toMatchObject({
      levelId: warpRouteUndergroundLevelName,
      phase: MultiplayerGamePhase.Playing,
      frame: 1,
    });
    // A cross-level pipe must retain its declared destination, never rebuild
    // the target area at that level's ordinary player-start tile.
    const pipeArrival = decodeMultiplayerSimulationState(
      handoff.simulationState,
    ).players[0].player.position;
    expect(pipeArrival.x).toBe(32);
    // The first frame has gravity after the teleport, so it is just below the
    // exact feet-anchored tile position rather than at the target level start.
    expect(pipeArrival.y).toBeGreaterThan(32);
    expect(pipeArrival.y).toBeLessThan(33);
  });

  // The party handoff to the next course: one member reaches the goal and the
  // whole party — every member, not just the finisher — is handed the next
  // level. Only the four-browser test covered this, and it covered it by
  // asking an autopilot to platform a real Super Mario course, which no
  // harness can do reliably. Asserted here where it is deterministic.
  it("hands the whole party its next course when a member finishes", () => {
    const lobby = makeTwoCourseLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const game = lobby.createGame(
      mira,
      "finish-route",
      MultiplayerGameMode.Regular,
    );
    lobby.joinGame(ren, game.gameId);
    lobby.startGame(mira.playerId, game.gameId);

    // Run the creator right until somebody reaches the goal.
    let finished = false;
    let frame = 1;
    for (; frame <= 2_000 && !finished; frame += 1) {
      lobby.submitGameInput(
        {
          playerId: mira.playerId,
          sequence: frame,
          intendedFrame: frame,
          receivedAtMilliseconds: frame,
          command: {
            horizontal: HorizontalInput.Right,
            jumpPressed: false,
            runHeld: true,
            firePressed: false,
            upHeld: false,
            downHeld: false,
          },
        },
        frame,
      );
      lobby.stepAll(frame);
      finished =
        lobby.gameSnapshot(game.gameId).phase === MultiplayerGamePhase.Finished;
    }
    expect(finished, "a player should have reached the goal").toBe(true);

    // The completion presentation plays before the handoff.
    lobby.stepAll(frame + multiplayerCompletionPresentationMilliseconds);

    const handoff = lobby.gameSnapshot(game.gameId);
    expect(handoff.levelId).toBe("first-authored");
    expect(handoff.phase).toBe(MultiplayerGamePhase.Playing);
    expect(
      handoff.players.map((player) => player.playerId).sort(),
      "both members carry over into the next course",
    ).toEqual([mira.playerId, ren.playerId].sort());
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

  it("keeps a final-player departure as a paused public game", () => {
    const lobby = makeLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const first = createRegularGame(lobby, mira);
    lobby.joinGame(ren, first.gameId);
    lobby.leaveGame(ren.playerId);
    expect(lobby.gameForPlayer(ren.playerId)).toBeUndefined();
    const second = createRegularGame(lobby, ren);
    expect(second.playerCount).toBe(1);
    lobby.leaveGame(mira.playerId);
    expect(lobby.games()).toMatchObject([
      {
        gameId: first.gameId,
        playerCount: 0,
        phase: MultiplayerGamePhase.Waiting,
      },
      { gameId: second.gameId, playerCount: 1 },
    ]);
  });

  it("resumes an empty-paused running game when a member reclaims its slot", () => {
    const { lobby, mira, ren, game } = makeStartedGameWithTwoProfiles();
    lobby.leaveGame(mira.playerId);
    expect(lobby.games()).toMatchObject([
      {
        gameId: game.gameId,
        playerCount: 0,
        phase: MultiplayerGamePhase.Paused,
      },
    ]);
    expect(lobby.joinGame(ren, game.gameId)).toMatchObject({
      playerCount: 1,
      phase: MultiplayerGamePhase.Playing,
    });
    expect(lobby.stepAll(1)).toMatchObject([
      { gameId: game.gameId, frame: 1, phase: MultiplayerGamePhase.Playing },
    ]);
  });

  it("keeps a deliberate player pause paused when another member joins", () => {
    const { lobby, mira, ren, game } = makeStartedGameWithTwoProfiles();
    lobby.pauseGameByPlayer(mira.playerId);

    expect(lobby.joinGame(ren, game.gameId)).toMatchObject({
      playerCount: 2,
      phase: MultiplayerGamePhase.Paused,
    });
  });

  it("lets a spectator-sized slot leave and rejoin the same running party", () => {
    const lobby = makeLobby();
    const mira = profile("mira", "Mira");
    const ren = profile("ren", "Ren");
    const game = createRegularGame(lobby, mira);
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

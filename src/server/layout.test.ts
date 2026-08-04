import { describe, expect, it } from "vitest";

import {
  requireMultiplayerAvatar,
  requireMultiplayerGameId,
  requireMultiplayerNickname,
  requireMultiplayerPlayerId,
  MultiplayerGameMode,
} from "../multiplayer/domain";
import {
  MultiplayerGamePhase,
  type MultiplayerPlayerProfile,
} from "../multiplayer/game-runner";
import { makeAdminLayout, makeLobbyLayout, makeLoginLayout } from "./layout";

const profile: MultiplayerPlayerProfile = {
  playerId: requireMultiplayerPlayerId("mira"),
  nickname: requireMultiplayerNickname("Mira"),
  avatarId: requireMultiplayerAvatar("castaway"),
};

describe("semantic multiplayer layout", () => {
  it("renders the same inspectable tree the browser consumes", () => {
    const game = {
      gameId: requireMultiplayerGameId("game-1"),
      creator: profile,
      levelId: "first-authored",
      mode: MultiplayerGameMode.Regular,
      phase: MultiplayerGamePhase.Waiting,
      playerCount: 1,
      maximumPlayerCount: 16,
    };
    expect(makeLoginLayout()).toMatchObject({
      role: "main",
      label: "Multiplayer login",
    });
    const lobbyChildren = makeLobbyLayout(profile, [game]).children;
    expect(lobbyChildren.some((child) => child.label === "Public games")).toBe(
      true,
    );
    expect(lobbyChildren.some((child) => child.label === "Lobby chat")).toBe(
      true,
    );
    expect(makeAdminLayout([game])).toMatchObject({ role: "main" });
  });
});

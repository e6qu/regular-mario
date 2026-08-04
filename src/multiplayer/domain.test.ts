import { describe, expect, it } from "vitest";

import {
  MultiplayerGameMode,
  multiplayerAvatars,
  multiplayerMaximumPlayers,
  requireMultiplayerAvatar,
  requireMultiplayerGameId,
  requireMultiplayerNickname,
} from "./domain";

describe("multiplayer domain", () => {
  it("exposes an original fixed avatar roster and the simulation player cap", () => {
    expect(multiplayerMaximumPlayers).toBe(16);
    expect(multiplayerAvatars.map((avatar) => avatar.id)).toEqual([
      "castaway",
      "tidekeeper",
      "brass-scout",
      "moss-runner",
      "cloud-sailor",
      "ember-warden",
    ]);
  });

  it("validates transport identities and visible nicknames loudly", () => {
    expect(requireMultiplayerGameId("game-4")).toBe("game-4");
    expect(requireMultiplayerAvatar("castaway")).toBe("castaway");
    expect(requireMultiplayerNickname("  Mira  ")).toBe("Mira");
    expect(() => requireMultiplayerGameId("GAME")).toThrow("gameId");
    expect(() => requireMultiplayerAvatar("goomba")).toThrow("avatarId");
    expect(() => requireMultiplayerNickname("no")).toThrow("nickname");
    expect(() => requireMultiplayerNickname("Mi\nra")).toThrow("control");
  });

  it("models the two public game modes explicitly", () => {
    expect(MultiplayerGameMode.Regular).toBe("regular");
    expect(MultiplayerGameMode.Revenge).toBe("revenge");
  });
});

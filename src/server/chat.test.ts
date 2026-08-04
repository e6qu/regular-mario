import { describe, expect, it } from "vitest";

import {
  multiplayerChatMaximumCharacters,
  requireMultiplayerNickname,
  requireMultiplayerPlayerId,
} from "../multiplayer/domain";
import { makeEphemeralChatRoom } from "./chat";

describe("ephemeral chat room", () => {
  it("retains messages only in memory and enforces the agreed size/rate limits", () => {
    const room = makeEphemeralChatRoom();
    const playerId = requireMultiplayerPlayerId("mira");
    const nickname = requireMultiplayerNickname("Mira");
    expect(room.send(playerId, nickname, "  hello friends  ", 0)).toMatchObject(
      {
        id: 1,
        text: "hello friends",
      },
    );
    room.send(playerId, nickname, "two", 100);
    room.send(playerId, nickname, "three", 200);
    expect(() => room.send(playerId, nickname, "four", 300)).toThrow(
      "3 per second",
    );
    expect(() => room.send(playerId, nickname, "", 1001)).toThrow("empty");
    expect(() =>
      room.send(
        playerId,
        nickname,
        "x".repeat(multiplayerChatMaximumCharacters + 1),
        1001,
      ),
    ).toThrow("256");
  });
});

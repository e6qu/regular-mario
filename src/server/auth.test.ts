import { describe, expect, it } from "vitest";

import { requireMultiplayerPlayerId } from "../multiplayer/domain";
import {
  adminSessionLifetimeMilliseconds,
  makeSessionStore,
  playerSessionLifetimeMilliseconds,
  SessionRole,
} from "./auth";

function makeStore() {
  let id = 0;
  return makeSessionStore({
    serverPassword: "friend-password",
    adminPassword: "admin-password",
    signingSecret: "0123456789abcdef0123456789abcdef",
    randomId: () => `id-${++id}`,
  });
}

describe("anonymous signed session store", () => {
  it("issues expiring opaque player sessions only for the shared password", () => {
    const store = makeStore();
    expect(() => store.loginPlayer("wrong", 100)).toThrow("invalid");
    const token = store.loginPlayer("friend-password", 100);
    expect(store.authenticate(token, SessionRole.Player, 100)).toMatchObject({
      playerId: "player-id-2",
      role: SessionRole.Player,
    });
    expect(
      store.authenticate(
        token,
        SessionRole.Player,
        100 + playerSessionLifetimeMilliseconds,
      ),
    ).toBeUndefined();
  });

  it("keeps admin sessions separate and supports forced player expiration", () => {
    const store = makeStore();
    const playerToken = store.loginPlayer("friend-password", 100);
    const adminToken = store.loginAdmin("admin-password", 100);
    expect(
      store.authenticate(playerToken, SessionRole.Admin, 100),
    ).toBeUndefined();
    expect(
      store.authenticate(adminToken, SessionRole.Admin, 100),
    ).toMatchObject({
      role: SessionRole.Admin,
    });
    expect(
      store.authenticate(
        adminToken,
        SessionRole.Admin,
        100 + adminSessionLifetimeMilliseconds,
      ),
    ).toBeUndefined();
    store.expireAllPlayerSessions();
    expect(
      store.authenticate(playerToken, SessionRole.Player, 101),
    ).toBeUndefined();
  });

  it("boots a selected player without invalidating other sessions", () => {
    const store = makeStore();
    const first = store.loginPlayer("friend-password", 100);
    const second = store.loginPlayer("friend-password", 100);
    store.bootPlayer(requireMultiplayerPlayerId("player-id-2"));
    expect(store.authenticate(first, SessionRole.Player, 101)).toBeUndefined();
    expect(store.authenticate(second, SessionRole.Player, 101)).toBeDefined();
  });
});

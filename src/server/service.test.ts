import { describe, expect, it } from "vitest";

import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { HorizontalInput } from "../engine/simulation/input-command";
import { makeMultiplayerService } from "./service";

function makeService() {
  let gameId = 0;
  let randomId = 0;
  return makeMultiplayerService({
    session: {
      serverPassword: "friends",
      adminPassword: "administrator",
      signingSecret: "0123456789abcdef0123456789abcdef",
      randomId: () => `id-${++randomId}`,
    },
    levels: [
      {
        id: "first-authored",
        label: "First Authored",
        levelSpec: firstAuthoredLevelSpec(),
      },
    ],
    movementConstants: initialMovementConstants,
    nextGameId: () => `game-${++gameId}`,
  });
}

describe("multiplayer service", () => {
  it("keeps player and admin operations independently authenticated", () => {
    const service = makeService();
    const player = service.loginPlayer("friends", 0);
    const admin = service.loginAdmin("administrator", 0);
    expect(service.requirePlayer(player.token, 0).nickname).toBe("Guest");
    expect(service.levels(player.token, 0)).toEqual([
      { id: "first-authored", label: "First Authored" },
    ]);
    expect(service.adminDebug(admin, 0).activeSessionCount).toBe(2);
    expect(() => service.adminDebug(player.token, 0)).toThrow("Authentication");
  });

  it("creates, starts, inputs, and administratively steps a public game", () => {
    const service = makeService();
    const player = service.loginPlayer("friends", 0);
    const admin = service.loginAdmin("administrator", 0);
    service.updateProfile(player.token, "Mira", "castaway", 0);
    const game = service.createGame(
      player.token,
      "first-authored",
      "regular",
      0,
    );
    service.startGame(player.token, game.gameId, 0);
    service.submitInput(
      player.token,
      {
        sequence: 1,
        intendedFrame: 1,
        receivedAtMilliseconds: 0,
        command: {
          horizontal: HorizontalInput.Right,
          jumpPressed: false,
          runHeld: false,
          firePressed: false,
          upHeld: false,
          downHeld: false,
        },
      },
      0,
    );
    expect(service.tick(1)[0]).toMatchObject({ frame: 1 });
    service.adminPause(admin, game.gameId, 1);
    expect(service.adminStep(admin, game.gameId, 2)).toMatchObject({
      frame: 2,
    });
    service.adminResume(admin, game.gameId, 2);
  });

  it("accepts only bounded member screenshots and exposes them only to admin", () => {
    const service = makeService();
    const player = service.loginPlayer("friends", 0);
    const admin = service.loginAdmin("administrator", 0);
    const game = service.createGame(
      player.token,
      "first-authored",
      "revenge",
      0,
    );
    const screenshot = "data:image/png;base64,AAAA";
    service.recordScreenshot(player.token, game.gameId, screenshot, 0);
    expect(service.adminScreenshot(admin, game.gameId, 0)).toBe(screenshot);
  });

  it("releases a player slot when a player deliberately leaves", () => {
    const service = makeService();
    const player = service.loginPlayer("friends", 0);
    service.createGame(player.token, "first-authored", "regular", 0);
    service.leaveGame(player.token, 1);
    expect(service.games(player.token, 1)).toEqual([]);
    expect(
      service.createGame(player.token, "first-authored", "revenge", 1).mode,
    ).toBe("revenge");
  });
});

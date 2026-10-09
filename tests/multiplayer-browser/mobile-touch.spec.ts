import { expect, test } from "@playwright/test";
import {
  controlTouchPoint,
  createTouchDriver,
  expectInsideViewport,
} from "../support/mobile-browser-support";
import { findGameIdByCreatorNickname, saveProfile } from "./support";

test.use({
  hasTouch: true,
  deviceScaleFactor: 2,
  viewport: { width: 568, height: 320 },
});

test("online movement, jump, pause, chat, revival and leaving work by touch", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sentCommands: {
    horizontal: string;
    jumpPressed: boolean;
    runHeld: boolean;
  }[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", (event) => {
      const message = JSON.parse(String(event.payload)) as {
        type: string;
      } & (typeof sentCommands)[number];
      if (message.type === "input") {
        sentCommands.push(message);
      }
    }),
  );
  await page.goto("/#multiplayer");
  await page.getByLabel("Server password").fill("friends");
  await page.getByRole("button", { name: "Enter lobby" }).tap();
  await saveProfile(page, "Thumbs");
  await expectInsideViewport(page.locator(".multiplayer-panel"));
  await page.getByLabel("Bundled level").selectOption("smb-1-1");
  await page.getByRole("button", { name: "Create game" }).tap();
  const shell = page.locator(".multiplayer-game-shell");
  await expect(shell).toHaveAttribute("data-game-phase", "playing");
  await expect(shell).toHaveAttribute("data-debug-socket-lifecycle", "open");
  const gameId = await findGameIdByCreatorNickname(page, "Thumbs");
  const snapshot = async () => {
    const response = await page.request.get(`/api/games/${gameId}/snapshot`, {
      headers: { "x-multiplayer-protocol-version": "1" },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()) as { players: { x: number; y: number }[] };
  };
  const before = (await snapshot()).players[0]!;
  for (const locator of [
    shell.locator("canvas"),
    shell.locator('[data-role="touch-control-left"]'),
    shell.locator('[data-role="touch-control-right"]'),
  ]) {
    await expectInsideViewport(locator);
  }
  const touch = await createTouchDriver(page);
  const right = await controlTouchPoint(page, "touch-right", 1);
  const jump = await controlTouchPoint(page, "touch-A", 2);
  const run = await controlTouchPoint(page, "touch-B", 3);
  await touch.send("touchStart", [right, jump, run]);
  await expect
    .poll(() =>
      sentCommands.some(
        (command) =>
          command.horizontal === "right" &&
          command.jumpPressed &&
          command.runHeld,
      ),
    )
    .toBe(true);
  await expect
    .poll(async () => (await snapshot()).players[0]!.x)
    .toBeGreaterThan(before.x);
  await expect
    .poll(async () => (await snapshot()).players[0]!.y)
    .toBeLessThan(before.y);
  const neutralCount = () =>
    sentCommands.filter(
      (command) =>
        command.horizontal === "neutral" &&
        !command.jumpPressed &&
        !command.runHeld,
    ).length;
  const beforeBlur = neutralCount();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(neutralCount).toBe(beforeBlur + 1);
  // Longer than the held-input heartbeat: blur sends one release, with no
  // repeated neutral prediction steps or a surviving held touch command.
  await page.waitForTimeout(150);
  expect(neutralCount()).toBe(beforeBlur + 1);
  await touch.send("touchEnd", []);
  await expect.poll(() => sentCommands.at(-1)?.horizontal).toBe("neutral");
  await page.getByLabel("touch-pause", { exact: true }).tap();
  await expect(shell).toHaveAttribute("data-game-phase", "paused");
  await page.getByLabel("touch-pause", { exact: true }).tap();
  await expect(shell).toHaveAttribute("data-game-phase", "playing");
  await page.getByLabel("touch-start", { exact: true }).tap();
  await shell.getByRole("button", { name: "Game chat", exact: true }).tap();
  await page.getByLabel("Game chat message").fill("hello from a phone");
  await page.getByRole("button", { name: "Send game chat", exact: true }).tap();
  await expect(page.getByRole("log", { name: "Game chat" })).toContainText(
    "Thumbs: hello from a phone",
  );
  await page.getByRole("button", { name: "Close chat", exact: true }).tap();
  await expect(shell).toHaveAttribute("data-chat-open", "false");
  // A real authoritative defeat, followed by the menu's touch revival action.
  await touch.send("touchStart", [right]);
  await expect(shell).toHaveAttribute("data-local-player-spectator", "true", {
    timeout: 30000,
  });
  await touch.send("touchEnd", []);
  await page.getByLabel("touch-start", { exact: true }).tap();
  await shell.getByRole("button", { name: "Rejoin party", exact: true }).tap();
  await expect(shell).toHaveAttribute("data-local-player-spectator", "false");
  await expect(shell.locator("canvas")).toHaveAttribute(
    "data-rendered-primary-visible",
    "true",
  );
  await shell.getByRole("button", { name: "Resume", exact: true }).tap();
  // Portrait keeps the lobby escape reachable rather than stranding the player.
  await page.setViewportSize({ width: 320, height: 568 });
  await expectInsideViewport(shell.locator(".multiplayer-orientation"));
  await page.getByRole("button", { name: "Back to lobby" }).tap();
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
  await expectInsideViewport(page.locator(".multiplayer-panel"));
  await page.request.post(`/api/games/${gameId}/end`, {
    headers: { "x-multiplayer-protocol-version": "1" },
  });
  await touch.close();
  expect(errors).toEqual([]);
});

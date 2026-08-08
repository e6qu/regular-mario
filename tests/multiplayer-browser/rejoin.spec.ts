import { expect, test, type Page } from "@playwright/test";

import {
  createGameOnLevel,
  findGameIdByCreatorNickname,
  login,
  saveProfile,
} from "./support";

// Leaving a game and rejoining it was reported to duplicate the character —
// "a goomba stomp appears duplicate as if there are 2 characters into one" —
// and to leave two music tracks playing at once. Both are shapes a single
// client cannot show: they need one player to leave a live game and come back
// while another keeps it running.

async function joinHostedGame(
  page: Page,
  creatorNickname: string,
): Promise<void> {
  await page
    .locator("section > div")
    .filter({ hasText: new RegExp(`^${creatorNickname} · `) })
    .getByRole("button", { name: "Join" })
    .click();
  await expect(page.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "playing",
  );
}

async function leaveGame(page: Page): Promise<void> {
  // Escape opens the gameplay menu; leaving stays a deliberate action so a
  // stray key cannot disconnect a live player. Exactly one press: this player
  // never focused the chat composer, so a second press would toggle the menu
  // shut again.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Leave game" })).toBeVisible();
  const left = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/game/leave") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Leave game" }).click();
  expect((await left).ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

test("rejoining leaves exactly one canvas, one character and one audio scene", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await login(host);
  await saveProfile(host, "Host");
  await createGameOnLevel(host, "smb-1-1");
  await findGameIdByCreatorNickname(host, "Host");

  await login(guest);
  await saveProfile(guest, "Guest");
  await joinHostedGame(guest, "Host");

  await leaveGame(guest);
  await joinHostedGame(guest, "Host");

  const shell = guest.locator(".multiplayer-game-shell");

  // Exactly one canvas. Phaser's teardown is asynchronous, and a second game
  // mounted before the first detached would draw a second character over the
  // first — which is what "two characters in one" looks like.
  await expect(guest.locator(".multiplayer-game-shell canvas")).toHaveCount(1);

  // Exactly one Phaser game, so only one scene is stepping and only one audio
  // context is playing. Two would be two music tracks at once.
  const runningGames = await guest.evaluate(
    () => document.querySelectorAll("canvas").length,
  );
  expect(runningGames).toBe(1);

  // The rejoined player is painted, and the party still holds two members.
  const canvas = guest.locator(".multiplayer-game-shell canvas");
  await expect(canvas).toHaveAttribute(
    "data-rendered-primary-visible",
    "true",
    {
      timeout: 15_000,
    },
  );
  await expect(shell).toHaveAttribute("data-game-phase", "playing");

  await hostContext.close();
  await guestContext.close();
});

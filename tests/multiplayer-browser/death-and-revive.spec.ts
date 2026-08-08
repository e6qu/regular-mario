import { expect, test, type Page } from "@playwright/test";

import { enterMultiplayerLobby } from "./support";

// No browser spec has ever driven a player to an actual death, which is why the
// reported revive failures were never caught here: the one existing revive test
// presses R while ALIVE and asserts the refusal. These reach a real defeat and
// then exercise what a player actually does next.

async function login(page: Page): Promise<void> {
  await page.goto("/#multiplayer");
  await enterMultiplayerLobby(page);
}

async function saveProfile(page: Page, nickname: string): Promise<void> {
  await page.getByLabel("Nickname").fill(nickname);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/profile") &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save profile" }).click();
  expect((await saved).ok()).toBe(true);
}

/**
 * Walk right until the authoritative snapshot marks this player a spectator.
 *
 * `data-local-player-spectator` is set from the server's own `spectator` flag,
 * which is `outcome.kind !== Active` — so it flips only on a real, authoritative
 * defeat, not on a client-side guess. Walking right on world 1-1 meets the first
 * goomba, and a small player dies on contact.
 */
async function walkRightUntilDefeated(page: Page): Promise<void> {
  const shell = page.locator(".multiplayer-game-shell");
  await page.keyboard.down("ArrowRight");
  try {
    await expect(shell).toHaveAttribute("data-local-player-spectator", "true", {
      timeout: 30_000,
    });
  } finally {
    await page.keyboard.up("ArrowRight");
  }
}

test("a defeated player can revive with R and stops being a spectator", async ({
  page,
}) => {
  await login(page);
  await saveProfile(page, "Reviver");
  await page.getByLabel("Bundled level").selectOption("smb-1-1");
  await page.getByRole("button", { name: "Create game" }).click();
  const shell = page.locator(".multiplayer-game-shell");
  await expect(shell).toHaveAttribute("data-game-phase", "playing");

  await walkRightUntilDefeated(page);

  await page.keyboard.press("KeyR");

  // The revive must be accepted, not refused, and the player must come back as
  // a participant rather than lingering as a spectator.
  await expect(shell).toHaveAttribute("data-local-player-spectator", "false", {
    timeout: 15_000,
  });
  await expect(shell.locator(".multiplayer-game-error")).not.toContainText(
    "Only defeated players can revive.",
  );
});

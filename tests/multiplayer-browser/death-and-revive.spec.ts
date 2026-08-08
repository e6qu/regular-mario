import { expect, test, type Page } from "@playwright/test";

import { cancelGame, createGameOnLevel, login, saveProfile } from "./support";

// No browser spec has ever driven a player to an actual death, which is why the
// reported revive failures were never caught here: the one existing revive test
// presses R while ALIVE and asserts the refusal. These reach a real defeat and
// then exercise what a player actually does next.

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
  await createGameOnLevel(page, "smb-1-1");
  const shell = page.locator(".multiplayer-game-shell");

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

  // Hand the lobby back empty. A spec that ends still holding a game leaves it
  // listed for everything that runs afterwards.
  await cancelGame(page);
});

test("a revived player is painted, not merely marked active", async ({
  page,
}) => {
  await login(page);
  await saveProfile(page, "Visible");
  await createGameOnLevel(page, "smb-1-1");
  const shell = page.locator(".multiplayer-game-shell");
  const canvas = page.locator(".multiplayer-game-shell canvas");

  await walkRightUntilDefeated(page);
  await page.keyboard.press("KeyR");
  await expect(shell).toHaveAttribute("data-local-player-spectator", "false", {
    timeout: 15_000,
  });

  // The server's spectator flag says the party accepted the revive. It says
  // nothing about whether Phaser drew anybody, which is what "revived but
  // invisible" means — so read what the renderer painted.
  await expect(canvas).toHaveAttribute(
    "data-rendered-primary-visible",
    "true",
    {
      timeout: 15_000,
    },
  );
  await expect(canvas).toHaveAttribute("data-rendered-players", "1");

  // And it must keep painting: a sprite that appears for one frame and then
  // stops is still invisible to the player.
  const firstFrame = await canvas.getAttribute(
    "data-rendered-simulation-frame",
  );
  await page.waitForTimeout(1_000);
  const laterFrame = await canvas.getAttribute(
    "data-rendered-simulation-frame",
  );
  expect(Number(laterFrame)).toBeGreaterThan(Number(firstFrame));
  await expect(canvas).toHaveAttribute("data-rendered-primary-visible", "true");

  await cancelGame(page);
});

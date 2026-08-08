import { expect, type Page } from "@playwright/test";

export async function enterMultiplayerLobby(page: Page): Promise<void> {
  await page.goto("/#multiplayer");
  await page.getByLabel("Server password").fill("friends");
  await page.getByLabel("Server password").press("Enter");
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

export async function findGameIdByCreatorNickname(
  page: Page,
  nickname: string,
): Promise<string> {
  const lobby = await page.request.get("/api/lobby", {
    headers: { "x-multiplayer-protocol-version": "1" },
  });
  const body = (await lobby.json()) as {
    readonly games: readonly {
      readonly gameId: string;
      readonly creator: { readonly nickname: string };
    }[];
  };
  const game = body.games.find(
    (candidate) => candidate.creator.nickname === nickname,
  );
  if (game === undefined) {
    throw new Error(`Game by ${nickname} is missing from the lobby.`);
  }
  return game.gameId;
}

export async function pauseGameAsAdministrator(
  page: Page,
  gameId: string,
): Promise<void> {
  await page.goto("/#multiplayer-admin");
  await page.getByLabel("Administrator password").fill("administrator");
  await page.getByRole("button", { name: "Enter administration" }).click();
  await page
    .locator("section")
    .filter({ hasText: gameId })
    .getByRole("button", { name: "pause" })
    .click();
}

/**
 * Sign in and reach the lobby, asserting the protocol gate on the way.
 *
 * Shared rather than copied: a spec that pastes its own copy drifts from this
 * one, and the copy-paste gate rejects the duplication outright.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/#multiplayer");
  const unsupportedProtocol = await page.request.get("/api/lobby", {
    headers: { "x-multiplayer-protocol-version": "0" },
  });
  expect(unsupportedProtocol.status()).toBe(400);
  expect(await unsupportedProtocol.json()).toMatchObject({
    error: "Unsupported multiplayer protocol version.",
  });
  await enterMultiplayerLobby(page);
}

/** Set this player's nickname and wait for the profile write to land. */
export async function saveProfile(page: Page, nickname: string): Promise<void> {
  await page.getByLabel("Nickname").fill(nickname);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/profile") &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save profile" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

/** Create a game on a bundled level and wait for it to reach `playing`. */
export async function createGameOnLevel(
  page: Page,
  levelId: string,
): Promise<void> {
  await page.getByLabel("Bundled level").selectOption(levelId);
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "playing",
  );
}

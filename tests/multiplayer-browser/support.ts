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

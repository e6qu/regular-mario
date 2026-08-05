import { expect, test, type Browser, type Page } from "@playwright/test";

import { enterMultiplayerLobby, findGameIdByCreatorNickname } from "./support";

const playerCount = 8;
test.setTimeout(120_000);
const avatars = [
  "castaway",
  "tidekeeper",
  "brass-scout",
  "moss-runner",
  "cloud-sailor",
  "ember-warden",
] as const;

async function configurePlayer(
  page: Page,
  nickname: string,
  avatarId: string,
): Promise<void> {
  const response = await page.request.patch("/api/profile", {
    headers: { "x-multiplayer-protocol-version": "1" },
    data: { nickname, avatarId },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

async function makePlayer(browser: Browser, index: number): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await enterMultiplayerLobby(page);
  await configurePlayer(
    page,
    `LoadPilot${String(index)}`,
    avatars[index % avatars.length] ?? "castaway",
  );
  return page;
}

test("eight independent browser players can share one authoritative game", async ({
  browser,
}) => {
  const pages: Page[] = [];
  for (let index = 0; index < playerCount; index += 1) {
    pages.push(await makePlayer(browser, index));
  }
  const creator = pages[0];
  if (creator === undefined) {
    throw new Error("Stress creator is missing.");
  }
  await creator.getByRole("button", { name: "Create game" }).click();
  const gameId = await findGameIdByCreatorNickname(creator, "LoadPilot0");
  for (const page of pages.slice(1)) {
    await page.reload();
    await page
      .locator("section > div")
      .filter({
        hasText: /^LoadPilot0 · multiplayer-onboarding · regular · waiting/,
      })
      .getByRole("button", { name: "Join" })
      .click();
  }
  await creator.getByRole("button", { name: "Start game" }).click();
  await Promise.all(
    pages.map((page) =>
      expect(
        page.getByLabel("Authoritative multiplayer game view"),
      ).toBeVisible(),
    ),
  );
  await Promise.all(
    pages.map((page, index) =>
      page.keyboard.press(index % 2 === 0 ? "ArrowRight" : "ArrowLeft"),
    ),
  );
  await expect
    .poll(async () => {
      const snapshot = await creator.request.get(
        `/api/games/${gameId}/snapshot`,
        { headers: { "x-multiplayer-protocol-version": "1" } },
      );
      const body = (await snapshot.json()) as {
        readonly players: readonly unknown[];
        readonly frame: number;
      };
      return { playerCount: body.players.length, frame: body.frame };
    })
    .toMatchObject({ playerCount, frame: expect.any(Number) });
  await Promise.all(
    pages.map((page) =>
      expect(
        page.getByLabel("Authoritative multiplayer game view"),
      ).toHaveAttribute("data-authoritative-player-count", String(playerCount)),
    ),
  );
  await creator.screenshot({
    path: "screenshots/multiplayer-stress-creator.png",
  });
  const finalPlayer = pages.at(-1);
  if (finalPlayer === undefined) {
    throw new Error("Stress final player is missing.");
  }
  await finalPlayer.screenshot({
    path: "screenshots/multiplayer-stress-player-8.png",
  });
  await creator.getByRole("button", { name: "End game", exact: true }).click();
  await Promise.all(pages.map((page) => page.context().close()));
});

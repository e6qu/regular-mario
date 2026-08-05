import { expect, test, type Page } from "@playwright/test";

import { enterMultiplayerLobby } from "./support";

const injectedSnapshotDelayMilliseconds = Number(
  process.env["MULTIPLAYER_TEST_SNAPSHOT_DELAY_MS"] ?? "0",
);

async function login(page: Page): Promise<void> {
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

async function saveProfile(page: Page, nickname: string): Promise<void> {
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

test("two trusted friends create, join, chat, and inspect a game", async ({
  browser,
}) => {
  const creatorContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const guest = await guestContext.newPage();
  await login(creator);
  await saveProfile(creator, "Mira");
  await creator.getByLabel("Bundled level").selectOption("cavern-route");
  await creator.getByRole("button", { name: "Create game" }).click();
  // Creation is also entry. The creator must never be left in the lobby with
  // impossible Create/Join actions after claiming their only game slot.
  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await expect(
    creator.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toHaveCount(0);
  await expect(
    creator.getByRole("button", { name: "Start game" }),
  ).toBeVisible();
  // A refresh must resume the one game this session already owns. Otherwise
  // the lobby offers create/join controls which the server correctly rejects.
  await creator.reload();
  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await expect(
    creator.getByRole("button", { name: "Start game" }),
  ).toBeVisible();

  await login(guest);
  await saveProfile(guest, "Ren");
  await expect(guest.getByLabel("Bundled level")).toHaveText(
    /Party Runway.*Coinbox Crossing.*Cavern Route/,
  );
  await guest
    .locator("section > div")
    .filter({ hasText: /^Mira · cavern-route · regular · waiting/ })
    .getByRole("button", { name: "Join" })
    .click();
  await expect(
    guest.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();

  await creator.getByRole("button", { name: "Start game" }).click();
  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toHaveAttribute("data-role", "multiplayer-phaser-canvas");
  await creator.keyboard.down("ArrowRight");
  await creator.waitForTimeout(120);
  await creator.keyboard.up("ArrowRight");
  await creator.waitForTimeout(injectedSnapshotDelayMilliseconds + 200);
  await expect(creator.getByText(/playing · frame [1-9]/)).toBeVisible();
  expect(
    await creator
      .getByLabel("Authoritative multiplayer game view")
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL().length),
  ).toBeGreaterThan(1_000);

  const layout = await creator.request.get("/api/layout", {
    headers: { "x-multiplayer-protocol-version": "1" },
  });
  expect(await layout.json()).toMatchObject({
    role: "main",
    label: "Multiplayer game",
  });
  await expect(
    creator.locator(
      '[data-semantic-role="main"][data-semantic-label="Multiplayer game"]',
    ),
  ).toBeAttached();
  // Playing uses the complete canvas. Open the optional control drawer before
  // exercising chat and leave actions just as a real player would.
  await guest.keyboard.press("KeyM");
  await expect(
    guest.getByRole("button", { name: "Resume game" }),
  ).toBeVisible();
  await guest.getByLabel("Game chat message").fill("hello from Ren");
  await guest.getByRole("button", { name: "Send game chat" }).click();
  await creator.keyboard.press("KeyM");
  await expect(creator.getByRole("log", { name: "Game chat" })).toContainText(
    "Ren: hello from Ren",
  );
  await expect(guest.getByRole("button", { name: "Leave game" })).toBeVisible();
  await creator.screenshot({ path: "test-results/multiplayer-desktop.png" });
  await creatorContext.close();
  await guestContext.close();
});

test("administrator can inspect and step a paused game", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#multiplayer-admin");
  await page.getByLabel("Administrator password").fill("administrator");
  await page.getByRole("button", { name: "Enter administration" }).click();
  await expect(
    page.getByRole("heading", { name: "Multiplayer administration" }),
  ).toBeVisible();
  await expect(
    page.locator(
      '[data-semantic-role="main"][data-semantic-label="Multiplayer administration"]',
    ),
  ).toBeAttached();
  await expect(
    page.getByText(
      new RegExp(
        `Snapshots: [0-9]+ · delay ${injectedSnapshotDelayMilliseconds} ms`,
      ),
    ),
  ).toBeVisible();
  const miraGame = page.locator("section").filter({ hasText: /Mira/ });
  await miraGame.getByRole("button", { name: "pause" }).click();
  await miraGame.getByRole("button", { name: "step" }).click();
  await miraGame.getByRole("button", { name: "resume" }).click();
  await expect(
    miraGame.getByAltText(/Latest screenshot for game-/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Boot (Mira|Ren)/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Expire all player sessions" })
    .click();
  await page.screenshot({ path: "test-results/multiplayer-admin-mobile.png" });
});

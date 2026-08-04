import { expect, type Page } from "@playwright/test";

export async function enterMultiplayerLobby(page: Page): Promise<void> {
  await page.goto("/#multiplayer");
  await page.getByLabel("Server password").fill("friends");
  await page.getByRole("button", { name: "Enter lobby" }).click();
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

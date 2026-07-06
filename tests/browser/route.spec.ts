import { expect, test } from "@playwright/test";

test("a #play URL opens the level with its knobs applied", async ({ page }) => {
  await page.goto(
    "/#play?skin=castaway-parody&map=official-smb&level=smb-1-1&mode=classic&sound=classic",
  );
  // The level boots straight away (no manual PLAY needed).
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
});

test("the #design route opens the designer", async ({ page }) => {
  await page.goto("/#design");
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
});

test("choosing a level updates the address bar to a shareable #play URL", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/#menu$/);
  await expect(page.getByRole("button", { name: /PLAY/ })).toBeVisible();
  await page.getByRole("button", { name: /PLAY/ }).click();
  await expect(page).toHaveURL(/#play\?skin=.*&level=/);
});

import { expect, test } from "@playwright/test";

import { dismissEditorTutorial } from "./support";

// A minimal valid shared level, so the designer (which shows the help hint)
// opens straight from the URL hash.
const sharedLevel = `10.8.${"..........".repeat(6)}..p....x..gggggggggg`;

test("keyboard help opens with ? and Esc layers over pausing", async ({
  page,
}) => {
  await page.goto("/?browserLevel=first-authored");
  await expect(page.locator("canvas")).toBeVisible();

  // "?" opens the shortcuts overlay (works during play).
  await page.keyboard.press("Shift+Slash");
  await expect(page.getByRole("dialog")).toBeVisible();

  // Esc closes the overlay without pausing the game (no session tab yet).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("tab")).toHaveCount(0);

  // Esc again pauses the game into a resumable tab.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab")).toBeVisible();
});

test("the corner hint opens the shortcuts overlay in the designer", async ({
  page,
}) => {
  await page.goto(`/#level=${sharedLevel}`);
  await dismissEditorTutorial(page);
  const hint = page.getByRole("button", { name: "Show keyboard shortcuts" });
  await expect(hint).toBeVisible();
  await hint.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

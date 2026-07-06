import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { dismissEditorTutorial } from "./support";

const sharedLevel = `10.8.${"..........".repeat(6)}..p....x..gggggggggg`;

// Serious/critical WCAG 2.1 A/AA violations on the given page.
async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.nodes.length})`);
}

test("designer has no serious WCAG violations", async ({ page }) => {
  await page.goto(`/#level=${sharedLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("keyboard-help overlay has no serious WCAG violations", async ({
  page,
}) => {
  await page.goto(`/#level=${sharedLevel}`);
  await dismissEditorTutorial(page);
  await page.getByRole("button", { name: "Show keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("running game surface has no serious WCAG violations", async ({
  page,
}) => {
  await page.goto("/?browserLevel=first-authored");
  await expect(page.locator("canvas")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("start menu has no serious WCAG violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /PLAY/ })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";

import {
  bootPlayTest,
  playerX,
  waitForGameBoot,
  waitForSimulationRunning,
} from "./support";

const sharedLevel = `10.8.${"..........".repeat(6)}..p....x..gggggggggg`;

// Open the designer at 900x560 on the shared fixture level.
async function openDesigner(page: Page): Promise<void> {
  await page.setViewportSize({ width: 900, height: 560 });
  await page.goto(`/#level=${sharedLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
}

test("Escape suspends a game into a resumable tab, preserving progress", async ({
  page,
}) => {
  await page.goto("/?browserLevel=first-authored");
  await expect(page.locator("canvas")).toBeVisible();
  await waitForSimulationRunning(page);

  // Make some progress: walk right.
  const start = await playerX(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction((from) => {
    const api = window.__originalBrowserPlatformerDebug;
    return (
      api !== undefined && api.getSimulationSnapshot().player.position.x > from
    );
  }, start + 24);
  await page.keyboard.up("ArrowRight");
  const progressed = await playerX(page);

  // Escape suspends the game: the canvas hides and a session tab appears.
  await page.keyboard.press("Escape");
  const tab = page.getByRole("tab");
  await expect(tab).toBeVisible();
  await expect(page.locator("canvas")).toBeHidden();

  // Resuming via the tab returns to the same game with progress intact
  // (not restarted from the beginning).
  await tab.click();
  await expect(page.locator("canvas")).toBeVisible();
  expect(await playerX(page)).toBeGreaterThanOrEqual(progressed - 4);
  // ...and it is actually re-drawn at full size — the resume must show the game,
  // not a 0x0 canvas measured while the layer was still hidden.
  const box = await page.locator("canvas").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  expect(box?.height ?? 0).toBeGreaterThan(200);
});

test("resuming a suspended play-test renders full-size, not an empty canvas", async ({
  page,
}) => {
  await openDesigner(page);

  // Play-test from the designer, run a few frames, then suspend back to the
  // designer where the session shows as a tab.
  await bootPlayTest(page);
  await page.keyboard.press("Escape");
  const tab = page.getByRole("tab");
  await expect(tab).toBeVisible();

  // Resume via the tab: the canvas must fill the window, not collapse to 0x0.
  await tab.click();
  await expect(page.locator("canvas")).toBeVisible();
  const box = await page.locator("canvas").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(700);
  expect(box?.height ?? 0).toBeGreaterThan(400);
});

test("resuming one of several suspended sessions stays on that game", async ({
  page,
}) => {
  await openDesigner(page);

  // The visible game canvas's width (0 if none is showing).
  const visibleGameWidth = (): Promise<number> =>
    page.evaluate(() => {
      const canvas = [
        ...document.querySelectorAll<HTMLCanvasElement>(
          'canvas[aria-label*="game"]',
        ),
      ].find(
        (c) =>
          c.style.display !== "none" && c.getBoundingClientRect().width > 0,
      );
      return canvas ? Math.round(canvas.getBoundingClientRect().width) : 0;
    });

  // Suspend two separate play-tests into tabs. Wait for each game to boot (its
  // canvas to appear) before Escape, so the suspend isn't lost to the async boot.
  async function playThenSuspend(expectedCanvases: number): Promise<void> {
    await page.getByRole("button", { name: "▶ Play" }).click();
    await waitForGameBoot(page, expectedCanvases);
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  }
  await playThenSuspend(1);
  await playThenSuspend(2);
  await expect(page.getByRole("tab")).toHaveCount(2);

  // Resuming the first tab must show that game and STAY there — not immediately
  // bounce back to the designer because a stale Escape (pressed to suspend the
  // other session) leaked into this one.
  await page.getByRole("tab").first().click();
  await expect(page.getByRole("button", { name: "Block" })).toBeHidden();
  expect(await visibleGameWidth()).toBeGreaterThan(700);
  // Still on the game a moment later (an instant self-exit would have returned
  // to the designer by now).
  await page.waitForTimeout(400);
  await expect(page.getByRole("button", { name: "Block" })).toBeHidden();
  expect(await visibleGameWidth()).toBeGreaterThan(700);
});

test("the tab's close button ends the session", async ({ page }) => {
  await page.goto("/?browserLevel=first-authored");
  await expect(page.locator("canvas")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab")).toBeVisible();

  await page.getByRole("button", { name: /^Close / }).click();
  await expect(page.getByRole("tab")).toHaveCount(0);
});

import { expect, type Page } from "@playwright/test";

// Shared browser-test helpers.

// The editor's guided tutorial auto-opens for a first-time visitor. Tests that
// aren't about the tutorial dismiss it with its own Skip button (the real flow)
// so its coach-mark dialog doesn't sit over the UI they're exercising.
export async function dismissEditorTutorial(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await expect(skip).toBeHidden();
  }
}

// Click Play and wait until the game canvas and debug API are live.
export async function bootPlayTest(page: Page): Promise<void> {
  await page.getByRole("button", { name: "▶ Play" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
}

// The active game's player x (−1 if no simulation is live).
export function playerX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = window.__originalBrowserPlatformerDebug;
    const snapshot = api?.getSimulationSnapshot();
    return snapshot ? Math.round(snapshot.player.position.x) : -1;
  });
}

// Wait until the (Nth) game canvas has booted and the debug API is live — used
// before pressing keys so input isn't lost to the async boot.
// Resolve once the simulation is actually advancing frames, so a test never
// drives input during a slow boot before the first frame has stepped.
export async function waitForSimulationRunning(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const api = window.__originalBrowserPlatformerDebug;
    return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
  });
}

export async function waitForGameBoot(
  page: Page,
  expectedCanvases: number,
): Promise<void> {
  await page.waitForFunction(
    (n) => document.querySelectorAll('canvas[aria-label*="game"]').length >= n,
    expectedCanvases,
  );
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
}

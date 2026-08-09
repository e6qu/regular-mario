import { expect, type Page } from "@playwright/test";

import type { BrowserSimulationSnapshot } from "../../src/shell/browser-debug-api";

// Shared browser-test helpers.

// The active game's full debug snapshot (throws if no game has booted).
export function readSimulationSnapshot(
  page: Page,
): Promise<BrowserSimulationSnapshot> {
  return page.evaluate(() => {
    const api = window.__originalBrowserPlatformerDebug;
    if (api === undefined) {
      throw new Error("Browser simulation debug API is unavailable.");
    }
    return api.getSimulationSnapshot();
  });
}

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

// Boot a content-set level from the #play route, dismiss the "press any key"
// start prompt, and wait until the simulation is stepping frames.
export async function bootContentLevel(
  page: Page,
  levelName: string,
): Promise<void> {
  await page.goto(
    `/#play?skin=castaway-parody&map=official-smb&level=${levelName}&mode=classic&sound=classic`,
  );
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
    undefined,
    { timeout: 30000 },
  );
  await page.keyboard.press("Space");
  await waitForSimulationRunning(page);
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

/** Block until the simulation has stepped `frames` more frames. */
export async function advanceSimulationFrames(
  page: Page,
  frames: number,
): Promise<void> {
  const from = await page.evaluate(
    () =>
      window.__originalBrowserPlatformerDebug?.getSimulationSnapshot()
        .frameIndex ?? 0,
  );
  await page.waitForFunction((target) => {
    const api = window.__originalBrowserPlatformerDebug;
    return (
      api !== undefined && api.getSimulationSnapshot().frameIndex >= target
    );
  }, from + frames);
}

/**
 * Tap a key for a fixed number of simulation frames, then release it for
 * another fixed number.
 *
 * Swim strokes are why this exists. Held for a wall-clock duration, a tap does
 * as much work as the host managed to step in that time: the same code that
 * lifted a swimmer past 60px on a developer's machine lifted 43px on a loaded CI
 * runner, and no number of extra strokes closed the gap, because the swimmer
 * sank back between strokes and settled at an equilibrium below the threshold.
 * Counted in frames, a stroke is the same stroke on every machine.
 */
export async function tapKeyForSimulationFrames(
  page: Page,
  key: string,
  heldFrames: number,
  releasedFrames: number,
): Promise<void> {
  await page.keyboard.down(key);
  await advanceSimulationFrames(page, heldFrames);
  await page.keyboard.up(key);
  await advanceSimulationFrames(page, releasedFrames);
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

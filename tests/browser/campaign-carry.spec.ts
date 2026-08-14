import { expect, test } from "@playwright/test";

import { readSimulationSnapshot } from "./support";

/**
 * Clearing a campaign level continues the run.
 *
 * Advancing boots the next level as a brand-new game, so everything the run
 * had earned used to be discarded at the boundary: you finished 1-1 with extra
 * lives and a pocket full of coins and started 1-2 as a fresh game. Each
 * cleared level also left its predecessor alive and suspended, holding an
 * audio context (and, on the GPU renderer, a WebGL context) that browsers only
 * allow a handful of.
 */
test("clearing a level carries the run into the next one", async ({ page }) => {
  await page.goto(
    "/#play?skin=castaway-parody&map=official-smb&level=smb-1-1&mode=classic&sound=classic&bots=0&character=castaway&revenge=0&renderer=auto&god=1",
  );
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(() => {
    const debug = window.__originalBrowserPlatformerDebug;
    return debug !== undefined && debug.getSimulationSnapshot().frameIndex > 5;
  });

  const before = await readSimulationSnapshot(page);
  const livesBefore = before.livesRemaining;
  const coinsBefore = before.coinCount;

  // Teleport onto the flag and let the finish play out.
  await page.evaluate(() => {
    window.__originalBrowserPlatformerDebug?.teleportPlayer(3175, 100);
  });
  await page.waitForFunction(
    () => {
      const debug = window.__originalBrowserPlatformerDebug;
      return (
        debug !== undefined &&
        String(debug.getSimulationSnapshot().playerOutcome.kind).includes(
          "finished",
        )
      );
    },
    undefined,
    { timeout: 30_000 },
  );

  // Advance with N, then wait for the next level's own game to be running: a
  // fresh boot restarts the frame clock and holds on its start prompt.
  await page.waitForTimeout(9_000);
  await page.keyboard.press("KeyN");
  await page.waitForFunction(
    () => {
      const debug = window.__originalBrowserPlatformerDebug;
      return (
        debug !== undefined && debug.getSimulationSnapshot().frameIndex < 5
      );
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => {
      const debug = window.__originalBrowserPlatformerDebug;
      return (
        debug !== undefined && debug.getSimulationSnapshot().frameIndex > 5
      );
    },
    undefined,
    { timeout: 30_000 },
  );

  const after = await readSimulationSnapshot(page);
  // The run continues: the life count is the one the previous level ended
  // with, not a new game's default.
  expect(after.livesRemaining).toBe(livesBefore);
  expect(after.coinCount).toBeGreaterThanOrEqual(coinsBefore);
  // And exactly one game is alive — the cleared level was destroyed, not left
  // suspended behind this one.
  expect(await page.locator("canvas").count()).toBe(1);
});

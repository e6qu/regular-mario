import { expect, test, type Page } from "@playwright/test";

// End-to-end coverage for the SMB flow screens: the WORLD intro card starts a
// level with the full life count, each death spends a life, and the third death
// (out of the classic three) triggers the game-over state.

const playRoute =
  "/#play?skin=castaway-parody&map=official-smb&level=smb-1-1&mode=classic&sound=classic";

function snapshot(page: Page) {
  return page.evaluate(() =>
    window.__originalBrowserPlatformerDebug!.getSimulationSnapshot(),
  );
}

async function dieWalkingRight(page: Page): Promise<void> {
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () =>
      String(
        window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
          .playerOutcome.kind,
      ) === "defeated",
    undefined,
    { timeout: 10000 },
  );
  await page.keyboard.up("ArrowRight");
  // Let the death arc play and the death pause settle before retrying.
  await page.waitForTimeout(900);
}

async function retry(page: Page): Promise<void> {
  await page.keyboard.down("KeyR");
  await page.waitForTimeout(120);
  await page.keyboard.up("KeyR");
  await page.waitForFunction(
    () =>
      String(
        window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
          .playerOutcome.kind,
      ) === "active",
    undefined,
    { timeout: 8000 },
  );
  await page.waitForTimeout(120);
}

test("lives count down across deaths and reach game over", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 520 });
  await page.goto(playRoute);
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );

  // The level begins with the classic three lives and no game-over yet.
  expect((await snapshot(page)).livesRemaining).toBe(3);
  expect((await snapshot(page)).gameOver).toBe(false);

  await page.keyboard.press("Space");
  await page.waitForTimeout(120);

  await dieWalkingRight(page);
  expect((await snapshot(page)).livesRemaining).toBe(2);
  await retry(page);
  // The retry carries the post-death count (2), not a reset to three — lives
  // persist across a retry, as in the original.
  expect((await snapshot(page)).livesRemaining).toBe(2);

  await dieWalkingRight(page);
  expect((await snapshot(page)).livesRemaining).toBe(1);
  await retry(page);

  // The last life lost ends the game.
  await dieWalkingRight(page);
  const final = await snapshot(page);
  expect(final.livesRemaining).toBe(0);
  expect(final.gameOver).toBe(true);

  // Retrying after game over starts a fresh game at the full life count.
  await retry(page);
  const restarted = await snapshot(page);
  expect(restarted.livesRemaining).toBe(3);
  expect(restarted.gameOver).toBe(false);
});

test("a warp-zone level raises the WELCOME TO WARP ZONE banner", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 520 });
  // smb-1-3 holds pipes that jump to worlds 2, 3 and 4 — a warp zone.
  await page.goto(
    "/#play?skin=castaway-parody&map=official-smb&level=smb-1-3&mode=classic&sound=classic",
  );
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  expect((await snapshot(page)).warpZone).toBe(true);
});

test("an ordinary level shows no warp-zone banner", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 520 });
  await page.goto(
    "/#play?skin=castaway-parody&map=official-smb&level=smb-1-1&mode=classic&sound=classic",
  );
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  expect((await snapshot(page)).warpZone).toBe(false);
});

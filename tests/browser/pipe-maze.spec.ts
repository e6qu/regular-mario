import { expect, test } from "@playwright/test";

import { readSimulationSnapshot, waitForSimulationRunning } from "./support";

// 8-4's maze pipes all target smb-8-4 itself; a day-one guard against
// self-advancing pipes silently refused them, leaving the checkpoint loop as
// the only path — the level was unwinnable by real play. This journey enters
// the first maze pipe with real input and asserts the same-level warp lands
// past the first checkpoint instead of looping.
test("8-4's first maze pipe is enterable and warps past the checkpoint", async ({
  page,
}) => {
  await page.goto(
    "/#play?skin=castaway-parody&map=official-smb&level=smb-8-4&mode=classic&sound=classic",
  );
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
    undefined,
    { timeout: 30000 },
  );
  // Dismiss the "press any key" start prompt and let the run begin.
  await page.keyboard.press("Space");
  await waitForSimulationRunning(page);

  // Drop onto the pipe cap at column 81 (mouth row 8 → cap surface at
  // pixel 128), centred over the mouth tile, then press Down to enter.
  await page.evaluate(() => {
    window.__originalBrowserPlatformerDebug!.teleportPlayer(81 * 16 - 4, 104);
  });
  await page.waitForTimeout(400);
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(1500);
  await page.keyboard.up("ArrowDown");

  // The warp lands at column 114, beyond checkpoint 96. Give the loop check a
  // beat to (wrongly) fire before reading the position.
  await page.waitForTimeout(500);
  const snapshot = await readSimulationSnapshot(page);
  const playerTileX = Math.floor(snapshot.player.position.x / 16);
  expect(playerTileX).toBeGreaterThanOrEqual(110);
});

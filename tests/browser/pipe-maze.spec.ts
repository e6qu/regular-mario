import { expect, test, type Page } from "@playwright/test";

import { bootContentLevel, readSimulationSnapshot } from "./support";

// Boot a content-set level and drop the player at a world-pixel position.
async function bootLevelAt(
  page: Page,
  levelName: string,
  x: number,
  y: number,
): Promise<void> {
  await bootContentLevel(page, levelName);
  await page.evaluate(
    ([toX, toY]) => {
      window.__originalBrowserPlatformerDebug!.teleportPlayer(toX!, toY!);
    },
    [x, y],
  );
  await page.waitForTimeout(400);
}

// 8-4's maze pipes all target smb-8-4 itself; a day-one guard against
// self-advancing pipes silently refused them, leaving the checkpoint loop as
// the only path — the level was unwinnable by real play. This journey enters
// the first maze pipe with real input and asserts the same-level warp lands
// past the first checkpoint instead of looping.
test("8-4's first maze pipe is enterable and warps past the checkpoint", async ({
  page,
}) => {
  // Drop onto the pipe cap at column 81 (mouth row 8 → cap surface at
  // pixel 128), centred over the mouth tile, then press Down to enter.
  await bootLevelAt(page, "smb-8-4", 81 * 16 - 4, 104);
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

// The route's last warp: the water room's sideways exit (mouth rows 7–8 in a
// wall over open water) is swum into, not walked into — the two-row mouth
// window must catch a bobbing swimmer, or the run dead-ends underwater.
test("the 8-4 water room's exit pipe accepts a swimmer and returns to 8-4", async ({
  page,
}) => {
  // Hover just left of the mouth (col 68, rows 7–8) and swim right with
  // strokes to stay in the mouth's band while closing the gap.
  await bootLevelAt(page, "smb-warp-0-2-w8", 66 * 16, 7 * 16);
  await page.keyboard.down("ArrowRight");
  for (let stroke = 0; stroke < 40; stroke += 1) {
    await page.keyboard.down("Space");
    await page.waitForTimeout(100);
    await page.keyboard.up("Space");
    await page.waitForTimeout(100);
    const s = await readSimulationSnapshot(page);
    if (s.level.widthTiles > 200) {
      break;
    }
  }
  await page.keyboard.up("ArrowRight");

  // The warp is a level advance back to smb-8-4 (336 tiles wide) at col 258.
  await page.waitForFunction(
    () => {
      const s =
        window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
      return s.level.widthTiles > 200;
    },
    undefined,
    { timeout: 15000 },
  );
  const snapshot = await readSimulationSnapshot(page);
  expect(Math.floor(snapshot.player.position.x / 16)).toBeGreaterThanOrEqual(
    250,
  );
});

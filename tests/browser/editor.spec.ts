import { expect, test, type Page } from "@playwright/test";

import { bootPlayTest } from "./support";

// A minimal valid shared level (one player `p`, one exit `x`, on a floor `g`),
// encoded the way the editor's Share button does. Opening it via the URL hash
// boots straight into the editor, independent of the start-menu content load.
const sharedLevel = `10.8.${"..........".repeat(6)}..p....x..gggggggggg`;

// A 16x9 open level (player up high, exit + floor) used by tests that need room
// to move — placing enemies or swimming up from the floor.
const openLevel16x9 = `16.9.${[
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..p..........x..",
  "................",
  "gggggggggggggggg",
].join("")}`;

function watchPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  return errors;
}

// Play-test the current level, dismiss the prompt, then ESC back to the editor.
async function playTestThenReturn(page: Page): Promise<void> {
  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
}

function cellBackground(page: Page, x: number, y: number): Promise<string> {
  return page
    .locator(`[aria-label="cell ${String(x)},${String(y)}"]`)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
}

// Open the editor on the shared fixture level and wait for the palette.
async function openEditor(page: Page): Promise<void> {
  await page.goto(`/#level=${sharedLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
}

// Open the editor on the roomier 16x9 level and wait for the palette.
async function openWideEditor(page: Page): Promise<void> {
  await page.goto(`/#level=${openLevel16x9}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
}

test("editor paints, undoes, and redoes a cell (buttons + keyboard)", async ({
  page,
}) => {
  const errors = watchPageErrors(page);
  await page.goto(`/#level=${sharedLevel}`);

  const block = page.getByRole("button", { name: "Block" });
  await expect(block).toBeVisible();

  const sky = await cellBackground(page, 5, 3);
  await block.click();
  await page.locator('[aria-label="cell 5,3"]').click();
  const painted = await cellBackground(page, 5, 3);
  expect(painted).not.toBe(sky);

  await page.getByRole("button", { name: "↶ Undo" }).click();
  expect(await cellBackground(page, 5, 3)).toBe(sky);

  await page.getByRole("button", { name: "↷ Redo" }).click();
  expect(await cellBackground(page, 5, 3)).toBe(painted);

  await page.keyboard.press("Control+z");
  expect(await cellBackground(page, 5, 3)).toBe(sky);

  expect(errors).toHaveLength(0);
});

test("editor fill tool floods a contiguous region", async ({ page }) => {
  await openEditor(page);

  const sky = await cellBackground(page, 0, 0);
  await page.locator('[aria-label="tool-fill"]').click();
  await page.getByRole("button", { name: "Block" }).click();
  // Click one sky cell; the whole connected sky region should become block.
  await page.locator('[aria-label="cell 0,0"]').click();

  const block = await cellBackground(page, 0, 0);
  expect(block).not.toBe(sky);
  // A far-away sky cell in the same region is filled too.
  expect(await cellBackground(page, 9, 0)).toBe(block);
  expect(await cellBackground(page, 0, 5)).toBe(block);
});

test("editor rectangle tool fills a dragged box", async ({ page }) => {
  await openEditor(page);

  const sky = await cellBackground(page, 2, 2);
  await page.locator('[aria-label="tool-rect"]').click();
  await page.getByRole("button", { name: "Block" }).click();

  // Drag from (2,2) to (4,3) — a 3x2 box.
  const from = page.locator('[aria-label="cell 2,2"]');
  const to = page.locator('[aria-label="cell 4,3"]');
  await from.hover();
  await page.mouse.down();
  await to.hover();
  await page.mouse.up();

  const block = await cellBackground(page, 2, 2);
  expect(block).not.toBe(sky);
  // Every cell in the box is filled; a cell just outside is not.
  expect(await cellBackground(page, 4, 3)).toBe(block);
  expect(await cellBackground(page, 3, 3)).toBe(block);
  expect(await cellBackground(page, 5, 3)).toBe(sky);
});

test("editor minimap navigates a level several times wider than the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 640 });
  const W = 160;
  const H = 10;
  const rows: string[] = [];
  for (let y = 0; y < H; y += 1) {
    if (y === H - 1) {
      rows.push("g".repeat(W));
    } else if (y === H - 2) {
      rows.push(
        Array.from({ length: W }, (_v, i) =>
          i === 2 ? "p" : i === W - 3 ? "x" : ".",
        ).join(""),
      );
    } else {
      rows.push(".".repeat(W));
    }
  }
  await page.goto(`/#level=${W}.${H}.${rows.join("")}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  const grid = page.locator('[aria-label="Level grid"]');
  // The level is genuinely several times wider than the viewport.
  expect(
    await grid.evaluate((el) => el.scrollWidth / el.clientWidth),
  ).toBeGreaterThan(3);

  const minimap = page.locator('canvas[aria-label="Minimap"]');
  const box = await minimap.boundingBox();
  if (box === null) {
    throw new Error("minimap has no bounding box");
  }
  // Clicking near the right end jumps the grid far right...
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  const farRight = await grid.evaluate((el) => el.scrollLeft);
  expect(farRight).toBeGreaterThan(0);
  // ...and clicking near the left end brings it back.
  await page.mouse.click(box.x + box.width * 0.05, box.y + box.height / 2);
  expect(await grid.evaluate((el) => el.scrollLeft)).toBeLessThan(farRight);
});

test("editor pan mode drag-scrolls a wide level", async ({ page }) => {
  const row = Array.from({ length: 40 }, (_v, i) =>
    i === 2 ? "p" : i === 37 ? "x" : ".",
  ).join("");
  const wide = `40.8.${".".repeat(40 * 6)}${row}${"g".repeat(40)}`;
  // Narrow viewport so the ~880px-wide grid overflows and can scroll.
  await page.setViewportSize({ width: 480, height: 680 });
  await page.goto(`/#level=${wide}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  await page.locator('[aria-label="tool-pan"]').click();
  const grid = page.locator('[aria-label="Level grid"]');
  const before = await grid.evaluate((el) => el.scrollLeft);
  const box = await grid.boundingBox();
  if (box === null) {
    throw new Error("grid has no bounding box");
  }
  // Drag left → content scrolls right (scrollLeft increases).
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, {
    steps: 6,
  });
  await page.mouse.up();
  expect(await grid.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
});

test("editor select tool copies and pastes a region", async ({ page }) => {
  await openEditor(page);

  // Paint two blocks, then marquee-select them.
  await page.getByRole("button", { name: "Block" }).click();
  await page.locator('[aria-label="cell 2,1"]').click();
  await page.locator('[aria-label="cell 3,1"]').click();
  const block = await cellBackground(page, 2, 1);
  const sky = await cellBackground(page, 6, 1);

  await page.locator('[aria-label="tool-select"]').click();
  await page.locator('[aria-label="cell 2,1"]').hover();
  await page.mouse.down();
  await page.locator('[aria-label="cell 3,1"]').hover();
  await page.mouse.up();
  await page.keyboard.press("Control+c");

  // Select a paste target, then paste — both copied cells land there.
  await page.locator('[aria-label="cell 5,1"]').click();
  expect(await cellBackground(page, 5, 1)).toBe(sky);
  await page.keyboard.press("Control+v");
  expect(await cellBackground(page, 5, 1)).toBe(block);
  expect(await cellBackground(page, 6, 1)).toBe(block);
});

test("editor line tool draws a straight run of tiles", async ({ page }) => {
  await openEditor(page);

  const sky = await cellBackground(page, 1, 1);
  await page.locator('[aria-label="tool-line"]').click();
  await page.getByRole("button", { name: "Block" }).click();
  await page.locator('[aria-label="cell 1,1"]').hover();
  await page.mouse.down();
  await page.locator('[aria-label="cell 6,1"]').hover();
  await page.mouse.up();

  const block = await cellBackground(page, 1, 1);
  expect(block).not.toBe(sky);
  expect(await cellBackground(page, 4, 1)).toBe(block); // along the line
  expect(await cellBackground(page, 6, 1)).toBe(block); // end
  expect(await cellBackground(page, 4, 3)).toBe(sky); // off the line
});

test("editor eyedropper picks the brush under the cursor", async ({ page }) => {
  await openEditor(page);

  await page.getByRole("button", { name: "Block" }).click();
  await page.locator('[aria-label="cell 5,2"]').click();
  const block = await cellBackground(page, 5, 2);

  // Switch the brush to Coin, then eyedrop the block cell to pick Block back.
  await page.getByRole("button", { name: "Coin" }).click();
  await page.locator('[aria-label="tool-eyedropper"]').click();
  await page.locator('[aria-label="cell 5,2"]').click();

  // Draw elsewhere — it should be the picked Block, not Coin.
  await page.locator('[aria-label="tool-draw"]').click();
  await page.locator('[aria-label="cell 7,2"]').click();
  expect(await cellBackground(page, 7, 2)).toBe(block);
});

test("editor tool drawer collapses and expands", async ({ page }) => {
  await page.goto(`/#level=${sharedLevel}`);
  const fill = page.locator('[aria-label="tool-fill"]');
  await expect(fill).toBeVisible();
  await page.locator('[aria-label="toggle-tool-drawer"]').click();
  await expect(fill).toBeHidden();
  await page.locator('[aria-label="toggle-tool-drawer"]').click();
  await expect(fill).toBeVisible();
});

test("editor selects a brush with a number key", async ({ page }) => {
  await openEditor(page);

  const sky = await cellBackground(page, 5, 2);
  // Key "3" selects the third brush (Block); painting then applies it.
  await page.locator("body").click();
  await page.keyboard.press("3");
  await page.locator('[aria-label="cell 5,2"]').click();
  const painted = await cellBackground(page, 5, 2);
  expect(painted).not.toBe(sky);
  // It matches what clicking the Block swatch and painting produces.
  await page.getByRole("button", { name: "Block" }).click();
  await page.locator('[aria-label="cell 6,2"]').click();
  expect(await cellBackground(page, 6, 2)).toBe(painted);
});

test("painting Coin on a block makes a coin block that stacks, and erasing clears it", async ({
  page,
}) => {
  await openEditor(page);
  const cell = page.locator('[aria-label="cell 5,3"]');
  const sky = await cellBackground(page, 5, 3);

  // A block, then Coin on it turns it into a coin block; each Coin adds one.
  await page.getByRole("button", { name: "Block" }).click();
  await cell.click();
  await page.getByRole("button", { name: "Coin", exact: true }).click();
  await cell.click();
  await expect(cell).toHaveText("●"); // one coin shows a coin on the block
  await cell.click();
  await cell.click();
  await expect(cell).toHaveText("×3"); // multiple coins show the count

  // Erasing removes the whole block (and the coins in it) — back to sky.
  await page.locator('[aria-label="tool-erase"]').click();
  await cell.click();
  await expect(cell).toHaveText("");
  expect(await cellBackground(page, 5, 3)).toBe(sky);
});

test("painting Coin on a brick embeds it (block kept, not replaced)", async ({
  page,
}) => {
  await openEditor(page);
  const cell = page.locator('[aria-label="cell 6,3"]');

  await page.getByRole("button", { name: "Brick" }).click();
  await cell.click();
  const brickBackground = await cell.evaluate((el) => el.style.background);

  await page.getByRole("button", { name: "Coin", exact: true }).click();
  await cell.click();
  // The coin is absorbed into a coin brick — not replaced by a loose coin, and
  // the brick keeps its brick background (a coin is drawn over it).
  await expect(cell).toHaveText("●");
  expect(await cell.evaluate((el) => el.style.background)).toBe(
    brickBackground,
  );
});

test("editor places a piranha plant that emerges and retreats in play", async ({
  page,
}) => {
  const rows = [
    "..........",
    "..........",
    "..........",
    "..........",
    "....n.....",
    "..p.....x.",
    "gggggggggg",
  ];
  const errors = watchPageErrors(page);
  await page.goto(`/#level=10.7.${rows.join("")}`);
  await expect(page.getByRole("button", { name: "Piranha" })).toBeVisible();

  await bootPlayTest(page);
  await page.keyboard.press("Space");

  // Sample the plant's vertical position over time; it must oscillate.
  const ys: number[] = [];
  for (let sample = 0; sample < 6; sample += 1) {
    await page.waitForTimeout(200);
    ys.push(
      await page.evaluate(() => {
        const snapshot =
          window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
        const actor = snapshot?.actors.actors.find(
          (candidate) => String(candidate.role) === "piranha-plant",
        );
        return actor ? Math.round(actor.pixelPosition.y) : -1;
      }),
    );
  }
  expect(new Set(ys.filter((y) => y >= 0)).size).toBeGreaterThan(1);
  expect(errors).toHaveLength(0);
});

test("editor connect-pipe warps the player to its destination in play", async ({
  page,
}) => {
  const rows = [
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    ".p......x.",
    "gggggggggg",
  ];
  await page.goto(`/#level=10.7.${rows.join("")}`);
  await expect(page.getByRole("button", { name: "Pipe ⤓" })).toBeVisible();

  // Place a pipe mouth at (4,5) and connect it to a destination BEHIND the
  // player at (2,5) — so entering it can only move x backward (a teleport).
  await page.getByRole("button", { name: "Pipe ⤓" }).click();
  await page.locator('[aria-label="cell 4,5"]').click();
  await page.locator('[aria-label="tool-connect"]').click();
  await page.locator('[aria-label="cell 4,5"]').click();
  await page.locator('[aria-label="cell 2,5"]').click();

  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);

  const playerXNow = () =>
    page.evaluate(() => {
      const snapshot =
        window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
      return snapshot ? snapshot.player.position.x : -1;
    });

  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowDown");
  // Walk onto the pipe (x rises past it)...
  await page.waitForFunction(() => {
    const snapshot =
      window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
    return snapshot !== undefined && snapshot.player.position.x > 55;
  });
  // ...then the warp drops the player back to tile 2 (x can't fall by walking).
  await page.waitForFunction(() => {
    const snapshot =
      window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
    return snapshot !== undefined && snapshot.player.position.x < 45;
  });
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowDown");
  expect(await playerXNow()).toBeLessThan(45);
});

test("editor tileset defaults to shabby and ignores the retired vector id", async ({
  page,
}) => {
  // A returning visitor whose stored tileset is the retired "vector".
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("regular-mario.editor.tileset", "vector"),
  );
  await page.goto(`/#level=${sharedLevel}`);

  const tileset = page.locator('select[aria-label="Tileset"]');
  await expect(tileset).toBeVisible();
  // Vector is gone; only the shabby tileset is offered, and it's the default.
  await expect(tileset.locator("option")).toHaveText(["Shabby"]);
  expect(await tileset.inputValue()).toBe("castaway-parody");
});

test("editor loads an official level, adds an area, and plays it", async ({
  page,
}) => {
  const errors = watchPageErrors(page);
  await page.goto("/#design");
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  // The "edit an existing map" dropdown offers the shipped official levels.
  const template = page.locator('select[aria-label="Template"]');
  await page.waitForFunction(() => {
    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Template"]',
    );
    return select !== null && select.options.length > 1;
  });
  await template.selectOption("smb-1-1");

  // Add a second area to the official level, then play — it boots (the editor
  // round-trips the official level without duplicate entity ids) and returns
  // with the area intact.
  await page.getByRole("button", { name: "＋ Area" }).click();
  await playTestThenReturn(page);
  await expect(page.locator('select[aria-label="Area"] option')).toHaveText([
    "main",
    "area-1",
  ]);
  expect(errors).toHaveLength(0);
});

test("editor preserves areas and theme across a play-test round-trip", async ({
  page,
}) => {
  await openWideEditor(page);

  // Two extra areas + a non-default theme.
  await page.getByRole("button", { name: "＋ Area" }).click();
  await page.getByRole("button", { name: "＋ Area" }).click();
  await page.selectOption('select[aria-label="Area"]', "main");
  await page.selectOption('select[aria-label="Theme"]', "underground");

  // Play, then return to the editor via ESC.
  await playTestThenReturn(page);

  // The areas and theme survived the round-trip.
  await expect(page.locator('select[aria-label="Area"] option')).toHaveText([
    "main",
    "area-1",
    "area-2",
  ]);
  expect(await page.locator('select[aria-label="Theme"]').inputValue()).toBe(
    "underground",
  );
});

test("editor water theme enables swimming — tap to stroke upward", async ({
  page,
}) => {
  await openWideEditor(page);
  await page.selectOption('select[aria-label="Theme"]', "water");
  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1000); // sink slowly to the floor

  const playerY = () =>
    page.evaluate(
      () =>
        window.__originalBrowserPlatformerDebug?.getSimulationSnapshot().player
          .position.y ?? 0,
    );
  const yFloor = await playerY();

  // Tap the jump/stroke key repeatedly; each tap lifts the player.
  for (let stroke = 0; stroke < 7; stroke += 1) {
    await page.keyboard.down("Space");
    await page.waitForTimeout(60);
    await page.keyboard.up("Space");
    await page.waitForTimeout(90);
  }
  const yTop = await playerY();
  // Swimming: the strokes carried the player well above the floor.
  expect(yFloor - yTop).toBeGreaterThan(60);
});

test("editor places a Buzzy Beetle (fireproof armored enemy) that plays", async ({
  page,
}) => {
  await openWideEditor(page);
  await page.getByRole("button", { name: "Buzzy", exact: true }).click();
  await page.locator('[aria-label="cell 8,7"]').click();

  const errors = watchPageErrors(page);
  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  const armored = await page.evaluate(
    () =>
      window.__originalBrowserPlatformerDebug?.getSimulationSnapshot().actors
        .roleCounts["armored-enemy"] ?? 0,
  );
  expect(armored).toBeGreaterThanOrEqual(1);
  expect(errors).toHaveLength(0);
});

test("editor places hammer bro, lakitu, and chaser enemies that render in play", async ({
  page,
}) => {
  const rows = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".p...........x..",
    "gggggggggggggggg",
  ];
  await page.goto(`/#level=16.9.${rows.join("")}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  await page.getByRole("button", { name: "Hammer", exact: true }).click();
  await page.locator('[aria-label="cell 5,7"]').click();
  await page.getByRole("button", { name: "Lakitu", exact: true }).click();
  await page.locator('[aria-label="cell 8,3"]').click();
  await page.getByRole("button", { name: "Chaser", exact: true }).click();
  await page.locator('[aria-label="cell 11,7"]').click();

  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);

  const counts = await page.evaluate(() => {
    const snapshot =
      window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
    return snapshot?.actors.roleCounts;
  });
  expect(counts?.["throwing-enemy"] ?? 0).toBeGreaterThanOrEqual(1);
  expect(counts?.["aerial-throwing-enemy"] ?? 0).toBeGreaterThanOrEqual(1);
  expect(counts?.["chasing-enemy"] ?? 0).toBeGreaterThanOrEqual(1);
  expect(errors).toHaveLength(0);
});

test("editor theme recolours the level backdrop (underground is dark)", async ({
  page,
}) => {
  const rows = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "....q....rrr....",
    "..p..........x..",
    "................",
    "gggggggggggggggg",
  ];
  await page.goto(`/#level=16.9.${rows.join("")}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  await page.selectOption('select[aria-label="Theme"]', "underground");
  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);

  // Sample the sky area (upper third, centre) — the underground backdrop is
  // near-black (red channel ~0) versus the overworld sky blue (red ~143).
  const skyRed = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (canvas === null) {
      return -1;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return -1;
    }
    const pixel = context.getImageData(
      Math.round(canvas.width / 2),
      Math.round(canvas.height * 0.32),
      1,
      1,
    ).data;
    return pixel[0] ?? -1;
  });
  expect(skyRed).toBeGreaterThanOrEqual(0);
  expect(skyRed).toBeLessThan(60);
});

test("editor cross-area warp: a pipe teleports the player into another area", async ({
  page,
}) => {
  const rows = [
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    ".p.......x..",
    "gggggggggggg",
  ];
  await page.goto(`/#level=12.9.${rows.join("")}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  // Place a pipe in the main area, add a second area, and connect the pipe
  // across areas (pick pipe in "main", switch to "area-1", pick a destination).
  await page.getByRole("button", { name: "Pipe ⤓" }).click();
  await page.locator('[aria-label="cell 4,7"]').click();
  await page.getByRole("button", { name: "＋ Area" }).click();
  await page.selectOption('select[aria-label="Area"]', "main");
  await page.locator('[aria-label="tool-connect"]').click();
  await page.locator('[aria-label="cell 4,7"]').click();
  await page.selectOption('select[aria-label="Area"]', "area-1");
  await page.locator('[aria-label="cell 5,3"]').click();
  await page.selectOption('select[aria-label="Area"]', "main");

  // Play: the main area is 12 wide; entering the pipe warps to area-1 (24 wide).
  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  const levelWidth = () =>
    page.evaluate(() => {
      const snapshot =
        window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
      return snapshot ? snapshot.level.widthTiles : -1;
    });
  expect(await levelWidth()).toBe(12);

  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(
    () => {
      const snapshot =
        window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
      return snapshot !== undefined && snapshot.level.widthTiles === 24;
    },
    undefined,
    { timeout: 6000 },
  );
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ArrowDown");
  expect(await levelWidth()).toBe(24);
});

test("editor supports brick and question power-up blocks", async ({ page }) => {
  await openEditor(page);
  const errors = watchPageErrors(page);

  await page.getByRole("button", { name: "Brick" }).click();
  await page.locator('[aria-label="cell 3,3"]').click();
  const brick = await cellBackground(page, 3, 3);
  await page.getByRole("button", { name: "? Power" }).click();
  await page.locator('[aria-label="cell 5,3"]').click();
  // Distinct-looking blocks, and the level validates + boots with them.
  expect(brick).not.toBe(await cellBackground(page, 5, 3));
  await page.getByRole("button", { name: "▶ Play" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toHaveLength(0);
});

test("re-placing the same brush clears the cell; a different brush replaces", async ({
  page,
}) => {
  await openEditor(page);
  const cell = page.locator('[aria-label="cell 4,4"]');
  const sky = await cellBackground(page, 4, 4);

  await page.getByRole("button", { name: "Block" }).click();
  await cell.click();
  const block = await cellBackground(page, 4, 4);
  expect(block).not.toBe(sky);

  // Same brush again → back to sky (toggle).
  await cell.click();
  expect(await cellBackground(page, 4, 4)).toBe(sky);

  // Re-place a block, then a different brush replaces it (does not toggle).
  await cell.click();
  await page.getByRole("button", { name: "Spikes" }).click();
  await cell.click();
  const spikes = await cellBackground(page, 4, 4);
  expect(spikes).not.toBe(sky);
  expect(spikes).not.toBe(block);
});

test("editor shows a minimap and preserves painted cells across a widen", async ({
  page,
}) => {
  await page.goto(`/#level=${sharedLevel}`);
  await expect(page.locator('canvas[aria-label="Minimap"]')).toBeVisible();

  await page.getByRole("button", { name: "Block" }).click();
  await page.locator('[aria-label="cell 3,3"]').click();
  const before = await cellBackground(page, 3, 3);

  // Widen is top-left anchored, so an existing cell keeps its content.
  await page.getByRole("button", { name: "Wider +" }).click();
  expect(await cellBackground(page, 3, 3)).toBe(before);
});

// A level with a row of hidden blocks two tiles above the player, so a jump from
// anywhere along it bumps one from below.
const hiddenBlockLevel = `16.9.${[
  "................",
  "................",
  "................",
  "................",
  "................",
  ".iiiiii.........",
  ".p...........x..",
  "................",
  "gggggggggggggggg",
].join("")}`;

test("a hidden block stays invisible until bumped, then reveals and drops a coin", async ({
  page,
}) => {
  const errors = watchPageErrors(page);
  await page.goto(`/#level=${hiddenBlockLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);

  const snapshot = () =>
    page.evaluate(() => {
      const state =
        window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
      return {
        bumped: state?.interactiveBlocks.bumpedBlockTilePositions.length ?? 0,
        coins: state?.coinCount ?? 0,
      };
    });

  // Jump (held) until the player's head bumps one of the hidden blocks.
  let result = await snapshot();
  for (let attempt = 0; attempt < 10 && result.bumped === 0; attempt += 1) {
    await page.keyboard.down("Space");
    await page.waitForTimeout(430);
    await page.keyboard.up("Space");
    await page.waitForTimeout(430);
    result = await snapshot();
  }

  // The bumped block revealed (joined the interactive-block set) and dropped a
  // coin that was collected — and rendering the revealed block raised no error.
  expect(result.bumped).toBeGreaterThan(0);
  expect(result.coins).toBeGreaterThan(0);
  expect(errors).toHaveLength(0);
});

// A cannon on the floor with the player a few tiles to its left, so the Bullet
// Bills it fires travel toward the player.
const cannonLevel = `16.9.${[
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..p.....o....x..",
  "................",
  "gggggggggggggggg",
].join("")}`;

test("a placed cannon fires Bullet Bill projectiles during play", async ({
  page,
}) => {
  const errors = watchPageErrors(page);
  await page.goto(`/#level=${cannonLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);

  const projectileCount = () =>
    page.evaluate(
      () =>
        window.__originalBrowserPlatformerDebug?.getSimulationSnapshot()
          .timedHazardProjectiles.projectiles.length ?? 0,
    );

  // The cannon fires on a fixed cadence; wait until a bullet is in flight.
  let count = 0;
  for (let attempt = 0; attempt < 40 && count === 0; attempt += 1) {
    await page.waitForTimeout(120);
    count = await projectileCount();
  }

  expect(count).toBeGreaterThan(0);
  expect(errors).toHaveLength(0);
});

test("editor shows a guided tutorial (auto first time, remembered) and a menu button", async ({
  page,
}) => {
  const errors = watchPageErrors(page);
  await page.goto("/");
  // Fresh visitor: no tutorial-seen flag.
  await page.evaluate(() =>
    localStorage.removeItem("regular-mario.editor.tutorial-seen"),
  );
  await page.goto(`/#level=${sharedLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  // The walkthrough auto-starts on the first step.
  await expect(page.getByText("1 / 8 · Palette")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("2 / 8 · Tools")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("2 / 8 · Tools")).toBeHidden();

  // Skipping is remembered — reopening does not auto-start it again.
  await page.goto(`/#level=${sharedLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  await expect(page.getByText("1 / 8 · Palette")).toBeHidden();

  // The prominent Tutorial button restarts it on demand.
  await page.getByRole("button", { name: "Start editor tutorial" }).click();
  await expect(page.getByText("1 / 8 · Palette")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  // The circled-i opens the detailed static guide.
  await page.getByRole("button", { name: "Editor guide" }).click();
  await expect(page.getByText("Level Editor Guide")).toBeVisible();
  await page.getByRole("button", { name: "✕ Close" }).click();
  await expect(page.getByText("Level Editor Guide")).toBeHidden();

  // The prominent menu button returns to the start menu.
  await page.getByRole("button", { name: "Return to menu" }).click();
  await expect(page.getByRole("button", { name: "Block" })).toBeHidden();
  expect(errors).toHaveLength(0);
});

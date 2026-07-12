import { expect, test, type Page } from "@playwright/test";

// A minimal valid shared level (player + exit + floor), opened via the URL hash.
const sharedLevel = `10.8.${"..........".repeat(6)}..p....x..gggggggggg`;

function cellBg(page: Page, x: number, y: number): Promise<string> {
  return page
    .locator(`[aria-label="cell ${String(x)},${String(y)}"]`)
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function openDesigner(page: Page): Promise<void> {
  await page.goto(`/#level=${sharedLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
}

// Wait for the booted game to be ready (as a real player would, seeing the
// prompt), focus it, then hold a key to start and confirm the sim advances past
// `minFrame`.
async function startAndAdvance(page: Page, minFrame: number): Promise<void> {
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  await page.locator("canvas").click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("Space");
  await page.waitForFunction((frame) => {
    const api = window.__originalBrowserPlatformerDebug;
    return api !== undefined && api.getSimulationSnapshot().frameIndex > frame;
  }, minFrame);
  await page.keyboard.up("Space");
}

// Class of bug: state lost across a play-test round-trip (the reported skin reset
// and any level loss).
test("play-testing preserves the skin and the level on return", async ({
  page,
}) => {
  await openDesigner(page);

  await page.getByRole("button", { name: "Block" }).click();
  await page.locator('[aria-label="cell 4,4"]').click();
  const painted = await cellBg(page, 4, 4);

  await page.selectOption('select[aria-label="Tileset"]', "castaway-parody");
  await page.getByRole("button", { name: "▶ Play" }).click();
  await expect(page.locator("canvas")).toBeVisible();

  // Return to the designer.
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();

  // The skin selection and the painted cell both survived.
  expect(await page.locator('select[aria-label="Tileset"]').inputValue()).toBe(
    "castaway-parody",
  );
  expect(await cellBg(page, 4, 4)).toBe(painted);
});

// Class of bug: a play-test won't actually play (default shabby tileset).
test("play-testing runs the game with the shabby tileset", async ({ page }) => {
  await openDesigner(page);
  await page.getByRole("button", { name: "▶ Play" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await startAndAdvance(page, 3);
});

// Class of bug: the start-gate ignores a valid key (Space).
test("Space dismisses the press-any-key start prompt", async ({ page }) => {
  await openDesigner(page);
  await page.getByRole("button", { name: "▶ Play" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await startAndAdvance(page, 5);
});

// Class of bug: persisted preferences and saved levels accumulate in
// localStorage with no way for the user to clear them.
test("the start menu's reset clears saved data and keeps unrelated keys", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("regular-mario:renderer", "webgl");
    localStorage.setItem("regular-mario-editor-levels", "[{}]");
    localStorage.setItem("other-app", "keep");
  });

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset saved data" }).click();
  await page.waitForLoadState("load");

  const stored = await page.evaluate(() => ({
    renderer: localStorage.getItem("regular-mario:renderer"),
    levels: localStorage.getItem("regular-mario-editor-levels"),
    other: localStorage.getItem("other-app"),
  }));
  expect(stored.renderer).toBeNull();
  expect(stored.levels).toBeNull();
  expect(stored.other).toBe("keep");
});

// Class of bug: an unplayable level (missing player/goal) fails silently — the
// most likely "can't play from the creator" report.
test("play-testing an invalid level explains why instead of doing nothing", async ({
  page,
}) => {
  await openDesigner(page);
  await page.getByRole("button", { name: "✕ Clear" }).click();
  await page.getByRole("button", { name: "▶ Play" }).click();
  // Still in the designer, with a clear reason shown (not a silent no-op).
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  await expect(page.getByText(/Can't play yet/)).toBeVisible();
});

// Class of bug: level size can't be set directly.
test("the width/height inputs resize the level", async ({ page }) => {
  await openDesigner(page);
  const widthInput = page.locator('[aria-label="Level width"]');
  await widthInput.fill("24");
  await widthInput.press("Enter");
  const maxX = await page.evaluate(() => {
    let max = 0;
    for (const cell of document.querySelectorAll('[aria-label^="cell "]')) {
      const x = Number(
        cell.getAttribute("aria-label")?.split(" ")[1]?.split(",")[0],
      );
      if (x > max) {
        max = x;
      }
    }
    return max;
  });
  expect(maxX).toBe(23);
});

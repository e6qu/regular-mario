import { expect, test, type Page } from "@playwright/test";

// Importing this type also brings the `declare global` for the debug API into
// scope, so `window.__originalBrowserPlatformerDebug` is typed inside evaluate.
import type { BrowserSimulationSnapshot } from "../../src/shell/browser-debug-api";
import { dismissEditorTutorial } from "./support";

const rotatePrompt = '[aria-label="Rotate your device to landscape"]';

function readSnapshot(page: Page): Promise<BrowserSimulationSnapshot> {
  return page.evaluate(() => {
    const api = window.__originalBrowserPlatformerDebug;
    if (api === undefined) {
      throw new Error("Browser simulation debug API is unavailable.");
    }
    return api.getSimulationSnapshot();
  });
}

// Gameplay is landscape-only on touch devices.
test.describe("touch device (landscape)", () => {
  test.use({ hasTouch: true, viewport: { width: 760, height: 420 } });

  test("minimal on-screen controls appear and drive the player", async ({
    page,
  }) => {
    await page.goto("/?browserLevel=first-authored");

    // The minimal console-style set: move (◀ ▶), jump (A), run/fire (B), pause.
    for (const label of [
      "touch-◀",
      "touch-▶",
      "touch-A",
      "touch-B",
      "touch-pause",
    ]) {
      await expect(page.locator(`button[aria-label="${label}"]`)).toBeVisible();
    }
    await expect(page.locator(rotatePrompt)).toBeHidden();

    // Jump (A) sits lowest of the action buttons — it's the most-used.
    const aBox = await page
      .locator('button[aria-label="touch-A"]')
      .boundingBox();
    const bBox = await page
      .locator('button[aria-label="touch-B"]')
      .boundingBox();
    if (aBox === null || bBox === null) {
      throw new Error("action buttons have no bounding box");
    }
    expect(aBox.y + aBox.height).toBeGreaterThan(bBox.y + bBox.height);

    // Wait until the simulation is stepping, then hold ▶ to walk right.
    await page.waitForFunction(() => {
      const api = window.__originalBrowserPlatformerDebug;
      return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
    });
    const start = (await readSnapshot(page)).player.position.x;
    const box = await page
      .locator('button[aria-label="touch-▶"]')
      .boundingBox();
    if (box === null) {
      throw new Error("right button has no bounding box");
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForFunction((startX) => {
      const api = window.__originalBrowserPlatformerDebug;
      return (
        api !== undefined &&
        api.getSimulationSnapshot().player.position.x > startX
      );
    }, start);
    await page.mouse.up();

    expect((await readSnapshot(page)).player.position.x).toBeGreaterThan(start);
  });
});

// Portrait on a touch device prompts a rotate, since play is landscape-only.
test.describe("touch device (portrait)", () => {
  test.use({ hasTouch: true, viewport: { width: 420, height: 760 } });

  test("shows a rotate-to-landscape prompt", async ({ page }) => {
    await page.goto("/?browserLevel=first-authored");
    await expect(page.locator(rotatePrompt)).toBeVisible();
  });
});

test.describe("desktop", () => {
  test.use({ hasTouch: false });

  test("no touch controls or rotate prompt on a fine-pointer device", async ({
    page,
  }) => {
    await page.goto("/?browserLevel=first-authored");
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator('button[aria-label="touch-▶"]')).toHaveCount(0);
    await expect(page.locator(rotatePrompt)).toBeHidden();
  });
});

// The level editor is drag-heavy; touch drags don't fire mouseenter, so painting
// is driven from touch events instead.
test.describe("touch device (editor)", () => {
  test.use({ hasTouch: true, viewport: { width: 900, height: 620 } });

  test("paints a cell by tapping in the editor", async ({ page }) => {
    const rows = `${".".repeat(16 * 7)}..p..........x..${"g".repeat(16)}`;
    await page.goto(`/#level=16.9.${rows}`);
    await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
    await dismissEditorTutorial(page);

    await page.getByRole("button", { name: "Block" }).click();
    const cell = page.locator('[aria-label="cell 4,4"]');
    const before = await cell.evaluate((el) => el.style.background);
    const box = await cell.boundingBox();
    if (box === null) {
      throw new Error("editor cell has no bounding box");
    }

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(() => cell.evaluate((el) => el.style.background))
      .not.toBe(before);
  });
});

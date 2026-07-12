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

  test("NES controls flank the canvas and drive the player", async ({
    page,
  }) => {
    await page.goto("/?browserLevel=first-authored");

    // The console-style deck: D-pad (left/right/up/down), A, B, and START.
    for (const label of [
      "touch-left",
      "touch-right",
      "touch-up",
      "touch-down",
      "touch-A",
      "touch-B",
      "touch-start",
    ]) {
      await expect(page.locator(`button[aria-label="${label}"]`)).toBeVisible();
    }
    await expect(page.locator(rotatePrompt)).toBeHidden();

    // The control panels FLANK the canvas (left and right), OUTSIDE the drawing
    // surface: the left panel is entirely left of the canvas, the right panel
    // entirely right of it, the canvas keeps ~full height, and its width is
    // narrower than the window because the panels claimed the sides.
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const left = document.querySelector('[data-role="touch-control-left"]');
      const right = document.querySelector('[data-role="touch-control-right"]');
      if (canvas === null || left === null || right === null) {
        throw new Error("missing canvas or control panels");
      }
      const c = canvas.getBoundingClientRect();
      const l = left.getBoundingClientRect();
      const r = right.getBoundingClientRect();
      return {
        canvasLeft: c.left,
        canvasRight: c.right,
        canvasWidth: c.width,
        canvasHeight: c.height,
        leftRight: l.right,
        rightLeft: r.left,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      };
    });
    expect(geometry.leftRight).toBeLessThanOrEqual(geometry.canvasLeft + 1);
    expect(geometry.rightLeft).toBeGreaterThanOrEqual(geometry.canvasRight - 1);
    expect(geometry.canvasWidth).toBeLessThan(geometry.windowWidth - 80);
    // Vertical real estate is preserved (near full-height view).
    expect(geometry.canvasHeight).toBeGreaterThan(geometry.windowHeight - 40);

    // B sits to the left of A (the NES A/B row).
    const aBox = await page
      .locator('button[aria-label="touch-A"]')
      .boundingBox();
    const bBox = await page
      .locator('button[aria-label="touch-B"]')
      .boundingBox();
    if (aBox === null || bBox === null) {
      throw new Error("action buttons have no bounding box");
    }
    expect(aBox.x).toBeGreaterThan(bBox.x);

    // Wait until the simulation is stepping, then hold ▶ to walk right.
    await page.waitForFunction(() => {
      const api = window.__originalBrowserPlatformerDebug;
      return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
    });
    const start = (await readSnapshot(page)).player.position.x;
    const box = await page
      .locator('button[aria-label="touch-right"]')
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
    await expect(page.locator('button[aria-label="touch-right"]')).toHaveCount(
      0,
    );
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

import { expect, test, type Page } from "@playwright/test";

// Importing this type also brings the `declare global` for the debug API into
// scope, so `window.__originalBrowserPlatformerDebug` is typed inside evaluate.
import type { BrowserSimulationSnapshot } from "../../src/shell/browser-debug-api";
import {
  bootPlayTest,
  dismissEditorTutorial,
  waitForGameBoot,
} from "./support";

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

  test("a suspended game's deck never doubles up beside the next game", async ({
    page,
  }) => {
    // Start a game from the menu, suspend it (ESC → paused tab), start another.
    // The suspended game's control panels live in the same shared layer as the
    // new game's; they must stay hidden or the new game boots flanked by TWO
    // decks per side with its viewport squeezed between them.
    await page.goto("/");
    await bootPlayTest(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "▶ Play" }).click();
    await waitForGameBoot(page, 2);

    // Exactly one deck (one left + one right panel) is visible, and the active
    // canvas spans the full space between it — a phantom second deck from the
    // suspended game would claim that width.
    await expect(
      page.locator('[data-role="touch-control-left"]:visible'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-role="touch-control-right"]:visible'),
    ).toHaveCount(1);
    const geometry = await page.evaluate(() => {
      const canvas = [...document.querySelectorAll("canvas")].find(
        (element) => getComputedStyle(element).display !== "none",
      );
      const left = [
        ...document.querySelectorAll('[data-role="touch-control-left"]'),
      ].find((element) => getComputedStyle(element).display !== "none");
      const right = [
        ...document.querySelectorAll('[data-role="touch-control-right"]'),
      ].find((element) => getComputedStyle(element).display !== "none");
      if (canvas === undefined || left === undefined || right === undefined) {
        throw new Error("missing canvas or control panels");
      }
      return {
        canvasLeft: canvas.getBoundingClientRect().left,
        canvasRight: canvas.getBoundingClientRect().right,
        leftPanelRight: left.getBoundingClientRect().right,
        rightPanelLeft: right.getBoundingClientRect().left,
      };
    });
    expect(geometry.canvasLeft).toBeLessThanOrEqual(
      geometry.leftPanelRight + 1,
    );
    expect(geometry.canvasRight).toBeGreaterThanOrEqual(
      geometry.rightPanelLeft - 1,
    );

    // Closing the paused tabs must actually destroy their games — panels and
    // canvases removed from the DOM (a sleeping game loop defers destroy).
    await page.keyboard.press("Escape");
    const closeTab = page.locator(
      '[role="tablist"] button[aria-label^="Close"]',
    );
    await expect(closeTab).toHaveCount(2);
    await closeTab.first().click();
    await expect(closeTab).toHaveCount(1);
    await closeTab.first().click();
    await expect(closeTab).toHaveCount(0);
    await expect(page.locator('[data-role="touch-control-left"]')).toHaveCount(
      0,
    );
    await expect(page.locator('canvas[aria-label*="game"]')).toHaveCount(0);
  });

  test("the size toggle resizes the control panels and persists", async ({
    page,
  }) => {
    await page.goto("/?browserLevel=first-authored");
    await page.waitForFunction(
      () => window.__originalBrowserPlatformerDebug !== undefined,
    );

    const leftPanel = page.locator('[data-role="touch-control-left"]');
    const widthOf = async (): Promise<number> => {
      const box = await leftPanel.boundingBox();
      if (box === null) {
        throw new Error("left panel has no bounding box");
      }
      return box.width;
    };

    const before = await widthOf();
    // Cycle to the next size (S/M/L wraps); the panel width must change.
    await page.locator('[aria-label="touch-control-size"]').click();
    await expect.poll(widthOf).not.toBe(before);
    const afterToggle = await widthOf();

    // The choice persists across a reload (within sub-pixel rounding).
    await page.reload();
    await page.waitForFunction(
      () => window.__originalBrowserPlatformerDebug !== undefined,
    );
    expect(Math.abs((await widthOf()) - afterToggle)).toBeLessThan(2);
  });

  test("starts the music from a touch press (no keyboard on mobile)", async ({
    page,
  }) => {
    // Music/SFX can only begin from a user gesture on mobile, and no keydown
    // ever fires — so the touch press must start the soundtrack. Spy on the
    // AudioContext to see the music voices get created.
    await page.addInitScript(() => {
      type OscillatorFactory = (...args: unknown[]) => unknown;
      const w = window as unknown as {
        __audioOscillators: number;
        AudioContext?: { prototype: { createOscillator: OscillatorFactory } };
        webkitAudioContext?: {
          prototype: { createOscillator: OscillatorFactory };
        };
      };
      w.__audioOscillators = 0;
      const ctor = w.AudioContext ?? w.webkitAudioContext;
      if (ctor !== undefined) {
        const original = ctor.prototype.createOscillator;
        ctor.prototype.createOscillator = function (
          this: unknown,
          ...args: unknown[]
        ): unknown {
          w.__audioOscillators += 1;
          return original.apply(this, args);
        };
      }
    });
    await page.goto("/?browserLevel=first-authored");
    await page.waitForFunction(
      () => window.__originalBrowserPlatformerDebug !== undefined,
    );

    // No music before any input.
    const before = await page.evaluate(
      () =>
        (window as unknown as { __audioOscillators: number })
          .__audioOscillators,
    );
    // A control press is the user gesture that unlocks and starts the music.
    await page
      .locator('button[aria-label="touch-right"]')
      .dispatchEvent("pointerdown");
    await page.waitForTimeout(200);
    const after = await page.evaluate(
      () =>
        (window as unknown as { __audioOscillators: number })
          .__audioOscillators,
    );
    expect(after).toBeGreaterThan(before);
  });

  test("thumb-rolls across the D-pad without lifting (◀ → ▶)", async ({
    page,
  }) => {
    await page.goto("/?browserLevel=first-authored");
    await page.waitForFunction(() => {
      const api = window.__originalBrowserPlatformerDebug;
      return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
    });

    const leftBox = await page
      .locator('button[aria-label="touch-left"]')
      .boundingBox();
    const rightBox = await page
      .locator('button[aria-label="touch-right"]')
      .boundingBox();
    if (leftBox === null || rightBox === null) {
      throw new Error("d-pad arms have no bounding box");
    }

    // Press ◀, then slide the still-held pointer onto ▶ (no lift). Implicit
    // pointer capture would swallow this; releasePointerCapture + pointerenter
    // make the roll register, so the player ends up moving right.
    await page.mouse.move(
      leftBox.x + leftBox.width / 2,
      leftBox.y + leftBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      rightBox.x + rightBox.width / 2,
      rightBox.y + rightBox.height / 2,
      { steps: 6 },
    );
    const afterRoll = (await readSnapshot(page)).player.position.x;
    await page.waitForFunction((startX) => {
      const api = window.__originalBrowserPlatformerDebug;
      return (
        api !== undefined &&
        api.getSimulationSnapshot().player.position.x > startX
      );
    }, afterRoll);
    await page.mouse.up();

    expect((await readSnapshot(page)).player.position.x).toBeGreaterThan(
      afterRoll,
    );
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

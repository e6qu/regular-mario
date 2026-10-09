import { expect, test, type Page } from "@playwright/test";
import {
  controlTouchPoint,
  createTouchDriver,
  expectInsideViewport,
} from "../support/mobile-browser-support";
import {
  advanceSimulationFrames,
  readSimulationSnapshot,
  waitForSimulationRunning,
} from "./support";

test.use({ hasTouch: true, deviceScaleFactor: 2 });
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 664 },
  { width: 568, height: 320 },
]) {
  test(`phone menu fits and all actions are reachable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const menu = page.getByRole("region", { name: "Start menu" });
    await expect(menu.getByLabel("Level")).toHaveValue("smb-1-1");
    await expectInsideViewport(menu);
    await expect(
      page.getByLabel("Rotate your device to landscape"),
    ).toBeHidden();
    await expect(
      page.getByRole("dialog", { name: "Start menu tutorial" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("regular-mario.menu.tutorial-seen"),
      ),
    ).toBeNull();
    for (const control of [
      menu.getByLabel("Asset set"),
      menu.getByLabel("Game mode"),
      menu.getByLabel("God mode"),
      menu.getByRole("button", { name: "Reset saved data" }),
    ]) {
      await control.scrollIntoViewIfNeeded();
      await expectInsideViewport(control);
    }
    await menu.getByLabel("God mode").tap();
    await expect(menu.getByLabel("God mode")).toBeChecked();
    await menu.getByLabel("Game mode").selectOption("classic");
    await menu.getByRole("button", { name: "▶ PLAY", exact: true }).tap();
    await expect(page.locator("canvas")).toBeVisible();
    if (viewport.height > viewport.width) {
      await expect(
        page.getByLabel("Rotate your device to landscape"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Back to menu" }).tap();
      await expect(menu).toBeVisible();
      await expect(
        page.getByLabel("Rotate your device to landscape"),
      ).toBeHidden();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
  });
}

test("touch move, run, jump, thumb roll and cancellation work together", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Multi-finger input uses Chromium CDP.",
  );
  await page.setViewportSize({ width: 568, height: 320 });
  // Isolate input release from enemy knockback on the showcase fixture.
  const rowWidth = 64;
  const floorRow = `${".".repeat(8)}p${".".repeat(51)}x...`;
  const rows = `${".".repeat(rowWidth * 7)}${floorRow}${"g".repeat(rowWidth)}`;
  await page.goto(`/#level=${rowWidth}.9.${rows}`);
  await page.getByRole("button", { name: "▶ Play", exact: true }).tap();
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  await page.getByLabel("touch-B", { exact: true }).tap();
  await waitForSimulationRunning(page);
  for (const label of [
    "touch-left",
    "touch-right",
    "touch-A",
    "touch-B",
    "touch-start",
    "touch-pause",
    "touch-control-size",
  ]) {
    const control = page.getByRole("button", { name: label, exact: true });
    await expectInsideViewport(control);
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  const start = await readSimulationSnapshot(page);
  const touch = await createTouchDriver(page);
  const right = await controlTouchPoint(page, "touch-right", 1);
  const jump = await controlTouchPoint(page, "touch-A", 2);
  const run = await controlTouchPoint(page, "touch-B", 3);
  await touch.send("touchStart", [right]);
  await touch.send("touchStart", [right, jump, run]);
  await advanceSimulationFrames(page, 8);
  const moved = await readSimulationSnapshot(page);
  expect(moved.player.position.x).toBeGreaterThan(start.player.position.x);
  expect(moved.player.position.y).toBeLessThan(start.player.position.y);
  // Lifting the action fingers leaves movement held by the first finger.
  await touch.send("touchEnd", [right]);
  await advanceSimulationFrames(page, 8);
  expect(
    (await readSimulationSnapshot(page)).player.position.x,
  ).toBeGreaterThan(moved.player.position.x);
  const left = await controlTouchPoint(page, "touch-left", 1);
  await touch.send("touchMove", [left]);
  await advanceSimulationFrames(page, 20);
  expect((await readSimulationSnapshot(page)).player.velocity.x).toBeLessThan(
    0,
  );
  await touch.send("touchCancel", []);
  await advanceSimulationFrames(page, 40);
  expect((await readSimulationSnapshot(page)).player.velocity.x).toBe(0);
  await touch.send("touchStart", [right, run]);
  await advanceSimulationFrames(page, 8);
  expect(
    (await readSimulationSnapshot(page)).player.velocity.x,
  ).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await advanceSimulationFrames(page, 40);
  expect((await readSimulationSnapshot(page)).player.velocity.x).toBe(0);
  await touch.send("touchEnd", []);
  await touch.close();
});

test("phone pause, retry, menu and suspended-session resume need no keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/?browserLevel=first-authored");
  await waitForSimulationRunning(page);
  await page.getByLabel("touch-pause", { exact: true }).tap();
  const paused = await readSimulationSnapshot(page);
  await expectInsideViewport(page.locator(".tl-overlay"));
  await page.getByRole("button", { name: "Resume", exact: true }).tap();
  await advanceSimulationFrames(page, 3);
  expect((await readSimulationSnapshot(page)).frameIndex).toBeGreaterThan(
    paused.frameIndex,
  );
  await page.getByLabel("touch-pause", { exact: true }).tap();
  await page.getByRole("button", { name: "Retry", exact: true }).tap();
  await expect(page.locator(".tl-overlay")).toBeHidden();
  await page.getByLabel("touch-start", { exact: true }).tap();
  const menu = page.getByRole("region", { name: "Start menu" });
  await expect(menu).toBeVisible();
  await expectInsideViewport(menu);
  const play = menu.getByRole("button", { name: "▶ PLAY", exact: true });
  await play.scrollIntoViewIfNeeded();
  await expectInsideViewport(play);
  await page.getByRole("tab").tap();
  await expect(menu).toBeHidden();
  await expect(
    page.locator('[data-role="touch-control-left"]:visible'),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "Back to menu" }).tap();
  await expect(menu).toBeVisible();
});

test("desktop walkthrough stays bounded, can be replayed, and closes at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const tutorial = page.getByRole("dialog", { name: "Start menu tutorial" });
  await expect(tutorial).toBeVisible();
  for (let step = 0; step < 6; step += 1) {
    await expectInsideViewport(tutorial);
    await tutorial.getByRole("button", { name: "Next", exact: true }).tap();
  }
  await tutorial.getByRole("button", { name: "Done", exact: true }).tap();
  await page
    .getByRole("button", { name: "Start menu tutorial", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Start menu tutorial", exact: true })
    .tap();
  await expect(tutorial).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(tutorial).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start menu tutorial" }),
  ).toBeHidden();
});

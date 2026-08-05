import { expect, test, type Page } from "@playwright/test";

import { enterMultiplayerLobby } from "./support";

const sixtyHertzFrameMilliseconds = 1000 / 60;

async function replayOpeningRunJump(page: Page): Promise<void> {
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("ArrowRight");
  const startedAtMilliseconds = performance.now();
  let scheduledFrames = 0;
  for (const [frames, jump] of [
    [32, true],
    [4, false],
    [30, true],
    [1, false],
    [32, true],
    [6, false],
    [32, true],
    [18, false],
    [15, true],
    [44, false],
  ] as const) {
    if (jump) await page.keyboard.down("Space");
    else await page.keyboard.up("Space");
    scheduledFrames += frames;
    const waitMilliseconds =
      scheduledFrames * sixtyHertzFrameMilliseconds -
      (performance.now() - startedAtMilliseconds);
    if (waitMilliseconds > 0) await page.waitForTimeout(waitMilliseconds);
  }
  await page.keyboard.up("Space");
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("ShiftLeft");
}

test("World 1-1 renders its first authored pipe in a live multiplayer game", async ({
  page,
}) => {
  await enterMultiplayerLobby(page);
  await page.getByLabel("Nickname").fill("Pipe scout");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByLabel("Bundled level").selectOption("smb-1-1");
  await page.getByRole("button", { name: "Create game" }).click();
  const canvas = page.getByLabel("Authoritative multiplayer game view");
  await expect(canvas).toBeVisible();
  await canvas.focus();

  // The first pipe is immediately after the initial 256 px camera window and
  // just beyond the first ground enemy. Run-jump through that stretch using
  // only normal browser controls; no debug state is injected.
  await replayOpeningRunJump(page);

  await expect
    .poll(async () =>
      Number(await canvas.getAttribute("data-rendered-primary-x")),
    )
    .toBeGreaterThan(420);
  await page.keyboard.press("KeyP");
  await expect(page.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "paused",
  );
  await canvas.screenshot({
    path: "playwright_adhoc/multiplayer-pipe-rendering/world-1-1-first-pipe.png",
    animations: "disabled",
  });
});

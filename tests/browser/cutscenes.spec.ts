import { expect, test, type Page } from "@playwright/test";

import { timeBonusFramesPerDisplayUnit } from "../../src/engine/simulation/game-score";
import { readSimulationSnapshot } from "./support";

// End-of-level cutscene coverage: the flagpole slide (any grab height, with
// the top-grab ball knock-off), the castle-clear bridge chop + rescue message
// (fixture and the real castle with its boss), and the victory fireworks. The
// debug API's `cutscene` snapshot exposes the shell-side staging, and
// `teleportPlayer` jumps straight to the level's end without a full run.

// The real 1-1 flagpole column (x = 198 · 16 world pixels).
const smb11PoleX = 198 * 16;
// A grab height low on the pole (world y), well below the ball at the top.
const smb11LowGrabY = 120;
// The real castle labelled 1-4 ships as the FILE smb-1-5 (intro-vestibule
// worlds shift the names — see docs/terminology.md); its axe/exit gate sits
// at tile (141, 11), and a y of 170 drops the player's box onto that tile.
const smb15CastleAxe = { x: 141 * 16, y: 170 };
// castle-clear-route fixture geometry (see castle-clear-route-level.ts):
// the gate column, the walk row, and the bridge's plank-column count.
const fixtureAxe = { x: 21 * 16, y: 5 * 16 };
const fixtureBridgeColumns = 10;
// timed-finish-route fixture: the flagpole column and a near-top grab height.
const fixturePoleDrop = { x: 8 * 16, y: 16 };

async function teleport(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([toX, toY]) => {
      window.__originalBrowserPlatformerDebug!.teleportPlayer(toX!, toY!);
    },
    [x, y],
  );
}

async function waitForPausedFinish(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const s =
        window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
      return s.paused && String(s.playerOutcome.kind) === "finished";
    },
    undefined,
    { timeout: 30000 },
  );
}

// Boot a content-set level from the menu route and start its run.
async function bootMenuLevel(page: Page, levelName: string): Promise<void> {
  await page.goto(
    `/#play?skin=castaway-parody&map=official-smb&level=${levelName}&mode=classic&sound=classic`,
  );
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
    undefined,
    { timeout: 30000 },
  );
  // Dismiss the "press any key" start prompt and let the run begin.
  await page.keyboard.press("Space");
  await page.waitForFunction(() => {
    const api = window.__originalBrowserPlatformerDebug;
    return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
  });
}

test("a very-top flag grab knocks the ball off and the cutscene completes", async ({
  page,
}) => {
  await bootMenuLevel(page, "smb-1-1");
  await teleport(page, smb11PoleX, 0);

  // The grab at the pole tip: the ball is knocked off and tumbles away.
  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    return s.cutscene.flagpoleSlide.ball.falling;
  });

  // The player slides the full pole to the base and the flag lowers with him.
  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    const slide = s.cutscene.flagpoleSlide;
    return (
      !slide.active &&
      slide.targetY > 0 &&
      slide.playerSpriteY === slide.targetY
    );
  });
  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    const slide = s.cutscene.flagpoleSlide;
    return !slide.flagDropActive && (slide.flagY ?? 0) > slide.targetY;
  });

  // The knocked ball eventually falls off the level and disappears.
  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    const ball = s.cutscene.flagpoleSlide.ball;
    return !ball.falling && !ball.visible;
  });

  // The finish overlay still arrives, offering the next level.
  await waitForPausedFinish(page);
  await expect(page.getByRole("button", { name: /Next level/ })).toBeVisible();
});

test("a low flag grab keeps the ball and still lowers the flag fully", async ({
  page,
}) => {
  await bootMenuLevel(page, "smb-1-1");
  await teleport(page, smb11PoleX - 8, smb11LowGrabY);

  await waitForPausedFinish(page);
  const finished = await readSimulationSnapshot(page);
  const slide = finished.cutscene.flagpoleSlide;
  // The ball was never knocked and still crowns the pole.
  expect(slide.ball.falling).toBe(false);
  expect(slide.ball.visible).toBe(true);
  // The flag lowered all the way to the base, past the low grab point.
  expect(slide.flagDropActive).toBe(false);
  expect(slide.flagY ?? 0).toBeGreaterThan(smb11LowGrabY);
  // The player dismounted at the pole base.
  expect(slide.playerSpriteY).toBe(slide.targetY);
});

test("the castle axe chops the bridge and reveals the rescue message", async ({
  page,
}) => {
  await page.goto("/?browserLevel=castle-clear-route");
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  // Drop the player onto the fixture's axe (its gate column).
  await teleport(page, fixtureAxe.x, fixtureAxe.y);

  // The cinematic stages: planks chop away column by column...
  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    return s.cutscene.castleClear.totalFrames > 0;
  });
  await page.waitForFunction((columns) => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    return s.cutscene.castleClear.choppedBridgeColumns >= columns;
  }, fixtureBridgeColumns);
  // ...then the rescue message appears before the finish overlay.
  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    return s.cutscene.castleClear.rescueMessageVisible;
  });
  await waitForPausedFinish(page);
});

test("the real 1-4 castle: Bowser guards the bridge and the axe fells it", async ({
  page,
}) => {
  await bootMenuLevel(page, "smb-1-5");

  // Bowser is rendered guarding the bridge.
  const initial = await readSimulationSnapshot(page);
  const bowser = initial.actors.actors.find((actor) =>
    actor.actorId.startsWith("vglc-smb-bowser"),
  );
  expect(bowser).toBeDefined();

  // Take the axe behind him — the bridge chops, the boss falls, the rescue
  // message shows, and the level-complete overlay arrives.
  await teleport(page, smb15CastleAxe.x, smb15CastleAxe.y);
  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    return s.cutscene.castleClear.choppedBridgeColumns > 0;
  });
  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    return s.cutscene.castleClear.rescueMessageVisible;
  });
  await waitForPausedFinish(page);
});

test("finishing with a lucky timer digit launches victory fireworks", async ({
  page,
}) => {
  await page.goto("/?browserLevel=timed-finish-route");
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );

  // Fireworks fire when the finish lands on a timer ones-digit of 1/3/6 — a
  // ~400ms window. Teleport onto the pole INSIDE the polled page function the
  // instant the digit hits 6, so no test round trip can miss the window.
  await page.waitForFunction(
    ([framesPerUnit, poleX, poleY]) => {
      const api = window.__originalBrowserPlatformerDebug!;
      const s = api.getSimulationSnapshot();
      const remaining = s.levelTimer.remainingFrames;
      if (remaining === undefined) {
        return false;
      }
      if (Math.floor(remaining / framesPerUnit!) % 10 !== 6) {
        return false;
      }
      api.teleportPlayer(poleX!, poleY!);
      return true;
    },
    [timeBonusFramesPerDisplayUnit, fixturePoleDrop.x, fixturePoleDrop.y],
    { timeout: 30000 },
  );

  await page.waitForFunction(() => {
    const s = window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    return s.cutscene.fireworks.activeSprites > 0;
  });
  await waitForPausedFinish(page);
});

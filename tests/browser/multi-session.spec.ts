import { expect, test, type Page } from "@playwright/test";

import { playerX, waitForGameBoot } from "./support";

// Wide levels so there is room to walk right and measure movement. `enemy` adds
// a goomba just right of the player start so we can walk into it and die.
function levelCode(options: { readonly enemy?: boolean } = {}): string {
  const width = 20;
  const height = 9;
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Array<string>(width).fill(".");
    if (y === height - 1) {
      row.fill("g");
    }
    if (y === height - 2) {
      row[2] = "p";
      row[width - 3] = "x";
      if (options.enemy === true) {
        row[6] = "e";
      }
    }
    rows.push(row.join(""));
  }
  return `${String(width)}.${String(height)}.${rows.join("")}`;
}

async function openDesigner(page: Page, code: string): Promise<void> {
  await page.setViewportSize({ width: 960, height: 560 });
  await page.goto(`/#level=${code}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
}

// Play-test the current design; waits for the (Nth) game canvas to boot.
async function playTest(page: Page, expectedCanvases: number): Promise<void> {
  await page.getByRole("button", { name: "▶ Play" }).click();
  await waitForGameBoot(page, expectedCanvases);
  await page.waitForTimeout(400);
}

async function dismissStart(page: Page): Promise<void> {
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
}

// Hold Right and confirm the player actually advances — the core "keys work".
async function expectCanWalkRight(page: Page): Promise<void> {
  const before = await playerX(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (from) => {
      const api = window.__originalBrowserPlatformerDebug;
      const snapshot = api?.getSimulationSnapshot();
      return snapshot !== undefined && snapshot.player.position.x > from + 8;
    },
    before,
    { timeout: 4000 },
  );
  await page.keyboard.up("ArrowRight");
}

// Press Jump and confirm the player leaves the ground — a controllability check
// that, unlike walking right, won't run the player into a hazard.
async function expectCanJump(page: Page): Promise<void> {
  const startY = await page.evaluate(() => {
    const snapshot =
      window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
    return snapshot ? Math.round(snapshot.player.position.y) : 0;
  });
  await page.keyboard.down("Space");
  await page.waitForFunction(
    (from) => {
      const snapshot =
        window.__originalBrowserPlatformerDebug?.getSimulationSnapshot();
      return (
        snapshot !== undefined &&
        Math.abs(snapshot.player.position.y - from) > 8
      );
    },
    startY,
    { timeout: 4000 },
  );
  await page.keyboard.up("Space");
}

async function suspendToDesigner(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
}

// Play-test the design, dismiss the start prompt, and confirm the player walks.
async function playDismissWalk(
  page: Page,
  expectedCanvases: number,
): Promise<void> {
  await playTest(page, expectedCanvases);
  await dismissStart(page);
  await expectCanWalkRight(page);
}

async function resumeTab(page: Page, index: number): Promise<void> {
  await page.getByRole("tab").nth(index).click();
  await expect(page.getByRole("button", { name: "Block" })).toBeHidden();
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  await page.waitForTimeout(200);
}

// The headline scenario: several designer play-tests open at once, each one
// resumable AND controllable (the multi-instance keyboard regression).
test("several suspended play-tests can each be resumed and controlled", async ({
  page,
}) => {
  await openDesigner(page, levelCode());

  await playDismissWalk(page, 1);
  await suspendToDesigner(page);

  await playDismissWalk(page, 2);
  await suspendToDesigner(page);

  await expect(page.getByRole("tab")).toHaveCount(2);

  // Resume each and confirm progress is preserved and the keys still move it.
  await resumeTab(page, 0);
  expect(await playerX(page)).toBeGreaterThan(24);
  await expectCanWalkRight(page);
  await suspendToDesigner(page);

  await resumeTab(page, 1);
  expect(await playerX(page)).toBeGreaterThan(24);
  await expectCanWalkRight(page);
});

// Design → test → back to designer with the level intact → edit → test again.
test("designing, testing, editing, and testing again keeps both sessions playable", async ({
  page,
}) => {
  await openDesigner(page, levelCode());

  // Mark the design, play-test it, return — the mark must survive.
  await page.getByRole("button", { name: "Block" }).click();
  await page.locator('[aria-label="cell 5,3"]').click();
  const painted = await page
    .locator('[aria-label="cell 5,3"]')
    .evaluate((el) => getComputedStyle(el).backgroundColor);

  await playDismissWalk(page, 1);
  await suspendToDesigner(page);
  expect(
    await page
      .locator('[aria-label="cell 5,3"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(painted);

  // Edit more, then test again — a second session, also controllable.
  await page.locator('[aria-label="cell 8,3"]').click();
  await playDismissWalk(page, 2);
});

// Pausing a running game (P), then unpausing, keeps it controllable.
test("pausing and unpausing a session leaves it controllable", async ({
  page,
}) => {
  await openDesigner(page, levelCode());
  await playDismissWalk(page, 1);

  // Hold the pause key until the game reports paused, release, then repeat to
  // unpause — a quick press can fall between the per-frame held-key polls under
  // parallel-suite load and be missed, leaving the game stuck paused.
  await setPausedByHoldingKey(page, true);
  await setPausedByHoldingKey(page, false);
  await expectCanWalkRight(page);
});

// Hold KeyP until the game's paused state reaches `paused`, then release. Some
// entry states (a start prompt / advance delay) ignore the key, so keep pressing
// on a fresh down-edge until it takes.
async function setPausedByHoldingKey(
  page: Page,
  paused: boolean,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.keyboard.down("KeyP");
        await page.waitForTimeout(80);
        await page.keyboard.up("KeyP");
        await page.waitForTimeout(30);
        return page.evaluate(
          () =>
            window.__originalBrowserPlatformerDebug?.getSimulationSnapshot()
              .paused ?? null,
        );
      },
      { timeout: 8000 },
    )
    .toBe(paused);
}

// Dying in one session doesn't stop the next one from being playable.
test("dying in a session, then starting another that is controllable", async ({
  page,
}) => {
  await openDesigner(page, levelCode({ enemy: true }));
  await playTest(page, 1);
  await dismissStart(page);
  // Walk into the goomba and die.
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => {
      const api = window.__originalBrowserPlatformerDebug;
      const snapshot = api?.getSimulationSnapshot();
      return (
        snapshot !== undefined &&
        String(snapshot.playerOutcome.kind) !== "active"
      );
    },
    undefined,
    { timeout: 6000 },
  );
  await page.keyboard.up("ArrowRight");
  await suspendToDesigner(page);

  // A fresh play-test still boots and moves.
  await playDismissWalk(page, 2);
});

// A game started from the menu and a game started from the designer coexist,
// and each can be resumed and controlled independently.
test("a menu game and a designer game coexist and each stays controllable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 560 });

  // Start a game from the menu, play it, then return to the menu.
  await page.goto("/");
  await page.getByText("PLAY", { exact: false }).first().click();
  await waitForGameBoot(page, 1);
  await page.waitForTimeout(500);
  await dismissStart(page);
  // Jump rather than walk — SMB 1-1 has a goomba just to the right that would
  // kill the player and make the later resume-and-move check meaningless.
  await expectCanJump(page);
  await page.keyboard.press("Escape");
  await expect(page.getByText("PLAY", { exact: false }).first()).toBeVisible();

  // From the menu, open the designer and play-test a level — a second session.
  await page.getByRole("button", { name: /CREATE/ }).click();
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  await playDismissWalk(page, 2);
  await suspendToDesigner(page);
  await expect(page.getByRole("tab")).toHaveCount(2);

  // Resume the menu game (tab 0, created first) and confirm it still responds.
  await resumeTab(page, 0);
  await expectCanJump(page);
  // Returns to the menu (where it was launched from).
  await page.keyboard.press("Escape");
  await expect(page.getByText("PLAY", { exact: false }).first()).toBeVisible();

  // Resume the designer game (tab 1) and confirm it still moves.
  await resumeTab(page, 1);
  await expectCanWalkRight(page);
});

// Closing a session frees it; remaining and new sessions still work.
test("closing one session leaves others and new ones controllable", async ({
  page,
}) => {
  await openDesigner(page, levelCode());
  await playTest(page, 1);
  await dismissStart(page);
  await suspendToDesigner(page);
  await playTest(page, 2);
  await dismissStart(page);
  await suspendToDesigner(page);
  await expect(page.getByRole("tab")).toHaveCount(2);

  // Close the first tab; one remains.
  await page
    .getByRole("button", { name: /^Close / })
    .first()
    .click();
  await expect(page.getByRole("tab")).toHaveCount(1);

  // The surviving session resumes and is controllable.
  await resumeTab(page, 0);
  await expectCanWalkRight(page);
  await suspendToDesigner(page);

  // And a brand new play-test still works.
  await playDismissWalk(page, 2);
});

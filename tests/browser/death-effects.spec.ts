import { expect, test, type Page } from "@playwright/test";

import {
  bootPlayTest,
  dismissEditorTutorial,
  waitForSimulationRunning,
} from "./support";

// Deterministic coverage for the shabby, cause-specific death animations: an
// enemy hit bursts the body into four sprite pieces (explode), and falling onto
// spikes pins the body with X-ed-out eyes (impale). Each death style is read
// back from the debug snapshot's deathEffect field.

// Build a "<w>.<h>.<cells>" shareable level code. `rows` is an array of strings,
// one char per cell (see the editor's cellCharByKey: g=ground, p=player, x=goal,
// e=goomba, s=spikes, .=sky).
function levelCode(rows: readonly string[]): string {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  return `${String(width)}.${String(height)}.${rows.join("")}`;
}

async function openAndPlay(page: Page, code: string): Promise<void> {
  await page.setViewportSize({ width: 960, height: 560 });
  await page.goto(`/#level=${code}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  await dismissEditorTutorial(page);
  await bootPlayTest(page);
  // Dismiss the WORLD start prompt with a key that maps to no gameplay input —
  // Space would also buffer a jump, letting the walk-right tests bounce OVER
  // the goomba (a stomp kill) instead of dying to it.
  await page.keyboard.press("KeyQ");
  await waitForSimulationRunning(page);
}

// Flat ground with a goomba just right of the player and the goal far right;
// `skyRows` pads the height (a tall level makes the paused replay viewport
// crop meaningfully, since the replay bar shortens the canvas).
function goombaLevelCode(skyRows: number): string {
  return levelCode([
    ...Array.from({ length: skyRows }, () => "...................."),
    "..p...e...........x.",
    "gggggggggggggggggggg",
  ]);
}

// Hold right until the player walks into the goomba and dies.
async function walkRightIntoDeath(page: Page): Promise<void> {
  await page.keyboard.down("ArrowRight");
  await waitForDefeat(page);
  await page.keyboard.up("ArrowRight");
}

function deathEffect(page: Page) {
  return page.evaluate(
    () =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .deathEffect,
  );
}

async function waitForDefeat(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      String(
        window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
          .playerOutcome.kind,
      ) === "defeated",
    undefined,
    { timeout: 10000 },
  );
  // Let a couple of frames of the death effect spawn its pieces/overlays.
  await page.waitForTimeout(200);
}

test("an enemy-contact death bursts the body into four sprite pieces", async ({
  page,
}) => {
  await openAndPlay(page, goombaLevelCode(7));
  await walkRightIntoDeath(page);

  const effect = await deathEffect(page);
  expect(effect.started).toBe(true);
  expect(effect.style).toBe("explode");
  // Six anatomical crops of the authored player sprite (head, torso, 2 arms,
  // 2 legs) burst apart.
  expect(effect.pieceCount).toBe(6);

  // The player dies on the goomba, so the bursting parts overlap it and knock it
  // off the field — body parts harm the enemies they touch.
  await page.waitForFunction(
    () =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .deathEffect.knockedEnemyCount > 0,
    undefined,
    { timeout: 5000 },
  );
});

test("the timeline replay re-plays the death animation on-screen", async ({
  page,
}) => {
  // The goomba layout on a TALL level (15 rows = 240 world px): the paused
  // viewport (shortened by the replay bar) shows less world height than the
  // level, so a top-anchored camera restore would really crop the ground.
  await openAndPlay(page, goombaLevelCode(13));
  await walkRightIntoDeath(page);

  // The death opens the replay menu; the pause tears the live effect down so
  // the timeline plays back clean recorded frames.
  await page.waitForFunction(
    () =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot().paused,
    undefined,
    { timeout: 10000 },
  );

  // The menu auto-plays an instant replay of the final seconds; reaching the
  // end must re-fire the death burst without any Play click.
  await page.waitForFunction(
    () =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .deathEffect.started,
    undefined,
    { timeout: 20000 },
  );
  const effect = await deathEffect(page);
  expect(effect.style).toBe("explode");
  expect(effect.pieceCount).toBe(6);

  // And the death spot must be INSIDE the visible view: the replay bar shrinks
  // the canvas, and a top-anchored camera restore used to crop the ground away
  // so the whole animation played out of sight below the viewport.
  const visibility = await page.evaluate(() => {
    const snapshot =
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot();
    const camera = snapshot.camera;
    const visibleBottom =
      camera.worldViewY + camera.viewportHeightPixels / camera.zoom;
    return {
      playerBottom: snapshot.player.position.y,
      visibleBottom,
      worldHeight: camera.worldHeightPixels,
    };
  });
  expect(visibility.playerBottom).toBeLessThan(visibility.visibleBottom);
  // The ground row itself is on screen (the view is bottom-anchored).
  expect(visibility.visibleBottom).toBeGreaterThanOrEqual(
    visibility.worldHeight - 1,
  );
});

test("falling onto spikes pins the body with X-ed-out eyes", async ({
  page,
}) => {
  // The player starts in the air above a bed of spikes over solid ground, so he
  // falls straight onto the spikes and is impaled.
  const code = levelCode([
    "..p...............x.",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "ssssssssssssssssssss",
    "gggggggggggggggggggg",
  ]);
  await openAndPlay(page, code);

  await waitForDefeat(page);

  const effect = await deathEffect(page);
  expect(effect.started).toBe(true);
  expect(effect.style).toBe("impale");
  expect(effect.xEyesVisible).toBe(true);
});

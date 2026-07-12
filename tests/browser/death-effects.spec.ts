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
  // Dismiss the WORLD start prompt so the simulation begins stepping frames.
  await page.keyboard.press("Space");
  await waitForSimulationRunning(page);
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
  // Flat ground with a goomba just to the right of the player.
  const code = levelCode([
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "..p...e...........x.",
    "gggggggggggggggggggg",
  ]);
  await openAndPlay(page, code);

  await page.keyboard.down("ArrowRight");
  await waitForDefeat(page);
  await page.keyboard.up("ArrowRight");

  const effect = await deathEffect(page);
  expect(effect.started).toBe(true);
  expect(effect.style).toBe("explode");
  // Four quadrant crops of the authored player sprite.
  expect(effect.pieceCount).toBe(4);
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

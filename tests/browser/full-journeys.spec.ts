import { expect, test, type Page } from "@playwright/test";

import { ActorRole } from "../../src/engine/domain/level-spec";
import { loadOfficialSmbPack } from "../../src/engine/levels/import/official-smb-pack.test-support";
import { bootPlayTest, playerX } from "./support";

// Screenshots are written here for manual/visual review; they are not committed
// (the directory is git-ignored) and don't affect pass/fail.
const shotDir = "scratchpad-shots/journeys";
async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${shotDir}/${name}.png` });
}

// A blank 16x9 canvas opened straight into the designer.
const blankRows = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..p..........x..",
  "................",
  "gggggggggggggggg",
];
const blankLevel = `16.9.${blankRows.join("")}`;

async function paint(page: Page, x: number, y: number): Promise<void> {
  await page.locator(`[aria-label="cell ${String(x)},${String(y)}"]`).click();
}
async function pickBrush(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}

test("journey: menu → play → suspend → resume → close", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 560 });
  await page.goto("/");
  await expect(page.getByText("PLAY", { exact: false }).first()).toBeVisible();
  await shot(page, "01-menu");

  await page.getByText("PLAY", { exact: false }).first().click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  await shot(page, "02-playing");

  // Suspend to a tab, resume it, then close it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab")).toBeVisible();
  await shot(page, "03-menu-with-session-tab");
  await page.getByRole("tab").first().click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Close / }).click();
  await expect(page.getByRole("tab")).toHaveCount(0);
});

test("journey: author a level with every block, enemy, and a warp pipe, then play", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  await page.goto(`/#level=${blankLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  await shot(page, "10-designer-empty");

  // Tiles / blocks across row 5.
  await pickBrush(page, "Block");
  await paint(page, 2, 5);
  await pickBrush(page, "Brick");
  await paint(page, 3, 5);
  await pickBrush(page, "? Power");
  await paint(page, 4, 5);
  await pickBrush(page, "Spikes");
  await paint(page, 6, 8); // hazard on the ground

  // A coin block: paint Block, then stack coins on it (shows ×2).
  await pickBrush(page, "Block");
  await paint(page, 5, 5);
  await pickBrush(page, "Coin");
  await paint(page, 5, 5);
  await paint(page, 5, 5);
  await expect(page.locator('[aria-label="cell 5,5"]')).toHaveText("×2");

  // A free-floating coin and a power-up.
  await pickBrush(page, "Coin");
  await paint(page, 8, 3);
  await pickBrush(page, "Power");
  await paint(page, 9, 3);

  // Enemies: Goomba, Koopa, Piranha.
  await pickBrush(page, "Goomba");
  await paint(page, 10, 7);
  await pickBrush(page, "Koopa");
  await paint(page, 11, 7);
  await pickBrush(page, "Piranha");
  await paint(page, 13, 7);

  // A warp pipe connected to a destination.
  await pickBrush(page, "Pipe ⤓");
  await paint(page, 7, 7);
  await page.locator('[aria-label="tool-connect"]').click();
  await paint(page, 7, 7);
  await paint(page, 2, 7);
  await expect(page.getByText(/connected/i)).toBeVisible();
  await shot(page, "11-designer-authored");

  // Play it: the packed level boots and runs without errors.
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await bootPlayTest(page);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => {
    const api = window.__originalBrowserPlatformerDebug;
    return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
  });
  await page.waitForTimeout(400);
  await shot(page, "12-playing-authored");
  expect(errors).toHaveLength(0);

  // Return to the designer with the work intact.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  await expect(page.locator('[aria-label="cell 5,5"]')).toHaveText("×2");
});

test("journey: every designer tool works", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 640 });
  await page.goto(`/#level=${blankLevel}`);
  await expect(page.getByRole("button", { name: "Block" })).toBeVisible();
  const bg = (x: number, y: number) =>
    page
      .locator(`[aria-label="cell ${String(x)},${String(y)}"]`)
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const sky = await bg(0, 0);

  // Draw
  await pickBrush(page, "Block");
  await paint(page, 1, 1);
  expect(await bg(1, 1)).not.toBe(sky);
  // Erase (toggle: same brush again)
  await paint(page, 1, 1);
  expect(await bg(1, 1)).toBe(sky);
  // Fill
  await page.locator('[aria-label="tool-fill"]').click();
  await paint(page, 0, 0);
  expect(await bg(15, 0)).not.toBe(sky);
  await page.getByRole("button", { name: "↶ Undo" }).click();
  // Rectangle
  await page.locator('[aria-label="tool-rect"]').click();
  await page.locator('[aria-label="cell 2,2"]').hover();
  await page.mouse.down();
  await page.locator('[aria-label="cell 4,3"]').hover();
  await page.mouse.up();
  expect(await bg(4, 3)).not.toBe(sky);
  // Line
  await page.locator('[aria-label="tool-line"]').click();
  await page.locator('[aria-label="cell 6,1"]').hover();
  await page.mouse.down();
  await page.locator('[aria-label="cell 9,1"]').hover();
  await page.mouse.up();
  expect(await bg(8, 1)).not.toBe(sky);
  // Eyedropper then Draw uses the picked brush
  await page.locator('[aria-label="tool-eyedropper"]').click();
  await paint(page, 4, 3);
  await page.locator('[aria-label="tool-draw"]').click();
  await paint(page, 12, 1);
  expect(await bg(12, 1)).not.toBe(sky);
  // Select + copy/paste
  await page.locator('[aria-label="tool-select"]').click();
  await page.locator('[aria-label="cell 2,2"]').hover();
  await page.mouse.down();
  await page.locator('[aria-label="cell 3,2"]').hover();
  await page.mouse.up();
  await page.keyboard.press("Control+c");
  await paint(page, 10, 5);
  await page.keyboard.press("Control+v");
  await shot(page, "20-tools");
});

test("journey: keyboard-help overlay opens from the menu corner hint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 560 });
  await page.goto("/");
  await expect(page.getByText("PLAY", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Show keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "30-keymap-menu");
  await page.getByRole("button", { name: "Close keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("journey: shared #play URL boots straight into a running game", async ({
  page,
}) => {
  await page.goto(
    "/#play?skin=castaway-parody&map=official-smb&level=smb-1-1&mode=classic&sound=classic",
  );
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(() => {
    const api = window.__originalBrowserPlatformerDebug;
    return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
  });
  expect(await playerX(page)).toBeGreaterThan(-1);
});

// On a touch device the NES-style control deck must sit OUTSIDE the drawing
// surface (below the canvas), not overlap it — and pressing a direction must
// actually drive the game.
test.describe("mobile touch controls", () => {
  // Landscape — touch devices play the game in landscape (portrait shows a
  // rotate prompt), so the control deck is exercised in its real orientation.
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 812, height: 390 },
  });

  test("journey: NES controls sit below the canvas and drive the game", async ({
    page,
  }) => {
    await page.goto(
      "/#play?skin=castaway-parody&map=official-smb&level=smb-1-1" +
        "&mode=classic&sound=classic",
    );
    await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(
      () => window.__originalBrowserPlatformerDebug !== undefined,
    );

    // Every NES control is present.
    for (const label of [
      "touch-left",
      "touch-right",
      "touch-up",
      "touch-down",
      "touch-A",
      "touch-B",
      "touch-start",
    ]) {
      await expect(page.locator(`[aria-label="${label}"]`)).toBeVisible();
    }

    // The control bar is below the canvas (no vertical overlap), and the canvas
    // is shorter than the window because the bar claimed space beneath it.
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const bar = document.querySelector('[data-role="touch-control-bar"]');
      if (canvas === null || bar === null) {
        throw new Error("missing canvas or control bar");
      }
      const c = canvas.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return {
        canvasBottom: c.bottom,
        canvasHeight: c.height,
        barTop: b.top,
        barHeight: b.height,
        windowHeight: window.innerHeight,
      };
    });
    // Bar starts at (or below) the canvas bottom — outside the drawing surface.
    expect(geometry.barTop).toBeGreaterThanOrEqual(geometry.canvasBottom - 1);
    expect(geometry.barHeight).toBeGreaterThan(0);
    // The view was narrowed to make room (canvas + bar ≈ window height).
    expect(geometry.canvasHeight).toBeLessThan(geometry.windowHeight - 40);

    // Pressing "right" moves the player rightward once the level is running.
    await page.locator('[aria-label="touch-A"]').tap();
    const startX = await playerX(page);
    await page
      .locator('[aria-label="touch-right"]')
      .dispatchEvent("pointerdown");
    await page.waitForTimeout(600);
    await page.locator('[aria-label="touch-right"]').dispatchEvent("pointerup");
    expect(await playerX(page)).toBeGreaterThan(startX);
  });
});

// The set of placed actors the live scene is expected to render, as an exact
// sorted multiset of "actorId@tileX,tileY" — the PlayerStart and Pipe roles are
// rendered by other machinery (the player sprite / pipe tiles), so they are
// excluded here, matching the runtime's renderNonPlayerActors.
function expectedActorPositions(spec: {
  readonly actors: readonly {
    readonly actorId: string;
    readonly position: { readonly x: number; readonly y: number };
  }[];
  readonly actorDefinitions: readonly {
    readonly actorId: string;
    readonly role: ActorRole;
  }[];
}): string[] {
  return spec.actors
    .filter((actor) => {
      const definition = spec.actorDefinitions.find(
        (candidate) => candidate.actorId === actor.actorId,
      );
      return (
        definition !== undefined &&
        definition.role !== ActorRole.PlayerStart &&
        definition.role !== ActorRole.Pipe
      );
    })
    .map((actor) => `${actor.actorId}@${actor.position.x},${actor.position.y}`)
    .sort();
}

// Guards the whole pack against boot regressions (a missing actor sprite once
// made every piranha-bearing level fail from the menu): EVERY one of the 54
// pack levels — mains and warp/bonus sub-areas alike — must boot into a running
// simulation, and the live game must render every decoded actor at its exact
// decoded tile position (not merely the right count).
test("journey: every pack level boots and renders its content at exact positions", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const pack = loadOfficialSmbPack();
  const levelValues = [...pack.keys()].sort();
  expect(levelValues.length).toBe(54);

  for (const level of levelValues) {
    await page.goto(
      `/#play?skin=castaway-parody&map=official-smb&level=${level}` +
        "&mode=classic&sound=classic",
    );
    // A hash-only navigation doesn't reload the page; force a fresh boot so
    // each level is genuinely exercised (not the previous level's live game).
    await page.reload();
    await page.waitForFunction(
      () => window.__originalBrowserPlatformerDebug !== undefined,
      undefined,
      { timeout: 15_000 },
    );

    // Capture the placed content at frame 0 — before the simulation advances,
    // so enemies are read at their decoded placement and not a few frames into
    // their walk (a goomba by the spawn drifts a tile within five frames).
    const spec = pack.get(level)?.levelSpec;
    if (spec === undefined) {
      throw new Error(`level ${level} missing from the committed pack`);
    }
    const snapshot = await page.evaluate(() => {
      const api = window.__originalBrowserPlatformerDebug;
      if (api === undefined) {
        throw new Error("debug api gone");
      }
      const state = api.getSimulationSnapshot();
      return {
        frameIndex: state.frameIndex,
        widthTiles: state.level.widthTiles,
        heightTiles: state.level.heightTiles,
        renderedTileCount: state.level.renderedTileCount,
        actorPositions: state.actors.actors
          .map(
            (actor) =>
              `${actor.actorId}@${actor.tilePosition.x},${actor.tilePosition.y}`,
          )
          .sort(),
      };
    });
    expect(snapshot.frameIndex, `${level} pre-run frame`).toBe(0);
    expect(snapshot.widthTiles, `${level} width`).toBe(spec.widthTiles);
    expect(snapshot.heightTiles, `${level} height`).toBe(spec.heightTiles);
    expect(snapshot.renderedTileCount, `${level} tiles`).toBeGreaterThan(0);
    // Exact positions, element by element, for every actor in the level.
    expect(snapshot.actorPositions, `${level} actor positions`).toEqual(
      expectedActorPositions(spec),
    );

    // And the level must still boot into a running simulation (boot guard).
    await page.keyboard.press("Space");
    await page
      .waitForFunction(() => {
        const api = window.__originalBrowserPlatformerDebug;
        return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
      })
      .catch(() => {
        throw new Error(`level ${level} did not boot into a running game`);
      });
  }
});

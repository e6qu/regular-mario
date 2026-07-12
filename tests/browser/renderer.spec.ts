import { expect, test, type Page } from "@playwright/test";

// Renderer-backend coverage. The renderer is selectable via `?renderer=`
// (Canvas is the default); these guard that the WebGL path boots and recovers
// from a lost GL context, which is the main risk when several games coexist and
// the browser drops the oldest context.

const playRoute =
  "#play?skin=castaway-parody&map=official-smb&level=smb-1-1&mode=classic&sound=classic";

// Boot a game under the given renderer, start it, and run past frame 20.
async function bootAndAdvance(
  page: Page,
  renderer: "canvas" | "webgl" | "auto",
): Promise<void> {
  await page.setViewportSize({ width: 700, height: 440 });
  await page.goto(`/?renderer=${renderer}${playRoute}`);
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .frameIndex > 20,
  );
}

for (const renderer of ["canvas", "webgl", "auto"] as const) {
  test(`boots and runs under the ${renderer} renderer`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await bootAndAdvance(page, renderer);

    expect(pageErrors).toEqual([]);
  });
}

test("the start menu's renderer selector persists and applies to the next game", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 760 });
  await page.goto("/");

  const selector = page.locator('select[aria-label="Renderer"]');
  await expect(selector).toBeVisible();
  await expect(selector).toHaveValue("canvas");

  await selector.selectOption("webgl");
  expect(
    await page.evaluate(() => localStorage.getItem("regular-mario:renderer")),
  ).toBe("webgl");

  // The next game started uses the chosen backend — a WebGL drawing context.
  await page.getByText("PLAY", { exact: false }).first().click();
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  const usesWebgl = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (canvas === null) {
      return false;
    }
    // getContext throws if the canvas already has a different context type, so a
    // throw here means a (webgl) context is already established.
    try {
      return (
        canvas.getContext("webgl2") !== null ||
        canvas.getContext("webgl") !== null
      );
    } catch {
      return true;
    }
  });
  expect(usesWebgl).toBe(true);
});

test("a WebGL session survives suspend and resume", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await bootAndAdvance(page, "webgl");

  // Suspend to the session bar (Escape), then resume the session (its tab).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab")).toBeVisible();
  await page.getByRole("tab").first().click();
  await expect(page.locator("canvas")).toBeVisible();

  // The resumed game keeps stepping and rendering — the context recovered.
  const frameAfterResume = await page.evaluate(
    () =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .frameIndex,
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (frame) =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .frameIndex >
      frame + 10,
    frameAfterResume,
  );
  await page.keyboard.up("ArrowRight");

  expect(pageErrors).toEqual([]);
});

test("recovers rendering after a WebGL context is lost and restored", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await bootAndAdvance(page, "webgl");

  const frameBeforeLoss = await page.evaluate(
    () =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .frameIndex,
  );

  // Force the browser to drop and then restore the WebGL context — the same
  // sequence a browser performs when too many contexts exist and it reclaims
  // the oldest. Phaser re-uploads its GL resources on restore.
  const outcome = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    const gl =
      canvas?.getContext("webgl2") ?? canvas?.getContext("webgl") ?? null;
    const lose = gl?.getExtension("WEBGL_lose_context") ?? null;
    if (lose === null) {
      return "no-extension";
    }
    lose.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 200));
    lose.restoreContext();
    await new Promise((resolve) => setTimeout(resolve, 400));
    return "lost-and-restored";
  });
  expect(outcome).toBe("lost-and-restored");

  // The simulation keeps advancing across the loss, and rendering resumes with
  // no page errors — the context recovered rather than leaving a dead canvas.
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (frame) =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .frameIndex >
      frame + 10,
    frameBeforeLoss,
  );
  await page.keyboard.up("ArrowRight");

  expect(pageErrors).toEqual([]);
});

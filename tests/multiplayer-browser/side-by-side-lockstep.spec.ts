import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { enterMultiplayerLobby } from "./support";

const artifactDirectory = "playwright_adhoc/side-by-side-lockstep";
const canvasViewport = { width: 1280, height: 720 };

async function setProfile(page: Page): Promise<void> {
  await page.getByLabel("Nickname").fill("Lockstep Mira");
  await page.getByLabel("Avatar").selectOption("castaway");
  await page.getByRole("button", { name: "Save profile" }).click();
}

async function mirrorKey(
  local: Page,
  multiplayer: Page,
  key: string,
  action: "down" | "up",
): Promise<void> {
  await Promise.all(
    [local, multiplayer].map((page) =>
      action === "down" ? page.keyboard.down(key) : page.keyboard.up(key),
    ),
  );
}

async function canvasDataUrl(page: Page, label: string): Promise<string> {
  return page
    .getByLabel(label)
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
}

async function exactCanvasColorPixels(
  page: Page,
  label: string,
  red: number,
  green: number,
  blue: number,
): Promise<number> {
  return page.getByLabel(label).evaluate(
    (canvas, target) => {
      const context = (canvas as HTMLCanvasElement).getContext("2d");
      if (context === null) {
        throw new Error("Canvas has no readable 2D context.");
      }
      const pixels = context.getImageData(
        0,
        0,
        (canvas as HTMLCanvasElement).width,
        (canvas as HTMLCanvasElement).height,
      ).data;
      let matches = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (
          pixels[offset] === target.red &&
          pixels[offset + 1] === target.green &&
          pixels[offset + 2] === target.blue &&
          pixels[offset + 3] === 255
        ) {
          matches += 1;
        }
      }
      return matches;
    },
    { red, green, blue },
  );
}

async function readCanvasReceipt(
  canvas: ReturnType<Page["getByLabel"]>,
): Promise<Record<string, string | null>> {
  return canvas.evaluate((element) => {
    const names = [
      "data-authoritative-frame",
      "data-authoritative-camera-left",
      "data-rendered-simulation-frame",
      "data-rendered-camera-left",
      "data-rendered-primary-x",
      "data-rendered-primary-y",
      "data-rendered-primary-visible",
      "data-rendered-primary-rectangle",
      "data-rendered-primary-cullable",
      "data-post-render-camera-left",
      "data-post-render-pixel-checksum",
      "data-post-render-primary-queued",
      "data-post-render-camera-matrix",
      "data-renderer-owns-visible-canvas",
      "data-post-render-game-paused",
      "data-post-render-loop-running",
    ];
    return Object.fromEntries(
      names.map((name) => [name, element.getAttribute(name)]),
    );
  });
}

/**
 * Human-inspectable, real-browser comparison harness. It deliberately drives
 * the local and authoritative online canvases with the same key edges rather
 * than recreating input through a helper or a mock transport.
 */
test("single-player and multiplayer receive mirrored keyboard input", async ({
  browser,
}) => {
  await mkdir(artifactDirectory, { recursive: true });
  const localContext = await browser.newContext({ viewport: canvasViewport });
  const multiplayerContext = await browser.newContext({
    viewport: canvasViewport,
  });
  const local = await localContext.newPage();
  const multiplayer = await multiplayerContext.newPage();
  try {
    await local.goto("/?browserLevel=multiplayer-onboarding");
    await expect(
      local.getByLabel("Original platformer game canvas"),
    ).toBeVisible();

    await enterMultiplayerLobby(multiplayer);
    await setProfile(multiplayer);
    await multiplayer
      .getByLabel("Bundled level")
      .selectOption("multiplayer-onboarding");
    await multiplayer.getByRole("button", { name: "Create game" }).click();
    const multiplayerShell = multiplayer.locator(".multiplayer-game-shell");
    const multiplayerPanel = multiplayer.locator(".multiplayer-game-panel");
    // Waiting is a complete ready room, not a game canvas squeezed beside a
    // persistent control rail. Play is the point at which a viewport parity
    // comparison is meaningful.
    await expect(multiplayerShell).toHaveAttribute(
      "data-game-phase",
      "waiting",
    );
    await expect(multiplayerPanel).toHaveJSProperty("clientWidth", 1280);
    await expect(multiplayerPanel).toHaveJSProperty("clientHeight", 720);
    await multiplayer.screenshot({
      path: join(artifactDirectory, "multiplayer-waiting-ready-room.png"),
    });
    await multiplayer.getByRole("button", { name: "Start game" }).click();
    await expect(
      multiplayer.getByLabel("Authoritative multiplayer game view"),
    ).toBeVisible();
    await expect
      .poll(() =>
        multiplayer.locator(".multiplayer-game-panel p").textContent(),
      )
      .toMatch(/^playing · frame [1-9][0-9]*$/);

    const localCanvas = local.getByLabel("Original platformer game canvas");
    const multiplayerCanvas = multiplayer.getByLabel(
      "Authoritative multiplayer game view",
    );
    await expect(multiplayerShell).toHaveAttribute(
      "data-game-phase",
      "playing",
    );
    await expect(multiplayerCanvas).toHaveJSProperty("clientWidth", 1280);
    await expect(multiplayerCanvas).toHaveJSProperty("clientHeight", 720);
    await expect(multiplayerPanel).toHaveCSS("transform", /matrix/);
    // This hair colour belongs to the authored castaway sprite and is absent
    // from the Party Runway tiles. A state receipt alone is insufficient: the
    // visible multiplayer canvas must paint the player before capture/input
    // acceptance proceeds.
    await expect
      .poll(() =>
        exactCanvasColorPixels(
          multiplayer,
          "Authoritative multiplayer game view",
          86,
          58,
          34,
        ),
      )
      .toBeGreaterThan(20);
    await Promise.all([localCanvas.focus(), multiplayerCanvas.focus()]);
    const multiplayerLobby = await multiplayer.request.get("/api/lobby", {
      headers: { "x-multiplayer-protocol-version": "1" },
    });
    const multiplayerGameId = (
      (await multiplayerLobby.json()) as {
        readonly activeGame: { readonly gameId: string } | undefined;
      }
    ).activeGame?.gameId;
    if (multiplayerGameId === undefined) {
      throw new Error("Lockstep multiplayer game is missing.");
    }
    const initialSnapshot = await multiplayer.request.get(
      `/api/games/${multiplayerGameId}/snapshot`,
      { headers: { "x-multiplayer-protocol-version": "1" } },
    );
    const initialPlayerX = (
      (await initialSnapshot.json()) as {
        readonly players: readonly { readonly x: number }[];
      }
    ).players[0]?.x;
    if (initialPlayerX === undefined) {
      throw new Error("Lockstep initial player position is missing.");
    }
    await Promise.all([
      local.screenshot({ path: join(artifactDirectory, "local-before.png") }),
      multiplayer.screenshot({
        path: join(artifactDirectory, "multiplayer-before.png"),
      }),
    ]);
    const [localBefore, multiplayerBefore] = await Promise.all([
      canvasDataUrl(local, "Original platformer game canvas"),
      canvasDataUrl(multiplayer, "Authoritative multiplayer game view"),
    ]);
    const multiplayerBeforeReceipt = await readCanvasReceipt(multiplayerCanvas);
    const multiplayerCanvasInventory = await multiplayer.evaluate(() =>
      [...document.querySelectorAll("canvas")].map((canvas) => ({
        ariaLabel: canvas.getAttribute("aria-label"),
        height: canvas.height,
        role: canvas.getAttribute("data-role"),
        width: canvas.width,
      })),
    );

    // The same physical input sequence reaches both actual browser windows.
    await mirrorKey(local, multiplayer, "Shift", "down");
    await mirrorKey(local, multiplayer, "ArrowRight", "down");
    await local.waitForTimeout(450);
    await mirrorKey(local, multiplayer, "Space", "down");
    await local.waitForTimeout(90);
    await mirrorKey(local, multiplayer, "Space", "up");
    await local.waitForTimeout(550);
    await mirrorKey(local, multiplayer, "ArrowRight", "up");
    await mirrorKey(local, multiplayer, "Shift", "up");

    await expect
      .poll(async () => {
        const snapshot = await multiplayer.request.get(
          `/api/games/${multiplayerGameId}/snapshot`,
          { headers: { "x-multiplayer-protocol-version": "1" } },
        );
        return (
          (await snapshot.json()) as {
            readonly players: readonly { readonly x: number }[];
          }
        ).players[0]?.x;
      })
      .toBeGreaterThan(initialPlayerX + 8);

    // The renderer itself—not merely the HTTP/debug snapshot—must acknowledge
    // the moved server frame before we compare pixels.
    await expect
      .poll(async () =>
        Number(await multiplayerCanvas.getAttribute("data-rendered-primary-x")),
      )
      .toBeGreaterThan(initialPlayerX + 8);
    await expect(multiplayerCanvas).toHaveAttribute(
      "data-rendered-primary-visible",
      "true",
    );
    expect(
      JSON.parse(
        (await multiplayerCanvas.getAttribute(
          "data-rendered-primary-rectangle",
        )) ?? "{}",
      ),
    ).toMatchObject({ visible: false });

    const [localAfter, multiplayerAfter] = await Promise.all([
      (async () => {
        await local.screenshot({
          path: join(artifactDirectory, "local-after.png"),
        });
        return canvasDataUrl(local, "Original platformer game canvas");
      })(),
      (async () => {
        await multiplayer.screenshot({
          path: join(artifactDirectory, "multiplayer-after.png"),
        });
        return canvasDataUrl(
          multiplayer,
          "Authoritative multiplayer game view",
        );
      })(),
    ]);
    const multiplayerAfterReceipt = await readCanvasReceipt(multiplayerCanvas);
    await writeFile(
      join(artifactDirectory, "render-receipts.json"),
      `${JSON.stringify(
        {
          initialPlayerX,
          multiplayerCanvasInventory,
          multiplayerBeforeReceipt,
          multiplayerAfterReceipt,
        },
        null,
        2,
      )}\n`,
    );
    expect(localAfter).not.toBe(localBefore);
    expect(multiplayerAfter).not.toBe(multiplayerBefore);
    await expect(multiplayerCanvas).toHaveAttribute(
      "data-authoritative-level-id",
      "multiplayer-onboarding",
    );
  } finally {
    await Promise.all([localContext.close(), multiplayerContext.close()]);
  }
});

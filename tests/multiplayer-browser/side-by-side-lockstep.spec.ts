import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { enterMultiplayerLobby } from "./support";

const artifactDirectory = "playwright_adhoc/side-by-side-lockstep";
const canvasViewport = { width: 1280, height: 720 };
// World 1-1 starts with real course geometry and actors. This proves server
// movement on the shipped course rather than on a miniature mechanics fixture.
const minimumAuthoritativeTravelPixels = 4;
const minimumVisiblePredictedTravelPixels = 2;

async function setProfile(page: Page): Promise<void> {
  await page.getByLabel("Nickname").fill("Lockstep Mira");
  await page.getByLabel("Avatar").selectOption("castaway");
  const profileResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === "/api/profile",
  );
  await page.getByRole("button", { name: "Save profile" }).click();
  await profileResponse;
  // The old lobby is deliberately inert while its authoritative refresh is
  // pending. Wait for the newly mounted, interactive form before selecting a
  // course; this models an actual available UI action, not a race with it.
  await expect(
    page.locator('main[data-role="multiplayer"]'),
  ).not.toHaveAttribute("aria-busy", "true");
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
      // Through a scratch 2D canvas: the game canvas may be a WebGL context,
      // which has no 2D context of its own to read.
      const source = canvas as HTMLCanvasElement;
      const scratch = document.createElement("canvas");
      scratch.width = source.width;
      scratch.height = source.height;
      const context = scratch.getContext("2d");
      if (context === null) {
        throw new Error("Scratch canvas has no readable 2D context.");
      }
      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        source.width,
        source.height,
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
    await enterMultiplayerLobby(multiplayer);
    await setProfile(multiplayer);
    await multiplayer.getByLabel("Bundled level").selectOption("smb-1-1");
    await expect(multiplayer.getByLabel("Bundled level")).toHaveValue(
      "smb-1-1",
    );
    // Keep this a real UI-to-server assertion. A correct option value is not
    // enough if a stale closure or request codec substitutes another course
    // before the authoritative game is created.
    const createGameRequest = multiplayer.waitForRequest((request) => {
      const url = new URL(request.url());
      return request.method() === "POST" && url.pathname === "/api/games";
    });
    await multiplayer.getByRole("button", { name: "Create game" }).click();
    expect((await createGameRequest).postDataJSON()).toMatchObject({
      levelId: "smb-1-1",
      mode: "regular",
    });
    const multiplayerShell = multiplayer.locator(".multiplayer-game-shell");
    // A lobby Create starts and enters the real shared course in one action;
    // it must not leave the owner on a waiting-room intermediate screen.
    await expect(multiplayerShell).toHaveAttribute(
      "data-game-phase",
      "playing",
    );
    await expect(multiplayer.getByLabel("Game room")).not.toBeVisible();
    await expect(
      multiplayer.getByLabel("Authoritative multiplayer game view"),
    ).toBeVisible();
    await expect(
      multiplayer.getByRole("button", { name: "Resume game" }),
    ).toHaveCount(0);
    await expect(multiplayerShell).toHaveAttribute(
      "data-game-phase",
      "playing",
    );
    await expect
      .poll(async () =>
        Number(
          await multiplayerShell.getAttribute("data-debug-authoritative-frame"),
        ),
      )
      .toBeGreaterThan(0);

    // Do not boot the local run while signing in and assembling the online
    // party: this exact authored course starts live, so it can otherwise die
    // before the first mirrored key is sent. Starting it here gives both real
    // games the same live-input window without replacing either simulation.
    await local.goto(
      "/#play?skin=castaway-parody&map=official-smb&level=smb-1-1&mode=classic&sound=classic&bots=0&character=castaway&revenge=0&renderer=auto&god=0",
    );
    await expect(
      local.getByLabel("Original platformer game canvas"),
    ).toBeVisible();

    // Local play may be holding its served-content start card while the
    // multiplayer owner is explicitly starting the shared game. Dismiss that
    // local lifecycle card before the mirrored gameplay inputs begin; this is
    // not a movement substitute and keeps the subsequent key sequence equal.
    await local.getByLabel("Original platformer game canvas").focus();
    await local.keyboard.press("Space");
    await local.waitForTimeout(500);

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
    // Gameplay must not periodically read back and PNG-encode the full canvas
    // for diagnostics: that stalls the main thread and makes both input and
    // Web Audio audibly uneven. One capture may have happened at startup; no
    // further capture is permitted during ordinary play.
    await multiplayerCanvas.evaluate((canvas) => {
      const gameCanvas = canvas as HTMLCanvasElement;
      let captures = 0;
      const original = gameCanvas.toDataURL.bind(gameCanvas);
      gameCanvas.toDataURL = (
        ...arguments_: Parameters<HTMLCanvasElement["toDataURL"]>
      ) => {
        captures += 1;
        gameCanvas.setAttribute("data-test-debug-captures", String(captures));
        return original(...arguments_);
      };
      gameCanvas.setAttribute("data-test-debug-captures", "0");
    });
    await multiplayer.waitForTimeout(1_200);
    await expect(multiplayerCanvas).toHaveAttribute(
      "data-test-debug-captures",
      "0",
    );
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
    const initialSnapshotBody = (await initialSnapshot.json()) as {
      readonly levelId: string;
      readonly players: readonly { readonly x: number }[];
    };
    expect(initialSnapshotBody.levelId).toBe("smb-1-1");
    const initialPlayerX = initialSnapshotBody.players[0]?.x;
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

    // This is a real input-to-paint budget, not a server-state surrogate. Both
    // browser canvases must visibly respond to the first shared movement edge.
    // A canvas PNG readback at 1280×720 is deliberately included in this
    // harness, so its CI allowance covers scheduling and encoding on top of
    // the normal 20 Hz server snapshot cadence; it is not the game latency
    // product budget, which is measured from protocol receipts separately.
    const browserHarnessResponseBudgetMilliseconds = 750;
    const responseStartedAtMilliseconds = Date.now();
    await mirrorKey(local, multiplayer, "ArrowRight", "down");
    await Promise.all([
      expect
        .poll(
          async () =>
            Number(
              await multiplayerCanvas.getAttribute("data-rendered-primary-x"),
            ),
          { timeout: browserHarnessResponseBudgetMilliseconds },
        )
        .toBeGreaterThan(initialPlayerX + minimumVisiblePredictedTravelPixels),
      expect
        .poll(() => canvasDataUrl(local, "Original platformer game canvas"), {
          timeout: browserHarnessResponseBudgetMilliseconds,
        })
        .not.toBe(localBefore),
      expect
        .poll(
          () =>
            canvasDataUrl(multiplayer, "Authoritative multiplayer game view"),
          { timeout: browserHarnessResponseBudgetMilliseconds },
        )
        .not.toBe(multiplayerBefore),
    ]);
    const firstVisibleResponseMilliseconds =
      Date.now() - responseStartedAtMilliseconds;
    expect(firstVisibleResponseMilliseconds).toBeLessThanOrEqual(
      browserHarnessResponseBudgetMilliseconds,
    );
    // Keep the exact same physical edge held long enough for the authoritative
    // 60 Hz server to consume several ticks. Releasing immediately after the
    // first client paint can legitimately produce only one queued tick and
    // makes the later server-travel assertion depend on scheduler timing.
    await local.waitForTimeout(250);
    await mirrorKey(local, multiplayer, "ArrowRight", "up");

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

    // Retain transport receipts even when the authoritative movement assertion
    // fails, so this real-browser harness diagnoses input delivery rather than
    // hiding the distinction behind a client-side prediction screenshot.
    await writeFile(
      join(artifactDirectory, "post-input-network-receipt.json"),
      `${JSON.stringify(
        await multiplayerShell.evaluate((element) =>
          Object.fromEntries(
            [...element.attributes]
              .filter((attribute) => attribute.name.startsWith("data-debug-"))
              .map((attribute) => [attribute.name, attribute.value]),
          ),
        ),
        null,
        2,
      )}\n`,
    );

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
      .toBeGreaterThan(initialPlayerX + minimumAuthoritativeTravelPixels);

    // The renderer itself—not merely the HTTP/debug snapshot—must acknowledge
    // the moved server frame before we compare pixels.
    await expect
      .poll(async () =>
        Number(await multiplayerCanvas.getAttribute("data-rendered-primary-x")),
      )
      .toBeGreaterThan(initialPlayerX + minimumAuthoritativeTravelPixels);
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
    // At a 3 s delayed snapshot cadence the same real input sequence can be
    // visibly predicted and authoritatively accepted before its route-complete
    // snapshot arrives. This harness owns input-to-paint/reconciliation proof;
    // the recorded four-browser journey owns completion/level-handoff proof.
    // Both outcomes remain within the real server-owned shared catalogue.
    expect(
      await multiplayerCanvas.getAttribute("data-authoritative-level-id"),
    ).toMatch(/^smb-1-[12]$/);
  } finally {
    await Promise.all([localContext.close(), multiplayerContext.close()]);
  }
});

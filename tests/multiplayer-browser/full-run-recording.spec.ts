import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { enterMultiplayerLobby, findGameIdByCreatorNickname } from "./support";

const playerCount = 4;
const recordingDirectory = "playwright_adhoc/multiplayer-full-run";

type RecordedPlayer = {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly videoPath: Promise<string> | undefined;
};

async function makeRecordedPlayer(
  browser: Browser,
  index: number,
): Promise<RecordedPlayer> {
  const context = await browser.newContext({
    recordVideo: {
      dir: recordingDirectory,
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await enterMultiplayerLobby(page);
  await page.getByLabel("Nickname").fill(`RunPlayer${String(index + 1)}`);
  await page.getByRole("button", { name: "Save profile" }).click();
  return { context, page, videoPath: page.video()?.path() };
}

async function closeAndNameRecording(
  player: RecordedPlayer,
  index: number,
): Promise<void> {
  await player.context.close();
  if (player.videoPath === undefined) {
    throw new Error("Playwright did not create a player recording.");
  }
  await rename(
    await player.videoPath,
    join(recordingDirectory, `player-${String(index + 1)}.webm`),
  );
}

async function releaseRunningKeys(player: RecordedPlayer): Promise<void> {
  await player.page.keyboard.up("ArrowRight");
  await player.page.keyboard.up("Shift");
}

async function startRunning(players: readonly RecordedPlayer[]): Promise<void> {
  await Promise.all(
    players.map(async (player) => {
      // A course transition can occur while an earlier browser-level key is
      // still recorded as down. Clear that physical state first so this is a
      // fresh, real key edge in every independently recorded browser.
      await releaseRunningKeys(player);
      await player.page
        .getByLabel("Authoritative multiplayer game view")
        .focus();
      await player.page.keyboard.down("Shift");
      await player.page.keyboard.down("ArrowRight");
    }),
  );
}

async function stopRunning(players: readonly RecordedPlayer[]): Promise<void> {
  await Promise.all(
    players.map(async (player) => {
      await releaseRunningKeys(player);
    }),
  );
}

test.setTimeout(120_000);

test("four separate browser sessions complete two courses back to back", async () => {
  const browsers = await Promise.all(
    Array.from({ length: playerCount }, () => chromium.launch()),
  );
  const players = await Promise.all(
    browsers.map((browser, index) => makeRecordedPlayer(browser, index)),
  );
  try {
    const creator = players[0];
    if (creator === undefined) {
      throw new Error("Recorded creator is missing.");
    }
    await creator.page
      .getByLabel("Bundled level")
      .selectOption("multiplayer-onboarding");
    await creator.page.getByRole("button", { name: "Create game" }).click();
    const gameId = await findGameIdByCreatorNickname(
      creator.page,
      "RunPlayer1",
    );
    for (const player of players.slice(1)) {
      await player.page.reload();
      await player.page.getByRole("button", { name: "Join" }).click();
    }
    await creator.page.getByRole("button", { name: "Start game" }).click();
    await Promise.all(
      players.map((player) =>
        expect(
          player.page.getByLabel("Authoritative multiplayer game view"),
        ).toBeVisible(),
      ),
    );
    // The canvas is created while the game is still waiting. Do not send a
    // real player's first held movement command until every separate browser
    // has received the authoritative playing state; inputs submitted during
    // the waiting transition are intentionally not gameplay commands.
    await Promise.all(
      players.map((player) =>
        expect(
          player.page.getByText(/^playing · frame [1-9][0-9]*$/),
        ).toBeVisible(),
      ),
    );
    await expect(
      creator.page.getByLabel("Authoritative multiplayer game view"),
    ).toHaveAttribute("data-authoritative-level-id", "multiplayer-onboarding");
    await Promise.all(
      players.map(async (player) => {
        const canvas = player.page.getByLabel(
          "Authoritative multiplayer game view",
        );
        await expect(canvas).toHaveAttribute(
          "data-authoritative-player-count",
          String(playerCount),
        );
        await expect(canvas).toHaveAttribute(
          "data-authoritative-simulation-player-count",
          String(playerCount),
        );
        await expect(canvas).toHaveAttribute(
          "data-rendered-coop-player-count",
          String(playerCount - 1),
        );
      }),
    );
    await creator.page.waitForTimeout(300);
    await Promise.all(
      players.map((player, index) =>
        player.page.screenshot({
          path: join(
            recordingDirectory,
            `player-${String(index + 1)}-party-runway.png`,
          ),
        }),
      ),
    );
    const gameShell = creator.page.locator(".multiplayer-game-shell");
    const canvas = creator.page.getByLabel(
      "Authoritative multiplayer game view",
    );
    const canvasBox = await canvas.boundingBox();
    if (canvasBox === null) {
      throw new Error("Multiplayer canvas layout box is unavailable.");
    }
    await expect(gameShell).toHaveAttribute("data-controls-open", "false");
    expect(canvasBox).toMatchObject({ x: 0, y: 0, width: 1280, height: 720 });

    const initialSnapshot = await creator.page.request.get(
      `/api/games/${gameId}/snapshot`,
      { headers: { "x-multiplayer-protocol-version": "1" } },
    );
    const initialSnapshotBody = (await initialSnapshot.json()) as {
      readonly players: readonly { readonly x: number }[];
    };
    const initialCreatorX = initialSnapshotBody.players[0]?.x;
    if (initialCreatorX === undefined) {
      throw new Error("Authoritative snapshot has no creator position.");
    }

    await startRunning(players);
    await creator.page.waitForTimeout(1_000);

    const movingSnapshot = await creator.page.request.get(
      `/api/games/${gameId}/snapshot`,
      { headers: { "x-multiplayer-protocol-version": "1" } },
    );
    const movingSnapshotBody = (await movingSnapshot.json()) as {
      readonly players: readonly { readonly x: number }[];
    };
    expect(movingSnapshotBody.players[0]?.x).toBeGreaterThan(
      initialCreatorX + 8,
    );

    await expect(
      creator.page.getByLabel("Authoritative multiplayer game view"),
    ).toHaveAttribute("data-authoritative-level-id", "coin-block-route", {
      timeout: 9_000,
    });
    await stopRunning(players);
    await creator.page.waitForTimeout(350);
    const nextLevelSnapshot = await creator.page.request.get(
      `/api/games/${gameId}/snapshot`,
      { headers: { "x-multiplayer-protocol-version": "1" } },
    );
    const nextLevelSnapshotBody = (await nextLevelSnapshot.json()) as {
      readonly levelId: string;
      readonly players: readonly unknown[];
    };
    expect(nextLevelSnapshotBody.levelId).toBe("coin-block-route");
    expect(nextLevelSnapshotBody.players).toHaveLength(playerCount);

    // A level handoff rebuilds the authoritative-render Phaser scene in every
    // browser. Wait for all four rebuilt canvases before issuing the next real
    // held-input sequence; a fixed sleep can target the outgoing course.
    await Promise.all(
      players.map((player) =>
        expect(
          player.page.getByLabel("Authoritative multiplayer game view"),
        ).toHaveAttribute("data-authoritative-level-id", "coin-block-route"),
      ),
    );
    await startRunning(players);
    await creator.page.waitForTimeout(500);
    await expect(creator.page.getByRole("alert")).toHaveText("");
    await writeFile(
      join(recordingDirectory, "second-course-input-receipts.json"),
      `${JSON.stringify(
        await Promise.all(
          players.map(async (player, index) => ({
            player: index + 1,
            receipt: await player.page
              .locator(".multiplayer-game-shell")
              .evaluate((element) =>
                Object.fromEntries(
                  [...element.attributes]
                    .filter((attribute) =>
                      attribute.name.startsWith("data-debug-"),
                    )
                    .map((attribute) => [attribute.name, attribute.value]),
                ),
              ),
          })),
        ),
        null,
        2,
      )}\n`,
    );
    for (let frameBatch = 0; frameBatch < 40; frameBatch += 1) {
      await creator.page.waitForTimeout(250);
      const levelId = await creator.page
        .getByLabel("Authoritative multiplayer game view")
        .getAttribute("data-authoritative-level-id");
      if (levelId === "cavern-route") {
        break;
      }
    }
    await stopRunning(players);
    await expect(
      creator.page.getByLabel("Authoritative multiplayer game view"),
    ).toHaveAttribute("data-authoritative-level-id", "cavern-route", {
      timeout: 5_000,
    });
    await creator.page.waitForTimeout(1_000);
    await Promise.all(
      players.map(async (player) => {
        const frame = await player.page
          .getByLabel("Authoritative multiplayer game view")
          .getAttribute("data-authoritative-frame");
        expect(Number(frame)).toBeGreaterThan(12);
        await expect(
          player.page.getByText(/Game game-1 · cavern-route/),
        ).toBeVisible();
      }),
    );
    const finalCanvasBoxes = await Promise.all(
      players.map((player) =>
        player.page
          .getByLabel("Authoritative multiplayer game view")
          .boundingBox(),
      ),
    );
    for (const [index, box] of finalCanvasBoxes.entries()) {
      if (box === null) {
        throw new Error("A final multiplayer canvas is unavailable.");
      }
      expect(box.x, `player ${String(index + 1)}`).toBe(0);
      expect(box.y, `player ${String(index + 1)}`).toBe(0);
      expect(box.width, `player ${String(index + 1)}`).toBe(1280);
      expect(box.height, `player ${String(index + 1)}`).toBe(720);
    }
    await Promise.all(
      players.map(async (player, index) => {
        const canvas = player.page.getByLabel(
          "Authoritative multiplayer game view",
        );
        expect(
          await canvas.getAttribute("width"),
          `player ${String(index + 1)}`,
        ).toBe("1280");
        expect(
          await canvas.getAttribute("height"),
          `player ${String(index + 1)}`,
        ).toBe("720");
      }),
    );

    await Promise.all(
      players.map((player, index) =>
        player.page.screenshot({
          path: join(
            recordingDirectory,
            `player-${String(index + 1)}-after-second.png`,
          ),
        }),
      ),
    );
    await Promise.all(
      players.map((player) =>
        expect(
          player.page.getByLabel("Authoritative multiplayer game view"),
        ).toHaveAttribute("data-authoritative-level-id", "cavern-route"),
      ),
    );
    await creator.page.keyboard.press("KeyM");
    await expect(
      creator.page.getByRole("button", { name: "End game", exact: true }),
    ).toBeVisible();
    await creator.page
      .getByRole("button", { name: "End game", exact: true })
      .click();
  } finally {
    await Promise.all(players.map(closeAndNameRecording));
    await Promise.all(browsers.map((browser) => browser.close()));
  }
});

import { rename } from "node:fs/promises";
import { join } from "node:path";

import {
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

test.setTimeout(120_000);

test("four real browsers complete the first course and enter the next course", async ({
  browser,
}) => {
  const players = await Promise.all(
    Array.from({ length: playerCount }, (_, index) =>
      makeRecordedPlayer(browser, index),
    ),
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
    await creator.page.getByRole("button", { name: "Start" }).click();
    await Promise.all(
      players.map((player) =>
        expect(
          player.page.getByLabel("Authoritative multiplayer game view"),
        ).toBeVisible(),
      ),
    );
    const panel = creator.page.locator(".multiplayer-game-panel");
    const canvas = creator.page.getByLabel(
      "Authoritative multiplayer game view",
    );
    const [panelBox, canvasBox] = await Promise.all([
      panel.boundingBox(),
      canvas.boundingBox(),
    ]);
    if (panelBox === null || canvasBox === null) {
      throw new Error("Multiplayer layout boxes are unavailable.");
    }
    expect(panelBox.x).toBeGreaterThanOrEqual(canvasBox.x + canvasBox.width);

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

    await Promise.all(
      players.map(async (player) => {
        await player.page
          .getByLabel("Authoritative multiplayer game view")
          .focus();
        await player.page.keyboard.down("Shift");
        await player.page.keyboard.down("ArrowRight");
      }),
    );
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
    ).toHaveAttribute("data-authoritative-level-id", "cavern-route", {
      timeout: 9_000,
    });
    await Promise.all(
      players.map(async (player) => {
        await player.page.keyboard.up("ArrowRight");
        await player.page.keyboard.up("Shift");
      }),
    );
    await creator.page.waitForTimeout(350);
    const nextLevelSnapshot = await creator.page.request.get(
      `/api/games/${gameId}/snapshot`,
      { headers: { "x-multiplayer-protocol-version": "1" } },
    );
    const nextLevelSnapshotBody = (await nextLevelSnapshot.json()) as {
      readonly levelId: string;
      readonly players: readonly unknown[];
    };
    expect(nextLevelSnapshotBody.levelId).toBe("cavern-route");
    expect(nextLevelSnapshotBody.players).toHaveLength(playerCount);

    await Promise.all(
      players.map((player, index) =>
        player.page.screenshot({
          path: join(
            recordingDirectory,
            `player-${String(index + 1)}-after-first.png`,
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
  } finally {
    await Promise.all(players.map(closeAndNameRecording));
  }
});

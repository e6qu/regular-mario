import { readFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  enterMultiplayerLobby,
  endGameQuietly,
  findGameIdByCreatorNickname,
  joinHostedGame,
} from "./support";

const playerCount = 4;
const recordingDirectory = "playwright_adhoc/multiplayer-full-run";

type RecordedPlayer = {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly videoPath: Promise<string> | undefined;
};

type RecordedInputRun = {
  readonly count: number;
  readonly horizontal: "left" | "right" | "neutral";
  readonly jump: boolean;
  readonly down: boolean;
  readonly run: boolean;
};

const world11FrameMilliseconds = 1000 / 60;

async function readWorld11SmallInputTrace(): Promise<
  readonly RecordedInputRun[]
> {
  const serialized = await readFile(
    resolve(
      process.cwd(),
      "tests/multiplayer-browser/world11-small-input-trace.json.gz.base64",
    ),
    "utf8",
  );
  return JSON.parse(
    gunzipSync(Buffer.from(serialized.trim(), "base64")).toString("utf8"),
  ) as readonly RecordedInputRun[];
}

async function replayRecordedWorld11Input(
  player: RecordedPlayer,
): Promise<void> {
  await releaseRunningKeys(player);
  await player.page.getByLabel("Authoritative multiplayer game view").focus();
  let held = {
    left: false,
    right: false,
    jump: false,
    down: false,
    run: false,
  };
  const startedAtMilliseconds = performance.now();
  let scheduledFrames = 0;
  for (const input of await readWorld11SmallInputTrace()) {
    const next = {
      left: input.horizontal === "left",
      right: input.horizontal === "right",
      jump: input.jump,
      down: input.down,
      run: input.run,
    };
    const edges: readonly [key: string, wasHeld: boolean, nowHeld: boolean][] =
      [
        ["ArrowLeft", held.left, next.left],
        ["ArrowRight", held.right, next.right],
        ["Space", held.jump, next.jump],
        ["ArrowDown", held.down, next.down],
        ["ShiftLeft", held.run, next.run],
      ];
    for (const [key, wasHeld, nowHeld] of edges) {
      if (wasHeld && !nowHeld) await player.page.keyboard.up(key);
      if (!wasHeld && nowHeld) await player.page.keyboard.down(key);
    }
    held = next;
    scheduledFrames += input.count;
    // Key transitions themselves take measurable wall time. Waiting until an
    // absolute deadline preserves the 60 Hz core trace instead of accumulating
    // that transport overhead into a progressively late platforming replay.
    const remainingMilliseconds =
      scheduledFrames * world11FrameMilliseconds -
      (performance.now() - startedAtMilliseconds);
    if (remainingMilliseconds > 0) {
      await player.page.waitForTimeout(remainingMilliseconds);
    }
  }
  await releaseRunningKeys(player);
}

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
  await expect(
    page.locator('main[data-role="multiplayer"]'),
  ).not.toHaveAttribute("aria-busy", "true");
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
  await player.page.keyboard.up("ArrowLeft");
  await player.page.keyboard.up("ArrowRight");
  await player.page.keyboard.up("ArrowDown");
  await player.page.keyboard.up("ShiftLeft");
  await player.page.keyboard.up("Space");
}

async function stopRunning(players: readonly RecordedPlayer[]): Promise<void> {
  await Promise.all(
    players.map(async (player) => {
      await releaseRunningKeys(player);
    }),
  );
}

/** The player's rendered world x, or undefined if the canvas is not up yet. */
async function renderedPrimaryX(
  player: RecordedPlayer,
): Promise<number | undefined> {
  const value = await player.page
    .getByLabel("Authoritative multiplayer game view")
    .getAttribute("data-rendered-primary-x");
  const parsed = Number(value);
  return value === null || Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Drive one player rightward, jumping steadily, until told to stop.
 *
 * The fallback when the recorded replay does not reach the goal. Returns a
 * stop function so the caller can end it the moment the course advances.
 */
function driveRightward(player: RecordedPlayer): () => Promise<void> {
  // A holder rather than a bare `let`: the flag is set from the returned stop
  // function, which the checker cannot see, so a plain boolean reads as a
  // constant `true` to it.
  const control: { running: boolean } = { running: true };
  const loop = (async () => {
    // Held, not tapped: World 1-1's pit needs a running jump, and a short hop
    // from a standing start drops straight into it.
    await player.page.keyboard.down("ArrowRight");
    await player.page.keyboard.down("ShiftLeft");
    let previousX: number | undefined;
    while (control.running) {
      // Re-take focus and re-assert the held keys every cycle. A death, a
      // revive or a level restart rebuilds the scene, and a run driven by keys
      // pressed before that lands nowhere: the leader sat inert at the spawn
      // for the rest of the attempt, having been reset there mid-drive.
      await player.page
        .getByLabel("Authoritative multiplayer game view")
        .focus()
        .catch(() => undefined);
      await player.page.keyboard.down("ArrowRight");
      await player.page.keyboard.down("ShiftLeft");
      await player.page.keyboard.down("Space");
      await player.page.waitForTimeout(260);
      await player.page.keyboard.up("Space");
      // A defeated player stays a spectator until somebody revives them, so a
      // driver that only runs and jumps stalls the moment it meets an enemy.
      // R is refused for anyone still playing, which is exactly the guard
      // wanted here: it revives whoever needs it and does nothing otherwise.
      await player.page.keyboard.press("KeyR");
      await player.page.waitForTimeout(440);

      // Back off and take a run-up when the run has stopped advancing. World
      // 1-1's three-tile pit at column 86 cannot be cleared from a standing
      // start, and every cycle jumped the instant it resumed — so the party
      // stood at the lip for the full ninety seconds, jumping in place while
      // the frame counter climbed past four thousand. Stepping back and then
      // running without jumping buys the speed the jump needs; if the block
      // was something else, the detour costs a run that is already stuck
      // nothing.
      const x = await renderedPrimaryX(player).catch(() => undefined);
      if (x !== undefined && previousX !== undefined && x <= previousX) {
        await player.page.keyboard.up("ArrowRight");
        await player.page.keyboard.down("ArrowLeft");
        await player.page.waitForTimeout(500);
        await player.page.keyboard.up("ArrowLeft");
        await player.page.keyboard.down("ArrowRight");
        // Run-up: right held, jump released, so the next cycle leaves the lip
        // at speed instead of hopping off it.
        await player.page.waitForTimeout(500);
      }
      previousX = x;
    }
  })().catch(() => undefined);
  return async () => {
    control.running = false;
    await loop;
    await releaseRunningKeys(player).catch(() => undefined);
  };
}

async function runAndJumpToExit(
  players: readonly RecordedPlayer[],
): Promise<void> {
  const replayLeader = players[0];
  if (replayLeader === undefined)
    throw new Error("Recording replay leader is missing.");
  // This trace was generated by the deterministic core's normal small-player
  // World 1-1 completion (zero resets). It is replayed exclusively as physical
  // browser keyboard edges against the production WebSocket server: no state
  // is injected into a client or the authoritative simulation.
  await replayRecordedWorld11Input(replayLeader);
  await replayLeader.page.waitForTimeout(1_000);
}

/**
 * Whether the party has been handed the next course yet.
 *
 * Read rather than awaited, so the caller can decide to keep playing instead of
 * failing the moment a frame-exact replay comes up short.
 */
async function hasAdvancedToNextCourse(
  player: RecordedPlayer,
): Promise<boolean> {
  const levelId = await player.page
    .getByLabel("Authoritative multiplayer game view")
    .getAttribute("data-authoritative-level-id");
  return levelId === "smb-1-2";
}

test.setTimeout(300_000);

test("four separate browser sessions complete a shared course and enter the next", async () => {
  const browsers = await Promise.all(
    Array.from({ length: playerCount }, () => chromium.launch()),
  );
  const players = await Promise.all(
    browsers.map((browser, index) => makeRecordedPlayer(browser, index)),
  );
  let createdGameId: string | undefined;
  try {
    const creator = players[0];
    if (creator === undefined) {
      throw new Error("Recorded creator is missing.");
    }
    await creator.page.getByLabel("Bundled level").selectOption("smb-1-1");
    await creator.page.getByRole("button", { name: "Create game" }).click();
    const gameId = await findGameIdByCreatorNickname(
      creator.page,
      "RunPlayer1",
    );
    createdGameId = gameId;
    for (const player of players.slice(1)) {
      await player.page.reload();
      await joinHostedGame(player.page, "RunPlayer1");
    }
    await Promise.all(
      players.map((player) =>
        expect(
          player.page.getByLabel("Authoritative multiplayer game view"),
        ).toBeVisible(),
      ),
    );
    // Do not send the first held movement command until every separate browser
    // has received the authoritative playing state after its join.
    await Promise.all(
      players.map((player) =>
        expect(player.page.locator(".multiplayer-game-shell")).toHaveAttribute(
          "data-game-phase",
          "playing",
        ),
      ),
    );
    await Promise.all(
      players.map((player) =>
        expect
          .poll(async () =>
            Number(
              await player.page
                .getByLabel("Authoritative multiplayer game view")
                .getAttribute("data-authoritative-frame"),
            ),
          )
          .toBeGreaterThan(0),
      ),
    );
    await expect(
      creator.page.getByLabel("Authoritative multiplayer game view"),
    ).toHaveAttribute("data-authoritative-level-id", "smb-1-1");
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
    await Promise.all(
      players.map((player, index) =>
        player.page.screenshot({
          path: join(
            recordingDirectory,
            `player-${String(index + 1)}-smb-1-1.png`,
          ),
        }),
      ),
    );
    const canvas = creator.page.getByLabel(
      "Authoritative multiplayer game view",
    );
    const canvasBox = await canvas.boundingBox();
    if (canvasBox === null) {
      throw new Error("Multiplayer canvas layout box is unavailable.");
    }
    expect(canvasBox).toMatchObject({ x: 0, y: 0, width: 1280, height: 720 });

    await runAndJumpToExit(players);

    // The recording is a frame-exact replay of one player's World 1-1 run, and
    // it shares the level with three others. Since every player now interacts
    // with enemies rather than passing through them, an idle team-mate at the
    // spawn can kill the first goomba, and the leader meets a world its
    // recording did not describe — under browser timing jitter that is enough
    // to come up short of the flagpole. Rather than pin the physics to an old
    // recording, the party simply keeps running: the course completes when ANY
    // player reaches the goal, and this asserts the same handoff either way.
    if (!(await hasAdvancedToNextCourse(creator))) {
      const stops = players.map((player) => driveRightward(player));
      try {
        await expect(
          creator.page.getByLabel("Authoritative multiplayer game view"),
        ).toHaveAttribute("data-authoritative-level-id", "smb-1-2", {
          timeout: 90_000,
        });
      } finally {
        await Promise.all(stops.map((stop) => stop()));
      }
    }

    await expect(
      creator.page.getByLabel("Authoritative multiplayer game view"),
    ).toHaveAttribute("data-authoritative-level-id", "smb-1-2", {
      timeout: 20_000,
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
    expect(nextLevelSnapshotBody.levelId).toBe("smb-1-2");
    expect(nextLevelSnapshotBody.players).toHaveLength(playerCount);

    // A level handoff rebuilds the authoritative-render Phaser scene in every
    // browser. All independently recorded clients must render the real next
    // shared course before this accepted first-course completion is recorded.
    await Promise.all(
      players.map((player) =>
        expect(
          player.page.getByLabel("Authoritative multiplayer game view"),
        ).toHaveAttribute("data-authoritative-level-id", "smb-1-2"),
      ),
    );
    await stopRunning(players);
    await expect(
      creator.page.getByLabel("Authoritative multiplayer game view"),
    ).toHaveAttribute("data-authoritative-level-id", "smb-1-2", {
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
          player.page.getByLabel("Authoritative multiplayer game view"),
        ).toHaveAttribute("data-authoritative-level-id", "smb-1-2");
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
            `player-${String(index + 1)}-smb-1-2.png`,
          ),
        }),
      ),
    );
    await Promise.all(
      players.map((player) =>
        expect(
          player.page.getByLabel("Authoritative multiplayer game view"),
        ).toHaveAttribute("data-authoritative-level-id", "smb-1-2"),
      ),
    );
    // Ending is deliberately not an in-game menu action. Clean this
    // integration fixture through the creator-authorized API so the next
    // isolated journey does not inherit an unrelated public game.
    const ended = await creator.page.request.post(`/api/games/${gameId}/end`, {
      headers: { "x-multiplayer-protocol-version": "1" },
    });
    expect(ended.ok()).toBe(true);
  } finally {
    // Before the browsers go: this game outlives them, and once its members are
    // gone nobody is allowed to cancel it.
    if (createdGameId !== undefined && players[0] !== undefined) {
      await endGameQuietly(players[0].page, createdGameId);
    }
    await Promise.all(players.map(closeAndNameRecording));
    await Promise.all(browsers.map((browser) => browser.close()));
  }
});

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
    //
    // Clocking each run on the server's frame counter instead was tried and is
    // worse: out-of-process polling cannot resolve faster than its interval, so
    // the trace's many short runs each stretched to a poll and the replay
    // desynchronised far more than the wall clock ever did.
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

test.setTimeout(420_000);

/**
 * Four independent browsers, one authoritative game, real play in all of them.
 *
 * This used to require the party to complete World 1-1 and be handed the next
 * course. It could not: the recorded trace is a solo run and three team-mates
 * change the world it was recorded against, and the heuristic autopilot behind
 * it never worked at all — driven at the simulation level, hold-right-and-jump
 * fails to finish every one of the thirty-six bundled courses. It only ever
 * appeared to work because a bug in the party checkpoint teleported the party
 * past the pits it fell into.
 *
 * So the handoff moved to where it can be proved deterministically, in
 * game-lobby.test.ts: a member finishes and the whole party is handed its next
 * course. What stays here is what only four real browsers can show — four
 * separate sessions joining one authoritative game, agreeing on the course and
 * the roster, and rendering a recorded run of it frame by frame.
 */
test("four separate browser sessions share and play one authoritative course", async () => {
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

    // Play the recorded World 1-1 run in the leader's browser: real keyboard
    // edges against the production WebSocket server, with three other sessions
    // sharing the same authoritative world.
    await runAndJumpToExit(players);
    await stopRunning(players);

    // Every browser is still on the same course, with the same roster, and the
    // world has moved on under all of them.
    await Promise.all(
      players.map(async (player, index) => {
        const canvas = player.page.getByLabel(
          "Authoritative multiplayer game view",
        );
        await expect(canvas).toHaveAttribute(
          "data-authoritative-level-id",
          "smb-1-1",
        );
        await expect(canvas).toHaveAttribute(
          "data-authoritative-player-count",
          String(playerCount),
        );
        expect(
          Number(await canvas.getAttribute("data-authoritative-frame")),
          `player ${String(index + 1)} saw no authoritative frames`,
        ).toBeGreaterThan(60);
        const box = await canvas.boundingBox();
        if (box === null) {
          throw new Error("A multiplayer canvas is unavailable.");
        }
        expect(box, `player ${String(index + 1)}`).toMatchObject({
          x: 0,
          y: 0,
          width: 1280,
          height: 720,
        });
      }),
    );
    await Promise.all(
      players.map((player, index) =>
        player.page.screenshot({
          path: join(
            recordingDirectory,
            `player-${String(index + 1)}-played.png`,
          ),
        }),
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

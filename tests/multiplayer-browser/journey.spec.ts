import { expect, test, type Browser } from "@playwright/test";

import {
  endGameQuietly,
  findGameIdByCreatorNickname,
  login,
  saveProfile,
} from "./support";

const injectedSnapshotDelayMilliseconds = Number(
  process.env["MULTIPLAYER_TEST_SNAPSHOT_DELAY_MS"] ?? "0",
);

async function makeTwoPlayerPages(browser: Browser) {
  const creatorContext = await browser.newContext();
  const guestContext = await browser.newContext();
  return {
    creatorContext,
    guestContext,
    creator: await creatorContext.newPage(),
    guest: await guestContext.newPage(),
  };
}

test("two trusted friends create, join, chat, and inspect a game", async ({
  browser,
}) => {
  const { creatorContext, guestContext, creator, guest } =
    await makeTwoPlayerPages(browser);
  await login(creator);
  await saveProfile(creator, "Mira");
  await creator.getByLabel("Bundled level").selectOption("smb-1-1");
  await creator.getByRole("button", { name: "Create game" }).click();
  const gameId = await findGameIdByCreatorNickname(creator, "Mira");
  // Creation is also entry. The creator must never be left in the lobby with
  // impossible Create/Join actions after claiming their only game slot.
  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await expect(
    creator.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toHaveCount(0);
  // A refresh must resume the one game this session already owns. Otherwise
  // the lobby offers create/join controls which the server correctly rejects.
  await creator.reload();
  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();

  await login(guest);
  await saveProfile(guest, "Ren");
  await expect(guest.getByLabel("Bundled level")).toHaveText(
    /World 1-1.*World 1-2.*World 8-4/,
  );
  await guest
    .locator("section > div")
    .filter({ hasText: /^Mira · smb-1-1 · regular · playing/ })
    .getByRole("button", { name: "Join" })
    .click();
  await expect(guest.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "playing",
  );
  await expect(
    guest.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await expect(
    guest.locator('[data-role="multiplayer-phaser-canvas"]'),
  ).toHaveCount(1);

  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toHaveAttribute("data-role", "multiplayer-phaser-canvas");
  await creator.keyboard.down("ArrowRight");
  await creator.waitForTimeout(120);
  await creator.keyboard.up("ArrowRight");
  await creator.waitForTimeout(injectedSnapshotDelayMilliseconds + 200);
  await expect(creator.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "playing",
  );
  expect(
    await creator
      .getByLabel("Authoritative multiplayer game view")
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL().length),
  ).toBeGreaterThan(1_000);

  // P is a server-authoritative toggle available to every current member.
  await creator.keyboard.press("KeyP");
  await expect(creator.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "paused",
  );
  await guest.keyboard.press("KeyP");
  await expect(guest.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "playing",
  );

  const layout = await creator.request.get("/api/layout", {
    headers: { "x-multiplayer-protocol-version": "1" },
  });
  expect(await layout.json()).toMatchObject({
    role: "main",
    label: "Multiplayer game",
  });
  await expect(
    creator.locator(
      '[data-semantic-role="main"][data-semantic-label="Multiplayer game"]',
    ),
  ).toBeAttached();
  // Chat is a gameplay overlay: T opens the composer, and it must not require
  // opening the menu drawer or stop the other player from seeing the message.
  await guest.keyboard.press("KeyT");
  const guestChat = guest
    .locator(".multiplayer-game-chat-overlay")
    .getByLabel("Game chat message");
  await guestChat.fill("hello from Ren");
  await guestChat.press("Enter");
  await creator.keyboard.press("KeyT");
  await expect(creator.getByRole("log", { name: "Game chat" })).toContainText(
    "Ren: hello from Ren",
  );
  await creator.keyboard.press("Escape");
  // The first Escape exits the still-focused chat composer; the next opens
  // the gameplay menu without accidentally disconnecting the player.
  await guest.keyboard.press("Escape");
  await guest.keyboard.press("Escape");
  // Escape opens the compact gameplay menu; leaving remains a deliberate
  // action so an accidental key press cannot disconnect a live player.
  const leaveResponse = guest.waitForResponse(
    (response) =>
      response.url().endsWith("/api/game/leave") &&
      response.request().method() === "POST",
  );
  await guest.getByRole("button", { name: "Leave game" }).click();
  expect((await leaveResponse).ok()).toBe(true);
  await expect(
    guest.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
  await expect(
    guest.getByRole("button", { name: "Create game" }),
  ).toBeVisible();
  const afterGuestLeave = await creator.request.get(
    `/api/games/${gameId}/snapshot`,
    {
      headers: { "x-multiplayer-protocol-version": "1" },
    },
  );
  expect(
    ((await afterGuestLeave.json()) as { readonly players: readonly unknown[] })
      .players,
  ).toHaveLength(1);
  // The final departure must leave a paused, joinable public game rather than
  // deleting its authoritative world. A later Escape follows the same leave
  // lifecycle and must not be interpreted as closing the game itself.
  await creator.keyboard.press("Escape");
  await creator.getByRole("button", { name: "Leave game" }).click();
  await expect(
    creator.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
  // Qualified by this test's own creator. A bare /paused · 0\/16/ means "the
  // only paused game", which is a strict-mode violation the moment any other
  // spec leaves one listed.
  await expect(creator.getByText(/^Mira · .* · paused · 0\/16/)).toBeVisible();
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(
    guest.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  // This is an automatic empty-party resume, not a user P-resume. The rejoined
  // browser must be able to drive a newly advancing authoritative game.
  const rejoinedShell = guest.locator(".multiplayer-game-shell");
  await expect(rejoinedShell).toHaveAttribute("data-game-phase", "playing");
  const frameBeforeRejoinInput = Number(
    await rejoinedShell.getAttribute("data-debug-authoritative-frame"),
  );
  await guest.keyboard.down("ArrowRight");
  await guest.waitForTimeout(150);
  await guest.keyboard.up("ArrowRight");
  await expect
    .poll(async () =>
      Number(
        await rejoinedShell.getAttribute("data-debug-authoritative-frame"),
      ),
    )
    .toBeGreaterThan(frameBeforeRejoinInput);
  await guest.keyboard.press("Escape");
  await guest.getByRole("button", { name: "Leave game" }).click();
  await expect(
    guest.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
  await expect(guest.getByText(/paused · 0\/16/)).toBeVisible();
  await creator.screenshot({ path: "test-results/multiplayer-desktop.png" });
  // Unconditional: this game outlives the browsers, and once its members are
  // gone nobody is allowed to cancel it — the next spec would inherit it.
  await endGameQuietly(creator, gameId);
  await creatorContext.close();
  await guestContext.close();
});

test("administrator can inspect and step a paused game", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Keep this admin journey self-contained. It must not depend on the player
  // names or public games left by an earlier browser journey.
  await login(page);
  await saveProfile(page, "AdminProbe");
  await page.getByLabel("Bundled level").selectOption("smb-1-1");
  await page.getByRole("button", { name: "Create game" }).click();
  const gameId = await findGameIdByCreatorNickname(page, "AdminProbe");
  const adminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/#multiplayer-admin");
  await adminPage.getByLabel("Administrator password").fill("administrator");
  await adminPage.getByRole("button", { name: "Enter administration" }).click();
  await expect(
    adminPage.getByRole("heading", { name: "Multiplayer administration" }),
  ).toBeVisible();
  await expect(
    adminPage.locator(
      '[data-semantic-role="main"][data-semantic-label="Multiplayer administration"]',
    ),
  ).toBeAttached();
  await expect(
    adminPage.getByText(
      new RegExp(
        `Snapshots: [0-9]+ · delay ${injectedSnapshotDelayMilliseconds} ms`,
      ),
    ),
  ).toBeVisible();
  const adminGame = adminPage.locator("section").filter({ hasText: gameId });
  await adminGame.getByRole("button", { name: "pause" }).click();
  await adminGame.getByRole("button", { name: "step" }).click();
  await adminGame.getByRole("button", { name: "resume" }).click();
  await expect(
    adminGame.getByAltText(/Latest screenshot for game-/),
  ).toBeVisible();
  await adminPage
    .getByRole("button", { name: "Boot AdminProbe" })
    .first()
    .click();
  await adminPage
    .getByRole("button", { name: "Expire all player sessions" })
    .click();
  await adminPage.screenshot({
    path: "test-results/multiplayer-admin-mobile.png",
  });
  await adminContext.close();
});

test("mobile landscape multiplayer UI remains within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await login(page);
  await saveProfile(page, "Landscape");

  const viewportFits = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
  expect(await viewportFits()).toBe(true);

  await page.getByRole("button", { name: "Create game" }).click();
  await expect(
    page.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const menu = page.getByRole("complementary", { name: "Game menu" });
  await expect(menu).toBeVisible();
  expect(await viewportFits()).toBe(true);
  expect(
    await menu.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= window.innerWidth;
    }),
  ).toBe(true);
});

test("any current member can cancel from the Escape menu and returns the party to lobby", async ({
  browser,
}) => {
  const { creatorContext, guestContext, creator, guest } =
    await makeTwoPlayerPages(browser);
  await login(creator);
  await saveProfile(creator, "CancelCreator");
  await creator.getByRole("button", { name: "Create game" }).click();
  await login(guest);
  await saveProfile(guest, "CancelGuest");
  await guest
    .locator("section > div")
    .filter({ hasText: /^CancelCreator · / })
    .getByRole("button", { name: "Join" })
    .click();
  await expect(
    guest.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await guest.keyboard.press("Escape");
  await expect(
    guest.getByRole("complementary", { name: "Game menu" }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "Cancel game for everyone" }).click();
  await expect(
    guest.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
  await expect(
    creator.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
  await creatorContext.close();
  await guestContext.close();
});

test("a live game maintains render and snapshot cadence", async ({ page }) => {
  const receivedWebSocketFrames: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", (event) => {
      receivedWebSocketFrames.push(String(event.payload));
    });
  });
  await login(page);
  await saveProfile(page, "Cadence");
  await page.getByLabel("Bundled level").selectOption("smb-1-1");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(
    page.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();

  const sampleDurationMilliseconds = Math.max(
    2_000,
    injectedSnapshotDelayMilliseconds + 1_500,
  );
  const cadence = await page.evaluate(async (samplingMilliseconds) => {
    const frameIntervals: number[] = [];
    const longTaskDurations: number[] = [];
    const bootTaskDurations: number[] = [];
    // Separate boot from play. This observer is buffered, so it also receives
    // tasks from before sampling began — page load and scene construction —
    // and folding those into the live figure made a one-off startup cost read
    // as gameplay jank. Booting a GPU renderer uploads every sprite as a
    // texture, which is a few hundred milliseconds once, while the player is
    // looking at the start card. Both are bounded, with their own budgets.
    const samplingStart = performance.now();
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (entry.startTime < samplingStart) {
          bootTaskDurations.push(entry.duration);
        } else {
          longTaskDurations.push(entry.duration);
        }
      }
    });
    observer.observe({ type: "longtask", buffered: true });
    let previous = performance.now();
    const until = previous + samplingMilliseconds;
    await new Promise<void>((resolve) => {
      const sample = (now: number): void => {
        frameIntervals.push(now - previous);
        previous = now;
        if (now >= until) {
          resolve();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    observer.disconnect();
    const sorted = [...frameIntervals].sort((left, right) => left - right);
    return {
      frameCount: frameIntervals.length,
      meanFrameMilliseconds:
        frameIntervals.reduce((sum, value) => sum + value, 0) /
        frameIntervals.length,
      percentile95FrameMilliseconds:
        sorted[Math.floor(sorted.length * 0.95)] ?? Number.POSITIVE_INFINITY,
      longestTaskMilliseconds: Math.max(0, ...longTaskDurations),
      longestBootTaskMilliseconds: Math.max(0, ...bootTaskDurations),
    };
  }, sampleDurationMilliseconds);

  const stateFrames = receivedWebSocketFrames.filter(
    (payload) =>
      payload.includes('"type":"state-keyframes"') ||
      payload.includes('"type":"state-deltas"'),
  );
  expect(cadence.frameCount).toBeGreaterThanOrEqual(100);
  expect(cadence.meanFrameMilliseconds).toBeLessThan(24);
  expect(cadence.percentile95FrameMilliseconds).toBeLessThan(40);
  expect(cadence.longestTaskMilliseconds).toBeLessThan(100);
  // Startup is allowed to be expensive, but not unbounded: this catches a
  // regression that moves per-frame work into the boot path or makes the
  // renderer's texture upload pathological.
  expect(cadence.longestBootTaskMilliseconds).toBeLessThan(700);
  // At 3 s injected latency the first packets cannot arrive during a fixed
  // 2 s observation. Sample past the configured delivery delay, then require
  // live stream traffic rather than mistaking the configured network condition
  // for a stopped server.
  expect(stateFrames.length).toBeGreaterThanOrEqual(15);
});

test("held-input heartbeats do not repeatedly reset local prediction", async ({
  page,
}) => {
  await login(page);
  await saveProfile(page, "Prediction");
  await page.getByLabel("Bundled level").selectOption("smb-1-1");
  await page.getByRole("button", { name: "Create game" }).click();
  const shell = page.locator(".multiplayer-game-shell");
  await expect(shell).toHaveAttribute("data-debug-socket-lifecycle", "open");
  await expect
    .poll(async () =>
      Number(await shell.getAttribute("data-debug-authoritative-frame")),
    )
    .toBeGreaterThan(1);
  const reconciliationCount = async () =>
    Number(
      (await shell.getAttribute("data-debug-prediction-reconcile-count")) ??
        "0",
    );
  const before = await reconciliationCount();

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(650);
  await page.keyboard.up("ArrowRight");
  const after = await reconciliationCount();
  const sent = Number(await shell.getAttribute("data-debug-input-send-count"));

  // One edge reconciliation is expected. The six held-state heartbeats that
  // keep the server input alive must not produce six visual correction resets.
  expect(sent).toBeGreaterThanOrEqual(4);
  expect(after - before).toBeLessThanOrEqual(2);
});

test("R always reaches the authoritative revive endpoint during live play", async ({
  page,
}) => {
  await login(page);
  await saveProfile(page, "ReviveKey");
  await page.getByLabel("Bundled level").selectOption("smb-1-1");
  await page.getByRole("button", { name: "Create game" }).click();
  const shell = page.locator(".multiplayer-game-shell");
  await expect(shell).toHaveAttribute("data-game-phase", "playing");

  // This player is deliberately active, so the server must reject the revive;
  // the assertion proves the physical key is not consumed by the render scene
  // or silently discarded by a stale client spectator flag.
  await page.keyboard.press("KeyR");
  await expect(shell).toHaveAttribute("data-debug-revive-request-count", "1");
  await expect(shell.locator(".multiplayer-game-error")).toContainText(
    "Only defeated players can revive.",
  );
});

test("a newer game connection supersedes the previous socket for one player", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  await login(first);
  await saveProfile(first, "Socket");
  await first.getByLabel("Bundled level").selectOption("smb-1-1");
  await first.getByRole("button", { name: "Create game" }).click();
  await expect(first.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-debug-socket-lifecycle",
    "open",
  );

  await second.goto("/#multiplayer");
  await expect(
    second.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await expect(second.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-debug-socket-lifecycle",
    "open",
  );
  await expect(first.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-debug-socket-lifecycle",
    "closed:4001",
  );
  await context.close();
});

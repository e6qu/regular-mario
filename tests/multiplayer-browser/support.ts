import { expect, type Page } from "@playwright/test";

export async function enterMultiplayerLobby(page: Page): Promise<void> {
  await page.goto("/#multiplayer");
  await page.getByLabel("Server password").fill("friends");
  await page.getByLabel("Server password").press("Enter");
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

export async function findGameIdByCreatorNickname(
  page: Page,
  nickname: string,
): Promise<string> {
  const lobby = await page.request.get("/api/lobby", {
    headers: { "x-multiplayer-protocol-version": "1" },
  });
  const body = (await lobby.json()) as {
    readonly games: readonly {
      readonly gameId: string;
      readonly creator: { readonly nickname: string };
    }[];
  };
  const game = body.games.find(
    (candidate) => candidate.creator.nickname === nickname,
  );
  if (game === undefined) {
    throw new Error(`Game by ${nickname} is missing from the lobby.`);
  }
  return game.gameId;
}

export async function pauseGameAsAdministrator(
  page: Page,
  gameId: string,
): Promise<void> {
  await page.goto("/#multiplayer-admin");
  await page.getByLabel("Administrator password").fill("administrator");
  await page.getByRole("button", { name: "Enter administration" }).click();
  await page
    .locator("section")
    .filter({ hasText: gameId })
    .getByRole("button", { name: "pause" })
    .click();
}

/**
 * Sign in and reach the lobby, asserting the protocol gate on the way.
 *
 * Shared rather than copied: a spec that pastes its own copy drifts from this
 * one, and the copy-paste gate rejects the duplication outright.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/#multiplayer");
  const unsupportedProtocol = await page.request.get("/api/lobby", {
    headers: { "x-multiplayer-protocol-version": "0" },
  });
  expect(unsupportedProtocol.status()).toBe(400);
  expect(await unsupportedProtocol.json()).toMatchObject({
    error: "Unsupported multiplayer protocol version.",
  });
  await enterMultiplayerLobby(page);
}

/** Set this player's nickname and wait for the profile write to land. */
export async function saveProfile(page: Page, nickname: string): Promise<void> {
  await page.getByLabel("Nickname").fill(nickname);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/profile") &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save profile" }).click();
  // Report what the server actually said. A bare `.ok()` assertion fails with
  // "expected true, received false" and sends the reader hunting for a status
  // code that was right there in the response.
  const response = await saved;
  expect(
    response.ok(),
    `PATCH /api/profile returned ${response.status()}: ${await response.text()}`,
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

declare global {
  interface Window {
    /** Every AudioContext this page has constructed, in creation order. */
    __audioContexts?: AudioContext[];
  }
}

/**
 * Record every AudioContext the page constructs, before any script runs.
 *
 * "Two musics playing at once" is not visible in the DOM: the renderer removes
 * the old canvas by hand precisely because Phaser's `game.destroy()` is
 * asynchronous, so counting canvases proves nothing about whether the previous
 * game is still audible. A Phaser WebAudio game owns one AudioContext and
 * closes it when its sound manager is destroyed, so live contexts are the
 * honest instrument: one game playing means exactly one un-closed context.
 */
export async function trackAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__audioContexts = [];
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args: ConstructorParameters<typeof NativeAudioContext>) {
        super(...args);
        window.__audioContexts?.push(this);
      }
    };
  });
}

/** How many recorded AudioContexts have not been closed. */
export async function countLiveAudioContexts(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window.__audioContexts ?? []).filter(
        (context) => context.state !== "closed",
      ).length,
  );
}

/** Create a game on a bundled level and wait for it to reach `playing`. */
export async function createGameOnLevel(
  page: Page,
  levelId: string,
): Promise<void> {
  await page.getByLabel("Bundled level").selectOption(levelId);
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "playing",
  );
}

/**
 * Join the game opened by a named creator, and wait until it is playing.
 *
 * Always qualified by the creator. An unqualified `getByRole("button", { name:
 * "Join" })` reads as "join the game" but means "join *the only* game", so it
 * dies with a strict-mode violation the moment any other spec leaves a game
 * open — a failure that points at the innocent test rather than the one that
 * leaked.
 */
export async function joinHostedGame(
  page: Page,
  creatorNickname: string,
): Promise<void> {
  await page
    .locator("section > div")
    .filter({ hasText: new RegExp(`^${creatorNickname} · `) })
    .getByRole("button", { name: "Join" })
    .click();
  await expect(page.locator(".multiplayer-game-shell")).toHaveAttribute(
    "data-game-phase",
    "playing",
  );
}

/**
 * Cancel the current game for everyone, removing it from the lobby.
 *
 * This is the cleanup a spec wants at the end. Leaving is not: an empty party
 * pauses rather than closes, deliberately, so the next member can resume the
 * world by joining — which means a merely-left game stays listed as
 * `paused · 0/16` for the rest of the run and breaks any later spec whose
 * locator assumed its own game was the only one.
 */
export async function cancelGame(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("complementary", { name: "Game menu" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel game for everyone" }).click();
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

/**
 * Leave the current game through the Escape menu, returning to the lobby.
 *
 * Leaving is the behaviour under test in the rejoin specs. For cleanup, prefer
 * `cancelGame`: a left game remains listed.
 */
export async function leaveGame(page: Page): Promise<void> {
  // Escape opens the gameplay menu; leaving stays a deliberate action so a
  // stray key cannot disconnect a live player. Exactly one press: a page that
  // never focused the chat composer would toggle the menu shut on a second.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Leave game" })).toBeVisible();
  const left = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/game/leave") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Leave game" }).click();
  expect((await left).ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Trusted friends lobby" }),
  ).toBeVisible();
}

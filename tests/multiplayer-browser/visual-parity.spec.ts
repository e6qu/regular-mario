import { expect, test, type Page } from "@playwright/test";

import {
  enterMultiplayerLobby,
  findGameIdByCreatorNickname,
  pauseGameAsAdministrator,
} from "./support";

async function setProfile(
  page: Page,
  nickname: string,
  avatarId: string,
): Promise<void> {
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByLabel("Avatar").selectOption(avatarId);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/profile") &&
      response.request().method() === "PATCH",
  );
  const save = page.getByRole("button", { name: "Save profile" });
  await save.click();
  const response = await saved;
  expect(await response.json()).toMatchObject({
    profile: { nickname, avatarId },
  });
  // The click handler awaits the server response before scheduling its DOM
  // refresh. Let that one render turn finish before the profile is used to join.
  await page.waitForTimeout(50);
}

async function requireSameAuthoritativeFrame(
  left: Page,
  right: Page,
): Promise<void> {
  await expect
    .poll(async () => {
      const [leftText, rightText] = await Promise.all([
        left.locator(".multiplayer-game-panel p").textContent(),
        right.locator(".multiplayer-game-panel p").textContent(),
      ]);
      return leftText === rightText ? leftText : undefined;
    })
    .toMatch(/^paused · frame [0-9]+$/);
}

async function expectExactCanvasParity(
  left: Page,
  right: Page,
  leftLabel = "Authoritative multiplayer game view",
  rightLabel = "Authoritative multiplayer game view",
): Promise<void> {
  const [leftDataUrl, rightDataUrl] = await Promise.all(
    [[left, leftLabel] as const, [right, rightLabel] as const].map(
      ([page, label]) =>
        page
          .getByLabel(label)
          .evaluate((element) => (element as HTMLCanvasElement).toDataURL()),
    ),
  );
  if (leftDataUrl === undefined || rightDataUrl === undefined) {
    throw new Error("Multiplayer parity canvas is missing.");
  }
  const comparison = await left.evaluate(
    async ({ localDataUrl, remoteDataUrl }) => {
      const load = async (dataUrl: string): Promise<ImageData> => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context === null) {
          throw new Error("Parity comparison canvas is unavailable.");
        }
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      };
      const [local, remote] = await Promise.all([
        load(localDataUrl),
        load(remoteDataUrl),
      ]);
      if (local.width !== remote.width || local.height !== remote.height) {
        return { differentPixels: -1, local, remote };
      }
      let differentPixels = 0;
      let minX = local.width;
      let minY = local.height;
      let maxX = -1;
      let maxY = -1;
      for (let index = 0; index < local.data.length; index += 1) {
        if (local.data[index] !== remote.data[index]) {
          differentPixels += 1;
          const pixelIndex = Math.floor(index / 4);
          const x = pixelIndex % local.width;
          const y = Math.floor(pixelIndex / local.width);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      return {
        width: local.width,
        height: local.height,
        differentPixels,
        differenceBounds: [minX, minY, maxX, maxY],
      };
    },
    { localDataUrl: leftDataUrl, remoteDataUrl: rightDataUrl },
  );
  expect(comparison).toEqual({
    width: 940,
    height: 720,
    differentPixels: 0,
    differenceBounds: [940, 720, -1, -1],
  });
}

test("the actual local BootScene and a paused server frame render every pixel identically", async ({
  browser,
}) => {
  const playerContext = await browser.newContext();
  const localContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const player = await playerContext.newPage();
  const local = await localContext.newPage();
  const admin = await adminContext.newPage();

  // The multiplayer game canvas is the browser viewport minus its semantic
  // control sidebar (940×720 at the standard desktop test viewport). Match
  // that exact drawable surface locally before comparing raw canvas pixels.
  await local.setViewportSize({ width: 940, height: 720 });

  await enterMultiplayerLobby(player);
  await player.getByRole("button", { name: "Create game" }).click();
  await player.getByRole("button", { name: "Start" }).click();
  await expect(
    player.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();

  const lobby = await player.request.get("/api/lobby", {
    headers: { "x-multiplayer-protocol-version": "1" },
  });
  const lobbyBody = (await lobby.json()) as {
    readonly profile: { readonly playerId: string };
    readonly games: readonly {
      readonly gameId: string;
      readonly creator: { readonly playerId: string };
    }[];
  };
  const game = lobbyBody.games.find(
    (candidate) => candidate.creator.playerId === lobbyBody.profile.playerId,
  );
  if (game === undefined) {
    throw new Error("Local/server parity game is missing from the lobby.");
  }

  await pauseGameAsAdministrator(admin, game.gameId);
  await expect
    .poll(() => player.locator(".multiplayer-game-panel p").textContent())
    .toMatch(/^paused · frame [0-9]+$/);
  const snapshot = await player.request.get(
    `/api/games/${game.gameId}/snapshot`,
    {
      headers: { "x-multiplayer-protocol-version": "1" },
    },
  );
  const body = (await snapshot.json()) as {
    readonly simulationState: Parameters<
      NonNullable<
        Window["__originalBrowserPlatformerDebug"]
      >["renderMultiplayerWireStateForDebug"]
    >[0];
  };

  // The lobby's default public course is Party Runway. Keep the exact-pixel
  // comparison on that real create/start path so a level-selection or
  // pre-create lifecycle regression cannot hide behind the old fixture.
  await local.goto("/?browserLevel=multiplayer-onboarding");
  await expect(
    local.getByLabel("Original platformer game canvas"),
  ).toBeVisible();
  await expect
    .poll(() =>
      local.evaluate(() =>
        window.__originalBrowserPlatformerDebug === undefined
          ? undefined
          : "ready",
      ),
    )
    .toBe("ready");
  await local.evaluate((simulationState) => {
    window.__originalBrowserPlatformerDebug?.renderMultiplayerWireStateForDebug(
      simulationState,
    );
  }, body.simulationState);

  await Promise.all([
    local.screenshot({ path: "screenshots/local-server-parity-local.png" }),
    player.screenshot({
      path: "screenshots/local-server-parity-multiplayer.png",
    }),
    local
      .getByLabel("Original platformer game canvas")
      .screenshot({ path: "screenshots/local-server-parity-local-canvas.png" }),
    player.getByLabel("Authoritative multiplayer game view").screenshot({
      path: "screenshots/local-server-parity-multiplayer-canvas.png",
    }),
  ]);
  await expectExactCanvasParity(
    local,
    player,
    "Original platformer game canvas",
  );
  await Promise.all([
    playerContext.close(),
    localContext.close(),
    adminContext.close(),
  ]);
});

test("two independently connected avatars render every server-driven pixel identically", async ({
  browser,
}) => {
  const creatorContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const guest = await guestContext.newPage();
  const admin = await adminContext.newPage();

  await enterMultiplayerLobby(creator);
  await setProfile(creator, "PixelMira", "tidekeeper");
  await creator.getByRole("button", { name: "Create game" }).click();

  await enterMultiplayerLobby(guest);
  await setProfile(guest, "PixelRen", "ember-warden");
  await guest
    .locator("section > div")
    .filter({
      hasText: /^PixelMira · multiplayer-onboarding · regular · waiting/,
    })
    .getByRole("button", { name: "Join" })
    .click();
  await creator.getByRole("button", { name: "Start" }).click();
  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await expect(
    guest.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();

  const gameId = await findGameIdByCreatorNickname(creator, "PixelMira");
  await pauseGameAsAdministrator(admin, gameId);
  await requireSameAuthoritativeFrame(creator, guest);
  const snapshot = await creator.request.get(`/api/games/${gameId}/snapshot`, {
    headers: { "x-multiplayer-protocol-version": "1" },
  });
  expect(await snapshot.json()).toMatchObject({
    players: [
      { nickname: "PixelMira", avatarId: "tidekeeper" },
      { nickname: "PixelRen", avatarId: "ember-warden" },
    ],
  });
  await expectExactCanvasParity(creator, guest);

  await Promise.all([
    creatorContext.close(),
    guestContext.close(),
    adminContext.close(),
  ]);
});

import { expect, test, type Page } from "@playwright/test";

import { enterMultiplayerLobby } from "./support";

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

async function expectExactCanvasParity(left: Page, right: Page): Promise<void> {
  const [leftDataUrl, rightDataUrl] = await Promise.all(
    [left, right].map((page) =>
      page
        .getByLabel("Authoritative multiplayer game view")
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
      for (let index = 0; index < local.data.length; index += 1) {
        if (local.data[index] !== remote.data[index]) {
          differentPixels += 1;
        }
      }
      return {
        width: local.width,
        height: local.height,
        differentPixels,
      };
    },
    { localDataUrl: leftDataUrl, remoteDataUrl: rightDataUrl },
  );
  expect(comparison).toEqual({
    width: 1280,
    height: 720,
    differentPixels: 0,
  });
}

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
    .filter({ hasText: /^PixelMira · first-authored · regular · waiting/ })
    .getByRole("button", { name: "Join" })
    .click();
  await creator.getByRole("button", { name: "Start" }).click();
  await expect(
    creator.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();
  await expect(
    guest.getByLabel("Authoritative multiplayer game view"),
  ).toBeVisible();

  const lobby = await creator.request.get("/api/lobby", {
    headers: { "x-multiplayer-protocol-version": "1" },
  });
  const games = (await lobby.json()) as {
    readonly games: readonly {
      readonly gameId: string;
      readonly creator: { readonly nickname: string };
    }[];
  };
  const game = games.games.find(
    (candidate) => candidate.creator.nickname === "PixelMira",
  );
  if (game === undefined) {
    throw new Error("Parity game is missing from the lobby.");
  }

  await admin.goto("/#multiplayer-admin");
  await admin.getByLabel("Administrator password").fill("administrator");
  await admin.getByRole("button", { name: "Enter administration" }).click();
  await admin
    .locator("section")
    .filter({ hasText: game.gameId })
    .getByRole("button", { name: "pause" })
    .click();
  await requireSameAuthoritativeFrame(creator, guest);
  const snapshot = await creator.request.get(
    `/api/games/${game.gameId}/snapshot`,
    {
      headers: { "x-multiplayer-protocol-version": "1" },
    },
  );
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

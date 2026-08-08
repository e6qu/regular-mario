import { expect, test } from "@playwright/test";

import {
  cancelGame,
  countLiveAudioContexts,
  createGameOnLevel,
  findGameIdByCreatorNickname,
  joinHostedGame,
  leaveGame,
  login,
  saveProfile,
  trackAudioContexts,
} from "./support";

// Leaving a game and rejoining it was reported to duplicate the character —
// "a goomba stomp appears duplicate as if there are 2 characters into one" —
// and to leave two music tracks playing at once. Both are shapes a single
// client cannot show: they need one player to leave a live game and come back
// while another keeps it running.
//
// Every test here takes its own pair of nicknames. The server holds nicknames
// globally unique and a profile outlives the browser context that made it, so
// two tests sharing a name means the second one is refused at the door.

test("rejoining leaves exactly one canvas, one character and one audio scene", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await login(host);
    await saveProfile(host, "RejoinHost");
    await createGameOnLevel(host, "smb-1-1");
    await findGameIdByCreatorNickname(host, "RejoinHost");

    await login(guest);
    await saveProfile(guest, "RejoinGuest");
    await joinHostedGame(guest, "RejoinHost");

    await leaveGame(guest);
    await joinHostedGame(guest, "RejoinHost");

    const shell = guest.locator(".multiplayer-game-shell");

    // Exactly one canvas. Phaser's teardown is asynchronous, and a second game
    // mounted before the first detached would draw a second character over the
    // first — which is what "two characters in one" looks like.
    await expect(guest.locator(".multiplayer-game-shell canvas")).toHaveCount(
      1,
    );

    // Exactly one Phaser game, so only one scene is stepping and only one audio
    // context is playing. Two would be two music tracks at once.
    const runningGames = await guest.evaluate(
      () => document.querySelectorAll("canvas").length,
    );
    expect(runningGames).toBe(1);

    // The rejoined player is painted, and the party still holds two members.
    const canvas = guest.locator(".multiplayer-game-shell canvas");
    await expect(canvas).toHaveAttribute(
      "data-rendered-primary-visible",
      "true",
      { timeout: 15_000 },
    );
    await expect(shell).toHaveAttribute("data-game-phase", "playing");

    // Hand the lobby back empty: a game still listed here is a strict-mode
    // violation waiting to happen in whichever spec runs next.
    await cancelGame(host);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

// The reported symptom — "a goomba stomp appears duplicate as if there are 2
// characters into one and it's as if two musics are playing at once" — is not a
// DOM fact. The renderer deletes the stale canvas by hand because Phaser's
// destroy is asynchronous, so the canvas count above can pass while the previous
// game is still stepping and still audible. Every sound the old game plays then
// doubles the new one: one stomp is heard twice, and both level themes run.
test("rejoining leaves exactly one audible game", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await trackAudioContexts(guest);

  try {
    await login(host);
    await saveProfile(host, "AudioHost");
    await createGameOnLevel(host, "smb-1-1");
    await findGameIdByCreatorNickname(host, "AudioHost");

    await login(guest);
    await saveProfile(guest, "AudioGuest");
    await joinHostedGame(guest, "AudioHost");

    // Audio only starts on a real key press: browsers refuse to sound off
    // before a gesture, so a game nobody has touched is silent either way.
    await guest.keyboard.press("ArrowRight");
    await expect
      .poll(async () => countLiveAudioContexts(guest), { timeout: 15_000 })
      .toBeGreaterThan(0);
    const afterFirstJoin = await countLiveAudioContexts(guest);

    await leaveGame(guest);
    await joinHostedGame(guest, "AudioHost");
    await guest.keyboard.press("ArrowRight");

    await expect(guest.locator(".multiplayer-game-shell canvas")).toHaveCount(
      1,
    );
    // A full leave-and-return cycle must leave the page exactly as loud as it
    // was: the game that was left releases its context, the one returned to
    // opens one. Asserting "no growth" rather than a magic number, because one
    // context is legitimately shared for asset decoding and outlives every
    // game. Growth here is the bug — both level themes audible at once, every
    // effect heard twice — and it compounds: browsers cap live contexts at
    // about six, after which all audio dies for the rest of the session.
    await expect
      .poll(async () => countLiveAudioContexts(guest), { timeout: 15_000 })
      .toBe(afterFirstJoin);

    await cancelGame(host);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

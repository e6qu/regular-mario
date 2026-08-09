import { expect, test, type TestInfo } from "@playwright/test";

import {
  cancelGame,
  createGameOnLevel,
  findGameIdByCreatorNickname,
  joinHostedGame,
  login,
  saveProfile,
} from "./support";

function report(
  info: TestInfo,
  name: string,
  values: Readonly<Record<string, unknown>>,
): void {
  info.annotations.push({ type: name, description: JSON.stringify(values) });
}

/**
 * Whether the canvas ever paints an older world than the one it just painted.
 *
 * Two writers mutate the same scene: the authoritative snapshot when it arrives
 * over the socket, and the local prediction every animation frame. The socket
 * one runs from its own callback, at no fixed relationship to when Phaser
 * composites — so a frame can be painted with some objects advanced and others
 * not, and the rendered frame index can go *backwards* when a 20 Hz receipt
 * overwrites a newer 60 Hz prediction. Backwards is the part a test can see, and
 * it is the same defect: the picture is assembled from two different instants.
 */
test("the canvas never paints an older frame than the one before", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await login(host);
    await saveProfile(host, "TearHost");
    await createGameOnLevel(host, "smb-1-1");
    await findGameIdByCreatorNickname(host, "TearHost");

    await login(guest);
    await saveProfile(guest, "TearGuest");
    await joinHostedGame(guest, "TearHost");

    await guest.waitForTimeout(1_000);
    await guest.keyboard.down("ArrowRight");

    // Sampled inside the page so the reads are not spaced by IPC latency: a
    // regression that lasts one frame is invisible to a 25ms poll.
    const frames = await guest.evaluate(async () => {
      const canvas = document.querySelector(".multiplayer-game-shell canvas");
      const seen: number[] = [];
      const started = performance.now();
      while (performance.now() - started < 3000) {
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        const value = canvas?.getAttribute("data-rendered-simulation-frame");
        if (value !== null && value !== undefined) {
          seen.push(Number(value));
        }
      }
      return seen;
    });
    await guest.keyboard.up("ArrowRight");

    const regressions = frames.filter(
      (frame, index) => index > 0 && frame < (frames[index - 1] ?? frame),
    );
    const worstRegression =
      regressions.length === 0
        ? 0
        : Math.max(
            ...frames.map((frame, index) =>
              index === 0
                ? 0
                : Math.max(0, (frames[index - 1] ?? frame) - frame),
            ),
          );
    report(test.info(), "render-order", {
      frames: frames.length,
      regressions: regressions.length,
      worstRegressionFrames: worstRegression,
      advanced: (frames.at(-1) ?? 0) - (frames[0] ?? 0),
    });

    expect(frames.length).toBeGreaterThan(60);
    expect(regressions.length).toBe(0);

    await cancelGame(host);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

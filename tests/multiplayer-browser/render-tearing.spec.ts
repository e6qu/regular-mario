import { expect, test } from "@playwright/test";

import { cancelGame, openTwoPlayerGame, report } from "./support";

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
  const { hostContext, guestContext, host, guest } = await openTwoPlayerGame(
    browser,
    "TearHost",
    "TearGuest",
  );

  try {
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

/**
 * An idle player's world must still be alive.
 *
 * The prediction advance used to be skipped until the local player had sent an
 * input, so somebody who had not touched the keyboard watched the whole world —
 * enemies, team-mates, everything — move only when a server snapshot landed, at
 * 20 Hz. Standing still is not a reason to stop simulating.
 *
 * Measured as how far the rendered simulation frame advances per second while
 * pressing nothing: the engine runs at 60 Hz, so a live world advances far more
 * than the 20 snapshots that arrive in the same second.
 */
test("a player who presses nothing still sees a live world", async ({
  browser,
}) => {
  const { hostContext, guestContext, host, guest } = await openTwoPlayerGame(
    browser,
    "IdleHost",
    "IdleGuest",
  );

  try {
    await guest.waitForTimeout(1_000);

    // Deliberately no key presses anywhere.
    const advancedPerSecond = await guest.evaluate(async () => {
      const canvas = document.querySelector(".multiplayer-game-shell canvas");
      const read = (): number =>
        Number(canvas?.getAttribute("data-rendered-simulation-frame") ?? 0);
      const before = read();
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      return (read() - before) / 2;
    });

    report(test.info(), "idle-world", {
      advancedFramesPerSecond: advancedPerSecond,
    });
    // Comfortably above the 20 snapshots a second the transport delivers, and
    // below a full 60 only if the machine is struggling.
    expect(advancedPerSecond).toBeGreaterThan(40);

    await cancelGame(host);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

import { expect, test } from "@playwright/test";

import { cancelGame, openTwoPlayerGame, report } from "./support";

/**
 * How often the guest's predicted world has to be corrected by the server.
 *
 * Every reconcile is a visible snap: the local player is re-seated on the
 * authoritative state and the unacknowledged inputs are replayed on top. A
 * prediction that matches the server needs one at the start and then only when
 * something genuinely unexpected happens; a prediction that models the world
 * differently needs one constantly, which is what rubber-banding is.
 */
test("a guest's prediction does not need constant correction", async ({
  browser,
}) => {
  const { hostContext, guestContext, host, guest } = await openTwoPlayerGame(
    browser,
    "DriftHost",
    "DriftGuest",
  );

  try {
    const shell = guest.locator(".multiplayer-game-shell");
    const readCounts = async () => ({
      reconciles: Number(
        await shell.getAttribute("data-debug-prediction-reconcile-count"),
      ),
      sends: Number(await shell.getAttribute("data-debug-input-send-count")),
    });

    // Settle, then drive for a fixed stretch of real play.
    await guest.waitForTimeout(1_000);
    const before = await readCounts();
    await guest.keyboard.down("ArrowRight");
    await guest.waitForTimeout(5_000);
    await guest.keyboard.up("ArrowRight");
    const after = await readCounts();

    const reconciles = after.reconciles - before.reconciles;
    const sends = after.sends - before.sends;
    report(test.info(), "prediction", {
      reconciles,
      sends,
      ratio: sends === 0 ? "n/a" : (reconciles / sends).toFixed(3),
    });
    expect(sends).toBeGreaterThan(0);

    await cancelGame(host);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

/**
 * A rubber-band, stated as something a test can see.
 *
 * While a player holds right and nothing stops them, the character they are
 * looking at must not travel backwards. Any backward step is the local view
 * being yanked to a position it had already moved past — which is exactly what
 * "rubber-banding" describes. Sampled from what the shell reports it painted,
 * not from the simulation, because the complaint is about what the player sees.
 */
test("a running guest is never yanked backwards", async ({ browser }) => {
  const { hostContext, guestContext, host, guest } = await openTwoPlayerGame(
    browser,
    "SmoothHost",
    "SmoothGuest",
  );

  try {
    const shell = guest.locator(".multiplayer-game-shell");
    await guest.waitForTimeout(1_000);
    await guest.keyboard.down("ArrowRight");

    // Sampled over a stretch of clear ground: World 1-1's first goomba is about
    // twenty tiles in, and an enemy knocking the player back is honest
    // gameplay, not a rubber-band. Measuring through it would assert that
    // knockback never happens.
    const samples: number[] = [];
    for (let sample = 0; sample < 60; sample += 1) {
      const rendered = await shell.getAttribute("data-local-player-rendered");
      if (rendered !== null && rendered !== "absent") {
        const [x] = rendered.split(",");
        if (x !== undefined) {
          samples.push(Number(x));
        }
      }
      await guest.waitForTimeout(25);
    }
    await guest.keyboard.up("ArrowRight");

    expect(samples.length).toBeGreaterThan(30);
    // Only count real regressions: the sampler is not frame-locked, so a
    // repeated reading is fine. A step backwards is not.
    const backwardSteps = samples.filter(
      (x, index) => index > 0 && x < (samples[index - 1] ?? x),
    );
    const worstBackwardStep =
      backwardSteps.length === 0
        ? 0
        : Math.max(
            ...samples.map((x, index) =>
              index === 0 ? 0 : Math.max(0, (samples[index - 1] ?? x) - x),
            ),
          );
    report(test.info(), "smoothness", {
      samples: samples.length,
      backwardSteps: backwardSteps.length,
      worstBackwardStepPx: worstBackwardStep,
      travelledPx: (samples.at(-1) ?? 0) - (samples[0] ?? 0),
    });
    expect(samples.at(-1) ?? 0).toBeGreaterThan(samples[0] ?? 0);
    // Magnitude, not count. A rubber-band yank is the guest being dragged tens
    // of pixels back to where the server thought it was, and that is what this
    // guards. The rendered position is snapped to whole pixels, so two readings
    // either side of a sub-pixel position differ by one with nothing having
    // been yanked — counting those made the guarantee depend on which side of a
    // rounding boundary the sampler happened to catch.
    expect(
      worstBackwardStep,
      `the guest was pulled back ${String(worstBackwardStep)}px, across ` +
        `${String(backwardSteps.length)} of ${String(samples.length)} samples`,
    ).toBeLessThanOrEqual(1);

    await cancelGame(host);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

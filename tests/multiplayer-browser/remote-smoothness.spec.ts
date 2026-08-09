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
 * How smoothly one player sees another move.
 *
 * This is the "other players lag" complaint, stated as a number. A client that
 * only receives positions can do no better than replay them at the rate they
 * arrive — 20 Hz — so a remote character advances in visible jumps with long
 * stalls between them. A client that receives the other player's *command* can
 * simulate them every frame, so the same motion arrives in small even steps.
 *
 * Measured as the proportion of samples where the remote character did not move
 * at all: with 25ms sampling and a 50ms update rate, roughly half of all samples
 * land on a stall.
 */
test("another player's movement is not seen in 20 Hz jumps", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await login(host);
    await saveProfile(host, "MoverHost");
    await createGameOnLevel(host, "smb-1-1");
    await findGameIdByCreatorNickname(host, "MoverHost");

    await login(guest);
    await saveProfile(guest, "WatcherGuest");
    await joinHostedGame(guest, "MoverHost");

    const watcher = guest.locator(".multiplayer-game-shell");
    await guest.waitForTimeout(1_000);

    // The host runs; the guest watches. Clear ground only, so nothing but the
    // transport explains a stall.
    await host.keyboard.down("ArrowRight");
    const hostShell = host.locator(".multiplayer-game-shell");
    const hostSamples: number[] = [];
    const samples: number[] = [];
    for (let sample = 0; sample < 60; sample += 1) {
      const hostRendered = await hostShell.getAttribute(
        "data-local-player-rendered",
      );
      if (hostRendered !== null && hostRendered !== "absent") {
        const hx = hostRendered.split(",")[0];
        if (hx !== undefined) hostSamples.push(Number(hx));
      }
      const rendered = await watcher.getAttribute(
        "data-remote-players-rendered",
      );
      if (rendered !== null && rendered !== "absent") {
        const [first] = rendered.split(";");
        const x = first?.split(",")[0];
        if (x !== undefined) {
          samples.push(Number(x));
        }
      }
      await guest.waitForTimeout(25);
    }
    await host.keyboard.up("ArrowRight");

    expect(samples.length).toBeGreaterThan(30);
    const steps = samples
      .slice(1)
      .map((x, index) => x - (samples[index] ?? x))
      .filter((step) => step >= 0);
    const stalls = steps.filter((step) => step === 0).length;
    const travelled = (samples.at(-1) ?? 0) - (samples[0] ?? 0);
    report(test.info(), "host-self", {
      samples: hostSamples.length,
      travelledPx: (hostSamples.at(-1) ?? 0) - (hostSamples[0] ?? 0),
    });
    report(test.info(), "remote-smoothness", {
      samples: samples.length,
      travelledPx: travelled,
      stalledSamples: stalls,
      stalledFraction: (stalls / Math.max(1, steps.length)).toFixed(3),
      largestStepPx: steps.length === 0 ? 0 : Math.max(...steps),
    });

    // The watcher must see very nearly the journey the runner made. These held
    // at 8.5% stalled and a 4px largest step once remote players were simulated
    // from their relayed commands; before that it was 93.2% and 48px, with the
    // watcher seeing under half the distance travelled.
    expect(stalls / Math.max(1, steps.length)).toBeLessThan(0.3);
    expect(steps.length === 0 ? 0 : Math.max(...steps)).toBeLessThan(16);
    expect(travelled).toBeGreaterThan(0);

    await cancelGame(host);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

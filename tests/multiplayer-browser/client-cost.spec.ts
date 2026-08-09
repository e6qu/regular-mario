import { expect, test, type Page } from "@playwright/test";

import { cancelGame, openTwoPlayerGame, report } from "./support";

declare global {
  interface Window {
    __frameDeltas?: number[];
    __socketBytes?: { count: number; bytes: number };
    __socketByType?: Record<string, { count: number; bytes: number }>;
    __socketSample?: string | undefined;
  }
}

/** Serialized size of each top-level field, largest first. */
function sizesByKey(
  value: Readonly<Record<string, unknown>>,
): Record<string, number> {
  const entries: [string, number][] = Object.entries(value).map(
    ([key, field]) => [key, JSON.stringify(field).length],
  );
  entries.sort((left, right) => right[1] - left[1]);
  return Object.fromEntries(entries);
}

/** Record every animation-frame gap, so stutter shows up as a number. */
async function recordFrameDeltas(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__frameDeltas = [];
    let previous: number | undefined;
    const tick = (now: number): void => {
      if (previous !== undefined) {
        window.__frameDeltas?.push(now - previous);
      }
      previous = now;
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

/** Count what the authoritative socket actually pushes at this client. */
async function recordSocketTraffic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__socketBytes = { count: 0, bytes: 0 };
    window.__socketByType = {};
    window.__socketSample = undefined;
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (event: MessageEvent) => {
          const size = typeof event.data === "string" ? event.data.length : 0;
          const totals = window.__socketBytes;
          if (totals !== undefined) {
            totals.count += 1;
            totals.bytes += size;
          }
          if (typeof event.data === "string") {
            const parsedType = (JSON.parse(event.data) as { type?: string })
              .type;
            const type = parsedType ?? "unknown";
            const byType = window.__socketByType;
            if (byType !== undefined) {
              const entry = byType[type] ?? { count: 0, bytes: 0 };
              entry.count += 1;
              entry.bytes += size;
              byType[type] = entry;
            }
          }
          // Keep the most recent message: the typical steady-state one, not
          // the periodic keyframe, is what dominates the bandwidth bill.
          if (typeof event.data === "string") {
            window.__socketSample = event.data;
          }
        });
      }
    };
  });
}

test("reports what a live game costs the client", async ({ browser }) => {
  const { hostContext, guestContext, host, guest } = await openTwoPlayerGame(
    browser,
    "CostHost",
    "CostGuest",
    async (page) => {
      await recordFrameDeltas(page);
      await recordSocketTraffic(page);
    },
  );

  try {
    await guest.waitForTimeout(1_000);
    await guest.evaluate(() => {
      window.__frameDeltas = [];
      const totals = window.__socketBytes;
      if (totals !== undefined) {
        totals.count = 0;
        totals.bytes = 0;
      }
      window.__socketByType = {};
    });

    await guest.keyboard.down("ArrowRight");
    await guest.waitForTimeout(4_000);
    await guest.keyboard.up("ArrowRight");

    const measured = await guest.evaluate(() => ({
      deltas: window.__frameDeltas ?? [],
      socket: window.__socketBytes ?? { count: 0, bytes: 0 },
      sample: window.__socketSample,
      byType: window.__socketByType ?? {},
    }));
    report(test.info(), "socket-by-type", measured.byType);
    if (measured.sample !== undefined) {
      const parsed = JSON.parse(measured.sample) as Readonly<
        Record<string, unknown>
      >;
      const byKey = sizesByKey(parsed);
      // Where a delta's bytes actually go. Each change carries its own path
      // from the root of the snapshot, so a two-byte coordinate can arrive
      // under sixty bytes of addressing.
      const deltas = (
        parsed as {
          deltas?: readonly {
            readonly delta?: { readonly changes?: readonly unknown[] };
          }[];
        }
      ).deltas;
      const changes = deltas?.[0]?.delta?.changes;
      if (changes !== undefined) {
        let pathBytes = 0;
        let valueBytes = 0;
        for (const change of changes) {
          const entry = change as {
            readonly path?: unknown;
            readonly value?: unknown;
          };
          pathBytes += JSON.stringify(entry.path ?? []).length;
          valueBytes += JSON.stringify(entry.value ?? null).length;
        }
        report(test.info(), "delta-anatomy", {
          changes: changes.length,
          pathBytes,
          valueBytes,
          pathShare: (pathBytes / Math.max(1, pathBytes + valueBytes)).toFixed(
            3,
          ),
          sample: JSON.stringify(changes.slice(0, 3)),
        });
      }
      report(test.info(), "message-shape", {
        totalBytes: measured.sample.length,
        byKey,
      });
      const snapshots = (parsed as { snapshots?: readonly unknown[] })
        .snapshots;
      const first = snapshots?.[0] as
        | { readonly simulationState?: Record<string, unknown> }
        | undefined;
      const state = first?.simulationState;
      if (state !== undefined) {
        report(test.info(), "state-shape", {
          byKey: Object.fromEntries(
            Object.entries(sizesByKey(state)).slice(0, 12),
          ),
        });
      }
    }

    const sorted = [...measured.deltas].sort((a, b) => a - b);
    const at = (fraction: number): number =>
      sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
      ] ?? 0;
    report(test.info(), "frame-cost", {
      frames: sorted.length,
      p50: at(0.5).toFixed(1),
      p95: at(0.95).toFixed(1),
      p99: at(0.99).toFixed(1),
      worst: (sorted.at(-1) ?? 0).toFixed(1),
      over33ms: sorted.filter((delta) => delta > 33).length,
    });
    report(test.info(), "socket-cost", {
      messages: measured.socket.count,
      bytes: measured.socket.bytes,
      perSecondBytes: Math.round(measured.socket.bytes / 4),
      averageMessageBytes:
        measured.socket.count === 0
          ? 0
          : Math.round(measured.socket.bytes / measured.socket.count),
    });

    expect(sorted.length).toBeGreaterThan(60);

    await cancelGame(host);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

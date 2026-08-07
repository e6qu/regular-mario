import { describe, expect, it } from "vitest";

import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import { requireMultiplayerPlayerId } from "./domain";
import {
  InputQueueRejection,
  makeExpiringInputQueue,
  type QueuedSimulationInput,
} from "./input-queue";

const playerId = requireMultiplayerPlayerId("mira");
const command: SimulationInputCommand = {
  horizontal: HorizontalInput.Right,
  jumpPressed: false,
  runHeld: true,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

function input(
  sequence: number,
  intendedFrame: number,
  receivedAtMilliseconds: number,
): QueuedSimulationInput {
  return { playerId, sequence, intendedFrame, receivedAtMilliseconds, command };
}

describe("expiring input queue", () => {
  it("keeps ordered input until its intended authoritative frame", () => {
    const queue = makeExpiringInputQueue(4, 3000);
    expect(queue.enqueue(input(1, 10, 100), 100)).toBeUndefined();
    expect(queue.drainThroughFrame(playerId, 9, 101)).toEqual([]);
    expect(queue.drainThroughFrame(playerId, 10, 101)).toEqual([
      input(1, 10, 100),
    ]);
    expect(queue.metrics()).toMatchObject({ accepted: 1, depth: 0 });
  });

  it("rejects duplicate, out-of-order, expired, and over-capacity inputs", () => {
    const queue = makeExpiringInputQueue(1, 3000);
    expect(queue.enqueue(input(2, 2, 0), 0)).toBeUndefined();
    expect(queue.enqueue(input(2, 3, 0), 0)).toBe(
      InputQueueRejection.Duplicate,
    );
    expect(queue.enqueue(input(1, 3, 0), 0)).toBe(
      InputQueueRejection.OutOfOrder,
    );
    expect(queue.enqueue(input(3, 3, 0), 0)).toBe(InputQueueRejection.Capacity);
    expect(queue.enqueue(input(4, 4, 0), 3001)).toBe(
      InputQueueRejection.Expired,
    );
    expect(queue.metrics()).toMatchObject({
      duplicate: 1,
      outOfOrder: 1,
      capacity: 1,
      expired: 2,
      depth: 0,
    });
  });
});

describe("forgetting a player", () => {
  // A reconnecting client starts a fresh input sequence at zero. The queue's
  // high-water mark is per player and never expires on its own, so unless the
  // mark is dropped when the player leaves or rejoins, the whole of the new
  // session is refused as out-of-order until it climbs past wherever the old
  // one stopped. That is the "rejoining sometimes doesn't work" report: how long
  // the freeze lasts depends on how far the previous session got.
  it("lets a rejoining player start its sequence over", () => {
    const queue = makeExpiringInputQueue(16, 1_000);
    for (const sequence of [1, 2, 3, 4, 5]) {
      expect(queue.enqueue(input(sequence, sequence, 0), 0)).toBeUndefined();
    }

    // Without forget(), this is what a rejoin looks like to the server.
    expect(queue.enqueue(input(1, 6, 0), 0)).toBe(InputQueueRejection.OutOfOrder);

    queue.forget(playerId);
    expect(queue.enqueue(input(1, 6, 0), 0)).toBeUndefined();
    expect(queue.enqueue(input(2, 7, 0), 0)).toBeUndefined();
  });

  it("drops the forgotten player's pending messages from the depth metric", () => {
    const queue = makeExpiringInputQueue(16, 1_000);
    queue.enqueue(input(1, 100, 0), 0);
    queue.enqueue(input(2, 101, 0), 0);
    expect(queue.metrics().depth).toBe(2);

    queue.forget(playerId);

    // Depth counts what is waiting to be simulated. Leaving a departed player's
    // messages counted would walk the queue toward its capacity limit and start
    // rejecting live players.
    expect(queue.metrics().depth).toBe(0);
    expect(queue.drainThroughFrame(playerId, 200, 0)).toEqual([]);
  });

  it("is harmless for a player the queue has never seen", () => {
    const queue = makeExpiringInputQueue(16, 1_000);
    expect(() => queue.forget(playerId)).not.toThrow();
    expect(queue.metrics().depth).toBe(0);
  });
});

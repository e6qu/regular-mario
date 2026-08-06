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

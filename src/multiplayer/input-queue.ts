import type { SimulationInputCommand } from "../engine/simulation/input-command";
import type { MultiplayerPlayerId } from "./domain";

export type QueuedSimulationInput = {
  readonly playerId: MultiplayerPlayerId;
  readonly sequence: number;
  readonly intendedFrame: number;
  readonly receivedAtMilliseconds: number;
  readonly command: SimulationInputCommand;
};

export enum InputQueueRejection {
  Duplicate = "duplicate",
  OutOfOrder = "out-of-order",
  Expired = "expired",
  Capacity = "capacity",
}

export type InputQueueMetrics = {
  readonly accepted: number;
  readonly expired: number;
  readonly duplicate: number;
  readonly outOfOrder: number;
  readonly capacity: number;
  readonly depth: number;
};

type MutableInputQueueMetrics = {
  -readonly [Key in keyof InputQueueMetrics]: InputQueueMetrics[Key];
};

export type ExpiringInputQueue = {
  enqueue(
    input: QueuedSimulationInput,
    nowMilliseconds: number,
  ): InputQueueRejection | undefined;
  drainThroughFrame(
    playerId: MultiplayerPlayerId,
    authoritativeFrame: number,
    nowMilliseconds: number,
  ): readonly QueuedSimulationInput[];
  /**
   * Drop everything remembered about a player, including the highest input
   * sequence seen from them.
   *
   * The sequence mark is why this exists. It is a high-water mark that rejects
   * replays and reordering, and a reconnecting client starts counting from zero
   * again — so unless the old mark is forgotten, every input from a rejoining
   * player is refused as out-of-order until it climbs back past wherever the
   * previous session left off. How long that takes depends on how far they got
   * last time, which is why the symptom is "rejoining sometimes doesn't work"
   * rather than "never".
   */
  forget(playerId: MultiplayerPlayerId): void;
  metrics(): InputQueueMetrics;
};

export function makeExpiringInputQueue(
  maximumMessages: number,
  expiryMilliseconds: number,
): ExpiringInputQueue {
  if (!Number.isSafeInteger(maximumMessages) || maximumMessages <= 0) {
    throw new Error("maximumMessages must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(expiryMilliseconds) || expiryMilliseconds <= 0) {
    throw new Error("expiryMilliseconds must be a positive safe integer.");
  }

  const messagesByPlayerId = new Map<
    MultiplayerPlayerId,
    QueuedSimulationInput[]
  >();
  const lastSequenceByPlayerId = new Map<MultiplayerPlayerId, number>();
  const mutableMetrics: MutableInputQueueMetrics = {
    accepted: 0,
    expired: 0,
    duplicate: 0,
    outOfOrder: 0,
    capacity: 0,
    depth: 0,
  };

  function expire(nowMilliseconds: number): void {
    for (const [playerId, messages] of messagesByPlayerId) {
      const retained = messages.filter((message) => {
        const isExpired =
          nowMilliseconds - message.receivedAtMilliseconds > expiryMilliseconds;
        if (isExpired) {
          mutableMetrics.expired += 1;
          mutableMetrics.depth -= 1;
        }
        return !isExpired;
      });
      if (retained.length === 0) {
        messagesByPlayerId.delete(playerId);
      } else {
        messagesByPlayerId.set(playerId, retained);
      }
    }
  }

  return {
    enqueue(input, nowMilliseconds) {
      expire(nowMilliseconds);
      if (nowMilliseconds - input.receivedAtMilliseconds > expiryMilliseconds) {
        mutableMetrics.expired += 1;
        return InputQueueRejection.Expired;
      }
      const lastSequence = lastSequenceByPlayerId.get(input.playerId);
      if (lastSequence !== undefined && input.sequence === lastSequence) {
        mutableMetrics.duplicate += 1;
        return InputQueueRejection.Duplicate;
      }
      if (lastSequence !== undefined && input.sequence < lastSequence) {
        mutableMetrics.outOfOrder += 1;
        return InputQueueRejection.OutOfOrder;
      }
      if (mutableMetrics.depth >= maximumMessages) {
        mutableMetrics.capacity += 1;
        return InputQueueRejection.Capacity;
      }
      const messages = messagesByPlayerId.get(input.playerId) ?? [];
      messages.push(input);
      messagesByPlayerId.set(input.playerId, messages);
      lastSequenceByPlayerId.set(input.playerId, input.sequence);
      mutableMetrics.accepted += 1;
      mutableMetrics.depth += 1;
      return undefined;
    },
    drainThroughFrame(playerId, authoritativeFrame, nowMilliseconds) {
      expire(nowMilliseconds);
      const messages = messagesByPlayerId.get(playerId) ?? [];
      const accepted: QueuedSimulationInput[] = [];
      const deferred: QueuedSimulationInput[] = [];
      for (const message of messages) {
        if (message.intendedFrame <= authoritativeFrame) {
          accepted.push(message);
          mutableMetrics.depth -= 1;
        } else {
          deferred.push(message);
        }
      }
      if (deferred.length === 0) {
        messagesByPlayerId.delete(playerId);
      } else {
        messagesByPlayerId.set(playerId, deferred);
      }
      return accepted;
    },
    forget(playerId) {
      const messages = messagesByPlayerId.get(playerId);
      if (messages !== undefined) {
        mutableMetrics.depth -= messages.length;
        messagesByPlayerId.delete(playerId);
      }
      lastSequenceByPlayerId.delete(playerId);
    },
    metrics() {
      return { ...mutableMetrics };
    },
  };
}

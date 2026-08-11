import { describe, expect, it } from "vitest";

import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeInitialPlayerVitalityState } from "../engine/simulation/player-vitality";
import {
  appendSimulationPlayerAt,
  makeInitialSimulationState,
  makeInitialSimulationStateWithPlayerVitality,
  type SimulationState,
} from "../engine/simulation/simulation-state";
import {
  PlayerDefeatReason,
  PlayerOutcomeKind,
} from "../engine/simulation/player-outcome";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationPixelPosition,
} from "../engine/simulation/simulation-units";
import {
  makeClientPrediction,
  predictionRequiresLifecycleReconcile,
} from "./client-prediction";

const right: SimulationInputCommand = {
  horizontal: HorizontalInput.Right,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

const neutral: SimulationInputCommand = {
  horizontal: HorizontalInput.Neutral,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

function initialState() {
  const result = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );
  if (!result.ok) {
    throw new Error("Expected valid prediction state.");
  }
  return result.value;
}

function requirePlayerAt(state: SimulationState, slot: number) {
  const player = state.players[slot];
  if (player === undefined) {
    throw new Error("Expected player slot is missing.");
  }
  return player;
}

describe("client prediction", () => {
  // A client is sent positions and nothing else, so it can only replay them at
  // the rate they arrive. Given the other player's command it can simulate them
  // every frame instead. This is that capability in isolation.
  it("simulates another player from their relayed command", () => {
    const twoPlayers = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!twoPlayers.ok) {
      throw new Error("Expected a valid two-player prediction state.");
    }
    // Players are solid to each other, so the idle local player stands clear of
    // the walker's path — otherwise "stayed put" would fail to a legitimate
    // shove rather than to a prediction defect.
    const localPlayer = requirePlayerAt(twoPlayers.value, 1);
    const separatedState: SimulationState = {
      ...twoPlayers.value,
      players: [
        twoPlayers.value.players[0],
        {
          ...localPlayer,
          player: {
            ...localPlayer.player,
            position: {
              x: requireSimulationPixelPosition(160, "test.local.x"),
              y: localPlayer.player.position.y,
            },
          },
        },
      ],
    };
    // This client is slot 1; slot 0 is somebody else.
    const prediction = makeClientPrediction(
      separatedState,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      1,
    );
    const remoteBefore = Number(
      requirePlayerAt(prediction.snapshot().state, 0).player.position.x,
    );

    prediction.setRemoteCommand(0, right);
    for (let frame = 0; frame < 20; frame += 1) {
      prediction.advance(neutral);
    }

    const remoteAfter = Number(
      requirePlayerAt(prediction.snapshot().state, 0).player.position.x,
    );
    expect(remoteAfter).toBeGreaterThan(remoteBefore);
    // And this client's own player, holding nothing, stayed put.
    expect(
      Number(requirePlayerAt(prediction.snapshot().state, 1).player.position.x),
    ).toBe(160);
  });

  it("applies local commands immediately and retains unacknowledged history", () => {
    const prediction = makeClientPrediction(
      initialState(),
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      0,
    );
    const before = Number(
      prediction.snapshot().state.players[0].player.position.x,
    );
    const after = prediction.submit(1, right);
    expect(Number(after.state.players[0].player.position.x)).toBeGreaterThan(
      before,
    );
    expect(after.pendingInputs).toHaveLength(1);
  });

  it("reconciles acknowledged input and replays newer pending input", () => {
    const prediction = makeClientPrediction(
      initialState(),
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      0,
    );
    prediction.submit(1, right);
    prediction.submit(2, right);
    const base = initialState();
    const authoritative: SimulationState = {
      ...base,
      players: [
        {
          ...base.players[0],
          player: {
            ...base.players[0].player,
            position: {
              x: requireSimulationPixelPosition(80, "test.ack.x"),
              y: base.players[0].player.position.y,
            },
          },
        },
      ],
    };
    const reconciled = prediction.reconcileState(1, authoritative);
    expect(reconciled.pendingInputs.map((input) => input.sequence)).toEqual([
      2,
    ]);
    expect(
      Number(reconciled.state.players[0].player.position.x),
    ).toBeGreaterThan(80);
    expect(() => prediction.submit(2, right)).toThrow("increase");
  });

  it("predicts the joining player's own slot from a complete server state", () => {
    const serverState = appendSimulationPlayerAt(initialState(), {
      x: requireSimulationPixelPosition(48, "test.joiner.x"),
      y: requireSimulationPixelPosition(64, "test.joiner.y"),
    });
    const prediction = makeClientPrediction(
      serverState,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      1,
    );
    const beforeCreator = Number(
      requirePlayerAt(prediction.snapshot().state, 0).player.position.x,
    );
    const beforeJoiner = Number(
      requirePlayerAt(prediction.snapshot().state, 1).player.position.x,
    );
    const advanced = prediction.advance(right);
    expect(Number(requirePlayerAt(advanced.state, 0).player.position.x)).toBe(
      beforeCreator,
    );
    expect(
      Number(requirePlayerAt(advanced.state, 1).player.position.x),
    ).toBeGreaterThan(beforeJoiner);
    const reconciled = prediction.reconcileState(0, serverState);
    expect(Number(requirePlayerAt(reconciled.state, 1).player.position.x)).toBe(
      beforeJoiner,
    );
  });

  it("requires a lifecycle reconcile when a REMOTE player's outcome changes", () => {
    const twoPlayers = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!twoPlayers.ok) {
      throw new Error("Expected a valid two-player state.");
    }
    const predicted = twoPlayers.value;
    const authoritative: SimulationState = {
      ...predicted,
      players: [
        predicted.players[0],
        {
          ...requirePlayerAt(predicted, 1),
          outcome: {
            kind: PlayerOutcomeKind.Defeated,
            reason: PlayerDefeatReason.EnemyContact,
          },
        },
      ],
    };
    // An idle client never acknowledges input, so this check is its only
    // reconciliation trigger: a dead teammate must not keep running as a
    // locally simulated ghost.
    expect(
      predictionRequiresLifecycleReconcile(predicted, authoritative, 0),
    ).toBe(true);
    expect(predictionRequiresLifecycleReconcile(predicted, predicted, 0)).toBe(
      false,
    );
  });

  it("reconciles a server revive without waiting for another input acknowledgement", () => {
    const defeated: SimulationState = {
      ...initialState(),
      players: [
        {
          ...initialState().players[0],
          outcome: {
            kind: PlayerOutcomeKind.Defeated,
            reason: PlayerDefeatReason.EnemyContact,
          },
        },
      ],
    };
    const revived = initialState();
    const prediction = makeClientPrediction(
      defeated,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      0,
    );

    expect(
      predictionRequiresLifecycleReconcile(
        prediction.snapshot().state,
        revived,
        0,
      ),
    ).toBe(true);

    const reconciled = prediction.reconcileState(0, revived);
    expect(reconciled.state.players[0].outcome.kind).toBe(
      PlayerOutcomeKind.Active,
    );
  });
});

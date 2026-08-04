import type { LevelSpec } from "../engine/domain/level-spec";
import type { MovementConstants } from "../engine/simulation/movement-model";
import type { SimulationInputCommand } from "../engine/simulation/input-command";
import type { SimulationState } from "../engine/simulation/simulation-state";
import { stepSimulation } from "../engine/simulation/step-simulation";
import { requireSimulationPixelPosition } from "../engine/simulation/simulation-units";

export type PendingPredictedInput = {
  readonly sequence: number;
  readonly command: SimulationInputCommand;
};

export type LocalPredictionSnapshot = {
  readonly state: SimulationState;
  readonly pendingInputs: readonly PendingPredictedInput[];
};

export type ClientPrediction = {
  submit(
    sequence: number,
    command: SimulationInputCommand,
  ): LocalPredictionSnapshot;
  reconcile(
    acknowledgedSequence: number,
    authoritativePosition: { readonly x: number; readonly y: number },
  ): LocalPredictionSnapshot;
  snapshot(): LocalPredictionSnapshot;
};

export function makeClientPrediction(
  initialState: SimulationState,
  levelSpec: LevelSpec,
  movementConstants: MovementConstants,
): ClientPrediction {
  let state = initialState;
  let pendingInputs: readonly PendingPredictedInput[] = [];

  function replayPending(fromState: SimulationState): SimulationState {
    return pendingInputs.reduce(
      (replayed, input) =>
        stepSimulation(replayed, input.command, movementConstants, levelSpec),
      fromState,
    );
  }

  function snapshot(): LocalPredictionSnapshot {
    return { state, pendingInputs };
  }

  return {
    submit(sequence, command) {
      const prior = pendingInputs.at(-1);
      if (prior !== undefined && sequence <= prior.sequence) {
        throw new Error(
          "Predicted input sequence must increase monotonically.",
        );
      }
      pendingInputs = [...pendingInputs, { sequence, command }];
      state = stepSimulation(state, command, movementConstants, levelSpec);
      return snapshot();
    },
    reconcile(acknowledgedSequence, authoritativePosition) {
      pendingInputs = pendingInputs.filter(
        (input) => input.sequence > acknowledgedSequence,
      );
      const player = state.players[0];
      const corrected: SimulationState = {
        ...state,
        players: [
          {
            ...player,
            player: {
              ...player.player,
              position: {
                x: requireSimulationPixelPosition(
                  authoritativePosition.x,
                  "authoritativePosition.x",
                ),
                y: requireSimulationPixelPosition(
                  authoritativePosition.y,
                  "authoritativePosition.y",
                ),
              },
            },
          },
          ...state.players.slice(1),
        ],
      };
      state = replayPending(corrected);
      return snapshot();
    },
    snapshot,
  };
}

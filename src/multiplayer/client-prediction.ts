import type { LevelSpec } from "../engine/domain/level-spec";
import type { MovementConstants } from "../engine/simulation/movement-model";
import type { SimulationInputCommand } from "../engine/simulation/input-command";
import type { SimulationState } from "../engine/simulation/simulation-state";
import { stepSimulation } from "../engine/simulation/step-simulation";
import { requireSimulationPixelPosition } from "../engine/simulation/simulation-units";

type PendingPredictedInput = {
  readonly sequence: number;
  readonly command: SimulationInputCommand;
};

type LocalPredictionSnapshot = {
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
  reconcileState(
    acknowledgedSequence: number,
    authoritativeState: SimulationState,
  ): LocalPredictionSnapshot;
  advance(command: SimulationInputCommand): LocalPredictionSnapshot;
  snapshot(): LocalPredictionSnapshot;
};

export function makeClientPrediction(
  initialState: SimulationState,
  levelSpec: LevelSpec,
  movementConstants: MovementConstants,
  localPlayerSlot: number,
): ClientPrediction {
  if (!Number.isInteger(localPlayerSlot) || localPlayerSlot < 0) {
    throw new Error("Client prediction local player slot is invalid.");
  }
  let state = initialState;
  let pendingInputs: readonly PendingPredictedInput[] = [];

  function requireSimulationPlayers(
    players: readonly SimulationState["players"][number][],
  ): SimulationState["players"] {
    const first = players[0];
    if (first === undefined) {
      throw new Error("Predicted simulation state has no players.");
    }
    return [first, ...players.slice(1)];
  }

  function stepLocalPlayer(
    source: SimulationState,
    command: SimulationInputCommand,
  ): SimulationState {
    if (localPlayerSlot === 0) {
      return stepSimulation(source, command, movementConstants, levelSpec);
    }
    const local = source.players[localPlayerSlot];
    if (local === undefined) {
      throw new Error("Predicted local player slot is absent from state.");
    }
    const orderedSlots = [
      localPlayerSlot,
      ...source.players
        .map((_player, slot) => slot)
        .filter((slot) => slot !== localPlayerSlot),
    ];
    const orderedState: SimulationState = {
      ...source,
      players: requireSimulationPlayers(
        orderedSlots.map((slot) => {
          const player = source.players[slot];
          if (player === undefined) {
            throw new Error("Predicted player slot is absent from state.");
          }
          return player;
        }),
      ),
    };
    const stepped = stepSimulation(
      orderedState,
      command,
      movementConstants,
      levelSpec,
      undefined,
      false,
    );
    const restoredPlayers = [...source.players];
    orderedSlots.forEach((slot, orderedSlot) => {
      const player = stepped.players[orderedSlot];
      if (player === undefined) {
        throw new Error("Predicted stepped player slot is absent from state.");
      }
      restoredPlayers[slot] = player;
    });
    return {
      ...stepped,
      players: requireSimulationPlayers(restoredPlayers),
    };
  }

  function replayPending(fromState: SimulationState): SimulationState {
    return pendingInputs.reduce(
      (replayed, input) => stepLocalPlayer(replayed, input.command),
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
      state = stepLocalPlayer(state, command);
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
    reconcileState(acknowledgedSequence, authoritativeState) {
      if (authoritativeState.players[localPlayerSlot] === undefined) {
        throw new Error(
          "Authoritative state is missing the local player slot.",
        );
      }
      pendingInputs = pendingInputs.filter(
        (input) => input.sequence > acknowledgedSequence,
      );
      state = replayPending(authoritativeState);
      return snapshot();
    },
    advance(command) {
      state = stepLocalPlayer(state, command);
      return snapshot();
    },
    snapshot,
  };
}

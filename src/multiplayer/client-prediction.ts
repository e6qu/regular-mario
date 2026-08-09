import type { LevelSpec } from "../engine/domain/level-spec";
import type { MovementConstants } from "../engine/simulation/movement-model";
import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
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
  /**
   * Remember what another player is doing.
   *
   * Held until replaced, because a command is the state of a controller rather
   * than an event: a player holding right is still holding right on the frames
   * between the messages that say so. Without this a client knows only where
   * other players *were* when the last snapshot was cut, and can do no better
   * than replay those positions at the rate they arrive.
   */
  setRemoteCommand(slot: number, command: SimulationInputCommand): void;
  snapshot(): LocalPredictionSnapshot;
};

/**
 * Lifecycle transitions are authoritative even when no input was acknowledged.
 *
 * A defeated player has no input to acknowledge.  Consequently, a server-side
 * revive may keep the acknowledgement number unchanged while changing that
 * player's outcome from `defeated` to `active`.  Continuing to paint the old
 * predicted outcome would make a successful revive look like a level reset or
 * an unresponsive player.  The browser must replace that prediction promptly.
 */
export function predictionRequiresLifecycleReconcile(
  predictedState: SimulationState,
  authoritativeState: SimulationState,
  localPlayerSlot: number,
): boolean {
  const predicted = predictedState.players[localPlayerSlot];
  const authoritative = authoritativeState.players[localPlayerSlot];
  if (predicted === undefined || authoritative === undefined) {
    throw new Error(
      "Prediction lifecycle reconciliation is missing local player.",
    );
  }
  return predicted.outcome.kind !== authoritative.outcome.kind;
}

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

  const neutralCommand: SimulationInputCommand = {
    horizontal: HorizontalInput.Neutral,
    jumpPressed: false,
    runHeld: false,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
  const remoteCommands = new Map<number, SimulationInputCommand>();

  /**
   * Step the whole party: this client's command for its own slot, and the last
   * command each other player was known to be holding for theirs.
   *
   * This used to rotate the local player into slot 0, step, and rotate back — a
   * workaround from when only slot 0 ran the full simulation. Every player runs
   * it now, so the rotation is unnecessary, and it was harmful: the world folds
   * its interactions player-by-player in slot order, so reordering made the
   * client resolve them in a different order from the server.
   */
  function stepPlayers(
    source: SimulationState,
    localCommand: SimulationInputCommand,
  ): SimulationState {
    const commandForSlot = (slot: number): SimulationInputCommand =>
      slot === localPlayerSlot
        ? localCommand
        : (remoteCommands.get(slot) ?? neutralCommand);
    return stepSimulation(
      source,
      commandForSlot(0),
      movementConstants,
      levelSpec,
      source.players
        .slice(1)
        .map((_player, index) => commandForSlot(index + 1)),
      false,
    );
  }

  function replayPending(fromState: SimulationState): SimulationState {
    return pendingInputs.reduce(
      (replayed, input) => stepPlayers(replayed, input.command),
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
      state = stepPlayers(state, command);
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
      state = stepPlayers(state, command);
      return snapshot();
    },
    setRemoteCommand(slot, command) {
      if (slot !== localPlayerSlot) {
        remoteCommands.set(slot, command);
      }
    },
    snapshot,
  };
}

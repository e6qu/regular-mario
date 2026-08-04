import type { SimulationState } from "../engine/simulation/simulation-state";

/** JSON-safe state for the authenticated authoritative render stream. */
export type MultiplayerSimulationWireState = unknown;

const mapTag = "__originalPlatformerMapEntries";

export function encodeMultiplayerSimulationState(
  state: SimulationState,
): MultiplayerSimulationWireState {
  return JSON.parse(
    JSON.stringify(state, (_key, value: unknown) =>
      value instanceof Map ? { [mapTag]: [...value.entries()] } : value,
    ),
  ) as unknown;
}

export function decodeMultiplayerSimulationState(
  value: MultiplayerSimulationWireState,
): SimulationState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Authoritative multiplayer simulation state is invalid.");
  }
  return JSON.parse(JSON.stringify(value), (_key, candidate: unknown) => {
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      !Array.isArray(candidate) &&
      mapTag in candidate
    ) {
      const entries = (candidate as Record<string, unknown>)[mapTag];
      if (!Array.isArray(entries)) {
        throw new Error("Authoritative multiplayer map state is invalid.");
      }
      return new Map(entries);
    }
    return candidate;
  }) as SimulationState;
}

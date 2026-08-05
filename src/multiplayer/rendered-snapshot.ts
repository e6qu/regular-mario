/** Read-only protocol view consumed by the browser multiplayer renderer. */
import type { MultiplayerSimulationWireState } from "./simulation-wire";
type MultiplayerRenderedPlayer = {
  readonly playerId: string;
  readonly nickname: string;
  readonly avatarId: string;
  readonly slot: number;
  readonly spectator: boolean;
  readonly x: number;
  readonly y: number;
  readonly acknowledgedInputSequence: number;
};

export type MultiplayerRenderedSnapshot = {
  readonly gameId: string;
  /** Server-monotonic ordering token; unlike `frame`, it never resets. */
  readonly snapshotSequence: number;
  readonly levelId: string;
  readonly phase: string;
  readonly frame: number;
  readonly cameraLeftPixels: number;
  readonly simulationState: MultiplayerSimulationWireState;
  readonly players: readonly MultiplayerRenderedPlayer[];
};

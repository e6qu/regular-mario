/** Read-only protocol view consumed by the browser multiplayer renderer. */
import type { MultiplayerGamePhase } from "./game-runner";
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
  // The phase, not a string spelling of it. As `string` the browser compared
  // magic literals — `phase === "playing"` — which typecheck against any typo
  // and against phases that no longer exist.
  readonly phase: MultiplayerGamePhase;
  readonly frame: number;
  readonly cameraLeftPixels: number;
  readonly simulationState: MultiplayerSimulationWireState;
  readonly players: readonly MultiplayerRenderedPlayer[];
};

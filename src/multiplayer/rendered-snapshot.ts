/** Read-only protocol view consumed by the browser multiplayer renderer. */
type MultiplayerRenderedPlayer = {
  readonly playerId: string;
  readonly nickname: string;
  readonly avatarId: string;
  readonly spectator: boolean;
  readonly x: number;
  readonly y: number;
  readonly acknowledgedInputSequence: number;
};

export type MultiplayerRenderedSnapshot = {
  readonly gameId: string;
  readonly phase: string;
  readonly frame: number;
  readonly cameraLeftPixels: number;
  readonly players: readonly MultiplayerRenderedPlayer[];
};

import type { PlayerSimulationState } from "./player-state";

export type TileSpan = {
  readonly start: number;
  readonly end: number;
};

export function makePlayerTileColumnSpan(
  player: PlayerSimulationState,
  tileSizePixels: number,
): TileSpan {
  const left = player.position.x;
  const rightExclusive = player.position.x + player.collider.width;

  return {
    start: Math.floor(left / tileSizePixels),
    end: Math.ceil(rightExclusive / tileSizePixels) - 1,
  };
}

export function makePlayerTileRowSpan(
  player: PlayerSimulationState,
  tileSizePixels: number,
): TileSpan {
  const top = player.position.y;
  const bottomExclusive = player.position.y + player.collider.height;

  return {
    start: Math.floor(top / tileSizePixels),
    end: Math.ceil(bottomExclusive / tileSizePixels) - 1,
  };
}

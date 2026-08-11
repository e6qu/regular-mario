import type { PlayerSimulationState } from "./player-state";

/**
 * The active players a world behavior can react to. Non-empty: the primary is
 * always present, co-op players follow in slot order.
 */
export type ActivePlayers = readonly [
  PlayerSimulationState,
  ...PlayerSimulationState[],
];

/**
 * The player whose horizontal centre is closest to a world-pixel x: the one a
 * targeting behavior (chase, aim, hold, spawn-gate) should react to when
 * several players share the level.
 */
export function nearestPlayerToPixelX(
  x: number,
  players: ActivePlayers,
): PlayerSimulationState {
  return players.reduce((nearest, candidate) =>
    Math.abs(candidate.position.x + candidate.collider.width / 2 - x) <
    Math.abs(nearest.position.x + nearest.collider.width / 2 - x)
      ? candidate
      : nearest,
  );
}

/**
 * The party's leading edge: enemy activation, frenzy regions and despawn
 * windows follow the furthest-advanced player, the same way the original's
 * spawning follows the scroll.
 */
export function furthestAdvancedPlayer(
  players: ActivePlayers,
): PlayerSimulationState {
  return players.reduce((leading, candidate) =>
    candidate.position.x + candidate.collider.width >
    leading.position.x + leading.collider.width
      ? candidate
      : leading,
  );
}

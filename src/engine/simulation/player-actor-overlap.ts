import type { PlayerSimulationState } from "./player-state";

export function playerOverlapsActorPixel(
  player: PlayerSimulationState,
  actorPosition: { readonly x: number; readonly y: number },
  actorSizePixels: { readonly width: number; readonly height: number },
): boolean {
  const playerLeft = player.position.x;
  const playerRight = player.position.x + player.collider.width;
  const playerTop = player.position.y;
  const playerBottom = player.position.y + player.collider.height;
  const actorLeft = actorPosition.x;
  const actorRight = actorPosition.x + actorSizePixels.width;
  const actorTop = actorPosition.y;
  const actorBottom = actorPosition.y + actorSizePixels.height;

  return (
    playerLeft < actorRight &&
    playerRight > actorLeft &&
    playerTop < actorBottom &&
    playerBottom > actorTop
  );
}

import type { PlayerSimulationState } from "./player-state";

// The player's object-collision box (its "hurtbox") is smaller than the terrain
// collider, matching the ROM's BoundBoxCtrlData: small Mario is 10×12 and big
// Mario 12×24, both anchored at the feet (the ground-contact bottom of the
// terrain collider) and centred horizontally in it. Object collisions (enemies,
// hazards, items) use this box, while terrain/movement keeps the full collider
// — exactly as the original separates its object bounding box from block
// collision. Because the box is feet-anchored, head-height threats (a hammer or
// flame sailing over small Mario) miss, as in the ROM. Derived from the terrain
// collider height so it tracks the vitality-driven resize without threading
// vitality through every caller.
const bigPlayerColliderHeightPixels = 32;
const smallPlayerHurtWidthPixels = 10;
const smallPlayerHurtHeightPixels = 12;
const bigPlayerHurtWidthPixels = 12;
const bigPlayerHurtHeightPixels = 24;

export type PlayerHurtbox = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

export function playerHurtbox(player: PlayerSimulationState): PlayerHurtbox {
  const isBig = player.collider.height >= bigPlayerColliderHeightPixels;
  const hurtWidth = isBig
    ? bigPlayerHurtWidthPixels
    : smallPlayerHurtWidthPixels;
  const hurtHeight = isBig
    ? bigPlayerHurtHeightPixels
    : smallPlayerHurtHeightPixels;
  const left = player.position.x + (player.collider.width - hurtWidth) / 2;
  const bottom = player.position.y + player.collider.height;
  return {
    left,
    right: left + hurtWidth,
    top: bottom - hurtHeight,
    bottom,
  };
}

export function playerOverlapsActorPixel(
  player: PlayerSimulationState,
  actorPosition: { readonly x: number; readonly y: number },
  actorSizePixels: { readonly width: number; readonly height: number },
): boolean {
  const hurtbox = playerHurtbox(player);
  const actorLeft = actorPosition.x;
  const actorRight = actorPosition.x + actorSizePixels.width;
  const actorTop = actorPosition.y;
  const actorBottom = actorPosition.y + actorSizePixels.height;

  return (
    hurtbox.left < actorRight &&
    hurtbox.right > actorLeft &&
    hurtbox.top < actorBottom &&
    hurtbox.bottom > actorTop
  );
}

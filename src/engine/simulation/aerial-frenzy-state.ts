// Aerial frenzies, ported from Super Mario Bros.: the flying Cheep-cheeps that
// leap in arcs over the bridge levels, and the Bullet Bills that streak in
// from offscreen (ground areas of the later worlds). Both spawn from a small
// slot buffer while the player is inside the level's frenzy region, driven by
// the shared PseudoRandom register so replays reproduce them exactly. Both
// are stompable — a stomp removes the entity and rebounds the player; any
// other contact harms like a hazard.

import type { LevelSpec } from "../domain/level-spec";
import type { EntityId } from "../domain/identifiers";
import type { PlayerSimulationState } from "./player-state";
import type { MovementConstants } from "./movement-model";
import {
  pseudoRandomByteForSlot,
  type PseudoRandomState,
} from "./pseudo-random";

const frenzySlotCount = 3;
const flyingCheepRespawnFrames = 48;
const bulletBillRespawnFrames = 128;
const entityColliderSizePixels = 14;
// Flying cheeps launch from below the playfield in a slow arc.
const flyingCheepGravityPixelsPerSecondSquared = 300;
const flyingCheepMinLaunchSpeed = 280;
const flyingCheepLaunchSpeedSpreadPixels = 80;
const flyingCheepMaxHorizontalSpeed = 40;
// Bullet Bills streak in horizontally at the player's height from ahead.
// The ROM's BulletBillXSpdData ($18) is three times the walker speed ($08),
// so with the 40 px/s patrol pace bullets fly at 120 px/s.
const bulletBillSpeedPixelsPerSecond = 120;
const bulletBillSpawnAheadPixels = 220;
// Spawn cheeps a bit ahead of (or slightly behind) the player.
const flyingCheepSpawnMinAheadPixels = -32;
const flyingCheepSpawnSpreadPixels = 160;
const despawnBehindPixels = 260;

export enum AerialFrenzyKind {
  FlyingCheep = "flying-cheep",
  BulletBill = "bullet-bill",
}

export type AerialFrenzyEntity = {
  readonly entityId: EntityId;
  readonly kind: AerialFrenzyKind;
  readonly position: { readonly x: number; readonly y: number };
  readonly velocity: { readonly x: number; readonly y: number };
};

export type AerialFrenzyState = {
  readonly slots: readonly (AerialFrenzyEntity | null)[];
  readonly respawnTimerFrames: number;
};

export type ResolvedAerialFrenzyState = {
  readonly state: AerialFrenzyState;
  readonly playerContacted: boolean;
  readonly stompedCount: number;
};

export function makeEmptyAerialFrenzyState(): AerialFrenzyState {
  return { slots: [null, null, null], respawnTimerFrames: 0 };
}

export function assertValidAerialFrenzyState(
  candidate: unknown,
): asserts candidate is AerialFrenzyState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Aerial frenzy state must be an object.");
  }
  const state = candidate as { slots?: unknown; respawnTimerFrames?: unknown };
  if (!Array.isArray(state.slots) || state.slots.length !== frenzySlotCount) {
    throw new Error(`Aerial frenzy state must have ${frenzySlotCount} slots.`);
  }
  if (!Number.isFinite(state.respawnTimerFrames)) {
    throw new Error("Aerial frenzy respawn timer must be a number.");
  }
}

function activeFrenzyKind(
  levelSpec: LevelSpec,
  player: PlayerSimulationState,
): AerialFrenzyKind | undefined {
  const playerTileX = Math.floor(player.position.x / levelSpec.tileSizePixels);
  const flyingCheep = levelSpec.flyingCheepFrenzy;
  if (
    flyingCheep !== undefined &&
    playerTileX >= flyingCheep.startTileX &&
    playerTileX <= flyingCheep.endTileX
  ) {
    return AerialFrenzyKind.FlyingCheep;
  }
  const bulletBill = levelSpec.bulletBillFrenzy;
  if (
    bulletBill !== undefined &&
    playerTileX >= bulletBill.startTileX &&
    playerTileX <= bulletBill.endTileX
  ) {
    return AerialFrenzyKind.BulletBill;
  }
  return undefined;
}

function spawnEntity(
  kind: AerialFrenzyKind,
  slotIndex: number,
  registerByte: number,
  levelSpec: LevelSpec,
  player: PlayerSimulationState,
  frameIndex: number,
): AerialFrenzyEntity {
  const entityId =
    `aerial-frenzy-${String(frameIndex)}-${String(slotIndex)}` as EntityId;
  if (kind === AerialFrenzyKind.BulletBill) {
    return {
      entityId,
      kind,
      position: {
        x: player.position.x + bulletBillSpawnAheadPixels,
        y:
          player.position.y + player.collider.height - entityColliderSizePixels,
      },
      velocity: { x: -bulletBillSpeedPixelsPerSecond, y: 0 },
    };
  }
  // Flying cheep: leap from below the playfield near the player, arcing
  // across. Launch offset/speed/side come from the RNG byte.
  const bottomY = levelSpec.heightTiles * levelSpec.tileSizePixels;
  const offset =
    flyingCheepSpawnMinAheadPixels +
    (registerByte & 0x7f) * (flyingCheepSpawnSpreadPixels / 0x7f);
  const launchSpeed =
    flyingCheepMinLaunchSpeed +
    ((registerByte >> 3) & 0x0f) * (flyingCheepLaunchSpeedSpreadPixels / 0x0f);
  const horizontal =
    (((registerByte >> 5) & 0x07) / 7) * 2 * flyingCheepMaxHorizontalSpeed -
    flyingCheepMaxHorizontalSpeed;
  return {
    entityId,
    kind,
    position: { x: player.position.x + offset, y: bottomY },
    velocity: { x: horizontal, y: -launchSpeed },
  };
}

function moveEntity(
  entity: AerialFrenzyEntity,
  frameDurationSeconds: number,
): AerialFrenzyEntity {
  const gravity =
    entity.kind === AerialFrenzyKind.FlyingCheep
      ? flyingCheepGravityPixelsPerSecondSquared
      : 0;
  const nextVelocityY = entity.velocity.y + gravity * frameDurationSeconds;
  return {
    ...entity,
    position: {
      x: entity.position.x + entity.velocity.x * frameDurationSeconds,
      y: entity.position.y + nextVelocityY * frameDurationSeconds,
    },
    velocity: { x: entity.velocity.x, y: nextVelocityY },
  };
}

function entityOverlapsPlayer(
  entity: AerialFrenzyEntity,
  player: PlayerSimulationState,
): boolean {
  return (
    entity.position.x < player.position.x + player.collider.width &&
    entity.position.x + entityColliderSizePixels > player.position.x &&
    entity.position.y < player.position.y + player.collider.height &&
    entity.position.y + entityColliderSizePixels > player.position.y
  );
}

// A stomp follows the enemy rule: the player is falling and their feet cross
// the entity's top within the forgiveness band while overlapping it.
function isEntityStomp(
  previousPlayer: PlayerSimulationState,
  player: PlayerSimulationState,
  entity: AerialFrenzyEntity,
  movementConstants: MovementConstants,
): boolean {
  const entityTop = entity.position.y;
  const previousBottom =
    previousPlayer.position.y + previousPlayer.collider.height;
  const bottom = player.position.y + player.collider.height;
  return (
    player.velocity.y > 0 &&
    previousBottom <=
      entityTop + movementConstants.enemyStompForgivenessPixels &&
    bottom >= entityTop &&
    entityOverlapsPlayer(entity, player)
  );
}

export function resolveAerialFrenzyState(
  previousState: AerialFrenzyState,
  levelSpec: LevelSpec,
  previousPlayer: PlayerSimulationState,
  player: PlayerSimulationState,
  pseudoRandom: PseudoRandomState,
  movementConstants: MovementConstants,
  frameDurationSeconds: number,
  frameIndex: number,
): ResolvedAerialFrenzyState {
  if (
    levelSpec.flyingCheepFrenzy === undefined &&
    levelSpec.bulletBillFrenzy === undefined
  ) {
    return { state: previousState, playerContacted: false, stompedCount: 0 };
  }

  const activeKind = activeFrenzyKind(levelSpec, player);
  const bottomCull =
    levelSpec.heightTiles * levelSpec.tileSizePixels +
    3 * levelSpec.tileSizePixels;

  const movedSlots = previousState.slots.map((entity) => {
    if (entity === null) {
      return null;
    }
    const moved = moveEntity(entity, frameDurationSeconds);
    const behind = moved.position.x < player.position.x - despawnBehindPixels;
    const ahead =
      moved.position.x > player.position.x + 2 * despawnBehindPixels;
    const below = moved.position.y > bottomCull;
    return behind || ahead || below ? null : moved;
  });

  let respawnTimerFrames = Math.max(0, previousState.respawnTimerFrames - 1);
  const slots = [...movedSlots];

  if (activeKind !== undefined && respawnTimerFrames <= 0) {
    const freeSlot = slots.findIndex((slot) => slot === null);
    if (freeSlot !== -1) {
      const registerByte = pseudoRandomByteForSlot(pseudoRandom, freeSlot);
      slots[freeSlot] = spawnEntity(
        activeKind,
        freeSlot,
        registerByte,
        levelSpec,
        player,
        frameIndex,
      );
      respawnTimerFrames =
        activeKind === AerialFrenzyKind.BulletBill
          ? bulletBillRespawnFrames
          : flyingCheepRespawnFrames;
    }
  }

  // Stomps first (they remove the entity), then harmful contact.
  let stompedCount = 0;
  for (const [index, entity] of slots.entries()) {
    if (
      entity !== null &&
      isEntityStomp(previousPlayer, player, entity, movementConstants)
    ) {
      slots[index] = null;
      stompedCount += 1;
    }
  }

  const playerContacted = slots.some(
    (entity) => entity !== null && entityOverlapsPlayer(entity, player),
  );

  return {
    state: { slots, respawnTimerFrames },
    playerContacted,
    stompedCount,
  };
}

export function liveAerialFrenzyEntities(
  state: AerialFrenzyState,
): readonly AerialFrenzyEntity[] {
  return state.slots.filter(
    (entity): entity is AerialFrenzyEntity => entity !== null,
  );
}

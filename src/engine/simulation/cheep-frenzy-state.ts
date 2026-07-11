// The underwater swimming Cheep-cheep frenzy, ported from Super Mario Bros. While
// the player is inside the level's frenzy region, cheeps spawn once every 32
// frames into a 3-slot buffer, entering ahead of the player and drifting left;
// one slot bobs vertically. Spawn Y is one of 8 fixed bands chosen from the
// shared PseudoRandom register (de-duplicated), and the colour is RNG-picked.
// Everything here is deterministic (a pure function of state + the RNG), so
// replays reproduce the shoal exactly. The one intentional deviation from the
// ROM: cheeps enter at a fixed offset ahead of the player rather than off the
// true screen edge, because the pure sim has no camera — Mario stays roughly
// centred, so it reads the same and keeps replays deterministic.

import type { LevelSpec } from "../domain/level-spec";
import type { EntityId } from "../domain/identifiers";
import type { PlayerSimulationState } from "./player-state";
import {
  pseudoRandomByteForSlot,
  type PseudoRandomState,
} from "./pseudo-random";

// ROM constants (see docs / the frenzy reverse-engineering).
const frenzySlotCount = 3; // cheeps only fill enemy slots 0..2
const frenzyRespawnFrames = 32; // FrenzyEnemyTimer reset value ($20)
// Enemy17YPosData ($c698) + the universal +8 applied at spawn.
const spawnYBands = [0x40, 0x30, 0x90, 0x50, 0x20, 0x60, 0xa0, 0x70].map(
  (band) => band + 8,
);
const cheepColliderSizePixels = 16;
// SwimCCXMoveData: grey $0a drifts $40/256 px/frame, red $0b drifts $80/256 —
// i.e. 0.25 and 0.5 px/frame left, which at 60 fps is 15 and 30 px/s.
const greyDriftPixelsPerSecond = 15;
const redDriftPixelsPerSecond = 30;
// The slot-2 bob: YMF carry $20/256 px/frame (~7.5 px/s), reversing at ±15 px.
const bobPixelsPerSecond = 7.5;
const bobAmplitudePixels = 15;
// Deviation from the ROM's screen-edge spawn (see file header): enter this far
// ahead of the player, and despawn once this far behind.
const spawnAheadPixels = 176;
const despawnBehindPixels = 200;

enum CheepColor {
  Grey = "grey",
  Red = "red",
}

export type FrenzyCheep = {
  readonly entityId: EntityId;
  readonly position: { readonly x: number; readonly y: number };
  readonly color: CheepColor;
  readonly originY: number;
  readonly bobbingDown: boolean;
  // True only for the one slot that bobs vertically (slot index >= 2).
  readonly bobs: boolean;
};

export type CheepFrenzyState = {
  // Fixed 3-slot buffer; a null slot is free to spawn into.
  readonly slots: readonly (FrenzyCheep | null)[];
  readonly respawnTimerFrames: number;
  // Bitfield of the 8 Y-bands already handed out (SMB's BitMFilter).
  readonly usedYBands: number;
};

export type ResolvedCheepFrenzyState = {
  readonly state: CheepFrenzyState;
  // True the frame the player's box overlaps a live cheep (harmful contact).
  readonly playerContacted: boolean;
};

export function makeEmptyCheepFrenzyState(): CheepFrenzyState {
  return {
    slots: [null, null, null],
    respawnTimerFrames: 0,
    usedYBands: 0,
  };
}

function assertValidCheepFrenzyState(
  candidate: unknown,
): asserts candidate is CheepFrenzyState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Cheep frenzy state must be an object.");
  }
  const state = candidate as {
    slots?: unknown;
    respawnTimerFrames?: unknown;
    usedYBands?: unknown;
  };
  if (!Array.isArray(state.slots) || state.slots.length !== frenzySlotCount) {
    throw new Error(`Cheep frenzy state must have ${frenzySlotCount} slots.`);
  }
  if (
    !Number.isFinite(state.respawnTimerFrames) ||
    !Number.isInteger(state.usedYBands)
  ) {
    throw new Error("Cheep frenzy timer/bitfield must be numbers.");
  }
}

function frenzyIsActive(
  levelSpec: LevelSpec,
  player: PlayerSimulationState,
): boolean {
  const region = levelSpec.cheepFrenzy;
  if (region === undefined) {
    return false;
  }
  const playerTileX = Math.floor(player.position.x / levelSpec.tileSizePixels);
  return playerTileX >= region.startTileX && playerTileX <= region.endTileX;
}

// Pick the next free Y-band, skipping ones already used, and mark it. Resets the
// filter once all 8 are consumed — SMB's GetRBit/AddFBit dedup.
function takeYBand(
  registerByte: number,
  usedYBands: number,
): { readonly band: number; readonly usedYBands: number } {
  let filter = usedYBands === 0xff ? 0 : usedYBands;
  let offset = registerByte & 0b111;
  for (let step = 0; step < 8 && (filter & (1 << offset)) !== 0; step += 1) {
    offset = (offset + 1) & 0b111;
  }
  filter |= 1 << offset;
  if (filter === 0xff) {
    filter = 0;
  }
  return { band: spawnYBands[offset]!, usedYBands: filter };
}

function spawnCheep(
  slotIndex: number,
  registerByte: number,
  player: PlayerSimulationState,
  yBand: number,
  frameIndex: number,
): FrenzyCheep {
  // Colour: grey unless the register byte is high (SMB's >= $aa test).
  const color = registerByte >= 0xaa ? CheepColor.Red : CheepColor.Grey;
  return {
    entityId: `cheep-frenzy-${frameIndex}-${slotIndex}` as EntityId,
    position: { x: player.position.x + spawnAheadPixels, y: yBand },
    color,
    originY: yBand,
    // The initial bob direction comes from bit 4 of the register byte.
    bobbingDown: (registerByte & 0b10000) !== 0,
    bobs: slotIndex >= 2,
  };
}

function moveCheep(
  cheep: FrenzyCheep,
  frameDurationSeconds: number,
): FrenzyCheep {
  const driftPerSecond =
    cheep.color === CheepColor.Red
      ? redDriftPixelsPerSecond
      : greyDriftPixelsPerSecond;
  const nextX = cheep.position.x - driftPerSecond * frameDurationSeconds;

  if (!cheep.bobs) {
    return { ...cheep, position: { x: nextX, y: cheep.position.y } };
  }

  const bobStep =
    (cheep.bobbingDown ? 1 : -1) * bobPixelsPerSecond * frameDurationSeconds;
  const nextY = cheep.position.y + bobStep;
  // Reverse once the fish has drifted the full amplitude from its spawn band.
  const bobbingDown =
    Math.abs(nextY - cheep.originY) >= bobAmplitudePixels
      ? !cheep.bobbingDown
      : cheep.bobbingDown;
  return { ...cheep, position: { x: nextX, y: nextY }, bobbingDown };
}

function cheepOverlapsPlayer(
  cheep: FrenzyCheep,
  player: PlayerSimulationState,
): boolean {
  return (
    cheep.position.x < player.position.x + player.collider.width &&
    cheep.position.x + cheepColliderSizePixels > player.position.x &&
    cheep.position.y < player.position.y + player.collider.height &&
    cheep.position.y + cheepColliderSizePixels > player.position.y
  );
}

export function resolveCheepFrenzyState(
  previousState: CheepFrenzyState,
  levelSpec: LevelSpec,
  player: PlayerSimulationState,
  pseudoRandom: PseudoRandomState,
  frameDurationSeconds: number,
  frameIndex: number,
): ResolvedCheepFrenzyState {
  assertValidCheepFrenzyState(previousState);
  const active = frenzyIsActive(levelSpec, player);

  // Move + cull existing cheeps (they persist even after leaving the region).
  const despawnBefore = player.position.x - despawnBehindPixels;
  const movedSlots = previousState.slots.map((cheep) => {
    if (cheep === null) {
      return null;
    }
    const moved = moveCheep(cheep, frameDurationSeconds);
    return moved.position.x < despawnBefore ? null : moved;
  });

  let respawnTimerFrames = Math.max(0, previousState.respawnTimerFrames - 1);
  let usedYBands = previousState.usedYBands;
  const slots = [...movedSlots];

  if (active && respawnTimerFrames <= 0) {
    const freeSlot = slots.findIndex((slot) => slot === null);
    if (freeSlot !== -1) {
      const registerByte = pseudoRandomByteForSlot(pseudoRandom, freeSlot);
      const band = takeYBand(registerByte, usedYBands);
      usedYBands = band.usedYBands;
      slots[freeSlot] = spawnCheep(
        freeSlot,
        registerByte,
        player,
        band.band,
        frameIndex,
      );
      respawnTimerFrames = frenzyRespawnFrames;
    }
  }

  const playerContacted = slots.some(
    (cheep) => cheep !== null && cheepOverlapsPlayer(cheep, player),
  );

  return {
    state: { slots, respawnTimerFrames, usedYBands },
    playerContacted,
  };
}

export function liveFrenzyCheeps(
  state: CheepFrenzyState,
): readonly FrenzyCheep[] {
  return state.slots.filter((cheep): cheep is FrenzyCheep => cheep !== null);
}

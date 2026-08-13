import { VerticalMovementState } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import {
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "./simulation-units";

// Players are solid to each other: they can't walk through one another, they can
// stand/walk on each other's heads, and a stack rides the player beneath it (the
// bottom player carries everyone above along its horizontal movement). This
// resolves those interactions uniformly across all players after they have each
// moved for the frame — no player is special.

/**
 * Re-resolve a pushed player against the level's solid tiles.
 *
 * A separation push is a positional shove outside the movement integration, so
 * without this a player squeezed against a wall is pushed straight into it and
 * ends the frame embedded in terrain — the same defect the moving-platform
 * carry had to fix. Callers with no world (unit tests, empty levels) may omit
 * it and get the raw push.
 */
export type TerrainSettle = (
  before: PlayerSimulationState,
  after: PlayerSimulationState,
) => PlayerSimulationState;

const settleNowhere: TerrainSettle = (_before, after) => after;

type Box = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

function boxOf(player: PlayerSimulationState): Box {
  const left = Number(player.position.x);
  const top = Number(player.position.y);
  return {
    left,
    top,
    right: left + Number(player.collider.width),
    bottom: top + Number(player.collider.height),
  };
}

// A rider stands on a carrier when its feet meet the carrier's head (within a
// small tolerance) and they overlap horizontally.
const restContactTolerancePixels = 3;
function standsOn(
  rider: PlayerSimulationState,
  carrier: PlayerSimulationState,
): boolean {
  const r = boxOf(rider);
  const c = boxOf(carrier);
  return (
    Math.abs(r.bottom - c.top) <= restContactTolerancePixels &&
    r.right > c.left &&
    r.left < c.right
  );
}

// How much two boxes share horizontally: picks which body a rider straddling
// two others is actually riding.
function horizontalOverlap(a: Box, b: Box): number {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left);
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

type MutablePlayer = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  readonly source: PlayerSimulationState;
};

function toMutable(player: PlayerSimulationState): MutablePlayer {
  return {
    x: Number(player.position.x),
    y: Number(player.position.y),
    vx: Number(player.velocity.x),
    vy: Number(player.velocity.y),
    grounded: player.movement.vertical === VerticalMovementState.Grounded,
    source: player,
  };
}

function width(player: MutablePlayer): number {
  return Number(player.source.collider.width);
}
function height(player: MutablePlayer): number {
  return Number(player.source.collider.height);
}
function mutableBox(player: MutablePlayer): Box {
  return {
    left: player.x,
    top: player.y,
    right: player.x + width(player),
    bottom: player.y + height(player),
  };
}

function snapshotAt(
  player: MutablePlayer,
  x: number,
  y: number,
): PlayerSimulationState {
  return {
    ...player.source,
    position: {
      x: requireSimulationPixelPosition(x, "player.position.x"),
      y: requireSimulationPixelPosition(y, "player.position.y"),
    },
  };
}

/**
 * Move a player by a shove, stopping where the terrain stops them.
 *
 * The world's left edge is a wall in these games, so a shove never carries
 * anybody to a negative coordinate — off the map is not a place to stand.
 */
function applyShove(
  player: MutablePlayer,
  deltaX: number,
  deltaY: number,
  settle: TerrainSettle,
): void {
  if (deltaX === 0 && deltaY === 0) {
    return;
  }
  const before = snapshotAt(player, player.x, player.y);
  const after = snapshotAt(
    player,
    Math.max(0, player.x + deltaX),
    player.y + deltaY,
  );
  const settled = settle(before, after);
  player.x = Number(settled.position.x);
  player.y = Number(settled.position.y);
}

function toPlayer(player: MutablePlayer): PlayerSimulationState {
  return {
    ...player.source,
    position: {
      x: requireSimulationPixelPosition(player.x, "player.position.x"),
      y: requireSimulationPixelPosition(player.y, "player.position.y"),
    },
    velocity: {
      x: requireSimulationVelocity(player.vx, "player.velocity.x"),
      y: requireSimulationVelocity(player.vy, "player.velocity.y"),
    },
    movement: {
      horizontal: player.source.movement.horizontal,
      vertical: player.grounded
        ? VerticalMovementState.Grounded
        : player.source.movement.vertical,
    },
  };
}

// Feet that were at or above a head last frame are landing on it this frame.
const landingTolerancePixels = 2;
function wasAbove(
  upper: PlayerSimulationState,
  lower: PlayerSimulationState,
): boolean {
  return boxOf(upper).bottom <= boxOf(lower).top + landingTolerancePixels;
}

/** Per-player corrections accumulated over one relaxation pass. */
type PassCorrections = {
  readonly deltaX: number[];
  readonly deltaY: number[];
  readonly stopRightward: boolean[];
  readonly stopLeftward: boolean[];
  readonly landed: boolean[];
};

function makeCorrections(count: number): PassCorrections {
  return {
    deltaX: Array.from({ length: count }, () => 0),
    deltaY: Array.from({ length: count }, () => 0),
    stopRightward: Array.from({ length: count }, () => false),
    stopLeftward: Array.from({ length: count }, () => false),
    landed: Array.from({ length: count }, () => false),
  };
}

/**
 * Decide how one overlapping pair separates, recording the correction rather
 * than applying it: a pass collects every pair's answer and then moves each
 * player once, so the terrain is consulted per player instead of per pair.
 */
function collectPairSeparation(
  resolved: readonly MutablePlayer[],
  previousPlayers: readonly PlayerSimulationState[],
  indexA: number,
  indexB: number,
  corrections: PassCorrections,
): void {
  const a = resolved[indexA]!;
  const b = resolved[indexB]!;
  const boxA = mutableBox(a);
  const boxB = mutableBox(b);
  const overlapX = Math.min(boxA.right - boxB.left, boxB.right - boxA.left);
  const overlapY = Math.min(boxA.bottom - boxB.top, boxB.bottom - boxA.top);
  if (overlapX <= 0 || overlapY <= 0) {
    return;
  }

  // A player who was above the other last frame and is not rising is landing
  // on their head — resolve vertically however deep the overlap has become.
  // The shallower-axis rule alone squirted a fast faller out sideways, which
  // made jumping onto a friend unreliable at exactly the speeds people jump.
  const previousA = previousPlayers[indexA];
  const previousB = previousPlayers[indexB];
  const aLandsOnB =
    previousA !== undefined &&
    previousB !== undefined &&
    wasAbove(previousA, previousB) &&
    a.vy >= 0;
  const bLandsOnA =
    previousA !== undefined &&
    previousB !== undefined &&
    wasAbove(previousB, previousA) &&
    b.vy >= 0;

  if (aLandsOnB || bLandsOnA || overlapY <= overlapX) {
    const upperIndex = aLandsOnB
      ? indexA
      : bLandsOnA
        ? indexB
        : a.y < b.y
          ? indexA
          : indexB;
    const lowerIndex = upperIndex === indexA ? indexB : indexA;
    const upper = resolved[upperIndex]!;
    const lower = resolved[lowerIndex]!;
    // Rest the upper player's feet exactly on the lower player's head. Several
    // carriers keep the highest rest (the most negative correction).
    const correction = lower.y - height(upper) - upper.y;
    corrections.deltaY[upperIndex] = Math.min(
      corrections.deltaY[upperIndex] ?? 0,
      correction,
    );
    corrections.landed[upperIndex] = true;
    return;
  }

  const leftIndex = a.x <= b.x ? indexA : indexB;
  const rightIndex = leftIndex === indexA ? indexB : indexA;
  const left = resolved[leftIndex]!;
  const right = resolved[rightIndex]!;
  const leftPushes = left.vx > 0;
  const rightPushes = right.vx < 0;

  // Walking into somebody shoves them along; it does not stop you dead.
  //
  // Splitting the overlap and cancelling both players' speed made an idle
  // team-mate an impassable wall: the runner lost their velocity every frame
  // and crawled at a fraction of a pixel, unable to get past a friend who was
  // simply standing there. A single pusher now hands their whole overlap to
  // the player in front, who is carried at the pusher's pace. Only a genuine
  // squeeze — both running into each other, or the pushed player against
  // terrain — costs anybody their speed.
  if (leftPushes !== rightPushes) {
    const pushedIndex = leftPushes ? rightIndex : leftIndex;
    const displacement = leftPushes ? overlapX : 0 - overlapX;
    corrections.deltaX[pushedIndex] =
      (corrections.deltaX[pushedIndex] ?? 0) + displacement;
    return;
  }

  const push = overlapX / 2;
  corrections.deltaX[leftIndex] = (corrections.deltaX[leftIndex] ?? 0) - push;
  corrections.deltaX[rightIndex] = (corrections.deltaX[rightIndex] ?? 0) + push;
  // Only a player moving INTO the other loses their speed. Zeroing both used
  // to stop the player in front too, so a pair walking the same way both
  // halted the moment the one behind caught up.
  corrections.stopRightward[leftIndex] = true;
  corrections.stopLeftward[rightIndex] = true;
}

const separationTolerancePixels = 0.001;

/**
 * Finish separating one pair, giving whatever the terrain refuses to let one
 * player take to the other.
 *
 * The even split alone cannot separate a pair squeezed against a wall: the
 * blocked player keeps their half of the overlap and the relaxation only ever
 * halves what is left. This runs after the passes, for the pairs that are
 * still overlapping — normally none.
 */
function separateBlockedPair(
  a: MutablePlayer,
  b: MutablePlayer,
  settle: TerrainSettle,
): void {
  const boxA = mutableBox(a);
  const boxB = mutableBox(b);
  const overlapX = Math.min(boxA.right - boxB.left, boxB.right - boxA.left);
  const overlapY = Math.min(boxA.bottom - boxB.top, boxB.bottom - boxA.top);
  if (overlapX <= 0 || overlapY <= 0) {
    return;
  }
  if (overlapY <= overlapX) {
    const upper = a.y < b.y ? a : b;
    const lower = upper === a ? b : a;
    applyShove(upper, 0, lower.y - height(upper) - upper.y, settle);
    if (upper.vy > 0) {
      upper.vy = 0;
    }
    upper.grounded = true;
    return;
  }
  const left = a.x <= b.x ? a : b;
  const right = left === a ? b : a;
  const leftPushes = left.vx > 0;
  const rightPushes = right.vx < 0;

  // A single pusher shoves the other player the whole way; whatever terrain
  // refuses to let the pushed player take comes off the pusher instead, and
  // only then does the pusher lose their speed — they have hit a wall through
  // somebody else's body.
  if (leftPushes !== rightPushes) {
    const pusher = leftPushes ? left : right;
    const pushed = leftPushes ? right : left;
    const direction = leftPushes ? 1 : -1;
    const pushedStartX = pushed.x;
    applyShove(pushed, direction * overlapX, 0, settle);
    const remaining = overlapX - Math.abs(pushed.x - pushedStartX);
    if (remaining > separationTolerancePixels) {
      applyShove(pusher, 0 - direction * remaining, 0, settle);
      pusher.vx = 0;
    }
    return;
  }

  const leftStartX = left.x;
  applyShove(left, 0 - overlapX / 2, 0, settle);
  const remainingAfterLeft = overlapX - (leftStartX - left.x);
  if (remainingAfterLeft <= separationTolerancePixels) {
    return;
  }
  const rightStartX = right.x;
  applyShove(right, remainingAfterLeft, 0, settle);
  const remainingAfterRight = remainingAfterLeft - (right.x - rightStartX);
  if (remainingAfterRight > separationTolerancePixels) {
    // The right player is against terrain too: hand the rest back to the left
    // one. If both are walled in, the squeeze is genuine and they overlap.
    applyShove(left, 0 - remainingAfterRight, 0, settle);
  }
}

export function resolvePlayerCollisions(
  players: readonly PlayerSimulationState[],
  previousPlayers: readonly PlayerSimulationState[],
  settle: TerrainSettle = settleNowhere,
): readonly PlayerSimulationState[] {
  if (players.length < 2) {
    return players;
  }
  const resolved = players.map(toMutable);

  // 1) Stack carry: a player that was standing on another last frame inherits
  //    that carrier's horizontal movement this frame, so a stack rides its
  //    bottom player instead of being slid out from under.
  //
  //    Carriers move before their riders — order by how low each body stood
  //    last frame — so a three-high stack carries all the way up in one pass
  //    instead of depending on slot order. Each rider takes exactly one
  //    carrier (the one it shares the most ground with); riding two at once
  //    used to add both their movements and fling the rider.
  const carryOrder = players
    .map((_player, index) => index)
    .filter((index) => previousPlayers[index] !== undefined)
    .sort(
      (left, right) =>
        boxOf(previousPlayers[right]!).bottom -
        boxOf(previousPlayers[left]!).bottom,
    );
  for (const rider of carryOrder) {
    let carrier: number | undefined;
    let bestOverlap = 0;
    for (let candidate = 0; candidate < resolved.length; candidate += 1) {
      const previousCarrier = previousPlayers[candidate];
      if (
        candidate === rider ||
        previousCarrier === undefined ||
        !standsOn(previousPlayers[rider]!, previousCarrier)
      ) {
        continue;
      }
      const shared = horizontalOverlap(
        boxOf(previousPlayers[rider]!),
        boxOf(previousCarrier),
      );
      if (carrier === undefined || shared > bestOverlap) {
        carrier = candidate;
        bestOverlap = shared;
      }
    }
    if (carrier === undefined) {
      continue;
    }
    const carrierDeltaX =
      resolved[carrier]!.x - Number(previousPlayers[carrier]!.position.x);
    applyShove(resolved[rider]!, carrierDeltaX, 0, settle);
  }

  // 2) Separate every overlapping pair. Each pass collects the pairs' answers
  //    and then moves each player once — a couple of passes settle short
  //    stacks, and the terrain is consulted per player rather than per pair.
  for (let pass = 0; pass < 3; pass += 1) {
    const corrections = makeCorrections(resolved.length);
    let overlapping = false;
    for (let i = 0; i < resolved.length; i += 1) {
      for (let j = i + 1; j < resolved.length; j += 1) {
        if (overlaps(mutableBox(resolved[i]!), mutableBox(resolved[j]!))) {
          overlapping = true;
          collectPairSeparation(resolved, previousPlayers, i, j, corrections);
        }
      }
    }
    if (!overlapping) {
      break;
    }
    for (let index = 0; index < resolved.length; index += 1) {
      const player = resolved[index]!;
      applyShove(
        player,
        corrections.deltaX[index] ?? 0,
        corrections.deltaY[index] ?? 0,
        settle,
      );
      if (corrections.landed[index] === true) {
        if (player.vy > 0) {
          player.vy = 0;
        }
        player.grounded = true;
      }
      if (corrections.stopRightward[index] === true && player.vx > 0) {
        player.vx = 0;
      }
      if (corrections.stopLeftward[index] === true && player.vx < 0) {
        player.vx = 0;
      }
    }
  }

  // 3) Anyone still overlapping is squeezed against terrain that refused their
  //    half of the push. Hand the rest to whoever can still take it.
  for (let i = 0; i < resolved.length; i += 1) {
    for (let j = i + 1; j < resolved.length; j += 1) {
      if (overlaps(mutableBox(resolved[i]!), mutableBox(resolved[j]!))) {
        separateBlockedPair(resolved[i]!, resolved[j]!, settle);
      }
    }
  }

  return resolved.map(toPlayer);
}

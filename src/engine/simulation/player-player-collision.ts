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

// Push two overlapping players apart along their shallower axis: side-by-side
// (horizontal) blocks walking through; the upper one resting on the lower
// (vertical) stands on its head.
function separate(a: MutablePlayer, b: MutablePlayer): void {
  const boxA = mutableBox(a);
  const boxB = mutableBox(b);
  const overlapX = Math.min(boxA.right - boxB.left, boxB.right - boxA.left);
  const overlapY = Math.min(boxA.bottom - boxB.top, boxB.bottom - boxA.top);
  if (overlapX <= 0 || overlapY <= 0) {
    return;
  }
  if (overlapX < overlapY) {
    const push = overlapX / 2;
    if (a.x < b.x) {
      a.x -= push;
      b.x += push;
    } else {
      a.x += push;
      b.x -= push;
    }
    a.vx = 0;
    b.vx = 0;
  } else {
    const upper = a.y < b.y ? a : b;
    const lower = a.y < b.y ? b : a;
    // Rest the upper player's feet exactly on the lower player's head.
    upper.y = lower.y - height(upper);
    if (upper.vy > 0) {
      upper.vy = 0;
    }
    upper.grounded = true;
  }
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

export function resolvePlayerCollisions(
  players: readonly PlayerSimulationState[],
  previousPlayers: readonly PlayerSimulationState[],
): readonly PlayerSimulationState[] {
  if (players.length < 2) {
    return players;
  }
  const resolved = players.map(toMutable);

  // 1) Stack carry: a player that was standing on another last frame inherits
  //    that carrier's horizontal movement this frame, so a stack rides its
  //    bottom player instead of being slid out from under.
  for (let rider = 0; rider < resolved.length; rider += 1) {
    for (let carrier = 0; carrier < resolved.length; carrier += 1) {
      if (
        rider !== carrier &&
        previousPlayers[rider] !== undefined &&
        previousPlayers[carrier] !== undefined &&
        standsOn(previousPlayers[rider]!, previousPlayers[carrier]!)
      ) {
        const carrierDeltaX =
          resolved[carrier]!.x - Number(previousPlayers[carrier]!.position.x);
        resolved[rider]!.x += carrierDeltaX;
      }
    }
  }

  // 2) Separate every overlapping pair (a couple of passes settle short stacks).
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < resolved.length; i += 1) {
      for (let j = i + 1; j < resolved.length; j += 1) {
        if (overlaps(mutableBox(resolved[i]!), mutableBox(resolved[j]!))) {
          separate(resolved[i]!, resolved[j]!);
        }
      }
    }
  }

  return resolved.map(toPlayer);
}

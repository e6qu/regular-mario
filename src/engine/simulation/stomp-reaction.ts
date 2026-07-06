// A short-lived reaction burst emitted when the player stomps an enemy. The
// simulation tracks only the countdown and the location; a skin decides how to
// draw it (for example a parody set drawing bulging eyes and a pained face on
// the squashed enemy). Projectile kills are excluded — those are shot, not
// stomped.

export type StompReactionState = {
  readonly active: boolean;
  readonly remainingFrames: number;
  readonly x: number;
  readonly y: number;
};

export const stompReactionFrames = 18;

export function makeEmptyStompReactionState(): StompReactionState {
  return { active: false, remainingFrames: 0, x: 0, y: 0 };
}

export function assertValidStompReactionState(state: StompReactionState): void {
  if (typeof state.active !== "boolean") {
    throw new Error("Stomp reaction active must be a boolean.");
  }

  if (!Number.isInteger(state.remainingFrames) || state.remainingFrames < 0) {
    throw new Error(
      `Stomp reaction remainingFrames must be a non-negative integer; got ${String(state.remainingFrames)}.`,
    );
  }

  if (!state.active && state.remainingFrames !== 0) {
    throw new Error("Inactive stomp reaction must have zero remaining frames.");
  }

  if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) {
    throw new Error("Stomp reaction position must be finite.");
  }
}

// A fresh stomp starts the burst at the given location; otherwise the burst
// ticks down and clears at zero.
export function resolveStompReactionState(
  previous: StompReactionState,
  input: {
    readonly stomped: boolean;
    readonly x: number;
    readonly y: number;
  },
): StompReactionState {
  if (input.stomped) {
    return {
      active: true,
      remainingFrames: stompReactionFrames,
      x: input.x,
      y: input.y,
    };
  }

  if (previous.remainingFrames <= 1) {
    return makeEmptyStompReactionState();
  }

  return {
    active: previous.active,
    remainingFrames: previous.remainingFrames - 1,
    x: previous.x,
    y: previous.y,
  };
}

// Player reaction state drives expressive, asset-set-specific feedback (for
// example a "shabby castaway" parody skin showing an "ouch" head-hold when the
// player bonks a block with their head). The simulation only tracks the reaction
// kind and a countdown; how it is drawn or sounded is a rendering/audio concern.

export enum PlayerReactionKind {
  None = "none",
  HeadBonk = "head-bonk",
}

export type PlayerReactionState = {
  readonly kind: PlayerReactionKind;
  readonly remainingFrames: number;
};

export const headBonkReactionFrames = 24;

export function makeEmptyPlayerReactionState(): PlayerReactionState {
  return { kind: PlayerReactionKind.None, remainingFrames: 0 };
}

// Accepts unknown so the guard still holds for state parsed from untrusted
// input, where kind may not be one of the enum values despite the declared type.
function isKnownReactionKind(kind: unknown): boolean {
  return (
    kind === PlayerReactionKind.None || kind === PlayerReactionKind.HeadBonk
  );
}

export function assertValidPlayerReactionState(
  state: PlayerReactionState,
): void {
  if (!isKnownReactionKind(state.kind)) {
    throw new Error(`Invalid player reaction kind: ${String(state.kind)}.`);
  }

  if (!Number.isInteger(state.remainingFrames) || state.remainingFrames < 0) {
    throw new Error(
      `Player reaction remainingFrames must be a non-negative integer; got ${String(state.remainingFrames)}.`,
    );
  }

  if (state.kind === PlayerReactionKind.None && state.remainingFrames !== 0) {
    throw new Error(
      "Player reaction with no active kind must have zero remaining frames.",
    );
  }
}

// A fresh head bonk (this frame) starts or refreshes the reaction countdown;
// otherwise the countdown ticks down and clears back to None at zero.
export function resolvePlayerReactionState(
  previous: PlayerReactionState,
  input: { readonly headBonked: boolean },
): PlayerReactionState {
  if (input.headBonked) {
    return {
      kind: PlayerReactionKind.HeadBonk,
      remainingFrames: headBonkReactionFrames,
    };
  }

  if (previous.remainingFrames <= 1) {
    return makeEmptyPlayerReactionState();
  }

  return {
    kind: previous.kind,
    remainingFrames: previous.remainingFrames - 1,
  };
}

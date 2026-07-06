import type {
  LevelSpec,
  LevelTimerDefinition,
  LevelTimerFrameCount,
} from "../domain/level-spec";

export const runtimeLevelTimerId = "level-timer.frames";

export type LevelTimerState = {
  readonly remainingFrames: LevelTimerFrameCount | undefined;
};

export function makeInitialLevelTimerState(
  levelSpec: LevelSpec,
): LevelTimerState {
  const timerDefinition = findRuntimeLevelTimer(levelSpec.levelTimers);

  return {
    remainingFrames: timerDefinition?.frames,
  };
}

export function assertValidLevelTimerState(
  state: unknown,
): asserts state is LevelTimerState {
  if (typeof state !== "object" || state === null) {
    throw new Error("Level timer state must be an object.");
  }

  const candidate = state as Readonly<Record<string, unknown>>;

  if (
    candidate.remainingFrames !== undefined &&
    (typeof candidate.remainingFrames !== "number" ||
      !Number.isSafeInteger(candidate.remainingFrames) ||
      candidate.remainingFrames < 0)
  ) {
    throw new Error(
      "Level timer remainingFrames must be undefined or a non-negative safe integer.",
    );
  }
}

export function stepLevelTimerState(state: LevelTimerState): LevelTimerState {
  assertValidLevelTimerState(state);

  if (state.remainingFrames === undefined || state.remainingFrames <= 0) {
    return state;
  }

  return {
    remainingFrames: (state.remainingFrames - 1) as LevelTimerFrameCount,
  };
}

export function hasLevelTimerExpired(state: LevelTimerState): boolean {
  assertValidLevelTimerState(state);

  return state.remainingFrames === 0;
}

function findRuntimeLevelTimer(
  timers: readonly LevelTimerDefinition[],
): LevelTimerDefinition | undefined {
  return timers.find((timer) => timer.timerId === runtimeLevelTimerId);
}

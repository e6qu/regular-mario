export type LoginAttemptLimiter = {
  assertAllowed(address: string, nowMilliseconds: number): void;
  recordFailure(address: string, nowMilliseconds: number): void;
  reset(address: string): void;
};

export function makeLoginAttemptLimiter(
  maximumAttempts: number,
  windowMilliseconds: number,
): LoginAttemptLimiter {
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts <= 0) {
    throw new Error("Maximum login attempts must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(windowMilliseconds) || windowMilliseconds <= 0) {
    throw new Error("Login attempt window must be a positive safe integer.");
  }
  const failedTimesByAddress = new Map<string, readonly number[]>();

  function recent(address: string, nowMilliseconds: number): readonly number[] {
    const retained = (failedTimesByAddress.get(address) ?? []).filter(
      (attemptedAt) => nowMilliseconds - attemptedAt < windowMilliseconds,
    );
    if (retained.length === 0) {
      failedTimesByAddress.delete(address);
    } else {
      failedTimesByAddress.set(address, retained);
    }
    return retained;
  }

  return {
    assertAllowed(address, nowMilliseconds) {
      if (recent(address, nowMilliseconds).length >= maximumAttempts) {
        throw new Error("Too many password attempts. Try again shortly.");
      }
    },
    recordFailure(address, nowMilliseconds) {
      const failures = recent(address, nowMilliseconds);
      failedTimesByAddress.set(address, [...failures, nowMilliseconds]);
    },
    reset(address) {
      failedTimesByAddress.delete(address);
    },
  };
}

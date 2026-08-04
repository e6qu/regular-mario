import { describe, expect, it } from "vitest";

import { makeLoginAttemptLimiter } from "./login-attempt-limiter";

describe("login attempt limiter", () => {
  it("blocks a sixth failed password attempt per address then expires the boundary", () => {
    const limiter = makeLoginAttemptLimiter(5, 60_000);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.assertAllowed("127.0.0.1", attempt);
      limiter.recordFailure("127.0.0.1", attempt);
    }
    expect(() => limiter.assertAllowed("127.0.0.1", 5)).toThrow(
      "Too many password attempts.",
    );
    expect(() => limiter.assertAllowed("127.0.0.2", 5)).not.toThrow();
    expect(() => limiter.assertAllowed("127.0.0.1", 60_001)).not.toThrow();
  });

  it("clears failures after a successful login", () => {
    const limiter = makeLoginAttemptLimiter(1, 60_000);
    limiter.recordFailure("127.0.0.1", 0);
    limiter.reset("127.0.0.1");
    expect(() => limiter.assertAllowed("127.0.0.1", 1)).not.toThrow();
  });
});

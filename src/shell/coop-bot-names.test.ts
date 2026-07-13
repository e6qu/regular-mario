import { describe, expect, it } from "vitest";

import { robotBotNameCount, robotNameForBotSpawn } from "./coop-bot-names";

describe("robotNameForBotSpawn", () => {
  it("is stable for a given spawn counter", () => {
    expect(robotNameForBotSpawn(0)).toBe(robotNameForBotSpawn(0));
  });

  it("gives every bot in a full crowd a distinct call-sign", () => {
    const names = new Set<string>();
    for (let counter = 0; counter < robotBotNameCount; counter += 1) {
      names.add(robotNameForBotSpawn(counter));
    }
    expect(names.size).toBe(robotBotNameCount);
  });

  it("wraps past the pool without crashing", () => {
    expect(typeof robotNameForBotSpawn(1000)).toBe("string");
    expect(robotNameForBotSpawn(1000).length).toBeGreaterThan(0);
  });
});

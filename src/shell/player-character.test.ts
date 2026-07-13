import { describe, expect, it } from "vitest";

import {
  applyCharacterToCandidates,
  defaultPlayerCharacter,
  parsePlayerCharacter,
  robotCharacterForBotIndex,
  robotPlayerCharacters,
} from "./player-character";

describe("parsePlayerCharacter", () => {
  it("recognises luigi", () => {
    expect(parsePlayerCharacter("luigi")).toBe("luigi");
  });

  it("recognises each robot costume", () => {
    expect(parsePlayerCharacter("robot1")).toBe("robot1");
    expect(parsePlayerCharacter("robot2")).toBe("robot2");
    expect(parsePlayerCharacter("robot3")).toBe("robot3");
    expect(parsePlayerCharacter("robot4")).toBe("robot4");
  });

  it("defaults to the castaway for anything else", () => {
    expect(parsePlayerCharacter(null)).toBe("castaway");
    expect(parsePlayerCharacter("")).toBe("castaway");
    expect(parsePlayerCharacter("mario")).toBe("castaway");
    expect(parsePlayerCharacter("robot5")).toBe("castaway");
    expect(defaultPlayerCharacter).toBe("castaway");
  });
});

describe("robotCharacterForBotIndex", () => {
  it("cycles through the four robot costumes by index", () => {
    expect(robotPlayerCharacters).toHaveLength(4);
    expect(robotCharacterForBotIndex(0)).toBe("robot1");
    expect(robotCharacterForBotIndex(3)).toBe("robot4");
    // Wraps around so any number of bots stays covered.
    expect(robotCharacterForBotIndex(4)).toBe("robot1");
    expect(robotCharacterForBotIndex(9)).toBe("robot2");
  });
});

describe("applyCharacterToCandidates", () => {
  const candidates = ["powered-idle", "idle"];

  it("leaves the default castaway candidates unchanged", () => {
    expect(applyCharacterToCandidates(candidates, "castaway")).toEqual(
      candidates,
    );
  });

  it("prefixes luigi candidates first, then falls back to the shared art", () => {
    expect(applyCharacterToCandidates(candidates, "luigi")).toEqual([
      "luigi-powered-idle",
      "luigi-idle",
      "powered-idle",
      "idle",
    ]);
  });
});

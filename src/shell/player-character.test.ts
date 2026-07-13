import { describe, expect, it } from "vitest";

import {
  applyCharacterToCandidates,
  defaultPlayerCharacter,
  parsePlayerCharacter,
} from "./player-character";

describe("parsePlayerCharacter", () => {
  it("recognises luigi", () => {
    expect(parsePlayerCharacter("luigi")).toBe("luigi");
  });

  it("defaults to the castaway for anything else", () => {
    expect(parsePlayerCharacter(null)).toBe("castaway");
    expect(parsePlayerCharacter("")).toBe("castaway");
    expect(parsePlayerCharacter("mario")).toBe("castaway");
    expect(defaultPlayerCharacter).toBe("castaway");
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

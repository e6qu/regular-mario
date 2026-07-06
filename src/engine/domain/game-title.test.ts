import { describe, expect, it } from "vitest";

import { makeGameTitle } from "./game-title";

describe("makeGameTitle", () => {
  it("accepts non-empty text", () => {
    expect(makeGameTitle("Original Platformer")).toEqual({
      value: "Original Platformer",
    });
  });

  it("rejects empty text", () => {
    expect(() => makeGameTitle("")).toThrow(
      "GameTitle requires non-empty text.",
    );
  });

  it("rejects surrounding whitespace", () => {
    expect(() => makeGameTitle(" Original Platformer")).toThrow(
      "GameTitle must not contain leading or trailing whitespace.",
    );
  });

  it("rejects project-prohibited source-specific terms", () => {
    expect(() => makeGameTitle("Super Mario Tribute")).toThrow(
      "GameTitle must not contain project-prohibited source-specific terms.",
    );
  });
});

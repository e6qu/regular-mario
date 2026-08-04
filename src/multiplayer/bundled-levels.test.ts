import { describe, expect, it } from "vitest";

import {
  bundledMultiplayerLevels,
  requireBundledMultiplayerLevel,
} from "./bundled-levels";

describe("bundled multiplayer levels", () => {
  it("offers multiple validated original levels", () => {
    expect(bundledMultiplayerLevels.map((level) => level.id)).toEqual([
      "multiplayer-onboarding",
      "coin-block-route",
      "cavern-route",
    ]);
    expect(
      requireBundledMultiplayerLevel("cavern-route").levelSpec.widthTiles,
    ).toBe(24);
  });

  it("rejects an unknown level instead of choosing a fallback", () => {
    expect(() => requireBundledMultiplayerLevel("unknown")).toThrow(
      "not bundled",
    );
  });
});

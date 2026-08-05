import { describe, expect, it } from "vitest";

import {
  bundledMultiplayerLevels,
  requireBundledMultiplayerLevel,
} from "./bundled-levels";
import { publicOriginalLevels } from "../engine/levels/public-level-catalog";
import { selectBrowserLevelInput } from "../shell/browser-level-selection";

describe("bundled multiplayer levels", () => {
  it("offers the same validated authored levels as local play", () => {
    expect(bundledMultiplayerLevels.map((level) => level.id)).toEqual([
      "first-authored",
      "pipe-route",
      "enemy-stomp-route",
    ]);
    for (const level of publicOriginalLevels) {
      expect(selectBrowserLevelInput(`?browserLevel=${level.id}`)).toBe(
        level.levelInput,
      );
      expect(
        requireBundledMultiplayerLevel(level.id).levelSpec.widthTiles,
      ).toBe(level.levelInput.widthTiles);
    }
  });

  it("rejects an unknown level instead of choosing a fallback", () => {
    expect(() => requireBundledMultiplayerLevel("unknown")).toThrow(
      "not bundled",
    );
  });
});

import { describe, expect, it } from "vitest";

import { armoredEnemyRouteLevelInput } from "../engine/levels/armored-enemy-route-level";
import { chasingEnemyRouteLevelInput } from "../engine/levels/chasing-enemy-route-level";
import { coinBlockRouteLevelInput } from "../engine/levels/coin-block-route-level";
import { enemyGauntletRouteLevelInput } from "../engine/levels/enemy-gauntlet-route-level";
import { enemyStompRouteLevelInput } from "../engine/levels/enemy-stomp-route-level";
import { firstAuthoredLevelInput } from "../engine/levels/first-authored-level";
import { flyingEnemyRouteLevelInput } from "../engine/levels/flying-enemy-route-level";
import { hardLandingRouteLevelInput } from "../engine/levels/hard-landing-route-level";
import { hazardOnlyFeedbackLevelInput } from "../engine/levels/hazard-only-feedback-level";
import { powerUpRouteLevelInput } from "../engine/levels/power-up-route-level";
import { projectileRouteLevelInput } from "../engine/levels/projectile-route-level";
import {
  selectBrowserGameBootstrap,
  selectBrowserLevelInput,
} from "./browser-level-selection";

describe("selectBrowserLevelInput", () => {
  it("selects the first authored level when no browser level is requested", () => {
    expect(selectBrowserLevelInput("")).toBe(firstAuthoredLevelInput);
    expect(selectBrowserGameBootstrap("").initialPlayerVitality).toEqual({
      kind: "small",
    });
  });

  it("wears the castaway costume by default and Luigi when requested", () => {
    expect(selectBrowserGameBootstrap("").playerCharacter).toBe("castaway");
    expect(
      selectBrowserGameBootstrap("?browserLevel=first-authored&character=luigi")
        .playerCharacter,
    ).toBe("luigi");
  });

  it("selects the hazard-only feedback fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=hazard-only-feedback")).toBe(
      hazardOnlyFeedbackLevelInput,
    );
  });

  it("selects the enemy stomp route fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=enemy-stomp-route")).toBe(
      enemyStompRouteLevelInput,
    );
  });

  it("selects the flying enemy route fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=flying-enemy-route")).toBe(
      flyingEnemyRouteLevelInput,
    );
  });

  it("selects the hard-landing route fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=hard-landing-route")).toBe(
      hardLandingRouteLevelInput,
    );
  });

  it("selects the chasing enemy route fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=chasing-enemy-route")).toBe(
      chasingEnemyRouteLevelInput,
    );
  });

  it("selects the enemy gauntlet route fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=enemy-gauntlet-route")).toBe(
      enemyGauntletRouteLevelInput,
    );
  });

  it("selects the armored enemy route fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=armored-enemy-route")).toBe(
      armoredEnemyRouteLevelInput,
    );
  });

  it("selects the coin block route fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=coin-block-route")).toBe(
      coinBlockRouteLevelInput,
    );
  });

  it("selects the projectile route fixture explicitly", () => {
    const bootstrap = selectBrowserGameBootstrap(
      "?browserLevel=projectile-route",
    );

    expect(bootstrap.levelInput).toBe(projectileRouteLevelInput);
    expect(bootstrap.initialPlayerVitality).toEqual({
      kind: "fire",
    });
  });

  it("selects the power-up route fixture explicitly", () => {
    expect(selectBrowserLevelInput("?browserLevel=power-up-route")).toBe(
      powerUpRouteLevelInput,
    );
  });

  it("selects the powered contact route fixture explicitly", () => {
    const bootstrap = selectBrowserGameBootstrap(
      "?browserLevel=powered-contact-route",
    );

    expect(bootstrap.levelInput).toBe(firstAuthoredLevelInput);
    expect(bootstrap.initialPlayerVitality).toEqual({
      kind: "powered",
    });
  });

  it("rejects duplicate browser level selections", () => {
    expect(() =>
      selectBrowserLevelInput(
        "?browserLevel=first-authored&browserLevel=hazard-only-feedback",
      ),
    ).toThrow("Browser level selection must be provided at most once.");
  });

  it("rejects unknown browser level selections", () => {
    expect(() => selectBrowserLevelInput("?browserLevel=unknown")).toThrow(
      "Unknown browser level selection: unknown",
    );
  });
});

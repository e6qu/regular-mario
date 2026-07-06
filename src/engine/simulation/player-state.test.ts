import { describe, expect, it } from "vitest";

import {
  initialPlayerSimulationStateConfig,
  makeInitialPlayerSimulationState,
  poweredPlayerColliderDimensions,
  resizePlayerForVitality,
  smallPlayerColliderDimensions,
} from "./player-state";
import { expectedInitialPlayerSimulationState } from "./player-state-test-support";
import { PlayerVitalityKind } from "./player-vitality";

describe("player simulation state", () => {
  it("exposes explicit authored initial player state config", () => {
    expect(initialPlayerSimulationStateConfig).toEqual({
      spawnPositionX: 16,
      spawnPositionY: 56,
      velocityX: 0,
      velocityY: 0,
      colliderWidth: 14,
      colliderHeight: 24,
    });
  });

  it("creates explicit initial player state without integrating movement", () => {
    expect(makeInitialPlayerSimulationState()).toEqual(
      expectedInitialPlayerSimulationState,
    );
  });

  it("uses explicit small and powered collider dimensions", () => {
    expect(smallPlayerColliderDimensions).toEqual({
      width: 14,
      height: 24,
    });
    expect(poweredPlayerColliderDimensions).toEqual({
      width: 14,
      height: 32,
    });
  });

  it("resizes to powered while keeping the player feet planted", () => {
    const poweredPlayer = resizePlayerForVitality(
      makeInitialPlayerSimulationState(),
      { kind: PlayerVitalityKind.Powered },
    );

    expect(poweredPlayer.collider).toEqual({
      width: 14,
      height: 32,
    });
    expect(poweredPlayer.position).toEqual({
      x: 16,
      y: 48,
    });
  });

  it("resizes back to small while keeping the player feet planted", () => {
    const poweredPlayer = resizePlayerForVitality(
      makeInitialPlayerSimulationState(),
      { kind: PlayerVitalityKind.Powered },
    );

    const smallPlayer = resizePlayerForVitality(poweredPlayer, {
      kind: PlayerVitalityKind.Small,
    });

    expect(smallPlayer.collider).toEqual({
      width: 14,
      height: 24,
    });
    expect(smallPlayer.position).toEqual({
      x: 16,
      y: 56,
    });
  });

  it("returns a new state object for each construction", () => {
    const firstState = makeInitialPlayerSimulationState();
    const secondState = makeInitialPlayerSimulationState();

    expect(firstState).toEqual(secondState);
    expect(firstState).not.toBe(secondState);
  });
});

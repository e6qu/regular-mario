import { describe, expect, it } from "vitest";
import { ActorRole, makeLevelSpec } from "../domain/level-spec";
import type { LevelSpec } from "../domain/level-spec";
import type { EntityId } from "../domain/identifiers";
import { makeFrameIndex, type TilePoint } from "../domain/units";
import {
  makeEmptyBreakableBlockState,
  resolveBreakableBlockState,
} from "./breakable-block-state";
import {
  HorizontalMovementState,
  initialMovementConstants,
  VerticalMovementState,
} from "./movement-model";
import {
  breakableBlockLevelSpec,
  makeSkyGrassTileDefinitions,
  makeSkyGroundTiles,
  playerAt,
} from "./level-test-support";
import { playerWithTestState } from "./movement-test-support";
import {
  makeFirePlayerVitalityState,
  PlayerVitalityKind,
} from "./player-vitality";
import {
  makeEmptyProjectilesState,
  projectileHazardBox,
  resolveProjectilesState,
  stepExistingProjectiles,
  type Projectile,
  type ProjectilesState,
} from "./projectile-state";
import { makeInitialSimulationState } from "./simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "./simulation-units";

function makeProjectileLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 10,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      {
        actorId: "runner-start",
        role: ActorRole.PlayerStart,
      },
      {
        actorId: "beetle",
        role: ActorRole.Enemy,
      },
      {
        actorId: "open-gate",
        role: ActorRole.Exit,
      },
    ],
    tiles: makeSkyGroundTiles(10),
    actors: [
      {
        entityId: "runner-1",
        actorId: "runner-start",
        x: 1,
        y: 4,
      },
      {
        entityId: "beetle-1",
        actorId: "beetle",
        x: 4,
        y: 4,
      },
      {
        entityId: "gate-1",
        actorId: "open-gate",
        x: 9,
        y: 4,
      },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected projectile test level to validate.");
  }

  return result.value;
}

function makeFireproofEnemyLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 10,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      { actorId: "buzzy", role: ActorRole.ArmoredEnemy, fireproof: true },
      { actorId: "open-gate", role: ActorRole.Exit },
    ],
    tiles: makeSkyGroundTiles(10),
    actors: [
      { entityId: "runner-1", actorId: "runner-start", x: 1, y: 4 },
      { entityId: "buzzy-1", actorId: "buzzy", x: 4, y: 4 },
      { entityId: "gate-1", actorId: "open-gate", x: 9, y: 4 },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected fireproof enemy test level to validate.");
  }

  return result.value;
}

function tilePoint(x: number, y: number): TilePoint {
  return {
    x: x as unknown as TilePoint["x"],
    y: y as unknown as TilePoint["y"],
  };
}

function makeInitialTestState(levelSpec: LevelSpec) {
  const result = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    levelSpec,
    initialMovementConstants,
  );

  if (!result.ok) {
    throw new Error("Expected initial test state to validate.");
  }

  return result.value;
}

function frameIndex(value: number) {
  const result = makeFrameIndex(value, "test.frameIndex");

  if (!result.ok) {
    throw new Error("Expected valid test frame index.");
  }

  return result.value;
}

function resolveOnce(
  state: ProjectilesState,
  input: { readonly firePressed: boolean },
  player = playerAt({ x: 16, y: 56 }),
  enemyDefeatedEntityIds: readonly EntityId[] = [],
  frameIdx = 1,
): ReturnType<typeof resolveProjectilesState> {
  const levelSpec = makeProjectileLevelSpec();
  const initialState = makeInitialTestState(levelSpec);

  return resolveProjectilesState(
    input,
    player,
    makeFirePlayerVitalityState(),
    initialState.enemyMotion,
    { defeatedEnemyEntityIds: enemyDefeatedEntityIds },
    state,
    makeEmptyBreakableBlockState(),
    initialMovementConstants,
    levelSpec,
    nominalSixtyHertzFrameDurationMilliseconds,
    frameIndex(frameIdx),
  );
}

function activeProjectiles(
  result: ReturnType<typeof resolveProjectilesState>,
): readonly Projectile[] {
  return result.state.projectiles.filter((projectile) => projectile.active);
}

describe("projectile-state", () => {
  it("creates an empty projectiles state", () => {
    const state = makeEmptyProjectilesState();

    expect(state.projectiles).toEqual([]);
    expect(state.cooldownRemainingFrames).toBe(0);
  });

  it("does not spawn a projectile when fire is not pressed", () => {
    const result = resolveOnce(makeEmptyProjectilesState(), {
      firePressed: false,
    });

    expect(result.firedProjectile).toBe(false);
    expect(result.state.projectiles).toEqual([]);
    expect(result.newlyDefeatedEnemyEntityIds).toEqual([]);
  });

  it("does not spawn a projectile when the player is small", () => {
    const levelSpec = makeProjectileLevelSpec();
    const initialState = makeInitialTestState(levelSpec);
    const result = resolveProjectilesState(
      { firePressed: true },
      playerAt({ x: 16, y: 56 }),
      { kind: PlayerVitalityKind.Small },
      initialState.enemyMotion,
      { defeatedEnemyEntityIds: [] },
      makeEmptyProjectilesState(),
      makeEmptyBreakableBlockState(),
      initialMovementConstants,
      levelSpec,
      nominalSixtyHertzFrameDurationMilliseconds,
      frameIndex(1),
    );

    expect(result.firedProjectile).toBe(false);
    expect(result.state.projectiles).toEqual([]);
  });

  it("spawns a projectile to the right when fire is pressed while powered", () => {
    const result = resolveOnce(makeEmptyProjectilesState(), {
      firePressed: true,
    });

    expect(result.firedProjectile).toBe(true);
    expect(activeProjectiles(result)).toHaveLength(1);

    const projectile = activeProjectiles(result)[0];

    expect(projectile?.velocity.x).toBe(
      initialMovementConstants.projectileSpeed,
    );
    expect(projectile?.position.x).toBe(16 + 7);
    expect(projectile?.position.y).toBe(56 + 12);
  });

  it("spawns a projectile to the left when the player is moving left", () => {
    const leftMovingPlayer = playerWithTestState({
      position: { x: 80, y: 56 },
      velocity: { x: -10, y: 0 },
      movement: {
        horizontal: HorizontalMovementState.Idle,
        vertical: VerticalMovementState.Grounded,
      },
    });
    const result = resolveOnce(
      makeEmptyProjectilesState(),
      { firePressed: true },
      leftMovingPlayer,
    );

    const projectile = activeProjectiles(result)[0];

    expect(projectile?.velocity.x).toBe(
      0 - initialMovementConstants.projectileSpeed,
    );
  });

  it("enforces a cooldown between shots", () => {
    const firstResult = resolveOnce(makeEmptyProjectilesState(), {
      firePressed: true,
    });
    const secondResult = resolveOnce(firstResult.state, {
      firePressed: true,
    });

    expect(firstResult.firedProjectile).toBe(true);
    expect(secondResult.firedProjectile).toBe(false);
    expect(secondResult.state.cooldownRemainingFrames).toBe(
      initialMovementConstants.projectileCooldownFrameCount - 1,
    );
  });

  it("moves an active projectile each frame", () => {
    const firstResult = resolveOnce(makeEmptyProjectilesState(), {
      firePressed: true,
    });
    const projectile = activeProjectiles(firstResult)[0];

    if (projectile === undefined) {
      throw new Error("Expected a projectile to be spawned.");
    }

    const secondResult = resolveOnce(firstResult.state, {
      firePressed: false,
    });
    const movedProjectile = activeProjectiles(secondResult)[0];

    expect(movedProjectile?.position.x).toBeGreaterThan(projectile.position.x);
    expect(movedProjectile?.remainingLifetimeFrames).toBe(
      projectile.remainingLifetimeFrames - 1,
    );
  });

  it("arcs a fireball down under gravity and bounces it off the ground", () => {
    // Spawn high + far left so the fireball has room to fall before the ground.
    const shooter = playerAt({ x: 8, y: 8 });
    let result = resolveOnce(
      makeEmptyProjectilesState(),
      { firePressed: true },
      shooter,
    );
    let sawFalling = false;
    let sawBounce = false;
    for (let frame = 0; frame < 50; frame += 1) {
      result = resolveOnce(result.state, { firePressed: false }, shooter);
      const projectile = activeProjectiles(result)[0];
      if (projectile === undefined) {
        break;
      }
      if (projectile.velocity.y > 60) {
        sawFalling = true; // gained downward speed from gravity
      }
      if (sawFalling && projectile.velocity.y < 0) {
        sawBounce = true; // sprang back up off the floor
      }
    }
    expect(sawFalling).toBe(true);
    expect(sawBounce).toBe(true);
  });

  it("flies a fireball straight when gravity is zero (underwater)", () => {
    const spawned = activeProjectiles(
      resolveOnce(makeEmptyProjectilesState(), { firePressed: true }),
    )[0];
    if (spawned === undefined) {
      throw new Error("Expected a fireball to spawn.");
    }

    const levelSpec = makeProjectileLevelSpec();
    let projectiles: readonly Projectile[] = [spawned];
    for (let frame = 0; frame < 20; frame += 1) {
      projectiles = stepExistingProjectiles(
        projectiles,
        nominalSixtyHertzFrameDurationMilliseconds / 1000,
        levelSpec,
        makeEmptyBreakableBlockState(),
        0,
        0,
      );
    }

    expect(projectiles[0]?.velocity.y).toBe(0);
    expect(projectiles[0]?.position.y).toBe(spawned.position.y);
    expect(projectiles[0]?.position.x).toBeGreaterThan(spawned.position.x);
  });

  it("arcs a projectile that carries its own gravity (thrown hammer) even at uniform gravity 0", () => {
    const spawned = activeProjectiles(
      resolveOnce(makeEmptyProjectilesState(), { firePressed: true }),
    )[0];
    if (spawned === undefined) {
      throw new Error("Expected a fireball to spawn.");
    }
    // A hammer-like projectile: thrown upward, carrying its own gravity.
    let projectiles: readonly Projectile[] = [
      {
        ...spawned,
        position: { x: 32 as never, y: 8 as never },
        velocity: { x: 0 as never, y: -120 as never },
        gravityPixelsPerSecondSquared: 540,
      },
    ];

    const levelSpec = makeProjectileLevelSpec();
    let sawRising = false;
    let sawFalling = false;
    for (let frame = 0; frame < 20; frame += 1) {
      projectiles = stepExistingProjectiles(
        projectiles,
        nominalSixtyHertzFrameDurationMilliseconds / 1000,
        levelSpec,
        makeEmptyBreakableBlockState(),
        0, // uniform gravity 0 (straight-hazard step)
        0,
      );
      const y = projectiles[0]?.velocity.y;
      if (y !== undefined && y < 0) sawRising = true;
      if (y !== undefined && y > 0) sawFalling = true;
    }
    // Its own gravity turned the upward throw into a down-arc despite uniform 0.
    expect(sawRising).toBe(true);
    expect(sawFalling).toBe(true);
  });

  it("defeats an enemy when a projectile overlaps it", () => {
    const levelSpec = makeProjectileLevelSpec();
    const initialState = makeInitialTestState(levelSpec);
    const player = playerAt({ x: 32, y: 56 });
    const firstResult = resolveProjectilesState(
      { firePressed: true },
      player,
      makeFirePlayerVitalityState(),
      initialState.enemyMotion,
      { defeatedEnemyEntityIds: [] },
      makeEmptyProjectilesState(),
      makeEmptyBreakableBlockState(),
      initialMovementConstants,
      levelSpec,
      nominalSixtyHertzFrameDurationMilliseconds,
      frameIndex(1),
    );

    let steppedResult = firstResult;

    for (let step = 0; step < 30; step += 1) {
      steppedResult = resolveProjectilesState(
        { firePressed: false },
        player,
        makeFirePlayerVitalityState(),
        initialState.enemyMotion,
        {
          defeatedEnemyEntityIds: steppedResult.newlyDefeatedEnemyEntityIds,
        },
        steppedResult.state,
        makeEmptyBreakableBlockState(),
        initialMovementConstants,
        levelSpec,
        nominalSixtyHertzFrameDurationMilliseconds,
        frameIndex(2 + step),
      );

      if (steppedResult.newlyDefeatedEnemyEntityIds.length > 0) {
        break;
      }
    }

    expect(steppedResult.newlyDefeatedEnemyEntityIds).toContain("beetle-1");
    expect(activeProjectiles(steppedResult)).toHaveLength(0);
  });

  it("detonates a fireball on a fireproof enemy (Buzzy) without defeating it", () => {
    const levelSpec = makeFireproofEnemyLevelSpec();
    const initialState = makeInitialTestState(levelSpec);
    const player = playerAt({ x: 32, y: 56 });
    let steppedResult = resolveProjectilesState(
      { firePressed: true },
      player,
      makeFirePlayerVitalityState(),
      initialState.enemyMotion,
      { defeatedEnemyEntityIds: [] },
      makeEmptyProjectilesState(),
      makeEmptyBreakableBlockState(),
      initialMovementConstants,
      levelSpec,
      nominalSixtyHertzFrameDurationMilliseconds,
      frameIndex(1),
    );

    // The fireball reaches the Buzzy and is consumed (it can't tunnel through),
    // but the Buzzy is never defeated.
    let projectileConsumed = false;
    for (let step = 0; step < 30; step += 1) {
      const hadProjectile = activeProjectiles(steppedResult).length > 0;
      steppedResult = resolveProjectilesState(
        { firePressed: false },
        player,
        makeFirePlayerVitalityState(),
        initialState.enemyMotion,
        { defeatedEnemyEntityIds: steppedResult.newlyDefeatedEnemyEntityIds },
        steppedResult.state,
        makeEmptyBreakableBlockState(),
        initialMovementConstants,
        levelSpec,
        nominalSixtyHertzFrameDurationMilliseconds,
        frameIndex(2 + step),
      );
      expect(steppedResult.newlyDefeatedEnemyEntityIds).toEqual([]);
      if (hadProjectile && activeProjectiles(steppedResult).length === 0) {
        projectileConsumed = true;
      }
    }
    expect(projectileConsumed).toBe(true);
  });

  it("expires a projectile that hits a solid tile", () => {
    const levelSpec = makeProjectileLevelSpec();
    const initialState = makeInitialTestState(levelSpec);
    const player = playerAt({ x: 0, y: 88 });
    const firedResult = resolveProjectilesState(
      { firePressed: true },
      player,
      makeFirePlayerVitalityState(),
      initialState.enemyMotion,
      { defeatedEnemyEntityIds: [] },
      makeEmptyProjectilesState(),
      makeEmptyBreakableBlockState(),
      initialMovementConstants,
      levelSpec,
      nominalSixtyHertzFrameDurationMilliseconds,
      frameIndex(1),
    );
    const steppedResult = resolveProjectilesState(
      { firePressed: false },
      player,
      makeFirePlayerVitalityState(),
      initialState.enemyMotion,
      { defeatedEnemyEntityIds: [] },
      firedResult.state,
      makeEmptyBreakableBlockState(),
      initialMovementConstants,
      levelSpec,
      nominalSixtyHertzFrameDurationMilliseconds,
      frameIndex(2),
    );

    expect(firedResult.firedProjectile).toBe(true);
    expect(activeProjectiles(steppedResult)).toHaveLength(0);
  });

  it("expires a projectile after its lifetime elapses", () => {
    let result = resolveOnce(makeEmptyProjectilesState(), {
      firePressed: true,
    });
    const player = playerAt({ x: 16, y: 56 });
    const levelSpec = makeProjectileLevelSpec();
    const initialState = makeInitialTestState(levelSpec);

    for (
      let step = 0;
      step < initialMovementConstants.projectileLifetimeFrameCount;
      step += 1
    ) {
      result = resolveProjectilesState(
        { firePressed: false },
        player,
        makeFirePlayerVitalityState(),
        initialState.enemyMotion,
        { defeatedEnemyEntityIds: [] },
        result.state,
        makeEmptyBreakableBlockState(),
        initialMovementConstants,
        levelSpec,
        nominalSixtyHertzFrameDurationMilliseconds,
        frameIndex(2 + step),
      );
    }

    expect(activeProjectiles(result)).toHaveLength(0);
  });

  it("keeps a projectile active when it crosses an already-broken breakable tile", () => {
    const levelSpec = breakableBlockLevelSpec();
    const initialState = makeInitialTestState(levelSpec);
    const player = playerAt({ x: 25, y: 58 });
    const breakableBlocks = resolveBreakableBlockState(
      makeEmptyBreakableBlockState(),
      [tilePoint(2, 4)],
      makeFirePlayerVitalityState(),
    );
    let result = resolveProjectilesState(
      { firePressed: true },
      player,
      makeFirePlayerVitalityState(),
      initialState.enemyMotion,
      { defeatedEnemyEntityIds: [] },
      makeEmptyProjectilesState(),
      breakableBlocks,
      initialMovementConstants,
      levelSpec,
      nominalSixtyHertzFrameDurationMilliseconds,
      frameIndex(1),
    );

    for (let step = 0; step < 11; step += 1) {
      result = resolveProjectilesState(
        { firePressed: false },
        player,
        makeFirePlayerVitalityState(),
        initialState.enemyMotion,
        { defeatedEnemyEntityIds: [] },
        result.state,
        breakableBlocks,
        initialMovementConstants,
        levelSpec,
        nominalSixtyHertzFrameDurationMilliseconds,
        frameIndex(2 + step),
      );
    }

    const projectile = activeProjectiles(result)[0];

    expect(projectile?.position.x).toBeGreaterThan(48);
  });

  describe("projectileHazardBox", () => {
    const baseProjectile = {
      id: "flame-1" as Projectile["id"],
      position: { x: 100, y: 200 } as Projectile["position"],
      velocity: { x: 0, y: 0 } as Projectile["velocity"],
      width: 24,
      height: 8,
      active: true,
      remainingLifetimeFrames: 60 as Projectile["remainingLifetimeFrames"],
    };

    it("returns the full render box when there is no inset", () => {
      expect(projectileHazardBox(baseProjectile)).toEqual({
        x: 100,
        y: 200,
        width: 24,
        height: 8,
      });
    });

    it("shrinks and re-centres the box by a symmetric inset (Bowser flame)", () => {
      // A 24×8 flame inset by 8/1 → a centred 8×6 hazard box, dodgeable at the
      // sprite's wide edges just like the ROM's tiny flame hitbox.
      expect(
        projectileHazardBox({
          ...baseProjectile,
          hazardInsetXPixels: 8,
          hazardInsetYPixels: 1,
        }),
      ).toEqual({ x: 108, y: 201, width: 8, height: 6 });
    });
  });
});

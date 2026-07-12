import { ActorRole } from "../domain/level-spec";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import { describe, expect, it } from "vitest";

import { makeLevelSpec, type LevelSpec } from "../domain/level-spec";
import type { EntityId } from "../domain/identifiers";
import {
  assertValidEnemyInteractionState,
  makeEmptyEnemyInteractionState,
  resolveEnemyInteractionState,
  type EnemyInteractionState,
} from "./enemy-interaction";
import {
  ArmoredEnemyBehavior,
  makeInitialEnemyMotionState,
  type EnemyMotionState,
} from "./enemy-motion";
import {
  adjacentEnemyLevelSpec,
  firstAuthoredLevelSpec,
  makeExitActor,
  makeExitDefinition,
  makeRunnerStartActor,
  makeRunnerStartDefinition,
  makeSkyGrassTileDefinitions,
  makeSkyGroundTiles,
  playerAt,
} from "./level-test-support";
import {
  initialMovementConstants,
  swimmingMovementConstants,
} from "./movement-model";
import { playerWithTestState } from "./movement-test-support";

function fallingPlayerAt(position: { readonly x: number; readonly y: number }) {
  return playerWithTestState({
    position,
    velocity: {
      x: 0,
      y: 120,
    },
    movement: {
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Falling,
    },
  });
}

function initialEnemyMotion(levelSpec: LevelSpec): EnemyMotionState {
  return makeInitialEnemyMotionState(levelSpec, initialMovementConstants);
}

function expectedEmptyEnemyInteractionState(): EnemyInteractionState {
  return makeEmptyEnemyInteractionState();
}

function expectedEnemyDefeatedState(
  entityId: EntityId,
  chainCount = 1,
  score = 100,
) {
  return {
    ...expectedEmptyEnemyInteractionState(),
    defeatedEnemyEntityIds: [entityId],
    currentStompChainCount: chainCount,
    cumulativeStompScore: score,
  };
}

function expectedEnemyContactedState(entityId: EntityId) {
  return {
    ...expectedEmptyEnemyInteractionState(),
    contactedEnemyEntityIds: [entityId],
  };
}

function resolveFirstAuthoredEnemyInteraction(
  previousPlayerPosition: { readonly x: number; readonly y: number },
  nextPlayerPosition: { readonly x: number; readonly y: number },
) {
  const levelSpec = firstAuthoredLevelSpec();

  return resolveEnemyInteractionState(
    playerAt(previousPlayerPosition),
    fallingPlayerAt(nextPlayerPosition),
    levelSpec,
    initialEnemyMotion(levelSpec),
    initialMovementConstants,
    makeEmptyEnemyInteractionState(),
  );
}

function profiledEnemyColliderLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 4,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      {
        actorId: "compact-beetle",
        role: ActorRole.Enemy,
        colliderWidthPixels: 8,
        colliderHeightPixels: 10,
      },
      makeExitDefinition(),
    ],
    tiles: makeSkyGroundTiles(4),
    actors: [
      makeRunnerStartActor(),
      {
        entityId: "compact-beetle-1",
        actorId: "compact-beetle",
        x: 1,
        y: 1,
      },
      makeExitActor(3),
    ],
  });

  if (!result.ok) {
    throw new Error("Expected profiled enemy collider test level to validate.");
  }

  return result.value;
}

describe("enemy interactions", () => {
  it("creates an explicit empty enemy interaction state", () => {
    expect(makeEmptyEnemyInteractionState()).toEqual(
      expectedEmptyEnemyInteractionState(),
    );
  });

  it("records an authored enemy actor overlapped by the player", () => {
    const player = playerAt({
      x: 96,
      y: 56,
    });

    const levelSpec = firstAuthoredLevelSpec();

    expect(
      resolveEnemyInteractionState(
        player,
        player,
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      ),
    ).toEqual(expectedEnemyContactedState("beetle-1" as EntityId));
  });

  it("uses profile-backed enemy collider dimensions for player contact", () => {
    const levelSpec = profiledEnemyColliderLevelSpec();
    const player = playerAt({
      x: 25,
      y: 16,
    });

    expect(
      resolveEnemyInteractionState(
        player,
        player,
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      ),
    ).toEqual(expectedEmptyEnemyInteractionState());
  });

  it("records every enemy actor overlapped by the player", () => {
    // The two beetles sit at px 32–48 and 48–64; straddle their seam so the
    // (narrower, ROM-sized) player hurtbox overlaps both.
    const player = playerAt({
      x: 42,
      y: 64,
    });

    const levelSpec = adjacentEnemyLevelSpec();

    expect(
      resolveEnemyInteractionState(
        player,
        player,
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      ),
    ).toEqual({
      ...expectedEmptyEnemyInteractionState(),
      contactedEnemyEntityIds: ["beetle-a", "beetle-b"],
    });
  });

  it("does not record non-enemy actors overlapped by the player", () => {
    const player = playerAt({
      x: 64,
      y: 16,
    });

    const levelSpec = firstAuthoredLevelSpec();

    expect(
      resolveEnemyInteractionState(
        player,
        player,
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      ),
    ).toEqual(expectedEmptyEnemyInteractionState());
  });

  it("preserves previous enemy contacts without duplicating entity ids", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const player = playerAt({
      x: 96,
      y: 56,
    });
    const contactedState = resolveEnemyInteractionState(
      player,
      player,
      levelSpec,
      initialEnemyMotion(levelSpec),
      initialMovementConstants,
      makeEmptyEnemyInteractionState(),
    );

    expect(
      resolveEnemyInteractionState(
        player,
        player,
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        contactedState,
      ),
    ).toEqual({
      ...expectedEmptyEnemyInteractionState(),
      contactedEnemyEntityIds: ["beetle-1"],
    });
  });

  it("appends newly contacted enemies after previous contacts", () => {
    const levelSpec = adjacentEnemyLevelSpec();
    const firstPlayer = playerAt({
      x: 32,
      y: 64,
    });
    const secondPlayer = playerAt({
      x: 48,
      y: 64,
    });
    const firstContactState = resolveEnemyInteractionState(
      firstPlayer,
      firstPlayer,
      levelSpec,
      initialEnemyMotion(levelSpec),
      initialMovementConstants,
      makeEmptyEnemyInteractionState(),
    );

    expect(
      resolveEnemyInteractionState(
        firstPlayer,
        secondPlayer,
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        firstContactState,
      ),
    ).toEqual({
      ...expectedEmptyEnemyInteractionState(),
      contactedEnemyEntityIds: ["beetle-a", "beetle-b"],
    });
  });

  it("records a downward stomp as defeated enemy contact", () => {
    expect(
      resolveFirstAuthoredEnemyInteraction({ x: 96, y: 32 }, { x: 96, y: 45 }),
    ).toEqual(expectedEnemyDefeatedState("beetle-1" as EntityId));
  });

  it("treats a shallow previous-frame top overlap as a stomp", () => {
    expect(
      resolveFirstAuthoredEnemyInteraction({ x: 96, y: 37 }, { x: 96, y: 45 }),
    ).toEqual(expectedEnemyDefeatedState("beetle-1" as EntityId));
  });

  it("stomps a descending player even at a deep overlap (ROM velocity rule)", () => {
    // The ROM keys the stomp on downward motion alone: descending onto the
    // enemy defeats it at any overlap depth, not only on a shallow top touch.
    expect(
      resolveFirstAuthoredEnemyInteraction({ x: 96, y: 45 }, { x: 96, y: 46 }),
    ).toEqual(expectedEnemyDefeatedState("beetle-1" as EntityId));
  });

  it("keeps a grounded side contact (no descent) harmful", () => {
    // Feet stay level (no downward motion) — a walk-in, which must still hurt.
    expect(
      resolveFirstAuthoredEnemyInteraction({ x: 96, y: 46 }, { x: 96, y: 46 }),
    ).toEqual(expectedEnemyContactedState("beetle-1" as EntityId));
  });

  it("follows the full SMB stomp-chain sequence and awards a 1-up past 8000", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const continueChain = (
      priorCount: number,
      priorScore: number,
      priorExtraLives = 0,
    ): EnemyInteractionState =>
      resolveEnemyInteractionState(
        playerAt({ x: 96, y: 32 }),
        fallingPlayerAt({ x: 96, y: 45 }),
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        {
          ...makeEmptyEnemyInteractionState(),
          currentStompChainCount: priorCount,
          cumulativeStompScore:
            priorScore as EnemyInteractionState["cumulativeStompScore"],
          cumulativeStompChainExtraLives: priorExtraLives,
        },
      );

    // 100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000 for chain 1..10.
    const addedByChainCount = [
      100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000,
    ];
    addedByChainCount.forEach((added, index) => {
      const result = continueChain(index, 1000);
      expect(result.currentStompChainCount).toBe(index + 1);
      expect(result.cumulativeStompScore - 1000).toBe(added);
      expect(result.cumulativeStompChainExtraLives).toBe(0);
    });

    // The 11th defeat in a chain awards a 1-up instead of points.
    const past8000 = continueChain(10, 21800);
    expect(past8000.currentStompChainCount).toBe(11);
    expect(past8000.cumulativeStompScore - 21800).toBe(0);
    expect(past8000.cumulativeStompChainExtraLives).toBe(1);
  });

  it("preserves defeated enemies without adding later harmful contact", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const defeatedState: EnemyInteractionState = {
      ...makeEmptyEnemyInteractionState(),
      defeatedEnemyEntityIds: ["beetle-1" as EntityId],
      currentStompChainCount: 1,
      cumulativeStompScore:
        100 as EnemyInteractionState["cumulativeStompScore"],
    };
    const player = playerAt({
      x: 96,
      y: 56,
    });

    expect(
      resolveEnemyInteractionState(
        player,
        player,
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        defeatedState,
      ),
    ).toEqual(expectedEnemyDefeatedState("beetle-1" as EntityId));
  });

  it("moves a previously contacted enemy to defeated after a later stomp", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const contactedState: EnemyInteractionState = {
      ...makeEmptyEnemyInteractionState(),
      contactedEnemyEntityIds: ["beetle-1" as EntityId],
    };

    expect(
      resolveEnemyInteractionState(
        playerAt({
          x: 96,
          y: 32,
        }),
        fallingPlayerAt({
          x: 96,
          y: 45,
        }),
        levelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        contactedState,
      ),
    ).toEqual(expectedEnemyDefeatedState("beetle-1" as EntityId));
  });

  it("rejects duplicated contacted enemy entity ids", () => {
    expect(() =>
      assertValidEnemyInteractionState(
        {
          contactedEnemyEntityIds: ["beetle-1", "beetle-1"],
          defeatedEnemyEntityIds: [],
          shelledEnemyEntityIds: [],
          nudgedShellEnemyEntityIds: [],
          nudgedShellDirectionByEntityId: new Map(),
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow("Contacted enemy entity id beetle-1 is duplicated.");
  });

  it("rejects contacted entity ids that do not reference enemy actors", () => {
    expect(() =>
      assertValidEnemyInteractionState(
        {
          contactedEnemyEntityIds: ["shard-1"],
          defeatedEnemyEntityIds: [],
          shelledEnemyEntityIds: [],
          nudgedShellEnemyEntityIds: [],
          nudgedShellDirectionByEntityId: new Map(),
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow(
      "Contacted enemy entity id shard-1 must reference an enemy actor.",
    );
  });

  it("rejects malformed contacted enemy entity id collections", () => {
    expect(() =>
      assertValidEnemyInteractionState(
        {
          contactedEnemyEntityIds: ["beetle_1"],
          defeatedEnemyEntityIds: [],
          shelledEnemyEntityIds: [],
          nudgedShellEnemyEntityIds: [],
          nudgedShellDirectionByEntityId: new Map(),
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow("Contacted enemy entity id at index 0 is invalid.");
  });

  it("rejects enemy entity ids that are both contacted and defeated", () => {
    expect(() =>
      assertValidEnemyInteractionState(
        {
          contactedEnemyEntityIds: ["beetle-1"],
          defeatedEnemyEntityIds: ["beetle-1"],
          shelledEnemyEntityIds: [],
          nudgedShellEnemyEntityIds: [],
          nudgedShellDirectionByEntityId: new Map(),
        },
        firstAuthoredLevelSpec(),
      ),
    ).toThrow("Enemy entity id beetle-1 cannot be in both arrays.");
  });

  it("fails loudly when a validated actor is missing its definition at runtime", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const corruptedLevelSpec = {
      ...levelSpec,
      actorDefinitions: levelSpec.actorDefinitions.filter(
        (actorDefinition) => actorDefinition.actorId !== "beetle",
      ),
    } as LevelSpec;

    expect(() =>
      resolveEnemyInteractionState(
        playerAt({
          x: 96,
          y: 56,
        }),
        playerAt({
          x: 96,
          y: 56,
        }),
        corruptedLevelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      ),
    ).toThrow("Validated level actor is missing an actor definition.");
  });

  it("fails loudly when a validated actor definition is duplicated at runtime", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const duplicatedLevelSpec = {
      ...levelSpec,
      actorDefinitions: [
        ...levelSpec.actorDefinitions,
        {
          actorId: "beetle",
          role: ActorRole.Item,
        },
      ],
    } as LevelSpec;

    expect(() =>
      resolveEnemyInteractionState(
        playerAt({
          x: 96,
          y: 56,
        }),
        playerAt({
          x: 96,
          y: 56,
        }),
        duplicatedLevelSpec,
        initialEnemyMotion(levelSpec),
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      ),
    ).toThrow("Validated level actor definition beetle is duplicated.");
  });

  describe("armored enemy", () => {
    // The shell was kicked into a slide (not defeated, not merely touched).
    function expectShellKicked(
      result: ReturnType<typeof resolveEnemyInteractionState>,
    ): void {
      expect(result.contactedEnemyEntityIds).toEqual([]);
      expect(result.defeatedEnemyEntityIds).toEqual([]);
      expect(result.nudgedShellEnemyEntityIds).toEqual(["crab-1" as EntityId]);
      expect(
        result.nudgedShellDirectionByEntityId.get("crab-1" as EntityId),
      ).toBeDefined();
    }

    function armoredEnemyLevelSpec(): LevelSpec {
      const result = makeLevelSpec({
        widthTiles: 6,
        heightTiles: 6,
        tileSizePixels: 16,
        tileDefinitions: makeSkyGrassTileDefinitions(),
        actorDefinitions: [
          makeRunnerStartDefinition(),
          {
            actorId: "shell-crab",
            role: ActorRole.ArmoredEnemy,
          },
          makeExitDefinition(),
        ],
        tiles: makeSkyGroundTiles(6),
        actors: [
          makeRunnerStartActor(),
          {
            entityId: "crab-1",
            actorId: "shell-crab",
            x: 3,
            y: 4,
          },
          makeExitActor(5),
        ],
      });

      if (!result.ok) {
        throw new Error("Expected armored enemy level to validate.");
      }

      return result.value;
    }

    function armoredEnemyMotion(levelSpec: LevelSpec): EnemyMotionState {
      return makeInitialEnemyMotionState(levelSpec, initialMovementConstants);
    }

    function makeFallingPlayerAt(position: {
      readonly x: number;
      readonly y: number;
    }) {
      return playerWithTestState({
        position,
        velocity: {
          x: 0,
          y: 120,
        },
        movement: {
          horizontal: HorizontalMovementState.Idle,
          vertical: VerticalMovementState.Falling,
        },
      });
    }

    function makeShelledArmoredEnemyMotion(
      levelSpec: LevelSpec,
    ): EnemyMotionState {
      return {
        ...armoredEnemyMotion(levelSpec),
        armoredActors: armoredEnemyMotion(levelSpec).armoredActors.map(
          (actor) =>
            actor.entityId === "crab-1"
              ? {
                  ...actor,
                  hitPoints: 1,
                  behavior: ArmoredEnemyBehavior.Shell,
                  velocity: {
                    x: 0 as typeof actor.velocity.x,
                    y: actor.velocity.y,
                  },
                }
              : actor,
        ),
      };
    }

    it("shells an armored enemy on first stomp", () => {
      const levelSpec = armoredEnemyLevelSpec();

      expect(
        resolveEnemyInteractionState(
          playerAt({
            x: 48,
            y: 32,
          }),
          makeFallingPlayerAt({
            x: 48,
            y: 50,
          }),
          levelSpec,
          armoredEnemyMotion(levelSpec),
          initialMovementConstants,
          makeEmptyEnemyInteractionState(),
        ),
      ).toEqual({
        ...expectedEmptyEnemyInteractionState(),
        shelledEnemyEntityIds: ["crab-1"],
        // Shelling a koopa scores 100 and starts the airborne stomp chain.
        currentStompChainCount: 1,
        cumulativeStompScore: 100,
      });
    });

    it("cannot be stomped underwater — the descent is a harmful contact instead", () => {
      // Swimming, you don't stomp; the same descent that would shell a koopa on
      // land harms you (Bloopers/Cheep-cheeps are avoid-or-fireball).
      const levelSpec = armoredEnemyLevelSpec();

      expect(
        resolveEnemyInteractionState(
          playerAt({ x: 48, y: 32 }),
          makeFallingPlayerAt({ x: 48, y: 50 }),
          levelSpec,
          armoredEnemyMotion(levelSpec),
          swimmingMovementConstants,
          makeEmptyEnemyInteractionState(),
        ),
      ).toEqual(expectedEnemyContactedState("crab-1" as EntityId));
    });

    it("stomps a grounded armored enemy even when the fall lands the same frame", () => {
      // A fast drop onto an enemy standing on the ground lands on the floor the
      // same frame, so velocity.y is already zeroed — but the descent onto the
      // enemy's top must still read as a stomp, not a harmful side contact.
      const levelSpec = armoredEnemyLevelSpec();

      expect(
        resolveEnemyInteractionState(
          playerAt({ x: 48, y: 32 }),
          playerAt({ x: 48, y: 50 }),
          levelSpec,
          armoredEnemyMotion(levelSpec),
          initialMovementConstants,
          makeEmptyEnemyInteractionState(),
        ),
      ).toEqual({
        ...expectedEmptyEnemyInteractionState(),
        shelledEnemyEntityIds: ["crab-1"],
        currentStompChainCount: 1,
        cumulativeStompScore: 100,
      });
    });

    it("kicks a resting shell into a slide when stomped (never destroys it)", () => {
      const levelSpec = armoredEnemyLevelSpec();
      const shelledMotion = makeShelledArmoredEnemyMotion(levelSpec);

      const result = resolveEnemyInteractionState(
        playerAt({ x: 40, y: 32 }),
        makeFallingPlayerAt({ x: 46, y: 50 }),
        levelSpec,
        shelledMotion,
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      );

      // As in the original, the shell is kicked (nudged) rather than defeated.
      expectShellKicked(result);
    });

    it("stops a sliding shell dead when stomped", () => {
      const levelSpec = armoredEnemyLevelSpec();
      const shelledMotion = makeShelledArmoredEnemyMotion(levelSpec);
      const slidingShellMotion = {
        ...shelledMotion,
        armoredActors: shelledMotion.armoredActors.map((armoredActor) => ({
          ...armoredActor,
          velocity: {
            ...armoredActor.velocity,
            x: initialMovementConstants.shellSlideSpeed,
          },
        })),
      };

      const result = resolveEnemyInteractionState(
        playerAt({ x: 48, y: 32 }),
        makeFallingPlayerAt({ x: 48, y: 50 }),
        levelSpec,
        slidingShellMotion,
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      );

      // Stopped (re-shelled), not defeated or nudged.
      expect(result.defeatedEnemyEntityIds).toEqual([]);
      expect(result.nudgedShellEnemyEntityIds).toEqual([]);
      expect(result.shelledEnemyEntityIds).toEqual(["crab-1" as EntityId]);
    });

    it("records side contact with a shelled armored enemy", () => {
      const levelSpec = armoredEnemyLevelSpec();
      const shelledState: EnemyInteractionState = {
        ...makeEmptyEnemyInteractionState(),
        shelledEnemyEntityIds: ["crab-1" as EntityId],
      };

      expect(
        resolveEnemyInteractionState(
          playerAt({
            x: 48,
            y: 56,
          }),
          playerAt({
            x: 48,
            y: 56,
          }),
          levelSpec,
          armoredEnemyMotion(levelSpec),
          initialMovementConstants,
          shelledState,
        ),
      ).toEqual({
        ...makeEmptyEnemyInteractionState(),
        contactedEnemyEntityIds: ["crab-1"],
      });
    });

    it("nudges a shelled armored enemy when touched from the side", () => {
      const levelSpec = armoredEnemyLevelSpec();
      const shelledMotion = makeShelledArmoredEnemyMotion(levelSpec);

      const result = resolveEnemyInteractionState(
        playerAt({
          x: 40,
          y: 56,
        }),
        playerAt({
          x: 46,
          y: 56,
        }),
        levelSpec,
        shelledMotion,
        initialMovementConstants,
        makeEmptyEnemyInteractionState(),
      );

      expectShellKicked(result);
    });

    it("records harmful contact with a moving armored shell", () => {
      const levelSpec = armoredEnemyLevelSpec();
      const shelledMotion = makeShelledArmoredEnemyMotion(levelSpec);
      const movingShellMotion = {
        ...shelledMotion,
        armoredActors: shelledMotion.armoredActors.map((actor) => ({
          ...actor,
          velocity: {
            x: 180 as typeof actor.velocity.x,
            y: actor.velocity.y,
          },
        })),
      };

      expect(
        resolveEnemyInteractionState(
          playerAt({
            x: 40,
            y: 56,
          }),
          playerAt({
            x: 46,
            y: 56,
          }),
          levelSpec,
          movingShellMotion,
          initialMovementConstants,
          makeEmptyEnemyInteractionState(),
        ),
      ).toEqual({
        ...expectedEmptyEnemyInteractionState(),
        contactedEnemyEntityIds: ["crab-1"],
      });
    });
  });
});

describe("stomp chain scoring", () => {
  it("awards 200 for the second consecutive airborne stomp", () => {
    const levelSpec = adjacentEnemyLevelSpec();
    const afterFirstStomp: EnemyInteractionState = {
      ...makeEmptyEnemyInteractionState(),
      defeatedEnemyEntityIds: ["beetle-a" as EntityId],
      currentStompChainCount: 1,
      cumulativeStompScore:
        100 as EnemyInteractionState["cumulativeStompScore"],
    };
    const result = resolveEnemyInteractionState(
      fallingPlayerAt({ x: 48, y: 32 }),
      fallingPlayerAt({ x: 48, y: 50 }),
      levelSpec,
      initialEnemyMotion(levelSpec),
      initialMovementConstants,
      afterFirstStomp,
    );

    expect(result.currentStompChainCount).toBe(2);
    expect(result.cumulativeStompScore).toBe(300);
  });

  it("resets chain count to 0 when the player lands, preserving cumulative score", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const midChainState: EnemyInteractionState = {
      ...makeEmptyEnemyInteractionState(),
      currentStompChainCount: 3,
      cumulativeStompScore:
        700 as EnemyInteractionState["cumulativeStompScore"],
    };
    const result = resolveEnemyInteractionState(
      fallingPlayerAt({ x: 64, y: 16 }),
      playerAt({ x: 64, y: 16 }),
      levelSpec,
      initialEnemyMotion(levelSpec),
      initialMovementConstants,
      midChainState,
    );

    expect(result.currentStompChainCount).toBe(0);
    expect(result.cumulativeStompScore).toBe(700);
  });

  it("starts a fresh chain at 100 after a landing reset", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const resetState: EnemyInteractionState = {
      ...makeEmptyEnemyInteractionState(),
      currentStompChainCount: 0,
    };
    const result = resolveEnemyInteractionState(
      playerAt({ x: 96, y: 32 }),
      fallingPlayerAt({ x: 96, y: 45 }),
      levelSpec,
      initialEnemyMotion(levelSpec),
      initialMovementConstants,
      resetState,
    );

    expect(result.currentStompChainCount).toBe(1);
    expect(result.cumulativeStompScore).toBe(100);
  });
});

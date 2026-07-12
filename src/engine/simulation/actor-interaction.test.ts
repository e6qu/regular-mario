import { describe, expect, it } from "vitest";

import { ActorRole, makeLevelSpec, type LevelSpec } from "../domain/level-spec";
import { makeEnemyHurtbox } from "./actor-interaction";
import {
  makeExitActor,
  makeExitDefinition,
  makeRunnerStartActor,
  makeRunnerStartDefinition,
  makeSkyGrassStoneTileDefinitions,
  makeSkyGroundTiles,
} from "./level-test-support";

// Enemy hurtboxes narrow the 16×16 render box to the ROM's BoundBoxCtrlData
// width per role, centred, while keeping the top/height so stomping is
// unchanged. Enemies with a custom collider (Bowser, 28×28) keep their box.
function enemyRoleLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 12,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassStoneTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      { actorId: "goomba", role: ActorRole.Enemy },
      { actorId: "koopa", role: ActorRole.ArmoredEnemy },
      { actorId: "hammerbro", role: ActorRole.ThrowingEnemy },
      {
        actorId: "bowser",
        role: ActorRole.Enemy,
        colliderWidthPixels: 28,
        colliderHeightPixels: 28,
      },
      makeExitDefinition(),
    ],
    tiles: makeSkyGroundTiles(12),
    actors: [
      makeRunnerStartActor(),
      { entityId: "goomba-1", actorId: "goomba", x: 3, y: 4 },
      { entityId: "koopa-1", actorId: "koopa", x: 5, y: 4 },
      { entityId: "hammerbro-1", actorId: "hammerbro", x: 7, y: 4 },
      { entityId: "bowser-1", actorId: "bowser", x: 9, y: 4 },
      makeExitActor(11),
    ],
  });
  if (!result.ok) {
    throw new Error("Expected enemy-role level to validate.");
  }
  return result.value;
}

describe("makeEnemyHurtbox", () => {
  const spec = enemyRoleLevelSpec();
  const at = { x: 100, y: 200 };

  it("narrows a goomba to the ROM's 10-wide box, centred, top unchanged", () => {
    expect(makeEnemyHurtbox(spec, "goomba", ActorRole.Enemy, at)).toEqual({
      x: 103,
      y: 200,
      width: 10,
      height: 16,
    });
  });

  it("narrows a koopa to 12 wide", () => {
    expect(makeEnemyHurtbox(spec, "koopa", ActorRole.ArmoredEnemy, at)).toEqual(
      { x: 102, y: 200, width: 12, height: 16 },
    );
  });

  it("narrows a hammer bro to 8 wide", () => {
    expect(
      makeEnemyHurtbox(spec, "hammerbro", ActorRole.ThrowingEnemy, at),
    ).toEqual({ x: 104, y: 200, width: 8, height: 16 });
  });

  it("leaves a custom-collider enemy (Bowser 28×28) unchanged", () => {
    expect(makeEnemyHurtbox(spec, "bowser", ActorRole.Enemy, at)).toEqual({
      x: 100,
      y: 200,
      width: 28,
      height: 28,
    });
  });
});

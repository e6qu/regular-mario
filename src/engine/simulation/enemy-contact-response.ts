import type { EntityId } from "../domain/identifiers";
import type { LevelSpec } from "../domain/level-spec";
import type { FrameIndex, VelocityPixelsPerSecond } from "../domain/units";
import { makeFrameIndex } from "../domain/units";
import { assertValidAnyEnemyRoleEntityIdArray } from "./actor-interaction";
import type { EnemyInteractionState } from "./enemy-interaction";
import type { EnemyMotionState } from "./enemy-motion";
import { requireEnemyActorState } from "./enemy-motion";
import type { PlayerSimulationState } from "./player-state";
import { requireSimulationVelocity } from "./simulation-units";

export enum EnemySideContactSide {
  Left = "left",
  Right = "right",
}

export enum EnemyContactResponseKind {
  None = "none",
  SideContact = "side-contact",
}

export type EnemyContactResponseState =
  | {
      readonly kind: EnemyContactResponseKind.None;
    }
  | {
      readonly kind: EnemyContactResponseKind.SideContact;
      readonly enemyEntityId: EntityId;
      readonly contactSide: EnemySideContactSide;
      readonly frameIndex: FrameIndex;
      readonly velocity: {
        readonly x: VelocityPixelsPerSecond;
      };
    };

export function makeEmptyEnemyContactResponseState(): EnemyContactResponseState {
  return {
    kind: EnemyContactResponseKind.None,
  };
}

export function assertValidEnemyContactResponseState(
  responseState: unknown,
  levelSpec: LevelSpec,
): asserts responseState is EnemyContactResponseState {
  if (typeof responseState !== "object" || responseState === null) {
    throw new Error("Enemy contact response state must be an object.");
  }

  const candidate = responseState as Readonly<Record<string, unknown>>;

  switch (candidate.kind) {
    case EnemyContactResponseKind.None:
      return;
    case EnemyContactResponseKind.SideContact:
      assertValidSideContactResponseState(candidate, levelSpec);
      return;
    default:
      throw new Error(
        "Enemy contact response kind must be none or side-contact.",
      );
  }
}

export function resolveEnemyContactResponseState(
  player: PlayerSimulationState,
  enemyMotion: EnemyMotionState,
  enemyInteractions: EnemyInteractionState,
  levelSpec: LevelSpec,
  frameIndex: FrameIndex,
  sideContactKnockbackSpeed: VelocityPixelsPerSecond,
): EnemyContactResponseState {
  const contactedEnemyEntityId = enemyInteractions.contactedEnemyEntityIds[0];

  if (contactedEnemyEntityId === undefined) {
    return makeEmptyEnemyContactResponseState();
  }

  const enemyActor = requireEnemyActorState(
    enemyMotion,
    contactedEnemyEntityId,
  );
  const contactSide = makeEnemySideContactSide(
    player,
    enemyActor.position.x,
    levelSpec.tileSizePixels,
  );

  return {
    kind: EnemyContactResponseKind.SideContact,
    enemyEntityId: contactedEnemyEntityId,
    contactSide,
    frameIndex,
    velocity: {
      x: makeSideContactResponseVelocity(
        contactSide,
        sideContactKnockbackSpeed,
      ),
    },
  };
}

function assertValidSideContactResponseState(
  candidate: Readonly<Record<string, unknown>>,
  levelSpec: LevelSpec,
): void {
  assertValidAnyEnemyRoleEntityIdArray(
    [candidate.enemyEntityId],
    levelSpec,
    "Enemy contact response entity id",
    "enemyContactResponse.enemyEntityId",
  );
  makeEnemySideContactSideValue(
    candidate.contactSide,
    "enemyContactResponse.contactSide",
  );
  requireResponseFrameIndex(
    candidate.frameIndex,
    "enemyContactResponse.frameIndex",
  );

  if (typeof candidate.velocity !== "object" || candidate.velocity === null) {
    throw new Error("Enemy contact response velocity must be an object.");
  }

  requireResponseVelocity(
    (candidate.velocity as Readonly<Record<string, unknown>>).x,
    "enemyContactResponse.velocity.x",
  );
}

function makeEnemySideContactSide(
  player: PlayerSimulationState,
  enemyPositionX: number,
  tileSizePixels: number,
): EnemySideContactSide {
  const playerCenterX = player.position.x + player.collider.width / 2;
  const enemyCenterX = enemyPositionX + tileSizePixels / 2;

  return enemyCenterX < playerCenterX
    ? EnemySideContactSide.Left
    : EnemySideContactSide.Right;
}

function makeSideContactResponseVelocity(
  contactSide: EnemySideContactSide,
  sideContactKnockbackSpeed: VelocityPixelsPerSecond,
): VelocityPixelsPerSecond {
  switch (contactSide) {
    case EnemySideContactSide.Left:
      return requireResponseVelocity(
        sideContactKnockbackSpeed,
        "enemyContactResponse.velocity.x",
      );
    case EnemySideContactSide.Right:
      return requireResponseVelocity(
        0 - sideContactKnockbackSpeed,
        "enemyContactResponse.velocity.x",
      );
    default: {
      const invalidContactSide: never = contactSide;
      throw new Error(
        `Invalid enemy side contact side: ${String(invalidContactSide)}`,
      );
    }
  }
}

function makeEnemySideContactSideValue(
  value: unknown,
  path: string,
): EnemySideContactSide {
  switch (value) {
    case "left":
      return EnemySideContactSide.Left;
    case "right":
      return EnemySideContactSide.Right;
    default:
      throw new Error(`${path} must be left or right.`);
  }
}

function requireResponseFrameIndex(value: unknown, path: string): FrameIndex {
  if (typeof value !== "number") {
    throw new Error(`${path} must be a number.`);
  }

  const result = makeFrameIndex(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid frame index.`);
  }

  return result.value;
}

function requireResponseVelocity(
  value: unknown,
  path: string,
): VelocityPixelsPerSecond {
  if (typeof value !== "number") {
    throw new Error(`${path} must be a number.`);
  }

  return requireSimulationVelocity(value, path);
}

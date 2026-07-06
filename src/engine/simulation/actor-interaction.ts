import type { LevelSpec } from "../domain/level-spec";
import { ActorRole, isEnemyRole } from "../domain/level-spec";
import { makeEntityId } from "../domain/identifiers";

// Re-exported so simulation callers keep importing it from here.
export { isEnemyRole };
import type { PlayerSimulationState } from "./player-state";
import { playerOverlapsActorPixel } from "./player-actor-overlap";

export function makeActorRoleLookup(
  levelSpec: LevelSpec,
): ReadonlyMap<string, ActorRole> {
  const lookup = new Map<string, ActorRole>();

  for (const actorDefinition of levelSpec.actorDefinitions) {
    if (lookup.has(actorDefinition.actorId)) {
      throw new Error(
        `Validated level actor definition ${actorDefinition.actorId} is duplicated.`,
      );
    }

    lookup.set(actorDefinition.actorId, actorDefinition.role);
  }

  return lookup;
}

export function requireActorRole(
  lookup: ReadonlyMap<string, ActorRole>,
  actorId: string,
): ActorRole {
  const role = lookup.get(actorId);

  if (role === undefined) {
    throw new Error("Validated level actor is missing an actor definition.");
  }

  return role;
}

function requireActorDefinition(
  levelSpec: LevelSpec,
  actorId: string,
): LevelSpec["actorDefinitions"][number] {
  const actorDefinition = levelSpec.actorDefinitions.find(
    (definition) => definition.actorId === actorId,
  );

  if (actorDefinition === undefined) {
    throw new Error("Validated level actor is missing an actor definition.");
  }

  return actorDefinition;
}

export function makeActorColliderSizePixels(
  levelSpec: LevelSpec,
  actorId: string,
): { readonly width: number; readonly height: number } {
  const actorDefinition = requireActorDefinition(levelSpec, actorId);

  return {
    width: actorDefinition.colliderWidthPixels ?? levelSpec.tileSizePixels,
    height: actorDefinition.colliderHeightPixels ?? levelSpec.tileSizePixels,
  };
}

export function playerOverlapsLevelActor(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  actor: LevelSpec["actors"][number],
): boolean {
  return playerOverlapsActorPixel(
    player,
    {
      x: actor.position.x * levelSpec.tileSizePixels,
      y: actor.position.y * levelSpec.tileSizePixels,
    },
    makeActorColliderSizePixels(levelSpec, actor.actorId),
  );
}

function makeActorEntityIdSet(
  levelSpec: LevelSpec,
  predicate: (role: ActorRole) => boolean,
): ReadonlySet<string> {
  const actorRoleLookup = makeActorRoleLookup(levelSpec);
  const actorEntityIds = new Set<string>();

  for (const actor of levelSpec.actors) {
    const role = requireActorRole(actorRoleLookup, actor.actorId);

    if (predicate(role)) {
      actorEntityIds.add(actor.entityId);
    }
  }

  return actorEntityIds;
}

function makeActorEntityIdSetForRole(
  levelSpec: LevelSpec,
  targetRole: ActorRole,
): ReadonlySet<string> {
  return makeActorEntityIdSet(levelSpec, (role) => role === targetRole);
}

function makeActorEntityIdSetForAnyEnemyRole(
  levelSpec: LevelSpec,
): ReadonlySet<string> {
  return makeActorEntityIdSet(levelSpec, isEnemyRole);
}

function makeActorRoleArticle(actorRole: ActorRole): "a" | "an" {
  return actorRole === ActorRole.Item ||
    isEnemyRole(actorRole) ||
    actorRole === ActorRole.InvincibilityPowerUp ||
    actorRole === ActorRole.Climbable ||
    actorRole === ActorRole.Exit
    ? "an"
    : "a";
}

function assertValidEntityIdArrayCore(
  entityIds: unknown,
  actorEntityIds: ReadonlySet<string>,
  entityLabel: string,
  entityIdsPath: string,
  buildMissingError: (entityId: string) => string,
): asserts entityIds is readonly string[] {
  if (!Array.isArray(entityIds)) {
    throw new Error(`${entityLabel}s must be an array.`);
  }

  const seenEntityIds = new Set<string>();

  for (const [index, entityId] of entityIds.entries()) {
    if (typeof entityId !== "string") {
      throw new Error(`${entityLabel} at index ${index} must be a string.`);
    }

    const entityIdResult = makeEntityId(entityId, `${entityIdsPath}[${index}]`);

    if (!entityIdResult.ok) {
      throw new Error(`${entityLabel} at index ${index} is invalid.`);
    }

    if (seenEntityIds.has(entityId)) {
      throw new Error(`${entityLabel} ${entityId} is duplicated.`);
    }

    if (!actorEntityIds.has(entityId)) {
      throw new Error(buildMissingError(entityId));
    }

    seenEntityIds.add(entityId);
  }
}

export function assertValidActorRoleEntityIdArray(
  entityIds: unknown,
  levelSpec: LevelSpec,
  targetRole: ActorRole,
  entityLabel: string,
  entityIdsPath: string,
  extraEntityIds: readonly string[] = [],
): asserts entityIds is readonly string[] {
  const actorEntityIds = makeActorEntityIdSetForRole(levelSpec, targetRole);
  const validEntityIds = new Set([...actorEntityIds, ...extraEntityIds]);

  assertValidEntityIdArrayCore(
    entityIds,
    validEntityIds,
    entityLabel,
    entityIdsPath,
    (entityId) =>
      `${entityLabel} ${entityId} must reference ${makeActorRoleArticle(targetRole)} ${targetRole} actor.`,
  );
}

export function assertValidAnyEnemyRoleEntityIdArray(
  entityIds: unknown,
  levelSpec: LevelSpec,
  entityLabel: string,
  entityIdsPath: string,
): asserts entityIds is readonly string[] {
  const actorEntityIds = makeActorEntityIdSetForAnyEnemyRole(levelSpec);

  assertValidEntityIdArrayCore(
    entityIds,
    actorEntityIds,
    entityLabel,
    entityIdsPath,
    (entityId) => `${entityLabel} ${entityId} must reference an enemy actor.`,
  );
}

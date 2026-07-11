import type { LevelSpecInput } from "../engine/domain/level-spec";
import type { UserAssetManifest } from "../engine/domain/user-asset-manifest";

const playerStartActorRoleValue = "player-start";
const armoredEnemyActorRoleValue = "armored-enemy";

const requiredDefaultPlayerSpriteStates = [
  "small-idle",
  "small-walk",
  "small-run",
  "small-jump",
  "small-fall",
  "small-climb",
  "powered-idle",
  "powered-walk",
  "powered-run",
  "powered-jump",
  "powered-fall",
  "powered-climb",
  "recovering-idle",
  "recovering-walk",
  "recovering-run",
  "recovering-jump",
  "recovering-fall",
  "recovering-climb",
] as const;

const requiredDefaultEnemySpriteStates = ["walk-left", "walk-right"] as const;

const requiredDefaultArmoredEnemySpriteStates = [
  ...requiredDefaultEnemySpriteStates,
  "shell-idle",
  "shell-left",
  "shell-right",
] as const;

const renderedEnemyRoles = new Set<string>([
  "enemy",
  "flying-enemy",
  "chasing-enemy",
  "throwing-enemy",
  "aerial-throwing-enemy",
]);

export function validateDefaultVglcSmbSpriteCoverage(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): readonly string[] {
  const messages: string[] = [];

  if (manifest.playerSprite === undefined) {
    messages.push(
      "Default VGLC SMB dev mode requires an ignored local playerSprite asset fragment. Add .cache/user-levels/vglc-smb-assets/fragment.json with playerSprite, then run pnpm run prepare:vglc-smb-browser-demo.",
    );
  }

  const missingPlayerStateSpriteKeys =
    manifest.playerSprite === undefined
      ? []
      : findMissingKeys(
          requiredDefaultPlayerSpriteStates,
          manifest.playerSprite.stateSprites,
        );

  if (missingPlayerStateSpriteKeys.length > 0) {
    messages.push(
      `Default VGLC SMB dev mode requires ignored local playerSprite stateSprites for every rendered player state. Missing playerSprite stateSprites: ${missingPlayerStateSpriteKeys.join(", ")}.`,
    );
  }

  const missingTileSpriteIds = findMissingTileSpriteIds(manifest, levelInput);

  if (missingTileSpriteIds.length > 0) {
    messages.push(
      `Default VGLC SMB dev mode requires ignored local tileSprites for every tile id in the selected level. Missing tileSprites: ${missingTileSpriteIds.join(", ")}.`,
    );
  }

  const missingActorSpriteIds = findMissingActorSpriteIds(manifest, levelInput);

  if (missingActorSpriteIds.length > 0) {
    messages.push(
      `Default VGLC SMB dev mode requires ignored local actorSprites for every rendered actor id in the selected level. Missing actorSprites: ${missingActorSpriteIds.join(", ")}.`,
    );
  }

  const missingActorStateSpriteMessages = findMissingActorStateSpriteMessages(
    manifest,
    levelInput,
  );

  messages.push(...missingActorStateSpriteMessages);

  return messages;
}

// The "empty" tile is the transparent sky sentinel; it renders as nothing via
// the authored fallback, so an asset set need not provide a sprite for it.
const nonRenderedTileIds = new Set(["empty"]);
// Hidden blocks are invisible until bumped (the reveal shows the shared used-
// block art), and Empty-collision tiles are decorative scenery drawn by the
// authored fallback shapes — neither needs a skin sprite.
const hiddenTileCollisionValue = "hidden";
const emptyTileCollisionValue = "empty";

function findMissingTileSpriteIds(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): readonly string[] {
  const hiddenTileIds = new Set(
    levelInput.tileDefinitions
      .filter(
        (tile) =>
          tile.collision === hiddenTileCollisionValue ||
          tile.collision === emptyTileCollisionValue,
      )
      .map((tile) => tile.tileId),
  );
  const tileIds = new Set<string>();

  for (const tileRow of levelInput.tiles) {
    for (const tileId of tileRow) {
      tileIds.add(tileId);
    }
  }

  return [...tileIds]
    .filter((tileId) => !nonRenderedTileIds.has(tileId))
    .filter((tileId) => !hiddenTileIds.has(tileId))
    .filter((tileId) => manifest.tileSprites[tileId] === undefined)
    .sort();
}

function findMissingActorSpriteIds(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): readonly string[] {
  return findRequiredRenderedActorSpriteIds(levelInput)
    .filter((actorId) => manifest.actorSprites[actorId] === undefined)
    .sort();
}

function findMissingActorStateSpriteMessages(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): readonly string[] {
  const actorDefinitionsById = makeActorDefinitionsById(levelInput);
  const messages: string[] = [];

  for (const actorId of findRequiredRenderedActorSpriteIds(levelInput)) {
    const sprite = manifest.actorSprites[actorId];

    if (sprite === undefined) {
      continue;
    }

    const role = actorDefinitionsById.get(actorId)?.role;
    const requiredStates = requiredActorSpriteStatesForRole(role);
    const missingStateKeys = findMissingKeys(
      requiredStates,
      sprite.stateSprites,
    );

    if (missingStateKeys.length > 0) {
      messages.push(
        `Default VGLC SMB dev mode requires ignored local actorSprites.${actorId}.stateSprites for every rendered actor state. Missing actorSprites.${actorId}.stateSprites: ${missingStateKeys.join(", ")}.`,
      );
    }
  }

  return messages;
}

function findRequiredRenderedActorSpriteIds(
  levelInput: LevelSpecInput,
): readonly string[] {
  const actorDefinitionsById = makeActorDefinitionsById(levelInput);
  const actorIds = new Set<string>();

  for (const actor of levelInput.actors) {
    const role = actorDefinitionsById.get(actor.actorId)?.role;

    if (isRenderedNonPlayerActorRole(role)) {
      actorIds.add(actor.actorId);
    }
  }

  // Interactive blocks (?/brick blocks) spawn a contents actor (coin, mushroom,
  // 1-up, ...) that renders when dispensed — require its sprite too, so a
  // missing item sprite fails loudly instead of vector-falling-back.
  const usedTileIds = new Set<string>();
  for (const tileRow of levelInput.tiles) {
    for (const tileId of tileRow) {
      usedTileIds.add(tileId);
    }
  }
  for (const tileDefinition of levelInput.tileDefinitions) {
    if (
      usedTileIds.has(tileDefinition.tileId) &&
      tileDefinition.contentsActorId !== undefined
    ) {
      actorIds.add(tileDefinition.contentsActorId);
    }
  }

  return [...actorIds].sort();
}

function makeActorDefinitionsById(
  levelInput: LevelSpecInput,
): ReadonlyMap<string, LevelSpecInput["actorDefinitions"][number]> {
  return new Map(
    levelInput.actorDefinitions.map((definition) => [
      definition.actorId,
      definition,
    ]),
  );
}

function isRenderedNonPlayerActorRole(role: string | undefined): boolean {
  return role !== undefined && role !== playerStartActorRoleValue;
}

function requiredActorSpriteStatesForRole(
  role: string | undefined,
): readonly string[] {
  if (role === armoredEnemyActorRoleValue) {
    return requiredDefaultArmoredEnemySpriteStates;
  }

  if (role !== undefined && renderedEnemyRoles.has(role)) {
    return requiredDefaultEnemySpriteStates;
  }

  return [];
}

function findMissingKeys(
  requiredKeys: readonly string[],
  entries: Readonly<Record<string, unknown>>,
): readonly string[] {
  return requiredKeys.filter((key) => entries[key] === undefined).sort();
}

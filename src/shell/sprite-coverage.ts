import type { LevelSpecInput } from "../engine/domain/level-spec";
import type { UserAssetManifest } from "../engine/domain/user-asset-manifest";
import { drawnActorIds, drawnTileIds } from "./level-art-requirements";

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

/**
 * Every sprite a level needs that its manifest does not supply.
 *
 * Reporting the gaps rather than prose lets each caller say why it cares: dev
 * mode points at the asset fragment to regenerate, an import points at the
 * manifest the user handed us. The gaps themselves are the same question.
 */
export type MissingSpriteCoverage = {
  readonly playerSpriteAbsent: boolean;
  readonly playerStateKeys: readonly string[];
  readonly tileIds: readonly string[];
  readonly actorIds: readonly string[];
  readonly actorStateKeys: readonly {
    readonly actorId: string;
    readonly stateKeys: readonly string[];
  }[];
};

export function findMissingSpriteCoverage(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): MissingSpriteCoverage {
  return {
    playerSpriteAbsent: manifest.playerSprite === undefined,
    playerStateKeys:
      manifest.playerSprite === undefined
        ? []
        : findMissingKeys(
            requiredDefaultPlayerSpriteStates,
            manifest.playerSprite.stateSprites,
          ),
    tileIds: findMissingTileSpriteIds(manifest, levelInput),
    actorIds: findMissingActorSpriteIds(manifest, levelInput),
    actorStateKeys: findMissingActorStateSpriteKeys(manifest, levelInput),
  };
}

/**
 * Import-facing wording for the same gaps.
 *
 * An import is composed over the shipped skin, so reaching this point means the
 * level names art that neither the import nor the game has. Saying so here — at
 * the import, with the ids listed — is the difference between a legible refusal
 * and the scene throwing mid-build with the canvas already on screen.
 */
export function describeMissingImportedSpriteCoverage(
  missing: MissingSpriteCoverage,
): readonly string[] {
  const messages: string[] = [];

  if (missing.tileIds.length > 0) {
    messages.push(
      `This level uses tiles no asset set supplies art for: ${missing.tileIds.join(", ")}.`,
    );
  }

  if (missing.actorIds.length > 0) {
    messages.push(
      `This level uses actors no asset set supplies art for: ${missing.actorIds.join(", ")}.`,
    );
  }

  for (const actor of missing.actorStateKeys) {
    messages.push(
      `Actor "${actor.actorId}" is missing art for these states: ${actor.stateKeys.join(", ")}.`,
    );
  }

  return messages;
}

export function validateDefaultVglcSmbSpriteCoverage(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): readonly string[] {
  const missing = findMissingSpriteCoverage(manifest, levelInput);
  const messages: string[] = [];

  if (missing.playerSpriteAbsent) {
    messages.push(
      "Default VGLC SMB dev mode requires an ignored local playerSprite asset fragment. Add .cache/user-levels/vglc-smb-assets/fragment.json with playerSprite, then run pnpm run prepare:vglc-smb-browser-demo.",
    );
  }

  if (missing.playerStateKeys.length > 0) {
    messages.push(
      `Default VGLC SMB dev mode requires ignored local playerSprite stateSprites for every rendered player state. Missing playerSprite stateSprites: ${missing.playerStateKeys.join(", ")}.`,
    );
  }

  if (missing.tileIds.length > 0) {
    messages.push(
      `Default VGLC SMB dev mode requires ignored local tileSprites for every tile id in the selected level. Missing tileSprites: ${missing.tileIds.join(", ")}.`,
    );
  }

  if (missing.actorIds.length > 0) {
    messages.push(
      `Default VGLC SMB dev mode requires ignored local actorSprites for every rendered actor id in the selected level. Missing actorSprites: ${missing.actorIds.join(", ")}.`,
    );
  }

  for (const actor of missing.actorStateKeys) {
    messages.push(
      `Default VGLC SMB dev mode requires ignored local actorSprites.${actor.actorId}.stateSprites for every rendered actor state. Missing actorSprites.${actor.actorId}.stateSprites: ${actor.stateKeys.join(", ")}.`,
    );
  }

  return messages;
}

function findMissingTileSpriteIds(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): readonly string[] {
  return drawnTileIds(levelInput).filter(
    (tileId) => manifest.tileSprites[tileId] === undefined,
  );
}

function findMissingActorSpriteIds(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): readonly string[] {
  return findRequiredRenderedActorSpriteIds(levelInput).filter(
    (actorId) => manifest.actorSprites[actorId] === undefined,
  );
}

function findMissingActorStateSpriteKeys(
  manifest: UserAssetManifest,
  levelInput: LevelSpecInput,
): MissingSpriteCoverage["actorStateKeys"] {
  const actorDefinitionsById = makeActorDefinitionsById(levelInput);
  const missing: {
    readonly actorId: string;
    readonly stateKeys: readonly string[];
  }[] = [];

  for (const actorId of findRequiredRenderedActorSpriteIds(levelInput)) {
    const sprite = manifest.actorSprites[actorId];

    if (sprite === undefined) {
      continue;
    }

    const role = actorDefinitionsById.get(actorId)?.role;
    const requiredStates = requiredActorSpriteStatesForRole(role);
    const stateKeys = findMissingKeys(requiredStates, sprite.stateSprites);

    if (stateKeys.length > 0) {
      missing.push({ actorId, stateKeys });
    }
  }

  return missing;
}

// Includes what interactive blocks dispense (coin, mushroom, 1-up, ...): an
// item that appears when a block is bumped is as rendered as one placed by hand.
function findRequiredRenderedActorSpriteIds(
  levelInput: LevelSpecInput,
): readonly string[] {
  return drawnActorIds(levelInput);
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

import type { UserAssetManifest } from "../engine/domain/user-asset-manifest";
import type { UserAssetBundle } from "./user-asset-loader";

/**
 * Compose an imported bundle over the shipped skin.
 *
 * An import carries either a whole content set (art plus levels) or only
 * levels — the shared remote-demo links do exactly the latter. A level-only
 * import is not a broken asset set; it is a level, and it plays with the art
 * the game already has, exactly as the editor plays a custom level against a
 * selected skin.
 *
 * This is composition, not substitution. The result is one complete bundle
 * decided before the scene starts, so the scene's `requireTileImage` /
 * `requireActorImage` / `requireReactionImage` stay hard invariants instead of
 * degrading into per-draw fallbacks. Anything the import does supply wins;
 * everything else comes from the skin.
 *
 * Levels are deliberately *not* merged: the import offers its own levels to
 * play, and folding the skin's levels in would silently extend the menu the
 * user chose from.
 */
export function composeImportedBundleOverSkin(
  imported: UserAssetBundle,
  skin: UserAssetBundle,
): UserAssetBundle {
  return {
    manifest: composeManifest(imported.manifest, skin.manifest),
    tileImages: overlayMap(skin.tileImages, imported.tileImages),
    reactionImages: overlayMap(skin.reactionImages, imported.reactionImages),
    actorImages: overlayMap(skin.actorImages, imported.actorImages),
    playerImage: imported.playerImage ?? skin.playerImage,
    levelVisualImages: overlayMap(
      skin.levelVisualImages,
      imported.levelVisualImages,
    ),
    sounds: overlayMap(skin.sounds, imported.sounds),
    music: overlayMap(skin.music, imported.music),
    levels: imported.levels,
  };
}

/**
 * The composed manifest describes the art the composed bundle actually holds,
 * so sprite-coverage validation sees what the scene will see. Its `levels`
 * stay the import's own, matching the composed bundle's levels.
 */
function composeManifest(
  imported: UserAssetManifest,
  skin: UserAssetManifest,
): UserAssetManifest {
  return {
    version: imported.version,
    tileSprites: { ...skin.tileSprites, ...imported.tileSprites },
    actorSprites: { ...skin.actorSprites, ...imported.actorSprites },
    playerSprite: imported.playerSprite ?? skin.playerSprite,
    reactionSprites: { ...skin.reactionSprites, ...imported.reactionSprites },
    levelVisuals: { ...skin.levelVisuals, ...imported.levelVisuals },
    sounds: { ...skin.sounds, ...imported.sounds },
    music: { ...skin.music, ...imported.music },
    levels: imported.levels,
  };
}

function overlayMap<Value>(
  base: ReadonlyMap<string, Value>,
  override: ReadonlyMap<string, Value>,
): ReadonlyMap<string, Value> {
  return new Map([...base, ...override]);
}

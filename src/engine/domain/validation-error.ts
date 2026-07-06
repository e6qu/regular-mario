import type { Brand } from "./brand";

export enum ValidationErrorCode {
  ActorCoordinateInvalid = "actor-coordinate-invalid",
  ActorDefinitionDuplicate = "actor-definition-duplicate",
  ActorIdInvalid = "actor-id-invalid",
  ActorPositionOutOfBounds = "actor-position-out-of-bounds",
  ActorRoleInvalid = "actor-role-invalid",
  AccelerationInvalid = "acceleration-invalid",
  ColliderDimensionInvalid = "collider-dimension-invalid",
  CompatibilityActorInvalid = "compatibility-actor-invalid",
  CompatibilityBehaviorProfileIdInvalid = "compatibility-behavior-profile-id-invalid",
  CompatibilityFeatureInvalid = "compatibility-feature-invalid",
  CompatibilityNumberInvalid = "compatibility-number-invalid",
  CompatibilityProfileIdInvalid = "compatibility-profile-id-invalid",
  CompatibilitySourceActorIdInvalid = "compatibility-source-actor-id-invalid",
  CompatibilityStateIdInvalid = "compatibility-state-id-invalid",
  ContentSetIdentityInvalid = "content-set-identity-invalid",
  AssetSetEmpty = "asset-set-empty",
  MapSetLevelsEmpty = "map-set-levels-empty",
  DimensionInvalid = "dimension-invalid",
  EntityIdDuplicate = "entity-id-duplicate",
  EntityIdInvalid = "entity-id-invalid",
  ExitCountInvalid = "exit-count-invalid",
  FrameDurationInvalid = "frame-duration-invalid",
  FrameIndexInvalid = "frame-index-invalid",
  HorizontalInputInvalid = "horizontal-input-invalid",
  InvincibilityFrameCountInvalid = "invincibility-frame-count-invalid",
  LevelTimerInvalid = "level-timer-invalid",
  PathAnnotationInvalid = "path-annotation-invalid",
  PlayerStartCountInvalid = "player-start-count-invalid",
  PixelDistanceInvalid = "pixel-distance-invalid",
  PixelDeltaInvalid = "pixel-delta-invalid",
  PixelPositionInvalid = "pixel-position-invalid",
  RecoveryFrameCountInvalid = "recovery-frame-count-invalid",
  ReplayFrameCountInvalid = "replay-frame-count-invalid",
  TileCollisionInvalid = "tile-collision-invalid",
  TileContentsActorNotItemOrPowerUp = "tile-contents-actor-not-item-or-power-up",
  TileContentsActorUnknown = "tile-contents-actor-unknown",
  TileContentsOnNonInteractiveBlock = "tile-contents-on-non-interactive-block",
  TileContentSpawnLimitInvalid = "tile-content-spawn-limit-invalid",
  TileContentSpawnCooldownInvalid = "tile-content-spawn-cooldown-invalid",
  TileCoordinateInvalid = "tile-coordinate-invalid",
  PipeOnlyTargetTile = "pipe-only-target-tile",
  PipeTargetTileRequired = "pipe-target-tile-required",
  TileDefinitionDuplicate = "tile-definition-duplicate",
  TileGridHeightMismatch = "tile-grid-height-mismatch",
  TileGridWidthMismatch = "tile-grid-width-mismatch",
  TileIdInvalid = "tile-id-invalid",
  TileSizeInvalid = "tile-size-invalid",
  TimedHazardProjectileInvalid = "timed-hazard-projectile-invalid",
  UnknownActorId = "unknown-actor-id",
  UnknownTileId = "unknown-tile-id",
  VelocityInvalid = "velocity-invalid",
  BooleanInputInvalid = "boolean-input-invalid",
  ValidationPathInvalid = "validation-path-invalid",
  CoyoteFrameCountInvalid = "coyote-frame-count-invalid",
  JumpBufferFrameCountInvalid = "jump-buffer-frame-count-invalid",
  ProjectileFrameCountInvalid = "projectile-frame-count-invalid",
  VglcTileCharacterUnknown = "vglc-tile-character-unknown",
  VglcActorCharacterUnknown = "vglc-actor-character-unknown",
  VglcCharacterUnsupported = "vglc-character-unsupported",
  VglcMetadataInvalid = "vglc-metadata-invalid",
  VglcMetadataMissing = "vglc-metadata-missing",
  VglcMetadataUnsupported = "vglc-metadata-unsupported",
  VglcGridWidthMismatch = "vglc-grid-width-mismatch",
  VglcGridHeightMismatch = "vglc-grid-height-mismatch",
  VglcLegendKeyInvalid = "vglc-legend-key-invalid",
  TiledTileNotSquare = "tiled-tile-not-square",
  TiledTileLayerMissing = "tiled-tile-layer-missing",
  TiledTileLayerLengthMismatch = "tiled-tile-layer-length-mismatch",
  TiledUnknownGlobalTileId = "tiled-unknown-global-tile-id",
  TiledObjectNameMissing = "tiled-object-name-missing",
  TiledObjectRoleMissing = "tiled-object-role-missing",
  EnemyPatrolSpeedEntityNotEnemy = "enemy-patrol-speed-entity-not-enemy",
  ManifestVersionUnsupported = "manifest-version-unsupported",
  ManifestSpriteEntryInvalid = "manifest-sprite-entry-invalid",
  ManifestAssetSourceInvalid = "manifest-asset-source-invalid",
  ManifestAssetSourceKindInvalid = "manifest-asset-source-kind-invalid",
  ManifestAssetSourceFileNameInvalid = "manifest-asset-source-file-name-invalid",
  ManifestAssetSourceUrlInvalid = "manifest-asset-source-url-invalid",
  ManifestSpriteFrameInvalid = "manifest-sprite-frame-invalid",
  ManifestIntegerInvalid = "manifest-integer-invalid",
  ManifestAudioEntryInvalid = "manifest-audio-entry-invalid",
  ManifestLevelEntryInvalid = "manifest-level-entry-invalid",
  ManifestLevelNameInvalid = "manifest-level-name-invalid",
  ManifestLevelFormatInvalid = "manifest-level-format-invalid",
  UserLevelOriginalJsonInvalid = "user-level-original-json-invalid",
  UserLevelTiledJsonInvalid = "user-level-tiled-json-invalid",
  UserLevelVglcTextInvalid = "user-level-vglc-text-invalid",
  UserLevelVglcTextJsonInvalid = "user-level-vglc-text-json-invalid",
}

type ValidationPath = Brand<string, "ValidationPath">;

export type ValidationError = {
  readonly code: ValidationErrorCode;
  readonly message: string;
  readonly path: ValidationPath;
};

export function makeValidationError(
  code: ValidationErrorCode,
  message: string,
  path: string,
): ValidationError {
  if (message.trim().length === 0) {
    throw new Error("ValidationError message requires non-empty text.");
  }

  if (path.trim().length === 0) {
    throw new Error("ValidationError path requires non-empty text.");
  }

  return {
    code,
    message,
    path: path as ValidationPath,
  };
}

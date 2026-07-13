import type {
  ActorRole,
  LevelSpec,
  TileCollisionKind,
} from "../engine/domain/level-spec";
import type { LevelTheme } from "./browser-level-selection";
import type { EnemyContactResponseState } from "../engine/simulation/enemy-contact-response";
import type { LevelContactState } from "../engine/simulation/level-contact";
import type { PlayerOutcomeState } from "../engine/simulation/player-outcome";
import type { PlayerReactionState } from "../engine/simulation/player-reaction";
import type { PlayerSimulationState } from "../engine/simulation/player-state";
import type { PlayerVitalityState } from "../engine/simulation/player-vitality";
import type { StompReactionState } from "../engine/simulation/stomp-reaction";

export type BrowserLevelCollisionKind =
  LevelSpec["tileDefinitions"][number]["collision"];
export type BrowserActorRole = LevelSpec["actorDefinitions"][number]["role"];
export type BrowserRenderedActorRole = Exclude<
  BrowserActorRole,
  ActorRole.PlayerStart | ActorRole.Pipe
>;

export type BrowserLevelCollisionCounts = {
  readonly [TileCollisionKind.Empty]: number;
  readonly [TileCollisionKind.Solid]: number;
  readonly [TileCollisionKind.Interactive]: number;
  readonly [TileCollisionKind.Breakable]: number;
  readonly [TileCollisionKind.SolidHazard]: number;
  readonly [TileCollisionKind.Hazard]: number;
  readonly [TileCollisionKind.Spring]: number;
  readonly [TileCollisionKind.Goal]: number;
  readonly [TileCollisionKind.Hidden]: number;
};

type BrowserLevelSnapshot = {
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileSizePixels: number;
  readonly renderedTileCount: number;
  readonly collisionCounts: BrowserLevelCollisionCounts;
};

export type BrowserRenderedActorRoleCounts = {
  readonly [ActorRole.Enemy]: number;
  readonly [ActorRole.FlyingEnemy]: number;
  readonly [ActorRole.ChasingEnemy]: number;
  readonly [ActorRole.ArmoredEnemy]: number;
  readonly [ActorRole.ThrowingEnemy]: number;
  readonly [ActorRole.AerialThrowingEnemy]: number;
  readonly [ActorRole.PiranhaPlant]: number;
  readonly [ActorRole.Coin]: number;
  readonly [ActorRole.Item]: number;
  readonly [ActorRole.PowerUp]: number;
  readonly [ActorRole.ExtraLife]: number;
  readonly [ActorRole.InvincibilityPowerUp]: number;
  readonly [ActorRole.Climbable]: number;
  readonly [ActorRole.Exit]: number;
};

export type BrowserRenderedActorSnapshot = {
  readonly entityId: string;
  readonly actorId: string;
  readonly role: BrowserRenderedActorRole;
  readonly tilePosition: {
    readonly x: number;
    readonly y: number;
  };
  readonly pixelPosition: {
    readonly x: number;
    readonly y: number;
  };
};

export type BrowserActorsSnapshot = {
  readonly renderedActorCount: number;
  readonly roleCounts: BrowserRenderedActorRoleCounts;
  readonly actors: readonly BrowserRenderedActorSnapshot[];
};

type BrowserOutcomeFeedbackSnapshot = {
  readonly visible: boolean;
  readonly text: string;
};

type BrowserCollectiblesSnapshot = {
  readonly collectedCoinEntityIds: readonly string[];
  readonly collectedItemEntityIds: readonly string[];
  readonly collectedExtraLifeEntityIds: readonly string[];
};

type BrowserPowerUpsSnapshot = {
  readonly collectedPowerUpEntityIds: readonly string[];
};

type BrowserPlayerInvincibilitySnapshot = {
  readonly collectedInvincibilityEntityIds: readonly string[];
  readonly remainingFrames: number;
};

type BrowserInteractiveBlocksSnapshot = {
  readonly bumpedBlockTilePositions: readonly {
    readonly x: number;
    readonly y: number;
  }[];
};

type BrowserBreakableBlocksSnapshot = {
  readonly brokenBlockTilePositions: readonly {
    readonly x: number;
    readonly y: number;
  }[];
};

type BrowserSpawnedActorsSnapshot = {
  readonly spawnedActors: readonly {
    readonly entityId: string;
    readonly actorId: string;
    readonly role: BrowserRenderedActorRole;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly collectionMode: string;
    readonly remainingPopupFrames: number;
    readonly sourceBlockTilePosition: {
      readonly x: number;
      readonly y: number;
    };
    readonly position: {
      readonly x: number;
      readonly y: number;
    };
    readonly active: boolean;
  }[];
};

type BrowserPipeEntrySnapshot = {
  readonly phase: string;
  readonly pipeEntityId: string | undefined;
  readonly targetLevelName: string | undefined;
  readonly targetTilePosition:
    | { readonly x: number; readonly y: number }
    | undefined;
  readonly remainingFrames: number;
};

type BrowserProjectilesSnapshot = {
  readonly projectiles: readonly {
    readonly id: string;
    readonly position: {
      readonly x: number;
      readonly y: number;
    };
    readonly width: number;
    readonly height: number;
    readonly active: boolean;
  }[];
};

type BrowserTimedHazardProjectilesSnapshot = {
  readonly projectiles: readonly {
    readonly id: string;
    readonly position: {
      readonly x: number;
      readonly y: number;
    };
    readonly width: number;
    readonly height: number;
    readonly active: boolean;
  }[];
  readonly playerContact: boolean;
};

type BrowserEnemiesSnapshot = {
  readonly contactedEnemyEntityIds: readonly string[];
  readonly defeatedEnemyEntityIds: readonly string[];
};

// A latched snapshot of the frame an enemy contact first occurred, so a test can
// observe that one-frame event without racing the live frame (the game steps
// multiple sim frames per rendered frame under load and then pauses on death).
export type BrowserEnemyContactObservation = {
  readonly frameIndex: number;
  readonly levelContacts: LevelContactState;
  readonly enemies: BrowserEnemiesSnapshot;
  readonly enemyContactResponse: EnemyContactResponseState;
  readonly playerVelocityX: number;
  readonly playerOutcome: PlayerOutcomeState;
};

type BrowserCameraSnapshot = {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly viewportWidthPixels: number;
  readonly viewportHeightPixels: number;
  readonly worldWidthPixels: number;
  readonly worldHeightPixels: number;
  // Zoom and the visible world rectangle's top-left, so tests can map a world
  // position to a canvas pixel: canvasX = (worldX - worldViewX) * zoom.
  readonly zoom: number;
  readonly worldViewX: number;
  readonly worldViewY: number;
};

type BrowserLevelProgressionSnapshot = {
  readonly levelIndex: number;
  readonly levelCount: number;
  // The theme of the section currently being played (switches on pipe warps).
  readonly theme: LevelTheme | undefined;
};

type BrowserLevelTimerSnapshot = {
  readonly remainingFrames: number | undefined;
};

type BrowserPathAnnotationsSnapshot = {
  readonly paths: readonly {
    readonly pathId: string;
    readonly points: readonly {
      readonly x: number;
      readonly y: number;
    }[];
  }[];
};

// The shabby death animation currently playing (see boot-scene's death effect
// system): its cause-specific style and the live counts of spawned pieces.
type BrowserDeathEffectSnapshot = {
  readonly started: boolean;
  readonly style:
    | "launch"
    | "explode"
    | "burn"
    | "float"
    | "impale"
    | undefined;
  readonly pieceCount: number;
  readonly smokeCount: number;
  readonly xEyesVisible: boolean;
  // Enemies knocked off the field by flung body parts (explode style).
  readonly knockedEnemyCount: number;
};

export type BrowserSimulationSnapshot = {
  readonly frameIndex: number;
  readonly score: number;
  readonly coinCount: number;
  readonly bloodiness: number;
  readonly extraLifeCount: number;
  readonly livesRemaining: number;
  readonly gameOver: boolean;
  readonly warpZone: boolean;
  readonly timeBonusCountdownUnits: number;
  readonly paused: boolean;
  readonly deathEffect: BrowserDeathEffectSnapshot;
  readonly lastSoundEvents: readonly string[];
  // How many hard-landing ground quakes (screen shakes) have fired so far — a
  // hard fall of more than two blocks bumps this. Lets tests observe the
  // otherwise transient camera shake.
  readonly groundQuakeCount: number;
  readonly level: BrowserLevelSnapshot;
  readonly levelProgression: BrowserLevelProgressionSnapshot;
  readonly levelTimer: BrowserLevelTimerSnapshot;
  readonly pathAnnotations: BrowserPathAnnotationsSnapshot;
  readonly camera: BrowserCameraSnapshot;
  readonly levelContacts: LevelContactState;
  readonly playerVitality: PlayerVitalityState;
  readonly playerInvincibility: BrowserPlayerInvincibilitySnapshot;
  readonly playerOutcome: PlayerOutcomeState;
  readonly collectibles: BrowserCollectiblesSnapshot;
  readonly powerUps: BrowserPowerUpsSnapshot;
  readonly interactiveBlocks: BrowserInteractiveBlocksSnapshot;
  readonly breakableBlocks: BrowserBreakableBlocksSnapshot;
  readonly spawnedActors: BrowserSpawnedActorsSnapshot;
  readonly projectiles: BrowserProjectilesSnapshot;
  readonly timedHazardProjectiles: BrowserTimedHazardProjectilesSnapshot;
  readonly pipeEntry: BrowserPipeEntrySnapshot;
  readonly enemies: BrowserEnemiesSnapshot;
  readonly enemyContactResponse: EnemyContactResponseState;
  // The latched contact-frame observation, or undefined until an enemy is first
  // contacted this level (see BrowserEnemyContactObservation).
  readonly lastEnemyContact: BrowserEnemyContactObservation | undefined;
  readonly outcomeFeedback: BrowserOutcomeFeedbackSnapshot;
  readonly actors: BrowserActorsSnapshot;
  readonly player: PlayerSimulationState;
  readonly playerReaction: PlayerReactionState;
  readonly enemyStompReaction: StompReactionState;
};

export type BrowserPlatformerDebugApi = {
  readonly getSimulationSnapshot: () => BrowserSimulationSnapshot;
};

declare global {
  interface Window {
    __originalBrowserPlatformerDebug?: BrowserPlatformerDebugApi;
    // Headless replay hook: when set before the scene reads input, the run's
    // per-frame inputs are played back deterministically instead of the live
    // keyboard, so a recorded run.json can be reproduced (and screenshotted)
    // against the real content set.
    __marioReplayInputs?: readonly BrowserReplayInputCommand[];
  }
}

// Structural mirror of SimulationInputCommand kept dependency-light for the
// injectable global (the values are validated when the scene consumes them).
type BrowserReplayInputCommand = {
  readonly horizontal: string;
  readonly jumpPressed: boolean;
  readonly runHeld: boolean;
  readonly firePressed: boolean;
  readonly upHeld: boolean;
  readonly downHeld: boolean;
};

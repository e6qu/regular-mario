import Phaser from "phaser";
import { makeLavaTileIds } from "../../engine/simulation/tile-collision-support";

import {
  ActorRole,
  isEnemyRole,
  makeLevelSpec,
  TileCollisionKind,
  type LevelSpec,
  type LevelSpecInput,
} from "../../engine/domain/level-spec";
import type { TilePoint } from "../../engine/domain/units";
import {
  makePixelPosition,
  makeVelocityPixelsPerSecond,
} from "../../engine/domain/units";
import { assertValidCollectibleInteractionState } from "../../engine/simulation/collectible-interaction";
import { liveFrenzyCheeps } from "../../engine/simulation/cheep-frenzy-state";
import {
  AerialFrenzyKind,
  liveAerialFrenzyEntities,
} from "../../engine/simulation/aerial-frenzy-state";
import { liveHatchedSpinies } from "../../engine/simulation/hatched-spiny-state";
import {
  computeFirebarOrbs,
  computePodobooPositions,
} from "../../engine/simulation/flame-hazards";
import { computePlatformPlacements } from "../../engine/simulation/platform-state";
import {
  coinsPerExtraLife,
  computeEnemyScore,
  computeTotalScore,
  fireworksCountForDisplayTime,
  fireworksScorePerBurst,
  scorePerTimeBonusDisplayUnit,
  timeBonusFramesPerDisplayUnit,
} from "../../engine/simulation/game-score";
import {
  assertValidEnemyContactResponseState,
  EnemyContactResponseKind,
} from "../../engine/simulation/enemy-contact-response";
import { assertValidEnemyInteractionState } from "../../engine/simulation/enemy-interaction";
import {
  ArmoredEnemyBehavior,
  assertValidEnemyMotionState,
  requireArmoredEnemyActorState,
  requireEnemyActorState,
  shellReviveShakeOffsetPixels,
} from "../../engine/simulation/enemy-motion";
import {
  HorizontalInput,
  makeSimulationInputCommand,
  type SimulationInputCommand,
} from "../../engine/simulation/input-command";
import {
  initialMovementConstants,
  swimmingMovementConstants,
  type MovementConstants,
  HorizontalMovementState,
  VerticalMovementState,
} from "../../engine/simulation/movement-model";
import { SpawnedActorCollectionMode } from "../../engine/simulation/interactive-block-state";
import {
  assertValidPlayerOutcomeState,
  PlayerDefeatReason,
  PlayerOutcomeKind,
} from "../../engine/simulation/player-outcome";
import { PlayerReactionKind } from "../../engine/simulation/player-reaction";
import {
  assertValidPlayerVitalityState,
  isEnlargedPlayerVitalityKind,
  makeInitialPlayerVitalityState,
  PlayerVitalityKind,
  type PlayerVitalityState,
} from "../../engine/simulation/player-vitality";
import {
  initialPlayerSimulationStateConfig,
  resizePlayerForVitality,
} from "../../engine/simulation/player-state";
import {
  initialLivesCount,
  makeInitialSimulationStateWithPlayerVitality,
  type SimulationState,
} from "../../engine/simulation/simulation-state";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "../../engine/simulation/simulation-units";
import {
  resolveSoundEvents,
  SoundEvent,
} from "../../engine/simulation/sound-events";
import { stepSimulation } from "../../engine/simulation/step-simulation";
import {
  makePlayerTileColumnSpan,
  makePlayerTileRowSpan,
} from "../../engine/simulation/player-tile-span";
import {
  PipeEntryPhase,
  teleportPlayerToTilePosition,
} from "../../engine/simulation/pipe-state";
import type {
  BrowserGameBootstrap,
  LevelTheme,
} from "../browser-level-selection";
import { GameAudio, type DeathSoundKind } from "../game-audio";
import { hardLandingDropTiles, resolveGroundQuake } from "../ground-quake";
import {
  applyCharacterToCandidates,
  defaultPlayerCharacter,
  defaultRevengePlayerCharacter,
  revengePlayerCharacters,
  robotCharacterForBotIndex,
  type PlayerCharacter,
} from "../player-character";
import { makeBotInputCommands } from "../coop-bot-input";
import { robotNameForBotSpawn } from "../coop-bot-names";
import {
  resolveDeathPartCollisions,
  stepDeathPartBody,
  type DeathPartBody,
  type DeathPartBox,
  type DeathPartPhysicsParams,
} from "../death-part-physics";
import {
  buildRunExport,
  buildRunZip,
  downloadBytes,
  serializeRunExport,
} from "../run-export";
import { RunRecorder } from "../run-recorder";
import {
  RunTimelineOverlay,
  type RunTimelineThumbnail,
} from "../run-timeline-overlay";
import type {
  BrowserActorsSnapshot,
  BrowserActorRole,
  BrowserLevelCollisionCounts,
  BrowserLevelCollisionKind,
  BrowserEnemyContactObservation,
  BrowserPlatformerDebugApi,
  BrowserRenderedActorSnapshot,
  BrowserRenderedActorRole,
  BrowserRenderedActorRoleCounts,
  BrowserSimulationSnapshot,
} from "../browser-debug-api";
import type {
  LoadedImageAsset,
  LoadedLevelVisualAsset,
  LoadedStatefulImageAsset,
  UserAssetBundle,
} from "../user-asset-loader";

const initialFrameDurationMilliseconds =
  nominalSixtyHertzFrameDurationMilliseconds;
const outcomeFeedbackPositionX = 300;
const outcomeFeedbackPositionY = 54;
const scoreTextPositionX = 8;
// How long a floating "+points" score popup rises and fades.
const scorePopupFrames = 36;
// Victory-firework tuning: frames between successive bursts and how long each
// sparkle lives (the per-burst score lives in game-score).
const fireworksBurstIntervalFrames = 20;
const fireworkLifetimeFrames = 26;
// Below this displayed time the "hurry up!" sting fires and the music speeds up.
const timeWarningDisplaySeconds = 100;
const timeWarningTempoScale = 1.35;
// End-of-level time-bonus countdown: display units drained per frame (a rapid
// tick), and a short hold at zero before the level advances.
const timeBonusCountdownUnitsPerFrame = 4;
const timeBonusCountdownHoldFrames = 24;
// A stomped Goomba stays squashed on the ground for this many frames before it
// is removed (the original's flatten-then-vanish), instead of blinking out.
const stompedGoombaFlattenFrames = 42;
const stompedGoombaSquashScaleY = 0.45;
// The "WELCOME TO WARP ZONE!" wall label sits above the tiles but below the HUD.
const warpBannerDepth = 55;
// A death auto-plays an instant replay of the run's final seconds (ending in
// the death animation) when the timeline opens.
const deathInstantReplayLeadFrames = 180;
// Contact deaths append their animation to the timeline as scrubbable frames:
// the run's recorded frames are followed by this many death-animation frames,
// each deterministically rebuilt on seek (the effects use no randomness).
const deathTimelineFrameCount = 180;
// Additional co-op players (demo bots) each wear a distinct Futurama-inspired
// robot costume (cycled by index via robotCharacterForBotIndex) so a crowd of
// bots reads as separate machines rather than clones of the primary player.
// Flow screens: how long the "WORLD w-l" intro card holds the level frozen
// before play begins. (The starting life count is the engine's
// initialLivesCount.)
const worldCardFrames = 120;
// The "TIME UP" beat shown before the world card when the clock ran out.
const timeUpCardFrames = 90;
const flowCardDepth = 200;
const scoreBadgeX = 4;
const scoreBadgeY = 3;
const scoreBadgeWidth = 56;
const scoreBadgeHeight = 14;
const scoreBadgeColor = 0x1f2937;
const scoreBadgeStrokeColor = 0xf59e0b;
const scoreGemX = 8;
const scoreGemY = 6;
const scoreGemSize = 8;
const flagpoleSlideSpeedPixels = 4;
// The standard on-ground actor sprite height; taller sprites are bottom-aligned
// to this baseline so their feet rest on the ground.
const groundedActorSpriteHeightPixels = 16;
// Death arc: on a contact death the player pops up then falls off-screen, like
// the original, instead of freezing in place. This is the "launch" style; the
// shabby death system dispatches to a cause-specific style below.
const deathArcPopSpeedPixels = 6;
const deathArcGravityPixels = 0.35;
const deathArcOffscreenMarginPixels = 96;
// The shabby, cause-specific death animation styles: "launch" is the classic
// pop-and-fall arc; "explode" scatters the player's body into falling pieces
// (enemy contact); "burn" chars and collapses him into rising smoke (lava/fire);
// "float" flips him belly-up with X-ed eyes and drifts him to the surface
// (drowning); "impale" pins him limp on the spikes he fell onto.
type DeathEffectStyle = "launch" | "explode" | "burn" | "float" | "impale";
// Explode: a small initial blast dismembers the body; each chunk (head, torso,
// limbs) is flung only slightly outward and then falls under gravity like a
// projectile. Kept slow with a long hold so the dismemberment reads clearly.
const deathExplodePopSpeedPixels = 3.4;
const deathExplodeSpinRadiansPerFrame = 0.12;
// Tile-collision kinds a falling body part rests on: anything a body would land
// on — ground, pipes, and blocks (bricks / question blocks). Non-solid hazards
// (lava/spikes) and goals don't stop a part, so it falls through them.
const deathPartBlockingCollisionKinds: ReadonlySet<TileCollisionKind> = new Set(
  [
    TileCollisionKind.Solid,
    TileCollisionKind.SolidHazard,
    TileCollisionKind.Interactive,
    TileCollisionKind.Breakable,
  ],
);
// Box physics for the flung parts: a fairly bouncy ("rubber") restitution that
// still decays, gravity a touch heavier than the launch arc for weight, and a
// stop speed so bounces settle instead of jittering forever. The part box is a
// bit smaller than a whole tile (limbs/head).
const deathPartPhysicsParams: DeathPartPhysicsParams = {
  gravity: 0.3,
  restitution: 0.55,
  friction: 0.82,
  stopSpeed: 0.8,
  tileSize: 16,
};
const deathPartHalfExtentFraction = 0.28;

// A flung, spinning dismemberment part in flight: its AABB physics body, the
// image that tracks it, and (for the primary's head) an X-ed-eyes overlay that
// rides along. Shared by the primary player's explosion and each bot's.
type FlyingDeathPart = {
  readonly image: Phaser.GameObjects.Image;
  readonly body: DeathPartBody;
  vr: number;
  readonly eyes?: Phaser.GameObjects.Image;
};

// What a flung part can strike: a live enemy (knocked out) or another co-op bot
// (taken out). Enemies carry their entity id; bots carry their players[] slice
// index (offset by one past the primary).
type DeathPartTarget =
  | { readonly kind: "enemy"; readonly entityId: string }
  | { readonly kind: "coop"; readonly index: number };

// When a part strikes a live enemy, the enemy pops up and flips over, then falls.
const deathKnockedEnemyPopSpeedPixels = 3.2;
const deathKnockedEnemyGravityPixels = 0.28;
const deathKnockedEnemySpinRadians = 0.24;
// A quick expanding starburst flash at the moment of dismemberment.
const deathBurstLifeFrames = 16;
const deathBurstMaxScale = 2.6;
// Burn: the body catches fire at full size for ~1s, then falls as a charred
// ragdoll husk (it no longer shrinks away).
const deathBurnFireFrames = 66;
const deathBurnSmokeIntervalFrames = 6;
const deathBurnSmokeRiseSpeedPixels = 0.8;
const deathBurnSmokeLifeFrames = 44;
const deathBurnDurationFrames = 150;
const deathBurnFlameCount = 3;
const deathBurnFlameFlickerAmplitude = 0.25;
// Husk ragdoll fall: topple speed and gravity once the fire has done its work.
const deathBurnHuskSpinRadiansPerFrame = 0.11;
const deathBurnHuskGravityPixels = 0.34;
const deathBurnHuskPopSpeedPixels = 1.6;
// Float: a drowned drift up to the surface with a gentle side-to-side wobble.
const deathFloatRiseSpeedPixels = 0.75;
const deathFloatWobbleAmplitudePixels = 1.4;
const deathFloatWobbleFramesPerCycle = 40;
// The float stops this many pixels below the top of the level (its "surface").
const deathFloatSurfaceMarginPixels = 6;
// A brief hold at the surface once the body has floated up, before the menu.
const deathFloatSurfaceHoldFrames = 40;
// How long each style animates before the replay/retry menu is allowed to open,
// so the death plays out on screen first (the launch style instead holds until
// its arc has fallen off-screen, and float holds until it reaches the surface —
// see deathEffectAnimating).
const deathExplodeMenuHoldFrames = 200;
const deathFloatMaxHoldFrames = 360;
const deathImpaleMenuHoldFrames = 48;
// Whatever the style, keep the game on screen for at least this long after death
// (~2.5s at 60Hz) so the full death animation finishes before the replay/retry
// menu opens — no death is cut short.
const deathMinimumHoldFrames = 150;
const activeOutcomeFeedbackText = "";
const hazardDefeatedOutcomeFeedbackText = "Hazard contact — Press R";
const enemyDefeatedOutcomeFeedbackText = "Opponent contact — Press R";
const hazardAndEnemyDefeatedOutcomeFeedbackText =
  "Hazard and opponent contact — Press R";
const pitDefeatedOutcomeFeedbackText = "Fell into a pit — Press R";
const timeUpDefeatedOutcomeFeedbackText = "Time up — Press R";
const finishedOutcomeFeedbackText = "Gate reached — Press R";
const simultaneousOutcomeFeedbackText = "Run ended at the gate — Press R";
const tileStrokeColor = 0x172033;
const skyTileColor = 0x8fd3e8;
const skyCloudColor = 0xf4fbff;
const grassTileColor = 0x6f4e37;
const grassTopColor = 0x75a743;
const grassBladeColor = 0x2f7d55;
const grassDirtStoneColor = 0x4b3528;
const stoneTileColor = 0x64748b;
const brickTileColor = 0xb45309;
const brickMortarColor = 0x7c2d12;
const stoneHighlightColor = 0x94a3b8;

// Per-level colour theme. Different areas can read as overworld / underground /
// castle. The active palette is set once per game in create() (tile rendering is
// synchronous) and read by the sky/ground/block/brick draws + the backdrop.
type ThemePalette = {
  readonly sky: number;
  readonly ground: number;
  readonly groundTop: number;
  readonly groundBlade: number;
  readonly groundDirt: number;
  readonly block: number;
  readonly blockHighlight: number;
  readonly brick: number;
  readonly brickMortar: number;
  // Overworld ground has a grassy top; underground/castle ground is a solid slab.
  readonly grassyTop: boolean;
};
const themePalettes = {
  overworld: {
    sky: skyTileColor,
    ground: grassTileColor,
    groundTop: grassTopColor,
    groundBlade: grassBladeColor,
    groundDirt: grassDirtStoneColor,
    block: stoneTileColor,
    blockHighlight: stoneHighlightColor,
    brick: brickTileColor,
    brickMortar: brickMortarColor,
    grassyTop: true,
  },
  underground: {
    sky: 0x00060f,
    ground: 0x1d4ed8,
    groundTop: 0x2563eb,
    groundBlade: 0x1e40af,
    groundDirt: 0x1e3a8a,
    block: 0x2563eb,
    blockHighlight: 0x60a5fa,
    brick: 0x1d4ed8,
    brickMortar: 0x1e3a8a,
    grassyTop: false,
  },
  castle: {
    sky: 0x0a0a0a,
    ground: 0x57534e,
    groundTop: 0x78716c,
    groundBlade: 0x44403c,
    groundDirt: 0x292524,
    block: 0x78716c,
    blockHighlight: 0xa8a29e,
    brick: 0x8a5a2b,
    brickMortar: 0x44291a,
    grassyTop: false,
  },
  water: {
    sky: 0x1a4a8a,
    ground: 0x0e7490,
    groundTop: 0x22d3ee,
    groundBlade: 0x0891b2,
    groundDirt: 0x0c4a6e,
    block: 0x0891b2,
    blockHighlight: 0x67e8f9,
    brick: 0x0e7490,
    brickMortar: 0x0c4a6e,
    grassyTop: false,
  },
} satisfies Record<LevelTheme, ThemePalette>;
let activeThemePalette: ThemePalette = themePalettes.overworld;

// The water theme swaps in buoyant underwater physics along with its blue palette.
function resolveMovementConstants(
  theme: LevelTheme | undefined,
  bloodyBonks: boolean,
  godMode: boolean,
): MovementConstants {
  const base =
    theme === "water" ? swimmingMovementConstants : initialMovementConstants;
  // Shabby mode adds cumulative head-bonk bloodiness (and its speed penalty);
  // god mode makes the player undamageable (pit falls still reset).
  if (!bloodyBonks && !godMode) {
    return base;
  }
  return { ...base, bloodyBonks, godMode };
}
const thornTileColor = 0x355e3b;
const thornPointColor = 0xf97316;
const cannonTileColor = 0x293241;
const cannonMouthColor = 0x111827;
const cannonBandColor = 0x64748b;
const cannonWarningColor = 0xf97316;
const gateTileColor = 0xf4c542;
const gateFrameColor = 0x374151;
const gateShineColor = 0xfef3c7;
const gateGemColor = 0x2dd4bf;
const enemyBodyColor = 0x1f2937;
const enemyShellColor = 0x0f766e;
const enemyShellSpotColor = 0xf59e0b;
const enemyEyeWhiteColor = 0xfafafa;
const enemyEyePupilColor = 0x111827;
const enemyLegColor = 0x451a03;
const flyingEnemyBodyColor = 0xf59e0b;
const flyingEnemyStripeColor = 0x111827;
const flyingEnemyWingColor = 0xbae6fd;
const flyingEnemyEyeColor = 0xfafafa;
const chasingEnemyBodyColor = 0x1f2937;
const chasingEnemySpikeColor = 0xf59e0b;
const chasingEnemyEyeColor = 0xfafafa;
const armoredEnemyShellColor = 0x0f766e;
const armoredEnemySegmentColor = 0x115e59;
const armoredEnemyClawColor = 0xf97316;
const armoredEnemyEyeColor = 0xfafafa;
const coinCoreColor = 0xfacc15;
const coinShineColor = 0xfef3c7;
const itemCoreColor = 0x2dd4bf;
const itemShineColor = 0xccfbf1;
const powerUpCoreColor = 0xf59e0b;
const powerUpGemColor = 0x2dd4bf;
const powerUpShineColor = 0xfefce8;
const extraLifeCoreColor = 0x16a34a;
const extraLifeMarkColor = 0xfef3c7;
const invincibilityCoreColor = 0xfef08a;
const invincibilityAccentColor = 0x22d3ee;
const invincibilityShineColor = 0xfefce8;
const climbableStemColor = 0x15803d;
const climbableLeafColor = 0x86efac;
const exitArchColor = 0x111827;
const exitGlowColor = 0xf4c542;
const actorRenderOffsetPixels = 2;
const tileStrokeWidth = 1;
const grassBladeOffsetX = 1;
const grassBladeOffsetY = 2;
const grassBladeInsetPixels = 2;
const grassBladeHeightPixels = 3;
const grassTopHeightPixels = 5;
const grassDirtStoneWidthPixels = 4;
const grassDirtStoneHeightPixels = 2;
const grassDirtStoneOffsetX = 3;
const grassDirtStoneOffsetY = 10;
const stoneHighlightOffsetX = 3;
const stoneHighlightOffsetY = 3;
const stoneHighlightInsetPixels = 6;
const stoneHighlightHeightPixels = 2;
const gateShineOffsetX = 1;
const gateShineOffsetY = 3;
const gateShineWidthPixels = 1;
const gateShineInsetPixels = 6;
const gateGemSizePixels = 4;
const hazardPointBaseOffsetX = 8;
const hazardPointBaseOffsetY = 4;
const hazardPointBaseX1 = 0;
const hazardPointBaseY1 = 8;
const hazardPointBaseX2 = 8;
const hazardPointBaseY2 = 0;
const hazardPointBaseX3 = 16;
const hazardPointBaseY3 = 8;
const springBaseColor = 0x0f766e;
const springCoilColor = 0xfacc15;
const springTopColor = 0xfef3c7;
const springInsetPixels = 3;
const springTopHeightPixels = 3;
const springBaseHeightPixels = 4;
const springCoilWidthPixels = 10;
const springCoilHeightPixels = 2;
const springCoilOffsetX = 3;
const springFirstCoilOffsetY = 6;
const springSecondCoilOffsetY = 10;
const cannonMouthOffsetX = 3;
const cannonMouthOffsetY = 1;
const cannonMouthWidthPixels = 10;
const cannonMouthHeightPixels = 4;
const cannonBandOffsetY = 8;
const cannonBandHeightPixels = 3;
const cannonWarningWidthPixels = 2;
const cannonWarningHeightPixels = 5;
const cannonWarningLeftOffsetX = 4;
const cannonWarningRightOffsetX = 10;
const cannonWarningOffsetY = 5;
const enemyBodyWidthPixels = 12;
const enemyBodyHeightPixels = 8;
const enemyBodyOffsetY = 2;
const enemyShellWidthPixels = 8;
const enemyShellHeightPixels = 5;
const enemyShellOffsetX = 2;
const enemyShellSpotSizePixels = 2;
const enemyShellSpotOffsetX = 6;
const enemyShellSpotOffsetY = 1;
const enemyEyeSizePixels = 2;
const enemyEyeOffsetX = 3;
const enemyEyeOffsetY = 1;
const enemyPupilSizePixels = 1;
const enemyLegWidthPixels = 2;
const enemyLegHeightPixels = 2;
const enemyLeftLegOffsetX = 1;
const enemyRightLegOffsetX = 9;
const enemyLegOffsetY = 10;
const flyingEnemyBodyWidthPixels = 10;
const flyingEnemyBodyHeightPixels = 6;
const flyingEnemyBodyOffsetX = 1;
const flyingEnemyBodyOffsetY = 4;
const flyingEnemyWingWidthPixels = 4;
const flyingEnemyWingHeightPixels = 3;
const flyingEnemyLeftWingOffsetX = 0;
const flyingEnemyRightWingOffsetX = 9;
const flyingEnemyWingOffsetY = 1;
const flyingEnemyStripeWidthPixels = 2;
const flyingEnemyStripeHeightPixels = 6;
const flyingEnemyStripeOffsetX = 5;
const flyingEnemyStripeOffsetY = 4;
const flyingEnemyEyeSizePixels = 2;
const flyingEnemyEyeOffsetX = 3;
const flyingEnemyEyeOffsetY = 5;
const chasingEnemyBodyWidthPixels = 12;
const chasingEnemyBodyHeightPixels = 8;
const chasingEnemyBodyOffsetY = 2;
const chasingEnemySpikeSizePixels = 2;
const chasingEnemySpikeOffsetY = 0;
const chasingEnemyEyeSizePixels = 2;
const chasingEnemyEyeOffsetX = 3;
const chasingEnemyEyeOffsetY = 3;
const armoredEnemyShellWidthPixels = 12;
const armoredEnemyShellHeightPixels = 8;
const armoredEnemyShellOffsetY = 2;
const armoredEnemySegmentWidthPixels = 2;
const armoredEnemySegmentHeightPixels = 6;
const armoredEnemySegmentOffsetX = 5;
const armoredEnemySegmentOffsetY = 3;
const armoredEnemyClawWidthPixels = 3;
const armoredEnemyClawHeightPixels = 3;
const armoredEnemyLeftClawOffsetX = -1;
const armoredEnemyRightClawOffsetX = 10;
const armoredEnemyClawOffsetY = 7;
const armoredEnemyEyeSizePixels = 2;
const armoredEnemyEyeOffsetX = 3;
const armoredEnemyEyeOffsetY = 4;
const coinCoreRadiusPixels = 5;
const coinShineWidthPixels = 2;
const coinShineHeightPixels = 5;
const coinShineOffsetX = -1;
const coinShineOffsetY = -3;
const itemCoreWidthPixels = 8;
const itemCoreHeightPixels = 8;
const itemShineWidthPixels = 2;
const itemShineHeightPixels = 2;
const itemShineOffsetX = 3;
const itemShineOffsetY = 1;
const powerUpCoreWidthPixels = 8;
const interactiveBoxColor = 0xd97706;
const interactiveBoxShineColor = 0xfef3c7;
const usedBoxColor = 0x78350f;
const interactiveBoxQuestionOffsetX = 4;
const interactiveBoxQuestionOffsetY = 2;
const powerUpCoreHeightPixels = 8;
const powerUpShineWidthPixels = 4;
const powerUpShineHeightPixels = 4;
const powerUpShineOffsetX = 2;
const powerUpShineOffsetY = 2;
const powerUpSparkleSizePixels = 1;
const powerUpSparkleInsetPixels = 1;
const extraLifeCoreWidthPixels = 8;
const extraLifeCoreHeightPixels = 8;
const extraLifeStemWidthPixels = 2;
const extraLifeStemHeightPixels = 6;
const extraLifeBarWidthPixels = 6;
const extraLifeBarHeightPixels = 2;
const extraLifeStemOffsetX = 3;
const extraLifeStemOffsetY = 1;
const extraLifeBarOffsetX = 1;
const extraLifeBarOffsetY = 3;
const invincibilityCoreWidthPixels = 10;
const invincibilityCoreHeightPixels = 10;
const invincibilityCoreOffsetX = 1;
const invincibilityCoreOffsetY = 1;
const invincibilityAccentWidthPixels = 4;
const invincibilityAccentHeightPixels = 4;
const invincibilityAccentOffsetX = 4;
const invincibilityAccentOffsetY = 4;
const invincibilityShineSizePixels = 2;
const invincibilityShineOffsetX = 7;
const invincibilityShineOffsetY = 2;
const climbableStemWidthPixels = 3;
const climbableStemHeightPixels = 16;
const climbableStemOffsetX = 6;
const climbableLeafWidthPixels = 5;
const climbableLeafHeightPixels = 3;
const climbableLeftLeafOffsetX = 1;
const climbableRightLeafOffsetX = 9;
const climbableUpperLeafOffsetY = 4;
const climbableLowerLeafOffsetY = 10;
const exitArchWidthPixels = 12;
const exitArchHeightPixels = 14;
const exitGlowWidthPixels = 4;
const exitGlowHeightPixels = 9;
const exitGlowOffsetX = 4;
const exitGlowOffsetY = 3;
const exitBannerColor = 0x0f766e;
const exitBannerWidthPixels = 3;
const exitBannerHeightPixels = 9;
const exitLeftBannerOffsetX = -2;
const exitRightBannerOffsetX = 11;
const exitBannerOffsetY = 2;
const projectileColor = 0xfacc15;
const projectileCoreColor = 0x2dd4bf;
const projectileOutlineColor = 0x854d0e;
const projectileSparkleColor = 0xfefce8;
const projectileSparkleSizePixels = 1;
const projectileMinimumCoreDimensionPixels = 1;
const pipeColor = 0x0f766e;
const pipeLipColor = 0x14b8a6;
const pipeShadowColor = 0x115e59;
const pipeHighlightColor = 0x5eead4;
const pipeLipHeightPixels = 4;
const pipeHighlightWidthPixels = 2;
const pipeHighlightOffsetX = 3;
const pipeHighlightOffsetY = 5;
// The enterable-pipe cue: a dark opening inside the two-tile mouth ring.
const pipeMouthWidthTiles = 2;
const pipeMouthOpeningColor = 0x233a20;
const pipeMouthOpeningDepthColor = 0x111d10;
const pipeMouthOpeningInsetPixels = 3;
const pipeMouthOpeningTopPixels = 2;
const pipeMouthOpeningHeightPixels = 3;
const pipeMouthOpeningDepthHeightPixels = 1;
const parallaxDistantHillColor = 0x9ed69e;
const parallaxHillColor = 0x00a800; // the original's overworld hill/bush green
const parallaxBushColor = 0x00a800;
const parallaxHillDotColor = 0x006800;
const parallaxHillShadeColor = 0x007c00;
const parallaxCloudColor = 0xf0f8ff;
// Frames between air bubbles rising from the swimmer in the water world.
const swimBubbleIntervalFrames = 20;
// Behind the tile layer (depth 0) but in front of the parallax background, so a
// block occludes an item that is still rising out of it.
const emergingItemDepth = -1;
const dustParticleColor = 0xd4c4a8;
const dustParticleRadius = 3;
const dustParticleDurationMs = 300;
// Controls are read from window keydown/keyup by event.code rather than Phaser's
// per-scene Key objects: with several game instances alive at once (suspended
// sessions), Phaser only updates the first game's Keys, so the polled approach
// silently stops working for later games. Window events reach every game.
const leftKeyCodes = ["ArrowLeft"] as const;
const rightKeyCodes = ["ArrowRight"] as const;
const jumpKeyCodes = ["Space"] as const;
const runKeyCodes = ["ShiftLeft", "ShiftRight"] as const;
const retryKeyCodes = ["KeyR"] as const;
const fireKeyCodes = ["KeyX"] as const;
const upKeyCodes = ["ArrowUp"] as const;
const downKeyCodes = ["ArrowDown"] as const;
const pauseKeyCodes = ["KeyP"] as const;
// Capture a low-res timeline thumbnail this often (frames) during live play.
// Filmstrip thumbnails are sampled down to the track width anyway, so a longer
// capture interval keeps the replay strip full while cutting the per-capture
// drawImage + encode cost (a periodic frame hitch) to a third as often.
const runThumbnailIntervalFrames = 90;
const runThumbnailWidthPixels = 128;
const runThumbnailHeightPixels = 72;

function makeBrowserProjectileSnapshot(projectile: {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly active: boolean;
}) {
  return {
    id: projectile.id,
    position: {
      x: projectile.position.x,
      y: projectile.position.y,
    },
    width: projectile.width,
    height: projectile.height,
    active: projectile.active,
  };
}

export class BootScene extends Phaser.Scene {
  private readonly browserGameBootstrap: BrowserGameBootstrap;
  // Which costume the player wears (default castaway; Luigi is the green swap).
  private readonly playerCharacter: PlayerCharacter;
  // Revenge mode: you play the stomper (goomba/princess) and the walking
  // enemies are re-skinned as half-height Mario/Luigi you stomp.
  private readonly revengeMode: boolean;
  private readonly userAssetBundle: UserAssetBundle | undefined;
  private levelSpec!: LevelSpec;
  private simulationState!: SimulationState;
  private levelCollisionCounts!: BrowserLevelCollisionCounts;
  private renderedTileCount!: number;
  private breakableTileRenderObjects!: ReadonlyMap<
    string,
    readonly Phaser.GameObjects.GameObject[]
  >;
  private usedBlockSwaps!: ReadonlyMap<string, UsedBlockSwap>;
  private hiddenBlockTiles!: ReadonlyMap<string, HiddenBlockTile>;
  private castleBridgeTilesByColumn: ReadonlyMap<
    number,
    readonly Phaser.GameObjects.GameObject[]
  > = new Map();
  // Frames left in the castle-clear cinematic (bridge chop + boss fall).
  private castleClearFramesRemaining = 0;
  private castleClearTotalFrames = 0;
  private castleClearMessageText: Phaser.GameObjects.Text | undefined =
    undefined;
  private castleClearWalkStartX: number | undefined;
  private castleFlagObjects: readonly Phaser.GameObjects.GameObject[] = [];
  private castleFlagRiseFramesRemaining = 0;
  // Tumbling debris from shattered bricks (four shards per brick).
  private brickShards: {
    readonly shard: Phaser.GameObjects.Rectangle;
    velocityX: number;
    velocityY: number;
    framesLeft: number;
  }[] = [];
  private previousBrokenBrickCount = 0;
  // Fire-variant keepers already revealed (so a defeat reveals only once).
  private readonly revealedBowserEntityIds = new Set<string>();
  private identityReveals: {
    readonly image: Phaser.GameObjects.Image;
    velocityY: number;
    framesLeft: number;
  }[] = [];
  private springSquashes: {
    readonly overlay: Phaser.GameObjects.Rectangle;
    framesLeft: number;
  }[] = [];
  // Blocks briefly nudged upward by a head-bonk, with their resting y.
  private blockNudges: {
    readonly objects: readonly Phaser.GameObjects.GameObject[];
    readonly baseYs: readonly number[];
    framesLeft: number;
  }[] = [];
  private readonly revealedHiddenTiles = new Set<string>();
  private renderedActors!: readonly RuntimeRenderedActor[];
  private renderedActorRoleCounts!: BrowserRenderedActorRoleCounts;
  private readonly spawnedActorRenderObjects: Map<
    string,
    Phaser.GameObjects.Container
  > = new Map();
  private readonly projectileRenderObjects: Map<
    string,
    Phaser.GameObjects.Container
  > = new Map();
  private readonly timedHazardProjectileRenderObjects: Map<
    string,
    Phaser.GameObjects.Container
  > = new Map();
  private readonly frenzyCheepRenderObjects: Map<
    string,
    Phaser.GameObjects.Container
  > = new Map();
  private readonly flameHazardRenderObjects: (
    | Phaser.GameObjects.Arc
    | Phaser.GameObjects.Image
  )[] = [];
  private readonly platformRenderObjects: (
    | Phaser.GameObjects.Rectangle
    | Phaser.GameObjects.Image
  )[] = [];
  private readonly platformRopeRenderObjects: (
    | Phaser.GameObjects.Rectangle
    | undefined
  )[] = [];
  private readonly aerialFrenzyRenderObjects: Map<
    string,
    Phaser.GameObjects.Container
  > = new Map();
  private readonly hatchedSpinyRenderObjects: Map<
    string,
    Phaser.GameObjects.Container
  > = new Map();
  private levelRenderedObjects: readonly Phaser.GameObjects.GameObject[] = [];
  private readonly levelSequence: readonly LevelSpecInput[] | undefined;
  private readonly warpLevelsByName:
    | ReadonlyMap<string, LevelSpecInput>
    | undefined;
  private readonly warpLevelThemesByName:
    | ReadonlyMap<string, LevelTheme>
    | undefined;
  // The theme of the section currently being played. Starts as the level's own
  // theme and switches when a pipe warps into a differently-themed sub-section.
  private currentTheme: LevelTheme | undefined;
  // When a pipe warps to a named target level, that level's input overrides the
  // sequence lookup until the next reset/advance.
  private warpedLevelInput: LevelSpecInput | undefined = undefined;
  // The main level this run currently belongs to: starts as the selected
  // level and changes only when a warp lands at another main level's start
  // (a warp-zone jump). Flag-tail and bonus-room warps keep it.
  private currentMainLevelName: string | undefined = undefined;
  private activeWorldLevelLabel: string | undefined = undefined;
  private pendingLevelWarp:
    | { targetLevelName: string; targetTilePosition: TilePoint }
    | undefined = undefined;
  private levelIndex: number;
  private levelAdvanceDelayFramesRemaining = 0;
  private levelCompleteSoundPlayed = false;
  // Event-music latches: the star theme swaps in while invincible, the death
  // jingle plays once on defeat, and the time-warning sting/speed-up fires once
  // as the clock drops under the warning threshold.
  private starMusicActive = false;
  private deathJinglePlayed = false;
  private timeWarningTriggered = false;
  // Flow screens: a "WORLD w-l ×lives" intro card freezes the level briefly on
  // start/advance; a GAME OVER banner shows when the last life is lost. The
  // authoritative life count lives in the engine (SimulationState.livesRemaining,
  // which already folds in 1-Ups, coin thresholds, stomp/shell chains, and the
  // death decrement). The shell only carries that value across the fresh states
  // it builds on a level advance or retry, and reads it for display/game-over.
  private carriedLivesRemaining = initialLivesCount;
  // Whole-session coin total, carried across the level advances and retries that
  // rebuild the state (like the life count) so the displayed coins and the
  // every-100-coins 1-Up persist across levels. Reset only on a new game.
  private carriedSessionCoinTotal = 0;
  // Score banked from completed prior levels/attempts this session. The score is
  // derived per frame from the current SimulationState (which resets each level),
  // so — like lives and coins — the shell carries the running total across
  // rebuilds. The displayed score is this base plus the current level's score.
  // Reset only on a new game. See the "Session-persistent state" section of
  // docs/terminology.md.
  private carriedSessionScoreBase = 0;
  // Time-bonus countdown at a level finish: display units of clock left to
  // convert to score. Zero means no countdown is running.
  private timeBonusCountdownUnitsRemaining = 0;
  // The player's power tier carried into the next level. Finishing or warping
  // keeps an enlarged tier (Super/Fire); dying resets it to small — as the
  // original carries power across levels but not across a death.
  private carriedPlayerVitality: PlayerVitalityState =
    makeInitialPlayerVitalityState();
  private levelIntroFramesRemaining = 0;
  private pendingGameOver = false;
  private flowCardBackground?: Phaser.GameObjects.Rectangle;
  private flowCardTitleText?: Phaser.GameObjects.Text;
  private flowCardSubtitleText?: Phaser.GameObjects.Text;
  // True once the current level's "WELCOME TO WARP ZONE!" banner has been drawn.
  private warpZoneBannerShown = false;
  // Flagpole descent: on a goal (flagpole) finish the player slides down the
  // pole to its base before the level advances, like the original.
  private flagpoleSlideActive = false;
  private flagpoleSlideTargetY = 0;
  private flagpoleSlideColumnX = 0;
  private flagObject:
    | Phaser.GameObjects.Triangle
    | Phaser.GameObjects.Image
    | undefined = undefined;
  private flagpoleFlagBaseY = 0;
  // The decorative ball crowning the pole; a grab at the very top knocks it
  // off (flagpoleBallFall holds its tumble velocity while falling).
  private flagpoleBallObject: Phaser.GameObjects.Arc | undefined = undefined;
  private flagpoleBallFall: { vx: number; vy: number } | undefined = undefined;
  private flagpoleFlagDropActive = false;
  // Rest positions of the furniture, so a same-level retry (which does not
  // rebuild the level objects) can put the flag and ball back.
  private flagpoleFlagHomeY = 0;
  private flagpoleBallHome = { x: 0, y: 0 };
  // The end-of-level exit march: after the slide the player walks right into
  // the castle doorway and disappears.
  private flagpoleWalkOffActive = false;
  private flagpoleWalkOffTargetX = 0;
  private flagpoleWalkOffY = 0;
  private deathArcActive = false;
  private deathArcStarted = false;
  private deathArcVelocityY = 0;
  private deathArcX = 0;
  private deathArcY = 0;
  // Shabby death effect: the cause-specific style plus the objects it spawns
  // (scattering body-sprite pieces, rising smoke) and its progress counter.
  private deathEffectStyle: DeathEffectStyle = "launch";
  private deathEffectFrame = 0;
  // The frame a drowning float first reached the surface (-1 until it does).
  private deathFloatSurfaceFrame = -1;
  private deathPieces: FlyingDeathPart[] = [];
  // Stable per-bot tracking. Co-op players are positional in the sim's players
  // array (no id), so each frame we match the current bots to the previous ones
  // by nearest position: a matched bot keeps its robot costume, an unmatched
  // previous bot has vanished (died) and is exploded at its last spot, and an
  // unmatched current bot is new and cycles onto the next robot variant.
  private coopBotSnapshots: {
    x: number;
    y: number;
    w: number;
    h: number;
    character: PlayerCharacter;
    name: string;
  }[] = [];
  // The resolved costume per current co-op bot (index-aligned to
  // players.slice(1)), set by the per-step tracker and read by the renderer.
  private coopBotCharacters: PlayerCharacter[] = [];
  // Each current co-op bot's robotic call-sign (index-aligned to the costumes),
  // shown as a label above it and carried across frames like the costume.
  private coopBotNames: string[] = [];
  // The floating name-label text objects, pooled parallel to coopPlayerImages.
  private readonly coopPlayerNameLabels: Phaser.GameObjects.Text[] = [];
  // Monotonic counter so every newly-seen bot cycles onto a fresh robot variant.
  private coopBotNextVariant = 0;
  // Body parts flung by exploding bots — kept apart from the primary's
  // deathPieces so several bots can burst at once. Each still harms enemies and
  // the other bots via the shared death-part physics.
  private botDeathPieces: FlyingDeathPart[] = [];
  // Seeded LCG state for the 1-in-5 "does this part strike actually harm?" roll.
  private deathDamageRoll = 0x1a2b3c4d;
  // Enemies knocked out by a flung body part: each flips over and ragdolls off
  // under gravity. Keyed by entity id so a second part can't re-hit one, and so
  // the normal actor render skips them (leaving stepKnockedEnemies in charge).
  // `settled` marks one that has fallen away and is done animating.
  private readonly deathKnockedEnemies = new Map<
    string,
    {
      readonly renderObject: Phaser.GameObjects.Container;
      readonly wingObject?: Phaser.GameObjects.Triangle;
      x: number;
      y: number;
      vx: number;
      vy: number;
      angle: number;
      settled: boolean;
    }
  >();
  // How many enemies have been knocked out by body parts this death (debug/test).
  private deathKnockedEnemyCount = 0;
  // The initial explosion-burst flash (expands and fades).
  private deathBurst:
    | { readonly image: Phaser.GameObjects.Image; life: number }
    | undefined;
  // Tile-collision lookup for the current level, so flung body parts land on
  // whichever block is beneath them (or keep falling off-screen when nothing is).
  // Built lazily when the explosion starts.
  private deathPartCollisionLookup:
    | ReturnType<typeof makeTileCollisionLookup>
    | undefined;
  // The charred husk left after burning, once it topples into a ragdoll fall.
  private deathHusk:
    | {
        readonly image: Phaser.GameObjects.Image;
        vx: number;
        vy: number;
        vr: number;
      }
    | undefined;
  private deathSmoke: {
    readonly image: Phaser.GameObjects.Image;
    vy: number;
    life: number;
  }[] = [];
  // Flame tongues clinging to a burning body (offset from its centre + a phase
  // so they flicker out of sync).
  private deathFlames: {
    readonly image: Phaser.GameObjects.Image;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly phase: number;
    readonly baseScale: number;
  }[] = [];
  private deathXEyesImage: Phaser.GameObjects.Image | undefined;
  private previousPlayerVertical: VerticalMovementState =
    VerticalMovementState.Grounded;
  // The world-Y of the ground the player last stood on, held throughout an
  // airborne stretch so a landing can be measured ground-to-ground (a net fall).
  // Null until the player has first been grounded.
  private lastGroundedWorldY: number | null = null;
  // How many hard-landing ground quakes have fired (exposed for debug/tests).
  private groundQuakeCount = 0;
  // Cinematic camera shake state. Purely visual: it offsets the camera's
  // viewport position (not scrollX/scrollY), so it never touches the recorded
  // camera scroll, the simulation, or the physics — the world and physics carry
  // on unshaken while only the framing trembles, like a movie camera bump.
  private cameraShakeFramesRemaining = 0;
  private cameraShakeTotalFrames = 0;
  private cameraShakeAmplitudePixels = 0;
  // Bottom space (px) reserved for the replay strip so the game area shrinks to
  // sit strictly above it instead of the strip overlapping the play field.
  private reservedBottomPixels = 0;
  // An invisible anchor for the player's position (camera follow, death arc,
  // flagpole slide). The visible player is always the authored sprite
  // (playerImageObject); there is no procedural vector-rectangle player.
  private playerRectangle!: Phaser.GameObjects.Rectangle;
  private playerImageObject: Phaser.GameObjects.Image | undefined;
  // Sprites for the additional co-op players (demo bots), kept in sync with
  // simulationState.players[1..] and positioned from them each frame.
  private readonly coopPlayerImages: Phaser.GameObjects.Image[] = [];
  // Last non-trivial horizontal travel direction, so the water merman can face
  // the way he swims.
  private facingRight = true;
  private outcomeFeedbackText!: Phaser.GameObjects.Text;
  private startPromptText!: Phaser.GameObjects.Text;
  private exitHintText!: Phaser.GameObjects.Text;
  // When set (via the bootstrap's awaitStart), the run stays frozen on its first
  // frame behind a prompt until the player presses a key, so a slow first load
  // never means missing the start of the level.
  private awaitingStart = false;
  private reactionText!: Phaser.GameObjects.Text;
  private stompReactionBurst!: Phaser.GameObjects.Text;
  private playerReactionImage: Phaser.GameObjects.Image | undefined;
  private enemyStompReactionImage: Phaser.GameObjects.Image | undefined;
  private readonly exaggeratedReactions: boolean;
  private readonly godMode: boolean;
  // Floating "+100" score numbers that rise and fade over a defeated enemy.
  private scorePopups: {
    readonly text: Phaser.GameObjects.Text;
    framesRemaining: number;
  }[] = [];
  private previousDefeatedEnemyIds: ReadonlySet<string> = new Set();
  private previousEnemyKillScore = 0;
  // Per-Goomba flatten countdown: a stomped Goomba renders squashed until this
  // reaches zero, then it is hidden.
  private readonly flattenedEnemyTimers = new Map<string, number>();
  // Cache of collected/defeated entity-id lookup sets, rebuilt only when the
  // underlying (monotonically-growing) array length changes — the render loop
  // reads these every frame, so rebuilding each frame is wasted allocation.
  private readonly entityIdSetCache = new Map<
    string,
    { readonly length: number; readonly set: ReadonlySet<string> }
  >();
  // Victory fireworks: a shell-timed celebration launched on a flag finish when
  // the remaining-time ones digit is 1, 3, or 6 (that many bursts, 500 each).
  private fireworkSprites: {
    readonly star: Phaser.GameObjects.Star;
    framesRemaining: number;
  }[] = [];
  private fireworksBurstsRemaining = 0;
  private fireworksNextBurstFrames = 0;
  private fireworksBurstIndex = 0;
  private fireworksOriginX = 0;
  private fireworksBonusScore = 0;
  private scoreBadgeRectangle!: Phaser.GameObjects.Rectangle;
  private scoreGemRectangle!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private gameAudio!: GameAudio;
  private lastSoundEvents: readonly SoundEvent[] = [];
  // Latched observation of the frame an enemy was first contacted this level, so
  // browser tests can read that one-frame event without racing the live frame.
  private lastEnemyContactObservation:
    | BrowserEnemyContactObservation
    | undefined;
  private backgroundMusicStarted = false;
  // The set of currently-held key codes, maintained from the window key
  // listeners (see leftKeyCodes etc.). Cleared on resume so a key held while the
  // game was backgrounded doesn't stay stuck down.
  private readonly keysDown = new Set<string>();
  // Keys already held when a pause opened. The timeline scrubber ignores them
  // until re-pressed, so dying while holding a direction key doesn't instantly
  // rewind the replay.
  private readonly keysHeldAtPause = new Set<string>();
  // Previous-frame held state for edge-detected (JustDown) controls.
  private pauseWasDown = false;
  private retryWasDown = false;
  private anyDown(codes: readonly string[]): boolean {
    return codes.some((code) => this.keysDown.has(code));
  }
  // On-screen touch controls set these; they are OR'd with the keyboard so a
  // phone/tablet without a keyboard can still play.
  private readonly touchState = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    run: false,
    fire: false,
  };
  private touchControlPanels: HTMLElement[] = [];
  private touchStartRequested = false;
  private exitRequested = false;
  private runRecorder!: RunRecorder;
  private paused = false;
  private pausedByDeath = false;
  private replayPlaying = false;
  // True while the instant replay is playing back the death animation as its
  // finale (the recording ended in a contact death). The frozen final frame is
  // re-exploded/burned/etc. so the replay shows the death, not just the corpse.
  // Death-animation frames appended to this pause's timeline (0 when the run
  // ended without a contact-death animation).
  private deathReplayFrames = 0;
  // Rebuilding the death effect at a scrubbed frame must not re-trigger its
  // one-shot sounds on every seek.
  private suppressDeathSounds = false;
  private scrubFrame = 0;
  private pauseFrame = 0;
  private pauseFrameState: SimulationState | undefined = undefined;
  private timelineOverlay: RunTimelineOverlay | undefined = undefined;
  private runThumbnails: RunTimelineThumbnail[] = [];
  private thumbnailCanvas: HTMLCanvasElement | undefined = undefined;
  // Camera view per recorded frame (horizontal scroll + the view's world-space
  // bottom edge), so scrubbing can restore what was on screen at that moment
  // even though the paused viewport is shorter than the live one.
  private recordedCameraScrolls: { x: number; worldBottom: number }[] = [];
  private retryKeyHeld = false;
  // True while this game is a backgrounded session. Its window listeners stay
  // attached (the game isn't destroyed), so without this guard a key meant for
  // whichever session is active would leak in here — e.g. an Escape pressed to
  // suspend another game would set this game's exitRequested and make it exit
  // the instant it is resumed.
  private suspended = false;
  private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (this.suspended) {
      return;
    }
    this.keysDown.add(event.code);
    if (isGameplayKeyboardEvent(event) && !this.backgroundMusicStarted) {
      this.backgroundMusicStarted = this.gameAudio.startBackgroundMusic(
        this.currentTheme,
      );
    }

    if (isRetryKeyboardEvent(event)) {
      this.retryKeyHeld = true;
    }

    // N advances to the next level from the level-complete overlay (the same
    // action as the glistening "Next level" button and the "Press N" hint).
    if (
      event.code === "KeyN" &&
      this.paused &&
      this.hasFinishedOutcome() &&
      this.browserGameBootstrap.onAdvanceToNextLevel !== undefined
    ) {
      this.browserGameBootstrap.onAdvanceToNextLevel(this.currentMainLevelName);
      return;
    }

    // ESC leaves the level (handled in update() to avoid tearing down mid-event).
    if (event.key === "Escape") {
      this.exitRequested = true;
      return;
    }
    // Any other key (including Space) dismisses the "press any key" start prompt.
    if (this.awaitingStart) {
      this.touchStartRequested = true;
    }
  };
  private readonly handleWindowKeyUp = (event: KeyboardEvent): void => {
    // Always clear the released key, even while suspended, so a key let go in the
    // background never stays stuck down when this game is resumed.
    this.keysDown.delete(event.code);
    this.keysHeldAtPause.delete(event.code);
    if (this.suspended) {
      return;
    }
    if (isRetryKeyboardEvent(event)) {
      this.retryKeyHeld = false;
    }
  };
  // Attached from the constructor (before the async boot) so a key pressed while
  // the scene is still loading is not missed — Phaser's own keyboard isn't set
  // up until create(), so a key held during boot would otherwise be lost.
  private readonly handleEarlyStartKey = (event: KeyboardEvent): void => {
    if (this.suspended) {
      return;
    }
    if (event.key !== "Escape") {
      this.touchStartRequested = true;
    }
  };

  private readonly handleWindowResize = (): void => {
    this.resizeToDisplay();
  };

  // Size the canvas backing store to the window size × the display's pixel
  // density, while keeping its CSS box at the window size. On a HiDPI/retina
  // screen this renders at native resolution instead of upscaling a
  // CSS-resolution canvas — which would blur the whole scene, HUD text included.
  // The camera zoom keys off scale.height, so it adjusts to the larger backing
  // store automatically and the on-screen size is unchanged.
  private sizeCanvasToDisplay(): void {
    const canvas = this.game.canvas;
    const parent = canvas.parentElement;
    const cssWidth = Math.max(1, parent?.clientWidth ?? window.innerWidth);
    // Shrink the canvas by the space the replay strip reserves at the bottom so
    // the strip sits below the game area rather than over it.
    const cssHeight = Math.max(
      1,
      (parent?.clientHeight ?? window.innerHeight) - this.reservedBottomPixels,
    );
    // The Canvas-2D renderer fills the whole backing store in software every
    // frame, so its cost scales with pixelRatio². On phones (coarse pointer,
    // often DPR 3) that native-resolution fill is the main stutter source, and
    // blocky pixel art gains little past 2×, so cap the ratio there.
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const maxPixelRatio = isCoarsePointer ? 2 : 3;
    const pixelRatio = Math.min(
      Math.max(window.devicePixelRatio || 1, 1),
      maxPixelRatio,
    );
    this.scale.resize(cssWidth * pixelRatio, cssHeight * pixelRatio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }

  // The replay strip reports how much bottom space it needs; reserve it and
  // resize the game area to sit above it (no-op when unchanged).
  private setReservedBottomSpace(pixels: number): void {
    const rounded = Math.max(0, Math.round(pixels));
    if (rounded === this.reservedBottomPixels) {
      return;
    }
    this.reservedBottomPixels = rounded;
    this.resizeToDisplay();
  }

  private resizeToDisplay(): void {
    // While suspended the session root is display:none, so any measurement
    // (window resize, overlay reserved-space report) would size the canvas
    // against a 0×0 parent; onSessionResume re-measures once visible again.
    if (this.suspended) {
      return;
    }
    // While paused there is no follow target to re-frame the view after the
    // resize (the replay bar reserving bottom space is the common trigger):
    // keep the world-space bottom edge stable so the shrink crops sky, not the
    // ground where the recorded action sits.
    const pausedAnchorBottom = this.paused
      ? this.cameraWorldBottom()
      : undefined;
    this.sizeCanvasToDisplay();
    this.applyCameraZoom();
    if (pausedAnchorBottom !== undefined) {
      this.setCameraWorldBottom(this.cameras.main.scrollX, pausedAnchorBottom);
    }
  }

  public constructor(browserGameBootstrap: BrowserGameBootstrap) {
    super("BootScene");
    this.browserGameBootstrap = browserGameBootstrap;
    this.revengeMode = browserGameBootstrap.revengeMode ?? false;
    const requestedCharacter =
      browserGameBootstrap.playerCharacter ?? defaultPlayerCharacter;
    // In revenge mode you play a stomper: fall back to the Goomba if the
    // requested costume isn't one of the revenge protagonists.
    this.playerCharacter =
      this.revengeMode && !revengePlayerCharacters.includes(requestedCharacter)
        ? defaultRevengePlayerCharacter
        : requestedCharacter;
    // Default to the faithful classic feel (no exaggerated "auch!"/burst
    // overlays); the parody experience opts in via the Shabby game mode.
    this.exaggeratedReactions =
      browserGameBootstrap.exaggeratedReactions ?? false;
    this.godMode = browserGameBootstrap.godMode ?? false;
    this.userAssetBundle = browserGameBootstrap.userAssetBundle;
    this.levelSequence = browserGameBootstrap.levelSequence;
    this.warpLevelsByName = browserGameBootstrap.warpLevelsByName;
    this.warpLevelThemesByName = browserGameBootstrap.warpLevelThemesByName;
    this.currentTheme = browserGameBootstrap.theme;
    this.levelIndex = browserGameBootstrap.levelIndex;
    this.currentMainLevelName = browserGameBootstrap.userLevelVisualName;
    this.activeWorldLevelLabel = browserGameBootstrap.worldLevelLabel;
    // The first level starts at the bootstrap's tier (usually small); later
    // levels carry the tier the player finished the prior level with.
    this.carriedPlayerVitality = browserGameBootstrap.initialPlayerVitality;
    window.addEventListener("keydown", this.handleEarlyStartKey);
  }

  public create(): void {
    window.addEventListener("keydown", this.handleWindowKeyDown);
    window.addEventListener("keyup", this.handleWindowKeyUp);
    this.createTouchControls();
    this.registerSceneTeardown(() => {
      window.removeEventListener("keydown", this.handleWindowKeyDown);
      window.removeEventListener("keydown", this.handleEarlyStartKey);
      window.removeEventListener("keyup", this.handleWindowKeyUp);
      window.removeEventListener("resize", this.handleWindowResize);
      for (const panel of this.touchControlPanels) {
        panel.remove();
      }
      this.touchControlPanels = [];
      this.gameAudio.stopBackgroundMusic();
      this.gameAudio.setLavaSizzle(false);
    });

    // The invisible position anchor: never drawn, only used to place the sprite
    // and drive the camera.
    this.playerRectangle = this.add
      .rectangle(
        0,
        0,
        initialPlayerSimulationStateConfig.colliderWidth,
        initialPlayerSimulationStateConfig.colliderHeight,
      )
      .setOrigin(0)
      .setVisible(false);
    this.playerImageObject = renderPlayerImage(
      this,
      this.userAssetBundle?.playerImage,
    );

    this.outcomeFeedbackText = this.add
      .text(
        outcomeFeedbackPositionX,
        outcomeFeedbackPositionY,
        activeOutcomeFeedbackText,
        {
          color: "#111827",
          fontFamily: "monospace",
          fontSize: "16px",
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setVisible(false);
    this.startPromptText = this.add
      .text(
        outcomeFeedbackPositionX,
        outcomeFeedbackPositionY,
        "PRESS ANY KEY TO START",
        {
          color: "#111827",
          fontFamily: "monospace",
          fontSize: "16px",
          backgroundColor: "#ffffffcc",
          padding: { x: 6, y: 4 },
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      // Above the WORLD intro card so the start cue reads over the black screen.
      .setDepth(flowCardDepth + 2);
    this.createFlowCard();
    this.exitHintText = this.add
      .text(0, 0, `ESC ⤶ ${this.browserGameBootstrap.exitLabel ?? "menu"}`, {
        color: "#e5e7eb",
        fontFamily: "monospace",
        fontSize: "8px",
        backgroundColor: "#00000066",
        padding: { x: 3, y: 2 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(70)
      .setVisible(this.browserGameBootstrap.onExitToMenu !== undefined);
    this.reactionText = this.add
      .text(0, 0, "auch!", {
        color: "#b91c1c",
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setVisible(false);
    this.stompReactionBurst = this.add
      .text(0, 0, "*pop!*", {
        color: "#f8fafc",
        fontFamily: "monospace",
        fontSize: "10px",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5)
      .setDepth(50)
      .setVisible(false);
    this.playerReactionImage = this.makeReactionImage("player-head-bonk", 1);
    // Revenge mode brands the stomp pop as a full Mario head with bulging eyes;
    // normal play uses the squashed-enemy reaction.
    this.enemyStompReactionImage = this.makeReactionImage(
      this.revengeMode ? "revenge-stomp-pop" : "enemy-stomped",
      0.5,
    );
    this.scoreBadgeRectangle = this.add
      .rectangle(
        scoreBadgeX,
        scoreBadgeY,
        scoreBadgeWidth,
        scoreBadgeHeight,
        scoreBadgeColor,
      )
      .setOrigin(0)
      .setScrollFactor(0)
      .setStrokeStyle(tileStrokeWidth, scoreBadgeStrokeColor)
      .setVisible(false);
    this.scoreGemRectangle = this.add
      .rectangle(
        scoreGemX,
        scoreGemY,
        scoreGemSize,
        scoreGemSize,
        itemCoreColor,
      )
      .setOrigin(0)
      .setScrollFactor(0)
      .setStrokeStyle(tileStrokeWidth, itemShineColor)
      .setVisible(false);
    // Faithful HUD (MARIO / score / coins / WORLD / TIME) at the top for every
    // skin, in place of a plain "Score" label.
    this.scoreText = this.add
      .text(
        scoreTextPositionX,
        1,
        classicCompatibilityHudText(
          0,
          undefined,
          0,
          this.activeWorldLevelLabel ??
            worldLevelLabelFor(this.browserGameBootstrap.userLevelVisualName),
        ),
        {
          color: "#f5f7fb",
          fontFamily: "monospace",
          fontSize: "8px",
        },
      )
      .setScrollFactor(0)
      .setDepth(60);
    this.gameAudio = new GameAudio();
    this.gameAudio.setVocalSoundtrack(
      this.browserGameBootstrap.vocalSoundtrack === true,
    );
    // Revenge mode plays the original ukulele revenge tune in place of the
    // area theme.
    this.gameAudio.setRevengeMusic(this.revengeMode);
    registerUserSoundBuffers(this.gameAudio, this.userAssetBundle);

    this.buildLevelObjects();
    // Size the canvas to its final (device-resolution) viewport before the
    // camera is configured, so the follow snaps to the player at the correct
    // scale — otherwise the first frame renders a stale scroll from the initial
    // viewport before the follow re-centers, which reads as a spurious scroll.
    this.sizeCanvasToDisplay();
    configureMainCamera(
      this.cameras.main,
      this.levelSpec,
      this.playerRectangle,
    );
    this.applyCameraZoom();
    window.addEventListener("resize", this.handleWindowResize);

    this.publishDebugApi();
    this.renderSimulationState();

    // Freeze on frame 0 until the first key, so a slow load doesn't eat the run.
    this.awaitingStart = this.browserGameBootstrap.awaitStart ?? false;
    this.startPromptText.setVisible(this.awaitingStart);
    if (this.awaitingStart) {
      this.input.keyboard?.once("keydown", () => {
        this.beginPlay();
      });
    }
  }

  // Build the (hidden) full-screen flow card used for the "WORLD w-l" intro and
  // the GAME OVER screen. Pinned to the camera (scrollFactor 0) above everything.
  private createFlowCard(): void {
    this.flowCardBackground = this.add
      .rectangle(0, 0, 10, 10, 0x000000, 1)
      .setScrollFactor(0)
      .setDepth(flowCardDepth)
      .setVisible(false);
    this.flowCardTitleText = this.add
      .text(0, 0, "", {
        color: "#ffffff",
        fontFamily: "monospace",
        fontSize: "10px",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(flowCardDepth + 1)
      .setVisible(false);
    this.flowCardSubtitleText = this.add
      .text(0, 0, "", {
        color: "#ffffff",
        fontFamily: "monospace",
        fontSize: "8px",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(flowCardDepth + 1)
      .setVisible(false);
  }

  // Show the flow card (positioning/scaling is handled by positionHud, which
  // runs on every zoom/resize; here we only set the text and reveal it).
  private showFlowCard(title: string, subtitle: string): void {
    this.flowCardBackground?.setVisible(true);
    this.flowCardTitleText?.setText(title).setVisible(true);
    this.flowCardSubtitleText?.setText(subtitle).setVisible(true);
  }

  private hideFlowCard(): void {
    this.flowCardBackground?.setVisible(false);
    this.flowCardTitleText?.setVisible(false);
    this.flowCardSubtitleText?.setVisible(false);
  }

  private currentWorldLabel(): string {
    return (
      this.activeWorldLevelLabel ??
      worldLevelLabelFor(this.browserGameBootstrap.userLevelVisualName)
    );
  }

  private beginPlay(): void {
    this.awaitingStart = false;
    this.startPromptText.setVisible(false);
    this.hideFlowCard();
  }

  // Run a teardown when this scene ends, whichever way it ends: a scene stop
  // fires SHUTDOWN, while game.destroy() (closing a session tab, page unload)
  // fires DESTROY with no SHUTDOWN first. Whichever fires first runs the
  // teardown exactly once and unhooks its sibling.
  private registerSceneTeardown(teardown: () => void): void {
    const events = this.events;
    const runOnce = (): void => {
      events.off(Phaser.Scenes.Events.SHUTDOWN, runOnce);
      events.off(Phaser.Scenes.Events.DESTROY, runOnce);
      teardown();
    };
    events.once(Phaser.Scenes.Events.SHUTDOWN, runOnce);
    events.once(Phaser.Scenes.Events.DESTROY, runOnce);
  }

  // Called by the session manager when this game is suspended into a tab: go
  // silent so no two sessions' music overlap, and stop reacting to window input
  // meant for whichever session is now active. All of this game's DOM (canvas,
  // touch panels, replay overlay) lives in its session root, which the session
  // manager hides as one element — no per-element hiding here.
  public onSessionSuspend(): void {
    this.suspended = true;
    this.gameAudio.stopBackgroundMusic();
    this.gameAudio.setLavaSizzle(false);
    // The root just went display:none with fingers possibly still on buttons —
    // their pointerup will land elsewhere, so drop any held touch input now.
    this.clearHeldTouchState();
  }

  // Called when this game is brought back to the foreground: resume its music if
  // it was playing (not on the start prompt, not after a death).
  public onSessionResume(): void {
    this.suspended = false;
    // Drop any input that arrived while suspended so a resumed game never exits
    // or starts on a stale key, and clear held-key state so nothing is stuck.
    this.exitRequested = false;
    this.touchStartRequested = false;
    this.keysDown.clear();
    this.retryKeyHeld = false;
    this.pauseWasDown = false;
    this.retryWasDown = false;
    // Re-publish this game's debug API: it is a single global, so whichever game
    // booted last owns it — point it back at the game now in the foreground.
    this.publishDebugApi();
    if (
      this.backgroundMusicStarted &&
      !this.awaitingStart &&
      !this.pausedByDeath
    ) {
      this.gameAudio.startBackgroundMusic(this.currentTheme);
    }
    // The session root just became visible again with panels/overlay exactly
    // as they were left, but window resizes that arrived while the root was
    // hidden were ignored (a hidden root measures 0×0) — so re-present a
    // paused game's replay bar (its height and filmstrip layout are
    // width-dependent) and re-measure the canvas.
    if (this.paused) {
      this.presentTimelineOverlay();
    }
    this.resizeToDisplay();
  }

  // On a coarse-pointer device (phone/tablet, landscape), mount an NES-style
  // control deck in two panels that FLANK the canvas — the D-pad on the left,
  // A/B + START on the right — outside the drawing surface. The viewport (the
  // canvas's flex parent) narrows to fit between them, so we trade horizontal
  // space (not the precious vertical space of a landscape screen) and nothing
  // covers the game. Buttons drive `touchState`, which resolveInputCommand OR's
  // with the keys.
  private createTouchControls(): void {
    const coarsePointer =
      window.matchMedia("(pointer: coarse)").matches ||
      "ontouchstart" in window;
    if (!coarsePointer) {
      return;
    }

    // The panels are siblings of the game viewport (canvas parent) inside this
    // session's root row, one before it and one after, so they claim width
    // beside the canvas instead of overlapping it — and they hide/go away with
    // the root when the session is suspended or destroyed. Mounting anywhere
    // else (e.g. document.body) would escape that lifecycle and leak a deck
    // over every later screen, so an unmounted canvas is a hard error.
    const viewport = this.game.canvas.parentElement;
    const host = viewport?.parentElement;
    if (viewport === null || host === null || host === undefined) {
      throw new Error(
        "Touch controls require the canvas mounted inside a session viewport.",
      );
    }

    // On touch, the browser applies *implicit pointer capture* on pointerdown,
    // which suppresses pointerenter/leave and would stop the thumb rolling from
    // one D-pad arm to the next without lifting (◀→▶) — so release the capture
    // immediately and drive press/release off boundary crossings too.
    const press = (
      onDown: () => void,
      button: HTMLElement,
    ): ((e: Event) => void) => {
      return (event: Event): void => {
        event.preventDefault();
        const pointerEvent = event as PointerEvent;
        if (button.hasPointerCapture(pointerEvent.pointerId)) {
          button.releasePointerCapture(pointerEvent.pointerId);
        }
        this.touchStartRequested = true;
        // On mobile the music can only start from a user gesture (no keydown
        // ever fires); the pointerdown handler is that gesture, so unlock/start
        // the soundtrack here rather than from the rAF-driven start path.
        if (!this.backgroundMusicStarted) {
          this.backgroundMusicStarted = this.gameAudio.startBackgroundMusic(
            this.currentTheme,
          );
        }
        onDown();
        button.style.filter = "brightness(1.5)";
        buzzTouchControl();
      };
    };
    // Rolling onto a button while a finger is already down (buttons !== 0)
    // presses it; a plain hover (a pen with no button) does not.
    const enter = (
      onDown: () => void,
      button: HTMLElement,
    ): ((e: Event) => void) => {
      return (event: Event): void => {
        if ((event as PointerEvent).buttons === 0) {
          return;
        }
        onDown();
        button.style.filter = "brightness(1.5)";
        // A tick when the thumb rolls onto a fresh button (e.g. ◀ → ▶).
        buzzTouchControl();
      };
    };
    const release = (
      onUp: () => void,
      button: HTMLElement,
    ): ((e: Event) => void) => {
      return (event: Event): void => {
        event.preventDefault();
        onUp();
        button.style.filter = "";
      };
    };
    const bind = (
      button: HTMLElement,
      onDown: () => void,
      onUp: () => void,
    ): void => {
      button.addEventListener("pointerdown", press(onDown, button));
      button.addEventListener("pointerenter", enter(onDown, button));
      button.addEventListener("pointerup", release(onUp, button));
      button.addEventListener("pointerleave", release(onUp, button));
      button.addEventListener("pointercancel", release(onUp, button));
    };

    const deck = buildNesControlDeck();
    bind(
      deck.dpadLeft,
      () => (this.touchState.left = true),
      () => (this.touchState.left = false),
    );
    bind(
      deck.dpadRight,
      () => (this.touchState.right = true),
      () => (this.touchState.right = false),
    );
    bind(
      deck.dpadUp,
      () => (this.touchState.up = true),
      () => (this.touchState.up = false),
    );
    bind(
      deck.dpadDown,
      () => (this.touchState.down = true),
      () => (this.touchState.down = false),
    );
    bind(
      deck.buttonA,
      () => (this.touchState.jump = true),
      () => (this.touchState.jump = false),
    );
    bind(
      deck.buttonB,
      () => {
        this.touchState.run = true;
        this.touchState.fire = true;
      },
      () => {
        this.touchState.run = false;
        this.touchState.fire = false;
      },
    );
    // SELECT is unused in play; START reaches the menu (like Esc).
    deck.buttonStart.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.exitRequested = true;
    });

    let scale = readTouchControlScale();
    const leftPanel = makeTouchSidePanel("left", scale);
    const rightPanel = makeTouchSidePanel("right", scale);

    // A small size toggle at the top of the left panel cycles S/M/L; the choice
    // persists and re-narrows the canvas live.
    const sizeToggle = document.createElement("button");
    sizeToggle.type = "button";
    sizeToggle.textContent = "⤢";
    sizeToggle.setAttribute("aria-label", "touch-control-size");
    sizeToggle.style.cssText =
      "margin-bottom:auto;width:34px;height:24px;border-radius:8px;" +
      "background:#2a2a2a;color:#cfcfcf;border:2px solid #555;touch-action:none;" +
      "font:700 13px monospace;-webkit-tap-highlight-color:transparent;";
    sizeToggle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const currentIndex = touchControlScales.indexOf(
        scale as (typeof touchControlScales)[number],
      );
      scale =
        touchControlScales[(currentIndex + 1) % touchControlScales.length] ?? 1;
      writeTouchControlScale(scale);
      applyTouchControlScale(leftPanel, scale);
      applyTouchControlScale(rightPanel, scale);
      this.resizeToDisplay();
      buzzTouchControl();
    });

    leftPanel.append(sizeToggle, deck.dpad);
    rightPanel.append(deck.actions);

    host.insertBefore(leftPanel, viewport);
    host.append(rightPanel);
    this.touchControlPanels = [leftPanel, rightPanel];
  }

  // The canvas fills the window (RESIZE); apply an integer camera zoom so the
  // level height roughly fills the window at crisp, whole-pixel scale, and pin
  // the view so the ground sits at the bottom with sky filling above.
  private applyCameraZoom(): void {
    const camera = this.cameras.main;
    const levelHeight = makeLevelWorldHeightPixels(this.levelSpec);
    const levelWidth = makeLevelWorldWidthPixels(this.levelSpec);
    const zoom = Math.max(2, Math.floor(this.scale.height / levelHeight));
    camera.setZoom(zoom);
    // Full-level bounds so horizontal following/clamping works. With this zoom
    // the view height ~ the level height, so the level fills vertically and the
    // ground sits near the bottom.
    camera.setBounds(0, 0, levelWidth, levelHeight);
    this.positionHud(zoom);
  }

  // The camera zoom scales scroll-fixed objects around the viewport centre, so
  // the HUD/feedback text must be scaled by 1/zoom and placed at the world point
  // that maps to the intended screen position. Screen (sx,sy) maps from world
  // (cx/2 + (sx - cx/2)/zoom, ...).
  private positionHud(zoom: number): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const toWorld = (
      screenX: number,
      screenY: number,
    ): { x: number; y: number } => ({
      x: width / 2 + (screenX - width / 2) / zoom,
      y: height / 2 + (screenY - height / 2) / zoom,
    });
    // Keep scroll-fixed text crisp: rasterise the font at its actual on-screen
    // pixel size and only undo the camera zoom (scale 1/zoom), rather than
    // magnifying a tiny base font (which blurs). On-screen px = fontPx * (1/zoom)
    // * zoom = fontPx, and the glyphs are drawn 1:1. Aspect is preserved.
    const crispScale = 1 / zoom;

    const hudPixels = Math.max(18, Math.round(height * 0.04));
    const hud = toWorld(scoreTextPositionX, 2);
    this.scoreText
      .setFontSize(hudPixels)
      .setScale(crispScale)
      .setPosition(hud.x, hud.y);

    const feedbackPixels = Math.max(18, Math.round(height * 0.04));
    const feedback = toWorld(width / 2, height / 3);
    this.outcomeFeedbackText
      .setFontSize(feedbackPixels)
      .setScale(crispScale)
      .setPosition(feedback.x, feedback.y);
    // Sit the start cue below the WORLD card's title/subtitle, not over them.
    const center = toWorld(width / 2, height * 0.74);
    this.startPromptText
      .setFontSize(feedbackPixels)
      .setScale(crispScale)
      .setPosition(center.x, center.y);

    const hintPixels = Math.max(10, Math.round(height * 0.016));
    const hint = toWorld(width - 4, 3);
    this.exitHintText
      .setFontSize(hintPixels)
      .setScale(crispScale)
      .setPosition(hint.x, hint.y);

    // The full-screen flow card: a black backdrop covering the viewport with a
    // large centered title and a smaller subtitle below it.
    const cardCenter = toWorld(width / 2, height / 2);
    this.flowCardBackground
      ?.setSize(width, height)
      .setScale(crispScale)
      .setPosition(cardCenter.x, cardCenter.y);
    const titlePixels = Math.max(16, Math.round(height * 0.06));
    const titleAt = toWorld(width / 2, height * 0.42);
    this.flowCardTitleText
      ?.setFontSize(titlePixels)
      .setScale(crispScale)
      .setPosition(titleAt.x, titleAt.y);
    const subtitlePixels = Math.max(12, Math.round(height * 0.04));
    const subtitleAt = toWorld(width / 2, height * 0.56);
    this.flowCardSubtitleText
      ?.setFontSize(subtitlePixels)
      .setScale(crispScale)
      .setPosition(subtitleAt.x, subtitleAt.y);
  }

  private buildLevelObjects(): void {
    // Set the active colour palette before any tile draws. This is a module
    // global read synchronously by the tile/backdrop renders, so setting it per
    // build keeps concurrent games (different themes) from bleeding into it.
    activeThemePalette = themePalettes[this.currentTheme ?? "overworld"];
    this.cameras.main.setBackgroundColor(activeThemePalette.sky);
    const currentLevelInput = this.resolveCurrentLevelInput();
    this.levelSpec = makeRequiredLevelSpec(currentLevelInput);
    this.simulationState = this.seedCarriedSessionTotals(
      makeRequiredInitialSimulationState(
        this.levelSpec,
        this.browserGameBootstrap,
      ),
    );
    this.resetRun();

    const childrenBefore = new Set(this.children.list);

    const levelVisual = resolveLevelVisual(
      this.userAssetBundle,
      this.browserGameBootstrap.userLevelVisualName,
    );

    if (levelVisual === undefined) {
      renderParallaxBackground(this, this.levelSpec, this.currentTheme);
    } else {
      renderLevelVisual(this, levelVisual);
    }

    const renderedLevel = renderLevelTiles(
      this,
      this.levelSpec,
      this.userAssetBundle,
      levelVisual !== undefined,
    );
    this.levelCollisionCounts = renderedLevel.collisionCounts;
    this.renderedTileCount = renderedLevel.renderedTileCount;
    this.breakableTileRenderObjects = renderedLevel.breakableTileRenderObjects;
    this.usedBlockSwaps = renderedLevel.usedBlockSwaps;
    this.hiddenBlockTiles = renderedLevel.hiddenBlockTiles;
    this.castleBridgeTilesByColumn = renderedLevel.castleBridgeTilesByColumn;
    this.castleClearFramesRemaining = 0;
    this.castleClearMessageText?.destroy();
    this.castleClearMessageText = undefined;
    this.castleClearWalkStartX = undefined;
    this.castleFlagObjects = [];
    this.castleFlagRiseFramesRemaining = 0;
    for (const entry of this.brickShards) {
      entry.shard.destroy();
    }
    this.brickShards = [];
    this.previousBrokenBrickCount = 0;
    this.blockNudges = [];
    for (const entry of this.springSquashes) {
      entry.overlay.destroy();
    }
    this.springSquashes = [];
    for (const entry of this.identityReveals) {
      entry.image.destroy();
    }
    this.identityReveals = [];
    this.revealedBowserEntityIds.clear();
    this.revealedHiddenTiles.clear();
    this.renderFlagpoleFurniture();
    const renderedActorSummary = renderNonPlayerActors(
      this,
      this.levelSpec,
      this.userAssetBundle,
    );
    this.renderedActors = renderedActorSummary.actors;
    this.renderedActorRoleCounts = renderedActorSummary.roleCounts;
    this.renderWarpZoneBanner();

    this.levelRenderedObjects = this.children.list.filter(
      (child) => !childrenBefore.has(child),
    );

    this.levelAdvanceDelayFramesRemaining = 0;
    this.levelCompleteSoundPlayed = false;
    this.starMusicActive = false;
    this.deathJinglePlayed = false;
    this.timeWarningTriggered = false;
    this.timeBonusCountdownUnitsRemaining = 0;
    this.bringPlayerObjectsToTop();
  }

  private bringPlayerObjectsToTop(): void {
    if (this.playerImageObject !== undefined) {
      this.children.bringToTop(this.playerImageObject);
    }

    this.children.bringToTop(this.outcomeFeedbackText);
    this.children.bringToTop(this.scoreBadgeRectangle);
    this.children.bringToTop(this.scoreGemRectangle);
    this.children.bringToTop(this.scoreText);
  }

  private resolveCurrentLevelInput(): LevelSpecInput {
    if (this.warpedLevelInput !== undefined) {
      return this.warpedLevelInput;
    }

    if (this.levelSequence !== undefined) {
      const input = this.levelSequence[this.levelIndex];

      if (input === undefined) {
        throw new Error(
          `Level sequence index ${this.levelIndex} is out of bounds.`,
        );
      }

      return input;
    }

    return this.browserGameBootstrap.levelInput;
  }

  private destroyLevelObjects(): void {
    for (const obj of this.levelRenderedObjects) {
      obj.destroy();
    }

    this.levelRenderedObjects = [];
    // Runtime render objects (spawned actors, projectiles, lift planks…) are
    // created during play, outside the levelRenderedObjects window — each
    // must be destroyed, not just dropped, or the sprites survive the level
    // rebuild as ghost objects (a lift plank from 1-2's end used to float,
    // intangible, in the next level after a pipe warp).
    for (const obj of this.spawnedActorRenderObjects.values()) {
      obj.destroy();
    }
    this.spawnedActorRenderObjects.clear();
    for (const obj of this.projectileRenderObjects.values()) {
      obj.destroy();
    }
    this.projectileRenderObjects.clear();
    for (const obj of this.timedHazardProjectileRenderObjects.values()) {
      obj.destroy();
    }
    this.timedHazardProjectileRenderObjects.clear();
    for (const obj of this.frenzyCheepRenderObjects.values()) {
      obj.destroy();
    }
    this.frenzyCheepRenderObjects.clear();
    for (const obj of this.flameHazardRenderObjects) {
      obj.destroy();
    }
    this.flameHazardRenderObjects.length = 0;
    for (const obj of this.platformRenderObjects) {
      obj.destroy();
    }
    this.platformRenderObjects.length = 0;
    for (const obj of this.platformRopeRenderObjects) {
      obj?.destroy();
    }
    this.platformRopeRenderObjects.length = 0;
    for (const obj of this.aerialFrenzyRenderObjects.values()) {
      obj.destroy();
    }
    this.aerialFrenzyRenderObjects.clear();
    for (const obj of this.hatchedSpinyRenderObjects.values()) {
      obj.destroy();
    }
    this.hatchedSpinyRenderObjects.clear();
  }

  private advanceToNextLevel(): void {
    if (this.levelSequence === undefined) {
      return;
    }

    const nextIndex = this.levelIndex + 1;

    if (nextIndex >= this.levelSequence.length) {
      return;
    }

    // Bank the finished level's score and carry the player's power tier before
    // its state is rebuilt away.
    this.bankCurrentLevelScore();
    this.carriedPlayerVitality = this.tierToCarryForward();
    this.levelIndex = nextIndex;
    this.destroyLevelObjects();
    this.buildLevelObjects();
    // Present the next level behind a "WORLD w-l" card before it plays.
    this.levelIntroFramesRemaining = worldCardFrames;
    configureMainCamera(
      this.cameras.main,
      this.levelSpec,
      this.playerRectangle,
    );
    // Re-apply the integer zoom, bounds and HUD placement for the new level's
    // dimensions (configureMainCamera alone leaves the zoom/HUD from the prior
    // level).
    this.applyCameraZoom();
    this.lastSoundEvents = [];
    this.renderSimulationState();
  }

  // The castle-clear staging: chop the bridge planks away from the axe side,
  // drop the boss off the severed bridge, then reveal the rescue message.
  private stepCastleClearCinematic(): void {
    if (this.castleClearFramesRemaining <= 0) {
      return;
    }
    this.castleClearFramesRemaining -= 1;
    const elapsed =
      this.castleClearTotalFrames - this.castleClearFramesRemaining;

    // Chop one plank column per interval, rightmost (axe side) first.
    const columns = [...this.castleBridgeTilesByColumn.keys()].sort(
      (a, b) => b - a,
    );
    const chopped = Math.min(
      Math.floor(elapsed / castleBridgeChopFrames),
      columns.length,
    );
    for (let index = 0; index < chopped; index += 1) {
      const column = columns[index];
      if (column === undefined) {
        continue;
      }
      for (const plank of this.castleBridgeTilesByColumn.get(column) ?? []) {
        (plank as Phaser.GameObjects.Rectangle).setVisible(false);
      }
    }

    // Once the bridge is gone the boss falls off it.
    if (chopped >= columns.length) {
      const fallElapsed = elapsed - columns.length * castleBridgeChopFrames;
      for (const actor of this.renderedActors) {
        if (!actor.actorId.startsWith("vglc-smb-bowser")) {
          continue;
        }
        actor.renderObject.setY(
          actor.pixelPosition.y + fallElapsed * castleClearFallSpeedPerFrame,
        );
      }
      // After the fall, the hero walks right through the opened gate into the
      // inner chamber (the ROM's walk to the toad/princess room) — sliding
      // the camera anchor pans the view with him.
      const walkElapsed = fallElapsed - castleClearFallFrames;
      if (walkElapsed >= 0 && walkElapsed <= castleClearWalkFrames) {
        const walkStep = Math.min(walkElapsed, castleClearWalkFrames);
        if (this.castleClearWalkStartX === undefined) {
          this.castleClearWalkStartX = this.playerRectangle.x;
        }
        const walkX =
          this.castleClearWalkStartX + walkStep * castleClearWalkSpeedPerFrame;
        // The axe grab can leave the hero mid-air over the chopped bridge:
        // settle his feet onto the chamber floor as he strides in.
        const floorY = this.floorPixelYAt(
          walkX,
          this.playerRectangle.y + this.playerRectangle.height,
        );
        const walkY = Math.min(
          floorY - this.playerRectangle.height,
          this.playerRectangle.y + castleClearFallSpeedPerFrame,
        );
        this.playerRectangle.setPosition(walkX, walkY);
        this.playerImageObject?.setPosition(walkX, walkY);
        this.playerImageObject?.setFlipX(false);
      }
      if (
        walkElapsed >= castleClearWalkFrames &&
        this.castleClearMessageText === undefined
      ) {
        const finalCastle = this.currentMainLevelName === "smb-8-4";
        const message = finalCastle
          ? "THE KEEP HAS FALLEN!\nYOUR FRIEND IS FREE — THE ISLAND IS AT PEACE."
          : "THE KEEPER PLUNGED INTO THE MOAT!\nBUT YOUR FRIEND IS IN ANOTHER KEEP...";
        // The friend waits a few tiles ahead of where the walk ended,
        // standing on the chamber floor; the message hangs above them.
        const friendX = this.playerRectangle.x + castleClearFriendLeadPixels;
        const friendFeetY = this.floorPixelYAt(
          friendX,
          this.playerRectangle.y + this.playerRectangle.height,
        );
        this.renderRescuedFriend(friendX, friendFeetY);
        this.castleClearMessageText = this.add
          .text(friendX, friendFeetY - 64, message, {
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#fef3c7",
            align: "center",
            stroke: "#1f2937",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setResolution(3)
          .setDepth(120);
        this.levelRenderedObjects = [
          ...this.levelRenderedObjects,
          this.castleClearMessageText,
        ];
      }
    }
  }

  // The top pixel of the first solid tile at world x, scanning down from the
  // given start (fallback: the start itself, e.g. past the level's edge).
  private floorPixelYAt(worldX: number, fromPixelY: number): number {
    const size = this.levelSpec.tileSizePixels;
    const column = Math.floor(worldX / size);
    const collisionByTileId = new Map(
      this.levelSpec.tileDefinitions.map((definition) => [
        definition.tileId,
        definition.collision,
      ]),
    );
    for (
      let row = Math.max(0, Math.floor(fromPixelY / size) - 1);
      row < this.levelSpec.heightTiles;
      row += 1
    ) {
      const tileId = this.levelSpec.tiles[row]?.[column];
      const collision =
        tileId === undefined ? undefined : collisionByTileId.get(tileId);
      if (
        collision === TileCollisionKind.Solid ||
        collision === TileCollisionKind.Breakable ||
        collision === TileCollisionKind.Interactive
      ) {
        return row * size;
      }
    }
    return fromPixelY;
  }

  // Show the rescued friend (a princess, in the ROM skin) standing on the
  // chamber floor — the payoff of the boss falling, as authored art rather
  // than only the "YOUR FRIEND" text.
  private renderRescuedFriend(worldX: number, feetPixelY: number): void {
    const friendAsset =
      this.userAssetBundle?.reactionImages.get("rescued-friend");
    if (friendAsset === undefined) {
      return;
    }
    const image = addUserFrameImage(this, 0, 0, friendAsset);
    image
      .setOrigin(0.5, 1)
      .setDisplaySize(24, 24)
      .setPosition(worldX, feetPixelY)
      .setDepth(120);
    this.levelRenderedObjects = [...this.levelRenderedObjects, image];
  }

  private hasFinishedOutcome(): boolean {
    return (
      this.simulationState.players[0].outcome.kind ===
        PlayerOutcomeKind.Finished ||
      this.simulationState.players[0].outcome.kind ===
        PlayerOutcomeKind.DefeatedAndFinished
    );
  }

  private readonly levelAdvanceDelayFrames = 60;
  // Castle-clear cinematic pacing: one plank chopped per interval, then the
  // boss falls and the rescue message shows.

  // Builds a hidden image for an asset set's reaction sprite (e.g. the parody
  // skin's "ouch" pose or squashed-enemy frame) when the bundle provides it, so
  // the reaction renders as authored art instead of the fallback text overlay.
  private makeReactionImage(
    reactionId: string,
    originY: number,
  ): Phaser.GameObjects.Image | undefined {
    const imageAsset = this.userAssetBundle?.reactionImages.get(reactionId);
    if (imageAsset === undefined) {
      return undefined;
    }

    const image = addUserFrameImage(this, 0, 0, imageAsset);
    image.setOrigin(0.5, originY).setDepth(51).setVisible(false);
    return image;
  }

  // Sets up the flagpole descent when the player finishes above the pole base:
  // snaps onto the pole column and computes how far/long to slide down.
  private beginFlagpoleSlide(): void {
    this.flagpoleSlideActive = false;
    const outcome = this.simulationState.players[0].outcome;
    const finished =
      outcome.kind === PlayerOutcomeKind.Finished ||
      outcome.kind === PlayerOutcomeKind.DefeatedAndFinished;
    if (!finished) {
      return;
    }
    // A castle finish is the axe, not a pole (the axe imports as a goal column
    // too): the castle-clear cinematic owns that ending — no slide, no flag.
    if (this.castleBridgeTilesByColumn.size > 0) {
      return;
    }

    const tileSizePixels = this.levelSpec.tileSizePixels;
    const collisionLookup = makeTileCollisionLookup(this.levelSpec);
    const colliderWidth = this.simulationState.players[0].player.collider.width;
    const colliderHeight =
      this.simulationState.players[0].player.collider.height;
    // The pole column is the goal tile the player actually contacted; fall
    // back to the player's centre column for finishes that leave the overlap
    // ambiguous (e.g. a wide gate).
    const column =
      this.findContactedGoalColumn(collisionLookup) ??
      Math.min(
        Math.max(
          Math.round(
            (this.playerRectangle.x + colliderWidth / 2) / tileSizePixels,
          ),
          0,
        ),
        this.levelSpec.widthTiles - 1,
      );
    const startRow = Math.max(
      0,
      Math.floor(this.playerRectangle.y / tileSizePixels),
    );

    // Grabbing the pole knocks the crowning ball off — it pops and tumbles
    // down while the player slides. Set before any dismount bail so even a
    // pole with no reachable base still reacts.
    const ballKnocked = this.flagpoleBallObject !== undefined;
    if (ballKnocked) {
      this.flagpoleBallFall = { ...flagpoleBallKnockVelocity };
    }
    // The flag always lowers fully to the base, as in the original — even when
    // the player grabbed low (or at the base) and barely slides themselves.
    this.flagpoleFlagDropActive = this.flagObject !== undefined;

    // The dismount base: the first solid tile at/below the grab in the pole
    // column — or, when the imported pole is goal tiles all the way down (the
    // SMB maps replace even the ground rows with pole), the ground of an
    // adjacent column.
    const groundRow =
      this.findSolidRowBelow(collisionLookup, column, startRow) ??
      this.findSolidRowBelow(collisionLookup, column - 1, startRow) ??
      this.findSolidRowBelow(collisionLookup, column + 1, startRow);
    if (groundRow !== undefined) {
      // The flag rests above the ground line even when the imported pole
      // extends through the ground rows.
      this.flagpoleFlagBaseY = Math.min(
        this.flagpoleFlagBaseY,
        groundRow * tileSizePixels - tileSizePixels * flagpoleFlagHeightRatio,
      );
    }

    // Keep the level open long enough for the flag to reach its base and a
    // knocked ball to clear the level, so neither freezes mid-air behind the
    // finish overlay.
    const flagDropFrames =
      this.flagObject === undefined
        ? 0
        : Math.ceil(
            Math.max(0, this.flagpoleFlagBaseY - this.flagObject.y) /
              flagpoleSlideSpeedPixels,
          ) + flagpoleFinishTailFrames;
    this.levelAdvanceDelayFramesRemaining = Math.max(
      this.levelAdvanceDelayFramesRemaining,
      flagDropFrames,
      ballKnocked ? flagpoleBallFallBudgetFrames : 0,
    );

    if (groundRow === undefined) {
      return; // A pole with no reachable base (over a pit): no slide.
    }
    const baseY = groundRow * tileSizePixels - colliderHeight;
    if (this.playerRectangle.y >= baseY - 1) {
      // Already at the base — no slide needed; walk straight off to the
      // castle.
      this.beginFlagpoleWalkOff(this.playerRectangle.x, this.playerRectangle.y);
      return;
    }

    this.flagpoleSlideActive = true;
    this.flagpoleSlideTargetY = baseY;
    this.flagpoleSlideColumnX = column * tileSizePixels;
    // Keep the level open for the slide AND the walk-off that follows it.
    const slideFrames =
      Math.ceil((baseY - this.playerRectangle.y) / flagpoleSlideSpeedPixels) +
      Math.ceil(flagpoleWalkOffDistancePixels / flagpoleWalkOffSpeedPixels) +
      flagpoleFinishTailFrames;
    this.levelAdvanceDelayFramesRemaining = Math.max(
      this.levelAdvanceDelayFramesRemaining,
      slideFrames,
    );
    this.positionPlayerSpriteAt(
      this.flagpoleSlideColumnX,
      this.playerRectangle.y,
    );
  }

  // After the slide (or a base-height grab), the player hops off and walks
  // right to the castle, disappearing through its doorway — the original's
  // end-of-level exit march.
  private beginFlagpoleWalkOff(fromX: number, groundY: number): void {
    this.flagpoleWalkOffActive = true;
    // March to the little castle's actual doorway when the map has one;
    // otherwise fall back to the fixed distance.
    const doorX = this.castleDoorPixelXAfter(fromX);
    this.flagpoleWalkOffTargetX =
      doorX ?? fromX + flagpoleWalkOffDistancePixels;
    this.flagpoleWalkOffY = groundY;
    this.levelAdvanceDelayFramesRemaining = Math.max(
      this.levelAdvanceDelayFramesRemaining,
      Math.ceil(
        (this.flagpoleWalkOffTargetX - fromX) / flagpoleWalkOffSpeedPixels,
      ) +
        castleFlagRiseFrames +
        flagpoleFinishTailFrames,
    );
  }

  // The centre pixel of the first castle-door tile column right of x, if any.
  private castleDoorPixelXAfter(fromX: number): number | undefined {
    const size = this.levelSpec.tileSizePixels;
    const fromColumn = Math.floor(fromX / size);
    for (let row = 0; row < this.levelSpec.heightTiles; row += 1) {
      const columns = this.levelSpec.tiles[row];
      if (columns === undefined) {
        continue;
      }
      for (
        let column = fromColumn;
        column < Math.min(columns.length, fromColumn + 24);
        column += 1
      ) {
        if (columns[column] === "castle-door") {
          return column * size + size / 2;
        }
      }
    }
    return undefined;
  }

  // The ROM raises a small white flag from the castle after the hero enters:
  // find the castle's top row over the door column and slide a pennant up.
  private beginCastleFlagRise(doorPixelX: number): void {
    const size = this.levelSpec.tileSizePixels;
    const column = Math.floor(doorPixelX / size);
    let topRow: number | undefined;
    for (let row = 0; row < this.levelSpec.heightTiles; row += 1) {
      const tileId = this.levelSpec.tiles[row]?.[column];
      if (
        tileId === "castle-wall" ||
        tileId === "castle-battlement" ||
        tileId === "castle-window" ||
        tileId === "castle-door"
      ) {
        topRow = row;
        break;
      }
    }
    if (topRow === undefined) {
      return;
    }
    const baseY = topRow * size;
    const pole = this.add
      .rectangle(doorPixelX, baseY, 1.5, size, 0xdad7cc)
      .setOrigin(0.5, 0)
      .setDepth(6);
    const flag = this.add
      .triangle(doorPixelX, baseY + 2, 0, 0, 10, 3, 0, 6, 0xf5f5f0)
      .setOrigin(0, 0)
      .setDepth(6);
    this.castleFlagObjects = [pole, flag];
    this.castleFlagRiseFramesRemaining = castleFlagRiseFrames;
    this.levelRenderedObjects = [...this.levelRenderedObjects, pole, flag];
  }

  private stepCastleFlagRise(): void {
    if (this.castleFlagRiseFramesRemaining <= 0) {
      return;
    }
    this.castleFlagRiseFramesRemaining -= 1;
    for (const object of this.castleFlagObjects) {
      (object as Phaser.GameObjects.Shape).setY(
        (object as Phaser.GameObjects.Shape).y - castleFlagRisePixelsPerFrame,
      );
    }
  }

  private stepFlagpoleWalkOff(): void {
    if (!this.flagpoleWalkOffActive) {
      return;
    }
    const nextX = Math.min(
      this.playerRectangle.x + flagpoleWalkOffSpeedPixels,
      this.flagpoleWalkOffTargetX,
    );
    this.positionPlayerSpriteAt(nextX, this.flagpoleWalkOffY);
    this.playerImageObject?.setFlipX(false); // marching right, into the castle
    if (nextX >= this.flagpoleWalkOffTargetX) {
      this.flagpoleWalkOffActive = false;
      // Through the doorway and out of sight; a rebuild restores the sprite.
      this.playerImageObject?.setVisible(false);
      // The ROM's payoff order: enter the castle, its flag rises, THEN the
      // timer-digit fireworks launch.
      this.beginCastleFlagRise(this.flagpoleWalkOffTargetX);
      this.beginVictoryFireworks();
    }
  }

  // The column of a goal tile inside the player's current tile span (the tile
  // whose contact finished the level), or undefined if none overlaps.
  private findContactedGoalColumn(
    collisionLookup: ReturnType<typeof makeTileCollisionLookup>,
  ): number | undefined {
    const player = this.simulationState.players[0].player;
    const rowSpan = makePlayerTileRowSpan(
      player,
      this.levelSpec.tileSizePixels,
    );
    const columnSpan = makePlayerTileColumnSpan(
      player,
      this.levelSpec.tileSizePixels,
    );
    for (let row = rowSpan.start; row <= rowSpan.end; row += 1) {
      for (
        let column = columnSpan.start;
        column <= columnSpan.end;
        column += 1
      ) {
        const tileId = this.levelSpec.tiles[row]?.[column];
        if (
          tileId !== undefined &&
          requireTileCollision(collisionLookup, tileId) ===
            TileCollisionKind.Goal
        ) {
          return column;
        }
      }
    }
    return undefined;
  }

  // The first solid tile row at/below startRow in the column, or undefined.
  private findSolidRowBelow(
    collisionLookup: ReturnType<typeof makeTileCollisionLookup>,
    column: number,
    startRow: number,
  ): number | undefined {
    if (column < 0 || column >= this.levelSpec.widthTiles) {
      return undefined;
    }
    for (let row = startRow; row < this.levelSpec.heightTiles; row += 1) {
      const tileId = this.levelSpec.tiles[row]?.[column];
      if (
        tileId !== undefined &&
        requireTileCollision(collisionLookup, tileId) ===
          TileCollisionKind.Solid
      ) {
        return row;
      }
    }
    return undefined;
  }

  // The knocked-off ball tumbles under gravity until it leaves the level.
  private stepFlagpoleBallFall(): void {
    const ball = this.flagpoleBallObject;
    const fall = this.flagpoleBallFall;
    if (ball === undefined || fall === undefined) {
      return;
    }
    fall.vy += flagpoleBallFallGravityPixels;
    ball.x += fall.vx;
    ball.y += fall.vy;
    if (ball.y > this.levelSpec.heightTiles * this.levelSpec.tileSizePixels) {
      ball.setVisible(false);
      this.flagpoleBallFall = undefined;
    }
  }

  // The flag drops down the pole to its base, alongside (and independent of)
  // the player's own slide — the original lowers it fully on any grab height.
  private stepFlagpoleFlagDrop(): void {
    if (!this.flagpoleFlagDropActive || this.flagObject === undefined) {
      return;
    }
    this.flagObject.y = Math.min(
      this.flagObject.y + flagpoleSlideSpeedPixels,
      this.flagpoleFlagBaseY,
    );
    if (this.flagObject.y >= this.flagpoleFlagBaseY) {
      this.flagpoleFlagDropActive = false;
    }
  }

  private stepFlagpoleSlide(): void {
    this.stepFlagpoleBallFall();
    this.stepFlagpoleFlagDrop();
    this.stepFlagpoleWalkOff();
    this.stepCastleFlagRise();
    this.spawnFreshBrickShards();
    this.stepBrickShards();
    this.spawnBowserIdentityReveal();
    this.stepIdentityReveal();
    this.spawnHeadBonkNudge();
    this.stepBlockNudges();
    this.spawnSpringSquash();
    this.stepSpringSquashes();
    if (!this.flagpoleSlideActive) {
      return;
    }
    const nextY = Math.min(
      this.playerRectangle.y + flagpoleSlideSpeedPixels,
      this.flagpoleSlideTargetY,
    );
    this.positionPlayerSpriteAt(this.flagpoleSlideColumnX, nextY);
    if (nextY >= this.flagpoleSlideTargetY) {
      this.flagpoleSlideActive = false;
      // Dismount at the base and march off to the castle.
      this.beginFlagpoleWalkOff(this.flagpoleSlideColumnX, nextY);
    }
  }

  // Render the SMB "WELCOME TO WARP ZONE!" wall label when the level is a warp
  // zone — a level holding two or more pipes that jump to different worlds'
  // starts. The label is world-space, so it scrolls into view with the pipes.
  private renderWarpZoneBanner(): void {
    this.warpZoneBannerShown = false;
    // A warp zone is a pipe (or pipes) jumping to ANOTHER world's start —
    // the ROM shows the banner for 4-2's single {5} pipe too, so a distinct-
    // target count would miss it. Same-world level starts (vestibule pipes)
    // are ordinary progression, not warp zones.
    const currentName = this.currentMainLevelName ?? "";
    // Warp rooms booted directly (dev deep links) carry their world in the
    // -wN suffix instead of the main-level prefix.
    const ownWorld =
      /^smb-(\d+)-/.exec(currentName)?.[1] ?? /-w(\d+)$/.exec(currentName)?.[1];
    const warpPipes = this.levelSpec.actors.filter((actor) => {
      if (
        actor.targetLevelName === undefined ||
        actor.targetTilePosition === undefined ||
        actor.targetTilePosition.x > mainLevelStartTileX
      ) {
        return false;
      }
      const targetWorld = /^smb-(\d+)-\d+$/.exec(actor.targetLevelName)?.[1];
      return (
        targetWorld !== undefined &&
        ownWorld !== undefined &&
        targetWorld !== ownWorld
      );
    });
    if (warpPipes.length === 0) {
      return;
    }

    const size = this.levelSpec.tileSizePixels;
    const pipeTileXs = warpPipes.map((pipe) => pipe.position.x);
    const centerTileX = (Math.min(...pipeTileXs) + Math.max(...pipeTileXs)) / 2;
    // Float the label a few rows above the tallest warp pipe, like the wall
    // text over the original's warp-zone pipes.
    const topPipeTileY = Math.min(...warpPipes.map((pipe) => pipe.position.y));
    const bannerTileY = Math.max(0, topPipeTileY - 3);
    this.add
      .text(
        centerTileX * size + size / 2,
        bannerTileY * size,
        "WELCOME TO WARP ZONE!",
        {
          color: "#ffffff",
          fontFamily: "monospace",
          fontSize: "8px",
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setDepth(warpBannerDepth);
    // The original also numbers each pipe with its destination world
    // ("4 3 2", "5", "8 7 6") — drawn a row above the pipe mouth.
    for (const pipe of warpPipes) {
      const world = /^smb-(\d+)-\d+$/.exec(pipe.targetLevelName ?? "")?.[1];
      if (world === undefined) {
        continue;
      }
      this.add
        .text(
          (pipe.position.x + 1) * size,
          (pipe.position.y - 1) * size + size / 2,
          world,
          {
            color: "#ffffff",
            fontFamily: "monospace",
            fontSize: "8px",
            align: "center",
          },
        )
        .setOrigin(0.5)
        .setDepth(warpBannerDepth);
    }
    this.warpZoneBannerShown = true;
  }

  // Per-frame event music: swap in the star theme while invincible, sound the
  // death jingle once on defeat, and fire the time-warning sting + speed-up as
  // the clock runs low.
  // Haptic feedback for the frame's sound events: a light tap on landing, a
  // double thud on a head-bonk, and a longer rumble on death (touch devices).
  private stepHaptics(events: readonly SoundEvent[]): void {
    // One vibrate() call per frame (a new call cancels the previous), so the
    // strongest event this frame wins the buzz.
    if (events.includes(SoundEvent.Defeat)) {
      vibrateHaptic(deathHapticPattern);
    } else if (events.includes(SoundEvent.BlockBreak)) {
      vibrateHaptic(blockBreakHapticPattern);
    } else if (events.includes(SoundEvent.HeadBonk)) {
      vibrateHaptic(headBonkHapticPattern);
    } else if (events.includes(SoundEvent.Stomp)) {
      vibrateHaptic(stompHapticMilliseconds);
    } else if (events.includes(SoundEvent.Land)) {
      vibrateHaptic(landHapticMilliseconds);
    }
  }

  private stepEventMusic(): void {
    const invincible =
      this.simulationState.players[0].invincibility.remainingFrames > 0;
    if (invincible !== this.starMusicActive) {
      this.starMusicActive = invincible;
      this.gameAudio.setInvincibilityMusic(invincible, this.currentTheme);
    }

    // The engine owns the life count (1-Ups, coin thresholds, stomp/shell
    // chains, and the on-death decrement are all folded into
    // SimulationState.livesRemaining); carry it so the next rebuilt state and
    // the flow-card display stay in sync.
    this.carriedLivesRemaining = this.simulationState.livesRemaining;
    // Carry the whole-session coin total (prior-level base + this level's coins)
    // so it persists across the next rebuild, as in the original.
    this.carriedSessionCoinTotal =
      this.simulationState.sessionCoinBase +
      this.simulationState.collectibles.collectedCoinEntityIds.length;

    if (
      !this.deathJinglePlayed &&
      this.simulationState.players[0].outcome.kind ===
        PlayerOutcomeKind.Defeated
    ) {
      this.deathJinglePlayed = true;
      // The engine has already decremented the life on this defeat frame.
      if (this.simulationState.livesRemaining <= 0) {
        // Out of lives: the game-over jingle. No black "GAME OVER" card — it
        // would blot out the game and the live replay strip; instead the frozen
        // game stays on screen and the replay strip below is titled GAME OVER.
        this.pendingGameOver = true;
        this.gameAudio.playJingle("game-over");
      } else {
        this.gameAudio.playJingle("death");
      }
    }

    const remainingFrames = this.simulationState.levelTimer.remainingFrames;
    if (
      !this.timeWarningTriggered &&
      remainingFrames !== undefined &&
      this.simulationState.players[0].outcome.kind ===
        PlayerOutcomeKind.Active &&
      Math.floor(remainingFrames / timeBonusFramesPerDisplayUnit) <
        timeWarningDisplaySeconds
    ) {
      this.timeWarningTriggered = true;
      this.gameAudio.playJingle("time-warning");
      this.gameAudio.setMusicTempoScale(timeWarningTempoScale);
    }
  }

  // On a flag finish, the remaining-time ones digit of 1/3/6 triggers that many
  // firework bursts (500 points each), staged over the level-advance delay.
  private beginVictoryFireworks(): void {
    const remainingFrames = this.simulationState.levelTimer.remainingFrames;
    if (remainingFrames === undefined) {
      return;
    }
    const displayTime = Math.floor(
      remainingFrames / timeBonusFramesPerDisplayUnit,
    );
    const count = fireworksCountForDisplayTime(displayTime);
    if (count === 0) {
      return;
    }
    this.fireworksBurstsRemaining = count;
    this.fireworksBurstIndex = 0;
    this.fireworksNextBurstFrames = fireworksBurstIntervalFrames;
    this.fireworksOriginX =
      this.playerRectangle.x +
      this.simulationState.players[0].player.collider.width / 2;
    // Keep the level open until every burst has launched and its sparkle faded.
    const fireworksTotalFrames =
      count * fireworksBurstIntervalFrames + fireworkLifetimeFrames;
    this.levelAdvanceDelayFramesRemaining = Math.max(
      this.levelAdvanceDelayFramesRemaining,
      fireworksTotalFrames,
    );
  }

  private stepVictoryFireworks(): void {
    // Age live sparkles: expand outward and fade, dropping the spent ones.
    this.fireworkSprites = this.fireworkSprites.filter((firework) => {
      firework.framesRemaining -= 1;
      if (firework.framesRemaining <= 0) {
        firework.star.destroy();
        return false;
      }
      const life = firework.framesRemaining / fireworkLifetimeFrames;
      firework.star.setScale(1 + (1 - life) * 1.6);
      firework.star.setAlpha(life);
      return true;
    });

    if (this.fireworksBurstsRemaining <= 0) {
      return;
    }
    this.fireworksNextBurstFrames -= 1;
    if (this.fireworksNextBurstFrames > 0) {
      return;
    }

    this.fireworksNextBurstFrames = fireworksBurstIntervalFrames;
    this.launchFireworkBurst(this.fireworksBurstIndex);
    this.fireworksBurstIndex += 1;
    this.fireworksBurstsRemaining -= 1;
    this.fireworksBonusScore += fireworksScorePerBurst as number;
    this.gameAudio.playEvents([SoundEvent.Firework]);
  }

  private launchFireworkBurst(index: number): void {
    // Alternate bursts left/right of the finish column, drifting up the sky, so
    // the spread reads like the original's scattered explosions.
    const rank = Math.floor(index / 2) + 1;
    const offsetX = (index % 2 === 0 ? 1 : -1) * rank * 22;
    const x = this.fireworksOriginX + offsetX;
    const y = 34 + (index % 3) * 20;
    const burstColors = [0xfff060, 0xff6a6a, 0x66c0ff];
    const color = burstColors[index % burstColors.length] ?? 0xffffff;
    const star = this.add.star(x, y, 8, 2, 7, color).setDepth(131).setAlpha(1);
    this.fireworkSprites.push({
      star,
      framesRemaining: fireworkLifetimeFrames,
    });
  }

  // Crown the flagpole column with a ball and a triangular flag that drops on a
  // finish. The pole segments themselves are drawn per-tile (renderFlagpole
  // Segment); this adds the one-per-column furniture and remembers the flag.
  private renderFlagpoleFurniture(): void {
    this.flagObject = undefined;
    this.flagpoleBallObject = undefined;
    this.flagpoleBallFall = undefined;
    this.flagpoleFlagDropActive = false;
    this.flagpoleSlideActive = false;
    this.flagpoleWalkOffActive = false;
    // A finished walk-off hid the sprite at the castle doorway; the rebuild
    // (next level / retry) brings the player back.
    this.playerImageObject?.setVisible(true);
    // A castle's axe imports as a goal column too — it gets no pole furniture
    // (the castle-clear cinematic owns that ending).
    if (this.castleBridgeTilesByColumn.size > 0) {
      return;
    }
    const size = this.levelSpec.tileSizePixels;
    let column: number | undefined;
    let topRow = Number.POSITIVE_INFINITY;
    let bottomRow = -1;

    for (let row = 0; row < this.levelSpec.heightTiles; row += 1) {
      const columns = this.levelSpec.tiles[row];

      if (columns === undefined) {
        continue;
      }

      for (let col = 0; col < columns.length; col += 1) {
        if (columns[col] === flagpoleTileId) {
          column = col;
          topRow = Math.min(topRow, row);
          bottomRow = Math.max(bottomRow, row);
        }
      }
    }

    if (column === undefined || bottomRow < 0) {
      return;
    }

    const centerX = column * size + size / 2;
    const topY = topRow * size;
    this.flagpoleBallHome = { x: centerX, y: topY };
    this.flagpoleBallObject = this.add
      .circle(centerX, topY, size * 0.34, flagpoleBallColor)
      .setDepth(flagpoleFurnitureDepth);

    const flagHeight = size * flagpoleFlagHeightRatio;
    const flagStartY = topY + size * 0.55;
    const flagTipX = size * -1.25;
    // A left-pointing flag hanging off the pole (the castle sits to the right).
    // Skins may supply pennant art; otherwise draw the fabric triangle.
    const flagImage = this.userAssetBundle?.tileImages.get("flagpole-flag");
    this.flagObject =
      flagImage !== undefined
        ? addUserFrameImage(this, centerX - size, flagStartY, flagImage)
            .setDisplaySize(size, size)
            .setDepth(flagpoleFurnitureDepth)
        : this.add
            .triangle(
              centerX,
              flagStartY,
              0,
              0,
              0,
              flagHeight,
              flagTipX,
              flagHeight / 2,
              flagFabricColor,
            )
            .setOrigin(0, 0)
            .setDepth(flagpoleFurnitureDepth);
    this.flagpoleFlagBaseY = bottomRow * size - flagHeight;
    this.flagpoleFlagHomeY = flagStartY;
  }

  // Undo a finished flag cutscene without rebuilding: the flag returns to the
  // pole top, the knocked ball back onto its tip, and the player sprite (hidden
  // inside the castle after the walk-off) becomes visible again.
  private resetFlagpoleFinishState(): void {
    this.flagpoleSlideActive = false;
    this.flagpoleFlagDropActive = false;
    this.flagpoleWalkOffActive = false;
    this.flagpoleBallFall = undefined;
    if (this.flagObject !== undefined) {
      this.flagObject.y = this.flagpoleFlagHomeY;
    }
    this.flagpoleBallObject
      ?.setPosition(this.flagpoleBallHome.x, this.flagpoleBallHome.y)
      .setVisible(true);
    this.playerImageObject?.setVisible(true);
  }

  private positionPlayerSpriteAt(x: number, y: number): void {
    this.playerRectangle.setPosition(x, y);
    if (this.playerImageObject !== undefined) {
      this.playerImageObject.setPosition(x, y);
    }
  }

  // Does the player's tile span currently overlap a tile with this id? Used to
  // tell a spike (thorn) death from a lava/fire one, since both are Hazard tiles
  // and the defeat reason alone does not name the tile.
  private playerOverlapsTileId(tileId: string): boolean {
    const columnSpan = makePlayerTileColumnSpan(
      this.simulationState.players[0].player,
      this.levelSpec.tileSizePixels,
    );
    const rowSpan = makePlayerTileRowSpan(
      this.simulationState.players[0].player,
      this.levelSpec.tileSizePixels,
    );
    for (let row = rowSpan.start; row <= rowSpan.end; row += 1) {
      const tiles = this.levelSpec.tiles[row];
      if (tiles === undefined) {
        continue;
      }
      for (
        let column = columnSpan.start;
        column <= columnSpan.end;
        column += 1
      ) {
        if (tiles[column] === tileId) {
          return true;
        }
      }
    }
    return false;
  }

  // Which shabby death animation fits the cause: drowning in water, impaling on
  // spikes, burning on lava/fire, or bursting from an enemy hit. Anything else
  // (a plain hazard) falls back to the classic pop-and-fall launch.
  private resolveDeathEffectStyle(
    reason: PlayerDefeatReason,
  ): DeathEffectStyle {
    if (this.currentTheme === "water") {
      return "float";
    }
    if (
      (reason === PlayerDefeatReason.HazardContact ||
        reason === PlayerDefeatReason.HazardAndEnemyContact) &&
      this.playerOverlapsTileId("thorn")
    ) {
      return "impale";
    }
    if (
      reason === PlayerDefeatReason.HazardContact ||
      reason === PlayerDefeatReason.HazardAndEnemyContact
    ) {
      return "burn";
    }
    if (reason === PlayerDefeatReason.EnemyContact) {
      return "explode";
    }
    return "launch";
  }

  // The cartoony death sound matched to the animation style.
  private deathSoundForStyle(style: DeathEffectStyle): DeathSoundKind {
    switch (style) {
      case "float":
        return "drown";
      case "burn":
        return "burn";
      case "impale":
        return "impale";
      case "explode":
      case "launch":
        return "splat";
    }
  }

  // On a contact death, kick off the cause-specific shabby death animation:
  // explode / burn / drown-float / impale, or the classic launch arc. Pit and
  // time-up deaths already read as a fall / freeze, so they get no effect.
  private maybeBeginDeathEffect(): void {
    if (this.deathArcStarted) {
      return;
    }
    const outcome = this.simulationState.players[0].outcome;
    if (
      outcome.kind !== PlayerOutcomeKind.Defeated ||
      (outcome.reason !== PlayerDefeatReason.EnemyContact &&
        outcome.reason !== PlayerDefeatReason.HazardContact &&
        outcome.reason !== PlayerDefeatReason.HazardAndEnemyContact)
    ) {
      return;
    }
    this.deathArcStarted = true;
    this.deathEffectFrame = 0;
    this.deathArcX = this.playerRectangle.x;
    this.deathArcY = this.playerRectangle.y;
    const style = this.resolveDeathEffectStyle(outcome.reason);
    this.deathEffectStyle = style;
    // A cartoony, exaggerated death yelp keyed to the cause.
    if (!this.suppressDeathSounds) {
      this.gameAudio.playDeathSound(this.deathSoundForStyle(style));
    }
    // A drowning body floats up, so keep the camera following it to the surface;
    // every other style plays in place, so freeze the camera there instead of
    // chasing the launched/scattered body and masking the motion.
    if (style !== "float") {
      this.cameras.main.stopFollow();
    }
    if (style === "explode") {
      this.beginExplodeEffect();
    } else if (style === "float") {
      this.beginFloatEffect();
    } else if (style === "burn") {
      this.beginBurnEffect();
    } else if (style === "launch") {
      this.deathArcActive = true;
      this.deathArcVelocityY = -deathArcPopSpeedPixels;
    }
    // "impale" needs no launch velocity — it plays where he fell.
  }

  // Burn: set the body alight — pin flickering flame tongues over it and add a
  // scream on top of the sizzle. The body then chars and shrinks in stepBurn.
  private beginBurnEffect(): void {
    if (!this.suppressDeathSounds) {
      this.gameAudio.playScream();
    }
    const flameAsset = this.userAssetBundle?.reactionImages.get("burn-flame");
    if (flameAsset === undefined) {
      return;
    }
    const width = this.simulationState.players[0].player.collider.width;
    const height = this.simulationState.players[0].player.collider.height;
    for (let index = 0; index < deathBurnFlameCount; index += 1) {
      const image = addUserFrameImage(this, 0, 0, flameAsset);
      image.setOrigin(0.5).setDepth(62).setVisible(true);
      const spread = (index / (deathBurnFlameCount - 1) - 0.5) * width * 0.8;
      this.deathFlames.push({
        image,
        offsetX: spread,
        offsetY: height * (-0.15 + (index % 2) * 0.2),
        phase: index * 1.7,
        baseScale: 0.8 + (index % 2) * 0.35,
      });
    }
  }

  // Explode: a small blast dismembers the body into dedicated, authored body-part
  // sprites — head, torso, two arms, two legs (severed parts, not crops of the
  // body). Each part is flung only slightly outward from the body centre, spins,
  // and then falls under gravity like a projectile. The head carries the X-ed
  // eyes. Falls back to the launch arc only if the part sprites are unavailable.
  private beginExplodeEffect(): void {
    const partAsset = this.userAssetBundle?.reactionImages.get("part-torso");
    if (partAsset === undefined) {
      this.deathEffectStyle = "launch";
      this.deathArcActive = true;
      this.deathArcVelocityY = -deathArcPopSpeedPixels;
      return;
    }
    const width = this.simulationState.players[0].player.collider.width;
    const height = this.simulationState.players[0].player.collider.height;
    if (this.playerImageObject !== undefined) {
      this.playerImageObject.setVisible(false);
    }
    const centreX = this.deathArcX + width / 2;
    const centreY = this.deathArcY + height / 2;
    // Body parts collide with the level's blocks as they fall (built once here).
    this.deathPartCollisionLookup = makeTileCollisionLookup(this.levelSpec);
    this.spawnExplosionBurst(centreX, centreY);
    // Each part: which authored sprite, where on the body box (fraction of w/h)
    // it starts, whether it is mirrored, and how hard it is flung sideways.
    const parts: {
      readonly id: string;
      readonly fx: number;
      readonly fy: number;
      readonly flip: boolean;
      readonly fling: number;
      readonly head?: boolean;
    }[] = [
      {
        id: "part-head",
        fx: 0.5,
        fy: 0.14,
        flip: false,
        fling: 0.6,
        head: true,
      },
      { id: "part-torso", fx: 0.5, fy: 0.5, flip: false, fling: -0.4 },
      { id: "part-arm", fx: 0.16, fy: 0.44, flip: true, fling: -2.8 },
      { id: "part-arm", fx: 0.84, fy: 0.44, flip: false, fling: 2.9 },
      { id: "part-leg", fx: 0.34, fy: 0.82, flip: true, fling: -1.7 },
      { id: "part-leg", fx: 0.66, fy: 0.82, flip: false, fling: 1.8 },
    ];
    parts.forEach((part, index) => {
      const asset = this.userAssetBundle?.reactionImages.get(part.id);
      if (asset === undefined) {
        return;
      }
      const partX = this.deathArcX + part.fx * width;
      const partY = this.deathArcY + part.fy * height;
      const eyes =
        part.head === true ? this.makeHeadEyesOverlay(partX, partY) : undefined;
      this.pushFlyingDeathPart(this.deathPieces, {
        asset,
        x: partX,
        y: partY,
        width,
        height,
        flip: part.flip,
        fling: part.fling,
        popIndex: index,
        eyes,
      });
    });
  }

  // Build one flung, spinning body part (image + physics body, +/- an eyes
  // overlay) and add it to a piece list. Shared by the primary explosion and
  // each bot's, so the launch physics stay identical.
  private pushFlyingDeathPart(
    into: FlyingDeathPart[],
    spec: {
      readonly asset: LoadedImageAsset;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly flip: boolean;
      readonly fling: number;
      readonly popIndex: number;
      readonly eyes?: Phaser.GameObjects.Image | undefined;
    },
  ): void {
    const image = addUserFrameImage(this, 0, 0, spec.asset)
      .setOrigin(0.5)
      .setDisplaySize(spec.width, spec.height)
      .setFlipX(spec.flip)
      .setPosition(spec.x, spec.y)
      .setDepth(60);
    const halfExtent =
      Math.min(spec.width, spec.height) * deathPartHalfExtentFraction;
    into.push({
      image,
      body: {
        x: spec.x,
        y: spec.y,
        vx: spec.fling,
        vy: -deathExplodePopSpeedPixels - (spec.popIndex % 3) * 0.5,
        halfWidth: halfExtent,
        halfHeight: halfExtent,
      },
      vr: (spec.fling >= 0 ? 1 : -1) * deathExplodeSpinRadiansPerFrame,
      ...(spec.eyes !== undefined ? { eyes: spec.eyes } : {}),
    });
  }

  // The expanding starburst flash of the initial blast.
  private spawnExplosionBurst(x: number, y: number): void {
    const burstAsset =
      this.userAssetBundle?.reactionImages.get("explosion-burst");
    if (burstAsset === undefined) {
      return;
    }
    const image = addUserFrameImage(this, 0, 0, burstAsset);
    image.setOrigin(0.5).setPosition(x, y).setDepth(63).setScale(0.5);
    this.deathBurst = { image, life: 0 };
  }

  // An X-ed-eyes overlay aligned to the head part (same frame size, so the X's
  // land on the head's face), riding along with it.
  private makeHeadEyesOverlay(
    x: number,
    y: number,
  ): Phaser.GameObjects.Image | undefined {
    const eyesAsset =
      this.userAssetBundle?.reactionImages.get("player-dead-eyes");
    if (eyesAsset === undefined) {
      return undefined;
    }
    const width = this.simulationState.players[0].player.collider.width;
    const height = this.simulationState.players[0].player.collider.height;
    return addUserFrameImage(this, 0, 0, eyesAsset)
      .setOrigin(0.5)
      .setDisplaySize(width, height)
      .setPosition(x, y)
      .setDepth(64);
  }

  // Float: flip the body belly-up, lay an authored X-ed-eyes overlay over the
  // face, and drift him up toward the surface — the drowned dead-fish read.
  private beginFloatEffect(): void {
    if (this.playerImageObject !== undefined) {
      this.playerImageObject.setFlipY(true);
    }
    const eyesAsset =
      this.userAssetBundle?.reactionImages.get("player-dead-eyes");
    if (eyesAsset !== undefined) {
      this.deathXEyesImage = addUserFrameImage(this, 0, 0, eyesAsset);
      this.deathXEyesImage
        .setOrigin(0)
        .setFlipY(true)
        .setDepth(61)
        .setVisible(true);
    }
  }

  private stepDeathEffect(): void {
    if (!this.deathArcStarted) {
      return;
    }
    this.deathEffectFrame += 1;
    switch (this.deathEffectStyle) {
      case "explode":
        this.stepExplodeEffect();
        return;
      case "burn":
        this.stepBurnEffect();
        return;
      case "float":
        this.stepFloatEffect();
        return;
      case "impale":
        this.stepImpaleEffect();
        return;
      case "launch":
        this.stepLaunchEffect();
        return;
    }
  }

  private stepExplodeEffect(): void {
    this.stepExplosionBurst();
    // A part that falls this far past the level floor with nothing to catch it is
    // gone for good — remove it instead of letting it fall forever.
    const belowLevelY = this.belowLevelFallLimit();
    const hitCoopPlayerIndices = new Set<number>();
    this.deathPieces = this.flyDeathParts(
      this.deathPieces,
      belowLevelY,
      hitCoopPlayerIndices,
    );
    this.removeHitCoopPlayers(hitCoopPlayerIndices);
    this.stepKnockedEnemies(belowLevelY);
  }

  // The y past which a fallen part is gone for good (well below the level floor).
  private belowLevelFallLimit(): number {
    const size = this.levelSpec.tileSizePixels;
    return this.levelSpec.heightTiles * size + size * 2;
  }

  // Fly a list of body parts one frame: gravity + block collisions, knock out
  // any struck enemy, collect any struck co-op bot's index, and drop parts that
  // fell off the world. Returns the survivors. Shared by the primary explosion
  // and each bot's, so the spin/land/strike behaviour is identical.
  private flyDeathParts(
    pieces: readonly FlyingDeathPart[],
    belowLevelY: number,
    hitCoopPlayerIndices: Set<number>,
  ): FlyingDeathPart[] {
    const params: DeathPartPhysicsParams = {
      ...deathPartPhysicsParams,
      tileSize: this.levelSpec.tileSizePixels,
    };
    const isSolidTile = (column: number, row: number): boolean =>
      this.deathPartTileIsSolid(column, row);
    const { boxes, targets } = this.deathPartTargets();
    // Phase 1: fly each part (gravity + terrain + enemy bounce). A struck enemy
    // or bot is only actually harmed on a 1-in-5 roll — the part always bounces
    // off, but rarely kills — so a burst is a hazard, not a guaranteed wipe. A
    // part already at rest is inert and reports nothing.
    for (const piece of pieces) {
      const result = stepDeathPartBody(piece.body, isSolidTile, boxes, params);
      if (result.landed) {
        piece.vr *= 0.5;
      }
      for (const hitIndex of result.hitEnemyIndices) {
        if (!this.rollDeathPartDamage()) {
          continue;
        }
        const target = targets[hitIndex];
        if (target === undefined) {
          continue;
        }
        if (target.kind === "enemy") {
          this.knockOutEnemy(target.entityId, piece.body.vx);
        } else {
          hitCoopPlayerIndices.add(target.index);
        }
      }
    }
    // Phase 2: bounce the still-moving parts off each other (settled parts are
    // inert and block nothing).
    resolveDeathPartCollisions(
      pieces.map((piece) => piece.body),
      params,
    );
    // Phase 3: sync each sprite to its (now fully resolved) body and drop parts
    // that fell off the world.
    const survivors: FlyingDeathPart[] = [];
    for (const piece of pieces) {
      piece.image.setPosition(piece.body.x, piece.body.y);
      piece.image.rotation += piece.vr;
      // The head's X-ed eyes ride along with it.
      if (piece.eyes !== undefined) {
        piece.eyes.setPosition(piece.body.x, piece.body.y);
        piece.eyes.rotation = piece.image.rotation;
      }
      if (piece.body.y > belowLevelY) {
        piece.image.destroy();
        piece.eyes?.destroy();
        continue;
      }
      survivors.push(piece);
    }
    return survivors;
  }

  // A deterministic 1-in-5 roll for whether a flying body part actually harms
  // what it struck (it always bounces regardless). A seeded LCG — not
  // Math.random — keeps the shell reproducible, matching the codebase style.
  private rollDeathPartDamage(): boolean {
    this.deathDamageRoll = (this.deathDamageRoll * 1103515245 + 12345) >>> 0;
    return (this.deathDamageRoll >>> 24) % 5 === 0;
  }

  // Take the struck co-op bots out of the sim (dead until the level ends); their
  // own explosions follow next frame when the tracker notices them gone.
  private removeHitCoopPlayers(
    hitCoopPlayerIndices: ReadonlySet<number>,
  ): void {
    if (hitCoopPlayerIndices.size === 0) {
      return;
    }
    const remaining = this.simulationState.players
      .slice(1)
      .filter((_unused, index) => !hitCoopPlayerIndices.has(index));
    this.simulationState = {
      ...this.simulationState,
      players: [this.simulationState.players[0], ...remaining],
    };
  }

  // Whether the tile at a grid cell stops a falling body part (ground, pipe, or
  // block). Out-of-bounds / undefined tiles never block, so a part that runs off
  // the side or bottom of the level keeps falling.
  private deathPartTileIsSolid(column: number, row: number): boolean {
    const lookup = this.deathPartCollisionLookup;
    if (
      lookup === undefined ||
      row < 0 ||
      row >= this.levelSpec.heightTiles ||
      column < 0 ||
      column >= this.levelSpec.widthTiles
    ) {
      return false;
    }
    const tileId = this.levelSpec.tiles[row]?.[column];
    if (tileId === undefined) {
      return false;
    }
    return deathPartBlockingCollisionKinds.has(
      requireTileCollision(lookup, tileId),
    );
  }

  // Boxes the flying body parts can strike: the enemies still on the field plus
  // the other (co-op) players, each tagged so a hit knocks out an enemy or takes
  // out a player.
  private deathPartTargets(): {
    readonly boxes: readonly DeathPartBox[];
    readonly targets: readonly DeathPartTarget[];
  } {
    const size = this.levelSpec.tileSizePixels;
    const defeated = new Set(
      this.simulationState.enemies.defeatedEnemyEntityIds.map(String),
    );
    const boxes: DeathPartBox[] = [];
    const targets: DeathPartTarget[] = [];
    for (const actor of this.renderedActors) {
      if (
        !isEnemyRole(actor.role) ||
        defeated.has(actor.entityId) ||
        this.deathKnockedEnemies.has(actor.entityId)
      ) {
        continue;
      }
      const { x, y } = makeRuntimeRenderedActorPixelPosition(
        actor,
        this.simulationState,
      );
      boxes.push({ left: x, top: y, right: x + size, bottom: y + size });
      targets.push({ kind: "enemy", entityId: actor.entityId });
    }
    this.simulationState.players.slice(1).forEach((runtime, index) => {
      const player = runtime.player;
      const left = Number(player.position.x);
      const top = Number(player.position.y);
      boxes.push({
        left,
        top,
        right: left + Number(player.collider.width),
        bottom: top + Number(player.collider.height),
      });
      targets.push({ kind: "coop", index });
    });
    return { boxes, targets };
  }

  // Fling an enemy off: it pops up, flips over and ragdolls away under gravity.
  private knockOutEnemy(entityId: string, incomingVx: number): void {
    if (this.deathKnockedEnemies.has(entityId)) {
      return;
    }
    const actor = this.renderedActors.find(
      (candidate) => candidate.entityId === entityId,
    );
    if (actor === undefined) {
      return;
    }
    const direction = incomingVx >= 0 ? 1 : -1;
    this.deathKnockedEnemies.set(entityId, {
      renderObject: actor.renderObject,
      ...(actor.wingObject !== undefined
        ? { wingObject: actor.wingObject }
        : {}),
      x: actor.renderObject.x,
      y: actor.renderObject.y,
      vx: direction * (1 + Math.abs(incomingVx) * 0.4),
      vy: -deathKnockedEnemyPopSpeedPixels,
      angle: 0,
      settled: false,
    });
    this.deathKnockedEnemyCount += 1;
  }

  // Advance each knocked-out enemy's ragdoll (flipped over via a negative Y
  // scale, since a Container can't flip like an image) and hide it once it has
  // fallen away. Entries persist (settled) so the normal actor render keeps
  // skipping them rather than snapping them back to their live position.
  private stepKnockedEnemies(belowLevelY: number): void {
    for (const enemy of this.deathKnockedEnemies.values()) {
      if (enemy.settled) {
        continue;
      }
      enemy.vy += deathKnockedEnemyGravityPixels;
      enemy.x += enemy.vx;
      enemy.y += enemy.vy;
      enemy.angle += deathKnockedEnemySpinRadians;
      enemy.renderObject
        .setPosition(enemy.x, enemy.y)
        .setRotation(enemy.angle)
        .setScale(1, -1);
      enemy.wingObject?.setVisible(false);
      if (enemy.y > belowLevelY) {
        enemy.renderObject.setVisible(false);
        enemy.settled = true;
      }
    }
  }

  // Expand and fade the initial blast flash, then remove it.
  private stepExplosionBurst(): void {
    const burst = this.deathBurst;
    if (burst === undefined) {
      return;
    }
    burst.life += 1;
    const progress = burst.life / deathBurstLifeFrames;
    burst.image
      .setScale(0.5 + progress * (deathBurstMaxScale - 0.5))
      .setAlpha(Math.max(0, 1 - progress));
    if (burst.life >= deathBurstLifeFrames) {
      burst.image.destroy();
      this.deathBurst = undefined;
    }
  }

  private stepBurnEffect(): void {
    if (this.deathEffectFrame < deathBurnFireFrames) {
      this.stepBurnFirePhase();
    } else {
      this.stepBurnHuskPhase();
    }
    if (
      this.deathEffectFrame % deathBurnSmokeIntervalFrames === 0 &&
      this.deathEffectFrame <= deathBurnDurationFrames
    ) {
      this.spawnSmokePuff();
    }
    this.stepSmoke();
  }

  // Phase 1: the body stands and burns at full size for ~1s — flame tongues lick
  // over it and it chars from its normal colour to black. It does not shrink.
  private stepBurnFirePhase(): void {
    this.positionPlayerSpriteAt(this.deathArcX, this.deathArcY);
    this.holdDeadPose();
    const char = Math.min(1, this.deathEffectFrame / deathBurnFireFrames);
    if (this.playerImageObject !== undefined) {
      // Darken toward charcoal as it burns (full size throughout).
      const channel = Math.round(255 - char * 215);
      const tint = (channel << 16) | (channel << 8) | channel;
      this.playerImageObject.setVisible(true).setTint(tint);
    }
    this.stepBurnFlames(1);
  }

  // Phase 2: the fire has done its work — swap the body for the charred husk and
  // let it topple into a ragdoll fall (a small pop, then spin under gravity).
  private stepBurnHuskPhase(): void {
    if (this.deathHusk === undefined) {
      this.beginHuskRagdoll();
    }
    const husk = this.deathHusk;
    if (husk !== undefined) {
      husk.vy += deathBurnHuskGravityPixels;
      husk.image.x += husk.vx;
      husk.image.y += husk.vy;
      husk.image.rotation += husk.vr;
    }
    // The flames gutter out as the husk falls away.
    const fade = Math.max(
      0,
      1 -
        (this.deathEffectFrame - deathBurnFireFrames) /
          (deathBurnDurationFrames - deathBurnFireFrames),
    );
    this.stepBurnFlames(fade);
  }

  // Replace the burning body with the authored charred-husk sprite and give it a
  // ragdoll topple. Falls back to the tinted player crop if no husk sprite.
  private beginHuskRagdoll(): void {
    if (this.playerImageObject !== undefined) {
      this.playerImageObject.setVisible(false);
    }
    const width = this.simulationState.players[0].player.collider.width;
    const height = this.simulationState.players[0].player.collider.height;
    const huskAsset = this.userAssetBundle?.reactionImages.get("burned-husk");
    const image =
      huskAsset !== undefined
        ? addUserFrameImage(this, 0, 0, huskAsset).setDisplaySize(width, height)
        : this.add
            .image(0, 0, this.playerImageObject?.texture.key ?? "")
            .setDisplaySize(width, height)
            .setTint(0x161616);
    image
      .setOrigin(0.5)
      .setPosition(this.deathArcX + width / 2, this.deathArcY + height / 2)
      .setDepth(60);
    this.deathHusk = {
      image,
      vx: this.facingRight ? 1.1 : -1.1,
      vy: -deathBurnHuskPopSpeedPixels,
      vr: (this.facingRight ? 1 : -1) * deathBurnHuskSpinRadiansPerFrame,
    };
  }

  // Flicker the flame tongues over the burning body and shrink/fade them along
  // with it, so the fire dies down as the body is consumed.
  private stepBurnFlames(bodyScale: number): void {
    const centerX =
      this.deathArcX +
      this.simulationState.players[0].player.collider.width / 2;
    const centerY =
      this.deathArcY +
      this.simulationState.players[0].player.collider.height / 2;
    for (const flame of this.deathFlames) {
      const flicker =
        1 +
        Math.sin(this.deathEffectFrame * 0.6 + flame.phase) *
          deathBurnFlameFlickerAmplitude;
      const scale = flame.baseScale * flicker * Math.max(0.15, bodyScale);
      flame.image
        .setPosition(
          centerX + flame.offsetX * bodyScale,
          centerY + flame.offsetY,
        )
        .setScale(scale)
        .setAlpha(Math.max(0, bodyScale));
    }
  }

  private spawnSmokePuff(): void {
    const smokeAsset = this.userAssetBundle?.reactionImages.get("smoke-puff");
    if (smokeAsset === undefined) {
      return;
    }
    const image = addUserFrameImage(this, 0, 0, smokeAsset);
    const jitter = ((this.deathEffectFrame * 7) % 9) - 4;
    image
      .setOrigin(0.5)
      .setPosition(
        this.deathArcX +
          this.simulationState.players[0].player.collider.width / 2 +
          jitter,
        this.deathArcY,
      )
      .setDepth(62)
      .setVisible(true);
    this.deathSmoke.push({
      image,
      vy: -deathBurnSmokeRiseSpeedPixels,
      life: 0,
    });
  }

  private stepSmoke(): void {
    for (const puff of this.deathSmoke) {
      puff.life += 1;
      puff.image.y += puff.vy;
      const fade = Math.max(0, 1 - puff.life / deathBurnSmokeLifeFrames);
      puff.image
        .setAlpha(fade)
        .setScale(1 + puff.life / deathBurnSmokeLifeFrames);
    }
    this.deathSmoke = this.deathSmoke.filter((puff) => {
      if (puff.life >= deathBurnSmokeLifeFrames) {
        puff.image.destroy();
        return false;
      }
      return true;
    });
  }

  // The world y a drowned body floats up to: just below the top of the level.
  private floatSurfaceY(): number {
    return deathFloatSurfaceMarginPixels;
  }

  private stepFloatEffect(): void {
    // Drift up to (but not through) the surface with a gentle wobble.
    const surfaceY = this.floatSurfaceY();
    if (this.deathArcY > surfaceY) {
      this.deathArcY -= deathFloatRiseSpeedPixels;
    } else if (this.deathFloatSurfaceFrame < 0) {
      // Record the frame the body first reached the surface, so the menu can
      // hold a beat longer there before opening.
      this.deathFloatSurfaceFrame = this.deathEffectFrame;
    }
    const wobble =
      Math.sin(
        (this.deathEffectFrame / deathFloatWobbleFramesPerCycle) * Math.PI * 2,
      ) * deathFloatWobbleAmplitudePixels;
    const bodyX = this.deathArcX + wobble;
    this.positionPlayerSpriteAt(bodyX, this.deathArcY);
    this.holdDeadPose();
    const width = this.simulationState.players[0].player.collider.width;
    const height = this.simulationState.players[0].player.collider.height;
    // Pin the sprite to the upright collider box, belly-up (the normal render
    // leaves the wide, mirrored swim box), so the X-ed-eyes overlay — laid over
    // the exact same box — lands on the face rather than drifting off it.
    if (this.playerImageObject !== undefined) {
      this.playerImageObject
        .setFlipX(false)
        .setFlipY(true)
        .setDisplaySize(width, height)
        .setPosition(bodyX, this.deathArcY);
    }
    if (this.deathXEyesImage !== undefined) {
      this.deathXEyesImage
        .setOrigin(0)
        .setFlipX(false)
        .setFlipY(true)
        .setDisplaySize(width, height)
        .setPosition(bodyX, this.deathArcY);
    }
  }

  private stepImpaleEffect(): void {
    // Pin the limp body where he fell onto the spikes; lay the X-ed-eyes overlay
    // over his face so he reads as dead-on-the-spikes, not merely standing.
    this.positionPlayerSpriteAt(this.deathArcX, this.deathArcY);
    this.holdDeadPose();
    if (this.deathXEyesImage === undefined) {
      const eyesAsset =
        this.userAssetBundle?.reactionImages.get("player-dead-eyes");
      if (eyesAsset !== undefined) {
        this.deathXEyesImage = addUserFrameImage(this, 0, 0, eyesAsset);
        this.deathXEyesImage.setOrigin(0).setDepth(61).setVisible(true);
      }
    }
    if (this.deathXEyesImage !== undefined) {
      this.deathXEyesImage.setPosition(this.deathArcX, this.deathArcY);
    }
  }

  private stepLaunchEffect(): void {
    // Advance the arc while it is still on/near screen; once it has fallen off
    // the bottom, stop advancing but keep the player pinned there so the normal
    // render does not snap the dead player back onto the ground.
    if (this.deathArcActive) {
      this.deathArcVelocityY += deathArcGravityPixels;
      this.deathArcY += this.deathArcVelocityY;
      if (
        this.deathArcY >
        makeLevelWorldHeightPixels(this.levelSpec) +
          deathArcOffscreenMarginPixels
      ) {
        this.deathArcActive = false;
      }
    }
    this.positionPlayerSpriteAt(this.deathArcX, this.deathArcY);
    this.holdDeadPose();
  }

  // Tear down any in-flight death effect and restore the player sprite so a
  // retry / next level starts from a clean, upright, visible body.
  private clearDeathEffect(): void {
    for (const piece of this.deathPieces) {
      piece.image.destroy();
      piece.eyes?.destroy();
    }
    this.deathPieces = [];
    for (const puff of this.deathSmoke) {
      puff.image.destroy();
    }
    this.deathSmoke = [];
    for (const flame of this.deathFlames) {
      flame.image.destroy();
    }
    this.deathFlames = [];
    if (this.deathXEyesImage !== undefined) {
      this.deathXEyesImage.destroy();
      this.deathXEyesImage = undefined;
    }
    if (this.deathBurst !== undefined) {
      this.deathBurst.image.destroy();
      this.deathBurst = undefined;
    }
    if (this.deathHusk !== undefined) {
      this.deathHusk.image.destroy();
      this.deathHusk = undefined;
    }
    // Restore any part-knocked enemy render objects (reused across a retry) to
    // upright, unflipped, visible — the next run repositions them normally.
    for (const enemy of this.deathKnockedEnemies.values()) {
      enemy.renderObject.setScale(1, 1).setRotation(0).setVisible(true);
    }
    this.deathKnockedEnemies.clear();
    this.deathKnockedEnemyCount = 0;
    this.deathPartCollisionLookup = undefined;
    // A new level / retry starts bot tracking fresh so a respawn is never read
    // as a death and no stale bot parts linger.
    this.resetCoopBotState();
    this.deathEffectStyle = "launch";
    this.deathEffectFrame = 0;
    this.deathFloatSurfaceFrame = -1;
    // Restore the player sprite to upright, untinted, full size after a death.
    if (this.playerImageObject !== undefined) {
      this.playerImageObject
        .setVisible(true)
        .setFlipY(false)
        .clearTint()
        .setDisplaySize(
          this.simulationState.players[0].player.collider.width,
          this.simulationState.players[0].player.collider.height,
        );
    }
  }

  // Hold a neutral death pose (the original's dying Mario uses the small idle
  // frame) instead of the frozen walk/run frame the normal render leaves.
  private holdDeadPose(): void {
    if (
      this.playerImageObject !== undefined &&
      this.userAssetBundle?.playerImage !== undefined
    ) {
      const deathImage = resolveFirstStatefulImage(
        this.userAssetBundle.playerImage,
        ["small-idle", "idle"],
      );
      setUserFrameImage(this, this.playerImageObject, deathImage);
    }
  }

  public override update(): void {
    assertValidPlayerVitalityState(this.simulationState.players[0].vitality);
    assertValidPlayerOutcomeState(this.simulationState.players[0].outcome);
    assertValidCollectibleInteractionState(
      this.simulationState.collectibles,
      this.levelSpec,
      this.simulationState.spawnedActors.spawnedActors,
    );
    assertValidEnemyInteractionState(
      this.simulationState.enemies,
      this.levelSpec,
    );
    assertValidEnemyContactResponseState(
      this.simulationState.enemyContactResponse,
      this.levelSpec,
    );
    assertValidEnemyMotionState(
      this.simulationState.enemyMotion,
      this.levelSpec,
    );

    // Advance the cinematic camera shake every frame (before any early return),
    // so its viewport offset always resolves cleanly back to zero.
    this.stepCameraShake();

    // ESC exits to wherever the level was launched from (start menu or editor).
    if (
      this.exitRequested &&
      this.browserGameBootstrap.onExitToMenu !== undefined
    ) {
      this.exitRequested = false;
      this.browserGameBootstrap.onExitToMenu();
      return;
    }
    this.exitRequested = false;

    // Hold on the first frame (prompt shown) until the player presses a key or
    // taps a touch control. The WORLD card sits behind the prompt.
    if (this.awaitingStart) {
      this.showFlowCard(
        `WORLD ${this.currentWorldLabel()}`,
        `MARIO \xD7 ${String(this.simulationState.livesRemaining)}`,
      );
      // Poll the keys each frame too, so a key held down before the keydown
      // listener was ready (async skin load) still starts the run — not just a
      // touch tap or a well-timed keypress.
      const anyStartKeyDown =
        this.anyDown(jumpKeyCodes) ||
        this.anyDown(leftKeyCodes) ||
        this.anyDown(rightKeyCodes) ||
        this.anyDown(upKeyCodes) ||
        this.anyDown(downKeyCodes) ||
        this.anyDown(runKeyCodes) ||
        this.anyDown(fireKeyCodes);
      if (this.touchStartRequested || anyStartKeyDown) {
        this.touchStartRequested = false;
        this.beginPlay();
      }
      return;
    }

    // A "WORLD w-l" intro card freezes each level briefly before play (the
    // first level's hold is the press-any-key gate above, so it starts spent).
    if (this.levelIntroFramesRemaining > 0) {
      if (this.levelIntroFramesRemaining > worldCardFrames) {
        // The clock ran out: the ROM's TIME UP card precedes the world card.
        this.showFlowCard("TIME UP", "");
      } else {
        this.showFlowCard(
          `WORLD ${this.currentWorldLabel()}`,
          `MARIO \xD7 ${String(this.simulationState.livesRemaining)}`,
        );
      }
      this.levelIntroFramesRemaining -= 1;
      if (this.levelIntroFramesRemaining === 0) {
        this.hideFlowCard();
      }
      return;
    }

    const pauseDown = this.anyDown(pauseKeyCodes);
    if (pauseDown && !this.pauseWasDown) {
      this.togglePause();
    }
    this.pauseWasDown = pauseDown;

    if (this.paused) {
      // While paused the simulation is frozen and the timeline drives what is
      // shown: play the recording back, hold left/right to scrub (Shift scrubs
      // faster, and pauses playback), or retry.
      // Only keys pressed AFTER the pause count as scrub intent — a player
      // (or test) still holding Right from the moment of death must not
      // cancel the death instant replay.
      const scrubbing =
        this.anyFreshlyDown(leftKeyCodes) || this.anyFreshlyDown(rightKeyCodes);
      if (scrubbing) {
        this.setReplayPlaying(false);
        this.handleScrubInput();
      } else if (this.replayPlaying) {
        this.advanceReplayPlayback();
      }
      if (this.shouldRetrySimulation()) {
        this.resetSimulation();
      }
      return;
    }

    if (this.shouldRetrySimulation()) {
      this.resetSimulation();
      return;
    }

    if (this.levelAdvanceDelayFramesRemaining > 0) {
      this.levelAdvanceDelayFramesRemaining -= 1;
      this.stepFlagpoleSlide();
      this.stepCastleClearCinematic();
      this.stepVictoryFireworks();
      this.stepTimeBonusCountdown();

      if (this.levelAdvanceDelayFramesRemaining === 0) {
        this.advanceToNextLevel();
        // A level end with no next level to advance to opens the replay menu
        // (advanceToNextLevel leaves the finished outcome in place).
        if (this.hasFinishedOutcome()) {
          this.enterPause(true);
        }
      }

      return;
    }

    // Snapshot the camera view for the currently displayed frame before we step
    // past it, so scrubbing back can reproduce exactly what was on screen.
    // Vertically we record the view's world-space BOTTOM edge rather than the
    // raw scroll: the paused/replay viewport is shorter (the replay bar
    // reserves bottom space), and a raw scrollY restore would anchor the TOP,
    // cropping away the ground — where deaths and finishes play out.
    this.recordedCameraScrolls[this.runRecorder.frameCount] = {
      x: this.cameras.main.scrollX,
      worldBottom: this.cameraWorldBottom(),
    };

    const previousSimulationState = this.simulationState;
    const inputCommand = this.makeCurrentInputCommand();
    // The additional co-op players are demo bots: deterministic pseudo-random
    // inputs (replay-stable), one per co-op player this frame.
    const coopInputCommands = makeBotInputCommands(
      Number(previousSimulationState.clock.frameIndex),
      previousSimulationState.players.length - 1,
    );
    this.simulationState = stepSimulation(
      previousSimulationState,
      inputCommand,
      resolveMovementConstants(
        this.currentTheme,
        this.exaggeratedReactions,
        this.godMode,
      ),
      this.levelSpec,
      coopInputCommands,
    );
    // Same-screen co-op: keep every co-op player within the visible screen (the
    // camera follows the human primary), so nobody wanders off — a player is
    // blocked at the left or right screen edge. Applied before recording so the
    // replay reproduces it.
    this.clampCoopPlayersToScreen();
    // Track each bot's stable robot costume and detect any bot that died this
    // step (vanished from the sim), bursting it into its own robot's parts.
    this.syncCoopBotsAndDetectDeaths();
    this.runRecorder.record(inputCommand, this.simulationState);
    this.latchEnemyContactObservation();
    this.lastSoundEvents = resolveSoundEvents(
      previousSimulationState,
      this.simulationState,
    );

    // Any flag grab plays the completion jingle and the flagpole slide; whether
    // the level then advances is decided when the delay elapses (a last level
    // just stays finished and offers a retry).
    if (!this.levelCompleteSoundPlayed && this.hasFinishedOutcome()) {
      this.levelCompleteSoundPlayed = true;
      this.levelAdvanceDelayFramesRemaining = this.levelAdvanceDelayFrames;
      this.beginFlagpoleSlide();
      this.beginTimeBonusCountdown();
      // The flagpole grab takes over the music with the fanfare; a castle end
      // (an axe, not a pole) plays the grander world-clear victory theme.
      const isCastleClear = this.castleBridgeTilesByColumn.size > 0;
      this.gameAudio.playJingle(isCastleClear ? "victory" : "level-clear");
      // A castle ends at the axe: stage the bridge chop, the boss's fall and
      // the rescue message before the finish overlay appears.
      if (isCastleClear) {
        this.castleClearTotalFrames =
          this.castleBridgeTilesByColumn.size * castleBridgeChopFrames +
          castleClearFallFrames +
          castleClearWalkFrames +
          castleClearMessageHoldFrames;
        this.castleClearFramesRemaining = this.castleClearTotalFrames;
        this.levelAdvanceDelayFramesRemaining += this.castleClearTotalFrames;
      }
    }

    this.stepEventMusic();
    this.stepHaptics(this.lastSoundEvents);
    this.gameAudio.playEvents(this.lastSoundEvents);
    // A pained, cartoony "ouch" layered over the head-bonk thud.
    if (this.lastSoundEvents.includes(SoundEvent.HeadBonk)) {
      this.gameAudio.playOuch();
    }
    // Revenge mode: each Mario/Luigi you stomp yelps an over-acted
    // "itsa"/"me"/"ow" in sequence.
    if (this.revengeMode && this.lastSoundEvents.includes(SoundEvent.Stomp)) {
      this.gameAudio.playRevengeStompVoice();
    }

    this.renderSimulationState();

    this.maybeCaptureThumbnail();

    // Death animation plays over the frozen (defeated) simulation, overriding
    // the player sprite position after the normal render.
    this.maybeBeginDeathEffect();
    this.stepDeathEffect();
    this.stepBotDeathPieces();
    this.maybeEnterReplayMenu();
    this.maybeExecuteLevelWarp();
  }

  // A pipe whose target is another named level warps there once the entry
  // animation completes: capture the target when entry starts, then load that
  // level and drop the player at the destination tile when entry finishes.
  private maybeExecuteLevelWarp(): void {
    const pipeEntry = this.simulationState.pipeEntry;

    if (
      pipeEntry.phase === PipeEntryPhase.Entering &&
      pipeEntry.targetLevelName !== undefined &&
      this.pendingLevelWarp === undefined
    ) {
      this.pendingLevelWarp = {
        targetLevelName: pipeEntry.targetLevelName,
        targetTilePosition: pipeEntry.targetTilePosition,
      };
      return;
    }

    if (
      this.pendingLevelWarp !== undefined &&
      pipeEntry.phase === PipeEntryPhase.None
    ) {
      const warp = this.pendingLevelWarp;
      this.pendingLevelWarp = undefined;
      this.executeLevelWarp(warp.targetLevelName, warp.targetTilePosition);
    }
  }

  private executeLevelWarp(
    targetLevelName: string,
    targetTilePosition: TilePoint,
  ): void {
    const targetInput = this.warpLevelsByName?.get(targetLevelName);

    if (targetInput === undefined) {
      return; // Unknown target — stay in the current level.
    }

    // Bank the current area's score and carry the power tier before the warp
    // rebuilds the level.
    this.bankCurrentLevelScore();
    this.carriedPlayerVitality = this.tierToCarryForward();
    this.warpedLevelInput = cullEnemiesBehindWarpEntry(
      targetInput,
      targetTilePosition.x,
    );
    // A warp landing at another MAIN level's start is a world jump (the warp
    // zones): the run now belongs to that level — retitle the HUD and advance
    // from there. Mid-page landings (flag tails, bonus-room returns) and
    // sub-areas keep the origin's identity.
    if (
      /^smb-\d+-\d+$/.test(targetLevelName) &&
      targetTilePosition.x <= mainLevelStartTileX
    ) {
      this.currentMainLevelName = targetLevelName;
      this.activeWorldLevelLabel =
        this.browserGameBootstrap.worldLevelLabelByName?.get(targetLevelName) ??
        worldLevelLabelFor(targetLevelName);
    }
    // Switch to the sub-section's theme before rebuilding, so its palette,
    // backdrop, physics, and (for water) swimming all match. buildLevelObjects
    // reads currentTheme for the palette + parallax background.
    const targetTheme = this.warpLevelThemesByName?.get(targetLevelName);
    if (targetTheme !== undefined && targetTheme !== this.currentTheme) {
      this.currentTheme = targetTheme;
      this.gameAudio.startBackgroundMusic(this.currentTheme);
    }
    this.destroyLevelObjects();
    this.buildLevelObjects();
    // buildLevelObjects starts the player at the level's spawn; drop them at the
    // pipe's destination tile instead, as a falling body so the landing
    // collision settles them onto the ground (teleporting places the top of the
    // collider on the tile, which would otherwise leave a taller player embedded
    // in the floor).
    const teleportedPlayer = teleportPlayerToTilePosition(
      this.simulationState.players[0].player,
      targetTilePosition,
      this.levelSpec,
    );
    this.simulationState = this.withPrimaryPlayer({
      ...teleportedPlayer,
      movement: {
        ...teleportedPlayer.movement,
        vertical: VerticalMovementState.Falling,
      },
    });
    this.resetRun();
    configureMainCamera(
      this.cameras.main,
      this.levelSpec,
      this.playerRectangle,
    );
    this.applyCameraZoom();
    this.renderSimulationState();
  }

  // Seed a freshly-built state with the carried session totals (lives and the
  // coin base). A new state always starts at the engine's initialLivesCount with
  // no coins; overriding here lets both persist across the level advances and
  // retries that rebuild the state, as the original carries them through a play
  // session.
  private seedCarriedSessionTotals(state: SimulationState): SimulationState {
    // Resize the freshly-spawned player to match the carried tier (feet-anchored
    // grow), so a level entered as Super/Fire starts with the correct collider
    // rather than growing on the first step.
    return {
      ...state,
      players: [
        {
          ...state.players[0],
          player: resizePlayerForVitality(
            state.players[0].player,
            this.carriedPlayerVitality,
          ),
          vitality: this.carriedPlayerVitality,
        },
        ...state.players.slice(1),
      ],
      livesRemaining: this.carriedLivesRemaining,
      sessionCoinBase: this.carriedSessionCoinTotal,
    };
  }

  // Replace the primary player's kinematics, preserving its other runtime slices
  // and the co-op players.
  private withPrimaryPlayer(
    player: SimulationState["players"][0]["player"],
  ): SimulationState {
    return {
      ...this.simulationState,
      players: [
        { ...this.simulationState.players[0], player },
        ...this.simulationState.players.slice(1),
      ],
    };
  }

  // The tier to carry into the next level: an enlarged tier (Super/Fire) is
  // kept as-is; small and the transient post-hit recovering state both carry as
  // small, since the recovering state is tied to the level being left.
  private tierToCarryForward(): PlayerVitalityState {
    return isEnlargedPlayerVitalityKind(
      this.simulationState.players[0].vitality.kind,
    )
      ? this.simulationState.players[0].vitality
      : makeInitialPlayerVitalityState();
  }

  // The score earned in the current level, from the (per-level) SimulationState
  // plus the shell-tracked firework bonus.
  private currentLevelScore(): number {
    return (
      computeTotalScore(
        this.simulationState.collectibles,
        this.simulationState.enemies,
        this.simulationState.timeBonusScore,
        this.simulationState.breakableBlockScore,
        this.simulationState.bulletBillStompScore,
        this.simulationState.goalHeightScore,
        // Mushroom/flower/star pickups are worth 1000 each in the ROM (the
        // 1-up grants a life, not points).
        this.simulationState.powerUps.collectedPowerUpEntityIds.length +
          this.simulationState.players[0].invincibility
            .collectedInvincibilityEntityIds.length,
      ) + this.fireworksBonusScore
    );
  }

  // The whole-session score: the base banked from prior levels plus the current
  // level's score. This is what the HUD and the debug snapshot report.
  private sessionScore(): number {
    return this.carriedSessionScoreBase + this.currentLevelScore();
  }

  // Bank the current level's score into the session base. Called at each
  // transition that keeps the score (a level advance, a warp, or a retry that is
  // not a fresh game), before the state is rebuilt and the per-level score is
  // cleared — so the running total survives across levels, as in the original.
  private bankCurrentLevelScore(): void {
    this.carriedSessionScoreBase += this.currentLevelScore();
  }

  // Set the score/time/coins/world HUD line. Score and remaining-time are passed
  // in so the end-of-level time-bonus countdown can drive interpolated values;
  // the coin total and world label always come from the current state.
  private updateScoreHud(score: number, remainingFrames: number | undefined) {
    this.scoreText.setText(
      classicCompatibilityHudText(
        score,
        remainingFrames,
        // The whole-session coin total, wrapped 0–99 as the original's two-digit
        // display (each rollover past 100 having awarded a 1-Up).
        (this.simulationState.sessionCoinBase +
          this.simulationState.collectibles.collectedCoinEntityIds.length) %
          coinsPerExtraLife,
        this.activeWorldLevelLabel ??
          worldLevelLabelFor(this.browserGameBootstrap.userLevelVisualName),
      ),
    );
  }

  // At a flagpole/castle finish the remaining time is converted to score, 50 per
  // time unit, counting the clock down to zero while the score ticks up — with a
  // rapid blip per unit, as in the original. Driven each frame of the level-
  // advance delay by stepTimeBonusCountdown.
  private beginTimeBonusCountdown(): void {
    const remainingFrames = this.simulationState.levelTimer.remainingFrames;
    if (remainingFrames === undefined) {
      this.timeBonusCountdownUnitsRemaining = 0;
      return;
    }
    this.timeBonusCountdownUnitsRemaining = Math.floor(
      remainingFrames / timeBonusFramesPerDisplayUnit,
    );
    // Ensure the advance delay is long enough for the whole countdown to play.
    const countdownFrames = Math.ceil(
      this.timeBonusCountdownUnitsRemaining / timeBonusCountdownUnitsPerFrame,
    );
    this.levelAdvanceDelayFramesRemaining = Math.max(
      this.levelAdvanceDelayFramesRemaining,
      countdownFrames + timeBonusCountdownHoldFrames,
    );
  }

  private stepTimeBonusCountdown(): void {
    if (this.timeBonusCountdownUnitsRemaining <= 0) {
      return;
    }
    const before = this.timeBonusCountdownUnitsRemaining;
    this.timeBonusCountdownUnitsRemaining = Math.max(
      0,
      this.timeBonusCountdownUnitsRemaining - timeBonusCountdownUnitsPerFrame,
    );
    if (this.timeBonusCountdownUnitsRemaining < before) {
      this.gameAudio.playEvents([SoundEvent.TimeTick]);
    }
    // Show the clock draining and the (not-yet-counted) bonus subtracted from the
    // full session score, so the score ticks up to its final value as time hits 0.
    const pendingBonus =
      this.timeBonusCountdownUnitsRemaining * scorePerTimeBonusDisplayUnit;
    this.updateScoreHud(
      this.sessionScore() - pendingBonus,
      this.timeBonusCountdownUnitsRemaining * timeBonusFramesPerDisplayUnit,
    );
  }

  private resetSimulation(): void {
    this.pendingLevelWarp = undefined;
    this.cancelCameraShake();
    // A finished flag cutscene may have hidden the player inside the castle,
    // dropped the ball off the level and left the flag at the pole base; a
    // same-level retry does not rebuild the level objects, so restore them.
    this.resetFlagpoleFinishState();
    // A retry after running out of lives starts a fresh game: the full life
    // count restored and the session coin total and score cleared. A normal
    // retry keeps the carried (post-death) totals and banks the failed attempt's
    // score, as the original never resets the score on death. This must precede
    // the rebuilds below, which seed the new state from these values.
    if (this.pendingGameOver) {
      this.carriedLivesRemaining = initialLivesCount;
      this.carriedSessionCoinTotal = 0;
      this.carriedSessionScoreBase = 0;
      this.carriedPlayerVitality =
        this.browserGameBootstrap.initialPlayerVitality;
    } else {
      this.bankCurrentLevelScore();
    }
    // Dying costs the power tier — a retry after a death restarts small, as in
    // the original. A manual retry that is not a death (e.g. restarting after a
    // non-fatal hit) restarts with the tier the player entered the level with,
    // so the carried tier is left unchanged. A fresh game already restored the
    // bootstrap tier above.
    const retriedFromDeath =
      this.simulationState.players[0].outcome.kind ===
        PlayerOutcomeKind.Defeated ||
      this.simulationState.players[0].outcome.kind ===
        PlayerOutcomeKind.DefeatedAndFinished;
    const retriedFromTimeUp =
      this.simulationState.players[0].outcome.kind ===
        PlayerOutcomeKind.Defeated &&
      this.simulationState.players[0].outcome.reason ===
        PlayerDefeatReason.TimeUp;
    if (!this.pendingGameOver && retriedFromDeath) {
      this.carriedPlayerVitality = makeInitialPlayerVitalityState();
    }
    // The ROM shows the WORLD card (with the decremented life count) on every
    // respawn — and a TIME UP card first when the clock ran out.
    if (retriedFromDeath) {
      this.levelIntroFramesRemaining = retriedFromTimeUp
        ? worldCardFrames + timeUpCardFrames
        : worldCardFrames;
    }
    // Halfway checkpoint: a player defeated (not finished) past the level's
    // halfway column, in the main level itself, retries from the checkpoint
    // rather than the top — like the original's HalfwayPage respawn.
    const respawnAtHalfway =
      this.warpedLevelInput === undefined &&
      this.levelSpec.halfwayTileX !== undefined &&
      this.simulationState.players[0].outcome.kind ===
        PlayerOutcomeKind.Defeated &&
      this.simulationState.players[0].player.position.x >=
        this.levelSpec.halfwayTileX * this.levelSpec.tileSizePixels;
    // A retry after a pipe warp returns to the main-sequence level, so rebuild
    // it before resetting the simulation state.
    if (this.warpedLevelInput !== undefined) {
      this.warpedLevelInput = undefined;
      this.destroyLevelObjects();
      this.buildLevelObjects();
      configureMainCamera(
        this.cameras.main,
        this.levelSpec,
        this.playerRectangle,
      );
      this.applyCameraZoom();
    }
    this.simulationState = this.seedCarriedSessionTotals(
      makeRequiredInitialSimulationState(
        this.levelSpec,
        this.browserGameBootstrap,
      ),
    );
    if (respawnAtHalfway && this.levelSpec.halfwayTileX !== undefined) {
      // Drop in from the top of the checkpoint column; the landing collision
      // settles the player onto the ground there.
      this.simulationState = this.withPrimaryPlayer(
        teleportPlayerToTilePosition(
          this.simulationState.players[0].player,
          { x: this.levelSpec.halfwayTileX, y: 2 } as Parameters<
            typeof teleportPlayerToTilePosition
          >[1],
          this.levelSpec,
        ),
      );
    }
    this.lastSoundEvents = [];
    this.levelAdvanceDelayFramesRemaining = 0;
    this.levelCompleteSoundPlayed = false;
    this.deathArcStarted = false;
    this.deathArcActive = false;
    this.clearDeathEffect();
    // Leaving a death/game-over dismisses the flow card (the life count was
    // already reset above when a game-over was pending).
    this.hideFlowCard();
    this.pendingGameOver = false;
    this.cameras.main.startFollow(this.playerRectangle, true, 0.2, 0.12);
    this.resetRun();
    this.exitPause();
    this.renderSimulationState();
  }

  private resetRun(): void {
    this.runRecorder = new RunRecorder(
      this.simulationState,
      resolveMovementConstants(
        this.currentTheme,
        this.exaggeratedReactions,
        this.godMode,
      ),
      this.levelSpec,
    );
    this.runThumbnails = [];
    this.recordedCameraScrolls = [];
    // Clear any lingering score popups and re-baseline the tracking so a level
    // rebuild / respawn never fires a spurious burst.
    for (const popup of this.scorePopups) {
      popup.text.destroy();
    }
    this.scorePopups = [];
    // Re-baseline bot tracking too: a warp/rebuild respawns the bots elsewhere,
    // which must not read as every bot dying at once.
    this.resetCoopBotState();
    this.previousDefeatedEnemyIds = new Set();
    this.previousEnemyKillScore = 0;
    this.flattenedEnemyTimers.clear();
    this.entityIdSetCache.clear();
    this.lastEnemyContactObservation = undefined;
    for (const firework of this.fireworkSprites) {
      firework.star.destroy();
    }
    this.fireworkSprites = [];
    this.fireworksBurstsRemaining = 0;
    this.fireworksNextBurstFrames = 0;
    this.fireworksBurstIndex = 0;
    this.fireworksBonusScore = 0;
    // Re-arm the per-run event-music/flow latches so a retry (which does not
    // rebuild the level) still swaps star music, plays the death jingle, and
    // warns on low time. The intro card is set explicitly on a level advance,
    // so a plain retry clears it (no card).
    this.starMusicActive = false;
    this.deathJinglePlayed = false;
    this.timeWarningTriggered = false;
    this.timeBonusCountdownUnitsRemaining = 0;
    this.levelIntroFramesRemaining = 0;
  }

  private togglePause(): void {
    if (this.paused) {
      // A death-induced pause is only left by retrying, not by unpausing.
      if (!this.pausedByDeath) {
        this.resumePause();
      }
      return;
    }
    this.enterPause(false);
  }

  // Hide the on-screen touch controls (and drop any held button) while paused,
  // so they don't sit under the timeline overlay; restore them on resume.
  // (Suspend needs no handling: a background session's whole root is hidden by
  // the session manager, panels included.)
  private setTouchControlsVisible(visible: boolean): void {
    for (const panel of this.touchControlPanels) {
      panel.style.display = visible ? "flex" : "none";
    }
    if (!visible) {
      this.clearHeldTouchState();
    }
  }

  // Drop every held on-screen button. Needed whenever the panels vanish while
  // a finger is still down (pause hide, session suspend): the hidden button
  // never receives its pointerup, so the flag would stay latched.
  private clearHeldTouchState(): void {
    this.touchState.left = false;
    this.touchState.right = false;
    this.touchState.up = false;
    this.touchState.down = false;
    this.touchState.jump = false;
    this.touchState.run = false;
    this.touchState.fire = false;
  }

  // True when the god-mode player stands on a lava tile (the engine lands
  // him on the surface): the tile row at the feet line holds lava within the
  // collider's column span.
  private isPlayerStandingOnLava(): boolean {
    if (!this.godMode) {
      return false;
    }
    const player = this.simulationState.players[0].player;
    if (player.movement.vertical !== VerticalMovementState.Grounded) {
      return false;
    }
    const lavaTileIds = makeLavaTileIds(this.levelSpec);
    if (lavaTileIds.size === 0) {
      return false;
    }
    const tileSize = this.levelSpec.tileSizePixels;
    const feetRow = Math.floor(
      (player.position.y + player.collider.height) / tileSize,
    );
    const row = this.levelSpec.tiles[feetRow];
    if (row === undefined) {
      return false;
    }
    const firstColumn = Math.floor(player.position.x / tileSize);
    const lastColumn = Math.floor(
      (player.position.x + player.collider.width - 1) / tileSize,
    );
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const tileId = row[column];
      if (tileId !== undefined && lavaTileIds.has(tileId)) {
        return true;
      }
    }
    return false;
  }

  private enterPause(byDeath: boolean): void {
    this.paused = true;
    this.pausedByDeath = byDeath;
    this.gameAudio.setLavaSizzle(false);
    // A mid-flight quake shouldn't wobble the paused/replay view.
    this.cancelCameraShake();
    // The death animation has finished playing (the menu waits for it); tear its
    // pieces/overlays down and restore the player so the paused/replay view and
    // any scrubbing render the recorded frames cleanly, not the scattered body.
    if (byDeath && this.deathArcStarted) {
      this.clearDeathEffect();
      this.deathArcStarted = false;
      this.renderSimulationState();
    }
    this.keysHeldAtPause.clear();
    for (const code of this.keysDown) {
      this.keysHeldAtPause.add(code);
    }
    this.setTouchControlsVisible(false);
    this.pauseFrame = this.runRecorder.frameCount;
    // Contact deaths extend the timeline with scrubbable death-animation
    // frames; pit/time-up deaths (no authored animation) and finishes do not.
    const outcome = this.simulationState.players[0].outcome;
    this.deathReplayFrames =
      byDeath &&
      outcome.kind === PlayerOutcomeKind.Defeated &&
      (outcome.reason === PlayerDefeatReason.EnemyContact ||
        outcome.reason === PlayerDefeatReason.HazardContact ||
        outcome.reason === PlayerDefeatReason.HazardAndEnemyContact)
        ? deathTimelineFrameCount
        : 0;
    this.scrubFrame = this.pauseFrame;
    this.pauseFrameState = this.simulationState;
    // presentTimelineOverlay reserves bottom space and shrinks the canvas;
    // resizeToDisplay's paused branch re-anchors the view's bottom edge across
    // that shrink, so the opening paused view keeps the ground/action visible
    // even when the camera's follow was stopped (contact deaths stop it).
    this.presentTimelineOverlay();
    // A death cuts straight to an INSTANT REPLAY: the last few seconds play
    // back automatically and, for contact deaths, end on the full death
    // animation (explosion/burn/impale/float) as the finale — the death is
    // always seen without hunting for the Play button. Scrubbing or Retry
    // interrupts it like any other playback. Only actual defeats: a finish
    // pause must keep showing the live final tableau without seeking (a
    // teleport-assisted run does not re-simulate past the teleport).
    if (byDeath && outcome.kind === PlayerOutcomeKind.Defeated) {
      this.seekToFrame(
        Math.max(0, this.pauseFrame - deathInstantReplayLeadFrames),
      );
      this.setReplayPlaying(true);
    }
  }

  // The scrubbable timeline: the recorded run plus any appended death frames.
  private timelineEndFrame(): number {
    return this.pauseFrame + this.deathReplayFrames;
  }

  private presentTimelineOverlay(): void {
    this.ensureTimelineOverlay().show(
      this.timelineEndFrame(),
      this.scrubFrame,
      this.runThumbnails,
      nominalSixtyHertzFrameDurationMilliseconds,
      // Offer "Next level" only when the pause is a finish (not a death).
      this.hasFinishedOutcome(),
      // Title the strip GAME OVER (instead of PAUSED) when out of lives.
      this.pendingGameOver,
    );
  }

  private resumePause(): void {
    // A death-induced pause has no live run to resume — retry instead.
    if (this.pausedByDeath) {
      return;
    }
    // Restore the exact paused frame (in case the user scrubbed away) so live
    // play continues from where it was paused.
    if (this.pauseFrameState !== undefined) {
      this.simulationState = this.pauseFrameState;
      this.renderSimulationState();
    }
    // Scrubbing may have detached the camera; resume following the player.
    this.cameras.main.startFollow(this.playerRectangle, true, 0.2, 0.12);
    this.exitPause();
  }

  private exitPause(): void {
    this.paused = false;
    this.pausedByDeath = false;
    this.replayPlaying = false;
    this.deathReplayFrames = 0;
    this.pauseFrameState = undefined;
    this.setTouchControlsVisible(true);
    this.timelineOverlay?.hide();
  }

  // Play the recorded run back frame-by-frame while paused. Starting from the
  // end rewinds to the beginning first; reaching the end stops playback.
  private setReplayPlaying(playing: boolean): void {
    if (playing && this.scrubFrame >= this.timelineEndFrame()) {
      // Starting over from the top.
      this.seekToFrame(0);
    }
    this.replayPlaying = playing;
    this.timelineOverlay?.setPlaying(playing);
  }

  private advanceReplayPlayback(): void {
    if (this.scrubFrame >= this.timelineEndFrame()) {
      this.setReplayPlaying(false);
      return;
    }
    // Crossing from the last recorded frame into the death region replays the
    // death sound once (seek rebuilds are otherwise silent).
    const crossingIntoDeath =
      this.deathReplayFrames > 0 && this.scrubFrame === this.pauseFrame;
    this.seekToFrame(this.scrubFrame + 1);
    if (crossingIntoDeath && this.deathArcStarted) {
      this.gameAudio.playDeathSound(
        this.deathSoundForStyle(this.deathEffectStyle),
      );
    }
  }

  // Hold left/right to scrub the timeline while paused; Shift scrubs faster.
  private handleScrubInput(): void {
    const step = this.anyDown(runKeyCodes) ? 6 : 1;

    if (
      this.anyFreshlyDown(leftKeyCodes) &&
      !this.anyFreshlyDown(rightKeyCodes)
    ) {
      this.seekToFrame(this.scrubFrame - step);
    } else if (
      this.anyFreshlyDown(rightKeyCodes) &&
      !this.anyFreshlyDown(leftKeyCodes)
    ) {
      this.seekToFrame(this.scrubFrame + step);
    }
  }

  // Down, and pressed after the pause opened (not carried over from gameplay).
  private anyFreshlyDown(codes: readonly string[]): boolean {
    return codes.some(
      (code) => this.keysDown.has(code) && !this.keysHeldAtPause.has(code),
    );
  }

  private seekToFrame(frame: number): void {
    if (!this.paused) {
      return;
    }
    this.scrubFrame = Math.max(
      0,
      Math.min(Math.round(frame), this.timelineEndFrame()),
    );
    // Frames past the recorded run are death-animation frames: the sim holds
    // the final recorded state while the effect is rebuilt at the offset.
    const simFrame = Math.min(this.scrubFrame, this.pauseFrame);
    this.simulationState = this.runRecorder.stateAt(simFrame);
    // Scrubbing shows the recorded run, where the player is always on screen —
    // even when the live tableau ended with the sprite hidden in the castle
    // doorway after the flagpole walk-off.
    this.playerImageObject?.setVisible(true);
    this.renderSimulationState();
    // Show the camera where it sat at that frame, rather than letting it chase
    // the scrubbed player. The recorded view is re-anchored by its world-space
    // BOTTOM edge: the paused viewport is shorter (replay bar below), so a raw
    // scroll restore would keep the sky and crop away the ground where the
    // action — including the death animation — plays.
    const scroll = this.recordedCameraScrolls[simFrame];
    if (scroll !== undefined) {
      this.cameras.main.stopFollow();
      this.setCameraWorldBottom(scroll.x, scroll.worldBottom);
    }
    this.presentDeathEffectAtFrame(this.scrubFrame - this.pauseFrame);
    this.timelineOverlay?.setCurrentFrame(this.scrubFrame);
  }

  // Deterministically rebuild the death animation as it looks `effectFrame`
  // frames after the death (the effects use no randomness, so re-running the
  // begin+step sequence reproduces the exact pieces). Frame 0 or below — or a
  // run without a death animation — renders clean recorded frames.
  private presentDeathEffectAtFrame(effectFrame: number): void {
    this.clearDeathEffect();
    this.deathArcStarted = false;
    if (effectFrame <= 0 || this.deathReplayFrames === 0) {
      return;
    }
    this.deathEffectFrame = 0;
    this.suppressDeathSounds = true;
    try {
      this.maybeBeginDeathEffect();
    } finally {
      this.suppressDeathSounds = false;
    }
    // Re-read through an accessor: control flow narrowed the field to the
    // `false` written above, but maybeBeginDeathEffect may have set it.
    if (!this.isDeathArcStarted()) {
      return;
    }
    for (let step = 0; step < effectFrame; step += 1) {
      this.stepDeathEffect();
    }
  }

  private isDeathArcStarted(): boolean {
    return this.deathArcStarted;
  }

  // The visible world-space bottom edge of the main camera. Phaser zooms
  // around the view centre, so the visible half-height is (height/zoom)/2
  // below the centre at scrollY + height/2.
  private cameraWorldBottom(): number {
    const camera = this.cameras.main;
    return (
      camera.scrollY +
      this.scale.height / 2 +
      this.scale.height / (2 * camera.zoom)
    );
  }

  // Position the camera so its visible bottom edge sits at the given world y
  // (the inverse of cameraWorldBottom); Phaser clamps to the level bounds on
  // the next prerender. With an unchanged viewport this reproduces the
  // original scroll exactly.
  private setCameraWorldBottom(scrollX: number, worldBottom: number): void {
    const camera = this.cameras.main;
    const scrollY =
      worldBottom -
      this.scale.height / (2 * camera.zoom) -
      this.scale.height / 2;
    camera.setScroll(scrollX, scrollY);
  }

  // Any death opens the replay menu (timeline): a contact death after its
  // pop-and-fall arc finishes, and any other death (falling into a pit, running
  // out of time) immediately, since those have no arc.
  private maybeEnterReplayMenu(): void {
    if (
      this.paused ||
      this.simulationState.players[0].outcome.kind !==
        PlayerOutcomeKind.Defeated ||
      this.deathEffectAnimating()
    ) {
      return;
    }
    this.enterPause(true);
  }

  // Is the shabby death animation still playing? The replay/retry menu waits for
  // it so the death is seen before the menu freezes the frame.
  private deathEffectAnimating(): boolean {
    if (!this.deathArcStarted) {
      return false;
    }
    // Hold every death on screen for a couple of seconds minimum so the full
    // animation is seen; individual styles can hold longer than this floor.
    if (this.deathEffectFrame < deathMinimumHoldFrames) {
      return true;
    }
    switch (this.deathEffectStyle) {
      case "launch":
        return this.deathArcActive;
      case "explode":
        return this.deathEffectFrame < deathExplodeMenuHoldFrames;
      case "burn":
        return this.deathEffectFrame < deathBurnDurationFrames;
      case "float":
        // Keep animating until the body has floated up to the surface and held
        // there a beat — but never longer than the safety cap.
        if (this.deathEffectFrame >= deathFloatMaxHoldFrames) {
          return false;
        }
        if (this.deathFloatSurfaceFrame < 0) {
          return true;
        }
        return (
          this.deathEffectFrame - this.deathFloatSurfaceFrame <
          deathFloatSurfaceHoldFrames
        );
      case "impale":
        return this.deathEffectFrame < deathImpaleMenuHoldFrames;
    }
  }

  private maybeCaptureThumbnail(): void {
    const frame = this.runRecorder.frameCount;

    if (frame % runThumbnailIntervalFrames !== 0) {
      return;
    }

    const imageDataUrl = this.captureThumbnailDataUrl();

    if (imageDataUrl !== undefined) {
      this.runThumbnails.push({ frame, imageDataUrl });
    }
  }

  private captureThumbnailDataUrl(): string | undefined {
    if (this.thumbnailCanvas === undefined) {
      this.thumbnailCanvas = document.createElement("canvas");
      this.thumbnailCanvas.width = runThumbnailWidthPixels;
      this.thumbnailCanvas.height = runThumbnailHeightPixels;
    }

    const context = this.thumbnailCanvas.getContext("2d");

    if (context === null) {
      return undefined;
    }

    context.drawImage(
      this.game.canvas,
      0,
      0,
      runThumbnailWidthPixels,
      runThumbnailHeightPixels,
    );
    return this.thumbnailCanvas.toDataURL("image/png");
  }

  private exportRun(withScreenshots: boolean): void {
    const runExport = buildRunExport(
      this.runRecorder,
      this.browserGameBootstrap,
    );

    if (withScreenshots) {
      downloadBytes(
        "mario-run.zip",
        buildRunZip(runExport, this.runThumbnails),
        "application/zip",
      );
      return;
    }

    downloadBytes(
      "mario-run.json",
      serializeRunExport(runExport),
      "application/json",
    );
  }

  private ensureTimelineOverlay(): RunTimelineOverlay {
    if (this.timelineOverlay === undefined) {
      const parent = this.game.canvas.parentElement ?? document.body;
      this.timelineOverlay = new RunTimelineOverlay(parent, {
        onSeek: (frame) => {
          this.setReplayPlaying(false);
          this.seekToFrame(frame);
        },
        onTogglePlay: () => {
          this.setReplayPlaying(!this.replayPlaying);
        },
        onResume: () => {
          this.resumePause();
        },
        onRetry: () => {
          this.resetSimulation();
        },
        onExportLog: () => {
          this.exportRun(false);
        },
        onExportZip: () => {
          this.exportRun(true);
        },
        onReserveSpace: (pixels) => {
          this.setReservedBottomSpace(pixels);
        },
        ...(this.browserGameBootstrap.onAdvanceToNextLevel !== undefined
          ? {
              onContinue: () => {
                this.browserGameBootstrap.onAdvanceToNextLevel?.(
                  this.currentMainLevelName,
                );
              },
            }
          : {}),
        ...(this.browserGameBootstrap.onExitToMenu !== undefined
          ? {
              onExitToMenu: this.browserGameBootstrap.onExitToMenu,
              exitLabel: `☰ ${this.browserGameBootstrap.exitLabel ?? "Menu"}`,
            }
          : {}),
      });
      this.registerSceneTeardown(() => {
        this.timelineOverlay?.destroy();
        this.timelineOverlay = undefined;
      });
    }

    return this.timelineOverlay;
  }

  private makeCurrentInputCommand(): SimulationInputCommand {
    const replayInput = this.resolveReplayInput();

    if (replayInput !== undefined) {
      return replayInput;
    }

    const horizontal = makeHorizontalInput(
      this.anyDown(leftKeyCodes) || this.touchState.left,
      this.anyDown(rightKeyCodes) || this.touchState.right,
    );
    const result = makeSimulationInputCommand(
      horizontal,
      this.anyDown(jumpKeyCodes) || this.touchState.jump,
      this.anyDown(runKeyCodes) || this.touchState.run,
      this.anyDown(fireKeyCodes) || this.touchState.fire,
      this.anyDown(upKeyCodes) || this.touchState.up,
      this.anyDown(downKeyCodes) || this.touchState.down,
    );

    if (!result.ok) {
      throw new Error("Browser simulation input command is invalid.");
    }

    return result.value;
  }

  // When a run is being replayed headlessly, play back its recorded input for
  // the current frame; once the log is exhausted, fall back to live/neutral.
  private resolveReplayInput(): SimulationInputCommand | undefined {
    const replayInputs = window.__marioReplayInputs;

    if (replayInputs === undefined) {
      return undefined;
    }

    const rawInput = replayInputs[this.runRecorder.frameCount];

    if (rawInput === undefined) {
      return undefined;
    }

    const result = makeSimulationInputCommand(
      rawInput.horizontal,
      rawInput.jumpPressed,
      rawInput.runHeld,
      rawInput.firePressed,
      rawInput.upHeld,
      rawInput.downHeld,
    );

    return result.ok ? result.value : undefined;
  }

  private shouldRetrySimulation(): boolean {
    if (this.levelAdvanceDelayFramesRemaining > 0) {
      return false;
    }

    // shouldRetrySimulation runs exactly once per frame, so edge-detect the
    // retry press here against the previous frame's held state.
    const retryDown = this.anyDown(retryKeyCodes);
    const retryPressedThisFrame = retryDown && !this.retryWasDown;
    this.retryWasDown = retryDown;

    switch (this.simulationState.players[0].outcome.kind) {
      case PlayerOutcomeKind.Active:
        return (
          this.simulationState.players[0].vitality.kind ===
            PlayerVitalityKind.Recovering &&
          (retryDown || this.retryKeyHeld)
        );
      case PlayerOutcomeKind.Defeated:
      case PlayerOutcomeKind.Finished:
      case PlayerOutcomeKind.DefeatedAndFinished:
        return retryPressedThisFrame;
      default: {
        const invalidOutcome: never = this.simulationState.players[0].outcome;
        throw new Error(
          `Invalid player outcome state: ${String(invalidOutcome)}`,
        );
      }
    }
  }

  // Classic SMB feel: a small score number rises and fades over each enemy
  // defeated this frame, showing the points gained (attributed to the new
  // kills). Coins/blocks/time don't get one, as in the original.
  // Decide whether a (possibly defeated) enemy sprite should render this frame.
  // A live enemy always renders (and any leftover squash from a prior life is
  // cleared). A defeated Goomba stays squashed on the ground for a short window
  // before it is hidden; every other defeated enemy vanishes at once.
  private resolveEnemyDefeatVisibility(
    actor: RuntimeRenderedActor,
    defeated: boolean,
  ): boolean {
    if (!isRenderedEnemyRole(actor.role)) {
      return true;
    }
    if (!defeated) {
      // Reset any squash a retried enemy inherited from its previous death.
      actor.renderObject.setScale(1);
      return true;
    }
    if (actor.role !== ActorRole.Enemy) {
      return false;
    }

    const remaining =
      this.flattenedEnemyTimers.get(actor.entityId) ??
      stompedGoombaFlattenFrames;
    if (remaining <= 0) {
      this.flattenedEnemyTimers.set(actor.entityId, 0);
      return false;
    }
    this.flattenedEnemyTimers.set(actor.entityId, remaining - 1);
    // Squash the sprite flat and drop it so it sits on the ground.
    actor.renderObject.setScale(1, stompedGoombaSquashScaleY);
    actor.renderObject.setY(
      actor.renderObject.y +
        this.levelSpec.tileSizePixels * (1 - stompedGoombaSquashScaleY),
    );
    return true;
  }

  private stepScorePopups(defeatedEnemyIds: ReadonlySet<string>): void {
    this.scorePopups = this.scorePopups.filter((popup) => {
      popup.framesRemaining -= 1;
      if (popup.framesRemaining <= 0) {
        popup.text.destroy();
        return false;
      }
      popup.text.setY(popup.text.y - 0.6);
      popup.text.setAlpha(
        Math.max(0, popup.framesRemaining / scorePopupFrames),
      );
      return true;
    });

    const enemyKillScore =
      computeEnemyScore(this.simulationState.enemies) +
      this.simulationState.bulletBillStompScore;
    const gained = enemyKillScore - this.previousEnemyKillScore;
    const newlyDefeated = [...defeatedEnemyIds].filter(
      (entityId) => !this.previousDefeatedEnemyIds.has(entityId),
    );
    if (gained > 0 && newlyDefeated.length > 0) {
      const perKill = Math.round(gained / newlyDefeated.length);
      for (const entityId of newlyDefeated) {
        const actor = this.renderedActors.find(
          (candidate) => candidate.entityId === entityId,
        );
        if (actor === undefined) {
          continue;
        }
        const position = makeRuntimeRenderedActorPixelPosition(
          actor,
          this.simulationState,
        );
        const text = this.add
          .text(position.x + 8, position.y, String(perKill), {
            fontFamily: "monospace",
            fontSize: "8px",
            color: "#ffffff",
          })
          .setOrigin(0.5, 1)
          .setDepth(130);
        this.scorePopups.push({ text, framesRemaining: scorePopupFrames });
      }
    }

    this.previousEnemyKillScore = enemyKillScore;
    this.previousDefeatedEnemyIds = new Set(defeatedEnemyIds);
  }

  // Return a cached string Set of the given entity-id array, rebuilding only
  // when its length changes. Safe because these arrays only ever grow (you
  // cannot un-collect a coin or un-defeat an enemy) or reset to empty on a
  // rebuild — so a length match guarantees identical contents.
  private cachedEntityIdSet(
    key: string,
    ids: readonly string[],
  ): ReadonlySet<string> {
    const cached = this.entityIdSetCache.get(key);
    if (cached !== undefined && cached.length === ids.length) {
      return cached.set;
    }
    const set = new Set(ids);
    this.entityIdSetCache.set(key, { length: ids.length, set });
    return set;
  }

  private renderSimulationState(): void {
    const currentVertical =
      this.simulationState.players[0].player.movement.vertical;
    const currentWorldY = this.simulationState.players[0].player.position.y;
    const isGrounded = currentVertical === VerticalMovementState.Grounded;

    if (
      this.previousPlayerVertical !== VerticalMovementState.Grounded &&
      isGrounded
    ) {
      this.spawnLandingDustParticles();
      // Falling more than a couple of blocks (ground-to-ground, so an ordinary
      // jump back to the same level never counts) lands hard enough to shake the
      // whole screen — a little earthquake, scaled to how far the player fell.
      if (
        this.lastGroundedWorldY !== null &&
        this.simulationState.players[0].outcome.kind ===
          PlayerOutcomeKind.Active
      ) {
        const dropTiles =
          (currentWorldY - this.lastGroundedWorldY) /
          this.levelSpec.tileSizePixels;
        if (dropTiles > hardLandingDropTiles) {
          this.triggerGroundQuake(dropTiles);
        }
      }
    }
    if (isGrounded) {
      this.lastGroundedWorldY = currentWorldY;
    }
    this.previousPlayerVertical = currentVertical;

    this.playerRectangle.setPosition(
      this.simulationState.players[0].player.position.x,
      this.simulationState.players[0].player.position.y,
    );
    this.playerRectangle
      .setSize(
        this.simulationState.players[0].player.collider.width,
        this.simulationState.players[0].player.collider.height,
      )
      .setDisplaySize(
        this.simulationState.players[0].player.collider.width,
        this.simulationState.players[0].player.collider.height,
      );
    this.emitSwimBubbles();

    // God mode on lava: the player stands ON the surface (the engine makes it
    // landable), shown as the on-fire pose over a looping steak sizzle.
    const burningOnLava = this.isPlayerStandingOnLava();
    this.gameAudio.setLavaSizzle(burningOnLava);

    if (this.playerImageObject !== undefined) {
      const playerImage = resolvePlayerSpriteImage(
        this.userAssetBundle?.playerImage,
        this.simulationState,
        this.currentTheme,
        this.playerCharacter,
        burningOnLava,
      );

      if (playerImage !== undefined) {
        setUserFrameImage(this, this.playerImageObject, playerImage);
      }

      // Track travel direction and, in the water world, mirror the right-facing
      // merman so he faces the way he swims (land poses stay unflipped).
      const velocityX = this.simulationState.players[0].player.velocity.x;
      if (velocityX > 4) {
        this.facingRight = true;
      } else if (velocityX < -4) {
        this.facingRight = false;
      }
      const swimming = this.currentTheme === "water";
      // The burning art's flames lean behind a rightward runner; flip it so
      // the trail always blows against the direction of movement.
      this.playerImageObject.setFlipX(
        (swimming || burningOnLava) && !this.facingRight,
      );

      // The merman is a horizontal fish, so give the swim sprite a squarer,
      // wider display box (centred on the collider) instead of the tall player
      // box that would squash it thin.
      const collider = this.simulationState.players[0].player.collider;
      const displayWidth = swimming ? collider.height : collider.width;
      const displayOffsetX = (collider.width - displayWidth) / 2;
      this.playerImageObject
        .setPosition(
          this.simulationState.players[0].player.position.x + displayOffsetX,
          this.simulationState.players[0].player.position.y,
        )
        .setDisplaySize(displayWidth, collider.height);
    }

    const isRecoveringVitality =
      this.simulationState.players[0].vitality.kind ===
      PlayerVitalityKind.Recovering;
    const isStarInvincible =
      this.simulationState.players[0].invincibility.remainingFrames > 0;
    // The star's final second telegraphs the end: the flash slows from the
    // 3-frame flicker to a lazy 8-frame blink.
    const starEnding =
      isStarInvincible &&
      this.simulationState.players[0].invincibility.remainingFrames < 90;
    const blinkPeriod = starEnding ? 8 : 3;
    const playerAlpha =
      (isRecoveringVitality || isStarInvincible) &&
      Math.floor(this.simulationState.clock.frameIndex / blinkPeriod) % 2 === 1
        ? 0
        : 1;
    // The invincibility/recovery flash blinks the player sprite.
    if (this.playerImageObject !== undefined) {
      this.playerImageObject.setAlpha(playerAlpha);
    }

    this.renderCoopPlayers();

    const feedbackText = makeOutcomeFeedbackText(
      this.simulationState.players[0].outcome,
    );
    // The castle-clear cinematic owns the screen: no "Gate reached — press…"
    // prompt bleeding through the chop/fall/walk-in staging.
    this.outcomeFeedbackText
      .setText(feedbackText)
      .setVisible(
        feedbackText !== activeOutcomeFeedbackText &&
          this.castleClearFramesRemaining <= 0,
      );

    const headBonking =
      this.exaggeratedReactions &&
      this.simulationState.players[0].reaction.kind ===
        PlayerReactionKind.HeadBonk;
    const headBonkX = this.playerRectangle.x;
    const headBonkY =
      this.playerRectangle.y - this.playerRectangle.height / 2 - 2;
    // The "OUCH!" shout jitters above the player's head for a painful jolt.
    const bonkShake = headBonking
      ? (this.simulationState.clock.frameIndex % 2 === 0 ? 1 : -1) * 1.5
      : 0;
    this.reactionText
      .setText("OUCH!")
      .setPosition(headBonkX + bonkShake, headBonkY)
      .setVisible(headBonking);
    if (this.playerReactionImage !== undefined) {
      // The authored wincing bonk sprite is pinned to the player and given a
      // small downward recoil so the hit reads as a jarring, painful jolt.
      this.playerReactionImage
        .setPosition(
          this.playerRectangle.x + bonkShake,
          this.playerRectangle.y + 1,
        )
        .setVisible(headBonking);
    }
    this.renderPlayerBloodiness();

    const stompReaction = this.simulationState.enemyStompReaction;
    const stompActive = this.exaggeratedReactions && stompReaction.active;
    if (this.enemyStompReactionImage !== undefined) {
      this.enemyStompReactionImage
        .setPosition(stompReaction.x + 8, stompReaction.y + 8)
        .setVisible(stompActive);
      this.stompReactionBurst.setVisible(false);
    } else {
      this.stompReactionBurst
        .setPosition(stompReaction.x + 8, stompReaction.y + 4)
        .setVisible(stompActive);
    }
    this.updateScoreHud(
      this.sessionScore(),
      this.simulationState.levelTimer.remainingFrames,
    );
    const collectedItemEntityIdStrings = this.cachedEntityIdSet(
      "item",
      this.simulationState.collectibles.collectedItemEntityIds,
    );
    const collectedCoinEntityIdStrings = this.cachedEntityIdSet(
      "coin",
      this.simulationState.collectibles.collectedCoinEntityIds,
    );
    const collectedPowerUpEntityIdStrings = this.cachedEntityIdSet(
      "power-up",
      this.simulationState.powerUps.collectedPowerUpEntityIds,
    );
    const collectedExtraLifeEntityIdStrings = this.cachedEntityIdSet(
      "extra-life",
      this.simulationState.collectibles.collectedExtraLifeEntityIds,
    );
    const collectedInvincibilityEntityIdStrings = this.cachedEntityIdSet(
      "invincibility",
      this.simulationState.players[0].invincibility
        .collectedInvincibilityEntityIds,
    );
    const defeatedEnemyEntityIdStrings = this.cachedEntityIdSet(
      "defeated",
      this.simulationState.enemies.defeatedEnemyEntityIds,
    );

    for (const actor of this.renderedActors) {
      // An enemy knocked out by a flying body part is owned by stepKnockedEnemies
      // (its ragdoll fall), so skip the normal live-position render for it.
      if (this.deathKnockedEnemies.has(actor.entityId)) {
        continue;
      }
      const renderedPosition = makeRuntimeRenderedActorPixelPosition(
        actor,
        this.simulationState,
      );
      let actorImage = resolveActorSpriteImage(actor, this.simulationState);
      // Revenge mode: re-skin every walking enemy as a half-height Mario/Luigi
      // "hero" the player (a Goomba) stomps.
      if (this.revengeMode && isEnemyRole(actor.role)) {
        actorImage =
          this.revengeEnemySprite(actor.entityId, actor.role) ?? actorImage;
      }

      if (actorImage !== undefined && actor.userImageObject !== undefined) {
        setUserFrameImage(this, actor.userImageObject, actorImage);
      }

      // A koopa shell wobbles side to side just before it wakes (faithful tell).
      const shakeOffsetX =
        actor.role === ActorRole.ArmoredEnemy
          ? shellReviveShakeOffsetPixels(
              requireArmoredEnemyActorState(
                this.simulationState.enemyMotion,
                actor.entityId,
              ),
            )
          : 0;

      if (actor.wingObject !== undefined) {
        actor.wingObject.setVisible(
          requireArmoredEnemyActorState(
            this.simulationState.enemyMotion,
            actor.entityId,
          ).behavior === ArmoredEnemyBehavior.Winged,
        );
      }

      actor.renderObject.setPosition(
        renderedPosition.x + shakeOffsetX,
        renderedPosition.y,
      );
      const collectibleUncollected =
        (actor.role !== ActorRole.Coin ||
          !collectedCoinEntityIdStrings.has(actor.entityId)) &&
        (actor.role !== ActorRole.Item ||
          !collectedItemEntityIdStrings.has(actor.entityId)) &&
        (actor.role !== ActorRole.PowerUp ||
          !collectedPowerUpEntityIdStrings.has(actor.entityId)) &&
        (actor.role !== ActorRole.ExtraLife ||
          !collectedExtraLifeEntityIdStrings.has(actor.entityId)) &&
        (actor.role !== ActorRole.InvincibilityPowerUp ||
          !collectedInvincibilityEntityIdStrings.has(actor.entityId));
      const enemyVisible = this.resolveEnemyDefeatVisibility(
        actor,
        defeatedEnemyEntityIdStrings.has(actor.entityId),
      );
      actor.renderObject.setVisible(collectibleUncollected && enemyVisible);
    }

    this.stepScorePopups(defeatedEnemyEntityIdStrings);

    this.renderSpawnedActors(
      collectedCoinEntityIdStrings,
      collectedItemEntityIdStrings,
      collectedPowerUpEntityIdStrings,
      collectedExtraLifeEntityIdStrings,
      collectedInvincibilityEntityIdStrings,
    );
    this.renderBreakableTiles();
    this.renderUsedInteractiveBlocks();
    this.renderRevealedHiddenBlocks();
    this.renderProjectiles();
    this.renderTimedHazardProjectiles();
    this.renderFrenzyCheeps();
    this.renderFlameHazards();
    this.renderPlatforms();
    this.renderAerialFrenzyEntities();
    this.renderHatchedSpinies();
    this.renderPipes();
  }

  // Rotating firebar orbs and leaping podoboos are pure functions of the
  // frame; a pool of circles is repositioned (and hidden when a podoboo dips
  // below the pit) each frame.
  private renderFlameHazards(): void {
    if (
      this.levelSpec.firebars.length === 0 &&
      this.levelSpec.podoboos.length === 0
    ) {
      return;
    }
    const frameIndex = this.simulationState.clock.frameIndex;
    // Firebar orbs come first with a fixed per-level count, so every pool
    // index keeps one hazard kind (and one texture) for the whole session.
    const used = this.renderFlameHazardPoints(
      computeFirebarOrbs(this.levelSpec, frameIndex),
      "mechanism-flame-orb",
      0,
    );
    const total = this.renderFlameHazardPoints(
      computePodobooPositions(this.levelSpec, frameIndex),
      "mechanism-podoboo",
      used,
    );
    for (
      let index = total;
      index < this.flameHazardRenderObjects.length;
      index += 1
    ) {
      this.flameHazardRenderObjects[index]?.setVisible(false);
    }
  }

  // Draw one family of flame hazard points into the shared pool starting at
  // the given index, as skin art when the sprite set provides it (falling
  // back to the glowing circle). Returns the next free pool index.
  private renderFlameHazardPoints(
    points: readonly { x: number; y: number; sizePixels: number }[],
    imageKey: string,
    startIndex: number,
  ): number {
    const image = this.userAssetBundle?.actorImages.get(imageKey);
    for (const [offset, point] of points.entries()) {
      const index = startIndex + offset;
      let orb = this.flameHazardRenderObjects[index];
      if (orb === undefined) {
        orb =
          image !== undefined
            ? addUserFrameImage(this, 0, 0, image)
            : this.add
                .circle(0, 0, point.sizePixels / 2, flameHazardCoreColor)
                .setStrokeStyle(1, flameHazardRimColor);
        this.flameHazardRenderObjects[index] = orb;
      }
      if (orb instanceof Phaser.GameObjects.Arc) {
        orb.setRadius(point.sizePixels / 2);
        orb.setPosition(
          point.x + point.sizePixels / 2,
          point.y + point.sizePixels / 2,
        );
      } else {
        orb.setDisplaySize(point.sizePixels, point.sizePixels);
        orb.setPosition(point.x, point.y);
      }
      orb.setVisible(true);
    }
    return startIndex + points.length;
  }

  // Moving lift platforms: one pooled raft (skin art, or a plain rectangle),
  // repositioned every frame from the platform state.
  // ROM BowserIdentities: a fireball-killed keeper in worlds 1-7 is revealed
  // as that world's disguise enemy, tumbling off the bridge.
  private spawnBowserIdentityReveal(): void {
    const defeated = this.simulationState.enemies.defeatedEnemyEntityIds;
    for (const entityId of defeated) {
      if (
        !entityId.startsWith("vglc-smb-bowser-") ||
        entityId.startsWith("vglc-smb-bowser-hammers") ||
        this.revealedBowserEntityIds.has(entityId)
      ) {
        continue;
      }
      this.revealedBowserEntityIds.add(entityId);
      const world = Number(
        /^smb-(\d+)-/.exec(this.currentMainLevelName ?? "")?.[1] ?? "8",
      );
      const disguiseActorId = bowserDisguiseActorIdByWorld[world - 1];
      if (disguiseActorId === undefined) {
        continue; // World 8: the keeper is the real thing.
      }
      const disguiseImage =
        this.userAssetBundle?.actorImages.get(disguiseActorId);
      if (disguiseImage === undefined) {
        continue;
      }
      const actor = this.renderedActors.find(
        (rendered) => rendered.entityId === entityId,
      );
      if (actor === undefined) {
        continue;
      }
      const image = addUserFrameImage(
        this,
        actor.renderObject.x,
        actor.renderObject.y,
        disguiseImage,
      ).setDepth(40);
      this.identityReveals.push({ image, velocityY: -120, framesLeft: 90 });
    }
  }

  private stepIdentityReveal(): void {
    if (this.identityReveals.length === 0) {
      return;
    }
    const dt = 1 / 60;
    this.identityReveals = this.identityReveals.filter((entry) => {
      entry.framesLeft -= 1;
      if (entry.framesLeft <= 0) {
        entry.image.destroy();
        return false;
      }
      entry.velocityY += 540 * dt;
      entry.image.setPosition(
        entry.image.x + 30 * dt,
        entry.image.y + entry.velocityY * dt,
      );
      entry.image.setRotation(entry.image.rotation + 0.12);
      return true;
    });
  }

  // The ROM shatters a broken brick into four tumbling fragments. Diff the
  // cumulative broken list and burst each fresh one.
  private spawnFreshBrickShards(): void {
    const broken =
      this.simulationState.breakableBlocks.brokenBlockTilePositions;
    for (
      let index = this.previousBrokenBrickCount;
      index < broken.length;
      index += 1
    ) {
      const position = broken[index];
      if (position === undefined) {
        continue;
      }
      const size = this.levelSpec.tileSizePixels;
      const centerX = position.x * size + size / 2;
      const centerY = position.y * size + size / 2;
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const shard = this.add
          .rectangle(centerX + dx * 3, centerY + dy * 3, 5, 5, brickShardColor)
          .setDepth(30);
        this.brickShards.push({
          shard,
          velocityX: dx * 55,
          velocityY: -170 + dy * 45,
          framesLeft: 55,
        });
      }
    }
    this.previousBrokenBrickCount = broken.length;
  }

  private stepBrickShards(): void {
    if (this.brickShards.length === 0) {
      return;
    }
    const dt = 1 / 60;
    this.brickShards = this.brickShards.filter((entry) => {
      entry.framesLeft -= 1;
      if (entry.framesLeft <= 0) {
        entry.shard.destroy();
        return false;
      }
      entry.velocityY += 540 * dt;
      entry.shard.setPosition(
        entry.shard.x + entry.velocityX * dt,
        entry.shard.y + entry.velocityY * dt,
      );
      entry.shard.setRotation(entry.shard.rotation + 0.25);
      return true;
    });
  }

  // The primary player's centre column and a row derived from a vertical
  // offset off the collider top (shared by the block-reaction effects).
  private playerTileAt(offsetY: number): { column: number; row: number } {
    const player = this.simulationState.players[0].player;
    const size = this.levelSpec.tileSizePixels;
    return {
      column: Math.floor(
        (player.position.x + player.collider.width / 2) / size,
      ),
      row: Math.floor((player.position.y + offsetY) / size),
    };
  }

  // The ROM's springboard compresses through the launch: flash a squashed
  // coil overlay on the spring tile under the player for a few frames.
  private spawnSpringSquash(): void {
    if (!this.lastSoundEvents.includes(SoundEvent.SpringBounce)) {
      return;
    }
    const size = this.levelSpec.tileSizePixels;
    const { column, row } = this.playerTileAt(
      this.simulationState.players[0].player.collider.height + 2,
    );
    const overlay = this.add
      .rectangle(
        column * size + 2,
        row * size + size / 2,
        size - 4,
        size / 2,
        springSquashColor,
      )
      .setOrigin(0)
      .setDepth(20);
    this.springSquashes.push({ overlay, framesLeft: 8 });
  }

  private stepSpringSquashes(): void {
    if (this.springSquashes.length === 0) {
      return;
    }
    this.springSquashes = this.springSquashes.filter((entry) => {
      entry.framesLeft -= 1;
      if (entry.framesLeft <= 0) {
        entry.overlay.destroy();
        return false;
      }
      entry.overlay.setAlpha(entry.framesLeft / 8);
      return true;
    });
  }

  // A head-bonked block hops ~6px, like the ROM's block bounce: nudge the
  // render objects of the tile directly above the player's head.
  private spawnHeadBonkNudge(): void {
    if (!this.lastSoundEvents.includes(SoundEvent.HeadBonk)) {
      return;
    }
    const { column, row } = this.playerTileAt(-1);
    const key = makeTileRenderKey(column, row);
    const objects: Phaser.GameObjects.GameObject[] = [];
    const swap = this.usedBlockSwaps.get(key);
    if (swap !== undefined) {
      objects.push(swap.image);
    }
    for (const renderObject of this.breakableTileRenderObjects.get(key) ?? []) {
      objects.push(renderObject);
    }
    if (objects.length === 0) {
      return;
    }
    this.blockNudges.push({
      objects,
      baseYs: objects.map((object) => (object as Phaser.GameObjects.Image).y),
      framesLeft: blockNudgeFrames,
    });
  }

  private stepBlockNudges(): void {
    if (this.blockNudges.length === 0) {
      return;
    }
    this.blockNudges = this.blockNudges.filter((nudge) => {
      nudge.framesLeft -= 1;
      const progress = 1 - nudge.framesLeft / blockNudgeFrames;
      const lift = nudge.framesLeft <= 0 ? 0 : Math.sin(progress * Math.PI) * 6;
      nudge.objects.forEach((object, index) => {
        (object as Phaser.GameObjects.Image).setY(
          (nudge.baseYs[index] ?? 0) - lift,
        );
      });
      return nudge.framesLeft > 0;
    });
  }

  private renderPlatforms(): void {
    if (this.levelSpec.platforms.length === 0) {
      return;
    }
    const placements = computePlatformPlacements(
      this.simulationState.platforms,
      this.levelSpec,
      this.simulationState.clock.frameIndex,
    );
    const liftImage = this.userAssetBundle?.actorImages.get("mechanism-lift");
    for (const [index, placement] of placements.entries()) {
      let plank = this.platformRenderObjects[index];
      if (plank === undefined) {
        plank =
          liftImage !== undefined
            ? addUserFrameImage(this, 0, 0, liftImage)
            : this.add
                .rectangle(
                  0,
                  0,
                  placement.widthPixels,
                  placement.heightPixels,
                  platformFillColor,
                )
                .setOrigin(0)
                .setStrokeStyle(1, platformEdgeColor);
        this.platformRenderObjects.push(plank);
      }
      plank.setPosition(placement.x, placement.y);
      if (plank instanceof Phaser.GameObjects.Rectangle) {
        plank.setSize(placement.widthPixels, placement.heightPixels);
      } else {
        plank.setDisplaySize(placement.widthPixels, placement.heightPixels);
      }

      // Balance platforms hang from their pulley rope (drawn up to the
      // pulley band under the HUD); wrap-around elevators ride a full-height
      // shaft cable like the ROM's vertical lift columns.
      let rope = this.platformRopeRenderObjects[index];
      const wantsShaft =
        placement.kind === "lift-up" || placement.kind === "lift-down";
      if (placement.kind === "balance" || wantsShaft) {
        if (rope === undefined) {
          rope = this.add
            .rectangle(0, 0, 1, 1, platformRopeColor)
            .setOrigin(0)
            .setDepth(-1);
          this.platformRopeRenderObjects[index] = rope;
        }
        const ropeTopY = wantsShaft ? 0 : platformRopePulleyRowY;
        const ropeBottomY = wantsShaft
          ? this.levelSpec.heightTiles * this.levelSpec.tileSizePixels
          : placement.y;
        rope.setPosition(placement.x + placement.widthPixels / 2, ropeTopY);
        rope.setSize(1, Math.max(1, ropeBottomY - ropeTopY));
        rope.setVisible(true);
      } else if (rope !== undefined) {
        rope.setVisible(false);
      }
    }
  }

  private renderBreakableTiles(): void {
    const brokenTileKeys = new Set(
      this.simulationState.breakableBlocks.brokenBlockTilePositions.map(
        (position) => makeTileRenderKey(position.x, position.y),
      ),
    );

    for (const [tileKey, renderObjects] of this.breakableTileRenderObjects) {
      const visible = !brokenTileKeys.has(tileKey);

      for (const renderObject of renderObjects) {
        setGameObjectVisible(renderObject, visible);
      }
    }
  }

  // Shabby mode: redden the player as head-bonk bloodiness climbs (10 levels).
  // Off in the faithful mode, where bloodiness is always 0.
  // Keep co-op players inside the visible screen so all players share one screen
  // (the camera follows the primary). A player pushed to the left or right screen
  // edge is stopped there rather than walking off. No-op in single-player.
  private clampCoopPlayersToScreen(): void {
    const coopRuntimes = this.simulationState.players.slice(1);
    if (coopRuntimes.length === 0) {
      return;
    }
    const view = this.cameras.main.worldView;
    const clamped = coopRuntimes.map((runtime) => {
      const player = runtime.player;
      const width = Number(player.collider.width);
      const x = Number(player.position.x);
      const clampedX = Math.max(view.x, Math.min(x, view.right - width));
      if (clampedX === x) {
        return runtime;
      }
      return {
        ...runtime,
        player: {
          ...player,
          position: {
            x: requireSimulationPixelPosition(clampedX, "player.position.x"),
            y: player.position.y,
          },
          velocity: {
            x: requireSimulationVelocity(0, "player.velocity.x"),
            y: player.velocity.y,
          },
        },
      };
    });
    this.simulationState = {
      ...this.simulationState,
      players: [this.simulationState.players[0], ...clamped],
    };
  }

  // Whether a given enemy wears the green (Luigi) hero skin in revenge mode —
  // a stable per-enemy split by a hash of the id so the field is a mix of reds
  // and greens that never flickers.
  private revengeEnemyIsLuigi(entityId: string): boolean {
    let sum = 0;
    for (let index = 0; index < entityId.length; index += 1) {
      sum += entityId.charCodeAt(index);
    }
    return sum % 2 === 1;
  }

  // The "true type" a revenge hero wears as a helmet, chosen from the enemy's
  // role so a stomped Mario still reads as the Koopa / Goomba / Hammer Bro / …
  // it stands in for. Falls back to the Koopa shell for any unlisted role.
  private revengeEnemyTypeForRole(role: ActorRole): string {
    switch (role) {
      case ActorRole.Enemy:
        return "goomba";
      case ActorRole.ThrowingEnemy:
        return "hammer";
      case ActorRole.AerialThrowingEnemy:
        return "lakitu";
      case ActorRole.ChasingEnemy:
        return "spiny";
      case ActorRole.PiranhaPlant:
        return "piranha";
      case ActorRole.ArmoredEnemy:
      case ActorRole.FlyingEnemy:
      default:
        return "koopa";
    }
  }

  // The half-height Mario/Luigi frame to draw for an enemy in revenge mode: a
  // hero re-skinned in that enemy's true type (Koopa shell, Goomba cap, …) in
  // Mario red or Luigi green, showing the eye-bulge squash once stomped
  // (defeated) and otherwise its animated walk.
  private revengeEnemySprite(
    entityId: string,
    role: ActorRole,
  ): LoadedImageAsset | undefined {
    const bundle = this.userAssetBundle;
    const type = this.revengeEnemyTypeForRole(role);
    const color = this.revengeEnemyIsLuigi(entityId) ? "luigi" : "mario";
    const key = `${type}-${color}`;
    const defeated = this.simulationState.enemies.defeatedEnemyEntityIds.some(
      (id) => String(id) === entityId,
    );
    if (defeated) {
      return bundle?.reactionImages.get(`${key}-stomped`);
    }
    const frame =
      Math.floor(Number(this.simulationState.clock.frameIndex) / 8) % 2 === 0
        ? "walk-1"
        : "walk-2";
    return bundle?.reactionImages.get(`${key}-${frame}`);
  }

  // Reset all bot tracking + in-flight bot explosions (a new level starts from a
  // clean slate so a fresh spawn is never mistaken for a death).
  private resetCoopBotState(): void {
    for (const piece of this.botDeathPieces) {
      piece.image.destroy();
    }
    this.botDeathPieces = [];
    for (const label of this.coopPlayerNameLabels) {
      label.destroy();
    }
    this.coopPlayerNameLabels.length = 0;
    this.coopBotSnapshots = [];
    this.coopBotCharacters = [];
    this.coopBotNames = [];
    this.coopBotNextVariant = 0;
  }

  // Once per simulation step: match the current co-op bots to the previous
  // frame's by nearest position so each keeps a stable robot costume, and
  // explode any previous bot that has vanished from the sim (it died this step).
  private syncCoopBotsAndDetectDeaths(): void {
    const coop = this.simulationState.players.slice(1);
    const current = coop.map((runtime) => ({
      x: Number(runtime.player.position.x),
      y: Number(runtime.player.position.y),
      w: Number(runtime.player.collider.width),
      h: Number(runtime.player.collider.height),
    }));
    const previous = this.coopBotSnapshots;
    // A bot moves only a few pixels per frame, so a generous radius still keeps
    // adjacent bots (spawned a tile apart) from being confused for one another.
    const matchThresholdSquared = 40 * 40;
    const pairs: { ci: number; pi: number; distance: number }[] = [];
    current.forEach((c, ci) => {
      previous.forEach((p, pi) => {
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        const distance = dx * dx + dy * dy;
        if (distance <= matchThresholdSquared) {
          pairs.push({ ci, pi, distance });
        }
      });
    });
    pairs.sort((a, b) => a.distance - b.distance);
    const currentToPrevious = new Array<number>(current.length).fill(-1);
    const previousMatched = new Array<boolean>(previous.length).fill(false);
    for (const { ci, pi } of pairs) {
      if (currentToPrevious[ci] !== -1 || previousMatched[pi]) {
        continue;
      }
      currentToPrevious[ci] = pi;
      previousMatched[pi] = true;
    }
    // Each current bot keeps its matched costume + call-sign, or (new) cycles to
    // the next robot variant and draws a fresh call-sign.
    const names: string[] = [];
    this.coopBotCharacters = current.map((_c, ci) => {
      const pi = currentToPrevious[ci] ?? -1;
      const matched = pi >= 0 ? previous[pi] : undefined;
      if (matched !== undefined) {
        names[ci] = matched.name;
        return matched.character;
      }
      const spawn = this.coopBotNextVariant;
      this.coopBotNextVariant += 1;
      names[ci] = robotNameForBotSpawn(spawn);
      return robotCharacterForBotIndex(spawn);
    });
    this.coopBotNames = names;
    // Any previous bot with no current match is gone — blow it up where it fell.
    previous.forEach((p, pi) => {
      if (!previousMatched[pi]) {
        this.spawnBotExplosion(p.x, p.y, p.w, p.h, p.character);
      }
    });
    this.coopBotSnapshots = current.map((c, ci) => ({
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      character: this.coopBotCharacters[ci] ?? "robot1",
      name: names[ci] ?? "ROBO",
    }));
  }

  // Burst a dead bot into its own robot's body parts (a flash plus six flung,
  // spinning metal parts) at its last footprint. stepBotDeathPieces then flies
  // them under gravity so they harm enemies and the other bots on contact.
  private spawnBotExplosion(
    x: number,
    y: number,
    width: number,
    height: number,
    character: PlayerCharacter,
  ): void {
    const bundle = this.userAssetBundle;
    const partSprite = (part: string): LoadedImageAsset | undefined =>
      bundle?.reactionImages.get(`${character}-part-${part}`) ??
      bundle?.reactionImages.get(`part-${part}`);
    if (partSprite("torso") === undefined) {
      return;
    }
    // Body parts collide with the level's blocks as they fall — build the
    // lookup lazily (a bot can explode with no primary death in flight).
    this.deathPartCollisionLookup ??= makeTileCollisionLookup(this.levelSpec);
    this.spawnBotExplosionBurst(x + width / 2, y + height / 2);
    const parts: {
      readonly part: string;
      readonly fx: number;
      readonly fy: number;
      readonly flip: boolean;
      readonly fling: number;
    }[] = [
      { part: "head", fx: 0.5, fy: 0.16, flip: false, fling: 0.5 },
      { part: "torso", fx: 0.5, fy: 0.5, flip: false, fling: -0.4 },
      { part: "arm", fx: 0.14, fy: 0.44, flip: true, fling: -2.7 },
      { part: "arm", fx: 0.86, fy: 0.44, flip: false, fling: 2.8 },
      { part: "leg", fx: 0.34, fy: 0.82, flip: true, fling: -1.6 },
      { part: "leg", fx: 0.66, fy: 0.82, flip: false, fling: 1.7 },
    ];
    parts.forEach((part, index) => {
      const asset = partSprite(part.part);
      if (asset === undefined) {
        return;
      }
      this.pushFlyingDeathPart(this.botDeathPieces, {
        asset,
        x: x + part.fx * width,
        y: y + part.fy * height,
        width,
        height,
        flip: part.flip,
        fling: part.fling,
        popIndex: index,
      });
    });
  }

  // A short expanding flash at a bot's blast, self-destructing via a tween so
  // several bots can burst at once (unlike the primary's single tracked burst).
  private spawnBotExplosionBurst(x: number, y: number): void {
    const burstAsset =
      this.userAssetBundle?.reactionImages.get("explosion-burst");
    if (burstAsset === undefined) {
      return;
    }
    const image = addUserFrameImage(this, 0, 0, burstAsset)
      .setOrigin(0.5)
      .setPosition(x, y)
      .setDepth(63)
      .setScale(0.4);
    this.tweens.add({
      targets: image,
      scale: 1.4,
      alpha: 0,
      duration: 320,
      ease: "Quad.Out",
      onComplete: () => image.destroy(),
    });
  }

  // Fly the in-flight bot body parts one frame: gravity + block collisions, then
  // knock out any enemy struck and take out any other bot struck (dead until the
  // level ends — its own explosion follows next frame).
  private stepBotDeathPieces(): void {
    if (this.botDeathPieces.length === 0) {
      return;
    }
    const belowLevelY = this.belowLevelFallLimit();
    const hitCoopPlayerIndices = new Set<number>();
    this.botDeathPieces = this.flyDeathParts(
      this.botDeathPieces,
      belowLevelY,
      hitCoopPlayerIndices,
    );
    this.removeHitCoopPlayers(hitCoopPlayerIndices);
    // Animate part-knocked enemies here only when the primary's explode effect
    // isn't already stepping them this frame (it owns that step when active).
    if (!(this.deathArcStarted && this.deathEffectStyle === "explode")) {
      this.stepKnockedEnemies(belowLevelY);
    }
  }

  // Render each additional co-op player (demo bot) with its own distinct robot
  // costume, keeping the sprite pool in sync with simulationState.players[1..]
  // and positioning each from its own kinematics.
  private renderCoopPlayers(): void {
    const coopRuntimes = this.simulationState.players.slice(1);
    while (this.coopPlayerImages.length < coopRuntimes.length) {
      const image = renderPlayerImage(this, this.userAssetBundle?.playerImage);
      if (image === undefined) {
        break;
      }
      this.coopPlayerImages.push(image);
    }
    while (this.coopPlayerImages.length > coopRuntimes.length) {
      this.coopPlayerImages.pop()?.destroy();
    }
    while (this.coopPlayerNameLabels.length < coopRuntimes.length) {
      this.coopPlayerNameLabels.push(this.makeCoopBotNameLabel());
    }
    while (this.coopPlayerNameLabels.length > coopRuntimes.length) {
      this.coopPlayerNameLabels.pop()?.destroy();
    }
    coopRuntimes.forEach((runtime, index) => {
      const image = this.coopPlayerImages[index];
      if (image === undefined) {
        return;
      }
      const coopPlayer = runtime.player;
      // Resolve this player's own sprite by viewing the sim through its slice.
      const view: SimulationState = {
        ...this.simulationState,
        players: [{ ...runtime }],
      };
      const sprite = resolvePlayerSpriteImage(
        this.userAssetBundle?.playerImage,
        view,
        this.currentTheme,
        this.coopBotCharacters[index] ?? robotCharacterForBotIndex(index),
      );
      if (sprite !== undefined) {
        setUserFrameImage(this, image, sprite);
      }
      image
        .setFlipX(this.currentTheme === "water" && coopPlayer.velocity.x < -4)
        .setPosition(coopPlayer.position.x, coopPlayer.position.y)
        .setDisplaySize(coopPlayer.collider.width, coopPlayer.collider.height);
      // Float this bot's call-sign just above its head, centred on the sprite.
      const label = this.coopPlayerNameLabels[index];
      if (label !== undefined) {
        label
          .setText(this.coopBotNames[index] ?? "")
          .setPosition(
            Number(coopPlayer.position.x) +
              Number(coopPlayer.collider.width) / 2,
            Number(coopPlayer.position.y) - 3,
          );
      }
    });
  }

  // A small, crisp name-tag for a co-op bot: bright text with a dark outline so
  // it reads over any backdrop, centred on the bot and anchored at its bottom so
  // it sits just above the head.
  private makeCoopBotNameLabel(): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "6px",
        color: "#eaf2ff",
        stroke: "#101828",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setResolution(3)
      .setDepth(58);
  }

  private renderPlayerBloodiness(): void {
    if (!this.exaggeratedReactions) {
      return;
    }
    const level = Math.min(
      10,
      Math.floor(this.simulationState.bloodiness * 10),
    );
    // White (untinted) at level 0; green and blue drain away as blood builds,
    // leaving red — a flush at low levels, a deep red when maxed.
    const channel = Math.max(30, 240 - level * 23);
    const tint = (0xff << 16) | (channel << 8) | channel;
    // Tint the shabby player sprite (multiplied, so level 0 = 0xffffff = no
    // change). Shabby mode always renders the sprite, so this is what shows.
    this.playerImageObject?.setTint(tint);
  }

  // In the water world, small air bubbles rise from the swimmer's head, as in
  // the original. Purely decorative (a rising, fading circle).
  private emitSwimBubbles(): void {
    if (
      this.currentTheme !== "water" ||
      this.simulationState.players[0].outcome.kind !==
        PlayerOutcomeKind.Active ||
      this.simulationState.clock.frameIndex % swimBubbleIntervalFrames !== 0
    ) {
      return;
    }
    const player = this.simulationState.players[0].player;
    const bubbleX = player.position.x + player.collider.width * 0.72;
    const bubbleY = player.position.y + 2;
    const radius = 1.8;
    // A real air/soap bubble is near-clear inside with a bright rim and a small
    // specular glint: a faintly-tinted, mostly-transparent fill, a crisp
    // white-blue contour, and a highlight dot on the upper-left.
    const skin = this.add
      .circle(0, 0, radius, 0xbfefff, 0.06)
      .setStrokeStyle(1, 0xf0ffff, 0.95);
    const highlight = this.add.circle(
      -radius * 0.34,
      -radius * 0.34,
      Math.max(0.4, radius * 0.3),
      0xffffff,
      0.9,
    );
    const bubble = this.add
      .container(bubbleX, bubbleY, [skin, highlight])
      .setDepth(45);
    this.tweens.add({
      targets: bubble,
      x: bubbleX + 3,
      y: bubbleY - 24,
      alpha: 0,
      scale: 1.8,
      duration: 850,
      ease: "Sine.Out",
      onComplete: () => bubble.destroy(),
    });
  }

  private renderUsedInteractiveBlocks(): void {
    if (this.usedBlockSwaps.size === 0) {
      return;
    }

    for (const position of this.simulationState.interactiveBlocks
      .bumpedBlockTilePositions) {
      const swap = this.usedBlockSwaps.get(
        makeTileRenderKey(position.x, position.y),
      );
      if (swap !== undefined) {
        setUserFrameImage(this, swap.image, swap.usedImage);
        swap.glyph?.setVisible(false);
      }
    }
  }

  // A hidden block is invisible until bumped; once its position is revealed,
  // materialise a solid block there so the player can see and stand on it.
  private renderRevealedHiddenBlocks(): void {
    if (this.hiddenBlockTiles.size === 0) {
      return;
    }

    for (const position of this.simulationState.interactiveBlocks
      .bumpedBlockTilePositions) {
      const key = makeTileRenderKey(position.x, position.y);
      const hiddenTile = this.hiddenBlockTiles.get(key);
      if (hiddenTile === undefined || this.revealedHiddenTiles.has(key)) {
        continue;
      }
      this.revealedHiddenTiles.add(key);
      // A revealed hidden block shows the spent "used" block art (its own
      // "hidden-block" id has no art — it was invisible until now).
      renderAuthoredTile(
        this,
        hiddenTile.pixelX,
        hiddenTile.pixelY,
        hiddenTile.sizePixels,
        "empty-question-block",
        TileCollisionKind.Solid,
      );
    }
  }

  private renderPipes(): void {
    // Pipe mouths are rendered as part of the level tiles via a simple hint.
  }

  private spawnLandingDustParticles(): void {
    const playerX = this.simulationState.players[0].player.position.x;
    const playerBottomY =
      this.simulationState.players[0].player.position.y +
      this.simulationState.players[0].player.collider.height;

    for (let i = 0; i < 4; i += 1) {
      const offsetX = (i - 1.5) * 4;
      const dust = this.add.circle(
        playerX + offsetX,
        playerBottomY - 1,
        dustParticleRadius,
        dustParticleColor,
        0.6,
      );

      this.tweens.add({
        targets: dust,
        x: playerX + offsetX * 2,
        y: playerBottomY - 6,
        alpha: 0,
        duration: dustParticleDurationMs,
        onComplete: () => {
          dust.destroy();
        },
      });
    }
  }

  // A hard landing trembles the camera framing (a cinematic bump) and buzzes a
  // rolling rumble, both scaled by how far the player fell. The shake is applied
  // in stepCameraShake as a viewport offset — the world and physics are never
  // touched.
  private triggerGroundQuake(dropTiles: number): void {
    const quake = resolveGroundQuake(dropTiles);
    if (quake === null) {
      return;
    }
    // The quake's abstract intensity is a fraction of the view height; turn it
    // into a pixel amplitude for our own smooth shake. Keep the larger of any
    // shake already in flight so a second big fall doesn't weaken the first.
    this.cameraShakeAmplitudePixels = Math.max(
      this.cameraShakeAmplitudePixels,
      quake.intensity * this.scale.height,
    );
    this.cameraShakeTotalFrames = Math.max(
      1,
      Math.round((quake.durationMs / 1000) * 60),
    );
    this.cameraShakeFramesRemaining = this.cameraShakeTotalFrames;
    vibrateHaptic(groundQuakeHapticPattern);
    this.groundQuakeCount += 1;
  }

  // Apply the cinematic camera shake for this frame: a smooth, decaying two-tone
  // sinusoid offset on the camera's viewport position (deterministic — no random
  // per-frame jitter, which is what read as flicker). Runs every frame so the
  // offset always resets cleanly to zero when no quake is active.
  private stepCameraShake(): void {
    const camera = this.cameras.main;
    if (this.cameraShakeFramesRemaining <= 0) {
      if (camera.x !== 0 || camera.y !== 0) {
        camera.setPosition(0, 0);
      }
      return;
    }
    this.cameraShakeFramesRemaining -= 1;
    const progress =
      1 - this.cameraShakeFramesRemaining / this.cameraShakeTotalFrames;
    const amplitude = this.cameraShakeAmplitudePixels * (1 - progress);
    const phase = progress * Math.PI * 2;
    const offsetX = amplitude * Math.sin(phase * 6.3);
    const offsetY = amplitude * 0.7 * Math.sin(phase * 8.1 + 1.1);
    camera.setPosition(offsetX, offsetY);
    if (this.cameraShakeFramesRemaining <= 0) {
      camera.setPosition(0, 0);
      this.cameraShakeAmplitudePixels = 0;
    }
  }

  // Immediately cancel any in-progress camera shake and restore the framing.
  private cancelCameraShake(): void {
    this.cameraShakeFramesRemaining = 0;
    this.cameraShakeAmplitudePixels = 0;
    this.cameras.main.setPosition(0, 0);
  }

  private renderSpawnedActors(
    collectedCoinEntityIdStrings: ReadonlySet<string>,
    collectedItemEntityIdStrings: ReadonlySet<string>,
    collectedPowerUpEntityIdStrings: ReadonlySet<string>,
    collectedExtraLifeEntityIdStrings: ReadonlySet<string>,
    collectedInvincibilityEntityIdStrings: ReadonlySet<string>,
  ): void {
    for (const spawnedActor of this.simulationState.spawnedActors
      .spawnedActors) {
      let renderObject = this.spawnedActorRenderObjects.get(
        spawnedActor.entityId,
      );

      if (renderObject === undefined) {
        const userImage = this.userAssetBundle?.actorImages.get(
          spawnedActor.actorId,
        );
        renderObject =
          userImage === undefined
            ? renderAuthoredActor(
                this,
                spawnedActor.position,
                spawnedActor.role,
              )
            : renderUserActorImage(this, spawnedActor.position, userImage)
                .container;
        this.spawnedActorRenderObjects.set(spawnedActor.entityId, renderObject);
      }

      renderObject.setPosition(
        spawnedActor.position.x,
        spawnedActor.position.y,
      );
      // A growing vine stretches its render to the grown extent (position.y
      // is the rising top; heightPixels reaches down to the block).
      if (
        spawnedActor.role === ActorRole.Climbable &&
        spawnedActor.heightPixels > this.levelSpec.tileSizePixels
      ) {
        renderObject.setScale(
          1,
          spawnedActor.heightPixels / this.levelSpec.tileSizePixels,
        );
      }
      // While an item is still emerging from its block, draw it behind the
      // tile layer so the block occludes it — it rises cleanly out of the top.
      const emerging =
        spawnedActor.remainingPopupFrames > 0 &&
        (spawnedActor.role === ActorRole.PowerUp ||
          spawnedActor.role === ActorRole.ExtraLife ||
          spawnedActor.role === ActorRole.InvincibilityPowerUp);
      renderObject.setDepth(emerging ? emergingItemDepth : 0);
      renderObject.setVisible(
        spawnedActor.active &&
          (spawnedActor.role !== ActorRole.Coin ||
            spawnedActor.collectionMode ===
              SpawnedActorCollectionMode.OnSpawn ||
            !collectedCoinEntityIdStrings.has(spawnedActor.entityId)) &&
          (spawnedActor.role !== ActorRole.Item ||
            !collectedItemEntityIdStrings.has(spawnedActor.entityId)) &&
          (spawnedActor.role !== ActorRole.PowerUp ||
            !collectedPowerUpEntityIdStrings.has(spawnedActor.entityId)) &&
          (spawnedActor.role !== ActorRole.ExtraLife ||
            !collectedExtraLifeEntityIdStrings.has(spawnedActor.entityId)) &&
          (spawnedActor.role !== ActorRole.InvincibilityPowerUp ||
            !collectedInvincibilityEntityIdStrings.has(spawnedActor.entityId)),
      );
    }
  }

  private renderProjectiles(): void {
    const fireball = this.userAssetBundle?.actorImages.get(
      "projectile-fireball",
    );
    this.renderProjectileCollection(
      this.simulationState.projectiles.projectiles,
      this.projectileRenderObjects,
      projectileColor,
      projectileOutlineColor,
      projectileCoreColor,
      () => fireball,
    );
  }

  private renderTimedHazardProjectiles(): void {
    const images = this.userAssetBundle?.actorImages;
    this.renderProjectileCollection(
      this.simulationState.timedHazardProjectiles.projectiles,
      this.timedHazardProjectileRenderObjects,
      cannonWarningColor,
      cannonMouthColor,
      projectileSparkleColor,
      // The pooled timed hazards mix kinds; the id prefix says which art fits
      // (castle flame jets, cannon bullets, hammers, Lakitu's eggs).
      (projectile) => {
        if (images === undefined) {
          return undefined;
        }
        if (projectile.id.startsWith("timed-hazard-flame")) {
          return images.get("projectile-flame");
        }
        if (projectile.id.startsWith("timed-hazard-")) {
          return images.get("vglc-smb-bullet");
        }
        if (projectile.id.startsWith("aerial-throwing-enemy-")) {
          return images.get("projectile-egg");
        }
        if (projectile.id.startsWith("throwing-enemy-")) {
          return images.get("projectile-hammer");
        }
        return undefined;
      },
    );
  }

  // Swimming Cheep-cheeps spawn and despawn dynamically as the frenzy runs, so
  // reconcile their sprites each frame the way spawned actors are handled.
  // Aerial frenzy entities: leaping cheeps use the fish sprite/role, Bullet
  // Bills the flying-enemy fallback (dark capsule when no sprite is present).
  private renderAerialFrenzyEntities(): void {
    const activeIds = new Set<string>();
    for (const entity of liveAerialFrenzyEntities(
      this.simulationState.aerialFrenzy,
    )) {
      activeIds.add(entity.entityId);
      let renderObject = this.aerialFrenzyRenderObjects.get(entity.entityId);
      if (renderObject === undefined) {
        const spriteKey =
          entity.kind === AerialFrenzyKind.FlyingCheep
            ? "vglc-smb-cheep"
            : "vglc-smb-bullet";
        const userImage = this.userAssetBundle?.actorImages.get(spriteKey);
        if (userImage === undefined) {
          renderObject = renderAuthoredActor(
            this,
            entity.position,
            ActorRole.FlyingEnemy,
          );
        } else {
          const rendered = renderUserActorImage(
            this,
            entity.position,
            userImage,
          );
          rendered.image.setFlipX(entity.velocity.x > 0);
          renderObject = rendered.container;
        }
        this.aerialFrenzyRenderObjects.set(entity.entityId, renderObject);
      }
      renderObject.setPosition(entity.position.x, entity.position.y);
      renderObject.setDepth(0);
    }
    for (const [id, renderObject] of this.aerialFrenzyRenderObjects) {
      if (!activeIds.has(id)) {
        renderObject.destroy();
        this.aerialFrenzyRenderObjects.delete(id);
      }
    }
  }

  // Spinies hatched from Lakitu's eggs: the spiky urchin sprite, or the
  // chasing-enemy (spiked) fallback shape.
  private renderHatchedSpinies(): void {
    const activeIds = new Set<string>();
    for (const spiny of liveHatchedSpinies(
      this.simulationState.hatchedSpinies,
    )) {
      activeIds.add(spiny.spinyId);
      let renderObject = this.hatchedSpinyRenderObjects.get(spiny.spinyId);
      if (renderObject === undefined) {
        const userImage =
          this.userAssetBundle?.actorImages.get("vglc-smb-spiny");
        if (userImage === undefined) {
          renderObject = renderAuthoredActor(
            this,
            spiny.position,
            ActorRole.ChasingEnemy,
          );
        } else {
          renderObject = renderUserActorImage(
            this,
            spiny.position,
            userImage,
          ).container;
        }
        this.hatchedSpinyRenderObjects.set(spiny.spinyId, renderObject);
      }
      renderObject.setPosition(spiny.position.x, spiny.position.y);
      renderObject.setDepth(0);
    }
    for (const [id, renderObject] of this.hatchedSpinyRenderObjects) {
      if (!activeIds.has(id)) {
        renderObject.destroy();
        this.hatchedSpinyRenderObjects.delete(id);
      }
    }
  }

  private renderFrenzyCheeps(): void {
    const activeIds = new Set<string>();
    for (const cheep of liveFrenzyCheeps(this.simulationState.cheepFrenzy)) {
      activeIds.add(cheep.entityId);
      let renderObject = this.frenzyCheepRenderObjects.get(cheep.entityId);
      if (renderObject === undefined) {
        const userImage =
          this.userAssetBundle?.actorImages.get("vglc-smb-cheep");
        if (userImage === undefined) {
          renderObject = renderAuthoredActor(
            this,
            cheep.position,
            ActorRole.FlyingEnemy,
          );
        } else {
          const rendered = renderUserActorImage(
            this,
            cheep.position,
            userImage,
          );
          // The fish sprite is drawn head-right; cheeps swim left, so mirror it.
          rendered.image.setFlipX(true);
          renderObject = rendered.container;
        }
        this.frenzyCheepRenderObjects.set(cheep.entityId, renderObject);
      }
      renderObject.setPosition(cheep.position.x, cheep.position.y);
      renderObject.setDepth(0);
    }
    for (const [id, renderObject] of this.frenzyCheepRenderObjects) {
      if (!activeIds.has(id)) {
        renderObject.destroy();
        this.frenzyCheepRenderObjects.delete(id);
      }
    }
  }

  private renderProjectileCollection(
    projectiles: readonly {
      readonly id: string;
      readonly position: { readonly x: number; readonly y: number };
      readonly velocity?: { readonly x: number; readonly y: number };
      readonly width: number;
      readonly height: number;
    }[],
    renderObjects: Map<string, Phaser.GameObjects.Container>,
    fillColor: number,
    outlineColor: number,
    coreColor: number,
    resolveImage?: (projectile: {
      readonly id: string;
    }) => LoadedImageAsset | undefined,
  ): void {
    const activeProjectileIds = new Set<string>();

    for (const projectile of projectiles) {
      activeProjectileIds.add(projectile.id);
      let renderObject = renderObjects.get(projectile.id);

      if (renderObject === undefined) {
        const imageAsset = resolveImage?.(projectile);
        if (imageAsset !== undefined) {
          // Skin art (drawn facing left); sized to the projectile's collider.
          const image = addUserFrameImage(this, 0, 0, imageAsset)
            .setOrigin(0.5)
            .setDisplaySize(projectile.width, projectile.height);
          renderObject = this.add.container(
            projectile.position.x,
            projectile.position.y,
            [image],
          );
        } else {
          const outline = this.add
            .rectangle(0, 0, projectile.width, projectile.height, fillColor)
            .setOrigin(0.5)
            .setStrokeStyle(tileStrokeWidth, outlineColor);
          const core = this.add
            .rectangle(
              0,
              0,
              Math.max(
                projectile.width - tileStrokeWidth * 2,
                projectileMinimumCoreDimensionPixels,
              ),
              Math.max(
                projectile.height - tileStrokeWidth * 2,
                projectileMinimumCoreDimensionPixels,
              ),
              coreColor,
            )
            .setOrigin(0.5);
          const sparkle = this.add
            .rectangle(
              0,
              0,
              projectileSparkleSizePixels,
              projectileSparkleSizePixels,
              projectileSparkleColor,
            )
            .setOrigin(0.5);
          renderObject = this.add.container(
            projectile.position.x,
            projectile.position.y,
            [outline, core, sparkle],
          );
        }
        renderObjects.set(projectile.id, renderObject);
      }

      const first = renderObject.getAt(0);
      if (
        first instanceof Phaser.GameObjects.Image &&
        projectile.velocity !== undefined &&
        projectile.velocity.x !== 0
      ) {
        first.setFlipX(projectile.velocity.x > 0);
      }
      renderObject.setPosition(
        projectile.position.x + projectile.width / 2,
        projectile.position.y + projectile.height / 2,
      );
      renderObject.setVisible(true);
    }

    // Projectile ids are unique per shot and never return once spent, so
    // destroy stale entries — hiding them forever would grow the pool without
    // bound over a long session.
    for (const [id, renderObject] of renderObjects) {
      if (!activeProjectileIds.has(id)) {
        renderObject.destroy();
        renderObjects.delete(id);
      }
    }
  }

  // Capture the first frame an enemy is contacted this level into a stable
  // observation, so a browser test can assert on that one-frame event without
  // racing the live simulation frame.
  private latchEnemyContactObservation(): void {
    if (this.lastEnemyContactObservation !== undefined) {
      return;
    }
    const state = this.simulationState;
    if (state.enemies.contactedEnemyEntityIds.length === 0) {
      return;
    }
    this.lastEnemyContactObservation = {
      frameIndex: state.clock.frameIndex,
      levelContacts: {
        hazard: state.levelContacts.hazard,
        goal: state.levelContacts.goal,
      },
      enemies: {
        contactedEnemyEntityIds: state.enemies.contactedEnemyEntityIds.map(
          (entityId) => entityId,
        ),
        defeatedEnemyEntityIds: state.enemies.defeatedEnemyEntityIds.map(
          (entityId) => entityId,
        ),
      },
      enemyContactResponse: makeBrowserEnemyContactResponseSnapshot(
        state.enemyContactResponse,
      ),
      playerVelocityX: state.players[0].player.velocity.x,
      playerOutcome: makeBrowserPlayerOutcomeSnapshot(state.players[0].outcome),
    };
  }

  private publishDebugApi(): void {
    const debugApi: BrowserPlatformerDebugApi = {
      teleportPlayer: (xPixels: number, yPixels: number) => {
        // Fail loudly on states a teleport cannot meaningfully change, instead
        // of silently moving a sprite the frozen simulation will never step —
        // the calling test would otherwise hang to its timeout.
        if (this.paused) {
          throw new Error("teleportPlayer: the game is paused.");
        }
        if (
          this.simulationState.players[0].outcome.kind !==
          PlayerOutcomeKind.Active
        ) {
          throw new Error("teleportPlayer: the run has already ended.");
        }
        const x = makePixelPosition(xPixels, "debug.teleport.x");
        const y = makePixelPosition(yPixels, "debug.teleport.y");
        const zeroVelocity = makeVelocityPixelsPerSecond(
          0,
          "debug.teleport.velocity",
        );
        if (!x.ok || !y.ok || !zeroVelocity.ok) {
          throw new Error("teleportPlayer requires valid pixel positions.");
        }
        const [primary, ...others] = this.simulationState.players;
        this.simulationState = {
          ...this.simulationState,
          players: [
            {
              ...primary,
              player: {
                ...primary.player,
                position: { x: x.value, y: y.value },
                velocity: { x: zeroVelocity.value, y: zeroVelocity.value },
              },
            },
            ...others,
          ],
        };
        this.renderSimulationState();
      },
      setPlayerVitality: (kind: "small" | "powered" | "fire") => {
        if (this.paused) {
          throw new Error("setPlayerVitality: the game is paused.");
        }
        if (
          this.simulationState.players[0].outcome.kind !==
          PlayerOutcomeKind.Active
        ) {
          throw new Error("setPlayerVitality: the run has already ended.");
        }
        const vitality: PlayerVitalityState =
          kind === "small"
            ? { kind: PlayerVitalityKind.Small }
            : kind === "powered"
              ? { kind: PlayerVitalityKind.Powered }
              : { kind: PlayerVitalityKind.Fire };
        const [primary, ...others] = this.simulationState.players;
        this.simulationState = {
          ...this.simulationState,
          players: [
            {
              ...primary,
              vitality,
              player: resizePlayerForVitality(primary.player, vitality),
            },
            ...others,
          ],
        };
        this.renderSimulationState();
      },
      getSimulationSnapshot: () => ({
        frameIndex: this.simulationState.clock.frameIndex,
        // The whole-session score (prior-level base + this level's score), so it
        // accumulates across levels rather than resetting each level.
        score: this.sessionScore(),
        // The whole-session coin total (prior-level base + this level's coins),
        // so it reflects the cross-level count rather than resetting each level.
        coinCount:
          this.simulationState.sessionCoinBase +
          this.simulationState.collectibles.collectedCoinEntityIds.length,
        bloodiness: this.simulationState.bloodiness,
        extraLifeCount:
          this.simulationState.collectibles.collectedExtraLifeEntityIds.length,
        livesRemaining: this.simulationState.livesRemaining,
        gameOver: this.pendingGameOver,
        warpZone: this.warpZoneBannerShown,
        timeBonusCountdownUnits: this.timeBonusCountdownUnitsRemaining,
        paused: this.paused,
        deathEffect: {
          started: this.deathArcStarted,
          style: this.deathArcStarted ? this.deathEffectStyle : undefined,
          pieceCount: this.deathPieces.length,
          smokeCount: this.deathSmoke.length,
          xEyesVisible: this.deathXEyesImage?.visible ?? false,
          knockedEnemyCount: this.deathKnockedEnemyCount,
        },
        lastSoundEvents: this.lastSoundEvents.map((event) => event as string),
        groundQuakeCount: this.groundQuakeCount,
        playerCharacter: this.playerCharacter,
        playerCount: this.simulationState.players.length,
        level: {
          widthTiles: this.levelSpec.widthTiles,
          heightTiles: this.levelSpec.heightTiles,
          tileSizePixels: this.levelSpec.tileSizePixels,
          renderedTileCount: this.renderedTileCount,
          collisionCounts: {
            [TileCollisionKind.Empty]:
              this.levelCollisionCounts[TileCollisionKind.Empty],
            [TileCollisionKind.Solid]:
              this.levelCollisionCounts[TileCollisionKind.Solid],
            [TileCollisionKind.Interactive]:
              this.levelCollisionCounts[TileCollisionKind.Interactive],
            [TileCollisionKind.Breakable]:
              this.levelCollisionCounts[TileCollisionKind.Breakable],
            [TileCollisionKind.SolidHazard]:
              this.levelCollisionCounts[TileCollisionKind.SolidHazard],
            [TileCollisionKind.Hazard]:
              this.levelCollisionCounts[TileCollisionKind.Hazard],
            [TileCollisionKind.Spring]:
              this.levelCollisionCounts[TileCollisionKind.Spring],
            [TileCollisionKind.Goal]:
              this.levelCollisionCounts[TileCollisionKind.Goal],
            [TileCollisionKind.Hidden]:
              this.levelCollisionCounts[TileCollisionKind.Hidden],
          },
        },
        levelProgression: {
          levelIndex: this.levelIndex,
          levelCount: this.levelSequence?.length ?? 1,
          theme: this.currentTheme,
        },
        cutscene: {
          levelAdvanceDelayFramesRemaining:
            this.levelAdvanceDelayFramesRemaining,
          flagpoleSlide: {
            active: this.flagpoleSlideActive,
            playerSpriteY: this.playerRectangle.y,
            targetY: this.flagpoleSlideTargetY,
            flagY: this.flagObject?.y,
            flagDropActive: this.flagpoleFlagDropActive,
            ball: {
              present: this.flagpoleBallObject !== undefined,
              falling: this.flagpoleBallFall !== undefined,
              visible: this.flagpoleBallObject?.visible ?? false,
              y: this.flagpoleBallObject?.y,
            },
            walkOff: {
              active: this.flagpoleWalkOffActive,
              playerSpriteVisible: this.playerImageObject?.visible ?? false,
            },
          },
          castleClear: {
            framesRemaining: this.castleClearFramesRemaining,
            totalFrames: this.castleClearTotalFrames,
            choppedBridgeColumns: [
              ...this.castleBridgeTilesByColumn.values(),
            ].filter((planks) =>
              planks.some(
                (plank) =>
                  !(
                    plank as Phaser.GameObjects.Components.Visible &
                      typeof plank
                  ).visible,
              ),
            ).length,
            rescueMessageVisible: this.castleClearMessageText !== undefined,
          },
          fireworks: {
            remainingBursts: this.fireworksBurstsRemaining,
            activeSprites: this.fireworkSprites.length,
          },
        },
        levelTimer: {
          remainingFrames: this.simulationState.levelTimer.remainingFrames,
        },
        pathAnnotations: {
          paths: this.levelSpec.pathAnnotations.map((pathAnnotation) => ({
            pathId: pathAnnotation.pathId,
            points: pathAnnotation.points.map((point) => ({
              x: point.x,
              y: point.y,
            })),
          })),
        },
        camera: makeBrowserCameraSnapshot(this.cameras.main, this.levelSpec),
        levelContacts: {
          hazard: this.simulationState.levelContacts.hazard,
          goal: this.simulationState.levelContacts.goal,
        },
        playerVitality: makeBrowserPlayerVitalitySnapshot(
          this.simulationState.players[0].vitality,
        ),
        playerInvincibility: {
          collectedInvincibilityEntityIds:
            this.simulationState.players[0].invincibility.collectedInvincibilityEntityIds.map(
              (entityId) => entityId,
            ),
          remainingFrames:
            this.simulationState.players[0].invincibility.remainingFrames,
        },
        playerOutcome: makeBrowserPlayerOutcomeSnapshot(
          this.simulationState.players[0].outcome,
        ),
        collectibles: {
          collectedCoinEntityIds:
            this.simulationState.collectibles.collectedCoinEntityIds.map(
              (entityId) => entityId,
            ),
          collectedItemEntityIds:
            this.simulationState.collectibles.collectedItemEntityIds.map(
              (entityId) => entityId,
            ),
          collectedExtraLifeEntityIds:
            this.simulationState.collectibles.collectedExtraLifeEntityIds.map(
              (entityId) => entityId,
            ),
        },
        powerUps: {
          collectedPowerUpEntityIds:
            this.simulationState.powerUps.collectedPowerUpEntityIds.map(
              (entityId) => entityId,
            ),
        },
        interactiveBlocks: {
          bumpedBlockTilePositions:
            this.simulationState.interactiveBlocks.bumpedBlockTilePositions.map(
              (position) => ({
                x: position.x,
                y: position.y,
              }),
            ),
        },
        breakableBlocks: {
          brokenBlockTilePositions:
            this.simulationState.breakableBlocks.brokenBlockTilePositions.map(
              (position) => ({
                x: position.x,
                y: position.y,
              }),
            ),
        },
        spawnedActors: {
          spawnedActors: this.simulationState.spawnedActors.spawnedActors.map(
            (spawnedActor) => ({
              entityId: spawnedActor.entityId,
              actorId: spawnedActor.actorId,
              role: spawnedActor.role,
              velocityX: spawnedActor.velocityX,
              velocityY: spawnedActor.velocityY,
              collectionMode: spawnedActor.collectionMode,
              remainingPopupFrames: spawnedActor.remainingPopupFrames,
              sourceBlockTilePosition: {
                x: spawnedActor.sourceBlockTilePosition.x,
                y: spawnedActor.sourceBlockTilePosition.y,
              },
              position: {
                x: spawnedActor.position.x,
                y: spawnedActor.position.y,
              },
              active: spawnedActor.active,
            }),
          ),
        },
        projectiles: {
          projectiles: this.simulationState.projectiles.projectiles.map(
            makeBrowserProjectileSnapshot,
          ),
        },
        timedHazardProjectiles: {
          projectiles:
            this.simulationState.timedHazardProjectiles.projectiles.map(
              makeBrowserProjectileSnapshot,
            ),
          playerContact:
            this.simulationState.timedHazardProjectiles.playerContact,
        },
        cheepFrenzy: {
          liveCount: liveFrenzyCheeps(this.simulationState.cheepFrenzy).length,
        },
        pipeEntry: {
          phase: this.simulationState.pipeEntry.phase,
          pipeEntityId:
            this.simulationState.pipeEntry.phase === PipeEntryPhase.Entering
              ? this.simulationState.pipeEntry.pipeEntityId
              : undefined,
          targetLevelName:
            this.simulationState.pipeEntry.phase === PipeEntryPhase.Entering
              ? this.simulationState.pipeEntry.targetLevelName
              : undefined,
          targetTilePosition:
            this.simulationState.pipeEntry.phase === PipeEntryPhase.Entering
              ? {
                  x: this.simulationState.pipeEntry.targetTilePosition.x,
                  y: this.simulationState.pipeEntry.targetTilePosition.y,
                }
              : undefined,
          remainingFrames:
            this.simulationState.pipeEntry.phase === PipeEntryPhase.Entering ||
            this.simulationState.pipeEntry.phase === PipeEntryPhase.Clearing
              ? this.simulationState.pipeEntry.remainingFrames
              : 0,
        },
        enemies: {
          contactedEnemyEntityIds:
            this.simulationState.enemies.contactedEnemyEntityIds.map(
              (entityId) => entityId,
            ),
          defeatedEnemyEntityIds:
            this.simulationState.enemies.defeatedEnemyEntityIds.map(
              (entityId) => entityId,
            ),
        },
        // Live enemy positions across every motion class, so a browser test
        // can time an interaction with a moving enemy (8-4's paratroopa
        // bounce onto the floating pipe needs the hop phase).
        enemyActors: [
          ...this.simulationState.enemyMotion.patrolActors,
          ...this.simulationState.enemyMotion.flyingActors,
          ...this.simulationState.enemyMotion.chasingActors,
          ...this.simulationState.enemyMotion.armoredActors,
          ...this.simulationState.enemyMotion.throwingActors,
          ...this.simulationState.enemyMotion.aerialThrowingActors,
        ].map((actor) => ({
          entityId: actor.entityId,
          x: actor.position.x,
          y: actor.position.y,
        })),
        enemyContactResponse: makeBrowserEnemyContactResponseSnapshot(
          this.simulationState.enemyContactResponse,
        ),
        lastEnemyContact: this.lastEnemyContactObservation,
        outcomeFeedback: {
          visible: this.outcomeFeedbackText.visible,
          text: this.outcomeFeedbackText.text,
        },
        actors: makeBrowserActorsSnapshot(
          this.renderedActors,
          this.renderedActorRoleCounts,
          this.simulationState,
          this.levelSpec,
        ),
        player: {
          position: {
            x: this.simulationState.players[0].player.position.x,
            y: this.simulationState.players[0].player.position.y,
          },
          velocity: {
            x: this.simulationState.players[0].player.velocity.x,
            y: this.simulationState.players[0].player.velocity.y,
          },
          collider: {
            width: this.simulationState.players[0].player.collider.width,
            height: this.simulationState.players[0].player.collider.height,
          },
          movement: {
            horizontal:
              this.simulationState.players[0].player.movement.horizontal,
            vertical: this.simulationState.players[0].player.movement.vertical,
          },
          coyoteFramesRemaining:
            this.simulationState.players[0].player.coyoteFramesRemaining,
          jumpBufferFramesRemaining:
            this.simulationState.players[0].player.jumpBufferFramesRemaining,
          jumpCutApplied: this.simulationState.players[0].player.jumpCutApplied,
          jumpTierIndex: this.simulationState.players[0].player.jumpTierIndex,
        },
        playerReaction: {
          kind: this.simulationState.players[0].reaction.kind,
          remainingFrames:
            this.simulationState.players[0].reaction.remainingFrames,
        },
        enemyStompReaction: {
          active: this.simulationState.enemyStompReaction.active,
          remainingFrames:
            this.simulationState.enemyStompReaction.remainingFrames,
          x: this.simulationState.enemyStompReaction.x,
          y: this.simulationState.enemyStompReaction.y,
        },
      }),
    };

    window.__originalBrowserPlatformerDebug = debugApi;
  }
}

type UsedBlockSwap = {
  readonly image: Phaser.GameObjects.Image;
  readonly usedImage: LoadedImageAsset;
  // The "?" stamp (shabby set), hidden once the block is spent.
  readonly glyph?: Phaser.GameObjects.Text | undefined;
};

type HiddenBlockTile = {
  readonly pixelX: number;
  readonly pixelY: number;
  readonly sizePixels: number;
};

type RenderedLevelSummary = {
  readonly renderedTileCount: number;
  readonly collisionCounts: BrowserLevelCollisionCounts;
  readonly breakableTileRenderObjects: ReadonlyMap<
    string,
    readonly Phaser.GameObjects.GameObject[]
  >;
  readonly usedBlockSwaps: ReadonlyMap<string, UsedBlockSwap>;
  readonly hiddenBlockTiles: ReadonlyMap<string, HiddenBlockTile>;
  readonly castleBridgeTilesByColumn: ReadonlyMap<
    number,
    readonly Phaser.GameObjects.GameObject[]
  >;
};

// Single-use question blocks turn into a spent/used block once bumped, like the
// original. Multi-coin bricks and other multi-dispense blocks are excluded —
// they stay active until their last item.
const singleUseQuestionBlockTileIds: ReadonlySet<string> = new Set([
  "full-question-block-coin",
  "full-question-block-power-up",
]);

// Fire the Vibration API where it exists (Android Chrome/Firefox). iOS Safari
// has no vibrate(); the guard no-ops there. Accepts a single duration or a
// pattern of on/off millisecond spans.
function vibrateHaptic(pattern: number | readonly number[]): void {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  ) {
    navigator.vibrate(pattern as number | number[]);
  }
}

// iOS Safari has no navigator.vibrate, but iOS 17.4+ fires a light haptic when a
// switch control is toggled inside a user gesture. A hidden <label><input switch>
// gives us that one legal iOS haptic — clicking the label within a touch handler
// toggles it and buzzes. A no-op on other browsers. Best-effort (never throws).
let iosHapticLabel: HTMLLabelElement | undefined;
function triggerIosHaptic(): void {
  try {
    if (typeof document === "undefined") {
      return;
    }
    if (iosHapticLabel === undefined) {
      const label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText =
        "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      label.appendChild(input);
      document.body.appendChild(label);
      iosHapticLabel = label;
    }
    iosHapticLabel.click();
  } catch {
    // Best-effort; iOS haptic is unavailable or blocked.
  }
}

// A short haptic tick on a touch-control press. Fired from the pointerdown
// gesture, so it's the one moment iOS can also buzz. 24ms is well above the
// vibration motor's spin-up so it's actually felt on Android.
function buzzTouchControl(): void {
  vibrateHaptic(24);
  triggerIosHaptic();
}

// Distinct haptic patterns per game event. Durations are kept above ~12ms: a
// phone's vibration motor needs a few milliseconds just to spin up, so shorter
// pulses (the old 6ms land tap) are imperceptible and read as "haptics don't
// work". A light tap on landing, a snappy tick on a stomp, a crunchy double
// tick when a brick shatters, a heavier triple thud on a head-bonk, a rolling
// rumble for a hard-landing quake, and a long buzz on death.
const landHapticMilliseconds = 14;
const stompHapticMilliseconds = 16;
const blockBreakHapticPattern: readonly number[] = [14, 12, 22];
const headBonkHapticPattern: readonly number[] = [22, 24, 22];
const groundQuakeHapticPattern: readonly number[] = [30, 25, 45, 25, 30];
const deathHapticPattern: readonly number[] = [60, 45, 90];

// The touch deck can be scaled to taste (thumb size / screen size) and the
// choice persists. The scale drives both the panel width and — via the `--ctl`
// custom property the buttons read — the button sizes.
const touchControlScales = [0.85, 1, 1.2] as const;
const touchControlScaleStorageKey = "regular-mario:touch-control-scale";

function readTouchControlScale(): number {
  try {
    const stored = Number(
      window.localStorage.getItem(touchControlScaleStorageKey),
    );
    return (touchControlScales as readonly number[]).includes(stored)
      ? stored
      : 1;
  } catch {
    return 1;
  }
}

function writeTouchControlScale(scale: number): void {
  try {
    window.localStorage.setItem(touchControlScaleStorageKey, String(scale));
  } catch {
    // Private-mode / storage-disabled: the scale just won't persist.
  }
}

function applyTouchControlScale(panel: HTMLElement, scale: number): void {
  panel.style.flexBasis = `min(${(32 * scale).toFixed(1)}vw,${Math.round(
    176 * scale,
  )}px)`;
  panel.style.setProperty("--ctl", String(scale));
}

// A full-height panel that flanks the canvas (left or right) and hosts one half
// of the touch deck, anchored to the bottom where the thumb rests. Styled like
// the grey shell of a classic console pad, with the accent edge facing the game.
function makeTouchSidePanel(
  side: "left" | "right",
  scale: number,
): HTMLDivElement {
  const panel = document.createElement("div");
  panel.setAttribute("data-role", `touch-control-${side}`);
  const safeInset =
    side === "left"
      ? "env(safe-area-inset-left)"
      : "env(safe-area-inset-right)";
  panel.style.cssText =
    "flex-grow:0;flex-shrink:0;height:100%;box-sizing:border-box;" +
    "display:flex;flex-direction:column;justify-content:flex-end;" +
    "align-items:center;gap:14px;" +
    `padding:12px max(10px,${safeInset}) max(16px,env(safe-area-inset-bottom));` +
    "background:linear-gradient(#c9c9c9,#9c9c9c);" +
    `border-${side === "left" ? "right" : "left"}:3px solid #6a1b1b;` +
    "font-family:monospace;touch-action:none;user-select:none;" +
    // Kill the iOS long-press callout and the grey tap-highlight flash.
    "-webkit-user-select:none;-webkit-touch-callout:none;" +
    "-webkit-tap-highlight-color:transparent;";
  applyTouchControlScale(panel, scale);
  return panel;
}

type NesControlDeck = {
  // The two clusters, one per side panel.
  readonly dpad: HTMLElement;
  readonly actions: HTMLElement;
  readonly dpadUp: HTMLElement;
  readonly dpadDown: HTMLElement;
  readonly dpadLeft: HTMLElement;
  readonly dpadRight: HTMLElement;
  readonly buttonA: HTMLElement;
  readonly buttonB: HTMLElement;
  readonly buttonStart: HTMLElement;
};

// A classic controller face split across the two flanking panels: the black
// cross D-pad (left) and the SELECT/START pills over the round red B/A buttons
// (right). Sizes are panel-relative (px caps) so the cross fits a narrow panel.
function buildNesControlDeck(): NesControlDeck {
  // Sizes scale with the panel's `--ctl` custom property (the user's size
  // choice), on top of the responsive min(vw, px-cap).
  // --- D-pad (a 3×3 grid; only the plus-shaped arms are buttons) ---
  const arm = "calc(min(14vw,48px) * var(--ctl, 1))";
  const dpad = document.createElement("div");
  dpad.style.cssText =
    `display:grid;grid-template-columns:repeat(3,${arm});` +
    `grid-template-rows:repeat(3,${arm});`;
  const makeArm = (
    label: string,
    ariaLabel: string,
    column: number,
    row: number,
    radius: string,
  ): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    button.style.cssText =
      `grid-column:${String(column)};grid-row:${String(row)};` +
      "background:#1b1b1b;color:#e8e8e8;border:none;touch-action:none;" +
      `border-radius:${radius};` +
      "font:700 calc(min(4vw,16px) * var(--ctl, 1)) monospace;" +
      "display:flex;align-items:center;justify-content:center;";
    return button;
  };
  const dpadUp = makeArm("▲", "touch-up", 2, 1, "6px 6px 0 0");
  const dpadLeft = makeArm("◀", "touch-left", 1, 2, "6px 0 0 6px");
  const hub = makeArm("", "touch-dpad-center", 2, 2, "0");
  hub.disabled = true;
  const dpadRight = makeArm("▶", "touch-right", 3, 2, "0 6px 6px 0");
  const dpadDown = makeArm("▼", "touch-down", 2, 3, "0 0 6px 6px");
  dpad.append(dpadUp, dpadLeft, hub, dpadRight, dpadDown);

  // --- Right cluster: SELECT/START pills over the round B/A buttons ---
  const actions = document.createElement("div");
  actions.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:14px;";

  const pillGroup = document.createElement("div");
  pillGroup.style.cssText = "display:flex;gap:8px;";
  const makePill = (label: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", `touch-${label.toLowerCase()}`);
    button.style.cssText =
      "width:calc(min(15vw,60px) * var(--ctl, 1));" +
      "height:calc(min(4.5vw,18px) * var(--ctl, 1));border-radius:9px;" +
      "background:#2a2a2a;color:#cfcfcf;border:2px solid #555;touch-action:none;" +
      "font:700 calc(min(2.4vw,9px) * var(--ctl, 1)) monospace;letter-spacing:1px;";
    return button;
  };
  const buttonSelect = makePill("SELECT");
  const buttonStart = makePill("START");
  pillGroup.append(buttonSelect, buttonStart);

  const abGroup = document.createElement("div");
  abGroup.style.cssText =
    "display:flex;align-items:flex-end;gap:calc(min(4vw,14px) * var(--ctl, 1));";
  const makeRound = (label: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", `touch-${label}`);
    button.style.cssText =
      "width:calc(min(15vw,58px) * var(--ctl, 1));" +
      "height:calc(min(15vw,58px) * var(--ctl, 1));border-radius:50%;" +
      "background:radial-gradient(circle at 38% 32%,#e64b4b,#b21414);" +
      "color:#fff;border:3px solid #7a0f0f;touch-action:none;" +
      "font:800 calc(min(6vw,22px) * var(--ctl, 1)) monospace;";
    return button;
  };
  // B left of A (the NES A/B row); A raised, where the thumb rests.
  const buttonB = makeRound("B");
  const buttonA = makeRound("A");
  buttonA.style.marginBottom = "calc(min(5vw,18px) * var(--ctl, 1))";
  abGroup.append(buttonB, buttonA);

  actions.append(pillGroup, abGroup);

  return {
    dpad,
    actions,
    dpadUp,
    dpadDown,
    dpadLeft,
    dpadRight,
    buttonA,
    buttonB,
    buttonStart,
  };
}

function makeLevelWorldWidthPixels(levelSpec: LevelSpec): number {
  return levelSpec.widthTiles * levelSpec.tileSizePixels;
}

function makeLevelWorldHeightPixels(levelSpec: LevelSpec): number {
  return levelSpec.heightTiles * levelSpec.tileSizePixels;
}

function configureMainCamera(
  camera: Phaser.Cameras.Scene2D.Camera,
  levelSpec: LevelSpec,
  playerRectangle: Phaser.GameObjects.Rectangle,
): void {
  camera.setBounds(
    0,
    0,
    makeLevelWorldWidthPixels(levelSpec),
    makeLevelWorldHeightPixels(levelSpec),
  );
  // Round the camera scroll to whole pixels so world objects (which render with
  // roundPixels) don't jitter ±1px as a fractional scroll rounds differently
  // each frame. Follow horizontally fairly tightly, like the original.
  camera.startFollow(playerRectangle, true, 0.2, 0.12);
  camera.setDeadzone(80, 40);
}

// Water world backdrop: seaweed fronds rising from the seabed and slow bubbles
// drifting upward, each layer on its own parallax rate.
// World-Y of the water surface: the top of the playfield, which is grid row 2
// (the top two rows are reserved for the HUD overlay). The simulation's swim
// clamp keeps the player at/below this same line — a jagged white waterline.
const waterSurfaceHudRows = 2;
const waterSurfaceTileSizePixels = 16;
const waterSurfaceY = waterSurfaceHudRows * waterSurfaceTileSizePixels;

function renderWaterParallax(
  scene: Phaser.Scene,
  worldWidth: number,
  groundY: number,
): void {
  const seaweedColor = 0x0e8f7a;
  const bubbleColor = 0xbdf0ff;

  // Rolling, shimmering waterline: two overlapping sine swells (a deeper back
  // swell and a bright foam crest) that gently sway, plus twinkling highlights,
  // instead of a row of static triangle teeth.
  renderWaterSurface(scene, worldWidth);
  for (let i = 60; i < worldWidth; i += 150) {
    const fronds = 3 + ((i * 7) % 3);
    const lean = (i * 13) % 2 === 0 ? -3 : 3;
    for (let s = 0; s < fronds; s += 1) {
      scene.add
        .ellipse(
          i + (s % 2 === 0 ? lean : -lean),
          groundY - s * 12 - 6,
          11,
          18,
          seaweedColor,
        )
        .setScrollFactor(0.85, 1)
        .setDepth(-80);
    }
  }
  for (let i = 30; i < worldWidth; i += 70) {
    scene.add
      .circle(
        i,
        groundY - 40 - ((i * 17) % 160),
        3 + ((i * 5) % 4),
        bubbleColor,
        0.55,
      )
      .setScrollFactor(0.6, 1)
      .setDepth(-85);
  }
}

// Draw one filled sine swell across the level: a smooth crest at `crestY` with
// the given amplitude/wavelength, filled down to `fillBottomY`.
function fillWaveBand(
  graphics: Phaser.GameObjects.Graphics,
  worldWidth: number,
  crestY: number,
  amplitude: number,
  wavelength: number,
  phase: number,
  fillBottomY: number,
): void {
  const step = 4;
  graphics.beginPath();
  graphics.moveTo(0, fillBottomY);
  for (let x = 0; x <= worldWidth; x += step) {
    const y = crestY + Math.sin(x / wavelength + phase) * amplitude;
    graphics.lineTo(x, y);
  }
  graphics.lineTo(worldWidth, fillBottomY);
  graphics.closePath();
  graphics.fillPath();
}

// A realistic, animated water surface: a translucent back swell, a bright foam
// crest, and drifting twinkling highlights, all gently swaying.
function renderWaterSurface(scene: Phaser.Scene, worldWidth: number): void {
  const crestY = waterSurfaceY + 4;
  const fillBottomY = waterSurfaceY + 14;

  // Deeper back swell — a soft translucent aqua band under the foam.
  const backSwell = scene.add.graphics().setScrollFactor(1, 1).setDepth(-72);
  backSwell.fillStyle(0x7fd4ff, 0.55);
  fillWaveBand(backSwell, worldWidth, crestY + 2, 3, 34, 1.2, fillBottomY);

  // Bright foam crest on top.
  const crest = scene.add.graphics().setScrollFactor(1, 1).setDepth(-70);
  crest.fillStyle(0xffffff, 0.95);
  fillWaveBand(crest, worldWidth, crestY, 2.4, 26, 0, fillBottomY - 4);

  // Sway the swells side to side and up a touch, so the waves visibly roll.
  scene.tweens.add({
    targets: [backSwell, crest],
    x: { from: -4, to: 4 },
    y: { from: -1.2, to: 1.2 },
    duration: 2600,
    yoyo: true,
    repeat: -1,
    ease: "Sine.InOut",
  });

  // Twinkling specular highlights that drift along the surface and fade in/out.
  for (let x = 20; x < worldWidth; x += 46) {
    const glint = scene.add
      .ellipse(x, crestY - 1, 5 + ((x * 3) % 4), 2, 0xffffff, 0.9)
      .setScrollFactor(1, 1)
      .setDepth(-69);
    scene.tweens.add({
      targets: glint,
      alpha: { from: 0.15, to: 0.9 },
      scaleX: { from: 0.6, to: 1.3 },
      duration: 700 + ((x * 37) % 900),
      delay: (x * 53) % 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }
}

function renderParallaxBackground(
  scene: Phaser.Scene,
  levelSpec: LevelSpec,
  theme: LevelTheme | undefined,
): void {
  const worldWidth = makeLevelWorldWidthPixels(levelSpec);
  const worldHeight = makeLevelWorldHeightPixels(levelSpec);
  const resolvedTheme: LevelTheme = theme ?? "overworld";

  // Full-world backdrop in the theme's sky colour (empty cells no longer paint
  // an opaque sky tile, so this and the parallax layers below show through).
  scene.add
    .rectangle(0, 0, worldWidth, worldHeight, themePalettes[resolvedTheme].sky)
    .setOrigin(0)
    .setScrollFactor(0)
    .setDepth(-100);

  const groundY = worldHeight - levelSpec.tileSizePixels;

  // Underground and castle are a plain dark void in the original — no decoration.
  if (resolvedTheme === "underground" || resolvedTheme === "castle") {
    return;
  }

  if (resolvedTheme === "water") {
    renderWaterParallax(scene, worldWidth, groundY);
    return;
  }

  // A three-lobe mound (cloud / hill / bush share this silhouette in the
  // original). `flatBaseY` is the flat bottom edge; lobes rise above it.
  const addMound = (
    cx: number,
    flatBaseY: number,
    scale: number,
    color: number,
    scroll: number,
    depth: number,
    dots: boolean,
  ): void => {
    const r = Math.round(9 * scale);
    for (const [dx, lobe] of [
      [-2 * r, r],
      [0, Math.round(r * 1.4)],
      [2 * r, r],
    ] as const) {
      scene.add
        .ellipse(cx + dx, flatBaseY - lobe, lobe * 2, lobe * 2, color)
        .setScrollFactor(scroll, 1)
        .setDepth(depth);
    }
    scene.add
      .rectangle(cx, flatBaseY - r, 5 * r, r, color)
      .setOrigin(0.5, 0)
      .setScrollFactor(scroll, 1)
      .setDepth(depth);
    if (dots) {
      // Two-tone body: a darker band across the hill's lower portion, as in the
      // original's shaded hills.
      scene.add
        .rectangle(
          cx,
          flatBaseY - Math.round(r * 0.5),
          5 * r,
          Math.round(r * 0.5),
          parallaxHillShadeColor,
        )
        .setOrigin(0.5, 0)
        .setScrollFactor(scroll, 1)
        .setDepth(depth);
      // Darker scalloped "feet" along the base give the original's hills their
      // two-tone footed silhouette.
      const footRadius = Math.round(r * 0.5);
      for (const dx of [-2 * r, 0, 2 * r]) {
        scene.add
          .ellipse(
            cx + dx,
            flatBaseY,
            footRadius * 2,
            footRadius * 2,
            parallaxHillShadeColor,
          )
          .setScrollFactor(scroll, 1)
          .setDepth(depth);
      }
      // The two dark "eye" dots that give the original's hills their face.
      for (const dx of [-Math.round(r * 0.6), Math.round(r * 0.6)]) {
        scene.add
          .ellipse(cx + dx, flatBaseY - r, 4, 4, parallaxHillDotColor)
          .setScrollFactor(scroll, 1)
          .setDepth(depth + 1);
      }
    }
  };

  // Distant hills sit just above the horizon, slow parallax, faded green.
  for (let i = 40; i < worldWidth; i += 176) {
    addMound(i, groundY, 1.3, parallaxDistantHillColor, 0.5, -90, false);
  }
  // Near hills with the face dots.
  for (let i = 120; i < worldWidth; i += 176) {
    addMound(i, groundY, 0.9, parallaxHillColor, 0.75, -85, true);
  }
  // Bushes sit on the ground plane and scroll almost with it.
  for (let i = 80; i < worldWidth; i += 128) {
    addMound(i, groundY, 0.6, parallaxBushColor, 0.9, -60, false);
  }
  // Flat-bottomed clouds drifting slowly overhead, up in the sky.
  const cloudY = groundY - 120 - ((levelSpec.widthTiles * 3) % 24);
  for (let i = 20; i < worldWidth; i += 176) {
    addMound(
      i,
      cloudY + ((i * 11) % 24),
      0.9,
      parallaxCloudColor,
      0.35,
      -70,
      false,
    );
  }
}

function makeBrowserCameraSnapshot(
  camera: Phaser.Cameras.Scene2D.Camera,
  levelSpec: LevelSpec,
): BrowserSimulationSnapshot["camera"] {
  return {
    scrollX: camera.scrollX,
    scrollY: camera.scrollY,
    viewportWidthPixels: camera.width,
    viewportHeightPixels: camera.height,
    worldWidthPixels: makeLevelWorldWidthPixels(levelSpec),
    worldHeightPixels: makeLevelWorldHeightPixels(levelSpec),
    zoom: camera.zoom,
    worldViewX: camera.worldView.x,
    worldViewY: camera.worldView.y,
  };
}

type MutableLevelCollisionCounts = {
  [TileCollisionKind.Empty]: number;
  [TileCollisionKind.Solid]: number;
  [TileCollisionKind.Interactive]: number;
  [TileCollisionKind.Breakable]: number;
  [TileCollisionKind.SolidHazard]: number;
  [TileCollisionKind.Hazard]: number;
  [TileCollisionKind.Spring]: number;
  [TileCollisionKind.Goal]: number;
  [TileCollisionKind.Hidden]: number;
};

type MutableRenderedActorRoleCounts = {
  [ActorRole.Enemy]: number;
  [ActorRole.FlyingEnemy]: number;
  [ActorRole.ChasingEnemy]: number;
  [ActorRole.ArmoredEnemy]: number;
  [ActorRole.ThrowingEnemy]: number;
  [ActorRole.AerialThrowingEnemy]: number;
  [ActorRole.PiranhaPlant]: number;
  [ActorRole.Coin]: number;
  [ActorRole.Item]: number;
  [ActorRole.PowerUp]: number;
  [ActorRole.ExtraLife]: number;
  [ActorRole.InvincibilityPowerUp]: number;
  [ActorRole.Climbable]: number;
  [ActorRole.Exit]: number;
};

type RenderedActorSummarySet = {
  readonly actors: readonly RuntimeRenderedActor[];
  readonly roleCounts: BrowserRenderedActorRoleCounts;
};

type RuntimeRenderedActor = BrowserRenderedActorSnapshot & {
  readonly renderObject: Phaser.GameObjects.Container;
  readonly userImageObject: Phaser.GameObjects.Image | undefined;
  readonly userImage: LoadedStatefulImageAsset | undefined;
  // Fallback-shape wing marker for winged armored enemies (sprite sets carry
  // their own winged frames instead).
  readonly wingObject: Phaser.GameObjects.Triangle | undefined;
};

function makeEmptyCollisionCounts(): MutableLevelCollisionCounts {
  return {
    empty: 0,
    solid: 0,
    interactive: 0,
    breakable: 0,
    "solid-hazard": 0,
    hazard: 0,
    spring: 0,
    goal: 0,
    hidden: 0,
  };
}

function makeBrowserPlayerOutcomeSnapshot(
  playerOutcome: SimulationState["players"][0]["outcome"],
): BrowserSimulationSnapshot["playerOutcome"] {
  switch (playerOutcome.kind) {
    case PlayerOutcomeKind.Active:
      return {
        kind: PlayerOutcomeKind.Active,
      };
    case PlayerOutcomeKind.Defeated:
      return {
        kind: PlayerOutcomeKind.Defeated,
        reason: playerOutcome.reason,
      };
    case PlayerOutcomeKind.Finished:
      return {
        kind: PlayerOutcomeKind.Finished,
        reason: playerOutcome.reason,
      };
    case PlayerOutcomeKind.DefeatedAndFinished:
      return {
        kind: PlayerOutcomeKind.DefeatedAndFinished,
        defeatReason: playerOutcome.defeatReason,
        finishReason: playerOutcome.finishReason,
      };
    default: {
      const invalidOutcome: never = playerOutcome;
      throw new Error(
        `Invalid player outcome state: ${String(invalidOutcome)}`,
      );
    }
  }
}

function makeBrowserPlayerVitalitySnapshot(
  playerVitality: SimulationState["players"][0]["vitality"],
): BrowserSimulationSnapshot["playerVitality"] {
  assertValidPlayerVitalityState(playerVitality);

  switch (playerVitality.kind) {
    case PlayerVitalityKind.Small:
      return {
        kind: PlayerVitalityKind.Small,
      };
    case PlayerVitalityKind.Powered:
      return {
        kind: PlayerVitalityKind.Powered,
      };
    case PlayerVitalityKind.Fire:
      return {
        kind: PlayerVitalityKind.Fire,
      };
    case PlayerVitalityKind.Recovering:
      return {
        kind: PlayerVitalityKind.Recovering,
        sourceEnemyEntityId: playerVitality.sourceEnemyEntityId,
        contactSide: playerVitality.contactSide,
        startFrameIndex: playerVitality.startFrameIndex,
        remainingKnockbackFrames: playerVitality.remainingKnockbackFrames,
        remainingInvulnerabilityFrames:
          playerVitality.remainingInvulnerabilityFrames,
      };
    default: {
      const invalidVitality: never = playerVitality;
      throw new Error(
        `Invalid player vitality state: ${String(invalidVitality)}`,
      );
    }
  }
}

function makeBrowserEnemyContactResponseSnapshot(
  enemyContactResponse: SimulationState["enemyContactResponse"],
): BrowserSimulationSnapshot["enemyContactResponse"] {
  switch (enemyContactResponse.kind) {
    case EnemyContactResponseKind.None:
      return {
        kind: EnemyContactResponseKind.None,
      };
    case EnemyContactResponseKind.SideContact:
      return {
        kind: EnemyContactResponseKind.SideContact,
        enemyEntityId: enemyContactResponse.enemyEntityId,
        contactSide: enemyContactResponse.contactSide,
        frameIndex: enemyContactResponse.frameIndex,
        velocity: {
          x: enemyContactResponse.velocity.x,
        },
      };
    default: {
      const invalidResponse: never = enemyContactResponse;
      throw new Error(
        `Invalid enemy contact response: ${String(invalidResponse)}`,
      );
    }
  }
}

function classicCompatibilityHudText(
  score: number,
  remainingFrames: number | undefined,
  coinCount: number,
  worldLevel: string,
): string {
  const scoreText = String(score).padStart(6, "0");
  const coinText = String(coinCount).padStart(2, "0");
  const timeText =
    remainingFrames === undefined
      ? "---"
      : String(
          Math.floor(remainingFrames / timeBonusFramesPerDisplayUnit),
        ).padStart(3, "0");
  const world = worldLevel.padEnd(3, " ");

  return `MARIO  \xD7${coinText}  WORLD  TIME\n${scoreText}         ${world}  ${timeText}`;
}

// Extracts the "W-L" label from a decoded level name like "smb-6-2".
// Warp targets at or before this column count as a level start (world jump).
const mainLevelStartTileX = 2;

function worldLevelLabelFor(levelVisualName: string | undefined): string {
  const match = /(\d+-\d+)/.exec(levelVisualName ?? "");
  return match?.[1] ?? "1-1";
}

function makeOutcomeFeedbackText(
  playerOutcome: SimulationState["players"][0]["outcome"],
): string {
  switch (playerOutcome.kind) {
    case PlayerOutcomeKind.Active:
      return activeOutcomeFeedbackText;
    case PlayerOutcomeKind.Defeated:
      return makeDefeatedOutcomeFeedbackText(playerOutcome.reason);
    case PlayerOutcomeKind.Finished:
      return finishedOutcomeFeedbackText;
    case PlayerOutcomeKind.DefeatedAndFinished:
      return simultaneousOutcomeFeedbackText;
    default: {
      const invalidOutcome: never = playerOutcome;
      throw new Error(
        `Invalid player outcome state: ${String(invalidOutcome)}`,
      );
    }
  }
}

function makeDefeatedOutcomeFeedbackText(
  defeatReason: PlayerDefeatReason,
): string {
  switch (defeatReason) {
    case PlayerDefeatReason.HazardContact:
      return hazardDefeatedOutcomeFeedbackText;
    case PlayerDefeatReason.EnemyContact:
      return enemyDefeatedOutcomeFeedbackText;
    case PlayerDefeatReason.HazardAndEnemyContact:
      return hazardAndEnemyDefeatedOutcomeFeedbackText;
    case PlayerDefeatReason.PitContact:
      return pitDefeatedOutcomeFeedbackText;
    case PlayerDefeatReason.TimeUp:
      return timeUpDefeatedOutcomeFeedbackText;
    default: {
      const invalidDefeatReason: never = defeatReason;
      throw new Error(
        `Invalid defeated outcome reason: ${String(invalidDefeatReason)}`,
      );
    }
  }
}

function makeEmptyRenderedActorRoleCounts(): MutableRenderedActorRoleCounts {
  return {
    [ActorRole.Enemy]: 0,
    [ActorRole.FlyingEnemy]: 0,
    [ActorRole.ChasingEnemy]: 0,
    [ActorRole.ArmoredEnemy]: 0,
    [ActorRole.ThrowingEnemy]: 0,
    [ActorRole.AerialThrowingEnemy]: 0,
    [ActorRole.PiranhaPlant]: 0,
    [ActorRole.Coin]: 0,
    [ActorRole.Item]: 0,
    [ActorRole.PowerUp]: 0,
    [ActorRole.ExtraLife]: 0,
    [ActorRole.InvincibilityPowerUp]: 0,
    [ActorRole.Climbable]: 0,
    [ActorRole.Exit]: 0,
  };
}

function makeTileCollisionLookup(
  levelSpec: LevelSpec,
): ReadonlyMap<string, BrowserLevelCollisionKind> {
  const lookup = new Map<string, BrowserLevelCollisionKind>();

  for (const tileDefinition of levelSpec.tileDefinitions) {
    lookup.set(tileDefinition.tileId, tileDefinition.collision);
  }

  return lookup;
}

function requireTileCollision(
  lookup: ReadonlyMap<string, BrowserLevelCollisionKind>,
  tileId: string,
): BrowserLevelCollisionKind {
  const collision = lookup.get(tileId);

  if (collision === undefined) {
    throw new Error("Validated level tile is missing a tile definition.");
  }

  return collision;
}

function makeActorRoleLookup(
  levelSpec: LevelSpec,
): ReadonlyMap<string, BrowserActorRole> {
  const lookup = new Map<string, BrowserActorRole>();

  for (const actorDefinition of levelSpec.actorDefinitions) {
    lookup.set(actorDefinition.actorId, actorDefinition.role);
  }

  return lookup;
}

function requireActorRole(
  lookup: ReadonlyMap<string, BrowserActorRole>,
  actorId: string,
): BrowserActorRole {
  const role = lookup.get(actorId);

  if (role === undefined) {
    throw new Error("Validated level actor is missing an actor definition.");
  }

  return role;
}

function isRenderedActorRole(
  role: BrowserActorRole,
): role is BrowserRenderedActorRole {
  return role !== ActorRole.PlayerStart && role !== ActorRole.Pipe;
}

function renderLevelTiles(
  scene: Phaser.Scene,
  levelSpec: LevelSpec,
  userAssetBundle: UserAssetBundle | undefined,
  suppressTileArt: boolean,
): RenderedLevelSummary {
  const collisionLookup = makeTileCollisionLookup(levelSpec);
  const collisionCounts = makeEmptyCollisionCounts();
  const castleBridgeTilesByColumn = new Map<
    number,
    readonly Phaser.GameObjects.GameObject[]
  >();
  const breakableTileRenderObjects = new Map<
    string,
    readonly Phaser.GameObjects.GameObject[]
  >();
  const usedBlockSwaps = new Map<string, UsedBlockSwap>();
  const usedBlockImage = userAssetBundle?.tileImages.get(
    "empty-question-block",
  );
  // Hidden blocks are drawn nothing until bumped; remember where they are so a
  // solid block can be materialised when they are revealed.
  const hiddenBlockTiles = new Map<string, HiddenBlockTile>();
  let renderedTileCount = 0;

  for (const [rowIndex, row] of levelSpec.tiles.entries()) {
    for (const [columnIndex, tileId] of row.entries()) {
      const collision = requireTileCollision(collisionLookup, tileId);
      const userImage = userAssetBundle?.tileImages.get(tileId);
      const childrenBeforeTileRender = new Set(scene.children.list);

      if (collision === TileCollisionKind.Hidden) {
        // Invisible until bumped — record its position and render no art now.
        // A hidden block that displaced background scenery in the single-layer
        // grid must not punch a sky-colored hole in it: continue the
        // neighboring scenery art behind the invisible cell.
        if (!suppressTileArt) {
          const neighborSceneryId = [
            row[columnIndex - 1],
            row[columnIndex + 1],
          ].find(
            (candidate) =>
              candidate !== undefined &&
              decorativeSceneryTileIds.has(candidate),
          );
          if (neighborSceneryId !== undefined) {
            const sceneryImage =
              userAssetBundle?.tileImages.get(neighborSceneryId);
            if (sceneryImage !== undefined) {
              renderUserTileImage(
                scene,
                columnIndex * levelSpec.tileSizePixels,
                rowIndex * levelSpec.tileSizePixels,
                sceneryImage,
              );
            } else {
              renderDecorativeSceneryTile(
                scene,
                columnIndex * levelSpec.tileSizePixels,
                rowIndex * levelSpec.tileSizePixels,
                levelSpec.tileSizePixels,
                neighborSceneryId,
              );
            }
          }
        }
        hiddenBlockTiles.set(makeTileRenderKey(columnIndex, rowIndex), {
          pixelX: columnIndex * levelSpec.tileSizePixels,
          pixelY: rowIndex * levelSpec.tileSizePixels,
          sizePixels: levelSpec.tileSizePixels,
        });
      } else if (suppressTileArt) {
        // Collision/debug accounting still comes from LevelSpec. A full-level
        // visual layer supplies the imported level art for this mode.
      } else if (userImage !== undefined) {
        const tileImage = renderUserTileImage(
          scene,
          columnIndex * levelSpec.tileSizePixels,
          rowIndex * levelSpec.tileSizePixels,
          userImage,
        );
        const questionGlyph = tileShowsQuestionGlyph(tileId)
          ? renderQuestionBlockGlyph(
              scene,
              columnIndex * levelSpec.tileSizePixels,
              rowIndex * levelSpec.tileSizePixels,
              levelSpec.tileSizePixels,
            )
          : undefined;
        if (
          singleUseQuestionBlockTileIds.has(tileId) &&
          usedBlockImage !== undefined
        ) {
          usedBlockSwaps.set(makeTileRenderKey(columnIndex, rowIndex), {
            image: tileImage,
            usedImage: usedBlockImage,
            glyph: questionGlyph,
          });
        }
      } else {
        renderAuthoredTile(
          scene,
          columnIndex * levelSpec.tileSizePixels,
          rowIndex * levelSpec.tileSizePixels,
          levelSpec.tileSizePixels,
          tileId,
          collision,
        );
      }

      if (collision === TileCollisionKind.Breakable) {
        breakableTileRenderObjects.set(
          makeTileRenderKey(columnIndex, rowIndex),
          scene.children.list.filter(
            (child) => !childrenBeforeTileRender.has(child),
          ),
        );
      }

      // Castle-bridge planks are tracked per column so the castle-clear
      // cinematic can chop them away one by one.
      if (tileId === castleBridgeTileId) {
        castleBridgeTilesByColumn.set(
          columnIndex,
          scene.children.list.filter(
            (child) => !childrenBeforeTileRender.has(child),
          ),
        );
      }

      collisionCounts[collision] += 1;
      renderedTileCount += 1;
    }
  }

  if (!suppressTileArt) {
    renderPipeMouths(scene, levelSpec);
  }

  return {
    renderedTileCount,
    collisionCounts,
    breakableTileRenderObjects,
    usedBlockSwaps,
    hiddenBlockTiles,
    castleBridgeTilesByColumn,
  };
}

function resolveLevelVisual(
  userAssetBundle: UserAssetBundle | undefined,
  userLevelVisualName: string | undefined,
): LoadedLevelVisualAsset | undefined {
  if (userAssetBundle === undefined || userLevelVisualName === undefined) {
    return undefined;
  }

  return userAssetBundle.levelVisualImages.get(userLevelVisualName);
}

function renderLevelVisual(
  scene: Phaser.Scene,
  levelVisual: LoadedLevelVisualAsset,
): void {
  addUserFrameImage(
    scene,
    levelVisual.offsetX,
    levelVisual.offsetY,
    levelVisual,
  );

  for (const eraseRect of levelVisual.eraseRects) {
    scene.add
      .rectangle(
        levelVisual.offsetX + eraseRect.x,
        levelVisual.offsetY + eraseRect.y,
        eraseRect.width,
        eraseRect.height,
        makeRgbColor(
          eraseRect.fill.red,
          eraseRect.fill.green,
          eraseRect.fill.blue,
        ),
      )
      .setOrigin(0);
  }
}

function makeRgbColor(red: number, green: number, blue: number): number {
  return (red << 16) + (green << 8) + blue;
}

function resolvePlayerSpriteImage(
  playerImage: LoadedStatefulImageAsset | undefined,
  simulationState: SimulationState,
  theme: LevelTheme | undefined,
  character: PlayerCharacter,
  burning = false,
): LoadedImageAsset | undefined {
  if (playerImage === undefined) {
    return undefined;
  }

  const vitalityPrefix = makePlayerSpriteVitalityPrefix(
    simulationState.players[0].vitality.kind,
  );
  // Fire art is optional in a sprite set; fall back to powered, then bare.
  const prefixes =
    vitalityPrefix === "fire" ? ["fire", "powered"] : [vitalityPrefix];
  const action = burning
    ? "burning"
    : makePlayerSpriteAction(
        simulationState.players[0].player.movement,
        theme,
        simulationState.players[0].player.crouching === true,
      );

  // The merman's swim stroke (arms + tail flick) only animates while he is
  // actually moving through the water; drifting still holds the first frame.
  // Each frame falls back to the other swim frame, then the jump pose for sets
  // without dedicated swim art.
  const player = simulationState.players[0].player;
  const moving =
    Math.abs(player.velocity.x) > 6 || Math.abs(player.velocity.y) > 6;
  const swimStroke =
    moving && Math.floor(simulationState.clock.frameIndex / 9) % 2 === 1
      ? "swim-2"
      : "swim";
  const candidates =
    action === "swim"
      ? [
          ...prefixes.map((prefix) => `${prefix}-${swimStroke}`),
          swimStroke,
          ...prefixes.map((prefix) => `${prefix}-swim`),
          "swim",
          ...prefixes.map((prefix) => `${prefix}-jump`),
          "jump",
        ]
      : action === "crouch"
        ? [
            // A skin without a dedicated duck pose falls back to its idle frame.
            ...prefixes.map((prefix) => `${prefix}-crouch`),
            ...prefixes.map((prefix) => `${prefix}-idle`),
            "idle",
          ]
        : action === "burning"
          ? (() => {
              // On-fire art (god mode on lava): two flame phases flicker
              // (~10Hz); sets without the art show the idle frame — the
              // sizzle still tells the story.
              const phase =
                Math.floor(simulationState.clock.frameIndex / 6) % 2 === 0
                  ? "burning-1"
                  : "burning-2";
              return [
                ...prefixes.map((prefix) => `${prefix}-${phase}`),
                phase,
                ...prefixes.map((prefix) => `${prefix}-idle`),
                "idle",
              ];
            })()
          : [...prefixes.map((prefix) => `${prefix}-${action}`), action];

  return resolveFirstStatefulImage(
    playerImage,
    applyCharacterToCandidates(candidates, character),
  );
}

function makePlayerSpriteVitalityPrefix(vitality: PlayerVitalityKind): string {
  switch (vitality) {
    case PlayerVitalityKind.Small:
      return "small";
    case PlayerVitalityKind.Powered:
      return "powered";
    case PlayerVitalityKind.Fire:
      // Fire tier art when the skin provides it; the candidate chain falls
      // back to the enlarged (powered) sprites for sets without it.
      return "fire";
    case PlayerVitalityKind.Recovering:
      return "recovering";
    default: {
      const invalidVitality: never = vitality;
      throw new Error(
        `Invalid player vitality kind: ${String(invalidVitality)}`,
      );
    }
  }
}

function makePlayerSpriteAction(
  movement: {
    readonly horizontal: HorizontalMovementState;
    readonly vertical: VerticalMovementState;
  },
  theme: LevelTheme | undefined,
  crouching: boolean,
): string {
  // Ducking big Mario has its own pose (grounded only); water swims through it.
  if (
    crouching &&
    movement.vertical === VerticalMovementState.Grounded &&
    theme !== "water"
  ) {
    return "crouch";
  }
  // In the water world our castaway is a merman: he swims through every pose
  // (tail, not legs), so anything but climbing a vine reads as a swim.
  if (
    theme === "water" &&
    movement.vertical !== VerticalMovementState.Climbing
  ) {
    return "swim";
  }

  switch (movement.vertical) {
    case VerticalMovementState.Jumping:
      return "jump";
    case VerticalMovementState.Falling:
      return "fall";
    case VerticalMovementState.Climbing:
      return "climb";
    case VerticalMovementState.Grounded:
      break;
    default: {
      const invalidVertical: never = movement.vertical;
      throw new Error(
        `Invalid player vertical movement state: ${String(invalidVertical)}`,
      );
    }
  }

  switch (movement.horizontal) {
    case HorizontalMovementState.Idle:
      return "idle";
    case HorizontalMovementState.Walking:
      return "walk";
    case HorizontalMovementState.Running:
      return "run";
    default: {
      const invalidHorizontal: never = movement.horizontal;
      throw new Error(
        `Invalid player horizontal movement state: ${String(invalidHorizontal)}`,
      );
    }
  }
}

function resolveActorSpriteImage(
  actor: RuntimeRenderedActor,
  simulationState: SimulationState,
): LoadedImageAsset | undefined {
  if (actor.userImage === undefined || !isRenderedEnemyRole(actor.role)) {
    return actor.userImage;
  }

  if (actor.role === ActorRole.ArmoredEnemy) {
    const armoredActor = requireArmoredEnemyActorState(
      simulationState.enemyMotion,
      actor.entityId,
    );

    if (armoredActor.behavior === ArmoredEnemyBehavior.Shell) {
      const shellDirection = makeSpriteDirectionFromVelocity(
        armoredActor.velocity.x,
      );

      return resolveFirstStatefulImage(actor.userImage, [
        shellDirection === "idle" ? "shell-idle" : `shell-${shellDirection}`,
        "shell",
      ]);
    }

    if (armoredActor.behavior === ArmoredEnemyBehavior.Winged) {
      const wingedDirection = makeSpriteDirectionFromVelocity(
        armoredActor.velocity.x,
      );
      return resolveFirstStatefulImage(actor.userImage, [
        `winged-${wingedDirection}`,
        "winged",
        `walk-${wingedDirection}`,
      ]);
    }
  }

  const enemyActor = requireEnemyActorState(
    simulationState.enemyMotion,
    actor.entityId,
  );
  const direction = makeSpriteDirectionFromVelocity(enemyActor.velocity.x);

  return resolveFirstStatefulImage(actor.userImage, [
    `walk-${direction}`,
    direction,
  ]);
}

function makeSpriteDirectionFromVelocity(velocityX: number): string {
  if (velocityX < 0) {
    return "left";
  }

  if (velocityX > 0) {
    return "right";
  }

  return "idle";
}

function resolveFirstStatefulImage(
  image: LoadedStatefulImageAsset,
  stateKeys: readonly string[],
): LoadedImageAsset {
  for (const stateKey of stateKeys) {
    const stateImage = image.stateImages.get(stateKey);

    if (stateImage !== undefined) {
      return stateImage;
    }
  }

  return image;
}

function makeTileRenderKey(x: number, y: number): string {
  return `${x},${y}`;
}

function setGameObjectVisible(
  renderObject: Phaser.GameObjects.GameObject,
  visible: boolean,
): void {
  if ("setVisible" in renderObject) {
    const setVisible = renderObject.setVisible;

    if (typeof setVisible === "function") {
      setVisible.call(renderObject, visible);
      return;
    }
  }

  throw new Error("Rendered breakable tile object cannot be made visible.");
}

// Mark each enterable pipe with a dark opening spanning the full two-tile
// mouth — the pipe reads as hollow where you can drop in. (The old marker was
// a single teal one-tile box that looked like an unrelated block.) Only pipes
// anchored on a top-mouth tile get the cue: side-entry warp shafts (anchored
// on body tiles, entered walking left/right) have no top opening to mark.
function renderPipeMouths(scene: Phaser.Scene, levelSpec: LevelSpec): void {
  for (const pipe of levelSpec.pipes) {
    const anchorTileId = levelSpec.tiles[pipe.position.y]?.[pipe.position.x];
    let mouthColumn: number;
    if (anchorTileId === "pipe-top-left") {
      mouthColumn = pipe.position.x;
    } else if (anchorTileId === "pipe-top-right") {
      mouthColumn = pipe.position.x - 1;
    } else {
      continue;
    }
    const x = mouthColumn * levelSpec.tileSizePixels;
    const y = pipe.position.y * levelSpec.tileSizePixels;
    const size = levelSpec.tileSizePixels;

    scene.add
      .rectangle(
        x + pipeMouthOpeningInsetPixels,
        y + pipeMouthOpeningTopPixels,
        size * pipeMouthWidthTiles - pipeMouthOpeningInsetPixels * 2,
        pipeMouthOpeningHeightPixels,
        pipeMouthOpeningColor,
      )
      .setOrigin(0);
    scene.add
      .rectangle(
        x + pipeMouthOpeningInsetPixels * 2,
        y + pipeMouthOpeningTopPixels + 1,
        size * pipeMouthWidthTiles - pipeMouthOpeningInsetPixels * 4,
        pipeMouthOpeningDepthHeightPixels,
        pipeMouthOpeningDepthColor,
      )
      .setOrigin(0);
  }
}

function renderNonPlayerActors(
  scene: Phaser.Scene,
  levelSpec: LevelSpec,
  userAssetBundle: UserAssetBundle | undefined,
): RenderedActorSummarySet {
  const actorRoleLookup = makeActorRoleLookup(levelSpec);
  const roleCounts = makeEmptyRenderedActorRoleCounts();
  const actors: RuntimeRenderedActor[] = [];

  for (const actor of levelSpec.actors) {
    const role = requireActorRole(actorRoleLookup, actor.actorId);

    if (!isRenderedActorRole(role)) {
      continue;
    }

    const pixelPosition = {
      x: actor.position.x * levelSpec.tileSizePixels + actorRenderOffsetPixels,
      y: actor.position.y * levelSpec.tileSizePixels + actorRenderOffsetPixels,
    };
    const userImage = userAssetBundle?.actorImages.get(actor.actorId);
    // The 32x32 boss walks with his simulated 16px body at the sprite's lower
    // half: drop the baseline a tile so his feet stand on the bridge planks
    // rather than hovering a tile above them.
    const baselinePixels = actor.actorId.startsWith("vglc-smb-bowser")
      ? groundedActorSpriteHeightPixels * 2
      : groundedActorSpriteHeightPixels;
    const renderedUserActor =
      userImage === undefined
        ? undefined
        : renderUserActorImage(scene, pixelPosition, userImage, baselinePixels);
    const renderObject =
      renderedUserActor?.container ??
      renderAuthoredActor(scene, pixelPosition, role);

    // Fallback shapes get a small wing marker for winged armored enemies;
    // toggled per frame by the winged behavior.
    let wingObject: Phaser.GameObjects.Triangle | undefined;
    if (role === ActorRole.ArmoredEnemy && renderedUserActor === undefined) {
      wingObject = scene.add
        .triangle(-2, 2, 0, 6, 6, 0, 6, 6, wingFallbackColor)
        .setOrigin(0)
        .setVisible(false);
      renderObject.add(wingObject);
    }

    roleCounts[role] += 1;
    actors.push({
      entityId: actor.entityId,
      actorId: actor.actorId,
      role,
      tilePosition: {
        x: actor.position.x,
        y: actor.position.y,
      },
      pixelPosition,
      renderObject,
      userImageObject: renderedUserActor?.image,
      userImage,
      wingObject,
    });
  }

  return {
    actors,
    roleCounts,
  };
}

function renderAuthoredTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  tileId: string,
  collision: BrowserLevelCollisionKind,
): void {
  // Coin holders are authored as coin-block-<N> / coin-brick-<N> (hold N coins).
  // The bump/dispense machinery is collision-based, so it already handles them
  // without a per-id case; only the look differs — a "?" block, or a brick that
  // keeps its brick appearance.
  const coinHolder = /^coin-(block|brick)-\d+$/.exec(tileId);
  if (coinHolder !== null) {
    requireTileAssetCollision(tileId, collision, TileCollisionKind.Interactive);
    if (coinHolder[1] === "brick") {
      renderBrickTile(scene, x, y, size);
    } else {
      renderInteractiveTile(scene, x, y, size, false);
    }
    return;
  }
  if (tileId === "power-up-brick") {
    // A brick with an embedded power-up keeps the plain brick look.
    requireTileAssetCollision(tileId, collision, TileCollisionKind.Interactive);
    renderBrickTile(scene, x, y, size);
    return;
  }
  if (decorativeSceneryTileIds.has(tileId)) {
    requireTileAssetCollision(tileId, collision, TileCollisionKind.Empty);
    renderDecorativeSceneryTile(scene, x, y, size, tileId);
    return;
  }
  switch (tileId) {
    case "empty":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Empty);
      return;
    case "sky":
      // Empty cells paint nothing; the full-world backdrop + parallax layers
      // behind the tiles supply the themed sky.
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Empty);
      return;
    case "goal-reach":
      // The invisible finish trigger above a flagpole's authored art: goal
      // contact with no visual, so the pole renders only where authored.
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Goal);
      return;
    case "ground":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Solid);
      renderSolidTile(scene, x, y, size, "grass");
      return;
    case "grass":
    case "stone":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Solid);
      renderSolidTile(scene, x, y, size, tileId);
      return;
    case "pipe-top-left":
    case "pipe-top-right":
    case "pipe-left":
    case "pipe-right":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Solid);
      renderPipeTile(scene, x, y, size, tileId);
      return;
    case "breakable-block":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Breakable);
      renderBrickTile(scene, x, y, size);
      return;
    case "castle-bridge":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Solid);
      renderBrickTile(scene, x, y, size);
      return;
    case "cracked-stone":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Breakable);
      renderSolidTile(scene, x, y, size, "stone");
      return;
    case "cannon-top":
      // Editor-authored cannons are hazard-topped (touching hurts); decoded SMB
      // cannons are safe to stand on — only their Bullet Bills harm.
      if (
        collision !== TileCollisionKind.SolidHazard &&
        collision !== TileCollisionKind.Solid
      ) {
        requireTileAssetCollision(
          tileId,
          collision,
          TileCollisionKind.SolidHazard,
        );
      }
      renderCannonTile(scene, x, y, size, true);
      return;
    case "cannon-bottom":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Solid);
      renderCannonTile(scene, x, y, size, false);
      return;
    case "empty-question-block":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Solid);
      renderInteractiveTile(scene, x, y, size, true);
      return;
    case "thorn":
    case "plant-hazard":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Hazard);
      renderHazardTile(scene, x, y, size);
      return;
    case "spring-top":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Spring);
      renderSpringTile(scene, x, y, size, true);
      return;
    case "spring-bottom":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Solid);
      renderSpringTile(scene, x, y, size, false);
      return;
    case "mystery-box":
    case "full-question-block-coin":
    case "full-question-block-power-up":
    case "extra-life-brick":
    case "star-block":
    case "beanstalk-block":
    case "multi-coin-brick":
      requireTileAssetCollision(
        tileId,
        collision,
        TileCollisionKind.Interactive,
      );
      renderInteractiveTile(scene, x, y, size, false);
      return;
    case "used-box":
      requireTileAssetCollision(
        tileId,
        collision,
        TileCollisionKind.Interactive,
      );
      renderInteractiveTile(scene, x, y, size, true);
      return;
    case "gate":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Goal);
      renderGoalTile(scene, x, y, size);
      return;
    case "flagpole":
      requireTileAssetCollision(tileId, collision, TileCollisionKind.Goal);
      renderFlagpoleSegment(scene, x, y, size);
      return;
    default:
      throw new Error(`Unsupported authored tile asset id: ${tileId}`);
  }
}

function requireTileAssetCollision(
  tileId: string,
  actualCollision: BrowserLevelCollisionKind,
  expectedCollision: BrowserLevelCollisionKind,
): void {
  if (actualCollision !== expectedCollision) {
    throw new Error(
      `Authored tile asset ${tileId} expected ${expectedCollision} collision but received ${actualCollision}.`,
    );
  }
}

// Decorative scenery tiles (Empty collision): the in-level clouds, bushes,
// hills, fences, trees, water bands and castle masonry. Simple flat shapes
// behind the action — sprites can override them per skin.
const decorativeSceneryTileIds: ReadonlySet<string> = new Set([
  "scenery-cloud-left",
  "scenery-cloud-middle",
  "scenery-cloud-right",
  "scenery-bush-left",
  "scenery-bush-middle",
  "scenery-bush-right",
  "scenery-hill-left",
  "scenery-hill-peak",
  "scenery-hill-right",
  "scenery-hill-fill",
  "scenery-fence",
  "scenery-tree-top",
  "scenery-tree-top-small",
  "scenery-trunk",
  "scenery-mushroom-stem",
  "scenery-rail",
  "castle-wall",
  "castle-battlement",
  "castle-window",
  "castle-door",
  "water-surface",
  "water-body",
  "lava-surface",
  "lava-body",
  "coral",
]);

const sceneryCloudColor = 0xf7fbff;
const sceneryBushColor = 0x2f9e44;
const sceneryHillColor = 0x37b24d;
const sceneryHillShadeColor = 0x2b8a3e;
const sceneryFenceColor = 0xb08968;
const sceneryTreeColor = 0x2b8a3e;
const sceneryTrunkColor = 0xb08968;
const sceneryMushroomStemColor = 0xf1e4d0;
const sceneryRailColor = 0xd9a066;
const sceneryCastleWallColor = 0x8d99ae;
const sceneryCastleShadeColor = 0x5c677d;
const sceneryCastleDoorColor = 0x1b263b;
const sceneryWaterColor = 0x4dabf7;
const sceneryCoralColor = 0x2f9e6e;
const sceneryCoralGlintColor = 0x63e6be;
const sceneryWaterDeepColor = 0x339af0;
const sceneryLavaColor = 0xf03e3e;
const sceneryLavaDeepColor = 0xc92a2a;

function renderDecorativeSceneryTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  tileId: string,
): void {
  const half = Math.round(size / 2);
  switch (tileId) {
    case "scenery-cloud-left":
    case "scenery-bush-left":
      scene.add
        .ellipse(
          x + size,
          y + size,
          size * 2,
          size * 1.6,
          tileId.includes("bush") ? sceneryBushColor : sceneryCloudColor,
        )
        .setOrigin(1, 1)
        .setDepth(-20);
      return;
    case "scenery-cloud-right":
    case "scenery-bush-right":
      scene.add
        .ellipse(
          x,
          y + size,
          size * 2,
          size * 1.6,
          tileId.includes("bush") ? sceneryBushColor : sceneryCloudColor,
        )
        .setOrigin(0, 1)
        .setDepth(-20);
      return;
    case "scenery-cloud-middle":
    case "scenery-bush-middle":
      scene.add
        .rectangle(
          x,
          y + Math.round(size * 0.2),
          size,
          Math.round(size * 0.8),
          tileId.includes("bush") ? sceneryBushColor : sceneryCloudColor,
        )
        .setOrigin(0)
        .setDepth(-20);
      return;
    case "scenery-hill-left":
      scene.add
        .triangle(x, y, 0, size, size, 0, size, size, sceneryHillColor)
        .setOrigin(0)
        .setDepth(-20);
      return;
    case "scenery-hill-right":
      scene.add
        .triangle(x, y, 0, 0, size, size, 0, size, sceneryHillColor)
        .setOrigin(0)
        .setDepth(-20);
      return;
    case "scenery-hill-peak":
      scene.add
        .triangle(x, y, half, 0, size, size, 0, size, sceneryHillShadeColor)
        .setOrigin(0)
        .setDepth(-20);
      return;
    case "scenery-hill-fill":
      scene.add
        .rectangle(x, y, size, size, sceneryHillColor)
        .setOrigin(0)
        .setDepth(-20);
      return;
    case "scenery-fence": {
      for (const postX of [2, 7, 12]) {
        scene.add
          .rectangle(x + postX, y + 4, 2, size - 4, sceneryFenceColor)
          .setOrigin(0)
          .setDepth(-20);
      }
      scene.add
        .rectangle(x, y + 6, size, 2, sceneryFenceColor)
        .setOrigin(0)
        .setDepth(-20);
      return;
    }
    case "scenery-tree-top":
    case "scenery-tree-top-small":
      scene.add
        .ellipse(x + half, y + half, size * 0.95, size * 1.1, sceneryTreeColor)
        .setDepth(-20);
      return;
    case "scenery-trunk":
      scene.add
        .rectangle(x + half - 2, y, 4, size, sceneryTrunkColor)
        .setOrigin(0)
        .setDepth(-20);
      return;
    case "scenery-mushroom-stem":
      scene.add
        .rectangle(x + 3, y, size - 6, size, sceneryMushroomStemColor)
        .setOrigin(0)
        .setDepth(-20);
      return;
    case "scenery-rail":
      scene.add
        .rectangle(x, y + size - 4, size, 2, sceneryRailColor)
        .setOrigin(0)
        .setDepth(-20);
      return;
    case "castle-wall":
      scene.add
        .rectangle(x, y, size, size, sceneryCastleWallColor)
        .setOrigin(0)
        .setStrokeStyle(1, sceneryCastleShadeColor)
        .setDepth(-19);
      return;
    case "castle-battlement": {
      scene.add
        .rectangle(x, y + half, size, half, sceneryCastleWallColor)
        .setOrigin(0)
        .setDepth(-19);
      scene.add
        .rectangle(x + 1, y, half - 2, half, sceneryCastleWallColor)
        .setOrigin(0)
        .setDepth(-19);
      scene.add
        .rectangle(x + half + 1, y, half - 2, half, sceneryCastleWallColor)
        .setOrigin(0)
        .setDepth(-19);
      return;
    }
    case "castle-window":
      scene.add
        .rectangle(x, y, size, size, sceneryCastleWallColor)
        .setOrigin(0)
        .setDepth(-19);
      scene.add
        .rectangle(x + 5, y + 3, size - 10, size - 6, sceneryCastleDoorColor)
        .setOrigin(0)
        .setDepth(-19);
      return;
    case "castle-door":
      scene.add
        .rectangle(x, y, size, size, sceneryCastleWallColor)
        .setOrigin(0)
        .setDepth(-19);
      scene.add
        .rectangle(x + 3, y + 2, size - 6, size - 2, sceneryCastleDoorColor)
        .setOrigin(0)
        .setDepth(-19);
      return;
    case "water-surface":
    case "lava-surface": {
      const surfaceColor =
        tileId === "lava-surface" ? sceneryLavaColor : sceneryWaterColor;
      const glintColor = tileId === "lava-surface" ? 0xffc078 : 0xd0ebff;
      scene.add
        .rectangle(x, y + 4, size, size - 4, surfaceColor)
        .setOrigin(0)
        .setDepth(-18);
      scene.add
        .rectangle(x, y + 2, size, 2, glintColor)
        .setOrigin(0)
        .setDepth(-18);
      return;
    }
    case "water-body":
    case "lava-body":
      scene.add
        .rectangle(
          x,
          y,
          size,
          size,
          tileId === "lava-body" ? sceneryLavaDeepColor : sceneryWaterDeepColor,
        )
        .setOrigin(0)
        .setDepth(-18);
      return;
    case "coral":
      // A swim-through coral bank: a solid-looking block the water palette
      // renders behind the swimmer.
      scene.add
        .rectangle(x, y, size, size, sceneryCoralColor)
        .setOrigin(0)
        .setDepth(-18);
      scene.add
        .rectangle(x + 2, y + 2, size - 4, 2, sceneryCoralGlintColor)
        .setOrigin(0)
        .setDepth(-18);
      return;
    default:
      throw new Error(`Unsupported decorative scenery tile: ${tileId}`);
  }
}

// A brown SMB brick with mortar lines: a centre course split, offset from the
// half-height courses above and below.
function renderBrickTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
) {
  const mortar = activeThemePalette.brickMortar;
  scene.add
    .rectangle(x, y, size, size, activeThemePalette.brick)
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
  const half = Math.round(size / 2);
  scene.add.rectangle(x, y + half, size, 1, mortar).setOrigin(0);
  scene.add.rectangle(x + half, y, 1, half, mortar).setOrigin(0);
  scene.add
    .rectangle(x + Math.round(size / 4), y + half, 1, half, mortar)
    .setOrigin(0);
  scene.add
    .rectangle(x + Math.round((3 * size) / 4), y + half, 1, half, mortar)
    .setOrigin(0);
}

function renderSolidTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  tileId: string,
) {
  switch (tileId) {
    case "grass":
      scene.add
        .rectangle(x, y, size, size, activeThemePalette.ground)
        .setOrigin(0)
        .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
      if (activeThemePalette.grassyTop) {
        scene.add
          .rectangle(
            x,
            y,
            size,
            grassTopHeightPixels,
            activeThemePalette.groundTop,
          )
          .setOrigin(0);
        scene.add
          .rectangle(
            x + grassBladeOffsetX,
            y + grassBladeOffsetY,
            size - grassBladeInsetPixels,
            grassBladeHeightPixels,
            activeThemePalette.groundBlade,
          )
          .setOrigin(0);
      }
      scene.add
        .rectangle(
          x + grassDirtStoneOffsetX,
          y + grassDirtStoneOffsetY,
          grassDirtStoneWidthPixels,
          grassDirtStoneHeightPixels,
          activeThemePalette.groundDirt,
        )
        .setOrigin(0);
      return;
    case "stone":
      scene.add
        .rectangle(x, y, size, size, activeThemePalette.block)
        .setOrigin(0)
        .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
      scene.add
        .rectangle(
          x + stoneHighlightOffsetX,
          y + stoneHighlightOffsetY,
          size - stoneHighlightInsetPixels,
          stoneHighlightHeightPixels,
          activeThemePalette.blockHighlight,
        )
        .setOrigin(0);
      return;
    default:
      throw new Error(`Unsupported solid tile asset id: ${tileId}`);
  }
}

function renderHazardTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
) {
  scene.add
    .rectangle(x, y, size, size, thornTileColor)
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
  scene.add.triangle(
    x + hazardPointBaseOffsetX,
    y + hazardPointBaseOffsetY,
    hazardPointBaseX1,
    hazardPointBaseY1,
    hazardPointBaseX2,
    hazardPointBaseY2,
    hazardPointBaseX3,
    hazardPointBaseY3,
    thornPointColor,
  );
}

function renderSpringTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  isTop: boolean,
) {
  scene.add
    .rectangle(x, y, size, size, springBaseColor)
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);

  if (isTop) {
    scene.add
      .rectangle(
        x + springInsetPixels,
        y + springInsetPixels,
        size - springInsetPixels * 2,
        springTopHeightPixels,
        springTopColor,
      )
      .setOrigin(0);
  }

  scene.add
    .rectangle(
      x + springCoilOffsetX,
      y + springFirstCoilOffsetY,
      springCoilWidthPixels,
      springCoilHeightPixels,
      springCoilColor,
    )
    .setOrigin(0);
  scene.add
    .rectangle(
      x + springCoilOffsetX,
      y + springSecondCoilOffsetY,
      springCoilWidthPixels,
      springCoilHeightPixels,
      springCoilColor,
    )
    .setOrigin(0);
  scene.add
    .rectangle(
      x + springInsetPixels,
      y + size - springBaseHeightPixels,
      size - springInsetPixels * 2,
      springBaseHeightPixels,
      springTopColor,
    )
    .setOrigin(0);
}

function renderPipeTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  tileId: string,
) {
  scene.add
    .rectangle(x, y, size, size, pipeColor)
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, pipeShadowColor);

  if (tileId === "pipe-top-left" || tileId === "pipe-top-right") {
    scene.add
      .rectangle(x, y, size, pipeLipHeightPixels, pipeLipColor)
      .setOrigin(0);
  }

  const highlightX =
    tileId === "pipe-top-right" || tileId === "pipe-right"
      ? x + size - pipeHighlightOffsetX
      : x + pipeHighlightOffsetX;

  scene.add
    .rectangle(
      highlightX,
      y + pipeHighlightOffsetY,
      pipeHighlightWidthPixels,
      size - pipeHighlightOffsetY,
      pipeHighlightColor,
    )
    .setOrigin(0);
}

function renderCannonTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  top: boolean,
) {
  scene.add
    .rectangle(x, y, size, size, cannonTileColor)
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
  scene.add
    .rectangle(
      x,
      y + cannonBandOffsetY,
      size,
      cannonBandHeightPixels,
      cannonBandColor,
    )
    .setOrigin(0);

  if (!top) {
    return;
  }

  scene.add
    .rectangle(
      x + cannonMouthOffsetX,
      y + cannonMouthOffsetY,
      cannonMouthWidthPixels,
      cannonMouthHeightPixels,
      cannonMouthColor,
    )
    .setOrigin(0);
  scene.add
    .rectangle(
      x + cannonWarningLeftOffsetX,
      y + cannonWarningOffsetY,
      cannonWarningWidthPixels,
      cannonWarningHeightPixels,
      cannonWarningColor,
    )
    .setOrigin(0);
  scene.add
    .rectangle(
      x + cannonWarningRightOffsetX,
      y + cannonWarningOffsetY,
      cannonWarningWidthPixels,
      cannonWarningHeightPixels,
      cannonWarningColor,
    )
    .setOrigin(0);
}

function renderGoalTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
) {
  scene.add
    .rectangle(x, y, size, size, gateFrameColor)
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
  scene.add
    .rectangle(
      x + tileStrokeWidth,
      y + tileStrokeWidth,
      size - tileStrokeWidth * 2,
      size - tileStrokeWidth * 2,
      gateTileColor,
    )
    .setOrigin(0);
  scene.add
    .rectangle(
      x + gateShineOffsetX,
      y + gateShineOffsetY,
      gateShineWidthPixels,
      size - gateShineInsetPixels,
      gateShineColor,
    )
    .setOrigin(0);
  scene.add
    .rectangle(
      x + size / 2 - gateGemSizePixels / 2,
      y + size / 2 - gateGemSizePixels / 2,
      gateGemSizePixels,
      gateGemSizePixels,
      gateGemColor,
    )
    .setOrigin(0);
}

const flagpoleTileId = "flagpole";
const flagpoleFurnitureDepth = 5;
// The flag's height as a fraction of a tile (renderFlagpoleFurniture draws it
// at this size; the slide caps its drop above the ground line with it).
const flagpoleFlagHeightRatio = 0.9;
// Knocking the top ball off: it pops up-and-away, then falls under gravity.
const flagpoleBallKnockVelocity = { vx: 0.9, vy: -2.2 } as const;
const flagpoleBallFallGravityPixels = 0.28;
// Post-animation grace and the frames budgeted for a knocked ball to clear
// even a tall level, so the finish overlay never freezes them mid-air.
const flagpoleFinishTailFrames = 24;
const flagpoleBallFallBudgetFrames = 90;
// The exit march to the castle doorway: distance walked and walking speed.
const flagpoleWalkOffDistancePixels = 96;
// The castle flag's rise after the hero enters the doorway.
const castleFlagRiseFrames = 40;
const brickShardColor = 0x9a6b3f;
// ROM BowserIdentities, worlds 1-7 (world 8 is the real keeper).
const bowserDisguiseActorIdByWorld: readonly (string | undefined)[] = [
  "vglc-smb-enemy",
  "vglc-smb-koopa",
  "vglc-smb-turtle",
  "vglc-smb-spiny",
  "vglc-smb-aerial-throwing-enemy",
  "vglc-smb-blooper",
  "vglc-smb-throwing-enemy",
  undefined,
];
const blockNudgeFrames = 10;
const springSquashColor = 0x2dd4bf;
const castleFlagRisePixelsPerFrame = 0.5;
const flagpoleWalkOffSpeedPixels = 1.25;
const flagpolePoleColor = 0xc8d8c8;
const flagpoleBallColor = 0x60a860;
const flagFabricColor = 0x18c018;

// The flagpole is a slim pole centred in its (goal-collision) column; a stack of
// these segments reads as one continuous pole. The ball and flag are added once
// per column by BootScene.renderFlagpoleFurniture.
function renderFlagpoleSegment(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
) {
  const poleWidth = Math.max(2, Math.round(size * 0.18));
  scene.add
    .rectangle(
      x + size / 2 - poleWidth / 2,
      y,
      poleWidth,
      size,
      flagpolePoleColor,
    )
    .setOrigin(0);
}

function renderInteractiveTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  used: boolean,
) {
  const fillColor = used ? usedBoxColor : interactiveBoxColor;

  scene.add
    .rectangle(x, y, size, size, fillColor)
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);

  if (!used) {
    // Corner rivets, then a centered "?" — the classic question block. Every
    // live "?" block looks the same in play; its contents are only a surprise.
    const rivetInset = interactiveBoxQuestionOffsetX;
    const rivets: readonly [number, number][] = [
      [rivetInset, interactiveBoxQuestionOffsetY],
      [size - rivetInset - 1, interactiveBoxQuestionOffsetY],
      [rivetInset, size - interactiveBoxQuestionOffsetY - 1],
      [size - rivetInset - 1, size - interactiveBoxQuestionOffsetY - 1],
    ];
    for (const [rx, ry] of rivets) {
      scene.add
        .rectangle(x + rx, y + ry, 1, 1, interactiveBoxShineColor)
        .setOrigin(0);
    }
    scene.add
      .text(x + size / 2, y + size / 2 - 1, "?", {
        fontFamily: "monospace",
        fontSize: `${String(Math.round(size * 0.72))}px`,
        fontStyle: "bold",
        color: "#fef3c7",
      })
      .setOrigin(0.5)
      .setResolution(3);
  }
}

function renderAuthoredActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
  role: BrowserRenderedActorRole,
): Phaser.GameObjects.Container {
  switch (role) {
    case ActorRole.Enemy:
      return renderEnemyActor(scene, pixelPosition);
    case ActorRole.FlyingEnemy:
      return renderFlyingEnemyActor(scene, pixelPosition);
    case ActorRole.ChasingEnemy:
      return renderChasingEnemyActor(scene, pixelPosition);
    case ActorRole.ArmoredEnemy:
      return renderArmoredEnemyActor(scene, pixelPosition);
    case ActorRole.ThrowingEnemy:
      return renderThrowingEnemyActor(scene, pixelPosition);
    case ActorRole.AerialThrowingEnemy:
      return renderAerialThrowingEnemyActor(scene, pixelPosition);
    case ActorRole.PiranhaPlant:
      return renderPiranhaPlantActor(scene, pixelPosition);
    case ActorRole.Coin:
      return renderCoinActor(scene, pixelPosition);
    case ActorRole.Item:
      return renderItemActor(scene, pixelPosition);
    case ActorRole.PowerUp:
      return renderPowerUpActor(scene, pixelPosition);
    case ActorRole.ExtraLife:
      return renderExtraLifeActor(scene, pixelPosition);
    case ActorRole.InvincibilityPowerUp:
      return renderInvincibilityPowerUpActor(scene, pixelPosition);
    case ActorRole.Climbable:
      return renderClimbableActor(scene, pixelPosition);
    case ActorRole.Exit:
      return renderExitActor(scene, pixelPosition);
    default: {
      const invalidRole: never = role;
      throw new Error(`Invalid rendered actor role: ${String(invalidRole)}`);
    }
  }
}

function renderUserTileImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  imageAsset: LoadedImageAsset,
): Phaser.GameObjects.Image {
  return addUserFrameImage(scene, x, y, imageAsset);
}

// Interactive blocks that should read as "?" question blocks: single-use
// coin/power-up blocks, hidden mystery boxes, and multi-coin blocks.
function tileShowsQuestionGlyph(tileId: string): boolean {
  return (
    singleUseQuestionBlockTileIds.has(tileId) ||
    tileId === "mystery-box" ||
    /^coin-block-\d+$/.test(tileId)
  );
}

// The shabby tileset draws these blocks from the crate sprite (an X-braced
// crate). Stamp a bold "?" over them so a coin/question block is distinct from
// a plain solid crate, as in the original.
function renderQuestionBlockGlyph(
  scene: Phaser.Scene,
  pixelX: number,
  pixelY: number,
  sizePixels: number,
): Phaser.GameObjects.Text {
  const glyph = scene.add.text(
    pixelX + sizePixels / 2,
    pixelY + sizePixels / 2,
    "?",
    {
      fontFamily: "monospace",
      fontSize: `${String(Math.round(sizePixels * 0.9))}px`,
      color: "#fff3c4",
      fontStyle: "bold",
    },
  );
  glyph.setStroke("#3a2410", Math.max(2, Math.round(sizePixels / 8)));
  glyph.setOrigin(0.5, 0.5);
  return glyph;
}

function renderUserActorImage(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
  imageAsset: LoadedImageAsset,
  baselinePixels = groundedActorSpriteHeightPixels,
): {
  readonly container: Phaser.GameObjects.Container;
  readonly image: Phaser.GameObjects.Image;
} {
  // Bottom-align the sprite to the actor baseline (16px for standard actors),
  // so a taller sprite (e.g. the 16x24 Koopa) rests its feet on the ground
  // and extends upward instead of sinking its extra height into the terrain.
  const verticalOffset = baselinePixels - imageAsset.frame.height;
  const image = addUserFrameImage(scene, 0, verticalOffset, imageAsset);

  return {
    container: scene.add.container(pixelPosition.x, pixelPosition.y, [image]),
    image,
  };
}

function renderPlayerImage(
  scene: Phaser.Scene,
  playerImage: LoadedImageAsset | undefined,
): Phaser.GameObjects.Image | undefined {
  if (playerImage === undefined) {
    return undefined;
  }

  return addUserFrameImage(scene, 0, 0, playerImage);
}

function addUserFrameImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  imageAsset: LoadedImageAsset,
): Phaser.GameObjects.Image {
  const key = registerUserImageTexture(scene, imageAsset);

  return scene.add
    .image(x, y, key)
    .setOrigin(0)
    .setCrop(
      imageAsset.frame.x,
      imageAsset.frame.y,
      imageAsset.frame.width,
      imageAsset.frame.height,
    )
    .setDisplaySize(imageAsset.frame.width, imageAsset.frame.height);
}

function setUserFrameImage(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image,
  imageAsset: LoadedImageAsset,
): void {
  const key = registerUserImageTexture(scene, imageAsset);
  image
    .setTexture(key)
    .setCrop(
      imageAsset.frame.x,
      imageAsset.frame.y,
      imageAsset.frame.width,
      imageAsset.frame.height,
    )
    .setDisplaySize(imageAsset.frame.width, imageAsset.frame.height);
}

function registerUserImageTexture(
  scene: Phaser.Scene,
  imageAsset: LoadedImageAsset,
): string {
  const key = `user-image-${imageAsset.objectUrl}`;

  if (!scene.textures.exists(key)) {
    const texture = scene.textures.addImage(key, imageAsset.imageElement);
    // Nearest-neighbor sampling keeps imported pixel art crisp when scaled.
    texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  return key;
}

function registerUserSoundBuffers(
  gameAudio: GameAudio,
  userAssetBundle: UserAssetBundle | undefined,
): void {
  if (userAssetBundle === undefined) {
    return;
  }

  const bufferMap = new Map<SoundEvent, AudioBuffer>();

  for (const [key, asset] of userAssetBundle.sounds.entries()) {
    bufferMap.set(key as SoundEvent, asset.audioBuffer);
  }

  gameAudio.registerSoundBuffers(bufferMap);
}

function renderEnemyActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const body = scene.add
    .rectangle(
      0,
      enemyBodyOffsetY,
      enemyBodyWidthPixels,
      enemyBodyHeightPixels,
      enemyBodyColor,
    )
    .setOrigin(0);
  const shell = scene.add
    .rectangle(
      enemyShellOffsetX,
      0,
      enemyShellWidthPixels,
      enemyShellHeightPixels,
      enemyShellColor,
    )
    .setOrigin(0);
  const shellSpot = scene.add
    .rectangle(
      enemyShellOffsetX + enemyShellSpotOffsetX,
      enemyShellSpotOffsetY,
      enemyShellSpotSizePixels,
      enemyShellSpotSizePixels,
      enemyShellSpotColor,
    )
    .setOrigin(0);
  const leftEyeWhite = scene.add
    .rectangle(
      enemyEyeOffsetX,
      enemyEyeOffsetY,
      enemyEyeSizePixels,
      enemyEyeSizePixels,
      enemyEyeWhiteColor,
    )
    .setOrigin(0);
  const leftPupil = scene.add
    .rectangle(
      enemyEyeOffsetX,
      enemyEyeOffsetY,
      enemyPupilSizePixels,
      enemyPupilSizePixels,
      enemyEyePupilColor,
    )
    .setOrigin(0);
  const rightEyeWhite = scene.add
    .rectangle(
      enemyEyeOffsetX + 3,
      enemyEyeOffsetY,
      enemyEyeSizePixels,
      enemyEyeSizePixels,
      enemyEyeWhiteColor,
    )
    .setOrigin(0);
  const rightPupil = scene.add
    .rectangle(
      enemyEyeOffsetX + 3,
      enemyEyeOffsetY,
      enemyPupilSizePixels,
      enemyPupilSizePixels,
      enemyEyePupilColor,
    )
    .setOrigin(0);
  const leftLeg = scene.add
    .rectangle(
      enemyLeftLegOffsetX,
      enemyLegOffsetY,
      enemyLegWidthPixels,
      enemyLegHeightPixels,
      enemyLegColor,
    )
    .setOrigin(0);
  const rightLeg = scene.add
    .rectangle(
      enemyRightLegOffsetX,
      enemyLegOffsetY,
      enemyLegWidthPixels,
      enemyLegHeightPixels,
      enemyLegColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    body,
    shell,
    shellSpot,
    leftEyeWhite,
    leftPupil,
    rightEyeWhite,
    rightPupil,
    leftLeg,
    rightLeg,
  ]);
}

function renderFlyingEnemyActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const body = scene.add
    .rectangle(
      flyingEnemyBodyOffsetX,
      flyingEnemyBodyOffsetY,
      flyingEnemyBodyWidthPixels,
      flyingEnemyBodyHeightPixels,
      flyingEnemyBodyColor,
    )
    .setOrigin(0);
  const leftWing = scene.add
    .rectangle(
      flyingEnemyLeftWingOffsetX,
      flyingEnemyWingOffsetY,
      flyingEnemyWingWidthPixels,
      flyingEnemyWingHeightPixels,
      flyingEnemyWingColor,
    )
    .setOrigin(0);
  const rightWing = scene.add
    .rectangle(
      flyingEnemyRightWingOffsetX,
      flyingEnemyWingOffsetY,
      flyingEnemyWingWidthPixels,
      flyingEnemyWingHeightPixels,
      flyingEnemyWingColor,
    )
    .setOrigin(0);
  const stripe = scene.add
    .rectangle(
      flyingEnemyStripeOffsetX,
      flyingEnemyStripeOffsetY,
      flyingEnemyStripeWidthPixels,
      flyingEnemyStripeHeightPixels,
      flyingEnemyStripeColor,
    )
    .setOrigin(0);
  const leftEye = scene.add
    .rectangle(
      flyingEnemyEyeOffsetX,
      flyingEnemyEyeOffsetY,
      flyingEnemyEyeSizePixels,
      flyingEnemyEyeSizePixels,
      flyingEnemyEyeColor,
    )
    .setOrigin(0);
  const rightEye = scene.add
    .rectangle(
      flyingEnemyEyeOffsetX + 3,
      flyingEnemyEyeOffsetY,
      flyingEnemyEyeSizePixels,
      flyingEnemyEyeSizePixels,
      flyingEnemyEyeColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    body,
    stripe,
    leftWing,
    rightWing,
    leftEye,
    rightEye,
  ]);
}

function renderChasingEnemyActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const body = scene.add
    .rectangle(
      0,
      chasingEnemyBodyOffsetY,
      chasingEnemyBodyWidthPixels,
      chasingEnemyBodyHeightPixels,
      chasingEnemyBodyColor,
    )
    .setOrigin(0);
  const leftSpike = scene.add
    .triangle(
      0,
      chasingEnemySpikeOffsetY,
      0,
      chasingEnemySpikeSizePixels,
      chasingEnemySpikeSizePixels,
      0,
      chasingEnemySpikeSizePixels * 2,
      chasingEnemySpikeSizePixels,
      chasingEnemySpikeColor,
    )
    .setOrigin(0);
  const rightSpike = scene.add
    .triangle(
      chasingEnemyBodyWidthPixels - chasingEnemySpikeSizePixels * 2,
      chasingEnemySpikeOffsetY,
      0,
      chasingEnemySpikeSizePixels,
      chasingEnemySpikeSizePixels,
      0,
      chasingEnemySpikeSizePixels * 2,
      chasingEnemySpikeSizePixels,
      chasingEnemySpikeColor,
    )
    .setOrigin(0);
  const leftEye = scene.add
    .rectangle(
      chasingEnemyEyeOffsetX,
      chasingEnemyEyeOffsetY,
      chasingEnemyEyeSizePixels,
      chasingEnemyEyeSizePixels,
      chasingEnemyEyeColor,
    )
    .setOrigin(0);
  const rightEye = scene.add
    .rectangle(
      chasingEnemyEyeOffsetX + 3,
      chasingEnemyEyeOffsetY,
      chasingEnemyEyeSizePixels,
      chasingEnemyEyeSizePixels,
      chasingEnemyEyeColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    body,
    leftSpike,
    rightSpike,
    leftEye,
    rightEye,
  ]);
}

function renderArmoredEnemyActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const shell = scene.add
    .rectangle(
      0,
      armoredEnemyShellOffsetY,
      armoredEnemyShellWidthPixels,
      armoredEnemyShellHeightPixels,
      armoredEnemyShellColor,
    )
    .setOrigin(0);
  const segment = scene.add
    .rectangle(
      armoredEnemySegmentOffsetX,
      armoredEnemySegmentOffsetY,
      armoredEnemySegmentWidthPixels,
      armoredEnemySegmentHeightPixels,
      armoredEnemySegmentColor,
    )
    .setOrigin(0);
  const leftClaw = scene.add
    .rectangle(
      armoredEnemyLeftClawOffsetX,
      armoredEnemyClawOffsetY,
      armoredEnemyClawWidthPixels,
      armoredEnemyClawHeightPixels,
      armoredEnemyClawColor,
    )
    .setOrigin(0);
  const rightClaw = scene.add
    .rectangle(
      armoredEnemyRightClawOffsetX,
      armoredEnemyClawOffsetY,
      armoredEnemyClawWidthPixels,
      armoredEnemyClawHeightPixels,
      armoredEnemyClawColor,
    )
    .setOrigin(0);
  const leftEye = scene.add
    .rectangle(
      armoredEnemyEyeOffsetX,
      armoredEnemyEyeOffsetY,
      armoredEnemyEyeSizePixels,
      armoredEnemyEyeSizePixels,
      armoredEnemyEyeColor,
    )
    .setOrigin(0);
  const rightEye = scene.add
    .rectangle(
      armoredEnemyEyeOffsetX + 3,
      armoredEnemyEyeOffsetY,
      armoredEnemyEyeSizePixels,
      armoredEnemyEyeSizePixels,
      armoredEnemyEyeColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    shell,
    segment,
    leftClaw,
    rightClaw,
    leftEye,
    rightEye,
  ]);
}

function renderThrowingEnemyActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const body = scene.add
    .rectangle(
      1,
      enemyBodyOffsetY,
      enemyBodyWidthPixels,
      enemyBodyHeightPixels,
      chasingEnemyBodyColor,
    )
    .setOrigin(0);
  const brow = scene.add
    .rectangle(3, 1, 8, 2, armoredEnemySegmentColor)
    .setOrigin(0);
  const leftEye = scene.add
    .rectangle(
      enemyEyeOffsetX,
      enemyEyeOffsetY + 2,
      enemyEyeSizePixels,
      enemyEyeSizePixels,
      enemyEyeWhiteColor,
    )
    .setOrigin(0);
  const rightEye = scene.add
    .rectangle(
      enemyEyeOffsetX + 4,
      enemyEyeOffsetY + 2,
      enemyEyeSizePixels,
      enemyEyeSizePixels,
      enemyEyeWhiteColor,
    )
    .setOrigin(0);
  const projectileCue = scene.add
    .rectangle(10, 7, 4, 4, enemyShellSpotColor)
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    body,
    brow,
    leftEye,
    rightEye,
    projectileCue,
  ]);
}

// Castle-clear cinematic pacing and the bridge tile it chops.
const castleBridgeTileId = "castle-bridge";
const castleBridgeChopFrames = 5;
const castleClearFallFrames = 120;
const castleClearFallSpeedPerFrame = 3;
// The hero's walk into the inner chamber after the fall, and where the freed
// friend stands relative to where the walk ends.
const castleClearWalkFrames = 110;
const castleClearWalkSpeedPerFrame = 1.5;
const castleClearFriendLeadPixels = 56;
// A beat on the friend + message before the finish overlay may appear.
const castleClearMessageHoldFrames = 90;

const flameHazardCoreColor = 0xf97316;
const platformFillColor = 0xd9a066;
const platformEdgeColor = 0x8a5a2b;
const platformRopeColor = 0xd6c4a0;
const wingFallbackColor = 0xf8fafc;
// Balance-lift ropes hang from the pulley band just below the HUD rows.
const platformRopePulleyRowY = 2 * 16;
const flameHazardRimColor = 0xfde047;
const piranhaStalkColor = 0x15803d;
const piranhaHeadColor = 0x22c55e;
const piranhaMouthColor = 0x7f1d1d;

// A carnivorous plant: a green stalk topped with a toothy open mouth.
function renderPiranhaPlantActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const stalk = scene.add
    .rectangle(6, 7, 4, 11, piranhaStalkColor)
    .setOrigin(0);
  const head = scene.add
    .rectangle(1, 0, 14, 9, piranhaHeadColor)
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
  const mouth = scene.add
    .rectangle(2, 4, 12, 3, piranhaMouthColor)
    .setOrigin(0);
  const teeth = [3, 7, 11].map((toothX) =>
    scene.add.rectangle(toothX, 4, 2, 2, 0xffffff).setOrigin(0),
  );

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    stalk,
    head,
    mouth,
    ...teeth,
  ]);
}

function renderAerialThrowingEnemyActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const cloudBase = scene.add.ellipse(0, 8, 16, 8, skyCloudColor).setOrigin(0);
  const cloudPuffLeft = scene.add
    .ellipse(1, 5, 7, 7, skyCloudColor)
    .setOrigin(0);
  const cloudPuffRight = scene.add
    .ellipse(8, 4, 7, 7, skyCloudColor)
    .setOrigin(0);
  const body = scene.add
    .rectangle(5, 1, 7, 8, chasingEnemyBodyColor)
    .setOrigin(0);
  const eye = scene.add
    .rectangle(9, 3, enemyEyeSizePixels, enemyEyeSizePixels, enemyEyeWhiteColor)
    .setOrigin(0);
  const dropCue = scene.add
    .rectangle(7, 12, 3, 3, enemyShellSpotColor)
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    cloudBase,
    cloudPuffLeft,
    cloudPuffRight,
    body,
    eye,
    dropCue,
  ]);
}

function renderItemActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const core = scene.add
    .rectangle(0, 0, itemCoreWidthPixels, itemCoreHeightPixels, itemCoreColor)
    .setOrigin(0);
  const shine = scene.add
    .rectangle(
      itemShineOffsetX,
      itemShineOffsetY,
      itemShineWidthPixels,
      itemShineHeightPixels,
      itemShineColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [core, shine]);
}

function renderCoinActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const core = scene.add
    .circle(0, 0, coinCoreRadiusPixels, coinCoreColor)
    .setOrigin(0.5)
    .setStrokeStyle(tileStrokeWidth, scoreBadgeStrokeColor);
  const shine = scene.add
    .rectangle(
      coinShineOffsetX,
      coinShineOffsetY,
      coinShineWidthPixels,
      coinShineHeightPixels,
      coinShineColor,
    )
    .setOrigin(0.5);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [core, shine]);
}

function renderPowerUpActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const core = scene.add
    .rectangle(
      0,
      0,
      powerUpCoreWidthPixels,
      powerUpCoreHeightPixels,
      powerUpCoreColor,
    )
    .setOrigin(0);
  const gem = scene.add
    .rectangle(
      powerUpShineOffsetX,
      powerUpShineOffsetY,
      powerUpShineWidthPixels,
      powerUpShineHeightPixels,
      powerUpGemColor,
    )
    .setOrigin(0);
  const shine = scene.add
    .rectangle(
      powerUpShineOffsetX + powerUpSparkleInsetPixels,
      powerUpShineOffsetY + powerUpSparkleInsetPixels,
      powerUpSparkleSizePixels,
      powerUpSparkleSizePixels,
      powerUpShineColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    core,
    gem,
    shine,
  ]);
}

function renderExtraLifeActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const core = scene.add
    .rectangle(
      0,
      0,
      extraLifeCoreWidthPixels,
      extraLifeCoreHeightPixels,
      extraLifeCoreColor,
    )
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
  const stem = scene.add
    .rectangle(
      extraLifeStemOffsetX,
      extraLifeStemOffsetY,
      extraLifeStemWidthPixels,
      extraLifeStemHeightPixels,
      extraLifeMarkColor,
    )
    .setOrigin(0);
  const bar = scene.add
    .rectangle(
      extraLifeBarOffsetX,
      extraLifeBarOffsetY,
      extraLifeBarWidthPixels,
      extraLifeBarHeightPixels,
      extraLifeMarkColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    core,
    stem,
    bar,
  ]);
}

function renderInvincibilityPowerUpActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const core = scene.add
    .rectangle(
      invincibilityCoreOffsetX,
      invincibilityCoreOffsetY,
      invincibilityCoreWidthPixels,
      invincibilityCoreHeightPixels,
      invincibilityCoreColor,
    )
    .setOrigin(0)
    .setStrokeStyle(tileStrokeWidth, tileStrokeColor);
  const accent = scene.add
    .rectangle(
      invincibilityAccentOffsetX,
      invincibilityAccentOffsetY,
      invincibilityAccentWidthPixels,
      invincibilityAccentHeightPixels,
      invincibilityAccentColor,
    )
    .setOrigin(0);
  const shine = scene.add
    .rectangle(
      invincibilityShineOffsetX,
      invincibilityShineOffsetY,
      invincibilityShineSizePixels,
      invincibilityShineSizePixels,
      invincibilityShineColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    core,
    accent,
    shine,
  ]);
}

function renderClimbableActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const stem = scene.add
    .rectangle(
      climbableStemOffsetX,
      0,
      climbableStemWidthPixels,
      climbableStemHeightPixels,
      climbableStemColor,
    )
    .setOrigin(0);
  const upperLeftLeaf = scene.add
    .rectangle(
      climbableLeftLeafOffsetX,
      climbableUpperLeafOffsetY,
      climbableLeafWidthPixels,
      climbableLeafHeightPixels,
      climbableLeafColor,
    )
    .setOrigin(0);
  const lowerRightLeaf = scene.add
    .rectangle(
      climbableRightLeafOffsetX,
      climbableLowerLeafOffsetY,
      climbableLeafWidthPixels,
      climbableLeafHeightPixels,
      climbableLeafColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    stem,
    upperLeftLeaf,
    lowerRightLeaf,
  ]);
}

function renderExitActor(
  scene: Phaser.Scene,
  pixelPosition: { readonly x: number; readonly y: number },
): Phaser.GameObjects.Container {
  const arch = scene.add
    .rectangle(0, 0, exitArchWidthPixels, exitArchHeightPixels, exitArchColor)
    .setOrigin(0);
  const leftBanner = scene.add
    .rectangle(
      exitLeftBannerOffsetX,
      exitBannerOffsetY,
      exitBannerWidthPixels,
      exitBannerHeightPixels,
      exitBannerColor,
    )
    .setOrigin(0);
  const rightBanner = scene.add
    .rectangle(
      exitRightBannerOffsetX,
      exitBannerOffsetY,
      exitBannerWidthPixels,
      exitBannerHeightPixels,
      exitBannerColor,
    )
    .setOrigin(0);
  const glow = scene.add
    .rectangle(
      exitGlowOffsetX,
      exitGlowOffsetY,
      exitGlowWidthPixels,
      exitGlowHeightPixels,
      exitGlowColor,
    )
    .setOrigin(0);

  return scene.add.container(pixelPosition.x, pixelPosition.y, [
    leftBanner,
    rightBanner,
    arch,
    glow,
  ]);
}

function makeRuntimeRenderedActorPixelPosition(
  actor: RuntimeRenderedActor,
  simulationState: SimulationState,
): BrowserRenderedActorSnapshot["pixelPosition"] {
  if (!isRenderedEnemyRole(actor.role)) {
    return actor.pixelPosition;
  }

  const enemyActor = requireEnemyActorState(
    simulationState.enemyMotion,
    actor.entityId,
  );

  return {
    x: enemyActor.position.x + actorRenderOffsetPixels,
    y: enemyActor.position.y + actorRenderOffsetPixels,
  };
}

function isRenderedEnemyRole(role: BrowserRenderedActorRole): boolean {
  return isEnemyRole(role);
}

function makeRuntimeRenderedActorTilePosition(
  actor: RuntimeRenderedActor,
  simulationState: SimulationState,
  levelSpec: LevelSpec,
): BrowserRenderedActorSnapshot["tilePosition"] {
  if (!isRenderedEnemyRole(actor.role)) {
    return actor.tilePosition;
  }

  const enemyActor = requireEnemyActorState(
    simulationState.enemyMotion,
    actor.entityId,
  );

  return {
    x: Math.floor(enemyActor.position.x / levelSpec.tileSizePixels),
    y: Math.floor(enemyActor.position.y / levelSpec.tileSizePixels),
  };
}

function makeBrowserActorsSnapshot(
  actors: readonly RuntimeRenderedActor[],
  roleCounts: BrowserRenderedActorRoleCounts,
  simulationState: SimulationState,
  levelSpec: LevelSpec,
): BrowserActorsSnapshot {
  return {
    renderedActorCount: actors.length,
    roleCounts: {
      [ActorRole.Enemy]: roleCounts[ActorRole.Enemy],
      [ActorRole.FlyingEnemy]: roleCounts[ActorRole.FlyingEnemy],
      [ActorRole.ChasingEnemy]: roleCounts[ActorRole.ChasingEnemy],
      [ActorRole.ArmoredEnemy]: roleCounts[ActorRole.ArmoredEnemy],
      [ActorRole.ThrowingEnemy]: roleCounts[ActorRole.ThrowingEnemy],
      [ActorRole.AerialThrowingEnemy]:
        roleCounts[ActorRole.AerialThrowingEnemy],
      [ActorRole.PiranhaPlant]: roleCounts[ActorRole.PiranhaPlant],
      [ActorRole.Coin]: roleCounts[ActorRole.Coin],
      [ActorRole.Item]: roleCounts[ActorRole.Item],
      [ActorRole.PowerUp]: roleCounts[ActorRole.PowerUp],
      [ActorRole.ExtraLife]: roleCounts[ActorRole.ExtraLife],
      [ActorRole.InvincibilityPowerUp]:
        roleCounts[ActorRole.InvincibilityPowerUp],
      [ActorRole.Climbable]: roleCounts[ActorRole.Climbable],
      [ActorRole.Exit]: roleCounts[ActorRole.Exit],
    },
    actors: actors.map((actor) => ({
      entityId: actor.entityId,
      actorId: actor.actorId,
      role: actor.role,
      tilePosition: makeRuntimeRenderedActorTilePosition(
        actor,
        simulationState,
        levelSpec,
      ),
      pixelPosition: makeRuntimeRenderedActorPixelPosition(
        actor,
        simulationState,
      ),
    })),
  };
}

function makeHorizontalInput(
  leftPressed: boolean,
  rightPressed: boolean,
): HorizontalInput {
  if (leftPressed === rightPressed) {
    return HorizontalInput.Neutral;
  }

  if (leftPressed) {
    return HorizontalInput.Left;
  }

  return HorizontalInput.Right;
}

function isRetryKeyboardEvent(event: KeyboardEvent): boolean {
  return event.code === "KeyR" || event.key === "r" || event.key === "R";
}

function isGameplayKeyboardEvent(event: KeyboardEvent): boolean {
  return (
    event.code === "ArrowLeft" ||
    event.code === "ArrowRight" ||
    event.code === "ArrowUp" ||
    event.code === "ArrowDown" ||
    event.code === "Space" ||
    event.code === "ShiftLeft" ||
    event.code === "ShiftRight" ||
    event.code === "KeyR" ||
    event.code === "KeyX"
  );
}

// The ROM never spawns enemy records already behind the screen when an area
// is entered mid-level: at entry page P the initial right edge sits at column
// (P+1)*16, and ProcessEnemyData consumes everything before it without
// spawning. Mirror that on warp arrivals so a pipe exit cannot drop the
// player into enemies the original would never have spawned (e.g. 1-1's tail
// goombas when walking out of 1-2's exit pipe).
const warpCullEnemyRoles: ReadonlySet<string> = new Set([
  ActorRole.Enemy,
  ActorRole.FlyingEnemy,
  ActorRole.ChasingEnemy,
  ActorRole.ArmoredEnemy,
  ActorRole.ThrowingEnemy,
  ActorRole.AerialThrowingEnemy,
  ActorRole.PiranhaPlant,
]);

function cullEnemiesBehindWarpEntry(
  input: LevelSpecInput,
  entryTileX: number,
): LevelSpecInput {
  const cullBeforeColumn = (Math.floor(entryTileX / 16) + 1) * 16;
  const enemyActorIds = new Set(
    input.actorDefinitions
      .filter((definition) => warpCullEnemyRoles.has(definition.role))
      .map((definition) => definition.actorId),
  );
  return {
    ...input,
    actors: input.actors.filter(
      (actor) =>
        !enemyActorIds.has(actor.actorId) || actor.x >= cullBeforeColumn,
    ),
  };
}

function makeRequiredLevelSpec(levelInput: LevelSpecInput): LevelSpec {
  const result = makeLevelSpec(levelInput);

  if (!result.ok) {
    throw new Error("First authored level must validate before browser boot.");
  }

  return result.value;
}

function makeRequiredInitialSimulationState(
  levelSpec: LevelSpec,
  browserGameBootstrap: BrowserGameBootstrap,
): SimulationState {
  const result = makeInitialSimulationStateWithPlayerVitality(
    initialFrameDurationMilliseconds,
    levelSpec,
    resolveMovementConstants(
      browserGameBootstrap.theme,
      browserGameBootstrap.exaggeratedReactions ?? false,
      browserGameBootstrap.godMode ?? false,
    ),
    browserGameBootstrap.initialPlayerVitality,
    browserGameBootstrap.playerCount ?? 1,
  );

  if (!result.ok) {
    throw new Error("Initial browser simulation state must validate.");
  }

  return result.value;
}

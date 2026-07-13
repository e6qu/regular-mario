import type { LevelSpecInput } from "../engine/domain/level-spec";
import { armoredEnemyRouteLevelInput } from "../engine/levels/armored-enemy-route-level";
import { castleClearRouteLevelInput } from "../engine/levels/castle-clear-route-level";
import { cavernRouteLevelInput } from "../engine/levels/cavern-route-level";
import { chasingEnemyRouteLevelInput } from "../engine/levels/chasing-enemy-route-level";
import { coinBlockRouteLevelInput } from "../engine/levels/coin-block-route-level";
import { enemyGauntletRouteLevelInput } from "../engine/levels/enemy-gauntlet-route-level";
import { enemyStompRouteLevelInput } from "../engine/levels/enemy-stomp-route-level";
import { finishRouteLevelInput } from "../engine/levels/finish-route-level";
import { runtimeLevelTimerId } from "../engine/simulation/level-timer-state";
import { firstAuthoredLevelInput } from "../engine/levels/first-authored-level";
import { flyingEnemyRouteLevelInput } from "../engine/levels/flying-enemy-route-level";
import { hazardOnlyFeedbackLevelInput } from "../engine/levels/hazard-only-feedback-level";
import { importedVglcRouteLevelInput } from "../engine/levels/imported-vglc-route-level";
import { multiLevelRouteSequence } from "../engine/levels/multi-level-route-level";
import { pipeRouteLevelInput } from "../engine/levels/pipe-route-level";
import {
  warpRouteLevelInput,
  warpRouteUndergroundLevelInput,
  warpRouteUndergroundLevelName,
} from "../engine/levels/warp-route-level";
import { warpZoneRouteLevelInput } from "../engine/levels/warp-zone-route-level";
import { powerUpRouteLevelInput } from "../engine/levels/power-up-route-level";
import { projectileRouteLevelInput } from "../engine/levels/projectile-route-level";
import { showcaseSequence } from "../engine/levels/showcase-level";
import {
  makeFirePlayerVitalityState,
  makeInitialPlayerVitalityState,
  makePoweredPlayerVitalityState,
  type PlayerVitalityState,
} from "../engine/simulation/player-vitality";
import type { UserAssetBundle } from "./user-asset-loader";

enum BrowserLevelKey {
  ArmoredEnemyRoute = "armored-enemy-route",
  ChasingEnemyRoute = "chasing-enemy-route",
  CoinBlockRoute = "coin-block-route",
  EnemyGauntletRoute = "enemy-gauntlet-route",
  EnemyStompRoute = "enemy-stomp-route",
  CastleClearRoute = "castle-clear-route",
  FinishRoute = "finish-route",
  TimedFinishRoute = "timed-finish-route",
  FirstAuthored = "first-authored",
  FlyingEnemyRoute = "flying-enemy-route",
  HazardOnlyFeedback = "hazard-only-feedback",
  MultiLevelRoute = "multi-level-route",
  MultiLevelPoweredRoute = "multi-level-powered-route",
  PipeRoute = "pipe-route",
  PoweredContactRoute = "powered-contact-route",
  PowerUpRoute = "power-up-route",
  ProjectileRoute = "projectile-route",
  ShowcaseRoute = "showcase-route",
  ImportedVglcRoute = "imported-vglc-route",
  CavernRoute = "cavern-route",
  WarpRoute = "warp-route",
  WarpZoneRoute = "warp-zone-route",
}

export type LevelTheme = "overworld" | "underground" | "castle" | "water";

export type BrowserGameBootstrap = {
  readonly levelInput: LevelSpecInput;
  readonly levelSequence: readonly LevelSpecInput[] | undefined;
  // Levels addressable by name, so a pipe that warps to a named target level
  // (e.g. an underground sub-area) can be loaded on entry.
  readonly warpLevelsByName?: ReadonlyMap<string, LevelSpecInput>;
  // Each warp-reachable level's world theme, so warping into a sub-section can
  // switch the palette/backdrop/physics to match it.
  readonly warpLevelThemesByName?: ReadonlyMap<string, LevelTheme>;
  readonly levelIndex: number;
  // When true, the run holds on frame 0 behind a "press any key" prompt until the
  // player presses a key (used by the served content boot, whose first load can
  // be slow). Fixtures leave it unset so they start immediately.
  readonly awaitStart?: boolean;
  // When provided, the in-game replay/death overlay shows an exit action (and
  // ESC works in-game) that tears the game down and runs this — returning to the
  // start menu, or back to the editor when a level was launched from there.
  readonly onExitToMenu?: () => void;
  // When provided, the finish overlay offers a "Next level" action that tears the
  // game down and launches the next level (the following one in the map set).
  // The scene passes the main level the run currently belongs to, so that a
  // warp-zone jump mid-run advances from the warped-to world, not the level
  // the session started on.
  readonly onAdvanceToNextLevel?: (currentMainLevelName?: string) => void;
  // Classic HUD labels per main level name, so a warp-zone jump can retitle
  // the HUD (e.g. smb-4-1 -> "4-1").
  readonly worldLevelLabelByName?: ReadonlyMap<string, string>;
  // The classic "world-level" label for the HUD (e.g. "1-2"); falls back to the
  // level name when absent.
  readonly worldLevelLabel?: string;
  // Label for that exit action / the ESC hint (defaults to "Menu").
  readonly exitLabel?: string;
  // Render a plain sky instead of the SMB hills/bushes/clouds parallax. Used for
  // custom/editor levels, whose opaque "sky" tiles would otherwise let the
  // decoration leak through the transparent tops of foreground tiles (spikes).
  readonly plainBackground?: boolean;
  // Colour theme for the tiles + backdrop (overworld / underground / castle).
  readonly theme?: LevelTheme;
  readonly initialPlayerVitality: PlayerVitalityState;
  readonly userAssetBundle: UserAssetBundle | undefined;
  readonly viewport: BrowserGameViewport;
  readonly userLevelVisualName: string | undefined;
  // Game-mode toggle: when false, the exaggerated reaction overlays (the "ouch"
  // head-hold and squashed-enemy burst) are suppressed for a calmer classic feel.
  readonly exaggeratedReactions?: boolean;
  // When true, the melody is sung as a baritone "ba ba ba" vocal (the shabby
  // soundtrack); otherwise the original chiptune melody plays.
  readonly vocalSoundtrack?: boolean;
};

export type BrowserGameViewport = {
  readonly widthPixels: number;
  readonly heightPixels: number;
};

const browserLevelSearchParameterName = "browserLevel";
const authoredFixtureViewport: BrowserGameViewport = {
  widthPixels: 400,
  heightPixels: 120,
};
export const classicCompatibilityViewport: BrowserGameViewport = {
  widthPixels: 256,
  heightPixels: 240,
};

export function selectBrowserLevelInput(search: string): LevelSpecInput {
  return selectBrowserGameBootstrap(search).levelInput;
}

export function selectBrowserGameBootstrap(
  search: string,
): BrowserGameBootstrap {
  const searchParameters = new URLSearchParams(search);
  const selectedLevelKeys = searchParameters.getAll(
    browserLevelSearchParameterName,
  );

  if (selectedLevelKeys.length === 0) {
    return makeBrowserGameBootstrap(BrowserLevelKey.FirstAuthored);
  }

  if (selectedLevelKeys.length !== 1) {
    throw new Error("Browser level selection must be provided at most once.");
  }

  const selectedLevelKey = selectedLevelKeys[0];

  if (selectedLevelKey === undefined) {
    throw new Error("Browser level selection is missing after validation.");
  }

  return makeBrowserGameBootstrap(makeBrowserLevelKey(selectedLevelKey));
}

const browserLevelKeyValues: readonly BrowserLevelKey[] =
  Object.values(BrowserLevelKey);

function isBrowserLevelKey(value: string): value is BrowserLevelKey {
  return browserLevelKeyValues.includes(value as BrowserLevelKey);
}

function makeBrowserLevelKey(value: string): BrowserLevelKey {
  if (!isBrowserLevelKey(value)) {
    throw new Error(`Unknown browser level selection: ${value}`);
  }

  return value;
}

function makeSingleLevelBootstrap(
  levelInput: LevelSpecInput,
  initialPlayerVitality: PlayerVitalityState,
  theme?: LevelTheme,
): BrowserGameBootstrap {
  return {
    levelInput,
    levelSequence: undefined,
    levelIndex: 0,
    initialPlayerVitality,
    userAssetBundle: undefined,
    viewport: authoredFixtureViewport,
    userLevelVisualName: undefined,
    ...(theme !== undefined ? { theme } : {}),
  };
}

function makeBrowserGameBootstrap(
  levelKey: BrowserLevelKey,
): BrowserGameBootstrap {
  switch (levelKey) {
    case BrowserLevelKey.ArmoredEnemyRoute:
      return makeSingleLevelBootstrap(
        armoredEnemyRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.ChasingEnemyRoute:
      return makeSingleLevelBootstrap(
        chasingEnemyRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.CoinBlockRoute:
      return makeSingleLevelBootstrap(
        coinBlockRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.EnemyGauntletRoute:
      return makeSingleLevelBootstrap(
        enemyGauntletRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.EnemyStompRoute:
      return makeSingleLevelBootstrap(
        enemyStompRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.CastleClearRoute:
      return makeSingleLevelBootstrap(
        castleClearRouteLevelInput,
        makeInitialPlayerVitalityState(),
        "castle",
      );
    case BrowserLevelKey.FinishRoute:
      return makeSingleLevelBootstrap(
        finishRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.TimedFinishRoute:
      // The finish route with a generous timer, so a test can observe the
      // end-of-level time-bonus countdown (time drains, score climbs).
      return makeSingleLevelBootstrap(
        {
          ...finishRouteLevelInput,
          levelTimers: [{ timerId: runtimeLevelTimerId, frames: 6000 }],
        },
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.FirstAuthored:
      return makeSingleLevelBootstrap(
        firstAuthoredLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.FlyingEnemyRoute:
      return makeSingleLevelBootstrap(
        flyingEnemyRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.HazardOnlyFeedback:
      return makeSingleLevelBootstrap(
        hazardOnlyFeedbackLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.MultiLevelRoute:
      return {
        levelInput: multiLevelRouteSequence[0]!,
        levelSequence: multiLevelRouteSequence,
        levelIndex: 0,
        initialPlayerVitality: makeInitialPlayerVitalityState(),
        userAssetBundle: undefined,
        viewport: authoredFixtureViewport,
        userLevelVisualName: undefined,
      };
    case BrowserLevelKey.MultiLevelPoweredRoute:
      // The same two-level sequence but starting the player powered, so a test
      // can verify the power tier carries across a level advance.
      return {
        levelInput: multiLevelRouteSequence[0]!,
        levelSequence: multiLevelRouteSequence,
        levelIndex: 0,
        initialPlayerVitality: makePoweredPlayerVitalityState(),
        userAssetBundle: undefined,
        viewport: authoredFixtureViewport,
        userLevelVisualName: undefined,
      };
    case BrowserLevelKey.PoweredContactRoute:
      return makeSingleLevelBootstrap(
        firstAuthoredLevelInput,
        makePoweredPlayerVitalityState(),
      );
    case BrowserLevelKey.PowerUpRoute:
      return makeSingleLevelBootstrap(
        powerUpRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.PipeRoute:
      return makeSingleLevelBootstrap(
        pipeRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.ProjectileRoute:
      // Firing projectiles requires the fire tier (fire flower), so the
      // projectile fixture must start Mario there.
      return makeSingleLevelBootstrap(
        projectileRouteLevelInput,
        makeFirePlayerVitalityState(),
      );
    case BrowserLevelKey.ShowcaseRoute:
      return {
        levelInput: showcaseSequence[0]!,
        levelSequence: showcaseSequence,
        levelIndex: 0,
        initialPlayerVitality: makeInitialPlayerVitalityState(),
        userAssetBundle: undefined,
        viewport: authoredFixtureViewport,
        userLevelVisualName: undefined,
      };
    case BrowserLevelKey.ImportedVglcRoute:
      return makeSingleLevelBootstrap(
        importedVglcRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.CavernRoute:
      return makeSingleLevelBootstrap(
        cavernRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    case BrowserLevelKey.WarpRoute:
      return {
        ...makeSingleLevelBootstrap(
          warpRouteLevelInput,
          makeInitialPlayerVitalityState(),
        ),
        warpLevelsByName: new Map([
          [warpRouteUndergroundLevelName, warpRouteUndergroundLevelInput],
        ]),
      };
    case BrowserLevelKey.WarpZoneRoute:
      return makeSingleLevelBootstrap(
        warpZoneRouteLevelInput,
        makeInitialPlayerVitalityState(),
      );
    default: {
      const invalidLevelKey: never = levelKey;
      throw new Error(
        `Invalid browser level selection: ${String(invalidLevelKey)}`,
      );
    }
  }
}

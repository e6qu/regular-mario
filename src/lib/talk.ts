// Regular Mario's talk mode as a library: mount a presentation (a talk script, as
// written by e6qu.github.io's deck builder) into any element of a page, as an
// original platformer level with one room per slide.
//
//   import { mountTalk } from "regular-mario";
//   const talk = await mountTalk(element, talkJson, { slide: 12, onSlideChange });
//   talk.goTo(13);
//   talk.dispose();
//
// The castaway skin's sprites ship next to this module as talk-skin.json; bundlers
// that understand `new URL(…, import.meta.url)` copy it with the build. Sounds and
// music are synthesised, so there is nothing else to fetch.
import Phaser from "phaser";

import {
  parseUserAssetManifest,
  type UserAssetManifestInput,
} from "../engine/domain/user-asset-manifest";
import { makeInitialPlayerVitalityState } from "../engine/simulation/player-vitality";
import { classicCompatibilityViewport } from "../shell/browser-level-selection";
import {
  decodeContentPack,
  rewritePackedSources,
  type ContentPackFiles,
} from "../shell/content-pack";
import { createGameConfig } from "../shell/create-game-config";
import { configureGameCanvasForAccessibility } from "../shell/game-canvas-accessibility";
import { createTalkController, prepareTalk } from "../shell/talk/talk-mode";
import { parseTalkScript } from "../shell/talk/talk-script";
import {
  defaultMaxFileBytes,
  defaultMaxTotalBytes,
  loadUserAssetBundle,
  type UserAssetBundle,
} from "../shell/user-asset-loader";

export * from "./talk-script";

export interface MountTalkOptions {
  /** The 1-based slide to start on (default 1). */
  readonly slide?: number;
  /** Called with the 1-based slide whenever the castaway enters another slide's room. */
  readonly onSlideChange?: (slide: number) => void;
  /** Called when the player leaves the game (its pause menu's exit). */
  readonly onExit?: () => void;
  /** Where the skin pack lives, if not next to this module. */
  readonly skinUrl?: string | URL;
}

export interface MountedTalk {
  /** Walks to a 1-based slide; clamped to the talk. */
  readonly goTo: (slide: number) => void;
  /** Stops the game and removes everything it added to the page. */
  readonly dispose: () => void;
}

// The skin pack: a manifest whose sources name files in the pack, plus those files.
interface SkinPack extends ContentPackFiles {
  readonly manifest: UserAssetManifestInput;
}

const skinCache = new Map<string, Promise<UserAssetBundle>>();

async function loadSkin(url: string): Promise<UserAssetBundle> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `The talk's artwork could not be loaded (HTTP ${String(response.status)}).`,
    );
  }
  const pack = (await response.json()) as SkinPack;
  const files = decodeContentPack(pack);
  if (files === undefined) {
    throw new Error("The talk's artwork pack is malformed.");
  }
  const names = new Set(files.map((file) => file.name));
  const manifest = parseUserAssetManifest(
    rewritePackedSources(pack.manifest, names) as UserAssetManifestInput,
  );
  if (!manifest.ok) {
    throw new Error("The talk's artwork manifest is invalid.");
  }
  const loaded = await loadUserAssetBundle(manifest.value, files, {
    maxFileBytes: defaultMaxFileBytes,
    maxTotalBytes: defaultMaxTotalBytes,
  });
  if (!loaded.ok) {
    throw new Error(
      loaded.errors[0]?.message ?? "The talk's artwork could not be read.",
    );
  }
  return loaded.bundle;
}

function skin(url: string): Promise<UserAssetBundle> {
  let bundle = skinCache.get(url);
  if (bundle === undefined) {
    bundle = loadSkin(url);
    // a failed load is not cached, so a retry can succeed
    bundle.catch(() => skinCache.delete(url));
    skinCache.set(url, bundle);
  }
  return bundle;
}

/**
 * Mounts `talk` (a parsed or raw talk script) into `host`, which should have a size:
 * the game fills it. Rejects if the script is invalid or the artwork can't load.
 */
export async function mountTalk(
  host: HTMLElement,
  talk: unknown,
  options: MountTalkOptions = {},
): Promise<MountedTalk> {
  const prepared = prepareTalk(parseTalkScript(talk));
  const bundle = await skin(
    String(options.skinUrl ?? new URL("./talk-skin.json", import.meta.url)),
  );
  const viewport = document.createElement("div");
  viewport.style.cssText = "position:relative;width:100%;height:100%;";
  host.append(viewport);
  const controller = createTalkController(
    prepared,
    (options.slide ?? 1) - 1,
    host.ownerDocument,
    {
      host,
      ...(options.onSlideChange === undefined
        ? {}
        : {
            onSlideChange: (index: number) =>
              options.onSlideChange?.(index + 1),
          }),
    },
  );
  let game: Phaser.Game;
  try {
    game = new Phaser.Game(
      createGameConfig(viewport, {
        levelInput: controller.levelInput,
        levelSequence: undefined,
        levelIndex: 0,
        initialPlayerVitality: makeInitialPlayerVitalityState(),
        userAssetBundle: bundle,
        viewport: classicCompatibilityViewport,
        userLevelVisualName: undefined,
        exitLabel: "Exit",
        awaitStart: false,
        plainBackground: true,
        theme: "overworld",
        talk: controller.hooks,
        godMode: true,
        onExitToMenu: () => options.onExit?.(),
      }),
    );
  } catch (error) {
    controller.dispose();
    viewport.remove();
    throw error;
  }
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scale.refresh();
    configureGameCanvasForAccessibility(game.canvas);
    game.canvas.focus();
  });
  return {
    goTo: (slide) => controller.goTo(slide - 1),
    dispose: () => {
      controller.dispose();
      game.destroy(true);
      viewport.remove();
    },
  };
}

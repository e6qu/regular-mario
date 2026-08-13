import Phaser from "phaser";
import { MultiplayerGamePhase } from "../multiplayer/game-runner";

import { requireCharacterForMultiplayerAvatar } from "../multiplayer/avatar-character";
import type { MultiplayerRenderedSnapshot } from "../multiplayer/rendered-snapshot";
import type { SimulationState } from "../engine/simulation/simulation-state";
import {
  makeFirePlayerVitalityState,
  makeInitialPlayerVitalityState,
} from "../engine/simulation/player-vitality";
import { validateDefaultVglcSmbSpriteCoverage } from "./sprite-coverage";
import { selectBrowserGameBootstrap } from "./browser-level-selection";
import { createGameConfig } from "./create-game-config";
import { BootScene } from "./scenes/boot-scene";
import type { UserAssetBundle } from "./user-asset-loader";

export type MultiplayerPhaserRenderer = {
  readonly canvas: HTMLCanvasElement;
  /**
   * Present an authoritative receipt. The decoded world is supplied by the
   * caller, which already had to decode it: decoding is a full serialise and
   * reparse of the entire state, and this adapter used to do it twice more
   * per packet — once purely to read a player count it already had.
   */
  render(
    snapshot: MultiplayerRenderedSnapshot,
    decodedState: SimulationState,
  ): void;
  presentPredictedSimulationState(
    state: SimulationState,
    cameraLeftPixels: number,
  ): void;
  presentPlayerPositions(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void;
  beginCompletionPresentation(): void;
  destroy(): void;
};

function requireRemoteScene(game: Phaser.Game): BootScene {
  const scene = game.scene.scenes[0];
  if (!(scene instanceof BootScene)) {
    throw new Error("Authoritative multiplayer scene did not boot.");
  }
  return scene;
}

/**
 * The remote client deliberately uses the exact BootScene as local play. The
 * server supplies each complete simulation frame; this scene renders it but is
 * prohibited from advancing its own copy of the simulation.
 */
export function makeMultiplayerPhaserRenderer(
  parent: HTMLElement,
  levelId: string,
  revengeMode: boolean,
  userAssetBundle: UserAssetBundle,
): MultiplayerPhaserRenderer {
  // Phaser may leave a boot-time canvas attached while replacing a scene. The
  // multiplayer host owns exactly one authoritative canvas; stale local-seed
  // canvases otherwise sit above/below the live party and make state appear
  // missing despite a correct network frame.
  document
    .querySelectorAll<HTMLCanvasElement>(
      '[data-role="multiplayer-phaser-canvas"]',
    )
    .forEach((canvas) => canvas.remove());
  parent.replaceChildren();
  const selectedLevel = userAssetBundle.levels.get(levelId);
  if (selectedLevel === undefined) {
    throw new Error(
      `Authoritative multiplayer level "${levelId}" is absent from the loaded content bundle.`,
    );
  }
  const coverageErrors = validateDefaultVglcSmbSpriteCoverage(
    userAssetBundle.manifest,
    selectedLevel.levelSpecInput,
  );
  if (coverageErrors.length > 0) {
    throw new Error(coverageErrors.join(" "));
  }
  // The browser and the server both consume the composed release content-set.
  // Do not pass through the query-route bootstrap here: that route contains
  // small mechanics fixtures and previously replaced a real multiplayer map
  // with its unrelated test layout.
  const bootstrap = {
    ...selectBrowserGameBootstrap(""),
    levelInput: selectedLevel.levelSpecInput,
    levelSequence: undefined,
    warpLevelsByName: new Map(
      [...userAssetBundle.levels].map(([name, level]) => [
        name,
        level.levelSpecInput,
      ]),
    ),
    warpLevelThemesByName: new Map(
      [...userAssetBundle.levels].flatMap(([name, level]) =>
        level.theme === undefined ? [] : [[name, level.theme] as const],
      ),
    ),
    levelIndex: 0,
    userLevelVisualName: selectedLevel.name,
    worldLevelLabel: selectedLevel.name.replace(/^smb-/, ""),
    initialPlayerVitality:
      selectedLevel.theme === "water"
        ? makeFirePlayerVitalityState()
        : makeInitialPlayerVitalityState(),
    ...(selectedLevel.theme === undefined
      ? {}
      : { theme: selectedLevel.theme }),
  };
  const game = new Phaser.Game(
    createGameConfig(parent, {
      ...bootstrap,
      revengeMode,
      userAssetBundle,
      authoritativeRenderOnly: true,
      awaitStart: false,
    }),
  );
  const canvas = game.canvas;
  let latestSnapshot: MultiplayerRenderedSnapshot | undefined;
  let latestDecodedState: SimulationState | undefined;
  let latestPlayerPositions:
    | readonly { readonly x: number; readonly y: number }[]
    | undefined;
  let latestPresentationState:
    | { readonly state: SimulationState; readonly cameraLeftPixels: number }
    | undefined;
  let ready = false;
  let destroyed = false;
  let completionPresentationRequested = false;
  const waitForSceneReadiness = (): void => {
    if (ready || destroyed) {
      return;
    }
    const candidate = game.scene.scenes[0];
    if (
      candidate instanceof BootScene &&
      candidate.isAuthoritativeRenderSceneReady()
    ) {
      ready = true;
      canvas.tabIndex = 0;
      canvas.focus();
      if (latestSnapshot !== undefined && latestDecodedState !== undefined) {
        candidate.setPredictedPresentationEnabled(
          latestSnapshot.phase === MultiplayerGamePhase.Playing,
        );
        applySnapshot(
          candidate,
          latestSnapshot,
          latestDecodedState,
          latestSnapshot.phase === MultiplayerGamePhase.Playing
            ? (latestPresentationState?.cameraLeftPixels ?? 0)
            : latestSnapshot.cameraLeftPixels,
        );
      }
      if (latestPresentationState !== undefined) {
        candidate.applyPredictedSimulationState(
          latestPresentationState.state,
          latestPresentationState.cameraLeftPixels,
        );
      }
      if (latestPlayerPositions !== undefined) {
        candidate.applyAuthoritativePlayerPositions(latestPlayerPositions);
      }
      if (completionPresentationRequested) {
        candidate.beginAuthoritativeCompletionPresentation();
      }
      return;
    }
    // A Phaser Game can emit its Core READY event synchronously during
    // construction, before this adapter can subscribe. Poll the durable
    // BootScene receipt instead of relying on a lossy lifecycle event.
    window.requestAnimationFrame(waitForSceneReadiness);
  };
  window.requestAnimationFrame(waitForSceneReadiness);
  canvas.setAttribute("aria-label", "Authoritative multiplayer game view");
  canvas.setAttribute("data-role", "multiplayer-phaser-canvas");
  return {
    canvas,
    render(snapshot, decodedState) {
      latestSnapshot = snapshot;
      latestDecodedState = decodedState;
      game.canvas.setAttribute(
        "data-authoritative-frame",
        String(snapshot.frame),
      );
      game.canvas.setAttribute(
        "data-authoritative-player-count",
        String(snapshot.players.length),
      );
      game.canvas.setAttribute(
        "data-authoritative-simulation-player-count",
        String(decodedState.players.length),
      );
      game.canvas.setAttribute("data-authoritative-level-id", snapshot.levelId);
      game.canvas.setAttribute(
        "data-authoritative-camera-left",
        String(snapshot.cameraLeftPixels),
      );
      if (ready) {
        const scene = requireRemoteScene(game);
        // A pending rAF prediction can otherwise paint over a just-paused
        // canonical frame, making two clients show different worlds despite
        // receiving the same server snapshot.
        scene.setPredictedPresentationEnabled(
          snapshot.phase === MultiplayerGamePhase.Playing,
        );
        const presentationCameraLeftPixels =
          snapshot.phase === MultiplayerGamePhase.Playing
            ? (latestPresentationState?.cameraLeftPixels ?? 0)
            : snapshot.cameraLeftPixels;
        applySnapshot(
          scene,
          snapshot,
          decodedState,
          presentationCameraLeftPixels,
        );
      }
    },
    presentPredictedSimulationState(state, cameraLeftPixels) {
      latestPresentationState = { state, cameraLeftPixels };
      if (ready) {
        requireRemoteScene(game).applyPredictedSimulationState(
          state,
          cameraLeftPixels,
        );
      }
    },
    presentPlayerPositions(positions) {
      latestPlayerPositions = positions;
      if (ready) {
        requireRemoteScene(game).applyAuthoritativePlayerPositions(positions);
      }
    },
    beginCompletionPresentation() {
      completionPresentationRequested = true;
      if (ready) {
        requireRemoteScene(game).beginAuthoritativeCompletionPresentation();
      }
    },
    destroy() {
      destroyed = true;
      // Silence whatever scene exists, ready or not. The readiness gate meant a
      // game torn down mid-boot — the common case when a player leaves quickly —
      // was never told to stop, and Phaser's destruction is asynchronous, so
      // nothing else silenced it either. The scene's own teardown then releases
      // the AudioContext for good.
      const scene = game.scene.scenes[0];
      if (scene instanceof BootScene) {
        scene.releaseAuthoritativeRenderAudio();
      }
      game.destroy(true);
      // Phaser's asynchronous destruction does not consistently detach the
      // canvas before a newly advanced server course mounts its replacement.
      // The shell must guarantee exactly one authoritative canvas per client.
      canvas.remove();
    },
  };
}

function applySnapshot(
  scene: BootScene,
  snapshot: MultiplayerRenderedSnapshot,
  decodedState: SimulationState,
  presentationCameraLeftPixels: number,
): void {
  scene.applyAuthoritativeSimulationState(
    decodedState,
    presentationCameraLeftPixels,
  );
  const orderedPlayers = [...snapshot.players].sort(
    (left, right) => left.slot - right.slot,
  );
  const primary = orderedPlayers[0];
  if (primary === undefined) {
    throw new Error("Authoritative multiplayer snapshot has no players.");
  }
  scene.applyAuthoritativePlayerPresentation(
    requireCharacterForMultiplayerAvatar(primary.avatarId),
    primary.nickname,
    orderedPlayers.slice(1).map((player) => ({
      character: requireCharacterForMultiplayerAvatar(player.avatarId),
      nickname: player.nickname,
    })),
  );
}

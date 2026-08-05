import Phaser from "phaser";

import { requireCharacterForMultiplayerAvatar } from "../multiplayer/avatar-character";
import { decodeMultiplayerSimulationState } from "../multiplayer/simulation-wire";
import type { MultiplayerRenderedSnapshot } from "../multiplayer/rendered-snapshot";
import { selectBrowserGameBootstrap } from "./browser-level-selection";
import { createGameConfig } from "./create-game-config";
import { BootScene } from "./scenes/boot-scene";
import type { UserAssetBundle } from "./user-asset-loader";

export type MultiplayerPhaserRenderer = {
  readonly canvas: HTMLCanvasElement;
  render(snapshot: MultiplayerRenderedSnapshot): void;
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
  const bootstrap = selectBrowserGameBootstrap(
    `?browserLevel=${encodeURIComponent(levelId)}`,
  );
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
  let ready = false;
  let destroyed = false;
  let paintAnimationFrame: number | undefined;
  const scheduleAuthoritativePaint = (): void => {
    if (paintAnimationFrame !== undefined || destroyed) {
      return;
    }
    paintAnimationFrame = window.requestAnimationFrame(() => {
      paintAnimationFrame = undefined;
      if (destroyed || !ready) {
        return;
      }
      renderAuthoritativeFrameNow(game);
    });
  };
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
      if (latestSnapshot !== undefined) {
        applySnapshot(candidate, latestSnapshot);
        scheduleAuthoritativePaint();
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
    render(snapshot) {
      latestSnapshot = snapshot;
      const decodedState = decodeMultiplayerSimulationState(
        snapshot.simulationState,
      );
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
        applySnapshot(requireRemoteScene(game), snapshot);
        scheduleAuthoritativePaint();
      }
    },
    destroy() {
      destroyed = true;
      if (paintAnimationFrame !== undefined) {
        window.cancelAnimationFrame(paintAnimationFrame);
      }
      game.destroy(true);
      // Phaser's asynchronous destruction does not consistently detach the
      // canvas before a newly advanced server course mounts its replacement.
      // The shell must guarantee exactly one authoritative canvas per client.
      canvas.remove();
    },
  };
}

/**
 * An authoritative scene deliberately does no local simulation in update().
 * Paint immediately after a network frame so its visible canvas is driven by
 * server state even when the browser has throttled Phaser's normal RAF loop.
 */
function renderAuthoritativeFrameNow(game: Phaser.Game): void {
  // Use Phaser's complete public frame path, rather than calling only its
  // renderer internals. Authoritative scenes intentionally return from their
  // own update(), but Phaser's scene/camera systems still need their normal
  // update phase to prepare the camera and display list for the new frame.
  game.step(window.performance.now(), 0);
  const scene = requireRemoteScene(game);
  game.canvas.setAttribute(
    "data-post-render-camera-left",
    String(scene.cameras.main.scrollX),
  );
  game.canvas.setAttribute(
    "data-post-render-primary-queued",
    String(scene.primaryObjectsWereQueuedForRender()),
  );
  const cameraMatrix = (
    scene.cameras.main as unknown as {
      readonly matrix: { readonly e: number; readonly f: number };
    }
  ).matrix;
  game.canvas.setAttribute(
    "data-post-render-camera-matrix",
    JSON.stringify({
      e: cameraMatrix.e,
      f: cameraMatrix.f,
      zoomX: scene.cameras.main.zoomX,
      zoomY: scene.cameras.main.zoomY,
    }),
  );
  const rendererCanvas =
    "gameCanvas" in game.renderer
      ? game.renderer.gameCanvas
      : game.renderer.canvas;
  game.canvas.setAttribute(
    "data-renderer-owns-visible-canvas",
    String(rendererCanvas === game.canvas),
  );
  game.canvas.setAttribute(
    "data-post-render-game-paused",
    String(game.isPaused),
  );
  game.canvas.setAttribute(
    "data-post-render-loop-running",
    String(game.loop.running),
  );
  const context = game.canvas.getContext("2d");
  if (context !== null) {
    const pixels = context.getImageData(
      0,
      0,
      game.canvas.width,
      game.canvas.height,
    ).data;
    let checksum = 0;
    // A bounded sparse checksum is diagnostic metadata only. It makes a
    // successful object/property update distinguishable from an actual paint
    // update without retaining a screenshot in the DOM.
    const stride = Math.max(4, Math.floor(pixels.length / 2048 / 4) * 4);
    for (let index = 0; index < pixels.length; index += stride) {
      checksum = (checksum * 31 + (pixels[index] ?? 0)) >>> 0;
    }
    game.canvas.setAttribute(
      "data-post-render-pixel-checksum",
      String(checksum),
    );
  }
}

function applySnapshot(
  scene: BootScene,
  snapshot: MultiplayerRenderedSnapshot,
): void {
  scene.applyAuthoritativeSimulationState(
    decodeMultiplayerSimulationState(snapshot.simulationState),
    snapshot.cameraLeftPixels,
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
    orderedPlayers.slice(1).map((player) => ({
      character: requireCharacterForMultiplayerAvatar(player.avatarId),
      nickname: player.nickname,
    })),
  );
}

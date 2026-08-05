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
  game.events.once(Phaser.Core.Events.READY, () => {
    const scene = requireRemoteScene(game);
    const markReady = () => {
      ready = true;
      canvas.tabIndex = 0;
      canvas.focus();
      if (latestSnapshot !== undefined && !destroyed) {
        applySnapshot(scene, latestSnapshot);
      }
    };
    // Core READY is emitted after BootScene.create(). The prior event-only
    // bridge could miss a scene-ready event emitted earlier in the same boot
    // turn, permanently leaving the visible scene on its one-player seed.
    // Applying the retained latest frame here is therefore both safe and
    // guaranteed to reach the constructed scene.
    markReady();
  });
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
      if (ready) {
        applySnapshot(requireRemoteScene(game), snapshot);
      }
    },
    destroy() {
      destroyed = true;
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

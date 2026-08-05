import Phaser from "phaser";

import { requireCharacterForMultiplayerAvatar } from "../multiplayer/avatar-character";
import { decodeMultiplayerSimulationState } from "../multiplayer/simulation-wire";
import type { MultiplayerRenderedSnapshot } from "../multiplayer/rendered-snapshot";
import { selectBrowserGameBootstrap } from "./browser-level-selection";
import { createGameConfig } from "./create-game-config";
import {
  authoritativeRenderSceneReadyEvent,
  BootScene,
} from "./scenes/boot-scene";
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
    // A scene becomes "active" before BootScene.create() has created its
    // player and level render objects. Applying a server frame during that
    // interval is then overwritten by create()'s empty local seed state,
    // leaving a valid background with no party or level objects. The scene's
    // explicit signal is emitted only after those render objects exist.
    scene.events.once(authoritativeRenderSceneReadyEvent, markReady);
  });
  canvas.setAttribute("aria-label", "Authoritative multiplayer game view");
  canvas.setAttribute("data-role", "multiplayer-phaser-canvas");
  return {
    canvas,
    render(snapshot) {
      latestSnapshot = snapshot;
      game.canvas.setAttribute(
        "data-authoritative-frame",
        String(snapshot.frame),
      );
      game.canvas.setAttribute(
        "data-authoritative-player-count",
        String(snapshot.players.length),
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

import Phaser from "phaser";

import { requireCharacterForMultiplayerAvatar } from "../multiplayer/avatar-character";
import { decodeMultiplayerSimulationState } from "../multiplayer/simulation-wire";
import type { MultiplayerRenderedSnapshot } from "../multiplayer/rendered-snapshot";
import { selectBrowserGameBootstrap } from "./browser-level-selection";
import { createGameConfig } from "./create-game-config";
import { BootScene } from "./scenes/boot-scene";

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
): MultiplayerPhaserRenderer {
  const bootstrap = selectBrowserGameBootstrap(
    `?browserLevel=${encodeURIComponent(levelId)}`,
  );
  const game = new Phaser.Game(
    createGameConfig(parent, {
      ...bootstrap,
      revengeMode,
      authoritativeRenderOnly: true,
      awaitStart: false,
    }),
  );
  let latestSnapshot: MultiplayerRenderedSnapshot | undefined;
  let ready = false;
  let destroyed = false;
  game.events.once(Phaser.Core.Events.READY, () => {
    ready = true;
    if (latestSnapshot !== undefined && !destroyed) {
      applySnapshot(requireRemoteScene(game), latestSnapshot);
    }
  });
  game.canvas.setAttribute("aria-label", "Authoritative multiplayer game view");
  game.canvas.setAttribute("data-role", "multiplayer-phaser-canvas");
  return {
    canvas: game.canvas,
    render(snapshot) {
      latestSnapshot = snapshot;
      if (ready) {
        applySnapshot(requireRemoteScene(game), snapshot);
      }
    },
    destroy() {
      destroyed = true;
      game.destroy(true);
    },
  };
}

function applySnapshot(
  scene: BootScene,
  snapshot: MultiplayerRenderedSnapshot,
): void {
  scene.applyAuthoritativeSimulationState(
    decodeMultiplayerSimulationState(snapshot.simulationState),
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

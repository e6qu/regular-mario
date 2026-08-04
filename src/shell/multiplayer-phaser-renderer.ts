import Phaser from "phaser";

import type { MultiplayerRenderedSnapshot } from "../multiplayer/rendered-snapshot";

const multiplayerRenderScale = 3;
const multiplayerViewportWorldWidth = 256;
const multiplayerCanvasWidth =
  multiplayerViewportWorldWidth * multiplayerRenderScale;
const multiplayerCanvasHeight = 240;

export type MultiplayerPhaserRenderer = {
  readonly canvas: HTMLCanvasElement;
  render(
    snapshot: MultiplayerRenderedSnapshot,
    localPlayerId: string,
    predictedPosition: { readonly x: number; readonly y: number } | undefined,
    remotePositions: ReadonlyMap<
      string,
      { readonly x: number; readonly y: number }
    >,
  ): void;
  destroy(): void;
};

type MultiplayerRenderScene = Phaser.Scene & {
  readonly paint: (
    snapshot: MultiplayerRenderedSnapshot,
    localPlayerId: string,
    predictedPosition: { readonly x: number; readonly y: number } | undefined,
    remotePositions: ReadonlyMap<
      string,
      { readonly x: number; readonly y: number }
    >,
  ) => void;
};

function makeMultiplayerRenderScene(): MultiplayerRenderScene {
  class Scene extends Phaser.Scene {
    private graphics: Phaser.GameObjects.Graphics | undefined;

    constructor() {
      super({ key: "multiplayer-snapshot" });
    }

    create(): void {
      this.graphics = this.add.graphics();
    }

    paint(
      snapshot: MultiplayerRenderedSnapshot,
      localPlayerId: string,
      predictedPosition: { readonly x: number; readonly y: number } | undefined,
      remotePositions: ReadonlyMap<
        string,
        { readonly x: number; readonly y: number }
      >,
    ): void {
      const graphics = this.graphics;
      if (graphics === undefined) {
        throw new Error("Multiplayer Phaser scene has not been created.");
      }
      graphics.clear();
      graphics.fillStyle(0x70b7e6);
      graphics.fillRect(0, 0, multiplayerCanvasWidth, multiplayerCanvasHeight);
      graphics.fillStyle(0x285a37);
      graphics.fillRect(
        0,
        multiplayerCanvasHeight - 32,
        multiplayerCanvasWidth,
        32,
      );
      for (const player of snapshot.players) {
        const position =
          player.playerId === localPlayerId && predictedPosition !== undefined
            ? predictedPosition
            : (remotePositions.get(player.playerId) ?? player);
        const screenX =
          (position.x - snapshot.cameraLeftPixels) * multiplayerRenderScale;
        const screenY = position.y * multiplayerRenderScale;
        if (
          screenX < -32 ||
          screenX > multiplayerCanvasWidth + 32 ||
          screenY < -32 ||
          screenY > multiplayerCanvasHeight
        ) {
          continue;
        }
        graphics.fillStyle(
          player.playerId === localPlayerId ? 0xffd54a : 0xf06d8f,
        );
        graphics.fillRect(screenX, screenY, 28, 32);
        if (player.spectator) {
          graphics.lineStyle(2, 0x0b0f19);
          graphics.strokeRect(screenX, screenY, 28, 32);
        }
      }
    }
  }
  return new Scene();
}

export function makeMultiplayerPhaserRenderer(
  parent: HTMLElement,
): MultiplayerPhaserRenderer {
  const scene = makeMultiplayerRenderScene();
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: multiplayerCanvasWidth,
    height: multiplayerCanvasHeight,
    parent,
    backgroundColor: "#70b7e6",
    banner: false,
    audio: { noAudio: true },
    scene,
  });
  type RenderArguments = Parameters<MultiplayerPhaserRenderer["render"]>;
  let latestRender: RenderArguments | undefined;
  let ready = false;
  let destroyed = false;
  game.events.once(Phaser.Core.Events.READY, () => {
    ready = true;
    if (latestRender !== undefined && !destroyed) {
      scene.paint(...latestRender);
    }
  });
  game.canvas.setAttribute("aria-label", "Authoritative multiplayer game view");
  game.canvas.setAttribute("data-role", "multiplayer-phaser-canvas");
  return {
    canvas: game.canvas,
    render(snapshot, localPlayerId, predictedPosition, remotePositions) {
      latestRender = [
        snapshot,
        localPlayerId,
        predictedPosition,
        remotePositions,
      ];
      if (ready) {
        scene.paint(...latestRender);
      }
    },
    destroy() {
      destroyed = true;
      game.destroy(true);
    },
  };
}

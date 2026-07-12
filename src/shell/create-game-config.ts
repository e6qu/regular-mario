import Phaser from "phaser";

import type { BrowserGameBootstrap } from "./browser-level-selection";
import { BootScene } from "./scenes/boot-scene";
import {
  rendererNeedsPreservedDrawingBuffer,
  resolveRendererChoice,
  type RendererChoice,
} from "./select-renderer";

// Sky blue so any viewport area not covered by the level world (e.g. below a
// short level) reads as sky rather than a dark letterbox strip.
const backgroundColor = "#87ceeb";

// Map a renderer choice to the Phaser config `type`. Kept here (not in the
// Phaser-free select-renderer module) so that module stays unit-testable.
function phaserRendererType(choice: RendererChoice): number {
  switch (choice) {
    case "webgl":
      return Phaser.WEBGL;
    case "auto":
      return Phaser.AUTO;
    case "canvas":
      return Phaser.CANVAS;
    default: {
      const exhaustive: never = choice;
      throw new Error(`Unhandled renderer choice: ${String(exhaustive)}`);
    }
  }
}

export function createGameConfig(
  parent: HTMLElement,
  browserGameBootstrap: BrowserGameBootstrap,
): Phaser.Types.Core.GameConfig {
  // The renderer backend is decoupled from this config so it can be A/B'd for
  // fidelity: Canvas (the default) vs WebGL, chosen via `?renderer=` or a
  // persisted preference. The scene code is identical under both.
  const rendererChoice = resolveRendererChoice(
    typeof window === "undefined" ? "" : window.location.search,
    typeof window === "undefined" ? undefined : window.localStorage,
  );
  return {
    type: phaserRendererType(rendererChoice),
    parent,
    width: browserGameBootstrap.viewport.widthPixels,
    height: browserGameBootstrap.viewport.heightPixels,
    backgroundColor,
    // Crisp pixel art: disable smoothing and snap to integer pixels so the
    // 16x16 sprites/tiles stay sharp. The scene sizes the canvas backing store
    // to the window size × devicePixelRatio (see resizeToDisplay) so it renders
    // at the display's native resolution — otherwise a HiDPI/retina screen
    // upscales a CSS-resolution canvas and blurs everything, HUD text included.
    pixelArt: true,
    roundPixels: true,
    // Under WebGL the drawing buffer is discarded after compositing, so the
    // run-thumbnail readback (drawImage/toDataURL off the game canvas) would
    // capture a blank frame; preserving it keeps capture working as it does
    // under Canvas. No effect under the Canvas renderer.
    render: {
      preserveDrawingBuffer:
        rendererNeedsPreservedDrawingBuffer(rendererChoice),
    },
    scale: {
      mode: Phaser.Scale.NONE,
    },
    scene: [new BootScene(browserGameBootstrap)],
  };
}

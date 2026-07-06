import Phaser from "phaser";

import type { BrowserGameBootstrap } from "./browser-level-selection";
import { BootScene } from "./scenes/boot-scene";

// Sky blue so any viewport area not covered by the level world (e.g. below a
// short level) reads as sky rather than a dark letterbox strip.
const backgroundColor = "#87ceeb";

export function createGameConfig(
  parent: HTMLElement,
  browserGameBootstrap: BrowserGameBootstrap,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.CANVAS,
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
    scale: {
      mode: Phaser.Scale.NONE,
    },
    scene: [new BootScene(browserGameBootstrap)],
  };
}

// The scenery behind each world's rooms, and the ground under them: rolling hills on the
// plains, broken columns at dusk, stalagmites and crystals in the caves, boarded walls
// and moonlit windows in the ghost house, a misty night forest, a beach with palms, a
// floor of clouds, a palace of tiles and gems, a valley glowing with lava, and a castle
// of stone, banners and torches. All original pixel art, drawn with rectangles.
//
// Every room draws its own backdrop, one room wide: the theme's scenery laid out by a
// generator seeded with the room, its fixed pieces (a sun, a moon, banners, pillars)
// moved, and one of the theme's landmarks (a tree, an obelisk, a crystal cluster…) in
// front, never the same landmark as the room before. So no two slides share a
// background, and every room of a world still looks like that world. The ground strip
// is one per theme, wider than a room; each room shows a slice of it.
//
// The sign hides most of a room's sky, so the scenery lives in the band between the
// sign's bottom and the ground, and in the strips at the room's edges. Pure: drawing
// only, into any context with fillStyle and fillRect; no Phaser.
import {
  talkGroundRow,
  talkPanelHeightPixels,
  talkPanelTopPixels,
  talkRoomWidthTiles,
  talkTileSizePixels,
} from "../../engine/levels/talk-level";
import type { TalkPanelContext } from "./talk-panel";
import { talkThemes, type TalkThemeId } from "./talk-themes";
import { talkSeededRandom } from "./talk-random";

type Context = Pick<TalkPanelContext, "fillStyle" | "fillRect">;

// A room's backdrop: one room wide, and taller than the level, so a camera that sees
// past the level's edges still sees sky.
export const talkBackdropWidthPixels = talkRoomWidthTiles * talkTileSizePixels;
// The ground strip is wider than a room, so rooms can show different slices of it.
export const talkGroundWidthPixels = 960;
export const talkBackdropHeightPixels = 480;
// How far above the room's top the backdrop starts.
export const talkBackdropTopPixels = -64;
// The ground strip drawn over the walkway's tiles: from the ground's top down.
export const talkGroundStripHeightPixels = 96;

function rect(
  context: Context,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  context.fillStyle = color;
  context.fillRect(
    Math.round(x),
    Math.round(y),
    Math.round(width),
    Math.round(height),
  );
}

// A filled ellipse, drawn as one row of pixels per line.
function blob(
  context: Context,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  color: string,
): void {
  for (let row = -radiusY; row <= radiusY; row++) {
    const half = Math.round(radiusX * Math.sqrt(1 - (row / radiusY) ** 2));
    rect(context, centerX - half, centerY + row, half * 2, 1, color);
  }
}

// A triangle standing on (or hanging from) a baseline: a spike, a spire or a dune.
function spike(
  context: Context,
  centerX: number,
  baseY: number,
  halfWidth: number,
  height: number,
  color: string,
  hanging = false,
): void {
  for (let row = 0; row < height; row++) {
    const half = Math.max(1, Math.round(halfWidth * (1 - row / height)));
    rect(
      context,
      centerX - half,
      hanging ? baseY + row : baseY - row - 1,
      half * 2,
      1,
      color,
    );
  }
}

function cloud(
  context: Context,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  blob(context, x, y, size, Math.round(size * 0.45), color);
  blob(
    context,
    x - size * 0.6,
    y + 2,
    size * 0.6,
    Math.round(size * 0.35),
    color,
  );
  blob(
    context,
    x + size * 0.6,
    y + 2,
    size * 0.6,
    Math.round(size * 0.35),
    color,
  );
}

const width = talkBackdropWidthPixels;
const groundWidth = talkGroundWidthPixels;
const height = talkBackdropHeightPixels;
// the ground's top, in backdrop pixels
const groundY = talkGroundRow * talkTileSizePixels - talkBackdropTopPixels;

// Running-bond bricks, 32 by 16, from the top down to `height`: `paint` draws each one.
function bricks(
  height: number,
  span: number,
  paint: (x: number, y: number) => void,
): void {
  for (let y = 0; y < height; y += 16) {
    for (let x = (y / 16) % 2 === 0 ? 0 : -16; x < span; x += 32) {
      paint(x, y);
    }
  }
}
// the sign's bottom, in backdrop pixels: scenery above this mostly hides behind it
const signBottomY =
  talkPanelTopPixels + talkPanelHeightPixels - talkBackdropTopPixels;

function sky(context: Context, bands: readonly string[]): void {
  const bandHeight = Math.ceil(groundY / bands.length);
  bands.forEach((color, index) => {
    rect(context, 0, index * bandHeight, width, bandHeight + 1, color);
  });
  rect(
    context,
    0,
    groundY,
    width,
    height - groundY,
    bands[bands.length - 1] ?? "#000",
  );
}

type Painter = (context: Context, random: () => number) => void;

const painters: Readonly<Record<TalkThemeId, Painter>> = {
  plains: (context, random) => {
    for (let x = 40; x < width; x += 150 + random() * 80) {
      cloud(
        context,
        x,
        signBottomY + 10 + random() * 12,
        14 + random() * 8,
        "#ffffff",
      );
    }
    for (let x = 0; x < width + 120; x += 110 + random() * 90) {
      const radius = 50 + random() * 40;
      const tall = 34 + random() * 30;
      blob(context, x, groundY, radius + 2, tall + 2, "#3f8a35");
      blob(context, x, groundY, radius, tall, "#7cc35a");
      rect(context, x - 10, groundY - tall * 0.6, 3, 6, "#3f8a35");
      rect(context, x + 8, groundY - tall * 0.45, 3, 6, "#3f8a35");
    }
    for (let x = 30; x < width; x += 90 + random() * 70) {
      blob(context, x, groundY - 4, 14, 9, "#2f7a2c");
      blob(context, x - 12, groundY - 2, 9, 7, "#2f7a2c");
      blob(context, x + 12, groundY - 2, 9, 7, "#2f7a2c");
      blob(context, x - 2, groundY - 7, 6, 3, "#4fa844");
    }
  },
  ruins: (context, random) => {
    const sunX = 60 + random() * (width - 120);
    blob(context, sunX, signBottomY + 30, 42, 42, "#ffd98a");
    blob(context, sunX, signBottomY + 30, 34, 34, "#ffe6a8");
    for (let x = 0; x < width + 160; x += 160 + random() * 80) {
      blob(
        context,
        x,
        groundY + 6,
        120 + random() * 60,
        30 + random() * 14,
        "#d9a65a",
      );
    }
    for (let x = 0; x < width + 120; x += 130 + random() * 60) {
      blob(context, x, groundY + 4, 90, 18 + random() * 8, "#c48a44");
    }
    const column = (x: number, tall: number, broken: boolean): void => {
      rect(context, x - 2, groundY - tall - 8, 28, 8, "#efe0c0");
      rect(context, x, groundY - tall, 24, tall, "#e3d2ad");
      for (let flute = 4; flute < 24; flute += 6) {
        rect(context, x + flute, groundY - tall, 2, tall, "#c9b48a");
      }
      rect(context, x - 4, groundY - 6, 32, 6, "#c9b48a");
      if (broken) {
        for (let notch = 0; notch < 28; notch += 4) {
          rect(
            context,
            x - 2 + notch,
            groundY - tall - 8,
            4,
            2 + random() * 8,
            "#e88a5a",
          );
        }
      }
    };
    for (let x = 30; x < width; x += 140 + random() * 90) {
      const tall = 40 + random() * 50;
      column(x, tall, random() < 0.5);
      if (random() < 0.4) {
        column(x + 60, tall, false);
        rect(context, x - 4, groundY - tall - 16, 92, 8, "#efe0c0");
        rect(context, x - 4, groundY - tall - 10, 92, 2, "#c9b48a");
      }
      rect(context, x + 40, groundY - 8, 12, 8, "#c9b48a");
    }
  },
  cave: (context, random) => {
    // a wall of rough blocks
    for (let y = 0; y < groundY; y += 14) {
      for (let x = (y / 14) % 2 === 0 ? 0 : -14; x < width; x += 28) {
        rect(
          context,
          x + 1,
          y + 1,
          26,
          12,
          random() < 0.5 ? "#1a1930" : "#1e1d36",
        );
      }
    }
    for (let x = 0; x < width; x += 18 + random() * 30) {
      spike(
        context,
        x,
        0,
        6 + random() * 8,
        40 + random() * 70,
        "#2a2846",
        true,
      );
    }
    for (let x = 10; x < width; x += 40 + random() * 60) {
      const tall = 16 + random() * 50;
      spike(context, x, groundY, 8 + random() * 10, tall, "#34325a");
      spike(context, x - 2, groundY, 3, tall * 0.8, "#4a4878");
    }
    for (let index = 0; index < 26; index++) {
      const x = random() * width;
      const y = signBottomY + random() * (groundY - signBottomY - 10);
      rect(context, x, y - 3, 2, 8, "#5ef0ff");
      rect(context, x - 2, y, 6, 2, "#5ef0ff");
      rect(context, x, y, 2, 2, "#e8fdff");
    }
  },
  ghost: (context, random) => {
    for (let x = 0; x < width; x += 24) {
      rect(
        context,
        x,
        0,
        23,
        groundY,
        (x / 24) % 2 === 0 ? "#2a1a44" : "#30204c",
      );
      rect(context, x + 23, 0, 1, groundY, "#160c24");
      for (let y = 20; y < groundY; y += 60) {
        rect(context, x + 4, y, 2, 2, "#5a4478");
        rect(context, x + 17, y, 2, 2, "#5a4478");
      }
    }
    for (let x = 60; x < width; x += 200 + random() * 60) {
      // a tall moonlit window, its top under the sign
      rect(context, x - 4, signBottomY - 60, 56, 128, "#160c24");
      rect(context, x, signBottomY - 56, 48, 120, "#d8d0ff");
      rect(context, x + 30, signBottomY - 50, 12, 40, "#f4f0ff");
      rect(context, x + 22, signBottomY - 56, 4, 120, "#160c24");
      rect(context, x, signBottomY + 4, 48, 4, "#160c24");
      rect(context, x - 8, signBottomY + 64, 64, 6, "#4a3466");
    }
    rect(context, 0, groundY - 30, width, 4, "#4a3466");
    for (let x = 140; x < width; x += 180 + random() * 80) {
      rect(context, x, groundY - 42, 6, 12, "#efe6d0");
      rect(context, x + 1, groundY - 48, 4, 6, "#ffc84a");
      rect(context, x + 2, groundY - 50, 2, 2, "#fff2b0");
    }
  },
  forest: (context, random) => {
    blob(
      context,
      30 + random() * (width - 60),
      signBottomY + 8,
      18,
      18,
      "#e8edd0",
    );
    for (let x = 0; x < width; x += 26 + random() * 30) {
      rect(context, x, 0, 6 + random() * 6, groundY, "#0d1c1c");
    }
    for (let x = -20; x < width + 40; x += 60 + random() * 40) {
      blob(
        context,
        x,
        signBottomY + 4 + random() * 16,
        40 + random() * 16,
        20 + random() * 8,
        "#123326",
      );
    }
    // drifting mist, in soft patches
    for (let x = -40; x < width + 40; x += 50 + random() * 60) {
      const y = groundY - 14 - random() * 40;
      blob(context, x, y, 30 + random() * 30, 4 + random() * 4, "#26464a");
      blob(
        context,
        x + 10,
        y + 2,
        18 + random() * 14,
        2 + random() * 2,
        "#2f5656",
      );
    }
    for (let x = 20; x < width; x += 70 + random() * 70) {
      const trunk = 12 + random() * 8;
      rect(
        context,
        x,
        signBottomY - 40,
        trunk,
        groundY - signBottomY + 40,
        "#1a120c",
      );
      rect(
        context,
        x + 2,
        signBottomY - 40,
        3,
        groundY - signBottomY + 40,
        "#2a1e14",
      );
      rect(context, x - 6, groundY - 4, trunk + 12, 4, "#1a120c");
    }
    for (let index = 0; index < 40; index++) {
      const x = random() * width;
      const y = signBottomY + random() * (groundY - signBottomY);
      rect(context, x, y, 2, 2, random() < 0.5 ? "#f4f08a" : "#c8f06a");
    }
    for (let x = 50; x < width; x += 120 + random() * 90) {
      rect(context, x + 2, groundY - 6, 3, 6, "#e8e0c8");
      rect(context, x - 1, groundY - 9, 9, 3, "#d8432f");
      rect(context, x + 1, groundY - 8, 2, 1, "#ffffff");
    }
  },
  island: (context, random) => {
    for (let x = 60; x < width; x += 200 + random() * 100) {
      cloud(context, x, signBottomY + 12, 16, "#ffffff");
    }
    const horizon = groundY - 40;
    blob(context, 80 + random() * (width - 160), horizon, 70, 14, "#3f8a55");
    rect(context, 0, horizon, width, groundY - horizon, "#2f8fd8");
    rect(context, 0, horizon, width, 3, "#62b4ee");
    for (let y = horizon + 8; y < groundY; y += 9) {
      for (let x = (y * 7) % 40; x < width; x += 40 + random() * 20) {
        rect(context, x, y, 10, 2, "#bfe6ff");
      }
    }
    const palm = (x: number, tall: number, lean: number): void => {
      for (let step = 0; step < tall; step += 4) {
        const offset = Math.round(lean * (step / tall) ** 2 * 18);
        rect(
          context,
          x + offset,
          groundY - step - 4,
          7,
          4,
          step % 8 === 0 ? "#8a5a2b" : "#a8743a",
        );
      }
      const topX = x + lean * 18 + 3;
      const topY = groundY - tall - 4;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [-1, 1],
        [1, 1],
        [0, -1],
      ] as const) {
        for (let leaf = 0; leaf < 24; leaf += 3) {
          rect(
            context,
            topX + dx * leaf,
            topY + dy * leaf * 0.5 + (leaf * leaf) / 60,
            4,
            3,
            "#3f9a3c",
          );
        }
      }
      blob(context, topX, topY + 4, 4, 3, "#6b4a2a");
    };
    for (let x = 40; x < width; x += 150 + random() * 120) {
      palm(x, 60 + random() * 30, random() < 0.5 ? -1 : 1);
    }
  },
  sky: (context, random) => {
    for (let x = 20; x < width; x += 120 + random() * 60) {
      cloud(
        context,
        x,
        signBottomY + 10 + random() * 30,
        12 + random() * 10,
        "#ffffff",
      );
    }
    for (let x = 40 + random() * 160; x < width; x += 260 + random() * 120) {
      blob(context, x, signBottomY + 40, 30, 8, "#6ab04a");
      rect(context, x - 30, signBottomY + 40, 60, 4, "#3f8a35");
      spike(context, x, signBottomY + 44, 22, 18, "#8a6a4a", true);
    }
    for (let x = -20; x < width + 40; x += 36) {
      blob(context, x, groundY - 6, 26, 16, "#eaf6ff");
    }
    for (let x = 0; x < width + 40; x += 30) {
      blob(context, x + 15, groundY - 2, 20, 10, "#ffffff");
    }
  },
  palace: (context, random) => {
    // a lattice of tiles
    for (let y = 0; y < groundY; y += 16) {
      for (let x = (y / 16) % 2 === 0 ? 0 : 16; x < width; x += 32) {
        rect(context, x + 6, y + 6, 4, 4, "#f4b860");
      }
    }
    const gems = ["#e2433b", "#3fb950", "#3f7ae0", "#f2c230"];
    let gem = Math.floor(random() * gems.length);
    for (let x = 20 + random() * 120; x < width; x += 140 + random() * 60) {
      rect(
        context,
        x,
        signBottomY - 30,
        30,
        groundY - signBottomY + 30,
        "#fffaf0",
      );
      rect(
        context,
        x + 4,
        signBottomY - 30,
        4,
        groundY - signBottomY + 30,
        "#efe4cc",
      );
      rect(context, x - 6, signBottomY + 10, 42, 8, "#e8d8b0");
      rect(context, x - 6, groundY - 8, 42, 8, "#e8d8b0");
      const color = gems[gem % gems.length] ?? "#e2433b";
      gem += 1;
      blob(context, x + 15, signBottomY + 34, 8, 8, color);
      rect(context, x + 11, signBottomY + 29, 3, 3, "#ffffff");
    }
    for (let index = 0; index < 30; index++) {
      const x = random() * width;
      const y = signBottomY + random() * (groundY - signBottomY);
      rect(context, x, y, 2, 2, "#ffffff");
    }
  },
  valley: (context, random) => {
    for (let index = 0; index < 50; index++) {
      rect(
        context,
        random() * width,
        random() * groundY,
        2,
        2,
        random() < 0.5 ? "#ff8a2a" : "#ffcf5a",
      );
    }
    for (let x = -20; x < width + 40; x += 40 + random() * 50) {
      spike(
        context,
        x,
        groundY,
        14 + random() * 20,
        50 + random() * 80,
        "#1a0a08",
      );
    }
    rect(context, 0, groundY - 16, width, 4, "#a02a0a");
    rect(context, 0, groundY - 12, width, 6, "#e0501a");
    rect(context, 0, groundY - 6, width, 6, "#ff8a2a");
    for (let x = 0; x < width; x += 24 + random() * 30) {
      rect(context, x, groundY - 6, 8, 2, "#ffd25a");
    }
    for (let x = 60; x < width; x += 140 + random() * 90) {
      spike(context, x, groundY - 10, 10, 30 + random() * 20, "#2a1210");
      rect(context, x - 1, groundY - 30, 2, 16, "#ff6a1a");
    }
  },
  castle: (context, random) => {
    bricks(groundY, width, (x, y) => {
      rect(
        context,
        x + 1,
        y + 1,
        30,
        14,
        random() < 0.5 ? "#2c2c36" : "#30303a",
      );
    });
    for (let x = 30 + random() * 100; x < width; x += 150 + random() * 30) {
      // a banner, its top under the sign
      rect(context, x, signBottomY - 20, 28, 76, "#a8242c");
      rect(context, x, signBottomY - 20, 3, 76, "#d8b040");
      rect(context, x + 25, signBottomY - 20, 3, 76, "#d8b040");
      spike(context, x + 14, signBottomY + 56, 14, 10, "#a8242c", true);
      rect(context, x + 10, signBottomY + 20, 8, 8, "#d8b040");
      // a torch between the banners
      const torchX = x + 80;
      rect(context, torchX, groundY - 52, 6, 14, "#6a6a76");
      rect(context, torchX - 3, groundY - 54, 12, 4, "#8a8a96");
      blob(context, torchX + 3, groundY - 62, 6, 8, "#ff8a2a");
      blob(context, torchX + 3, groundY - 60, 3, 5, "#ffe27a");
    }
    for (let x = 40; x < width; x += 200 + random() * 40) {
      rect(context, x, signBottomY + 30, 8, 24, "#0e0e14");
    }
  },
};

const seeds: Readonly<Record<TalkThemeId, number>> = {
  plains: 11,
  ruins: 23,
  cave: 37,
  ghost: 41,
  forest: 53,
  island: 67,
  sky: 71,
  palace: 83,
  valley: 97,
  castle: 101,
};

// One landmark per room, drawn in front of the scenery, standing on the ground at `x`
// (its left edge) and no taller than the band between the sign and the ground. Each
// theme's landmarks use its scenery's own colours.
type Landmark = (context: Context, x: number, random: () => number) => void;

const landmarks: Readonly<Record<TalkThemeId, readonly Landmark[]>> = {
  plains: [
    // a round tree
    (context, x) => {
      rect(context, x + 18, groundY - 30, 8, 30, "#8f5a2b");
      blob(context, x + 22, groundY - 44, 24, 18, "#3f8a35");
      blob(context, x + 20, groundY - 46, 20, 14, "#7cc35a");
      rect(context, x + 10, groundY - 50, 4, 4, "#3f8a35");
    },
    // a fence
    (context, x) => {
      for (let post = 0; post < 5; post++) {
        rect(context, x + post * 16, groundY - 22, 5, 22, "#b8793e");
        rect(context, x + post * 16 + 1, groundY - 24, 3, 2, "#b8793e");
      }
      rect(context, x, groundY - 18, 69, 3, "#8f5a2b");
      rect(context, x, groundY - 10, 69, 3, "#8f5a2b");
    },
    // a patch of flowers
    (context, x, random) => {
      for (let flower = 0; flower < 9; flower++) {
        const fx = x + flower * 8 + random() * 4;
        const tall = 6 + random() * 8;
        rect(context, fx + 1, groundY - tall, 1, tall, "#2f7a2c");
        rect(
          context,
          fx,
          groundY - tall - 3,
          3,
          3,
          ["#ffffff", "#f2c230", "#e2433b"][flower % 3] ?? "#ffffff",
        );
      }
    },
  ],
  ruins: [
    // an obelisk
    (context, x) => {
      rect(context, x, groundY - 6, 34, 6, "#c9b48a");
      rect(context, x + 6, groundY - 58, 22, 52, "#e3d2ad");
      rect(context, x + 8, groundY - 58, 3, 52, "#efe0c0");
      spike(context, x + 17, groundY - 58, 11, 10, "#efe0c0");
    },
    // a fallen column
    (context, x) => {
      rect(context, x, groundY - 16, 70, 16, "#e3d2ad");
      for (let flute = 3; flute < 16; flute += 5) {
        rect(context, x, groundY - 16 + flute, 70, 2, "#c9b48a");
      }
      rect(context, x + 70, groundY - 20, 10, 20, "#efe0c0");
      rect(context, x - 6, groundY - 8, 6, 8, "#c48a44");
    },
    // an arch
    (context, x) => {
      rect(context, x, groundY - 50, 14, 50, "#e3d2ad");
      rect(context, x + 46, groundY - 50, 14, 50, "#e3d2ad");
      rect(context, x - 4, groundY - 60, 68, 10, "#efe0c0");
      rect(context, x - 4, groundY - 52, 68, 2, "#c9b48a");
    },
  ],
  cave: [
    // a crystal cluster
    (context, x) => {
      spike(context, x + 14, groundY, 7, 34, "#3a3878");
      spike(context, x + 26, groundY, 9, 48, "#5ef0ff");
      spike(context, x + 24, groundY, 3, 40, "#e8fdff");
      spike(context, x + 40, groundY, 6, 26, "#5ef0ff");
    },
    // a still pool
    (context, x) => {
      blob(context, x + 40, groundY - 3, 40, 4, "#1d244a");
      rect(context, x + 20, groundY - 5, 14, 1, "#5a6aa8");
      rect(context, x + 46, groundY - 3, 10, 1, "#5a6aa8");
    },
    // glowing mushrooms
    (context, x, random) => {
      for (let cap = 0; cap < 4; cap++) {
        const cx = x + cap * 14 + random() * 6;
        const tall = 8 + random() * 14;
        rect(context, cx + 3, groundY - tall, 3, tall, "#4a4878");
        blob(context, cx + 4, groundY - tall, 6, 3, "#5ef0ff");
        rect(context, cx + 2, groundY - tall - 1, 2, 1, "#e8fdff");
      }
    },
  ],
  ghost: [
    // a portrait whose eyes follow you
    (context, x) => {
      rect(context, x, groundY - 70, 34, 42, "#4a3466");
      rect(context, x + 4, groundY - 66, 26, 34, "#160c24");
      blob(context, x + 17, groundY - 50, 8, 10, "#d8d0ff");
      rect(context, x + 13, groundY - 53, 2, 2, "#160c24");
      rect(context, x + 19, groundY - 53, 2, 2, "#160c24");
    },
    // a grandfather clock
    (context, x) => {
      rect(context, x, groundY - 64, 22, 64, "#160c24");
      rect(context, x + 2, groundY - 62, 18, 60, "#2a1a44");
      blob(context, x + 11, groundY - 52, 7, 7, "#efe6d0");
      rect(context, x + 10, groundY - 56, 1, 4, "#160c24");
      rect(context, x + 10, groundY - 36, 2, 20, "#5a4478");
      blob(context, x + 11, groundY - 14, 3, 3, "#ffc84a");
    },
    // a cobweb across a corner
    (context, x) => {
      for (let strand = 0; strand < 28; strand += 2) {
        rect(context, x + strand, groundY - 70 + strand, 2, 1, "#5a4478");
        rect(context, x + strand, groundY - 70, 1, 1, "#5a4478");
        rect(context, x, groundY - 70 + strand, 1, 1, "#5a4478");
      }
      for (let ring = 8; ring < 28; ring += 8) {
        rect(context, x, groundY - 70 + ring, ring, 1, "#4a3466");
        rect(context, x + ring, groundY - 70, 1, ring, "#4a3466");
      }
    },
  ],
  forest: [
    // a ring of toadstools
    (context, x, random) => {
      for (let cap = 0; cap < 5; cap++) {
        const cx = x + cap * 12;
        const tall = 4 + random() * 5;
        rect(context, cx + 2, groundY - tall, 3, tall, "#e8e0c8");
        rect(context, cx - 1, groundY - tall - 3, 9, 3, "#d8432f");
        rect(context, cx + 1, groundY - tall - 2, 2, 1, "#ffffff");
      }
    },
    // a fallen log
    (context, x) => {
      rect(context, x, groundY - 12, 64, 12, "#1a120c");
      rect(context, x, groundY - 12, 64, 2, "#2a1e14");
      blob(context, x + 64, groundY - 6, 4, 6, "#2a1e14");
      blob(context, x + 64, groundY - 6, 2, 3, "#1a120c");
      rect(context, x + 10, groundY - 14, 18, 2, "#123326");
    },
    // an owl on a stump
    (context, x) => {
      rect(context, x, groundY - 18, 22, 18, "#1a120c");
      rect(context, x, groundY - 18, 22, 2, "#2a1e14");
      blob(context, x + 11, groundY - 28, 7, 9, "#2a1e14");
      rect(context, x + 7, groundY - 31, 3, 3, "#f4f08a");
      rect(context, x + 12, groundY - 31, 3, 3, "#f4f08a");
      rect(context, x + 10, groundY - 27, 2, 2, "#c8f06a");
    },
  ],
  island: [
    // a beach umbrella
    (context, x) => {
      rect(context, x + 20, groundY - 40, 2, 40, "#8a5a2b");
      for (let row = 0; row < 12; row++) {
        const half = 4 + row * 2;
        for (let stripe = -half; stripe < half; stripe += 6) {
          rect(
            context,
            x + 21 + stripe,
            groundY - 52 + row,
            Math.min(6, half - stripe),
            1,
            (stripe + half) % 12 < 6 ? "#e2433b" : "#ffffff",
          );
        }
      }
    },
    // a sandcastle
    (context, x) => {
      rect(context, x, groundY - 14, 40, 14, "#e6c47a");
      rect(context, x + 6, groundY - 26, 12, 12, "#e6c47a");
      rect(context, x + 24, groundY - 22, 10, 8, "#e6c47a");
      for (let crenel = 0; crenel < 12; crenel += 4) {
        rect(context, x + 6 + crenel, groundY - 29, 2, 3, "#cfa65c");
      }
      rect(context, x + 16, groundY - 34, 1, 8, "#8a5a2b");
      rect(context, x + 17, groundY - 34, 5, 3, "#e2433b");
    },
    // a sailboat on the sea
    (context, x) => {
      const water = groundY - 26;
      rect(context, x, water, 34, 5, "#8a5a2b");
      rect(context, x + 2, water + 5, 30, 2, "#6b4a2a");
      rect(context, x + 16, water - 30, 2, 30, "#6b4a2a");
      spike(context, x + 24, water - 2, 7, 26, "#ffffff");
    },
  ],
  sky: [
    // a hot-air balloon
    (context, x) => {
      blob(context, x + 16, groundY - 62, 14, 16, "#e2433b");
      rect(context, x + 9, groundY - 76, 4, 30, "#f2c230");
      rect(context, x + 19, groundY - 76, 4, 30, "#f2c230");
      rect(context, x + 10, groundY - 44, 1, 8, "#8a6a4a");
      rect(context, x + 21, groundY - 44, 1, 8, "#8a6a4a");
      rect(context, x + 10, groundY - 36, 12, 7, "#8a6a4a");
    },
    // a flock of birds
    (context, x, random) => {
      for (let bird = 0; bird < 5; bird++) {
        const bx = x + bird * 14 + random() * 6;
        const by = groundY - 60 + random() * 24;
        rect(context, bx, by, 3, 1, "#5a6a8a");
        rect(context, bx + 4, by, 3, 1, "#5a6a8a");
        rect(context, bx + 3, by + 1, 1, 1, "#5a6a8a");
      }
    },
    // a small island with a tree
    (context, x) => {
      blob(context, x + 24, groundY - 40, 22, 6, "#6ab04a");
      spike(context, x + 24, groundY - 36, 18, 16, "#8a6a4a", true);
      rect(context, x + 22, groundY - 60, 4, 16, "#8a6a4a");
      blob(context, x + 24, groundY - 64, 10, 8, "#3f8a35");
    },
  ],
  palace: [
    // a fountain
    (context, x) => {
      rect(context, x, groundY - 12, 50, 12, "#e8d8b0");
      rect(context, x + 2, groundY - 12, 46, 3, "#3f7ae0");
      rect(context, x + 22, groundY - 36, 6, 24, "#fffaf0");
      blob(context, x + 25, groundY - 40, 10, 4, "#e8d8b0");
      for (let jet = -12; jet <= 12; jet += 6) {
        rect(
          context,
          x + 25 + jet,
          groundY - 48 + Math.abs(jet) / 2,
          2,
          6,
          "#bfe6ff",
        );
      }
    },
    // an urn set with a gem
    (context, x) => {
      blob(context, x + 14, groundY - 16, 12, 14, "#f4b860");
      rect(context, x + 8, groundY - 34, 12, 6, "#f4b860");
      rect(context, x + 6, groundY - 4, 16, 4, "#e8d8b0");
      blob(context, x + 14, groundY - 18, 4, 4, "#3fb950");
      rect(context, x + 12, groundY - 21, 2, 2, "#ffffff");
    },
    // a hanging garland of gems
    (context, x) => {
      const gems = ["#e2433b", "#3fb950", "#3f7ae0", "#f2c230"];
      for (let link = 0; link < 7; link++) {
        const sag = Math.round(Math.sin((link / 6) * Math.PI) * 10);
        rect(context, x + link * 10, groundY - 70 + sag, 10, 2, "#e8d8b0");
        blob(
          context,
          x + link * 10 + 5,
          groundY - 64 + sag,
          3,
          3,
          gems[link % 4] ?? "#e2433b",
        );
      }
    },
  ],
  valley: [
    // a lavafall
    (context, x) => {
      rect(context, x, groundY - 80, 18, 70, "#e0501a");
      rect(context, x + 4, groundY - 80, 6, 70, "#ff8a2a");
      rect(context, x + 6, groundY - 80, 2, 70, "#ffd25a");
      blob(context, x + 9, groundY - 10, 14, 4, "#ff8a2a");
    },
    // a small volcano, smoking
    (context, x) => {
      spike(context, x + 30, groundY - 6, 30, 40, "#1a0a08");
      rect(context, x + 24, groundY - 46, 12, 4, "#ff6a1a");
      blob(context, x + 30, groundY - 56, 6, 5, "#2a1210");
      blob(context, x + 36, groundY - 66, 8, 6, "#2a1210");
    },
    // obsidian pillars with glowing cracks
    (context, x) => {
      rect(context, x, groundY - 54, 14, 48, "#1a0a08");
      rect(context, x + 30, groundY - 40, 16, 34, "#1a0a08");
      rect(context, x + 6, groundY - 44, 2, 12, "#ff8a2a");
      rect(context, x + 7, groundY - 32, 3, 2, "#ff8a2a");
      rect(context, x + 36, groundY - 30, 2, 10, "#ffcf5a");
    },
  ],
  castle: [
    // a suit of armour
    (context, x) => {
      rect(context, x + 6, groundY - 52, 12, 12, "#8a8a96");
      rect(context, x + 8, groundY - 48, 8, 2, "#0e0e14");
      rect(context, x + 10, groundY - 58, 4, 6, "#a8242c");
      rect(context, x + 2, groundY - 40, 20, 20, "#6a6a76");
      rect(context, x + 4, groundY - 20, 6, 20, "#8a8a96");
      rect(context, x + 14, groundY - 20, 6, 20, "#8a8a96");
      rect(context, x + 24, groundY - 64, 2, 64, "#8a8a96");
    },
    // a portcullis
    (context, x) => {
      rect(context, x, groundY - 60, 44, 60, "#0e0e14");
      for (let bar = 4; bar < 44; bar += 8) {
        rect(context, x + bar, groundY - 60, 3, 60, "#3a3a44");
      }
      for (let bar = 6; bar < 60; bar += 12) {
        rect(context, x, groundY - 60 + bar, 44, 2, "#3a3a44");
      }
    },
    // a shield on the wall
    (context, x) => {
      rect(context, x, groundY - 66, 26, 20, "#a8242c");
      spike(context, x + 13, groundY - 46, 13, 12, "#a8242c", true);
      rect(context, x + 11, groundY - 66, 4, 30, "#d8b040");
      rect(context, x, groundY - 60, 26, 4, "#d8b040");
    },
  ],
};

// The landmark room `room` of a `theme` world shows: the theme's landmarks in a seeded
// order, one room after another, so neighbouring rooms never share one.
export function talkLandmarkIndex(theme: TalkThemeId, room: number): number {
  const count = landmarks[theme].length;
  const random = talkSeededRandom(seeds[theme]);
  const order = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap] ?? swap, order[index] ?? index];
  }
  return order[room % count] ?? 0;
}

// Draws room `room`'s backdrop in a `theme` world: talkBackdropWidthPixels ×
// talkBackdropHeightPixels, its top at talkBackdropTopPixels in room pixels.
export function drawTalkBackdrop(
  context: Context,
  theme: TalkThemeId,
  room: number,
): void {
  const random = talkSeededRandom(
    Math.imul(seeds[theme], 0x9e3779b1) ^ Math.imul(room + 1, 0x85ebca6b),
  );
  sky(context, talkThemes[theme].sky);
  painters[theme](context, random);
  const landmark = landmarks[theme][talkLandmarkIndex(theme, room)];
  landmark?.(context, 40 + random() * (width - 160), random);
}

// Draws a theme's ground: talkGroundWidthPixels × talkGroundStripHeightPixels, its
// top on the ground's top.
export function drawTalkGround(context: Context, theme: TalkThemeId): void {
  const { top, body, speckle } = talkThemes[theme].ground;
  const random = talkSeededRandom(seeds[theme] * 7);
  const stripHeight = talkGroundStripHeightPixels;
  rect(context, 0, 0, groundWidth, stripHeight, body);
  switch (theme) {
    case "plains":
    case "forest":
      rect(context, 0, 0, groundWidth, 5, top);
      for (let x = 0; x < groundWidth; x += 3) {
        rect(context, x, 5, 2, 1 + Math.floor(random() * 3), top);
      }
      for (let index = 0; index < 120; index++) {
        rect(
          context,
          random() * groundWidth,
          10 + random() * (stripHeight - 12),
          3,
          2,
          speckle,
        );
      }
      break;
    case "ruins":
    case "island":
      rect(context, 0, 0, groundWidth, 3, top);
      for (let index = 0; index < 160; index++) {
        rect(
          context,
          random() * groundWidth,
          4 + random() * stripHeight,
          2,
          1,
          speckle,
        );
      }
      if (theme === "ruins") {
        for (let x = 0; x < groundWidth; x += 32) {
          rect(context, x, 3, 1, 13, speckle);
        }
        rect(context, 0, 16, groundWidth, 1, speckle);
      } else {
        for (let index = 0; index < 24; index++) {
          rect(
            context,
            random() * groundWidth,
            6 + random() * 20,
            3,
            2,
            random() < 0.5 ? "#ffffff" : "#f29aa8",
          );
        }
      }
      break;
    case "cave":
    case "castle":
    case "valley":
      bricks(stripHeight, groundWidth, (x, y) => {
        rect(context, x + 1, y + 1, 30, 14, y === 0 ? top : body);
        rect(context, x + 1, y + 14, 30, 1, speckle);
      });
      if (theme === "valley") {
        for (let x = 10; x < groundWidth; x += 30 + random() * 40) {
          rect(context, x, 4, 2, 8, speckle);
          rect(context, x + 2, 10, 6, 2, speckle);
        }
      }
      break;
    case "ghost":
      for (let y = 0; y < stripHeight; y += 8) {
        rect(context, 0, y, groundWidth, 1, speckle);
        for (let x = (y * 5) % 48; x < groundWidth; x += 48) {
          rect(context, x, y, 1, 8, speckle);
        }
      }
      rect(context, 0, 0, groundWidth, 3, top);
      break;
    case "sky":
      for (let x = 0; x < groundWidth + 20; x += 20) {
        blob(context, x + 10, 4, 12, 6, top);
      }
      for (let index = 0; index < 60; index++) {
        rect(
          context,
          random() * groundWidth,
          14 + random() * stripHeight,
          4,
          2,
          speckle,
        );
      }
      break;
    case "palace":
      for (let y = 0; y < stripHeight; y += 16) {
        for (let x = 0; x < groundWidth; x += 16) {
          rect(context, x, y, 16, 16, (x + y) % 32 === 0 ? top : body);
          rect(context, x, y, 16, 1, speckle);
          rect(context, x, y, 1, 16, speckle);
        }
      }
      break;
  }
}

// The slice of its theme's ground strip room `index` shows: a seeded offset into the
// wider strip.
export function talkGroundOffsetPixels(index: number): number {
  const random = talkSeededRandom(Math.imul(index + 1, 0x85ebca6b));
  const roomWidth = talkRoomWidthTiles * talkTileSizePixels;
  return Math.floor(random() * (talkGroundWidthPixels - roomWidth));
}

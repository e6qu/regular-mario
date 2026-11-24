// The scenery behind each world's rooms, and the ground under them: rolling hills on the
// plains, broken columns at dusk, stalagmites and crystals in the caves, boarded walls
// and moonlit windows in the ghost house, a misty night forest, a beach with palms, a
// floor of clouds, a palace of tiles and gems, a valley glowing with lava, and a castle
// of stone, banners and torches. All original pixel art, drawn with rectangles into a
// canvas texture once per theme; each room shows a different slice of it.
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

// The backdrop canvas is wider than a room, so rooms can show different slices of it,
// and taller, so a camera that sees past the level's edges still sees sky.
export const talkBackdropWidthPixels = 960;
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
const height = talkBackdropHeightPixels;
// the ground's top, in backdrop pixels
const groundY = talkGroundRow * talkTileSizePixels - talkBackdropTopPixels;

// Running-bond bricks, 32 by 16, from the top down to `height`: `paint` draws each one.
function bricks(height: number, paint: (x: number, y: number) => void): void {
  for (let y = 0; y < height; y += 16) {
    for (let x = (y / 16) % 2 === 0 ? 0 : -16; x < width; x += 32) {
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
    blob(context, 720, signBottomY + 30, 42, 42, "#ffd98a");
    blob(context, 720, signBottomY + 30, 34, 34, "#ffe6a8");
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
    blob(context, 180, signBottomY + 8, 18, 18, "#e8edd0");
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
    blob(context, 520, horizon, 70, 14, "#3f8a55");
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
    for (let x = 150; x < width; x += 300 + random() * 100) {
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
    let gem = 0;
    for (let x = 40; x < width; x += 160) {
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
    bricks(groundY, (x, y) => {
      rect(
        context,
        x + 1,
        y + 1,
        30,
        14,
        random() < 0.5 ? "#2c2c36" : "#30303a",
      );
    });
    for (let x = 80; x < width; x += 160) {
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

// Draws a theme's backdrop: talkBackdropWidthPixels × talkBackdropHeightPixels, its top
// at talkBackdropTopPixels in room pixels.
export function drawTalkBackdrop(context: Context, theme: TalkThemeId): void {
  sky(context, talkThemes[theme].sky);
  painters[theme](context, talkSeededRandom(seeds[theme]));
}

// Draws a theme's ground: talkBackdropWidthPixels × talkGroundStripHeightPixels, its
// top on the ground's top.
export function drawTalkGround(context: Context, theme: TalkThemeId): void {
  const { top, body, speckle } = talkThemes[theme].ground;
  const random = talkSeededRandom(seeds[theme] * 7);
  const stripHeight = talkGroundStripHeightPixels;
  rect(context, 0, 0, width, stripHeight, body);
  switch (theme) {
    case "plains":
    case "forest":
      rect(context, 0, 0, width, 5, top);
      for (let x = 0; x < width; x += 3) {
        rect(context, x, 5, 2, 1 + Math.floor(random() * 3), top);
      }
      for (let index = 0; index < 120; index++) {
        rect(
          context,
          random() * width,
          10 + random() * (stripHeight - 12),
          3,
          2,
          speckle,
        );
      }
      break;
    case "ruins":
    case "island":
      rect(context, 0, 0, width, 3, top);
      for (let index = 0; index < 160; index++) {
        rect(
          context,
          random() * width,
          4 + random() * stripHeight,
          2,
          1,
          speckle,
        );
      }
      if (theme === "ruins") {
        for (let x = 0; x < width; x += 32) {
          rect(context, x, 3, 1, 13, speckle);
        }
        rect(context, 0, 16, width, 1, speckle);
      } else {
        for (let index = 0; index < 24; index++) {
          rect(
            context,
            random() * width,
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
      bricks(stripHeight, (x, y) => {
        rect(context, x + 1, y + 1, 30, 14, y === 0 ? top : body);
        rect(context, x + 1, y + 14, 30, 1, speckle);
      });
      if (theme === "valley") {
        for (let x = 10; x < width; x += 30 + random() * 40) {
          rect(context, x, 4, 2, 8, speckle);
          rect(context, x + 2, 10, 6, 2, speckle);
        }
      }
      break;
    case "ghost":
      for (let y = 0; y < stripHeight; y += 8) {
        rect(context, 0, y, width, 1, speckle);
        for (let x = (y * 5) % 48; x < width; x += 48) {
          rect(context, x, y, 1, 8, speckle);
        }
      }
      rect(context, 0, 0, width, 3, top);
      break;
    case "sky":
      for (let x = 0; x < width + 20; x += 20) {
        blob(context, x + 10, 4, 12, 6, top);
      }
      for (let index = 0; index < 60; index++) {
        rect(
          context,
          random() * width,
          14 + random() * stripHeight,
          4,
          2,
          speckle,
        );
      }
      break;
    case "palace":
      for (let y = 0; y < stripHeight; y += 16) {
        for (let x = 0; x < width; x += 16) {
          rect(context, x, y, 16, 16, (x + y) % 32 === 0 ? top : body);
          rect(context, x, y, 16, 1, speckle);
          rect(context, x, y, 1, 16, speckle);
        }
      }
      break;
  }
}

// The slice of the backdrop room `index` shows: a seeded offset into the wider canvas.
export function talkBackdropOffsetPixels(index: number): number {
  const random = talkSeededRandom(Math.imul(index + 1, 0x85ebca6b));
  const roomWidth = talkRoomWidthTiles * talkTileSizePixels;
  return Math.floor(random() * (talkBackdropWidthPixels - roomWidth));
}

// Original pixel art for talk slides, as character grids. Each letter of a grid names a
// palette slot; "." is transparent. Pure data and drawing: no Phaser.

// The mount: a boxy pack robot with a saddle, one antenna light and a big mouth that
// eats whatever it is pointed at. Faces right. Two walk frames; the light blinks.
//   K outline · B/b body and its shade · S/s saddle · W eye · P pupil · L light
//   G legs · M mouth · T teeth
const mountFrameA = [
  "...............LL.....",
  "...............KK.....",
  "...............K......",
  "..........KKKKKKKKKK..",
  ".........KBBBBBBBBBBK.",
  ".........KBBBBBWWWBBK.",
  ".........KBBBBBWWPBBBK",
  "..SSSSS..KBBBBBWWPBBBK",
  ".SsssssS.KbBBBBBBBBBBK",
  "KKKKKKKKKKbBBBMMMMMMMK",
  "KBBBBBBBBBbBBMTMTMTMK.",
  "KBBBBBBBBBBBBBMMMMMMK.",
  "KBBBBBBBBBBBBBTMTMTMK.",
  "KbBBBBBBBBBBBBBBBBBBK.",
  ".KbbbbbbbbbbbbbbbbbK..",
  "..KGGK.......KGGK.....",
  "..KKKK.......KKKK.....",
] as const;

const mountFrameB = [
  "......................",
  "...............KK.....",
  "...............K......",
  ...mountFrameA.slice(3, 15),
  "...KGGK.....KGGK......",
  "...KKKK.....KKKK......",
] as const;

export const talkMountFrames: readonly (readonly string[])[] = [
  mountFrameA,
  mountFrameB,
];

export type TalkPalette = Readonly<Record<string, string>>;

const sharedMountColors: TalkPalette = {
  K: "#1b1b24",
  S: "#8a5532",
  s: "#5e381f",
  W: "#ffffff",
  P: "#1b1b24",
  L: "#ff4a3d",
  G: "#7d8794",
  M: "#5a1020",
  T: "#ffffff",
};

// One mount per department: the slide's "everyone".
export interface TalkMountRider {
  readonly label: string;
  readonly palette: TalkPalette;
}

export const talkMountRiders: readonly TalkMountRider[] = [
  { label: "PM", body: "#e8833a", shade: "#b25a1e" },
  { label: "SUPPORT", body: "#2fa39a", shade: "#1d6e67" },
  { label: "FINANCE", body: "#8a63d2", shade: "#5c3f9a" },
  { label: "CHIEF OF STAFF", body: "#d9b23a", shade: "#9f7f1c" },
].map(({ label, body, shade }) => ({
  label,
  palette: { ...sharedMountColors, B: body, b: shade },
}));

export interface TalkGridSize {
  readonly widthPixels: number;
  readonly heightPixels: number;
}

// Checks a grid is rectangular and every letter has a colour; throws otherwise.
export function talkGridSize(
  grid: readonly string[],
  palette: TalkPalette,
): TalkGridSize {
  const width = grid[0]?.length ?? 0;
  if (width === 0) {
    throw new Error("A talk art grid needs at least one non-empty row.");
  }
  grid.forEach((row, index) => {
    if (row.length !== width) {
      throw new Error(
        `Talk art row ${String(index)} is ${String(row.length)} wide, not ${String(width)}.`,
      );
    }
    for (const cell of row) {
      if (cell !== "." && palette[cell] === undefined) {
        throw new Error(`Talk art colour "${cell}" has no palette entry.`);
      }
    }
  });
  return { widthPixels: width, heightPixels: grid.length };
}

export type TalkArtContext = Pick<
  CanvasRenderingContext2D,
  "fillStyle" | "fillRect"
>;

// Paints `grid` at (x, y), one canvas pixel per cell.
export function drawTalkGrid(
  context: TalkArtContext,
  grid: readonly string[],
  palette: TalkPalette,
  x: number,
  y: number,
): void {
  talkGridSize(grid, palette);
  grid.forEach((row, rowIndex) => {
    [...row].forEach((cell, column) => {
      const color = palette[cell];
      if (cell === "." || color === undefined) {
        return;
      }
      context.fillStyle = color;
      context.fillRect(x + column, y + rowIndex, 1, 1);
    });
  });
}

// Draws a laid-out slide into a 2D canvas, one canvas pixel per game pixel, with the
// talk bitmap font. Pure drawing: no Phaser, no DOM lookups; the caller owns the canvas.
import { talkGlyph, talkGlyphColumns, talkGlyphRows } from "./talk-font";
import type { TalkPalette } from "./talk-art";
import type { TalkBoxTone, TalkLayout, TalkTone } from "./talk-layout";

export interface TalkPanelColors {
  readonly paper: string;
  readonly border: string;
  readonly shadow: string;
  readonly tones: Readonly<Record<TalkTone, string>>;
  readonly boxes: Readonly<Record<TalkBoxTone, string>>;
}

// A sign in the sky: warm paper, a dark pixel border and a drop shadow, inks that keep
// 4.5:1 contrast on the paper.
export const talkPanelColors: TalkPanelColors = {
  paper: "#f6eedd",
  border: "#2b2118",
  shadow: "#00000055",
  tones: {
    ink: "#1f1a14",
    muted: "#5b4f43",
    accent: "#a3361f",
    inverse: "#ffffff",
    link: "#1f4fbf",
  },
  boxes: {
    bar: "#2f4f8f",
    rule: "#b9ab94",
    close: "#e0533d",
    minimise: "#e8b03a",
    zoom: "#4caf50",
    // a diagram's arrows, and the shading behind a sequence diagram's notes
    line: "#5b4f43",
    note: "#eadcbd",
    // behind a diagram's words, where a line would run through them
    paper: "#f6eedd",
  },
};

// Room around the text inside the border, in game pixels.
export const talkPanelPaddingPixels = 8;
const borderPixels = 2;
const shadowPixels = 3;

export interface TalkPanelCanvasSize {
  readonly widthPixels: number;
  readonly heightPixels: number;
}

export function talkPanelCanvasSize(
  panelWidth: number,
  panelHeight: number,
): TalkPanelCanvasSize {
  return {
    widthPixels: panelWidth + shadowPixels,
    heightPixels: panelHeight + shadowPixels,
  };
}

export type TalkPanelContext = Pick<
  CanvasRenderingContext2D,
  "fillStyle" | "fillRect" | "clearRect"
>;

// `panelWidth`×`panelHeight` is the sign's outer box; text starts inside the padding.
// `footer` is drawn small in the sign's bottom-right corner (e.g. "12/29").
export function drawTalkPanel(
  context: TalkPanelContext,
  layout: TalkLayout,
  panelWidth: number,
  panelHeight: number,
  footer: string,
  colors: TalkPanelColors,
  // drawn large in the sign's bottom-right corner, if the text leaves room for it
  art?: { readonly grid: readonly string[]; readonly palette: TalkPalette },
): void {
  const size = talkPanelCanvasSize(panelWidth, panelHeight);
  context.clearRect(0, 0, size.widthPixels, size.heightPixels);
  context.fillStyle = colors.shadow;
  context.fillRect(shadowPixels, shadowPixels, panelWidth, panelHeight);
  context.fillStyle = colors.border;
  context.fillRect(0, 0, panelWidth, panelHeight);
  context.fillStyle = colors.paper;
  context.fillRect(
    borderPixels,
    borderPixels,
    panelWidth - 2 * borderPixels,
    panelHeight - 2 * borderPixels,
  );

  const left = talkPanelPaddingPixels;
  const top = talkPanelPaddingPixels;
  for (const box of layout.boxes) {
    context.fillStyle = colors.boxes[box.tone];
    context.fillRect(left + box.x, top + box.y, box.width, box.height);
  }
  for (const icon of layout.icons) {
    icon.grid.forEach((row, rowIndex) => {
      [...row].forEach((cell, column) => {
        const color = icon.palette[cell];
        if (cell === "." || color === undefined) {
          return;
        }
        context.fillStyle = color;
        context.fillRect(
          left + icon.x + column * icon.scale,
          top + icon.y + rowIndex * icon.scale,
          icon.scale,
          icon.scale,
        );
      });
    });
  }
  for (const run of layout.runs) {
    drawTalkText(
      context,
      run.text,
      left + run.x,
      top + run.y,
      run.scale,
      colors.tones[run.tone],
    );
    // a hyperlink is underlined, in the gap under its line
    if (run.link !== undefined) {
      context.fillRect(
        left + run.x,
        top + run.y + talkGlyphRows * run.scale,
        [...run.text].length * (talkGlyphColumns + 1) * run.scale - run.scale,
        run.scale,
      );
    }
  }
  const footerX =
    panelWidth -
    talkPanelPaddingPixels -
    [...footer].length * (talkGlyphColumns + 1);
  drawTalkText(
    context,
    footer,
    footerX,
    panelHeight - talkPanelPaddingPixels - talkGlyphRows,
    1,
    colors.tones.muted,
  );
  if (art !== undefined) {
    drawSignArt(context, layout, panelWidth, panelHeight, art);
  }
}

// The copy button in the sign's top-right corner: a key cap with two sheets on it. A
// click copies the slide's text (talk-copy.ts). Canvas pixels.
const copyButtonSize = 11;
const copyButtonInset = 4;
const copyGlyph = [
  "..#####",
  "..#...#",
  "#####.#",
  "#ooo#.#",
  "#ooo###",
  "#ooo#..",
  "#####..",
];

export function talkCopyButtonArea(panelWidth: number): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  return {
    x: panelWidth - copyButtonInset - copyButtonSize,
    y: copyButtonInset,
    width: copyButtonSize,
    height: copyButtonSize,
  };
}

// The corner of the text area the button covers, plus a gap: no line starts under it.
export const talkCopyButtonCorner = {
  widthPixels: copyButtonSize + copyButtonInset - talkPanelPaddingPixels + 2,
  heightPixels: copyButtonInset + copyButtonSize - talkPanelPaddingPixels + 1,
} as const;

// Whether a point of the sign (canvas pixels) is on the copy button, with a pixel of
// slack around it.
export function talkCopyButtonAt(
  panelWidth: number,
  x: number,
  y: number,
): boolean {
  const area = talkCopyButtonArea(panelWidth);
  return (
    x >= area.x - 1 &&
    x < area.x + area.width + 1 &&
    y >= area.y - 1 &&
    y < area.y + area.height + 1
  );
}

export function drawTalkCopyButton(
  context: TalkPanelContext,
  panelWidth: number,
  colors: TalkPanelColors,
): void {
  const area = talkCopyButtonArea(panelWidth);
  context.fillStyle = colors.border;
  context.fillRect(area.x, area.y, area.width, area.height);
  context.fillStyle = colors.paper;
  context.fillRect(area.x + 1, area.y + 1, area.width - 2, area.height - 2);
  const inset = (copyButtonSize - (copyGlyph[0]?.length ?? 0)) / 2;
  copyGlyph.forEach((row, rowIndex) => {
    [...row].forEach((cell, column) => {
      if (cell === ".") {
        return;
      }
      context.fillStyle = cell === "#" ? colors.tones.muted : colors.paper;
      context.fillRect(
        area.x + inset + column,
        area.y + inset + rowIndex,
        1,
        1,
      );
    });
  });
}

// Writes `text` in the talk font at (x, y), `scale` canvas pixels per font pixel.
export function drawTalkText(
  context: TalkPanelContext,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string,
): void {
  context.fillStyle = color;
  let cursor = x;
  for (const character of text) {
    const glyph = talkGlyph(character);
    glyph.forEach((row, rowIndex) => {
      row.forEach((on, column) => {
        if (on) {
          context.fillRect(
            cursor + column * scale,
            y + rowIndex * scale,
            scale,
            scale,
          );
        }
      });
    });
    cursor += (talkGlyphColumns + 1) * scale;
  }
}

// The largest whole scale (4, 3 or 2) at which `art` fits under the text, above the
// footer, in the sign's bottom-right corner; nothing when it fits at none.
const signArtScales = [4, 3, 2] as const;
const signArtGapPixels = 6;
const footerRowPixels = 10;

// The free part of a sign under its text and above its footer, in canvas pixels.
export function talkPanelFreeArea(
  layout: TalkLayout,
  panelWidth: number,
  panelHeight: number,
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const top = talkPanelPaddingPixels + layout.heightPixels + 4;
  const floor = panelHeight - talkPanelPaddingPixels - footerRowPixels;
  return {
    x: talkPanelPaddingPixels,
    y: top,
    width: panelWidth - 2 * talkPanelPaddingPixels,
    height: Math.max(0, floor - top),
  };
}

function drawSignArt(
  context: TalkPanelContext,
  layout: TalkLayout,
  panelWidth: number,
  panelHeight: number,
  art: { readonly grid: readonly string[]; readonly palette: TalkPalette },
): void {
  const textBottom = talkPanelPaddingPixels + layout.heightPixels;
  const floor = panelHeight - talkPanelPaddingPixels - footerRowPixels;
  const columns = art.grid[0]?.length ?? 0;
  for (const scale of signArtScales) {
    const height = art.grid.length * scale;
    if (textBottom + signArtGapPixels + height > floor) {
      continue;
    }
    const left = panelWidth - talkPanelPaddingPixels - columns * scale;
    const top = floor - height;
    art.grid.forEach((row, rowIndex) => {
      [...row].forEach((cell, column) => {
        const color = art.palette[cell];
        if (cell === "." || color === undefined) {
          return;
        }
        context.fillStyle = color;
        context.fillRect(
          left + column * scale,
          top + rowIndex * scale,
          scale,
          scale,
        );
      });
    });
    return;
  }
}

// The world map: every world of the talk as an island on a sea, joined by a dotted path
// in the order the talk visits them, with each world's icon and name. Drawn
// straight into a sign's canvas, in game pixels, from the talk's own section slides, so
// the map always matches the talk.
import { drawTalkGrid } from "./talk-art";
import { talkCellWidthPixels } from "./talk-font";
import { drawTalkText, type TalkPanelContext } from "./talk-panel";
import { talkProps, type TalkPropId } from "./talk-props";

export interface TalkMapWorld {
  readonly name: string;
  readonly icon: TalkPropId | null;
}

export interface TalkMapArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const colors = {
  sea: "#3f8fd2",
  seaLight: "#62a9e4",
  sand: "#e9d39a",
  grass: "#5fb34a",
  grassDark: "#3f8a35",
  path: "#f4e06a",
  node: "#d8432f",
  nodeRim: "#1b1b24",
  label: "#ffffff",
  labelShadow: "#1b3b66",
} as const;

const islandWidth = 44;
const islandHeight = 22;
const nodeSize = 6;
const pathDot = 2;
const pathGap = 4;
const iconLift = 15;

// The height the map needs; a slide whose text leaves less fails to prepare.
export const talkMapMinimumHeight = 120;

// Where world `index` of `count` sits: left to right along the top row, then right to
// left along the bottom one, like a path that turns at the edge of the map.
function talkMapNodePosition(
  index: number,
  count: number,
  area: TalkMapArea,
): { readonly x: number; readonly y: number } {
  const perRow = Math.ceil(count / 2);
  const row = index < perRow ? 0 : 1;
  const column = row === 0 ? index : count - 1 - index;
  const slot = area.width / perRow;
  return {
    x: Math.round(area.x + slot * (column + 0.5)),
    y: Math.round(area.y + area.height * (row === 0 ? 0.3 : 0.75)),
  };
}

function ellipse(
  context: TalkPanelContext,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  color: string,
): void {
  context.fillStyle = color;
  const radiusX = width / 2;
  const radiusY = height / 2;
  for (let row = -Math.floor(radiusY); row <= Math.floor(radiusY); row++) {
    const half = Math.round(radiusX * Math.sqrt(1 - (row / radiusY) ** 2));
    context.fillRect(centerX - half, centerY + row, half * 2, 1);
  }
}

function dottedLine(
  context: TalkPanelContext,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): void {
  context.fillStyle = colors.path;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.floor(length / pathGap);
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    context.fillRect(
      Math.round(from.x + (to.x - from.x) * t) - 1,
      Math.round(from.y + (to.y - from.y) * t) - 1,
      pathDot,
      pathDot,
    );
  }
}

// The path turns along this margin, outside the labels, between the two rows.
const turnMarginPixels = 5;

function shadowedText(
  context: TalkPanelContext,
  text: string,
  centerX: number,
  top: number,
  area: TalkMapArea,
): void {
  const width = [...text].length * talkCellWidthPixels;
  // centred under its island, but never past the edge of the map
  const left = Math.min(
    area.x + area.width - turnMarginPixels * 2 - width,
    Math.max(area.x + 2, Math.round(centerX - width / 2)),
  );
  drawTalkText(context, text, left + 1, top + 1, 1, colors.labelShadow);
  drawTalkText(context, text, left, top, 1, colors.label);
}

export function drawTalkWorldMap(
  context: TalkPanelContext,
  worlds: readonly TalkMapWorld[],
  area: TalkMapArea,
): void {
  context.fillStyle = colors.sea;
  context.fillRect(area.x, area.y, area.width, area.height);
  // a few lighter wave marks, at fixed places so the picture is the same every time
  context.fillStyle = colors.seaLight;
  for (let wave = 0; wave < 24; wave++) {
    const x = area.x + ((wave * 97) % Math.max(1, area.width - 8));
    const y = area.y + 4 + ((wave * 53) % Math.max(1, area.height - 8));
    context.fillRect(x, y, 6, 1);
  }
  const positions = worlds.map((_, index) =>
    talkMapNodePosition(index, worlds.length, area),
  );
  const turnX = area.x + area.width - turnMarginPixels;
  positions.forEach((position, index) => {
    const next = positions[index + 1];
    if (next === undefined) {
      return;
    }
    if (next.y === position.y) {
      dottedLine(context, position, next);
      return;
    }
    // the turn between the rows runs along the right margin, clear of the labels
    dottedLine(context, position, { x: turnX, y: position.y });
    dottedLine(context, { x: turnX, y: position.y }, { x: turnX, y: next.y });
    dottedLine(context, { x: turnX, y: next.y }, next);
  });
  worlds.forEach((world, index) => {
    const position = positions[index];
    if (position === undefined) {
      return;
    }
    ellipse(
      context,
      position.x,
      position.y,
      islandWidth + 4,
      islandHeight + 4,
      colors.sand,
    );
    ellipse(
      context,
      position.x,
      position.y - 1,
      islandWidth,
      islandHeight,
      colors.grass,
    );
    ellipse(
      context,
      position.x,
      position.y + 4,
      islandWidth - 10,
      4,
      colors.grassDark,
    );
    if (world.icon !== null) {
      const prop = talkProps[world.icon];
      const width = prop.grid[0]?.length ?? 0;
      drawTalkGrid(
        context,
        prop.grid,
        prop.palette,
        position.x - Math.floor(width / 2),
        position.y - iconLift - Math.max(0, prop.grid.length - 16),
      );
    }
    context.fillStyle = colors.nodeRim;
    context.fillRect(
      position.x - nodeSize / 2 - 1,
      position.y + 1,
      nodeSize + 2,
      nodeSize + 2,
    );
    context.fillStyle = colors.node;
    context.fillRect(
      position.x - nodeSize / 2,
      position.y + 2,
      nodeSize,
      nodeSize,
    );
    shadowedText(
      context,
      world.name,
      position.x,
      position.y + islandHeight / 2 + 3,
      area,
    );
  });
}

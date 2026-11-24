// Lays a slide's diagram (talk-script.ts) out on a sign with the layout's own
// primitives: text runs, filled boxes (lines and shading) and prop icons, in panel
// pixels from (0, top). A sequence: one column per actor, headed by its icon and name,
// a lifeline down from each, then one row per message (an arrow with its words over it;
// a reply dashed) or note (shaded). A flow: nodes on a grid (icon, words wrapped under
// it), joined by right-angled arrows; dotted edges dashed. Pure: no drawing.
import { talkCellWidthPixels, talkLineHeightPixels } from "./talk-font";
import type { TalkBox, TalkIcon, TalkTextRun } from "./talk-layout";
import { talkProps, type TalkPropId } from "./talk-props";
import type {
  TalkDiagram,
  TalkFlowEdge,
  TalkFlowNode,
  TalkSequenceActor,
  TalkSequenceStep,
} from "./talk-script";

export interface TalkDiagramLayout {
  readonly runs: readonly TalkTextRun[];
  readonly boxes: readonly TalkBox[];
  readonly icons: readonly TalkIcon[];
  readonly heightPixels: number;
  // false when the sign is too narrow for the diagram's words: the caller reports an
  // overflow, so the sign falls back to a smaller zoom
  readonly fits: boolean;
}

// a prop's size in pixels (most are 16×16; a few are bigger)
function iconSize(id: TalkPropId | null): { width: number; height: number } {
  if (id === null) {
    return { width: 0, height: 0 };
  }
  const grid = talkProps[id].grid;
  return { width: grid[0]?.length ?? 0, height: grid.length };
}
const arrowHead = 2; // pixels each side of the shaft
const dash = 2; // a dashed line: this many pixels on, this many off

class Drawing {
  readonly runs: TalkTextRun[] = [];
  readonly boxes: TalkBox[] = [];
  readonly icons: TalkIcon[] = [];

  text(text: string, x: number, y: number): void {
    this.runs.push({ text, x, y, scale: 1, tone: "ink" });
  }

  // a patch of paper behind words, so lines drawn earlier don't run through them
  clear(x: number, y: number, width: number): void {
    this.boxes.push({
      x: x - 1,
      y: y - 1,
      width: width + 2,
      height: talkLineHeightPixels - 1,
      tone: "paper",
    });
  }

  icon(id: TalkPropId, x: number, y: number): void {
    const prop = talkProps[id];
    this.icons.push({ grid: prop.grid, palette: prop.palette, x, y, scale: 1 });
  }

  // a horizontal or vertical line, solid or dashed
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dashed: boolean,
    tone: "line" | "rule" = "line",
  ): void {
    const horizontal = y1 === y2;
    const from = horizontal ? Math.min(x1, x2) : Math.min(y1, y2);
    const to = horizontal ? Math.max(x1, x2) : Math.max(y1, y2);
    const step = dashed ? dash : to - from + 1;
    for (let at = from; at <= to; at += dashed ? 2 * dash : step) {
      const length = Math.min(step, to - at + 1);
      this.boxes.push(
        horizontal
          ? { x: at, y: y1, width: length, height: 1, tone }
          : { x: x1, y: at, width: 1, height: length, tone },
      );
    }
  }

  // an arrowhead whose tip is at (x, y), pointing along (dx, dy)
  head(x: number, y: number, dx: number, dy: number): void {
    for (let back = 1; back <= arrowHead; back++) {
      if (dx !== 0) {
        this.boxes.push({
          x: x - dx * back,
          y: y - back,
          width: 1,
          height: 2 * back + 1,
          tone: "line",
        });
      } else {
        this.boxes.push({
          x: x - back,
          y: y - dy * back,
          width: 2 * back + 1,
          height: 1,
          tone: "line",
        });
      }
    }
  }
}

const widthOf = (text: string): number =>
  [...text].length * talkCellWidthPixels;

// Greedy wrap to `width` pixels; a word wider than that stays whole (the caller checks).
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((part) => part.length > 0)) {
    const next = line.length === 0 ? word : `${line} ${word}`;
    if (line.length > 0 && widthOf(next) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines;
}

export function layoutTalkDiagram(
  diagram: TalkDiagram,
  widthPixels: number,
  top: number,
): TalkDiagramLayout {
  return diagram.kind === "sequence"
    ? sequence(diagram.actors, diagram.steps, widthPixels, top)
    : flow(diagram.nodes, diagram.edges, widthPixels, top);
}

// --- sequence ---

const headerGap = 4;
const messageRow = 13; // words on the first 10 pixels, the arrow on the 11th
const noteRow = 14;

function sequence(
  actors: readonly TalkSequenceActor[],
  steps: readonly TalkSequenceStep[],
  width: number,
  top: number,
): TalkDiagramLayout {
  const drawing = new Drawing();
  const columnWidth = Math.floor(width / Math.max(1, actors.length));
  const centre = new Map(
    actors.map((actor, index) => [
      actor.id,
      Math.floor(columnWidth * index + columnWidth / 2),
    ]),
  );
  const at = (id: string): number => centre.get(id) ?? 0;
  const headerHeight = Math.max(
    talkLineHeightPixels,
    ...actors.map((actor) => iconSize(actor.icon).height),
  );
  let fits = true;
  for (const actor of actors) {
    const label = widthOf(actor.label);
    const icon = iconSize(actor.icon);
    const group = label + (actor.icon === null ? 0 : icon.width + 3);
    if (group > columnWidth - 4) {
      fits = false;
    }
    let x = at(actor.id) - Math.floor(group / 2);
    if (actor.icon !== null) {
      drawing.icon(
        actor.icon,
        x,
        top + Math.floor((headerHeight - icon.height) / 2),
      );
      x += icon.width + 3;
    }
    drawing.text(
      actor.label,
      x,
      top + Math.floor((headerHeight - talkLineHeightPixels) / 2) + 1,
    );
  }
  let y = top + headerHeight + headerGap;
  const lifelineTop = y - 1;
  for (const step of steps) {
    if (step.kind === "message") {
      const x1 = at(step.from);
      const x2 = at(step.to);
      const words = widthOf(step.text);
      if (words > width) {
        fits = false;
      }
      const middle = Math.floor((x1 + x2) / 2);
      const left = Math.max(
        0,
        Math.min(width - words, middle - Math.floor(words / 2)),
      );
      drawing.clear(left, y, words);
      drawing.text(step.text, left, y);
      const shaft = y + 10;
      const direction = x2 > x1 ? 1 : -1;
      drawing.line(x1, shaft, x2 - direction, shaft, step.reply);
      drawing.head(x2 - direction, shaft, direction, 0);
      y += messageRow;
    } else {
      const xs = step.over.map(at);
      const words = widthOf(step.text);
      const spanLeft = Math.min(...xs) - 8;
      const spanRight = Math.max(...xs) + 8;
      const boxWidth = Math.max(spanRight - spanLeft, words + 8);
      const left = Math.max(
        0,
        Math.min(
          width - boxWidth,
          Math.floor((spanLeft + spanRight) / 2 - boxWidth / 2),
        ),
      );
      if (boxWidth > width) {
        fits = false;
      }
      drawing.boxes.push({
        x: left,
        y,
        width: boxWidth,
        height: noteRow - 2,
        tone: "note",
      });
      drawing.text(step.text, left + Math.floor((boxWidth - words) / 2), y + 2);
      y += noteRow;
    }
  }
  // lifelines first, so arrows and notes are drawn over them
  const lifelines: TalkBox[] = actors.map((actor) => ({
    x: at(actor.id),
    y: lifelineTop,
    width: 1,
    height: y - lifelineTop,
    tone: "rule",
  }));
  return {
    runs: drawing.runs,
    boxes: [...lifelines, ...drawing.boxes],
    icons: drawing.icons,
    heightPixels: y - top,
    fits,
  };
}

// --- flow ---

const rowGap = 12; // room for the edges that run between rows
const labelGap = 2;

interface Placed {
  readonly node: TalkFlowNode;
  readonly x: number; // centre
  readonly y: number; // top of the row's icon band
  readonly band: number; // the band's height
  readonly halfWidth: number; // half the icon's width
  readonly lines: readonly string[];
  readonly bottom: number;
}

function flow(
  nodes: readonly TalkFlowNode[],
  edges: readonly TalkFlowEdge[],
  width: number,
  top: number,
): TalkDiagramLayout {
  const drawing = new Drawing();
  const columns = Math.max(1, ...nodes.map((node) => node.column + 1));
  const rows = Math.max(1, ...nodes.map((node) => node.row + 1));
  const columnWidth = Math.floor(width / columns);
  const textWidth = columnWidth - 4;
  let fits = true;
  const wrapped = new Map(
    nodes.map((node) => {
      const lines = node.lines.flatMap((line) => wrap(line, textWidth));
      if (lines.some((line) => widthOf(line) > textWidth)) {
        fits = false;
      }
      return [node.id, lines];
    }),
  );
  // each row's icons share a band as tall as its tallest icon, words under it
  const bands = Array.from({ length: rows }, (_, row) =>
    Math.max(
      0,
      ...nodes
        .filter((node) => node.row === row)
        .map((node) => iconSize(node.icon).height),
    ),
  );
  const nodeHeight = (node: TalkFlowNode): number =>
    ((bands[node.row] ?? 0) > 0 ? (bands[node.row] ?? 0) + labelGap : 0) +
    (wrapped.get(node.id)?.length ?? 0) * talkLineHeightPixels;
  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(0, ...nodes.filter((node) => node.row === row).map(nodeHeight)),
  );
  const rowTops: number[] = [];
  let y = top;
  for (const height of rowHeights) {
    rowTops.push(y);
    y += height + rowGap;
  }
  const placed = new Map<string, Placed>(
    nodes.map((node) => {
      const x = Math.floor(columnWidth * node.column + columnWidth / 2);
      const nodeTop = rowTops[node.row] ?? top;
      return [
        node.id,
        {
          node,
          x,
          y: nodeTop,
          band: bands[node.row] ?? 0,
          halfWidth: Math.ceil(iconSize(node.icon).width / 2),
          lines: wrapped.get(node.id) ?? [],
          bottom: nodeTop + nodeHeight(node) - 1,
        },
      ];
    }),
  );
  for (const { node, x, y: nodeTop, band, lines } of placed.values()) {
    let lineTop = nodeTop;
    if (band > 0) {
      if (node.icon !== null) {
        const icon = iconSize(node.icon);
        // sitting on the band's floor, so a row's words line up
        drawing.icon(
          node.icon,
          x - Math.floor(icon.width / 2),
          nodeTop + band - icon.height,
        );
      }
      lineTop += band + labelGap;
    }
    lines.forEach((line, index) => {
      drawing.text(
        line,
        x - Math.floor(widthOf(line) / 2),
        lineTop + index * talkLineHeightPixels,
      );
    });
  }
  for (const edge of edges) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (from !== undefined && to !== undefined) {
      route(drawing, from, to, edge.dotted, rowTops, rowHeights);
    }
  }
  return {
    runs: drawing.runs,
    boxes: drawing.boxes,
    icons: drawing.icons,
    heightPixels: y - rowGap - top,
    fits,
  };
}

// A right-angled path between two nodes, ending in an arrowhead. Side by side: straight
// across, at the height of the icons' middle. One above the other: straight down or up.
// Otherwise: out of the top or bottom, along the gap between the rows, then in, a few
// pixels off centre on the side facing the other node so paths sharing a node's top or
// bottom stay apart.
function route(
  drawing: Drawing,
  from: Placed,
  to: Placed,
  dashed: boolean,
  rowTops: readonly number[],
  rowHeights: readonly number[],
): void {
  const sameRow = from.node.row === to.node.row;
  const sameColumn = from.node.column === to.node.column;
  if (sameRow) {
    const direction = to.x > from.x ? 1 : -1;
    const y = from.y + Math.floor(from.band / 2);
    const x1 = from.x + direction * (from.halfWidth + 2);
    const x2 = to.x - direction * (to.halfWidth + 3);
    drawing.line(x1, y, x2, y, dashed);
    drawing.head(x2, y, direction, 0);
    return;
  }
  const down = to.node.row > from.node.row;
  const direction = down ? 1 : -1;
  if (sameColumn) {
    const y1 = down ? from.bottom + 2 : from.y - 2;
    const y2 = down ? to.y - 3 : to.bottom + 3;
    drawing.line(from.x, y1, from.x, y2, dashed);
    drawing.head(from.x, y2, 0, direction);
    return;
  }
  const toward = to.x > from.x ? 1 : -1;
  const x1 = from.x + toward * 5;
  const x2 = to.x - toward * 5;
  const y1 = down ? from.bottom + 2 : from.y - 2;
  const gapRow = down ? from.node.row : from.node.row - 1;
  const gapY =
    (rowTops[gapRow] ?? 0) + (rowHeights[gapRow] ?? 0) + Math.floor(rowGap / 2);
  const y2 = down ? to.y - 3 : to.bottom + 3;
  drawing.line(x1, y1, x1, gapY, dashed);
  drawing.line(x1, gapY, x2, gapY, dashed);
  drawing.line(x2, gapY, x2, y2, dashed);
  drawing.head(x2, y2, 0, direction);
}

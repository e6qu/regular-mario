// The egress diagram: one request leaving an agent's VM. The agent holds only a
// placeholder token; the egress proxy checks the host and the operation against policy;
// the credential broker, outside the VM, swaps in the real token; the API sees a real
// token. A second request, to a host the policy doesn't list, stops at the proxy. Drawn
// into a sign's canvas in game pixels; `talkEgressTravellers` says where the two
// envelopes are at a given moment, so the room can animate them over the sign.
import { talkCellWidthPixels } from "./talk-font";
import { drawTalkText, type TalkPanelContext } from "./talk-panel";
import { talkProps, type TalkPropId } from "./talk-props";

export interface TalkEgressArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Station {
  readonly title: string;
  readonly lines: readonly string[];
  readonly icon: TalkPropId;
  readonly bar: string;
}

const stations: readonly Station[] = [
  {
    title: "AGENT, IN A VM",
    lines: ["env: GH_TOKEN=", "proxy-injected"],
    icon: "robot-head",
    bar: "#5a6b7d",
  },
  {
    title: "EGRESS PROXY",
    lines: ["is this host and", "operation listed?"],
    icon: "funnel",
    bar: "#2f4f8f",
  },
  {
    title: "CREDENTIAL BROKER",
    lines: ["swaps in the real", "token, outside VM"],
    icon: "keyring",
    bar: "#7a4fa0",
  },
  {
    title: "api.github.com",
    lines: ["sees a real token", "scoped to the job"],
    icon: "globe",
    bar: "#3f8a35",
  },
];

const denied: Station = {
  title: "attacker.example",
  lines: ["not listed:", "denied and logged"],
  icon: "stamp-deny",
  bar: "#c0392b",
};

const colors = {
  box: "#ffffff",
  boxRim: "#1b1b24",
  text: "#1b1b24",
  title: "#ffffff",
  arrow: "#1b1b24",
  deniedArrow: "#c0392b",
  vm: "#5a6b7d",
} as const;

const barHeight = 11;
const iconScale = 2;
const iconPixels = 16 * iconScale;
const lineHeight = 9;
const boxHeight = barHeight + 4 + iconPixels + 4 + 2 * lineHeight + 3;
const deniedHeight = barHeight + 2 * lineHeight + 6;
const rowGap = 14;
const vmMargin = 5;

// The height the diagram needs; a slide whose text leaves less fails to prepare.
export const talkEgressMinimumHeight =
  vmMargin + boxHeight + rowGap + deniedHeight + vmMargin;

interface Geometry {
  readonly boxes: readonly { readonly x: number; readonly y: number }[];
  readonly boxWidth: number;
  readonly deniedBox: { readonly x: number; readonly y: number };
  readonly laneY: number;
}

function geometry(area: TalkEgressArea): Geometry {
  const gap = 30;
  const boxWidth = Math.floor(
    (area.width - 2 * vmMargin - gap * (stations.length - 1)) / stations.length,
  );
  const top = area.y + vmMargin;
  const boxes = stations.map((_, index) => ({
    x: area.x + vmMargin + index * (boxWidth + gap),
    y: top,
  }));
  const proxy = boxes[1] ?? { x: area.x, y: top };
  return {
    boxes,
    boxWidth,
    deniedBox: { x: proxy.x, y: top + boxHeight + rowGap },
    laneY: top + barHeight + 4 + iconPixels / 2,
  };
}

function drawScaledProp(
  context: TalkPanelContext,
  id: TalkPropId,
  x: number,
  y: number,
  scale: number,
): void {
  const prop = talkProps[id];
  prop.grid.forEach((row, rowIndex) => {
    [...row].forEach((cell, column) => {
      const color = prop.palette[cell];
      if (cell === "." || color === undefined) {
        return;
      }
      context.fillStyle = color;
      context.fillRect(x + column * scale, y + rowIndex * scale, scale, scale);
    });
  });
}

function centredText(
  context: TalkPanelContext,
  text: string,
  centerX: number,
  top: number,
  color: string,
): void {
  const width = [...text].length * talkCellWidthPixels;
  drawTalkText(context, text, Math.round(centerX - width / 2), top, 1, color);
}

function drawBox(
  context: TalkPanelContext,
  station: Station,
  x: number,
  y: number,
  width: number,
  height: number,
  withIcon: boolean,
): void {
  context.fillStyle = colors.boxRim;
  context.fillRect(x - 1, y - 1, width + 2, height + 2);
  context.fillStyle = colors.box;
  context.fillRect(x, y, width, height);
  context.fillStyle = station.bar;
  context.fillRect(x, y, width, barHeight);
  const centerX = x + width / 2;
  centredText(context, station.title, centerX, y + 2, colors.title);
  let top = y + barHeight + 4;
  if (withIcon) {
    const iconWidth =
      (talkProps[station.icon].grid[0]?.length ?? 16) * iconScale;
    drawScaledProp(
      context,
      station.icon,
      Math.round(centerX - iconWidth / 2),
      top,
      iconScale,
    );
    top += iconPixels + 4;
  } else {
    top += 1;
  }
  station.lines.forEach((line, index) => {
    centredText(context, line, centerX, top + index * lineHeight, colors.text);
  });
}

function arrow(
  context: TalkPanelContext,
  from: Point,
  to: Point,
  color: string,
): void {
  context.fillStyle = color;
  if (from.y === to.y) {
    context.fillRect(from.x, from.y - 1, to.x - from.x - 3, 2);
    for (let step = 0; step < 4; step++) {
      context.fillRect(to.x - 4 + step, to.y - 3 + step, 1, 7 - 2 * step);
    }
    return;
  }
  context.fillRect(from.x - 1, from.y, 2, to.y - from.y - 3);
  for (let step = 0; step < 4; step++) {
    context.fillRect(to.x - 3 + step, to.y - 4 + step, 7 - 2 * step, 1);
  }
}

export function drawTalkEgressDiagram(
  context: TalkPanelContext,
  area: TalkEgressArea,
): void {
  const { boxes, boxWidth, deniedBox, laneY } = geometry(area);
  const first = boxes[0];
  if (first === undefined) {
    return;
  }
  // the VM: a dashed wall around the agent, with no way out but the arrow
  context.fillStyle = colors.vm;
  const vm = {
    x: first.x - vmMargin + 1,
    y: first.y - vmMargin + 1,
    width: boxWidth + 2 * vmMargin - 2,
    height: boxHeight + 2 * vmMargin - 2,
  };
  for (let x = vm.x; x < vm.x + vm.width; x += 6) {
    context.fillRect(x, vm.y, 3, 1);
    context.fillRect(x, vm.y + vm.height - 1, 3, 1);
  }
  for (let y = vm.y; y < vm.y + vm.height; y += 6) {
    context.fillRect(vm.x, y, 1, 3);
    context.fillRect(vm.x + vm.width - 1, y, 1, 3);
  }
  centredText(
    context,
    "the VM: one way out",
    vm.x + vm.width / 2,
    vm.y + vm.height + 3,
    colors.vm,
  );
  boxes.forEach((box, index) => {
    const next = boxes[index + 1];
    if (next !== undefined) {
      arrow(
        context,
        { x: box.x + boxWidth + 2, y: laneY },
        { x: next.x - 2, y: laneY },
        colors.arrow,
      );
    }
  });
  const proxy = boxes[1];
  if (proxy !== undefined) {
    const x = Math.round(proxy.x + boxWidth / 2);
    arrow(
      context,
      { x, y: proxy.y + boxHeight + 2 },
      { x, y: deniedBox.y - 2 },
      colors.deniedArrow,
    );
  }
  stations.forEach((station, index) => {
    const box = boxes[index];
    if (box !== undefined) {
      drawBox(context, station, box.x, box.y, boxWidth, boxHeight, true);
    }
  });
  drawBox(
    context,
    denied,
    deniedBox.x,
    deniedBox.y,
    boxWidth,
    deniedHeight,
    false,
  );
}

// Where the two envelopes are, `cycle` of the way (0 to 1) through the loop, in the
// area's coordinates. The allowed request carries the placeholder until the broker, then
// the real key; the refused one heads for an unlisted host and is stamped at the proxy.
export interface TalkEgressTravellers {
  readonly allowed: Point;
  readonly carriesKey: boolean;
  readonly refused: Point | null;
  readonly stamped: boolean;
}

function along(points: readonly Point[], t: number): Point {
  const legs = points.length - 1;
  const clamped = Math.min(Math.max(t, 0), 1);
  const leg = Math.min(Math.floor(clamped * legs), legs - 1);
  const local = clamped * legs - leg;
  const from = points[leg] ?? { x: 0, y: 0 };
  const to = points[leg + 1] ?? from;
  return {
    x: Math.round(from.x + (to.x - from.x) * local),
    y: Math.round(from.y + (to.y - from.y) * local),
  };
}

export function talkEgressTravellers(
  area: TalkEgressArea,
  cycle: number,
): TalkEgressTravellers {
  const { boxes, boxWidth, laneY } = geometry(area);
  const centre = (index: number): number =>
    (boxes[index]?.x ?? 0) + boxWidth / 2;
  const gapAfter = (index: number): number =>
    (boxes[index]?.x ?? 0) + boxWidth + 15;
  const allowedPath: Point[] = [
    { x: centre(0), y: laneY },
    { x: gapAfter(0), y: laneY },
    { x: gapAfter(1), y: laneY },
    { x: gapAfter(2), y: laneY },
    { x: centre(3), y: laneY },
  ];
  const t = cycle % 1;
  const allowed = along(allowedPath, t);
  const refusedT = (t + 0.5) % 1;
  // stopped at the proxy's door, on the way to the host it doesn't list
  const stopY = (boxes[1]?.y ?? 0) + boxHeight + 6;
  const refused =
    refusedT < 0.75
      ? along(
          [
            { x: centre(0), y: laneY },
            { x: gapAfter(0), y: laneY },
            { x: centre(1), y: laneY },
            { x: centre(1), y: stopY },
          ],
          refusedT / 0.6,
        )
      : null;
  return {
    allowed,
    carriesKey: allowed.x >= gapAfter(2),
    refused,
    stamped: refusedT >= 0.6 && refusedT < 0.75,
  };
}

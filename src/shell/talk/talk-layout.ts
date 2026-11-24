// Lays a talk slide out as lines of bitmap text inside a panel, in game pixels. Pure:
// the renderer only draws what this returns. Text wraps at word boundaries; a word longer
// than a line is split. A slide that does not fit its panel is an explicit overflow.
import {
  talkCellWidthPixels,
  talkLineHeightPixels,
  unsupportedTalkCharacters,
  UnsupportedTalkCharacterError,
} from "./talk-font";
import type { TalkPalette } from "./talk-art";
import { layoutTalkDiagram } from "./talk-diagram";
import { talkPictures } from "./talk-pictures";
import { talkProps, talkPropIds, type TalkPropId } from "./talk-props";
import { TalkArtError } from "./talk-scene";
import type { TalkLink, TalkSlide } from "./talk-script";

export type TalkTone = "ink" | "muted" | "accent" | "inverse" | "link";

// Filled rectangles drawn under the text, for window chrome such as an email's title bar.
export type TalkBoxTone =
  | "bar"
  | "rule"
  | "close"
  | "minimise"
  | "zoom"
  | "line"
  | "note"
  | "paper";

export interface TalkBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly tone: TalkBoxTone;
}

export interface TalkTextRun {
  readonly text: string;
  readonly x: number; // panel pixels, left of the first glyph cell
  readonly y: number; // panel pixels, top of the line
  readonly scale: number; // whole-pixel magnification of the 5×7 glyphs
  readonly tone: TalkTone;
  // the address a click on this run opens, for a run that is a hyperlink
  readonly link?: string;
}

// A small picture in the text, such as a table row's icon, `scale` pixels per cell.
export interface TalkIcon {
  readonly grid: readonly string[];
  readonly palette: TalkPalette;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface TalkPanelSize {
  readonly widthPixels: number;
  readonly heightPixels: number;
  // A top-right corner kept clear of text, for a button on the sign: a line that starts
  // above `heightPixels` stops `widthPixels` short of the right edge.
  readonly reserveTopRight?: TalkCorner;
}

interface TalkCorner {
  readonly widthPixels: number;
  readonly heightPixels: number;
}

export interface TalkLayout {
  readonly runs: readonly TalkTextRun[];
  readonly boxes: readonly TalkBox[];
  readonly icons: readonly TalkIcon[];
  readonly heightPixels: number;
  readonly overflowPixels: number; // 0 when the slide fits
}

const titleScale = 2;
const displayScale = 3;
const bodyScale = 1;
// a section's picture fills the height left under its text, up to this many sign
// pixels per picture pixel (before the sign's zoom)
const maximumPictureScale = 8;
const bulletMark = "→ ";
const gapAfterKicker = 6;
const gapAfterTitle = 8;
const gapBetweenBullets = 4;
const columnGap = 16;
// table columns keep whole words up to this many characters
const longestUnsplitWord = 12;
const tableCellGap = 10;
const gapBetweenTableRows = 2;
// a table row's icon is a prop, drawn at its own size before the first cell

function talkCharactersPerLine(widthPixels: number, scale: number): number {
  return Math.max(
    1,
    Math.floor((widthPixels + scale) / (talkCellWidthPixels * scale)),
  );
}

function textWidthPixels(text: string, scale: number): number {
  return [...text].length * talkCellWidthPixels * scale;
}

// Greedy word wrap to at most `width` characters per line.
export function wrapTalkText(text: string, width: number): readonly string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((part) => part.length > 0)) {
    let rest = word;
    while ([...rest].length > width) {
      if (line.length > 0) {
        lines.push(line);
        line = "";
      }
      const characters = [...rest];
      lines.push(characters.slice(0, width).join(""));
      rest = characters.slice(width).join("");
    }
    const candidate = line.length === 0 ? rest : `${line} ${rest}`;
    if ([...candidate].length > width) {
      lines.push(line);
      line = rest;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines;
}

// The words of `text` joined by single spaces, as wrapTalkText joins them.
function talkWords(text: string): string {
  return text
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .join(" ");
}

interface LinkSpan {
  readonly start: number;
  readonly end: number;
  readonly url: string;
}

// Where the slide's links' texts occur in `text`, ignoring case (kickers and table
// heads are drawn in capitals), earliest first and longest first, never overlapping;
// only the links whose context is this text, when they name one.
function linkSpans(
  text: string,
  links: readonly TalkLink[],
): readonly LinkSpan[] {
  const haystack = text.toLowerCase();
  const found: LinkSpan[] = [];
  for (const link of links) {
    // a link with a context is drawn only in that text, or in a part of it (a
    // dialogue line's speaker or words)
    if (
      link.context !== undefined &&
      !talkWords(link.context).toLowerCase().includes(haystack)
    ) {
      continue;
    }
    const needle = talkWords(link.text).toLowerCase();
    if (needle.length < 2) {
      continue;
    }
    for (
      let at = haystack.indexOf(needle);
      at >= 0;
      at = haystack.indexOf(needle, at + needle.length)
    ) {
      found.push({ start: at, end: at + needle.length, url: link.url });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const spans: LinkSpan[] = [];
  for (const span of found) {
    const last = spans[spans.length - 1];
    if (last === undefined || span.start >= last.end) {
      spans.push(span);
    }
  }
  return spans;
}

class Cursor {
  readonly runs: TalkTextRun[] = [];
  readonly boxes: TalkBox[] = [];
  readonly icons: TalkIcon[] = [];
  y = 0;

  constructor(
    readonly widthPixels: number,
    private readonly links: readonly TalkLink[] = [],
    private readonly corner?: TalkCorner,
  ) {}

  // The lines `text` wraps to at x, `width` wide: a first line that starts in the kept
  // corner is shorter, the rest use the full width.
  private lines(
    text: string,
    x: number,
    scale: number,
    width: number,
  ): readonly string[] {
    const columns = talkCharactersPerLine(width, scale);
    const corner = this.corner;
    if (
      corner === undefined ||
      this.y >= corner.heightPixels ||
      x + width <= this.widthPixels - corner.widthPixels
    ) {
      return wrapTalkText(text, columns);
    }
    const narrow = talkCharactersPerLine(
      this.widthPixels - corner.widthPixels - x,
      scale,
    );
    const first = wrapTalkText(text, narrow)[0] ?? "";
    const rest = talkWords(text).slice(first.length).trimStart();
    return [first, ...wrapTalkText(rest, columns)];
  }

  // Writes `text` wrapped to `width` pixels, each line starting at x. A part of it that
  // is one of the slide's links becomes a run of its own, in the link tone, with its url.
  write(
    text: string,
    x: number,
    scale: number,
    tone: TalkTone,
    width: number,
  ): void {
    const words = talkWords(text);
    const spans = linkSpans(words, this.links);
    let offset = 0;
    for (const line of this.lines(text, x, scale, width)) {
      // each line is the next stretch of the words: after a space, or straight on
      // where a word too long for a line was split
      const start = words.indexOf(line, offset);
      const end = start + line.length;
      offset = end;
      const cuts = [
        start,
        ...spans.flatMap((span) => [span.start, span.end]),
        end,
      ]
        .filter((cut) => cut >= start && cut <= end)
        .sort((a, b) => a - b);
      let left = x;
      cuts.forEach((from, index) => {
        const to = cuts[index + 1];
        if (to === undefined || to <= from) {
          return;
        }
        const piece = words.slice(from, to);
        const url = spans.find(
          (span) => span.start <= from && to <= span.end,
        )?.url;
        this.runs.push({
          text: piece,
          x: left,
          y: this.y,
          scale,
          tone: url === undefined ? tone : "link",
          ...(url === undefined ? {} : { link: url }),
        });
        left += textWidthPixels(piece, scale);
      });
      this.y += talkLineHeightPixels * scale;
    }
  }

  bullets(items: readonly string[], x: number, width: number): void {
    items.forEach((item, index) => {
      if (index > 0) {
        this.y += gapBetweenBullets;
      }
      const markWidth = textWidthPixels(bulletMark, bodyScale);
      this.runs.push({
        text: bulletMark,
        x,
        y: this.y,
        scale: bodyScale,
        tone: "accent",
      });
      const start = this.y;
      this.write(item, x + markWidth, bodyScale, "ink", width - markWidth);
      if (this.y === start) {
        this.y += talkLineHeightPixels;
      }
    });
  }
}

function heading(cursor: Cursor, slide: TalkSlide): void {
  if (slide.kicker !== null) {
    cursor.write(
      slide.kicker.toUpperCase(),
      0,
      bodyScale,
      "muted",
      cursor.widthPixels,
    );
    cursor.y += gapAfterKicker;
  }
  if (slide.title !== null) {
    cursor.write(slide.title, 0, titleScale, "ink", cursor.widthPixels);
    cursor.y += gapAfterTitle;
  }
}

function tableColumnWidths(
  slide: TalkSlide,
  widthPixels: number,
): readonly number[] {
  const table = slide.table;
  if (table === null) {
    return [];
  }
  const count = table.head.length;
  const longest = table.head.map((cell, column) =>
    Math.max(
      [...cell].length,
      ...table.rows.map((row) => [...(row[column] ?? "")].length),
    ),
  );
  const total = longest.reduce((sum, value) => sum + value, 0);
  const available = widthPixels - tableCellGap * (count - 1);
  // a column is never narrower than its longest word (up to a cap), so a short label
  // such as "Windows" isn't split mid-word; the columns that gain take it from the rest
  const minimums = table.head.map((cell, column) => {
    const words = [cell, ...table.rows.map((row) => row[column] ?? "")]
      .flatMap((text) => text.split(/\s+/))
      .map((word) => [...word].length);
    return (
      talkCellWidthPixels * Math.min(Math.max(6, ...words), longestUnsplitWord)
    );
  });
  const widths = longest.map((value, column) =>
    Math.max(minimums[column] ?? 0, Math.floor((available * value) / total)),
  );
  const excess = widths.reduce((sum, value) => sum + value, 0) - available;
  if (excess <= 0) {
    return widths;
  }
  const slack = widths.map((value, column) => value - (minimums[column] ?? 0));
  const totalSlack = slack.reduce((sum, value) => sum + value, 0);
  return widths.map((value, column) =>
    totalSlack <= 0
      ? value
      : value - Math.ceil((excess * (slack[column] ?? 0)) / totalSlack),
  );
}

function table(cursor: Cursor, slide: TalkSlide): void {
  const content = slide.table;
  if (content === null) {
    return;
  }
  const icons = content.icons ?? [];
  // the icon column is as wide as the widest icon; each row as tall as its icon
  const iconWidths = icons.map((icon) =>
    icon === null ? 0 : (talkProps[tablePropId(icon)].grid[0]?.length ?? 0),
  );
  const widestIcon = Math.max(0, ...iconWidths);
  const iconColumn = widestIcon > 0 ? widestIcon + tableCellGap : 0;
  const widths = tableColumnWidths(slide, cursor.widthPixels - iconColumn);
  const row = (
    cells: readonly string[],
    tone: TalkTone,
    upper: boolean,
    icon: string | null = null,
  ): void => {
    const top = cursor.y;
    let bottom = top;
    // text sits level with the middle of the row's icon
    let textTop = top;
    if (icon !== null) {
      const prop = talkProps[tablePropId(icon)];
      const width = prop.grid[0]?.length ?? 0;
      const height = prop.grid.length;
      cursor.icons.push({
        grid: prop.grid,
        palette: prop.palette,
        x: Math.floor((widestIcon - width) / 2),
        y: top,
        scale: 1,
      });
      bottom = top + height;
      textTop =
        top + Math.max(0, Math.floor((height - talkLineHeightPixels) / 2));
    }
    let x = iconColumn;
    cells.forEach((cell, column) => {
      const width = widths[column] ?? 0;
      cursor.y = textTop;
      cursor.write(
        upper ? cell.toUpperCase() : cell,
        x,
        bodyScale,
        tone,
        width,
      );
      bottom = Math.max(bottom, cursor.y);
      x += width + tableCellGap;
    });
    cursor.y = bottom + gapBetweenTableRows;
  };
  row(content.head, "muted", true);
  content.rows.forEach((cells, index) => {
    row(cells, "ink", false, icons[index] ?? null);
  });
}

function tablePropId(icon: string): TalkPropId {
  const id = talkPropIds.find((candidate) => candidate === icon);
  if (id === undefined) {
    throw new TalkArtError(`A table row's icon "${icon}" is not a prop.`);
  }
  return id;
}

// A script: the speaker (before the first ": ") in a column of its own, in the accent
// colour, and the words beside it. A line with no speaker spans the whole width.
const longestSpeaker = 18;

function dialogue(cursor: Cursor, lines: readonly string[]): void {
  const parts = lines.map((line) => {
    const colon = line.indexOf(": ");
    return colon > 0 && colon <= longestSpeaker
      ? { speaker: line.slice(0, colon), words: line.slice(colon + 2) }
      : { speaker: null, words: line };
  });
  const speakerWidth =
    talkCellWidthPixels *
    (Math.max(0, ...parts.map((part) => [...(part.speaker ?? "")].length)) + 2);
  parts.forEach((part, index) => {
    if (index > 0) {
      cursor.y += gapBetweenBullets;
    }
    const top = cursor.y;
    if (part.speaker === null) {
      cursor.write(part.words, 0, bodyScale, "muted", cursor.widthPixels);
      return;
    }
    cursor.write(
      part.speaker.toUpperCase(),
      0,
      bodyScale,
      "accent",
      speakerWidth,
    );
    cursor.y = top;
    cursor.write(
      part.words,
      speakerWidth,
      bodyScale,
      "ink",
      cursor.widthPixels - speakerWidth,
    );
  });
}

function columns(cursor: Cursor, slide: TalkSlide): void {
  const count = slide.columns.length;
  if (count === 0) {
    return;
  }
  const width = Math.floor(
    (cursor.widthPixels - columnGap * (count - 1)) / count,
  );
  const top = cursor.y;
  let bottom = top;
  slide.columns.forEach((column, index) => {
    const x = index * (width + columnGap);
    cursor.y = top;
    cursor.write(column.label, x, bodyScale, "accent", width);
    cursor.y += gapAfterKicker;
    cursor.bullets(column.bullets, x, width);
    bottom = Math.max(bottom, cursor.y);
  });
  cursor.y = bottom;
}

function diagramText(slide: TalkSlide): readonly string[] {
  const diagram = slide.diagram;
  if (diagram === undefined) {
    return [];
  }
  return diagram.kind === "sequence"
    ? [
        ...diagram.actors.map((actor) => actor.label),
        ...diagram.steps.map((step) => step.text),
      ]
    : diagram.nodes.flatMap((node) => node.lines);
}

function allText(slide: TalkSlide): string {
  return [
    slide.kicker?.toUpperCase() ?? "",
    slide.title ?? "",
    slide.quote ?? "",
    slide.cite ?? "",
    slide.world?.name ?? "",
    slide.world?.number ?? "",
    ...slide.lead,
    ...slide.bullets,
    ...slide.columns.flatMap((column) => [column.label, ...column.bullets]),
    ...(slide.table === null
      ? []
      : [
          ...slide.table.head.map((cell) => cell.toUpperCase()),
          ...slide.table.rows.flat(),
        ]),
    ...diagramText(slide),
    bulletMark,
    "WORLD",
  ].join(" ");
}

// A quote drawn as an email: a window title bar, the header lines (the slide's lead
// lines, "From: …", "To: …"), the subject (its kicker), a rule, then the message.
const emailBarHeight = 14;
const emailDotSize = 6;
function email(cursor: Cursor, slide: TalkSlide): void {
  const width = cursor.widthPixels;
  cursor.boxes.push({ x: 0, y: 0, width, height: emailBarHeight, tone: "bar" });
  (["close", "minimise", "zoom"] as const).forEach((tone, index) => {
    cursor.boxes.push({
      x: 4 + index * (emailDotSize + 4),
      y: (emailBarHeight - emailDotSize) / 2,
      width: emailDotSize,
      height: emailDotSize,
      tone,
    });
  });
  cursor.y = 3;
  cursor.write("MAIL · INBOX (1 UNREAD)", 42, bodyScale, "inverse", width - 42);
  cursor.y = emailBarHeight + gapAfterKicker;
  const header = (line: string): void => {
    const colon = line.indexOf(":");
    const label = colon > 0 ? line.slice(0, colon + 1) : "";
    const value = colon > 0 ? line.slice(colon + 1).trim() : line;
    const top = cursor.y;
    cursor.write(label, 0, bodyScale, "muted", width);
    cursor.y = top;
    cursor.write(
      value,
      talkCellWidthPixels * 9,
      bodyScale,
      "ink",
      width - talkCellWidthPixels * 9,
    );
    cursor.y += 2;
  };
  for (const line of slide.lead) {
    header(line);
  }
  if (slide.kicker !== null) {
    header(slide.kicker);
  }
  cursor.y += gapAfterKicker;
  cursor.boxes.push({ x: 0, y: cursor.y, width, height: 1, tone: "rule" });
  cursor.y += gapAfterKicker + 2;
  if (slide.quote !== null) {
    cursor.write(slide.quote, 0, titleScale, "ink", width);
  }
  if (slide.cite !== null) {
    cursor.y += gapAfterKicker;
    cursor.write(`— ${slide.cite}`, 0, bodyScale, "muted", width);
  }
}

// A slide's picture (a section's, or a content slide's), under what is already laid
// out, as big as the height left allows.
function picture(cursor: Cursor, slide: TalkSlide, panel: TalkPanelSize): void {
  if (slide.picture === undefined) {
    return;
  }
  const art = talkPictures[slide.picture];
  cursor.y += gapAfterTitle;
  const scale = Math.max(
    1,
    Math.min(
      maximumPictureScale,
      Math.floor((panel.heightPixels - cursor.y) / art.grid.length),
      Math.floor(panel.widthPixels / (art.grid[0]?.length ?? 1)),
    ),
  );
  cursor.icons.push({
    grid: art.grid,
    palette: art.palette,
    x: 0,
    y: cursor.y,
    scale,
  });
  cursor.y += art.grid.length * scale;
}

export function layoutTalkSlide(
  slide: TalkSlide,
  panel: TalkPanelSize,
): TalkLayout {
  const missing = unsupportedTalkCharacters(allText(slide));
  if (missing.length > 0) {
    throw new UnsupportedTalkCharacterError(missing);
  }
  const cursor = new Cursor(
    panel.widthPixels,
    slide.links,
    panel.reserveTopRight,
  );
  switch (slide.template) {
    case "title":
    case "closing": {
      if (slide.kicker !== null) {
        cursor.write(
          slide.kicker.toUpperCase(),
          0,
          bodyScale,
          "muted",
          panel.widthPixels,
        );
        cursor.y += gapAfterKicker;
      }
      if (slide.title !== null) {
        cursor.write(slide.title, 0, displayScale, "ink", panel.widthPixels);
        cursor.y += gapAfterTitle;
      }
      for (const line of slide.lead) {
        cursor.write(line, 0, bodyScale, "muted", panel.widthPixels);
      }
      cursor.y += gapAfterKicker;
      for (const line of slide.bullets) {
        cursor.write(line, 0, bodyScale, "ink", panel.widthPixels);
      }
      break;
    }
    case "section": {
      if (slide.world !== null && slide.numbered !== false) {
        cursor.write(
          `WORLD ${slide.world.number}`,
          0,
          displayScale,
          "accent",
          panel.widthPixels,
        );
        cursor.y += gapAfterKicker;
      }
      if (slide.title !== null) {
        cursor.write(slide.title, 0, titleScale, "ink", panel.widthPixels);
      }
      // the bridge: why the talk goes to this world now
      for (const line of slide.lead) {
        cursor.y += gapAfterTitle;
        cursor.write(line, 0, bodyScale, "muted", panel.widthPixels);
      }
      picture(cursor, slide, panel);
      break;
    }
    case "quote": {
      if (slide.art === "email") {
        email(cursor, slide);
        break;
      }
      heading(cursor, slide);
      if (slide.quote !== null) {
        cursor.write(
          `“${slide.quote}”`,
          0,
          titleScale,
          "ink",
          panel.widthPixels,
        );
      }
      if (slide.cite !== null) {
        cursor.y += gapAfterKicker;
        cursor.write(
          `— ${slide.cite}`,
          0,
          bodyScale,
          "muted",
          panel.widthPixels,
        );
      }
      break;
    }
    case "comparison":
      heading(cursor, slide);
      columns(cursor, slide);
      break;
    case "table":
      heading(cursor, slide);
      table(cursor, slide);
      for (const line of slide.lead) {
        cursor.y += gapBetweenBullets;
        cursor.write(line, 0, bodyScale, "muted", panel.widthPixels);
      }
      break;
    case "content": {
      heading(cursor, slide);
      if (slide.diagram !== undefined) {
        const drawn = layoutTalkDiagram(
          slide.diagram,
          panel.widthPixels,
          cursor.y,
        );
        cursor.runs.push(...drawn.runs);
        cursor.boxes.push(...drawn.boxes);
        cursor.icons.push(...drawn.icons);
        cursor.y += drawn.heightPixels;
        if (!drawn.fits) {
          // too narrow for the diagram's words: an overflow, so the sign zooms out
          cursor.y = Math.max(cursor.y, panel.heightPixels + 1);
        }
        break;
      }
      if (slide.dialogue === true) {
        dialogue(cursor, slide.bullets);
      } else {
        cursor.bullets(slide.bullets, 0, panel.widthPixels);
      }
      for (const line of slide.lead) {
        cursor.y += gapAfterKicker;
        cursor.write(line, 0, bodyScale, "muted", panel.widthPixels);
      }
      picture(cursor, slide, panel);
      break;
    }
  }
  const heightPixels = cursor.y;
  return {
    runs: cursor.runs,
    boxes: cursor.boxes,
    icons: cursor.icons,
    heightPixels,
    overflowPixels: Math.max(0, heightPixels - panel.heightPixels),
  };
}

// The largest whole magnification, up to `maximumZoom`, at which the slide fits the
// panel: laid out in a panel `zoom` times smaller, then every run blown up `zoom` times,
// so short slides fill their sign and long ones keep the base size. A slide with a
// picture takes the magnification that draws its picture biggest instead (the larger
// one on a tie). A slide that does not fit even at 1× comes
// back with its overflow at 1×.
export function layoutTalkSlideToFit(
  slide: TalkSlide,
  panel: TalkPanelSize,
  maximumZoom: number,
): TalkLayout {
  let best: TalkLayout | null = null;
  for (let zoom = Math.max(1, maximumZoom); zoom >= 1; zoom--) {
    const layout = layoutAtZoom(slide, panel, zoom);
    if (layout.overflowPixels > 0) {
      continue;
    }
    if (slide.picture === undefined) {
      return layout;
    }
    if (best === null || pictureScaleOf(layout) > pictureScaleOf(best)) {
      best = layout;
    }
  }
  return best ?? layoutTalkSlide(slide, panel);
}

function pictureScaleOf(layout: TalkLayout): number {
  return Math.max(0, ...layout.icons.map((icon) => icon.scale));
}

// The slide laid out in a panel `zoom` times smaller, then blown up `zoom` times.
function layoutAtZoom(
  slide: TalkSlide,
  panel: TalkPanelSize,
  zoom: number,
): TalkLayout {
  if (zoom === 1) {
    return layoutTalkSlide(slide, panel);
  }
  const corner = panel.reserveTopRight;
  const small = layoutTalkSlide(slide, {
    widthPixels: Math.floor(panel.widthPixels / zoom),
    heightPixels: Math.floor(panel.heightPixels / zoom),
    ...(corner === undefined
      ? {}
      : {
          reserveTopRight: {
            widthPixels: Math.ceil(corner.widthPixels / zoom),
            heightPixels: Math.ceil(corner.heightPixels / zoom),
          },
        }),
  });
  return {
    runs: small.runs.map((run) => ({
      ...run,
      x: run.x * zoom,
      y: run.y * zoom,
      scale: run.scale * zoom,
    })),
    boxes: small.boxes.map((box) => ({
      ...box,
      x: box.x * zoom,
      y: box.y * zoom,
      width: box.width * zoom,
      height: box.height * zoom,
    })),
    icons: small.icons.map((icon) => ({
      ...icon,
      x: icon.x * zoom,
      y: icon.y * zoom,
      scale: icon.scale * zoom,
    })),
    heightPixels: small.heightPixels * zoom,
    overflowPixels: small.overflowPixels * zoom,
  };
}

// The link under a point of the sign's text area (layout pixels), or null.
export function talkLinkAt(
  layout: TalkLayout,
  x: number,
  y: number,
): string | null {
  for (const run of layout.runs) {
    if (run.link === undefined) {
      continue;
    }
    const width = textWidthPixels(run.text, run.scale);
    const height = talkLineHeightPixels * run.scale;
    if (x >= run.x && x < run.x + width && y >= run.y && y < run.y + height) {
      return run.link;
    }
  }
  return null;
}

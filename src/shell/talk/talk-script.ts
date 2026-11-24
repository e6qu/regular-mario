// The talk script: the slides of a presentation as plain text, produced from a deck's
// slides.md by the site's scripts/talk-json.mjs. Parsing validates every field and fails
// loudly on anything unexpected, so a malformed talk never boots half-drawn.

import { talkPictureIds, type TalkPictureId } from "./talk-pictures";
import { talkPropIds, type TalkPropId } from "./talk-props";

const talkTemplates = [
  "title",
  "section",
  "content",
  "quote",
  "comparison",
  "table",
  "closing",
] as const;
type TalkTemplate = (typeof talkTemplates)[number];

const talkTransitions = ["card", "run", "iris", "pipe", "ouch"] as const;
export type TalkTransition = (typeof talkTransitions)[number];

export interface TalkLink {
  readonly text: string;
  readonly url: string;
  // the slide text the link sits in; the link is drawn only there
  readonly context?: string;
}

interface TalkColumn {
  readonly label: string;
  readonly bullets: readonly string[];
}

interface TalkTable {
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
  // A prop id per row, drawn before the row's first cell (see talk-props.ts); null for
  // a row without one. Absent when no row has an icon.
  readonly icons?: readonly (string | null)[];
}

interface TalkWorld {
  readonly number: string;
  readonly name: string;
}

export interface TalkSlide {
  readonly template: TalkTemplate;
  readonly world: TalkWorld | null;
  readonly day: string | null;
  readonly transition: TalkTransition | null;
  readonly kicker: string | null;
  readonly title: string | null;
  readonly lead: readonly string[];
  readonly bullets: readonly string[];
  readonly quote: string | null;
  readonly cite: string | null;
  readonly columns: readonly TalkColumn[];
  readonly table: TalkTable | null;
  readonly links: readonly TalkLink[];
  // The slide's graphics: a scene name or props joined by "+" (see talk-scene.ts).
  readonly art: string | null;
  // Each bullet is a line of speech, "Speaker: words", drawn as a script.
  readonly dialogue?: boolean;
  // false: a section slide that shows its name without "WORLD n"
  readonly numbered?: boolean;
  // A picture drawn under a section's title or a content slide's text (talk-pictures.ts).
  readonly picture?: TalkPictureId;
  // A diagram drawn in place of the list (see TalkDiagram).
  readonly diagram?: TalkDiagram;
}

// A diagram drawn on the sign in place of the slide's list (the deck draws the same
// one with Mermaid). A sequence: actors in columns, messages between them, top to
// bottom. A flow: nodes on a grid, joined by arrows.
export interface TalkSequenceActor {
  readonly id: string;
  readonly label: string;
  readonly icon: TalkPropId | null;
}

export type TalkSequenceStep =
  | {
      readonly kind: "message";
      readonly from: string;
      readonly to: string;
      readonly text: string;
      // a reply: drawn dashed
      readonly reply: boolean;
    }
  | {
      readonly kind: "note";
      readonly over: readonly string[];
      readonly text: string;
    };

export interface TalkFlowNode {
  readonly id: string;
  readonly lines: readonly string[];
  readonly icon: TalkPropId | null;
  readonly column: number;
  readonly row: number;
}

export interface TalkFlowEdge {
  readonly from: string;
  readonly to: string;
  readonly dotted: boolean;
}

export type TalkDiagram =
  | {
      readonly kind: "sequence";
      readonly actors: readonly TalkSequenceActor[];
      readonly steps: readonly TalkSequenceStep[];
    }
  | {
      readonly kind: "flow";
      readonly nodes: readonly TalkFlowNode[];
      readonly edges: readonly TalkFlowEdge[];
    };

export interface TalkScript {
  readonly title: string;
  readonly slides: readonly TalkSlide[];
}

export class TalkScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TalkScriptError";
  }
}

type Json = unknown;

function fail(path: string, expected: string): never {
  throw new TalkScriptError(`talk script: ${path} must be ${expected}`);
}

function record(value: Json, path: string): Readonly<Record<string, Json>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "an object");
  }
  return value as Readonly<Record<string, Json>>;
}

function text(value: Json, path: string): string {
  if (typeof value !== "string") {
    fail(path, "a string");
  }
  return value;
}

// a link opens only a web page: http or https
function webAddress(value: Json, path: string): string {
  const address = text(value, path);
  if (!/^https?:\/\/\S+$/i.test(address)) {
    fail(path, "an http or https address");
  }
  return address;
}

function flag(value: Json, path: string): boolean {
  if (typeof value !== "boolean") {
    fail(path, "true or false");
  }
  return value;
}

function nullableText(value: Json, path: string): string | null {
  return value === null ? null : text(value, path);
}

function texts(value: Json, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    fail(path, "an array of strings");
  }
  return value.map((item: Json, index) => text(item, `${path}[${index}]`));
}

function list<T>(
  value: Json,
  path: string,
  item: (entry: Json, at: string) => T,
): readonly T[] {
  if (!Array.isArray(value)) {
    fail(path, "an array");
  }
  return value.map((entry: Json, index) => item(entry, `${path}[${index}]`));
}

function oneOf<T extends string>(
  value: Json,
  path: string,
  options: readonly T[],
): T {
  const found = options.find((option) => option === value);
  if (found === undefined) {
    fail(path, `one of ${options.join(", ")}`);
  }
  return found;
}

// "3 Kernel Caverns" → number "3", name "Kernel Caverns"
function parseTalkWorld(value: string, path: string): TalkWorld {
  const match = /^\s*(\S+)\s+(.+?)\s*$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    fail(path, 'a world such as "3 Kernel Caverns"');
  }
  return { number: match[1], name: match[2] };
}

function count(value: Json, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail(path, "a whole number, 0 or more");
  }
  return value;
}

function icon(value: Json, path: string): TalkPropId | null {
  return value === null || value === undefined
    ? null
    : oneOf(value, path, talkPropIds);
}

// one of `ids`, the diagram's actors or nodes
function known(value: Json, path: string, ids: readonly string[]): string {
  const id = text(value, path);
  if (!ids.includes(id)) {
    fail(path, `one of the diagram's ids (${ids.join(", ")})`);
  }
  return id;
}

function parseDiagram(value: Json, path: string): TalkDiagram {
  const diagram = record(value, path);
  const kind = oneOf(diagram.kind, `${path}.kind`, ["sequence", "flow"]);
  if (kind === "sequence") {
    const actors = list(diagram.actors, `${path}.actors`, (entry, at) => {
      const actor = record(entry, at);
      return {
        id: text(actor.id, `${at}.id`),
        label: text(actor.label, `${at}.label`),
        icon: icon(actor.icon, `${at}.icon`),
      };
    });
    const ids = actors.map((actor) => actor.id);
    return {
      kind,
      actors,
      steps: list(diagram.steps, `${path}.steps`, (entry, at) => {
        const step = record(entry, at);
        const stepKind = oneOf(step.kind, `${at}.kind`, ["message", "note"]);
        return stepKind === "message"
          ? {
              kind: stepKind,
              from: known(step.from, `${at}.from`, ids),
              to: known(step.to, `${at}.to`, ids),
              text: text(step.text, `${at}.text`),
              reply: flag(step.reply, `${at}.reply`),
            }
          : {
              kind: stepKind,
              over: list(step.over, `${at}.over`, (id, where) =>
                known(id, where, ids),
              ),
              text: text(step.text, `${at}.text`),
            };
      }),
    };
  }
  const nodes = list(diagram.nodes, `${path}.nodes`, (entry, at) => {
    const node = record(entry, at);
    return {
      id: text(node.id, `${at}.id`),
      lines: texts(node.lines, `${at}.lines`),
      icon: icon(node.icon, `${at}.icon`),
      column: count(node.column, `${at}.column`),
      row: count(node.row, `${at}.row`),
    };
  });
  const places = new Set(nodes.map((node) => `${node.column},${node.row}`));
  if (places.size !== nodes.length) {
    fail(`${path}.nodes`, "on different grid places");
  }
  const ids = nodes.map((node) => node.id);
  return {
    kind,
    nodes,
    edges: list(diagram.edges, `${path}.edges`, (entry, at) => {
      const edge = record(entry, at);
      return {
        from: known(edge.from, `${at}.from`, ids),
        to: known(edge.to, `${at}.to`, ids),
        dotted: flag(edge.dotted, `${at}.dotted`),
      };
    }),
  };
}

function parseSlide(value: Json, path: string): TalkSlide {
  const slide = record(value, path);
  const world = nullableText(slide.world ?? null, `${path}.world`);
  const transition = slide.transition ?? null;
  const table = slide.table ?? null;
  return {
    template: oneOf(slide.template, `${path}.template`, talkTemplates),
    world: world === null ? null : parseTalkWorld(world, `${path}.world`),
    day: nullableText(slide.day ?? null, `${path}.day`),
    transition:
      transition === null
        ? null
        : oneOf(transition, `${path}.transition`, talkTransitions),
    kicker: nullableText(slide.kicker ?? null, `${path}.kicker`),
    title: nullableText(slide.title ?? null, `${path}.title`),
    lead: texts(slide.lead, `${path}.lead`),
    bullets: texts(slide.bullets, `${path}.bullets`),
    quote: nullableText(slide.quote ?? null, `${path}.quote`),
    cite: nullableText(slide.cite ?? null, `${path}.cite`),
    columns: list(slide.columns, `${path}.columns`, (entry, at) => {
      const column = record(entry, at);
      return {
        label: text(column.label, `${at}.label`),
        bullets: texts(column.bullets, `${at}.bullets`),
      };
    }),
    table:
      table === null
        ? null
        : (() => {
            const parsed = record(table, `${path}.table`);
            const icons = parsed.icons ?? null;
            return {
              head: texts(parsed.head, `${path}.table.head`),
              rows: list(parsed.rows, `${path}.table.rows`, texts),
              ...(icons === null
                ? {}
                : {
                    icons: list(icons, `${path}.table.icons`, (entry, at) =>
                      nullableText(entry, at),
                    ),
                  }),
            };
          })(),
    art: nullableText(slide.art ?? null, `${path}.art`),
    ...(slide.dialogue === undefined
      ? {}
      : { dialogue: flag(slide.dialogue, `${path}.dialogue`) }),
    ...(slide.numbered === undefined
      ? {}
      : { numbered: flag(slide.numbered, `${path}.numbered`) }),
    ...(slide.picture === undefined
      ? {}
      : {
          picture: oneOf(slide.picture, `${path}.picture`, talkPictureIds),
        }),
    ...(slide.diagram === undefined
      ? {}
      : { diagram: parseDiagram(slide.diagram, `${path}.diagram`) }),
    links: list(slide.links, `${path}.links`, (entry, at) => {
      const link = record(entry, at);
      return {
        text: text(link.text, `${at}.text`),
        url: webAddress(link.url, `${at}.url`),
        ...(link.context === undefined
          ? {}
          : { context: text(link.context, `${at}.context`) }),
      };
    }),
  };
}

export function parseTalkScript(value: Json): TalkScript {
  const script = record(value, "talk");
  const slides = list(script.slides, "talk.slides", parseSlide);
  if (slides.length === 0) {
    fail("talk.slides", "a non-empty array");
  }
  return { title: text(script.title, "talk.title"), slides };
}

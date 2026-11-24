// Which graphics a slide shows. A slide's `art` is either a special scene ("mounts": the
// pacing herd; "email": the boss and a letter, with the sign drawn as an email;
// "world-map": the talk's worlds as islands; "egress": one request leaving a VM through
// the egress proxy and the credential broker, animated) or one to
// four prop ids joined by "+", e.g. "database+trash-bin". The first prop is also drawn
// large on the sign when the text leaves room for it. Every slide must have art, and no
// two slides may share it, so each one is recognisable from its picture.
import { talkPropIds, type TalkPropId } from "./talk-props";

const specialScenes = ["mounts", "email", "world-map", "egress"] as const;
type TalkSpecialScene = (typeof specialScenes)[number];

export interface TalkSceneSpec {
  readonly special: TalkSpecialScene | null;
  readonly props: readonly TalkPropId[];
}

const maximumProps = 4;

// Props that hover above the ground instead of standing on it.
const floatingProps: readonly TalkPropId[] = talkPropIds.filter((id) =>
  [
    "ghost",
    "cloud",
    "bubble",
    "lightning",
    "envelope",
    "envelope-open",
  ].includes(id),
);

export function isFloatingProp(id: TalkPropId): boolean {
  return floatingProps.includes(id);
}

export class TalkArtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TalkArtError";
  }
}

function isPropId(value: string): value is TalkPropId {
  return talkPropIds.some((id) => id === value);
}

function isSpecialScene(value: string): value is TalkSpecialScene {
  return specialScenes.some((scene) => scene === value);
}

export function parseTalkArt(art: string, slideNumber: number): TalkSceneSpec {
  if (isSpecialScene(art)) {
    return {
      special: art,
      props:
        art === "email"
          ? ["boss", "envelope"]
          : art === "world-map"
            ? ["map", "signpost"]
            : art === "egress"
              ? ["funnel", "keyring", "vault"]
              : [],
    };
  }
  const parts = art.split("+");
  if (parts.length === 0 || parts.length > maximumProps) {
    throw new TalkArtError(
      `Slide ${String(slideNumber)}: art "${art}" must name 1 to ${String(maximumProps)} props.`,
    );
  }
  const unknown = parts.filter((part) => !isPropId(part));
  if (unknown.length > 0) {
    throw new TalkArtError(
      `Slide ${String(slideNumber)}: no prop called ${unknown.map((part) => `"${part}"`).join(", ")}.`,
    );
  }
  return { special: null, props: parts.filter(isPropId) };
}

// Every slide has art, and each slide's art is its own.
export function checkTalkArt(
  arts: readonly (string | null)[],
): readonly TalkSceneSpec[] {
  const missing = arts
    .map((art, index) => (art === null ? index + 1 : null))
    .filter((slide): slide is number => slide !== null);
  if (missing.length > 0) {
    throw new TalkArtError(
      `These slides have no art: ${missing.map(String).join(", ")}.`,
    );
  }
  const firstUse = new Map<string, number>();
  const repeats: string[] = [];
  arts.forEach((art, index) => {
    if (art === null) {
      return;
    }
    const earlier = firstUse.get(art);
    if (earlier === undefined) {
      firstUse.set(art, index + 1);
    } else {
      repeats.push(`${String(earlier)} and ${String(index + 1)} ("${art}")`);
    }
  });
  if (repeats.length > 0) {
    throw new TalkArtError(
      `These slides share their art: ${repeats.join("; ")}.`,
    );
  }
  return arts.map((art, index) => parseTalkArt(art ?? "", index + 1));
}

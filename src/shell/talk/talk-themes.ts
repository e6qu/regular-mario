// The look and sound of each world of a talk. A classic platformer moves from sunny
// plains to caves, haunted houses, forests, islands, skies, palaces, valleys and
// castles; a talk's worlds do the same, so the room says where the talk has got to.
// The art is original (drawn in talk-backdrop.ts) and so is the music (talk-music.ts).
// Pure data: no Phaser.
import type { TalkPlatformTileId } from "../../engine/levels/talk-level";

export const talkThemeIds = [
  "plains",
  "ruins",
  "cave",
  "ghost",
  "forest",
  "island",
  "sky",
  "palace",
  "valley",
  "castle",
] as const;
export type TalkThemeId = (typeof talkThemeIds)[number];

export interface TalkTheme {
  // the sky (or cave roof, or wall) from top to bottom, in bands
  readonly sky: readonly string[];
  // the ground drawn over the walkway: its top edge, its body and a speckle
  readonly ground: {
    readonly top: string;
    readonly body: string;
    readonly speckle: string;
  };
  // what this world's floating platforms are built from, most likely first
  readonly platforms: readonly TalkPlatformKind[];
}

export type TalkPlatformKind = "crate" | "used" | "plank" | "stone" | "cloud";

export const talkPlatformKindTiles: Readonly<
  Record<Exclude<TalkPlatformKind, "cloud">, TalkPlatformTileId>
> = {
  crate: "full-question-block-coin",
  used: "empty-question-block",
  plank: "breakable-block",
  stone: "castle-wall",
};

export const talkThemes: Readonly<Record<TalkThemeId, TalkTheme>> = {
  plains: {
    sky: ["#6ec0f5", "#86ccf7", "#9fd8f9", "#b8e3fb"],
    ground: { top: "#58b947", body: "#b8793e", speckle: "#8f5a2b" },
    platforms: ["crate", "plank", "used"],
  },
  ruins: {
    sky: ["#5b3f7a", "#8a4f7d", "#c46a6a", "#ef9a5a", "#f7c06a"],
    ground: { top: "#e8c77a", body: "#c99a55", speckle: "#a87a3c" },
    platforms: ["stone", "crate", "used"],
  },
  cave: {
    sky: ["#0c0b14", "#141322", "#1b1a2e", "#232238"],
    ground: { top: "#5a6aa8", body: "#2e3766", speckle: "#1d244a" },
    platforms: ["stone", "crate", "used"],
  },
  ghost: {
    sky: ["#1c1030", "#24143c", "#2c1a48", "#352054"],
    ground: { top: "#6b4a7a", body: "#3e2a4c", speckle: "#2a1c36" },
    platforms: ["plank", "used", "crate"],
  },
  forest: {
    sky: ["#0a1620", "#0f2030", "#16303c", "#1f4044"],
    ground: { top: "#2f6b3c", body: "#3a2a1e", speckle: "#251a12" },
    platforms: ["plank", "crate", "used"],
  },
  island: {
    sky: ["#3fb4ec", "#62c4f0", "#8ad4f4", "#b2e4f8"],
    ground: { top: "#f4e0a0", body: "#e6c47a", speckle: "#cfa65c" },
    platforms: ["plank", "crate", "cloud"],
  },
  sky: {
    sky: ["#4aa8f0", "#6ab8f2", "#8cc8f5", "#b0daf8", "#d4ecfb"],
    ground: { top: "#ffffff", body: "#cfe6fb", speckle: "#a9cdf2" },
    platforms: ["cloud", "crate", "used"],
  },
  palace: {
    sky: ["#fff1c8", "#ffe6a8", "#ffd98a", "#ffcc70"],
    ground: { top: "#f7f2e6", body: "#d9c9e8", speckle: "#b49cd0" },
    platforms: ["crate", "used", "stone"],
  },
  valley: {
    sky: ["#120606", "#1e0a08", "#2c0f0a", "#40160c", "#5a200e"],
    ground: { top: "#5a3328", body: "#2a1612", speckle: "#ff7a1a" },
    platforms: ["stone", "used", "crate"],
  },
  castle: {
    sky: ["#16161c", "#1c1c24", "#22222c", "#282834"],
    ground: { top: "#8a8a96", body: "#5a5a66", speckle: "#3a3a44" },
    platforms: ["stone", "crate", "used"],
  },
};

// The keywords that pick a theme from a world's name; a world whose name matches none
// takes the next theme in order, so every talk still varies.
const themeKeywords: readonly (readonly [RegExp, TalkThemeId])[] = [
  [/castle|fortress|keep|tower/i, "castle"],
  [/valley|boss|lava|volcano/i, "valley"],
  [/palace|switch/i, "palace"],
  [/isles|sky|cloud|athletic/i, "sky"],
  [/island|beach|sea|ocean|coast/i, "island"],
  [/forest|wood|jungle/i, "forest"],
  [/ghost|haunt|house/i, "ghost"],
  [/cave|cavern|underground|mine|tunnel/i, "cave"],
  [/history|ruin|desert|ancient/i, "ruins"],
  [/plain|field|meadow|grass/i, "plains"],
];

// The theme of world `index` (0-based, in talk order), from its name.
export function talkThemeForWorld(name: string, index: number): TalkThemeId {
  const named = themeKeywords.find(([pattern]) => pattern.test(name));
  return (
    named?.[1] ?? talkThemeIds[index % talkThemeIds.length] ?? talkThemeIds[0]
  );
}

// Each slide's theme: the theme of the world it belongs to (the latest section slide
// with a world at or before it); slides before the first world are on the plains.
export function talkSlideThemes(
  slides: readonly {
    readonly template: string;
    readonly world: { readonly name: string } | null;
  }[],
): TalkThemeId[] {
  let world = -1;
  let theme: TalkThemeId = "plains";
  return slides.map((slide) => {
    if (slide.template === "section" && slide.world !== null) {
      world += 1;
      theme = talkThemeForWorld(slide.world.name, world);
    }
    return theme;
  });
}

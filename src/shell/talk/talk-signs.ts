// Every slide of a talk laid out on its sign, exactly as talk mode draws it. Pure and
// free of the game: talk mode builds its rooms from it, and a deck's build step calls it
// (through regular-mario/talk-script) to refuse a talk whose text does not fit, before
// anyone presses Play.
import {
  talkPanelHeightPixels,
  talkPanelWidthPixels,
} from "../../engine/levels/talk-level";
import { talkEgressMinimumHeight } from "./talk-egress";
import { layoutTalkSlideToFit, type TalkLayout } from "./talk-layout";
import { talkMapMinimumHeight } from "./talk-map";
import {
  talkCopyButtonCorner,
  talkPanelFreeArea,
  talkPanelPaddingPixels,
} from "./talk-panel";
import { checkTalkArt, TalkArtError, type TalkSceneSpec } from "./talk-scene";
import type { TalkScript } from "./talk-script";

// short slides are drawn up to twice the base size, to read from the back of the room
const maximumTextZoom = 2;
const textWidth = talkPanelWidthPixels - 2 * talkPanelPaddingPixels;
// the footer line ("12/29") keeps its own row at the bottom of the sign
const textHeight = talkPanelHeightPixels - 2 * talkPanelPaddingPixels - 10;

export class TalkOverflowError extends Error {
  constructor(
    readonly slides: readonly {
      readonly index: number;
      readonly overflowPixels: number;
    }[],
  ) {
    super(
      `These slides do not fit their sign: ${slides
        .map(
          (slide) =>
            `${String(slide.index + 1)} (+${String(slide.overflowPixels)} px)`,
        )
        .join(", ")}`,
    );
    this.name = "TalkOverflowError";
  }
}

export interface TalkSigns {
  readonly layouts: readonly TalkLayout[];
  readonly scenes: readonly TalkSceneSpec[];
}

// Lays out every slide's sign. Throws a TalkArtError if a slide has no art of its own or
// its sign leaves no room for the scene drawn under the text, a TalkOverflowError if a
// slide's text does not fit, or an UnsupportedTalkCharacterError for a character the
// font lacks.
export function layoutTalkSigns(script: TalkScript): TalkSigns {
  const scenes = checkTalkArt(script.slides.map((slide) => slide.art));
  // the world map and the egress diagram keep their text small, to leave the sign to them
  const layouts = script.slides.map((slide, index) =>
    layoutTalkSlideToFit(
      slide,
      {
        widthPixels: textWidth,
        heightPixels: textHeight,
        // the copy button sits in the sign's top-right corner
        reserveTopRight: talkCopyButtonCorner,
      },
      scenes[index]?.special === "world-map" ||
        scenes[index]?.special === "egress"
        ? 1
        : maximumTextZoom,
    ),
  );
  // the scenes drawn on the sign itself need room under the text
  layouts.forEach((layout, index) => {
    const special = scenes[index]?.special;
    const needed =
      special === "world-map"
        ? talkMapMinimumHeight
        : special === "egress"
          ? talkEgressMinimumHeight
          : 0;
    const free = talkPanelFreeArea(
      layout,
      talkPanelWidthPixels,
      talkPanelHeightPixels,
    ).height;
    if (free < needed) {
      throw new TalkArtError(
        `Slide ${String(index + 1)}: its ${String(special)} picture needs ${String(needed)} px under the text; it has ${String(free)}.`,
      );
    }
  });
  const overflowing = layouts
    .map((layout, index) => ({ index, overflowPixels: layout.overflowPixels }))
    .filter((entry) => entry.overflowPixels > 0);
  if (overflowing.length > 0) {
    throw new TalkOverflowError(overflowing);
  }
  return { layouts, scenes };
}

import { describe, expect, it } from "vitest";

import {
  isAudioMuted,
  onAudioMutedChange,
  toggleAudioMuted,
} from "../audio-mute";
import { talkGridSize, talkMountFrames, talkMountRiders } from "./talk-art";
import { checkTalkArt, parseTalkArt, TalkArtError } from "./talk-scene";
import { talkEgressTravellers } from "./talk-egress";
import {
  talkGlyph,
  talkGlyphColumns,
  talkGlyphRows,
  UnsupportedTalkCharacterError,
  unsupportedTalkCharacters,
} from "./talk-font";
import {
  layoutTalkSlide,
  layoutTalkSlideToFit,
  talkLinkAt,
  wrapTalkText,
} from "./talk-layout";
import {
  prepareTalk,
  talkRoomFeature,
  talkSlideSpeech,
  TalkOverflowError,
  talkMountPace,
  talkSlideName,
  talkTypedSlide,
} from "./talk-mode";
import { talkSlideText } from "./talk-copy";
import { talkPictureIds, talkPictures } from "./talk-pictures";
import {
  drawTalkCopyButton,
  drawTalkPanel,
  talkCopyButtonArea,
  talkCopyButtonAt,
  talkCopyButtonCorner,
  talkPanelColors,
  talkPanelPaddingPixels,
  type TalkPanelContext,
} from "./talk-panel";
import {
  parseTalkScript,
  TalkScriptError,
  type TalkSlide,
} from "./talk-script";

const blank: TalkSlide = {
  template: "content",
  world: null,
  day: null,
  transition: null,
  kicker: null,
  title: null,
  lead: [],
  bullets: [],
  quote: null,
  cite: null,
  columns: [],
  table: null,
  links: [],
  art: null,
};

const slide = (overrides: Partial<TalkSlide>): TalkSlide => ({
  ...blank,
  ...overrides,
});

const rawSlide = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  template: "content",
  world: null,
  day: null,
  transition: null,
  kicker: null,
  title: "Hello",
  lead: [],
  bullets: [],
  quote: null,
  cite: null,
  columns: [],
  table: null,
  links: [],
  ...overrides,
});

describe("talk font", () => {
  it("draws every printable ASCII character in a 5×8 cell", () => {
    for (let code = 32; code < 127; code++) {
      const glyph = talkGlyph(String.fromCharCode(code));
      expect(glyph).toHaveLength(talkGlyphRows);
      expect(glyph.every((row) => row.length === talkGlyphColumns)).toBe(true);
    }
  });

  it("refuses a character it has no glyph for, loudly", () => {
    expect(() => talkGlyph("漢")).toThrow(UnsupportedTalkCharacterError);
    expect(unsupportedTalkCharacters("ok → 漢字")).toEqual(["漢", "字"]);
  });
});

describe("talk script", () => {
  it("parses a talk and its world labels", () => {
    const script = parseTalkScript({
      title: "T",
      source: "slides.md",
      slides: [
        rawSlide({
          template: "section",
          world: "3 Kernel Caverns",
          transition: "card",
        }),
      ],
    });
    expect(script.slides[0]?.world).toEqual({
      number: "3",
      name: "Kernel Caverns",
    });
    expect(script.slides[0]?.transition).toBe("card");
  });

  it("rejects an unknown transition and an empty talk", () => {
    expect(() =>
      parseTalkScript({
        title: "T",
        slides: [rawSlide({ transition: "warp" })],
      }),
    ).toThrow(TalkScriptError);
    expect(() => parseTalkScript({ title: "T", slides: [] })).toThrow(
      TalkScriptError,
    );
  });

  it("refuses a link that is not a web address", () => {
    expect(() =>
      parseTalkScript({
        title: "T",
        slides: [
          rawSlide({ links: [{ text: "x", url: "javascript:alert(1)" }] }),
        ],
      }),
    ).toThrow(TalkScriptError);
  });
});

describe("talk layout", () => {
  it("draws an unnumbered section with its name, without WORLD n", () => {
    const layout = layoutTalkSlide(
      slide({
        template: "section",
        world: { number: "1", name: "Chaos Plains" },
        numbered: false,
        title: "Chaos Plains",
        lead: ["What have coding agents already broken?"],
      }),
      { widthPixels: 400, heightPixels: 200 },
    );
    expect(layout.runs.some((run) => run.text.startsWith("WORLD"))).toBe(false);
    expect(layout.runs[0]?.text).toBe("Chaos Plains");
  });

  it("draws a section's picture under its title, filling the height left", () => {
    const layout = layoutTalkSlide(
      slide({
        template: "section",
        world: { number: "3", name: "Kernel Caverns" },
        numbered: false,
        title: "Kernel Caverns",
        picture: "cave-painting",
      }),
      { widthPixels: 400, heightPixels: 200 },
    );
    const picture = talkPictures["cave-painting"];
    expect(layout.icons).toHaveLength(1);
    expect(layout.icons[0]?.grid).toBe(picture.grid);
    // 400 wide: room for 2 sign pixels per pixel of the 192-wide picture
    expect(layout.icons[0]?.scale).toBe(2);
    const title = layout.runs[0];
    expect(layout.icons[0]?.y).toBeGreaterThan(title?.y ?? 0);
    expect(layout.heightPixels).toBe(
      (layout.icons[0]?.y ?? 0) + picture.grid.length * 2,
    );
  });

  it("draws a content slide's picture under its text", () => {
    const layout = layoutTalkSlide(
      slide({
        title: "Docker is now shipping VMs",
        bullets: ["A microVM per agent"],
        picture: "container-fleet",
      }),
      { widthPixels: 400, heightPixels: 200 },
    );
    const bullet = layout.runs.find((run) => run.text.includes("microVM"));
    expect(layout.icons).toHaveLength(1);
    expect(layout.icons[0]?.y).toBeGreaterThan(bullet?.y ?? 0);
    expect(layout.overflowPixels).toBe(0);
  });

  it("zooms a section with a picture to draw the picture biggest", () => {
    // at 2× the bridge wraps and leaves the picture less room; at 1×
    // the picture gets 3
    const layout = layoutTalkSlideToFit(
      slide({
        template: "section",
        title: "History",
        lead: ["You have discovered the scrolls of ancient wisdom."],
        picture: "ancient-scroll",
      }),
      { widthPixels: 584, heightPixels: 206 },
      2,
    );
    expect(layout.overflowPixels).toBe(0);
    expect(layout.icons[0]?.scale).toBe(3);
  });

  it("draws a link as a run of its own, in the link tone, with its url", () => {
    const url = "https://example.com/news";
    const layout = layoutTalkSlide(
      slide({
        kicker: "Replit, July 2025",
        bullets: ["The fix: dev databases kept apart from production"],
        links: [
          { text: "Replit, July 2025", url },
          { text: "dev databases kept apart from production", url },
        ],
      }),
      { widthPixels: 120, heightPixels: 400 },
    );
    const linked = layout.runs.filter((run) => run.link === url);
    // the capitalised kicker still matches its link
    expect(linked[0]?.text).toBe("REPLIT, JULY 2025");
    expect(linked.every((run) => run.tone === "link")).toBe(true);
    // the bullet's link wraps onto more lines, linked on each
    expect(linked.length).toBeGreaterThan(2);
    expect(
      linked
        .map((run) => run.text)
        .slice(1)
        .join(" "),
    ).toBe("dev databases kept apart from production");
    const lead = layout.runs.find((run) => run.text.trim() === "The fix:");
    expect(lead?.tone).toBe("ink");
    expect(lead?.link).toBeUndefined();
    const first = linked[1];
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect(talkLinkAt(layout, first.x + 1, first.y + 1)).toBe(url);
    }
    expect(talkLinkAt(layout, 0, -5)).toBeNull();
  });

  it("links a link's words only in the text it sits in", () => {
    const url = "https://example.com/agent";
    const layout = layoutTalkSlide(
      slide({
        dialogue: true,
        bullets: ["The agent deleted it", "Agent: I did."],
        links: [{ text: "Agent", url, context: "Agent: I did." }],
      }),
      { widthPixels: 400, heightPixels: 200 },
    );
    const linked = layout.runs.filter((run) => run.link === url);
    expect(linked.map((run) => run.text)).toEqual(["AGENT"]);
  });

  it("wraps at word boundaries and breaks words longer than a line", () => {
    expect(wrapTalkText("one two three", 7)).toEqual(["one two", "three"]);
    expect(
      wrapTalkText("abcdefghij", 4).every((line) => line.length <= 4),
    ).toBe(true);
  });

  it("reports how far a slide overflows its panel", () => {
    const long = slide({
      title: "Title",
      bullets: Array.from(
        { length: 30 },
        (_, index) => `bullet ${String(index)}`,
      ),
    });
    const layout = layoutTalkSlide(long, {
      widthPixels: 300,
      heightPixels: 100,
    });
    expect(layout.overflowPixels).toBeGreaterThan(0);
  });

  it("draws a table row's icon before its first cell, and refuses an unknown one", () => {
    const withIcons = (icons: readonly (string | null)[]): TalkSlide =>
      slide({
        template: "table",
        table: {
          head: ["In the game", "In the talk"],
          rows: [
            ["A ghost house", "security that only looks like it"],
            ["A lost life", "a data-loss incident"],
          ],
          icons,
        },
      });
    const layout = layoutTalkSlide(withIcons(["ghost", null]), {
      widthPixels: 400,
      heightPixels: 200,
    });
    expect(layout.icons).toHaveLength(1);
    expect(layout.icons[0]?.x).toBe(0);
    const ghostRun = layout.runs.find((run) => run.text === "A ghost house");
    expect(ghostRun?.x).toBeGreaterThanOrEqual(16);
    expect(() =>
      layoutTalkSlide(withIcons(["no-such-prop", null]), {
        widthPixels: 400,
        heightPixels: 200,
      }),
    ).toThrow(/not a prop/);
  });

  it("sizes a table's icon column to its widest icon, and each row to its icon", () => {
    // "cloud" is 32×16 and "ghost" 16×16: the column is 32 wide, the ghost centred in it
    const layout = layoutTalkSlide(
      slide({
        template: "table",
        table: {
          head: ["What", "Why"],
          rows: [
            ["Xen", "many VMs"],
            ["Ghosts", "boo"],
          ],
          icons: ["cloud", "ghost"],
        },
      }),
      { widthPixels: 400, heightPixels: 200 },
    );
    expect(layout.icons.map((icon) => icon.x)).toEqual([0, 8]);
    expect(
      layout.runs.find((run) => run.text === "Xen")?.x,
    ).toBeGreaterThanOrEqual(32);
  });

  it("sets a dialogue slide as a script: speakers in a column, words beside them", () => {
    const layout = layoutTalkSlide(
      slide({
        dialogue: true,
        bullets: ["Founder: Don't touch it.", "Agent: I touched it.", "Later."],
      }),
      { widthPixels: 400, heightPixels: 200 },
    );
    const at = (text: string) => layout.runs.find((run) => run.text === text);
    expect(at("FOUNDER")?.tone).toBe("accent");
    expect(at("Don't touch it.")?.x).toBe(at("I touched it.")?.x);
    expect(at("Don't touch it.")?.x).toBeGreaterThan(0);
    expect(at("Later.")?.x).toBe(0);
    expect(layout.runs.some((run) => run.text.startsWith("→"))).toBe(false);
  });

  it("keeps a short word in a table's narrow column whole", () => {
    const layout = layoutTalkSlide(
      slide({
        template: "table",
        table: {
          head: ["OS", "How"],
          rows: [
            [
              "Windows",
              "a very long explanation of how commands are confined on this system, which goes on for quite a while",
            ],
          ],
        },
      }),
      { widthPixels: 400, heightPixels: 200 },
    );
    const texts = layout.runs.map((run) => run.text);
    expect(texts).toContain("Windows");
    expect(texts).not.toContain("s");
    expect(layout.overflowPixels).toBe(0);
  });

  it("blows a short slide up to the largest zoom that fits, and keeps a long one at 1×", () => {
    const short = layoutTalkSlideToFit(
      slide({ title: "Hi" }),
      { widthPixels: 300, heightPixels: 200 },
      2,
    );
    expect(short.runs[0]?.scale).toBe(4);
    const long = slide({
      bullets: Array.from(
        { length: 12 },
        (_, index) => `bullet ${String(index)}`,
      ),
    });
    const kept = layoutTalkSlideToFit(
      long,
      { widthPixels: 300, heightPixels: 200 },
      2,
    );
    expect(kept.runs.every((run) => run.scale === 1)).toBe(true);
  });
});

// A panel context that records every rectangle it fills.
function recordingContext(): {
  readonly rectangles: [number, number, number, number][];
  readonly context: TalkPanelContext;
} {
  const rectangles: [number, number, number, number][] = [];
  const context: TalkPanelContext = {
    fillStyle: "",
    fillRect: (x, y, width, height) => {
      rectangles.push([x, y, width, height]);
    },
    clearRect: () => undefined,
  };
  return { rectangles, context };
}

describe("talk panel", () => {
  it("paints only inside its canvas", () => {
    const { rectangles, context } = recordingContext();
    const layout = layoutTalkSlide(
      slide({ title: "Hello", bullets: ["world"] }),
      { widthPixels: 200, heightPixels: 80 },
    );
    drawTalkPanel(context, layout, 220, 100, "1/1", talkPanelColors);
    expect(rectangles.length).toBeGreaterThan(10);
    for (const [x, y, width, height] of rectangles) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(223);
      expect(y + height).toBeLessThanOrEqual(103);
    }
  });
});

describe("talk mode", () => {
  it("turns the next slide's transition into what stands between the rooms", () => {
    expect(talkRoomFeature("ouch")).toBe("enemy");
    expect(talkRoomFeature("pipe")).toBe("pipe");
    expect(talkRoomFeature("card")).toBe("stairs");
    expect(talkRoomFeature("run")).toBe("crates");
    expect(talkRoomFeature(null)).toBe("flat");
  });

  it("builds one room per slide", () => {
    const prepared = prepareTalk({
      title: "T",
      slides: [
        slide({ title: "A", art: "key" }),
        slide({ title: "B", transition: "pipe", art: "coin" }),
      ],
    });
    expect(prepared.level.roomCount).toBe(2);
    expect(
      prepared.level.levelInput.actors.some(
        (actor) => actor.actorId === "talk-pipe",
      ),
    ).toBe(true);
  });

  it("refuses a talk whose slide does not fit its sign, naming the slide", () => {
    const crowded = slide({
      art: "coin",
      bullets: Array.from(
        { length: 60 },
        (_, index) => `bullet number ${String(index)}`,
      ),
    });
    expect(() =>
      prepareTalk({
        title: "T",
        slides: [slide({ title: "A", art: "key" }), crowded],
      }),
    ).toThrow(TalkOverflowError);
    expect(() =>
      prepareTalk({
        title: "T",
        slides: [slide({ title: "A", art: "key" }), crowded],
      }),
    ).toThrow(/2 \(\+/);
  });

  it("reads a slide out with its position, text and links", () => {
    const speech = talkSlideSpeech(
      slide({
        title: "Escapes",
        bullets: ["one"],
        links: [{ text: "advisory", url: "https://example.com/a" }],
      }),
      2,
      30,
    );
    expect(speech).toContain("Slide 3 of 30.");
    expect(speech).toContain("Escapes");
    expect(speech).toContain("Link: advisory, https://example.com/a");
  });
});

describe("talk presenter controls", () => {
  it("names each slide for the slide list, shortening long names", () => {
    expect(talkSlideName(slide({ title: "Short" }))).toBe("Short");
    expect(talkSlideName(slide({ quote: "x".repeat(60) }))).toHaveLength(48);
    expect(
      talkSlideName(slide({ world: { number: "4", name: "Bridge" } })),
    ).toBe("World 4");
  });

  it("turns a typed number into a slide, refusing ones outside the talk", () => {
    expect(talkTypedSlide("12", 24)).toBe(11);
    expect(talkTypedSlide("0", 24)).toBeUndefined();
    expect(talkTypedSlide("25", 24)).toBeUndefined();
    expect(talkTypedSlide("", 24)).toBeUndefined();
  });
});

describe("talk art", () => {
  it("draws every mount frame for every rider", () => {
    for (const rider of talkMountRiders) {
      for (const frame of talkMountFrames) {
        expect(talkGridSize(frame, rider.palette)).toEqual({
          widthPixels: 22,
          heightPixels: 17,
        });
      }
    }
  });

  it("paces a mount within its range, turning at the ends", () => {
    const paces = Array.from({ length: 200 }, (_, step) =>
      talkMountPace(step * 37, 0),
    );
    expect(paces.every((pace) => Math.abs(pace.offsetPixels) <= 24)).toBe(true);
    expect(paces.some((pace) => pace.facingLeft)).toBe(true);
    expect(paces.some((pace) => !pace.facingLeft)).toBe(true);
  });

  it("reads a slide's art as scenes or props, and rejects props it does not know", () => {
    const parsed = parseTalkScript({
      title: "T",
      slides: [rawSlide({ art: "mounts" })],
    });
    expect(parsed.slides[0]?.art).toBe("mounts");
    expect(parseTalkArt("email", 1)).toEqual({
      special: "email",
      props: ["boss", "envelope"],
    });
    expect(parseTalkArt("database+trash-bin", 1).props).toEqual([
      "database",
      "trash-bin",
    ]);
    expect(() => parseTalkArt("dragons", 3)).toThrow(/Slide 3.*"dragons"/);
    expect(() => parseTalkArt("key+key+key+key+key", 1)).toThrow(TalkArtError);
  });

  it("insists every slide has art of its own", () => {
    expect(() => checkTalkArt(["key", null])).toThrow(/no art: 2/);
    expect(() => checkTalkArt(["key", "coin", "key"])).toThrow(
      /1 and 3 \("key"\)/,
    );
    expect(checkTalkArt(["key", "coin"])).toHaveLength(2);
  });
});

describe("mute", () => {
  it("toggles one shared switch and tells its listeners", () => {
    const heard: boolean[] = [];
    const stop = onAudioMutedChange((muted) => heard.push(muted));
    const before = isAudioMuted();
    toggleAudioMuted();
    toggleAudioMuted();
    stop();
    toggleAudioMuted();
    expect(heard).toEqual([!before, before]);
    expect(isAudioMuted()).toBe(!before);
    toggleAudioMuted();
  });
});

describe("scenes drawn on the sign", () => {
  const area = { x: 8, y: 60, width: 584, height: 150 };

  it("sends the allowed request through the broker, where it picks up the key", () => {
    const start = talkEgressTravellers(area, 0);
    const end = talkEgressTravellers(area, 0.99);
    expect(start.carriesKey).toBe(false);
    expect(end.carriesKey).toBe(true);
    expect(end.allowed.x).toBeGreaterThan(start.allowed.x);
    expect(start.allowed.y).toBe(end.allowed.y);
  });

  it("stops the refused request at the proxy and stamps it", () => {
    const stamped = [0.12, 0.15, 0.2].map((cycle) =>
      talkEgressTravellers(area, cycle),
    );
    expect(stamped.some((moment) => moment.stamped)).toBe(true);
    for (const moment of stamped) {
      if (moment.refused !== null) {
        expect(moment.refused.x).toBeLessThan(area.x + area.width / 2);
      }
    }
  });

  it("refuses a picture that has no room under the slide's text", () => {
    const crowded = slide({
      art: "egress",
      bullets: ["one", "two", "three", "four", "five", "six", "seven"],
    });
    expect(() => prepareTalk({ title: "T", slides: [crowded] })).toThrow(
      /egress picture needs/,
    );
    expect(
      prepareTalk({ title: "T", slides: [slide({ art: "world-map" })] }).worlds,
    ).toEqual([]);
  });
});

describe("talk copy button", () => {
  it("keeps the button's corner clear: a first line stops short of it, later lines do not", () => {
    const corner = { widthPixels: 40, heightPixels: 6 };
    const kicker = "a kicker long enough to wrap across the whole panel width";
    const layout = layoutTalkSlide(slide({ kicker, title: "T" }), {
      widthPixels: 200,
      heightPixels: 200,
      reserveTopRight: corner,
    });
    const right = (run: { x: number; text: string; scale: number }): number =>
      run.x + [...run.text].length * (talkGlyphColumns + 1) * run.scale;
    const first = layout.runs.filter((run) => run.y < corner.heightPixels);
    expect(first.length).toBeGreaterThan(0);
    for (const run of first) {
      expect(right(run)).toBeLessThanOrEqual(200 - corner.widthPixels);
    }
    // the kicker's words all survive the shorter first line, in order
    const kickerRuns = layout.runs.filter((run) => run.tone === "muted");
    expect(kickerRuns.map((run) => run.text).join(" ")).toBe(
      kicker.toUpperCase(),
    );
    const free = layoutTalkSlide(slide({ kicker, title: "T" }), {
      widthPixels: 200,
      heightPixels: 200,
    });
    expect(
      Math.max(...free.runs.filter((run) => run.y === 0).map(right)),
    ).toBeGreaterThan(200 - corner.widthPixels);
  });

  it("sits inside the sign's corner, clear of the text area's first line", () => {
    const area = talkCopyButtonArea(600);
    expect(area.x + area.width).toBeLessThanOrEqual(600 - 2);
    expect(area.y).toBeGreaterThanOrEqual(2);
    expect(talkCopyButtonAt(600, area.x + 3, area.y + 3)).toBe(true);
    expect(talkCopyButtonAt(600, area.x - 5, area.y + 3)).toBe(false);
    // the reserved corner covers the button where it reaches into the text area
    const textRight = 600 - talkPanelPaddingPixels;
    expect(textRight - talkCopyButtonCorner.widthPixels).toBeLessThan(area.x);
    expect(area.y + area.height - talkPanelPaddingPixels).toBeLessThan(
      talkCopyButtonCorner.heightPixels,
    );
    const { rectangles, context } = recordingContext();
    drawTalkCopyButton(context, 600, talkPanelColors);
    expect(rectangles.length).toBeGreaterThan(2);
    for (const [x, y, width, height] of rectangles) {
      expect(x).toBeGreaterThanOrEqual(area.x);
      expect(y).toBeGreaterThanOrEqual(area.y);
      expect(x + width).toBeLessThanOrEqual(area.x + area.width);
      expect(y + height).toBeLessThanOrEqual(area.y + area.height);
    }
  });

  it("copies a slide as text: what the sign shows, then each link's address once", () => {
    const text = talkSlideText(
      slide({
        kicker: "Cloud 1",
        title: "E2B",
        bullets: ["One microVM per sandbox", "Outbound on by default"],
        table: { head: ["A", "B"], rows: [["1", "2"]] },
        links: [
          { text: "microVM", url: "https://example.com/a" },
          { text: "again", url: "https://example.com/a" },
          { text: "default", url: "https://example.com/b" },
        ],
      }),
    );
    expect(text).toBe(
      [
        "Cloud 1",
        "E2B",
        "- One microVM per sandbox",
        "- Outbound on by default",
        "A | B",
        "1 | 2",
        "",
        "microVM: https://example.com/a",
        "default: https://example.com/b",
        "",
      ].join("\n"),
    );
  });
});

describe("talk pictures", () => {
  it.each(talkPictureIds)(
    "%s is rectangular, fully coloured and fits 288×64",
    (id) => {
      const picture = talkPictures[id];
      const size = talkGridSize(picture.grid, picture.palette);
      expect(size.widthPixels).toBeLessThanOrEqual(288);
      expect(size.heightPixels).toBeLessThanOrEqual(64);
      for (const colour of Object.values(picture.palette)) {
        expect(colour).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
      }
    },
  );

  it("parses a section's picture and refuses an unknown one", () => {
    const section = {
      template: "section",
      title: "Kernel Caverns",
      lead: [],
      bullets: [],
      columns: [],
      links: [],
    };
    expect(
      parseTalkScript({
        title: "t",
        slides: [{ ...section, picture: "ghost-forest" }],
      }).slides[0]?.picture,
    ).toBe("ghost-forest");
    expect(() =>
      parseTalkScript({
        title: "t",
        slides: [{ ...section, picture: "mona-lisa" }],
      }),
    ).toThrow(TalkScriptError);
  });
});

describe("talk diagrams", () => {
  const sequence = {
    kind: "sequence",
    actors: [
      { id: "Dev", label: "Developer", icon: "developer" },
      { id: "VM", label: "microVM", icon: null },
    ],
    steps: [
      { kind: "message", from: "Dev", to: "VM", text: "Build", reply: false },
      { kind: "message", from: "VM", to: "Dev", text: "Done", reply: true },
      { kind: "note", over: ["Dev", "VM"], text: "Stopped at the deadline" },
    ],
  };
  const flow = {
    kind: "flow",
    nodes: [
      { id: "a", lines: ["Agent"], icon: "robot-head", column: 0, row: 0 },
      { id: "b", lines: ["Proxy"], icon: "funnel", column: 1, row: 0 },
      { id: "c", lines: ["Denials"], icon: null, column: 1, row: 1 },
    ],
    edges: [
      { from: "a", to: "b", dotted: false },
      { from: "b", to: "c", dotted: true },
    ],
  };

  it("parses a diagram and refuses an edge to an unknown node", () => {
    const parsed = parseTalkScript({
      title: "t",
      slides: [rawSlide({ diagram: sequence })],
    }).slides[0]?.diagram;
    expect(parsed?.kind).toBe("sequence");
    expect(() =>
      parseTalkScript({
        title: "t",
        slides: [
          rawSlide({
            diagram: {
              ...flow,
              edges: [{ from: "a", to: "nowhere", dotted: false }],
            },
          }),
        ],
      }),
    ).toThrow(TalkScriptError);
    expect(() =>
      parseTalkScript({
        title: "t",
        slides: [
          rawSlide({
            diagram: {
              ...flow,
              nodes: flow.nodes.map((node) => ({ ...node, column: 0, row: 0 })),
            },
          }),
        ],
      }),
    ).toThrow(TalkScriptError);
  });

  it("draws a sequence: actors, arrows with their words, a dashed reply, a note", () => {
    const script = parseTalkScript({
      title: "t",
      slides: [
        rawSlide({
          bullets: ["not drawn: the diagram replaces the list"],
          diagram: sequence,
        }),
      ],
    });
    const layout = layoutTalkSlide(script.slides[0] as TalkSlide, {
      widthPixels: 400,
      heightPixels: 200,
    });
    const texts = layout.runs.map((run) => run.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        "Developer",
        "microVM",
        "Build",
        "Done",
        "Stopped at the deadline",
      ]),
    );
    expect(texts.some((text) => text.includes("not drawn"))).toBe(false);
    expect(layout.icons).toHaveLength(1);
    expect(layout.boxes.some((box) => box.tone === "note")).toBe(true);
    // the reply is dashed: more short pieces of line than the solid arrow
    const build = layout.runs.find((run) => run.text === "Build");
    const done = layout.runs.find((run) => run.text === "Done");
    const piecesOn = (y: number): number =>
      layout.boxes.filter(
        (box) => box.tone === "line" && box.height === 1 && box.y === y + 10,
      ).length;
    expect(piecesOn(done?.y ?? 0)).toBeGreaterThan(piecesOn(build?.y ?? 0));
    expect(layout.overflowPixels).toBe(0);
  });

  it("draws a flow: nodes on a grid joined by arrows", () => {
    const script = parseTalkScript({
      title: "t",
      slides: [rawSlide({ diagram: flow })],
    });
    const layout = layoutTalkSlide(script.slides[0] as TalkSlide, {
      widthPixels: 400,
      heightPixels: 200,
    });
    const agent = layout.runs.find((run) => run.text === "Agent");
    const proxy = layout.runs.find((run) => run.text === "Proxy");
    const denials = layout.runs.find((run) => run.text === "Denials");
    expect(agent?.y).toBe(proxy?.y);
    expect(denials?.y ?? 0).toBeGreaterThan(proxy?.y ?? 0);
    expect(layout.icons).toHaveLength(2);
    expect(layout.boxes.some((box) => box.tone === "line")).toBe(true);
    expect(layout.overflowPixels).toBe(0);
  });

  it("overflows a sign too narrow for the diagram's words, so it zooms out", () => {
    const layout = layoutTalkSlide(
      slide({
        title: "Narrow",
        diagram: {
          kind: "sequence",
          actors: ["a", "b", "c", "d", "e"].map((id) => ({
            id,
            label: "A long participant name",
            icon: null,
          })),
          steps: [],
        },
      }),
      { widthPixels: 200, heightPixels: 200 },
    );
    expect(layout.overflowPixels).toBeGreaterThan(0);
  });
});

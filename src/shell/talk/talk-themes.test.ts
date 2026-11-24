import { describe, expect, it } from "vitest";

import {
  drawTalkBackdrop,
  drawTalkGround,
  talkBackdropHeightPixels,
  talkGroundOffsetPixels,
  talkGroundWidthPixels,
  talkLandmarkIndex,
  talkBackdropWidthPixels,
  talkGroundStripHeightPixels,
} from "./talk-backdrop";
import {
  talkNoteMidi,
  talkSongSpecs,
  talkThemeSong,
  talkVoiceSteps,
} from "./talk-music";
import {
  talkSlideThemes,
  talkThemeForWorld,
  talkThemeIds,
  talkThemes,
  type TalkThemeId,
} from "./talk-themes";

const worlds = [
  "Chaos Plains",
  "History",
  "Kernel Caverns",
  "Ghost House",
  "Forest of Illusion",
  "Silicon Island",
  "Isolate Isles",
  "Switch Palaces",
  "Valley of the Boss",
  "Final Castle",
];

describe("talk themes", () => {
  it("gives each of the talk's worlds its own theme", () => {
    const themes = worlds.map((name, index) => talkThemeForWorld(name, index));
    expect(themes).toEqual([
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
    ]);
  });

  it("still varies the theme of worlds whose names match no keyword", () => {
    const themes = ["Alpha", "Beta", "Gamma"].map((name, index) =>
      talkThemeForWorld(name, index),
    );
    expect(new Set(themes).size).toBe(3);
  });

  it("puts every slide in its world's theme, the opening on the plains", () => {
    const slide = (world: string | null) => ({
      template: world === null ? "content" : "section",
      world: world === null ? null : { name: world },
    });
    expect(
      talkSlideThemes([
        slide(null),
        slide("Kernel Caverns"),
        slide(null),
        slide("Final Castle"),
        slide(null),
      ]),
    ).toEqual(["plains", "cave", "cave", "castle", "castle"]);
  });
});

describe("talk music", () => {
  it("reads note names", () => {
    expect(talkNoteMidi("A4")).toBe(69);
    expect(talkNoteMidi("C4")).toBe(60);
    expect(talkNoteMidi("F#5")).toBe(78);
    expect(talkNoteMidi("Bb3")).toBe(58);
    expect(() => talkNoteMidi("H2")).toThrow(/Not a note/);
  });

  it("gives every theme a song whose voices loop together", () => {
    for (const theme of talkThemeIds) {
      const spec = talkSongSpecs[theme];
      const lengths = spec.voices.map(
        (voice) => talkVoiceSteps(voice.pattern).length,
      );
      expect(lengths[0]).toBeGreaterThanOrEqual(24);
      expect(new Set(lengths).size).toBe(1);
      const song = talkThemeSong(theme);
      for (const voice of song.voices) {
        expect(voice.notes.some((note) => note.midi !== null)).toBe(true);
        const seconds = voice.notes.reduce(
          (sum, note) => sum + note.seconds,
          0,
        );
        expect(seconds).toBeCloseTo((lengths[0] ?? 0) * spec.stepSeconds, 6);
      }
    }
  });

  it("gives each theme a different song", () => {
    const melodies = talkThemeIds.map((theme) =>
      JSON.stringify(talkThemeSong(theme).voices[0]?.notes),
    );
    expect(new Set(melodies).size).toBe(talkThemeIds.length);
  });
});

describe("talk backdrops", () => {
  const record = (
    draw: (context: {
      fillStyle: unknown;
      fillRect: (x: number, y: number, w: number, h: number) => void;
    }) => void,
  ) => {
    const colors = new Set<string>();
    let rects = 0;
    const context = {
      fillStyle: "" as unknown,
      fillRect: (x: number, y: number, w: number, h: number) => {
        expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
        expect(Number.isInteger(w) && Number.isInteger(h)).toBe(true);
        colors.add(String(context.fillStyle));
        rects += 1;
      },
    };
    draw(context);
    return { colors, rects };
  };

  it("draws every theme's scenery and ground on whole pixels", () => {
    const skies = new Set<string>();
    for (const theme of talkThemeIds) {
      const backdrop = record((context) => {
        drawTalkBackdrop(context as never, theme, 0);
      });
      expect(backdrop.colors.size).toBeGreaterThanOrEqual(5);
      skies.add([...backdrop.colors].slice(0, 3).join());
      const ground = record((context) => {
        drawTalkGround(context as never, theme);
      });
      expect(ground.rects).toBeGreaterThan(10);
    }
    expect(skies.size).toBe(talkThemeIds.length);
    expect(talkBackdropWidthPixels).toBe(640);
    expect(talkGroundWidthPixels).toBeGreaterThan(640);
    expect(talkBackdropHeightPixels).toBeGreaterThan(352);
    expect(talkGroundStripHeightPixels).toBeGreaterThan(32);
  });

  it("shows each room its own slice of the ground", () => {
    const offsets = Array.from({ length: 20 }, (_, index) =>
      talkGroundOffsetPixels(index),
    );
    expect(new Set(offsets).size).toBeGreaterThan(15);
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(talkGroundWidthPixels - 640);
    }
  });

  // Every rectangle a backdrop draws, as one string: two rooms look the same only if
  // these are equal.
  const drawing = (theme: TalkThemeId, room: number): string => {
    const calls: string[] = [];
    const context = {
      fillStyle: "",
      fillRect: (x: number, y: number, w: number, h: number) => {
        calls.push(
          `${String(context.fillStyle)} ${String(x)},${String(y)},${String(w)},${String(h)}`,
        );
      },
    };
    drawTalkBackdrop(context, theme, room);
    return calls.join(";");
  };

  it("gives every room its own backdrop, the same on every run", () => {
    for (const theme of talkThemeIds) {
      const rooms = Array.from({ length: 30 }, (_, room) =>
        drawing(theme, room),
      );
      expect(new Set(rooms).size).toBe(rooms.length);
      expect(drawing(theme, 7)).toBe(rooms[7]);
    }
  });

  it("keeps every room in its theme: its sky first, and the theme's colours throughout", () => {
    for (const theme of talkThemeIds) {
      const colourSets = Array.from({ length: 30 }, (_, room) => {
        const calls = drawing(theme, room).split(";");
        expect(calls[0]?.startsWith(talkThemes[theme].sky[0] ?? "")).toBe(true);
        return new Set(calls.map((call) => call.split(" ")[0]));
      });
      // the colours every room of the world uses: its sky and its scenery
      const shared = [...(colourSets[0] ?? [])].filter((colour) =>
        colourSets.every((set) => set.has(colour)),
      );
      expect(shared.length).toBeGreaterThanOrEqual(
        talkThemes[theme].sky.length + 2,
      );
    }
  });

  it("never gives neighbouring rooms the same landmark", () => {
    for (const theme of talkThemeIds) {
      for (let room = 0; room < 40; room++) {
        expect(talkLandmarkIndex(theme, room)).not.toBe(
          talkLandmarkIndex(theme, room + 1),
        );
      }
    }
  });
});

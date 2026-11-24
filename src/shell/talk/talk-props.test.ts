import { describe, expect, it } from "vitest";

import { talkGridSize } from "./talk-art";
import {
  drawTalkProp,
  talkPropIds,
  talkProps,
  talkPropSize,
} from "./talk-props";

describe("talk props", () => {
  it("has unique ids and a prop for each id", () => {
    expect(new Set(talkPropIds).size).toBe(talkPropIds.length);
    expect(Object.keys(talkProps).sort()).toEqual([...talkPropIds].sort());
  });

  it.each(talkPropIds)(
    "%s is rectangular, fully coloured and fits 32×24",
    (id) => {
      const prop = talkProps[id];
      const size = talkGridSize(prop.grid, prop.palette);
      expect(size.widthPixels).toBeLessThanOrEqual(32);
      expect(size.heightPixels).toBeLessThanOrEqual(24);
      expect(talkPropSize(id)).toEqual(size);
      if (prop.animated !== undefined) {
        expect(talkGridSize(prop.animated, prop.palette)).toEqual(size);
        expect(prop.animated).not.toEqual(prop.grid);
      }
    },
  );

  it("draws the animated frame on odd frames", () => {
    const painted = (frame: number): string[] => {
      const cells: string[] = [];
      const context = {
        fillStyle: "",
        fillRect(x: number, y: number): void {
          cells.push(`${String(x)},${String(y)},${context.fillStyle}`);
        },
      };
      drawTalkProp(context, "eye", 0, 0, frame);
      return cells;
    };
    expect(painted(0)).toEqual(painted(2));
    expect(painted(1)).not.toEqual(painted(0));
  });
});

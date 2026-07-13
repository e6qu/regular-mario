import { describe, expect, it } from "vitest";

import { makeBotInputCommand, makeBotInputCommands } from "./coop-bot-input";
import { HorizontalInput } from "../engine/simulation/input-command";

describe("makeBotInputCommand", () => {
  it("is deterministic for a given frame and bot", () => {
    expect(makeBotInputCommand(120, 2)).toEqual(makeBotInputCommand(120, 2));
  });

  it("produces a valid input command", () => {
    const command = makeBotInputCommand(37, 0);
    expect(Object.values(HorizontalInput)).toContain(command.horizontal);
    expect(typeof command.jumpPressed).toBe("boolean");
  });

  it("varies its walk direction over time (does not stand still forever)", () => {
    const directions = new Set<string>();
    for (let frame = 0; frame < 600; frame += 1) {
      directions.add(makeBotInputCommand(frame, 0).horizontal);
    }
    // It uses more than one direction across a stretch of frames.
    expect(directions.size).toBeGreaterThan(1);
  });

  it("gives different bots different behaviour", () => {
    const sameFrameByBot = Array.from({ length: 8 }, (_unused, botIndex) =>
      JSON.stringify(makeBotInputCommand(200, botIndex)),
    );
    expect(new Set(sameFrameByBot).size).toBeGreaterThan(1);
  });
});

describe("makeBotInputCommands", () => {
  it("returns one command per bot", () => {
    expect(makeBotInputCommands(10, 4)).toHaveLength(4);
    expect(makeBotInputCommands(10, 0)).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { initialMovementConstants } from "../simulation/movement-model";
import { makeInitialSimulationState } from "../simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../simulation/simulation-units";
import {
  makeTalkLevel,
  talkGroundRow,
  talkRoomAt,
  talkRoomFeatures,
  talkRoomWidthTiles,
  talkStandXPixels,
  talkTileSizePixels,
} from "./talk-level";

// Every feature once, then a flat last room with the gate.
const features = [...talkRoomFeatures, "flat"] as const;
describe("talk level", () => {
  it("validates as a playable level with one room per slide", () => {
    const level = makeTalkLevel(features);
    const spec = makeLevelSpec(level.levelInput);
    expect(spec.ok).toBe(true);
    expect(level.roomCount).toBe(features.length);
    expect(level.levelInput.widthTiles).toBe(
      features.length * talkRoomWidthTiles,
    );
    if (!spec.ok) {
      throw new Error("Expected the talk level to validate.");
    }
    const state = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      spec.value,
      initialMovementConstants,
    );
    expect(state.ok).toBe(true);
  });

  it("has unbroken ground, so a talk can never fall into a pit", () => {
    const { levelInput } = makeTalkLevel(features);
    const ground = levelInput.tiles[talkGroundRow];
    expect(ground?.every((tile) => tile === "grass")).toBe(true);
  });

  it("puts the gate, and only the gate, in the last room", () => {
    const { levelInput } = makeTalkLevel(features);
    const gates = levelInput.actors.filter(
      (actor) => actor.actorId === "open-gate",
    );
    expect(gates).toHaveLength(1);
    expect(Math.floor((gates[0]?.x ?? -1) / talkRoomWidthTiles)).toBe(
      features.length - 1,
    );
  });

  it("warps each pipe to the stand point of the next room", () => {
    const { levelInput } = makeTalkLevel(features);
    const pipe = levelInput.actors.find(
      (actor) => actor.actorId === "talk-pipe",
    );
    const pipeRoom = features.indexOf("pipe");
    expect(pipe?.targetTileX).toBe(
      talkStandXPixels(pipeRoom + 1) / talkTileSizePixels,
    );
  });

  it("maps a pixel x to its room, clamped to the talk", () => {
    expect(talkRoomAt(0, 3)).toBe(0);
    expect(talkRoomAt(talkStandXPixels(2), 3)).toBe(2);
    expect(talkRoomAt(10_000_000, 3)).toBe(2);
    expect(talkRoomAt(-5, 3)).toBe(0);
  });

  it("refuses an empty talk", () => {
    expect(() => makeTalkLevel([])).toThrow(/at least one room/);
  });
});

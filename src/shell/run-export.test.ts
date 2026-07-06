import { describe, expect, it } from "vitest";

import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import type { BrowserGameBootstrap } from "./browser-level-selection";
import {
  buildRunExport,
  buildRunZip,
  runExportVersion,
  serializeRunExport,
} from "./run-export";
import type { RunRecorder } from "./run-recorder";
import {
  makeRecorderTestFixture,
  recordFixtureRun,
} from "./run-recorder-test-support";

const neutralInput: SimulationInputCommand = {
  horizontal: HorizontalInput.Right,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

function recordShortRun(frames: number): RunRecorder {
  const fixture = makeRecorderTestFixture();
  recordFixtureRun(fixture, () => neutralInput, frames);
  return fixture.recorder;
}

const stubBootstrap = {
  levelInput: { marker: "test-level" },
  initialPlayerVitality: { kind: "small" },
} as unknown as BrowserGameBootstrap;

function bytesContainAscii(bytes: Uint8Array, text: string): boolean {
  return new TextDecoder().decode(bytes).includes(text);
}

describe("run export", () => {
  it("captures the level and per-frame inputs, and JSON round-trips", () => {
    const recorder = recordShortRun(4);
    const runExport = buildRunExport(recorder, stubBootstrap);

    expect(runExport.version).toBe(runExportVersion);
    expect(runExport.frameCount).toBe(4);
    expect(runExport.inputs).toHaveLength(4);
    expect(runExport.level).toEqual({ marker: "test-level" });

    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(serializeRunExport(runExport)),
    );
    expect(parsed).toEqual(runExport);
  });

  it("packages run.json and thumbnails into a valid zip", () => {
    const recorder = recordShortRun(2);
    const runExport = buildRunExport(recorder, stubBootstrap);
    const zip = buildRunZip(runExport, [
      { frame: 0, imageDataUrl: "data:image/png;base64,AAAA" },
      { frame: 30, imageDataUrl: "data:image/png;base64,BBBB" },
    ]);

    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(bytesContainAscii(zip, "run.json")).toBe(true);
    expect(bytesContainAscii(zip, "thumbnails/frame-000000.png")).toBe(true);
    expect(bytesContainAscii(zip, "thumbnails/frame-000030.png")).toBe(true);
  });
});

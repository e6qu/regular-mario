import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  makeCleanScriptTestRoot,
  runNodeScript,
} from "../../tests/support/script-test-support";

const require = createRequire(import.meta.url);
const { encodeRgbaPng } = require("../../scripts/png-codec.mjs") as {
  encodeRgbaPng: (input: {
    width: number;
    height: number;
    pixels: Uint8Array;
  }) => Buffer;
};

const scriptPath = resolve("scripts/verify-smb-frames.mjs");
const testBaseDirectory = ".cache/user-levels/test-verify-smb-frames";
const frameWidth = 256;
const frameHeight = 240;
const checkpointNames = [
  "01-start-card",
  "02-level-start",
  "03-first-run",
  "04-question-blocks",
  "05-first-pipe",
  "06-pipe-gap",
];

type VerifyReport = {
  readonly checkpointCount: number;
  readonly passedCount: number;
  readonly allPixelIdentical: boolean;
  readonly checkpoints: readonly {
    readonly name: string;
    readonly pass: boolean;
    readonly differingPixels?: number;
    readonly reason?: string;
  }[];
};

function solidFrame(r: number, g: number, b: number): Buffer {
  const pixels = new Uint8Array(frameWidth * frameHeight * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = 255;
  }
  return encodeRgbaPng({ width: frameWidth, height: frameHeight, pixels });
}

async function writeFrameSet(
  directory: string,
  makeFrame: (name: string) => Buffer,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  for (const name of checkpointNames) {
    await writeFile(resolve(directory, `${name}.png`), makeFrame(name));
  }
}

async function runVerify(
  root: string,
  referenceDir: string,
  actualDir: string,
): Promise<{ exitCode: number; report: VerifyReport }> {
  const reportPath = resolve(root, "report.json");
  const result = await runNodeScript(scriptPath, [
    "--reference-dir",
    referenceDir,
    "--actual-dir",
    actualDir,
    "--report",
    reportPath,
  ]);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as VerifyReport;
  return { exitCode: result.exitCode, report };
}

describe("verify-smb-frames", () => {
  it("passes when every checkpoint is pixel-identical", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "identical");
    const referenceDir = resolve(root, "reference");
    const actualDir = resolve(root, "actual");
    await writeFrameSet(referenceDir, () => solidFrame(92, 148, 252));
    await writeFrameSet(actualDir, () => solidFrame(92, 148, 252));

    const { exitCode, report } = await runVerify(root, referenceDir, actualDir);

    expect(exitCode).toBe(0);
    expect(report.allPixelIdentical).toBe(true);
    expect(report.passedCount).toBe(checkpointNames.length);
  });

  it("fails and counts differing pixels when a frame differs", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "differing");
    const referenceDir = resolve(root, "reference");
    const actualDir = resolve(root, "actual");
    await writeFrameSet(referenceDir, () => solidFrame(92, 148, 252));
    await writeFrameSet(actualDir, (name) =>
      name === "02-level-start"
        ? solidFrame(0, 0, 0)
        : solidFrame(92, 148, 252),
    );

    const { exitCode, report } = await runVerify(root, referenceDir, actualDir);

    expect(exitCode).toBe(1);
    expect(report.allPixelIdentical).toBe(false);
    expect(report.passedCount).toBe(checkpointNames.length - 1);
    const failed = report.checkpoints.find((c) => c.name === "02-level-start");
    expect(failed?.pass).toBe(false);
    expect(failed?.differingPixels).toBe(frameWidth * frameHeight);
  });

  it("fails loudly when an engine frame is missing", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "missing");
    const referenceDir = resolve(root, "reference");
    const actualDir = resolve(root, "actual");
    await writeFrameSet(referenceDir, () => solidFrame(92, 148, 252));
    await mkdir(actualDir, { recursive: true });

    const { exitCode, report } = await runVerify(root, referenceDir, actualDir);

    expect(exitCode).toBe(1);
    expect(report.passedCount).toBe(0);
    expect(report.checkpoints[0]?.reason).toContain("missing");
  });
});

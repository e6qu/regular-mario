import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  makeCleanScriptTestRoot,
  runNodeScript,
} from "../../tests/support/script-test-support";

const scriptPath = resolve("scripts/capture-smb-reference-frames.mjs");
const testBaseDirectory = ".cache/user-levels/test-capture-smb-frames";

describe("capture-smb-reference-frames", () => {
  it("prints usage for --help without emulating", async () => {
    const result = await runNodeScript(scriptPath, ["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("capture:smb-frames");
  });

  it("fails loudly when the ROM file is missing", async () => {
    const root = await makeCleanScriptTestRoot(
      testBaseDirectory,
      "missing-rom",
    );

    const result = await runNodeScript(scriptPath, [
      "--rom",
      resolve(root, "absent-rom.nes"),
      "--out-dir",
      resolve(root, "out"),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("absent-rom.nes");
  });

  it("rejects an output directory outside the ignored cache", async () => {
    const result = await runNodeScript(scriptPath, [
      "--out-dir",
      resolve("dist/frames"),
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(".cache/user-levels");
  });
});

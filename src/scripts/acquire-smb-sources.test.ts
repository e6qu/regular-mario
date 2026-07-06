import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  makeCleanScriptTestRoot,
  runNodeScript,
  type ScriptRunResult,
} from "../../tests/support/script-test-support";
import { makeSyntheticSmbRom } from "../../tests/support/smb-rom-test-support";

const scriptPath = resolve("scripts/acquire-smb-sources.mjs");
const testBaseDirectory = ".cache/user-levels/test-acquire-smb-sources";

type AcquireReport = {
  readonly vglc: { readonly status: string };
  readonly rom: {
    readonly sourceKind: string;
    readonly sha256: string;
    readonly checksumVerified: boolean;
  };
};

async function readAcquireReport(root: string): Promise<AcquireReport> {
  return JSON.parse(
    await readFile(resolve(root, "report.json"), "utf8"),
  ) as AcquireReport;
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function romOnlyArgs(root: string): string[] {
  return [
    "--skip-vglc",
    "--rom-cache-path",
    resolve(root, "rom.nes"),
    "--report",
    resolve(root, "report.json"),
  ];
}

async function writeSourceRom(
  root: string,
  corrupt?: (bytes: Buffer) => void,
): Promise<{ readonly sourcePath: string; readonly romBytes: Buffer }> {
  const romBytes = makeSyntheticSmbRom(new Map());
  corrupt?.(romBytes);
  const sourcePath = resolve(root, "source-rom.nes");
  await writeFile(sourcePath, romBytes);
  return { sourcePath, romBytes };
}

async function runAcquireRomOnly(
  root: string,
  extraArgs: readonly string[],
): Promise<ScriptRunResult> {
  return runNodeScript(scriptPath, [...romOnlyArgs(root), ...extraArgs]);
}

async function runAcquireWithCorruptRom(
  suffix: string,
  corrupt: (bytes: Buffer) => void,
): Promise<ScriptRunResult> {
  const root = await makeCleanScriptTestRoot(testBaseDirectory, suffix);
  const { sourcePath } = await writeSourceRom(root, corrupt);
  return runAcquireRomOnly(root, ["--rom", sourcePath]);
}

async function runAcquireWithVglcRoot(
  suffix: string,
  prepareVglcRoot: (vglcRoot: string) => Promise<void>,
): Promise<{ readonly root: string; readonly result: ScriptRunResult }> {
  const root = await makeCleanScriptTestRoot(testBaseDirectory, suffix);
  const vglcRoot = resolve(root, "vglc");
  await prepareVglcRoot(vglcRoot);
  const { sourcePath } = await writeSourceRom(root);
  const result = await runNodeScript(scriptPath, [
    "--vglc-root",
    vglcRoot,
    "--rom",
    sourcePath,
    "--rom-cache-path",
    resolve(root, "rom.nes"),
    "--report",
    resolve(root, "report.json"),
  ]);
  return { root, result };
}

async function expectSuccessfulAcquire(
  root: string,
  result: ScriptRunResult,
  romBytes: Buffer,
): Promise<AcquireReport> {
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);

  const cachedBytes = await readFile(resolve(root, "rom.nes"));
  expect(cachedBytes.equals(romBytes)).toBe(true);

  return readAcquireReport(root);
}

describe("acquire-smb-sources", () => {
  it("copies a valid user-supplied ROM path into the cache and reports its checksum", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "valid-path");
    const { sourcePath, romBytes } = await writeSourceRom(root);

    const result = await runAcquireRomOnly(root, ["--rom", sourcePath]);

    const report = await expectSuccessfulAcquire(root, result, romBytes);
    expect(report.rom.sourceKind).toBe("path");
    expect(report.rom.sha256).toBe(sha256Hex(romBytes));
    expect(report.rom.checksumVerified).toBe(false);
    expect(report.vglc.status).toBe("skipped");
  });

  it("downloads a ROM from a user-supplied URL source", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "url");
    const romBytes = makeSyntheticSmbRom(new Map());
    const dataUrl = `data:application/octet-stream;base64,${romBytes.toString("base64")}`;

    const result = await runAcquireRomOnly(root, ["--rom", dataUrl]);

    const report = await expectSuccessfulAcquire(root, result, romBytes);
    expect(report.rom.sourceKind).toBe("url");
  });

  it("verifies an expected SHA-256 checksum and fails on mismatch", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "checksum");
    const { sourcePath, romBytes } = await writeSourceRom(root);

    const matching = await runAcquireRomOnly(root, [
      "--rom",
      sourcePath,
      "--expected-sha256",
      sha256Hex(romBytes),
    ]);
    expect(matching.exitCode).toBe(0);

    const report = await readAcquireReport(root);
    expect(report.rom.checksumVerified).toBe(true);

    const mismatching = await runAcquireRomOnly(root, [
      "--rom",
      sourcePath,
      "--expected-sha256",
      "0".repeat(64),
    ]);
    expect(mismatching.exitCode).toBe(1);
    expect(mismatching.stderr).toContain("SHA-256");
  });

  it("rejects a file without the iNES magic bytes", async () => {
    const result = await runAcquireWithCorruptRom("bad-magic", (bytes) => {
      bytes[0] = 0x00;
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("iNES magic");
  });

  it("rejects a ROM with an unexpected bank layout", async () => {
    const result = await runAcquireWithCorruptRom("bad-banks", (bytes) => {
      bytes[4] = 8;
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("PRG banks");
  });

  it("fails with setup instructions when no ROM source is configured", async () => {
    const root = await makeCleanScriptTestRoot(
      testBaseDirectory,
      "missing-source",
    );

    const result = await runAcquireRomOnly(root, []);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No SMB ROM source is configured");
    expect(result.stderr).toContain("never ships or hardcodes ROM");
  });

  it("accepts an existing VGLC corpus without cloning", async () => {
    const { root, result } = await runAcquireWithVglcRoot(
      "vglc-present",
      async (vglcRoot) => {
        await mkdir(resolve(vglcRoot, "Super Mario Bros/Processed"), {
          recursive: true,
        });
        await writeFile(
          resolve(vglcRoot, "Super Mario Bros/Processed/mario-1-1.txt"),
          "synthetic",
        );
      },
    );

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    const report = await readAcquireReport(root);
    expect(report.vglc.status).toBe("present");
  });

  it("fails loudly when the VGLC root exists but lacks the corpus marker", async () => {
    const { result } = await runAcquireWithVglcRoot(
      "vglc-broken",
      async (vglcRoot) => {
        await mkdir(vglcRoot, { recursive: true });
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing");
  });
});

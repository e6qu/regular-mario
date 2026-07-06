import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  makeCleanScriptTestRoot,
  runNodeScript,
} from "../../tests/support/script-test-support";

const scriptPath = resolve("scripts/ensure-smb-dev-cache.mjs");
const testBaseDirectory = ".cache/user-levels/test-ensure-smb-dev-cache";

async function writeCacheFile(
  root: string,
  relativePath: string,
): Promise<void> {
  const filePath = resolve(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, "synthetic");
}

describe("ensure-smb-dev-cache", () => {
  it("passes when the browser-demo manifest exists", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "ready");
    await writeCacheFile(root, "vglc-smb-browser-demo/remote-manifest.json");

    const result = await runNodeScript(scriptPath, [
      "--dry-run",
      "--cache-root",
      root,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("SMB dev cache is ready");
  });

  it("would run prepare:smb when the cache is incomplete but a ROM is cached", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "rom-cached");
    await writeCacheFile(root, "smb/rom.nes");

    const result = await runNodeScript(scriptPath, [
      "--dry-run",
      "--cache-root",
      root,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("prepare:smb would run now");
  });

  it("prints setup instructions and proceeds when no ROM source exists", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "no-rom");

    const result = await runNodeScript(scriptPath, [
      "--dry-run",
      "--cache-root",
      root,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("acquire:smb");
    expect(result.stderr).toContain("legally obtained");
  });
});

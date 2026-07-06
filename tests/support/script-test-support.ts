import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ScriptRunResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export async function runNodeScript(
  scriptPath: string,
  args: readonly string[],
): Promise<ScriptRunResult> {
  try {
    const result = await execFileAsync(process.execPath, [scriptPath, ...args]);

    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const failedRun = error as {
      readonly code: number;
      readonly stdout: string;
      readonly stderr: string;
    };

    return {
      exitCode: failedRun.code,
      stdout: failedRun.stdout,
      stderr: failedRun.stderr,
    };
  }
}

export async function makeCleanScriptTestRoot(
  baseDirectory: string,
  suffix: string,
): Promise<string> {
  const root = resolve(baseDirectory, suffix);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  return root;
}

// Cleans outDir, runs the script writing there, and returns the run result.
export async function runNodeScriptInCleanDir(
  scriptPath: string,
  outDir: string,
  args: readonly string[],
): Promise<ScriptRunResult> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  return runNodeScript(scriptPath, args);
}

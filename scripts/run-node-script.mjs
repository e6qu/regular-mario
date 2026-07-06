// Shared child-process runner for orchestration scripts: runs a repo script
// with inherited stdio and fails loudly with a caller-provided message.

import { spawn } from "node:child_process";
import { resolve } from "node:path";

export async function runNodeScriptInherit(
  scriptPath,
  args,
  makeFailureMessage,
) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [resolve(scriptPath), ...args], {
      stdio: "inherit",
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(undefined);
      } else {
        rejectPromise(new Error(makeFailureMessage(code)));
      }
    });
  });
}

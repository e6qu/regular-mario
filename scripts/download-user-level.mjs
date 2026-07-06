#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import https from "node:https";
import { basename, resolve } from "node:path";
import { URL } from "node:url";
import {
  assertUserLevelCachePath,
  readOption,
  requireOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

function printUsage() {
  console.log(`Usage:
  node scripts/download-user-level.mjs --url <https-url> --sha256 <hex> [--out .cache/user-levels/name]

Downloads a user-specified community level/archive into .cache/user-levels.
No URL is built in. No downloaded file is tracked by git.`);
}

function makeOutputPath(urlText) {
  const explicitOut = readOption("--out");

  if (explicitOut !== undefined && !explicitOut.startsWith("--")) {
    return resolve(explicitOut);
  }

  const parsedUrl = new URL(urlText);
  const urlFileName = basename(parsedUrl.pathname);

  if (urlFileName.length === 0) {
    throw new Error("--out is required when the URL has no file name.");
  }

  return resolve(userLevelCacheRoot, urlFileName);
}

function assertSha256(value) {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      "--sha256 must be a 64-character hexadecimal SHA-256 digest.",
    );
  }
}

function downloadHttpsBytes(url) {
  return new Promise((resolveDownload, rejectDownload) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode === undefined ||
        response.statusCode < 200 ||
        response.statusCode >= 300
      ) {
        response.resume();
        rejectDownload(
          new Error(
            `Download failed: ${response.statusCode ?? "unknown"} ${response.statusMessage ?? ""}.`,
          ),
        );
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => {
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolveDownload(Buffer.concat(chunks));
      });
    });

    request.on("error", rejectDownload);
  });
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const urlText = requireOption("--url");
  const expectedSha256 = requireOption("--sha256").toLowerCase();
  assertSha256(expectedSha256);

  const parsedUrl = new URL(urlText);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only https URLs are supported.");
  }

  const outputPath = makeOutputPath(urlText);
  assertUserLevelCachePath(outputPath, "Downloaded level file");

  const bytes = await downloadHttpsBytes(parsedUrl);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}.`,
    );
  }

  await mkdir(userLevelCacheRoot, { recursive: true });
  const temporaryPath = `${outputPath}.part`;

  try {
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  console.log(`Downloaded ${bytes.byteLength} bytes to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

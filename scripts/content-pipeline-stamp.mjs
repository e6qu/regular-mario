// Fingerprint of the content pipeline: when any of these scripts change, the
// map sets / asset sets / bundles they produced into the ignored cache are
// stale and must be rebuilt. prepare:smb writes the stamp after a successful
// run; the dev-cache gate compares it on boot and rebuilds the content steps
// when it no longer matches (e.g. after pulling a decoder fix).

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { userLevelCacheRoot } from "./user-level-cache-policy.mjs";

const pipelineScriptPaths = [
  "scripts/decode-smb-level.mjs",
  "scripts/build-official-map-set.mjs",
  "scripts/build-parody-asset-set.mjs",
  "scripts/build-rom-asset-set.mjs",
  "scripts/build-sound-packs.mjs",
  "scripts/content-sets.mjs",
];

export const pipelineStampPath = resolve(
  userLevelCacheRoot,
  "content-pipeline-stamp.json",
);

export async function computePipelineStamp() {
  const hash = createHash("sha256");
  for (const path of pipelineScriptPaths) {
    hash.update(path);
    hash.update(await readFile(resolve(path)));
  }
  return hash.digest("hex");
}

export async function readPipelineStamp() {
  try {
    const parsed = JSON.parse(await readFile(pipelineStampPath, "utf8"));
    return typeof parsed.stamp === "string" ? parsed.stamp : undefined;
  } catch {
    return undefined;
  }
}

export async function writePipelineStamp(stamp) {
  await mkdir(dirname(pipelineStampPath), { recursive: true });
  await writeFile(pipelineStampPath, `${JSON.stringify({ stamp }, null, 2)}\n`);
}

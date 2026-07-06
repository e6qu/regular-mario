// Shared ignored-cache artifact status for the SMB acquisition/prep pipeline
// (Decision 0018). Pure path/existence logic so the orchestrator and the dev
// cache check agree on what "ready" means.

import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { userLevelCacheRoot } from "./user-level-cache-policy.mjs";

export const smbCacheArtifactRelativePaths = {
  vglcMarker: "vglc/Super Mario Bros/Processed/mario-1-1.txt",
  rom: "smb/rom.nes",
  extractionReport: "smb-rom-assets/extraction-report.json",
  researchManifest: "vglc-smb-research/research-manifest.json",
  assetFragment: "vglc-smb-assets/fragment.json",
  browserDemoManifest: "vglc-smb-browser-demo/remote-manifest.json",
};

export const defaultSmbCacheRoot = userLevelCacheRoot;

export function resolveSmbCachePaths(cacheRoot) {
  const paths = {};

  for (const [key, relativePath] of Object.entries(
    smbCacheArtifactRelativePaths,
  )) {
    paths[key] = resolve(cacheRoot, relativePath);
  }

  return paths;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readSmbCacheStatus(cacheRoot) {
  const paths = resolveSmbCachePaths(cacheRoot);
  const status = {};

  for (const [key, filePath] of Object.entries(paths)) {
    status[key] = await fileExists(filePath);
  }

  return status;
}

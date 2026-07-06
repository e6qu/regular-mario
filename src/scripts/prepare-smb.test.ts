import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  makeCleanScriptTestRoot,
  runNodeScript,
} from "../../tests/support/script-test-support";

const scriptPath = resolve("scripts/prepare-smb.mjs");
const testBaseDirectory = ".cache/user-levels/test-prepare-smb";

const artifactRelativePaths = {
  vglcMarker: "vglc/Super Mario Bros/Processed/mario-1-1.txt",
  rom: "smb/rom.nes",
  extractionReport: "smb-rom-assets/extraction-report.json",
  researchManifest: "vglc-smb-research/research-manifest.json",
  assetFragment: "vglc-smb-assets/fragment.json",
  browserDemoManifest: "vglc-smb-browser-demo/remote-manifest.json",
} as const;

type ArtifactKey = keyof typeof artifactRelativePaths;

type StatusOutput = {
  readonly status: Record<ArtifactKey, boolean>;
};

type DryRunOutput = {
  readonly status: Record<ArtifactKey, boolean>;
  readonly plannedSteps: readonly {
    readonly id: string;
    readonly script: string;
    readonly args: readonly string[];
  }[];
};

async function writeArtifacts(
  root: string,
  keys: readonly ArtifactKey[],
): Promise<void> {
  for (const key of keys) {
    const filePath = resolve(root, artifactRelativePaths[key]);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, "synthetic");
  }
}

async function runStatus(root: string): Promise<StatusOutput> {
  const result = await runNodeScript(scriptPath, [
    "--status",
    "--cache-root",
    root,
  ]);
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as StatusOutput;
}

async function runDryRun(
  root: string,
  extraArgs: readonly string[] = [],
): Promise<DryRunOutput> {
  const result = await runNodeScript(scriptPath, [
    "--dry-run",
    "--cache-root",
    root,
    ...extraArgs,
  ]);
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as DryRunOutput;
}

function plannedStepIds(output: DryRunOutput): readonly string[] {
  return output.plannedSteps.map((step) => step.id);
}

describe("prepare-smb", () => {
  it("reports every artifact as missing for an empty cache root", async () => {
    const root = await makeCleanScriptTestRoot(
      testBaseDirectory,
      "empty-status",
    );

    const output = await runStatus(root);

    expect(output.status).toEqual({
      vglcMarker: false,
      rom: false,
      extractionReport: false,
      researchManifest: false,
      assetFragment: false,
      browserDemoManifest: false,
    });
  });

  it("plans the full pipeline for an empty cache root", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "empty-plan");

    const output = await runDryRun(root);

    expect(plannedStepIds(output)).toEqual([
      "acquire",
      "extract",
      "research",
      "fragment",
      "browser-demo",
      "rom-asset-set",
      "parody-asset-set",
      "official-map-set",
      "sound-packs",
      "content-sets-index",
      "content-sets-bundle",
    ]);
  });

  it("skips acquisition when the VGLC corpus and ROM are already cached", async () => {
    const root = await makeCleanScriptTestRoot(
      testBaseDirectory,
      "sources-cached",
    );
    await writeArtifacts(root, ["vglcMarker", "rom"]);

    const output = await runDryRun(root);

    expect(plannedStepIds(output)).toEqual([
      "extract",
      "research",
      "fragment",
      "browser-demo",
      "rom-asset-set",
      "parody-asset-set",
      "official-map-set",
      "sound-packs",
      "content-sets-index",
      "content-sets-bundle",
    ]);
  });

  it("plans nothing when every artifact exists", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "complete");
    await writeArtifacts(root, [
      "vglcMarker",
      "rom",
      "extractionReport",
      "researchManifest",
      "assetFragment",
      "browserDemoManifest",
    ]);

    const output = await runDryRun(root);

    expect(plannedStepIds(output)).toEqual([]);
  });

  it("plans every step with --force even when artifacts exist", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "force");
    await writeArtifacts(root, [
      "vglcMarker",
      "rom",
      "extractionReport",
      "researchManifest",
      "assetFragment",
      "browserDemoManifest",
    ]);

    const output = await runDryRun(root, ["--force"]);

    expect(plannedStepIds(output)).toEqual([
      "acquire",
      "extract",
      "research",
      "fragment",
      "browser-demo",
      "rom-asset-set",
      "parody-asset-set",
      "official-map-set",
      "sound-packs",
      "content-sets-index",
      "content-sets-bundle",
    ]);
  });

  it("forwards the ROM source and checksum to the acquire step", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "rom-args");

    const output = await runDryRun(root, [
      "--rom",
      "/tmp/user-rom.nes",
      "--expected-sha256",
      "a".repeat(64),
    ]);

    const acquireStep = output.plannedSteps.find(
      (step) => step.id === "acquire",
    );
    expect(acquireStep).toBeDefined();
    expect(acquireStep?.args).toEqual([
      "--rom",
      "/tmp/user-rom.nes",
      "--expected-sha256",
      "a".repeat(64),
    ]);
  });

  it("rejects running steps against a non-default cache root", async () => {
    const root = await makeCleanScriptTestRoot(testBaseDirectory, "run-guard");

    const result = await runNodeScript(scriptPath, ["--cache-root", root]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--cache-root is only supported");
  });
});

#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  assertUserLevelCachePath,
  readOption,
  userLevelCacheRoot,
} from "./user-level-cache-policy.mjs";

const defaultOutputDirectory = resolve(userLevelCacheRoot, "vglc-smb-research");
const manifestFileName = "research-manifest.json";
const multiLayerManifestFileName = "multi-layer-research-manifest.json";
const multiLayerUnsupportedReportFileName =
  "multi-layer-unsupported-symbols.json";
const metadataDirectoryName = "metadata";
// VGLC "?" cells are the full/power-up question blocks in SMB 1-1 (the first
// one over the goomba holds the Super Mushroom); coin blocks are marked "Q".
const questionBlockContentsDefault = "power-up";
const multiLayerPlayerPathId = "vglc-smb-multi-layer-player-path";
const multiLayerSupportedStructuralCharacters = new Set([
  "-",
  "#",
  "|",
  "[",
  "]",
  "p",
  "P",
  "d",
  "D",
  "{",
  "}",
  "?",
  "O",
  "+",
  "*",
  "H",
  "M",
  "B",
  "C",
  "c",
  "V",
  "X",
  "Y",
  "y",
  "g",
  "o",
  "k",
  "K",
  "t",
  "h",
  "l",
]);
const multiLayerUnsupportedCharacters = new Map(
  [
    [">", "left-right moving platform"],
    ["v", "up-down moving platform"],
  ].map(([character, label]) => [
    character,
    {
      label,
      featureId: `vglc-smb-multi-layer-${label.replaceAll(" ", "-")}`,
      reason: `${label} behavior is not represented before direct SMB multi-layer parity.`,
    },
  ]),
);

function printUsage() {
  console.log(`Usage:
  node scripts/prepare-vglc-smb-research.mjs --smb-root .cache/user-levels/vglc/Super\\ Mario\\ Bros [--out-dir .cache/user-levels/vglc-smb-research]

Generates cache-only research manifests for VGLC Super Mario Bros Processed
text files and, when present, Multi-layer structural files.
The VGLC data must already be under .cache/user-levels, for example from a local clone.
Generated manifests and sidecar metadata stay under .cache/user-levels and must not be committed.`);
}

function requireCacheDirectory(optionName, fallback) {
  const value = readOption(optionName) ?? fallback;

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${optionName} is required.`);
  }

  return assertUserLevelCachePath(value, optionName);
}

function cacheRelativePath(fromDirectory, toFile) {
  const relativePath = relative(fromDirectory, toFile);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".."
  ) {
    assertUserLevelCachePath(toFile, "Generated manifest source");
  }

  return relativePath.split(sep).join("/");
}

function pathPointsFromAnnotatedLayer(text, label) {
  const rows = splitRows(text);
  const points = [];

  for (const [y, row] of rows.entries()) {
    for (const [x, character] of [...row].entries()) {
      if (character === "x") {
        points.push({ x, y });
      }
    }
  }

  if (points.length === 0) {
    throw new Error(`${label} contains no x path points.`);
  }

  return points.toSorted((left, right) => {
    if (left.x !== right.x) {
      return left.x - right.x;
    }

    return left.y - right.y;
  });
}

function countCharacters(text) {
  const counts = new Map();

  for (const character of text) {
    if (character === "\n" || character === "\r") {
      continue;
    }

    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  return counts;
}

function addFileCharacterCounts(target, fileName, counts) {
  for (const [character, count] of counts) {
    const current = target.get(character) ?? { total: 0, files: new Map() };
    current.total += count;
    current.files.set(fileName, count);
    target.set(character, current);
  }
}

function serializeCharacterCounts(counts) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([character, entry]) => ({
      character,
      count: entry.total,
      files: [...entry.files.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([fileName, count]) => ({ fileName, count })),
    }));
}

function classifyMultiLayerCharacterCounts(fileName, text) {
  const supported = new Map();
  const unsupported = new Map();
  const unknown = new Map();

  for (const [character, count] of countCharacters(text)) {
    if (multiLayerSupportedStructuralCharacters.has(character)) {
      supported.set(character, count);
      continue;
    }

    if (multiLayerUnsupportedCharacters.has(character)) {
      unsupported.set(character, count);
      continue;
    }

    unknown.set(character, count);
  }

  return { fileName, supported, unsupported, unknown };
}

function splitRows(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n$/, "")
    .split("\n");
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

async function makeProcessedLevelEntry({
  smbRoot,
  outputDirectory,
  metadataDirectory,
  fileName,
}) {
  const baseName = fileName.replace(/\.txt$/, "");
  const processedPath = resolve(smbRoot, "Processed", fileName);
  const pathLayerPath = resolve(
    smbRoot,
    "Paths",
    `${baseName}_Annotated_Path.txt`,
  );

  if (!existsSync(pathLayerPath)) {
    throw new Error(`Missing annotated path for ${fileName}: ${pathLayerPath}`);
  }

  const processedText = await readText(processedPath);
  const pathPoints = pathPointsFromAnnotatedLayer(
    await readText(pathLayerPath),
    pathLayerPath,
  );
  const firstPathPoint = pathPoints[0];
  const lastPathPoint = pathPoints[pathPoints.length - 1];

  if (firstPathPoint === undefined || lastPathPoint === undefined) {
    throw new Error(`Missing path endpoints for ${fileName}.`);
  }

  const metadata = {
    playerStart: firstPathPoint,
    exits: [lastPathPoint],
    paths: [
      {
        id: `${baseName}-annotated-path`,
        points: pathPoints,
      },
    ],
    ...(processedText.includes("?") ? { questionBlockContentsDefault } : {}),
  };
  const metadataFileName = `${baseName}.metadata.json`;
  const metadataPath = resolve(metadataDirectory, metadataFileName);
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    name: `vglc-smb-processed-${baseName}`,
    format: "vglc-smb-text",
    source: {
      kind: "file",
      fileName: cacheRelativePath(outputDirectory, processedPath),
    },
    importMetadataSource: {
      kind: "file",
      fileName: `${metadataDirectoryName}/${metadataFileName}`,
    },
  };
}

async function makeMultiLayerLevelEntry({
  smbRoot,
  outputDirectory,
  metadataDirectory,
  fileName,
}) {
  const baseName = fileName.replace(/\.txt$/, "");
  const structuralPath = resolve(
    smbRoot,
    "Multi-layer",
    "Structural Layer",
    fileName,
  );
  const playerPathLayerPath = resolve(
    smbRoot,
    "Multi-layer",
    "Player Path Layer",
    fileName,
  );

  if (!existsSync(playerPathLayerPath)) {
    throw new Error(
      `Missing multi-layer player path for ${fileName}: ${playerPathLayerPath}`,
    );
  }

  const structuralText = await readText(structuralPath);
  const playerPathLayerText = await readText(playerPathLayerPath);
  const pathPoints = pathPointsFromAnnotatedLayer(
    playerPathLayerText,
    playerPathLayerPath,
  );
  const firstPathPoint = pathPoints[0];
  const lastPathPoint = pathPoints[pathPoints.length - 1];

  if (firstPathPoint === undefined || lastPathPoint === undefined) {
    throw new Error(`Missing multi-layer path endpoints for ${fileName}.`);
  }

  const metadata = {
    playerStart: firstPathPoint,
    exits: [lastPathPoint],
    paths: [
      {
        id: `${baseName}-multi-layer-player-path`,
        points: pathPoints,
      },
    ],
    multiLayer: {
      pathId: multiLayerPlayerPathId,
      playerPathLayer: playerPathLayerText,
    },
    ...(structuralText.includes("?") ? { questionBlockContentsDefault } : {}),
  };
  const metadataFileName = `${baseName}.multi-layer.metadata.json`;
  const metadataPath = resolve(metadataDirectory, metadataFileName);
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    name: `vglc-smb-multi-layer-${baseName}`,
    format: "vglc-smb-multi-layer",
    source: {
      kind: "file",
      fileName: cacheRelativePath(outputDirectory, structuralPath),
    },
    importMetadataSource: {
      kind: "file",
      fileName: `${metadataDirectoryName}/${metadataFileName}`,
    },
  };
}

async function makeMultiLayerResearchArtifacts({
  smbRoot,
  outputDirectory,
  metadataDirectory,
}) {
  const structuralDirectory = resolve(
    smbRoot,
    "Multi-layer",
    "Structural Layer",
  );

  if (!existsSync(structuralDirectory)) {
    return { levels: [], report: undefined };
  }

  assertUserLevelCachePath(
    structuralDirectory,
    "VGLC SMB Multi-layer Structural Layer directory",
  );

  const fileNames = (await readdir(structuralDirectory))
    .filter((fileName) => fileName.endsWith(".txt"))
    .sort();
  const levels = [];
  const supportedCharacterCounts = new Map();
  const unsupportedCharacterCounts = new Map();
  const unknownCharacterCounts = new Map();

  for (const fileName of fileNames) {
    const structuralText = await readText(
      resolve(structuralDirectory, fileName),
    );
    const counts = classifyMultiLayerCharacterCounts(fileName, structuralText);
    addFileCharacterCounts(
      supportedCharacterCounts,
      fileName,
      counts.supported,
    );
    addFileCharacterCounts(
      unsupportedCharacterCounts,
      fileName,
      counts.unsupported,
    );
    addFileCharacterCounts(unknownCharacterCounts, fileName, counts.unknown);
    levels.push(
      await makeMultiLayerLevelEntry({
        smbRoot,
        outputDirectory,
        metadataDirectory,
        fileName,
      }),
    );
  }

  const unsupportedSymbols = serializeCharacterCounts(
    unsupportedCharacterCounts,
  ).map((entry) => {
    const feature = multiLayerUnsupportedCharacters.get(entry.character);

    if (feature === undefined) {
      throw new Error(`Missing feature metadata for ${entry.character}.`);
    }

    return {
      character: entry.character,
      label: feature.label,
      featureId: feature.featureId,
      reason: feature.reason,
      count: entry.count,
      files: entry.files,
    };
  });

  return {
    levels,
    report: {
      source: "VGLC Super Mario Bros Multi-layer Structural Layer",
      levelCount: levels.length,
      supportedSymbols: serializeCharacterCounts(supportedCharacterCounts),
      unsupportedSymbols,
      unknownSymbols: serializeCharacterCounts(unknownCharacterCounts),
    },
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const smbRoot = requireCacheDirectory("--smb-root");
  const outputDirectory = requireCacheDirectory(
    "--out-dir",
    defaultOutputDirectory,
  );
  const processedDirectory = resolve(smbRoot, "Processed");
  const metadataDirectory = resolve(outputDirectory, metadataDirectoryName);
  assertUserLevelCachePath(processedDirectory, "VGLC SMB Processed directory");
  assertUserLevelCachePath(metadataDirectory, "VGLC SMB metadata directory");

  if (!existsSync(processedDirectory)) {
    throw new Error(
      `Missing VGLC SMB Processed directory: ${processedDirectory}`,
    );
  }

  await mkdir(metadataDirectory, { recursive: true });

  const levelFileNames = (await readdir(processedDirectory))
    .filter((fileName) => fileName.endsWith(".txt"))
    .sort();
  const levels = [];

  for (const fileName of levelFileNames) {
    levels.push(
      await makeProcessedLevelEntry({
        smbRoot,
        outputDirectory,
        metadataDirectory,
        fileName,
      }),
    );
  }

  if (levels.length === 0) {
    throw new Error(
      `No processed VGLC SMB text files found in ${processedDirectory}.`,
    );
  }

  const multiLayerArtifacts = await makeMultiLayerResearchArtifacts({
    smbRoot,
    outputDirectory,
    metadataDirectory,
  });

  const manifestPath = resolve(outputDirectory, manifestFileName);
  const manifest = {
    version: "1",
    levels,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Generated ${levels.length} VGLC SMB research entries.`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(
    `Run: pnpm run research:user-levels -- --manifest ${cacheRelativePath(resolve("."), manifestPath)}`,
  );

  if (multiLayerArtifacts.levels.length > 0) {
    const multiLayerManifestPath = resolve(
      outputDirectory,
      multiLayerManifestFileName,
    );
    const reportPath = resolve(
      outputDirectory,
      multiLayerUnsupportedReportFileName,
    );
    await writeFile(
      multiLayerManifestPath,
      `${JSON.stringify(
        { version: "1", levels: multiLayerArtifacts.levels },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      reportPath,
      `${JSON.stringify(multiLayerArtifacts.report, null, 2)}\n`,
    );

    console.log(
      `Generated ${multiLayerArtifacts.levels.length} VGLC SMB multi-layer research entries.`,
    );
    console.log(`Multi-layer manifest: ${multiLayerManifestPath}`);
    console.log(`Multi-layer unsupported-symbol report: ${reportPath}`);

    if (multiLayerArtifacts.report.unsupportedSymbols.length > 0) {
      const summary = multiLayerArtifacts.report.unsupportedSymbols
        .map((symbol) => `${symbol.character}=${symbol.count}`)
        .join(", ");
      console.log(
        `Current multi-layer importer is expected to reject these source-specific symbols until modeled: ${summary}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

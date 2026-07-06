import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const forbiddenPathFragments = [
  "/node_modules/",
  "/dist/",
  "/build/",
  "/coverage/",
  "/playwright-report/",
  "/test-results/",
  "/.vite/",
  "/.vitest/",
  "/.cache/",
];

const forbiddenFileNameEndings = [
  ".min.js",
  ".min.css",
  ".map",
  ".zip",
  ".tar",
  ".tar.gz",
  ".tgz",
  ".7z",
  ".rar",
  ".ips",
  ".bps",
  ".ups",
  ".xdelta",
  ".xdelta3",
  ".dmg",
  ".iso",
  ".aiff",
  ".bmp",
  ".flac",
  ".gif",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mp3",
  ".ogg",
  ".otf",
  ".patch",
  ".png",
  ".nes",
  ".sfc",
  ".smc",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".gba",
  ".gb",
  ".gbc",
  "package-lock.json",
  "yarn.lock",
];

const allowedBinaryPathFragments = [
  "/tests/browser/boot.spec.ts-snapshots/",
  "/docs/art-source/",
];

const forbiddenFileNameFragments = [".bundle."];

const secretPatterns = [
  {
    name: "private key marker",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    name: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "generic assignment secret",
    pattern:
      /\b(password|passwd|secret|token|api_key|apikey)\s*=\s*['"][^'"]{12,}['"]/i,
  },
];

const maximumSecretScanBytes = 1024 * 1024;

function isAllowedBinaryPath(filePath) {
  const pathForFragmentChecks = normalizedPath(filePath);

  return allowedBinaryPathFragments.some((fragment) =>
    pathForFragmentChecks.includes(fragment),
  );
}

function trackedAndUntrackedFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );

  return output
    .split("\n")
    .filter((line) => line.length > 0)
    .sort();
}

function normalizedPath(filePath) {
  return `/${filePath}`;
}

function isBinaryContent(content) {
  return content.includes(0);
}

function validatePath(filePath) {
  const pathForFragmentChecks = normalizedPath(filePath);

  for (const fragment of forbiddenPathFragments) {
    if (pathForFragmentChecks.includes(fragment)) {
      throw new Error(
        `${filePath} is in forbidden generated/dependency path fragment ${fragment}.`,
      );
    }
  }

  for (const ending of forbiddenFileNameEndings) {
    if (filePath.endsWith(ending)) {
      const isAllowed = allowedBinaryPathFragments.some((fragment) =>
        pathForFragmentChecks.includes(fragment),
      );

      if (!isAllowed) {
        throw new Error(
          `${filePath} has forbidden generated/binary/lockfile ending ${ending}.`,
        );
      }
    }
  }

  for (const fragment of forbiddenFileNameFragments) {
    if (filePath.includes(fragment)) {
      throw new Error(
        `${filePath} has forbidden generated filename fragment ${fragment}.`,
      );
    }
  }
}

function validateTextContent(filePath) {
  const fileStatus = statSync(filePath);
  const allowedBinaryPath = isAllowedBinaryPath(filePath);

  if (!allowedBinaryPath && fileStatus.size > maximumSecretScanBytes) {
    throw new Error(
      `${filePath} is larger than the repository secret-scan limit.`,
    );
  }

  const content = readFileSync(filePath);

  if (isBinaryContent(content)) {
    if (!allowedBinaryPath) {
      throw new Error(
        `${filePath} is binary content without an explicit provenance policy.`,
      );
    }

    return;
  }

  const textContent = content.toString("utf8");

  for (const secretPattern of secretPatterns) {
    if (secretPattern.pattern.test(textContent)) {
      throw new Error(
        `${filePath} matches forbidden secret pattern: ${secretPattern.name}.`,
      );
    }
  }
}

const files = trackedAndUntrackedFiles();

for (const filePath of files) {
  validatePath(filePath);
  validateTextContent(filePath);
}

console.log(`repository content policy ok: ${files.length} files checked`);

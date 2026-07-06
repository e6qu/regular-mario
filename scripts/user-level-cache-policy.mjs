import { relative, resolve, sep } from "node:path";

export const userLevelCacheRoot = resolve(".cache/user-levels");

export function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

export function requireOption(name) {
  const value = readOption(name);
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function assertUserLevelCachePath(filePath, label) {
  const resolvedPath = resolve(filePath);

  if (
    resolvedPath !== userLevelCacheRoot &&
    !resolvedPath.startsWith(`${userLevelCacheRoot}${sep}`)
  ) {
    throw new Error(
      `${label} ${resolvedPath} must be under .cache/user-levels.`,
    );
  }

  return resolvedPath;
}

export function makeSafeCacheFileStem(value) {
  const stem = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

  if (stem.length === 0) {
    throw new Error(`Cannot derive a safe file name from "${value}".`);
  }

  return stem;
}

export function makeCacheRelativePath(fromDirectory, toFile, label) {
  const relativePath = relative(fromDirectory, toFile);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".."
  ) {
    assertUserLevelCachePath(toFile, label);
  }

  return relativePath.split(sep).join("/");
}

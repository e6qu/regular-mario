// A content set packed into one JSON file: every bundled file as base64, next to a
// manifest whose relative URL sources name those files. Shared by the game (which
// fetches bundle-blob.json beside a remote manifest) and the talk library (which
// ships its skin as one pack).

export interface ContentPackFiles {
  readonly files?: Record<
    string,
    { readonly type?: string; readonly base64?: string }
  >;
}

// The pack's files, or undefined if any entry is malformed.
export function decodeContentPack(
  pack: ContentPackFiles,
): readonly File[] | undefined {
  if (pack.files === undefined) {
    return undefined;
  }
  const files: File[] = [];
  for (const [name, entry] of Object.entries(pack.files)) {
    if (typeof entry.base64 !== "string") {
      return undefined;
    }
    const binary = atob(entry.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    files.push(new File([bytes], name, { type: entry.type ?? "" }));
  }
  return files;
}

// Rewrite every relative URL source whose target ships in the pack into a file
// source, so the loader reads it from memory.
export function rewritePackedSources(
  value: unknown,
  packedNames: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => rewritePackedSources(entry, packedNames));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (
    record["kind"] === "url" &&
    typeof record["url"] === "string" &&
    packedNames.has(record["url"])
  ) {
    return { kind: "file", fileName: record["url"] };
  }
  const rewritten: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    rewritten[key] = rewritePackedSources(entry, packedNames);
  }
  return rewritten;
}

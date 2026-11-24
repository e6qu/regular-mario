import { describe, expect, it } from "vitest";

import { decodeContentPack, rewritePackedSources } from "./content-pack";

describe("content pack", () => {
  it("decodes each file's base64 into a named, typed File", async () => {
    const files = decodeContentPack({
      files: { "a.png": { type: "image/png", base64: btoa("hi") } },
    });
    expect(files?.map((file) => [file.name, file.type])).toEqual([
      ["a.png", "image/png"],
    ]);
    expect(await files?.[0]?.text()).toBe("hi");
  });

  it("rejects a pack with no files or a malformed entry", () => {
    expect(decodeContentPack({})).toBeUndefined();
    expect(decodeContentPack({ files: { "a.png": {} } })).toBeUndefined();
  });

  it("turns URL sources the pack holds into file sources, anywhere in the manifest", () => {
    const manifest = {
      tileSprites: { brick: { source: { kind: "url", url: "brick.png" } } },
      levels: [{ source: { kind: "url", url: "elsewhere.json" } }],
    };
    expect(rewritePackedSources(manifest, new Set(["brick.png"]))).toEqual({
      tileSprites: {
        brick: { source: { kind: "file", fileName: "brick.png" } },
      },
      levels: [{ source: { kind: "url", url: "elsewhere.json" } }],
    });
  });
});

import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { staticContentType } from "./http-server";

// The user-asset loader refuses a source whose content-type is not one it
// accepts, and one refused asset aborts the whole boot with "Could not start".
// So an unmapped extension is not a cosmetic wart: it is a file the game cannot
// load. `.wav` fell through to application/octet-stream and took the shipped
// sound pack — and single-player startup — with it.

// Mirrors the sets in src/shell/user-asset-loader.ts.
const ACCEPTED_ASSET_TYPES = new Set([
  "image/png",
  "image/webp",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/mpeg",
  "audio/ogg",
]);

function extensionsUnder(root: string): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const extension = extname(entry);
      if (extension !== "") found.add(extension);
    }
  };
  walk(root);
  return found;
}

describe("staticContentType", () => {
  it("serves audio and image assets as types the loader accepts", () => {
    // The regression: each of these is a source the loader is willing to take,
    // and each was served as application/octet-stream instead.
    expect(
      staticContentType("/game-content/sound-packs/shabby/player-ouch.wav"),
    ).toBe("audio/wav");
    expect(staticContentType("/sprites/mario.png")).toBe("image/png");
    expect(staticContentType("/sprites/mario.webp")).toBe("image/webp");

    for (const path of ["a.wav", "a.png", "a.webp", "a.mp3", "a.ogg"]) {
      const type = staticContentType(path).split(";")[0]?.trim() ?? "";
      expect(
        ACCEPTED_ASSET_TYPES.has(type),
        `${path} served as "${type}", which the asset loader refuses`,
      ).toBe(true);
    }
  });

  it("names every extension the built site actually ships", () => {
    // Guards the class rather than the instance: add a new kind of asset to the
    // build and this fails until the server can serve it, instead of the game
    // failing to start once deployed.
    let shipped: Set<string>;
    try {
      shipped = extensionsUnder("dist");
    } catch {
      // No build present (a fresh checkout); nothing to assert against.
      return;
    }
    const unmapped = [...shipped].filter(
      (extension) =>
        staticContentType(`file${extension}`) === "application/octet-stream",
    );
    expect(
      unmapped,
      `extensions served as application/octet-stream: ${unmapped.join(", ")}`,
    ).toEqual([]);
  });

  it("still falls back to octet-stream for an unknown extension", () => {
    expect(staticContentType("/thing.bin")).toBe("application/octet-stream");
  });
});

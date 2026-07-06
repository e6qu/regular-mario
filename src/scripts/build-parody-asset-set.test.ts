import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  decodeRgbaPng,
  readPngPixel,
} from "../../tests/support/png-test-support";
import { runNodeScript } from "../../tests/support/script-test-support";
import {
  AssetSetOrigin,
  validateAssetSetDescriptor,
  type AssetSetDescriptor,
} from "../engine/domain/content-sets";

const scriptPath = resolve("scripts/build-parody-asset-set.mjs");
const outDir = resolve(".cache/user-levels/test-parody-asset-set/castaway");

const requiredPlayerStateKeys = [
  "small-idle",
  "small-walk",
  "small-run",
  "small-jump",
  "small-fall",
  "small-climb",
  "powered-idle",
  "powered-walk",
  "powered-run",
  "powered-jump",
  "powered-fall",
  "powered-climb",
  "recovering-idle",
  "recovering-walk",
  "recovering-run",
  "recovering-jump",
  "recovering-fall",
  "recovering-climb",
];

describe("build-parody-asset-set", () => {
  it("produces an original authored asset set with full player state coverage", async () => {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const result = await runNodeScript(scriptPath, ["--out-dir", outDir]);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);

    const descriptor = JSON.parse(
      await readFile(resolve(outDir, "asset-set.json"), "utf8"),
    ) as AssetSetDescriptor & {
      readonly reactionStyle: string;
      readonly playerSprite: { stateSprites: Record<string, unknown> };
      readonly actorSprites: Record<
        string,
        { stateSprites: Record<string, unknown> }
      >;
    };

    expect(descriptor.origin).toBe(AssetSetOrigin.Authored);
    expect(descriptor.reactionStyle).toBe("exaggerated");

    for (const key of requiredPlayerStateKeys) {
      expect(descriptor.playerSprite.stateSprites[key]).toBeDefined();
    }
    expect(
      descriptor.actorSprites["vglc-smb-enemy"]?.stateSprites["walk-left"],
    ).toBeDefined();

    // The descriptor validates through the shared content-set model.
    const validation = validateAssetSetDescriptor(descriptor);
    expect(validation.ok).toBe(true);
  });

  it("draws original opaque sprites (the castaway is not blank)", async () => {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    await runNodeScript(scriptPath, ["--out-dir", outDir]);

    const idle = decodeRgbaPng(
      await readFile(resolve(outDir, "castaway-idle.png")),
    );
    expect(idle.width).toBe(16);
    expect(idle.height).toBe(16);

    let opaquePixels = 0;
    for (let y = 0; y < idle.height; y += 1) {
      for (let x = 0; x < idle.width; x += 1) {
        if (readPngPixel(idle, x, y)[3] > 0) {
          opaquePixels += 1;
        }
      }
    }
    expect(opaquePixels).toBeGreaterThan(40);
  });
});

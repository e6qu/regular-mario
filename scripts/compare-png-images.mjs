#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

function printUsage() {
  console.log(`Usage:
  node scripts/compare-png-images.mjs --actual <png> --expected <png>

Optional crop rectangles:
  --actual-rect x,y,width,height
  --expected-rect x,y,width,height
  --output-json .cache/user-levels/<report>.json

The compared rectangles must have identical dimensions. The script reports exact
pixel equality plus aggregate RGB/RGBA deltas. It does not store source images.`);
}

function readOption(optionName) {
  const index = process.argv.indexOf(optionName);

  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

function requireOption(optionName) {
  const value = readOption(optionName);

  if (value === undefined) {
    throw new Error(`${optionName} is required.`);
  }

  return value;
}

function parseRect(value, label) {
  if (value === undefined) {
    return undefined;
  }

  const parts = value.split(",").map((part) => Number(part));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0) ||
    parts[2] <= 0 ||
    parts[3] <= 0
  ) {
    throw new Error(`${label} must be x,y,width,height with positive size.`);
  }

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

async function makeDataUrl(filePath) {
  const bytes = await readFile(resolve(filePath));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function compareImages({
  actualPath,
  expectedPath,
  actualRect,
  expectedRect,
}) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    return await page.evaluate(
      async ({
        actualUrl,
        expectedUrl,
        actualRectInput,
        expectedRectInput,
      }) => {
        async function loadImage(url) {
          const image = new globalThis.Image();
          image.src = url;
          await image.decode();
          return image;
        }

        function resolveRect(image, rectInput, label) {
          const rect =
            rectInput === undefined
              ? {
                  x: 0,
                  y: 0,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                }
              : rectInput;

          if (
            rect.x + rect.width > image.naturalWidth ||
            rect.y + rect.height > image.naturalHeight
          ) {
            throw new Error(`${label} rectangle exceeds image dimensions.`);
          }

          return rect;
        }

        function readPixels(image, rect) {
          const canvas = globalThis.document.createElement("canvas");
          canvas.width = rect.width;
          canvas.height = rect.height;
          const context = canvas.getContext("2d", { willReadFrequently: true });

          if (context === null) {
            throw new Error("Canvas 2D context is unavailable.");
          }

          context.drawImage(
            image,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            0,
            0,
            rect.width,
            rect.height,
          );

          return context.getImageData(0, 0, rect.width, rect.height).data;
        }

        const actualImage = await loadImage(actualUrl);
        const expectedImage = await loadImage(expectedUrl);
        const actual = resolveRect(actualImage, actualRectInput, "actual");
        const expected = resolveRect(
          expectedImage,
          expectedRectInput,
          "expected",
        );

        if (
          actual.width !== expected.width ||
          actual.height !== expected.height
        ) {
          throw new Error(
            `Compared rectangles differ: actual ${actual.width}x${actual.height}, expected ${expected.width}x${expected.height}.`,
          );
        }

        const actualPixels = readPixels(actualImage, actual);
        const expectedPixels = readPixels(expectedImage, expected);
        let differentPixels = 0;
        let totalAbsoluteChannelDelta = 0;
        let maxPixelChannelDelta = 0;
        let totalAlphaDelta = 0;

        for (let index = 0; index < actualPixels.length; index += 4) {
          const redDelta = Math.abs(
            actualPixels[index] - expectedPixels[index],
          );
          const greenDelta = Math.abs(
            actualPixels[index + 1] - expectedPixels[index + 1],
          );
          const blueDelta = Math.abs(
            actualPixels[index + 2] - expectedPixels[index + 2],
          );
          const alphaDelta = Math.abs(
            actualPixels[index + 3] - expectedPixels[index + 3],
          );
          const pixelMaxDelta = Math.max(
            redDelta,
            greenDelta,
            blueDelta,
            alphaDelta,
          );

          if (pixelMaxDelta > 0) {
            differentPixels += 1;
          }

          totalAbsoluteChannelDelta += redDelta + greenDelta + blueDelta;
          totalAlphaDelta += alphaDelta;
          maxPixelChannelDelta = Math.max(maxPixelChannelDelta, pixelMaxDelta);
        }

        const totalPixels = actual.width * actual.height;

        return {
          actualImage: {
            width: actualImage.naturalWidth,
            height: actualImage.naturalHeight,
          },
          expectedImage: {
            width: expectedImage.naturalWidth,
            height: expectedImage.naturalHeight,
          },
          actualRect: actual,
          expectedRect: expected,
          comparedPixels: totalPixels,
          exactMatchingPixels: totalPixels - differentPixels,
          differentPixels,
          differentPixelRatio: differentPixels / totalPixels,
          meanAbsoluteRgbChannelDelta:
            totalAbsoluteChannelDelta / (totalPixels * 3),
          meanAbsoluteAlphaDelta: totalAlphaDelta / totalPixels,
          maxPixelChannelDelta,
        };
      },
      {
        actualUrl: await makeDataUrl(actualPath),
        expectedUrl: await makeDataUrl(expectedPath),
        actualRectInput: actualRect,
        expectedRectInput: expectedRect,
      },
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  const actualPath = requireOption("--actual");
  const expectedPath = requireOption("--expected");
  const report = await compareImages({
    actualPath,
    expectedPath,
    actualRect: parseRect(readOption("--actual-rect"), "--actual-rect"),
    expectedRect: parseRect(readOption("--expected-rect"), "--expected-rect"),
  });
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  const outputJsonPath = readOption("--output-json");

  if (outputJsonPath !== undefined) {
    await writeFile(resolve(outputJsonPath), reportJson);
  }

  console.log(reportJson);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

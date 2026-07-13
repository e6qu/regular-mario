import { Buffer } from "node:buffer";

import { ActorRole } from "../../src/engine/domain/level-spec";
import {
  PlayerDefeatReason,
  PlayerFinishReason,
} from "../../src/engine/simulation/player-outcome";
import { PlayerReactionKind } from "../../src/engine/simulation/player-reaction";
import {
  EnemyContactResponseKind,
  EnemySideContactSide,
} from "../../src/engine/simulation/enemy-contact-response";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "../../src/engine/simulation/movement-model";
import { SpawnedActorCollectionMode } from "../../src/engine/simulation/interactive-block-state";
import { expect, test, type Page } from "@playwright/test";

import type { BrowserSimulationSnapshot } from "../../src/shell/browser-debug-api";
import { PlayerVitalityKind } from "../../src/engine/simulation/player-vitality";
import { PlayerOutcomeKind } from "../../src/engine/simulation/player-outcome";
import { finishRouteLevelInput } from "../../src/engine/levels/finish-route-level";

type BrowserErrorRecorder = {
  readonly pageErrors: Error[];
  readonly consoleErrors: string[];
};

type CanvasRegion = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

// A region of the given size centred on the canvas (horizontally centred,
// placed in the upper third), resolved against the canvas backing store inside
// the page so no separate dimension read is needed.
type CanvasCenteredRegion = {
  readonly centered: true;
  readonly width: number;
  readonly height: number;
};

type SimulationSnapshotWaitCondition =
  | "camera-scrolled"
  | "enemy-contact-latched"
  | "enemy-defeated-by-projectile"
  | "enemy-only-contact"
  | "enemy-stomped"
  | "finished-outcome"
  | "hazard-only-contact"
  | "item-collected"
  | "coin-block-spawned"
  | "pipe-entered"
  | "powered-enemy-recovery"
  | "power-up-collected"
  | "projectile-fired"
  | "retried-initial";

type SimulationSnapshotWaitOptions = {
  readonly condition: SimulationSnapshotWaitCondition;
  readonly initialPlayerX: number;
  readonly initialPlayerY: number;
};

type BrowserInputChord = "down" | "fast-right-jump" | "retry" | "run-right";

type BrowserTestSpriteEntry = {
  readonly source: {
    readonly kind: "url";
    readonly url: string;
  };
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly stateSprites?: Readonly<Record<string, BrowserTestSpriteEntry>>;
};

const expectedInitialPlayerPosition = {
  x: 16,
  y: 56,
} as const;
const firstAuthoredBrowserUrl = "/?browserLevel=first-authored";
const localVglcSmbManifestRoute =
  "**/__user-level-cache/vglc-smb-browser-demo/remote-manifest.json";
const localVglcSmbLevelOneRoute =
  "**/__user-level-cache/vglc-smb-browser-demo/levels/mario-1-1.json";
const localVglcSmbLevelTwoRoute =
  "**/__user-level-cache/vglc-smb-browser-demo/levels/mario-1-2.json";
const localVglcSmbPlayerSpriteRoute =
  "**/__user-level-cache/vglc-smb-browser-demo/assets/player.png";
const expectedEnemySideContactKnockbackSpeed = 150;
const expectedDamageRecoveryKnockbackFrames = 18;
const expectedDamageRecoveryInvulnerabilityFrames = 120;
const transparentOnePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3fNwAAAABJRU5ErkJggg==",
  "base64",
);
const redOnePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const compatibilityConformanceMessage =
  "The runtime does not support horizontal screen wrapping.";

function watchBrowserErrors(page: Page): BrowserErrorRecorder {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  return {
    pageErrors,
    consoleErrors,
  };
}

function makeJsonInputFile(
  name: string,
  value: unknown,
): {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
} {
  return {
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  };
}

function makeRepeatedTileRow(
  tileId: string,
  widthTiles: number,
): readonly string[] {
  return Array.from({ length: widthTiles }, () => tileId);
}

async function expectVisibleImportError(
  page: Page,
  message: string,
): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Import errors" }),
  ).toBeVisible();
  await expect(page.getByText(message)).toBeVisible();
}

function makeOnePixelSpriteEntry(): BrowserTestSpriteEntry {
  return {
    source: { kind: "url", url: "assets/player.png" },
    frame: { x: 0, y: 0, width: 1, height: 1 },
  };
}

function makeOnePixelStateSpriteEntries(
  stateKeys: readonly string[],
): Record<string, BrowserTestSpriteEntry> {
  return Object.fromEntries(
    stateKeys.map((stateKey) => [stateKey, makeOnePixelSpriteEntry()]),
  );
}

function makeLocalVglcSmbLevelEntry(name: string, url: string): unknown {
  return {
    name,
    format: "original-json",
    source: { kind: "url", url },
  };
}

const selectableContentSetAssets = [
  { id: "rom-smb", title: "SMB (ROM)", selectable: true },
  { id: "castaway-parody", title: "Shabby Castaway", selectable: true },
];
const selectableContentSetMaps = [
  { id: "official-smb", title: "SMB 1-1", selectable: true },
];

async function routeContentSetIndex(page: Page, body: unknown): Promise<void> {
  await page.route(
    "**/__user-level-cache/content-sets-index.json",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}

async function routeLocalVglcSmbManifest(
  page: Page,
  manifest: unknown,
): Promise<void> {
  await page.route(localVglcSmbManifestRoute, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(manifest),
    });
  });
}

async function routeLocalVglcSmbLevelOne(page: Page): Promise<void> {
  await page.route(localVglcSmbLevelOneRoute, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(finishRouteLevelInput),
    });
  });
}

async function routeLocalVglcSmbLevelTwo(page: Page): Promise<void> {
  await page.route(localVglcSmbLevelTwoRoute, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(finishRouteLevelInput),
    });
  });
}

async function routeLocalVglcSmbPlayerSprite(page: Page): Promise<void> {
  await page.route(localVglcSmbPlayerSpriteRoute, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: redOnePixelPng,
    });
  });
}

async function routeLocalVglcSmbAssetSet(page: Page): Promise<void> {
  const spriteEntry = makeOnePixelSpriteEntry();
  await routeLocalVglcSmbManifest(page, {
    version: "1",
    playerSprite: {
      ...spriteEntry,
      transparentColor: {
        red: 255,
        green: 0,
        blue: 0,
        tolerance: 0,
      },
      stateSprites: makeOnePixelStateSpriteEntries([
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
      ]),
    },
    tileSprites: {
      gate: spriteEntry,
      grass: spriteEntry,
      sky: spriteEntry,
    },
    actorSprites: {
      "open-gate": spriteEntry,
    },
    levels: [
      makeLocalVglcSmbLevelEntry(
        "vglc-smb-processed-mario-1-1",
        "levels/mario-1-1.json",
      ),
      makeLocalVglcSmbLevelEntry(
        "vglc-smb-processed-mario-1-2",
        "levels/mario-1-2.json",
      ),
    ],
  });
  await routeLocalVglcSmbLevelOne(page);
  await routeLocalVglcSmbLevelTwo(page);
  await routeLocalVglcSmbPlayerSprite(page);
}

// Reads a region expressed directly in canvas backing-store pixels. A
// `centered` region is resolved against the canvas dimensions inside the page,
// so no extra dimension round-trip is required.
async function readRawCanvasRegionData(
  page: Page,
  region: CanvasRegion | CanvasCenteredRegion,
): Promise<readonly number[]> {
  const canvas = page.locator("canvas");

  return await canvas.evaluate((element, targetRegion) => {
    const canvasElement = element as HTMLCanvasElement;
    const scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = canvasElement.width;
    scratchCanvas.height = canvasElement.height;
    const renderingContext = scratchCanvas.getContext("2d");

    if (renderingContext === null) {
      throw new Error("Canvas rendering context is unavailable.");
    }

    renderingContext.drawImage(canvasElement, 0, 0);
    const resolvedRegion =
      "centered" in targetRegion
        ? {
            x: canvasElement.width / 2 - targetRegion.width / 2,
            y: canvasElement.height / 3 - targetRegion.height / 2,
            width: targetRegion.width,
            height: targetRegion.height,
          }
        : targetRegion;
    return Array.from(
      renderingContext.getImageData(
        Math.round(resolvedRegion.x),
        Math.round(resolvedRegion.y),
        Math.max(1, Math.round(resolvedRegion.width)),
        Math.max(1, Math.round(resolvedRegion.height)),
      ).data,
    );
  }, region);
}

// Reads an enemy's centre-body canvas pixel together with its live simulation
// position in ONE page evaluate. Doing both atomically avoids the race where a
// patrolling enemy keeps moving between a snapshot read and a later pixel read —
// which made the "moves authored enemy patrols" check flaky.
async function readEnemyBodyPixel(
  page: Page,
  entityId: string,
): Promise<{
  readonly bodyPixelCount: number;
  readonly enemyX: number;
  readonly enemyY: number;
  readonly frameIndex: number;
}> {
  return await page.evaluate((id) => {
    const api = window.__originalBrowserPlatformerDebug;
    if (api === undefined) {
      throw new Error("Debug API is unavailable.");
    }
    const snapshot = api.getSimulationSnapshot();
    const enemy = snapshot.actors.actors.find(
      (candidate) => candidate.entityId === id,
    );
    if (enemy === undefined) {
      throw new Error(`Rendered actor ${id} is missing.`);
    }
    const canvasElement = document.querySelector("canvas");
    if (canvasElement === null) {
      throw new Error("Game canvas is missing.");
    }
    const camera = snapshot.camera;
    const scale =
      (canvasElement.width / camera.viewportWidthPixels) * camera.zoom;
    // Sample a box over the enemy body centre (~6px in from its origin).
    // Counting matching pixels across a generous box — rather than one exact
    // pixel — tolerates the drift between the simulation snapshot and the last
    // rendered canvas frame (which, under load, can lag several frames), so a
    // moving patrol can't slip the sample.
    const halfExtent = Math.max(4, Math.round(scale * 8));
    const centreX = Math.round(
      (enemy.pixelPosition.x + 6 - camera.worldViewX) * scale,
    );
    const centreY = Math.round(
      (enemy.pixelPosition.y + 6 - camera.worldViewY) * scale,
    );
    const scratch = document.createElement("canvas");
    scratch.width = canvasElement.width;
    scratch.height = canvasElement.height;
    const context = scratch.getContext("2d");
    if (context === null) {
      throw new Error("Canvas rendering context is unavailable.");
    }
    context.drawImage(canvasElement, 0, 0);
    const size = halfExtent * 2 + 1;
    const data = context.getImageData(
      centreX - halfExtent,
      centreY - halfExtent,
      size,
      size,
    ).data;
    // The enemy body renders as rgb(31, 41, 55).
    let bodyPixelCount = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (
        Math.abs((data[offset] ?? 0) - 31) <= 4 &&
        Math.abs((data[offset + 1] ?? 0) - 41) <= 4 &&
        Math.abs((data[offset + 2] ?? 0) - 55) <= 4
      ) {
        bodyPixelCount += 1;
      }
    }
    return {
      bodyPixelCount,
      enemyX: enemy.pixelPosition.x,
      enemyY: enemy.pixelPosition.y,
      frameIndex: snapshot.frameIndex,
    };
  }, entityId);
}

// Reads a region expressed in world pixels, mapping it through the camera
// (zoom + scroll, times any device-pixel-ratio) into canvas pixels so callers
// stay zoom-agnostic.
// Counts non-transparent pixels over the whole canvas backing store. The count
// happens inside the page and only the number crosses the bridge — serializing
// a full-canvas pixel array (millions of ints) would block the Node side long
// enough for the uncapped headless game loop to run far ahead of the initial
// frame under test.
async function countVisibleCanvasPixels(page: Page): Promise<number> {
  const canvas = page.locator("canvas");

  return await canvas.evaluate((element) => {
    const source = element as HTMLCanvasElement;
    const { width, height } = source;
    const sink = document.createElement("canvas");
    sink.width = width;
    sink.height = height;
    const context = sink.getContext("2d");

    if (context === null) {
      throw new Error("Canvas 2D context is unavailable for pixel sampling.");
    }

    context.drawImage(source, 0, 0);
    const pixelData = context.getImageData(0, 0, width, height).data;
    let visiblePixelCount = 0;

    for (let index = 3; index < pixelData.length; index += 4) {
      if (pixelData[index]! > 0) {
        visiblePixelCount += 1;
      }
    }

    return visiblePixelCount;
  });
}

function countDarkPixels(imageData: readonly number[]): number {
  let darkPixelCount = 0;

  for (let index = 0; index < imageData.length; index += 4) {
    const red = imageData[index];
    const green = imageData[index + 1];
    const blue = imageData[index + 2];
    const alpha = imageData[index + 3];

    if (
      red === undefined ||
      green === undefined ||
      blue === undefined ||
      alpha === undefined
    ) {
      throw new Error("Canvas image data is malformed.");
    }

    if (alpha > 0 && red <= 40 && green <= 50 && blue <= 70) {
      darkPixelCount += 1;
    }
  }

  return darkPixelCount;
}

async function readSimulationSnapshot(
  page: Page,
): Promise<BrowserSimulationSnapshot> {
  // The game boots asynchronously (it loads the default skin first), so wait for
  // the debug API before reading rather than assuming a synchronous boot.
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  return await page.evaluate(() => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      throw new Error("Browser simulation debug API is unavailable.");
    }

    return debugApi.getSimulationSnapshot();
  });
}

async function expectBootsAndPlaysLevel(
  page: Page,
  options: {
    readonly url: string;
    readonly widthTiles: number;
    readonly heightTiles: number;
    readonly worldWidthPixels: number;
    readonly worldHeightPixels: number;
  },
): Promise<void> {
  const browserErrors = watchBrowserErrors(page);

  await page.goto(options.url);
  await expect(page.locator("canvas")).toBeVisible();

  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.level.widthTiles).toBe(options.widthTiles);
  expect(initialSnapshot.level.heightTiles).toBe(options.heightTiles);
  expect(initialSnapshot.camera.worldWidthPixels).toBe(
    options.worldWidthPixels,
  );
  expect(initialSnapshot.camera.worldHeightPixels).toBe(
    options.worldHeightPixels,
  );
  expect(initialSnapshot.playerOutcome.kind).toBe("active");

  await expectRightwardKeyboardMovement(page, initialSnapshot);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
}

async function waitForPlayerMovedRight(
  page: Page,
  startingPositionX: number,
): Promise<void> {
  await waitForPlayerPositionXGreaterThan(page, startingPositionX);
}

async function expectRightwardKeyboardMovement(
  page: Page,
  initialSnapshot: BrowserSimulationSnapshot,
): Promise<BrowserSimulationSnapshot> {
  await page.keyboard.down("ArrowRight");
  await waitForPlayerMovedRight(page, initialSnapshot.player.position.x);
  await page.keyboard.up("ArrowRight");

  const movedSnapshot = await readSimulationSnapshot(page);
  expect(movedSnapshot.player.position.x).toBeGreaterThan(
    initialSnapshot.player.position.x,
  );

  return movedSnapshot;
}

async function waitForPlayerPositionXGreaterThan(
  page: Page,
  targetPositionX: number,
): Promise<void> {
  await page.waitForFunction((positionX) => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      return false;
    }

    return debugApi.getSimulationSnapshot().player.position.x > positionX;
  }, targetPositionX);
}

async function waitForSimulationFrame(
  page: Page,
  minimumFrameIndex: number,
): Promise<void> {
  await page.waitForFunction((targetFrameIndex) => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      return false;
    }

    return debugApi.getSimulationSnapshot().frameIndex >= targetFrameIndex;
  }, minimumFrameIndex);
}

async function waitForSimulationSnapshotAtFrame(
  page: Page,
  targetFrameIndex: number,
): Promise<BrowserSimulationSnapshot> {
  const snapshotHandle = await page.waitForFunction((frameIndex) => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      return false;
    }

    const snapshot = debugApi.getSimulationSnapshot();

    if (snapshot.frameIndex !== frameIndex) {
      return false;
    }

    return snapshot;
  }, targetFrameIndex);
  const snapshot = await snapshotHandle.jsonValue();

  if (snapshot === false) {
    throw new Error("Expected simulation snapshot was not captured.");
  }

  return snapshot;
}

async function waitForSimulationSnapshotCondition(
  page: Page,
  condition: SimulationSnapshotWaitCondition,
): Promise<BrowserSimulationSnapshot> {
  const waitOptions: SimulationSnapshotWaitOptions = {
    condition,
    initialPlayerX: expectedInitialPlayerPosition.x,
    initialPlayerY: expectedInitialPlayerPosition.y,
  };

  const snapshotHandle = await page.waitForFunction(
    (options) => {
      const debugApi = window.__originalBrowserPlatformerDebug;

      if (debugApi === undefined) {
        return false;
      }

      const snapshot = debugApi.getSimulationSnapshot();
      // Capture the snapshot at the exact frame the condition first matches. The
      // simulation keeps advancing frameIndex after a defeat, so re-reading a
      // fresh snapshot afterwards would race transient per-frame fields (e.g.
      // enemyContactResponse.frameIndex) against the current frame.
      const matchesCondition = ((): boolean => {
        switch (options.condition) {
          case "camera-scrolled":
            return snapshot.camera.worldViewX > 1;
          case "enemy-defeated-by-projectile":
            return (
              snapshot.enemies.defeatedEnemyEntityIds.includes("beetle-1") &&
              snapshot.projectiles.projectiles.some((projectile) =>
                projectile.id.startsWith("projectile-"),
              )
            );
          case "enemy-only-contact":
            return (
              snapshot.enemies.contactedEnemyEntityIds.includes("beetle-2") &&
              snapshot.enemies.defeatedEnemyEntityIds.length === 0 &&
              !snapshot.levelContacts.hazard
            );
          case "enemy-contact-latched":
            // The shell latches the first enemy-contact frame, so this matches a
            // stable observation rather than racing the one-frame live event.
            return (
              snapshot.lastEnemyContact !== undefined &&
              snapshot.lastEnemyContact.enemies.contactedEnemyEntityIds.includes(
                "beetle-2",
              )
            );
          case "enemy-stomped":
            return (
              snapshot.enemies.defeatedEnemyEntityIds.includes("beetle-1") &&
              snapshot.enemies.contactedEnemyEntityIds.length === 0 &&
              !snapshot.levelContacts.hazard
            );
          case "finished-outcome":
            // Serialized into the browser; enum values equal these strings at runtime.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
            return snapshot.playerOutcome.kind === "finished";
          case "hazard-only-contact":
            return (
              snapshot.levelContacts.hazard &&
              !snapshot.levelContacts.goal &&
              snapshot.enemies.contactedEnemyEntityIds.length === 0 &&
              snapshot.enemies.defeatedEnemyEntityIds.length === 0
            );
          case "item-collected":
            return snapshot.collectibles.collectedItemEntityIds.includes(
              "shard-1",
            );
          case "coin-block-spawned":
            return (
              snapshot.collectibles.collectedCoinEntityIds.includes(
                "spawned-1-2",
              ) &&
              snapshot.spawnedActors.spawnedActors.some(
                (actor) => actor.entityId === "spawned-1-2",
              )
            );
          case "pipe-entered":
            return (
              snapshot.pipeEntry.phase === "entering" &&
              snapshot.pipeEntry.pipeEntityId === "warp-pipe-1"
            );
          case "powered-enemy-recovery":
            return (
              // Serialized into the browser; enum values equal these strings at runtime.
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
              snapshot.playerVitality.kind === "recovering" &&
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
              snapshot.playerOutcome.kind === "active" &&
              !snapshot.levelContacts.hazard
            );
          case "power-up-collected":
            return (
              snapshot.powerUps.collectedPowerUpEntityIds.includes("spark-1") &&
              // Serialized into the browser; enum values equal these strings at runtime.
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
              snapshot.playerVitality.kind === "powered"
            );
          case "projectile-fired":
            return snapshot.projectiles.projectiles.length > 0;
          case "retried-initial":
            return (
              // Serialized into the browser; enum values equal these strings at runtime.
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
              snapshot.playerOutcome.kind === "active" &&
              // The camera view is back at the level's left edge. With the zoom
              // convention `scrollX` is negative at rest, so check the visible
              // world rectangle's left edge instead (a tiny float at rest).
              snapshot.camera.worldViewX < 1 &&
              snapshot.player.position.x === options.initialPlayerX &&
              snapshot.player.position.y === options.initialPlayerY &&
              !snapshot.outcomeFeedback.visible
            );
          default:
            throw new Error(
              `Unknown simulation snapshot wait condition: ${String(options.condition)}`,
            );
        }
      })();

      return matchesCondition ? snapshot : false;
    },
    waitOptions,
    // A generous timeout so the wait survives requestAnimationFrame throttling
    // when many browser specs run in parallel and starve the sim's frame loop
    // (the condition is met in well under a second when the page runs at speed).
    { timeout: 60000 },
  );

  const snapshot = await snapshotHandle.jsonValue();

  if (snapshot === false) {
    throw new Error("Expected simulation snapshot condition was not captured.");
  }

  return snapshot;
}

async function pressBrowserInputChord(
  page: Page,
  chord: BrowserInputChord,
): Promise<void> {
  await waitForBrowserGameReady(page);
  switch (chord) {
    case "down":
      await page.keyboard.down("ArrowDown");
      break;
    case "fast-right-jump":
      await page.keyboard.down("Shift");
      await page.keyboard.down("ArrowRight");
      await page.keyboard.down("Space");
      break;
    case "retry":
      await page.keyboard.down("r");
      await page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            code: "KeyR",
            key: "r",
          }),
        );
      });
      break;
    case "run-right":
      await page.keyboard.down("Shift");
      await page.keyboard.down("ArrowRight");
      break;
    default:
      throw new Error(`Unknown browser input chord: ${String(chord)}`);
  }
}

async function releaseBrowserInputChord(
  page: Page,
  chord: BrowserInputChord,
): Promise<void> {
  switch (chord) {
    case "down":
      await page.keyboard.up("ArrowDown");
      break;
    case "fast-right-jump":
      await page.keyboard.up("Space");
      await page.keyboard.up("ArrowRight");
      await page.keyboard.up("Shift");
      break;
    case "retry":
      await page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent("keyup", {
            code: "KeyR",
            key: "r",
          }),
        );
      });
      await page.keyboard.up("r");
      break;
    case "run-right":
      await page.keyboard.up("ArrowRight");
      await page.keyboard.up("Shift");
      break;
    default:
      throw new Error(`Unknown browser input chord: ${String(chord)}`);
  }
}

async function countOutcomeFeedbackDarkPixels(page: Page): Promise<number> {
  // The feedback text is a screen-space overlay centred in the upper third of
  // the window (independent of the world camera), so sample raw canvas pixels
  // there rather than mapping a world region. A single centred read keeps the
  // timing perturbation before the first gameplay input minimal.
  return countDarkPixels(
    await readRawCanvasRegionData(page, {
      centered: true,
      width: 500,
      height: 80,
    }),
  );
}

async function retryToInitialSimulationSnapshot(
  page: Page,
): Promise<BrowserSimulationSnapshot> {
  await pressBrowserInputChord(page, "retry");
  try {
    return await waitForSimulationSnapshotCondition(page, "retried-initial");
  } finally {
    await releaseBrowserInputChord(page, "retry");
  }
}

async function waitForPoweredRouteRetrySnapshot(
  page: Page,
): Promise<BrowserSimulationSnapshot> {
  await page.waitForFunction(() => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      return false;
    }

    const snapshot = debugApi.getSimulationSnapshot();

    return (
      // Serialized into the browser; enum values equal these strings at runtime.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      snapshot.playerVitality.kind === "powered" &&
      snapshot.enemies.contactedEnemyEntityIds.length === 0 &&
      snapshot.enemies.defeatedEnemyEntityIds.length === 0 &&
      !snapshot.outcomeFeedback.visible
    );
  });

  return await readSimulationSnapshot(page);
}

function expectHiddenOutcomeFeedback(
  snapshot: BrowserSimulationSnapshot,
): void {
  expect(snapshot.outcomeFeedback).toEqual({
    visible: false,
    text: "",
  });
}

function expectNoBrowserErrors(browserErrors: BrowserErrorRecorder): void {
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
}

type RightwardAccelerationSnapshot = {
  readonly movedSnapshot: BrowserSimulationSnapshot;
  readonly velocityGainPerFrame: number;
};

async function measureRightwardAcceleration(
  page: Page,
  runHeld: boolean,
): Promise<RightwardAccelerationSnapshot> {
  await page.goto(firstAuthoredBrowserUrl);

  const initialSnapshot = await readSimulationSnapshot(page);

  if (runHeld) {
    await page.keyboard.down("Shift");
  }

  await page.keyboard.down("ArrowRight");
  const movedSnapshot = await waitForSimulationSnapshotAtFrame(
    page,
    initialSnapshot.frameIndex + 6,
  );

  await page.keyboard.up("ArrowRight");

  if (runHeld) {
    await page.keyboard.up("Shift");
  }

  return {
    movedSnapshot,
    velocityGainPerFrame:
      (movedSnapshot.player.velocity.x - initialSnapshot.player.velocity.x) /
      (movedSnapshot.frameIndex - initialSnapshot.frameIndex),
  };
}

// The game boots asynchronously (it loads the default skin first) and only
// attaches its key listeners once booted, so a key pressed earlier is lost.
// Wait for the debug API before driving input.
async function waitForBrowserGameReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
}

async function withRunRightHeld<T>(
  page: Page,
  action: () => Promise<T>,
): Promise<T> {
  await waitForBrowserGameReady(page);
  await page.keyboard.down("Shift");
  await page.keyboard.down("ArrowRight");

  try {
    return await action();
  } finally {
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("Shift");
  }
}

function requireRenderedActorSnapshot(
  snapshot: BrowserSimulationSnapshot,
  entityId: string,
): BrowserSimulationSnapshot["actors"]["actors"][number] {
  const actor = snapshot.actors.actors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (actor === undefined) {
    throw new Error(`Rendered actor ${entityId} is missing.`);
  }

  return actor;
}

function expectAuthoredLevelRendered(
  snapshot: BrowserSimulationSnapshot,
): void {
  expect(snapshot.level.widthTiles).toBe(32);
  expect(snapshot.level.heightTiles).toBe(6);
  expect(snapshot.level.tileSizePixels).toBe(16);
  expect(snapshot.level.renderedTileCount).toBe(192);
  expect(snapshot.level.collisionCounts).toEqual({
    empty: 153,
    solid: 37,
    breakable: 0,
    "solid-hazard": 0,
    hazard: 1,
    spring: 0,
    goal: 1,
    interactive: 0,
    hidden: 0,
  });
}

function expectAuthoredActorsRendered(
  snapshot: BrowserSimulationSnapshot,
): void {
  expect(snapshot.actors.renderedActorCount).toBe(4);
  expect(
    Object.fromEntries(
      Object.entries(snapshot.actors.roleCounts).filter(([, count]) => count),
    ),
  ).toEqual({
    [ActorRole.Enemy]: 2,
    [ActorRole.Item]: 1,
    [ActorRole.Exit]: 1,
  });
  const firstEnemyActor = snapshot.actors.actors.find(
    (actor) => actor.entityId === "beetle-1",
  );
  const secondEnemyActor = snapshot.actors.actors.find(
    (actor) => actor.entityId === "beetle-2",
  );

  expect(firstEnemyActor).toMatchObject({
    entityId: "beetle-1",
    actorId: "beetle",
    role: ActorRole.Enemy,
    tilePosition: {
      y: 4,
    },
    pixelPosition: {
      y: 66,
    },
  });
  expect(firstEnemyActor?.entityId).toBe("beetle-1");
  expect(secondEnemyActor).toMatchObject({
    entityId: "beetle-2",
    actorId: "beetle",
    role: ActorRole.Enemy,
    tilePosition: {
      x: 0,
      y: 4,
    },
    pixelPosition: {
      y: 66,
    },
  });
  expect(secondEnemyActor?.pixelPosition.x).toBeGreaterThanOrEqual(2);
  expect(secondEnemyActor?.pixelPosition.x).toBeLessThan(3);
  expect(
    snapshot.actors.actors.filter((actor) => actor.role !== ActorRole.Enemy),
  ).toEqual([
    {
      entityId: "shard-1",
      actorId: "star-shard",
      role: ActorRole.Item,
      tilePosition: {
        x: 4,
        y: 1,
      },
      pixelPosition: {
        x: 66,
        y: 18,
      },
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      role: ActorRole.Exit,
      tilePosition: {
        x: 30,
        y: 2,
      },
      pixelPosition: {
        x: 482,
        y: 34,
      },
    },
  ]);
}

test("boots the browser game shell", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto(firstAuthoredBrowserUrl);

  const canvas = page.locator("canvas");

  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();

  const nonBlankPixelCount = await countVisibleCanvasPixels(page);

  expect(nonBlankPixelCount).toBeGreaterThan(0);

  const snapshot = await readSimulationSnapshot(page);
  expectAuthoredLevelRendered(snapshot);
  expectAuthoredActorsRendered(snapshot);
  // The canvas fills the window and the camera applies an integer zoom, so the
  // viewport pixel size is window-dependent; assert the stable level dimensions
  // and that the visible world span is narrower than the level (so it scrolls).
  expect(snapshot.camera.worldWidthPixels).toBe(512);
  expect(snapshot.camera.worldHeightPixels).toBe(96);
  const visibleWorldWidth =
    snapshot.camera.viewportWidthPixels / snapshot.camera.zoom;
  expect(snapshot.camera.worldWidthPixels).toBeGreaterThan(visibleWorldWidth);
  expect(snapshot.levelContacts).toEqual({
    hazard: false,
    goal: false,
  });
  expect(snapshot.playerVitality).toEqual({
    kind: "small",
  });
  expect(snapshot.playerInvincibility).toEqual({
    collectedInvincibilityEntityIds: [],
    remainingFrames: 0,
  });
  expect(snapshot.playerOutcome).toEqual({
    kind: "active",
  });
  expect(snapshot.collectibles).toEqual({
    collectedCoinEntityIds: [],
    collectedItemEntityIds: [],
    collectedExtraLifeEntityIds: [],
  });
  expect(snapshot.enemies).toEqual({
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: [],
  });
  expect(snapshot.enemyContactResponse).toEqual({
    kind: "none",
  });
  expect(snapshot.outcomeFeedback).toEqual({
    visible: false,
    text: "",
  });
  await page.evaluate(() => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      throw new Error("Browser simulation debug API is unavailable.");
    }

    const mutableSnapshot = debugApi.getSimulationSnapshot() as unknown as {
      readonly playerOutcome: {
        kind: string;
      };
      readonly playerVitality: {
        kind: string;
      };
      readonly collectibles: {
        readonly collectedCoinEntityIds: string[];
        readonly collectedItemEntityIds: string[];
        readonly collectedExtraLifeEntityIds: string[];
      };
      readonly enemies: {
        readonly contactedEnemyEntityIds: string[];
        readonly defeatedEnemyEntityIds: string[];
      };
      readonly enemyContactResponse: {
        kind: string;
        enemyEntityId?: string;
      };
    };
    mutableSnapshot.playerOutcome.kind = "corrupted";
    mutableSnapshot.playerVitality.kind = "powered";
    mutableSnapshot.collectibles.collectedItemEntityIds.push("shard-1");
    mutableSnapshot.enemies.contactedEnemyEntityIds.push("beetle-1");
    mutableSnapshot.enemies.defeatedEnemyEntityIds.push("beetle-2");
    mutableSnapshot.enemyContactResponse.kind = "side-contact";
    mutableSnapshot.enemyContactResponse.enemyEntityId = "beetle-1";
  });
  const postMutationSnapshot = await readSimulationSnapshot(page);
  expect(postMutationSnapshot.playerOutcome).toEqual({
    kind: "active",
  });
  expect(postMutationSnapshot.playerVitality).toEqual({
    kind: "small",
  });
  expect(postMutationSnapshot.playerInvincibility).toEqual({
    collectedInvincibilityEntityIds: [],
    remainingFrames: 0,
  });
  expect(postMutationSnapshot.collectibles).toEqual({
    collectedCoinEntityIds: [],
    collectedItemEntityIds: [],
    collectedExtraLifeEntityIds: [],
  });
  expect(postMutationSnapshot.enemies).toEqual({
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: [],
  });
  expect(postMutationSnapshot.enemyContactResponse).toEqual({
    kind: "none",
  });
  expect(snapshot.player.position.x).toBeGreaterThanOrEqual(0);
  expect(snapshot.player.position.y).toBeGreaterThanOrEqual(0);
  expect(
    snapshot.player.position.x + snapshot.player.collider.width,
  ).toBeLessThanOrEqual(
    snapshot.level.widthTiles * snapshot.level.tileSizePixels,
  );
  expect(
    snapshot.player.position.y + snapshot.player.collider.height,
  ).toBeLessThanOrEqual(
    snapshot.level.heightTiles * snapshot.level.tileSizePixels,
  );
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

// These three exercise the pre-menu dev behaviour where visiting "/" auto-booted
// the local VGLC SMB cache. The start menu now owns "/" (you pick an asset set
// and press PLAY), so this auto-boot path no longer exists. They are skipped
// rather than deleted pending a decision to remove the dev path for good; the
// sprite-coverage validation they relied on still runs on PLAY and is covered by
// default-vglc-smb-sprite-coverage.test.ts.
test.skip("defaults to the local VGLC SMB asset set when its cache manifest is available", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);
  await routeLocalVglcSmbAssetSet(page);

  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();

  const snapshot = await readSimulationSnapshot(page);
  expect(snapshot.level.widthTiles).toBe(finishRouteLevelInput.widthTiles);
  expect(snapshot.level.heightTiles).toBe(finishRouteLevelInput.heightTiles);
  expect(snapshot.playerOutcome.kind).toBe(PlayerOutcomeKind.Active);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test.skip("default local VGLC SMB asset set requires a player sprite", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);
  await routeLocalVglcSmbManifest(page, {
    version: "1",
    levels: [
      makeLocalVglcSmbLevelEntry(
        "vglc-smb-processed-mario-1-1",
        "levels/mario-1-1.json",
      ),
    ],
  });

  await page.goto("/");

  await expectVisibleImportError(
    page,
    "Default VGLC SMB dev mode requires an ignored local playerSprite asset fragment. Add .cache/user-levels/vglc-smb-assets/fragment.json with playerSprite, then run pnpm run prepare:vglc-smb-browser-demo.",
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test.skip("default local VGLC SMB asset set requires complete selected-level sprites", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);
  await routeLocalVglcSmbManifest(page, {
    version: "1",
    playerSprite: makeOnePixelSpriteEntry(),
    levels: [
      makeLocalVglcSmbLevelEntry(
        "vglc-smb-processed-mario-1-1",
        "levels/mario-1-1.json",
      ),
    ],
  });
  await routeLocalVglcSmbLevelOne(page);
  await routeLocalVglcSmbPlayerSprite(page);

  await page.goto("/");

  await expectVisibleImportError(
    page,
    "Default VGLC SMB dev mode requires ignored local tileSprites for every tile id in the selected level. Missing tileSprites: gate, grass, sky.",
  );
  await expect(
    page.getByText(
      "Default VGLC SMB dev mode requires ignored local actorSprites for every rendered actor id in the selected level. Missing actorSprites: open-gate.",
    ),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("moves authored enemy patrols while simulation is active", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto(firstAuthoredBrowserUrl);
  // Wait until the simulation has stepped a few frames so the enemy is active
  // and drawn before the first pixel sample.
  await page.waitForFunction(() => {
    const api = window.__originalBrowserPlatformerDebug;
    return api !== undefined && api.getSimulationSnapshot().frameIndex > 5;
  });
  // The enemy is active at its start position (its rendering is covered by the
  // screenshot-regression tests).
  const initial = await readEnemyBodyPixel(page, "beetle-1");

  // Let the patrol run, then confirm it has moved left — read atomically so the
  // moving enemy can't slip between the position and the sample.
  const movedSnapshot = await waitForSimulationSnapshotAtFrame(
    page,
    initial.frameIndex + 80,
  );
  expect(movedSnapshot.playerOutcome).toEqual({ kind: "active" });

  const moved = await readEnemyBodyPixel(page, "beetle-1");
  expect(moved.enemyX).toBeLessThan(initial.enemyX);
  expect(moved.enemyY).toBe(initial.enemyY);
  expectNoBrowserErrors(browserErrors);
});

test("advances simulation from browser keyboard input", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto(firstAuthoredBrowserUrl);

  const initialSnapshot = await readSimulationSnapshot(page);

  await page.keyboard.down("ArrowRight");
  await waitForPlayerMovedRight(page, initialSnapshot.player.position.x);

  const movedSnapshot = await readSimulationSnapshot(page);

  await page.keyboard.up("ArrowRight");

  expect(movedSnapshot.frameIndex).toBeGreaterThan(initialSnapshot.frameIndex);
  expect(movedSnapshot.player.position.x).toBeGreaterThan(
    initialSnapshot.player.position.x,
  );
  expect(movedSnapshot.player.movement.horizontal).toBe(
    HorizontalMovementState.Walking,
  );
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("exposes accessible game surface and scales in a narrow viewport", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto(firstAuthoredBrowserUrl);

  // The game surface (which holds the canvas) carries the application role.
  const gameSurface = page.getByRole("application");
  await expect(gameSurface).toHaveAttribute(
    "aria-label",
    "Original platformer game",
  );

  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("role", "img");
  await expect(canvas).toHaveAttribute(
    "aria-label",
    "Original platformer game canvas",
  );
  await expect(canvas).toHaveAttribute("tabindex", "0");

  const box = await canvas.boundingBox();

  if (box === null) {
    throw new Error("Canvas bounding box is unavailable.");
  }

  expect(box.width).toBeLessThanOrEqual(320);
  expect(box.height).toBeGreaterThan(0);

  const initialSnapshot = await readSimulationSnapshot(page);
  // With RESIZE the canvas fills the (narrow) window at native resolution and
  // the camera applies an integer zoom, so the viewport spans the window rather
  // than a fixed upscaled canvas.
  expect(initialSnapshot.camera.viewportWidthPixels).toBe(320);
  expect(initialSnapshot.camera.viewportHeightPixels).toBe(240);
  expect(initialSnapshot.camera.zoom).toBeGreaterThanOrEqual(2);

  await expectRightwardKeyboardMovement(page, initialSnapshot);
  expectNoBrowserErrors(browserErrors);
});

test("boots and plays an imported VGLC text level", async ({ page }) => {
  await expectBootsAndPlaysLevel(page, {
    url: "/?browserLevel=imported-vglc-route",
    widthTiles: 8,
    heightTiles: 6,
    worldWidthPixels: 128,
    worldHeightPixels: 96,
  });
});

test("boots and plays the cavern route level", async ({ page }) => {
  await expectBootsAndPlaysLevel(page, {
    url: "/?browserLevel=cavern-route",
    widthTiles: 24,
    heightTiles: 6,
    worldWidthPixels: 384,
    worldHeightPixels: 96,
  });
});

test("boots and plays the flying enemy route fixture", async ({ page }) => {
  await expectBootsAndPlaysLevel(page, {
    url: "/?browserLevel=flying-enemy-route",
    widthTiles: 12,
    heightTiles: 6,
    worldWidthPixels: 192,
    worldHeightPixels: 96,
  });
});

test("boots and plays the chasing enemy route fixture", async ({ page }) => {
  await expectBootsAndPlaysLevel(page, {
    url: "/?browserLevel=chasing-enemy-route",
    widthTiles: 12,
    heightTiles: 6,
    worldWidthPixels: 192,
    worldHeightPixels: 96,
  });
});

test("boots and plays the armored enemy route fixture", async ({ page }) => {
  await expectBootsAndPlaysLevel(page, {
    url: "/?browserLevel=armored-enemy-route",
    widthTiles: 12,
    heightTiles: 6,
    worldWidthPixels: 192,
    worldHeightPixels: 96,
  });
});

test("bumps a coin block and reports the spawned coin popup", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=coin-block-route");
  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.collectibles.collectedCoinEntityIds).toEqual([]);
  expect(initialSnapshot.coinCount).toBe(0);
  expect(initialSnapshot.extraLifeCount).toBe(0);

  await page.keyboard.down("Space");
  let spawnedSnapshot: BrowserSimulationSnapshot;
  try {
    spawnedSnapshot = await waitForSimulationSnapshotCondition(
      page,
      "coin-block-spawned",
    );
  } finally {
    await page.keyboard.up("Space");
  }

  expect(spawnedSnapshot.collectibles.collectedCoinEntityIds).toEqual([
    "spawned-1-2",
  ]);
  expect(spawnedSnapshot.coinCount).toBe(1);
  expect(spawnedSnapshot.score).toBe(100);
  expect(spawnedSnapshot.spawnedActors.spawnedActors[0]).toMatchObject({
    entityId: "spawned-1-2",
    actorId: "coin",
    role: ActorRole.Coin,
    velocityX: 0,
    velocityY: -48,
    collectionMode: SpawnedActorCollectionMode.OnSpawn,
  });

  await page.waitForFunction(() => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      return false;
    }

    const spawnedCoin = debugApi
      .getSimulationSnapshot()
      .spawnedActors.spawnedActors.find(
        (actor) => actor.entityId === "spawned-1-2",
      );

    return spawnedCoin !== undefined && !spawnedCoin.active;
  });

  const expiredSnapshot = await readSimulationSnapshot(page);
  expect(expiredSnapshot.collectibles.collectedCoinEntityIds).toEqual([
    "spawned-1-2",
  ]);
  expect(expiredSnapshot.spawnedActors.spawnedActors[0]?.active).toBe(false);
  expectNoBrowserErrors(browserErrors);
});

test("shows a head-bonk reaction and emits its sound when bonking a block", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=coin-block-route");
  await readSimulationSnapshot(page);

  // The head-bonk sound is a single-frame event. The headless game loop runs
  // uncapped (hundreds of fps), so coarse polling from the test side skips many
  // frames and can miss it. Record it per animation frame inside the page so the
  // transient event is observed reliably.
  await page.evaluate(() => {
    const recorderWindow = window as typeof window & {
      __headBonkSoundObserved?: boolean;
    };
    recorderWindow.__headBonkSoundObserved = false;
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      throw new Error("Browser simulation debug API is unavailable.");
    }

    const recordSoundEvents = (): void => {
      if (
        debugApi.getSimulationSnapshot().lastSoundEvents.includes("head-bonk")
      ) {
        recorderWindow.__headBonkSoundObserved = true;
      }

      requestAnimationFrame(recordSoundEvents);
    };

    requestAnimationFrame(recordSoundEvents);
  });

  let bonked = false;
  for (let attempt = 0; attempt < 200 && !bonked; attempt += 1) {
    await page.keyboard.down("Space");
    await page.waitForTimeout(16);
    await page.keyboard.up("Space");
    const reaction = (await readSimulationSnapshot(page)).playerReaction;
    if (reaction.kind === PlayerReactionKind.HeadBonk) {
      bonked = true;
    }
  }

  expect(bonked).toBe(true);
  const snapshot = await readSimulationSnapshot(page);
  expect(snapshot.playerReaction.kind).toBe(PlayerReactionKind.HeadBonk);
  expect(snapshot.playerReaction.remainingFrames).toBeGreaterThan(0);
  const headBonkSoundObserved = await page.evaluate(
    () =>
      (window as typeof window & { __headBonkSoundObserved?: boolean })
        .__headBonkSoundObserved === true,
  );
  expect(headBonkSoundObserved).toBe(true);
  expectNoBrowserErrors(browserErrors);
});

test("populates the content-set dropdowns from the served index", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await routeContentSetIndex(page, {
    assetSets: [
      ...selectableContentSetAssets,
      { id: "broken", title: "Broken", selectable: false },
    ],
    mapSets: selectableContentSetMaps,
  });

  await page.goto("/?importAssets=1");

  const assetSelect = page.locator('select[aria-label="Asset set"]');
  await assetSelect.waitFor({ state: "visible" });
  const assetOptions = await assetSelect.locator("option").allTextContents();
  const mapOptions = await page
    .locator('select[aria-label="Map set"] option')
    .allTextContents();

  // Selectable sets appear; the non-selectable "broken" set is filtered out.
  expect(assetOptions).toEqual(["SMB (ROM)", "Shabby Castaway"]);
  expect(mapOptions).toEqual(["SMB 1-1"]);
  expectNoBrowserErrors(browserErrors);
});

test("default route shows a start menu with three auto-populated dropdowns", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await routeContentSetIndex(page, {
    assetSets: selectableContentSetAssets,
    mapSets: selectableContentSetMaps,
  });

  await page.goto("/");

  const assetSelect = page.locator('select[aria-label="Asset set"]');
  await assetSelect.waitFor({ state: "visible" });
  expect(await assetSelect.locator("option").allTextContents()).toEqual([
    "SMB (ROM)",
    "Shabby Castaway",
  ]);
  expect(
    await page.locator('select[aria-label="Map set"] option').allTextContents(),
  ).toEqual(["SMB 1-1"]);
  // The game-mode dropdown offers the classic/shabby choice.
  const modeOptions = await page
    .locator('select[aria-label="Game mode"] option')
    .allTextContents();
  expect(modeOptions).toHaveLength(2);
  await expect(page.getByRole("button", { name: /PLAY/ })).toBeVisible();
  expectNoBrowserErrors(browserErrors);
});

test("boots and plays the combined enemy gauntlet route fixture", async ({
  page,
}) => {
  await expectBootsAndPlaysLevel(page, {
    url: "/?browserLevel=enemy-gauntlet-route",
    widthTiles: 30,
    heightTiles: 7,
    worldWidthPixels: 480,
    worldHeightPixels: 112,
  });
});

test("fires a projectile and defeats an enemy from the projectile route fixture", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=projectile-route");

  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.playerVitality).toEqual({
    kind: "fire",
  });
  expect(initialSnapshot.projectiles.projectiles).toEqual([]);

  await page.keyboard.down("x");
  try {
    const firedSnapshot = await waitForSimulationSnapshotCondition(
      page,
      "projectile-fired",
    );

    expect(firedSnapshot.projectiles.projectiles.length).toBeGreaterThan(0);

    const defeatedSnapshot = await waitForSimulationSnapshotCondition(
      page,
      "enemy-defeated-by-projectile",
    );

    expect(defeatedSnapshot.enemies.defeatedEnemyEntityIds).toContain(
      "beetle-1",
    );
    expect(defeatedSnapshot.playerOutcome).toEqual({
      kind: "active",
    });
  } finally {
    await page.keyboard.up("x");
  }

  expectNoBrowserErrors(browserErrors);
});

test("launches a jump from browser keyboard input", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto(firstAuthoredBrowserUrl);

  const initialSnapshot = await readSimulationSnapshot(page);

  await page.keyboard.down("Space");
  await page.waitForFunction((startingPositionY) => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      return false;
    }

    const snapshot = debugApi.getSimulationSnapshot();

    return snapshot.player.position.y < startingPositionY;
  }, initialSnapshot.player.position.y);

  const jumpingSnapshot = await readSimulationSnapshot(page);

  await page.keyboard.up("Space");

  expect(jumpingSnapshot.player.position.y).toBeLessThan(
    initialSnapshot.player.position.y,
  );
  expect(jumpingSnapshot.player.velocity.y).toBeLessThan(0);
  expect(jumpingSnapshot.player.movement.vertical).toBe(
    VerticalMovementState.Jumping,
  );
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("accelerates faster while browser run input is held", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);

  const walkingMeasurement = await measureRightwardAcceleration(page, false);
  const runningMeasurement = await measureRightwardAcceleration(page, true);

  expect(walkingMeasurement.movedSnapshot.player.movement.horizontal).toBe(
    "walking",
  );
  expect(runningMeasurement.movedSnapshot.player.movement.horizontal).toBe(
    "running",
  );
  expect(runningMeasurement.velocityGainPerFrame).toBeGreaterThan(
    walkingMeasurement.velocityGainPerFrame,
  );
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("reports authored enemy-only contact from browser movement", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  // Drive the run deterministically (hold left from frame 0) via the replay-
  // input hook, so the player always contacts the same enemy at the same frame
  // regardless of wall-clock timing under parallel-suite load. Real keyboard
  // input would engage the moving enemies at a variable sim-time.
  await page.addInitScript(() => {
    window.__marioReplayInputs = Array.from({ length: 600 }, () => ({
      horizontal: "left",
      jumpPressed: false,
      runHeld: false,
      firePressed: false,
      upHeld: false,
      downHeld: false,
    }));
  });
  await page.goto(firstAuthoredBrowserUrl);
  await expect(page.locator("canvas")).toBeVisible();

  // Read the shell-latched contact-frame observation, which is stable once the
  // contact happens — the live one-frame event can be skipped by the game's
  // fixed-step catch-up (it then pauses on death).
  const enemySnapshot = await waitForSimulationSnapshotCondition(
    page,
    "enemy-contact-latched",
  );
  const contact = enemySnapshot.lastEnemyContact;
  if (contact === undefined) {
    throw new Error("Expected a latched enemy-contact observation.");
  }

  expect(contact.levelContacts).toEqual({
    hazard: false,
    goal: false,
  });
  expect(contact.enemies).toEqual({
    contactedEnemyEntityIds: ["beetle-2"],
    defeatedEnemyEntityIds: [],
  });
  const contactResponse = contact.enemyContactResponse;
  if (contactResponse.kind !== EnemyContactResponseKind.SideContact) {
    throw new Error(
      `Expected a side-contact enemy response, received ${String(contactResponse.kind)}.`,
    );
  }
  expect(contactResponse.enemyEntityId).toBe("beetle-2");
  expect(contactResponse.contactSide).toBe(EnemySideContactSide.Left);
  expect(contactResponse.velocity).toEqual({
    x: expectedEnemySideContactKnockbackSpeed,
  });
  expect(contactResponse.frameIndex).toBeGreaterThan(0);
  expect(contactResponse.frameIndex).toBeLessThanOrEqual(contact.frameIndex);
  expect(contact.playerVelocityX).toBe(expectedEnemySideContactKnockbackSpeed);
  expect(contact.playerOutcome).toEqual({
    kind: "defeated",
    reason: PlayerDefeatReason.EnemyContact,
  });
  // The defeat feedback is shown (and rendered) once the contact defeats the
  // small player; it persists into the death pause.
  expect(enemySnapshot.playerVitality).toEqual({
    kind: "small",
  });
  expect(enemySnapshot.outcomeFeedback).toEqual({
    visible: true,
    text: "Opponent contact — Press R",
  });
  expect(await countOutcomeFeedbackDarkPixels(page)).toBeGreaterThan(0);

  // Stop the deterministic drive before the retry, so the retried run starts
  // idle at the level top instead of immediately walking back into the enemy.
  await page.evaluate(() => {
    // An empty log makes the game fall back to real keyboard input (idle here).
    window.__marioReplayInputs = [];
  });

  const retriedSnapshot = await retryToInitialSimulationSnapshot(page);

  expect(retriedSnapshot.enemies).toEqual({
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: [],
  });
  expect(retriedSnapshot.enemyContactResponse).toEqual({
    kind: "none",
  });
  expect(retriedSnapshot.playerVitality).toEqual({
    kind: "small",
  });
  expectHiddenOutcomeFeedback(retriedSnapshot);

  expectNoBrowserErrors(browserErrors);
});

test("reports powered enemy side-contact recovery from explicit browser fixture", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=powered-contact-route");

  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.playerVitality).toEqual({
    kind: "powered",
  });

  await page.keyboard.down("ArrowLeft");
  try {
    const recoverySnapshot = await waitForSimulationSnapshotCondition(
      page,
      "enemy-only-contact",
    );

    expect(recoverySnapshot.levelContacts).toEqual({
      hazard: false,
      goal: false,
    });
    expect(recoverySnapshot.playerOutcome).toEqual({
      kind: "active",
    });
    expect(recoverySnapshot.playerVitality.kind).toBe("recovering");
    if (
      recoverySnapshot.playerVitality.kind !== PlayerVitalityKind.Recovering
    ) {
      throw new Error("Expected powered contact to start recovery.");
    }
    expect(recoverySnapshot.playerVitality.sourceEnemyEntityId).toBe(
      "beetle-2",
    );
    expect(recoverySnapshot.playerVitality.contactSide).toBe("left");
    expect(recoverySnapshot.playerVitality.startFrameIndex).toBeGreaterThan(0);
    expect(recoverySnapshot.playerVitality.startFrameIndex).toBeLessThanOrEqual(
      recoverySnapshot.frameIndex,
    );
    expect(
      recoverySnapshot.playerVitality.remainingKnockbackFrames,
    ).toBeGreaterThanOrEqual(0);
    expect(
      recoverySnapshot.playerVitality.remainingKnockbackFrames,
    ).toBeLessThanOrEqual(expectedDamageRecoveryKnockbackFrames);
    expect(
      recoverySnapshot.playerVitality.remainingInvulnerabilityFrames,
    ).toBeGreaterThan(0);
    expect(
      recoverySnapshot.playerVitality.remainingInvulnerabilityFrames,
    ).toBeLessThanOrEqual(expectedDamageRecoveryInvulnerabilityFrames);
    expect(recoverySnapshot.enemyContactResponse).toEqual({
      kind: "side-contact",
      enemyEntityId: "beetle-2",
      contactSide: EnemySideContactSide.Left,
      frameIndex: recoverySnapshot.frameIndex,
      velocity: {
        x: expectedEnemySideContactKnockbackSpeed,
      },
    });
    expect(recoverySnapshot.player.velocity.x).toBe(
      expectedEnemySideContactKnockbackSpeed,
    );
    expect(recoverySnapshot.outcomeFeedback).toEqual({
      visible: false,
      text: "",
    });

    await page.waitForFunction((snapshotFrameIndex) => {
      const debugApi = window.__originalBrowserPlatformerDebug;

      if (debugApi === undefined) {
        return false;
      }

      const snapshot = debugApi.getSimulationSnapshot();

      return (
        snapshot.frameIndex > snapshotFrameIndex &&
        // Serialized into the browser; enum values equal these strings at runtime.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        snapshot.playerVitality.kind === "recovering" &&
        snapshot.player.position.x > 16
      );
    }, recoverySnapshot.frameIndex);
  } finally {
    await page.keyboard.up("ArrowLeft");
  }

  await pressBrowserInputChord(page, "retry");
  let retriedSnapshot: BrowserSimulationSnapshot;
  try {
    retriedSnapshot = await waitForPoweredRouteRetrySnapshot(page);
  } finally {
    await releaseBrowserInputChord(page, "retry");
  }

  expect(retriedSnapshot.playerVitality).toEqual({
    kind: "powered",
  });
  expect(retriedSnapshot.playerOutcome).toEqual({
    kind: "active",
  });
  expectHiddenOutcomeFeedback(retriedSnapshot);

  expectNoBrowserErrors(browserErrors);
});

test("reports authored hazard-only contact from explicit browser fixture", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=hazard-only-feedback");

  const hazardSnapshot = await withRunRightHeld(page, async () => {
    return await waitForSimulationSnapshotCondition(
      page,
      "hazard-only-contact",
    );
  });

  expect(hazardSnapshot.levelContacts).toEqual({
    hazard: true,
    goal: false,
  });
  expect(hazardSnapshot.enemies).toEqual({
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: [],
  });
  expect(hazardSnapshot.playerOutcome).toEqual({
    kind: "defeated",
    reason: PlayerDefeatReason.HazardContact,
  });
  expect(hazardSnapshot.outcomeFeedback).toEqual({
    visible: true,
    text: "Hazard contact — Press R",
  });

  const retriedSnapshot = await retryToInitialSimulationSnapshot(page);

  expect(retriedSnapshot.levelContacts).toEqual({
    hazard: false,
    goal: false,
  });
  expect(retriedSnapshot.playerOutcome).toEqual({
    kind: "active",
  });
  expectHiddenOutcomeFeedback(retriedSnapshot);

  expectNoBrowserErrors(browserErrors);
});

test("reports an authored enemy stomp from explicit browser fixture", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=enemy-stomp-route");
  const initialSnapshot = await readSimulationSnapshot(page);
  const stompEnemy = requireRenderedActorSnapshot(initialSnapshot, "beetle-1");

  // Walk right toward the beetle, then jump to stomp it. The ROM-rate jump
  // arc carries ~80px at walking speed, so the hop starts that far out.
  await page.keyboard.down("ArrowRight");
  await waitForPlayerPositionXGreaterThan(
    page,
    stompEnemy.pixelPosition.x - 78,
  );
  await page.keyboard.down("Space");
  let stompSnapshot: BrowserSimulationSnapshot;
  try {
    // The snapshot condition confirms the stomp (the defeated-enemy assertions
    // below verify it removed the enemy); pixel-level rendering is covered by
    // the screenshot-regression tests.
    stompSnapshot = await waitForSimulationSnapshotCondition(
      page,
      "enemy-stomped",
    );
  } finally {
    await page.keyboard.up("Space");
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("Shift");
  }

  expect(stompSnapshot.enemies).toEqual({
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: ["beetle-1"],
  });
  expect(stompSnapshot.levelContacts).toEqual({
    hazard: false,
    goal: false,
  });
  expect(stompSnapshot.playerOutcome).toEqual({
    kind: "active",
  });
  expect(stompSnapshot.player.velocity.y).toBeLessThan(0);
  expect(stompSnapshot.player.movement.vertical).toBe(
    VerticalMovementState.Jumping,
  );
  expectNoBrowserErrors(browserErrors);
});

test("collects an authored item actor from browser movement", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto(firstAuthoredBrowserUrl);
  // Wait for the game to boot before driving input (its key listeners attach on
  // boot). Item rendering is covered by the screenshot-regression tests.
  await readSimulationSnapshot(page);

  // Walk right toward the item, then jump to reach it.
  await page.keyboard.down("ArrowRight");
  await waitForPlayerPositionXGreaterThan(page, 40);
  await page.keyboard.down("Space");
  await page.waitForFunction(() => {
    const debugApi = window.__originalBrowserPlatformerDebug;
    if (debugApi === undefined) {
      return false;
    }
    return debugApi
      .getSimulationSnapshot()
      .collectibles.collectedItemEntityIds.includes("shard-1");
  });
  await page.keyboard.up("Space");
  await page.keyboard.up("ArrowRight");

  const collectedSnapshot = await readSimulationSnapshot(page);

  expect(collectedSnapshot.collectibles).toEqual({
    collectedCoinEntityIds: [],
    collectedItemEntityIds: ["shard-1"],
    collectedExtraLifeEntityIds: [],
  });
  expect(collectedSnapshot.score).toBe(100);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("powers up from an authored collectible and survives enemy contact", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=power-up-route");
  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.playerVitality).toEqual({
    kind: "small",
  });
  expect(initialSnapshot.powerUps).toEqual({
    collectedPowerUpEntityIds: [],
  });

  await pressBrowserInputChord(page, "run-right");
  let poweredSnapshot: BrowserSimulationSnapshot;
  try {
    poweredSnapshot = await waitForSimulationSnapshotCondition(
      page,
      "power-up-collected",
    );
  } finally {
    await releaseBrowserInputChord(page, "run-right");
  }

  expect(poweredSnapshot.powerUps).toEqual({
    collectedPowerUpEntityIds: ["spark-1"],
  });
  expect(poweredSnapshot.playerVitality).toEqual({
    kind: "powered",
  });
  expect(poweredSnapshot.playerOutcome).toEqual({
    kind: "active",
  });

  await pressBrowserInputChord(page, "run-right");
  let recoverySnapshot: BrowserSimulationSnapshot;
  try {
    recoverySnapshot = await waitForSimulationSnapshotCondition(
      page,
      "powered-enemy-recovery",
    );
  } finally {
    await releaseBrowserInputChord(page, "run-right");
  }

  expect(recoverySnapshot.playerVitality.kind).toBe("recovering");
  expect(recoverySnapshot.playerOutcome).toEqual({
    kind: "active",
  });
  expect(recoverySnapshot.outcomeFeedback).toEqual({
    visible: false,
    text: "",
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("scrolls the camera as browser movement reaches the wider authored level", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto(firstAuthoredBrowserUrl);

  await pressBrowserInputChord(page, "fast-right-jump");
  try {
    const scrolledSnapshot = await waitForSimulationSnapshotCondition(
      page,
      "camera-scrolled",
    );

    // The camera has scrolled right: its visible world rectangle no longer
    // starts at the level's left edge, and it stays within the level bounds.
    expect(scrolledSnapshot.camera.worldViewX).toBeGreaterThan(1);
    const visibleWorldWidth =
      scrolledSnapshot.camera.viewportWidthPixels /
      scrolledSnapshot.camera.zoom;
    expect(scrolledSnapshot.camera.worldViewX).toBeLessThanOrEqual(
      scrolledSnapshot.camera.worldWidthPixels - visibleWorldWidth + 1,
    );
    expect(scrolledSnapshot.player.position.x).toBeGreaterThan(100);
  } finally {
    await releaseBrowserInputChord(page, "fast-right-jump");
  }

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("boots additional co-op bot players from the players query parameter", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  // ?players=N runs N same-screen players: the primary plus N-1 co-op bots.
  await page.goto("/?browserLevel=first-authored&players=4");
  const snapshot = await readSimulationSnapshot(page);
  expect(snapshot.playerCount).toBe(4);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("co-op players are taken out during play (enemy contact and a dying player's body parts)", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  // Five same-screen players cluster at the spawn near the enemy. Driving the
  // primary in bursts them apart: co-op players are removed as they touch the
  // enemy and as the primary's explosion parts strike them, so the count falls.
  await page.goto("/?browserLevel=first-authored&players=5");
  await page.waitForFunction(
    () => window.__originalBrowserPlatformerDebug !== undefined,
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () =>
      window.__originalBrowserPlatformerDebug!.getSimulationSnapshot()
        .playerCount < 5,
    undefined,
    { timeout: 10000 },
  );
  await page.keyboard.up("ArrowRight");

  expect(browserErrors.pageErrors).toEqual([]);
});

test("boots the player in the Luigi costume when requested", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  // The ?character=luigi query parameter dresses the player in the Luigi
  // costume (a green/blue palette swap of the same frames).
  await page.goto("/?browserLevel=first-authored&character=luigi");
  const snapshot = await readSimulationSnapshot(page);
  expect(snapshot.playerCharacter).toBe("luigi");

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("shakes the screen with a ground quake after a hard landing", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  // The hard-landing route drops the runner off a high ledge onto a floor about
  // seven blocks below — well past the two-block threshold — so the landing
  // fires a ground quake (screen shake), which the debug snapshot counts.
  await page.goto("/?browserLevel=hard-landing-route");

  await pressBrowserInputChord(page, "run-right");
  try {
    const quakedSnapshot = await page.waitForFunction(
      () => {
        const debugApi = window.__originalBrowserPlatformerDebug;
        if (debugApi === undefined) {
          return false;
        }
        const snapshot = debugApi.getSimulationSnapshot();
        return snapshot.groundQuakeCount > 0 ? snapshot : false;
      },
      undefined,
      { timeout: 60000 },
    );
    const snapshot = await quakedSnapshot.jsonValue();
    if (snapshot === false) {
      throw new Error("Expected a ground quake after the hard landing.");
    }
    expect(snapshot.groundQuakeCount).toBeGreaterThan(0);
    // The runner survived the fall (it landed on the floor, not a pit).
    expect(snapshot.playerOutcome.kind).toBe("active");
  } finally {
    await releaseBrowserInputChord(page, "run-right");
  }

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("finishes at the finish-route goal and retries with reset", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  // Use the finish-route level which has a flat layout with a ground-level gate.
  await page.goto("/?browserLevel=finish-route");
  const activeFeedbackPixelCount = await countOutcomeFeedbackDarkPixels(page);

  // Run right and jump toward the gate.
  await page.keyboard.down("Shift");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("Space");

  const finishedSnapshot = await waitForSimulationSnapshotCondition(
    page,
    "finished-outcome",
  );

  try {
    await page.keyboard.up("Space");
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("Shift");

    expect(finishedSnapshot.playerOutcome).toEqual({
      kind: "finished",
      reason: PlayerFinishReason.GoalContact,
    });
    expect(finishedSnapshot.outcomeFeedback).toEqual({
      visible: true,
      text: "Gate reached — Press R",
    });
    expect(await countOutcomeFeedbackDarkPixels(page)).toBeGreaterThan(
      activeFeedbackPixelCount,
    );
  } finally {
    await page.keyboard.up("Space");
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("Shift");
  }

  await pressBrowserInputChord(page, "retry");
  try {
    const retriedSnapshot = await waitForSimulationSnapshotCondition(
      page,
      "retried-initial",
    );

    expect(retriedSnapshot.outcomeFeedback).toEqual({
      visible: false,
      text: "",
    });
    expect(retriedSnapshot.playerOutcome).toEqual({
      kind: "active",
    });
  } finally {
    await releaseBrowserInputChord(page, "retry");
  }

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("reports authored hazard tile contact from browser movement", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=hazard-only-feedback");

  const hazardSnapshot = await withRunRightHeld(page, async () => {
    const hazardSnapshotHandle = await page.waitForFunction(() => {
      const debugApi = window.__originalBrowserPlatformerDebug;

      if (debugApi === undefined) {
        return false;
      }

      const snapshot = debugApi.getSimulationSnapshot();

      if (!snapshot.levelContacts.hazard) {
        return false;
      }

      return snapshot;
    });

    const observedSnapshot = await hazardSnapshotHandle.jsonValue();

    if (observedSnapshot === false) {
      throw new Error("Hazard contact snapshot was not captured.");
    }

    return observedSnapshot;
  });
  await waitForSimulationFrame(page, hazardSnapshot.frameIndex + 5);
  const frozenSnapshot = await readSimulationSnapshot(page);
  const defeatedFeedbackPixelCount = await countOutcomeFeedbackDarkPixels(page);

  expect(hazardSnapshot.levelContacts).toEqual({
    hazard: true,
    goal: false,
  });
  expect(hazardSnapshot.playerOutcome.kind).toBe(PlayerOutcomeKind.Defeated);
  expect(
    ["hazard-contact", "hazard-and-enemy-contact"].includes(
      (hazardSnapshot.playerOutcome as { reason: string }).reason,
    ),
  ).toBe(true);
  expect(hazardSnapshot.outcomeFeedback.visible).toBe(true);
  expect(hazardSnapshot.outcomeFeedback.text).toMatch(/^Hazard/);
  expect(defeatedFeedbackPixelCount).toBeGreaterThan(0);
  expect(hazardSnapshot.player.position.x).toBeGreaterThanOrEqual(60);
  expect(hazardSnapshot.player.position.x).toBeLessThanOrEqual(80);
  expect(frozenSnapshot.frameIndex).toBeGreaterThan(hazardSnapshot.frameIndex);
  expect(frozenSnapshot.player).toEqual(hazardSnapshot.player);
  expect(frozenSnapshot.levelContacts).toEqual(hazardSnapshot.levelContacts);
  expect(frozenSnapshot.playerOutcome).toEqual(hazardSnapshot.playerOutcome);
  expect(frozenSnapshot.outcomeFeedback).toEqual(
    hazardSnapshot.outcomeFeedback,
  );

  await pressBrowserInputChord(page, "retry");
  try {
    await waitForSimulationSnapshotCondition(page, "retried-initial");
  } finally {
    await releaseBrowserInputChord(page, "retry");
  }
  const retriedSnapshot = await readSimulationSnapshot(page);

  expect(retriedSnapshot.frameIndex).toBeLessThan(frozenSnapshot.frameIndex);
  expect(retriedSnapshot.levelContacts).toEqual({
    hazard: false,
    goal: false,
  });
  expect(retriedSnapshot.playerOutcome).toEqual({
    kind: "active",
  });
  expect(retriedSnapshot.enemies).toEqual({
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: [],
  });
  expect(retriedSnapshot.outcomeFeedback).toEqual({
    visible: false,
    text: "",
  });
  // The retry's active state + reset frame index (asserted above) confirm the
  // respawn; the player's rendering is covered by the screenshot-regression
  // tests. The feedback text clearing is still a meaningful pixel check.
  expect(await countOutcomeFeedbackDarkPixels(page)).toBeLessThan(
    defeatedFeedbackPixelCount,
  );
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("enters a pipe and warps the player to the target tile", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=pipe-route");
  await expect(page.locator("canvas")).toBeVisible();

  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.player.position).toEqual({ x: 16, y: 56 });

  await page.keyboard.down("ArrowRight");
  await waitForPlayerPositionXGreaterThan(page, 58);
  await page.keyboard.up("ArrowRight");

  await pressBrowserInputChord(page, "down");
  try {
    await waitForSimulationSnapshotCondition(page, "pipe-entered");
  } finally {
    await releaseBrowserInputChord(page, "down");
  }

  const enteredSnapshot = await readSimulationSnapshot(page);
  expect(enteredSnapshot.pipeEntry.phase).toBe("entering");
  expect(enteredSnapshot.pipeEntry.pipeEntityId).toBe("warp-pipe-1");
  expect(enteredSnapshot.pipeEntry.targetTilePosition).toEqual({ x: 7, y: 4 });

  await waitForSimulationFrame(
    page,
    enteredSnapshot.frameIndex + enteredSnapshot.pipeEntry.remainingFrames + 5,
  );

  const warpedSnapshot = await readSimulationSnapshot(page);
  expect(warpedSnapshot.player.position.x).toBe(112);
  expect(warpedSnapshot.playerOutcome.kind).toBe("active");

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("warps through a pipe to a named target level", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=warp-route");
  await expect(page.locator("canvas")).toBeVisible();

  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.level.widthTiles).toBe(10);

  await page.keyboard.down("ArrowRight");
  await waitForPlayerPositionXGreaterThan(page, 58);
  await page.keyboard.up("ArrowRight");

  await pressBrowserInputChord(page, "down");
  try {
    // Entering the pipe loads the (wider) underground target level.
    await expect
      .poll(async () => (await readSimulationSnapshot(page)).level.widthTiles)
      .toBe(12);
  } finally {
    await releaseBrowserInputChord(page, "down");
  }

  const warpedSnapshot = await readSimulationSnapshot(page);
  expect(warpedSnapshot.level.widthTiles).toBe(12);
  // The player is dropped at the pipe's destination tile (x=2).
  expect(Math.round(warpedSnapshot.player.position.x / 16)).toBe(2);
  expect(warpedSnapshot.playerOutcome.kind).toBe("active");

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("advances to the next level after finishing in a multi-level sequence", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=multi-level-route");
  await expect(page.locator("canvas")).toBeVisible();

  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.levelProgression.levelIndex).toBe(0);
  expect(initialSnapshot.levelProgression.levelCount).toBe(2);

  await page.keyboard.down("ArrowRight");
  await waitForSimulationSnapshotCondition(page, "finished-outcome");
  await page.keyboard.up("ArrowRight");

  const finishedSnapshot = await readSimulationSnapshot(page);
  expect(finishedSnapshot.playerOutcome.kind).toBe("finished");
  expect(finishedSnapshot.levelProgression.levelIndex).toBe(0);
  // The flagpole finish awards a goal-height score, so the total is non-zero.
  expect(finishedSnapshot.score).toBeGreaterThan(0);

  await page.waitForFunction(() => {
    const debugApi = window.__originalBrowserPlatformerDebug;

    if (debugApi === undefined) {
      return false;
    }

    return debugApi.getSimulationSnapshot().levelProgression.levelIndex === 1;
  });

  const advancedSnapshot = await readSimulationSnapshot(page);
  expect(advancedSnapshot.levelProgression.levelIndex).toBe(1);
  expect(advancedSnapshot.playerOutcome.kind).toBe("active");
  expect(advancedSnapshot.player.position.x).toBe(16);
  expect(advancedSnapshot.player.position.y).toBe(56);
  // The score is a whole-session total: the finished level's score carries into
  // the next level rather than resetting to zero.
  expect(advancedSnapshot.score).toBeGreaterThanOrEqual(finishedSnapshot.score);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("converts remaining time to score with a countdown at the finish", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=timed-finish-route");
  await expect(page.locator("canvas")).toBeVisible();

  await page.keyboard.down("ArrowRight");
  await waitForSimulationSnapshotCondition(page, "finished-outcome");
  await page.keyboard.up("ArrowRight");

  // At the finish the clock has time left, so the countdown starts with a
  // non-zero unit count.
  const finishedSnapshot = await readSimulationSnapshot(page);
  expect(finishedSnapshot.timeBonusCountdownUnits).toBeGreaterThan(0);

  // The countdown drains the clock to zero over the level-advance delay.
  await page.waitForFunction(() => {
    const debugApi = window.__originalBrowserPlatformerDebug;
    return (
      debugApi !== undefined &&
      debugApi.getSimulationSnapshot().timeBonusCountdownUnits === 0
    );
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("carries the player's power tier across a level advance", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=multi-level-powered-route");
  await expect(page.locator("canvas")).toBeVisible();

  const initialSnapshot = await readSimulationSnapshot(page);
  expect(initialSnapshot.playerVitality.kind).toBe("powered");

  await page.keyboard.down("ArrowRight");
  await waitForSimulationSnapshotCondition(page, "finished-outcome");
  await page.keyboard.up("ArrowRight");

  await page.waitForFunction(() => {
    const debugApi = window.__originalBrowserPlatformerDebug;
    return (
      debugApi !== undefined &&
      debugApi.getSimulationSnapshot().levelProgression.levelIndex === 1
    );
  });

  // The next level begins with the same powered tier — power carries across a
  // level advance, as in the original.
  const advancedSnapshot = await readSimulationSnapshot(page);
  expect(advancedSnapshot.levelProgression.levelIndex).toBe(1);
  expect(advancedSnapshot.playerVitality.kind).toBe("powered");

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("shows the user asset import UI when importAssets query parameter is set", async ({
  page,
}) => {
  await routeLocalVglcSmbAssetSet(page);
  await page.goto("/?importAssets=1");

  const app = page.locator("#app");
  await expect(app).toHaveAttribute("role", "region");
  await expect(app).toHaveAttribute("aria-label", "User asset import");

  const heading = page.locator("h1");
  await expect(heading).toHaveText("Import User Assets");

  const dropZoneText = page.locator("p", {
    hasText: "Drag files here or click to browse",
  });
  await expect(dropZoneText).toBeVisible();

  const loadButton = page.locator("button", { hasText: "Load Assets" });
  await expect(loadButton).toBeVisible();

  const assetSetSelect = page.getByLabel("Runtime asset set");
  await expect(assetSetSelect).toHaveValue("vglc-smb-local-cache");
  await expect(assetSetSelect).toContainText("VGLC SMB Local Cache");

  await page.locator("button", { hasText: "Fetch Manifest" }).click();
  await expect(page.getByText("2 levels ready from manifest.")).toBeVisible();
  const levelSelect = page.getByLabel("Remote manifest level");
  await expect(levelSelect).toHaveValue("vglc-smb-processed-mario-1-1");
  await expect(levelSelect).toContainText("vglc-smb-processed-mario-1-2");
});

test("previews selected user images and enables valid import selections", async ({
  page,
}) => {
  await page.goto("/?importAssets=1");

  await page.locator('input[type="file"]').setInputFiles([
    makeJsonInputFile("manifest.json", { version: "1", levels: [] }),
    {
      name: "hero.png",
      mimeType: "image/png",
      buffer: transparentOnePixelPng,
    },
  ]);

  await expect(page.getByText("2 files selected")).toBeVisible();
  await expect(
    page.getByText("Selection looks ready for manifest validation."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Image previews" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Preview of hero.png" }),
  ).toBeVisible();
  const loadButton = page.locator("button", { hasText: "Load Assets" });
  await expect(loadButton).toBeEnabled();

  await loadButton.click();

  await expectVisibleImportError(page, "Manifest contains no playable levels.");
  await expect(loadButton).toBeEnabled();
});

test("reports import preflight validation issues before loading files", async ({
  page,
}) => {
  await page.goto("/?importAssets=1");

  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not an importable asset"),
  });

  await expect(
    page.getByRole("heading", { name: "Before loading" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "manifest.json is required before the selected files can be loaded.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Unsupported file type: notes.exe."),
  ).toBeVisible();
  await expect(
    page.locator("button", { hasText: "Load Assets" }),
  ).toBeDisabled();
});

test("blocks imported levels with compatibility conformance issues", async ({
  page,
}) => {
  await page.goto("/?importAssets=1");

  await page.locator('input[type="file"]').setInputFiles([
    makeJsonInputFile("manifest.json", {
      version: "1",
      levels: [
        {
          name: "custom-level",
          format: "original-json",
          source: { kind: "file", fileName: "level.json" },
          compatibilityProfileSource: {
            kind: "file",
            fileName: "profile.json",
          },
        },
      ],
    }),
    makeJsonInputFile("level.json", finishRouteLevelInput),
    makeJsonInputFile("profile.json", {
      profileId: "synthetic-profile",
      actors: [],
      movementConstants: [],
      timers: [],
      unsupportedFeatures: [
        {
          featureId: "screen-wrap",
          reason: compatibilityConformanceMessage,
        },
      ],
    }),
  ]);

  const loadButton = page.locator("button", { hasText: "Load Assets" });
  await expect(loadButton).toBeEnabled();

  await loadButton.click();

  await expectVisibleImportError(
    page,
    `Compatibility issue: ${compatibilityConformanceMessage}`,
  );
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(loadButton).toBeEnabled();
});

test("boots imported levels that use generic SMB tile ids", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?importAssets=1");

  await page.locator('input[type="file"]').setInputFiles([
    makeJsonInputFile("manifest.json", {
      version: "1",
      levels: [
        {
          name: "empty-tile-import",
          format: "original-json",
          source: { kind: "file", fileName: "level.json" },
        },
      ],
    }),
    makeJsonInputFile("level.json", {
      widthTiles: 17,
      heightTiles: 5,
      tileSizePixels: 16,
      tileDefinitions: [
        { tileId: "empty", collision: "empty" },
        { tileId: "ground", collision: "solid" },
        { tileId: "pipe-top-left", collision: "solid" },
        { tileId: "pipe-top-right", collision: "solid" },
        { tileId: "empty-question-block", collision: "solid" },
        { tileId: "full-question-block-coin", collision: "interactive" },
        { tileId: "full-question-block-power-up", collision: "interactive" },
        { tileId: "extra-life-brick", collision: "interactive" },
        { tileId: "star-block", collision: "interactive" },
        { tileId: "beanstalk-block", collision: "interactive" },
        { tileId: "multi-coin-brick", collision: "interactive" },
        { tileId: "breakable-block", collision: "breakable" },
        { tileId: "cannon-top", collision: "solid-hazard" },
        { tileId: "cannon-bottom", collision: "solid" },
        { tileId: "plant-hazard", collision: "hazard" },
        { tileId: "spring-top", collision: "spring" },
        { tileId: "spring-bottom", collision: "solid" },
        { tileId: "flagpole", collision: "goal" },
      ],
      actorDefinitions: [
        { actorId: "start", role: "player-start" },
        { actorId: "exit", role: "exit" },
      ],
      tiles: [
        [
          "empty",
          "pipe-top-left",
          "pipe-top-right",
          "empty-question-block",
          "full-question-block-coin",
          "full-question-block-power-up",
          "extra-life-brick",
          "star-block",
          "beanstalk-block",
          "multi-coin-brick",
          "breakable-block",
          "cannon-top",
          "cannon-bottom",
          "plant-hazard",
          "spring-top",
          "spring-bottom",
          "flagpole",
        ],
        makeRepeatedTileRow("empty", 17),
        makeRepeatedTileRow("empty", 17),
        makeRepeatedTileRow("empty", 17),
        makeRepeatedTileRow("ground", 17),
      ],
      actors: [
        { entityId: "start", actorId: "start", x: 0, y: 2 },
        { entityId: "exit", actorId: "exit", x: 16, y: 2 },
      ],
    }),
  ]);

  const loadButton = page.locator("button", { hasText: "Load Assets" });
  await expect(loadButton).toBeEnabled();

  await loadButton.click();
  await expect(page.locator("canvas")).toBeVisible();
  await waitForSimulationFrame(page, 0);

  const snapshot = await readSimulationSnapshot(page);
  expect(snapshot.level.collisionCounts).toEqual({
    empty: 52,
    solid: 22,
    interactive: 6,
    breakable: 1,
    "solid-hazard": 1,
    hazard: 1,
    spring: 1,
    goal: 1,
    hidden: 0,
  });
  expect(snapshot.playerOutcome.kind).toBe(PlayerOutcomeKind.Active);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("loads a remote manifest with relative map and sprite URLs", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);
  const remoteManifestUrl = "https://example.test/demo/manifest.json";
  const remoteLevelUrl = "https://example.test/demo/level.json";
  const remotePlayerSpriteUrl = "https://example.test/demo/player.png";

  await page.route(remoteManifestUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: JSON.stringify({
        version: "1",
        playerSprite: {
          source: { kind: "url", url: "player.png" },
          frame: { x: 0, y: 0, width: 1, height: 1 },
        },
        levels: [
          {
            name: "remote-demo",
            format: "original-json",
            source: { kind: "url", url: "level.json" },
          },
        ],
      }),
    });
  });
  await page.route(remoteLevelUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: JSON.stringify(finishRouteLevelInput),
    });
  });
  await page.route(remotePlayerSpriteUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: redOnePixelPng,
    });
  });

  await page.goto(
    `/?importAssets=1&manifestUrl=${encodeURIComponent(remoteManifestUrl)}`,
  );

  await expect(page.getByText("1 level ready from manifest.")).toBeVisible();
  const loadRemoteButton = page.locator("button", {
    hasText: "Load Remote Demo",
  });
  await expect(loadRemoteButton).toBeEnabled();

  await loadRemoteButton.click();
  await expect(page.locator("canvas")).toBeVisible();

  const snapshot = await readSimulationSnapshot(page);
  expect(snapshot.playerOutcome.kind).toBe(PlayerOutcomeKind.Active);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("screenshot regression: first-authored initial frame", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto(firstAuthoredBrowserUrl);
  await readSimulationSnapshot(page);

  const canvas = page.locator("canvas");
  await expect(canvas).toHaveScreenshot("first-authored-initial.png", {
    maxDiffPixelRatio: 0.05,
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("screenshot regression: finish-route initial frame", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=finish-route");
  await readSimulationSnapshot(page);

  const canvas = page.locator("canvas");
  await expect(canvas).toHaveScreenshot("finish-route-initial.png", {
    maxDiffPixelRatio: 0.05,
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("screenshot regression: pipe-route initial frame", async ({ page }) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=pipe-route");
  await readSimulationSnapshot(page);

  const canvas = page.locator("canvas");
  await expect(canvas).toHaveScreenshot("pipe-route-initial.png", {
    maxDiffPixelRatio: 0.05,
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

test("screenshot regression: showcase-route initial frame", async ({
  page,
}) => {
  const browserErrors = watchBrowserErrors(page);

  await page.goto("/?browserLevel=showcase-route");
  await readSimulationSnapshot(page);

  const canvas = page.locator("canvas");
  await expect(canvas).toHaveScreenshot("showcase-route-initial.png", {
    maxDiffPixelRatio: 0.05,
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
});

import type { LevelSpecInput } from "../engine/domain/level-spec";
import type { LevelTheme } from "./browser-level-selection";
import {
  makeCompatibilityProfile,
  type CompatibilityProfile,
} from "../engine/domain/compatibility-profile";
import {
  UserAssetSourceKind,
  UserLevelEntryFormat,
  type UserBaseSpriteEntry,
  type UserAssetManifest,
  type UserAssetSource,
  type UserLevelVisualEraseRect,
  type UserLevelVisualEntry,
  type UserLevelEntry,
  type UserSpriteFrame,
  type UserSpriteTransparentColor,
} from "../engine/domain/user-asset-manifest";
import { SoundEvent } from "../engine/simulation/sound-events";
import {
  importUserLevel,
  type UserLevelFileContent,
  UserLevelFileContentKind,
} from "../engine/levels/import/level-importer-registry";
import {
  makeCompatibilityConformanceReport,
  type CompatibilityConformanceReport,
} from "../engine/levels/import/compatibility-conformance";
import { applyCompatibilityProfileToLevelInput } from "../engine/levels/import/compatibility-profile-application";

export const defaultMaxFileBytes = 10 * 1024 * 1024;
export const defaultMaxTotalBytes = 50 * 1024 * 1024;

const allowedImageTypes = new Set(["image/png", "image/webp"]);

const allowedAudioTypes = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/mpeg",
  "audio/ogg",
]);

const allowedLevelTypes = new Set(["application/json", "text/plain"]);
const allowedJsonTypes = new Set(["application/json", "text/plain"]);

export type LoadedImageAsset = {
  readonly imageElement: HTMLImageElement;
  readonly objectUrl: string;
  readonly frame: UserSpriteFrame;
};

export type LoadedStatefulImageAsset = LoadedImageAsset & {
  readonly stateImages: ReadonlyMap<string, LoadedImageAsset>;
};

type LoadedAudioAsset = {
  readonly audioBuffer: AudioBuffer;
};

export type LoadedLevelVisualAsset = LoadedImageAsset & {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly eraseRects: readonly UserLevelVisualEraseRect[];
};

type LoadedLevelAsset = {
  readonly name: string;
  readonly levelSpecInput: LevelSpecInput;
  // The world's colour theme (from the level's import metadata), if any.
  readonly theme: LevelTheme | undefined;
  readonly compatibilityProfile: CompatibilityProfile | undefined;
  readonly compatibilityConformanceReport: CompatibilityConformanceReport;
};

const levelThemeValues: readonly LevelTheme[] = [
  "overworld",
  "underground",
  "castle",
  "water",
];

function readLevelTheme(metadata: unknown): LevelTheme | undefined {
  if (typeof metadata !== "object" || metadata === null) {
    return undefined;
  }
  const theme = (metadata as Record<string, unknown>).theme;
  return levelThemeValues.find((value) => value === theme);
}

export type UserAssetBundle = {
  readonly manifest: UserAssetManifest;
  readonly tileImages: ReadonlyMap<string, LoadedImageAsset>;
  readonly reactionImages: ReadonlyMap<string, LoadedImageAsset>;
  readonly actorImages: ReadonlyMap<string, LoadedStatefulImageAsset>;
  readonly playerImage: LoadedStatefulImageAsset | undefined;
  readonly levelVisualImages: ReadonlyMap<string, LoadedLevelVisualAsset>;
  readonly sounds: ReadonlyMap<string, LoadedAudioAsset>;
  readonly music: ReadonlyMap<string, LoadedAudioAsset>;
  readonly levels: ReadonlyMap<string, LoadedLevelAsset>;
};

type UserAssetLoadError = {
  readonly message: string;
};

export type UserAssetLoadResult =
  | {
      readonly ok: true;
      readonly bundle: UserAssetBundle;
    }
  | {
      readonly ok: false;
      readonly errors: readonly UserAssetLoadError[];
    };

type FileResolver = (fileName: string) => File | undefined;

export async function loadUserAssetBundle(
  manifest: UserAssetManifest,
  files: readonly File[],
  options: {
    readonly maxFileBytes: number;
    readonly maxTotalBytes: number;
  },
): Promise<UserAssetLoadResult> {
  const errors: UserAssetLoadError[] = [];
  const maxFileBytes = options.maxFileBytes;
  const maxTotalBytes = options.maxTotalBytes;

  validateSoundKeys(manifest.sounds, errors);

  if (!validateBundleSize(files, maxTotalBytes, errors)) {
    return {
      ok: false,
      errors,
    };
  }

  const fileResolver = makeFileResolver(files, maxFileBytes, errors);

  const tileImages = await loadImageMap(
    manifest.tileSprites,
    fileResolver,
    errors,
  );
  const reactionImages = await loadImageMap(
    manifest.reactionSprites,
    fileResolver,
    errors,
  );
  const actorImages = await loadStatefulImageMap(
    manifest.actorSprites,
    fileResolver,
    errors,
  );
  const playerImage = await loadOptionalStatefulImage(
    manifest.playerSprite,
    fileResolver,
    errors,
  );
  const levelVisualImages = await loadLevelVisualMap(
    manifest.levelVisuals,
    fileResolver,
    errors,
  );
  const sounds = await loadAudioMap(manifest.sounds, fileResolver, errors);
  const music = await loadAudioMap(manifest.music, fileResolver, errors);
  const levels = await loadLevels(manifest.levels, fileResolver, errors);

  if (errors.length > 0) {
    revokeObjectUrls(tileImages);
    revokeObjectUrls(reactionImages);
    revokeObjectUrls(actorImages);
    revokeObjectUrls(levelVisualImages);

    if (playerImage !== undefined) {
      URL.revokeObjectURL(playerImage.objectUrl);
    }

    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    bundle: {
      manifest,
      tileImages,
      reactionImages,
      actorImages,
      playerImage,
      levelVisualImages,
      sounds,
      music,
      levels,
    },
  };
}

function validateBundleSize(
  files: readonly File[],
  maxTotalBytes: number,
  errors: UserAssetLoadError[],
): boolean {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  if (totalBytes > maxTotalBytes) {
    errors.push({
      message: `User asset bundle total size ${totalBytes} bytes exceeds limit ${maxTotalBytes} bytes.`,
    });

    return false;
  }

  return true;
}

function validateSoundKeys(
  sounds: Readonly<Record<string, { readonly source: UserAssetSource }>>,
  errors: UserAssetLoadError[],
): void {
  const validSoundEvents = new Set<string>(Object.values(SoundEvent));

  for (const key of Object.keys(sounds)) {
    if (!validSoundEvents.has(key)) {
      errors.push({
        message: `Sound key "${key}" is not a recognized sound event. Allowed keys are: ${Object.values(SoundEvent).join(", ")}.`,
      });
    }
  }
}

function makeFileResolver(
  files: readonly File[],
  maxFileBytes: number,
  errors: UserAssetLoadError[],
): FileResolver {
  const fileMap = new Map<string, File>();

  for (const file of files) {
    if (file.size > maxFileBytes) {
      errors.push({
        message: `File ${file.name} size ${file.size} bytes exceeds limit ${maxFileBytes} bytes.`,
      });

      continue;
    }

    fileMap.set(file.name, file);
  }

  return (fileName: string) => fileMap.get(fileName);
}

async function loadLevelVisualMap(
  entries: Readonly<Record<string, UserLevelVisualEntry>>,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<Map<string, LoadedLevelVisualAsset>> {
  const result = new Map<string, LoadedLevelVisualAsset>();

  for (const [levelName, entry] of Object.entries(entries)) {
    const loaded = await loadImageEntry(
      {
        source: entry.source,
        frame: entry.frame,
        transparentColor: undefined,
      },
      resolveFile,
      errors,
    );

    if (loaded !== undefined) {
      result.set(levelName, {
        ...loaded,
        offsetX: entry.offsetX,
        offsetY: entry.offsetY,
        eraseRects: entry.eraseRects,
      });
    }
  }

  return result;
}

async function loadImageMap(
  entries: Readonly<
    Record<
      string,
      {
        readonly source: UserAssetSource;
        readonly frame: UserSpriteFrame;
        readonly transparentColor: UserSpriteTransparentColor | undefined;
      }
    >
  >,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<Map<string, LoadedImageAsset>> {
  const loaded = await Promise.all(
    Object.entries(entries).map(async ([key, entry]) => ({
      key,
      asset: await loadImageEntry(entry, resolveFile, errors),
    })),
  );

  const result = new Map<string, LoadedImageAsset>();

  for (const { key, asset } of loaded) {
    if (asset !== undefined) {
      result.set(key, asset);
    }
  }

  return result;
}

async function loadStatefulImageMap(
  entries: Readonly<
    Record<
      string,
      UserBaseSpriteEntry & {
        readonly stateSprites: Readonly<Record<string, UserBaseSpriteEntry>>;
      }
    >
  >,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<Map<string, LoadedStatefulImageAsset>> {
  const loaded = await Promise.all(
    Object.entries(entries).map(async ([key, entry]) => ({
      key,
      asset: await loadStatefulImageEntry(entry, resolveFile, errors),
    })),
  );

  const result = new Map<string, LoadedStatefulImageAsset>();

  for (const { key, asset } of loaded) {
    if (asset !== undefined) {
      result.set(key, asset);
    }
  }

  return result;
}

async function loadOptionalStatefulImage(
  entry:
    | (UserBaseSpriteEntry & {
        readonly stateSprites: Readonly<Record<string, UserBaseSpriteEntry>>;
      })
    | undefined,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<LoadedStatefulImageAsset | undefined> {
  if (entry === undefined) {
    return undefined;
  }

  return loadStatefulImageEntry(entry, resolveFile, errors);
}

async function loadStatefulImageEntry(
  entry: UserBaseSpriteEntry & {
    readonly stateSprites: Readonly<Record<string, UserBaseSpriteEntry>>;
  },
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<LoadedStatefulImageAsset | undefined> {
  const defaultImage = await loadImageEntry(entry, resolveFile, errors);

  if (defaultImage === undefined) {
    return undefined;
  }

  const stateImages = await loadImageMap(
    entry.stateSprites,
    resolveFile,
    errors,
  );

  return {
    ...defaultImage,
    stateImages,
  };
}

function loadImageEntry(
  entry: {
    readonly source: UserAssetSource;
    readonly frame: UserSpriteFrame;
    readonly transparentColor: UserSpriteTransparentColor | undefined;
  },
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<LoadedImageAsset | undefined> {
  // Gate the whole per-sprite unit (fetch, decode, transparency, crop) through
  // the shared limiter so a large content set never fires hundreds of concurrent
  // decodes — which some browsers reject outright.
  return withImageLoadSlot(() =>
    loadImageEntryUnlimited(entry, resolveFile, errors),
  );
}

async function loadImageEntryUnlimited(
  entry: {
    readonly source: UserAssetSource;
    readonly frame: UserSpriteFrame;
    readonly transparentColor: UserSpriteTransparentColor | undefined;
  },
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<LoadedImageAsset | undefined> {
  const loaded = await loadImageAsset(
    entry.source,
    entry.transparentColor,
    resolveFile,
    errors,
  );

  if (loaded === undefined) {
    return undefined;
  }

  const cropped = await cropImageAssetFrame(
    entry.source,
    loaded,
    entry.frame,
    errors,
  );

  if (cropped === undefined) {
    return undefined;
  }

  return {
    imageElement: cropped.imageElement,
    objectUrl: cropped.objectUrl,
    frame: makeCroppedFrame(entry.frame),
  };
}

type ImageLoadIntermediate = {
  readonly imageElement: HTMLImageElement;
  readonly objectUrl: string;
};

// Backoff schedule for retrying a URL-sourced sprite load. A page load during a
// deploy can momentarily see a truncated CDN response that decodes as a broken
// image, and a single sprite failure aborts the whole boot ("Could not start").
// Retrying with a short backoff lets the deploy/CDN settle; the number of entries
// is the number of retries after the first attempt.
const urlAssetRetryDelaysMs: readonly number[] = [150, 400, 900];

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// A content set can hold many hundreds of sprites, and the loader would otherwise
// fetch-and-decode all of them at once. Some browsers (notably Safari) fail
// HTMLImageElement.decode() under that many concurrent decodes — surfacing as a
// spurious "Failed to decode image", which aborts the whole boot. Gate every
// image load through a shared limiter so only a bounded number are ever in
// flight, keeping decode pressure well under any browser's ceiling.
const maxConcurrentImageLoads = 12;

function createConcurrencyLimiter(
  maxConcurrent: number,
): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const pump = (): void => {
    if (active >= maxConcurrent) {
      return;
    }
    const start = waiting.shift();
    if (start === undefined) {
      return;
    }
    active += 1;
    start();
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      pump();
    });
    try {
      return await task();
    } finally {
      active -= 1;
      pump();
    }
  };
}

const withImageLoadSlot = createConcurrencyLimiter(maxConcurrentImageLoads);

// Load a sprite image, retrying transient URL failures. File sources are local
// and deterministic, so they load exactly once; URL sources retry on the backoff
// schedule and only surface their error once every attempt has failed.
async function loadImageAsset(
  source: UserAssetSource,
  transparentColor: UserSpriteTransparentColor | undefined,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<ImageLoadIntermediate | undefined> {
  if (source.kind === UserAssetSourceKind.File) {
    return loadImageAssetOnce(source, transparentColor, resolveFile, errors);
  }

  for (let attempt = 0; ; attempt += 1) {
    const attemptErrors: UserAssetLoadError[] = [];
    const result = await loadImageAssetOnce(
      source,
      transparentColor,
      resolveFile,
      attemptErrors,
    );
    if (result !== undefined) {
      return result;
    }

    const retryDelayMs = urlAssetRetryDelaysMs[attempt];
    if (retryDelayMs === undefined) {
      errors.push(...attemptErrors);
      return undefined;
    }
    await delay(retryDelayMs);
  }
}

async function loadImageAssetOnce(
  source: UserAssetSource,
  transparentColor: UserSpriteTransparentColor | undefined,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<ImageLoadIntermediate | undefined> {
  const blobResult = await resolveSourceBlob(
    source,
    resolveFile,
    allowedImageTypes,
    errors,
  );

  if (blobResult === undefined) {
    return undefined;
  }

  const sourceObjectUrl = URL.createObjectURL(blobResult.blob);
  const sourceImageElement = new Image();
  sourceImageElement.src = sourceObjectUrl;

  try {
    await sourceImageElement.decode();
  } catch {
    URL.revokeObjectURL(sourceObjectUrl);
    errors.push({
      message: `Failed to decode image from ${describeSource(source)}.`,
    });

    return undefined;
  }

  if (transparentColor !== undefined) {
    const processed = await makeTransparentImageAsset(
      source,
      sourceImageElement,
      sourceObjectUrl,
      transparentColor,
      errors,
    );

    if (processed === undefined) {
      return undefined;
    }

    return processed;
  }

  return {
    imageElement: sourceImageElement,
    objectUrl: sourceObjectUrl,
  };
}

function makeCroppedFrame(frame: UserSpriteFrame): UserSpriteFrame {
  return {
    x: 0,
    y: 0,
    width: frame.width,
    height: frame.height,
  };
}

async function cropImageAssetFrame(
  source: UserAssetSource,
  loaded: ImageLoadIntermediate,
  frame: UserSpriteFrame,
  errors: UserAssetLoadError[],
): Promise<ImageLoadIntermediate | undefined> {
  const documentObject = typeof document !== "undefined" ? document : undefined;

  if (documentObject === undefined) {
    URL.revokeObjectURL(loaded.objectUrl);
    errors.push({
      message: `Canvas image processing is unavailable; cannot crop sprite frame for ${describeSource(source)}.`,
    });

    return undefined;
  }

  const sourceWidth = loaded.imageElement.naturalWidth;
  const sourceHeight = loaded.imageElement.naturalHeight;

  if (
    frame.x + frame.width > sourceWidth ||
    frame.y + frame.height > sourceHeight
  ) {
    URL.revokeObjectURL(loaded.objectUrl);
    errors.push({
      message: `Sprite frame ${frame.x},${frame.y},${frame.width},${frame.height} exceeds image ${sourceWidth}x${sourceHeight} from ${describeSource(source)}.`,
    });

    return undefined;
  }

  const canvas = documentObject.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");

  if (context === null) {
    URL.revokeObjectURL(loaded.objectUrl);
    errors.push({
      message: `Canvas 2D image processing is unavailable; cannot crop sprite frame for ${describeSource(source)}.`,
    });

    return undefined;
  }

  context.drawImage(
    loaded.imageElement,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    0,
    0,
    frame.width,
    frame.height,
  );

  const croppedBlob = await makeCanvasPngBlob(canvas);

  if (croppedBlob === undefined) {
    URL.revokeObjectURL(loaded.objectUrl);
    errors.push({
      message: `Failed to encode cropped sprite frame for ${describeSource(source)}.`,
    });

    return undefined;
  }

  const croppedObjectUrl = URL.createObjectURL(croppedBlob);
  const croppedImageElement = new Image();
  croppedImageElement.src = croppedObjectUrl;

  try {
    await croppedImageElement.decode();
  } catch {
    URL.revokeObjectURL(loaded.objectUrl);
    URL.revokeObjectURL(croppedObjectUrl);
    errors.push({
      message: `Failed to decode cropped sprite frame for ${describeSource(source)}.`,
    });

    return undefined;
  }

  URL.revokeObjectURL(loaded.objectUrl);

  return {
    imageElement: croppedImageElement,
    objectUrl: croppedObjectUrl,
  };
}

async function makeTransparentImageAsset(
  source: UserAssetSource,
  sourceImageElement: HTMLImageElement,
  sourceObjectUrl: string,
  transparentColor: UserSpriteTransparentColor,
  errors: UserAssetLoadError[],
): Promise<ImageLoadIntermediate | undefined> {
  const documentObject = typeof document !== "undefined" ? document : undefined;

  if (documentObject === undefined) {
    URL.revokeObjectURL(sourceObjectUrl);
    errors.push({
      message: `Canvas image processing is unavailable; cannot apply transparent color for ${describeSource(source)}.`,
    });

    return undefined;
  }

  const canvas = documentObject.createElement("canvas");
  const width = sourceImageElement.naturalWidth;
  const height = sourceImageElement.naturalHeight;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (context === null) {
    URL.revokeObjectURL(sourceObjectUrl);
    errors.push({
      message: `Canvas 2D image processing is unavailable; cannot apply transparent color for ${describeSource(source)}.`,
    });

    return undefined;
  }

  context.drawImage(sourceImageElement, 0, 0);
  const imageData = context.getImageData(0, 0, width, height);
  applyTransparentColor(imageData, transparentColor);
  context.putImageData(imageData, 0, 0);

  const processedBlob = await makeCanvasPngBlob(canvas);

  if (processedBlob === undefined) {
    URL.revokeObjectURL(sourceObjectUrl);
    errors.push({
      message: `Failed to encode transparent PNG for ${describeSource(source)}.`,
    });

    return undefined;
  }

  const processedObjectUrl = URL.createObjectURL(processedBlob);
  const processedImageElement = new Image();
  processedImageElement.src = processedObjectUrl;

  try {
    await processedImageElement.decode();
  } catch {
    URL.revokeObjectURL(sourceObjectUrl);
    URL.revokeObjectURL(processedObjectUrl);
    errors.push({
      message: `Failed to decode transparent PNG for ${describeSource(source)}.`,
    });

    return undefined;
  }

  URL.revokeObjectURL(sourceObjectUrl);

  return {
    imageElement: processedImageElement,
    objectUrl: processedObjectUrl,
  };
}

function applyTransparentColor(
  imageData: ImageData,
  transparentColor: UserSpriteTransparentColor,
): void {
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    if (
      red !== undefined &&
      green !== undefined &&
      blue !== undefined &&
      Math.abs(red - transparentColor.red) <= transparentColor.tolerance &&
      Math.abs(green - transparentColor.green) <= transparentColor.tolerance &&
      Math.abs(blue - transparentColor.blue) <= transparentColor.tolerance
    ) {
      pixels[index + 3] = 0;
    }
  }
}

async function makeCanvasPngBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ?? undefined);
    }, "image/png");
  });
}

async function loadAudioMap(
  entries: Readonly<Record<string, { readonly source: UserAssetSource }>>,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<Map<string, LoadedAudioAsset>> {
  const result = new Map<string, LoadedAudioAsset>();
  const audioContext = resolveSharedAudioContext();

  for (const [key, entry] of Object.entries(entries)) {
    const loaded = await loadAudioAsset(
      entry.source,
      resolveFile,
      audioContext,
      errors,
    );

    if (loaded !== undefined) {
      result.set(key, loaded);
    }
  }

  return result;
}

async function loadAudioAsset(
  source: UserAssetSource,
  resolveFile: FileResolver,
  audioContext: AudioContext | undefined,
  errors: UserAssetLoadError[],
): Promise<LoadedAudioAsset | undefined> {
  if (audioContext === undefined) {
    errors.push({
      message: `Web Audio API is unavailable; cannot load audio from ${describeSource(source)}.`,
    });

    return undefined;
  }

  const blobResult = await resolveSourceBlob(
    source,
    resolveFile,
    allowedAudioTypes,
    errors,
  );

  if (blobResult === undefined) {
    return undefined;
  }

  const arrayBuffer = await blobResult.blob.arrayBuffer();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return {
      audioBuffer,
    };
  } catch {
    errors.push({
      message: `Failed to decode audio from ${describeSource(source)}.`,
    });

    return undefined;
  }
}

function tryCreateAudioContext(): AudioContext | undefined {
  const globalWindow =
    typeof globalThis !== "undefined" ? globalThis : undefined;

  if (globalWindow === undefined) {
    return undefined;
  }

  const constructor: typeof AudioContext | undefined = (
    globalWindow as unknown as { AudioContext?: typeof AudioContext }
  ).AudioContext;

  if (constructor === undefined) {
    return undefined;
  }

  try {
    return new constructor();
  } catch {
    return undefined;
  }
}

// A single AudioContext reused to decode every bundle's audio. Browsers cap the
// number of live contexts (~6 in Chrome); creating a fresh one per load — two
// per bundle, for sounds and music — would exhaust that cap after a few
// (re)loads, after which `new AudioContext()` throws and all audio silently
// fails to decode. Decoded AudioBuffers outlive the context, so one is enough.
let sharedAudioContextResolved = false;
let sharedAudioContext: AudioContext | undefined;
function resolveSharedAudioContext(): AudioContext | undefined {
  if (!sharedAudioContextResolved) {
    sharedAudioContext = tryCreateAudioContext();
    sharedAudioContextResolved = true;
  }
  return sharedAudioContext;
}

async function loadLevels(
  entries: readonly UserLevelEntry[],
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<Map<string, LoadedLevelAsset>> {
  // Load every level concurrently — a large pack (e.g. all SMB areas) is dozens
  // of small files, and fetching them sequentially dominates first-load latency
  // over the network. Order is preserved so failures report deterministically.
  const loaded = await Promise.all(
    entries.map(async (entry) => ({
      name: entry.name,
      asset: await loadLevelAsset(entry, resolveFile, errors),
    })),
  );

  const result = new Map<string, LoadedLevelAsset>();

  for (const { name, asset } of loaded) {
    if (asset !== undefined) {
      result.set(name, asset);
    }
  }

  return result;
}

async function loadLevelAsset(
  entry: UserLevelEntry,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<LoadedLevelAsset | undefined> {
  const blobResult = await resolveSourceBlob(
    entry.source,
    resolveFile,
    allowedLevelTypes,
    errors,
  );

  if (blobResult === undefined) {
    return undefined;
  }

  const text = await blobResult.blob.text();
  const content = makeLevelFileContent(entry.format, text, errors);

  if (content === undefined) {
    return undefined;
  }

  const importMetadata = await loadImportMetadata(entry, resolveFile, errors);
  const importResult = importUserLevel(entry.format, content, importMetadata);

  if (!importResult.ok) {
    for (const error of importResult.errors) {
      errors.push({
        message: `Level "${entry.name}" import failed at ${error.path}: ${error.message} (${error.code}).`,
      });
    }

    return undefined;
  }

  const compatibilityProfile = await loadCompatibilityProfile(
    entry,
    resolveFile,
    errors,
  );
  const compatibilityConformanceReport = makeCompatibilityConformanceReport(
    importResult.value,
    compatibilityProfile,
  );
  const runtimeLevelSpecInput =
    compatibilityConformanceReport.issues.length === 0
      ? applyCompatibilityProfileToLevelInput(
          importResult.value,
          compatibilityProfile,
        )
      : importResult.value;

  return {
    name: entry.name,
    levelSpecInput: runtimeLevelSpecInput,
    theme: readLevelTheme(importMetadata),
    compatibilityProfile,
    compatibilityConformanceReport,
  };
}

async function loadImportMetadata(
  entry: UserLevelEntry,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<unknown> {
  if (entry.importMetadataSource === undefined) {
    return undefined;
  }

  const blobResult = await resolveSourceBlob(
    entry.importMetadataSource,
    resolveFile,
    allowedJsonTypes,
    errors,
  );

  if (blobResult === undefined) {
    return undefined;
  }

  const parsedMetadata = parseJsonText(
    await blobResult.blob.text(),
    `Import metadata for level "${entry.name}" must be valid JSON.`,
    errors,
  );

  return parsedMetadata?.value;
}

async function loadCompatibilityProfile(
  entry: UserLevelEntry,
  resolveFile: FileResolver,
  errors: UserAssetLoadError[],
): Promise<CompatibilityProfile | undefined> {
  if (entry.compatibilityProfileSource === undefined) {
    return undefined;
  }

  const blobResult = await resolveSourceBlob(
    entry.compatibilityProfileSource,
    resolveFile,
    allowedJsonTypes,
    errors,
  );

  if (blobResult === undefined) {
    return undefined;
  }

  const profileInput = parseJsonText(
    await blobResult.blob.text(),
    `Compatibility profile for level "${entry.name}" must be valid JSON.`,
    errors,
  );

  if (profileInput === undefined) {
    return undefined;
  }

  const profileResult = makeCompatibilityProfile(profileInput.value as never);

  if (!profileResult.ok) {
    for (const error of profileResult.errors) {
      errors.push({
        message: `Compatibility profile for level "${entry.name}" failed at ${error.path}: ${error.message} (${error.code}).`,
      });
    }

    return undefined;
  }

  return profileResult.value;
}

function makeLevelFileContent(
  format: UserLevelEntryFormat,
  text: string,
  errors: UserAssetLoadError[],
): UserLevelFileContent | undefined {
  if (
    format === UserLevelEntryFormat.VglcText ||
    format === UserLevelEntryFormat.VglcSmbText ||
    format === UserLevelEntryFormat.VglcSmbMultiLayer
  ) {
    return {
      kind: UserLevelFileContentKind.Text,
      value: text,
    };
  }

  const parsedJson = parseJsonText(
    text,
    `Level file for format "${format}" must be valid JSON.`,
    errors,
  );

  if (parsedJson === undefined) {
    return undefined;
  }

  return {
    kind: UserLevelFileContentKind.Json,
    value: parsedJson.value,
  };
}

type ParsedJsonText = {
  readonly value: unknown;
};

function parseJsonText(
  text: string,
  failureMessage: string,
  errors: UserAssetLoadError[],
): ParsedJsonText | undefined {
  try {
    return {
      value: JSON.parse(text) as unknown,
    };
  } catch {
    errors.push({
      message: failureMessage,
    });

    return undefined;
  }
}

type ResolvedBlob = {
  readonly blob: Blob;
};

// Content hosts (GitHub Pages, CDNs) throw transient 5xx/429s under load; a
// cold boot fires many requests, so a single hiccup used to fail the whole
// start. Retry transient statuses and network errors with a short backoff.
export async function fetchWithRetry(
  url: string,
  attempts = 3,
): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, 400 * 2 ** (attempt - 1)),
      );
    }
    try {
      const response = await fetch(url);
      const transient = response.status >= 500 || response.status === 429;
      if (!transient) {
        return response;
      }
      lastResponse = response;
    } catch {
      // Network-level failure: retry.
    }
  }
  if (lastResponse !== undefined) {
    return lastResponse;
  }
  return fetch(url);
}

async function resolveSourceBlob(
  source: UserAssetSource,
  resolveFile: FileResolver,
  allowedTypes: ReadonlySet<string>,
  errors: UserAssetLoadError[],
): Promise<ResolvedBlob | undefined> {
  if (source.kind === UserAssetSourceKind.File) {
    const file = resolveFile(source.fileName);

    if (file === undefined) {
      errors.push({
        message: `Required file "${source.fileName}" was not provided.`,
      });

      return undefined;
    }

    if (!allowedTypes.has(file.type)) {
      errors.push({
        message: `File "${file.name}" has unsupported type "${file.type}".`,
      });

      return undefined;
    }

    return {
      blob: file,
    };
  }

  try {
    const response = await fetchWithRetry(source.url);

    if (!response.ok) {
      errors.push({
        message: `Failed to fetch URL "${source.url}": ${response.status} ${response.statusText}.`,
      });

      return undefined;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const normalizedType = contentType.split(";")[0]?.trim() ?? "";

    if (!allowedTypes.has(normalizedType)) {
      errors.push({
        message: `URL "${source.url}" returned unsupported content-type "${normalizedType}".`,
      });

      return undefined;
    }

    // Bound URL-sourced assets too: File sources are size-checked by the file
    // resolver, but URL blobs would otherwise download unbounded. Reject a
    // declared oversize (Content-Length) before reading, then the actual size.
    const declaredBytes = Number(response.headers.get("content-length") ?? "0");
    if (declaredBytes > defaultMaxFileBytes) {
      errors.push({
        message: `URL "${source.url}" asset size ${declaredBytes} bytes exceeds limit ${defaultMaxFileBytes} bytes.`,
      });

      return undefined;
    }

    const blob = await response.blob();
    if (blob.size > defaultMaxFileBytes) {
      errors.push({
        message: `URL "${source.url}" asset size ${blob.size} bytes exceeds limit ${defaultMaxFileBytes} bytes.`,
      });

      return undefined;
    }

    return {
      blob,
    };
  } catch {
    errors.push({
      message: `Network error fetching URL "${source.url}".`,
    });

    return undefined;
  }
}

function describeSource(source: UserAssetSource): string {
  if (source.kind === UserAssetSourceKind.File) {
    return `file "${source.fileName}"`;
  }

  return `URL "${source.url}"`;
}

function revokeObjectUrls(
  imageMap: ReadonlyMap<string, LoadedImageAsset>,
): void {
  for (const asset of imageMap.values()) {
    URL.revokeObjectURL(asset.objectUrl);

    if (isLoadedStatefulImageAsset(asset)) {
      revokeObjectUrls(asset.stateImages);
    }
  }
}

function isLoadedStatefulImageAsset(
  asset: LoadedImageAsset,
): asset is LoadedStatefulImageAsset {
  return "stateImages" in asset;
}

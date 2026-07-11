// Type declarations for the plain-JS SMB level decoder so TypeScript callers
// (tests, tooling) get checked signatures.

export type DecodedArea = {
  readonly areaPointer: number;
  readonly areaType: number;
  readonly areaTypeName: string;
  readonly index5: number;
  readonly levelAddr: number;
  readonly enemyAddr: number;
};

export type DecodedAreaHeader = {
  readonly byte0: number;
  readonly byte1: number;
  readonly timerSetting: number;
  readonly entranceCtrl: number;
  readonly foregroundScenery: number;
  readonly terrainControl: number;
  readonly backgroundScenery: number;
  readonly areaStyle: number;
  readonly cloudOverride: boolean;
};

export type DecodedGrid = string[][];

export type DecodedCannon = {
  readonly col: number;
  readonly row: number;
};

export type DecodedLevelResult = {
  readonly area: DecodedArea;
  readonly header: DecodedAreaHeader;
  readonly grid: DecodedGrid;
  readonly widthCols: number;
  readonly cannons: readonly DecodedCannon[];
};

export type DecodedNamedLevel = {
  readonly world: number;
  readonly slot: number;
  readonly name: string;
  readonly area: DecodedArea;
  readonly grid: DecodedGrid;
  readonly widthCols: number;
  readonly metadata: DecodedLevelMetadata;
};

export type DecodedTransition = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly targetLevelName: string;
  readonly targetTileX: number;
  readonly targetTileY: number;
  readonly entryDirection?: "left" | "right";
};

export type DecodedCannonProjectile = {
  readonly x: number;
  readonly y: number;
  readonly spawnerId: string;
  readonly direction: "left" | "right";
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly speedPixelsPerSecond: number;
  readonly intervalFrames: number;
  readonly initialDelayFrames: number;
  readonly lifetimeFrames: number;
};

export type DecodedLevelMetadata = {
  readonly playerStart: { x: number; y: number };
  readonly exits: readonly { x: number; y: number }[];
  readonly timers: readonly { id: string; value: number; unit: string }[];
  readonly transitions: readonly DecodedTransition[];
  readonly questionBlockContentsDefault: string;
  readonly multiLayer: { playerPathRows: readonly string[] };
  readonly theme: string;
  readonly cannonProjectiles?: readonly DecodedCannonProjectile[];
  readonly cheepFrenzy?: { startTileX: number; endTileX: number };
};

export function decodeLevel(
  romPath: string,
  world: number,
  level: number,
): Promise<DecodedLevelResult>;

export function decodeAllLevels(
  romPath: string,
): Promise<readonly DecodedNamedLevel[]>;

export function gridToText(grid: DecodedGrid): string;

export function parseAreaHeader(
  byte0: number,
  byte1: number,
): DecodedAreaHeader;

export function buildMetadata(
  grid: DecodedGrid,
  header: DecodedAreaHeader,
  options?: {
    readonly transitions?: readonly DecodedTransition[];
    readonly cannons?: readonly DecodedCannon[];
    readonly areaTypeName?: string;
    readonly inheritedTimerUnits?: number;
  },
): DecodedLevelMetadata;

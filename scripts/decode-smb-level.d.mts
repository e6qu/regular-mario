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

export type DecodedGrid = string[][];

export type DecodedLevelResult = {
  readonly area: DecodedArea;
  readonly grid: DecodedGrid;
  readonly widthCols: number;
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
};

export type DecodedLevelMetadata = {
  readonly playerStart: { x: number; y: number };
  readonly exits: readonly { x: number; y: number }[];
  readonly timers: readonly { id: string; value: number; unit: string }[];
  readonly transitions: readonly DecodedTransition[];
  readonly questionBlockContentsDefault: string;
  readonly multiLayer: { playerPathRows: readonly string[] };
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

export function buildMetadata(
  grid: DecodedGrid,
  header: { readonly byte0: number; readonly byte1: number },
  transitions?: readonly DecodedTransition[],
): DecodedLevelMetadata;

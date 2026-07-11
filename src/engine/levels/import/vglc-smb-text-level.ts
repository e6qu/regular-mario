import { ActorRole, TileCollisionKind } from "../../domain/level-spec";
import type {
  CheepFrenzyInput,
  FirebarInput,
  LevelSpecInput,
  LoopZoneInput,
  PlatformInput,
  PodobooInput,
} from "../../domain/level-spec";
import type { DomainResult } from "../../domain/result";
import { fail } from "../../domain/result";
import type { ValidationError } from "../../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../../domain/validation-error";
import { parseVglcTextLevel } from "./vglc-text-level";

const defaultVglcSmbTileSizePixels = 16;
const emptyActorCharacter = " ";
const playerStartCharacter = "P";
const exitCharacter = "G";
const finishGoalTileCharacter = "|";
const questionCoinTileCharacter = "c";
const questionPowerUpTileCharacter = "u";
const annotatedPathCharacter = "x";
const annotatedPathId = "vglc-smb-annotated-path";
const multiLayerPlayerPathId = "vglc-smb-multi-layer-player-path";
const transitionPipeActorId = "vglc-smb-transition-pipe";
const transitionIdPattern = /^[a-z][a-z0-9-]*$/;
const invalidOptionalMetadataString = Symbol(
  "invalid-optional-metadata-string",
);
const smbTimerUnitFrameCount = 24;
const authoredMultiCoinBlockSpawnLimit = 10;
const authoredMultiCoinBlockSpawnCooldownFrames = 16;
const authoredExtraLifeBlockSpawnLimit = 1;
const authoredInvincibilityBlockSpawnLimit = 1;
const authoredClimbableBlockSpawnLimit = 1;
const authoredHiddenBlockSpawnLimit = 1;

type VglcSmbTileLegendEntry = {
  readonly tileId: string;
  readonly collision: TileCollisionKind;
  readonly contentsActorId?: string;
  readonly contentSpawnLimit?: number;
  readonly contentSpawnCooldownFrames?: number;
};

const directTerrainCharacters: ReadonlyMap<string, VglcSmbTileLegendEntry> =
  new Map([
    ["-", { tileId: "empty", collision: TileCollisionKind.Empty }],
    ["X", { tileId: "ground", collision: TileCollisionKind.Solid }],
    ["<", { tileId: "pipe-top-left", collision: TileCollisionKind.Solid }],
    [">", { tileId: "pipe-top-right", collision: TileCollisionKind.Solid }],
    ["[", { tileId: "pipe-left", collision: TileCollisionKind.Solid }],
    ["]", { tileId: "pipe-right", collision: TileCollisionKind.Solid }],
    [
      // VGLC marks coin "?" blocks as Q and power-up "?" blocks as ? (the first
      // ? over the goomba is the Super Mushroom). Q dispenses a coin.
      "Q",
      {
        tileId: "full-question-block-coin",
        collision: TileCollisionKind.Interactive,
        contentsActorId: "vglc-smb-coin",
      },
    ],
    [
      "S",
      { tileId: "breakable-block", collision: TileCollisionKind.Breakable },
    ],
    ["B", { tileId: "cannon-top", collision: TileCollisionKind.SolidHazard }],
    ["b", { tileId: "cannon-bottom", collision: TileCollisionKind.Solid }],
    [
      finishGoalTileCharacter,
      { tileId: "flagpole", collision: TileCollisionKind.Goal },
    ],
  ]);

const tileLegendCharacters: ReadonlyMap<string, VglcSmbTileLegendEntry> =
  new Map([
    ...directTerrainCharacters,
    [
      questionCoinTileCharacter,
      {
        tileId: "full-question-block-coin",
        collision: TileCollisionKind.Interactive,
        contentsActorId: "vglc-smb-coin",
      },
    ],
    [
      questionPowerUpTileCharacter,
      {
        tileId: "full-question-block-power-up",
        collision: TileCollisionKind.Interactive,
        contentsActorId: "vglc-smb-power-up",
      },
    ],
  ]);

const directActorCharacters = new Map([
  ["E", { actorId: "vglc-smb-enemy", role: ActorRole.Enemy }],
  ["o", { actorId: "vglc-smb-coin", role: ActorRole.Coin }],
  [
    playerStartCharacter,
    { actorId: "runner-start", role: ActorRole.PlayerStart },
  ],
  [exitCharacter, { actorId: "open-gate", role: ActorRole.Exit }],
]);

const actorLegendCharacters = new Map([
  ...directActorCharacters,
  ["p", { actorId: "vglc-smb-power-up", role: ActorRole.PowerUp }],
  ["+", { actorId: "vglc-smb-extra-life", role: ActorRole.ExtraLife }],
  [
    "*",
    {
      actorId: "vglc-smb-invincibility",
      role: ActorRole.InvincibilityPowerUp,
    },
  ],
  ["H", { actorId: "vglc-smb-climbable", role: ActorRole.Climbable }],
]);

type SmbActorLegendValue = {
  readonly actorId: string;
  readonly role: ActorRole;
  readonly fireproof?: boolean;
  readonly spiky?: boolean;
  readonly turnsAtLedges?: boolean;
  readonly wingedFlight?: "horizontal" | "vertical" | "hop";
  readonly projectileHitPoints?: number;
  readonly colliderWidthPixels?: number;
  readonly colliderHeightPixels?: number;
};

const multiLayerActorLegendCharacters = new Map<string, SmbActorLegendValue>([
  ...actorLegendCharacters,
  ["k", { actorId: "vglc-smb-koopa", role: ActorRole.ArmoredEnemy }],
  // Red Koopa: turns around at ledges instead of walking off.
  [
    "r",
    {
      actorId: "vglc-smb-koopa-red",
      role: ActorRole.ArmoredEnemy,
      turnsAtLedges: true,
    },
  ],
  // Paratroopa variants: winged koopas that drop their wings on the first
  // stomp. K glides horizontally, R oscillates vertically, J hops forward.
  [
    "K",
    {
      actorId: "vglc-smb-parakoopa",
      role: ActorRole.ArmoredEnemy,
      wingedFlight: "horizontal",
    },
  ],
  [
    "R",
    {
      actorId: "vglc-smb-parakoopa-red",
      role: ActorRole.ArmoredEnemy,
      wingedFlight: "vertical",
    },
  ],
  [
    "J",
    {
      actorId: "vglc-smb-parakoopa-hopper",
      role: ActorRole.ArmoredEnemy,
      wingedFlight: "hop",
    },
  ],
  // Buzzy Beetle: an armored shell like a Koopa, but fireballs bounce off it.
  [
    "t",
    {
      actorId: "vglc-smb-turtle",
      role: ActorRole.ArmoredEnemy,
      fireproof: true,
    },
  ],
  // Spiny: a spiked walker — stomping it hurts the player.
  [
    "s",
    {
      actorId: "vglc-smb-spiny",
      role: ActorRole.Enemy,
      spiky: true,
    },
  ],
  ["h", { actorId: "vglc-smb-throwing-enemy", role: ActorRole.ThrowingEnemy }],
  [
    "l",
    {
      actorId: "vglc-smb-aerial-throwing-enemy",
      role: ActorRole.AerialThrowingEnemy,
    },
  ],
  // Piranha Plant: rises out of a pipe on a cycle (also placeable via the
  // piranhaPlants metadata so it can share a cell with the pipe mouth).
  ["n", { actorId: "vglc-smb-piranha", role: ActorRole.PiranhaPlant }],
  // Bowser: spiked (stomping hurts), stays on his bridge, and soaks five
  // fireballs. From world 6 on he throws hammers (the throwing-enemy
  // variant); earlier castles get the pacing variant plus flame spawners.
  [
    "w",
    {
      actorId: "vglc-smb-bowser",
      role: ActorRole.Enemy,
      spiky: true,
      turnsAtLedges: true,
      projectileHitPoints: 5,
      colliderWidthPixels: 28,
      colliderHeightPixels: 28,
    },
  ],
  [
    "W",
    {
      actorId: "vglc-smb-bowser-hammers",
      role: ActorRole.ThrowingEnemy,
      spiky: true,
      projectileHitPoints: 5,
      colliderWidthPixels: 28,
      colliderHeightPixels: 28,
    },
  ],
  // Water enemies (F=fish, q=squid; b/c are cannon/coin tiles): a Cheep-cheep
  // swims (flying behavior underwater) and a Blooper pulses toward the swimmer
  // (chasing behavior).
  ["F", { actorId: "vglc-smb-cheep", role: ActorRole.FlyingEnemy }],
  ["q", { actorId: "vglc-smb-blooper", role: ActorRole.ChasingEnemy }],
]);

const transitionPipeActorDefinition = {
  actorId: transitionPipeActorId,
  role: ActorRole.Pipe,
};

const rawPipeTransitionSymbols = new Set(["<", ">", "[", "]"]);
const multiLayerPipeTransitionSymbols = new Set([
  "[",
  "]",
  "p",
  "P",
  "d",
  "D",
  "{",
  "}",
]);

const multiLayerStructuralTerrainCharacters: ReadonlyMap<
  string,
  VglcSmbTileLegendEntry
> = new Map([
  ["-", { tileId: "empty", collision: TileCollisionKind.Empty }],
  ["#", { tileId: "ground", collision: TileCollisionKind.Solid }],
  ["|", { tileId: "flagpole", collision: TileCollisionKind.Goal }],
  ["[", { tileId: "pipe-top-left", collision: TileCollisionKind.Solid }],
  ["]", { tileId: "pipe-top-right", collision: TileCollisionKind.Solid }],
  ["p", { tileId: "pipe-left", collision: TileCollisionKind.Solid }],
  ["P", { tileId: "pipe-right", collision: TileCollisionKind.Solid }],
  ["d", { tileId: "pipe-left", collision: TileCollisionKind.Solid }],
  ["D", { tileId: "pipe-right", collision: TileCollisionKind.Solid }],
  ["{", { tileId: "pipe-top-left", collision: TileCollisionKind.Solid }],
  ["}", { tileId: "pipe-top-right", collision: TileCollisionKind.Solid }],
  [
    "?",
    {
      tileId: "full-question-block-coin",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-coin",
    },
  ],
  [
    "O",
    {
      tileId: "multi-coin-brick",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-coin",
      contentSpawnLimit: authoredMultiCoinBlockSpawnLimit,
      contentSpawnCooldownFrames: authoredMultiCoinBlockSpawnCooldownFrames,
    },
  ],
  [
    "+",
    {
      tileId: "extra-life-brick",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-extra-life",
      contentSpawnLimit: authoredExtraLifeBlockSpawnLimit,
    },
  ],
  [
    "*",
    {
      tileId: "star-block",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-invincibility",
      contentSpawnLimit: authoredInvincibilityBlockSpawnLimit,
    },
  ],
  [
    "H",
    {
      tileId: "beanstalk-block",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-climbable",
      contentSpawnLimit: authoredClimbableBlockSpawnLimit,
    },
  ],
  [
    "M",
    {
      tileId: "full-question-block-power-up",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-power-up",
    },
  ],
  ["B", { tileId: "breakable-block", collision: TileCollisionKind.Breakable }],
  [
    // A brick with an embedded power-up: keeps the brick look, dispenses on bump.
    "m",
    {
      tileId: "power-up-brick",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-power-up",
    },
  ],
  [
    // Hidden blocks are intangible and invisible until bumped from below.
    "i",
    {
      tileId: "hidden-coin-block",
      collision: TileCollisionKind.Hidden,
      contentsActorId: "vglc-smb-coin",
      contentSpawnLimit: authoredHiddenBlockSpawnLimit,
    },
  ],
  [
    "I",
    {
      tileId: "hidden-extra-life-block",
      collision: TileCollisionKind.Hidden,
      contentsActorId: "vglc-smb-extra-life",
      contentSpawnLimit: authoredHiddenBlockSpawnLimit,
    },
  ],
  // SMB cannon towers are safe to stand on and walk against; only the fired
  // Bullet Bills (cannonProjectiles metadata) are the hazard.
  ["C", { tileId: "cannon-top", collision: TileCollisionKind.Solid }],
  ["c", { tileId: "cannon-bottom", collision: TileCollisionKind.Solid }],
  ["V", { tileId: "plant-hazard", collision: TileCollisionKind.Hazard }],
  ["X", { tileId: "plant-hazard", collision: TileCollisionKind.Hazard }],
  ["Y", { tileId: "spring-top", collision: TileCollisionKind.Spring }],
  ["y", { tileId: "spring-bottom", collision: TileCollisionKind.Solid }],
  // The castle-bridge planks Bowser guards (chopped by reaching the axe).
  ["=", { tileId: "castle-bridge", collision: TileCollisionKind.Solid }],
]);

const multiLayerTileLegendCharacters: ReadonlyMap<
  string,
  VglcSmbTileLegendEntry
> = new Map([...multiLayerStructuralTerrainCharacters]);

const multiLayerStructuralActorCharacters = new Map([
  ["g", { actorCharacter: "E" }],
  ["o", { actorCharacter: "o" }],
  ["k", { actorCharacter: "k" }],
  ["r", { actorCharacter: "r" }],
  ["K", { actorCharacter: "K" }],
  ["R", { actorCharacter: "R" }],
  ["J", { actorCharacter: "J" }],
  ["t", { actorCharacter: "t" }],
  ["s", { actorCharacter: "s" }],
  ["h", { actorCharacter: "h" }],
  ["l", { actorCharacter: "l" }],
  ["n", { actorCharacter: "n" }],
  ["w", { actorCharacter: "w" }],
  ["W", { actorCharacter: "W" }],
  ["F", { actorCharacter: "F" }],
  ["q", { actorCharacter: "q" }],
]);

type VglcSmbUnsupportedFeature = {
  readonly featureId: string;
  readonly reason: string;
};

const unsupportedCharacters: ReadonlyMap<string, VglcSmbUnsupportedFeature> =
  new Map();

const multiLayerUnsupportedCharacters: ReadonlyMap<
  string,
  VglcSmbUnsupportedFeature
> = new Map<string, VglcSmbUnsupportedFeature>(
  (
    [
      [">", "left-right moving platform"],
      ["v", "up-down moving platform"],
    ] as readonly (readonly [string, string])[]
  ).map(([character, label]) => [
    character,
    {
      featureId: `vglc-smb-multi-layer-${String(label).replaceAll(" ", "-")}`,
      reason: `${label} behavior is not represented before direct SMB multi-layer parity.`,
    },
  ]),
);

const unsupportedMetadataFields: ReadonlyMap<
  string,
  VglcSmbUnsupportedFeature
> = new Map();

const rawTextUnsupportedMetadataFields: ReadonlyMap<
  string,
  VglcSmbUnsupportedFeature
> = new Map([
  [
    "multiLayer",
    {
      featureId: "vglc-smb-multi-layer",
      reason:
        "multi-layer source data requires the vglc-smb-multi-layer import format.",
    },
  ],
  [
    "piranhaPlants",
    {
      featureId: "vglc-smb-piranha-plants",
      reason:
        "piranha plant metadata requires the vglc-smb-multi-layer import format.",
    },
  ],
]);

type VglcSmbCellClassification =
  | {
      readonly kind: "terrain";
      readonly tileCharacter: string;
      readonly actorCharacter: string;
    }
  | {
      readonly kind: "unsupported";
      readonly feature: VglcSmbUnsupportedFeature;
    }
  | {
      readonly kind: "unknown";
    };

type VglcSmbCellClassifier = (
  character: string,
  point: VglcSmbPoint,
) => VglcSmbCellClassification;

type VglcSmbConvertedRows = {
  readonly tileRows: string[];
  readonly actorRows: string[];
};

type ConvertedVglcSmbImportInput = {
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileLegend: Readonly<Record<string, VglcSmbTileLegendEntry>>;
  readonly actorLegend: Readonly<
    Record<string, { readonly actorId: string; readonly role: ActorRole }>
  >;
  readonly convertedRows: VglcSmbConvertedRows;
  readonly metadata: VglcSmbTextImportMetadata;
  readonly pathPoints: readonly VglcSmbPoint[];
  readonly pathId: string;
};

enum VglcSmbImportMetadataMode {
  RawText = "raw-text",
  MultiLayer = "multi-layer",
}

type VglcSmbPoint = {
  readonly x: number;
  readonly y: number;
};

type VglcSmbQuestionBlockContents = "coin" | "power-up";

type VglcSmbQuestionBlockMetadata = VglcSmbPoint & {
  readonly contents: VglcSmbQuestionBlockContents;
};

type VglcSmbTimerMetadata = {
  readonly id: string;
  readonly frames: number;
};

type VglcSmbCannonProjectileMetadata = {
  readonly spawnerId: string;
  readonly x: number;
  readonly y: number;
  readonly direction: "left" | "right";
  readonly intervalFrames: number;
  readonly initialDelayFrames: number;
  readonly speedPixelsPerSecond: number;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly lifetimeFrames: number;
};

type VglcSmbPathAnnotationMetadata = {
  readonly pathId: string;
  readonly points: readonly VglcSmbPoint[];
};

type VglcSmbTransitionMetadata = VglcSmbPoint & {
  readonly id: string;
  readonly targetLevelName: string | undefined;
  readonly targetTileX: number;
  readonly targetTileY: number;
  // Walk-in pipes (side exits, intro pipes) declare which way the player moves
  // into the mouth; absent means the classic press-down top entry.
  readonly entryDirection: "left" | "right" | undefined;
};

type VglcSmbMultiLayerMetadata = {
  readonly playerPathRows: readonly string[];
};

type VglcSmbTextImportMetadata = {
  readonly playerStart: VglcSmbPoint | undefined;
  readonly exits: readonly VglcSmbPoint[];
  readonly questionBlocks: readonly VglcSmbQuestionBlockMetadata[];
  readonly questionBlockContentsDefault:
    | VglcSmbQuestionBlockContents
    | undefined;
  readonly timers: readonly VglcSmbTimerMetadata[];
  readonly cannonProjectiles: readonly VglcSmbCannonProjectileMetadata[];
  // Flame volleys (Bowser's breath, the castles' \$15 spawners): the same
  // spawner shape as cannonProjectiles but not anchored to a cannon tile.
  readonly flameSpawners: readonly VglcSmbCannonProjectileMetadata[];
  readonly pathAnnotations: readonly VglcSmbPathAnnotationMetadata[];
  readonly transitions: readonly VglcSmbTransitionMetadata[];
  readonly multiLayer: VglcSmbMultiLayerMetadata | undefined;
  readonly cheepFrenzy: CheepFrenzyInput | undefined;
  readonly flyingCheepFrenzy: CheepFrenzyInput | undefined;
  readonly bulletBillFrenzy: CheepFrenzyInput | undefined;
  readonly piranhaPlants: readonly VglcSmbPoint[];
  readonly firebars: readonly FirebarInput[];
  readonly podoboos: readonly PodobooInput[];
  readonly platforms: readonly PlatformInput[];
  readonly loopZones: readonly LoopZoneInput[];
};

export function parseVglcSmbTextLevel(
  text: string,
  metadataInput?: unknown,
): DomainResult<LevelSpecInput, ValidationError> {
  const rows = splitVglcRows(text);
  const errors = collectVglcSmbRowErrors(rows);
  const metadata = parseVglcSmbTextImportMetadata(
    metadataInput,
    VglcSmbImportMetadataMode.RawText,
    errors,
  );

  if (errors.length > 0) {
    return fail(errors);
  }

  const widthTiles = rows[0]?.length ?? 0;
  const annotatedPathPoints: VglcSmbPoint[] = [];
  const questionBlockLookup = makeQuestionBlockMetadataLookup(
    rows,
    metadata.questionBlocks,
    errors,
  );
  validateQuestionBlockContentsDefault(rows, metadata, errors);
  validateCannonProjectileMetadata(rows, metadata.cannonProjectiles, errors);
  validatePathAnnotationMetadata(rows, metadata.pathAnnotations, errors);
  validateTransitionMetadata(rows, metadata.transitions, errors);
  const convertedRows = convertVglcSmbRows(
    rows,
    (character, point) =>
      classifyVglcSmbCell(
        character,
        point,
        questionBlockLookup,
        metadata.questionBlockContentsDefault,
      ),
    {
      unsupportedSubject: "VGLC SMB character",
      unknownDescription: "the supported VGLC SMB symbol set",
      invalidDescription: "VGLC SMB cell classification",
      annotatedPathPoints,
    },
    errors,
  );

  return finishConvertedVglcSmbImport({
    widthTiles,
    heightTiles: rows.length,
    tileLegend: Object.fromEntries(tileLegendCharacters),
    actorLegend: Object.fromEntries(actorLegendCharacters),
    convertedRows,
    metadata,
    pathPoints: annotatedPathPoints,
    pathId: annotatedPathId,
    errors,
  });
}

export function parseVglcSmbMultiLayerLevel(
  structuralLayerText: string,
  metadataInput?: unknown,
): DomainResult<LevelSpecInput, ValidationError> {
  const structuralRows = splitVglcRows(structuralLayerText);
  const errors = collectVglcSmbRowErrors(structuralRows);
  const metadata = parseVglcSmbTextImportMetadata(
    metadataInput,
    VglcSmbImportMetadataMode.MultiLayer,
    errors,
  );

  if (errors.length > 0) {
    return fail(errors);
  }

  const widthTiles = structuralRows[0]?.length ?? 0;
  const playerPathPoints = collectMultiLayerPlayerPathPoints(
    structuralRows,
    metadata.multiLayer?.playerPathRows ?? [],
    errors,
  );

  validateCannonProjectileMetadata(
    structuralRows,
    metadata.cannonProjectiles,
    errors,
    "C",
  );
  validatePathAnnotationMetadata(
    structuralRows,
    metadata.pathAnnotations,
    errors,
  );
  validateTransitionMetadata(
    structuralRows,
    metadata.transitions,
    errors,
    multiLayerPipeTransitionSymbols,
  );
  const convertedRows = convertVglcSmbRows(
    structuralRows,
    (character) => classifyVglcSmbMultiLayerStructuralCell(character),
    {
      unsupportedSubject: "VGLC SMB multi-layer character",
      unknownDescription:
        "the supported VGLC SMB multi-layer structural symbol set",
      invalidDescription: "VGLC SMB multi-layer cell classification",
    },
    errors,
  );

  return finishConvertedVglcSmbImport({
    widthTiles,
    heightTiles: structuralRows.length,
    tileLegend: Object.fromEntries(multiLayerTileLegendCharacters),
    actorLegend: Object.fromEntries(multiLayerActorLegendCharacters),
    convertedRows,
    metadata,
    pathPoints: playerPathPoints,
    pathId: multiLayerPlayerPathId,
    errors,
  });
}

function convertVglcSmbRows(
  rows: readonly string[],
  classifyCell: VglcSmbCellClassifier,
  context: {
    readonly unsupportedSubject: string;
    readonly unknownDescription: string;
    readonly invalidDescription: string;
    readonly annotatedPathPoints?: VglcSmbPoint[];
  },
  errors: ValidationError[],
): VglcSmbConvertedRows {
  const tileRows: string[] = [];
  const actorRows: string[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    const rowResult = convertVglcSmbRow(
      row,
      rowIndex,
      classifyCell,
      context,
      errors,
    );
    tileRows.push(rowResult.tileRow);
    actorRows.push(rowResult.actorRow);
  }

  return { tileRows, actorRows };
}

function convertVglcSmbRow(
  row: string,
  rowIndex: number,
  classifyCell: VglcSmbCellClassifier,
  context: {
    readonly unsupportedSubject: string;
    readonly unknownDescription: string;
    readonly invalidDescription: string;
    readonly annotatedPathPoints?: VglcSmbPoint[];
  },
  errors: ValidationError[],
): { readonly tileRow: string; readonly actorRow: string } {
  let tileRow = "";
  let actorRow = "";

  for (const [columnIndex, character] of [...row].entries()) {
    if (
      context.annotatedPathPoints !== undefined &&
      character === annotatedPathCharacter
    ) {
      context.annotatedPathPoints.push({ x: columnIndex, y: rowIndex });
      tileRow += "-";
      actorRow += emptyActorCharacter;
      continue;
    }

    const point = { x: columnIndex, y: rowIndex };
    const classification = classifyCell(character, point);
    const convertedCell = convertClassifiedVglcSmbCell(
      character,
      point,
      classification,
      context,
      errors,
    );
    tileRow += convertedCell.tileCharacter;
    actorRow += convertedCell.actorCharacter;
  }

  return { tileRow, actorRow };
}

function convertClassifiedVglcSmbCell(
  character: string,
  point: VglcSmbPoint,
  classification: VglcSmbCellClassification,
  context: {
    readonly unsupportedSubject: string;
    readonly unknownDescription: string;
    readonly invalidDescription: string;
  },
  errors: ValidationError[],
): { readonly tileCharacter: string; readonly actorCharacter: string } {
  const path = `rows[${point.y}][${point.x}]`;

  switch (classification.kind) {
    case "terrain":
      return {
        tileCharacter: classification.tileCharacter,
        actorCharacter: classification.actorCharacter,
      };
    case "unsupported":
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcCharacterUnsupported,
          `${context.unsupportedSubject} ${character} is unsupported (${classification.feature.featureId}): ${classification.feature.reason}`,
          path,
        ),
      );
      return {
        tileCharacter: "-",
        actorCharacter: emptyActorCharacter,
      };
    case "unknown":
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcTileCharacterUnknown,
          `${path} character ${character} is not in ${context.unknownDescription}.`,
          path,
        ),
      );
      return {
        tileCharacter: character,
        actorCharacter: emptyActorCharacter,
      };
    default: {
      const invalidClassification: never = classification;
      throw new Error(
        `Invalid ${context.invalidDescription}: ${String(invalidClassification)}`,
      );
    }
  }
}

function parseConvertedVglcSmbRows(
  input: ConvertedVglcSmbImportInput,
): DomainResult<LevelSpecInput, ValidationError> {
  const parsed = parseVglcTextLevel({
    widthTiles: input.widthTiles,
    heightTiles: input.heightTiles,
    tileSizePixels: defaultVglcSmbTileSizePixels,
    tileLegend: input.tileLegend,
    actorLegend: input.actorLegend,
    tileRows: input.convertedRows.tileRows,
    actorRows: input.convertedRows.actorRows,
    levelTimers: input.metadata.timers.map((timer) => ({
      timerId: timer.id,
      frames: timer.frames,
    })),
    timedHazardProjectileSpawners: [
      ...input.metadata.cannonProjectiles,
      ...input.metadata.flameSpawners,
    ],
    pathAnnotations: mergePathAnnotations(
      input.pathPoints,
      input.metadata.pathAnnotations,
      input.pathId,
    ),
  });

  if (!parsed.ok) {
    return parsed;
  }

  const withFrenzy: LevelSpecInput = {
    ...parsed.value,
    ...(input.metadata.cheepFrenzy === undefined
      ? {}
      : { cheepFrenzy: input.metadata.cheepFrenzy }),
    ...(input.metadata.flyingCheepFrenzy === undefined
      ? {}
      : { flyingCheepFrenzy: input.metadata.flyingCheepFrenzy }),
    ...(input.metadata.bulletBillFrenzy === undefined
      ? {}
      : { bulletBillFrenzy: input.metadata.bulletBillFrenzy }),
  };

  const withFlames: LevelSpecInput =
    input.metadata.firebars.length === 0 && input.metadata.podoboos.length === 0
      ? withFrenzy
      : {
          ...withFrenzy,
          firebars: input.metadata.firebars,
          podoboos: input.metadata.podoboos,
        };

  const withPlatforms: LevelSpecInput =
    input.metadata.platforms.length === 0
      ? withFlames
      : { ...withFlames, platforms: input.metadata.platforms };

  const withLoopZones: LevelSpecInput =
    input.metadata.loopZones.length === 0
      ? withPlatforms
      : { ...withPlatforms, loopZones: input.metadata.loopZones };

  const withPlants = withPiranhaPlants(
    withLoopZones,
    input.metadata.piranhaPlants,
  );

  if (input.metadata.transitions.length === 0) {
    return { ok: true, value: withPlants };
  }

  return {
    ok: true,
    value: withTransitionPipes(withPlants, input.metadata.transitions),
  };
}

// Piranha Plants declared in metadata share their cell with a pipe-mouth tile
// (a grid cell holds one symbol), so they are injected as extra actor
// placements rather than actor-layer characters.
const metadataPiranhaActorId = "vglc-smb-piranha";

function withPiranhaPlants(
  levelSpecInput: LevelSpecInput,
  piranhaPlants: readonly VglcSmbPoint[],
): LevelSpecInput {
  if (piranhaPlants.length === 0) {
    return levelSpecInput;
  }
  return {
    ...levelSpecInput,
    actors: [
      ...levelSpecInput.actors,
      ...piranhaPlants.map((plant, index) => ({
        entityId: `vglc-smb-piranha-${String(index)}`,
        actorId: metadataPiranhaActorId,
        x: plant.x,
        y: plant.y,
      })),
    ],
  };
}

function withTransitionPipes(
  levelSpecInput: LevelSpecInput,
  transitions: readonly VglcSmbTransitionMetadata[],
): LevelSpecInput {
  return {
    ...levelSpecInput,
    actorDefinitions: [
      ...levelSpecInput.actorDefinitions,
      transitionPipeActorDefinition,
    ],
    actors: [
      ...levelSpecInput.actors,
      ...transitions.map((transition) => ({
        entityId: `vglc-smb-transition-${transition.id}`,
        actorId: transitionPipeActorDefinition.actorId,
        x: transition.x,
        y: transition.y,
        targetTileX: transition.targetTileX,
        targetTileY: transition.targetTileY,
        ...(transition.targetLevelName === undefined
          ? {}
          : { targetLevelName: transition.targetLevelName }),
        ...(transition.entryDirection === undefined
          ? {}
          : { pipeEntryDirection: transition.entryDirection }),
      })),
    ],
  };
}

function finishConvertedVglcSmbImport(
  input: ConvertedVglcSmbImportInput & {
    readonly errors: ValidationError[];
  },
): DomainResult<LevelSpecInput, ValidationError> {
  applyMetadataActors(
    input.convertedRows.actorRows,
    input.metadata,
    input.errors,
  );
  applyMetadataGoalColumns(input.convertedRows.tileRows, input.metadata);
  input.errors.push(
    ...collectRequiredMetadataErrors(input.convertedRows.actorRows),
  );

  if (input.errors.length > 0) {
    return fail(input.errors);
  }

  return parseConvertedVglcSmbRows(input);
}

function makeEmptyImportMetadata(): VglcSmbTextImportMetadata {
  return {
    playerStart: undefined,
    exits: [],
    questionBlocks: [],
    questionBlockContentsDefault: undefined,
    timers: [],
    cannonProjectiles: [],
    flameSpawners: [],
    pathAnnotations: [],
    transitions: [],
    multiLayer: undefined,
    cheepFrenzy: undefined,
    flyingCheepFrenzy: undefined,
    bulletBillFrenzy: undefined,
    piranhaPlants: [],
    firebars: [],
    podoboos: [],
    platforms: [],
    loopZones: [],
  };
}

function parseVglcSmbTextImportMetadata(
  input: unknown,
  mode: VglcSmbImportMetadataMode,
  errors: ValidationError[],
): VglcSmbTextImportMetadata {
  if (input === undefined) {
    return makeEmptyImportMetadata();
  }

  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        "VGLC SMB import metadata must be an object.",
        "metadata",
      ),
    );

    return makeEmptyImportMetadata();
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  pushUnsupportedMetadataFieldErrors(candidate, mode, errors);

  return {
    playerStart: parseOptionalPoint(
      candidate.playerStart,
      "metadata.playerStart",
      errors,
    ),
    exits: parsePointArray(candidate.exits, "metadata.exits", errors),
    questionBlocks: parseQuestionBlockArray(
      candidate.questionBlocks,
      "metadata.questionBlocks",
      errors,
    ),
    questionBlockContentsDefault: parseOptionalQuestionBlockContents(
      candidate.questionBlockContentsDefault,
      "metadata.questionBlockContentsDefault",
      errors,
    ),
    timers: parseTimerMetadata(candidate, errors),
    cannonProjectiles: parseCannonProjectileArray(
      candidate.cannonProjectiles,
      "metadata.cannonProjectiles",
      errors,
    ),
    flameSpawners: parseCannonProjectileArray(
      candidate.flameSpawners,
      "metadata.flameSpawners",
      errors,
    ),
    pathAnnotations: parsePathAnnotationArray(
      candidate.paths,
      "metadata.paths",
      errors,
    ),
    transitions: parseTransitionArray(
      candidate.transitions,
      "metadata.transitions",
      errors,
    ),
    multiLayer:
      mode === VglcSmbImportMetadataMode.MultiLayer
        ? parseMultiLayerMetadata(candidate.multiLayer, errors)
        : undefined,
    cheepFrenzy: parseCheepFrenzy(candidate.cheepFrenzy, errors),
    flyingCheepFrenzy: parseCheepFrenzy(candidate.flyingCheepFrenzy, errors),
    bulletBillFrenzy: parseCheepFrenzy(candidate.bulletBillFrenzy, errors),
    piranhaPlants: parsePointArray(
      candidate.piranhaPlants,
      "metadata.piranhaPlants",
      errors,
    ),
    firebars: parseFirebarArray(
      candidate.firebars,
      "metadata.firebars",
      errors,
    ),
    podoboos: parsePodobooArray(
      candidate.podoboos,
      "metadata.podoboos",
      errors,
    ),
    platforms: parsePlatformArray(
      candidate.platforms,
      "metadata.platforms",
      errors,
    ),
    loopZones: parseLoopZoneArray(
      candidate.loopZones,
      "metadata.loopZones",
      errors,
    ),
  };
}

function parseLoopZoneArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly LoopZoneInput[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of loop zone metadata objects.`,
        path,
      ),
    );
    return [];
  }
  const loopZones: LoopZoneInput[] = [];
  for (const [index, value] of input.entries()) {
    const itemPath = `${path}[${index}]`;
    const candidate = value as Readonly<Record<string, unknown>> | null;
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.checkTileX !== "number" ||
      typeof candidate.requiredRowMin !== "number" ||
      typeof candidate.requiredRowMax !== "number" ||
      typeof candidate.groupId !== "string" ||
      typeof candidate.groupSize !== "number"
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${itemPath} must have numeric checkTileX/requiredRowMin/requiredRowMax/groupSize and a string groupId.`,
          itemPath,
        ),
      );
      continue;
    }
    loopZones.push({
      loopZoneId: `vglc-smb-loop-${String(index)}`,
      checkTileX: candidate.checkTileX,
      requiredRowMin: candidate.requiredRowMin,
      requiredRowMax: candidate.requiredRowMax,
      groupId: candidate.groupId,
      groupSize: candidate.groupSize,
    });
  }
  return loopZones;
}

function parsePlatformArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly PlatformInput[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of platform metadata objects.`,
        path,
      ),
    );
    return [];
  }
  const platforms: PlatformInput[] = [];
  for (const [index, value] of input.entries()) {
    const itemPath = `${path}[${index}]`;
    const candidate = value as Readonly<Record<string, unknown>> | null;
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.id !== "string" ||
      typeof candidate.kind !== "string" ||
      typeof candidate.x !== "number" ||
      typeof candidate.y !== "number" ||
      typeof candidate.widthTiles !== "number" ||
      (candidate.balancePartnerId !== undefined &&
        typeof candidate.balancePartnerId !== "string")
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${itemPath} must have string id/kind, numeric x/y/widthTiles, and an optional string balancePartnerId.`,
          itemPath,
        ),
      );
      continue;
    }
    platforms.push({
      platformId: candidate.id,
      kind: candidate.kind,
      x: candidate.x,
      y: candidate.y,
      widthTiles: candidate.widthTiles,
      ...(candidate.balancePartnerId === undefined
        ? {}
        : { balancePartnerId: candidate.balancePartnerId }),
    });
  }
  return platforms;
}

// Firebar/podoboo metadata is validated in depth by the level spec; the
// importer only checks the container shape and required field types.
function parseFirebarArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly FirebarInput[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of firebar metadata objects.`,
        path,
      ),
    );
    return [];
  }
  const firebars: FirebarInput[] = [];
  for (const [index, value] of input.entries()) {
    const itemPath = `${path}[${index}]`;
    const candidate = value as Readonly<Record<string, unknown>> | null;
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.x !== "number" ||
      typeof candidate.y !== "number" ||
      typeof candidate.orbCount !== "number" ||
      typeof candidate.direction !== "string" ||
      typeof candidate.speed !== "string"
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${itemPath} must have numeric x/y/orbCount and string direction/speed.`,
          itemPath,
        ),
      );
      continue;
    }
    firebars.push({
      firebarId: `vglc-smb-firebar-${String(index)}`,
      x: candidate.x,
      y: candidate.y,
      orbCount: candidate.orbCount,
      direction: candidate.direction,
      speed: candidate.speed,
    });
  }
  return firebars;
}

function parsePodobooArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly PodobooInput[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of podoboo metadata objects.`,
        path,
      ),
    );
    return [];
  }
  const podoboos: PodobooInput[] = [];
  for (const [index, value] of input.entries()) {
    const itemPath = `${path}[${index}]`;
    const candidate = value as Readonly<Record<string, unknown>> | null;
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.x !== "number" ||
      typeof candidate.phaseOffsetFrames !== "number"
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${itemPath} must have numeric x and phaseOffsetFrames.`,
          itemPath,
        ),
      );
      continue;
    }
    podoboos.push({
      podobooId: `vglc-smb-podoboo-${String(index)}`,
      x: candidate.x,
      phaseOffsetFrames: candidate.phaseOffsetFrames,
    });
  }
  return podoboos;
}

// Parse the underwater Cheep-cheep frenzy region ({startTileX,endTileX}) the
// decoder emits into water-level metadata; absent for every other level.
function parseCheepFrenzy(
  value: unknown,
  errors: ValidationError[],
): CheepFrenzyInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { startTileX?: unknown }).startTileX !== "number" ||
    typeof (value as { endTileX?: unknown }).endTileX !== "number"
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        "metadata.cheepFrenzy must be { startTileX, endTileX } numbers.",
        "metadata.cheepFrenzy",
      ),
    );
    return undefined;
  }
  const region = value as { startTileX: number; endTileX: number };
  return { startTileX: region.startTileX, endTileX: region.endTileX };
}

function mergePathAnnotations(
  annotatedPathPoints: readonly VglcSmbPoint[],
  metadataPathAnnotations: readonly VglcSmbPathAnnotationMetadata[],
  pathId = annotatedPathId,
): LevelSpecInput["pathAnnotations"] {
  return [
    ...(annotatedPathPoints.length > 0
      ? [
          {
            pathId,
            points: annotatedPathPoints,
          },
        ]
      : []),
    ...metadataPathAnnotations,
  ];
}

function pushUnsupportedMetadataFieldErrors(
  candidate: Readonly<Record<string, unknown>>,
  mode: VglcSmbImportMetadataMode,
  errors: ValidationError[],
): void {
  const unsupportedFields = new Map([
    ...(mode === VglcSmbImportMetadataMode.RawText
      ? rawTextUnsupportedMetadataFields
      : []),
    ...unsupportedMetadataFields,
  ]);

  for (const [field, feature] of unsupportedFields) {
    if (candidate[field] === undefined) {
      continue;
    }

    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataUnsupported,
        `VGLC SMB import metadata field ${field} is unsupported (${feature.featureId}): ${feature.reason}`,
        `metadata.${field}`,
      ),
    );
  }
}

function parseMultiLayerMetadata(
  input: unknown,
  errors: ValidationError[],
): VglcSmbMultiLayerMetadata | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        "metadata.multiLayer must be a multi-layer metadata object.",
        "metadata.multiLayer",
      ),
    );

    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const playerPathRows = parseOptionalTextLayer(
    candidate.playerPathLayer,
    "metadata.multiLayer.playerPathLayer",
    errors,
  );

  if (playerPathRows === undefined) {
    return undefined;
  }

  return {
    playerPathRows,
  };
}

function parseOptionalTextLayer(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly string[] | undefined {
  if (input === undefined) {
    return [];
  }

  if (typeof input !== "string") {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be plain text.`,
        path,
      ),
    );

    return undefined;
  }

  return splitVglcRows(input);
}

function parsePathAnnotationArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly VglcSmbPathAnnotationMetadata[] {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of path annotation metadata objects.`,
        path,
      ),
    );

    return [];
  }

  const pathAnnotations: VglcSmbPathAnnotationMetadata[] = [];

  for (const [index, value] of input.entries()) {
    const pathAnnotation = parsePathAnnotation(
      value,
      `${path}[${index}]`,
      errors,
    );

    if (pathAnnotation !== undefined) {
      pathAnnotations.push(pathAnnotation);
    }
  }

  return pathAnnotations;
}

function parseTransitionArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly VglcSmbTransitionMetadata[] {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of transition metadata objects.`,
        path,
      ),
    );

    return [];
  }

  const transitions: VglcSmbTransitionMetadata[] = [];

  for (const [index, value] of input.entries()) {
    const transition = parseTransition(value, `${path}[${index}]`, errors);

    if (transition !== undefined) {
      transitions.push(transition);
    }
  }

  return transitions;
}

function parseTransition(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbTransitionMetadata | undefined {
  const point = parsePoint(input, path, errors);

  if (point === undefined) {
    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const id = parseNonEmptyMetadataString(candidate.id, `${path}.id`, errors);
  const idIsValid = validateTransitionId(id, `${path}.id`, errors);
  const targetLevelName = parseOptionalMetadataString(
    candidate.targetLevelName,
    `${path}.targetLevelName`,
    errors,
  );
  const targetTileX = parseNonNegativeSafeIntegerMetadata(
    candidate.targetTileX,
    `${path}.targetTileX`,
    errors,
  );
  const targetTileY = parseNonNegativeSafeIntegerMetadata(
    candidate.targetTileY,
    `${path}.targetTileY`,
    errors,
  );

  const entryDirection = parseOptionalTransitionEntryDirection(
    candidate.entryDirection,
    `${path}.entryDirection`,
    errors,
  );

  if (
    id === undefined ||
    !idIsValid ||
    targetLevelName === invalidOptionalMetadataString ||
    targetTileX === undefined ||
    targetTileY === undefined ||
    entryDirection === invalidOptionalMetadataString
  ) {
    return undefined;
  }

  return {
    ...point,
    id,
    targetLevelName,
    targetTileX,
    targetTileY,
    entryDirection,
  };
}

function parseOptionalTransitionEntryDirection(
  input: unknown,
  path: string,
  errors: ValidationError[],
): "left" | "right" | undefined | typeof invalidOptionalMetadataString {
  if (input === undefined) {
    return undefined;
  }
  if (input === "left" || input === "right") {
    return input;
  }
  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be "left" or "right".`,
      path,
    ),
  );
  return invalidOptionalMetadataString;
}

function validateTransitionId(
  id: string | undefined,
  path: string,
  errors: ValidationError[],
): boolean {
  if (id === undefined || transitionIdPattern.test(id)) {
    return true;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.`,
      path,
    ),
  );

  return false;
}

function parsePathAnnotation(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbPathAnnotationMetadata | undefined {
  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be a path annotation metadata object.`,
        path,
      ),
    );

    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const pathId = parseNonEmptyMetadataString(
    candidate.id ?? candidate.pathId,
    `${path}.pathId`,
    errors,
  );
  const points = parseRequiredPointArray(
    candidate.points,
    `${path}.points`,
    errors,
  );

  if (points.length === 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path}.points must contain at least one tile coordinate.`,
        `${path}.points`,
      ),
    );
  }

  if (pathId === undefined || points.length === 0) {
    return undefined;
  }

  return {
    pathId,
    points,
  };
}

function parseRequiredPointArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly VglcSmbPoint[] {
  if (input === undefined) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of tile coordinate objects.`,
        path,
      ),
    );

    return [];
  }

  return parsePointArray(input, path, errors);
}

function validatePathAnnotationMetadata(
  rows: readonly string[],
  pathAnnotations: readonly VglcSmbPathAnnotationMetadata[],
  errors: ValidationError[],
): void {
  for (const [annotationIndex, pathAnnotation] of pathAnnotations.entries()) {
    for (const [pointIndex, point] of pathAnnotation.points.entries()) {
      const path = `metadata.paths[${annotationIndex}].points[${pointIndex}]`;
      const row = rows[point.y];

      if (row === undefined || point.x >= row.length) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.VglcMetadataInvalid,
            `${path} must be inside the VGLC SMB text bounds.`,
            path,
          ),
        );
      }
    }
  }
}

function collectMultiLayerPlayerPathPoints(
  structuralRows: readonly string[],
  playerPathRows: readonly string[],
  errors: ValidationError[],
): readonly VglcSmbPoint[] {
  if (playerPathRows.length === 0) {
    return [];
  }

  const points: VglcSmbPoint[] = [];

  if (playerPathRows.length !== structuralRows.length) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        "metadata.multiLayer.playerPathLayer row count must match the structural layer.",
        "metadata.multiLayer.playerPathLayer",
      ),
    );
    return [];
  }

  const widthTiles = structuralRows[0]?.length ?? 0;

  for (const [rowIndex, row] of playerPathRows.entries()) {
    if (row.length !== widthTiles) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `metadata.multiLayer.playerPathLayer row ${rowIndex} width must match the structural layer width.`,
          `metadata.multiLayer.playerPathLayer[${rowIndex}]`,
        ),
      );
      continue;
    }

    for (const [columnIndex, character] of [...row].entries()) {
      if (character === "x") {
        points.push({ x: columnIndex, y: rowIndex });
      } else if (character !== "-") {
        errors.push(
          makeValidationError(
            ValidationErrorCode.VglcMetadataInvalid,
            `metadata.multiLayer.playerPathLayer[${rowIndex}][${columnIndex}] must be - or x.`,
            `metadata.multiLayer.playerPathLayer[${rowIndex}][${columnIndex}]`,
          ),
        );
      }
    }
  }

  return points;
}

function parseTimerMetadata(
  candidate: Readonly<Record<string, unknown>>,
  errors: ValidationError[],
): readonly VglcSmbTimerMetadata[] {
  const singleTimer = parseOptionalTimer(
    candidate.timer,
    "metadata.timer",
    errors,
  );
  const timerArray = parseTimerArray(
    candidate.timers,
    "metadata.timers",
    errors,
  );

  return singleTimer === undefined ? timerArray : [singleTimer, ...timerArray];
}

function parseOptionalTimer(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbTimerMetadata | undefined {
  if (input === undefined) {
    return undefined;
  }

  return parseTimer(input, path, errors);
}

function parseTimerArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly VglcSmbTimerMetadata[] {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of timer metadata objects.`,
        path,
      ),
    );

    return [];
  }

  const timers: VglcSmbTimerMetadata[] = [];

  for (const [index, value] of input.entries()) {
    const timer = parseTimer(value, `${path}[${index}]`, errors);

    if (timer !== undefined) {
      timers.push(timer);
    }
  }

  return timers;
}

function parseTimer(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbTimerMetadata | undefined {
  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be a timer metadata object.`,
        path,
      ),
    );

    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;

  if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path}.id must be a non-empty string.`,
        `${path}.id`,
      ),
    );

    return undefined;
  }

  if (
    typeof candidate.value !== "number" ||
    !Number.isSafeInteger(candidate.value) ||
    candidate.value <= 0
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path}.value must be a positive safe integer frame count.`,
        `${path}.value`,
      ),
    );

    return undefined;
  }

  const timerUnit = parseTimerUnit(candidate.unit, `${path}.unit`, errors);

  if (timerUnit === undefined) {
    return undefined;
  }

  const frames = convertTimerValueToFrames(
    candidate.value,
    timerUnit,
    `${path}.value`,
    errors,
  );

  if (frames === undefined) {
    return undefined;
  }

  return {
    id: candidate.id,
    frames,
  };
}

function parseTimerUnit(
  input: unknown,
  path: string,
  errors: ValidationError[],
): "frames" | "smb-time-units" | undefined {
  if (input === undefined || input === "frames") {
    return "frames";
  }

  if (input === "smb-time-units") {
    return "smb-time-units";
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be frames or smb-time-units.`,
      path,
    ),
  );

  return undefined;
}

function convertTimerValueToFrames(
  value: number,
  unit: "frames" | "smb-time-units",
  path: string,
  errors: ValidationError[],
): number | undefined {
  if (unit === "frames") {
    return value;
  }

  const frames = value * smbTimerUnitFrameCount;

  if (!Number.isSafeInteger(frames)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} converted from SMB timer units must be a safe integer frame count.`,
        path,
      ),
    );

    return undefined;
  }

  return frames;
}

function parseCannonProjectileArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly VglcSmbCannonProjectileMetadata[] {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of cannon projectile metadata objects.`,
        path,
      ),
    );

    return [];
  }

  const cannonProjectiles: VglcSmbCannonProjectileMetadata[] = [];

  for (const [index, value] of input.entries()) {
    const cannonProjectile = parseCannonProjectile(
      value,
      `${path}[${index}]`,
      errors,
    );

    if (cannonProjectile !== undefined) {
      cannonProjectiles.push(cannonProjectile);
    }
  }

  return cannonProjectiles;
}

function parseCannonProjectile(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbCannonProjectileMetadata | undefined {
  const point = parsePoint(input, path, errors);

  if (point === undefined) {
    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const spawnerId = parseNonEmptyMetadataString(
    candidate.spawnerId,
    `${path}.spawnerId`,
    errors,
  );
  const direction = parseCannonProjectileDirection(
    candidate.direction,
    `${path}.direction`,
    errors,
  );
  const intervalFrames = parsePositiveSafeIntegerMetadata(
    candidate.intervalFrames,
    `${path}.intervalFrames`,
    errors,
  );
  const initialDelayFrames = parseNonNegativeSafeIntegerMetadata(
    candidate.initialDelayFrames,
    `${path}.initialDelayFrames`,
    errors,
  );
  const speedPixelsPerSecond = parsePositiveFiniteNumberMetadata(
    candidate.speedPixelsPerSecond,
    `${path}.speedPixelsPerSecond`,
    errors,
  );
  const widthPixels = parsePositiveFiniteNumberMetadata(
    candidate.widthPixels,
    `${path}.widthPixels`,
    errors,
  );
  const heightPixels = parsePositiveFiniteNumberMetadata(
    candidate.heightPixels,
    `${path}.heightPixels`,
    errors,
  );
  const lifetimeFrames = parsePositiveSafeIntegerMetadata(
    candidate.lifetimeFrames,
    `${path}.lifetimeFrames`,
    errors,
  );

  if (
    spawnerId === undefined ||
    direction === undefined ||
    intervalFrames === undefined ||
    initialDelayFrames === undefined ||
    speedPixelsPerSecond === undefined ||
    widthPixels === undefined ||
    heightPixels === undefined ||
    lifetimeFrames === undefined
  ) {
    return undefined;
  }

  return {
    spawnerId,
    x: point.x,
    y: point.y,
    direction,
    intervalFrames,
    initialDelayFrames,
    speedPixelsPerSecond,
    widthPixels,
    heightPixels,
    lifetimeFrames,
  };
}

function parseNonEmptyMetadataString(
  input: unknown,
  path: string,
  errors: ValidationError[],
): string | undefined {
  if (typeof input === "string" && input.trim().length > 0) {
    return input;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be a non-empty string.`,
      path,
    ),
  );

  return undefined;
}

function parseOptionalMetadataString(
  input: unknown,
  path: string,
  errors: ValidationError[],
): string | typeof invalidOptionalMetadataString | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input === "string") {
    return input.trim().length === 0 ? undefined : input;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be a string when provided.`,
      path,
    ),
  );

  return invalidOptionalMetadataString;
}

function parseCannonProjectileDirection(
  input: unknown,
  path: string,
  errors: ValidationError[],
): "left" | "right" | undefined {
  if (input === "left" || input === "right") {
    return input;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be left or right.`,
      path,
    ),
  );

  return undefined;
}

function parsePositiveSafeIntegerMetadata(
  input: unknown,
  path: string,
  errors: ValidationError[],
): number | undefined {
  if (typeof input === "number" && Number.isSafeInteger(input) && input > 0) {
    return input;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be a positive safe integer.`,
      path,
    ),
  );

  return undefined;
}

function parseNonNegativeSafeIntegerMetadata(
  input: unknown,
  path: string,
  errors: ValidationError[],
): number | undefined {
  if (typeof input === "number" && Number.isSafeInteger(input) && input >= 0) {
    return input;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be a non-negative safe integer.`,
      path,
    ),
  );

  return undefined;
}

function parsePositiveFiniteNumberMetadata(
  input: unknown,
  path: string,
  errors: ValidationError[],
): number | undefined {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return input;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be a positive finite number.`,
      path,
    ),
  );

  return undefined;
}

function validateCannonProjectileMetadata(
  rows: readonly string[],
  cannonProjectiles: readonly VglcSmbCannonProjectileMetadata[],
  errors: ValidationError[],
  cannonTopSymbol = "B",
): void {
  for (const [index, cannonProjectile] of cannonProjectiles.entries()) {
    const path = `metadata.cannonProjectiles[${index}]`;
    const row = rows[cannonProjectile.y];

    if (row === undefined || cannonProjectile.x >= row.length) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${path} must be inside the VGLC SMB text bounds.`,
          path,
        ),
      );
      continue;
    }

    if ([...row][cannonProjectile.x] !== cannonTopSymbol) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${path} must point at a cannon top symbol.`,
          path,
        ),
      );
    }
  }
}

function validateTransitionMetadata(
  rows: readonly string[],
  transitions: readonly VglcSmbTransitionMetadata[],
  errors: ValidationError[],
  pipeSymbols = rawPipeTransitionSymbols,
): void {
  const transitionIds = new Set<string>();

  for (const [index, transition] of transitions.entries()) {
    const path = `metadata.transitions[${index}]`;
    const row = rows[transition.y];

    if (transitionIds.has(transition.id)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${path}.id must be unique within metadata.transitions.`,
          `${path}.id`,
        ),
      );
    } else {
      transitionIds.add(transition.id);
    }

    if (row === undefined || transition.x >= row.length) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${path} must be inside the VGLC SMB text bounds.`,
          path,
        ),
      );
      continue;
    }

    if (!pipeSymbols.has([...row][transition.x] ?? "")) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${path} must point at a pipe symbol.`,
          path,
        ),
      );
    }
  }
}

function parseQuestionBlockArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly VglcSmbQuestionBlockMetadata[] {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of question block metadata objects.`,
        path,
      ),
    );

    return [];
  }

  const questionBlocks: VglcSmbQuestionBlockMetadata[] = [];

  for (const [index, value] of input.entries()) {
    const questionBlock = parseQuestionBlock(
      value,
      `${path}[${index}]`,
      errors,
    );

    if (questionBlock !== undefined) {
      questionBlocks.push(questionBlock);
    }
  }

  return questionBlocks;
}

function parseQuestionBlock(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbQuestionBlockMetadata | undefined {
  const point = parsePoint(input, path, errors);

  if (point === undefined) {
    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const contents = parseQuestionBlockContents(
    candidate.contents,
    `${path}.contents`,
    errors,
  );

  if (contents === undefined) {
    return undefined;
  }

  return {
    ...point,
    contents,
  };
}

function parseQuestionBlockContents(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbQuestionBlockContents | undefined {
  if (input === "coin" || input === "power-up") {
    return input;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      `${path} must be coin or power-up.`,
      path,
    ),
  );

  return undefined;
}

function parseOptionalQuestionBlockContents(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbQuestionBlockContents | undefined {
  if (input === undefined) {
    return undefined;
  }

  return parseQuestionBlockContents(input, path, errors);
}

function parseOptionalPoint(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbPoint | undefined {
  if (input === undefined) {
    return undefined;
  }

  return parsePoint(input, path, errors);
}

function parsePointArray(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly VglcSmbPoint[] {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be an array of tile coordinate objects.`,
        path,
      ),
    );

    return [];
  }

  const points: VglcSmbPoint[] = [];

  for (const [index, value] of input.entries()) {
    const point = parsePoint(value, `${path}[${index}]`, errors);

    if (point !== undefined) {
      points.push(point);
    }
  }

  return points;
}

function parsePoint(
  input: unknown,
  path: string,
  errors: ValidationError[],
): VglcSmbPoint | undefined {
  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be a tile coordinate object.`,
        path,
      ),
    );

    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;

  if (
    !isNonNegativeInteger(candidate.x) ||
    !isNonNegativeInteger(candidate.y)
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path}.x and ${path}.y must be non-negative integers.`,
        path,
      ),
    );

    return undefined;
  }

  return {
    x: candidate.x,
    y: candidate.y,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function pointKey(point: VglcSmbPoint): string {
  return `${point.x},${point.y}`;
}

function makeQuestionBlockMetadataLookup(
  rows: readonly string[],
  questionBlocks: readonly VglcSmbQuestionBlockMetadata[],
  errors: ValidationError[],
): ReadonlyMap<string, VglcSmbQuestionBlockMetadata> {
  const lookup = new Map<string, VglcSmbQuestionBlockMetadata>();

  for (const [index, questionBlock] of questionBlocks.entries()) {
    const path = `metadata.questionBlocks[${index}]`;
    const row = rows[questionBlock.y];

    if (row === undefined || questionBlock.x >= row.length) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${path} must be inside the VGLC SMB text bounds.`,
          path,
        ),
      );
      continue;
    }

    if (row[questionBlock.x] !== "?") {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${path} must point at a full question block symbol.`,
          path,
        ),
      );
      continue;
    }

    const key = pointKey(questionBlock);

    if (lookup.has(key)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcMetadataInvalid,
          `${path} duplicates another question block metadata coordinate.`,
          path,
        ),
      );
      continue;
    }

    lookup.set(key, questionBlock);
  }

  return lookup;
}

function validateQuestionBlockContentsDefault(
  rows: readonly string[],
  metadata: VglcSmbTextImportMetadata,
  errors: ValidationError[],
): void {
  if (
    metadata.questionBlockContentsDefault === undefined ||
    rows.some((row) => row.includes("?"))
  ) {
    return;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.VglcMetadataInvalid,
      "metadata.questionBlockContentsDefault requires at least one full question block symbol.",
      "metadata.questionBlockContentsDefault",
    ),
  );
}

function applyMetadataActors(
  actorRows: string[],
  metadata: VglcSmbTextImportMetadata,
  errors: ValidationError[],
): void {
  if (metadata.playerStart !== undefined) {
    setMetadataActor(
      actorRows,
      metadata.playerStart,
      playerStartCharacter,
      "metadata.playerStart",
      errors,
    );
  }

  for (const [exitIndex, exitPoint] of metadata.exits.entries()) {
    setMetadataActor(
      actorRows,
      exitPoint,
      exitCharacter,
      `metadata.exits[${exitIndex}]`,
      errors,
    );
  }
}

function applyMetadataGoalColumns(
  tileRows: string[],
  metadata: VglcSmbTextImportMetadata,
): void {
  for (const exitPoint of metadata.exits) {
    if (!isPointInsideRows(tileRows, exitPoint)) {
      continue;
    }

    for (let rowIndex = 0; rowIndex < tileRows.length; rowIndex += 1) {
      setCharacterInRow(
        tileRows,
        rowIndex,
        exitPoint.x,
        finishGoalTileCharacter,
      );
    }
  }
}

function isPointInsideRows(
  rows: readonly string[],
  point: VglcSmbPoint,
): boolean {
  const row = rows[point.y];
  return row !== undefined && point.x < row.length;
}

function setMetadataActor(
  actorRows: string[],
  point: VglcSmbPoint,
  character: string,
  path: string,
  errors: ValidationError[],
): void {
  const row = actorRows[point.y];

  if (row === undefined || point.x >= row.length) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} must be inside the VGLC SMB text bounds.`,
        path,
      ),
    );

    return;
  }

  const existingCharacter = row[point.x];

  if (
    existingCharacter !== undefined &&
    existingCharacter !== emptyActorCharacter &&
    existingCharacter !== character
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataInvalid,
        `${path} overlaps an existing actor marker.`,
        path,
      ),
    );

    return;
  }

  setCharacterInRow(actorRows, point.y, point.x, character);
}

function setCharacterInRow(
  rows: string[],
  rowIndex: number,
  columnIndex: number,
  character: string,
): void {
  const row = rows[rowIndex];

  if (row === undefined) {
    throw new Error("Cannot set a character in a missing VGLC SMB row.");
  }

  rows[rowIndex] =
    row.slice(0, columnIndex) + character + row.slice(columnIndex + 1);
}

function collectRequiredMetadataErrors(
  actorRows: readonly string[],
): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  const playerStartCount = countActorCharacter(actorRows, playerStartCharacter);
  const exitCount = countActorCharacter(actorRows, exitCharacter);

  if (playerStartCount !== 1) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataMissing,
        "VGLC SMB text requires exactly one player start marker or metadata.playerStart coordinate.",
        "metadata.playerStart",
      ),
    );
  }

  if (exitCount < 1) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcMetadataMissing,
        "VGLC SMB text requires at least one exit marker or metadata.exits coordinate.",
        "metadata.exits",
      ),
    );
  }

  return errors;
}

function countActorCharacter(
  actorRows: readonly string[],
  character: string,
): number {
  return actorRows.reduce(
    (count, row) =>
      count + [...row].filter((cell) => cell === character).length,
    0,
  );
}

function splitVglcRows(text: string): readonly string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n$/, "")
    .split("\n");
}

function collectVglcSmbRowErrors(rows: readonly string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (rows.length === 0 || (rows.length === 1 && rows[0]?.length === 0)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcGridHeightMismatch,
        "VGLC SMB text must include at least one non-empty row.",
        "rows",
      ),
    );
    return errors;
  }

  const widthTiles = rows[0]?.length ?? 0;

  if (widthTiles === 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcGridWidthMismatch,
        "VGLC SMB rows must not be empty.",
        "rows[0]",
      ),
    );
  }

  for (const [rowIndex, row] of rows.entries()) {
    if (row.length !== widthTiles) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcGridWidthMismatch,
          `rows[${rowIndex}] length must match the first row width.`,
          `rows[${rowIndex}]`,
        ),
      );
    }
  }

  return errors;
}

function classifyVglcSmbCell(
  character: string,
  point: VglcSmbPoint,
  questionBlockLookup: ReadonlyMap<string, VglcSmbQuestionBlockMetadata>,
  questionBlockContentsDefault: VglcSmbQuestionBlockContents | undefined,
): VglcSmbCellClassification {
  if (character === "?") {
    const questionBlock = questionBlockLookup.get(pointKey(point));
    const contents = questionBlock?.contents ?? questionBlockContentsDefault;

    if (contents === undefined) {
      return {
        kind: "unsupported",
        feature: {
          featureId: "vglc-smb-question-block-contents",
          reason:
            "full question blocks need metadata.questionBlocks contents or metadata.questionBlockContentsDefault before direct SMB corpus parity.",
        },
      };
    }

    return {
      kind: "terrain",
      tileCharacter: questionBlockContentsToTileCharacter(contents),
      actorCharacter: emptyActorCharacter,
    };
  }

  if (directTerrainCharacters.has(character)) {
    return {
      kind: "terrain",
      tileCharacter: character,
      actorCharacter: emptyActorCharacter,
    };
  }

  if (directActorCharacters.has(character)) {
    return {
      kind: "terrain",
      tileCharacter:
        character === exitCharacter ? finishGoalTileCharacter : "-",
      actorCharacter: character,
    };
  }

  const unsupportedFeature = unsupportedCharacters.get(character);

  if (unsupportedFeature !== undefined) {
    return {
      kind: "unsupported",
      feature: unsupportedFeature,
    };
  }

  return {
    kind: "unknown",
  };
}

function questionBlockContentsToTileCharacter(
  contents: VglcSmbQuestionBlockContents,
): string {
  return contents === "coin"
    ? questionCoinTileCharacter
    : questionPowerUpTileCharacter;
}

function classifyVglcSmbMultiLayerStructuralCell(
  character: string,
): VglcSmbCellClassification {
  if (multiLayerStructuralTerrainCharacters.has(character)) {
    return {
      kind: "terrain",
      tileCharacter: character,
      actorCharacter: emptyActorCharacter,
    };
  }

  const actorEntry = multiLayerStructuralActorCharacters.get(character);

  if (actorEntry !== undefined) {
    return {
      kind: "terrain",
      tileCharacter: "-",
      actorCharacter: actorEntry.actorCharacter,
    };
  }

  const unsupportedFeature = multiLayerUnsupportedCharacters.get(character);

  if (unsupportedFeature !== undefined) {
    return {
      kind: "unsupported",
      feature: unsupportedFeature,
    };
  }

  return {
    kind: "unknown",
  };
}

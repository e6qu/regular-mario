// A small grid level editor. It paints a single symbol per cell (tiles + actor
// markers), converts to/from the engine's `LevelSpecInput`, validates with the
// same `makeLevelSpec` the game uses, and can play, download, or load a level —
// so it doubles as the "upload your own level" entry point.

import {
  ActorRole,
  makeLevelSpec,
  TileCollisionKind,
  type LevelSpecInput,
} from "../engine/domain/level-spec";
import { standardSurfaceTileDefinitions } from "../engine/levels/level-builder";
import type { LevelTheme } from "./browser-level-selection";

export type LevelEditorCallbacks = {
  // skinId is a tileset (asset-set) id whose sprites render the level.
  readonly onPlay: (
    level: LevelSpecInput,
    skinId: string,
    warpLevels?: ReadonlyMap<string, LevelSpecInput>,
    theme?: LevelTheme,
  ) => void;
  readonly onExit: () => void;
  // Existing maps offered as editable templates (loaded ephemerally). Optional.
  readonly loadTemplates?: () => Promise<
    readonly { readonly name: string; readonly level: LevelSpecInput }[]
  >;
};

// Tilesets the editor offers (id → label), as a plain list so more can be added
// and switched between smoothly. Each id is an asset set whose sprites cover the
// editor's tile/actor ids; the first entry is the default. (The built-in "vector"
// shape renderer is intentionally not offered here.)
const editorTilesets: readonly (readonly [string, string])[] = [
  ["castaway-parody", "Shabby"],
];
const defaultTilesetId = editorTilesets[0]?.[0] ?? "castaway-parody";
const tilesetStorageKey = "regular-mario.editor.tileset";

// The chosen tileset persists across visits (best-effort; storage may be off).
function readEditorTileset(): string | null {
  try {
    return localStorage.getItem(tilesetStorageKey);
  } catch {
    return null;
  }
}
function writeEditorTileset(id: string): void {
  try {
    localStorage.setItem(tilesetStorageKey, id);
  } catch {
    // Ignore — persistence is a convenience, not required.
  }
}

// The guided walkthrough auto-runs once, then is remembered as seen.
const tutorialStorageKey = "regular-mario.editor.tutorial-seen";
function readEditorTutorialSeen(): boolean {
  try {
    return localStorage.getItem(tutorialStorageKey) === "1";
  } catch {
    return false;
  }
}
function writeEditorTutorialSeen(): void {
  try {
    localStorage.setItem(tutorialStorageKey, "1");
  } catch {
    // Ignore — persistence is a convenience, not required.
  }
}

// The detailed static guide shown behind the circled-i button. Static content
// only (no interpolation), so assigning it as innerHTML is safe.
const editorGuideHtml = `
  <h2 style="color:#38bdf8;margin:0 0 10px;font-size:20px;">Level Editor Guide</h2>
  <p>Build a level on the grid, then <b>▶ Play</b> to try it. Use <b>🎓 Tutorial</b>
  any time for the guided tour, or <b>← Menu</b> to leave.</p>

  <h3 style="color:#7dd3fc;margin:16px 0 4px;">Placing things</h3>
  <p>Pick an item in the <b>palette</b>, then click or drag on the grid. Tools:
  Draw (V), Erase (E), Fill (G), Rectangle (R), Line (L), Select (S, then
  Ctrl+C/X/V, Del), Pick a cell's brush (I), Pan (H). Undo/redo: Ctrl+Z / Ctrl+Y.
  A level needs exactly one <b>Player</b> and one <b>Goal</b>.</p>

  <h3 style="color:#7dd3fc;margin:16px 0 4px;">Pipes &amp; teleports</h3>
  <p>Paint a <b>pipe</b> mouth where the player runs. Choose the <b>🔗 Connect</b>
  tool, click the pipe, then click a destination cell. Standing on the pipe and
  pressing <b>Down</b> warps the player there. A destination in another area makes
  a cross-area warp.</p>

  <h3 style="color:#7dd3fc;margin:16px 0 4px;">Areas</h3>
  <p><b>＋ Area</b> adds another map (e.g. an underground room); the <b>Area</b>
  dropdown switches between them. Areas, tileset and theme are all preserved when
  you play-test and come back.</p>

  <h3 style="color:#7dd3fc;margin:16px 0 4px;">Blocks &amp; mechanics</h3>
  <ul style="margin:4px 0;padding-left:20px;">
    <li><b>? block</b> — bump from below for a power-up; <b>coin blocks</b> give coins.</li>
    <li><b>Brick</b> — a powered player smashes it from below.</li>
    <li><b>Hidden block</b> — invisible until bumped from below, then solid + a coin.</li>
    <li><b>Cannon</b> — fires a stompable Bullet Bill; jump on it to defeat it.</li>
    <li><b>Spikes</b> hurt on contact; the <b>Goal</b> finishes the level.</li>
  </ul>

  <h3 style="color:#7dd3fc;margin:16px 0 4px;">Enemies</h3>
  <p>Goomba, Koopa, Buzzy (fireproof), a flyer, a piranha plant, Hammer Bro,
  Lakitu, a chaser, the ledge-staying red snapper, a winged snapper (stomp
  drops its wings), the spiked urchin (don't stomp it!) and the keep warden
  (spiked, soaks five fireballs). Stomp most from above; some throw or shrug
  off fireballs.</p>

  <h3 style="color:#7dd3fc;margin:16px 0 4px;">Mechanisms</h3>
  <p><b>Firebar</b> — a rotating bar of fire orbs anchored to the painted
  block. <b>Podoboo</b> — a fireball that leaps out of the pit below its
  column. <b>Lifts</b> — rideable platforms that sweep side-to-side, up and
  down, or fall away when ridden.</p>

  <h3 style="color:#7dd3fc;margin:16px 0 4px;">Sharing</h3>
  <p><b>🔗 Share</b> copies a link, <b>⬇ Download</b> saves a file, and you can Save
  named levels in your browser and reload them later.</p>
`;

type TilePaletteItem = {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly kind: "tile";
  readonly tileId: string;
};

type ActorPaletteItem = {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly kind: "actor";
  readonly actorId: string;
  readonly role: ActorRole;
  readonly unique?: boolean;
  // Armored enemies flagged fireproof (Buzzy Beetle) shrug off fireballs.
  readonly fireproof?: boolean;
  // Spiked walkers (the urchin) hurt the player on stomp.
  readonly spiky?: boolean;
  // Ledge-staying walkers (the red snapper) turn around at ledges.
  readonly turnsAtLedges?: boolean;
  // Winged armored enemies fly until the first stomp drops their wings.
  readonly wingedFlight?: string;
  // Fireball hits needed to defeat this enemy (the warden takes five).
  readonly projectileHitPoints?: number;
  readonly colliderWidthPixels?: number;
  readonly colliderHeightPixels?: number;
  // Some actors also paint a tile in their cell (the goal is an Exit actor on a
  // Goal-collision tile — the tile is what actually triggers the finish).
  readonly tileId?: string;
};

// A mechanism paints a marker cell that exports into the level's mechanics
// metadata (a rotating firebar, a leaping podoboo, or a moving lift) rather
// than an actor.
type MechanismPaletteItem = {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly kind: "mechanism";
  readonly mechanismId:
    | "firebar"
    | "podoboo"
    | "lift-horizontal"
    | "lift-vertical"
    | "lift-drop";
  // Firebars paint their anchor block into the cell; lifts/podoboos sit on sky.
  readonly tileId?: string;
};

type PaletteItem = TilePaletteItem | ActorPaletteItem | MechanismPaletteItem;

const skyKey = "sky";

// Coin blocks: a block that dispenses N coins on a head-bump. The count (and
// whether the source was a brick) is baked into the tile id and editor cell key,
// so different blocks in one level can hold different amounts and keep their look.
// A brick coin holder keeps the brick appearance; anything else reads as a "?".
// Bounded to 1-9 so a single character encodes it in a shared level link.
const coinBlockBaseKey = "coinblock";
const coinBrickBaseKey = "coinbrick";
const minCoinBlockCount = 1;
const maxCoinBlockCount = 9;
const coinContentsActorId = "coin";
// Any of these block cells absorbs a painted coin into a coin block (rather than
// being replaced by a loose coin). A brick keeps its brick look.
const coinEmbeddableBlockKeys: ReadonlySet<string> = new Set([
  "block",
  "brick",
  "powerblock",
  "hidden",
]);
type CoinBlockInfo = { readonly count: number; readonly brick: boolean };
function inCoinRange(count: number): boolean {
  return (
    Number.isInteger(count) &&
    count >= minCoinBlockCount &&
    count <= maxCoinBlockCount
  );
}
function coinBlockKeyFor(count: number, brick: boolean): string {
  return `${brick ? coinBrickBaseKey : coinBlockBaseKey}${String(count)}`;
}
function coinBlockInfoFromKey(key: string): CoinBlockInfo | undefined {
  for (const [base, brick] of [
    [coinBrickBaseKey, true],
    [coinBlockBaseKey, false],
  ] as const) {
    if (key.startsWith(base)) {
      const count = Number(key.slice(base.length));
      return inCoinRange(count) ? { count, brick } : undefined;
    }
  }
  return undefined;
}
function coinBlockTileId(count: number, brick: boolean): string {
  return `coin-${brick ? "brick" : "block"}-${String(count)}`;
}
function coinBlockInfoFromTileId(tileId: string): CoinBlockInfo | undefined {
  const match = /^coin-(block|brick)-(\d+)$/.exec(tileId);
  if (match === null) {
    return undefined;
  }
  const count = Number(match[2]);
  return inCoinRange(count)
    ? { count, brick: match[1] === "brick" }
    : undefined;
}

const paletteItems: readonly PaletteItem[] = [
  { key: skyKey, label: "Sky", color: "#8ec7ff", kind: "tile", tileId: "sky" },
  {
    key: "ground",
    label: "Ground",
    color: "#8a5a2b",
    kind: "tile",
    tileId: "grass",
  },
  {
    key: "block",
    label: "Block",
    color: "#9aa0a6",
    kind: "tile",
    tileId: "stone",
  },
  {
    // A breakable brick: a Powered player can smash it from below.
    key: "brick",
    label: "Brick",
    color: "#b45309",
    kind: "tile",
    tileId: "breakable-block",
  },
  {
    // A "?" block that yields a power-up when bumped (renders as "?" in game).
    key: "powerblock",
    label: "? Power",
    color: "#f59e0b",
    kind: "tile",
    tileId: "mystery-box",
  },
  {
    // Invisible in game until the player bumps it from below, then a solid block
    // appears and drops a coin. Shown here so you can place it.
    key: "hidden",
    label: "Hidden",
    color: "#64748b",
    kind: "tile",
    tileId: "hidden-block",
  },
  {
    // A blaster that periodically fires a Bullet Bill leftward from its mouth
    // (the tile above it). The bullets fly straight and can be stomped.
    key: "cannon",
    label: "Cannon",
    color: "#1f2937",
    kind: "tile",
    tileId: "cannon-top",
  },
  {
    // A warp-pipe mouth: place it on the walkable cell (the row the player runs
    // along). Press down while standing on it to teleport to the connected
    // destination; use the 🔗 Connect tool to set that. It renders as a pipe
    // mouth; add the pipe-body tiles below for the full pipe look.
    key: "pipe",
    label: "Pipe ⤓",
    color: "#0f766e",
    kind: "actor",
    actorId: "warp-pipe",
    role: ActorRole.Pipe,
  },
  {
    key: "pipetr",
    label: "Pipe ◨",
    color: "#0f766e",
    kind: "tile",
    tileId: "pipe-top-right",
  },
  {
    key: "pipel",
    label: "Pipe ▌",
    color: "#0d9488",
    kind: "tile",
    tileId: "pipe-left",
  },
  {
    key: "piper",
    label: "Pipe ▐",
    color: "#0d9488",
    kind: "tile",
    tileId: "pipe-right",
  },
  {
    key: "spikes",
    label: "Spikes",
    color: "#c0392b",
    kind: "tile",
    tileId: "thorn",
  },
  {
    key: "goal",
    label: "Goal",
    color: "#2ecc71",
    kind: "actor",
    actorId: "open-gate",
    role: ActorRole.Exit,
    unique: true,
    tileId: "gate",
  },
  {
    key: "player",
    label: "Player",
    color: "#2d6cdf",
    kind: "actor",
    actorId: "runner-start",
    role: ActorRole.PlayerStart,
    unique: true,
  },
  {
    key: "goomba",
    label: "Goomba",
    color: "#8e44ad",
    kind: "actor",
    actorId: "beetle",
    role: ActorRole.Enemy,
  },
  {
    key: "koopa",
    label: "Koopa",
    color: "#2e7d32",
    kind: "actor",
    actorId: "shellback",
    role: ActorRole.ArmoredEnemy,
  },
  {
    // Buzzy Beetle — an armored shell enemy that fireballs can't defeat.
    key: "buzzy",
    label: "Buzzy",
    color: "#4b5563",
    kind: "actor",
    actorId: "buzzy-beetle",
    role: ActorRole.ArmoredEnemy,
    fireproof: true,
  },
  {
    key: "flyer",
    label: "Flyer",
    color: "#00acc1",
    kind: "actor",
    actorId: "flutterby",
    role: ActorRole.FlyingEnemy,
  },
  {
    // Carnivorous plant that rises out of a pipe; place it at a pipe mouth.
    key: "piranha",
    label: "Piranha",
    color: "#16a34a",
    kind: "actor",
    actorId: "chomp-bud",
    role: ActorRole.PiranhaPlant,
  },
  {
    // Hammer Bro — hops in place and lobs hammers at the player.
    key: "hammerbro",
    label: "Hammer",
    color: "#7c3aed",
    kind: "actor",
    actorId: "hammer-bro",
    role: ActorRole.ThrowingEnemy,
  },
  {
    // Lakitu — rides a cloud overhead and drops spiny eggs.
    key: "lakitu",
    label: "Lakitu",
    color: "#0891b2",
    kind: "actor",
    actorId: "cloud-tosser",
    role: ActorRole.AerialThrowingEnemy,
  },
  {
    // A ground enemy that homes toward the player.
    key: "chaser",
    label: "Chaser",
    color: "#dc2626",
    kind: "actor",
    actorId: "spike-hunter",
    role: ActorRole.ChasingEnemy,
  },
  {
    key: "coin",
    label: "Coin",
    color: "#f1c40f",
    kind: "actor",
    actorId: "star-shard",
    role: ActorRole.Item,
  },
  {
    key: "power",
    label: "Power",
    color: "#e67e22",
    kind: "actor",
    actorId: "spark-cap",
    role: ActorRole.PowerUp,
  },
  {
    // A ledge-staying walker: turns around at edges instead of falling off.
    key: "redkoopa",
    label: "Red Snapper",
    color: "#b91c1c",
    kind: "actor",
    actorId: "snapper-red",
    role: ActorRole.ArmoredEnemy,
    turnsAtLedges: true,
  },
  {
    // A winged snapper that glides until the first stomp drops its wings.
    key: "parakoopa",
    label: "Winged",
    color: "#15803d",
    kind: "actor",
    actorId: "snapper-winged",
    role: ActorRole.ArmoredEnemy,
    wingedFlight: "horizontal",
  },
  {
    // A spiked walker — stomping it hurts; fireballs still work.
    key: "urchin",
    label: "Urchin",
    color: "#9d174d",
    kind: "actor",
    actorId: "urchin",
    role: ActorRole.Enemy,
    spiky: true,
  },
  {
    // The castle boss: spiked, paces its ledge, soaks five fireballs.
    key: "warden",
    label: "Warden",
    color: "#334155",
    kind: "actor",
    actorId: "keep-warden",
    role: ActorRole.Enemy,
    spiky: true,
    turnsAtLedges: true,
    projectileHitPoints: 5,
    colliderWidthPixels: 28,
    colliderHeightPixels: 28,
  },
  {
    // A rotating bar of fire orbs anchored to the painted block.
    key: "firebar",
    label: "Firebar",
    color: "#ea580c",
    kind: "mechanism",
    mechanismId: "firebar",
    tileId: "stone",
  },
  {
    // A fireball that leaps out of the pit below this column on a cycle.
    key: "podoboo",
    label: "Podoboo",
    color: "#f97316",
    kind: "mechanism",
    mechanismId: "podoboo",
  },
  {
    // Moving lift platforms: side-to-side, up-and-down, and fall-when-ridden.
    key: "lifth",
    label: "Lift ↔",
    color: "#a16207",
    kind: "mechanism",
    mechanismId: "lift-horizontal",
  },
  {
    key: "liftv",
    label: "Lift ↕",
    color: "#a16207",
    kind: "mechanism",
    mechanismId: "lift-vertical",
  },
  {
    key: "liftd",
    label: "Lift ▼",
    color: "#78350f",
    kind: "mechanism",
    mechanismId: "lift-drop",
  },
];

const paletteByKey = new Map(paletteItems.map((item) => [item.key, item]));
const actorItems = paletteItems.filter(
  (item): item is ActorPaletteItem => item.kind === "actor",
);

const enemyRoles: ReadonlySet<ActorRole> = new Set([
  ActorRole.Enemy,
  ActorRole.FlyingEnemy,
  ActorRole.ChasingEnemy,
  ActorRole.ArmoredEnemy,
  ActorRole.ThrowingEnemy,
  ActorRole.AerialThrowingEnemy,
  ActorRole.PiranhaPlant,
]);
const editorEnemyPatrolSpeed = 48;

// A blank level defaults to roughly SMB 1-1's proportions (a wide overworld), so
// there is room to build a full stage; pan/scroll + the minimap navigate it.
const defaultWidth = 212;
const defaultHeight = 15;
const minWidth = 8;
// Generous headroom beyond SMB's ~200-wide overworlds for long custom stages.
const maxWidth = 400;
const minHeight = 7;
const maxHeight = 20;
const cellPixels = 22;

// Solid-looking tile ids in an imported (e.g. ROM-decoded) level collapse to a
// generic block; anything unrecognised becomes sky. Editor-made levels round-trip
// exactly since they only use the palette's own tile ids.
function paletteKeyForTileId(tileId: string): string {
  const coin = coinBlockInfoFromTileId(tileId);
  if (coin !== undefined) {
    return coinBlockKeyFor(coin.count, coin.brick);
  }
  const direct = paletteItems.find((item) => item.tileId === tileId);
  if (direct !== undefined) {
    return direct.key;
  }
  if (/flag|goal|exit/i.test(tileId)) {
    return "goal";
  }
  if (/block|brick|stone|pipe|ground|solid|floor|wall/i.test(tileId)) {
    return "block";
  }
  return skyKey;
}

const savedLevelsStorageKey = "regular-mario-editor-levels";

function readSavedLevels(): Record<string, LevelSpecInput> {
  try {
    const raw = window.localStorage.getItem(savedLevelsStorageKey);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, LevelSpecInput>)
      : {};
  } catch {
    return {};
  }
}

function writeSavedLevels(levels: Record<string, LevelSpecInput>): void {
  try {
    window.localStorage.setItem(savedLevelsStorageKey, JSON.stringify(levels));
  } catch {
    // Storage may be unavailable (private mode / quota); saving is best-effort.
  }
}

// Compact single-char code per palette key, for encoding a level into a URL.
const cellCharByKey: Readonly<Record<string, string>> = {
  sky: ".",
  ground: "g",
  block: "b",
  brick: "r",
  powerblock: "q",
  hidden: "i",
  cannon: "o",
  spikes: "s",
  goal: "x",
  player: "p",
  goomba: "e",
  koopa: "k",
  buzzy: "m",
  flyer: "f",
  piranha: "n",
  hammerbro: "h",
  lakitu: "z",
  chaser: "j",
  coin: "c",
  power: "u",
  pipe: "d",
  pipetr: "t",
  pipel: "l",
  piper: "w",
  // New mechanics use J-Z codes (A-I are the coin-brick counts).
  redkoopa: "a",
  parakoopa: "v",
  urchin: "y",
  warden: "K",
  firebar: "R",
  podoboo: "P",
  lifth: "L",
  liftv: "V",
  liftd: "J",
};
const keyByCellChar = new Map(
  Object.entries(cellCharByKey).map(([key, char]) => [char, key]),
);

// A shareable level code: "<width>.<height>.<cells>" (one char per cell). Only
// uses URL-safe characters, so it drops straight into a `#level=` fragment.
function encodeSharedLevel(level: LevelSpecInput): string {
  const { cells, width, height } = cellsFromLevelInput(level);
  const chars = cells
    .map((row) =>
      row
        .map((key) => {
          const coin = coinBlockInfoFromKey(key);
          if (coin !== undefined) {
            // Coin blocks encode as a digit 1-9; coin bricks as A-I (same count),
            // keeping one URL-safe character per cell.
            return coin.brick
              ? String.fromCharCode(64 + coin.count)
              : String(coin.count);
          }
          return cellCharByKey[key] ?? ".";
        })
        .join(""),
    )
    .join("");
  return `${String(width)}.${String(height)}.${chars}`;
}

export function decodeSharedLevel(encoded: string): LevelSpecInput | undefined {
  // Cell chars: lowercase letters/"." for tiles, digits 1-9 for coin blocks,
  // A-I for coin bricks (both N coins), and J-Z for the newer mechanics.
  const match = /^(\d+)\.(\d+)\.([.a-zA-Z1-9]*)$/.exec(encoded);
  if (match === null) {
    return undefined;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const chars = match[3] ?? "";
  // Bound the dimensions to the editor's own limits: a hand-crafted or oversized
  // #level= link must not build a multi-thousand-cell DOM grid that janks the tab.
  if (
    chars.length !== width * height ||
    width < minWidth ||
    width > maxWidth ||
    height < minHeight ||
    height > maxHeight
  ) {
    return undefined;
  }
  const cells = Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_col, x) => {
      const char = chars[y * width + x] ?? ".";
      if (/^[1-9]$/.test(char)) {
        return coinBlockKeyFor(Number(char), false);
      }
      if (/^[A-I]$/.test(char)) {
        return coinBlockKeyFor(char.charCodeAt(0) - 64, true);
      }
      return keyByCellChar.get(char) ?? skyKey;
    }),
  );
  const level = levelInputFromCells(cells, width, height);
  return makeLevelSpec(level).ok ? level : undefined;
}

// Removes the previous editor instance's document-level listeners. The editor is
// re-created (not disposed) each time it reopens, so without this the old
// instance's `mouseup` handler — and the whole closure it retains — would leak.
let disposeActiveEditor: (() => void) | undefined;

export function renderLevelEditor(
  parent: HTMLElement,
  callbacks: LevelEditorCallbacks,
  initialLevel?: LevelSpecInput,
  initialSkinId?: string,
  initialWarpLevels?: ReadonlyMap<string, LevelSpecInput>,
  initialTheme?: LevelTheme,
): void {
  disposeActiveEditor?.();
  let width = defaultWidth;
  let height = defaultHeight;
  let cells: string[][] = makeStarterCells(defaultWidth, defaultHeight);
  let selectedKey = "ground";
  let painting = false;
  let erasing = false;
  // Painting the Coin brush onto a block turns it into a coin block; painting it
  // again stacks another coin, up to the max. On anything else it drops a plain
  // coin. (Erasing the cell removes the whole block and the coins in it.)
  function cellKeyForBrushAt(x: number, y: number): string {
    if (selectedKey !== "coin") {
      return selectedKey;
    }
    const current = cells[y]?.[x] ?? skyKey;
    if (coinEmbeddableBlockKeys.has(current)) {
      // A brick keeps its brick look; other blocks read as a "?".
      return coinBlockKeyFor(1, current === "brick");
    }
    const existing = coinBlockInfoFromKey(current);
    if (existing !== undefined) {
      return coinBlockKeyFor(
        Math.min(existing.count + 1, maxCoinBlockCount),
        existing.brick,
      );
    }
    return selectedKey;
  }
  // The active designer tool. Exactly one is selected at a time (see the drawer).
  // "erase" draws sky; right-click erases in any paint tool.
  type ToolId =
    | "draw"
    | "erase"
    | "fill"
    | "rect"
    | "line"
    | "select"
    | "eyedropper"
    | "pan"
    | "connect";
  let tool: ToolId = "draw";
  // Multiple named areas: the active one lives in cells/width/height; the others
  // are kept as LevelSpecInput snapshots. Warp pipes can point across areas.
  const mainAreaName = "main";
  let activeAreaName = mainAreaName;
  const areaOrder: string[] = [mainAreaName];
  const areaLevels = new Map<string, LevelSpecInput>();
  // All warp links, keyed "sourceArea:x,y" → destination area + tile. The Connect
  // tool picks a pipe mouth, then a destination cell (possibly in another area).
  const warps = new Map<string, { areaName: string; x: number; y: number }>();
  let pendingWarpSource: { areaName: string; x: number; y: number } | null =
    null;
  function warpKey(areaName: string, x: number, y: number): string {
    return `${areaName}:${String(x)},${String(y)}`;
  }
  // The active area's warps in the form levelInputFromCells wants (per-cell,
  // with a target level name only for cross-area links).
  function resolveWarpsForArea(
    areaName: string,
  ): Map<string, { x: number; y: number; targetLevelName?: string }> {
    const resolved = new Map<
      string,
      { x: number; y: number; targetLevelName?: string }
    >();
    const prefix = `${areaName}:`;
    for (const [key, destination] of warps) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const cell = key.slice(prefix.length);
      resolved.set(
        cell,
        destination.areaName === areaName
          ? { x: destination.x, y: destination.y }
          : {
              x: destination.x,
              y: destination.y,
              targetLevelName: destination.areaName,
            },
      );
    }
    return resolved;
  }
  // Marquee selection + clipboard for the Select tool.
  let selection: { x0: number; y0: number; x1: number; y1: number } | null =
    null;
  let selecting = false;
  let selectStart: { x: number; y: number } | null = null;
  let selectionCells: HTMLButtonElement[] = [];
  let clipboard: string[][] | null = null;
  // Direct width/height inputs (styled + wired later in the toolbar).
  const widthInput = document.createElement("input");
  const heightInput = document.createElement("input");
  // Area selector (populated once areas exist).
  const areaSelect = document.createElement("select");
  areaSelect.setAttribute("aria-label", "Area");
  areaSelect.style.cssText =
    "padding:6px 8px;border-radius:6px;border:2px solid #334155;" +
    "background:#1e293b;color:#e5e7eb;font:600 12px monospace;";
  function renderAreaSelect(): void {
    areaSelect.replaceChildren(
      ...areaOrder.map((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        return option;
      }),
    );
    areaSelect.value = activeAreaName;
    // Only worth showing once there's more than one area.
    areaSelect.style.display = areaOrder.length > 1 ? "" : "none";
  }
  function syncSizeInputs(): void {
    widthInput.value = String(width);
    heightInput.value = String(height);
  }
  function resizeTo(nextWidth: number, nextHeight: number): void {
    const w = Math.max(minWidth, Math.min(maxWidth, Math.round(nextWidth)));
    const h = Math.max(minHeight, Math.min(maxHeight, Math.round(nextHeight)));
    if (w === width && h === height) {
      syncSizeInputs();
      return;
    }
    pushHistory();
    if (w !== width) {
      cells = resizeCells(cells, w, height);
      width = w;
    }
    if (h !== height) {
      cells = resizeHeight(cells, width, h);
      height = h;
    }
    renderGrid();
  }
  let panState: {
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null = null;
  let rectStart: { x: number; y: number } | null = null;
  let rectShape: "rect" | "line" = "rect";
  let rectEnd = { x: 0, y: 0 };
  let rectKey = skyKey;
  let rectPreviewCells: [number, number][] = [];

  if (initialLevel !== undefined) {
    const loaded = cellsFromLevelInput(initialLevel);
    width = loaded.width;
    height = loaded.height;
    cells = loaded.cells;
    loadPipeWarpsFrom(initialLevel, activeAreaName);
  }

  // Restore the other named areas (e.g. after returning from a play-test), so a
  // multi-area level survives the round-trip through play.
  if (initialWarpLevels !== undefined) {
    for (const [name, level] of initialWarpLevels) {
      if (name === mainAreaName || areaOrder.includes(name)) {
        continue;
      }
      areaOrder.push(name);
      areaLevels.set(name, level);
      loadPipeWarpsFrom(level, name);
    }
  }

  // Undo/redo: snapshot the whole grid before each mutating action (a paint
  // stroke, resize, clear, or load). Bounded so a long session can't grow it
  // without limit.
  type EditorSnapshot = {
    readonly width: number;
    readonly height: number;
    readonly cells: string[][];
  };
  const undoStack: EditorSnapshot[] = [];
  const redoStack: EditorSnapshot[] = [];
  const maxHistory = 60;
  const snapshot = (): EditorSnapshot => ({
    width,
    height,
    cells: cells.map((row) => [...row]),
  });
  function pushHistory(): void {
    undoStack.push(snapshot());
    if (undoStack.length > maxHistory) {
      undoStack.shift();
    }
    redoStack.length = 0;
  }
  function restoreSnapshot(state: EditorSnapshot): void {
    width = state.width;
    height = state.height;
    cells = state.cells.map((row) => [...row]);
    renderGrid();
  }
  function undo(): void {
    const state = undoStack.pop();
    if (state === undefined) {
      return;
    }
    redoStack.push(snapshot());
    restoreSnapshot(state);
  }
  function redo(): void {
    const state = redoStack.pop();
    if (state === undefined) {
      return;
    }
    undoStack.push(snapshot());
    restoreSnapshot(state);
  }

  const root = document.createElement("div");
  // A dark surface so the light UI text has sufficient contrast (WCAG AA); the
  // page body would otherwise be white behind it.
  root.style.cssText =
    "font-family:monospace;color:#f5f7fb;background:#0b1220;max-width:min(96vw,1400px);" +
    "margin:16px auto;padding:16px;border-radius:12px;min-height:calc(100vh - 32px);box-sizing:border-box;";

  const heading = document.createElement("div");
  heading.style.cssText =
    "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;";
  // A big, prominent way back to the start menu, anchored top-left.
  const menuButton = document.createElement("button");
  menuButton.textContent = "← Menu";
  menuButton.setAttribute("aria-label", "Return to menu");
  menuButton.style.cssText =
    "padding:10px 20px;border-radius:10px;border:none;background:#7c3aed;color:#fff;" +
    "font:800 16px monospace;letter-spacing:1px;cursor:pointer;box-shadow:0 3px 0 #5b21b6;";
  menuButton.addEventListener("click", () => callbacks.onExit());
  heading.append(menuButton);
  // A prominent way to (re)start the guided walkthrough, right of the menu.
  const tutorialButton = document.createElement("button");
  tutorialButton.textContent = "🎓 Tutorial";
  tutorialButton.setAttribute("aria-label", "Start editor tutorial");
  tutorialButton.style.cssText =
    "padding:10px 18px;border-radius:10px;border:none;background:#0f766e;color:#fff;" +
    "font:800 15px monospace;letter-spacing:1px;cursor:pointer;box-shadow:0 3px 0 #0b5850;";
  tutorialButton.addEventListener("click", () => startEditorTutorial());
  heading.append(tutorialButton);
  const title = document.createElement("h1");
  title.textContent = "LEVEL EDITOR";
  title.style.cssText =
    "font-size:20px;letter-spacing:2px;color:#c8401b;margin:0 auto 0 0;text-shadow:1px 1px 0 #ffe08a;";
  heading.append(title);
  // A circled "i" opening the detailed static guide, anchored top-right.
  const infoButton = document.createElement("button");
  infoButton.textContent = "ⓘ";
  infoButton.setAttribute("aria-label", "Editor guide");
  infoButton.title = "Editor guide";
  infoButton.style.cssText =
    "width:34px;height:34px;border-radius:50%;border:2px solid #38bdf8;background:#0b1220;" +
    "color:#38bdf8;font:800 18px monospace;cursor:pointer;flex:0 0 auto;line-height:1;";
  infoButton.addEventListener("click", () => showEditorGuide());

  const skinLabel = document.createElement("label");
  skinLabel.textContent = "Tileset ";
  skinLabel.style.cssText = "font-size:12px;color:#cbd5e1;";
  const skinSelect = document.createElement("select");
  skinSelect.setAttribute("aria-label", "Tileset");
  skinSelect.style.cssText =
    "padding:5px 8px;border-radius:6px;border:2px solid #334155;background:#1e293b;color:#e5e7eb;font:600 12px monospace;";
  for (const [id, label] of editorTilesets) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    skinSelect.append(option);
  }
  const isKnownTileset = (id: string | null): boolean =>
    id !== null && editorTilesets.some(([tilesetId]) => tilesetId === id);
  // Choose the tileset: the one carried back from a play-test, else the one
  // remembered from a previous visit, else the default. Unknown/retired ids
  // (e.g. the old "vector") fall back to the default.
  const rememberedTileset = readEditorTileset();
  skinSelect.value = isKnownTileset(initialSkinId ?? null)
    ? (initialSkinId as string)
    : isKnownTileset(rememberedTileset)
      ? (rememberedTileset as string)
      : defaultTilesetId;
  skinSelect.addEventListener("change", () => {
    writeEditorTileset(skinSelect.value);
  });
  skinLabel.append(skinSelect);
  heading.append(skinLabel);

  // Colour theme (overworld / underground / castle) — recolours the tiles and
  // backdrop when play-testing.
  const themeLabel = document.createElement("label");
  themeLabel.textContent = " Theme ";
  themeLabel.style.cssText = "font-size:12px;color:#cbd5e1;";
  const themeSelect = document.createElement("select");
  themeSelect.setAttribute("aria-label", "Theme");
  themeSelect.style.cssText =
    "padding:5px 8px;border-radius:6px;border:2px solid #334155;background:#1e293b;color:#e5e7eb;font:600 12px monospace;";
  for (const [value, label] of [
    ["overworld", "Overworld"],
    ["underground", "Underground"],
    ["castle", "Castle"],
    ["water", "Water (swim)"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    themeSelect.append(option);
  }
  if (initialTheme !== undefined) {
    themeSelect.value = initialTheme;
  }
  themeLabel.append(themeSelect);
  heading.append(themeLabel);

  const status = document.createElement("span");
  status.style.cssText = "font-size:12px;color:#cbd5e1;min-width:180px;";

  const gridWrap = document.createElement("div");
  gridWrap.setAttribute("aria-label", "Level grid");
  gridWrap.style.cssText =
    "overflow:auto;border:2px solid #334155;border-radius:8px;background:#0b1220;padding:6px;max-height:56vh;";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;gap:1px;width:max-content;";
  gridWrap.append(grid);

  // Minimap: a scaled overview of the whole level with a viewport box; click or
  // drag it to scroll a large level into view.
  const minimapCanvas = document.createElement("canvas");
  minimapCanvas.setAttribute("aria-label", "Minimap");
  minimapCanvas.style.cssText =
    "display:block;margin-top:8px;border:1px solid #334155;border-radius:4px;background:#0b1220;cursor:pointer;max-width:100%;height:auto;image-rendering:pixelated;";
  const mmCtx = minimapCanvas.getContext("2d");
  let minimapScale = 4;

  function sizeMinimap(): void {
    minimapScale = Math.max(1, Math.round(56 / height));
    minimapCanvas.width = width * minimapScale;
    minimapCanvas.height = height * minimapScale;
  }

  function renderMinimap(): void {
    if (mmCtx === null) {
      return;
    }
    mmCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const item =
          paletteByKey.get(cells[y]?.[x] ?? skyKey) ?? paletteByKey.get(skyKey);
        if (item === undefined) {
          continue;
        }
        mmCtx.fillStyle = item.color;
        mmCtx.fillRect(
          x * minimapScale,
          y * minimapScale,
          minimapScale,
          minimapScale,
        );
      }
    }
    const gridW = width * cellPixels;
    const gridH = height * cellPixels;
    mmCtx.strokeStyle = "#fbbf24";
    mmCtx.lineWidth = minimapScale;
    mmCtx.strokeRect(
      (gridWrap.scrollLeft / gridW) * minimapCanvas.width,
      (gridWrap.scrollTop / gridH) * minimapCanvas.height,
      Math.min(
        (gridWrap.clientWidth / gridW) * minimapCanvas.width,
        minimapCanvas.width,
      ),
      Math.min(
        (gridWrap.clientHeight / gridH) * minimapCanvas.height,
        minimapCanvas.height,
      ),
    );
  }

  function scrollFromMinimap(event: MouseEvent): void {
    const rect = minimapCanvas.getBoundingClientRect();
    gridWrap.scrollLeft =
      ((event.clientX - rect.left) / rect.width) * (width * cellPixels) -
      gridWrap.clientWidth / 2;
    gridWrap.scrollTop =
      ((event.clientY - rect.top) / rect.height) * (height * cellPixels) -
      gridWrap.clientHeight / 2;
  }
  let minimapDragging = false;
  minimapCanvas.addEventListener("mousedown", (event) => {
    event.preventDefault();
    minimapDragging = true;
    scrollFromMinimap(event);
  });
  minimapCanvas.addEventListener("mousemove", (event) => {
    if (minimapDragging) {
      scrollFromMinimap(event);
    }
  });
  gridWrap.addEventListener("scroll", () => renderMinimap());

  // Pan: in Pan mode or with the middle mouse button, drag scrolls the grid.
  // Capture phase + stopPropagation so the cell paint handlers don't also fire.
  gridWrap.addEventListener(
    "mousedown",
    (event) => {
      if (tool === "pan" || event.button === 1) {
        event.preventDefault();
        event.stopPropagation();
        panState = {
          startX: event.clientX,
          startY: event.clientY,
          scrollLeft: gridWrap.scrollLeft,
          scrollTop: gridWrap.scrollTop,
        };
      }
    },
    { capture: true },
  );

  const cellButtons: HTMLButtonElement[][] = [];

  function renderGrid(): void {
    grid.style.gridTemplateColumns = `repeat(${width}, ${cellPixels}px)`;
    grid.replaceChildren();
    cellButtons.length = 0;
    // The old cell buttons (and any selection highlight on them) are gone.
    selection = null;
    selectionCells = [];
    for (let y = 0; y < height; y += 1) {
      const row: HTMLButtonElement[] = [];
      for (let x = 0; x < width; x += 1) {
        const cell = document.createElement("button");
        cell.style.cssText = `width:${cellPixels}px;height:${cellPixels}px;padding:0;border:0;cursor:pointer;`;
        cell.setAttribute("aria-label", `cell ${x},${y}`);
        paintCellAppearance(cell, cells[y]?.[x] ?? skyKey);
        cell.addEventListener("mousedown", (event) => {
          event.preventDefault();
          // Connect tool: pick a pipe mouth, then any destination cell.
          if (tool === "connect") {
            if (pendingWarpSource === null) {
              if (cells[y]?.[x] === "pipe") {
                pendingWarpSource = { areaName: activeAreaName, x, y };
                status.style.color = "#93c5fd";
                status.textContent =
                  "Pick a destination cell (switch areas for a cross-area warp; Esc to cancel).";
              } else {
                status.style.color = "#fca5a5";
                status.textContent = "Pick a Pipe ⤓ mouth first.";
              }
              return;
            }
            warps.set(
              warpKey(
                pendingWarpSource.areaName,
                pendingWarpSource.x,
                pendingWarpSource.y,
              ),
              { areaName: activeAreaName, x, y },
            );
            const crossArea = pendingWarpSource.areaName !== activeAreaName;
            pendingWarpSource = null;
            renderGrid();
            status.style.color = "#86efac";
            status.textContent = crossArea
              ? `Pipe connected to area "${activeAreaName}".`
              : "Pipe connected to its destination.";
            return;
          }
          // Eyedropper picks the brush from a cell; no mutation, no history.
          if (tool === "eyedropper") {
            const picked = cells[y]?.[x];
            if (picked !== undefined) {
              selectPalette(picked);
            }
            return;
          }
          if (tool === "select") {
            selecting = true;
            selectStart = { x, y };
            setSelection(x, y, x, y);
            return;
          }
          // Placing the same brush on a cell that already holds it clears the
          // cell (a toggle); a different brush just replaces what is there. Coin
          // is exempt — it stacks into a coin block instead. Decided once per
          // stroke (at press) so dragging out new cells isn't affected.
          const alreadyHasBrush =
            selectedKey !== "coin" && cells[y]?.[x] === selectedKey;
          erasing =
            event.button === 2 ||
            tool === "erase" ||
            (tool === "draw" && alreadyHasBrush);
          const key = erasing ? skyKey : selectedKey;
          const item = paletteByKey.get(key);
          // Fill/rect/line of a unique actor (player/goal) would place many, so
          // fall back to a normal single placement for those.
          const isUnique = item?.kind === "actor" && item.unique === true;
          pushHistory(); // snapshot once at the start of the action
          if (tool === "fill" && !isUnique) {
            floodFill(x, y, key);
            renderMinimap();
            return;
          }
          if ((tool === "rect" || tool === "line") && !isUnique) {
            rectShape = tool === "line" ? "line" : "rect";
            rectStart = { x, y };
            rectEnd = { x, y };
            rectKey = key;
            showRectPreview(x, y);
            return;
          }
          painting = true;
          applyBrush(x, y);
        });
        cell.addEventListener("mouseenter", () => {
          hoverStrokeAt(x, y);
        });
        cell.addEventListener("contextmenu", (event) => event.preventDefault());
        grid.append(cell);
        row.push(cell);
      }
      cellButtons.push(row);
    }
    renderPipeWarpMarkers();
    sizeMinimap();
    renderMinimap();
    syncSizeInputs();
  }

  // Outline connected pipe mouths (and their destinations) so warp links are
  // visible while editing.
  function renderPipeWarpMarkers(): void {
    const prefix = `${activeAreaName}:`;
    for (const [key, destination] of warps) {
      if (key.startsWith(prefix)) {
        const [sx, sy] = key.slice(prefix.length).split(",").map(Number);
        const sourceButton = cellButtons[sy ?? -1]?.[sx ?? -1];
        if (sourceButton !== undefined) {
          sourceButton.style.boxShadow = "inset 0 0 0 2px #38bdf8";
        }
      }
      if (destination.areaName === activeAreaName) {
        const destinationButton = cellButtons[destination.y]?.[destination.x];
        if (destinationButton !== undefined) {
          destinationButton.style.boxShadow = "inset 0 0 0 2px #f472b6";
          if (destinationButton.textContent === "") {
            destinationButton.textContent = "◎";
            destinationButton.style.color = "#f472b6";
          }
        }
      }
    }
  }

  function applyBrush(x: number, y: number): void {
    if (erasing) {
      setCell(x, y, skyKey);
    } else {
      applyCell(x, y);
    }
  }

  // Continue an in-progress stroke over a cell (shared by mouse hover and touch
  // drag): paint, extend a rect/line preview, or grow a selection.
  function hoverStrokeAt(x: number, y: number): void {
    if (painting) {
      applyBrush(x, y);
    } else if (rectStart !== null) {
      showRectPreview(x, y);
    } else if (selecting && selectStart !== null) {
      setSelection(selectStart.x, selectStart.y, x, y);
    }
  }

  // The grid cell under a screen point, via its "cell x,y" aria-label.
  function cellCoordsFromPoint(
    clientX: number,
    clientY: number,
  ): { readonly x: number; readonly y: number } | undefined {
    const target = document.elementFromPoint(clientX, clientY);
    const match =
      target instanceof HTMLElement
        ? /^cell (\d+),(\d+)$/.exec(target.getAttribute("aria-label") ?? "")
        : null;
    return match === null
      ? undefined
      : { x: Number(match[1]), y: Number(match[2]) };
  }

  function applyCell(x: number, y: number): void {
    const item = paletteByKey.get(selectedKey);
    if (item === undefined) {
      return;
    }
    // A unique actor (the player start) may exist only once.
    if (item.kind === "actor" && item.unique === true) {
      for (let yy = 0; yy < height; yy += 1) {
        for (let xx = 0; xx < width; xx += 1) {
          if (cells[yy]?.[xx] === selectedKey) {
            setCell(xx, yy, skyKey);
          }
        }
      }
    }
    setCell(x, y, cellKeyForBrushAt(x, y));
  }

  function setCell(x: number, y: number, key: string): void {
    const row = cells[y];
    if (row === undefined || row[x] === undefined) {
      return;
    }
    // A cell that stops being a pipe mouth loses its warp link.
    if (row[x] === "pipe" && key !== "pipe") {
      warps.delete(warpKey(activeAreaName, x, y));
    }
    row[x] = key;
    const button = cellButtons[y]?.[x];
    if (button !== undefined) {
      paintCellAppearance(button, key);
    }
  }

  // Rectangle tool: while dragging, preview the filled rectangle by repainting
  // the covered cells' appearance (without touching the data), then commit on
  // release. Preview is restored from the real `cells` on each move.
  function clearRectPreview(): void {
    for (const [px, py] of rectPreviewCells) {
      const button = cellButtons[py]?.[px];
      if (button !== undefined) {
        paintCellAppearance(button, cells[py]?.[px] ?? skyKey);
      }
    }
    rectPreviewCells = [];
  }
  function rectBounds(
    x: number,
    y: number,
  ): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } {
    const start = rectStart ?? { x, y };
    return {
      x0: Math.min(start.x, x),
      y0: Math.min(start.y, y),
      x1: Math.max(start.x, x),
      y1: Math.max(start.y, y),
    };
  }
  // Cells covered by the current drag: a filled box for Rect, a Bresenham line
  // for Line (so it reads as one straight run of tiles).
  function shapeCells(x: number, y: number): [number, number][] {
    if (rectStart === null) {
      return [];
    }
    if (rectShape === "line") {
      const cells: [number, number][] = [];
      let cx = rectStart.x;
      let cy = rectStart.y;
      const dx = Math.abs(x - cx);
      const dy = -Math.abs(y - cy);
      const sx = cx < x ? 1 : -1;
      const sy = cy < y ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        cells.push([cx, cy]);
        if (cx === x && cy === y) {
          break;
        }
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          cx += sx;
        }
        if (e2 <= dx) {
          err += dx;
          cy += sy;
        }
      }
      return cells;
    }
    const { x0, y0, x1, y1 } = rectBounds(x, y);
    const cells: [number, number][] = [];
    for (let yy = y0; yy <= y1; yy += 1) {
      for (let xx = x0; xx <= x1; xx += 1) {
        cells.push([xx, yy]);
      }
    }
    return cells;
  }
  function showRectPreview(x: number, y: number): void {
    clearRectPreview();
    if (rectStart === null) {
      return;
    }
    rectEnd = { x, y };
    for (const [xx, yy] of shapeCells(x, y)) {
      const button = cellButtons[yy]?.[xx];
      if (button !== undefined) {
        paintCellAppearance(button, rectKey);
        rectPreviewCells.push([xx, yy]);
      }
    }
  }
  function commitRect(): void {
    if (rectStart === null) {
      return;
    }
    const targets = shapeCells(rectEnd.x, rectEnd.y);
    rectPreviewCells = [];
    for (const [xx, yy] of targets) {
      setCell(xx, yy, rectKey);
    }
    rectStart = null;
  }

  // --- Select tool: marquee + clipboard ---
  function renderSelection(): void {
    for (const button of selectionCells) {
      button.style.boxShadow = "";
    }
    selectionCells = [];
    if (selection === null) {
      return;
    }
    for (let y = selection.y0; y <= selection.y1; y += 1) {
      for (let x = selection.x0; x <= selection.x1; x += 1) {
        const button = cellButtons[y]?.[x];
        if (button !== undefined) {
          button.style.boxShadow = "inset 0 0 0 40px rgba(56,189,248,0.35)";
          selectionCells.push(button);
        }
      }
    }
  }
  function setSelection(ax: number, ay: number, bx: number, by: number): void {
    selection = {
      x0: Math.max(0, Math.min(ax, bx)),
      y0: Math.max(0, Math.min(ay, by)),
      x1: Math.min(width - 1, Math.max(ax, bx)),
      y1: Math.min(height - 1, Math.max(ay, by)),
    };
    renderSelection();
  }
  function eachSelected(callback: (x: number, y: number) => void): void {
    if (selection === null) {
      return;
    }
    for (let y = selection.y0; y <= selection.y1; y += 1) {
      for (let x = selection.x0; x <= selection.x1; x += 1) {
        callback(x, y);
      }
    }
  }
  function copySelection(): void {
    if (selection === null) {
      return;
    }
    const rows: string[][] = [];
    for (let y = selection.y0; y <= selection.y1; y += 1) {
      const row: string[] = [];
      for (let x = selection.x0; x <= selection.x1; x += 1) {
        row.push(cells[y]?.[x] ?? skyKey);
      }
      rows.push(row);
    }
    clipboard = rows;
  }
  function deleteSelection(): void {
    if (selection === null) {
      return;
    }
    pushHistory();
    eachSelected((x, y) => setCell(x, y, skyKey));
    renderSelection();
    renderMinimap();
  }
  function cutSelection(): void {
    copySelection();
    deleteSelection();
  }
  function pasteClipboard(): void {
    if (clipboard === null || selection === null) {
      return;
    }
    pushHistory();
    const originX = selection.x0;
    const originY = selection.y0;
    for (let dy = 0; dy < clipboard.length; dy += 1) {
      const row = clipboard[dy];
      if (row === undefined) {
        continue;
      }
      for (let dx = 0; dx < row.length; dx += 1) {
        const key = row[dx];
        // Skip unique actors (player/goal) so a paste can't duplicate them.
        const item = key === undefined ? undefined : paletteByKey.get(key);
        if (key === undefined || (item?.kind === "actor" && item.unique)) {
          continue;
        }
        setCell(originX + dx, originY + dy, key);
      }
    }
    renderMinimap();
  }

  // Flood-fill the 4-connected region of cells matching the clicked cell's key.
  function floodFill(startX: number, startY: number, key: string): void {
    const target = cells[startY]?.[startX];
    if (target === undefined || target === key) {
      return;
    }
    const stack: [number, number][] = [[startX, startY]];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined) {
        break;
      }
      const [x, y] = next;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }
      if (cells[y]?.[x] !== target) {
        continue;
      }
      setCell(x, y, key);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  const onDocumentMouseMove = (event: MouseEvent): void => {
    if (panState === null) {
      return;
    }
    gridWrap.scrollLeft =
      panState.scrollLeft - (event.clientX - panState.startX);
    gridWrap.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  };
  const onDocumentMouseUp = (): void => {
    if (rectStart !== null) {
      commitRect();
      renderMinimap();
    }
    if (painting) {
      renderMinimap();
    }
    painting = false;
    minimapDragging = false;
    selecting = false;
    panState = null;
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    // Ignore all editor shortcuts while typing in the name field or a dropdown.
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      } else if (key === "c") {
        event.preventDefault();
        copySelection();
      } else if (key === "x") {
        event.preventDefault();
        cutSelection();
      } else if (key === "v") {
        event.preventDefault();
        pasteClipboard();
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selection !== null) {
        event.preventDefault();
        deleteSelection();
      }
      return;
    }
    // Number keys pick a brush (1..9, then 0 for the tenth).
    if (/^[0-9]$/.test(event.key)) {
      const index = event.key === "0" ? 9 : Number(event.key) - 1;
      const item = paletteItems[index];
      if (item !== undefined) {
        event.preventDefault();
        selectPalette(item.key);
      }
      return;
    }
    if (event.key === "Escape" && pendingWarpSource !== null) {
      event.preventDefault();
      pendingWarpSource = null;
      status.style.color = "#cbd5e1";
      status.textContent = "Pipe connection cancelled.";
      return;
    }
    const toolShortcuts: Partial<Record<string, ToolId>> = {
      v: "draw",
      e: "erase",
      g: "fill",
      r: "rect",
      l: "line",
      s: "select",
      i: "eyedropper",
      h: "pan",
      c: "connect",
    };
    const shortcutTool = toolShortcuts[event.key.toLowerCase()];
    if (shortcutTool !== undefined) {
      event.preventDefault();
      selectTool(shortcutTool);
    }
  };
  document.addEventListener("mouseup", onDocumentMouseUp);
  document.addEventListener("mousemove", onDocumentMouseMove);
  document.addEventListener("keydown", onDocumentKeyDown);

  // Touch painting: touch drags don't fire mouseenter, so drive the press logic
  // from touch events. preventDefault suppresses the emulated mouse events (so a
  // cell isn't painted twice) and the page-scroll during a stroke.
  // One finger paints; two fingers are left to the browser so a large level can
  // be scrolled/panned. Returns the touched cell coords, or undefined otherwise.
  function singleTouchCellCoords(
    event: TouchEvent,
  ): { readonly x: number; readonly y: number } | undefined {
    const touch = event.touches[0];
    if (touch === undefined || event.touches.length > 1) {
      return undefined;
    }
    return cellCoordsFromPoint(touch.clientX, touch.clientY);
  }
  const onGridTouchStart = (event: TouchEvent): void => {
    const coords = singleTouchCellCoords(event);
    const cell =
      coords === undefined ? undefined : cellButtons[coords.y]?.[coords.x];
    if (cell === undefined) {
      return;
    }
    event.preventDefault();
    cell.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, bubbles: true }),
    );
  };
  const onGridTouchMove = (event: TouchEvent): void => {
    const coords = singleTouchCellCoords(event);
    if (coords === undefined) {
      return;
    }
    event.preventDefault();
    hoverStrokeAt(coords.x, coords.y);
  };
  grid.addEventListener("touchstart", onGridTouchStart, { passive: false });
  grid.addEventListener("touchmove", onGridTouchMove, { passive: false });
  grid.addEventListener("touchend", onDocumentMouseUp);
  grid.addEventListener("touchcancel", onDocumentMouseUp);

  disposeActiveEditor = () => {
    document.removeEventListener("mouseup", onDocumentMouseUp);
    document.removeEventListener("mousemove", onDocumentMouseMove);
    document.removeEventListener("keydown", onDocumentKeyDown);
    grid.removeEventListener("touchstart", onGridTouchStart);
    grid.removeEventListener("touchmove", onGridTouchMove);
    grid.removeEventListener("touchend", onDocumentMouseUp);
    grid.removeEventListener("touchcancel", onDocumentMouseUp);
  };

  // --- Palette ---
  const paletteBar = document.createElement("div");
  paletteBar.style.cssText =
    "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;";
  const paletteButtons = new Map<string, HTMLButtonElement>();
  function selectPalette(key: string): void {
    selectedKey = key;
    for (const [itemKey, button] of paletteButtons) {
      button.style.outline =
        itemKey === key ? "3px solid #fbbf24" : "2px solid #334155";
    }
  }
  for (const item of paletteItems) {
    const button = document.createElement("button");
    button.textContent = item.label;
    button.style.cssText =
      `display:flex;align-items:center;gap:6px;padding:5px 9px;border-radius:6px;cursor:pointer;` +
      `border:2px solid #334155;background:#1e293b;color:#e5e7eb;font:600 12px monospace;`;
    const swatch = document.createElement("span");
    swatch.style.cssText = `width:14px;height:14px;border-radius:3px;background:${item.color};border:1px solid #00000055;`;
    button.prepend(swatch);
    button.addEventListener("click", () => selectPalette(item.key));
    paletteButtons.set(item.key, button);
    paletteBar.append(button);
  }

  // --- Toolbar ---
  const toolbar = document.createElement("div");
  toolbar.style.cssText =
    "display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px;";

  function toolButton(label: string, background: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.cssText =
      `padding:7px 12px;border:none;border-radius:6px;cursor:pointer;` +
      `background:${background};color:#fff;font:700 13px monospace;`;
    return button;
  }

  function currentLevel(): LevelSpecInput {
    return levelInputFromCells(
      cells,
      width,
      height,
      resolveWarpsForArea(activeAreaName),
    );
  }

  // Rebuild the warp table from a loaded level's pipe actors so their
  // destinations survive an edit → re-emit round-trip.
  function loadPipeWarpsFrom(level: LevelSpecInput, areaName: string): void {
    // Drop this area's existing links, then rebuild from its pipe actors.
    for (const key of [...warps.keys()]) {
      if (key.startsWith(`${areaName}:`)) {
        warps.delete(key);
      }
    }
    const pipeActorIds = new Set(
      level.actorDefinitions
        // Input roles are strings; ActorRole.Pipe === "pipe".
        .filter((definition) => definition.role === "pipe")
        .map((definition) => definition.actorId),
    );
    for (const actor of level.actors) {
      if (
        pipeActorIds.has(actor.actorId) &&
        actor.targetTileX !== undefined &&
        actor.targetTileY !== undefined
      ) {
        warps.set(warpKey(areaName, actor.x, actor.y), {
          areaName: actor.targetLevelName ?? areaName,
          x: actor.targetTileX,
          y: actor.targetTileY,
        });
      }
    }
  }

  // Snapshot the active area and swap in another area's grid.
  // Loading a fresh level (template / file / saved) starts a new single-area
  // document — drop any areas and warps from the previous session.
  function resetAreasToSingle(): void {
    areaOrder.length = 0;
    areaOrder.push(mainAreaName);
    areaLevels.clear();
    warps.clear();
    activeAreaName = mainAreaName;
    pendingWarpSource = null;
    renderAreaSelect();
  }

  function switchArea(name: string): void {
    if (name === activeAreaName || !areaOrder.includes(name)) {
      return;
    }
    areaLevels.set(activeAreaName, currentLevel());
    activeAreaName = name;
    const level = areaLevels.get(name);
    if (level !== undefined) {
      const loaded = cellsFromLevelInput(level);
      cells = loaded.cells;
      width = loaded.width;
      height = loaded.height;
      // The global warp table already holds this area's links (they persist
      // across switches) — don't reload them from the snapshot, which can be
      // stale relative to a just-made connection.
    }
    // Keep any in-progress pipe connection so you can switch here to pick a
    // cross-area destination.
    renderAreaSelect();
    renderGrid();
    status.style.color = "#cbd5e1";
    status.textContent =
      pendingWarpSource !== null
        ? `Area "${name}" — pick the pipe's destination cell.`
        : `Editing area "${name}".`;
  }

  // Create a fresh area (its own player + goal) and switch to it.
  function addArea(): void {
    areaLevels.set(activeAreaName, currentLevel());
    let index = areaOrder.length;
    let name = `area-${String(index)}`;
    while (areaOrder.includes(name)) {
      index += 1;
      name = `area-${String(index)}`;
    }
    const areaWidth = 24;
    const areaHeight = 12;
    areaLevels.set(
      name,
      levelInputFromCells(
        makeStarterCells(areaWidth, areaHeight),
        areaWidth,
        areaHeight,
      ),
    );
    areaOrder.push(name);
    activeAreaName = name;
    const loaded = cellsFromLevelInput(areaLevels.get(name)!);
    cells = loaded.cells;
    width = loaded.width;
    height = loaded.height;
    pendingWarpSource = null;
    renderAreaSelect();
    renderGrid();
  }

  // Every area as a validated set: the main area plus the warp targets.
  function currentLevelSet(): {
    main: LevelSpecInput;
    warpLevels: Map<string, LevelSpecInput>;
  } {
    areaLevels.set(activeAreaName, currentLevel());
    const main = areaLevels.get(mainAreaName) ?? currentLevel();
    const warpLevels = new Map<string, LevelSpecInput>();
    for (const name of areaOrder) {
      // Skip the main area only for single-area levels (nothing to warp to). In
      // a multi-area level include it too, so a pipe in a sub-area can warp back
      // to the main area — the return leg of a round trip.
      if (name === mainAreaName && areaOrder.length <= 1) {
        continue;
      }
      const level = areaLevels.get(name);
      if (level !== undefined) {
        warpLevels.set(name, level);
      }
    }
    return { main, warpLevels };
  }

  function validateAndReport(): LevelSpecInput | undefined {
    const level = currentLevel();
    const result = makeLevelSpec(level);
    if (!result.ok) {
      const hasPlayer = cells.some((row) => row.includes("player"));
      const hasGoal = cells.some((row) => row.includes("goal"));
      status.style.color = "#fca5a5";
      status.textContent = !hasPlayer
        ? "Can't play yet — add a Player start (brush 6)."
        : !hasGoal
          ? "Can't play yet — add a Goal (brush 5)."
          : `Can't play yet — ${result.errors[0]?.code ?? "the level is invalid"}.`;
      return undefined;
    }
    status.style.color = "#86efac";
    status.textContent = "Level OK.";
    return level;
  }

  const playButton = toolButton("▶ Play", "#15803d");
  playButton.addEventListener("click", () => {
    const set = currentLevelSet();
    const toCheck: [string, LevelSpecInput][] = [
      [mainAreaName, set.main],
      ...set.warpLevels,
    ];
    for (const [name, level] of toCheck) {
      if (makeLevelSpec(level).ok) {
        continue;
      }
      const areaCells =
        name === activeAreaName ? cells : cellsFromLevelInput(level).cells;
      const hasPlayer = areaCells.some((row) => row.includes("player"));
      const hasGoal = areaCells.some((row) => row.includes("goal"));
      const prefix =
        areaOrder.length > 1
          ? `Can't play yet — area "${name}": `
          : "Can't play yet — ";
      status.style.color = "#fca5a5";
      status.textContent = !hasPlayer
        ? `${prefix}add a Player start (brush 6).`
        : !hasGoal
          ? `${prefix}add a Goal (brush 5).`
          : `${prefix}the level is invalid.`;
      switchArea(name);
      return;
    }
    status.style.color = "#86efac";
    status.textContent = "Level OK.";
    callbacks.onPlay(
      set.main,
      skinSelect.value,
      set.warpLevels.size > 0 ? set.warpLevels : undefined,
      themeSelect.value as LevelTheme,
    );
  });

  const shareButton = toolButton("🔗 Share", "#0e7490");
  shareButton.addEventListener("click", () => {
    const level = validateAndReport();
    if (level === undefined) {
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}#level=${encodeSharedLevel(level)}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        status.style.color = "#86efac";
        status.textContent = "Share link copied to clipboard!";
      })
      .catch(() => {
        status.style.color = "#fca5a5";
        status.textContent = "Copy failed — link is in the address bar.";
        window.location.hash = `level=${encodeSharedLevel(level)}`;
      });
  });

  const downloadButton = toolButton("⬇ Download", "#2563eb");
  downloadButton.addEventListener("click", () => {
    const level = validateAndReport();
    if (level !== undefined) {
      downloadLevel(level);
    }
  });

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "level name";
  nameInput.setAttribute("aria-label", "Level name");
  nameInput.style.cssText =
    "padding:7px 10px;border-radius:6px;border:2px solid #334155;background:#1e293b;color:#e5e7eb;font:600 12px monospace;";

  const loadInput = document.createElement("input");
  loadInput.type = "file";
  loadInput.accept = ".json,application/json";
  loadInput.style.display = "none";
  loadInput.addEventListener("change", () => {
    const file = loadInput.files?.[0];
    loadInput.value = "";
    if (file === undefined) {
      return;
    }
    void file.text().then((text) => {
      const parsed = parseLevelFile(text);
      if (parsed === undefined) {
        status.style.color = "#fca5a5";
        status.textContent = "Could not read that level file.";
        return;
      }
      pushHistory();
      resetAreasToSingle();
      const loaded = cellsFromLevelInput(parsed);
      width = loaded.width;
      height = loaded.height;
      cells = loaded.cells;
      loadPipeWarpsFrom(parsed, activeAreaName);
      // Prefill the name from the file (like the template/saved-level loads) so a
      // follow-up Save doesn't complain the level is unnamed.
      nameInput.value = file.name.replace(/\.json$/i, "");
      renderGrid();
      status.style.color = "#86efac";
      status.textContent = `Loaded ${width}×${height} level.`;
    });
  });
  const loadButton = toolButton("⬆ Load", "#4b5563");
  loadButton.addEventListener("click", () => loadInput.click());

  const clearButton = toolButton("✕ Clear", "#4b5563");
  clearButton.addEventListener("click", () => {
    pushHistory();
    cells = makeBlankCells(width, height);
    renderGrid();
    status.textContent = "";
  });

  const undoButton = toolButton("↶ Undo", "#4b5563");
  undoButton.addEventListener("click", () => undo());
  const redoButton = toolButton("↷ Redo", "#4b5563");
  redoButton.addEventListener("click", () => redo());

  // --- Tool drawer: a collapsible vertical rail; one tool active at a time ---
  const drawer = document.createElement("div");
  drawer.setAttribute("role", "toolbar");
  drawer.setAttribute("aria-label", "Tools");
  drawer.style.cssText =
    "display:flex;flex-direction:column;gap:6px;padding:6px;background:#0f172a;" +
    "border:1px solid #334155;border-radius:10px;align-self:flex-start;";
  const toolDefs: readonly (readonly [ToolId, string, string])[] = [
    ["draw", "✏", "Draw (V)"],
    ["erase", "⌫", "Erase (E)"],
    ["fill", "🪣", "Fill (G)"],
    ["rect", "▭", "Rectangle (R)"],
    ["line", "╱", "Line (L)"],
    ["select", "⬚", "Select (S) — copy/cut/paste"],
    ["eyedropper", "⦿", "Eyedropper (I)"],
    ["pan", "✋", "Pan (H)"],
    ["connect", "🔗", "Connect pipe (C) — pick a pipe, then a destination"],
  ];
  const toolButtons = new Map<ToolId, HTMLButtonElement>();
  function selectTool(id: ToolId): void {
    tool = id;
    // Drop the marquee highlight when leaving the Select tool so it doesn't sit
    // over cells being painted.
    if (id !== "select" && selection !== null) {
      selection = null;
      renderSelection();
    }
    for (const [toolId, button] of toolButtons) {
      const active = toolId === id;
      button.style.boxShadow = active ? "0 0 0 2px #fbbf24 inset" : "none";
      button.setAttribute("aria-pressed", String(active));
    }
    gridWrap.style.cursor =
      id === "pan" ? "grab" : id === "eyedropper" ? "crosshair" : "";
  }
  for (const [id, icon, label] of toolDefs) {
    const button = document.createElement("button");
    button.textContent = icon;
    button.title = label;
    button.setAttribute("aria-label", `tool-${id}`);
    button.style.cssText =
      "width:40px;height:40px;border-radius:8px;border:2px solid #334155;" +
      "background:#1e293b;color:#e5e7eb;font-size:18px;cursor:pointer;line-height:1;";
    button.addEventListener("click", () => selectTool(id));
    toolButtons.set(id, button);
    drawer.append(button);
  }
  let drawerCollapsed = false;
  const drawerToggle = document.createElement("button");
  drawerToggle.setAttribute("aria-label", "toggle-tool-drawer");
  drawerToggle.style.cssText =
    "width:40px;height:26px;border-radius:8px;border:2px solid #334155;" +
    "background:#0b1220;color:#93a0bd;cursor:pointer;margin-top:4px;font-size:14px;";
  function syncDrawer(): void {
    for (const button of toolButtons.values()) {
      button.style.display = drawerCollapsed ? "none" : "";
    }
    drawerToggle.textContent = drawerCollapsed ? "›" : "‹";
    drawerToggle.title = drawerCollapsed ? "Show tools" : "Hide tools";
  }
  drawerToggle.addEventListener("click", () => {
    drawerCollapsed = !drawerCollapsed;
    syncDrawer();
  });
  drawer.append(drawerToggle);
  selectTool("draw");
  syncDrawer();

  // The grid + minimap sit in a column beside the tool drawer.
  const workArea = document.createElement("div");
  workArea.style.cssText = "display:flex;gap:8px;align-items:stretch;";
  const gridColumn = document.createElement("div");
  gridColumn.style.cssText =
    "flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;";
  gridColumn.append(gridWrap, minimapCanvas);
  workArea.append(drawer, gridColumn);

  // Direct size inputs (W × H), plus the coarse +/- buttons.
  const sizeInputStyle =
    "width:56px;padding:6px 8px;border-radius:6px;border:2px solid #334155;" +
    "background:#1e293b;color:#e5e7eb;font:600 12px monospace;";
  widthInput.type = "number";
  widthInput.min = String(minWidth);
  widthInput.max = String(maxWidth);
  widthInput.setAttribute("aria-label", "Level width");
  widthInput.style.cssText = sizeInputStyle;
  widthInput.addEventListener("change", () => {
    resizeTo(Number(widthInput.value), height);
  });
  heightInput.type = "number";
  heightInput.min = String(minHeight);
  heightInput.max = String(maxHeight);
  heightInput.setAttribute("aria-label", "Level height");
  heightInput.style.cssText = sizeInputStyle;
  heightInput.addEventListener("change", () => {
    resizeTo(width, Number(heightInput.value));
  });
  const sizeGroup = document.createElement("span");
  sizeGroup.style.cssText =
    "display:inline-flex;align-items:center;gap:4px;color:#93a0bd;font:600 11px monospace;";
  const times = document.createElement("span");
  times.textContent = "×";
  sizeGroup.append("Size", widthInput, times, heightInput);
  syncSizeInputs();

  const widerButton = toolButton("Wider +", "#4b5563");
  widerButton.addEventListener("click", () => resizeTo(width + 4, height));
  const narrowerButton = toolButton("Narrower −", "#4b5563");
  narrowerButton.addEventListener("click", () => resizeTo(width - 4, height));
  const tallerButton = toolButton("Taller +", "#4b5563");
  tallerButton.addEventListener("click", () => resizeTo(width, height + 2));
  const shorterButton = toolButton("Shorter −", "#4b5563");
  shorterButton.addEventListener("click", () => resizeTo(width, height - 2));

  const hint = document.createElement("span");
  hint.textContent =
    "Drawer: V draw · E erase · G fill · R rect · L line · S select (Ctrl+C/X/V, Del) · I pick · H pan · 1–9/0 brush · Ctrl+Z/Y undo.";
  hint.style.cssText = "font-size:11px;color:#94a3b8;margin-left:auto;";

  const addAreaButton = toolButton("＋ Area", "#0f766e");
  addAreaButton.addEventListener("click", () => addArea());
  areaSelect.addEventListener("change", () => switchArea(areaSelect.value));
  renderAreaSelect();

  toolbar.append(
    playButton,
    undoButton,
    redoButton,
    shareButton,
    downloadButton,
    loadButton,
    clearButton,
    sizeGroup,
    narrowerButton,
    widerButton,
    shorterButton,
    tallerButton,
    areaSelect,
    addAreaButton,
    loadInput,
    hint,
  );

  // --- Save / load in the browser (localStorage) ---
  const savedRow = document.createElement("div");
  savedRow.style.cssText =
    "display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;";

  // Template picker: load an existing map into the grid (ephemerally) to edit or
  // use as a starting point. Loaded lazily via the callback.
  const templateSelect = document.createElement("select");
  templateSelect.setAttribute("aria-label", "Template");
  templateSelect.style.cssText =
    "padding:7px 10px;border-radius:6px;border:2px solid #334155;background:#1e293b;color:#e5e7eb;font:600 12px monospace;";
  const templatePlaceholder = document.createElement("option");
  templatePlaceholder.value = "";
  templatePlaceholder.textContent = "— edit an existing map —";
  templateSelect.append(templatePlaceholder);
  let loadedTemplates: readonly {
    readonly name: string;
    readonly level: LevelSpecInput;
  }[] = [];
  if (callbacks.loadTemplates !== undefined) {
    templatePlaceholder.textContent = "— loading maps… —";
    void callbacks
      .loadTemplates()
      .then((templates) => {
        loadedTemplates = templates;
        templatePlaceholder.textContent = "— edit an existing map —";
        for (const template of templates) {
          const option = document.createElement("option");
          option.value = template.name;
          option.textContent = template.name;
          templateSelect.append(option);
        }
      })
      .catch(() => {
        templatePlaceholder.textContent = "— maps unavailable —";
      });
  }
  templateSelect.addEventListener("change", () => {
    const template = loadedTemplates.find(
      (t) => t.name === templateSelect.value,
    );
    if (template === undefined) {
      return;
    }
    pushHistory();
    resetAreasToSingle();
    const loaded = cellsFromLevelInput(template.level);
    width = loaded.width;
    height = loaded.height;
    cells = loaded.cells;
    loadPipeWarpsFrom(template.level, activeAreaName);
    nameInput.value = `${template.name}-copy`;
    renderGrid();
    status.style.color = "#86efac";
    status.textContent = `Editing a copy of "${template.name}".`;
  });

  const savedSelect = document.createElement("select");
  savedSelect.setAttribute("aria-label", "Saved levels");
  savedSelect.style.cssText =
    "padding:7px 10px;border-radius:6px;border:2px solid #334155;background:#1e293b;color:#e5e7eb;font:600 12px monospace;";

  function refreshSavedSelect(selected?: string): void {
    const names = Object.keys(readSavedLevels()).sort();
    savedSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent =
      names.length > 0 ? "— load saved —" : "(no saved levels)";
    savedSelect.append(placeholder);
    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      savedSelect.append(option);
    }
    if (selected !== undefined) {
      savedSelect.value = selected;
    }
  }

  const saveButton = toolButton("💾 Save", "#0e7490");
  saveButton.addEventListener("click", () => {
    const level = validateAndReport();
    if (level === undefined) {
      return;
    }
    const name = nameInput.value.trim();
    if (name === "") {
      status.style.color = "#fca5a5";
      status.textContent = "Name the level before saving.";
      return;
    }
    const levels = readSavedLevels();
    levels[name] = level;
    writeSavedLevels(levels);
    refreshSavedSelect(name);
    status.style.color = "#86efac";
    status.textContent = `Saved "${name}" in this browser.`;
  });

  savedSelect.addEventListener("change", () => {
    const name = savedSelect.value;
    if (name === "") {
      return;
    }
    const level = readSavedLevels()[name];
    if (level === undefined) {
      return;
    }
    pushHistory();
    resetAreasToSingle();
    const loaded = cellsFromLevelInput(level);
    width = loaded.width;
    height = loaded.height;
    cells = loaded.cells;
    loadPipeWarpsFrom(level, activeAreaName);
    nameInput.value = name;
    renderGrid();
    status.style.color = "#86efac";
    status.textContent = `Loaded "${name}".`;
  });

  const deleteButton = toolButton("🗑 Delete", "#4b5563");
  deleteButton.addEventListener("click", () => {
    const name = savedSelect.value;
    if (name === "") {
      return;
    }
    const levels = readSavedLevels();
    delete levels[name];
    writeSavedLevels(levels);
    refreshSavedSelect();
    status.textContent = `Deleted "${name}".`;
  });

  savedRow.append(
    templateSelect,
    nameInput,
    saveButton,
    savedSelect,
    deleteButton,
  );

  heading.append(status, infoButton);
  root.append(heading, paletteBar, workArea, toolbar, savedRow);
  parent.append(root);

  selectPalette("ground");
  refreshSavedSelect();
  renderGrid();

  // --- Guided tutorial (spotlight walkthrough) + detailed static guide ---
  // The tip card must never cover the session tab bar pinned at the top.
  const tutorialTipMinTopPixels = 56;

  function tutorialSteps(): readonly {
    readonly target: HTMLElement;
    readonly title: string;
    readonly body: string;
  }[] {
    return [
      {
        target: paletteBar,
        title: "1 / 8 · Palette",
        body: "Pick what to place: tiles, blocks, pipes, cannons, enemies, firebars, podoboos, lifts, coins, and the Player and Goal. Every level needs exactly one Player and one Goal.",
      },
      {
        target: drawer,
        title: "2 / 8 · Tools",
        body: "Draw (V), Erase (E), Fill (G), Rectangle (R), Line (L), Select (S — then Ctrl+C/X/V), Pick (I) and Pan (H). Keys 1–9/0 jump between brushes.",
      },
      {
        target: gridWrap,
        title: "3 / 8 · Canvas",
        body: "Click or drag on the grid to paint the selected item. Undo and redo with Ctrl+Z / Ctrl+Y. Drag the minimap to move around big levels.",
      },
      {
        target: skinSelect,
        title: "4 / 8 · Tileset & theme",
        body: "Choose the sprite tileset and a colour theme — overworld, underground, castle, or water. Water swaps in floaty swim physics when you play.",
      },
      {
        target: addAreaButton,
        title: "5 / 8 · Areas",
        body: "Add extra areas — like an underground room — and switch between them with the Area dropdown. Each area is its own little map.",
      },
      {
        target: drawer,
        title: "6 / 8 · Pipes & teleports",
        body: "Paint a pipe mouth from the palette, then pick the 🔗 Connect tool, click the pipe, and click a destination cell — in this area or another — to turn it into a warp.",
      },
      {
        target: playButton,
        title: "7 / 8 · Play-test",
        body: "Hit ▶ Play to try your level right now. Press Esc in-game to return here — your level, areas and theme are all kept.",
      },
      {
        target: shareButton,
        title: "8 / 8 · Save & share",
        body: "🔗 Share copies a link to your level, ⬇ Download saves a file, and you can Save named levels right in your browser.",
      },
    ];
  }

  function startEditorTutorial(): void {
    const steps = tutorialSteps();
    const spotlight = document.createElement("div");
    spotlight.setAttribute("aria-hidden", "true");
    spotlight.style.cssText =
      "position:fixed;z-index:99998;border:3px solid #38bdf8;border-radius:10px;" +
      "box-shadow:0 0 0 9999px rgba(2,6,23,0.7);pointer-events:none;transition:all 0.2s ease;";
    const tip = document.createElement("div");
    tip.setAttribute("role", "dialog");
    tip.setAttribute("aria-label", "Editor tutorial");
    // The tip floats over the UI, but only its own buttons capture clicks — the
    // dimmed editor underneath stays fully interactive (and testable).
    tip.style.cssText =
      "position:fixed;z-index:99999;max-width:340px;background:#0b1220;color:#f8fafc;" +
      "border:2px solid #38bdf8;border-radius:12px;padding:16px 18px;font:14px/1.55 monospace;" +
      "box-shadow:0 10px 30px rgba(0,0,0,0.5);pointer-events:none;";
    const finish = (): void => {
      writeEditorTutorialSeen();
      spotlight.remove();
      tip.remove();
      window.removeEventListener("resize", show);
    };
    let index = 0;
    function show(): void {
      const step = steps[index];
      if (step === undefined) {
        finish();
        return;
      }
      step.target.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = step.target.getBoundingClientRect();
      spotlight.style.left = `${String(rect.left - 6)}px`;
      spotlight.style.top = `${String(rect.top - 6)}px`;
      spotlight.style.width = `${String(rect.width + 12)}px`;
      spotlight.style.height = `${String(rect.height + 12)}px`;
      // Place the tip below the target, or above if there's no room.
      const below = rect.bottom + 12;
      const useAbove = below + 160 > window.innerHeight;
      tip.style.left = `${String(Math.max(12, Math.min(rect.left, window.innerWidth - 360)))}px`;
      // Keep the tip clear of the session tab bar at the top of the page.
      tip.style.top = useAbove
        ? `${String(Math.max(tutorialTipMinTopPixels, rect.top - 176))}px`
        : `${String(below)}px`;
      tip.replaceChildren();
      const heading = document.createElement("div");
      heading.textContent = step.title;
      heading.style.cssText =
        "font-weight:800;color:#38bdf8;margin-bottom:6px;letter-spacing:0.5px;";
      const body = document.createElement("div");
      body.textContent = step.body;
      const controls = document.createElement("div");
      controls.style.cssText =
        "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;";
      const skip = document.createElement("button");
      skip.textContent = "Skip";
      skip.style.cssText =
        "padding:7px 12px;border-radius:7px;border:1px solid #475569;background:transparent;color:#cbd5e1;font:600 12px monospace;cursor:pointer;margin-right:auto;pointer-events:auto;";
      skip.addEventListener("click", finish);
      const back = document.createElement("button");
      back.textContent = "Back";
      back.style.cssText =
        "padding:7px 12px;border-radius:7px;border:1px solid #475569;background:#1e293b;color:#e5e7eb;font:600 12px monospace;cursor:pointer;pointer-events:auto;";
      back.disabled = index === 0;
      back.style.opacity = index === 0 ? "0.4" : "1";
      back.addEventListener("click", () => {
        index = Math.max(0, index - 1);
        show();
      });
      const next = document.createElement("button");
      next.textContent = index === steps.length - 1 ? "Done" : "Next";
      next.style.cssText =
        "padding:7px 14px;border-radius:7px;border:none;background:#0f766e;color:#fff;font:700 12px monospace;cursor:pointer;pointer-events:auto;";
      next.addEventListener("click", () => {
        index += 1;
        show();
      });
      controls.append(skip, back, next);
      tip.append(heading, body, controls);
    }
    window.addEventListener("resize", show);
    // Attach to the editor root (not document.body) so leaving the editor —
    // e.g. into a play-test — tears the walkthrough down with it.
    root.append(spotlight, tip);
    show();
  }

  function showEditorGuide(): void {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,0.72);display:flex;" +
      "align-items:center;justify-content:center;padding:20px;";
    const panel = document.createElement("div");
    panel.style.cssText =
      "max-width:680px;max-height:86vh;overflow:auto;background:#0b1220;color:#e5e7eb;" +
      "border:2px solid #38bdf8;border-radius:16px;padding:26px 30px;font:14px/1.65 monospace;";
    panel.innerHTML = editorGuideHtml;
    const close = document.createElement("button");
    close.textContent = "✕ Close";
    close.style.cssText =
      "position:sticky;top:0;float:right;padding:8px 14px;border-radius:8px;border:none;" +
      "background:#334155;color:#fff;font:700 13px monospace;cursor:pointer;";
    close.addEventListener("click", () => overlay.remove());
    panel.prepend(close);
    overlay.append(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.remove();
      }
    });
    root.append(overlay);
  }

  // Show the walkthrough automatically the first time someone opens the editor.
  if (!readEditorTutorialSeen()) {
    startEditorTutorial();
  }
}

function paintCellAppearance(button: HTMLButtonElement, key: string): void {
  const coin = coinBlockInfoFromKey(key);
  if (coin !== undefined) {
    // A coin embedded in a block: the source block is the background (a brick
    // keeps its brick colour), with the coin(s) drawn over it — a single coin
    // shows a coin, more show the count (×2, ×3…).
    const sourceColor =
      paletteByKey.get(coin.brick ? "brick" : "block")?.color ?? "#9aa0a6";
    const coinColor = paletteByKey.get(coinContentsActorId)?.color ?? "#f1c40f";
    button.style.background = sourceColor;
    button.style.boxShadow = "inset 0 0 0 1px #00000033";
    button.textContent = coin.count > 1 ? `×${String(coin.count)}` : "●";
    button.style.color = coinColor;
    button.style.font = "700 12px monospace";
    return;
  }
  const item = paletteByKey.get(key) ?? paletteByKey.get(skyKey)!;
  button.style.background = item.color;
  button.style.boxShadow =
    item.kind === "tile"
      ? "inset 0 0 0 1px #00000022"
      : "inset 0 0 0 2px #ffffffcc";
  button.textContent = item.kind === "tile" ? "" : (item.label[0] ?? "");
  button.style.color = "#0b1220";
  button.style.font = "700 12px monospace";
}

function makeBlankCells(width: number, height: number): string[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => skyKey),
  );
}

// A minimal valid starting point: a ground floor, a player, and a goal.
function makeStarterCells(width: number, height: number): string[][] {
  const cells = makeBlankCells(width, height);
  const floorRow = cells[height - 1];
  const standRow = cells[height - 2];
  if (floorRow !== undefined) {
    floorRow.fill("ground");
  }
  if (standRow !== undefined) {
    standRow[2] = "player";
    standRow[width - 3] = "goal";
  }
  return cells;
}

function resizeCells(
  cells: readonly (readonly string[])[],
  width: number,
  height: number,
): string[][] {
  return Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_col, x) => cells[y]?.[x] ?? skyKey),
  );
}

// Bottom-anchored height resize: growing adds sky rows on top, shrinking drops
// top rows, so the ground floor stays at the bottom.
function resizeHeight(
  cells: readonly (readonly string[])[],
  width: number,
  newHeight: number,
): string[][] {
  const shift = newHeight - cells.length;
  return Array.from({ length: newHeight }, (_row, y) =>
    Array.from({ length: width }, (_col, x) => cells[y - shift]?.[x] ?? skyKey),
  );
}

// Tile definitions for editor block types that aren't in the standard surface
// set — added only when the level actually uses them.
function extraTileDefinitionsFor(
  tiles: readonly (readonly string[])[],
): LevelSpecInput["tileDefinitions"] {
  const usedTileIds = new Set(tiles.flat());
  const definitions: LevelSpecInput["tileDefinitions"][number][] = [];
  if (usedTileIds.has("breakable-block")) {
    definitions.push({
      tileId: "breakable-block",
      collision: TileCollisionKind.Breakable,
    });
  }
  if (usedTileIds.has("mystery-box")) {
    definitions.push({
      tileId: "mystery-box",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "spark-cap",
      contentSpawnLimit: 1,
    });
  }
  if (usedTileIds.has("hidden-block")) {
    // Invisible until bumped from below, then a solid block yielding a coin.
    definitions.push({
      tileId: "hidden-block",
      collision: TileCollisionKind.Hidden,
      contentsActorId: coinContentsActorId,
      contentSpawnLimit: 1,
    });
  }
  if (usedTileIds.has("cannon-top")) {
    // The cannon's mouth is a solid hazard, like the shipped cannons.
    definitions.push({
      tileId: "cannon-top",
      collision: TileCollisionKind.SolidHazard,
    });
  }
  for (const pipeTileId of [
    "pipe-top-left",
    "pipe-top-right",
    "pipe-left",
    "pipe-right",
  ]) {
    if (usedTileIds.has(pipeTileId)) {
      definitions.push({
        tileId: pipeTileId,
        collision: TileCollisionKind.Solid,
      });
    }
  }
  return definitions;
}

// Each cannon tile fires a stompable Bullet Bill leftward from its mouth (the
// open tile directly above it), on a fixed cadence.
function buildCannonSpawners(
  tiles: readonly (readonly string[])[],
): NonNullable<LevelSpecInput["timedHazardProjectileSpawners"]> {
  const spawners: NonNullable<
    LevelSpecInput["timedHazardProjectileSpawners"]
  >[number][] = [];
  tiles.forEach((row, y) => {
    row.forEach((tileId, x) => {
      // Skip cannons on the top row — there is no mouth tile above them.
      if (tileId !== "cannon-top" || y < 1) {
        return;
      }
      spawners.push({
        spawnerId: `cannon-${String(x)}-${String(y)}`,
        x,
        y: y - 1,
        direction: "left",
        intervalFrames: 150,
        initialDelayFrames: 0,
        speedPixelsPerSecond: 96,
        widthPixels: 14,
        heightPixels: 14,
        lifetimeFrames: 300,
        stompable: true,
      });
    });
  });
  return spawners;
}

function levelInputFromCells(
  cells: readonly (readonly string[])[],
  width: number,
  height: number,
  // Warp destinations for pipe-mouth cells, keyed "x,y". A targetLevelName marks
  // a cross-area warp.
  pipeWarps?: ReadonlyMap<
    string,
    {
      readonly x: number;
      readonly y: number;
      readonly targetLevelName?: string;
    }
  >,
): LevelSpecInput {
  const usedCoinTileIds = new Set<string>();
  const tiles = cells.map((row) =>
    row.map((key) => {
      const coin = coinBlockInfoFromKey(key);
      if (coin !== undefined) {
        const tileId = coinBlockTileId(coin.count, coin.brick);
        usedCoinTileIds.add(tileId);
        return tileId;
      }
      const item = paletteByKey.get(key);
      if (item === undefined) {
        return "sky";
      }
      // Tile brushes paint their tile; actor brushes sit on sky unless they
      // carry their own tile (the goal is an Exit actor on a Goal tile).
      return item.kind === "tile" ? item.tileId : (item.tileId ?? "sky");
    }),
  );

  const actors: {
    entityId: string;
    actorId: string;
    x: number;
    y: number;
    targetTileX?: number;
    targetTileY?: number;
    targetLevelName?: string;
  }[] = [];
  const enemyPatrolSpeedByEntityId: Record<string, number> = {};
  const counters = new Map<string, number>();
  cells.forEach((row, y) => {
    row.forEach((key, x) => {
      const item = paletteByKey.get(key);
      if (item === undefined || item.kind !== "actor") {
        return;
      }
      const next = (counters.get(item.key) ?? 0) + 1;
      counters.set(item.key, next);
      // "Unique" actors (player, goal) keep the bare key for the first one, but
      // still get a suffix if a level happens to have several (e.g. an official
      // level with more than one exit) — otherwise their ids would collide.
      const entityId =
        item.unique === true && next === 1
          ? item.key
          : `${item.key}-${String(next)}`;
      // A connected warp pipe carries its destination tile.
      const warp =
        item.role === ActorRole.Pipe ? pipeWarps?.get(`${x},${y}`) : undefined;
      actors.push({
        entityId,
        actorId: item.actorId,
        x,
        y,
        ...(warp !== undefined
          ? {
              targetTileX: warp.x,
              targetTileY: warp.y,
              ...(warp.targetLevelName !== undefined
                ? { targetLevelName: warp.targetLevelName }
                : {}),
            }
          : {}),
      });
      if (enemyRoles.has(item.role)) {
        enemyPatrolSpeedByEntityId[entityId] = editorEnemyPatrolSpeed;
      }
    });
  });

  const cannonSpawners = buildCannonSpawners(tiles);

  // Mechanism markers export into the level's mechanics metadata: firebars
  // anchor to their painted block, podoboos leap from their column, lifts
  // oscillate or drop where placed.
  const firebars: {
    firebarId: string;
    x: number;
    y: number;
    orbCount: number;
    direction: string;
    speed: string;
  }[] = [];
  const podoboos: {
    podobooId: string;
    x: number;
    phaseOffsetFrames: number;
  }[] = [];
  const platforms: {
    platformId: string;
    kind: string;
    x: number;
    y: number;
    widthTiles: number;
  }[] = [];
  cells.forEach((row, y) => {
    row.forEach((key, x) => {
      const item = paletteByKey.get(key);
      if (item === undefined || item.kind !== "mechanism") {
        return;
      }
      switch (item.mechanismId) {
        case "firebar":
          firebars.push({
            firebarId: `firebar-${String(x)}-${String(y)}`,
            x,
            y,
            orbCount: editorFirebarOrbCount,
            direction: "clockwise",
            speed: "slow",
          });
          return;
        case "podoboo":
          podoboos.push({
            podobooId: `podoboo-${String(x)}-${String(y)}`,
            x,
            phaseOffsetFrames: (x * 89) % 384,
          });
          return;
        case "lift-horizontal":
        case "lift-vertical":
        case "lift-drop":
          platforms.push({
            platformId: `lift-${String(x)}-${String(y)}`,
            kind:
              item.mechanismId === "lift-horizontal"
                ? "horizontal"
                : item.mechanismId === "lift-vertical"
                  ? "vertical"
                  : "drop",
            x,
            y,
            widthTiles: editorLiftWidthTiles,
          });
          return;
        default: {
          const invalidMechanism: never = item.mechanismId;
          throw new Error(`Invalid mechanism: ${String(invalidMechanism)}`);
        }
      }
    });
  });

  return {
    widthTiles: width,
    heightTiles: height,
    tileSizePixels: 16,
    tileDefinitions: [
      ...standardSurfaceTileDefinitions,
      ...[...usedCoinTileIds].flatMap((tileId) => {
        const coin = coinBlockInfoFromTileId(tileId);
        return coin === undefined
          ? []
          : [
              {
                tileId,
                collision: TileCollisionKind.Interactive,
                contentsActorId: coinContentsActorId,
                contentSpawnLimit: coin.count,
              },
            ];
      }),
      ...extraTileDefinitionsFor(tiles),
    ],
    actorDefinitions: [
      ...actorItems.map((item) => ({
        actorId: item.actorId,
        role: item.role,
        ...(item.fireproof === true ? { fireproof: true } : {}),
        ...(item.spiky === true ? { spiky: true } : {}),
        ...(item.turnsAtLedges === true ? { turnsAtLedges: true } : {}),
        ...(item.wingedFlight === undefined
          ? {}
          : { wingedFlight: item.wingedFlight }),
        ...(item.projectileHitPoints === undefined
          ? {}
          : { projectileHitPoints: item.projectileHitPoints }),
        ...(item.colliderWidthPixels === undefined
          ? {}
          : { colliderWidthPixels: item.colliderWidthPixels }),
        ...(item.colliderHeightPixels === undefined
          ? {}
          : { colliderHeightPixels: item.colliderHeightPixels }),
      })),
      // The coin dispensed by coin blocks and hidden blocks needs its own
      // actor definition.
      ...(usedCoinTileIds.size > 0 || tiles.flat().includes("hidden-block")
        ? [{ actorId: coinContentsActorId, role: ActorRole.Coin }]
        : []),
    ],
    tiles,
    actors,
    enemyPatrolSpeedByEntityId,
    ...(cannonSpawners.length > 0
      ? { timedHazardProjectileSpawners: cannonSpawners }
      : {}),
    ...(firebars.length > 0 ? { firebars } : {}),
    ...(podoboos.length > 0 ? { podoboos } : {}),
    ...(platforms.length > 0 ? { platforms } : {}),
  };
}

// Editor mechanism tuning: a mid-length firebar and the classic 3-tile lift.
const editorFirebarOrbCount = 6;
const editorLiftWidthTiles = 3;

function cellsFromLevelInput(input: LevelSpecInput): {
  cells: string[][];
  width: number;
  height: number;
} {
  const width = input.widthTiles;
  const height = input.heightTiles;
  const cells = Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_col, x) =>
      paletteKeyForTileId(input.tiles[y]?.[x] ?? "sky"),
    ),
  );

  const roleByActorId = new Map(
    input.actorDefinitions.map((definition) => [
      definition.actorId,
      definition.role,
    ]),
  );
  for (const actor of input.actors) {
    const row = cells[actor.y];
    if (row === undefined || row[actor.x] === undefined) {
      continue;
    }
    const role = roleByActorId.get(actor.actorId);
    const item =
      actorItems.find((candidate) => candidate.actorId === actor.actorId) ??
      actorItems.find((candidate) => candidate.role === role);
    if (item !== undefined) {
      row[actor.x] = item.key;
    }
  }

  // Restore mechanism markers so imported levels keep their firebars,
  // podoboos and lifts through an editing round trip. Lift kinds beyond the
  // editor's three markers map to the closest one (an intentionally lossy
  // simplification, like the rest of the editor round trip).
  for (const firebar of input.firebars ?? []) {
    const row = cells[firebar.y];
    if (row !== undefined && row[firebar.x] !== undefined) {
      row[firebar.x] = "firebar";
    }
  }
  for (const podoboo of input.podoboos ?? []) {
    const row = cells[height - 2];
    if (row !== undefined && row[podoboo.x] !== undefined) {
      row[podoboo.x] = "podoboo";
    }
  }
  for (const platform of input.platforms ?? []) {
    const row = cells[platform.y];
    if (row === undefined || row[platform.x] === undefined) {
      continue;
    }
    row[platform.x] =
      platform.kind === "horizontal" || platform.kind === "balance"
        ? "lifth"
        : platform.kind === "drop"
          ? "liftd"
          : "liftv";
  }

  return { cells, width, height };
}

function downloadLevel(level: LevelSpecInput): void {
  const blob = new Blob([JSON.stringify(level, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "level.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

// Accepts a bare LevelSpecInput JSON or a run.json export (which nests `level`).
function parseLevelFile(text: string): LevelSpecInput | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const candidate =
    isRecord(parsed) && isRecord(parsed.level) ? parsed.level : parsed;
  if (!isLevelSpecInputShape(candidate)) {
    return undefined;
  }
  return makeLevelSpec(candidate).ok ? candidate : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLevelSpecInputShape(value: unknown): value is LevelSpecInput {
  return (
    isRecord(value) &&
    typeof value.widthTiles === "number" &&
    typeof value.heightTiles === "number" &&
    Array.isArray(value.tiles) &&
    Array.isArray(value.actors) &&
    Array.isArray(value.tileDefinitions) &&
    Array.isArray(value.actorDefinitions)
  );
}

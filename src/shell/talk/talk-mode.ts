// Talk mode: a presentation played as a level. Each slide of a talk script is a room;
// its text hangs as a sign in the room's sky, drawn in the talk bitmap font. The presenter
// walks the castaway from room to room with the normal controls, or moves fast with the
// slide bar (previous, a list of every slide, next, mute), PageDown / PageUp (what
// presentation clickers send), Home and End, or by typing a slide number and Enter.
// The current slide's text is also kept in a polite live region, so the talk reads out
// without the canvas.
import type Phaser from "phaser";

import {
  makeTalkLevel,
  talkGroundRow,
  talkPanelHeightPixels,
  talkPanelLeftPixels,
  talkPanelTopPixels,
  talkPanelWidthPixels,
  talkRoomAt,
  talkRoomWidthTiles,
  talkStandXPixels,
  talkStandYPixels,
  talkTileSizePixels,
  type TalkLevel,
  type TalkRoomFeature,
} from "../../engine/levels/talk-level";
import {
  drawTalkGrid,
  talkGridSize,
  talkMountFrames,
  talkMountRiders,
  type TalkPalette,
} from "./talk-art";
import { talkCellWidthPixels, talkGlyphRows } from "./talk-font";
import { talkLinkAt, type TalkLayout } from "./talk-layout";
import { talkSlideText } from "./talk-copy";
import { talkShufflePlaces } from "./talk-shuffle";
import {
  drawTalkCopyButton,
  drawTalkPanel,
  drawTalkText,
  talkCopyButtonAt,
  talkPanelCanvasSize,
  talkPanelColors,
  talkPanelFreeArea,
  talkPanelPaddingPixels,
} from "./talk-panel";
import type { TalkSceneHooks } from "./talk-scene-hooks";
import type { TalkScript, TalkSlide, TalkTransition } from "./talk-script";
import { talkProps, type TalkPropId } from "./talk-props";
import { isFloatingProp, type TalkSceneSpec } from "./talk-scene";
import { drawTalkWorldMap, type TalkMapWorld } from "./talk-map";
import { drawTalkEgressDiagram, talkEgressTravellers } from "./talk-egress";
import { createTalkToolbar } from "./talk-toolbar";
import { talkSlideThemes, type TalkThemeId } from "./talk-themes";
import { talkRoomPlatforms } from "./talk-platforms";
import {
  drawTalkBackdrop,
  drawTalkGround,
  talkBackdropHeightPixels,
  talkGroundOffsetPixels,
  talkBackdropTopPixels,
  talkBackdropWidthPixels,
  talkGroundStripHeightPixels,
  talkGroundWidthPixels,
} from "./talk-backdrop";
import { talkThemeSong } from "./talk-music";
import { layoutTalkSigns } from "./talk-signs";

// the world's scenery hangs behind everything; its ground covers the walkway's tiles
const backdropDepth = -10;
const groundDepth = 1;
const panelDepth = -3;
const artDepth = -2;
const roomWidthPixels = talkRoomWidthTiles * talkTileSizePixels;
const groundTopPixels = talkGroundRow * talkTileSizePixels;
// a typed slide number is forgotten if Enter does not follow within this time
const typedNumberTimeoutMilliseconds = 2000;

// The herd on the "mounts" slide: where each mount paces, in room pixels, and how.
const herdFirstXPixels = 150;
const herdSpacingPixels = 100;
// twice the castaway's size: a mount is something you ride
const mountScale = 2;
const herdPaceRangePixels = 24;
const herdStepMilliseconds = 160;
const herdHopHeightPixels = 6;
const labelGapPixels = 3;
const labelStaggerPixels = 10;

// A slide's props stand between the bush and the room's exit feature.
const propsLeftPixels = 330;
const propsWidthPixels = 140;
const propScale = 2;
const propFloatPixels = 56;
const propFrameMilliseconds = 450;
const propBobPixels = 2;

// What stands between a room and the next one is chosen by the next slide's transition.
export function talkRoomFeature(
  nextTransition: TalkTransition | null,
): TalkRoomFeature {
  switch (nextTransition) {
    case "run":
      return "crates";
    case "ouch":
      return "enemy";
    case "pipe":
      return "pipe";
    case "card":
      return "stairs";
    case "iris":
    case null:
      return "flat";
  }
}

export interface PreparedTalk {
  readonly script: TalkScript;
  readonly level: TalkLevel;
  readonly layouts: readonly TalkLayout[];
  readonly scenes: readonly TalkSceneSpec[];
  readonly worlds: readonly TalkMapWorld[];
  // each slide's world theme: its scenery, ground, platforms and music
  readonly themes: readonly TalkThemeId[];
}

// Lays out every slide and builds the level. Throws, before anything is drawn, if a
// slide overflows its sign, uses a character the font lacks, or has no art of its own.
export function prepareTalk(script: TalkScript): PreparedTalk {
  const { layouts, scenes } = layoutTalkSigns(script);
  const worlds: TalkMapWorld[] = script.slides.flatMap((slide, index) =>
    slide.template === "section" && slide.world !== null
      ? [
          {
            name: slide.world.name,
            icon: scenes[index]?.props[0] ?? null,
          },
        ]
      : [],
  );
  const features = script.slides.map((_, index) =>
    talkRoomFeature(script.slides[index + 1]?.transition ?? null),
  );
  const themes = talkSlideThemes(script.slides);
  const platforms = features.map((feature, index) =>
    talkRoomPlatforms({
      index,
      theme: themes[index] ?? "plains",
      feature,
      last: index === features.length - 1,
      herd: scenes[index]?.special === "mounts",
    }),
  );
  return {
    script,
    level: makeTalkLevel(features, platforms),
    layouts,
    scenes,
    worlds,
    themes,
  };
}

// The text a screen reader hears for a slide.
export function talkSlideSpeech(
  slide: TalkSlide,
  index: number,
  count: number,
): string {
  const parts = [
    `Slide ${String(index + 1)} of ${String(count)}.`,
    slide.world === null
      ? ""
      : `World ${slide.world.number}, ${slide.world.name}.`,
    slide.day === null ? "" : `Day ${slide.day}.`,
    slide.kicker ?? "",
    slide.title ?? "",
    slide.quote ?? "",
    slide.cite === null ? "" : `— ${slide.cite}`,
    ...slide.lead,
    ...slide.bullets,
    ...slide.columns.flatMap((column) => [column.label, ...column.bullets]),
    ...(slide.table === null
      ? []
      : slide.table.rows.map((row) => row.join(", "))),
    ...slide.links.map((link) => `Link: ${link.text}, ${link.url}`),
  ];
  return parts.filter((part) => part.length > 0).join(" ");
}

// A short name for a slide in the slide list.
export function talkSlideName(slide: TalkSlide): string {
  const name =
    slide.title ??
    slide.quote ??
    slide.kicker ??
    (slide.world === null ? "" : `World ${slide.world.number}`);
  return name.length > 48 ? `${name.slice(0, 47)}…` : name;
}

// Which slide a typed number names, or undefined when it names none.
export function talkTypedSlide(
  typed: string,
  count: number,
): number | undefined {
  const number = Number(typed);
  return typed.length > 0 &&
    Number.isInteger(number) &&
    number >= 1 &&
    number <= count
    ? number - 1
    : undefined;
}

export interface TalkMountPace {
  readonly offsetPixels: number;
  readonly facingLeft: boolean;
  readonly frame: number;
  readonly hopPixels: number;
}

// Where pacing mount `index` is at `timeMilliseconds`: an offset in [-range, range]
// that sweeps back and forth, the way it faces, its walk frame and its hop.
export function talkMountPace(
  timeMilliseconds: number,
  index: number,
): TalkMountPace {
  // each mount has its own pace and phase, so the herd never marches in step
  const periodMilliseconds = 2600 + index * 700;
  const phase = (timeMilliseconds / periodMilliseconds + index * 0.37) % 1;
  const sweep = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
  const hopPhase = (timeMilliseconds / 900 + index * 0.5) % 1;
  return {
    offsetPixels: Math.round(sweep * herdPaceRangePixels),
    facingLeft: phase >= 0.5,
    frame: Math.floor(timeMilliseconds / herdStepMilliseconds) % 2,
    // the second mount cannot keep still: chaos needs a hopper
    hopPixels:
      index === 1
        ? Math.round(Math.sin(hopPhase * Math.PI) * herdHopHeightPixels)
        : 0,
  };
}

interface StagedProp {
  readonly id: TalkPropId;
  readonly index: number;
  readonly floating: boolean;
  readonly baseYPixels: number;
  readonly image: Phaser.GameObjects.Image;
  // set when the slide's props keep swapping places (talk-shuffle.ts)
  readonly shuffle: PropShuffle | null;
}

interface PropShuffle {
  readonly count: number;
  readonly leftPixels: number;
  readonly slotPixels: number;
}

// A slide whose props are all switch blocks (the Switch Palaces) shuffles them.
const isSwitchBlock = (id: TalkPropId): boolean =>
  id.startsWith("switch-block-");
// how high a hopping prop rises over its neighbour, in prop heights
const shuffleHopHeights = 1.25;

const propTextureKey = (id: TalkPropId, frame: number): string =>
  `talk-prop-${id}-${String(frame)}`;

function propTextures(scene: Phaser.Scene, id: TalkPropId): void {
  const prop = talkProps[id];
  const frames = [
    prop.grid,
    ...(prop.animated === undefined ? [] : [prop.animated]),
  ];
  frames.forEach((grid, frame) => {
    canvasTexture(
      scene,
      propTextureKey(id, frame),
      talkGridSize(grid, prop.palette),
      (context) => {
        drawTalkGrid(context, grid, prop.palette, 0, 0);
      },
    );
  });
}

// The egress slide's moving parts: two envelopes crossing the diagram on the sign, the
// key the allowed one picks up at the broker, and the stamp on the refused one.
interface EgressActors {
  readonly origin: { readonly x: number; readonly y: number };
  readonly area: TalkPanelArea;
  readonly allowed: Phaser.GameObjects.Image;
  readonly key: Phaser.GameObjects.Image;
  readonly refused: Phaser.GameObjects.Image;
  readonly stamp: Phaser.GameObjects.Image;
}

type TalkPanelArea = ReturnType<typeof talkPanelFreeArea>;

const egressCycleMilliseconds = 7000;

function stageEgress(
  scene: Phaser.Scene,
  room: number,
  layout: TalkLayout,
): EgressActors {
  for (const id of ["envelope", "key", "stamp-deny"] as const) {
    propTextures(scene, id);
  }
  const image = (id: TalkPropId): Phaser.GameObjects.Image =>
    scene.add
      .image(0, 0, propTextureKey(id, 0))
      .setOrigin(0.5, 0.5)
      .setDepth(panelDepth + 1);
  return {
    origin: {
      x: room * roomWidthPixels + talkPanelLeftPixels,
      y: talkPanelTopPixels,
    },
    area: talkPanelFreeArea(
      layout,
      talkPanelWidthPixels,
      talkPanelHeightPixels,
    ),
    allowed: image("envelope"),
    key: image("key"),
    refused: image("envelope"),
    stamp: image("stamp-deny"),
  };
}

function animateEgress(actors: EgressActors | null, now: number): void {
  if (actors === null || !actors.allowed.active) {
    return;
  }
  const travellers = talkEgressTravellers(
    actors.area,
    (now % egressCycleMilliseconds) / egressCycleMilliseconds,
  );
  const at = (point: { readonly x: number; readonly y: number }) => ({
    x: actors.origin.x + point.x,
    y: actors.origin.y + point.y,
  });
  const allowed = at(travellers.allowed);
  actors.allowed.setPosition(allowed.x, allowed.y);
  actors.key
    .setVisible(travellers.carriesKey)
    .setPosition(allowed.x - 6, allowed.y - 10);
  actors.refused.setVisible(travellers.refused !== null);
  actors.stamp.setVisible(travellers.stamped);
  if (travellers.refused !== null) {
    const refused = at(travellers.refused);
    actors.refused.setPosition(refused.x, refused.y);
    actors.stamp.setPosition(refused.x + 6, refused.y - 4);
  }
}

function stageProps(
  scene: Phaser.Scene,
  room: number,
  props: readonly TalkPropId[],
): StagedProp[] {
  const slot = propsWidthPixels / props.length;
  const leftPixels = room * roomWidthPixels + propsLeftPixels;
  const shuffle =
    props.length > 1 && props.every(isSwitchBlock)
      ? { count: props.length, leftPixels, slotPixels: slot }
      : null;
  return props.map((id, index) => {
    propTextures(scene, id);
    const floating = isFloatingProp(id);
    const baseYPixels = groundTopPixels - (floating ? propFloatPixels : 0);
    return {
      id,
      index,
      floating,
      baseYPixels,
      shuffle,
      image: scene.add
        .image(
          room * roomWidthPixels + propsLeftPixels + slot * (index + 0.5),
          baseYPixels,
          propTextureKey(id, 0),
        )
        .setOrigin(0.5, 1)
        .setScale(propScale)
        .setDepth(artDepth),
    };
  });
}

function animateProps(props: readonly StagedProp[], now: number): void {
  for (const staged of props) {
    if (!staged.image.active) {
      continue;
    }
    if (talkProps[staged.id].animated !== undefined) {
      const frame = Math.floor(now / propFrameMilliseconds + staged.index) % 2;
      staged.image.setTexture(propTextureKey(staged.id, frame));
    }
    if (staged.shuffle !== null) {
      const { count, leftPixels, slotPixels } = staged.shuffle;
      const place = talkShufflePlaces(count, now)[staged.index];
      if (place !== undefined) {
        staged.image.setPosition(
          leftPixels + slotPixels * (place.slot + 0.5),
          staged.baseYPixels -
            Math.round(
              place.lift * staged.image.displayHeight * shuffleHopHeights,
            ),
        );
      }
    }
    if (staged.floating) {
      const bob = Math.round(
        Math.sin(now / 500 + staged.index) * propBobPixels * 2,
      );
      staged.image.setY(staged.baseYPixels + bob);
    }
  }
}

const roomBackdropTextureKey = (room: number): string =>
  `talk-backdrop-room-${String(room)}`;
const groundTextureKey = (theme: TalkThemeId): string => `talk-ground-${theme}`;

// A room's ground: a slice of its world's ground strip, chosen per room.
function stageGround(
  scene: Phaser.Scene,
  room: number,
  theme: TalkThemeId,
): void {
  canvasTexture(
    scene,
    groundTextureKey(theme),
    {
      widthPixels: talkGroundWidthPixels,
      heightPixels: talkGroundStripHeightPixels,
    },
    (context) => {
      drawTalkGround(context, theme);
    },
  );
  const offset = talkGroundOffsetPixels(room);
  scene.add
    .image(
      room * roomWidthPixels - offset,
      groundTopPixels,
      groundTextureKey(theme),
    )
    .setOrigin(0, 0)
    .setCrop(offset, 0, roomWidthPixels, talkGroundStripHeightPixels)
    .setDepth(groundDepth);
}

// A room's own backdrop (talk-backdrop.ts draws a different one for every room). One
// canvas per room for a whole talk would hold some 90 MB, so only the rooms around the
// castaway have theirs: talk mode stages them as it arrives and drops the far ones.
interface RoomBackdrop {
  readonly image: Phaser.GameObjects.Image;
  readonly key: string;
}

function stageRoomBackdrop(
  scene: Phaser.Scene,
  room: number,
  theme: TalkThemeId,
): RoomBackdrop {
  const key = roomBackdropTextureKey(room);
  canvasTexture(
    scene,
    key,
    {
      widthPixels: talkBackdropWidthPixels,
      heightPixels: talkBackdropHeightPixels,
    },
    (context) => {
      drawTalkBackdrop(context, theme, room);
    },
  );
  const image = scene.add
    .image(room * roomWidthPixels, talkBackdropTopPixels, key)
    .setOrigin(0, 0)
    .setDepth(backdropDepth);
  return { image, key };
}

// Rooms whose backdrop is kept: the castaway's, and its neighbours either side, which
// the camera shows while it pans.
const backdropReachRooms = 1;

interface HerdMember {
  readonly index: number;
  readonly baseXPixels: number;
  readonly mount: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Image;
}

// The prop drawn large on a slide's sign: its first one.
function signArt(
  sceneSpec: TalkSceneSpec | undefined,
):
  | { readonly grid: readonly string[]; readonly palette: TalkPalette }
  | undefined {
  const first = sceneSpec?.props[0];
  return first === undefined ? undefined : talkProps[first];
}

export interface TalkController {
  readonly hooks: TalkSceneHooks;
  readonly levelInput: TalkLevel["levelInput"];
  // Walks the castaway to a slide's room (0-based); clamped to the talk.
  readonly goTo: (index: number) => void;
  // Removes the key handler, the slide bar and the live region; call when the talk ends.
  readonly dispose: () => void;
}

export interface TalkControllerOptions {
  // Where the live region, the notice and the slide bar go (the page's body by default).
  readonly host?: HTMLElement;
  // Called with the room's 0-based index whenever the castaway enters another room.
  readonly onSlideChange?: (index: number) => void;
}

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  size: { readonly widthPixels: number; readonly heightPixels: number },
  draw: (context: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.createCanvas(
    key,
    size.widthPixels,
    size.heightPixels,
  );
  if (texture === null) {
    throw new Error(`Could not create the canvas for ${key}.`);
  }
  draw(texture.getContext());
  texture.refresh();
}

const mountTextureKey = (index: number, frame: number): string =>
  `talk-mount-${String(index)}-${String(frame)}`;

// The four mounts and their labels, standing in room `room`; returned for animation.
function stageMounts(scene: Phaser.Scene, room: number): HerdMember[] {
  return talkMountRiders.map((rider, index) => {
    talkMountFrames.forEach((frame, frameIndex) => {
      canvasTexture(
        scene,
        mountTextureKey(index, frameIndex),
        talkGridSize(frame, rider.palette),
        (context) => {
          drawTalkGrid(context, frame, rider.palette, 0, 0);
        },
      );
    });
    const labelKey = `talk-mount-label-${String(index)}`;
    canvasTexture(
      scene,
      labelKey,
      {
        widthPixels: [...rider.label].length * talkCellWidthPixels,
        heightPixels: talkGlyphRows,
      },
      (context) => {
        drawTalkText(context, rider.label, 0, 0, 1, talkPanelColors.tones.ink);
      },
    );
    const baseXPixels =
      room * roomWidthPixels + herdFirstXPixels + index * herdSpacingPixels;
    return {
      index,
      baseXPixels,
      mount: scene.add
        .image(baseXPixels, groundTopPixels, mountTextureKey(index, 0))
        .setOrigin(0.5, 1)
        .setScale(mountScale)
        .setDepth(artDepth),
      label: scene.add
        .image(baseXPixels, groundTopPixels, labelKey)
        .setOrigin(0.5, 1)
        .setDepth(artDepth),
    };
  });
}

function animateHerd(herd: readonly HerdMember[], now: number): void {
  for (const member of herd) {
    if (!member.mount.active) {
      continue;
    }
    const pace = talkMountPace(now, member.index);
    const x = member.baseXPixels + pace.offsetPixels;
    const y = groundTopPixels - pace.hopPixels;
    member.mount
      .setTexture(mountTextureKey(member.index, pace.frame))
      .setFlipX(pace.facingLeft)
      .setPosition(x, y);
    // the labels take turns at two heights, so long ones never overlap
    const lift =
      member.mount.displayHeight +
      labelGapPixels +
      (member.index % 2) * labelStaggerPixels;
    member.label.setPosition(x, y - lift);
  }
}

export function createTalkController(
  prepared: PreparedTalk,
  startSlide: number,
  document: Document,
  options: TalkControllerOptions = {},
): TalkController {
  const host = options.host ?? document.body;
  const { script, level, layouts } = prepared;
  const count = script.slides.length;
  let movePlayer: ((xPixels: number, yPixels: number) => void) | undefined;
  let currentRoom = -1;
  let pendingStart = Math.min(count - 1, Math.max(0, startSlide));
  let typed = "";
  let typedAt = 0;
  let herd: HerdMember[] = [];
  let staged: StagedProp[] = [];
  // the scene the world was last decorated in, and the room backdrops staged in it
  let worldScene: Phaser.Scene | undefined;
  let backdrops = new Map<number, RoomBackdrop>();
  let egress: EgressActors | null = null;

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.style.cssText =
    "position:fixed;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";
  host.append(status);

  // Stages the backdrops of `room` and its neighbours, and drops those further away.
  const stageBackdropsAround = (room: number): void => {
    const scene = worldScene;
    if (scene === undefined) {
      return;
    }
    for (const [held, backdrop] of backdrops) {
      if (Math.abs(held - room) > backdropReachRooms) {
        backdrop.image.destroy();
        scene.textures.remove(backdrop.key);
        backdrops.delete(held);
      }
    }
    const first = Math.max(0, room - backdropReachRooms);
    const last = Math.min(count - 1, room + backdropReachRooms);
    for (let near = first; near <= last; near++) {
      const theme = prepared.themes[near];
      if (!backdrops.has(near) && theme !== undefined) {
        backdrops.set(near, stageRoomBackdrop(scene, near, theme));
      }
    }
  };

  const goTo = (room: number): void => {
    const target = Math.min(count - 1, Math.max(0, room));
    if (movePlayer === undefined) {
      pendingStart = target;
      return;
    }
    // before the move, so the room the camera lands on already has its scenery
    stageBackdropsAround(target);
    try {
      movePlayer(talkStandXPixels(target), talkStandYPixels());
    } catch (error) {
      // The scene refuses a move while paused or after the run has ended; the
      // presenter's key then does nothing, which is the expected outcome.
      if (
        !(error instanceof Error) ||
        !/paused|already ended/.test(error.message)
      ) {
        throw error;
      }
    }
  };

  // A short notice over the slide bar, e.g. after the copy button: shown, then faded.
  const notice = document.createElement("p");
  notice.setAttribute("role", "status");
  notice.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:60px",
    "z-index:1000",
    "margin:0",
    "padding:6px 10px",
    "border-radius:6px",
    "background:rgba(15,15,20,.78)",
    "color:#f5f5f5",
    "font:12px/1.2 system-ui,sans-serif",
    "opacity:0",
    "transition:opacity .3s",
    "pointer-events:none",
  ].join(";");
  host.append(notice);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const showNotice = (text: string): void => {
    notice.textContent = text;
    notice.style.opacity = "1";
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice.style.opacity = "0";
    }, 1600);
  };
  const copySlide = (index: number): void => {
    const slide = script.slides[index];
    if (slide === undefined) {
      return;
    }
    const label = `Slide ${String(index + 1)}`;
    // the clipboard needs a secure page (https or localhost)
    if (!window.isSecureContext) {
      showNotice(`${label}: copying is not available here`);
      return;
    }
    navigator.clipboard.writeText(talkSlideText(slide)).then(
      () => {
        showNotice(`${label} copied`);
      },
      () => {
        showNotice(`${label}: the browser refused to copy`);
      },
    );
  };

  const toolbar = createTalkToolbar(
    document,
    host,
    script.slides.map(talkSlideName),
    {
      go: goTo,
      step: (delta) => {
        goTo(currentRoom + delta);
      },
    },
  );

  const onKey = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    // the slide bar's own controls handle their keys
    if (
      event.target instanceof Node &&
      toolbar.element.contains(event.target)
    ) {
      return;
    }
    if (/^(Digit|Numpad)[0-9]$/.test(event.code)) {
      const now = performance.now();
      typed =
        (now - typedAt > typedNumberTimeoutMilliseconds ? "" : typed) +
        event.code.slice(-1);
      typedAt = now;
      return;
    }
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      const target = talkTypedSlide(typed, count);
      typed = "";
      if (target !== undefined) {
        event.preventDefault();
        goTo(target);
      }
      return;
    }
    const keys: Readonly<Record<string, () => number>> = {
      PageDown: () => currentRoom + 1,
      PageUp: () => currentRoom - 1,
      Home: () => 0,
      End: () => count - 1,
    };
    const next = keys[event.code];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    goTo(next());
  };
  window.addEventListener("keydown", onKey, true);

  const decorateWorld = (scene: Phaser.Scene): void => {
    herd = [];
    staged = [];
    egress = null;
    for (const backdrop of backdrops.values()) {
      backdrop.image.destroy();
      scene.textures.remove(backdrop.key);
    }
    backdrops = new Map();
    worldScene = scene;
    prepared.themes.forEach((theme, index) => {
      stageGround(scene, index, theme);
    });
    stageBackdropsAround(currentRoom < 0 ? pendingStart : currentRoom);
    layouts.forEach((layout, index) => {
      const key = `talk-panel-${String(index)}`;
      canvasTexture(
        scene,
        key,
        talkPanelCanvasSize(talkPanelWidthPixels, talkPanelHeightPixels),
        (context) => {
          drawTalkPanel(
            context,
            layout,
            talkPanelWidthPixels,
            talkPanelHeightPixels,
            `${String(index + 1)}/${String(count)}`,
            talkPanelColors,
            prepared.scenes[index]?.special === null
              ? signArt(prepared.scenes[index])
              : undefined,
          );
          drawTalkCopyButton(context, talkPanelWidthPixels, talkPanelColors);
          if (prepared.scenes[index]?.special === "egress") {
            drawTalkEgressDiagram(
              context,
              talkPanelFreeArea(
                layout,
                talkPanelWidthPixels,
                talkPanelHeightPixels,
              ),
            );
          }
          if (prepared.scenes[index]?.special === "world-map") {
            drawTalkWorldMap(
              context,
              prepared.worlds,
              talkPanelFreeArea(
                layout,
                talkPanelWidthPixels,
                talkPanelHeightPixels,
              ),
            );
          }
        },
      );
      const sign = scene.add
        .image(
          index * roomWidthPixels + talkPanelLeftPixels,
          talkPanelTopPixels,
          key,
        )
        .setOrigin(0, 0)
        .setDepth(panelDepth);
      // a hyperlink on the sign opens its page in a new tab; the copy button copies the
      // slide's text; the pointer shows a hand over either
      const linkUnder = (pointer: Phaser.Input.Pointer): string | null =>
        talkLinkAt(
          layout,
          pointer.worldX - sign.x - talkPanelPaddingPixels,
          pointer.worldY - sign.y - talkPanelPaddingPixels,
        );
      const onCopyButton = (pointer: Phaser.Input.Pointer): boolean =>
        talkCopyButtonAt(
          talkPanelWidthPixels,
          pointer.worldX - sign.x,
          pointer.worldY - sign.y,
        );
      sign.setInteractive();
      sign.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        scene.input.setDefaultCursor(
          onCopyButton(pointer) || linkUnder(pointer) !== null
            ? "pointer"
            : "default",
        );
      });
      sign.on("pointerout", () => {
        scene.input.setDefaultCursor("default");
      });
      sign.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (onCopyButton(pointer)) {
          copySlide(index);
          return;
        }
        const url = linkUnder(pointer);
        if (url !== null) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      });
      const sceneSpec = prepared.scenes[index];
      if (sceneSpec?.special === "egress") {
        egress = stageEgress(scene, index, layout);
      }
      if (sceneSpec?.special === "mounts") {
        herd.push(...stageMounts(scene, index));
      }
      if (sceneSpec !== undefined && sceneSpec.props.length > 0) {
        staged.push(...stageProps(scene, index, sceneSpec.props));
      }
    });
  };

  // the music follows the world the castaway is in
  let setSong: ((song: ReturnType<typeof talkThemeSong>) => void) | undefined;
  let playingTheme: TalkThemeId | undefined;
  const playThemeOf = (room: number): void => {
    const theme = prepared.themes[room];
    if (
      setSong === undefined ||
      theme === undefined ||
      theme === playingTheme
    ) {
      return;
    }
    playingTheme = theme;
    setSong(talkThemeSong(theme));
  };

  const afterRender = (player: { readonly xPixels: number }): void => {
    const now = performance.now();
    animateHerd(herd, now);
    animateProps(staged, now);
    animateEgress(egress, now);
    const room = talkRoomAt(player.xPixels, count);
    if (room === currentRoom) {
      return;
    }
    currentRoom = room;
    stageBackdropsAround(room);
    toolbar.setCurrent(room);
    options.onSlideChange?.(room);
    playThemeOf(room);
    const slide = script.slides[room];
    if (slide !== undefined) {
      status.textContent = talkSlideSpeech(slide, room, count);
    }
  };

  const hooks: TalkSceneHooks = {
    decorateWorld,
    afterRender,
    roomCenterXPixels: (playerXPixels) =>
      (talkRoomAt(playerXPixels, count) + 0.5) * roomWidthPixels,
    bindMusic: (play) => {
      setSong = play;
      playingTheme = undefined;
      playThemeOf(Math.max(0, currentRoom < 0 ? pendingStart : currentRoom));
    },
    bindMovePlayer: (move) => {
      movePlayer = move;
      if (pendingStart > 0) {
        goTo(pendingStart);
      }
    },
  };

  return {
    hooks,
    levelInput: level.levelInput,
    goTo,
    dispose: () => {
      window.removeEventListener("keydown", onKey, true);
      toolbar.dispose();
      status.remove();
      clearTimeout(noticeTimer);
      notice.remove();
    },
  };
}

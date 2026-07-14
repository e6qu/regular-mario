import Phaser from "phaser";

import {
  parseUserAssetManifest,
  UserAssetSourceKind,
  type UserActorSpriteEntry,
  type UserAssetManifest,
  type UserAssetManifestInput,
  type UserAssetSource,
  type UserPlayerSpriteEntry,
} from "./engine/domain/user-asset-manifest";
import type { LevelSpecInput } from "./engine/domain/level-spec";
import {
  makeFirePlayerVitalityState,
  makeInitialPlayerVitalityState,
} from "./engine/simulation/player-vitality";
import {
  classicCompatibilityViewport,
  selectBrowserGameBootstrap,
  type BrowserGameBootstrap,
  type LevelTheme,
} from "./shell/browser-level-selection";
import {
  parsePlayerCharacter,
  type PlayerCharacter,
} from "./shell/player-character";
import { runSpotlightWalkthrough } from "./shell/spotlight-tutorial";
import { decodeSharedLevel, renderLevelEditor } from "./shell/level-editor";
import {
  renderDeployInfoFooter,
  setDeployInfoFooterVisible,
} from "./shell/deploy-info-footer";
import { createGameConfig } from "./shell/create-game-config";
import { resetStoredState, storedStateKeys } from "./shell/reset-stored-state";
import {
  isRendererChoice,
  persistRendererChoice,
  resolveRendererChoice,
} from "./shell/select-renderer";
import { BootScene } from "./shell/scenes/boot-scene";
import {
  loadUserAssetBundle,
  defaultMaxFileBytes,
  defaultMaxTotalBytes,
  type UserAssetBundle,
} from "./shell/user-asset-loader";
import { validateDefaultVglcSmbSpriteCoverage } from "./shell/default-vglc-smb-sprite-coverage";
import { parseContentSetIndex } from "./shell/content-set-index";

const appElement = document.querySelector<HTMLElement>("#app");

if (appElement === null) {
  throw new Error("Missing required #app element.");
}

// Game canvases live in this persistent layer so a game survives (suspended)
// while the menu/editor render into #app; `clearApp` preserves it and the tab
// bar. When a game is active the layer covers the window; otherwise it's hidden.
const gameLayer = document.createElement("div");
gameLayer.setAttribute("role", "application");
gameLayer.setAttribute("aria-label", "Original platformer game");
// A row: the (mobile-only) touch control panels flank the game viewport left and
// right, so the controls sit OUTSIDE the drawing surface rather than over it —
// trading horizontal space, which keeps a landscape screen's precious height.
gameLayer.style.cssText =
  "position:fixed;inset:0;display:none;flex-direction:row;";
// Phaser mounts the canvas into this viewport (not gameLayer directly) so that
// the canvas sizes to the viewport's box — which narrows when the touch control
// panels claim width beside it, shrinking the view's width instead of overlapping
// it.
const gameViewport = document.createElement("div");
gameViewport.setAttribute("data-role", "game-viewport");
gameViewport.style.cssText =
  "position:relative;flex:1 1 auto;min-height:0;min-width:0;height:100%;";
gameLayer.append(gameViewport);
const sessionBar = document.createElement("div");
sessionBar.setAttribute("role", "tablist");
sessionBar.setAttribute("aria-label", "In-progress games");
sessionBar.style.cssText =
  "position:fixed;left:0;right:0;bottom:0;z-index:30;display:none;gap:8px;" +
  "padding:10px calc(10px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left));" +
  "background:#0b0f19f8;border-top:3px solid #ffd54a;overflow-x:auto;font-family:monospace;" +
  "align-items:center;box-shadow:0 -6px 20px #00000066;";

// The tab you just left blinks + sparkles briefly so it's obvious where you
// came from. Reduced-motion users get a static gold highlight instead.
const sessionBarStyle = document.createElement("style");
sessionBarStyle.textContent = `
@keyframes session-sparkle {
  0%, 100% { box-shadow: 0 0 0 1px #33405f; }
  50% { box-shadow: 0 0 0 2px #ffd54a, 0 0 18px 4px #ffd54aaa; }
}
.session-tab-recent {
  border-color: #ffd54a !important;
  background: #2b2712 !important;
  animation: session-sparkle 0.85s ease-in-out 4;
}
@media (prefers-reduced-motion: reduce) {
  .session-tab-recent { animation: none; box-shadow: 0 0 0 2px #ffd54a; }
}`;
document.head.append(sessionBarStyle);

// Short-viewport (mobile-landscape) responsive rules: menus are designed for a
// tall portrait/desktop column, so on a short screen we compact them — smaller
// title/padding and a two-column control grid — so they fit without scrolling.
const responsiveMenuStyle = document.createElement("style");
responsiveMenuStyle.textContent = `
@media (max-height: 540px) {
  .start-menu-panel { margin: 5px auto !important; padding: 8px 18px !important; }
  .start-menu-coin { font-size: 16px !important; }
  .start-menu-panel h1 { font-size: 16px !important; margin: 1px 0 6px 0 !important; letter-spacing: 1px !important; }
  /* Three columns so the six fields fit in two rows on a short landscape screen. */
  .start-menu-controls { display: grid !important; grid-template-columns: 1fr 1fr 1fr; column-gap: 12px; text-align: left; }
  .start-menu-controls .start-menu-field > div { font-size: 11px !important; }
  .start-menu-controls select { margin-top: 2px !important; margin-bottom: 5px !important; padding: 6px 4px !important; font-size: 12px !important; }
  .start-menu-panel button { margin-top: 5px !important; }
  .start-menu-panel .start-menu-play { padding: 8px 28px !important; font-size: 16px !important; }
}
/* Very short (small phone landscape, ~320px tall): reclaim more height by
   dropping the decorative coin and the big title, and tightening the buttons. */
@media (max-height: 360px) {
  .start-menu-panel { margin: 3px auto !important; padding: 5px 16px !important; }
  .start-menu-coin { display: none !important; }
  .start-menu-panel h1 { font-size: 13px !important; margin: 0 0 4px 0 !important; }
  .start-menu-controls select { margin-bottom: 3px !important; padding: 5px 4px !important; }
  .start-menu-panel button { margin-top: 3px !important; }
  .start-menu-panel .start-menu-play { padding: 6px 24px !important; font-size: 15px !important; }
}
/* The Play button's loading spinner: a small ring that spins while the level's
   content bundle loads, so a tap gives instant feedback even on a slow network. */
@keyframes start-menu-spin { to { transform: rotate(360deg); } }
.start-menu-spinner {
  display: inline-block; width: 15px; height: 15px; vertical-align: -2px;
  margin-right: 8px; border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.35); border-top-color: #ffffff;
  animation: start-menu-spin 0.7s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .start-menu-spinner { animation-duration: 1.6s; }
}`;
document.head.append(responsiveMenuStyle);

// The game plays in landscape only on touch devices; in portrait a full-screen
// overlay asks the player to rotate. Desktop / keyboard users never see it.
const rotatePrompt = document.createElement("div");
rotatePrompt.setAttribute("role", "alertdialog");
rotatePrompt.setAttribute("aria-label", "Rotate your device to landscape");
rotatePrompt.style.cssText =
  "position:fixed;inset:0;z-index:100001;display:none;flex-direction:column;" +
  "align-items:center;justify-content:center;gap:16px;background:#0b0f19;" +
  "color:#f5f7fb;font-family:monospace;text-align:center;padding:24px;";
rotatePrompt.innerHTML =
  '<div style="font-size:60px;line-height:1" aria-hidden="true">📱↻</div>' +
  '<div style="font-size:20px;font-weight:800;letter-spacing:1px">Rotate to landscape</div>' +
  '<div style="font-size:14px;color:#9fb0d0;max-width:320px">Turn your device sideways to play.</div>';
document.body.append(rotatePrompt);

const isCoarsePointer =
  window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
function updateOrientationPrompt(): void {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  rotatePrompt.style.display = isCoarsePointer && portrait ? "flex" : "none";
}
updateOrientationPrompt();
window.addEventListener("resize", updateOrientationPrompt);
window.addEventListener("orientationchange", updateOrientationPrompt);
// ----- Global keyboard help ------------------------------------------------
// A corner "⌨" hint opens a shortcuts overlay; "?" opens it and Esc closes it.
// Available on every screen (menu, designer, game).
const keymapSections: readonly {
  readonly title: string;
  readonly keys: readonly (readonly [string, string])[];
}[] = [
  {
    title: "In a game",
    keys: [
      ["← →", "Move"],
      ["Space / ↑", "Jump (variable)"],
      ["Shift", "Run"],
      ["↓", "Enter pipe"],
      ["X", "Fireball"],
      ["P", "Pause + timeline"],
      ["R", "Retry"],
      ["Esc", "Pause → menu"],
    ],
  },
  {
    title: "In the designer",
    keys: [
      ["V", "Draw"],
      ["E", "Erase"],
      ["G", "Fill"],
      ["R", "Rectangle"],
      ["L", "Line"],
      ["S", "Select"],
      ["I", "Eyedropper"],
      ["H", "Pan"],
      ["1–9 / 0", "Pick brush"],
      ["Ctrl+Z / Y", "Undo / redo"],
      ["Ctrl+C / X / V", "Copy / cut / paste"],
      ["Del", "Delete selection"],
      ["Middle-drag", "Pan"],
    ],
  },
  {
    title: "Anywhere",
    keys: [
      ["?", "Show shortcuts"],
      ["Esc", "Close shortcuts"],
    ],
  },
];

const keymapOverlay = document.createElement("div");
keymapOverlay.setAttribute("role", "dialog");
keymapOverlay.setAttribute("aria-modal", "true");
keymapOverlay.setAttribute("aria-label", "Keyboard shortcuts");
keymapOverlay.style.cssText =
  "position:fixed;inset:0;z-index:50;display:none;align-items:flex-start;" +
  "justify-content:center;overflow:auto;background:#000a;padding:5vh 16px;font-family:monospace;";

let keymapOpen = false;
let keymapReturnFocus: HTMLElement | null = null;
let keymapCloseButton: HTMLButtonElement | undefined;

function openKeymap(): void {
  if (keymapOpen) {
    return;
  }
  keymapOpen = true;
  keymapReturnFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  keymapOverlay.style.display = "flex";
  keymapCloseButton?.focus();
}
function closeKeymap(): void {
  if (!keymapOpen) {
    return;
  }
  keymapOpen = false;
  keymapOverlay.style.display = "none";
  keymapReturnFocus?.focus();
}

function buildKeymapOverlay(): void {
  const card = document.createElement("div");
  card.style.cssText =
    "background:#141c2e;border:1px solid #33405f;border-radius:14px;max-width:760px;" +
    "width:100%;padding:20px 22px;color:#e7ecf7;box-shadow:0 20px 60px #000a;";
  const head = document.createElement("div");
  head.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;";
  const title = document.createElement("h2");
  title.textContent = "Keyboard shortcuts";
  title.style.cssText = "margin:0;font:700 18px monospace;color:#fbbf24;";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "✕ Close (Esc)";
  close.setAttribute("aria-label", "Close keyboard shortcuts");
  close.style.cssText =
    "background:#1e293b;color:#e5e7eb;border:1px solid #33405f;border-radius:8px;" +
    "font:600 12px monospace;padding:8px 11px;cursor:pointer;min-height:36px;";
  close.addEventListener("click", () => closeKeymap());
  keymapCloseButton = close;
  head.append(title, close);
  card.append(head);
  const grid = document.createElement("div");
  grid.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;";
  for (const section of keymapSections) {
    const column = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    heading.style.cssText =
      "margin:0 0 8px;font:700 12px monospace;letter-spacing:.08em;text-transform:uppercase;color:#93a0bd;";
    column.append(heading);
    for (const [key, description] of section.keys) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:13px;";
      const keyLabel = document.createElement("kbd");
      keyLabel.textContent = key;
      keyLabel.style.cssText =
        "background:#0b1220;border:1px solid #33405f;border-radius:5px;padding:1px 7px;color:#e5e7eb;white-space:nowrap;";
      const descLabel = document.createElement("span");
      descLabel.textContent = description;
      descLabel.style.color = "#cbd5e1";
      row.append(keyLabel, descLabel);
      column.append(row);
    }
    grid.append(column);
  }
  card.append(grid);
  keymapOverlay.replaceChildren(card);
}
buildKeymapOverlay();
keymapOverlay.addEventListener("mousedown", (event) => {
  if (event.target === keymapOverlay) {
    closeKeymap();
  }
});

const keymapHint = document.createElement("button");
keymapHint.type = "button";
keymapHint.textContent = "⌨ ?";
keymapHint.setAttribute("aria-label", "Show keyboard shortcuts");
keymapHint.style.cssText =
  "position:fixed;z-index:45;right:calc(8px + env(safe-area-inset-right));" +
  "bottom:calc(8px + env(safe-area-inset-bottom));background:#0b0f19dd;color:#cbd5e1;" +
  "border:1px solid #33405f;border-radius:20px;font:600 13px monospace;padding:8px 12px;" +
  "cursor:pointer;min-height:36px;";
keymapHint.addEventListener("click", () => openKeymap());

// Capture phase so Esc closes the overlay before the game's Esc-to-pause fires.
window.addEventListener(
  "keydown",
  (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;
    if (!keymapOpen && !typing && event.key === "?") {
      event.preventDefault();
      openKeymap();
      return;
    }
    if (keymapOpen && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeKeymap();
    }
  },
  { capture: true },
);

appElement.append(gameLayer, sessionBar, keymapOverlay, keymapHint);

// Deploy stamp fixed to the bottom of every view (skipped under automation).
renderDeployInfoFooter();

// ----- Routing: each area is a shareable URL hash --------------------------
// #menu · #design · #play?skin=&map=&level=&mode=&sound= · #level=<code>
type PlayRoute = {
  readonly skin: string;
  readonly map: string;
  readonly level: string;
  readonly mode: string;
  readonly sound: string;
  // Number of demo bot players (random movers) to add alongside you.
  readonly bots: string;
  // The costume the human player wears (castaway / luigi / robot1..4, or in
  // revenge mode goomba / princess).
  readonly character: string;
  // "1" for revenge mode (play the stomper), "0" otherwise.
  readonly revenge: string;
};
// Update the address bar to reflect the current area without reloading (so a
// copied link reopens this state). replaceState avoids a stray hashchange.
function setRouteHash(route: string): void {
  const target = `#${route}`;
  if (window.location.hash !== target) {
    window.history.replaceState(null, "", target);
  }
}

const importAssetsSearchParameterName = "importAssets";
const userLevelSearchParameterName = "userLevel";
const manifestUrlSearchParameterName = "manifestUrl";
const assetSetSearchParameterName = "assetSet";
const browserLevelSearchParameterName = "browserLevel";
const searchParameters = new URLSearchParams(window.location.search);
const shouldImportAssets =
  searchParameters.get(importAssetsSearchParameterName) === "1";
const hasExplicitBrowserLevel = searchParameters.has(
  browserLevelSearchParameterName,
);
const gameCanvasLabel = "Original platformer game canvas";
const importApplicationLabel = "User asset import";
const manifestFileName = "manifest.json";
const customAssetSetId = "custom";
const defaultLocalAssetSetId = "vglc-smb-local-cache";
const defaultLocalAssetSetLevelName = "vglc-smb-processed-mario-1-1";
// The release build (`build:release`, VITE_STATIC_CONTENT=1) emits the composed
// content to `public/game-content/` and serves it as relative-path static files
// (works under any GitHub Pages base). Dev and the test/preview build serve it
// from `.cache/user-levels` via the Vite middleware at `/__user-level-cache/`.
const contentBaseUrl = import.meta.env.VITE_STATIC_CONTENT
  ? "game-content/"
  : "/__user-level-cache/";
const defaultLocalAssetSetManifestUrl = `${contentBaseUrl}vglc-smb-browser-demo/remote-manifest.json`;
const contentSetsIndexUrl = `${contentBaseUrl}content-sets-index.json`;

function contentSetBundleManifestUrl(
  assetSetId: string,
  mapSetId: string,
): string {
  return `${contentBaseUrl}content-set-bundles/${assetSetId}__${mapSetId}/remote-manifest.json`;
}
const maximumListedFiles = 20;
const maximumPreviewImages = 6;
const allowedRemoteManifestContentTypes = new Set([
  "application/json",
  "text/plain",
]);
const supportedImportFileExtensions = new Set([
  ".json",
  ".png",
  ".webp",
  ".wav",
  ".mp3",
  ".ogg",
  ".tmj",
  ".txt",
]);
const previewImageFileExtensions = new Set([".png", ".webp"]);
const builtInAssetSets = [
  {
    id: defaultLocalAssetSetId,
    label: "VGLC SMB Local Cache",
    manifestUrl: defaultLocalAssetSetManifestUrl,
    defaultLevelName: defaultLocalAssetSetLevelName,
  },
] as const;

type BuiltInAssetSet = (typeof builtInAssetSets)[number];

type ImportUiOptions = {
  readonly autoLoadRemoteManifest: boolean;
  readonly requirePlayerSpriteForAutoLoad: boolean;
  readonly requireCompleteSpriteCoverageForAutoLoad: boolean;
};

function configureAppElementForImport(): void {
  appElement!.setAttribute("role", "region");
  appElement!.setAttribute("aria-label", importApplicationLabel);
  appElement!.removeAttribute("tabindex");
}

function configureGameCanvasForAccessibility(canvas: HTMLCanvasElement): void {
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", gameCanvasLabel);
  canvas.tabIndex = 0;
  // Keep the upscaled canvas crisp (nearest-neighbor) instead of blurred.
  canvas.style.imageRendering = "pixelated";
}

// ----- Game sessions -------------------------------------------------------
// Each play-through (from the menu, or a design play-test) is a session: a live
// Phaser game that can be suspended into a tab (loop asleep, canvas hidden,
// music stopped) and resumed later. Only one runs at a time — never two games,
// never two music tracks.
type SessionMode = "play" | "design";
type GameSession = {
  readonly id: string;
  readonly label: string;
  readonly mode: SessionMode;
  readonly game: Phaser.Game;
  // What to render when this session is suspended (start menu or the editor).
  readonly onReturn: () => void;
};
let sessions: GameSession[] = [];
let activeSessionId: string | undefined;
// The session most recently left for the menu/editor — its tab sparkles once so
// the player can see where they came from. Cleared when reopened or closed.
let recentlySuspendedSessionId: string | undefined;
let sessionCounter = 0;

window.addEventListener("beforeunload", () => {
  for (const session of sessions) {
    session.game.destroy(true);
  }
});
if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    for (const session of sessions) {
      session.game.destroy(true);
    }
  });
}

function bootSceneOf(game: Phaser.Game): BootScene | undefined {
  const scene = game.scene.scenes[0];
  return scene instanceof BootScene ? scene : undefined;
}
// A suspended game keeps its renderer (and, under WebGL, its GL context) alive
// but with the loop asleep. Proactively releasing the WebGL context on suspend
// was tried and rejected: a released context does not fully re-render on resume
// (blank canvas). Holding it is correct — a browser that reclaims the context
// under pressure triggers Phaser's built-in restore, which recovers cleanly
// (see docs/decisions/0020 and tests/browser/renderer.spec.ts).
function suspendSession(session: GameSession): void {
  session.game.loop.sleep();
  session.game.canvas.style.display = "none";
  bootSceneOf(session.game)?.onSessionSuspend();
}
function resumeSession(session: GameSession): void {
  session.game.canvas.style.display = "";
  session.game.loop.wake();
  session.game.scale.refresh();
  bootSceneOf(session.game)?.onSessionResume();
}
function showGameLayer(): void {
  gameLayer.style.display = "flex";
  // Hide the help hint during play (it would cover the touch A button); the "?"
  // key still opens the overlay.
  keymapHint.style.display = "none";
  // The deploy stamp would overlap the play area (the canvas fills the window),
  // so hide it while a game is on screen.
  setDeployInfoFooterVisible(false);
  renderSessionBar();
}
function showUiLayer(): void {
  gameLayer.style.display = "none";
  keymapHint.style.display = "";
  setDeployInfoFooterVisible(true);
  renderSessionBar();
}

// Bring a suspended session to the foreground, suspending whatever was active.
function activateSession(id: string): void {
  if (recentlySuspendedSessionId === id) {
    recentlySuspendedSessionId = undefined;
  }
  const next = sessions.find((session) => session.id === id);
  if (next === undefined) {
    return;
  }
  // Show the (full-window) game layer BEFORE resuming, so the resume's
  // scale.refresh() measures a visible parent rather than relying on the resize
  // observer to correct a 0×0 measurement after the fact.
  clearApp();
  showGameLayer();
  if (activeSessionId !== id) {
    const current = sessions.find((session) => session.id === activeSessionId);
    if (current !== undefined) {
      suspendSession(current);
    }
    activeSessionId = id;
    resumeSession(next);
  }
  renderSessionBar();
}

// ESC / the in-game exit button: suspend the active game and show its return UI.
function suspendActiveSession(): void {
  const current = sessions.find((session) => session.id === activeSessionId);
  activeSessionId = undefined;
  recentlySuspendedSessionId = current?.id;
  showUiLayer();
  if (current !== undefined) {
    suspendSession(current);
    current.onReturn();
  } else {
    void renderStartMenu();
  }
  renderSessionBar();
}

// The ✕ on a tab: destroy that game and free its memory.
function closeSession(id: string): void {
  const session = sessions.find((entry) => entry.id === id);
  if (session === undefined) {
    return;
  }
  session.game.destroy(true);
  sessions = sessions.filter((entry) => entry.id !== id);
  if (recentlySuspendedSessionId === id) {
    recentlySuspendedSessionId = undefined;
  }
  if (activeSessionId === id) {
    activeSessionId = undefined;
    showUiLayer();
    void renderStartMenu();
  }
  renderSessionBar();
}

function startSession(
  bootstrap: BrowserGameBootstrap,
  label: string,
  mode: SessionMode,
  onReturn: () => void,
): GameSession {
  const current = sessions.find((session) => session.id === activeSessionId);
  if (current !== undefined) {
    suspendSession(current);
  }
  sessionCounter += 1;
  const id = `session-${String(sessionCounter)}`;
  // Show the (full-window) game layer BEFORE creating the game so Phaser's
  // RESIZE scale mode measures a visible parent — otherwise the canvas boots at
  // 0×0 and never draws.
  clearApp();
  showGameLayer();
  const game = new Phaser.Game(
    createGameConfig(gameViewport, {
      ...bootstrap,
      onExitToMenu: () => suspendActiveSession(),
    }),
  );
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scale.refresh();
    // Focus the canvas so keyboard input has a live target — after an async boot
    // the previously-focused Play button was removed by clearApp, which would
    // otherwise leave key events (including the start key) with nowhere to land.
    game.canvas.focus();
  });
  const session: GameSession = { id, label, mode, game, onReturn };
  sessions.push(session);
  activeSessionId = id;
  configureGameCanvasForAccessibility(game.canvas);
  renderSessionBar();
  return session;
}

function renderSessionBar(): void {
  sessionBar.replaceChildren();
  // Shown for managing suspended games from the menu/editor; hidden while a game
  // is active so it never covers the on-screen touch controls.
  if (sessions.length === 0 || activeSessionId !== undefined) {
    sessionBar.style.display = "none";
    return;
  }
  sessionBar.style.display = "flex";
  // A leading label so the row of paused games can't be mistaken for chrome.
  const heading = document.createElement("span");
  heading.textContent = "⏸ Paused";
  heading.style.cssText =
    "flex:0 0 auto;color:#ffd54a;font:800 12px monospace;letter-spacing:1px;" +
    "padding:0 4px 0 2px;text-transform:uppercase;";
  sessionBar.append(heading);
  // The bar only appears when no game is active, so every listed session is a
  // suspended one — none is the "selected" tab.
  for (const session of sessions) {
    const recent = session.id === recentlySuspendedSessionId;
    const tab = document.createElement("div");
    tab.style.cssText =
      "display:inline-flex;align-items:center;border-radius:8px;flex:0 0 auto;" +
      "border:1px solid #33405f;background:#141c2e;";
    if (recent) {
      // Blink + sparkle the tab we just came from (see .session-tab-recent).
      tab.className = "session-tab-recent";
    }
    const open = document.createElement("button");
    open.setAttribute("role", "tab");
    open.setAttribute("aria-selected", "false");
    open.textContent = `${recent ? "✨ " : ""}${session.mode === "design" ? "✎" : "▶"} ${session.label}`;
    open.style.cssText =
      "background:none;border:none;color:#e7ecf7;font:600 12px monospace;" +
      "padding:8px 4px 8px 12px;cursor:pointer;min-height:36px;";
    open.addEventListener("click", () => activateSession(session.id));
    const close = document.createElement("button");
    close.setAttribute("aria-label", `Close ${session.label}`);
    close.textContent = "✕";
    close.style.cssText =
      "background:none;border:none;color:#93a0bd;font:600 13px monospace;" +
      "padding:8px 10px;cursor:pointer;min-height:36px;min-width:36px;";
    close.addEventListener("click", () => closeSession(session.id));
    tab.append(open, close);
    sessionBar.append(tab);
  }
}

async function bootWithDefaultAssets(): Promise<void> {
  const selectedBrowserGameBootstrap = selectBrowserGameBootstrap(
    window.location.search,
  );
  // The player (and every actor/tile) is authored sprite art — there is no
  // procedural fallback renderer — so even the debug `?browserLevel=` routes
  // load the default parody skin before the scene starts.
  const bundle = await loadDefaultSkinBundle();
  startSession(
    { ...selectedBrowserGameBootstrap, userAssetBundle: bundle },
    "1-1",
    "play",
    () => {
      void renderStartMenu();
    },
  );
}

// Load (and cache) the default parody skin bundle, or undefined if it fails.
async function loadDefaultSkinBundle(): Promise<UserAssetBundle | undefined> {
  const cached = skinBundleCache.get("castaway-parody");
  if (cached !== undefined) {
    return cached;
  }
  try {
    const bundle = await fetchAndLoadManifest(
      contentSetBundleManifestUrl("castaway-parody", "official-smb"),
    );
    skinBundleCache.set("castaway-parody", bundle);
    return bundle;
  } catch {
    return undefined;
  }
}

// Boot a custom/uploaded/edited level. `skinId` is an asset-set id whose sprites
// render the level (shapes are used only as a fallback if the set fails to load).
// `onExit` (ESC / the overlay button / death) runs when the player leaves — the
// editor passes a callback that reopens itself with the level.
function bootCustomLevel(
  levelInput: LevelSpecInput,
  onExit: () => void,
  exitLabel: string,
  skinId: string,
  warpLevels?: ReadonlyMap<string, LevelSpecInput>,
  theme?: LevelTheme,
): void {
  const boot = (userAssetBundle: UserAssetBundle | undefined): void => {
    startSession(
      {
        levelInput,
        levelSequence: undefined,
        levelIndex: 0,
        initialPlayerVitality: makeInitialPlayerVitalityState(),
        userAssetBundle,
        viewport: classicCompatibilityViewport,
        userLevelVisualName: undefined,
        exitLabel,
        awaitStart: true,
        plainBackground: true,
        ...(warpLevels !== undefined && warpLevels.size > 0
          ? { warpLevelsByName: warpLevels }
          : {}),
        ...(theme !== undefined ? { theme } : {}),
      },
      "play-test",
      "design",
      onExit,
    );
  };

  // The skin's composed bundle is cached (the editor also pre-warms it), so a
  // repeat play-test starts instantly instead of re-fetching with no feedback.
  const cached = skinBundleCache.get(skinId);
  if (cached !== undefined) {
    boot(cached);
    return;
  }
  void fetchAndLoadManifest(contentSetBundleManifestUrl(skinId, "official-smb"))
    .then((bundle) => {
      skinBundleCache.set(skinId, bundle);
      boot(bundle);
    })
    .catch(() => boot(undefined));
}
const skinBundleCache = new Map<string, UserAssetBundle>();

// The shipped maps, offered as editor templates. Loaded once and cached.
let editorTemplatesCache:
  | readonly { readonly name: string; readonly level: LevelSpecInput }[]
  | undefined;
async function loadEditorTemplates(): Promise<
  readonly { readonly name: string; readonly level: LevelSpecInput }[]
> {
  if (editorTemplatesCache !== undefined) {
    return editorTemplatesCache;
  }
  const bundle = await fetchAndLoadManifest(
    contentSetBundleManifestUrl("castaway-parody", "official-smb"),
  );
  // Pre-warm the skin cache so playing a level with this skin starts instantly.
  skinBundleCache.set("castaway-parody", bundle);
  editorTemplatesCache = [...bundle.levels]
    .filter(([name]) => !name.startsWith("smb-warp-"))
    .map(([name, level]) => ({ name, level: level.levelSpecInput }));
  return editorTemplatesCache;
}

function renderEditor(
  initialLevel?: LevelSpecInput,
  initialSkin?: string,
  initialWarpLevels?: ReadonlyMap<string, LevelSpecInput>,
  initialTheme?: LevelTheme,
): void {
  // Keep a shared "#level=..." link in the address bar; otherwise this is #design.
  if (!window.location.hash.startsWith("#level=")) {
    setRouteHash("design");
  }
  showUiLayer();
  configureAppElementForImport();
  clearApp();
  renderLevelEditor(
    appElement!,
    {
      // Playing tests the level, then ESC/death/button returns to the editor
      // with the same level and skin so editing continues seamlessly.
      onPlay: (level, skinId, warpLevels, theme) => {
        bootCustomLevel(
          level,
          () => renderEditor(level, skinId, warpLevels, theme),
          "editor",
          skinId,
          warpLevels,
          theme,
        );
      },
      onExit: () => {
        void renderStartMenu();
      },
      loadTemplates: loadEditorTemplates,
    },
    initialLevel,
    initialSkin,
    initialWarpLevels,
    initialTheme,
  );
}

function createImportSectionTitle(text: string): HTMLHeadingElement {
  const element = document.createElement("h2");
  element.textContent = text;
  element.style.fontSize = "16px";
  element.style.margin = "12px 0 8px 0";

  return element;
}

// Clear the UI (menu/editor/import) but keep the persistent game layer and the
// session tab bar, so suspended games survive a return to the menu.
const persistentChrome = new Set<Node>([
  gameLayer,
  sessionBar,
  keymapOverlay,
  keymapHint,
]);
function clearApp(): void {
  for (const child of [...appElement!.childNodes]) {
    if (!persistentChrome.has(child)) {
      appElement!.removeChild(child);
    }
  }
}

function fillSelectOptions(
  select: HTMLSelectElement,
  options: readonly { readonly id: string; readonly title: string }[],
): void {
  select.innerHTML = "";
  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.title;
    select.appendChild(element);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(fileName: string): string {
  const extensionStartIndex = fileName.lastIndexOf(".");

  if (extensionStartIndex === -1) {
    return "";
  }

  return fileName.slice(extensionStartIndex).toLowerCase();
}

function isSupportedImportFile(file: File): boolean {
  return supportedImportFileExtensions.has(getFileExtension(file.name));
}

function isPreviewImageFile(file: File): boolean {
  return previewImageFileExtensions.has(getFileExtension(file.name));
}

function findDuplicateFileNames(files: readonly File[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const file of files) {
    if (seen.has(file.name)) {
      duplicates.add(file.name);
    } else {
      seen.add(file.name);
    }
  }

  return [...duplicates].sort();
}

function makeSelectedFileValidationMessages(
  files: readonly File[],
): readonly string[] {
  const messages: string[] = [];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const hasManifest = files.some((file) => file.name === manifestFileName);
  const unsupportedFiles = files.filter((file) => !isSupportedImportFile(file));
  const oversizedFiles = files.filter(
    (file) => file.size > defaultMaxFileBytes,
  );
  const duplicateFileNames = findDuplicateFileNames(files);

  if (!hasManifest) {
    messages.push(
      "manifest.json is required before the selected files can be loaded.",
    );
  }

  if (unsupportedFiles.length > 0) {
    messages.push(
      `Unsupported file type: ${unsupportedFiles.map((file) => file.name).join(", ")}.`,
    );
  }

  if (oversizedFiles.length > 0) {
    messages.push(
      `File size limit ${formatFileSize(defaultMaxFileBytes)} exceeded by: ${oversizedFiles.map((file) => file.name).join(", ")}.`,
    );
  }

  if (totalBytes > defaultMaxTotalBytes) {
    messages.push(
      `Selected files total ${formatFileSize(totalBytes)}, above the ${formatFileSize(defaultMaxTotalBytes)} bundle limit.`,
    );
  }

  if (duplicateFileNames.length > 0) {
    messages.push(
      `Duplicate file names are ambiguous: ${duplicateFileNames.join(", ")}.`,
    );
  }

  return messages;
}

function appendImportMessageList(
  container: HTMLElement,
  messages: readonly string[],
  color: string,
): void {
  const list = document.createElement("ul");
  list.style.margin = "0";
  list.style.paddingLeft = "20px";

  for (const message of messages) {
    const item = document.createElement("li");
    item.textContent = message;
    item.style.color = color;
    list.appendChild(item);
  }

  container.appendChild(list);
}

type ManifestParseResult =
  | {
      readonly ok: true;
      readonly manifest: UserAssetManifest;
    }
  | {
      readonly ok: false;
      readonly messages: readonly string[];
    };

function parseManifestText(
  manifestText: string,
  sourceLabel: string,
): ManifestParseResult {
  let manifestInput: unknown;

  try {
    manifestInput = JSON.parse(manifestText) as unknown;
  } catch {
    return {
      ok: false,
      messages: [`${sourceLabel} is not valid JSON.`],
    };
  }

  const manifestResult = parseUserAssetManifest(
    manifestInput as UserAssetManifestInput,
  );

  if (!manifestResult.ok) {
    return {
      ok: false,
      messages: manifestResult.errors.map(
        (error) => `${error.path}: ${error.message}`,
      ),
    };
  }

  return {
    ok: true,
    manifest: manifestResult.value,
  };
}

function normalizeRemoteManifestSources(
  manifest: UserAssetManifest,
  baseUrl: string,
): UserAssetManifest {
  return {
    ...manifest,
    tileSprites: Object.fromEntries(
      Object.entries(manifest.tileSprites).map(([key, entry]) => [
        key,
        {
          ...entry,
          source: normalizeRemoteSource(entry.source, baseUrl),
        },
      ]),
    ),
    actorSprites: Object.fromEntries(
      Object.entries(manifest.actorSprites).map(([key, entry]) => [
        key,
        normalizeStatefulSpriteSources(entry, baseUrl),
      ]),
    ),
    playerSprite:
      manifest.playerSprite === undefined
        ? undefined
        : normalizeStatefulSpriteSources(manifest.playerSprite, baseUrl),
    reactionSprites: Object.fromEntries(
      Object.entries(manifest.reactionSprites).map(([key, entry]) => [
        key,
        {
          ...entry,
          source: normalizeRemoteSource(entry.source, baseUrl),
        },
      ]),
    ),
    levelVisuals: Object.fromEntries(
      Object.entries(manifest.levelVisuals).map(([key, entry]) => [
        key,
        {
          ...entry,
          source: normalizeRemoteSource(entry.source, baseUrl),
        },
      ]),
    ),
    sounds: Object.fromEntries(
      Object.entries(manifest.sounds).map(([key, entry]) => [
        key,
        {
          ...entry,
          source: normalizeRemoteSource(entry.source, baseUrl),
        },
      ]),
    ),
    music: Object.fromEntries(
      Object.entries(manifest.music).map(([key, entry]) => [
        key,
        {
          ...entry,
          source: normalizeRemoteSource(entry.source, baseUrl),
        },
      ]),
    ),
    levels: manifest.levels.map((entry) => ({
      ...entry,
      source: normalizeRemoteSource(entry.source, baseUrl),
      importMetadataSource:
        entry.importMetadataSource === undefined
          ? undefined
          : normalizeRemoteSource(entry.importMetadataSource, baseUrl),
      compatibilityProfileSource:
        entry.compatibilityProfileSource === undefined
          ? undefined
          : normalizeRemoteSource(entry.compatibilityProfileSource, baseUrl),
    })),
  };
}

function normalizeStatefulSpriteSources<
  SpriteEntry extends UserActorSpriteEntry | UserPlayerSpriteEntry,
>(entry: SpriteEntry, baseUrl: string): SpriteEntry {
  return {
    ...entry,
    source: normalizeRemoteSource(entry.source, baseUrl),
    stateSprites: Object.fromEntries(
      Object.entries(entry.stateSprites).map(([stateKey, stateEntry]) => [
        stateKey,
        {
          ...stateEntry,
          source: normalizeRemoteSource(stateEntry.source, baseUrl),
        },
      ]),
    ),
  };
}

function normalizeRemoteSource(
  source: UserAssetSource,
  baseUrl: string,
): UserAssetSource {
  if (source.kind === UserAssetSourceKind.File) {
    return source;
  }

  return {
    kind: UserAssetSourceKind.Url,
    url: new URL(source.url, baseUrl).toString(),
  };
}

function makeManifestUrl(value: string): URL | undefined {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value, window.location.href);
  } catch {
    return undefined;
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return undefined;
  }

  return parsedUrl;
}

function findBuiltInAssetSet(id: string | undefined): BuiltInAssetSet {
  return (
    builtInAssetSets.find((assetSet) => assetSet.id === id) ??
    builtInAssetSets[0]
  );
}

function renderImportUi(options: ImportUiOptions): void {
  showUiLayer();
  clearApp();
  configureAppElementForImport();

  const container = document.createElement("div");
  container.style.padding = "16px";
  container.style.color = "#f5f7fb";
  container.style.maxWidth = "600px";

  const heading = document.createElement("h1");
  heading.textContent = "Import User Assets";

  const description = document.createElement("p");
  description.textContent =
    "Load a user-provided manifest URL, or select manifest.json plus all referenced image, audio, and level files. No files are uploaded.";

  const remoteSection = document.createElement("section");
  remoteSection.style.marginBottom = "20px";
  remoteSection.appendChild(createImportSectionTitle("Runtime Asset Set"));

  const assetSetSelect = document.createElement("select");
  assetSetSelect.setAttribute("aria-label", "Runtime asset set");
  assetSetSelect.style.width = "100%";
  assetSetSelect.style.padding = "8px";
  assetSetSelect.style.borderRadius = "6px";
  assetSetSelect.style.border = "1px solid #475569";
  assetSetSelect.style.backgroundColor = "#0f172a";
  assetSetSelect.style.color = "#f5f7fb";

  for (const assetSet of builtInAssetSets) {
    const option = document.createElement("option");
    option.value = assetSet.id;
    option.textContent = assetSet.label;
    assetSetSelect.appendChild(option);
  }

  const customOption = document.createElement("option");
  customOption.value = customAssetSetId;
  customOption.textContent = "Custom Manifest URL";
  assetSetSelect.appendChild(customOption);

  const remoteInput = document.createElement("input");
  remoteInput.type = "url";
  remoteInput.placeholder = "https://example.com/manifest.json";
  remoteInput.style.width = "100%";
  remoteInput.style.boxSizing = "border-box";
  remoteInput.style.padding = "8px";
  remoteInput.style.borderRadius = "6px";
  remoteInput.style.border = "1px solid #475569";
  remoteInput.style.backgroundColor = "#0f172a";
  remoteInput.style.color = "#f5f7fb";
  remoteInput.style.marginTop = "8px";

  const initialManifestUrl = searchParameters.get(
    manifestUrlSearchParameterName,
  );
  const initialAssetSetId = searchParameters.get(assetSetSearchParameterName);
  const initialBuiltInAssetSet = findBuiltInAssetSet(
    initialAssetSetId ?? defaultLocalAssetSetId,
  );
  const initialAssetSet =
    initialManifestUrl === null ? initialBuiltInAssetSet : undefined;

  if (initialManifestUrl !== null) {
    assetSetSelect.value = customAssetSetId;
    remoteInput.value = initialManifestUrl;
  } else {
    assetSetSelect.value = initialBuiltInAssetSet.id;
    remoteInput.value = initialBuiltInAssetSet.manifestUrl;
  }

  const remoteLevelSelect = document.createElement("select");
  remoteLevelSelect.setAttribute("aria-label", "Remote manifest level");
  remoteLevelSelect.style.display = "none";
  remoteLevelSelect.style.marginTop = "8px";
  remoteLevelSelect.style.width = "100%";
  remoteLevelSelect.style.padding = "8px";
  remoteLevelSelect.style.borderRadius = "6px";
  remoteLevelSelect.style.border = "1px solid #475569";
  remoteLevelSelect.style.backgroundColor = "#0f172a";
  remoteLevelSelect.style.color = "#f5f7fb";

  const remoteButtonRow = document.createElement("div");
  remoteButtonRow.style.display = "flex";
  remoteButtonRow.style.gap = "8px";
  remoteButtonRow.style.flexWrap = "wrap";
  remoteButtonRow.style.marginTop = "8px";

  const fetchManifestButton = document.createElement("button");
  fetchManifestButton.textContent = "Fetch Manifest";
  fetchManifestButton.style.padding = "8px 16px";
  fetchManifestButton.style.cursor = "pointer";
  fetchManifestButton.style.borderRadius = "6px";
  fetchManifestButton.style.border = "1px solid #3b82f6";
  fetchManifestButton.style.backgroundColor = "#1e3a5f";
  fetchManifestButton.style.color = "#f5f7fb";

  const loadRemoteButton = document.createElement("button");
  loadRemoteButton.textContent = "Load Remote Demo";
  loadRemoteButton.style.padding = "8px 16px";
  loadRemoteButton.style.cursor = "pointer";
  loadRemoteButton.style.borderRadius = "6px";
  loadRemoteButton.style.border = "1px solid #14b8a6";
  loadRemoteButton.style.backgroundColor = "#134e4a";
  loadRemoteButton.style.color = "#f5f7fb";
  loadRemoteButton.disabled = true;
  loadRemoteButton.style.opacity = "0.5";

  const remoteStatusText = document.createElement("p");
  remoteStatusText.style.color = "#94a3b8";
  remoteStatusText.style.margin = "8px 0 0 0";

  remoteButtonRow.appendChild(fetchManifestButton);
  remoteButtonRow.appendChild(loadRemoteButton);
  remoteSection.appendChild(assetSetSelect);
  remoteSection.appendChild(remoteInput);
  remoteSection.appendChild(remoteLevelSelect);
  remoteSection.appendChild(remoteButtonRow);
  remoteSection.appendChild(remoteStatusText);

  function styleContentSetSelect(select: HTMLSelectElement): void {
    select.style.width = "100%";
    select.style.padding = "8px";
    select.style.marginTop = "8px";
    select.style.borderRadius = "6px";
    select.style.border = "1px solid #475569";
    select.style.backgroundColor = "#0f172a";
    select.style.color = "#f5f7fb";
  }

  const contentSetSection = document.createElement("section");
  contentSetSection.style.marginBottom = "20px";
  contentSetSection.setAttribute("aria-label", "Content sets");
  contentSetSection.style.display = "none";
  contentSetSection.appendChild(
    createImportSectionTitle("Content Sets (asset skin × map)"),
  );

  const contentAssetSelect = document.createElement("select");
  contentAssetSelect.setAttribute("aria-label", "Asset set");
  styleContentSetSelect(contentAssetSelect);
  const contentMapSelect = document.createElement("select");
  contentMapSelect.setAttribute("aria-label", "Map set");
  styleContentSetSelect(contentMapSelect);

  const loadContentSetButton = document.createElement("button");
  loadContentSetButton.textContent = "Load Content Set";
  loadContentSetButton.style.marginTop = "8px";
  loadContentSetButton.style.padding = "8px 16px";
  loadContentSetButton.style.cursor = "pointer";
  loadContentSetButton.style.borderRadius = "6px";
  loadContentSetButton.style.border = "1px solid #14b8a6";
  loadContentSetButton.style.backgroundColor = "#134e4a";
  loadContentSetButton.style.color = "#f5f7fb";

  const contentSetStatus = document.createElement("p");
  contentSetStatus.style.color = "#94a3b8";
  contentSetStatus.style.margin = "8px 0 0 0";

  contentSetSection.appendChild(contentAssetSelect);
  contentSetSection.appendChild(contentMapSelect);
  contentSetSection.appendChild(loadContentSetButton);
  contentSetSection.appendChild(contentSetStatus);

  const dropZone = document.createElement("div");
  dropZone.style.border = "2px dashed #64748b";
  dropZone.style.borderRadius = "8px";
  dropZone.style.padding = "24px";
  dropZone.style.textAlign = "center";
  dropZone.style.marginBottom = "12px";
  dropZone.style.transition = "border-color 0.2s";

  const dropZoneText = document.createElement("p");
  dropZoneText.textContent = "Drag files here or click to browse";
  dropZoneText.style.margin = "0";
  dropZoneText.style.color = "#94a3b8";
  dropZone.appendChild(dropZoneText);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = ".json,.png,.webp,.wav,.mp3,.ogg,.tmj,.txt";
  fileInput.style.display = "none";

  dropZone.addEventListener("click", () => {
    fileInput.click();
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.style.borderColor = "#3b82f6";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "#64748b";
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.style.borderColor = "#64748b";

    if (event.dataTransfer !== null && event.dataTransfer.files.length > 0) {
      handleFileSelection(event.dataTransfer.files);
    }
  });

  const fileListContainer = document.createElement("div");
  fileListContainer.style.marginBottom = "12px";

  const validationListContainer = document.createElement("div");
  validationListContainer.style.marginBottom = "12px";

  const previewContainer = document.createElement("div");
  previewContainer.style.marginBottom = "12px";

  const errorListContainer = document.createElement("div");
  errorListContainer.style.marginBottom = "12px";

  const statusText = document.createElement("p");
  statusText.style.color = "#94a3b8";
  statusText.style.marginBottom = "12px";

  const loadButton = document.createElement("button");
  loadButton.textContent = "Load Assets";
  loadButton.style.marginTop = "12px";
  loadButton.style.display = "block";
  loadButton.style.padding = "8px 24px";
  loadButton.style.fontSize = "16px";
  loadButton.style.cursor = "pointer";
  loadButton.style.borderRadius = "6px";
  loadButton.style.border = "1px solid #3b82f6";
  loadButton.style.backgroundColor = "#1e3a5f";
  loadButton.style.color = "#f5f7fb";
  loadButton.disabled = true;
  loadButton.style.opacity = "0.5";

  const selectedLevelName = searchParameters.get(userLevelSearchParameterName);
  let previewObjectUrls: string[] = [];
  let remoteManifest: UserAssetManifest | undefined;
  let selectedRemoteDefaultLevelName: string | undefined =
    initialAssetSet?.defaultLevelName;

  function clearPreviewObjectUrls(): void {
    for (const objectUrl of previewObjectUrls) {
      URL.revokeObjectURL(objectUrl);
    }

    previewObjectUrls = [];
  }

  function renderImportErrors(messages: readonly string[]): void {
    errorListContainer.innerHTML = "";

    if (messages.length === 0) {
      return;
    }

    errorListContainer.appendChild(createImportSectionTitle("Import errors"));
    appendImportMessageList(errorListContainer, messages, "#f87171");
  }

  function renderValidationMessages(messages: readonly string[]): void {
    validationListContainer.innerHTML = "";

    if (messages.length === 0) {
      const ready = document.createElement("p");
      ready.textContent = "Selection looks ready for manifest validation.";
      ready.style.margin = "0";
      ready.style.color = "#86efac";
      validationListContainer.appendChild(ready);

      return;
    }

    validationListContainer.appendChild(
      createImportSectionTitle("Before loading"),
    );
    appendImportMessageList(validationListContainer, messages, "#fbbf24");
  }

  function renderImagePreviews(files: readonly File[]): void {
    previewContainer.innerHTML = "";
    clearPreviewObjectUrls();

    const imageFiles = files.filter(isPreviewImageFile);

    if (imageFiles.length === 0) {
      return;
    }

    previewContainer.appendChild(createImportSectionTitle("Image previews"));

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(88px, 1fr))";
    grid.style.gap = "8px";

    for (const file of imageFiles.slice(0, maximumPreviewImages)) {
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrls.push(objectUrl);

      const frame = document.createElement("figure");
      frame.style.margin = "0";
      frame.style.border = "1px solid #334155";
      frame.style.borderRadius = "6px";
      frame.style.padding = "6px";
      frame.style.background = "#0f172a";

      const image = document.createElement("img");
      image.src = objectUrl;
      image.alt = `Preview of ${file.name}`;
      image.style.display = "block";
      image.style.width = "100%";
      image.style.height = "64px";
      image.style.objectFit = "contain";
      image.style.imageRendering = "pixelated";

      const caption = document.createElement("figcaption");
      caption.textContent = file.name;
      caption.style.marginTop = "4px";
      caption.style.color = "#cbd5e1";
      caption.style.fontSize = "12px";
      caption.style.overflowWrap = "anywhere";

      frame.appendChild(image);
      frame.appendChild(caption);
      grid.appendChild(frame);
    }

    if (imageFiles.length > maximumPreviewImages) {
      const more = document.createElement("p");
      more.textContent = `${imageFiles.length - maximumPreviewImages} more image file${imageFiles.length - maximumPreviewImages === 1 ? "" : "s"} selected.`;
      more.style.margin = "8px 0 0 0";
      more.style.color = "#94a3b8";
      previewContainer.appendChild(more);
    }

    previewContainer.appendChild(grid);
  }

  function updateLoadButtonState(selectedFiles: readonly File[]): void {
    const validationMessages =
      makeSelectedFileValidationMessages(selectedFiles);
    const hasBlockingValidationMessages = validationMessages.length > 0;
    const hasManifest = selectedFiles.some(
      (file) => file.name === manifestFileName,
    );

    loadButton.disabled = !hasManifest || hasBlockingValidationMessages;
    loadButton.style.opacity = loadButton.disabled ? "0.5" : "1";
  }

  function updateFileList(files: FileList): void {
    fileListContainer.innerHTML = "";
    validationListContainer.innerHTML = "";
    previewContainer.innerHTML = "";
    clearPreviewObjectUrls();

    if (files.length === 0) {
      loadButton.disabled = true;
      loadButton.style.opacity = "0.5";

      return;
    }

    const selectedFiles = Array.from(files);
    const validationMessages =
      makeSelectedFileValidationMessages(selectedFiles);
    const hasManifest = selectedFiles.some(
      (file) => file.name === manifestFileName,
    );

    updateLoadButtonState(selectedFiles);

    const summary = document.createElement("p");
    summary.style.margin = "0 0 8px 0";
    summary.style.fontWeight = "bold";
    summary.textContent = `${files.length} file${files.length === 1 ? "" : "s"} selected${hasManifest ? "" : " (manifest.json required)"}`;
    fileListContainer.appendChild(summary);

    const list = document.createElement("ul");
    list.style.margin = "0";
    list.style.paddingLeft = "20px";
    list.style.fontSize = "14px";
    list.style.color = "#cbd5e1";

    for (const file of selectedFiles.slice(0, maximumListedFiles)) {
      const item = document.createElement("li");
      item.textContent = `${file.name} (${formatFileSize(file.size)})`;
      list.appendChild(item);
    }

    if (files.length > maximumListedFiles) {
      const more = document.createElement("li");
      more.textContent = `... and ${files.length - maximumListedFiles} more`;
      more.style.color = "#64748b";
      list.appendChild(more);
    }

    fileListContainer.appendChild(list);
    renderValidationMessages(validationMessages);
    renderImagePreviews(selectedFiles);
  }

  function handleFileSelection(files: FileList): void {
    updateFileList(files);
    renderImportErrors([]);
    statusText.textContent = "";
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files !== null && fileInput.files.length > 0) {
      handleFileSelection(fileInput.files);
    }
  });

  loadButton.addEventListener("click", () => {
    if (fileInput.files === null || fileInput.files.length === 0) {
      return;
    }

    errorListContainer.innerHTML = "";
    statusText.textContent = "Loading...";
    loadButton.disabled = true;

    void handleUserAssetImport(fileInput.files, selectedLevelName ?? undefined);
  });

  fetchManifestButton.addEventListener("click", () => {
    void handleRemoteManifestFetch();
  });

  loadRemoteButton.addEventListener("click", () => {
    void bootRemoteManifest();
  });

  assetSetSelect.addEventListener("change", () => {
    const selectedAssetSet =
      assetSetSelect.value === customAssetSetId
        ? undefined
        : findBuiltInAssetSet(assetSetSelect.value);
    selectedRemoteDefaultLevelName = selectedAssetSet?.defaultLevelName;
    remoteManifest = undefined;
    remoteLevelSelect.innerHTML = "";
    remoteLevelSelect.style.display = "none";
    loadRemoteButton.disabled = true;
    loadRemoteButton.style.opacity = "0.5";
    remoteStatusText.textContent = "";

    if (selectedAssetSet !== undefined) {
      remoteInput.value = selectedAssetSet.manifestUrl;
    }
  });

  container.appendChild(heading);
  container.appendChild(description);
  container.appendChild(remoteSection);
  container.appendChild(contentSetSection);
  container.appendChild(dropZone);
  container.appendChild(fileInput);
  container.appendChild(fileListContainer);
  container.appendChild(validationListContainer);
  container.appendChild(previewContainer);
  container.appendChild(errorListContainer);
  container.appendChild(statusText);
  container.appendChild(loadButton);
  appElement!.appendChild(container);

  if (initialManifestUrl !== null || options.autoLoadRemoteManifest) {
    void handleRemoteManifestFetch();
  }

  async function populateContentSetDropdowns(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(contentSetsIndexUrl);
    } catch {
      return;
    }
    if (!response.ok) {
      return;
    }

    const parsed = parseContentSetIndex(await response.json());
    if (!parsed.ok) {
      return;
    }

    const selectableAssets = parsed.value.assetSets.filter(
      (option) => option.selectable,
    );
    const selectableMaps = parsed.value.mapSets.filter(
      (option) => option.selectable,
    );
    if (selectableAssets.length === 0 || selectableMaps.length === 0) {
      return;
    }

    fillSelectOptions(contentAssetSelect, selectableAssets);
    fillSelectOptions(contentMapSelect, selectableMaps);
    contentSetSection.style.display = "block";
  }

  async function loadSelectedContentSet(): Promise<void> {
    const bundleUrl = contentSetBundleManifestUrl(
      contentAssetSelect.value,
      contentMapSelect.value,
    );
    contentSetStatus.textContent = `Loading ${contentAssetSelect.value} × ${contentMapSelect.value} …`;
    remoteInput.value = bundleUrl;
    assetSetSelect.value = customAssetSetId;
    selectedRemoteDefaultLevelName = undefined;
    await handleRemoteManifestFetch();
    await bootRemoteManifest();
  }

  loadContentSetButton.addEventListener("click", () => {
    void loadSelectedContentSet();
  });

  void populateContentSetDropdowns();

  function renderRemoteLevelOptions(manifest: UserAssetManifest): void {
    remoteLevelSelect.innerHTML = "";

    // Warp sub-areas (e.g. underground rooms) are pipe destinations, not
    // standalone levels, so keep them out of the picker.
    const selectableLevels = manifest.levels.filter(
      (level) => !level.name.startsWith("smb-warp-"),
    );

    for (const level of selectableLevels) {
      const option = document.createElement("option");
      option.value = level.name;
      option.textContent = level.name;
      remoteLevelSelect.appendChild(option);
    }

    if (selectableLevels.length > 0) {
      const requestedLevel =
        selectedLevelName ??
        selectedRemoteDefaultLevelName ??
        selectableLevels[0]?.name;

      if (requestedLevel !== undefined) {
        remoteLevelSelect.value = requestedLevel;
      }
    }

    remoteLevelSelect.style.display =
      selectableLevels.length > 0 ? "block" : "none";
  }

  async function handleRemoteManifestFetch(): Promise<void> {
    const manifestUrl = makeManifestUrl(remoteInput.value.trim());

    errorListContainer.innerHTML = "";
    remoteStatusText.textContent = "";
    remoteManifest = undefined;
    loadRemoteButton.disabled = true;
    loadRemoteButton.style.opacity = "0.5";

    if (manifestUrl === undefined) {
      renderImportErrors([
        "Manifest URL must be an http, https, or same-origin relative URL.",
      ]);

      return;
    }

    remoteStatusText.textContent = "Fetching manifest...";
    fetchManifestButton.disabled = true;

    try {
      const response = await fetch(manifestUrl.toString());

      if (!response.ok) {
        renderImportErrors([
          `Failed to fetch manifest URL: ${response.status} ${response.statusText}.`,
        ]);

        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const normalizedContentType = contentType.split(";")[0]?.trim() ?? "";

      if (!allowedRemoteManifestContentTypes.has(normalizedContentType)) {
        renderImportErrors([
          `Manifest URL returned unsupported content-type "${normalizedContentType}".`,
        ]);

        return;
      }

      const parsedManifest = parseManifestText(
        await response.text(),
        "Manifest URL",
      );

      if (!parsedManifest.ok) {
        renderImportErrors(parsedManifest.messages);

        return;
      }

      remoteManifest = normalizeRemoteManifestSources(
        parsedManifest.manifest,
        manifestUrl.toString(),
      );

      if (
        options.requirePlayerSpriteForAutoLoad &&
        remoteManifest.playerSprite === undefined
      ) {
        renderImportErrors([
          "Default VGLC SMB dev mode requires an ignored local playerSprite asset fragment. Add .cache/user-levels/vglc-smb-assets/fragment.json with playerSprite, then run pnpm run prepare:vglc-smb-browser-demo.",
        ]);

        return;
      }

      renderRemoteLevelOptions(remoteManifest);
      remoteStatusText.textContent = `${remoteManifest.levels.length} level${remoteManifest.levels.length === 1 ? "" : "s"} ready from manifest.`;
      loadRemoteButton.disabled = false;
      loadRemoteButton.style.opacity = "1";

      if (options.autoLoadRemoteManifest) {
        await bootRemoteManifest();
      }
    } catch {
      renderImportErrors(["Network error fetching manifest URL."]);
    } finally {
      fetchManifestButton.disabled = false;
    }
  }

  async function bootRemoteManifest(): Promise<void> {
    if (remoteManifest === undefined) {
      return;
    }

    errorListContainer.innerHTML = "";
    statusText.textContent = "Loading remote assets...";
    loadRemoteButton.disabled = true;
    loadRemoteButton.style.opacity = "0.5";

    await bootImportedManifest(
      remoteManifest,
      [],
      remoteLevelSelect.value.length > 0 ? remoteLevelSelect.value : undefined,
      () => {
        statusText.textContent = "";
        loadRemoteButton.disabled = false;
        loadRemoteButton.style.opacity = "1";
      },
    );
  }

  async function handleUserAssetImport(
    files: FileList,
    selectedLevelName: string | undefined,
  ): Promise<void> {
    const selectedFiles = Array.from(files);

    function finishFailedImport(): void {
      statusText.textContent = "";
      updateLoadButtonState(selectedFiles);
    }

    const manifestFile = selectedFiles.find(
      (file) => file.name === manifestFileName,
    );

    if (manifestFile === undefined) {
      renderImportErrors([
        "A manifest.json file is required. Select manifest.json plus all referenced asset files.",
      ]);
      finishFailedImport();

      return;
    }

    const manifestResult = parseManifestText(
      await manifestFile.text(),
      "manifest.json",
    );

    if (!manifestResult.ok) {
      renderImportErrors(manifestResult.messages);
      finishFailedImport();

      return;
    }

    await bootImportedManifest(
      manifestResult.manifest,
      selectedFiles,
      selectedLevelName,
      finishFailedImport,
    );
  }

  async function bootImportedManifest(
    manifest: UserAssetManifest,
    selectedFiles: readonly File[],
    requestedLevelName: string | undefined,
    finishFailedImport: () => void,
  ): Promise<void> {
    const loadResult = await loadUserAssetBundle(manifest, selectedFiles, {
      maxFileBytes: defaultMaxFileBytes,
      maxTotalBytes: defaultMaxTotalBytes,
    });

    if (!loadResult.ok) {
      renderImportErrors(loadResult.errors.map((error) => error.message));
      finishFailedImport();

      return;
    }

    const bundle = loadResult.bundle;
    const levelNames = [...bundle.levels.keys()];
    const levelName = requestedLevelName ?? levelNames[0] ?? undefined;

    if (levelName === undefined) {
      renderImportErrors(["Manifest contains no playable levels."]);
      finishFailedImport();

      return;
    }

    const selectedLevel = bundle.levels.get(levelName);

    if (selectedLevel === undefined) {
      renderImportErrors([`Level "${levelName}" not found in manifest.`]);
      finishFailedImport();

      return;
    }

    if (selectedLevel.compatibilityConformanceReport.issues.length > 0) {
      renderImportErrors(
        selectedLevel.compatibilityConformanceReport.issues.map(
          (issue) => `Compatibility issue: ${issue.message}`,
        ),
      );
      finishFailedImport();

      return;
    }

    if (options.requireCompleteSpriteCoverageForAutoLoad) {
      const coverageMessages = validateDefaultVglcSmbSpriteCoverage(
        manifest,
        selectedLevel.levelSpecInput,
      );

      if (coverageMessages.length > 0) {
        renderImportErrors(coverageMessages);
        finishFailedImport();

        return;
      }
    }

    clearPreviewObjectUrls();
    startSession(
      {
        levelInput: selectedLevel.levelSpecInput,
        levelSequence: undefined,
        levelIndex: 0,
        initialPlayerVitality: makeInitialPlayerVitalityState(),
        userAssetBundle: bundle,
        viewport: classicCompatibilityViewport,
        userLevelVisualName: selectedLevel.name,
      },
      selectedLevel.name,
      "play",
      () => {
        void renderStartMenu();
      },
    );
  }
}

function styleStartMenuSelect(select: HTMLSelectElement): void {
  select.style.width = "100%";
  // Grid items default to min-width:auto, so a select whose selected option is
  // wider than its column pushes past the track and out of the panel. Allow it
  // to shrink and clip its own overflowing text instead.
  select.style.minWidth = "0";
  select.style.boxSizing = "border-box";
  select.style.padding = "8px 10px";
  select.style.marginTop = "4px";
  select.style.marginBottom = "8px";
  select.style.borderRadius = "8px";
  select.style.border = "3px solid #7a4a1e";
  select.style.backgroundColor = "#fff7e6";
  select.style.color = "#3a2410";
  select.style.fontFamily = "monospace";
  select.style.fontWeight = "bold";
  // 13px keeps the longer option labels ("Shabby (exaggerated reactions)")
  // inside the two-column boxes; overflow clips rather than spills.
  select.style.fontSize = "13px";
  select.style.whiteSpace = "nowrap";
  select.style.overflow = "hidden";
  select.style.textOverflow = "ellipsis";
}

function makeStartMenuLabel(text: string): HTMLElement {
  const label = document.createElement("div");
  label.textContent = text;
  label.style.fontFamily = "monospace";
  label.style.fontWeight = "bold";
  label.style.fontSize = "13px";
  label.style.letterSpacing = "1px";
  label.style.color = "#ffe08a";
  label.style.textShadow = "1px 1px 0 #3a2410";
  return label;
}

function makeStartMenuDropdown(
  ariaLabel: string,
  options: readonly (readonly [string, string])[],
): HTMLSelectElement {
  const select = document.createElement("select");
  select.setAttribute("aria-label", ariaLabel);
  styleStartMenuSelect(select);
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  return select;
}

// Put the Play button into (or out of) its loading state: a spinner + "LOADING…"
// while the content bundle fetches, so a tap gives instant feedback and can't be
// double-fired. Kept as its own function so the error path can reset the button
// by class without threading a reference around.
function setPlayButtonLoading(button: HTMLButtonElement, loading: boolean): void {
  button.disabled = loading;
  button.style.cursor = loading ? "progress" : "pointer";
  if (loading) {
    button.replaceChildren();
    const spinner = document.createElement("span");
    spinner.className = "start-menu-spinner";
    spinner.setAttribute("aria-hidden", "true");
    button.append(spinner, document.createTextNode("LOADING…"));
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = "▶ PLAY";
    button.removeAttribute("aria-busy");
  }
}

// The shabby sound pack (authored formant-synthesized "ouch" voices). Classic
// audio uses the built-in chiptune tones and loads no pack.
const shabbySoundPackManifestUrl = `${contentBaseUrl}sound-packs/shabby/manifest.json`;

// A clean, original platformer-themed start menu: three auto-populated
// dropdowns (skin, map, game mode) and a Play button that boots the composed
// content-set bundle behind the scenes. Original styling only.
async function renderStartMenu(autoplay?: PlayRoute): Promise<void> {
  if (autoplay === undefined) {
    setRouteHash("menu");
  }
  showUiLayer();
  configureAppElementForImport();
  clearApp();

  const panel = document.createElement("div");
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Start menu");
  panel.className = "start-menu-panel";
  panel.style.maxWidth = "480px";
  panel.style.margin = "20px auto";
  panel.style.padding = "18px 22px";
  // Never taller than the viewport: fit on short screens, scrolling only as a
  // last resort on very small ones.
  panel.style.boxSizing = "border-box";
  panel.style.maxHeight = "calc(100vh - 16px)";
  panel.style.overflowY = "auto";
  panel.style.borderRadius = "14px";
  panel.style.border = "5px solid #7a4a1e";
  panel.style.background = "linear-gradient(#7ec0ff, #9fd0ff 60%, #d9b98a)";
  panel.style.boxShadow = "0 10px 0 #5a350f, 0 12px 24px rgba(0,0,0,0.35)";
  panel.style.textAlign = "center";

  const coin = document.createElement("div");
  coin.className = "start-menu-coin";
  coin.textContent = "◉";
  coin.style.fontSize = "30px";
  coin.style.color = "#ffcc33";
  coin.style.textShadow = "2px 2px 0 #a9730a";

  const title = document.createElement("h1");
  title.textContent = "ORIGINAL PLATFORMER";
  title.style.fontFamily = "monospace";
  title.style.fontWeight = "900";
  title.style.fontSize = "24px";
  title.style.letterSpacing = "2px";
  title.style.color = "#c8401b";
  title.style.margin = "2px 0 12px 0";
  title.style.textShadow = "2px 2px 0 #ffe08a, 3px 3px 0 #3a2410";

  const assetSelect = document.createElement("select");
  assetSelect.setAttribute("aria-label", "Asset set");
  styleStartMenuSelect(assetSelect);
  const mapSelect = document.createElement("select");
  mapSelect.setAttribute("aria-label", "Map set");
  styleStartMenuSelect(mapSelect);
  const levelSelect = document.createElement("select");
  levelSelect.setAttribute("aria-label", "Level");
  styleStartMenuSelect(levelSelect);
  const modeSelect = makeStartMenuDropdown("Game mode", [
    ["shabby", "Shabby (exaggerated reactions)"],
    ["classic", "Classic (calm)"],
  ]);
  const audioSelect = makeStartMenuDropdown("Sound", [
    ["shabby", "Shabby (ba-ba vocals + ouch)"],
    ["classic", "Classic (chiptune)"],
  ]);
  // The rendering backend. Canvas is the default; WebGL is faster (especially on
  // mobile). The choice is persisted and applied to the next game started.
  const rendererSelect = makeStartMenuDropdown("Renderer", [
    ["canvas", "Canvas (default)"],
    ["webgl", "WebGL (GPU, faster)"],
    ["auto", "Auto (WebGL if available)"],
  ]);
  // The costume the human player wears — the castaway, the full green
  // companion, or any of the four Futurama-inspired robots.
  // The normal character roster and the revenge-mode roster (you play the
  // stomper). The CHARACTER dropdown swaps between them when Revenge toggles.
  const normalCharacterOptions: readonly (readonly [string, string])[] = [
    ["castaway", "Castaway"],
    ["luigi", "Green companion"],
    ["robot1", "Robot: Clank (boxy)"],
    ["robot2", "Robot: Sprocket (thin)"],
    ["robot3", "Robot: Bubbles (dome)"],
    ["robot4", "Robot: Crusher (treads)"],
  ];
  const revengeCharacterOptions: readonly (readonly [string, string])[] = [
    ["goomba", "Goomba (the avenger)"],
    ["princess", "Princess"],
  ];
  const characterSelect = makeStartMenuDropdown(
    "Character",
    normalCharacterOptions,
  );
  // Revenge mode: play a Goomba/Princess and stomp half-height Mario/Luigi.
  const revengeSelect = makeStartMenuDropdown("Revenge", [
    ["0", "Off (normal)"],
    ["1", "Revenge mode"],
  ]);
  const setCharacterOptions = (
    options: readonly (readonly [string, string])[],
  ): void => {
    const previous = characterSelect.value;
    characterSelect.replaceChildren();
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      characterSelect.appendChild(option);
    }
    if (options.some(([value]) => value === previous)) {
      characterSelect.value = previous;
    }
  };
  revengeSelect.addEventListener("change", () => {
    setCharacterOptions(
      revengeSelect.value === "1"
        ? revengeCharacterOptions
        : normalCharacterOptions,
    );
  });
  // Same-screen co-op demo: add N robot players that wander the level on their
  // own beside you.
  const botsSelect = makeStartMenuDropdown("Bots", [
    ["0", "0 (just me)"],
    ["1", "1 robot"],
    ["3", "3 robots"],
    ["5", "5 robots"],
    ["8", "8 robots"],
    ["15", "15 robots"],
  ]);
  rendererSelect.value = resolveRendererChoice(
    window.location.search,
    window.localStorage,
  );
  rendererSelect.addEventListener("change", () => {
    if (isRendererChoice(rendererSelect.value)) {
      persistRendererChoice(rendererSelect.value, window.localStorage);
    }
  });

  const playButton = document.createElement("button");
  playButton.className = "start-menu-play";
  playButton.textContent = "▶ PLAY";
  playButton.style.marginTop = "8px";
  playButton.style.padding = "12px 32px";
  playButton.style.fontFamily = "monospace";
  playButton.style.fontWeight = "900";
  playButton.style.fontSize = "18px";
  playButton.style.letterSpacing = "2px";
  playButton.style.cursor = "pointer";
  playButton.style.borderRadius = "10px";
  playButton.style.border = "4px solid #1f6b2e";
  playButton.style.backgroundColor = "#37b24d";
  playButton.style.color = "#ffffff";
  playButton.style.textShadow = "1px 1px 0 #135020";

  const status = document.createElement("p");
  status.style.fontFamily = "monospace";
  status.style.color = "#3a2410";
  status.style.minHeight = "18px";
  status.style.margin = "14px 0 0 0";

  // The label+select pairs live in a controls container that reflows to a
  // two-column grid on short (mobile-landscape) viewports.
  const controls = document.createElement("div");
  controls.className = "start-menu-controls";
  // Two columns by default so the six fields fit in three rows instead of a tall
  // six-row stack (a short landscape screen tightens this further to three
  // columns via the responsive rules).
  controls.style.display = "grid";
  controls.style.gridTemplateColumns = "1fr 1fr";
  controls.style.columnGap = "14px";
  controls.style.textAlign = "left";
  const appendField = (labelText: string, control: HTMLElement): void => {
    const field = document.createElement("div");
    field.className = "start-menu-field";
    // Let the field shrink within its grid track so a wide control clips
    // rather than overflowing the panel.
    field.style.minWidth = "0";
    field.appendChild(makeStartMenuLabel(labelText));
    field.appendChild(control);
    controls.appendChild(field);
  };

  panel.appendChild(coin);
  panel.appendChild(title);

  // A guided walkthrough of every menu control, mirroring the editor's tutorial.
  panel.style.position = "relative";
  const tutorialButton = document.createElement("button");
  tutorialButton.type = "button";
  tutorialButton.textContent = "🎓 Tutorial";
  tutorialButton.setAttribute("aria-label", "Start menu tutorial");
  tutorialButton.style.cssText =
    "position:absolute;top:10px;right:12px;padding:6px 10px;font:700 11px monospace;" +
    "letter-spacing:0.5px;cursor:pointer;border-radius:8px;border:2px solid #7a4a1e;" +
    "background:#fff3d6;color:#6b3410;";
  const fieldOf = (control: HTMLElement): HTMLElement =>
    control.closest<HTMLElement>(".start-menu-field") ?? control;
  tutorialButton.addEventListener("click", () => {
    runSpotlightWalkthrough(
      panel,
      [
        {
          target: fieldOf(assetSelect),
          title: "1 / 10 · Skin",
          body: "The art set that draws everything — the original shabby-castaway parody sprites. More skins appear here as they're built.",
        },
        {
          target: fieldOf(mapSelect),
          title: "2 / 10 · Map",
          body: "Which pack of level layouts to play — e.g. the numeric SMB world maps rendered with the chosen skin.",
        },
        {
          target: fieldOf(levelSelect),
          title: "3 / 10 · Level",
          body: "The specific level to drop into. World-numbered entries (1-1, 1-2…) come from the selected map.",
        },
        {
          target: fieldOf(modeSelect),
          title: "4 / 10 · Game mode",
          body: "Shabby plays up the exaggerated cartoon reactions (the ouch head-hold, squash bursts, blood); Classic keeps it calm.",
        },
        {
          target: fieldOf(audioSelect),
          title: "5 / 10 · Sound",
          body: "Shabby sings the melody as a silly 'ba-ba' voice with ouches; Classic is the plain chiptune soundtrack.",
        },
        {
          target: fieldOf(rendererSelect),
          title: "6 / 10 · Renderer",
          body: "Canvas is the safe default; WebGL uses the GPU and is smoother, especially on phones. Your choice is remembered.",
        },
        {
          target: fieldOf(revengeSelect),
          title: "7 / 10 · Revenge",
          body: "Flip the game on its head: you play a Goomba (or the Princess) and stomp half-height Mario/Luigi. Turning it on swaps the Character list below.",
        },
        {
          target: fieldOf(characterSelect),
          title: "8 / 10 · Character",
          body: "Who you play — the castaway, the green companion, or one of four robots. In Revenge mode this becomes Goomba / Princess.",
        },
        {
          target: fieldOf(botsSelect),
          title: "9 / 10 · Bots",
          body: "Add same-screen robot buddies that wander the level on their own beside you — a quick co-op demo.",
        },
        {
          target: playButton,
          title: "10 / 10 · Play",
          body: "Start! It loads the chosen pack (you'll see a spinner) and drops you in. Press Esc in-game to come back here.",
        },
      ],
      { ariaLabel: "Start menu tutorial" },
    );
  });
  panel.appendChild(tutorialButton);

  appendField("SKIN", assetSelect);
  appendField("MAP", mapSelect);
  appendField("LEVEL", levelSelect);
  appendField("GAME MODE", modeSelect);
  appendField("SOUND", audioSelect);
  appendField("RENDERER", rendererSelect);
  appendField("REVENGE", revengeSelect);
  appendField("CHARACTER", characterSelect);
  appendField("BOTS", botsSelect);
  panel.appendChild(controls);
  panel.appendChild(playButton);

  const editButton = document.createElement("button");
  editButton.textContent = "✎ CREATE / UPLOAD LEVEL";
  editButton.style.cssText =
    "display:block;width:100%;box-sizing:border-box;margin-top:12px;padding:9px 16px;" +
    "font:700 13px monospace;letter-spacing:1px;cursor:pointer;border-radius:9px;" +
    "border:3px solid #4c2a86;background:#7c3aed;color:#fff;text-shadow:1px 1px 0 #2c1657;";
  editButton.addEventListener("click", () => {
    renderEditor();
  });
  panel.appendChild(editButton);

  // Reset all locally-saved data (preferences and saved levels). Kept small and
  // low-contrast since it is destructive and rarely used; it confirms first.
  const resetButton = document.createElement("button");
  resetButton.textContent = "↺ Reset saved data";
  resetButton.setAttribute("aria-label", "Reset saved data");
  resetButton.style.cssText =
    "display:block;margin:14px auto 0;padding:6px 12px;font:600 11px monospace;" +
    "letter-spacing:0.5px;cursor:pointer;border-radius:7px;border:2px solid #7a4a1e;" +
    "background:#f3e2c7;color:#6b3410;";
  resetButton.addEventListener("click", () => {
    const hasSavedData = storedStateKeys(window.localStorage).length > 0;
    const confirmed = window.confirm(
      hasSavedData
        ? "Reset all saved data? This clears your preferences (renderer, editor, and control settings) and any levels saved in the editor. This cannot be undone."
        : "There is no saved data to reset.",
    );
    if (!confirmed) {
      return;
    }
    resetStoredState(window.localStorage);
    window.location.reload();
  });
  panel.appendChild(resetButton);

  panel.appendChild(status);
  appElement!.appendChild(panel);

  try {
    const response = await fetch(contentSetsIndexUrl);
    if (!response.ok) {
      throw new Error("index unavailable");
    }
    const parsed = parseContentSetIndex(await response.json());
    if (!parsed.ok) {
      throw new Error("index invalid");
    }
    const assets = parsed.value.assetSets.filter((option) => option.selectable);
    const maps = parsed.value.mapSets.filter((option) => option.selectable);
    if (assets.length === 0 || maps.length === 0) {
      throw new Error("no content sets");
    }
    fillSelectOptions(assetSelect, assets);
    fillSelectOptions(mapSelect, maps);
    if (autoplay !== undefined) {
      if ([...assetSelect.options].some((o) => o.value === autoplay.skin)) {
        assetSelect.value = autoplay.skin;
      }
      if ([...mapSelect.options].some((o) => o.value === autoplay.map)) {
        mapSelect.value = autoplay.map;
      }
    }
  } catch {
    status.style.color = "#8a1c1c";
    status.textContent =
      "No content sets found. Run: pnpm run prepare:smb (with your ROM).";
    playButton.disabled = true;
    playButton.style.opacity = "0.5";
    return;
  }

  // Populate the Level dropdown from the selected map pack's manifest, so the
  // player can pick any level the pack ships. Re-runs whenever the map (or
  // skin, which determines the composed bundle) changes.
  // Guards against a slow stale fetch overwriting the list after the user has
  // already switched map/skin: only the most recent invocation may mutate the UI.
  let refreshLevelsToken = 0;
  const refreshLevels = async (): Promise<void> => {
    const token = (refreshLevelsToken += 1);
    levelSelect.replaceChildren();
    playButton.disabled = true;
    playButton.style.opacity = "0.5";
    status.textContent = "Loading levels…";
    try {
      const response = await fetch(
        contentSetBundleManifestUrl(assetSelect.value, mapSelect.value),
      );
      if (!response.ok) {
        throw new Error("manifest unavailable");
      }
      const manifest = (await response.json()) as {
        readonly levels?: readonly { readonly name?: unknown }[];
      };
      if (token !== refreshLevelsToken) {
        return;
      }
      const levels = (manifest.levels ?? [])
        .filter(
          (level): level is { readonly name: string } =>
            typeof level.name === "string",
        )
        // Warp sub-areas (underground rooms) are pipe destinations, not
        // standalone levels — keep them out of the picker.
        .filter((level) => !level.name.startsWith("smb-warp-"));
      if (levels.length === 0) {
        throw new Error("no levels");
      }
      // List EVERY decoded area by its true "world-area" number, so any level —
      // including the castles (e.g. 1-5, the Bowser keep) and the above-ground
      // intro fragments — can be selected and played directly, not just the four
      // levels the classic progression auto-advances through.
      for (const level of levels) {
        if (!/^smb-\d+-\d+$/.test(level.name)) {
          continue;
        }
        const option = document.createElement("option");
        option.value = level.name;
        option.textContent = friendlyLevelLabel(level.name);
        levelSelect.appendChild(option);
      }
      status.textContent = "";
      playButton.disabled = false;
      playButton.style.opacity = "1";
    } catch {
      if (token !== refreshLevelsToken) {
        return;
      }
      status.style.color = "#8a1c1c";
      status.textContent = "No levels in this map pack.";
    }
  };

  assetSelect.addEventListener("change", () => void refreshLevels());
  mapSelect.addEventListener("change", () => void refreshLevels());
  await refreshLevels();

  const playSelected = (): void => {
    // Instant feedback: the button shows a spinner while the bundle loads.
    setPlayButtonLoading(playButton, true);
    setRouteHash(
      `play?skin=${encodeURIComponent(assetSelect.value)}` +
        `&map=${encodeURIComponent(mapSelect.value)}` +
        `&level=${encodeURIComponent(levelSelect.value)}` +
        `&mode=${modeSelect.value}&sound=${audioSelect.value}` +
        `&bots=${botsSelect.value}&character=${characterSelect.value}` +
        `&revenge=${revengeSelect.value}`,
    );
    void bootSelectedContentSet(
      assetSelect.value,
      mapSelect.value,
      levelSelect.value,
      modeSelect.value === "shabby",
      audioSelect.value === "shabby",
      Number(botsSelect.value) || 0,
      parsePlayerCharacter(characterSelect.value),
      revengeSelect.value === "1",
      status,
    );
  };
  playButton.addEventListener("click", playSelected);

  // A #play?... route pre-selects the knobs and starts the level immediately.
  if (autoplay !== undefined && !playButton.disabled) {
    modeSelect.value = autoplay.mode;
    audioSelect.value = autoplay.sound;
    if ([...botsSelect.options].some((o) => o.value === autoplay.bots)) {
      botsSelect.value = autoplay.bots;
    }
    // Revenge is set before the character so the roster (goomba/princess vs the
    // normal cast) is populated before we try to select the character.
    revengeSelect.value = autoplay.revenge;
    setCharacterOptions(
      autoplay.revenge === "1"
        ? revengeCharacterOptions
        : normalCharacterOptions,
    );
    if (
      [...characterSelect.options].some((o) => o.value === autoplay.character)
    ) {
      characterSelect.value = autoplay.character;
    }
    if ([...levelSelect.options].some((o) => o.value === autoplay.level)) {
      levelSelect.value = autoplay.level;
      playSelected();
    } else {
      // A deep link may name a pack level the picker hides (a warp sub-area /
      // bonus room, which are pipe destinations rather than menu entries). Boot
      // it directly from the pack instead of falling back to the first main.
      setRouteHash(
        `play?skin=${encodeURIComponent(assetSelect.value)}` +
          `&map=${encodeURIComponent(mapSelect.value)}` +
          `&level=${encodeURIComponent(autoplay.level)}` +
          `&mode=${modeSelect.value}&sound=${audioSelect.value}` +
          `&bots=${botsSelect.value}&character=${characterSelect.value}` +
          `&revenge=${revengeSelect.value}`,
      );
      void bootSelectedContentSet(
        assetSelect.value,
        mapSelect.value,
        autoplay.level,
        modeSelect.value === "shabby",
        audioSelect.value === "shabby",
        Number(botsSelect.value) || 0,
        parsePlayerCharacter(characterSelect.value),
        revengeSelect.value === "1",
        status,
      );
    }
  }
}

// Turns a raw level id into a friendly menu label, e.g.
// "vglc-smb-multi-layer-mario-1-1" or "smb-1-2" -> "World 1-2".
function friendlyLevelLabel(levelName: string): string {
  const worldLevel = /(\d+)-(\d+)/.exec(levelName);
  if (worldLevel !== null) {
    return `World ${worldLevel[1]}-${worldLevel[2]}`;
  }
  return levelName;
}

type ClassicLevelInfo = { readonly label: string; readonly main: boolean };

// Map the decoded areas onto the classic level numbers ("1-1" … "8-4"). A world
// decoded as five areas has an above-ground intro fragment (its 2nd area) for
// the underground/water level; dropping that leaves the four displayed levels,
// which the caller lists/labels while the fragment stays hidden.
function classicLevelMap(
  levelNames: readonly string[],
): Map<string, ClassicLevelInfo> {
  const byWorld = new Map<number, string[]>();
  for (const name of levelNames) {
    const match = /^smb-(\d+)-\d+$/.exec(name);
    if (match === null) {
      continue;
    }
    const world = Number(match[1]);
    const slots = byWorld.get(world) ?? [];
    slots.push(name);
    byWorld.set(world, slots);
  }

  const result = new Map<string, ClassicLevelInfo>();
  for (const [world, slots] of byWorld) {
    const mainSlots =
      slots.length >= 5
        ? [slots[0], slots[2], slots[3], slots[4]]
        : slots.slice(0, 4);
    mainSlots.forEach((name, index) => {
      if (name !== undefined) {
        result.set(name, {
          label: `${String(world)}-${String(index + 1)}`,
          main: true,
        });
      }
    });
    for (const name of slots) {
      if (!result.has(name)) {
        result.set(name, { label: `${String(world)}`, main: false });
      }
    }
  }
  return result;
}

async function fetchAndLoadManifest(
  manifestUrl: string,
): Promise<UserAssetBundle> {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`not found (HTTP ${response.status})`);
  }
  const parsed = parseUserAssetManifest(
    (await response.json()) as UserAssetManifestInput,
  );
  if (!parsed.ok) {
    throw new Error("manifest invalid");
  }
  const manifest = normalizeRemoteManifestSources(
    parsed.value,
    new URL(manifestUrl, window.location.href).toString(),
  );
  const loadResult = await loadUserAssetBundle(manifest, [], {
    maxFileBytes: defaultMaxFileBytes,
    maxTotalBytes: defaultMaxTotalBytes,
  });
  if (!loadResult.ok) {
    throw new Error(loadResult.errors[0]?.message ?? "asset load failed");
  }
  return loadResult.bundle;
}

async function bootSelectedContentSet(
  assetSetId: string,
  mapSetId: string,
  levelName: string,
  exaggeratedReactions: boolean,
  shabbyAudio: boolean,
  botCount: number,
  playerCharacter: PlayerCharacter,
  revengeMode: boolean,
  status: HTMLElement,
): Promise<void> {
  status.style.color = "#3a2410";
  status.textContent = "Loading…";

  try {
    const bundle = await fetchAndLoadManifest(
      contentSetBundleManifestUrl(assetSetId, mapSetId),
    );
    // Boot the level the player picked; fall back to the first if the id is
    // unknown (e.g. an empty selection).
    const selectedLevel =
      bundle.levels.get(levelName) ?? [...bundle.levels.values()][0];
    if (selectedLevel === undefined) {
      throw new Error("manifest has no levels");
    }

    // Classic labels + the ordered main levels (intro fragments and pipe sub-
    // areas skipped), so the HUD reads e.g. "1-2" and the finish overlay's "Next
    // level" goes to the following displayed level.
    const classicMap = classicLevelMap([...bundle.levels.keys()]);
    const worldLevelLabel = classicMap.get(selectedLevel.name)?.label;
    const mainLevelNames = [...bundle.levels.keys()].filter(
      (name) => classicMap.get(name)?.main === true,
    );
    const nextLevelName =
      mainLevelNames[mainLevelNames.indexOf(selectedLevel.name) + 1];

    // Fail loud: a selected skin must supply a real sprite for every rendered
    // actor and tile in the level. No silent vector fallbacks.
    const coverageMessages = validateDefaultVglcSmbSpriteCoverage(
      bundle.manifest,
      selectedLevel.levelSpecInput,
    );
    if (coverageMessages.length > 0) {
      throw new Error(coverageMessages.join(" "));
    }

    // Overlay the authored "ouch" sound pack when shabby audio is selected;
    // classic audio keeps the built-in chiptune tones (no pack).
    const sounds = shabbyAudio
      ? new Map([
          ...bundle.sounds,
          ...(await fetchAndLoadManifest(shabbySoundPackManifestUrl)).sounds,
        ])
      : bundle.sounds;

    startSession(
      {
        levelInput: selectedLevel.levelSpecInput,
        levelSequence: undefined,
        // Hold on frame 0 with a prompt until the player presses a key, so the
        // first-load latency of a served content pack never eats the level start.
        awaitStart: true,
        // Every level in the pack is addressable by name so a pipe that warps to
        // a named target level (e.g. a decoded sub-area) can be loaded on entry.
        warpLevelsByName: new Map(
          [...bundle.levels].map(([name, level]) => [
            name,
            level.levelSpecInput,
          ]),
        ),
        // Each sub-area's theme, so warping into a differently-themed section
        // (e.g. an underground/water pipe area) switches the world's look/feel.
        warpLevelThemesByName: new Map(
          [...bundle.levels].flatMap(([name, level]) =>
            level.theme === undefined ? [] : [[name, level.theme] as const],
          ),
        ),
        levelIndex: 0,
        // Underwater you can't stomp, so a water level starts Mario with fire
        // power — otherwise you'd have no way to fight the Bloopers/Cheep-cheeps
        // (they harm on contact). Other themes start small as usual.
        initialPlayerVitality:
          selectedLevel.theme === "water"
            ? makeFirePlayerVitalityState()
            : makeInitialPlayerVitalityState(),
        userAssetBundle: { ...bundle, sounds },
        viewport: classicCompatibilityViewport,
        userLevelVisualName: selectedLevel.name,
        // You plus the chosen number of same-screen demo bots.
        playerCount: 1 + Math.max(0, botCount),
        // The costume the human player wears (bots always wear robots).
        playerCharacter,
        // Revenge mode: play the stomper, enemies become Mario/Luigi.
        revengeMode,
        exaggeratedReactions,
        // The shabby "Sound" choice sings the melody as a baritone "ba ba ba".
        vocalSoundtrack: shabbyAudio,
        // The classic "world-level" label shown in the HUD (e.g. "1-2").
        ...(worldLevelLabel !== undefined ? { worldLevelLabel } : {}),
        // Labels per main level, so a warp-zone jump retitles the HUD.
        worldLevelLabelByName: new Map(
          mainLevelNames.flatMap((name) => {
            const label = classicMap.get(name)?.label;
            return label === undefined ? [] : [[name, label] as const];
          }),
        ),
        // The level's world theme (overworld / underground / castle / water)
        // drives its palette, backdrop, and — for water — swim physics.
        ...(selectedLevel.theme !== undefined
          ? { theme: selectedLevel.theme }
          : {}),
        // "Next level" launches the following main level in the map set —
        // relative to the main level the run currently belongs to, so a
        // warp-zone jump advances within the warped-to world.
        ...(nextLevelName !== undefined
          ? {
              onAdvanceToNextLevel: (currentMainLevelName?: string) => {
                const fromIndex = mainLevelNames.indexOf(
                  currentMainLevelName ?? selectedLevel.name,
                );
                const next =
                  fromIndex >= 0
                    ? mainLevelNames[fromIndex + 1]
                    : nextLevelName;
                if (next === undefined) {
                  // Past the last level (8-4 cleared): back to the menu.
                  void renderStartMenu();
                  return;
                }
                void bootSelectedContentSet(
                  assetSetId,
                  mapSetId,
                  next,
                  exaggeratedReactions,
                  shabbyAudio,
                  botCount,
                  playerCharacter,
                  revengeMode,
                  status,
                );
              },
            }
          : {}),
      },
      friendlyLevelLabel(selectedLevel.name),
      "play",
      () => {
        void renderStartMenu();
      },
    );
  } catch (error) {
    status.style.color = "#8a1c1c";
    status.textContent = `Could not start: ${error instanceof Error ? error.message : String(error)}`;
    // Loading failed — restore the Play button so it can be tried again.
    const playButton = document.querySelector<HTMLButtonElement>(
      ".start-menu-play",
    );
    if (playButton !== null) {
      setPlayButtonLoading(playButton, false);
    }
  }
}

function sharedLevelFromHash(): LevelSpecInput | undefined {
  const code = new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
    "level",
  );
  return code !== null ? decodeSharedLevel(code) : undefined;
}

// Route to the area named by the URL hash so every screen is a shareable link.
function applyRoute(): void {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw.startsWith("play?")) {
    const params = new URLSearchParams(raw.slice("play?".length));
    const skin = params.get("skin");
    const map = params.get("map");
    const level = params.get("level");
    if (skin !== null && map !== null && level !== null) {
      void renderStartMenu({
        skin,
        map,
        level,
        mode: params.get("mode") ?? "classic",
        sound: params.get("sound") ?? "classic",
        bots: params.get("bots") ?? "0",
        revenge: params.get("revenge") ?? "0",
        character: params.get("character") ?? "castaway",
      });
      return;
    }
  }
  if (raw === "design") {
    renderEditor();
    return;
  }
  const shared = sharedLevelFromHash();
  if (shared !== undefined) {
    // A shared "#level=..." link opens straight in the designer to play or tweak.
    renderEditor(shared);
    return;
  }
  void renderStartMenu();
}

if (
  shouldImportAssets ||
  searchParameters.has(manifestUrlSearchParameterName)
) {
  renderImportUi({
    autoLoadRemoteManifest: false,
    requirePlayerSpriteForAutoLoad: false,
    requireCompleteSpriteCoverageForAutoLoad: false,
  });
} else if (hasExplicitBrowserLevel) {
  void bootWithDefaultAssets();
} else {
  applyRoute();
}

// Manual address-bar edits / back-forward re-route (our own navigation uses
// replaceState, which doesn't fire this).
window.addEventListener("hashchange", () => {
  applyRoute();
});

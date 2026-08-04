type PlayerProfile = {
  readonly playerId: string;
  readonly nickname: string;
  readonly avatarId: string;
};

type GameSummary = {
  readonly gameId: string;
  readonly creator: PlayerProfile;
  readonly levelId: string;
  readonly mode: "regular" | "revenge";
  readonly phase: "waiting" | "playing" | "paused" | "finished";
  readonly playerCount: number;
  readonly maximumPlayerCount: number;
};

type GameSnapshot = MultiplayerRenderedSnapshot;

function isGameSnapshot(value: unknown): value is GameSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return (
    typeof record["gameId"] === "string" &&
    typeof record["levelId"] === "string" &&
    typeof record["cameraLeftPixels"] === "number"
  );
}

const multiplayerApiPrefix = "/api";

const multiplayerVisualStyleId = "multiplayer-visual-language";

function installMultiplayerVisualLanguage(): void {
  if (document.getElementById(multiplayerVisualStyleId) !== null) {
    return;
  }
  const style = document.createElement("style");
  style.id = multiplayerVisualStyleId;
  style.textContent = `
    .multiplayer-panel { max-width: 980px; margin: 24px auto; padding: 22px;
      color: #172033; background: linear-gradient(#8ed4ea 0 18%, #dff4ee 18% 100%);
      font-family: monospace; border: 5px solid #172033; box-shadow: 9px 9px 0 #285a37; }
    .multiplayer-panel h1, .multiplayer-panel h2 { margin: 0 0 14px; letter-spacing: .08em; }
    .multiplayer-panel h1 { color: #172033; text-shadow: 2px 2px #f5f7fb; }
    .multiplayer-panel section, .multiplayer-panel form, .multiplayer-panel [role=log] {
      display: block; margin: 12px 0; padding: 12px; background: #f5f7fb;
      border: 3px solid #172033; box-shadow: 4px 4px 0 #6ca83f; }
    .multiplayer-panel button { margin: 5px; padding: 9px 13px; border: 3px solid #172033;
      background: #ffd54a; color: #172033; font: inherit; font-weight: 800; cursor: pointer;
      box-shadow: 3px 3px 0 #b9682f; }
    .multiplayer-panel button:hover, .multiplayer-panel button:focus-visible { background: #ff9d2e; outline: 3px solid #f5f7fb; outline-offset: 2px; }
    .multiplayer-panel input, .multiplayer-panel select { margin: 4px; padding: 8px; border: 2px solid #172033; font: inherit; background: #fffef6; }
    .multiplayer-game-shell { height: 100vh; min-height: 0; display: flex; align-items: stretch; overflow: hidden; background: #172033; }
    .multiplayer-game-host { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
    .multiplayer-game-host canvas { display: block; }
    .multiplayer-game-panel { position: relative; z-index: 1; flex: 0 0 340px; box-sizing: border-box;
      max-height: 100vh; overflow: auto; margin: 0; border-width: 0 0 0 5px; box-shadow: none; background: #f5f7fb; }
    @media (max-width: 620px) { .multiplayer-panel { margin: 8px; padding: 14px; box-shadow: 5px 5px 0 #285a37; }
      .multiplayer-game-shell { height: 100vh; min-height: 0; flex-direction: column; }
      .multiplayer-game-host { flex: 1 1 auto; min-height: 0; }
      .multiplayer-game-panel { flex: 0 0 auto; max-height: 42vh; border-width: 5px 0 0; } }
  `;
  document.head.append(style);
}

function isSemanticUiNode(value: unknown): value is SemanticUiNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return (
    typeof record["role"] === "string" &&
    typeof record["label"] === "string" &&
    Array.isArray(record["children"]) &&
    record["children"].every(isSemanticUiNode) &&
    (record["action"] === undefined || typeof record["action"] === "string") &&
    (record["value"] === undefined || typeof record["value"] === "string")
  );
}

function renderSemanticUiNode(node: SemanticUiNode): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("role", node.role);
  element.setAttribute("data-semantic-role", node.role);
  element.setAttribute("data-semantic-label", node.label);
  if (node.action !== undefined) {
    element.setAttribute("data-semantic-action", node.action);
  }
  if (node.value !== undefined) {
    element.setAttribute("data-semantic-value", node.value);
  }
  const label = document.createElement("span");
  label.textContent =
    node.value === undefined ? node.label : `${node.label}: ${node.value}`;
  element.append(label);
  for (const child of node.children) {
    element.append(renderSemanticUiNode(child));
  }
  return element;
}

async function appendSemanticLayout(
  panel: HTMLElement,
  layoutPath = "/layout",
): Promise<void> {
  const layout: unknown = await requestJson(layoutPath);
  if (!isSemanticUiNode(layout)) {
    throw new Error("Server returned an invalid semantic multiplayer UI tree.");
  }
  if (!panel.isConnected) {
    return;
  }
  const inspector = document.createElement("details");
  inspector.setAttribute("data-role", "semantic-ui-tree");
  inspector.setAttribute("aria-hidden", "true");
  const summary = document.createElement("summary");
  summary.textContent = "Inspectable server UI tree";
  inspector.append(summary, renderSemanticUiNode(layout));
  panel.append(inspector);
}

async function requestJson<Value>(
  path: string,
  init: RequestInit = {},
): Promise<Value> {
  const response = await fetch(`${multiplayerApiPrefix}${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      "x-multiplayer-protocol-version": multiplayerProtocolVersion,
      ...init.headers,
    },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body as { readonly error?: unknown };
    throw new Error(
      typeof error.error === "string" ? error.error : "Request failed.",
    );
  }
  return body as Value;
}

function makePanel(): HTMLElement {
  installMultiplayerVisualLanguage();
  const panel = document.createElement("main");
  panel.setAttribute("data-role", "multiplayer");
  panel.className = "multiplayer-panel";
  return panel;
}

function makeButton(
  label: string,
  onClick: () => void | Promise<void>,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText =
    "margin:6px;padding:8px 12px;font:inherit;cursor:pointer;";
  button.addEventListener("click", () => void onClick());
  return button;
}

async function renderLobby(
  mount: HTMLElement,
  userAssetBundle: UserAssetBundle,
): Promise<void> {
  const [lobby, levelResponse] = await Promise.all([
    requestJson<{
      readonly profile: PlayerProfile;
      readonly games: readonly GameSummary[];
      readonly messages: readonly {
        readonly nickname: string;
        readonly text: string;
      }[];
    }>("/lobby"),
    requestJson<{
      readonly levels: readonly {
        readonly id: string;
        readonly label: string;
      }[];
    }>("/levels"),
  ]);
  mount.replaceChildren();
  const panel = makePanel();
  const gameShell = document.createElement("section");
  gameShell.className = "multiplayer-game-shell";
  gameShell.setAttribute("aria-label", "Multiplayer game layout");
  const heading = document.createElement("h1");
  heading.textContent = "Trusted friends lobby";
  panel.append(heading);

  const profileForm = document.createElement("form");
  const nickname = document.createElement("input");
  nickname.value = lobby.profile.nickname;
  nickname.setAttribute("aria-label", "Nickname");
  const avatar = document.createElement("select");
  avatar.setAttribute("aria-label", "Avatar");
  for (const avatarId of [
    "castaway",
    "tidekeeper",
    "brass-scout",
    "moss-runner",
    "cloud-sailor",
    "ember-warden",
  ]) {
    const option = new Option(
      avatarId,
      avatarId,
      false,
      avatarId === lobby.profile.avatarId,
    );
    avatar.append(option);
  }
  profileForm.append(
    "Nickname ",
    nickname,
    " Avatar ",
    avatar,
    makeButton("Save profile", async () => {
      await requestJson("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          nickname: nickname.value,
          avatarId: avatar.value,
        }),
      });
      await renderLobby(mount, userAssetBundle);
    }),
  );
  panel.append(profileForm);

  const levelSelect = document.createElement("select");
  levelSelect.setAttribute("aria-label", "Bundled level");
  for (const level of levelResponse.levels) {
    levelSelect.append(new Option(level.label, level.id));
  }
  const modeSelect = document.createElement("select");
  modeSelect.setAttribute("aria-label", "Game mode");
  modeSelect.append(
    new Option("Regular", "regular"),
    new Option("Revenge", "revenge"),
  );
  const create = makeButton("Create game", async () => {
    await requestJson("/games", {
      method: "POST",
      body: JSON.stringify({
        levelId: levelSelect.value,
        mode: modeSelect.value,
      }),
    });
    await renderLobby(mount, userAssetBundle);
  });
  panel.append("Level ", levelSelect, " Mode ", modeSelect, create);
  const games = document.createElement("section");
  const gamesHeading = document.createElement("h2");
  gamesHeading.textContent = "Public games";
  games.append(gamesHeading);
  for (const game of lobby.games) {
    const row = document.createElement("div");
    row.textContent = `${game.creator.nickname} · ${game.levelId} · ${game.mode} · ${game.phase} · ${game.playerCount}/${game.maximumPlayerCount}`;
    row.append(
      makeButton("Join", async () => {
        const joined = await requestJson<{ readonly game: GameSummary }>(
          `/games/${game.gameId}/join`,
          { method: "POST" },
        );
        const currentLobby = await requestJson<{
          readonly profile: PlayerProfile;
        }>("/lobby");
        renderGame(
          mount,
          currentLobby.profile,
          joined.game.gameId,
          joined.game.levelId,
          joined.game.creator.playerId,
          userAssetBundle,
        );
      }),
    );
    if (
      game.creator.playerId === lobby.profile.playerId &&
      game.phase === "waiting"
    ) {
      row.append(
        makeButton("Start", async () => {
          const started = await requestJson<{ readonly game: GameSummary }>(
            `/games/${game.gameId}/start`,
            { method: "POST" },
          );
          const currentLobby = await requestJson<{
            readonly profile: PlayerProfile;
          }>("/lobby");
          renderGame(
            mount,
            currentLobby.profile,
            started.game.gameId,
            started.game.levelId,
            started.game.creator.playerId,
            userAssetBundle,
          );
        }),
      );
    }
    games.append(row);
  }
  panel.append(games);
  const chat = document.createElement("div");
  chat.setAttribute("role", "log");
  chat.textContent = lobby.messages
    .map((message) => `${message.nickname}: ${message.text}`)
    .join("\n");
  const chatInput = document.createElement("input");
  chatInput.maxLength = 256;
  chatInput.setAttribute("aria-label", "Lobby chat message");
  panel.append(
    chat,
    chatInput,
    makeButton("Send lobby chat", async () => {
      await requestJson("/lobby/chat", {
        method: "POST",
        body: JSON.stringify({ text: chatInput.value }),
      });
      await renderLobby(mount, userAssetBundle);
    }),
  );
  mount.append(panel);
  await appendSemanticLayout(panel);
}

function renderGame(
  mount: HTMLElement,
  profile: PlayerProfile,
  gameId: string,
  levelId: string,
  creatorPlayerId: string,
  userAssetBundle: UserAssetBundle,
): void {
  mount.replaceChildren();
  const panel = makePanel();
  const gameShell = document.createElement("section");
  gameShell.className = "multiplayer-game-shell";
  gameShell.setAttribute("aria-label", "Multiplayer game layout");
  const title = document.createElement("h1");
  title.textContent = `Game ${gameId}`;
  const status = document.createElement("p");
  const gameHost = document.createElement("div");
  gameHost.className = "multiplayer-game-host";
  let currentLevelId = levelId;
  const chatInput = document.createElement("input");
  chatInput.maxLength = 256;
  chatInput.setAttribute("aria-label", "Game chat message");
  const chatLog = document.createElement("div");
  chatLog.setAttribute("role", "log");
  chatLog.setAttribute("aria-label", "Game chat");
  panel.classList.add("multiplayer-game-panel");
  panel.append(title, status, chatLog, chatInput);
  panel.append(
    makeButton("Send game chat", async () => {
      await requestJson(`/games/${gameId}/chat`, {
        method: "POST",
        body: JSON.stringify({ text: chatInput.value }),
      });
      chatInput.value = "";
      await refreshGameChat();
    }),
  );
  panel.append(
    makeButton("Leave game", async () => {
      await requestJson("/game/leave", { method: "POST" });
      disposeView();
      await renderLobby(mount, userAssetBundle);
    }),
  );
  if (creatorPlayerId === profile.playerId) {
    panel.append(
      makeButton("End game", async () => {
        await requestJson(`/games/${gameId}/end`, { method: "POST" });
        disposeView();
        await renderLobby(mount, userAssetBundle);
      }),
    );
  }
  gameShell.append(gameHost, panel);
  mount.append(gameShell);
  // Phaser measures its parent during boot. Mount first so every browser
  // session sees the real viewport instead of a detached, zero-sized host.
  let renderer = makeMultiplayerPhaserRenderer(
    gameHost,
    levelId,
    false,
    userAssetBundle,
  );
  let disposeView: () => void = () => renderer.destroy();
  void appendSemanticLayout(panel);

  let sequence = 0;
  const held = new Set<string>();
  function makePrediction(nextLevelId: string) {
    const initialPredictionState = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      requireBundledMultiplayerLevel(nextLevelId).levelSpec,
      initialMovementConstants,
    );
    if (!initialPredictionState.ok) {
      throw new Error("Multiplayer prediction could not initialise.");
    }
    return makeClientPrediction(
      initialPredictionState.value,
      requireBundledMultiplayerLevel(nextLevelId).levelSpec,
      initialMovementConstants,
    );
  }
  let prediction = makePrediction(levelId);
  const audio = new GameAudio();
  const remoteInterpolator = makeRemotePlayerInterpolator(100);
  let completedAudioPlayed = false;
  let latestAuthoritativeFrame = 0;
  const socketUrl = new URL(
    `${multiplayerApiPrefix.replace(/^\//, "")}/socket`,
    window.location.href,
  );
  socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(socketUrl);
  let disposed = false;
  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    window.clearInterval(snapshotInterval);
    window.clearInterval(chatInterval);
    socket.close();
    renderer.destroy();
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
  }
  disposeView = dispose;
  async function refreshGameChat(): Promise<void> {
    const response = await requestJson<{
      readonly messages: readonly {
        readonly nickname: string;
        readonly text: string;
      }[];
    }>(`/games/${gameId}/chat`);
    if (!disposed) {
      chatLog.textContent = response.messages
        .map((message) => `${message.nickname}: ${message.text}`)
        .join("\n");
    }
  }
  function displaySnapshot(snapshot: GameSnapshot): void {
    if (snapshot.levelId !== currentLevelId) {
      currentLevelId = snapshot.levelId;
      // A newly advanced course owns a fresh frame clock. Retaining the prior
      // course's larger frame number makes every new keyboard command look
      // implausibly far in the future to the authoritative input queue.
      latestAuthoritativeFrame = snapshot.frame;
      renderer.destroy();
      renderer = makeMultiplayerPhaserRenderer(
        gameHost,
        currentLevelId,
        false,
        userAssetBundle,
      );
      prediction = makePrediction(currentLevelId);
      title.textContent = `Game ${gameId} · ${currentLevelId}`;
    } else {
      latestAuthoritativeFrame = Math.max(
        latestAuthoritativeFrame,
        snapshot.frame,
      );
    }
    remoteInterpolator.push(
      snapshot.players.filter((player) => player.playerId !== profile.playerId),
      performance.now(),
    );
    const local = snapshot.players.find(
      (player) => player.playerId === profile.playerId,
    );
    if (local !== undefined) {
      prediction.reconcile(local.acknowledgedInputSequence, local);
    }
    status.textContent = `${snapshot.phase} · frame ${snapshot.frame}`;
    renderer.render(snapshot);
    if (snapshot.phase === "finished") {
      if (!completedAudioPlayed) {
        audio.playEvents([SoundEvent.LevelComplete]);
        completedAudioPlayed = true;
      }
      dispose();
      window.setTimeout(() => {
        void renderLobby(mount, userAssetBundle);
      }, 1500);
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "screenshot",
          protocolVersion: multiplayerProtocolVersion,
          gameId,
          pngDataUrl: renderer.canvas.toDataURL("image/png"),
        }),
      );
    }
  }
  socket.addEventListener("message", (event) => {
    const message: unknown = JSON.parse(String(event.data));
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      typeof message.type !== "string"
    ) {
      return;
    }
    if (
      message.type === "game-chat" &&
      "gameId" in message &&
      message.gameId === gameId
    ) {
      void refreshGameChat();
      return;
    }
    if (
      message.type !== "snapshots" ||
      !("snapshots" in message) ||
      !Array.isArray(message.snapshots)
    ) {
      return;
    }
    const snapshot = message.snapshots.find(
      (candidate): candidate is GameSnapshot =>
        isGameSnapshot(candidate) && candidate.gameId === gameId,
    );
    if (snapshot !== undefined) {
      displaySnapshot(snapshot);
    }
  });
  function sendInput(): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    sequence += 1;
    const commandResult = makeSimulationInputCommand(
      held.has("ArrowLeft")
        ? "left"
        : held.has("ArrowRight")
          ? "right"
          : "neutral",
      held.has("Space") || held.has("ArrowUp"),
      held.has("ShiftLeft") || held.has("ShiftRight"),
      held.has("KeyX"),
      held.has("ArrowUp"),
      held.has("ArrowDown"),
    );
    if (!commandResult.ok) {
      throw new Error(
        commandResult.errors.map((error) => error.message).join(" "),
      );
    }
    const priorPrediction = prediction.snapshot();
    const predicted = prediction.submit(sequence, commandResult.value);
    audio.playEvents(
      resolveSoundEvents(priorPrediction.state, predicted.state),
    );
    socket.send(
      JSON.stringify({
        type: "input",
        protocolVersion: multiplayerProtocolVersion,
        sequence,
        // Sequences order messages; the server's clock is the separate frame
        // namespace. Tagging input with the latest observed server frame makes
        // it immediately consumable instead of deferring it behind an unrelated
        // client message count.
        intendedFrame: latestAuthoritativeFrame,
        horizontal: commandResult.value.horizontal,
        jumpPressed: commandResult.value.jumpPressed,
        runHeld: commandResult.value.runHeld,
        firePressed: commandResult.value.firePressed,
        upHeld: commandResult.value.upHeld,
        downHeld: commandResult.value.downHeld,
      }),
    );
  }
  const keydown = (event: KeyboardEvent) => {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Space",
        "ShiftLeft",
        "ShiftRight",
        "KeyX",
      ].includes(event.code)
    ) {
      event.preventDefault();
      held.add(event.code);
      sendInput();
    }
  };
  const keyup = (event: KeyboardEvent) => {
    if (!held.has(event.code)) {
      return;
    }
    held.delete(event.code);
    sendInput();
  };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  const snapshotInterval = window.setInterval(() => void update(), 50);
  const chatInterval = window.setInterval(() => void refreshGameChat(), 1000);
  async function update(): Promise<void> {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        return;
      }
      const snapshot = await requestJson<GameSnapshot>(
        `/games/${gameId}/snapshot`,
      );
      displaySnapshot(snapshot);
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Game connection failed.";
      dispose();
    }
  }
  void update();
  void refreshGameChat();
  window.addEventListener(
    "hashchange",
    () => {
      dispose();
    },
    { once: true },
  );
}

export async function renderMultiplayerUi(
  mount: HTMLElement,
  userAssetBundle: UserAssetBundle,
): Promise<void> {
  try {
    await renderLobby(mount, userAssetBundle);
  } catch {
    mount.replaceChildren();
    const panel = makePanel();
    const heading = document.createElement("h1");
    heading.textContent = "Trusted friends multiplayer";
    const password = document.createElement("input");
    password.type = "password";
    password.setAttribute("aria-label", "Server password");
    const error = document.createElement("p");
    panel.append(
      heading,
      password,
      error,
      makeButton("Enter lobby", async () => {
        try {
          await requestJson("/login", {
            method: "POST",
            body: JSON.stringify({ password: password.value }),
          });
          await renderLobby(mount, userAssetBundle);
        } catch (reason) {
          error.textContent =
            reason instanceof Error ? reason.message : "Login failed.";
        }
      }),
    );
    mount.append(panel);
    await appendSemanticLayout(panel);
  }
}

export async function renderMultiplayerAdminUi(
  mount: HTMLElement,
): Promise<void> {
  async function renderDashboard(): Promise<void> {
    const debug = await requestJson<{
      readonly activeSessionCount: number;
      readonly games: readonly GameSummary[];
      readonly snapshots: readonly GameSnapshot[];
      readonly transport: {
        readonly snapshotBroadcastCount: number;
        readonly lastSnapshotBroadcastMilliseconds?: number;
        readonly configuredSnapshotDelayMilliseconds: number;
        readonly protocolErrorCount: number;
      };
    }>("/admin/debug");
    mount.replaceChildren();
    const panel = makePanel();
    panel.append(
      Object.assign(document.createElement("h1"), {
        textContent: "Multiplayer administration",
      }),
    );
    panel.append(
      Object.assign(document.createElement("p"), {
        textContent: `Snapshots: ${debug.transport.snapshotBroadcastCount} · delay ${debug.transport.configuredSnapshotDelayMilliseconds} ms · protocol errors ${debug.transport.protocolErrorCount}`,
      }),
    );
    panel.append(
      Object.assign(document.createElement("p"), {
        textContent: `Active sessions: ${debug.activeSessionCount}`,
      }),
    );
    panel.append(
      makeButton("Expire all player sessions", async () => {
        await requestJson("/admin/expire-sessions", { method: "POST" });
        await renderDashboard();
      }),
    );
    for (const game of debug.games) {
      const section = document.createElement("section");
      section.append(
        Object.assign(document.createElement("h2"), {
          textContent: `${game.gameId} · ${game.phase}`,
        }),
      );
      for (const action of ["pause", "step", "resume"] as const) {
        section.append(
          makeButton(action, async () => {
            await requestJson(`/admin/games/${game.gameId}/${action}`, {
              method: "POST",
            });
            await renderDashboard();
          }),
        );
      }
      const snapshot = debug.snapshots.find(
        (candidate) => candidate.gameId === game.gameId,
      );
      for (const player of snapshot?.players ?? []) {
        section.append(
          makeButton(`Boot ${player.nickname}`, async () => {
            await requestJson("/admin/boot-player", {
              method: "POST",
              body: JSON.stringify({ playerId: player.playerId }),
            });
            await renderDashboard();
          }),
        );
      }
      const screenshot = document.createElement("img");
      screenshot.alt = `Latest screenshot for ${game.gameId}`;
      const screenshotResponse = await requestJson<{
        readonly pngDataUrl?: string;
      }>(`/admin/games/${game.gameId}/screenshot`);
      if (screenshotResponse.pngDataUrl !== undefined) {
        screenshot.src = screenshotResponse.pngDataUrl;
        screenshot.style.maxWidth = "100%";
        section.append(screenshot);
      }
      panel.append(section);
    }
    mount.append(panel);
    void appendSemanticLayout(panel);
  }
  try {
    await renderDashboard();
  } catch {
    mount.replaceChildren();
    const panel = makePanel();
    const password = document.createElement("input");
    password.type = "password";
    password.setAttribute("aria-label", "Administrator password");
    const error = document.createElement("p");
    panel.append(
      Object.assign(document.createElement("h1"), {
        textContent: "Administrator login",
      }),
      password,
      error,
      makeButton("Enter administration", async () => {
        try {
          await requestJson("/admin/login", {
            method: "POST",
            body: JSON.stringify({ password: password.value }),
          });
          await renderDashboard();
        } catch (reason) {
          error.textContent =
            reason instanceof Error
              ? reason.message
              : "Administrator login failed.";
        }
      }),
    );
    mount.append(panel);
    void appendSemanticLayout(panel, "/layout?screen=admin");
  }
}
import { makeSimulationInputCommand } from "../engine/simulation/input-command";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeInitialSimulationState } from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
import {
  resolveSoundEvents,
  SoundEvent,
} from "../engine/simulation/sound-events";
import { makeClientPrediction } from "../multiplayer/client-prediction";
import { requireBundledMultiplayerLevel } from "../multiplayer/bundled-levels";
import { makeRemotePlayerInterpolator } from "../multiplayer/remote-interpolation";
import { multiplayerProtocolVersion } from "../multiplayer/protocol";
import type { MultiplayerRenderedSnapshot } from "../multiplayer/rendered-snapshot";
import type { SemanticUiNode } from "../multiplayer/semantic-ui";
import { makeMultiplayerPhaserRenderer } from "./multiplayer-phaser-renderer";
import { GameAudio } from "./game-audio";
import type { UserAssetBundle } from "./user-asset-loader";

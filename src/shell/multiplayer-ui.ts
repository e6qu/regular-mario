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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGameSnapshot(value: unknown): value is GameSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return (
    typeof record["gameId"] === "string" &&
    typeof record["snapshotSequence"] === "number" &&
    typeof record["levelId"] === "string" &&
    typeof record["cameraLeftPixels"] === "number"
  );
}

const multiplayerApiPrefix = "/api";

const debugScreenshotWidthPixels = 320;
const debugScreenshotHeightPixels = 180;
const multiplayerClientCameraWidthPixels = 256;
const multiplayerCameraSmoothingPerAnimationFrame = 0.18;

function makeDiagnosticScreenshot(source: HTMLCanvasElement): string {
  const diagnostic = document.createElement("canvas");
  diagnostic.width = debugScreenshotWidthPixels;
  diagnostic.height = debugScreenshotHeightPixels;
  const context = diagnostic.getContext("2d");
  if (context === null) {
    throw new Error("Browser cannot create the multiplayer diagnostic canvas.");
  }
  context.drawImage(
    source,
    0,
    0,
    debugScreenshotWidthPixels,
    debugScreenshotHeightPixels,
  );
  return diagnostic.toDataURL("image/png");
}

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
    .multiplayer-game-shell { position: relative; height: 100vh; min-height: 0; overflow: hidden; background: #172033; }
    .multiplayer-game-host { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: hidden; }
    .multiplayer-game-host canvas { display: block; }
    .multiplayer-game-panel { position: absolute; z-index: 2; top: 0; right: 0; width: min(340px, 92vw); height: 100vh; box-sizing: border-box;
      overflow: auto; margin: 0; border-width: 0 0 0 5px; box-shadow: none; background: #f5f7fb; transition: transform 120ms ease-out; }
    .multiplayer-game-shell[data-controls-open=false] .multiplayer-game-panel { visibility: hidden; transform: translateX(100%); pointer-events: none; }
    .multiplayer-game-shell[data-game-phase=playing] .multiplayer-game-panel,
    .multiplayer-game-shell[data-game-phase=paused] .multiplayer-game-panel,
    .multiplayer-game-shell[data-game-phase=finished] .multiplayer-game-panel { display: none; }
    /* Waiting is a game room, not a covered or empty game canvas. The renderer
       stays mounted for the authoritative transition, but is hidden until the
       server actually starts play. */
    .multiplayer-game-shell[data-game-phase=waiting] { min-height: 100vh; background: linear-gradient(#8ed4ea 0 22%, #dff4ee 22% 100%); }
    .multiplayer-game-shell[data-game-phase=waiting] .multiplayer-game-host { visibility: hidden; pointer-events: none; }
    .multiplayer-game-shell[data-game-phase=waiting] .multiplayer-game-panel { inset: 0; width: 100%; max-width: none; height: 100%; border: 0; display: grid; align-content: center; justify-items: center; text-align: left; background: transparent; }
    .multiplayer-game-shell[data-game-phase=waiting] .multiplayer-game-panel > * { width: min(760px, calc(100vw - 40px)); box-sizing: border-box; }
    .multiplayer-game-shell[data-game-phase=playing] .multiplayer-game-room-only,
    .multiplayer-game-shell[data-game-phase=paused] .multiplayer-game-room-only,
    .multiplayer-game-shell[data-game-phase=finished] .multiplayer-game-room-only { display: none; }
    .multiplayer-game-room { padding: clamp(20px, 5vw, 52px); border: 5px solid #172033; background: #f5f7fb; box-shadow: 9px 9px 0 #285a37; }
    .multiplayer-game-room__eyebrow { margin: 0 0 8px; color: #285a37; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .multiplayer-game-room__title { margin-bottom: 4px; }
    .multiplayer-game-room__status { margin: 0 0 20px; font-weight: 800; }
    .multiplayer-game-room__actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .multiplayer-game-room__actions button { margin: 0; }
    .multiplayer-game-room__chat { margin: 18px 0 0; padding: 14px; border: 3px solid #172033; background: #eaf0f7; }
    .multiplayer-game-room__chat h2 { margin: 0 0 8px; font-size: 1.05rem; }
    .multiplayer-game-room__chat [role=log] { min-height: 7em; max-height: 30vh; overflow-y: auto; white-space: pre-wrap; padding: 10px; border: 2px solid #172033; background: #fffef6; line-height: 1.45; }
    .multiplayer-game-room__chat-row { display: flex; gap: 8px; align-items: center; }
    .multiplayer-game-room__chat-row textarea { flex: 1; min-width: 0; min-height: 2.8em; resize: vertical; font: inherit; }
    .multiplayer-game-chat-overlay { position: absolute; z-index: 3; left: 18px; bottom: 18px; width: min(430px, calc(100vw - 36px)); margin: 0; visibility: hidden; transform: translateY(12px); transition: opacity 100ms ease-out, transform 100ms ease-out; opacity: 0; }
    .multiplayer-game-shell[data-chat-open=true] .multiplayer-game-chat-overlay { visibility: visible; transform: translateY(0); opacity: 1; }
    .multiplayer-game-chat-feed { position: absolute; z-index: 2; left: 18px; bottom: 18px; width: min(430px, calc(100vw - 36px)); display: grid; gap: 6px; pointer-events: none; }
    .multiplayer-game-chat-feed p { margin: 0; padding: 7px 10px; color: #fffef6; background: rgb(23 32 51 / 72%); border-left: 3px solid #ffd54a; font: 700 14px/1.35 monospace; text-shadow: 1px 1px #172033; }
    .multiplayer-game-shell[data-chat-open=true] .multiplayer-game-chat-feed { visibility: hidden; }
    .multiplayer-game-shell[data-game-phase=playing] .multiplayer-game-room-only { display: none; }
    .multiplayer-game-shell[data-game-phase=waiting] .multiplayer-play-controls-only { display: none; }
    @media (max-width: 620px) { .multiplayer-panel { margin: 8px; padding: 14px; box-shadow: 5px 5px 0 #285a37; }
      .multiplayer-game-shell { height: 100vh; min-height: 0; }
      .multiplayer-game-panel { width: min(100%, 420px); border-width: 0 0 0 5px; } }
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
      readonly activeGame: GameSummary | undefined;
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
  // A server restart ends games, but an ordinary browser refresh must resume
  // the player's one active game. Rendering a lobby in that state presents
  // actions which the server must reject, making the account look usable while
  // every create/join attempt fails.
  if (lobby.activeGame !== undefined) {
    renderGame(
      mount,
      lobby.profile,
      lobby.activeGame.gameId,
      lobby.activeGame.levelId,
      lobby.activeGame.creator.playerId,
      userAssetBundle,
    );
    return;
  }
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
      // The profile mutation refreshes all lobby data. Do not leave the old
      // level selector live during that refresh: otherwise a quick select and
      // create can target a newly-mounted selector whose default differs from
      // the one the player saw. The server remains authoritative, while this
      // makes the browser action boundary atomic and visible.
      panel.setAttribute("aria-busy", "true");
      panel.style.pointerEvents = "none";
      try {
        await requestJson("/profile", {
          method: "PATCH",
          body: JSON.stringify({
            nickname: nickname.value,
            avatarId: avatar.value,
          }),
        });
        await renderLobby(mount, userAssetBundle);
      } catch (reason) {
        panel.removeAttribute("aria-busy");
        panel.style.removeProperty("pointer-events");
        throw reason;
      }
    }),
  );
  panel.append(profileForm);
  const actionError = document.createElement("p");
  actionError.setAttribute("role", "alert");

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
    try {
      const created = await requestJson<{ readonly game: GameSummary }>(
        "/games",
        {
          method: "POST",
          body: JSON.stringify({
            levelId: levelSelect.value,
            mode: modeSelect.value,
          }),
        },
      );
      // A lobby create is one user action: create the reserved public game and
      // immediately begin it. Friends may join a game already in progress.
      const started = await requestJson<{ readonly game: GameSummary }>(
        `/games/${created.game.gameId}/start`,
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
    } catch (reason) {
      actionError.textContent =
        reason instanceof Error ? reason.message : "Could not create game.";
    }
  });
  panel.append(
    "Level ",
    levelSelect,
    " Mode ",
    modeSelect,
    create,
    actionError,
  );
  const games = document.createElement("section");
  const gamesHeading = document.createElement("h2");
  gamesHeading.textContent = "Public games";
  games.append(gamesHeading);
  for (const game of lobby.games) {
    const row = document.createElement("div");
    row.textContent = `${game.creator.nickname} · ${game.levelId} · ${game.mode} · ${game.phase} · ${game.playerCount}/${game.maximumPlayerCount}`;
    row.append(
      makeButton("Join", async () => {
        try {
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
        } catch (reason) {
          actionError.textContent =
            reason instanceof Error ? reason.message : "Could not join game.";
        }
      }),
    );
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
  gameShell.setAttribute("data-controls-open", "true");
  gameShell.setAttribute("data-game-phase", "waiting");
  gameShell.setAttribute("data-chat-open", "false");
  const setControlsOpen = (next: boolean): void => {
    gameShell.setAttribute("data-controls-open", String(next));
  };
  const title = document.createElement("h1");
  title.textContent = `Game ${gameId}`;
  title.className = "multiplayer-game-room__title";
  const status = document.createElement("p");
  status.className = "multiplayer-game-room__status";
  const gameHost = document.createElement("div");
  gameHost.className = "multiplayer-game-host";
  let currentLevelId = levelId;
  const chatLogs: HTMLDivElement[] = [];
  const chatInputs: HTMLTextAreaElement[] = [];
  const seenGameChatMessages = new Set<string>();
  const gameChatFeed = document.createElement("div");
  gameChatFeed.className = "multiplayer-game-chat-feed";
  gameChatFeed.setAttribute("aria-live", "polite");
  let chatEditing = false;
  const makeChat = (inputLabel: string): HTMLElement => {
    const chat = document.createElement("section");
    chat.className = "multiplayer-game-room__chat";
    const heading = document.createElement("h2");
    heading.textContent = "Game chat";
    const log = document.createElement("div");
    log.setAttribute("role", "log");
    log.setAttribute("aria-label", "Game chat");
    log.textContent = "No messages yet.";
    chatLogs.push(log);
    const input = document.createElement("textarea");
    input.maxLength = 256;
    input.rows = 2;
    input.placeholder = "Write a message…";
    input.setAttribute("aria-label", inputLabel);
    chatInputs.push(input);
    input.addEventListener("focus", () => {
      chatEditing = true;
      gameShell.setAttribute("data-chat-open", "true");
    });
    input.addEventListener("blur", () => {
      chatEditing = false;
      gameShell.setAttribute("data-chat-open", "false");
    });
    const row = document.createElement("form");
    row.className = "multiplayer-game-room__chat-row";
    const send = async (): Promise<void> => {
      if (input.value.trim().length === 0) {
        return;
      }
      await requestJson(`/games/${gameId}/chat`, {
        method: "POST",
        body: JSON.stringify({ text: input.value }),
      });
      input.value = "";
      await refreshGameChat();
    };
    row.addEventListener("submit", (event) => {
      event.preventDefault();
      void send();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void send();
      }
    });
    row.append(input, makeButton("Send game chat", send));
    chat.append(heading, log, row);
    return chat;
  };
  const gameActionError = document.createElement("div");
  gameActionError.setAttribute("role", "alert");
  const waitingRoom = document.createElement("section");
  waitingRoom.className = "multiplayer-game-room multiplayer-game-room-only";
  waitingRoom.setAttribute("aria-label", "Game room");
  const eyebrow = document.createElement("p");
  eyebrow.className = "multiplayer-game-room__eyebrow";
  eyebrow.textContent = "Game room";
  const waitingDescription = document.createElement("p");
  waitingDescription.textContent =
    "Invite friends, chat, then begin when the party is ready.";
  const roomActions = document.createElement("div");
  roomActions.className = "multiplayer-game-room__actions";
  let startGameButton: HTMLButtonElement | undefined;
  panel.classList.add("multiplayer-game-panel");
  const leaveGame = (): HTMLButtonElement =>
    makeButton("Leave game", async () => {
      await requestJson("/game/leave", { method: "POST" });
      disposeView();
      await renderLobby(mount, userAssetBundle);
    });
  const revive = (): HTMLButtonElement =>
    makeButton("Revive at party checkpoint", async () => {
      await requestJson(`/game/revive`, { method: "POST" });
    });
  const pause = (): HTMLButtonElement =>
    makeButton("Pause game", async () => {
      await requestJson(`/game/pause`, { method: "POST" });
    });
  const endGame = (): HTMLButtonElement =>
    makeButton("End game", async () => {
      await requestJson(`/games/${gameId}/end`, { method: "POST" });
      disposeView();
      await renderLobby(mount, userAssetBundle);
    });
  waitingRoom.append(
    eyebrow,
    title,
    status,
    waitingDescription,
    roomActions,
    gameActionError,
    makeChat("Game chat message"),
  );
  panel.append(waitingRoom);
  if (creatorPlayerId === profile.playerId) {
    startGameButton = makeButton("Start game", async () => {
      try {
        await requestJson(`/games/${gameId}/start`, { method: "POST" });
      } catch (reason) {
        gameActionError.textContent =
          reason instanceof Error ? reason.message : "Could not start game.";
      }
    });
    roomActions.append(startGameButton, endGame());
  }
  roomActions.append(leaveGame());
  const playControls = document.createElement("section");
  playControls.className = "multiplayer-play-controls-only";
  const playControlsTitle = document.createElement("h1");
  playControlsTitle.textContent = `Game ${gameId}`;
  const playStatus = document.createElement("p");
  const playHint = document.createElement("p");
  playHint.textContent = "Press M during play to close these controls.";
  const reviveButton = revive();
  const pauseButton = pause();
  playControls.append(
    playControlsTitle,
    playStatus,
    playHint,
    reviveButton,
    pauseButton,
    leaveGame(),
  );
  if (creatorPlayerId === profile.playerId) {
    playControls.append(endGame());
  }
  // Gameplay never mounts a menu drawer. Keyboard actions own the compact
  // multiplayer controls: Escape leave, P pause/resume, T chat, R revive.
  const gameChatOverlay = makeChat("Game chat message");
  gameChatOverlay.classList.add("multiplayer-game-chat-overlay");
  gameShell.append(gameHost, gameChatFeed, panel, gameChatOverlay);
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
  function makePrediction(nextLevelId: string, localPlayerSlot: number) {
    const levelInput = userAssetBundle.levels.get(nextLevelId)?.levelSpecInput;
    if (levelInput === undefined) {
      throw new Error(
        `Authoritative multiplayer level "${nextLevelId}" is absent from the loaded content bundle.`,
      );
    }
    const parsedLevel = makeLevelSpec(levelInput);
    if (!parsedLevel.ok) {
      throw new Error(
        `Authoritative multiplayer level "${nextLevelId}" did not validate.`,
      );
    }
    const initialPredictionState = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      parsedLevel.value,
      initialMovementConstants,
    );
    if (!initialPredictionState.ok) {
      throw new Error("Multiplayer prediction could not initialise.");
    }
    return makeClientPrediction(
      initialPredictionState.value,
      parsedLevel.value,
      initialMovementConstants,
      localPlayerSlot,
    );
  }
  let localPlayerSlot: number | undefined;
  let prediction: ReturnType<typeof makePrediction> | undefined;
  // A delayed stream can contain many new authoritative frames before the
  // server has consumed this browser's newest input. Reconciliation is safe
  // only when its acknowledgement advances; otherwise rewinding to each old
  // snapshot defeats the client-side fixed-step simulation.
  let lastReconciledInputSequence = -1;
  const audio = new GameAudio();
  const remoteInterpolator = makeRemotePlayerInterpolator(100);
  let completedAudioPlayed = false;
  let latestAuthoritativeFrame = 0;
  let latestAuthoritativeSnapshot: GameSnapshot | undefined;
  let lastPresentedPhase: GameSnapshot["phase"] | undefined;
  let completionConfirmationInFlight = false;
  let initialDebugScreenshotSubmitted = false;
  let sentInputCount = 0;
  const snapshotsByGameId = new Map<string, GameSnapshot>();
  let presentationAnimationFrame: number | undefined;
  let latestPredictionCommand: SimulationInputCommand | undefined;
  let lastPredictionAnimationMilliseconds = performance.now();
  let predictionFrameRemainderMilliseconds = 0;
  let clientCameraLeftPixels: number | undefined;
  const socketUrl = new URL(
    `${multiplayerApiPrefix.replace(/^\//, "")}/socket`,
    window.location.href,
  );
  socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(socketUrl);
  let socketLifecycle = "connecting";
  const recordSocketLifecycle = (): void => {
    gameShell.setAttribute("data-debug-socket-lifecycle", socketLifecycle);
    gameShell.setAttribute(
      "data-debug-socket-ready-state",
      String(socket.readyState),
    );
  };
  recordSocketLifecycle();
  let disposed = false;
  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    window.clearInterval(snapshotInterval);
    window.clearInterval(chatInterval);
    window.clearInterval(inputHeartbeatInterval);
    if (presentationAnimationFrame !== undefined) {
      window.cancelAnimationFrame(presentationAnimationFrame);
    }
    socket.close();
    renderer.destroy();
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("keydown", escapeLeave);
  }
  disposeView = dispose;
  async function leaveCurrentGame(): Promise<void> {
    await requestJson("/game/leave", { method: "POST" });
    dispose();
    await renderLobby(mount, userAssetBundle);
  }
  const escapeLeave = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || disposed) {
      return;
    }
    event.preventDefault();
    if (chatEditing) {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
      return;
    }
    void leaveCurrentGame();
  };
  window.addEventListener("keydown", escapeLeave);
  function renderPresentation(): void {
    const snapshot = latestAuthoritativeSnapshot;
    if (snapshot === undefined || disposed) {
      return;
    }
    // A paused/finished server receipt is a named authoritative frame used by
    // debugging and parity tooling. Do not immediately cover it with a stale
    // local prediction; there is no live input to hide in those phases.
    if (snapshot.phase !== "playing") {
      return;
    }
    if (prediction === undefined || localPlayerSlot === undefined) {
      return;
    }
    const predictedRuntime =
      prediction.snapshot().state.players[localPlayerSlot];
    if (predictedRuntime === undefined) {
      throw new Error("Predicted state is missing the local player.");
    }
    const predictedPlayer = predictedRuntime.player;
    // The prediction advances the exact deterministic world state, not just
    // the local avatar. Present it each browser frame so coins, enemies and
    // other simulation-driven actors move at 60 Hz; 20 Hz server receipts
    // remain the reconciliation baseline.
    const targetCameraLeftPixels = Math.max(
      0,
      Number(predictedPlayer.position.x) -
        multiplayerClientCameraWidthPixels / 2,
    );
    clientCameraLeftPixels =
      clientCameraLeftPixels === undefined
        ? targetCameraLeftPixels
        : clientCameraLeftPixels +
          (targetCameraLeftPixels - clientCameraLeftPixels) *
            multiplayerCameraSmoothingPerAnimationFrame;
    renderer.presentPredictedSimulationState(
      prediction.snapshot().state,
      clientCameraLeftPixels,
    );
    const interpolatedRemotePlayers = remoteInterpolator.positions(
      performance.now(),
    );
    const positions = snapshot.players.map((player) => {
      const position =
        player.playerId === profile.playerId
          ? predictedPlayer.position
          : interpolatedRemotePlayers.get(player.playerId);
      return position === undefined
        ? { x: player.x, y: player.y }
        : { x: Number(position.x), y: Number(position.y) };
    });
    renderer.presentPlayerPositions(positions);
  }
  function animatePresentation(nowMilliseconds: number): void {
    const elapsedMilliseconds = Math.min(
      Math.max(0, nowMilliseconds - lastPredictionAnimationMilliseconds),
      250,
    );
    lastPredictionAnimationMilliseconds = nowMilliseconds;
    predictionFrameRemainderMilliseconds += elapsedMilliseconds;
    if (
      prediction !== undefined &&
      latestPredictionCommand !== undefined &&
      latestAuthoritativeSnapshot?.phase === "playing"
    ) {
      while (
        predictionFrameRemainderMilliseconds >=
        nominalSixtyHertzFrameDurationMilliseconds
      ) {
        predictionFrameRemainderMilliseconds -=
          nominalSixtyHertzFrameDurationMilliseconds;
        const before = prediction.snapshot();
        const advanced = prediction.advance(latestPredictionCommand);
        audio.playEvents(resolveSoundEvents(before.state, advanced.state));
      }
    } else {
      predictionFrameRemainderMilliseconds = 0;
    }
    renderPresentation();
    if (!disposed) {
      presentationAnimationFrame =
        window.requestAnimationFrame(animatePresentation);
    }
  }
  async function refreshGameChat(): Promise<void> {
    const response = await requestJson<{
      readonly messages: readonly {
        readonly nickname: string;
        readonly text: string;
      }[];
    }>(`/games/${gameId}/chat`);
    if (!disposed) {
      const rendered = response.messages
        .map((message) => `${message.nickname}: ${message.text}`)
        .join("\n");
      for (const chatLog of chatLogs) {
        chatLog.textContent = rendered === "" ? "No messages yet." : rendered;
      }
      response.messages.forEach((message, index) => {
        const messageKey = `${String(index)}:${message.nickname}:${message.text}`;
        if (seenGameChatMessages.has(messageKey)) {
          return;
        }
        seenGameChatMessages.add(messageKey);
        const line = document.createElement("p");
        line.textContent = `${message.nickname}: ${message.text}`;
        gameChatFeed.append(line);
        window.setTimeout(() => line.remove(), 10_000);
      });
    }
  }
  function displaySnapshot(snapshot: GameSnapshot): void {
    // A course handoff emits a new-level frame with a fresh frame clock. A
    // delayed `finished` state for the prior course must never dispose this
    // client after it has already entered that new course.
    if (snapshot.levelId !== currentLevelId && snapshot.phase === "finished") {
      return;
    }
    const known = snapshotsByGameId.get(snapshot.gameId);
    if (
      known !== undefined &&
      snapshot.snapshotSequence <= known.snapshotSequence
    ) {
      return;
    }
    snapshotsByGameId.set(snapshot.gameId, snapshot);
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
      prediction = undefined;
      localPlayerSlot = undefined;
      lastReconciledInputSequence = -1;
      title.textContent = `Game ${gameId} · ${currentLevelId}`;
      playControlsTitle.textContent = `Game ${gameId} · ${currentLevelId}`;
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
      const requiresPredictionBaseline =
        localPlayerSlot !== local.slot ||
        prediction === undefined ||
        prediction.snapshot().state.players.length !== snapshot.players.length;
      if (requiresPredictionBaseline) {
        localPlayerSlot = local.slot;
        prediction = makePrediction(currentLevelId, local.slot);
      }
      const activePrediction = prediction;
      if (activePrediction === undefined) {
        throw new Error("Multiplayer prediction was not initialised.");
      }
      const authoritativeState = decodeMultiplayerSimulationState(
        snapshot.simulationState,
      );
      if (
        requiresPredictionBaseline ||
        predictionRequiresLifecycleReconcile(
          activePrediction.snapshot().state,
          authoritativeState,
          local.slot,
        ) ||
        local.acknowledgedInputSequence > lastReconciledInputSequence
      ) {
        activePrediction.reconcileState(
          local.acknowledgedInputSequence,
          authoritativeState,
        );
        lastReconciledInputSequence = local.acknowledgedInputSequence;
        // The next animation-frame prediction begins from this exact server
        // state. It is then stepped locally at the same 60 Hz as the engine,
        // instead of visibly moving only at the 20 Hz snapshot cadence.
        predictionFrameRemainderMilliseconds = 0;
        lastPredictionAnimationMilliseconds = performance.now();
      }
      gameShell.setAttribute(
        "data-debug-last-acknowledged-input-sequence",
        String(local.acknowledgedInputSequence),
      );
    }
    gameShell.setAttribute(
      "data-debug-authoritative-frame",
      String(snapshot.frame),
    );
    const phaseText =
      snapshot.phase === "waiting"
        ? `Waiting for friends · ${snapshot.players.length}/16 players`
        : `${snapshot.phase} · frame ${snapshot.frame}`;
    status.textContent = phaseText;
    playStatus.textContent = `${snapshot.phase} · frame ${snapshot.frame}`;
    if (local?.spectator && snapshot.phase === "playing") {
      // Death must never trap a player behind the hidden game drawer. Leave
      // returns to the lobby, where the same running game can be joined again;
      // the authoritative runner places that new active player in the party's
      // current screen.
      setControlsOpen(true);
      playStatus.textContent =
        "spectating · revive at the party checkpoint or leave";
    }
    reviveButton.toggleAttribute(
      "hidden",
      !(local?.spectator === true && snapshot.phase === "playing"),
    );
    pauseButton.toggleAttribute("hidden", snapshot.phase !== "playing");
    gameShell.setAttribute("data-game-phase", snapshot.phase);
    if (snapshot.phase !== lastPresentedPhase) {
      setControlsOpen(snapshot.phase !== "playing");
      lastPresentedPhase = snapshot.phase;
    }
    startGameButton?.toggleAttribute("hidden", snapshot.phase !== "waiting");
    latestAuthoritativeSnapshot = snapshot;
    // Complete map/entity state is authoritative and changes at the network
    // cadence. Apply it once here; the animation loop below only supplies the
    // lightweight predicted/interpolated player transforms.
    renderer.render(snapshot);
    renderPresentation();
    if (snapshot.phase === "finished" && !completionConfirmationInFlight) {
      completionConfirmationInFlight = true;
      void confirmCompletedGame(snapshot);
    }
    // Preserve one diagnostic image for the admin surface without repeatedly
    // PNG-encoding a 1280×720 canvas on the gameplay/main thread. Repeated
    // readback and encoding caused visible input and audio stalls.
    if (
      socket.readyState === WebSocket.OPEN &&
      snapshot.phase === "playing" &&
      !initialDebugScreenshotSubmitted
    ) {
      initialDebugScreenshotSubmitted = true;
      socket.send(
        JSON.stringify({
          type: "screenshot",
          protocolVersion: multiplayerProtocolVersion,
          gameId,
          pngDataUrl: makeDiagnosticScreenshot(renderer.canvas),
        }),
      );
    }
  }
  async function confirmCompletedGame(
    finishedSnapshot: GameSnapshot,
  ): Promise<void> {
    try {
      const current = await requestJson<GameSnapshot>(
        `/games/${gameId}/snapshot`,
      );
      if (
        !disposed &&
        (current.phase !== "finished" ||
          current.levelId !== finishedSnapshot.levelId)
      ) {
        completionConfirmationInFlight = false;
        displaySnapshot(current);
        return;
      }
    } catch {
      // The final course is removed by the server after completion. Its missing
      // snapshot is the same confirmed terminal condition as `finished`.
    }
    if (disposed) {
      return;
    }
    if (!completedAudioPlayed) {
      audio.playEvents([SoundEvent.LevelComplete]);
      completedAudioPlayed = true;
    }
    dispose();
    window.setTimeout(() => {
      void renderLobby(mount, userAssetBundle);
    }, 1500);
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
    if (message.type === "error" && "error" in message) {
      gameActionError.textContent =
        typeof message.error === "string"
          ? message.error
          : "Multiplayer protocol rejected a message.";
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
    if (message.type === "state-keyframes") {
      if (!("snapshots" in message) || !Array.isArray(message.snapshots)) {
        return;
      }
      for (const candidate of message.snapshots) {
        if (!isGameSnapshot(candidate)) {
          continue;
        }
        if (candidate.gameId === gameId) {
          displaySnapshot(candidate);
        } else {
          snapshotsByGameId.set(candidate.gameId, candidate);
        }
      }
      return;
    }
    if (message.type !== "state-deltas" || !("deltas" in message)) {
      return;
    }
    if (!Array.isArray(message.deltas)) {
      return;
    }
    for (const candidate of message.deltas) {
      if (!isRecord(candidate)) {
        continue;
      }
      const deltaGameId = candidate["gameId"];
      const baselineFrame = candidate["baselineFrame"];
      const baselineSnapshotSequence = candidate["baselineSnapshotSequence"];
      const delta = candidate["delta"];
      if (
        typeof deltaGameId !== "string" ||
        typeof baselineFrame !== "number" ||
        typeof baselineSnapshotSequence !== "number" ||
        !isRecord(delta) ||
        !Array.isArray(delta["changes"])
      ) {
        continue;
      }
      const baseline = snapshotsByGameId.get(deltaGameId);
      if (
        baseline === undefined ||
        baseline.frame !== baselineFrame ||
        baseline.snapshotSequence !== baselineSnapshotSequence
      ) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "resync",
              protocolVersion: multiplayerProtocolVersion,
              gameId: deltaGameId,
            }),
          );
        }
        continue;
      }
      try {
        const snapshot = applyStateDelta(
          baseline,
          delta as unknown as StateDelta,
        );
        if (!isGameSnapshot(snapshot)) {
          throw new Error("State delta did not produce a game snapshot.");
        }
        snapshotsByGameId.set(deltaGameId, snapshot);
        if (deltaGameId === gameId) {
          displaySnapshot(snapshot);
        }
      } catch {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "resync",
              protocolVersion: multiplayerProtocolVersion,
              gameId: deltaGameId,
            }),
          );
        }
      }
    }
  });
  function currentHeldInputCommand(): SimulationInputCommand {
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
    return commandResult.value;
  }
  function sendInput(predictImmediately: boolean): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    sequence += 1;
    sentInputCount += 1;
    const command = currentHeldInputCommand();
    latestPredictionCommand = command;
    if (predictImmediately && prediction !== undefined) {
      const priorPrediction = prediction.snapshot();
      const predicted = prediction.submit(sequence, command);
      audio.playEvents(
        resolveSoundEvents(priorPrediction.state, predicted.state),
      );
    }
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
        horizontal: command.horizontal,
        jumpPressed: command.jumpPressed,
        runHeld: command.runHeld,
        firePressed: command.firePressed,
        upHeld: command.upHeld,
        downHeld: command.downHeld,
      }),
    );
    gameShell.setAttribute("data-debug-last-input-sequence", String(sequence));
    gameShell.setAttribute(
      "data-debug-last-input-intended-frame",
      String(latestAuthoritativeFrame),
    );
    gameShell.setAttribute(
      "data-debug-input-send-count",
      String(sentInputCount),
    );
    renderPresentation();
  }
  socket.addEventListener("open", () => {
    socketLifecycle = "open";
    recordSocketLifecycle();
    // A player can hold a key while the initial HTTP snapshot is visible but
    // before the WebSocket finishes connecting. Send that already-held state
    // on connect instead of leaving the authoritative game idle until another
    // physical key edge occurs.
    if (held.size > 0) {
      sendInput(true);
    }
  });
  socket.addEventListener("close", (event) => {
    socketLifecycle = `closed:${String(event.code)}`;
    recordSocketLifecycle();
  });
  socket.addEventListener("error", () => {
    socketLifecycle = "error";
    recordSocketLifecycle();
  });
  const keydown = (event: KeyboardEvent) => {
    if (
      event.code === "KeyP" &&
      !chatEditing &&
      (latestAuthoritativeSnapshot?.phase === "playing" ||
        latestAuthoritativeSnapshot?.phase === "paused")
    ) {
      event.preventDefault();
      void requestJson(
        latestAuthoritativeSnapshot.phase === "playing"
          ? "/game/pause"
          : "/game/resume",
        { method: "POST" },
      );
      return;
    }
    if (
      event.code === "KeyR" &&
      !chatEditing &&
      latestAuthoritativeSnapshot?.phase === "playing" &&
      latestAuthoritativeSnapshot.players.some(
        (player) => player.playerId === profile.playerId && player.spectator,
      )
    ) {
      event.preventDefault();
      void requestJson("/game/revive", { method: "POST" });
      return;
    }
    if (
      event.code === "KeyT" &&
      !chatEditing &&
      latestAuthoritativeSnapshot?.phase === "playing"
    ) {
      event.preventDefault();
      gameShell.setAttribute("data-chat-open", "true");
      chatInputs.at(-1)?.focus();
      return;
    }
    if (chatEditing) {
      return;
    }
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
      const wasHeld = held.has(event.code);
      held.add(event.code);
      sendInput(!wasHeld);
    }
  };
  const keyup = (event: KeyboardEvent) => {
    if (!held.has(event.code)) {
      return;
    }
    held.delete(event.code);
    sendInput(true);
  };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  presentationAnimationFrame =
    window.requestAnimationFrame(animatePresentation);
  const snapshotInterval = window.setInterval(() => void update(), 50);
  const chatInterval = window.setInterval(() => void refreshGameChat(), 1000);
  // Input edges make normal play responsive; this bounded heartbeat keeps a
  // long key hold alive through connection establishment and packet loss while
  // staying well below the authoritative 60 Hz simulation cadence.
  const inputHeartbeatInterval = window.setInterval(() => {
    if (held.size > 0) {
      sendInput(false);
    }
  }, 100);
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
    const loginForm = document.createElement("form");
    const password = document.createElement("input");
    password.type = "password";
    password.setAttribute("aria-label", "Server password");
    const error = document.createElement("p");
    const submitLogin = async (): Promise<void> => {
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
    };
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitLogin();
    });
    loginForm.append(password, makeButton("Enter lobby", submitLogin), error);
    panel.append(heading, loginForm);
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
import {
  makeSimulationInputCommand,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import { makeLevelSpec } from "../engine/domain/level-spec";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeInitialSimulationState } from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
import {
  resolveSoundEvents,
  SoundEvent,
} from "../engine/simulation/sound-events";
import {
  makeClientPrediction,
  predictionRequiresLifecycleReconcile,
} from "../multiplayer/client-prediction";
import { makeRemotePlayerInterpolator } from "../multiplayer/remote-interpolation";
import { multiplayerProtocolVersion } from "../multiplayer/protocol";
import type { MultiplayerRenderedSnapshot } from "../multiplayer/rendered-snapshot";
import type { SemanticUiNode } from "../multiplayer/semantic-ui";
import {
  applyStateDelta,
  type StateDelta,
} from "../multiplayer/state-transport";
import { decodeMultiplayerSimulationState } from "../multiplayer/simulation-wire";
import { makeMultiplayerPhaserRenderer } from "./multiplayer-phaser-renderer";
import { GameAudio } from "./game-audio";
import type { UserAssetBundle } from "./user-asset-loader";

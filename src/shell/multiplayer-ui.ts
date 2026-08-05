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
    .multiplayer-game-shell { position: relative; height: 100vh; min-height: 0; overflow: hidden; background: #172033; }
    .multiplayer-game-host { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: hidden; }
    .multiplayer-game-host canvas { display: block; }
    .multiplayer-game-panel { position: absolute; z-index: 2; top: 0; right: 0; width: min(340px, 92vw); height: 100vh; box-sizing: border-box;
      overflow: auto; margin: 0; border-width: 0 0 0 5px; box-shadow: none; background: #f5f7fb; transition: transform 120ms ease-out; }
    .multiplayer-game-shell[data-controls-open=false] .multiplayer-game-panel { transform: translateX(100%); pointer-events: none; }
    /* A waiting game is not yet playable. Present a deliberate full-viewport
       ready room instead of exposing a cropped game behind a permanent drawer.
       Once playing, the canvas owns every pixel and M opens the drawer. */
    .multiplayer-game-shell[data-game-phase=waiting] .multiplayer-game-panel { inset: 0; width: 100%; max-width: none; height: 100%; border: 0; display: grid; align-content: center; justify-items: center; text-align: center; }
    .multiplayer-game-shell[data-game-phase=waiting] .multiplayer-game-panel > * { max-width: min(640px, calc(100vw - 32px)); }
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
      // Enter the newly-created game from the authoritative response rather
      // than waiting for a second lobby request. This makes creation one
      // action: it reserves the player's only game slot and opens that game.
      const currentLobby = await requestJson<{
        readonly profile: PlayerProfile;
      }>("/lobby");
      renderGame(
        mount,
        currentLobby.profile,
        created.game.gameId,
        created.game.levelId,
        created.game.creator.playerId,
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
    if (
      game.creator.playerId === lobby.profile.playerId &&
      game.phase === "waiting"
    ) {
      row.append(
        makeButton("Start", async () => {
          try {
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
          } catch (reason) {
            actionError.textContent =
              reason instanceof Error
                ? reason.message
                : "Could not start game.";
          }
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
  gameShell.setAttribute("data-controls-open", "true");
  gameShell.setAttribute("data-game-phase", "waiting");
  let controlsOpen = true;
  const setControlsOpen = (next: boolean): void => {
    controlsOpen = next;
    gameShell.setAttribute("data-controls-open", String(next));
  };
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
  const gameActionError = document.createElement("div");
  gameActionError.setAttribute("role", "alert");
  let startGameButton: HTMLButtonElement | undefined;
  panel.classList.add("multiplayer-game-panel");
  panel.append(
    title,
    status,
    makeButton("Resume game", () => setControlsOpen(false)),
    Object.assign(document.createElement("div"), {
      textContent: "Press M during play to open these controls.",
    }),
    chatLog,
    chatInput,
  );
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
    startGameButton = makeButton("Start game", async () => {
      try {
        await requestJson(`/games/${gameId}/start`, { method: "POST" });
      } catch (reason) {
        gameActionError.textContent =
          reason instanceof Error ? reason.message : "Could not start game.";
      }
    });
    panel.append(
      startGameButton,
      makeButton("End game", async () => {
        await requestJson(`/games/${gameId}/end`, { method: "POST" });
        disposeView();
        await renderLobby(mount, userAssetBundle);
      }),
    );
    panel.append(gameActionError);
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
  function makePrediction(nextLevelId: string, localPlayerSlot: number) {
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
      localPlayerSlot,
    );
  }
  let localPlayerSlot: number | undefined;
  let prediction: ReturnType<typeof makePrediction> | undefined;
  const audio = new GameAudio();
  const remoteInterpolator = makeRemotePlayerInterpolator(100);
  let completedAudioPlayed = false;
  let latestAuthoritativeFrame = 0;
  let latestAuthoritativeSnapshot: GameSnapshot | undefined;
  let lastPresentedPhase: GameSnapshot["phase"] | undefined;
  let lastScreenshotSentAtMilliseconds = Number.NEGATIVE_INFINITY;
  let sentInputCount = 0;
  const snapshotsByGameId = new Map<string, GameSnapshot>();
  let presentationAnimationFrame: number | undefined;
  let latestPredictionCommand: SimulationInputCommand | undefined;
  let lastPredictionAnimationMilliseconds = performance.now();
  let predictionFrameRemainderMilliseconds = 0;
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
  }
  disposeView = dispose;
  function renderPresentation(): void {
    const snapshot = latestAuthoritativeSnapshot;
    if (snapshot === undefined || disposed) {
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
    const interpolatedRemotePlayers = remoteInterpolator.positions(
      performance.now(),
    );
    const state = decodeMultiplayerSimulationState(snapshot.simulationState);
    const players = state.players.map((runtime, slot) => {
      const player = snapshot.players[slot];
      if (player === undefined) {
        throw new Error(
          "Authoritative player metadata is missing a simulation slot.",
        );
      }
      const position =
        player.playerId === profile.playerId
          ? predictedPlayer.position
          : interpolatedRemotePlayers.get(player.playerId);
      if (position === undefined) {
        return runtime;
      }
      return {
        ...runtime,
        player: {
          ...runtime.player,
          position: {
            x: requireSimulationPixelPosition(
              Number(position.x),
              "multiplayer.presentation.player.x",
            ),
            y: requireSimulationPixelPosition(
              Number(position.y),
              "multiplayer.presentation.player.y",
            ),
          },
        },
      };
    });
    const renderedPlayers = snapshot.players.map((player) => {
      const position =
        player.playerId === profile.playerId
          ? predictedPlayer.position
          : interpolatedRemotePlayers.get(player.playerId);
      return position === undefined
        ? player
        : { ...player, x: Number(position.x), y: Number(position.y) };
    });
    const primaryRuntime = players[0];
    if (primaryRuntime === undefined) {
      throw new Error("Authoritative multiplayer state has no primary player.");
    }
    renderer.render({
      ...snapshot,
      players: renderedPlayers,
      simulationState: encodeMultiplayerSimulationState({
        ...state,
        players: [primaryRuntime, ...players.slice(1)],
      }),
    });
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
      chatLog.textContent = response.messages
        .map((message) => `${message.nickname}: ${message.text}`)
        .join("\n");
    }
  }
  function displaySnapshot(snapshot: GameSnapshot): void {
    const known = snapshotsByGameId.get(snapshot.gameId);
    if (
      known !== undefined &&
      known.levelId === snapshot.levelId &&
      snapshot.frame < known.frame
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
      if (localPlayerSlot !== local.slot || prediction === undefined) {
        localPlayerSlot = local.slot;
        prediction = makePrediction(currentLevelId, local.slot);
      }
      prediction.reconcileState(
        local.acknowledgedInputSequence,
        decodeMultiplayerSimulationState(snapshot.simulationState),
      );
      // The next animation-frame prediction begins from this exact server
      // state. It is then stepped locally at the same 60 Hz as the engine,
      // instead of visibly moving only at the 20 Hz snapshot cadence.
      predictionFrameRemainderMilliseconds = 0;
      lastPredictionAnimationMilliseconds = performance.now();
      gameShell.setAttribute(
        "data-debug-last-acknowledged-input-sequence",
        String(local.acknowledgedInputSequence),
      );
    }
    gameShell.setAttribute(
      "data-debug-authoritative-frame",
      String(snapshot.frame),
    );
    status.textContent = `${snapshot.phase} · frame ${snapshot.frame}`;
    gameShell.setAttribute("data-game-phase", snapshot.phase);
    if (snapshot.phase !== lastPresentedPhase) {
      setControlsOpen(snapshot.phase !== "playing");
      lastPresentedPhase = snapshot.phase;
    }
    startGameButton?.toggleAttribute("hidden", snapshot.phase !== "waiting");
    latestAuthoritativeSnapshot = snapshot;
    renderPresentation();
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
    // Retain one current agent-debug image without turning the gameplay socket
    // into a continuous PNG upload channel. At 20 Hz, four browsers would
    // otherwise send 80 full canvas images per second and delay real input.
    const nowMilliseconds = performance.now();
    if (
      socket.readyState === WebSocket.OPEN &&
      nowMilliseconds - lastScreenshotSentAtMilliseconds >= 1_000
    ) {
      lastScreenshotSentAtMilliseconds = nowMilliseconds;
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
        snapshotsByGameId.set(candidate.gameId, candidate);
        if (candidate.gameId === gameId) {
          displaySnapshot(candidate);
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
      const delta = candidate["delta"];
      if (
        typeof deltaGameId !== "string" ||
        typeof baselineFrame !== "number" ||
        !isRecord(delta) ||
        !Array.isArray(delta["changes"])
      ) {
        continue;
      }
      const baseline = snapshotsByGameId.get(deltaGameId);
      if (baseline === undefined || baseline.frame !== baselineFrame) {
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
    if (event.code === "KeyM") {
      event.preventDefault();
      setControlsOpen(!controlsOpen);
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
import {
  makeSimulationInputCommand,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeInitialSimulationState } from "../engine/simulation/simulation-state";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationPixelPosition,
} from "../engine/simulation/simulation-units";
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
import {
  applyStateDelta,
  type StateDelta,
} from "../multiplayer/state-transport";
import {
  decodeMultiplayerSimulationState,
  encodeMultiplayerSimulationState,
} from "../multiplayer/simulation-wire";
import { makeMultiplayerPhaserRenderer } from "./multiplayer-phaser-renderer";
import { GameAudio } from "./game-audio";
import type { UserAssetBundle } from "./user-asset-loader";

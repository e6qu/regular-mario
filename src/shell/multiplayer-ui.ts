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

type GameSnapshot = {
  readonly gameId: string;
  readonly phase: string;
  readonly frame: number;
  readonly players: readonly {
    readonly playerId: string;
    readonly nickname: string;
    readonly avatarId: string;
    readonly spectator: boolean;
    readonly x: number;
    readonly y: number;
    readonly acknowledgedInputSequence: number;
  }[];
};

const multiplayerApiPrefix = "/api";
const multiplayerCanvasWidth = 768;
const multiplayerCanvasHeight = 240;

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
  const panel = document.createElement("main");
  panel.setAttribute("data-role", "multiplayer");
  panel.style.cssText =
    "max-width:900px;margin:28px auto;padding:24px;background:#0b0f19;color:#f5f7fb;" +
    "font-family:monospace;border:2px solid #ffd54a;border-radius:12px;";
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

function renderGameCanvas(
  context: CanvasRenderingContext2D,
  snapshot: GameSnapshot,
  playerId: string,
  predictedPosition: { readonly x: number; readonly y: number } | undefined,
): void {
  context.fillStyle = "#70b7e6";
  context.fillRect(0, 0, multiplayerCanvasWidth, multiplayerCanvasHeight);
  context.fillStyle = "#285a37";
  context.fillRect(0, multiplayerCanvasHeight - 32, multiplayerCanvasWidth, 32);
  for (const player of snapshot.players) {
    const position =
      player.playerId === playerId && predictedPosition !== undefined
        ? predictedPosition
        : player;
    context.fillStyle = player.playerId === playerId ? "#ffd54a" : "#f06d8f";
    context.fillRect(position.x * 3, position.y * 3, 28, 32);
    context.fillStyle = "#0b0f19";
    context.font = "12px monospace";
    context.fillText(
      player.spectator ? `${player.nickname} (watching)` : player.nickname,
      position.x * 3,
      position.y * 3 - 5,
    );
  }
}

async function renderLobby(mount: HTMLElement): Promise<void> {
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
  const heading = document.createElement("h1");
  heading.textContent = "Trusted friends lobby";
  panel.append(heading);

  const profileForm = document.createElement("form");
  const nickname = document.createElement("input");
  nickname.value = lobby.profile.nickname;
  nickname.setAttribute("aria-label", "Nickname");
  const avatar = document.createElement("select");
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
      await renderLobby(mount);
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
    await renderLobby(mount);
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
        await requestJson(`/games/${game.gameId}/join`, { method: "POST" });
        renderGame(mount, lobby.profile, game.gameId);
      }),
    );
    if (
      game.creator.playerId === lobby.profile.playerId &&
      game.phase === "waiting"
    ) {
      row.append(
        makeButton("Start", async () => {
          await requestJson(`/games/${game.gameId}/start`, { method: "POST" });
          renderGame(mount, lobby.profile, game.gameId);
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
      await renderLobby(mount);
    }),
  );
  mount.append(panel);
}

function renderGame(
  mount: HTMLElement,
  profile: PlayerProfile,
  gameId: string,
): void {
  mount.replaceChildren();
  const panel = makePanel();
  const title = document.createElement("h1");
  title.textContent = `Game ${gameId}`;
  const status = document.createElement("p");
  const canvas = document.createElement("canvas");
  canvas.width = multiplayerCanvasWidth;
  canvas.height = multiplayerCanvasHeight;
  canvas.setAttribute("aria-label", "Authoritative multiplayer game view");
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Multiplayer canvas context is unavailable.");
  }
  const gameContext = context;
  const chatInput = document.createElement("input");
  chatInput.maxLength = 256;
  chatInput.setAttribute("aria-label", "Game chat message");
  panel.append(title, status, canvas, chatInput);
  panel.append(
    makeButton("Send game chat", async () => {
      await requestJson(`/games/${gameId}/chat`, {
        method: "POST",
        body: JSON.stringify({ text: chatInput.value }),
      });
      chatInput.value = "";
    }),
  );
  panel.append(
    makeButton("Leave game", async () => {
      await requestJson("/game/leave", { method: "POST" });
      await renderLobby(mount);
    }),
  );
  mount.append(panel);

  let sequence = 0;
  const held = new Set<string>();
  const initialPredictionState = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );
  if (!initialPredictionState.ok) {
    throw new Error("Multiplayer prediction could not initialise.");
  }
  const prediction = makeClientPrediction(
    initialPredictionState.value,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );
  const socketUrl = new URL(
    `${multiplayerApiPrefix.replace(/^\//, "")}/socket`,
    window.location.href,
  );
  socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(socketUrl);
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
    prediction.submit(sequence, commandResult.value);
    socket.send(
      JSON.stringify({
        type: "input",
        sequence,
        intendedFrame: sequence,
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
  const interval = window.setInterval(() => void update(), 50);
  async function update(): Promise<void> {
    try {
      const snapshot = await requestJson<GameSnapshot>(
        `/games/${gameId}/snapshot`,
      );
      const local = snapshot.players.find(
        (player) => player.playerId === profile.playerId,
      );
      const predicted =
        local === undefined
          ? undefined
          : prediction.reconcile(local.acknowledgedInputSequence, local);
      status.textContent = `${snapshot.phase} · frame ${snapshot.frame}`;
      const localRuntime = predicted?.state.players[0];
      renderGameCanvas(
        gameContext,
        snapshot,
        profile.playerId,
        localRuntime === undefined
          ? undefined
          : {
              x: Number(localRuntime.player.position.x),
              y: Number(localRuntime.player.position.y),
            },
      );
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "screenshot",
            gameId,
            pngDataUrl: canvas.toDataURL("image/png"),
          }),
        );
      }
      if (snapshot.phase === "finished") {
        window.clearInterval(interval);
      }
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Game connection failed.";
      window.clearInterval(interval);
    }
  }
  void update();
  window.addEventListener(
    "hashchange",
    () => {
      window.clearInterval(interval);
      socket.close();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    },
    { once: true },
  );
}

export async function renderMultiplayerUi(mount: HTMLElement): Promise<void> {
  try {
    await renderLobby(mount);
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
          await renderLobby(mount);
        } catch (reason) {
          error.textContent =
            reason instanceof Error ? reason.message : "Login failed.";
        }
      }),
    );
    mount.append(panel);
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
  }
}
import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import { makeSimulationInputCommand } from "../engine/simulation/input-command";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeInitialSimulationState } from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
import { makeClientPrediction } from "../multiplayer/client-prediction";

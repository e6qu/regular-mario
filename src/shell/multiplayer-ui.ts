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
): void {
  context.fillStyle = "#70b7e6";
  context.fillRect(0, 0, multiplayerCanvasWidth, multiplayerCanvasHeight);
  context.fillStyle = "#285a37";
  context.fillRect(0, multiplayerCanvasHeight - 32, multiplayerCanvasWidth, 32);
  for (const player of snapshot.players) {
    context.fillStyle = player.playerId === playerId ? "#ffd54a" : "#f06d8f";
    context.fillRect(player.x * 3, player.y * 3, 28, 32);
    context.fillStyle = "#0b0f19";
    context.font = "12px monospace";
    context.fillText(
      player.spectator ? `${player.nickname} (watching)` : player.nickname,
      player.x * 3,
      player.y * 3 - 5,
    );
  }
}

async function renderLobby(mount: HTMLElement): Promise<void> {
  const lobby = await requestJson<{
    readonly profile: PlayerProfile;
    readonly games: readonly GameSummary[];
    readonly messages: readonly {
      readonly nickname: string;
      readonly text: string;
    }[];
  }>("/lobby");
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

  const create = makeButton("Create first-authored game", async () => {
    await requestJson("/games", {
      method: "POST",
      body: JSON.stringify({ levelId: "first-authored", mode: "regular" }),
    });
    await renderLobby(mount);
  });
  panel.append(create);
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
  panel.append(makeButton("Return to lobby", () => renderLobby(mount)));
  mount.append(panel);

  let sequence = 0;
  const held = new Set<string>();
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
    socket.send(
      JSON.stringify({
        type: "input",
        sequence,
        intendedFrame: sequence,
        horizontal: held.has("ArrowLeft")
          ? "left"
          : held.has("ArrowRight")
            ? "right"
            : "neutral",
        jumpPressed: held.has("Space") || held.has("ArrowUp"),
        runHeld: held.has("ShiftLeft") || held.has("ShiftRight"),
        firePressed: held.has("KeyX"),
        upHeld: held.has("ArrowUp"),
        downHeld: held.has("ArrowDown"),
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
      status.textContent = `${snapshot.phase} · frame ${snapshot.frame}`;
      renderGameCanvas(gameContext, snapshot, profile.playerId);
      socket.send(
        JSON.stringify({
          type: "screenshot",
          gameId,
          pngDataUrl: canvas.toDataURL("image/png"),
        }),
      );
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

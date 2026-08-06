import type { PublicGameSummary } from "./game-lobby";
import {
  MultiplayerGamePhase,
  type MultiplayerPlayerProfile,
} from "../multiplayer/game-runner";
import type { SemanticUiNode } from "../multiplayer/semantic-ui";

function node(
  role: string,
  label: string,
  children: readonly SemanticUiNode[] = [],
  action?: string,
  value?: string,
): SemanticUiNode {
  return {
    role,
    label,
    children,
    ...(action === undefined ? {} : { action }),
    ...(value === undefined ? {} : { value }),
  };
}

export function makeLoginLayout(): SemanticUiNode {
  return node("main", "Multiplayer login", [
    node("heading", "Trusted friends multiplayer"),
    node("textbox", "Server password", [], "login.password"),
    node("button", "Enter lobby", [], "login.submit"),
    node("link", "Administrator login", [], "admin.login"),
  ]);
}

export function makeAdminLoginLayout(): SemanticUiNode {
  return node("main", "Administrator login", [
    node("heading", "Administrator login"),
    node("textbox", "Administrator password", [], "admin.password"),
    node("button", "Enter administration", [], "admin.submit"),
  ]);
}

export function makeLobbyLayout(
  profile: MultiplayerPlayerProfile,
  games: readonly PublicGameSummary[],
): SemanticUiNode {
  return node("main", "Multiplayer lobby", [
    node("heading", "Trusted friends lobby"),
    node("group", "Player profile", [
      node("textbox", "Nickname", [], "profile.nickname", profile.nickname),
      node("combobox", "Avatar", [], "profile.avatar", profile.avatarId),
    ]),
    node("button", "Create game", [], "game.create"),
    node(
      "list",
      "Public games",
      games.map((game) =>
        node(
          "listitem",
          `${game.creator.nickname}: ${game.levelId} (${game.mode}, ${game.playerCount}/${game.maximumPlayerCount})`,
          [node("button", "Join game", [], "game.join", game.gameId)],
        ),
      ),
    ),
    node("log", "Lobby chat", [], "chat.lobby"),
  ]);
}

export function makeGameLayout(
  profile: MultiplayerPlayerProfile,
  game: PublicGameSummary,
): SemanticUiNode {
  const creatorWaitingControls =
    game.creator.playerId === profile.playerId &&
    game.phase === MultiplayerGamePhase.Waiting
      ? [node("button", "Start game", [], "game.start", game.gameId)]
      : [];
  const waitingRoom =
    game.phase === MultiplayerGamePhase.Waiting
      ? [
          node("region", "Game room", [
            node(
              "status",
              `Waiting for friends: ${game.playerCount}/${game.maximumPlayerCount} players`,
            ),
            node("log", "Game chat", [], "chat.game"),
            node("button", "Send game chat", [], "chat.game.send"),
            node("button", "Leave game", [], "game.leave"),
            ...creatorWaitingControls,
          ]),
        ]
      : [
          node("img", "Authoritative multiplayer game view", [], "game.canvas"),
          node("log", "Game chat", [], "chat.game"),
          node("button", "Send game chat", [], "chat.game.send"),
          node("button", "Leave game", [], "game.leave"),
        ];
  return node("main", "Multiplayer game", [
    node("heading", `${game.levelId} (${game.mode})`),
    node("status", `Game ${game.gameId}: ${game.phase}`),
    node("status", `Playing as ${profile.nickname}`),
    ...waitingRoom,
  ]);
}

export function makeAdminLayout(
  games: readonly PublicGameSummary[],
): SemanticUiNode {
  return node("main", "Multiplayer administration", [
    node("heading", "Authoritative game controls"),
    node("button", "Expire all player sessions", [], "admin.expire-sessions"),
    node(
      "list",
      "Games",
      games.map((game) =>
        node("listitem", `${game.gameId}: ${game.phase}`, [
          node("button", "Pause", [], "admin.pause", game.gameId),
          node("button", "Step frame", [], "admin.step", game.gameId),
          node("button", "Resume", [], "admin.resume", game.gameId),
        ]),
      ),
    ),
  ]);
}

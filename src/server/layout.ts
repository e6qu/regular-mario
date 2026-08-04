import type { PublicGameSummary } from "./game-lobby";
import type { MultiplayerPlayerProfile } from "../multiplayer/game-runner";

export type SemanticUiNode = {
  readonly role: string;
  readonly label: string;
  readonly action?: string;
  readonly value?: string;
  readonly children: readonly SemanticUiNode[];
};

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

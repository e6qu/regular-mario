import type { MovementConstants } from "../engine/simulation/movement-model";
import {
  requireMultiplayerAvatar,
  requireMultiplayerGameMode,
  requireMultiplayerGameId,
  requireMultiplayerNickname,
  requireMultiplayerPlayerId,
  type MultiplayerAvatarId,
  type MultiplayerGameId,
  type MultiplayerNickname,
  type MultiplayerPlayerId,
} from "../multiplayer/domain";
import type {
  AuthoritativeGameSnapshot,
  MultiplayerPlayerProfile,
} from "../multiplayer/game-runner";
import type { QueuedSimulationInput } from "../multiplayer/input-queue";
import {
  makeSessionStore,
  SessionRole,
  type AuthenticatedSession,
  type MakeSessionStoreConfig,
  type SessionStore,
} from "./auth";
import type { ChatMessage } from "./chat";
import {
  makeMultiplayerLobby,
  type MakeMultiplayerLobbyConfig,
  type MultiplayerLobby,
  type PublicGameSummary,
  type ServerLevelOption,
} from "./game-lobby";

const maximumScreenshotDataUrlCharacters = 2_800_000;

export type MultiplayerService = {
  loginPlayer(
    password: string,
    nowMilliseconds: number,
  ): {
    readonly token: string;
    readonly session: AuthenticatedSession;
    readonly profile: MultiplayerPlayerProfile;
  };
  loginAdmin(password: string, nowMilliseconds: number): string;
  requirePlayer(
    token: string | undefined,
    nowMilliseconds: number,
  ): MultiplayerPlayerProfile;
  updateProfile(
    token: string | undefined,
    nickname: string,
    avatarId: string,
    nowMilliseconds: number,
  ): MultiplayerPlayerProfile;
  games(
    token: string | undefined,
    nowMilliseconds: number,
  ): readonly PublicGameSummary[];
  activeGame(
    token: string | undefined,
    nowMilliseconds: number,
  ): PublicGameSummary | undefined;
  levels(
    token: string | undefined,
    nowMilliseconds: number,
  ): readonly { readonly id: string; readonly label: string }[];
  createGame(
    token: string | undefined,
    levelId: string,
    mode: string,
    nowMilliseconds: number,
  ): PublicGameSummary;
  joinGame(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): PublicGameSummary;
  leaveGame(token: string | undefined, nowMilliseconds: number): void;
  revivePlayer(
    token: string | undefined,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  pauseGameByPlayer(
    token: string | undefined,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  startGame(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): PublicGameSummary;
  endGame(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): void;
  submitInput(
    token: string | undefined,
    input: Omit<QueuedSimulationInput, "playerId">,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  sendLobbyChat(
    token: string | undefined,
    text: string,
    nowMilliseconds: number,
  ): ChatMessage;
  sendGameChat(
    token: string | undefined,
    gameId: string,
    text: string,
    nowMilliseconds: number,
  ): ChatMessage;
  gameMessages(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): readonly ChatMessage[];
  lobbyMessages(
    token: string | undefined,
    nowMilliseconds: number,
  ): readonly ChatMessage[];
  gameSnapshot(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  tick(nowMilliseconds: number): readonly AuthoritativeGameSnapshot[];
  adminDebug(
    token: string | undefined,
    nowMilliseconds: number,
  ): {
    readonly activeSessionCount: number;
    readonly games: readonly PublicGameSummary[];
    readonly snapshots: readonly AuthoritativeGameSnapshot[];
  };
  adminPause(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  adminResume(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  adminStep(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  adminSubmitInput(
    token: string | undefined,
    gameId: string,
    input: QueuedSimulationInput,
    nowMilliseconds: number,
  ): AuthoritativeGameSnapshot;
  adminExpireAllPlayers(
    token: string | undefined,
    nowMilliseconds: number,
  ): void;
  adminBootPlayer(
    token: string | undefined,
    playerId: string,
    nowMilliseconds: number,
  ): void;
  recordScreenshot(
    token: string | undefined,
    gameId: string,
    pngDataUrl: string,
    nowMilliseconds: number,
  ): void;
  adminScreenshot(
    token: string | undefined,
    gameId: string,
    nowMilliseconds: number,
  ): string | undefined;
};

export type MakeMultiplayerServiceConfig = {
  readonly session: MakeSessionStoreConfig;
  readonly levels: readonly ServerLevelOption[];
  readonly movementConstants: MovementConstants;
  readonly nextGameId: () => string;
};

function defaultProfile(
  playerId: MultiplayerPlayerId,
): MultiplayerPlayerProfile {
  return {
    playerId,
    nickname: requireMultiplayerNickname("Guest"),
    avatarId: requireMultiplayerAvatar("castaway"),
  };
}

export function makeMultiplayerService(
  config: MakeMultiplayerServiceConfig,
): MultiplayerService {
  const sessions: SessionStore = makeSessionStore(config.session);
  const lobby: MultiplayerLobby = makeMultiplayerLobby({
    levels: config.levels,
    movementConstants: config.movementConstants,
    nextGameId: config.nextGameId,
  } satisfies MakeMultiplayerLobbyConfig);
  const profileByPlayerId = new Map<
    MultiplayerPlayerId,
    MultiplayerPlayerProfile
  >();
  const screenshotByGameId = new Map<MultiplayerGameId, string>();

  function requireSession(
    token: string | undefined,
    role: SessionRole,
    nowMilliseconds: number,
  ): AuthenticatedSession {
    const session = sessions.authenticate(token, role, nowMilliseconds);
    if (session === undefined) {
      throw new Error("Authentication is required.");
    }
    return session;
  }

  function profileForSession(
    session: AuthenticatedSession,
  ): MultiplayerPlayerProfile {
    const existing = profileByPlayerId.get(session.playerId);
    if (existing !== undefined) {
      return existing;
    }
    const profile = defaultProfile(session.playerId);
    profileByPlayerId.set(session.playerId, profile);
    return profile;
  }

  function requirePlayerProfile(
    token: string | undefined,
    nowMilliseconds: number,
  ): MultiplayerPlayerProfile {
    return profileForSession(
      requireSession(token, SessionRole.Player, nowMilliseconds),
    );
  }

  function requireAdmin(
    token: string | undefined,
    nowMilliseconds: number,
  ): void {
    requireSession(token, SessionRole.Admin, nowMilliseconds);
  }

  return {
    loginPlayer(password, nowMilliseconds) {
      const token = sessions.loginPlayer(password, nowMilliseconds);
      const session = sessions.authenticate(
        token,
        SessionRole.Player,
        nowMilliseconds,
      );
      if (session === undefined) {
        throw new Error("New player session could not be authenticated.");
      }
      return { token, session, profile: profileForSession(session) };
    },
    loginAdmin(password, nowMilliseconds) {
      return sessions.loginAdmin(password, nowMilliseconds);
    },
    requirePlayer(token, nowMilliseconds) {
      return requirePlayerProfile(token, nowMilliseconds);
    },
    updateProfile(token, nickname, avatarId, nowMilliseconds) {
      const profile = requirePlayerProfile(token, nowMilliseconds);
      const nextNickname: MultiplayerNickname =
        requireMultiplayerNickname(nickname);
      const nextAvatarId: MultiplayerAvatarId =
        requireMultiplayerAvatar(avatarId);
      for (const candidate of profileByPlayerId.values()) {
        if (
          candidate.playerId !== profile.playerId &&
          candidate.nickname.toLocaleLowerCase() ===
            nextNickname.toLocaleLowerCase()
        ) {
          throw new Error("Nickname is already in use.");
        }
      }
      const next = {
        ...profile,
        nickname: nextNickname,
        avatarId: nextAvatarId,
      };
      profileByPlayerId.set(profile.playerId, next);
      // Identity changes never affect deterministic gameplay, but the runner
      // broadcasts the revised name/avatar in its next authoritative snapshot.
      lobby.updatePlayerProfile(next);
      return next;
    },
    games(token, nowMilliseconds) {
      requirePlayerProfile(token, nowMilliseconds);
      return lobby.games();
    },
    activeGame(token, nowMilliseconds) {
      const profile = requirePlayerProfile(token, nowMilliseconds);
      const gameId = lobby.gameForPlayer(profile.playerId);
      return gameId === undefined
        ? undefined
        : lobby.games().find((game) => game.gameId === gameId);
    },
    levels(token, nowMilliseconds) {
      requirePlayerProfile(token, nowMilliseconds);
      return config.levels.map((level) => ({
        id: level.id,
        label: level.label,
      }));
    },
    createGame(token, levelId, mode, nowMilliseconds) {
      return lobby.createGame(
        requirePlayerProfile(token, nowMilliseconds),
        levelId,
        requireMultiplayerGameMode(mode),
      );
    },
    joinGame(token, gameId, nowMilliseconds) {
      return lobby.joinGame(
        requirePlayerProfile(token, nowMilliseconds),
        requireMultiplayerGameId(gameId),
      );
    },
    leaveGame(token, nowMilliseconds) {
      lobby.leaveGame(requirePlayerProfile(token, nowMilliseconds).playerId);
    },
    revivePlayer(token, nowMilliseconds) {
      return lobby.revivePlayer(
        requirePlayerProfile(token, nowMilliseconds).playerId,
      );
    },
    pauseGameByPlayer(token, nowMilliseconds) {
      return lobby.pauseGameByPlayer(
        requirePlayerProfile(token, nowMilliseconds).playerId,
      );
    },
    startGame(token, gameId, nowMilliseconds) {
      const profile = requirePlayerProfile(token, nowMilliseconds);
      return lobby.startGame(
        profile.playerId,
        requireMultiplayerGameId(gameId),
      );
    },
    endGame(token, gameId, nowMilliseconds) {
      const profile = requirePlayerProfile(token, nowMilliseconds);
      lobby.endGame(profile.playerId, requireMultiplayerGameId(gameId));
    },
    submitInput(token, input, nowMilliseconds) {
      const profile = requirePlayerProfile(token, nowMilliseconds);
      return lobby.submitGameInput(
        { ...input, playerId: profile.playerId },
        nowMilliseconds,
      );
    },
    sendLobbyChat(token, text, nowMilliseconds) {
      return lobby.sendLobbyChat(
        requirePlayerProfile(token, nowMilliseconds),
        text,
        nowMilliseconds,
      );
    },
    sendGameChat(token, gameId, text, nowMilliseconds) {
      return lobby.sendGameChat(
        requirePlayerProfile(token, nowMilliseconds),
        requireMultiplayerGameId(gameId),
        text,
        nowMilliseconds,
      );
    },
    gameMessages(token, gameId, nowMilliseconds) {
      const profile = requirePlayerProfile(token, nowMilliseconds);
      const parsedGameId = requireMultiplayerGameId(gameId);
      if (lobby.gameForPlayer(profile.playerId) !== parsedGameId) {
        throw new Error("Only game members can read game chat.");
      }
      return lobby.gameMessages(parsedGameId);
    },
    lobbyMessages(token, nowMilliseconds) {
      requirePlayerProfile(token, nowMilliseconds);
      return lobby.lobbyMessages();
    },
    gameSnapshot(token, gameId, nowMilliseconds) {
      requirePlayerProfile(token, nowMilliseconds);
      return lobby.gameSnapshot(requireMultiplayerGameId(gameId));
    },
    tick(nowMilliseconds) {
      return lobby.stepAll(nowMilliseconds);
    },
    adminDebug(token, nowMilliseconds) {
      requireAdmin(token, nowMilliseconds);
      const games = lobby.games();
      return {
        activeSessionCount: sessions.activeSessions(nowMilliseconds).length,
        games,
        snapshots: games.map((game) => lobby.gameSnapshot(game.gameId)),
      };
    },
    adminPause(token, gameId, nowMilliseconds) {
      requireAdmin(token, nowMilliseconds);
      return lobby.pauseGame(requireMultiplayerGameId(gameId));
    },
    adminResume(token, gameId, nowMilliseconds) {
      requireAdmin(token, nowMilliseconds);
      return lobby.resumeGame(requireMultiplayerGameId(gameId));
    },
    adminStep(token, gameId, nowMilliseconds) {
      requireAdmin(token, nowMilliseconds);
      return lobby.stepPausedGame(
        requireMultiplayerGameId(gameId),
        nowMilliseconds,
      );
    },
    adminSubmitInput(token, gameId, input, nowMilliseconds) {
      requireAdmin(token, nowMilliseconds);
      const parsedGameId = requireMultiplayerGameId(gameId);
      if (lobby.gameForPlayer(input.playerId) !== parsedGameId) {
        throw new Error("Input player is not a member of this game.");
      }
      return lobby.submitGameInput(input, nowMilliseconds);
    },
    adminExpireAllPlayers(token, nowMilliseconds) {
      requireAdmin(token, nowMilliseconds);
      sessions.expireAllPlayerSessions();
    },
    adminBootPlayer(token, playerId, nowMilliseconds) {
      requireAdmin(token, nowMilliseconds);
      sessions.bootPlayer(requireMultiplayerPlayerId(playerId));
    },
    recordScreenshot(token, gameId, pngDataUrl, nowMilliseconds) {
      const profile = requirePlayerProfile(token, nowMilliseconds);
      const parsedGameId = requireMultiplayerGameId(gameId);
      const snapshot = lobby.gameSnapshot(parsedGameId);
      if (
        !snapshot.players.some((player) => player.playerId === profile.playerId)
      ) {
        throw new Error("Only game members can submit a game screenshot.");
      }
      if (
        !pngDataUrl.startsWith("data:image/png;base64,") ||
        pngDataUrl.length > maximumScreenshotDataUrlCharacters
      ) {
        throw new Error("Screenshot must be a bounded PNG data URL.");
      }
      screenshotByGameId.set(parsedGameId, pngDataUrl);
    },
    adminScreenshot(token, gameId, nowMilliseconds) {
      requireAdmin(token, nowMilliseconds);
      return screenshotByGameId.get(requireMultiplayerGameId(gameId));
    },
  };
}

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type {
  MultiplayerPlayerId,
  MultiplayerSessionId,
} from "../multiplayer/domain";
import {
  requireMultiplayerPlayerId,
  requireMultiplayerSessionId,
} from "../multiplayer/domain";

export const playerSessionLifetimeMilliseconds = 24 * 60 * 60 * 1000;
export const adminSessionLifetimeMilliseconds = 60 * 60 * 1000;

export enum SessionRole {
  Player = "player",
  Admin = "admin",
}

export type AuthenticatedSession = {
  readonly id: MultiplayerSessionId;
  readonly playerId: MultiplayerPlayerId;
  readonly role: SessionRole;
  readonly expiresAtMilliseconds: number;
};

export type SessionStore = {
  loginPlayer(password: string, nowMilliseconds: number): string;
  loginAdmin(password: string, nowMilliseconds: number): string;
  authenticate(
    token: string | undefined,
    role: SessionRole,
    nowMilliseconds: number,
  ): AuthenticatedSession | undefined;
  expireAllPlayerSessions(): void;
  bootPlayer(playerId: MultiplayerPlayerId): void;
  activeSessions(nowMilliseconds: number): readonly AuthenticatedSession[];
};

export type MakeSessionStoreConfig = {
  readonly serverPassword: string;
  readonly adminPassword: string;
  readonly signingSecret: string;
  readonly randomId?: () => string;
};

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function sign(sessionId: MultiplayerSessionId, signingSecret: string): string {
  return createHmac("sha256", signingSecret)
    .update(sessionId)
    .digest("base64url");
}

function makeToken(
  sessionId: MultiplayerSessionId,
  signingSecret: string,
): string {
  return `${sessionId}.${sign(sessionId, signingSecret)}`;
}

function parseToken(
  token: string,
  signingSecret: string,
): MultiplayerSessionId | undefined {
  const [rawSessionId, signature, extra] = token.split(".");
  if (
    rawSessionId === undefined ||
    signature === undefined ||
    extra !== undefined
  ) {
    return undefined;
  }
  let sessionId: MultiplayerSessionId;
  try {
    sessionId = requireMultiplayerSessionId(rawSessionId);
  } catch {
    return undefined;
  }
  return secureEqual(signature, sign(sessionId, signingSecret))
    ? sessionId
    : undefined;
}

export function makeSessionStore(config: MakeSessionStoreConfig): SessionStore {
  if (config.serverPassword.length === 0 || config.adminPassword.length === 0) {
    throw new Error("Server and admin passwords must be non-empty.");
  }
  if (config.signingSecret.length < 32) {
    throw new Error(
      "Session signing secret must contain at least 32 characters.",
    );
  }
  const randomId = config.randomId ?? randomUUID;
  const sessionsById = new Map<MultiplayerSessionId, AuthenticatedSession>();

  function createSession(role: SessionRole, nowMilliseconds: number): string {
    const sessionId = requireMultiplayerSessionId(`session-${randomId()}`);
    const playerId = requireMultiplayerPlayerId(`player-${randomId()}`);
    const lifetime =
      role === SessionRole.Player
        ? playerSessionLifetimeMilliseconds
        : adminSessionLifetimeMilliseconds;
    sessionsById.set(sessionId, {
      id: sessionId,
      playerId,
      role,
      expiresAtMilliseconds: nowMilliseconds + lifetime,
    });
    return makeToken(sessionId, config.signingSecret);
  }

  function prune(nowMilliseconds: number): void {
    for (const [sessionId, session] of sessionsById) {
      if (session.expiresAtMilliseconds <= nowMilliseconds) {
        sessionsById.delete(sessionId);
      }
    }
  }

  return {
    loginPlayer(password, nowMilliseconds) {
      if (!secureEqual(password, config.serverPassword)) {
        throw new Error("Server password is invalid.");
      }
      prune(nowMilliseconds);
      return createSession(SessionRole.Player, nowMilliseconds);
    },
    loginAdmin(password, nowMilliseconds) {
      if (!secureEqual(password, config.adminPassword)) {
        throw new Error("Admin password is invalid.");
      }
      prune(nowMilliseconds);
      return createSession(SessionRole.Admin, nowMilliseconds);
    },
    authenticate(token, role, nowMilliseconds) {
      prune(nowMilliseconds);
      if (token === undefined) {
        return undefined;
      }
      const sessionId = parseToken(token, config.signingSecret);
      if (sessionId === undefined) {
        return undefined;
      }
      const session = sessionsById.get(sessionId);
      return session?.role === role ? session : undefined;
    },
    expireAllPlayerSessions() {
      for (const [sessionId, session] of sessionsById) {
        if (session.role === SessionRole.Player) {
          sessionsById.delete(sessionId);
        }
      }
    },
    bootPlayer(playerId) {
      for (const [sessionId, session] of sessionsById) {
        if (
          session.role === SessionRole.Player &&
          session.playerId === playerId
        ) {
          sessionsById.delete(sessionId);
        }
      }
    },
    activeSessions(nowMilliseconds) {
      prune(nowMilliseconds);
      return [...sessionsById.values()];
    },
  };
}

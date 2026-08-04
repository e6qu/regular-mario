import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { makeSimulationInputCommand } from "../engine/simulation/input-command";
import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeAdminLayout, makeLobbyLayout, makeLoginLayout } from "./layout";
import {
  makeMultiplayerService,
  type MakeMultiplayerServiceConfig,
  type MultiplayerService,
} from "./service";

const jsonBodyMaximumBytes = 64 * 1024;
const sessionCookieName = "platformer_session";
const adminCookieName = "platformer_admin_session";

type JsonRecord = Readonly<Record<string, unknown>>;

export type MultiplayerHttpServer = {
  readonly server: Server;
  readonly service: MultiplayerService;
  tick(nowMilliseconds: number): void;
  close(): Promise<void>;
};

export type MakeMultiplayerHttpServerConfig = {
  readonly service: MakeMultiplayerServiceConfig;
  readonly staticRoot?: string;
  readonly secureCookies: boolean;
};

function now(): number {
  return Date.now();
}

function parseCookies(request: IncomingMessage): ReadonlyMap<string, string> {
  const header = request.headers.cookie;
  if (header === undefined) {
    return new Map();
  }
  return new Map(
    header.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) {
        return [];
      }
      return [
        [
          part.slice(0, separator).trim(),
          decodeURIComponent(part.slice(separator + 1).trim()),
        ],
      ];
    }),
  );
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function failure(
  response: ServerResponse,
  status: number,
  error: unknown,
): void {
  json(response, status, {
    error: error instanceof Error ? error.message : "Unknown error.",
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }
  return value;
}

async function readJsonBody(request: IncomingMessage): Promise<JsonRecord> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    if (!Buffer.isBuffer(chunk)) {
      throw new Error("Request body must be binary data.");
    }
    const bytes: Uint8Array = chunk;
    totalBytes += bytes.length;
    if (totalBytes > jsonBodyMaximumBytes) {
      throw new Error("JSON request body is too large.");
    }
    chunks.push(bytes);
  }
  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"),
    );
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
  if (!isRecord(value)) {
    throw new Error("Request body must be a JSON object.");
  }
  return value;
}

function sessionCookie(token: string, secureCookies: boolean): string {
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureCookies ? "; Secure" : ""}`;
}

function adminCookie(token: string, secureCookies: boolean): string {
  return `${adminCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${secureCookies ? "; Secure" : ""}`;
}

function clearedCookie(name: string, secureCookies: boolean): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookies ? "; Secure" : ""}`;
}

function makeDefaultServiceConfig(
  config: MakeMultiplayerServiceConfig,
): MakeMultiplayerServiceConfig {
  return config;
}

function rawMessageToText(rawMessage: RawData): string {
  if (Array.isArray(rawMessage)) {
    return Buffer.concat(rawMessage).toString("utf8");
  }
  if (rawMessage instanceof ArrayBuffer) {
    return Buffer.from(rawMessage).toString("utf8");
  }
  return rawMessage.toString("utf8");
}

export function makeMultiplayerHttpServer(
  config: MakeMultiplayerHttpServerConfig,
): MultiplayerHttpServer {
  const service = makeMultiplayerService(
    makeDefaultServiceConfig(config.service),
  );
  const socketsByPlayerId = new Map<string, Set<WebSocket>>();
  const profileBySocket = new WeakMap<
    WebSocket,
    ReturnType<MultiplayerService["requirePlayer"]>
  >();
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
  });

  function broadcast(value: unknown): void {
    const encoded = JSON.stringify(value);
    for (const sockets of socketsByPlayerId.values()) {
      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(encoded);
        }
      }
    }
  }

  function broadcastSnapshots(nowMilliseconds: number): void {
    const snapshots = service.tick(nowMilliseconds);
    if (snapshots.length > 0) {
      broadcast({ type: "snapshots", snapshots });
    }
  }

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const cookies = parseCookies(request);
    const playerToken = cookies.get(sessionCookieName);
    const adminToken = cookies.get(adminCookieName);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/login") {
        const body = await readJsonBody(request);
        const loggedIn = service.loginPlayer(
          requireString(body, "password"),
          now(),
        );
        response.setHeader(
          "set-cookie",
          sessionCookie(loggedIn.token, config.secureCookies),
        );
        json(response, 200, { profile: loggedIn.profile });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/admin/login") {
        const token = service.loginAdmin(
          requireString(await readJsonBody(request), "password"),
          now(),
        );
        response.setHeader(
          "set-cookie",
          adminCookie(token, config.secureCookies),
        );
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        response.setHeader(
          "set-cookie",
          clearedCookie(sessionCookieName, config.secureCookies),
        );
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/layout") {
        try {
          json(
            response,
            200,
            makeAdminLayout(service.adminDebug(adminToken, now()).games),
          );
        } catch {
          try {
            const profile = service.requirePlayer(playerToken, now());
            json(
              response,
              200,
              makeLobbyLayout(profile, service.games(playerToken, now())),
            );
          } catch {
            json(response, 200, makeLoginLayout());
          }
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/me") {
        json(response, 200, {
          profile: service.requirePlayer(playerToken, now()),
        });
        return;
      }
      if (request.method === "PATCH" && url.pathname === "/api/profile") {
        const body = await readJsonBody(request);
        json(response, 200, {
          profile: service.updateProfile(
            playerToken,
            requireString(body, "nickname"),
            requireString(body, "avatarId"),
            now(),
          ),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/lobby") {
        json(response, 200, {
          profile: service.requirePlayer(playerToken, now()),
          games: service.games(playerToken, now()),
          messages: service.lobbyMessages(playerToken, now()),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/levels") {
        json(response, 200, { levels: service.levels(playerToken, now()) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/lobby/chat") {
        json(response, 200, {
          message: service.sendLobbyChat(
            playerToken,
            requireString(await readJsonBody(request), "text"),
            now(),
          ),
        });
        broadcast({ type: "lobby-chat" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/games") {
        const body = await readJsonBody(request);
        json(response, 201, {
          game: service.createGame(
            playerToken,
            requireString(body, "levelId"),
            requireString(body, "mode"),
            now(),
          ),
        });
        broadcast({ type: "games-changed" });
        return;
      }
      const gameMatch =
        /^\/api\/games\/([a-z][a-z0-9-]*)\/(join|start|chat|snapshot)$/.exec(
          url.pathname,
        );
      if (gameMatch !== null) {
        const [, gameId, action] = gameMatch;
        if (gameId === undefined || action === undefined) {
          throw new Error("Game route is incomplete.");
        }
        if (request.method === "POST" && action === "join") {
          json(response, 200, {
            game: service.joinGame(playerToken, gameId, now()),
          });
          broadcast({ type: "games-changed" });
          return;
        }
        if (request.method === "POST" && action === "start") {
          json(response, 200, {
            game: service.startGame(playerToken, gameId, now()),
          });
          broadcast({ type: "games-changed" });
          return;
        }
        if (request.method === "POST" && action === "chat") {
          json(response, 200, {
            message: service.sendGameChat(
              playerToken,
              gameId,
              requireString(await readJsonBody(request), "text"),
              now(),
            ),
          });
          return;
        }
        if (request.method === "GET" && action === "snapshot") {
          json(response, 200, service.gameSnapshot(playerToken, gameId, now()));
          return;
        }
      }
      const adminMatch =
        /^\/api\/admin\/games\/([a-z][a-z0-9-]*)\/(pause|resume|step|screenshot)$/.exec(
          url.pathname,
        );
      if (adminMatch !== null) {
        const [, gameId, action] = adminMatch;
        if (gameId === undefined || action === undefined) {
          throw new Error("Admin game route is incomplete.");
        }
        if (request.method === "POST" && action === "pause") {
          json(response, 200, service.adminPause(adminToken, gameId, now()));
          return;
        }
        if (request.method === "POST" && action === "resume") {
          json(response, 200, service.adminResume(adminToken, gameId, now()));
          return;
        }
        if (request.method === "POST" && action === "step") {
          json(response, 200, service.adminStep(adminToken, gameId, now()));
          return;
        }
        if (request.method === "GET" && action === "screenshot") {
          json(response, 200, {
            pngDataUrl: service.adminScreenshot(adminToken, gameId, now()),
          });
          return;
        }
      }
      if (request.method === "GET" && url.pathname === "/api/admin/debug") {
        json(response, 200, service.adminDebug(adminToken, now()));
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/admin/expire-sessions"
      ) {
        service.adminExpireAllPlayers(adminToken, now());
        json(response, 200, { ok: true });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/admin/boot-player"
      ) {
        const body = await readJsonBody(request);
        service.adminBootPlayer(
          adminToken,
          requireString(body, "playerId"),
          now(),
        );
        json(response, 200, { ok: true });
        return;
      }
      if (config.staticRoot !== undefined && request.method === "GET") {
        const relativePath =
          url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const root = resolve(config.staticRoot);
        const filePath = resolve(root, relativePath);
        if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
          failure(response, 403, new Error("Static path is forbidden."));
          return;
        }
        const body = await readFile(filePath);
        response.writeHead(200);
        response.end(body);
        return;
      }
      failure(response, 404, new Error("Route does not exist."));
    } catch (error) {
      failure(
        response,
        /Authentication|password/.test(
          error instanceof Error ? error.message : "",
        )
          ? 401
          : 400,
        error,
      );
    }
  }

  const server = createServer((request, response) => {
    void handle(request, response);
  });

  server.on("upgrade", (request, socket, head) => {
    const token = parseCookies(request).get(sessionCookieName);
    let profile;
    try {
      profile = service.requirePlayer(token, now());
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      profileBySocket.set(webSocket, profile);
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket: WebSocket, request) => {
    const profile = profileBySocket.get(socket);
    if (profile === undefined) {
      socket.close(1008, "Authenticated profile is missing.");
      return;
    }
    const playerId = profile.playerId as string;
    const sockets = socketsByPlayerId.get(playerId) ?? new Set<WebSocket>();
    sockets.add(socket);
    socketsByPlayerId.set(playerId, sockets);
    socket.send(
      JSON.stringify({
        type: "connected",
        profile,
        games: service.games(
          parseCookies(request).get(sessionCookieName),
          now(),
        ),
      }),
    );
    socket.on("message", (rawMessage: RawData) => {
      try {
        const message: unknown = JSON.parse(rawMessageToText(rawMessage));
        if (!isRecord(message)) {
          throw new Error("WebSocket message must be an object.");
        }
        const type = requireString(message, "type");
        const token = parseCookies(request).get(sessionCookieName);
        if (type === "input") {
          const commandResult = makeSimulationInputCommand(
            message["horizontal"],
            message["jumpPressed"],
            message["runHeld"],
            message["firePressed"],
            message["upHeld"],
            message["downHeld"],
          );
          if (!commandResult.ok) {
            throw new Error(
              commandResult.errors.map((error) => error.message).join(" "),
            );
          }
          const sequence = message["sequence"];
          const intendedFrame = message["intendedFrame"];
          if (
            typeof sequence !== "number" ||
            typeof intendedFrame !== "number" ||
            !Number.isSafeInteger(sequence) ||
            !Number.isSafeInteger(intendedFrame)
          ) {
            throw new Error(
              "Input sequence and intendedFrame must be safe integers.",
            );
          }
          service.submitInput(
            token,
            {
              sequence,
              intendedFrame,
              receivedAtMilliseconds: now(),
              command: commandResult.value,
            },
            now(),
          );
        } else if (type === "lobby-chat") {
          service.sendLobbyChat(token, requireString(message, "text"), now());
        } else if (type === "game-chat") {
          service.sendGameChat(
            token,
            requireString(message, "gameId"),
            requireString(message, "text"),
            now(),
          );
        } else if (type === "screenshot") {
          service.recordScreenshot(
            token,
            requireString(message, "gameId"),
            requireString(message, "pngDataUrl"),
            now(),
          );
        } else {
          throw new Error("WebSocket message type is unsupported.");
        }
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error.",
          }),
        );
      }
    });
    socket.on("close", () => {
      const remaining = socketsByPlayerId.get(playerId);
      remaining?.delete(socket);
      if (remaining?.size === 0) {
        socketsByPlayerId.delete(playerId);
      }
    });
  });

  return {
    server,
    service,
    tick(nowMilliseconds) {
      broadcastSnapshots(nowMilliseconds);
    },
    close() {
      for (const sockets of socketsByPlayerId.values()) {
        for (const socket of sockets) {
          socket.close();
        }
      }
      return new Promise((resolveClose, rejectClose) => {
        server.close((error) =>
          error === undefined ? resolveClose() : rejectClose(error),
        );
      });
    },
  };
}

export function makeProductionServiceConfig(
  serverPassword: string,
  adminPassword: string,
  signingSecret: string,
): MakeMultiplayerServiceConfig {
  let gameNumber = 0;
  return {
    session: { serverPassword, adminPassword, signingSecret },
    levels: [
      {
        id: "first-authored",
        label: "First Authored Level",
        levelSpec: firstAuthoredLevelSpec(),
      },
    ],
    movementConstants: initialMovementConstants,
    nextGameId: () => `game-${++gameNumber}`,
  };
}

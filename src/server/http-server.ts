import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { makeSimulationInputCommand } from "../engine/simulation/input-command";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeLevelSpec } from "../engine/domain/level-spec";
import { parseVglcSmbMultiLayerLevel } from "../engine/levels/import/vglc-smb-text-level";
import {
  multiplayerSnapshotFramesPerSecond,
  requireMultiplayerPlayerId,
} from "../multiplayer/domain";
import type { QueuedSimulationInput } from "../multiplayer/input-queue";
import { requireMultiplayerProtocolVersion } from "../multiplayer/protocol";
import { MultiplayerGamePhase } from "../multiplayer/game-runner";
import type { AuthoritativeGameSnapshot } from "../multiplayer/game-runner";
import {
  makeStateDelta,
  stateTransportEncodedBytes,
} from "../multiplayer/state-transport";
import {
  makeAdminLayout,
  makeAdminLoginLayout,
  makeGameLayout,
  makeLobbyLayout,
  makeLoginLayout,
} from "./layout";
import { makeLoginAttemptLimiter } from "./login-attempt-limiter";
import {
  makeMultiplayerService,
  type MakeMultiplayerServiceConfig,
  type MultiplayerService,
} from "./service";
import type { ServerLevelOption } from "./game-lobby";
import type { ServerLogger } from "./file-logger";

const jsonBodyMaximumBytes = 64 * 1024;
// Complete recovery keyframes and the bounded diagnostic image share this
// transport. A multi-player level handoff can exceed 2 MiB even though routine
// updates are deltas, so keep an explicit 8 MiB ceiling rather than allowing
// `ws` to terminate the socket mid-handoff.
const webSocketMaximumPayloadBytes = 8 * 1024 * 1024;
const loginAttemptWindowMilliseconds = 60_000;
const maximumLoginAttemptsPerWindow = 5;
const snapshotBroadcastIntervalMilliseconds =
  1000 / multiplayerSnapshotFramesPerSecond;
const stateKeyframeIntervalMilliseconds = 1000;
const sessionCookieName = "platformer_session";
const adminCookieName = "platformer_admin_session";

type TransportDebugMetrics = {
  readonly snapshotBroadcastCount: number;
  readonly keyframeBroadcastCount: number;
  readonly deltaBroadcastCount: number;
  readonly keyframeBytes: number;
  readonly deltaBytes: number;
  readonly lastSnapshotBroadcastMilliseconds: number | undefined;
  readonly configuredSnapshotDelayMilliseconds: number;
  readonly protocolErrorCount: number;
};

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
  readonly snapshotDelayMilliseconds?: number;
  readonly logger?: ServerLogger;
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

function requireQueuedInput(
  record: JsonRecord,
  playerId: QueuedSimulationInput["playerId"],
  receivedAtMilliseconds: number,
): QueuedSimulationInput {
  const commandResult = makeSimulationInputCommand(
    record["horizontal"],
    record["jumpPressed"],
    record["runHeld"],
    record["firePressed"],
    record["upHeld"],
    record["downHeld"],
  );
  if (!commandResult.ok) {
    throw new Error(
      commandResult.errors.map((error) => error.message).join(" "),
    );
  }
  const sequence = record["sequence"];
  const intendedFrame = record["intendedFrame"];
  if (
    typeof sequence !== "number" ||
    typeof intendedFrame !== "number" ||
    !Number.isSafeInteger(sequence) ||
    !Number.isSafeInteger(intendedFrame)
  ) {
    throw new Error("Input sequence and intendedFrame must be safe integers.");
  }
  return {
    playerId,
    sequence,
    intendedFrame,
    receivedAtMilliseconds,
    command: commandResult.value,
  };
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

function staticContentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
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
  // A session has one authoritative input stream. A reconnect supersedes its
  // predecessor rather than duplicating heartbeat/input traffic and snapshots.
  const socketByPlayerId = new Map<string, WebSocket>();
  const loginAttemptLimiter = makeLoginAttemptLimiter(
    maximumLoginAttemptsPerWindow,
    loginAttemptWindowMilliseconds,
  );
  const profileBySocket = new WeakMap<
    WebSocket,
    ReturnType<MultiplayerService["requirePlayer"]>
  >();
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: webSocketMaximumPayloadBytes,
  });
  let lastSnapshotBroadcastMilliseconds = 0;
  let lastKeyframeBroadcastMilliseconds = Number.NEGATIVE_INFINITY;
  let snapshotBroadcastCount = 0;
  let keyframeBroadcastCount = 0;
  let deltaBroadcastCount = 0;
  let keyframeBytes = 0;
  let deltaBytes = 0;
  let protocolErrorCount = 0;
  const latestSnapshotByGameId = new Map<string, AuthoritativeGameSnapshot>();
  const lastSentSnapshotByGameId = new Map<string, AuthoritativeGameSnapshot>();
  const snapshotDelayMilliseconds = config.snapshotDelayMilliseconds ?? 0;
  if (
    !Number.isSafeInteger(snapshotDelayMilliseconds) ||
    snapshotDelayMilliseconds < 0
  ) {
    throw new Error("Snapshot delay must be a non-negative safe integer.");
  }

  function sendEncodedWebSocketMessage(
    socket: WebSocket,
    encoded: string,
    delayMilliseconds: number,
  ): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (delayMilliseconds === 0) {
      socket.send(encoded);
      return;
    }
    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encoded);
      }
    }, delayMilliseconds).unref();
  }

  function broadcast(value: unknown, delayMilliseconds = 0): void {
    const encoded = JSON.stringify(value);
    for (const socket of socketByPlayerId.values()) {
      sendEncodedWebSocketMessage(socket, encoded, delayMilliseconds);
    }
  }

  function sendStateKeyframes(
    sockets: Iterable<WebSocket>,
    snapshots: readonly AuthoritativeGameSnapshot[],
    delayMilliseconds = 0,
  ): void {
    const message = { type: "state-keyframes", snapshots };
    const encoded = JSON.stringify(message);
    keyframeBroadcastCount += 1;
    keyframeBytes += stateTransportEncodedBytes(message);
    for (const socket of sockets) {
      sendEncodedWebSocketMessage(socket, encoded, delayMilliseconds);
    }
  }

  function socketsForSnapshot(
    snapshot: AuthoritativeGameSnapshot,
  ): readonly WebSocket[] {
    return snapshot.players.flatMap((player) => {
      const socket = socketByPlayerId.get(player.playerId);
      return socket === undefined ? [] : [socket];
    });
  }

  function broadcastTransportState(
    snapshots: readonly AuthoritativeGameSnapshot[],
    nowMilliseconds: number,
    forceKeyframe = false,
  ): void {
    for (const snapshot of snapshots) {
      latestSnapshotByGameId.set(snapshot.gameId, snapshot);
    }
    const keyframeDue =
      forceKeyframe ||
      nowMilliseconds - lastKeyframeBroadcastMilliseconds >=
        stateKeyframeIntervalMilliseconds ||
      snapshots.some(
        (snapshot) => !lastSentSnapshotByGameId.has(snapshot.gameId),
      );
    if (keyframeDue) {
      for (const snapshot of snapshots) {
        // A player can belong to only one game. Sending every public game's
        // full world to every open socket multiplied bandwidth and JSON work
        // by the number of concurrent parties; route the receipt strictly to
        // the game's current members instead.
        sendStateKeyframes(
          socketsForSnapshot(snapshot),
          [snapshot],
          snapshotDelayMilliseconds,
        );
        lastSentSnapshotByGameId.set(snapshot.gameId, snapshot);
      }
      lastKeyframeBroadcastMilliseconds = nowMilliseconds;
      return;
    }
    for (const snapshot of snapshots) {
      const baseline = lastSentSnapshotByGameId.get(snapshot.gameId);
      if (baseline === undefined) {
        continue;
      }
      lastSentSnapshotByGameId.set(snapshot.gameId, snapshot);
      const message = {
        type: "state-deltas",
        deltas: [
          {
            gameId: snapshot.gameId,
            baselineFrame: baseline.frame,
            baselineSnapshotSequence: baseline.snapshotSequence,
            frame: snapshot.frame,
            delta: makeStateDelta(baseline, snapshot),
          },
        ],
      };
      deltaBroadcastCount += 1;
      deltaBytes += stateTransportEncodedBytes(message);
      const encoded = JSON.stringify(message);
      for (const socket of socketsForSnapshot(snapshot)) {
        sendEncodedWebSocketMessage(socket, encoded, snapshotDelayMilliseconds);
      }
    }
  }

  function broadcastSnapshots(nowMilliseconds: number): void {
    const snapshots = service.tick(nowMilliseconds);
    const containsFinishedGame = snapshots.some(
      (snapshot) => snapshot.phase === MultiplayerGamePhase.Finished,
    );
    if (
      snapshots.length > 0 &&
      (containsFinishedGame ||
        nowMilliseconds - lastSnapshotBroadcastMilliseconds >=
          snapshotBroadcastIntervalMilliseconds)
    ) {
      broadcastTransportState(snapshots, nowMilliseconds, containsFinishedGame);
      lastSnapshotBroadcastMilliseconds = nowMilliseconds;
      snapshotBroadcastCount += 1;
    }
  }

  function transportDebugMetrics(): TransportDebugMetrics {
    return {
      snapshotBroadcastCount,
      keyframeBroadcastCount,
      deltaBroadcastCount,
      keyframeBytes,
      deltaBytes,
      lastSnapshotBroadcastMilliseconds:
        snapshotBroadcastCount === 0
          ? undefined
          : lastSnapshotBroadcastMilliseconds,
      configuredSnapshotDelayMilliseconds: snapshotDelayMilliseconds,
      protocolErrorCount,
    };
  }

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const cookies = parseCookies(request);
    const playerToken = cookies.get(sessionCookieName);
    const adminToken = cookies.get(adminCookieName);
    const address = request.socket.remoteAddress ?? "unknown";
    response.once("finish", () => {
      config.logger?.("http_request", {
        method: request.method ?? "unknown",
        path: url.pathname,
        status: response.statusCode,
      });
    });
    try {
      if (url.pathname.startsWith("/api/") && url.pathname !== "/api/health") {
        requireMultiplayerProtocolVersion(
          request.headers["x-multiplayer-protocol-version"],
        );
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/login") {
        const currentTime = now();
        loginAttemptLimiter.assertAllowed(address, currentTime);
        let loggedIn;
        try {
          loggedIn = service.loginPlayer(
            requireString(await readJsonBody(request), "password"),
            currentTime,
          );
        } catch (error) {
          loginAttemptLimiter.recordFailure(address, currentTime);
          throw error;
        }
        loginAttemptLimiter.reset(address);
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
            const activeGame = service.activeGame(playerToken, now());
            json(
              response,
              200,
              activeGame === undefined
                ? makeLobbyLayout(profile, service.games(playerToken, now()))
                : makeGameLayout(profile, activeGame),
            );
          } catch {
            json(
              response,
              200,
              url.searchParams.get("screen") === "admin"
                ? makeAdminLoginLayout()
                : makeLoginLayout(),
            );
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
          activeGame: service.activeGame(playerToken, now()),
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
        /^\/api\/games\/([a-z][a-z0-9-]*)\/(join|start|end|chat|snapshot)$/.exec(
          url.pathname,
        );
      if (gameMatch !== null) {
        const [, gameId, action] = gameMatch;
        if (gameId === undefined || action === undefined) {
          throw new Error("Game route is incomplete.");
        }
        if (request.method === "POST" && action === "join") {
          const joinedAtMilliseconds = now();
          const game = service.joinGame(
            playerToken,
            gameId,
            joinedAtMilliseconds,
          );
          // Joining changes player slots and the complete prediction baseline.
          // Send a keyframe immediately, rather than leaving the new browser to
          // infer a baseline from a later delta intended for existing members.
          broadcastTransportState(
            [service.gameSnapshot(playerToken, gameId, joinedAtMilliseconds)],
            joinedAtMilliseconds,
            true,
          );
          json(response, 200, {
            game,
          });
          broadcast({ type: "games-changed" });
          return;
        }
        if (request.method === "POST" && action === "start") {
          const startedAtMilliseconds = now();
          const game = service.startGame(
            playerToken,
            gameId,
            startedAtMilliseconds,
          );
          // A lifecycle edge is not merely lobby metadata. It is the first
          // state a predictive client can safely simulate from, and it can
          // share frame zero with the preceding waiting state. Send it as an
          // ordered keyframe instead of waiting for the next tick cadence.
          broadcastTransportState(
            [service.gameSnapshot(playerToken, gameId, startedAtMilliseconds)],
            startedAtMilliseconds,
            true,
          );
          json(response, 200, { game });
          broadcast({ type: "games-changed" });
          return;
        }
        if (request.method === "POST" && action === "end") {
          service.endGame(playerToken, gameId, now());
          json(response, 200, { ok: true });
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
          broadcast({ type: "game-chat", gameId });
          return;
        }
        if (request.method === "GET" && action === "chat") {
          json(response, 200, {
            messages: service.gameMessages(playerToken, gameId, now()),
          });
          return;
        }
        if (request.method === "GET" && action === "snapshot") {
          json(response, 200, service.gameSnapshot(playerToken, gameId, now()));
          return;
        }
      }
      if (request.method === "POST" && url.pathname === "/api/game/leave") {
        const leftAtMilliseconds = now();
        const snapshot = service.leaveGame(playerToken, leftAtMilliseconds);
        json(response, 200, { ok: true });
        if (snapshot !== undefined) {
          // The departing client intentionally disposes its own socket, but
          // everyone who remains needs the updated membership/empty-party
          // pause immediately rather than waiting for a later world tick.
          broadcastTransportState([snapshot], leftAtMilliseconds, true);
        }
        broadcast({ type: "games-changed" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/game/revive") {
        const revivedAtMilliseconds = now();
        const snapshot = service.revivePlayer(
          playerToken,
          revivedAtMilliseconds,
        );
        broadcastTransportState([snapshot], revivedAtMilliseconds, true);
        json(response, 200, snapshot);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/game/pause") {
        const pausedAtMilliseconds = now();
        const snapshot = service.pauseGameByPlayer(
          playerToken,
          pausedAtMilliseconds,
        );
        broadcastTransportState([snapshot], pausedAtMilliseconds, true);
        json(response, 200, snapshot);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/game/resume") {
        const resumedAtMilliseconds = now();
        const snapshot = service.resumeGameByPlayer(
          playerToken,
          resumedAtMilliseconds,
        );
        broadcastTransportState([snapshot], resumedAtMilliseconds, true);
        json(response, 200, snapshot);
        return;
      }
      const adminMatch =
        /^\/api\/admin\/games\/([a-z][a-z0-9-]*)\/(pause|resume|step|input|screenshot)$/.exec(
          url.pathname,
        );
      if (adminMatch !== null) {
        const [, gameId, action] = adminMatch;
        if (gameId === undefined || action === undefined) {
          throw new Error("Admin game route is incomplete.");
        }
        if (request.method === "POST" && action === "pause") {
          const snapshot = service.adminPause(adminToken, gameId, now());
          json(response, 200, snapshot);
          broadcastTransportState([snapshot], now(), true);
          return;
        }
        if (request.method === "POST" && action === "resume") {
          const snapshot = service.adminResume(adminToken, gameId, now());
          json(response, 200, snapshot);
          broadcastTransportState([snapshot], now(), true);
          return;
        }
        if (request.method === "POST" && action === "step") {
          const snapshot = service.adminStep(adminToken, gameId, now());
          json(response, 200, snapshot);
          broadcastTransportState([snapshot], now(), true);
          return;
        }
        if (request.method === "POST" && action === "input") {
          const body = await readJsonBody(request);
          json(
            response,
            200,
            service.adminSubmitInput(
              adminToken,
              gameId,
              requireQueuedInput(
                body,
                requireMultiplayerPlayerId(requireString(body, "playerId")),
                now(),
              ),
              now(),
            ),
          );
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
        json(response, 200, {
          ...service.adminDebug(adminToken, now()),
          transport: transportDebugMetrics(),
        });
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
        response.writeHead(200, {
          "content-type": staticContentType(filePath),
        });
        response.end(body);
        return;
      }
      failure(response, 404, new Error("Route does not exist."));
    } catch (error) {
      config.logger?.("http_error", {
        method: request.method ?? "unknown",
        path: url.pathname,
        error: error instanceof Error ? error.message : "Unknown error.",
      });
      if (
        error instanceof Error &&
        error.message === "Unsupported multiplayer protocol version."
      ) {
        protocolErrorCount += 1;
      }
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
      config.logger?.("websocket_upgrade_denied", {
        path: request.url ?? "/",
      });
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
    config.logger?.("websocket_connected", { playerId });
    const predecessor = socketByPlayerId.get(playerId);
    if (predecessor !== undefined && predecessor !== socket) {
      predecessor.close(4001, "Superseded by a newer player connection.");
    }
    socketByPlayerId.set(playerId, socket);
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
        requireMultiplayerProtocolVersion(message["protocolVersion"]);
        const token = parseCookies(request).get(sessionCookieName);
        if (type === "input") {
          service.submitInput(
            token,
            requireQueuedInput(message, profile.playerId, now()),
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
          broadcast({
            type: "game-chat",
            gameId: requireString(message, "gameId"),
          });
        } else if (type === "resync") {
          const gameId = requireString(message, "gameId");
          const snapshot = latestSnapshotByGameId.get(gameId);
          if (snapshot === undefined) {
            throw new Error(
              "No authoritative keyframe is available for this game.",
            );
          }
          sendStateKeyframes([socket], [snapshot]);
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
        config.logger?.("websocket_error", {
          playerId,
          error: error instanceof Error ? error.message : "Unknown error.",
        });
        if (
          error instanceof Error &&
          error.message === "Unsupported multiplayer protocol version."
        ) {
          protocolErrorCount += 1;
        }
        socket.send(
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error.",
          }),
        );
      }
    });
    socket.on("close", () => {
      config.logger?.("websocket_closed", { playerId });
      if (socketByPlayerId.get(playerId) === socket) {
        socketByPlayerId.delete(playerId);
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
      for (const socket of socketByPlayerId.values()) {
        socket.close();
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
  const bundleDirectory = resolve(
    process.cwd(),
    "dist/game-content/content-set-bundles/castaway-parody__official-smb",
  );
  const manifest = JSON.parse(
    readFileSync(resolve(bundleDirectory, "remote-manifest.json"), "utf8"),
  ) as {
    readonly levels: readonly {
      readonly name: string;
      readonly source: { readonly url: string };
      readonly importMetadataSource: { readonly url: string };
    }[];
  };
  const bundledLevels: readonly ServerLevelOption[] = manifest.levels.map(
    (entry) => {
      const input = parseVglcSmbMultiLayerLevel(
        readFileSync(resolve(bundleDirectory, entry.source.url), "utf8"),
        JSON.parse(
          readFileSync(
            resolve(bundleDirectory, entry.importMetadataSource.url),
            "utf8",
          ),
        ) as unknown,
      );
      if (!input.ok) {
        throw new Error(
          `Release multiplayer level ${entry.name} could not parse: ${input.errors.map((error) => error.message).join(" ")}`,
        );
      }
      const spec = makeLevelSpec(input.value);
      if (!spec.ok) {
        throw new Error(
          `Release multiplayer level ${entry.name} could not validate: ${spec.errors.map((error) => error.message).join(" ")}`,
        );
      }
      return {
        id: entry.name,
        label: entry.name.replace("smb-", "World "),
        levelSpec: spec.value,
      };
    },
  );
  const levels = bundledLevels.filter((level) => /^smb-\d-\d$/.test(level.id));
  if (levels.length === 0) {
    throw new Error(
      "Release content bundle contains no selectable multiplayer levels.",
    );
  }
  let gameNumber = 0;
  return {
    session: { serverPassword, adminPassword, signingSecret },
    levels,
    linkedLevels: bundledLevels.filter(
      (level) => !/^smb-\d-\d$/.test(level.id),
    ),
    movementConstants: initialMovementConstants,
    nextGameId: () => `game-${++gameNumber}`,
  };
}

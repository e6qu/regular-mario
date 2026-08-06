import { resolve } from "node:path";

import {
  makeMultiplayerHttpServer,
  makeProductionServiceConfig,
} from "./http-server";
import { makeFileServerLogger } from "./file-logger";
import { multiplayerAuthoritativeFramesPerSecond } from "../multiplayer/domain";

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable is required.`);
  }
  return value;
}

const portValue = process.env["PORT"] ?? "8080";
const port = Number(portValue);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
const snapshotDelayValue = process.env["MULTIPLAYER_TEST_SNAPSHOT_DELAY_MS"];
const logFile = process.env["LOG_FILE"];
const logger =
  logFile === undefined || logFile.length === 0
    ? undefined
    : makeFileServerLogger(logFile);
const snapshotDelayMilliseconds =
  snapshotDelayValue === undefined ? undefined : Number(snapshotDelayValue);
if (
  snapshotDelayMilliseconds !== undefined &&
  (!Number.isSafeInteger(snapshotDelayMilliseconds) ||
    snapshotDelayMilliseconds < 0)
) {
  throw new Error(
    "MULTIPLAYER_TEST_SNAPSHOT_DELAY_MS must be a non-negative integer.",
  );
}
const app = makeMultiplayerHttpServer({
  service: makeProductionServiceConfig(
    requireEnvironment("SERVER_PASSWORD"),
    requireEnvironment("ADMIN_PASSWORD"),
    requireEnvironment("SESSION_SIGNING_SECRET"),
  ),
  staticRoot: resolve(process.cwd(), "dist"),
  secureCookies: process.env["NODE_ENV"] === "production",
  ...(snapshotDelayMilliseconds === undefined
    ? {}
    : { snapshotDelayMilliseconds }),
  ...(logger === undefined ? {} : { logger }),
});

const authoritativeFrameMilliseconds =
  1000 / multiplayerAuthoritativeFramesPerSecond;
const maximumCatchUpFramesPerTurn = 8;
let nextAuthoritativeFrameAt = Date.now();

function runAuthoritativeFrames(): void {
  const now = Date.now();
  let advanced = 0;
  while (
    now >= nextAuthoritativeFrameAt &&
    advanced < maximumCatchUpFramesPerTurn
  ) {
    app.tick(nextAuthoritativeFrameAt);
    nextAuthoritativeFrameAt += authoritativeFrameMilliseconds;
    advanced += 1;
  }
  if (
    advanced === maximumCatchUpFramesPerTurn &&
    now >= nextAuthoritativeFrameAt
  ) {
    // Do not run an unbounded catch-up loop after a process pause. Resynchronise
    // the wall clock and continue at the fixed cadence on the next turn.
    nextAuthoritativeFrameAt = now + authoritativeFrameMilliseconds;
  }
  setTimeout(
    runAuthoritativeFrames,
    Math.max(0, nextAuthoritativeFrameAt - Date.now()),
  ).unref();
}

runAuthoritativeFrames();
app.server.listen(port, "0.0.0.0", () => {
  logger?.("server_started", { port });
  process.stdout.write(
    `Trusted-friends multiplayer server listening on ${port}.\n`,
  );
});
app.server.on("error", (error) => {
  logger?.("server_error", { error: error.message });
});
process.on("uncaughtException", (error) => {
  logger?.("uncaught_exception", { error: error.message });
});
process.on("unhandledRejection", (reason) => {
  logger?.("unhandled_rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});

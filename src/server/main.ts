import { resolve } from "node:path";

import {
  makeMultiplayerHttpServer,
  makeProductionServiceConfig,
} from "./http-server";

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
const app = makeMultiplayerHttpServer({
  service: makeProductionServiceConfig(
    requireEnvironment("SERVER_PASSWORD"),
    requireEnvironment("ADMIN_PASSWORD"),
    requireEnvironment("SESSION_SIGNING_SECRET"),
  ),
  staticRoot: resolve(process.cwd(), "dist"),
  secureCookies: process.env["NODE_ENV"] === "production",
});

setInterval(() => app.tick(Date.now()), 1000 / 60).unref();
app.server.listen(port, "0.0.0.0", () => {
  process.stdout.write(
    `Trusted-friends multiplayer server listening on ${port}.\n`,
  );
});

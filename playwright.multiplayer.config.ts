import { defineConfig } from "@playwright/test";

const multiplayerPort = process.env["MULTIPLAYER_PLAYWRIGHT_PORT"] ?? "4180";
const multiplayerUrl = `http://127.0.0.1:${multiplayerPort}`;
const snapshotDelay = process.env["MULTIPLAYER_TEST_SNAPSHOT_DELAY_MS"] ?? "0";

export default defineConfig({
  testDir: "tests/multiplayer-browser",
  fullyParallel: false,
  retries: 0,
  use: { baseURL: multiplayerUrl },
  webServer: {
    command:
      `SERVER_PASSWORD=friends ADMIN_PASSWORD=administrator ` +
      `SESSION_SIGNING_SECRET=0123456789abcdef0123456789abcdef PORT=${multiplayerPort} ` +
      `MULTIPLAYER_TEST_SNAPSHOT_DELAY_MS=${snapshotDelay} ` +
      "node server-dist/main.js",
    url: `${multiplayerUrl}/api/health`,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
